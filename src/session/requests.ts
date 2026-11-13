import {
  type NetArchitecture,
  type NetFloorContent,
  toPublicFloor,
} from "../domain/net-architecture";
import {
  checkAction,
  checkControlOption,
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
import type { PathfinderGate } from "../domain/pathfinder";
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
  withRun,
} from "./checks";
import {
  ABILITY_CHECKS,
  type AbilityCheck,
  concealFloor,
  CONTROL_CHOICES_LIMIT,
  isId,
  mapFloor,
  MAX_ID_LENGTH,
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

export type NetAction =
  | { type: "jackIn" }
  | { type: "moveTo"; key: number }
  | { type: "jackOut" }
  | { type: "reveal"; key: number; masked?: boolean }
  | { type: "conceal"; key: number }
  | { type: "end" }
  | { type: "newTurn" }
  | { type: "endTurn" }
  | { type: "clearNode"; key: number }
  | { type: "restoreNode"; key: number }
  | {
      type: "check";
      ability: AbilityCheck | "damage" | "programAttack";
      messageId: string;
      programId?: string;
    }
  | { type: "rezProgram"; programId: string; rez: boolean }
  | { type: "oppose"; messageId: string }
  | { type: "iceAttack"; messageId: string }
  | { type: "iceDamage"; messageId: string }
  | { type: "undo" }
  | { type: "adjustActions"; delta: 1 | -1 }
  | { type: "linkIce"; key: number; actorUuid: string }
  | { type: "npcAttack"; messageId: string; programId?: string }
  | { type: "initiative"; side: "runner" | "npc"; messageId: string }
  | { type: "npcSync" }
  | { type: "moveNpc"; from: number; to: number }
  | { type: "resolveCheck"; outcome: "success" | "failure" }
  | { type: "ambush"; messageId: string }
  | { type: "iceTarget"; programId: string }
  | { type: "controlOption"; index: number };

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

const REVISION_EXEMPT: ReadonlySet<NetAction["type"]> = new Set([
  ...GM_ACTIONS,
  "check",
  "oppose",
  "initiative",
]);

const KEYED_ACTIONS = ["moveTo", "reveal", "conceal", "clearNode", "restoreNode"] as const;

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
  sender: ViewerIdentity;
  architecture: NetArchitecture | null;
  processed: ReadonlyMap<string, ActionResult>;
  runner: RunnerResources;
  readRoll(messageId: string): RollEvidence | null;
  readIce(actorUuid: string): IceStats | null;
  readVitals(actorUuid: string): RunnerVitals | null;
  pick(count: number): number;
  readResources(actorUuid: string): RunnerResources;
  readRef(actorUuid: string): number | null;
  npcLinkAt(key: number): string | null;
  pathfinderGate?: PathfinderGate;
}

export interface IceStats {
  name: string;
  rez: { value: number; max: number };
  iceClass?: IceClass;
  damageFormula?: string | null;
  specialOnly?: boolean;
  effect?: string;
  destroysPrograms?: boolean;
}

export type { SheetEffect } from "./sheet-effects";

export interface RollEvidence {
  authorId: string;
  actorUuid: string;
  total: number;
  formula?: string | null;
}

export interface ProcessOutcome {
  result: ActionResult;
  session: PublicSession | null;
  processedKey: string | null;
  ended: boolean;
  effects: SheetEffect[];
}

export function parseActionRequest(value: unknown): ActionRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const { requestId, sessionId, expectedRevision, action } = value as Record<string, unknown>;
  if (!isId(requestId) || !isId(sessionId)) return null;
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
  if (type === "controlOption") {
    const { index } = value as Record<string, unknown>;
    return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < 64
      ? { type, index }
      : null;
  }
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
  let settled = applied;
  if (request.action.type !== "undo") {
    const revealed =
      request.action.type === "moveNpc" ? applied : revealNpc(applied, (key) => ctx.npcLinkAt(key));
    const npc = npcAt(revealed);
    const npcMax = npc ? netActionsPerTurn(ctx.readResources(npc.actorUuid).interfaceRank) : 0;
    const hasTargets = (ctx.runner.programs ?? []).some((p) => p.rezzed && (p.rez ?? 0) > 0);
    const ambushed = triggerAmbush(session, revealed, (key) => {
      const link = revealed.run.ice.find((l) => l.key === key)?.actorUuid;
      return !hasTargets && link !== undefined && ctx.readIce(link)?.iceClass === "antiprogram";
    });
    settled = settleTurn(session, ambushed, netActionsPerTurn(ctx.runner.interfaceRank), npcMax);
  }
  settled = withBottom(settled, ctx.architecture);
  const recorded = isRecorded(request.action)
    ? pushHistory(session, settled, request.action, effects)
    : settled;
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
  const { atBottom: storedBottom, ...runState } = toRunState(session);
  const rules: RuleContext = {
    runner,
    run:
      architecture || storedBottom === undefined
        ? runState
        : { ...runState, atBottom: storedBottom },
    hasEntry: entry !== undefined,
    nodes: architecture?.floors ?? [...arch.discovered, ...arch.mapped],
    forks: architecture?.forks ?? arch.forks,
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
      return next === session
        ? "unchanged"
        : withBottom({ ...next, revision: session.revision }, architecture);
    }
    case "conceal": {
      if (action.key === session.runnerPosition) return "invalid-target";
      const next = concealFloor(session, action.key);
      return next === session
        ? "unchanged"
        : withBottom({ ...next, revision: session.revision }, architecture);
    }
    case "clearNode": {
      const node = arch.discovered.find((f) => f.key === action.key);
      if (!node || !CLEARABLE.has(node.content)) return "invalid-target";
      if (session.run.cleared.includes(node.key)) return "unchanged";
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
    case "controlOption": {
      const eligibility = checkControlOption(rules);
      if (!eligibility.allowed) return eligibility.reason;
      const key = session.runnerPosition;
      const label =
        key === null ? undefined : architecture?.secrets?.[key]?.options?.[action.index];
      if (key === null || label === undefined) return "invalid-option";
      const choice = { key, index: action.index, label };
      return spend(eligibility, {
        ...session,
        run: {
          ...session.run,
          controlChoices: [...session.run.controlChoices, choice].slice(-CONTROL_CHOICES_LIMIT),
        },
      });
    }
  }
}

function withBottom(session: PublicSession, architecture: NetArchitecture | null): PublicSession {
  if (!architecture) return session;
  const pos = session.runnerPosition;
  const node = architecture.floors.find((f) => f.key === pos);
  const atBottom = node !== undefined && node.floor >= lowestFloor(architecture.floors);
  const known = new Set([
    ...(session.netArch?.discovered ?? []).map((f) => f.key),
    ...(session.netArch?.mapped ?? []).map((m) => m.key),
  ]);
  const allKnown = architecture.floors.every((f) => known.has(f.key));
  const knownBranches = new Set(
    architecture.floors.filter((f) => known.has(f.key)).map((f) => f.branch),
  );
  const forks = Object.fromEntries(
    Object.entries(architecture.forks ?? {}).filter(([branch]) => knownBranches.has(branch)),
  );
  const arch = session.netArch;
  const sameForks = arch !== null && sameMap(arch.forks, forks);
  if (atBottom === session.run.atBottom && allKnown === session.run.allKnown && sameForks) {
    return session;
  }
  return {
    ...session,
    netArch: arch && !sameForks ? { ...arch, forks } : arch,
    run: { ...session.run, atBottom, allKnown },
  };
}

function sameMap(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
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
