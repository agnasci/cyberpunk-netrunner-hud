import type { CharacterSnapshot } from "./character";
import {
  areLinked,
  type ForkMap,
  type NetFloorContent,
  type NodePosition,
  type PublicFloor,
} from "./net-architecture";

export type NodeAction =
  | "jackIn"
  | "jackOut"
  | "backdoor"
  | "control"
  | "eyedee"
  | "zap"
  | "slide"
  | "programAttack"
  | "pathfinder"
  | "cloak"
  | "virus";

export type RuleBlock =
  | "no-net-role"
  | "no-cyberdeck"
  | "not-jacked-in"
  | "already-jacked-in"
  | "no-entry"
  | "no-actions-left"
  | "wrong-node"
  | "already-cleared"
  | "not-engaged"
  | "engaged"
  | "password-locked"
  | "not-adjacent"
  | "not-revealed"
  | "invalid-program"
  | "program-state"
  | "program-destroyed"
  | "ice-turn"
  | "initiative"
  | "ambush"
  | "program-used"
  | "not-lowest"
  | "once-per-run"
  | "one-copy"
  | "program-neutralized"
  | "not-controlled"
  | "invalid-option";

export type Eligibility = { allowed: true; cost: number } | { allowed: false; reason: RuleBlock };

export interface RunnerProgram {
  itemId: string;
  programClass: string;
  rezzed: boolean;
  rez?: number;
  rezMax?: number;
  atk?: number;
  name?: string;
  neutralized?: boolean;
  destroyed?: boolean;
}

export const ONE_COPY_PROGRAMS: ReadonlySet<string> = new Set(["armor", "flak", "shield"]);
export const ONCE_PER_RUN_PROGRAMS: ReadonlySet<string> = new Set([
  "armor",
  "flak",
  "shield",
  "superglue",
]);

