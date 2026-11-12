import { parsePublicFloor, type PublicFloor } from "../domain/net-architecture";
import type { IceDamageResult, IceHitTarget } from "../domain/ice-hit";
import type { RunState } from "../domain/net-rules";
import { type LogEntry, parseLog } from "./log-entry";
import { parseSheetEffect, type SheetEffect } from "./sheet-effects";

export const SESSION_SCHEMA_VERSION = 4;
const MIGRATABLE_VERSION = 3;

export type ViewerRole = "gm" | "netrunner" | "spectator";

export interface PublicNetArch {
  itemUuid: string;
  name: string;
  discovered: PublicFloor[];
  mapped: MappedFloor[];
}

export interface MappedFloor {
  key: number;
  floor: number;
  branch: string;
}

export const DV_CHECKS = ["backdoor", "control", "eyedee"] as const;
export type DvCheck = (typeof DV_CHECKS)[number];

export const CONTEST_CHECKS = ["zap", "slide"] as const;
export type ContestCheck = (typeof CONTEST_CHECKS)[number];

export const FREE_CHECKS = ["pathfinder", "cloak", "virus"] as const;
export type FreeCheck = (typeof FREE_CHECKS)[number];

export const ABILITY_CHECKS = [...DV_CHECKS, ...CONTEST_CHECKS, ...FREE_CHECKS] as const;
export type AbilityCheck = (typeof ABILITY_CHECKS)[number];

export const PENDING_KINDS = [
  ...ABILITY_CHECKS,
  "damage",
  "iceAttack",
  "programAttack",
  "npcAttack",
  "ambush",
] as const;
export type PendingKind = (typeof PENDING_KINDS)[number];

export interface OpposedRoll {
  total: number;
  messageId: string;
  userId: string;
}

export interface PendingCheck {
  ability: PendingKind;
  key: number;
  total: number;
  messageId: string;
  userId: string;
  opposed: OpposedRoll | null;
  rezAfter: number | null;
  rezBefore: number | null;
  programId: string | null;
}

export interface LastOutcome {
  seq: number;
  ability: PendingKind;
  key: number;
  outcome: "success" | "failure";
}

export interface IceLink {
  key: number;
  actorUuid: string;
}

export interface IceHit {
  key: number;
  target: IceHitTarget;
  byNpc?: { actorUuid: string; programId: string | null };
  pickProgram?: boolean;
}

export interface NpcLink {
  key: number;
  actorUuid: string;
  defeated: boolean;
}

export interface NpcFight {
  key: number;
  runnerInit: number | null;
  npcInit: number | null;
  npcActionsUsed: number;
}

export interface LastIceDamage {
  seq: number;
  key: number;
  result: IceDamageResult;
  byNpc?: boolean;
}

export const USED_ROLLS_LIMIT = 20;

export interface PublicRun {
  turn: number;
  actionsUsed: number;
  cleared: number[];
  evaded: number[];
  pending: PendingCheck | null;
  usedRolls: string[];
  ice: IceLink[];
  awaitingDamage: number | null;
  damageProgram: string | null;
  lastOutcome: LastOutcome | null;
  iceHit: IceHit | null;
  lastIceDamage: LastIceDamage | null;
  undoSeq: number;
  iceTurn: boolean;
  npcs: NpcLink[];
  fight: NpcFight | null;
  ambush: number | null;
  ambushed: number[];
  programsUsed: string[];
  netrunUsed: string[];
  atBottom: boolean;
  allKnown: boolean;
}

export interface UndoEntry {
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
  runnerPosition: number | null;
  run: PublicRun;
  history: UndoEntry[];
  log: LogEntry[];
}

export interface ViewerIdentity {
  id: string;
  isGM: boolean;
}

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
    allKnown: false,
  };
}

function parseRun(value: unknown): PublicRun | null {
  if (typeof value !== "object" || value === null) return null;
  const { turn, actionsUsed, cleared, evaded, pending, usedRolls, ice, awaitingDamage } =
    value as Record<string, unknown>;
  const damageProgram = (value as Record<string, unknown>)["damageProgram"];
  const lastOutcome = parseLastOutcome((value as Record<string, unknown>)["lastOutcome"]);
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
  const parsedPending = pending === undefined || pending === null ? null : parsePending(pending);
  if (parsedPending === undefined) return null;
  const used = Array.isArray(usedRolls)
    ? usedRolls.filter((id): id is string => isId(id)).slice(-USED_ROLLS_LIMIT)
    : [];
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
    allKnown: (value as Record<string, unknown>)["allKnown"] === true,
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

export const MAX_ID_LENGTH = 64;

export function isId(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= MAX_ID_LENGTH;
}

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

export function ambushPending(session: PublicSession): boolean {
  return session.run.ambush !== null || session.run.pending?.ability === "ambush";
}

export function npcAt(session: PublicSession): NpcLink | null {
  const pos = session.runnerPosition;
  if (pos === null) return null;
  return session.run.npcs.find((n) => n.key === pos && !n.defeated) ?? null;
}

export function initiativePending(session: PublicSession): boolean {
  if (!npcAt(session)) return false;
  const f = session.run.fight;
  return !f || f.key !== session.runnerPosition || f.runnerInit === null || f.npcInit === null;
}

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
