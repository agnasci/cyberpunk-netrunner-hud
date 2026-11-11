import type { CharacterSnapshot } from "./character";
import {
  areLinked,
  type NetFloorContent,
  type NodePosition,
  type PublicFloor,
} from "./net-architecture";

/**
 * Motor de elegibilidade e limites (E3-01). Puro: recebe recursos da ficha e o
 * estado da invasão e diz se uma ação é permitida, com custo ou motivo.
 * Matriz e fontes: docs/RULES.md. Rolagens e efeitos ficam na E3-02.
 */
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
  | "program-neutralized";

export type Eligibility = { allowed: true; cost: number } | { allowed: false; reason: RuleBlock };

/** Programa instalado no cyberdeck equipado, como o motor precisa (E6-05). */
export interface RunnerProgram {
  itemId: string;
  programClass: string;
  rezzed: boolean;
  /** REZ atual (E6-06); ausente = desconhecido. */
  rez?: number;
  /** REZ máximo: rezzar de novo volta com ele (D40). */
  rezMax?: number;
  /** Nome do programa: Armor, Flak, Shield e Superglue têm limites próprios (D40). */
  name?: string;
  /** REZ 0 em execução: sem efeito até derrezzar e rezzar de novo (D40). */
  neutralized?: boolean;
  /** Apagado por um efeito que destrói; não volta (D40). */
  destroyed?: boolean;
}

/** Uma cópia ativa por vez e cada cópia uma vez por Netrun (Core, D40). */
export const ONE_COPY_PROGRAMS: ReadonlySet<string> = new Set(["armor", "flak", "shield"]);
/** Cada cópia uma vez por Netrun (Core, D40). */
export const ONCE_PER_RUN_PROGRAMS: ReadonlySet<string> = new Set([
  "armor",
  "flak",
  "shield",
  "superglue",
]);

/** Nome normalizado para os limites por programa. */
export function programKey(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

export interface RunnerResources {
  /** Rank da função NET ativa (Interface). */
  interfaceRank: number;
  hasCyberdeck: boolean;
  /** Programas instalados; ausente = nenhum. */
  programs?: readonly RunnerProgram[];
}

/** Classes que se rezzam no CPR v0.92.4 (fora Black ICE, que cria token na cena). */
export const REZZABLE_CLASSES: ReadonlySet<string> = new Set(["booster", "defender"]);
/** Atacantes que valem contra Black ICE (antiprograma); antipessoal mira Netrunners. */
export const ICE_ATTACKER_CLASSES: ReadonlySet<string> = new Set(["antiprogramattacker"]);
/** Atacantes que valem contra Netrunners (E6-11b, D37). */
export const NETRUNNER_ATTACKER_CLASSES: ReadonlySet<string> = new Set(["antipersonnelattacker"]);

export interface RunState {
  /** Nó atual; `null` = desconectada. */
  position: PublicFloor | null;
  actionsUsed: number;
  /** Nós resolvidos: Password vencida, Control Node controlado, Black ICE derrotado. */
  cleared: ReadonlySet<number>;
  /** Black ICE driblados com Slide. */
  evaded: ReadonlySet<number>;
  /** Em combate, vez do Black ICE (E6-08, D33): a Netrunner espera. Ausente = falso. */
  iceTurn?: boolean;
  /** Netrunner NPC inimiga ativa no nó atual (E6-11b, D37): alvo de Zap e antipessoal. */
  npcAt?: boolean;
  /** Combate com a NPC aguardando as iniciativas: ações de nó esperam (mover e sair, não). */
  initiativePending?: boolean;
  /** Encontro com Black ICE à espreita sem resolver (teste de velocidade): tudo espera. */
  ambushPending?: boolean;
  /** Cópias ativadas nesta rodada (rezzar ou atacar): uma ativação por rodada (Core). */
  programsUsed?: ReadonlySet<string>;
  /** Cópias de uso único já usadas nesta Netrun (Armor, Flak, Shield, Superglue). */
  netrunUsed?: ReadonlySet<string>;
  /**
   * No andar mais fundo, segundo a autoridade (que conhece a arquitetura toda). Ausente =
   * calcular pelos nós do contexto (a autoridade sempre calcula assim).
   */
  atBottom?: boolean;
}

export interface RuleContext {
  runner: RunnerResources;
  run: RunState;
  /** A arquitetura tem o nó de entrada (andar 1, branch a). */
  hasEntry: boolean;
  /** Nós conhecidos, para os caminhos entre branches (D28): todos na autoridade. */
  nodes: readonly NodePosition[];
}

/** Custo em ações NET (D21). Jack In e Jack Out custam 1 (Core, D39); mover é livre (D27). */
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

/** Conteúdo do nó exigido por cada ação de Interface. */
const NODE_CONTENT: Partial<Record<NodeAction, NetFloorContent>> = {
  backdoor: "password",
  control: "controlnode",
  zap: "blackice",
  slide: "blackice",
  eyedee: "file",
  programAttack: "blackice",
};

/** Ações NET por turno pela Interface (Core; docs/RULES.md). */
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
      name: p.name,
      neutralized: p.status === "neutralized",
      destroyed: p.status === "destroyed",
    })),
  };
}