export function programKey(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

export const ARMOR_BRAIN_REDUCTION = 4;

export function isRunning(programs: readonly RunnerProgram[] | undefined, key: string): boolean {
  return (programs ?? []).some(
    (p) => p.rezzed && !p.neutralized && !p.destroyed && programKey(p.name) === key,
  );
}

export function armorReduction(programs: readonly RunnerProgram[] | undefined): number {
  return isRunning(programs, "armor") ? ARMOR_BRAIN_REDUCTION : 0;
}

export function flakAtk(
  defender: readonly RunnerProgram[] | undefined,
  attacker: RunnerProgram | undefined,
): number {
  return attacker && isRunning(defender, "flak") ? Math.max(0, attacker.atk ?? 0) : 0;
}

export interface RunnerResources {
  interfaceRank: number;
  hasCyberdeck: boolean;
  programs?: readonly RunnerProgram[];
}

export const REZZABLE_CLASSES: ReadonlySet<string> = new Set(["booster", "defender"]);
export const ICE_ATTACKER_CLASSES: ReadonlySet<string> = new Set(["antiprogramattacker"]);
export const NETRUNNER_ATTACKER_CLASSES: ReadonlySet<string> = new Set(["antipersonnelattacker"]);

export interface RunState {
  position: PublicFloor | null;
  actionsUsed: number;
  cleared: ReadonlySet<number>;
  evaded: ReadonlySet<number>;
  iceTurn?: boolean;
  npcAt?: boolean;
  initiativePending?: boolean;
  ambushPending?: boolean;
  programsUsed?: ReadonlySet<string>;
  netrunUsed?: ReadonlySet<string>;
  atBottom?: boolean;
}

export interface RuleContext {
  runner: RunnerResources;
  run: RunState;
  hasEntry: boolean;
  forks?: ForkMap;
  nodes: readonly NodePosition[];
}

const COST: Record<NodeAction | "move" | "rez", number> = {
  rez: 1,
  programAttack: 1,
  jackIn: 1,
  pathfinder: 1,
  cloak: 1,
  virus: 1,
  jackOut: 1,
  move: 0,
  backdoor: 1,
  control: 1,
  zap: 1,
  slide: 1,
  eyedee: 1,
};

const NODE_CONTENT: Partial<Record<NodeAction, NetFloorContent>> = {
  backdoor: "password",
  control: "controlnode",
  zap: "blackice",
  slide: "blackice",
  eyedee: "file",
  programAttack: "blackice",
};

export function netActionsPerTurn(interfaceRank: number): number {
  if (!Number.isFinite(interfaceRank) || interfaceRank < 1) return 0;
  if (interfaceRank <= 3) return 2;
  if (interfaceRank <= 6) return 3;
  if (interfaceRank <= 9) return 4;
  return 5;
}

export function actionsLeft(ctx: RuleContext): number {
  return Math.max(0, netActionsPerTurn(ctx.runner.interfaceRank) - ctx.run.actionsUsed);
}

export function runnerResources(snapshot: CharacterSnapshot | null): RunnerResources {
  return {
    interfaceRank: snapshot?.netRole?.rank ?? 0,
    hasCyberdeck: snapshot?.cyberdeck != null,
    programs: (snapshot?.programs ?? []).map((p) => ({
      itemId: p.itemId,
      programClass: p.programClass,
      rezzed: p.status === "rezzed",
      rez: p.rez.value,
      rezMax: p.rez.max,
      atk: p.stats.atk,
      name: p.name,
      neutralized: p.status === "neutralized",
      destroyed: p.status === "destroyed",
    })),
  };
}

export function isEngaged(run: RunState): boolean {
  const at = run.position;
  return (
    at !== null && at.content === "blackice" && !run.cleared.has(at.key) && !run.evaded.has(at.key)
  );
}

export function checkAction(ctx: RuleContext, action: NodeAction): Eligibility {
  const { run } = ctx;
  if (action === "jackOut") {
    if (run.position === null) return deny("not-jacked-in");
    if (run.iceTurn) return deny("ice-turn");
    if (run.ambushPending) return deny("ambush");
    return withCost(ctx, action);
  }
  const missing = missingResource(ctx.runner);
  if (missing) return deny(missing);
  if (action === "jackIn") {
    if (run.position !== null) return deny("already-jacked-in");
    if (!ctx.hasEntry) return deny("no-entry");
    return withCost(ctx, action);
  }
  const at = run.position;
  if (at === null) return deny("not-jacked-in");
  if (FREE_ABILITIES.has(action)) {
    const bottom = run.atBottom ?? at.floor >= lowestFloor(ctx.nodes);
    if (action === "virus" && !bottom) return deny("not-lowest");
    if (run.ambushPending) return deny("ambush");
    if (run.initiativePending) return deny("initiative");
    if (run.iceTurn) return deny("ice-turn");
    if (isEngaged(run)) return deny("engaged");
    return withCost(ctx, action);
  }
  const atNpc = run.npcAt === true && (action === "zap" || action === "programAttack");
  if (!atNpc && at.content !== NODE_CONTENT[action]) return deny("wrong-node");
  if (!atNpc && run.cleared.has(at.key)) return deny("already-cleared");
  if (run.ambushPending) return deny("ambush");
  if (run.initiativePending) return deny("initiative");
  if (run.iceTurn) return deny("ice-turn");
  if (action === "slide" && !isEngaged(run)) return deny("not-engaged");
  return withCost(ctx, action);
}

export function checkMove(ctx: RuleContext, target: NodePosition | null): Eligibility {
  const missing = missingResource(ctx.runner);
  if (missing) return deny(missing);
  const at = ctx.run.position;
  if (at === null) return deny("not-jacked-in");
  if (target === null) return deny("not-revealed");
  if (!areLinked(at, target, ctx.nodes, ctx.forks)) return deny("not-adjacent");
  if (ctx.run.iceTurn) return deny("ice-turn");
  if (ctx.run.ambushPending) return deny("ambush");
  if (isEngaged(ctx.run)) return deny("engaged");
  const descending = target.floor > at.floor;
  if (descending && at.content === "password" && !ctx.run.cleared.has(at.key)) {
    return deny("password-locked");
  }
  return withCost(ctx, "move");
}

export function checkProgramRez(ctx: RuleContext, programId: string, rez: boolean): Eligibility {
  if (ctx.run.position === null) return deny("not-jacked-in");
  const missing = missingResource(ctx.runner);
  if (missing) return deny(missing);
  const programs = ctx.runner.programs ?? [];
  const program = programs.find((p) => p.itemId === programId);
  if (!program || !REZZABLE_CLASSES.has(program.programClass)) return deny("invalid-program");
  if (program.destroyed) return deny("program-destroyed");
  const running = program.rezzed || program.neutralized === true;
  if (rez && program.neutralized) return deny("program-neutralized");
  if (running === rez) return deny("program-state");
  if (rez) {
    const key = programKey(program.name);
    if (ctx.run.programsUsed?.has(programId)) return deny("program-used");
    if (ONCE_PER_RUN_PROGRAMS.has(key) && ctx.run.netrunUsed?.has(programId)) {
      return deny("once-per-run");
    }
    const otherCopy = programs.some(
      (p) => p.itemId !== programId && p.rezzed && programKey(p.name) === key,
    );
    if (ONE_COPY_PROGRAMS.has(key) && otherCopy) return deny("one-copy");
  }
  if (ctx.run.ambushPending) return deny("ambush");
  if (ctx.run.initiativePending) return deny("initiative");
  if (ctx.run.iceTurn) return deny("ice-turn");
  return withCost(ctx, "rez");
}

export function checkControlOption(ctx: RuleContext): Eligibility {
  const missing = missingResource(ctx.runner);
  if (missing) return deny(missing);
  const at = ctx.run.position;
  if (at === null) return deny("not-jacked-in");
  if (at.content !== "controlnode") return deny("wrong-node");
  if (!ctx.run.cleared.has(at.key)) return deny("not-controlled");
  if (ctx.run.ambushPending) return deny("ambush");
  if (ctx.run.initiativePending) return deny("initiative");
  if (ctx.run.iceTurn) return deny("ice-turn");
  return withCost(ctx, "control");
}

export function checkProgramAttack(ctx: RuleContext, programId: string): Eligibility {
  const node = checkAction(ctx, "programAttack");
  if (!node.allowed) return node;
  const program = ctx.runner.programs?.find((p) => p.itemId === programId);
  const classes = ctx.run.npcAt ? NETRUNNER_ATTACKER_CLASSES : ICE_ATTACKER_CLASSES;
  if (!program || !classes.has(program.programClass)) return deny("invalid-program");
  if (program.destroyed) return deny("program-destroyed");
  if (ctx.run.programsUsed?.has(programId)) return deny("program-used");
  if (ONCE_PER_RUN_PROGRAMS.has(programKey(program.name)) && ctx.run.netrunUsed?.has(programId)) {
    return deny("once-per-run");
  }
  return node;
}

const FREE_ABILITIES: ReadonlySet<NodeAction> = new Set(["pathfinder", "cloak", "virus"]);

export function lowestFloor(nodes: readonly NodePosition[]): number {
  return nodes.reduce((max, n) => Math.max(max, n.floor), 0);
}

export function beatsDv(total: number, dv: number): boolean {
  return total > dv;
}

export function winsContest(attackerTotal: number, defenderTotal: number): boolean {
  return attackerTotal > defenderTotal;
}

function missingResource(runner: RunnerResources): RuleBlock | null {
  if (netActionsPerTurn(runner.interfaceRank) === 0) return "no-net-role";
  if (!runner.hasCyberdeck) return "no-cyberdeck";
  return null;
}

function withCost(ctx: RuleContext, action: NodeAction | "move" | "rez"): Eligibility {
  const cost = COST[action];
  return actionsLeft(ctx) < cost ? deny("no-actions-left") : { allowed: true, cost };
}

function deny(reason: RuleBlock): Eligibility {
  return { allowed: false, reason };
}
