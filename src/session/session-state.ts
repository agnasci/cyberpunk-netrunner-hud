import { parsePublicFloor, type PublicFloor } from "../domain/net-architecture";
import type { IceDamageResult, IceHitTarget } from "../domain/ice-hit";
import type { RunState } from "../domain/net-rules";
import { type LogEntry, parseLog } from "./log-entry";
import { parseSheetEffect, type SheetEffect } from "./sheet-effects";

/**
 * Estado público da sessão (D17): só o necessário para todos os clientes abrirem
 * o HUD. Nunca guardar aqui conteúdo oculto da arquitetura ou de rolagens.
 */
export const SESSION_SCHEMA_VERSION = 4;
/** Versão anterior aceita na leitura: migrada com turno zerado (E3-02a). */
const MIGRATABLE_VERSION = 3;

export type ViewerRole = "gm" | "netrunner" | "spectator";

export interface PublicNetArch {
  itemUuid: string;
  name: string;
  /** Nós já revelados (D18); nunca contém DV ou descrição. */
  discovered: PublicFloor[];
  /**
   * Nós mostrados só no mapa, sem conteúdo (o mestre escolhe ao revelar): posição apenas.
   * O conteúdo vai ao estado público quando a Netrunner entra no nó.
   */
  mapped: MappedFloor[];
}

/** Posição de um nó revelado sem conteúdo. */
export interface MappedFloor {
  key: number;
  floor: number;
  branch: string;
}

/** Habilidades de Interface com checagem contra DV no MVP (E3-02b). */
export const DV_CHECKS = ["backdoor", "control", "eyedee"] as const;
export type DvCheck = (typeof DV_CHECKS)[number];

/** Habilidades em disputa com o Black ICE (E3-02c). */
export const CONTEST_CHECKS = ["zap", "slide"] as const;
export type ContestCheck = (typeof CONTEST_CHECKS)[number];

/** Habilidades de Interface sem alvo no nó (Pathfinder, Cloak, Virus). */
export const FREE_CHECKS = ["pathfinder", "cloak", "virus"] as const;
export type FreeCheck = (typeof FREE_CHECKS)[number];

/** Habilidades que a Netrunner rola pelo HUD. */
export const ABILITY_CHECKS = [...DV_CHECKS, ...CONTEST_CHECKS, ...FREE_CHECKS] as const;
export type AbilityCheck = (typeof ABILITY_CHECKS)[number];

/** Tipos de pendência: habilidade, dano do Zap ou ataque do Black ICE. */
export const PENDING_KINDS = [
  ...ABILITY_CHECKS,
  "damage",
  "iceAttack",
  "programAttack",
  /** Netrunner NPC ataca a jogadora com Zap ou programa (E6-11b). */
  "npcAttack",
  /** Black ICE à espreita: SPD do ICE contra a velocidade da Netrunner ao chegar no nó. */
  "ambush",
] as const;
export type PendingKind = (typeof PENDING_KINDS)[number];

/** Rolagem oposta já feita (DEF/PER do Black ICE ou Defense da Netrunner). */
export interface OpposedRoll {
  total: number;
  messageId: string;
  userId: string;
}

/** Rolagem nativa aceita pela autoridade, aguardando a confirmação do GM (D23). */
export interface PendingCheck {
  ability: PendingKind;
  /** Nó onde a checagem foi feita. */
  key: number;
  /** Total do card no chat; público como o próprio card. */
  total: number;
  messageId: string;
  userId: string;
  /** Disputas: rolagem do outro lado; `null` enquanto não rolada. */
  opposed: OpposedRoll | null;
  /** Dano: REZ do Black ICE depois de aplicado, fixado ao criar a pendência (D26). */
  rezAfter: number | null;
  /** Dano: REZ antes, para desfazer (E6-07); `null` em pendências antigas. */
  rezBefore: number | null;
  /** Ataque com programa: item do programa usado (E6-05). */
  programId: string | null;
}

