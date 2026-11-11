import {
  type NetArchitecture,
  type NetFloorContent,
  toPublicFloor,
} from "../domain/net-architecture";
import {
  checkAction,
  checkMove,
  lowestFloor,
  ONCE_PER_RUN_PROGRAMS,
  programKey,
  checkProgramRez,
  netActionsPerTurn,
  type Eligibility,
  type RuleBlock,
  type RuleContext,
  type RunnerResources,
} from "../domain/net-rules";
import type { IceClass, RunnerVitals } from "../domain/ice-hit";
import {
  applyAmbush,
  applyCheck,
  applyIceAttack,
  applyIceTarget,
  applyIceDamage,
  applyInitiative,
  applyNpcAttack,
  applyOppose,
  applyResolve,
  isId,
  withRun,
} from "./checks";
import {
  ABILITY_CHECKS,
  type AbilityCheck,
  concealFloor,
  mapFloor,
  npcAt,
  type PublicSession,
  revealFloor,
  toRunState,
  type ViewerIdentity,
} from "./session-state";
import { triggerAmbush } from "./ambush";
import { applyEndTurn, newTurnRun, settleTurn } from "./combat-turn";
import { appendLog } from "./event-log";
import { checkNpcMove, moveNpcPublic, revealNpc } from "./npc";
import { programStateOf, type SheetEffect } from "./sheet-effects";
import { applyUndo, isRecorded, pushHistory } from "./undo";

/**
 * Contrato de requisições → GM autoridade e processador puro (E2-02/E2-03, D19/D20).
 * Elegibilidade, custo e bloqueios vêm do motor `net-rules` (E3-02a, D21/D22).
 * Ações de GM também passam pela autoridade (D20).
 */
export type NetAction =
  | { type: "jackIn" }
  | { type: "moveTo"; key: number }
  | { type: "jackOut" }
  /** GM revela um nó; `masked` = só no mapa, sem o conteúdo, até a Netrunner entrar. */
  | { type: "reveal"; key: number; masked?: boolean }
  | { type: "conceal"; key: number }
  | { type: "end" }
  | { type: "newTurn" }
  /** Encerra a vez no combate (E6-08, D33): Netrunner ou GM; a do Black ICE só o GM. */
  | { type: "endTurn" }
  | { type: "clearNode"; key: number }
  | { type: "restoreNode"; key: number }
  | {
      type: "check";
      ability: AbilityCheck | "damage" | "programAttack";
      messageId: string;
      /** Ataque com programa: item do programa (E6-05). */
      programId?: string;
    }
  | { type: "rezProgram"; programId: string; rez: boolean }
  | { type: "oppose"; messageId: string }
  | { type: "iceAttack"; messageId: string }
  /** GM rolou o dano do acerto do Black ICE (E6-06, D31). */
  | { type: "iceDamage"; messageId: string }
  /** GM desfaz a última ação registrada (E6-07, D32). */
  | { type: "undo" }
  /** GM devolve (−1) ou tira (+1) uma ação NET gasta no turno. */
  | { type: "adjustActions"; delta: 1 | -1 }
  | { type: "linkIce"; key: number; actorUuid: string }
  /** GM ataca com a Netrunner NPC do nó: Zap (sem programa) ou programa (E6-11b). */
  | { type: "npcAttack"; messageId: string; programId?: string }
  /** Iniciativa 1d10 + REF de um lado do combate com a NPC (D37). */
  | { type: "initiative"; side: "runner" | "npc"; messageId: string }
  /** GM vinculou uma NPC ao nó atual: revela agora (E6-11b). */
  | { type: "npcSync" }
  /** GM arrasta a NPC de um nó a outro, com as regras de movimento da jogadora. */
  | { type: "moveNpc"; from: number; to: number }
  | { type: "resolveCheck"; outcome: "success" | "failure" }
  /** GM rola o SPD do Black ICE à espreita (encontro ao chegar no nó). */
  | { type: "ambush"; messageId: string }
  /** GM escolhe o programa atingido pelo Black ICE antiprograma. */
  | { type: "iceTarget"; programId: string };