/** Num nó Black ICE ainda ativo (não derrotado nem driblado) (D22). */
export function isEngaged(run: RunState): boolean {
  const at = run.position;
  return (
    at !== null && at.content === "blackice" && !run.cleared.has(at.key) && !run.evaded.has(at.key)
  );
}

export function checkAction(ctx: RuleContext, action: NodeAction): Eligibility {
  const { run } = ctx;
  if (action === "jackOut") {
    // Sair nunca depende da ficha: perder o deck não prende a Netrunner.
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
    // Pathfinder e Cloak valem em qualquer nó; Virus só no andar mais fundo (Core).
    const bottom = run.atBottom ?? at.floor >= lowestFloor(ctx.nodes);
    if (action === "virus" && !bottom) return deny("not-lowest");
    if (run.ambushPending) return deny("ambush");
    if (run.initiativePending) return deny("initiative");
    if (run.iceTurn) return deny("ice-turn");
    if (isEngaged(run)) return deny("engaged");
    return withCost(ctx, action);
  }
  // Zap e ataque com programa também miram a Netrunner NPC do nó (E6-11b).
  const atNpc = run.npcAt === true && (action === "zap" || action === "programAttack");
  if (!atNpc && at.content !== NODE_CONTENT[action]) return deny("wrong-node");
  if (!atNpc && run.cleared.has(at.key)) return deny("already-cleared");
  if (run.ambushPending) return deny("ambush");
  if (run.initiativePending) return deny("initiative");
  if (run.iceTurn) return deny("ice-turn");
  if (action === "slide" && !isEngaged(run)) return deny("not-engaged");
  return withCost(ctx, action);
}

/** Mover um andar; `target` nulo = nó não revelado nem mapeado para este cliente. */
export function checkMove(ctx: RuleContext, target: NodePosition | null): Eligibility {
  const missing = missingResource(ctx.runner);
  if (missing) return deny(missing);
  const at = ctx.run.position;
  if (at === null) return deny("not-jacked-in");
  if (target === null) return deny("not-revealed");
  if (!areLinked(at, target, ctx.nodes)) return deny("not-adjacent");
  if (ctx.run.iceTurn) return deny("ice-turn");
  if (ctx.run.ambushPending) return deny("ambush");
  if (isEngaged(ctx.run)) return deny("engaged");
  const descending = target.floor > at.floor;
  if (descending && at.content === "password" && !ctx.run.cleared.has(at.key)) {
    return deny("password-locked");
  }
  return withCost(ctx, "move");
}

/**
 * Rezzar/derrezzar Booster ou Defender: conectada, 1 ação NET (E6-05). Regras de programas
 * (Core, D40): cada cópia ativa uma vez por rodada; neutralizado (REZ 0) precisa derrezzar antes
 * de rezzar de novo; Armor, Flak e Shield: uma cópia ativa por vez e cada cópia uma vez por
 * Netrun; destruído não volta.
 */
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

/** Ataque com programa antiprograma contra o Black ICE do nó (E6-05). */
export function checkProgramAttack(ctx: RuleContext, programId: string): Eligibility {
  const node = checkAction(ctx, "programAttack");
  if (!node.allowed) return node;
  const program = ctx.runner.programs?.find((p) => p.itemId === programId);
  const classes = ctx.run.npcAt ? NETRUNNER_ATTACKER_CLASSES : ICE_ATTACKER_CLASSES;
  if (!program || !classes.has(program.programClass)) return deny("invalid-program");
  if (program.destroyed) return deny("program-destroyed");
  // Atacante ativa uma vez por rodada e desativa sozinho depois do uso (Core).
  if (ctx.run.programsUsed?.has(programId)) return deny("program-used");
  // Superglue: cada cópia uma vez por Netrun (Core, D40).
  if (ONCE_PER_RUN_PROGRAMS.has(programKey(program.name)) && ctx.run.netrunUsed?.has(programId)) {
    return deny("once-per-run");
  }
  return node;
}

/** Habilidades de Interface que não dependem do conteúdo do nó. */
const FREE_ABILITIES: ReadonlySet<NodeAction> = new Set(["pathfinder", "cloak", "virus"]);

/** Andar mais fundo entre os nós conhecidos (a autoridade conhece todos). */
export function lowestFloor(nodes: readonly NodePosition[]): number {
  return nodes.reduce((max, n) => Math.max(max, n.floor), 0);
}

/** Rolagem contra DV: precisa superar; empate falha (D24). */
export function beatsDv(total: number, dv: number): boolean {
  return total > dv;
}

/** Disputa: atacante precisa superar o defensor (D24). */
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