/** Resultado confirmado pelo GM, para todos animarem o que já foi decidido (E4-01). */
export interface LastOutcome {
  /** Cresce a cada confirmação; o cliente anima quando muda. */
  seq: number;
  ability: PendingKind;
  key: number;
  outcome: "success" | "failure";
}

/** Ator Black ICE vinculado pelo GM a um nó (D25). */
export interface IceLink {
  key: number;
  actorUuid: string;
}

/** Acerto do Black ICE confirmado, aguardando o dano rolado pelo GM (E6-06, D31). */
export interface IceHit {
  key: number;
  target: IceHitTarget;
  /** Acerto de uma Netrunner NPC (E6-11b): ator e programa (`null` = Zap, 1d6). */
  byNpc?: { actorUuid: string; programId: string | null };
  /** Antiprograma com mais de um programa rezzado: o mestre escolhe o alvo antes do dano. */
  pickProgram?: boolean;
}

/**
 * Netrunner NPC inimiga revelada ao chegar no nó (E6-11b, D37). Antes disso o vínculo
 * fica só na flag do item da arquitetura, que só o GM lê.
 */
export interface NpcLink {
  key: number;
  actorUuid: string;
  defeated: boolean;
}

/** Combate com a NPC do nó atual: iniciativas (1d10 + REF) e ações NET gastas por ela. */
export interface NpcFight {
  key: number;
  runnerInit: number | null;
  npcInit: number | null;
  npcActionsUsed: number;
}

/** Último dano do Black ICE aplicado (ou sem alvo), para todos verem (E6-06). */
export interface LastIceDamage {
  seq: number;
  key: number;
  result: IceDamageResult;
  /** Dano de uma Netrunner NPC (E6-11b), não de Black ICE. */
  byNpc?: boolean;
}

/** Quantas mensagens de rolagem já usadas são lembradas (impede reuso). */
export const USED_ROLLS_LIMIT = 20;

/** Progresso público da invasão (D21/D22): nada aqui é segredo. */
export interface PublicRun {
  turn: number;
  /** Ações NET gastas no turno atual. */
  actionsUsed: number;
  /** Nós resolvidos: Password vencida, Control Node controlado, Black ICE derrotado. */
  cleared: number[];
  /** Black ICE driblados com Slide. */
  evaded: number[];
  pending: PendingCheck | null;
  /** Ids de ChatMessage já usados em checagens (mais recentes por último). */
  usedRolls: string[];
  ice: IceLink[];
  /** Nó do Black ICE atingido por Zap ou programa, aguardando a rolagem de dano. */
  awaitingDamage: number | null;
  /** Programa cujo dano é aguardado; `null` = dano do Zap (E6-05). */
  damageProgram: string | null;
  lastOutcome: LastOutcome | null;
  iceHit: IceHit | null;
  lastIceDamage: LastIceDamage | null;
  /** Cresce a cada desfazer: os clientes mostram a faixa sem reanimar o estado antigo. */
  undoSeq: number;
  /** Em combate, vez do Black ICE ou da NPC (E6-08, D33); falso fora do combate. */
  iceTurn: boolean;
  /** Netrunners NPC já reveladas (E6-11b). */
  npcs: NpcLink[];
  fight: NpcFight | null;
  /** Nó de Black ICE à espreita aguardando o teste de velocidade; `null` = nenhum. */
  ambush: number | null;
  /** Nós de Black ICE cujo encontro já aconteceu (uma vez por Black ICE). */
  ambushed: number[];
  /** Cópias ativadas nesta rodada, rezzando ou atacando (uma ativação por rodada). */
  programsUsed: string[];
  /** Cópias de uso único usadas nesta Netrun (Armor, Flak, Shield, Superglue; D40). */
  netrunUsed: string[];
  /**
   * A Netrunner está no andar mais fundo (a autoridade calcula pela arquitetura completa).
   * Público de propósito: ela sabe que chegou ao fundo, como na ficção; libera o Virus.
   */
  atBottom: boolean;
}