/** Ações só de GM: dispensam a revisão atual; todas menos `newTurn` são idempotentes. */
const GM_ACTIONS: ReadonlySet<NetAction["type"]> = new Set([
  "reveal",
  "conceal",
  "end",
  "newTurn",
  "clearNode",
  "restoreNode",
  "resolveCheck",
  "linkIce",
  "iceAttack",
  "iceDamage",
  "undo",
  "adjustActions",
  "npcAttack",
  "npcSync",
  "moveNpc",
  "ambush",
  "iceTarget",
]);

/** Dispensam a revisão atual: GM (D20) e rolagens já feitas (E3-02b/c). */
const REVISION_EXEMPT: ReadonlySet<NetAction["type"]> = new Set([
  ...GM_ACTIONS,
  "check",
  "oppose",
  "initiative",
]);

const KEYED_ACTIONS = ["moveTo", "reveal", "conceal", "clearNode", "restoreNode"] as const;

/** Conteúdos que o GM pode marcar como resolvidos (D22). */
const CLEARABLE: ReadonlySet<NetFloorContent> = new Set([
  "password",
  "controlnode",
  "blackice",
  "file",
]);

export interface ActionRequest {
  requestId: string;
  sessionId: string;
  expectedRevision: number;
  action: NetAction;
}

export type RequestError =
  | RuleBlock
  | "invalid-request"
  | "no-session"
  | "wrong-session"
  | "not-authorized"
  | "stale-revision"
  | "no-architecture"
  | "invalid-target"
  | "invalid-roll"
  | "check-pending"
  | "no-pending-check"
  | "awaiting-opposed"
  | "nothing-to-oppose"
  | "no-ice-link"
  | "no-damage-pending"
  | "nothing-to-undo"
  | "effect-failed"
  | "write-failed"
  | "no-authority"
  | "timeout";

export type ActionResult =
  | { requestId: string; ok: true; revision: number }
  | { requestId: string; ok: false; error: RequestError; revision: number | null };

export interface ProcessContext {
  session: PublicSession | null;
  /** Remetente segundo o servidor (2º argumento do socket), nunca o payload. */
  sender: ViewerIdentity;
  /** Arquitetura completa, lida pelo GM. */
  architecture: NetArchitecture | null;
  /** Resultados já produzidos, por `processedKey`. */
  processed: ReadonlyMap<string, ActionResult>;
  /** Recursos atuais da ficha, lidos pelo GM (R05). */
  runner: RunnerResources;
  /** Lê o card de rolagem no chat (documento do servidor), pelo id da mensagem. */
  readRoll(messageId: string): RollEvidence | null;
  /** Lê um ator Black ICE do mundo; `null` se não existe ou não é Black ICE (D25). */
  readIce(actorUuid: string): IceStats | null;
  /** HP e redução cerebral atuais da Netrunner, lidos pelo GM (E6-06). */
  readVitals(actorUuid: string): RunnerVitals | null;
  /** Sorteio do programa atingido por Black ICE antiprograma: índice de 0 a count−1. */
  pick(count: number): number;
  /** Recursos de uma Netrunner NPC (Interface e programas), lidos pelo GM (E6-11b). */
  readResources(actorUuid: string): RunnerResources;
  /** REF do ator, para conferir a iniciativa 1d10 + REF; `null` = indisponível. */
  readRef(actorUuid: string): number | null;
  /** NPC vinculada ao nó na flag do item da arquitetura (só a autoridade lê). */
  npcLinkAt(key: number): string | null;
}

export interface IceStats {
  name: string;
  rez: { value: number; max: number };
  /** `system.class` do ator (E6-06); ausente = "other". */
  iceClass?: IceClass;
  /** Fórmula do item de programa Black ICE de mesmo nome (D31); `null` = não encontrado. */
  damageFormula?: string | null;
  /** O programa existe e não tem dano em dados: acerto = efeito especial do GM (E6-12). */
  specialOnly?: boolean;
  /** Resumo do efeito (notas da ficha), mostrado ao GM. */
  effect?: string;
  /** Antiprograma cujo dano que derrezzaria destrói o programa (D40). */
  destroysPrograms?: boolean;
}

/** Efeitos em documentos (D26); definidos em `sheet-effects.ts`. */
export type { SheetEffect } from "./sheet-effects";