/** Um passo do desfazer do GM (E6-07, D32): estado anterior e efeitos inversos. */
export interface UndoEntry {
  /** Tipo da ação desfeita (dica do botão). */
  label: string;
  runnerPosition: number | null;
  run: PublicRun;
  undo: SheetEffect[];
}

export interface PublicSession {
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  id: string;
  revision: number;
  actorUuid: string;
  controllerUserId: string | null;
  startedAt: number;
  netArch: PublicNetArch | null;
  /** Chave do nó onde a Netrunner está; `null` = desconectada. */
  runnerPosition: number | null;
  run: PublicRun;
  /** Desfazer do GM, mais antigo primeiro (E6-07). */
  history: UndoEntry[];
  /** Registro de eventos público, mais antigo primeiro (E6-09, D34). */
  log: LogEntry[];
}

export interface ViewerIdentity {
  id: string;
  isGM: boolean;
}

/** Valida o valor armazenado; qualquer formato inesperado vira `null`. */
export function parseSession(value: unknown): PublicSession | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const version = v["schemaVersion"];
  if (version !== SESSION_SCHEMA_VERSION && version !== MIGRATABLE_VERSION) return null;
  const { id, revision, actorUuid, controllerUserId, startedAt } = v;
  if (typeof id !== "string" || id === "") return null;
  if (typeof actorUuid !== "string" || actorUuid === "") return null;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) return null;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return null;
  if (
    controllerUserId !== null &&
    (typeof controllerUserId !== "string" || controllerUserId === "")
  ) {
    return null;
  }
  const netArch = v["netArch"] === null ? null : parseNetArch(v["netArch"]);
  if (netArch === undefined) return null;
  const runnerPosition = v["runnerPosition"];
  if (
    runnerPosition !== null &&
    (typeof runnerPosition !== "number" || !Number.isInteger(runnerPosition) || runnerPosition < 0)
  ) {
    return null;
  }
  const run = version === MIGRATABLE_VERSION ? newRun() : parseRun(v["run"]);
  if (!run) return null;
  const history = Array.isArray(v["history"]) ? parseHistory(v["history"]) : [];
  const log = parseLog(v["log"]);
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id,
    revision,
    actorUuid,
    controllerUserId,
    startedAt,
    netArch,
    runnerPosition,
    run,
    history,
    log,
  };
}

/** Entradas inválidas são descartadas (histórico é conveniência, não fonte de verdade). */
function parseHistory(list: unknown[]): UndoEntry[] {
  const entries: UndoEntry[] = [];
  for (const item of list.slice(-10)) {
    if (typeof item !== "object" || item === null) continue;
    const { label, runnerPosition, run, undo } = item as Record<string, unknown>;
    if (typeof label !== "string" || label === "" || label.length > 32) continue;
    if (runnerPosition !== null && (!isInt(runnerPosition) || runnerPosition < 0)) continue;
    const parsedRun = parseRun(run);
    if (!parsedRun || !Array.isArray(undo)) continue;
    const effects = undo.map(parseSheetEffect);
    if (effects.some((e) => e === null)) continue;
    entries.push({
      label,
      runnerPosition: runnerPosition as number | null,
      run: parsedRun,
      undo: effects as SheetEffect[],
    });
  }
  return entries;
}

function newRun(): PublicRun {
  return {
    turn: 1,
    actionsUsed: 0,
    cleared: [],
    evaded: [],
    pending: null,
    usedRolls: [],
    ice: [],
    awaitingDamage: null,
    damageProgram: null,
    lastOutcome: null,
    iceHit: null,
    lastIceDamage: null,
    undoSeq: 0,
    iceTurn: false,
    npcs: [],
    fight: null,
    ambush: null,
    ambushed: [],
    programsUsed: [],
    netrunUsed: [],
    atBottom: false,
  };
}

function parseRun(value: unknown): PublicRun | null {
  if (typeof value !== "object" || value === null) return null;
  const { turn, actionsUsed, cleared, evaded, pending, usedRolls, ice, awaitingDamage } =
    value as Record<string, unknown>;
  const damageProgram = (value as Record<string, unknown>)["damageProgram"];
  const lastOutcome = parseLastOutcome((value as Record<string, unknown>)["lastOutcome"]);
  // Campos da E6-06: ausentes ou inválidos viram `null`.
  const iceHit = parseIceHit((value as Record<string, unknown>)["iceHit"]);
  const lastIceDamage = parseLastIceDamage((value as Record<string, unknown>)["lastIceDamage"]);
  const undoSeq = (value as Record<string, unknown>)["undoSeq"];
  const iceTurn = (value as Record<string, unknown>)["iceTurn"] === true;
  const npcs = parseNpcs((value as Record<string, unknown>)["npcs"]);
  const fight = parseFight((value as Record<string, unknown>)["fight"]);
  const ambushRaw = (value as Record<string, unknown>)["ambush"];
  const ambushedRaw = (value as Record<string, unknown>)["ambushed"];
  const usedRaw = (value as Record<string, unknown>)["programsUsed"];
  const count = (n: unknown, min: number) =>
    typeof n === "number" && Number.isInteger(n) && n >= min;
  if (!count(turn, 1) || !count(actionsUsed, 0)) return null;
  const keys = (list: unknown) =>
    Array.isArray(list) ? [...new Set(list.filter((k): k is number => count(k, 0)))] : null;
  const clearedKeys = keys(cleared);
  const evadedKeys = keys(evaded);
  if (!clearedKeys || !evadedKeys) return null;
  // Campos da E3-02b: ausentes em sessões v4 anteriores, recebem o padrão.
  const parsedPending = pending === undefined || pending === null ? null : parsePending(pending);
  if (parsedPending === undefined) return null;
  const used = Array.isArray(usedRolls)
    ? usedRolls.filter((id): id is string => isId(id)).slice(-USED_ROLLS_LIMIT)
    : [];
  // Campos da E3-02c: mesmo tratamento.
  const links = Array.isArray(ice) ? parseIceLinks(ice) : [];
  const damageKey = count(awaitingDamage, 0) ? (awaitingDamage as number) : null;
  return {
    turn: turn as number,
    actionsUsed: actionsUsed as number,
    cleared: clearedKeys,
    evaded: evadedKeys,
    pending: parsedPending,
    usedRolls: used,
    ice: links,
    awaitingDamage: damageKey,
    damageProgram: damageKey !== null && isId(damageProgram) ? damageProgram : null,
    lastOutcome,
    iceHit,
    lastIceDamage,
    undoSeq: count(undoSeq, 0) ? (undoSeq as number) : 0,
    iceTurn,
    npcs,
    fight,
    ambush: count(ambushRaw, 0) ? (ambushRaw as number) : null,
    ambushed: keys(ambushedRaw) ?? [],
    programsUsed: Array.isArray(usedRaw)
      ? [...new Set(usedRaw.filter((id): id is string => isId(id)))].slice(0, 32)
      : [],
    atBottom: (value as Record<string, unknown>)["atBottom"] === true,
    netrunUsed: ids((value as Record<string, unknown>)["netrunUsed"]),
  };
}

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => isId(id)))].slice(0, 32)
    : [];
}

function parseNpcs(value: unknown): NpcLink[] {
  if (!Array.isArray(value)) return [];
  const links: NpcLink[] = [];
  for (const item of value.slice(0, 32)) {
    if (typeof item !== "object" || item === null) continue;
    const { key, actorUuid, defeated } = item as Record<string, unknown>;
    if (!isInt(key) || key < 0 || !isId(actorUuid)) continue;
    if (links.some((l) => l.key === key)) continue;
    links.push({ key, actorUuid, defeated: defeated === true });
  }
  return links;
}