/** O que a autoridade extrai de uma ChatMessage de rolagem nativa. */
export interface RollEvidence {
  /** Autor segundo o servidor. */
  authorId: string;
  /** Ator do `speaker` da mensagem. */
  actorUuid: string;
  total: number;
  /** Fórmula da rolagem, quando a mensagem traz `rolls` (dano). */
  formula?: string | null;
}

export interface ProcessOutcome {
  result: ActionResult;
  /** Novo estado a gravar; `null` quando nada muda. */
  session: PublicSession | null;
  /** Chave para registrar o resultado; `null` se a requisição era ilegível. */
  processedKey: string | null;
  /** A sessão deve ser encerrada (gravar `null`). */
  ended: boolean;
  /** Efeitos a executar antes de gravar a sessão (D26). */
  effects: SheetEffect[];
}

export const MAX_ID_LENGTH = 64;

export function parseActionRequest(value: unknown): ActionRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const { requestId, sessionId, expectedRevision, action } = value as Record<string, unknown>;
  if (typeof requestId !== "string" || requestId === "" || requestId.length > MAX_ID_LENGTH) {
    return null;
  }
  if (typeof sessionId !== "string" || sessionId === "" || sessionId.length > MAX_ID_LENGTH) {
    return null;
  }
  if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision)) return null;
  const parsed = parseAction(action);
  return parsed ? { requestId, sessionId, expectedRevision, action: parsed } : null;
}

function parseAction(value: unknown): NetAction | null {
  if (typeof value !== "object" || value === null) return null;
  const { type, key, ability, messageId, outcome } = value as Record<string, unknown>;
  const { actorUuid } = value as Record<string, unknown>;
  const { programId, rez } = value as Record<string, unknown>;
  if (type === "check") {
    if (ability === "programAttack") {
      return isId(messageId) && isId(programId)
        ? { type, ability: "programAttack", messageId, programId }
        : null;
    }
    const kind = [...ABILITY_CHECKS, "damage" as const].find((a) => a === ability);
    return kind && isId(messageId) ? { type, ability: kind, messageId } : null;
  }
  if (type === "rezProgram") {
    return isId(programId) && typeof rez === "boolean" ? { type, programId, rez } : null;
  }
  if (type === "iceTarget") return isId(programId) ? { type, programId } : null;
  if (type === "reveal") {
    const { masked } = value as Record<string, unknown>;
    const validKey = typeof key === "number" && Number.isInteger(key) && key >= 0;
    if (!validKey) return null;
    return masked === true ? { type, key, masked: true } : { type, key };
  }
  if (type === "oppose" || type === "iceAttack" || type === "iceDamage" || type === "ambush") {
    return isId(messageId) ? { type, messageId } : null;
  }
  if (type === "linkIce") {
    const validKey = typeof key === "number" && Number.isInteger(key) && key >= 0;
    return validKey && isId(actorUuid) ? { type, key, actorUuid } : null;
  }
  if (type === "resolveCheck") {
    return outcome === "success" || outcome === "failure" ? { type, outcome } : null;
  }
  if (type === "npcAttack") {
    if (!isId(messageId)) return null;
    return isId(programId) ? { type, messageId, programId } : { type, messageId };
  }
  if (type === "initiative") {
    const { side } = value as Record<string, unknown>;
    return (side === "runner" || side === "npc") && isId(messageId)
      ? { type, side, messageId }
      : null;
  }
  if (type === "npcSync") return { type };
  if (type === "moveNpc") {
    const { from, to } = value as Record<string, unknown>;
    const ok = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
    return ok(from) && ok(to) ? { type, from, to } : null;
  }
  if (type === "adjustActions") {
    const { delta } = value as Record<string, unknown>;
    return delta === 1 || delta === -1 ? { type, delta } : null;
  }
  if (
    type === "jackIn" ||
    type === "jackOut" ||
    type === "end" ||
    type === "newTurn" ||
    type === "endTurn" ||
    type === "undo"
  ) {
    return { type };
  }
  const validKey = typeof key === "number" && Number.isInteger(key) && key >= 0;
  const keyed = KEYED_ACTIONS.find((t) => t === type);
  return validKey && keyed ? { type: keyed, key } : null;
}