function parseFight(value: unknown): NpcFight | null {
  if (typeof value !== "object" || value === null) return null;
  const { key, runnerInit, npcInit, npcActionsUsed } = value as Record<string, unknown>;
  const init = (n: unknown): number | null => (isInt(n) && n >= 0 && n < 1000 ? n : null);
  if (!isInt(key) || key < 0 || !isInt(npcActionsUsed) || npcActionsUsed < 0) return null;
  return { key, runnerInit: init(runnerInit), npcInit: init(npcInit), npcActionsUsed };
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= 64;
}

/** `undefined` = inválido. */
function parsePending(value: unknown): PendingCheck | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { ability, key, total, messageId, userId, opposed, rezAfter, programId } = value as Record<
    string,
    unknown
  >;
  const rezBefore = (value as Record<string, unknown>)["rezBefore"];
  const kind = PENDING_KINDS.find((a) => a === ability);
  if (!kind) return undefined;
  if (typeof key !== "number" || !Number.isInteger(key) || key < 0) return undefined;
  if (!isInt(total)) return undefined;
  if (!isId(messageId) || !isId(userId)) return undefined;
  const parsedOpposed = opposed === undefined || opposed === null ? null : parseOpposed(opposed);
  if (parsedOpposed === undefined) return undefined;
  const rez = rezAfter === undefined || rezAfter === null ? null : rezAfter;
  if (rez !== null && (!isInt(rez) || rez < 0)) return undefined;
  return {
    ability: kind,
    key,
    total,
    messageId,
    userId,
    opposed: parsedOpposed,
    rezAfter: rez,
    rezBefore: isInt(rezBefore) && rezBefore >= 0 ? rezBefore : null,
    programId: isId(programId) ? programId : null,
  };
}

/** Inválido ou ausente vira `null` (só afeta animação). */
function parseLastOutcome(value: unknown): LastOutcome | null {
  if (typeof value !== "object" || value === null) return null;
  const { seq, ability, key, outcome } = value as Record<string, unknown>;
  const kind = PENDING_KINDS.find((a) => a === ability);
  if (!kind || !isInt(seq) || seq < 1 || !isInt(key) || key < 0) return null;
  if (outcome !== "success" && outcome !== "failure") return null;
  return { seq, ability: kind, key, outcome };
}

function parseIceHit(value: unknown): IceHit | null {
  if (typeof value !== "object" || value === null) return null;
  const { key, target } = value as Record<string, unknown>;
  if (!isInt(key) || key < 0 || typeof target !== "object" || target === null) return null;
  const t = target as Record<string, unknown>;
  const nonNeg = (n: unknown): n is number => isInt(n) && n >= 0;
  if (t["kind"] === "brain" && nonNeg(t["hpBase"]) && nonNeg(t["reduction"])) {
    const raw = (value as Record<string, unknown>)["byNpc"];
    const npc = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
    const byNpc =
      npc && isId(npc["actorUuid"])
        ? {
            actorUuid: npc["actorUuid"],
            programId: isId(npc["programId"]) ? npc["programId"] : null,
          }
        : undefined;
    return {
      key,
      target: { kind: "brain", hpBase: t["hpBase"], reduction: t["reduction"] },
      ...(byNpc ? { byNpc } : {}),
    };
  }
  if (t["kind"] === "program" && isId(t["programId"]) && nonNeg(t["rezBase"])) {
    const pick = (value as Record<string, unknown>)["pickProgram"] === true;
    return {
      key,
      target: {
        kind: "program",
        programId: t["programId"],
        rezBase: t["rezBase"],
        ...(t["destroys"] === true ? { destroys: true } : {}),
      },
      ...(pick ? { pickProgram: true } : {}),
    };
  }
  return null;
}

function parseLastIceDamage(value: unknown): LastIceDamage | null {
  if (typeof value !== "object" || value === null) return null;
  const { seq, key, result } = value as Record<string, unknown>;
  if (!isInt(seq) || seq < 1 || !isInt(key) || key < 0) return null;
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  const nonNeg = (n: unknown): n is number => isInt(n) && n >= 0;
  let parsed: IceDamageResult | null = null;
  if (r["kind"] === "brain" && nonNeg(r["taken"]) && nonNeg(r["after"])) {
    parsed = { kind: "brain", taken: r["taken"], after: r["after"] };
  } else if (
    r["kind"] === "program" &&
    isId(r["programId"]) &&
    nonNeg(r["taken"]) &&
    nonNeg(r["after"]) &&
    typeof r["destroyed"] === "boolean"
  ) {
    parsed = {
      kind: "program",
      programId: r["programId"],
      taken: r["taken"],
      after: r["after"],
      destroyed: r["destroyed"],
    };
  } else if (
    r["kind"] === "none" &&
    (r["reason"] === "no-program" || r["reason"] === "manual" || r["reason"] === "shield")
  ) {
    parsed = { kind: "none", reason: r["reason"] };
  }
  const byNpc = (value as Record<string, unknown>)["byNpc"] === true;
  return parsed ? { seq, key, result: parsed, ...(byNpc ? { byNpc } : {}) } : null;
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function parseOpposed(value: unknown): OpposedRoll | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { total, messageId, userId } = value as Record<string, unknown>;
  if (!isInt(total) || !isId(messageId) || !isId(userId)) return undefined;
  return { total, messageId, userId };
}

/** Vínculos inválidos ou repetidos (mesmo nó) são descartados. */
function parseIceLinks(list: unknown[]): IceLink[] {
  const links: IceLink[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const { key, actorUuid } = entry as Record<string, unknown>;
    if (!isInt(key) || key < 0 || !isId(actorUuid)) continue;
    if (!links.some((l) => l.key === key)) links.push({ key, actorUuid });
  }
  return links;
}

/** `undefined` = inválido. Nós inválidos ou repetidos são descartados. */
function parseNetArch(value: unknown): PublicNetArch | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { itemUuid, name, discovered, mapped } = value as Record<string, unknown>;
  if (typeof itemUuid !== "string" || itemUuid === "") return undefined;
  if (typeof name !== "string") return undefined;
  if (!Array.isArray(discovered)) return undefined;
  const floors: PublicFloor[] = [];
  for (const entry of discovered) {
    const floor = parsePublicFloor(entry);
    if (floor && !floors.some((f) => f.key === floor.key)) floors.push(floor);
  }
  const positions: MappedFloor[] = [];
  for (const entry of Array.isArray(mapped) ? mapped : []) {
    const m = parseMapped(entry);
    if (m && !floors.some((f) => f.key === m.key) && !positions.some((p) => p.key === m.key)) {
      positions.push(m);
    }
  }
  return { itemUuid, name, discovered: floors, mapped: positions };
}

/** Só posição; qualquer outro campo (conteúdo, DV) é descartado. */
function parseMapped(value: unknown): MappedFloor | null {
  const floor = parsePublicFloor(
    typeof value === "object" && value !== null ? { ...value, content: "file" } : null,
  );
  return floor ? { key: floor.key, floor: floor.floor, branch: floor.branch } : null;
}

export function createSession(
  input: {
    actorUuid: string;
    controllerUserId: string | null;
    netArch: { itemUuid: string; name: string } | null;
    /** Black ICE vinculados no diálogo de início (E6-03, D25). */
    ice?: IceLink[];
  },
  meta: { id: string; now: number },
): PublicSession {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: meta.id,
    revision: 1,
    actorUuid: input.actorUuid,
    controllerUserId: input.controllerUserId,
    startedAt: meta.now,
    netArch: input.netArch ? { ...input.netArch, discovered: [], mapped: [] } : null,
    runnerPosition: null,
    run: { ...newRun(), ice: input.netArch ? [...(input.ice ?? [])] : [] },
    history: [],
    log: [],
  };
}