export function processRequest(raw: unknown, ctx: ProcessContext): ProcessOutcome {
  const request = parseActionRequest(raw);
  if (!request) {
    const requestId =
      typeof (raw as { requestId?: unknown } | null)?.requestId === "string"
        ? String((raw as { requestId: string }).requestId).slice(0, MAX_ID_LENGTH)
        : "";
    return reject(requestId, "invalid-request", null, null);
  }
  const { requestId } = request;
  const session = ctx.session;
  if (!session) return reject(requestId, "no-session", null, null);
  if (request.sessionId !== session.id) {
    return reject(requestId, "wrong-session", session.revision, null);
  }
  const gmAction = GM_ACTIONS.has(request.action.type);
  const allowed = ctx.sender.isGM || (!gmAction && session.controllerUserId === ctx.sender.id);
  if (!allowed) return reject(requestId, "not-authorized", session.revision, null);

  const key = `${ctx.sender.id}:${requestId}`;
  const previous = ctx.processed.get(key);
  if (previous) {
    return { result: previous, session: null, processedKey: key, ended: false, effects: [] };
  }
  if (!REVISION_EXEMPT.has(request.action.type) && request.expectedRevision !== session.revision) {
    return reject(requestId, "stale-revision", session.revision, key);
  }

  const effects: SheetEffect[] = [];
  const applied = apply(session, request.action, ctx, effects);
  if (applied === "ended" || applied === "unchanged") {
    return {
      result: { requestId, ok: true, revision: session.revision },
      session: null,
      processedKey: key,
      ended: applied === "ended",
      effects: [],
    };
  }
  if (typeof applied === "string") return reject(requestId, applied, session.revision, key);
  // NPC do nó chega ao estado público só agora (D37); vez no combate (D33) passa sozinha.
  // O desfazer restaura o estado exato.
  let settled = applied;
  if (request.action.type !== "undo") {
    // Mover a NPC já ajusta o estado público (a flag só muda ao efetivar o efeito).
    const revealed =
      request.action.type === "moveNpc" ? applied : revealNpc(applied, (key) => ctx.npcLinkAt(key));
    const npc = npcAt(revealed);
    const npcMax = npc ? netActionsPerTurn(ctx.readResources(npc.actorUuid).interfaceRank) : 0;
    // Black ICE à espreita: o encontro dispara ao chegar no nó (antes da vez).
    // Antiprograma só dispara se ela chegar com algum programa em execução (FAQ, D40).
    const hasTargets = (ctx.runner.programs ?? []).some((p) => p.rezzed && (p.rez ?? 0) > 0);
    const ambushed = triggerAmbush(session, revealed, (key) => {
      const link = revealed.run.ice.find((l) => l.key === key)?.actorUuid;
      return !hasTargets && link !== undefined && ctx.readIce(link)?.iceClass === "antiprogram";
    });
    settled = settleTurn(session, ambushed, netActionsPerTurn(ctx.runner.interfaceRank), npcMax);
  }
  // Andar mais fundo (libera o Virus): calculado aqui, onde a arquitetura completa existe.
  settled = withBottom(settled, ctx.architecture);
  // Desfazer do GM (D32): cada mudança registrada guarda o estado anterior e os inversos.
  const recorded = isRecorded(request.action)
    ? pushHistory(session, settled, request.action, effects)
    : settled;
  // Registro público (D34): descrito a partir da ação e dos estados públicos.
  const logged = appendLog(session, recorded, request.action);
  const next = { ...logged, revision: session.revision + 1 };
  return {
    result: { requestId, ok: true, revision: next.revision },
    session: next,
    processedKey: key,
    ended: false,
    effects,
  };
}