/** Estado da invasão no formato do motor de regras. */
export function toRunState(session: PublicSession): RunState {
  const position =
    session.runnerPosition === null
      ? null
      : (session.netArch?.discovered.find((f) => f.key === session.runnerPosition) ?? null);
  return {
    position,
    actionsUsed: session.run.actionsUsed,
    cleared: new Set(session.run.cleared),
    evaded: new Set(session.run.evaded),
    iceTurn: session.run.iceTurn,
    npcAt: npcAt(session) !== null,
    initiativePending: initiativePending(session),
    ambushPending: ambushPending(session),
    programsUsed: new Set(session.run.programsUsed),
    netrunUsed: new Set(session.run.netrunUsed),
    atBottom: session.run.atBottom,
  };
}

/** Encontro com Black ICE à espreita ainda sem resultado (rolagem do ICE ou da jogadora). */
export function ambushPending(session: PublicSession): boolean {
  return session.run.ambush !== null || session.run.pending?.ability === "ambush";
}

/** NPC ativa (não derrotada) no nó atual da Netrunner (E6-11b). */
export function npcAt(session: PublicSession): NpcLink | null {
  const pos = session.runnerPosition;
  if (pos === null) return null;
  return session.run.npcs.find((n) => n.key === pos && !n.defeated) ?? null;
}

/** Combate com a NPC do nó ainda sem as duas iniciativas. */
export function initiativePending(session: PublicSession): boolean {
  if (!npcAt(session)) return false;
  const f = session.run.fight;
  return !f || f.key !== session.runnerPosition || f.runnerInit === null || f.npcInit === null;
}

/** Revela um nó (idempotente). Só o GM grava o resultado. */
export function revealFloor(session: PublicSession, floor: PublicFloor): PublicSession {
  const arch = session.netArch;
  if (!arch || arch.discovered.some((f) => f.key === floor.key)) return session;
  return {
    ...session,
    revision: session.revision + 1,
    netArch: {
      ...arch,
      discovered: [...arch.discovered, floor],
      mapped: arch.mapped.filter((m) => m.key !== floor.key),
    },
  };
}

/**
 * Mostra o nó só no mapa, sem conteúdo (idempotente). Um nó já revelado volta a ficar sem
 * conteúdo, menos o da Netrunner (ela está vendo).
 */
export function mapFloor(session: PublicSession, floor: MappedFloor): PublicSession {
  const arch = session.netArch;
  if (!arch || arch.mapped.some((m) => m.key === floor.key)) return session;
  if (floor.key === session.runnerPosition) return session;
  const position = { key: floor.key, floor: floor.floor, branch: floor.branch };
  return {
    ...session,
    revision: session.revision + 1,
    netArch: {
      ...arch,
      discovered: arch.discovered.filter((f) => f.key !== floor.key),
      mapped: [...arch.mapped, position],
    },
  };
}

/** Oculta um nó revelado (idempotente). */
export function concealFloor(session: PublicSession, key: number): PublicSession {
  const arch = session.netArch;
  if (!arch || ![...arch.discovered, ...arch.mapped].some((f) => f.key === key)) return session;
  return {
    ...session,
    revision: session.revision + 1,
    netArch: {
      ...arch,
      discovered: arch.discovered.filter((f) => f.key !== key),
      mapped: arch.mapped.filter((m) => m.key !== key),
    },
  };
}

export function resolveViewerRole(session: PublicSession, viewer: ViewerIdentity): ViewerRole {
  if (viewer.isGM) return "gm";
  if (session.controllerUserId !== null && session.controllerUserId === viewer.id) {
    return "netrunner";
  }
  return "spectator";
}