/** Aplica a ação sem mexer na revisão; devolve o erro quando inválida. */
function apply(
  session: PublicSession,
  action: NetAction,
  ctx: ProcessContext,
  effects: SheetEffect[],
): PublicSession | RequestError | "unchanged" | "ended" {
  const { architecture, runner } = ctx;
  if (action.type === "end") return "ended";
  if (action.type === "newTurn") return withRun(session, newTurnRun(session));
  if (action.type === "endTurn") return applyEndTurn(session, ctx.sender.isGM);
  if (action.type === "npcSync") {
    return revealNpc(session, (key) => ctx.npcLinkAt(key)) === session ? "unchanged" : session;
  }
  if (action.type === "npcAttack") return applyNpcAttack(session, action, ctx);
  if (action.type === "moveNpc") {
    const floors = ctx.architecture?.floors;
    const itemUuid = session.netArch?.itemUuid;
    const actorUuid = ctx.npcLinkAt(action.from);
    if (!floors || !itemUuid || !actorUuid) return "invalid-target";
    if (session.run.pending || session.run.iceHit || session.run.awaitingDamage !== null) {
      return "check-pending";
    }
    const error = checkNpcMove(session, floors, (k) => ctx.npcLinkAt(k), action.from, action.to);
    if (error) return error;
    effects.push({ type: "moveNpcLink", itemUuid, actorUuid, from: action.from, to: action.to });
    return moveNpcPublic(session, action.from, action.to, actorUuid);
  }
  if (action.type === "initiative") return applyInitiative(session, action, ctx);
  if (action.type === "ambush") return applyAmbush(session, action, ctx);
  if (action.type === "iceTarget") return applyIceTarget(session, action, ctx);
  if (action.type === "undo") return applyUndo(session, effects);
  if (action.type === "adjustActions") {
    const max = netActionsPerTurn(runner.interfaceRank);
    const actionsUsed = Math.min(max, Math.max(0, session.run.actionsUsed + action.delta));
    return actionsUsed === session.run.actionsUsed
      ? "unchanged"
      : withRun(session, { actionsUsed });
  }
  const arch = session.netArch;
  if (!arch) return "no-architecture";
  const entry = architecture?.floors.find((f) => f.floor === 1 && f.branch === "a");
  // Caminhos pela arquitetura completa (D28); sem item, só os nós revelados. Com o item, o
  // fundo da arquitetura vem dele (não do valor guardado na sessão).
  const { atBottom: storedBottom, ...runState } = toRunState(session);
  const rules: RuleContext = {
    runner,
    run:
      architecture || storedBottom === undefined
        ? runState
        : { ...runState, atBottom: storedBottom },
    hasEntry: entry !== undefined,
    nodes: architecture?.floors ?? [...arch.discovered, ...arch.mapped],
  };
  const spend = (eligibility: Eligibility, next: PublicSession): PublicSession | RuleBlock =>
    eligibility.allowed
      ? withRun(next, { actionsUsed: session.run.actionsUsed + eligibility.cost })
      : eligibility.reason;
  switch (action.type) {
    case "reveal": {
      const floor = architecture?.floors.find((f) => f.key === action.key);
      if (!floor) return "invalid-target";
      const next = action.masked
        ? mapFloor(session, floor)
        : revealFloor(session, toPublicFloor(floor));
      return next === session ? "unchanged" : { ...next, revision: session.revision };
    }
    case "conceal": {
      if (action.key === session.runnerPosition) return "invalid-target";
      const next = concealFloor(session, action.key);
      return next === session ? "unchanged" : { ...next, revision: session.revision };
    }
    case "clearNode": {
      const node = arch.discovered.find((f) => f.key === action.key);
      if (!node || !CLEARABLE.has(node.content)) return "invalid-target";
      if (session.run.cleared.includes(node.key)) return "unchanged";
      // Liberar o Black ICE à mão dispensa o dano que estava por rolar.
      const awaitingDamage =
        session.run.awaitingDamage === node.key ? null : session.run.awaitingDamage;
      return withRun(session, { cleared: [...session.run.cleared, node.key], awaitingDamage });
    }
    case "restoreNode": {
      const { cleared, evaded } = session.run;
      if (!cleared.includes(action.key) && !evaded.includes(action.key)) return "unchanged";
      return withRun(session, {
        cleared: cleared.filter((k) => k !== action.key),
        evaded: evaded.filter((k) => k !== action.key),
      });
    }
    case "jackIn": {
      const eligibility = checkAction(rules, "jackIn");
      if (!entry || !eligibility.allowed) return spend(eligibility, session);
      const discovered = arch.discovered.some((f) => f.key === entry.key)
        ? arch.discovered
        : [...arch.discovered, toPublicFloor(entry)];
      // Nova Netrun: cópias de uso único (Armor, Flak, Shield, Superglue) voltam a valer.
      return spend(eligibility, {
        ...session,
        runnerPosition: entry.key,
        netArch: { ...arch, discovered },
        run: { ...session.run, netrunUsed: [] },
      });
    }
    case "check":
      return applyCheck(session, action, ctx, rules);
    case "rezProgram": {
      const eligibility = checkProgramRez(rules, action.programId, action.rez);
      if (!eligibility.allowed) return eligibility.reason;
      const program = runner.programs?.find((p) => p.itemId === action.programId);
      if (!program) return "invalid-program";
      // Rezzar volta com o REZ cheio; derrezzar (inclusive um neutralizado) desliga (D40).
      effects.push({
        type: "setProgramState",
        actorUuid: session.actorUuid,
        programId: action.programId,
        state: action.rez
          ? {
              rezzed: true,
              rezValue: Math.max(0, program.rezMax ?? program.rez ?? 0),
              mark: "none",
            }
          : { rezzed: false, rezValue: Math.max(0, program.rez ?? 0), mark: "none" },
        before: programStateOf(program),
      });
      const { programsUsed, netrunUsed } = session.run;
      const once = ONCE_PER_RUN_PROGRAMS.has(programKey(program.name));
      return withRun(session, {
        actionsUsed: session.run.actionsUsed + eligibility.cost,
        // Rezzar é ativar: uma vez por rodada; Armor/Flak/Shield, uma vez por Netrun.
        programsUsed: action.rez ? [...programsUsed, action.programId] : programsUsed,
        netrunUsed: action.rez && once ? [...netrunUsed, action.programId] : netrunUsed,
      });
    }
    case "oppose":
      return applyOppose(session, action, ctx);
    case "iceAttack":
      return applyIceAttack(session, action, ctx, rules);
    case "resolveCheck":
      return applyResolve(session, action, effects, ctx);
    case "iceDamage":
      return applyIceDamage(session, action, ctx, effects);
    case "linkIce": {
      const node = arch.discovered.find((f) => f.key === action.key);
      if (!node || node.content !== "blackice" || !ctx.readIce(action.actorUuid)) {
        return "invalid-target";
      }
      if (session.run.pending) return "check-pending";
      const current = session.run.ice.find((l) => l.key === action.key);
      if (current?.actorUuid === action.actorUuid) return "unchanged";
      const others = session.run.ice.filter((l) => l.key !== action.key);
      return withRun(session, {
        ice: [...others, { key: action.key, actorUuid: action.actorUuid }],
      });
    }
    case "moveTo": {
      const { pending, awaitingDamage, iceHit } = session.run;
      if (pending || awaitingDamage !== null || iceHit) return "check-pending";
      const target =
        arch.discovered.find((f) => f.key === action.key) ??
        arch.mapped.find((m) => m.key === action.key) ??
        null;
      // Nó só mapeado: o conteúdo aparece agora que ela entra.
      const full = architecture?.floors.find((f) => f.key === action.key);
      const mapped = arch.mapped.some((m) => m.key === action.key);
      if (mapped && !full) return "invalid-target";
      const entered =
        mapped && full
          ? { ...revealFloor(session, toPublicFloor(full)), revision: session.revision }
          : session;
      return spend(checkMove(rules, target), { ...entered, runnerPosition: action.key });
    }
    case "jackOut":
      return spend(checkAction(rules, "jackOut"), { ...session, runnerPosition: null });
  }
}

function withBottom(session: PublicSession, architecture: NetArchitecture | null): PublicSession {
  if (!architecture) return session;
  const pos = session.runnerPosition;
  const node = architecture.floors.find((f) => f.key === pos);
  const atBottom = node !== undefined && node.floor >= lowestFloor(architecture.floors);
  return atBottom === session.run.atBottom
    ? session
    : { ...session, run: { ...session.run, atBottom } };
}

function reject(
  requestId: string,
  error: RequestError,
  revision: number | null,
  processedKey: string | null,
): ProcessOutcome {
  return {
    result: { requestId, ok: false, error, revision },
    session: null,
    processedKey,
    ended: false,
    effects: [],
  };
}
