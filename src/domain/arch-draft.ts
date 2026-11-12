import {
  areLinked,
  BRANCHES,
  FLOOR_CONTENTS,
  MAX_FLOOR,
  type NetFloor,
  type NetFloorContent,
} from "./net-architecture";

/**
 * Rascunho do editor de arquitetura (E7-01, D42). Vive só no cliente do mestre até salvar;
 * a chave (`index` do CPR) é estável: nós novos recebem a maior chave + 1.
 */
export interface DraftNode extends NetFloor {
  /** Ator Black ICE pré-vinculado (sugestão no início da sessão). */
  iceActor: string | null;
  /** Netrunner NPC vinculada ao nó (D37). */
  npcActor: string | null;
}

export interface ArchDraft {
  name: string;
  nodes: DraftNode[];
}

/** DVs aceitos pelo modelo de dados do CPR v0.92.4 ("N/A" = `null`). */
export const DV_CHOICES: readonly number[] = Array.from({ length: 17 }, (_, i) => i + 4);

export type DraftError = "out-of-grid" | "missing" | "locked" | "invalid";

export type DraftResult =
  { ok: true; draft: ArchDraft; key: number } | { ok: false; error: DraftError };

export type NodePatch = Partial<
  Pick<DraftNode, "content" | "blackIceKey" | "dv" | "description" | "iceActor" | "npcActor">
>;

export function nodeAt(draft: ArchDraft, floor: number, branch: string): DraftNode | undefined {
  return draft.nodes.find((n) => n.floor === floor && n.branch === branch);
}

function inGrid(floor: number, branch: string): boolean {
  return (
    Number.isInteger(floor) &&
    floor >= 1 &&
    floor <= MAX_FLOOR &&
    (BRANCHES as readonly string[]).includes(branch)
  );
}

function sorted(nodes: DraftNode[]): DraftNode[] {
  return [...nodes].sort((a, b) => a.floor - b.floor || a.branch.localeCompare(b.branch));
}

/** Coloca um nó novo numa célula livre. */
export function placeNode(
  draft: ArchDraft,
  content: NetFloorContent,
  floor: number,
  branch: string,
): DraftResult {
  if (!inGrid(floor, branch)) return { ok: false, error: "out-of-grid" };
  if (nodeAt(draft, floor, branch)) return { ok: false, error: "invalid" };
  const key = draft.nodes.reduce((max, n) => Math.max(max, n.key), -1) + 1;
  const node: DraftNode = {
    key,
    floor,
    branch,
    content,
    blackIceKey: null,
    dv: null,
    description: "",
    iceActor: null,
    npcActor: null,
  };
  return { ok: true, key, draft: { ...draft, nodes: sorted([...draft.nodes, node]) } };
}

/**
 * Move um nó para outra célula; se estiver ocupada, os dois trocam de lugar.
 * Nós travados (`locked`: em uso numa sessão ativa) não mudam de lugar.
 */
export function moveNode(
  draft: ArchDraft,
  key: number,
  floor: number,
  branch: string,
  locked: ReadonlySet<number> = new Set(),
): DraftResult {
  const node = draft.nodes.find((n) => n.key === key);
  if (!node) return { ok: false, error: "missing" };
  if (!inGrid(floor, branch)) return { ok: false, error: "out-of-grid" };
  if (node.floor === floor && node.branch === branch) return { ok: true, key, draft };
  const other = nodeAt(draft, floor, branch);
  if (locked.has(key) || (other && locked.has(other.key))) return { ok: false, error: "locked" };
  const nodes = draft.nodes.map((n) => {
    if (n.key === key) return { ...n, floor, branch };
    if (other && n.key === other.key) return { ...n, floor: node.floor, branch: node.branch };
    return n;
  });
  return { ok: true, key, draft: { ...draft, nodes: sorted(nodes) } };
}

export function removeNode(
  draft: ArchDraft,
  key: number,
  locked: ReadonlySet<number> = new Set(),
): DraftResult {
  if (!draft.nodes.some((n) => n.key === key)) return { ok: false, error: "missing" };
  if (locked.has(key)) return { ok: false, error: "locked" };
  return { ok: true, key, draft: { ...draft, nodes: draft.nodes.filter((n) => n.key !== key) } };
}

/**
 * Altera a configuração do nó. Trocar o tipo limpa o que não cabe no novo tipo
 * (Black ICE não tem NPC; os demais não têm tipo nem ator de Black ICE).
 */
export function patchNode(
  draft: ArchDraft,
  key: number,
  patch: NodePatch,
  locked: ReadonlySet<number> = new Set(),
): DraftResult {
  const node = draft.nodes.find((n) => n.key === key);
  if (!node) return { ok: false, error: "missing" };
  if (patch.content !== undefined && patch.content !== node.content && locked.has(key)) {
    return { ok: false, error: "locked" };
  }
  if (patch.dv !== undefined && patch.dv !== null && !DV_CHOICES.includes(patch.dv)) {
    return { ok: false, error: "invalid" };
  }
  const next: DraftNode = { ...node, ...patch };
  if (next.content === "blackice") {
    next.npcActor = null;
  } else {
    next.blackIceKey = null;
    next.iceActor = null;
  }
  const nodes = draft.nodes.map((n) => (n.key === key ? next : n));
  return { ok: true, key, draft: { ...draft, nodes } };
}

export type DraftIssue =
  | { code: "empty" }
  | { code: "no-name" }
  | { code: "no-root" }
  | { code: "unreachable"; key: number }
  | { code: "ice-type"; key: number };

/** Nós com caminho até o primeiro andar (1A) pela regra de caminhos (D28). */
export function reachableKeys(nodes: readonly DraftNode[]): Set<number> {
  const root = nodes.find((n) => n.floor === 1 && n.branch === "a");
  const seen = new Set<number>();
  if (!root) return seen;
  const queue = [root];
  seen.add(root.key);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const n of nodes) {
      if (!seen.has(n.key) && areLinked(current, n, nodes)) {
        seen.add(n.key);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Avisos do rascunho; nenhum impede salvar (a ficha nativa também aceita). */
export function draftIssues(draft: ArchDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.name.trim() === "") issues.push({ code: "no-name" });
  if (draft.nodes.length === 0) return [...issues, { code: "empty" }];
  if (!nodeAt(draft, 1, "a")) issues.push({ code: "no-root" });
  const reachable = reachableKeys(draft.nodes);
  for (const n of draft.nodes) {
    if (reachable.size > 0 && !reachable.has(n.key))
      issues.push({ code: "unreachable", key: n.key });
    if (n.content === "blackice" && n.blackIceKey === null) {
      issues.push({ code: "ice-type", key: n.key });
    }
  }
  return issues;
}

export interface EditorRow {
  floor: number;
  cells: Array<{ floor: number; branch: string; node: DraftNode | null }>;
}

/**
 * Grade de edição: andares de 1 até o mais fundo + 1 e branches de "a" até a última usada
 * + 1 (dentro do limite do CPR), para sempre haver onde soltar um nó novo.
 */
export function editorGrid(draft: ArchDraft): { columns: string[]; rows: EditorRow[] } {
  const maxFloor = draft.nodes.reduce((m, n) => Math.max(m, n.floor), 0);
  const maxBranch = draft.nodes.reduce(
    (m, n) => Math.max(m, (BRANCHES as readonly string[]).indexOf(n.branch)),
    -1,
  );
  const floors = Math.min(MAX_FLOOR, maxFloor + 1);
  const columns = BRANCHES.slice(0, Math.min(BRANCHES.length, maxBranch + 2));
  const rows: EditorRow[] = [];
  for (let floor = 1; floor <= floors; floor++) {
    rows.push({
      floor,
      cells: columns.map((branch) => ({
        floor,
        branch,
        node: nodeAt(draft, floor, branch) ?? null,
      })),
    });
  }
  return { columns: [...columns], rows };
}

/** Nó do rascunho sem os vínculos (o que vai para `floors[]` do item). */
export function toFloor(node: DraftNode): NetFloor {
  const { key, floor, branch, content, blackIceKey, dv, description } = node;
  return { key, floor, branch, content, blackIceKey, dv, description };
}

/**
 * Nós em uso (`locked`) que o rascunho mudou de lugar, de tipo ou removeu em relação ao item
 * gravado: a arquitetura pode ter entrado numa sessão depois da edição. Vazio = pode salvar.
 */
export function lockConflicts(
  draft: ArchDraft,
  saved: readonly NetFloor[],
  locked: ReadonlySet<number>,
): number[] {
  return saved
    .filter((f) => locked.has(f.key))
    .filter((f) => {
      const n = draft.nodes.find((d) => d.key === f.key);
      return !n || n.floor !== f.floor || n.branch !== f.branch || n.content !== f.content;
    })
    .map((f) => f.key);
}

const isActorRef = (v: unknown): v is string | null => v === null || typeof v === "string";

/** Valida um rascunho guardado no navegador (dado externo); `null` se não servir. */
export function parseDraft(value: unknown): ArchDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const { name, nodes } = value as Record<string, unknown>;
  if (typeof name !== "string" || !Array.isArray(nodes)) return null;
  const parsed: DraftNode[] = [];
  for (const raw of nodes) {
    if (typeof raw !== "object" || raw === null) return null;
    const n = raw as Record<string, unknown>;
    const { key, floor, branch, content, blackIceKey, dv, description, iceActor, npcActor } = n;
    if (typeof key !== "number" || !Number.isInteger(key) || key < 0) return null;
    if (typeof floor !== "number" || typeof branch !== "string" || !inGrid(floor, branch)) {
      return null;
    }
    if (typeof content !== "string" || !(FLOOR_CONTENTS as readonly string[]).includes(content)) {
      return null;
    }
    if (blackIceKey !== null && typeof blackIceKey !== "string") return null;
    if (dv !== null && (typeof dv !== "number" || !DV_CHOICES.includes(dv))) return null;
    if (typeof description !== "string" || !isActorRef(iceActor) || !isActorRef(npcActor)) {
      return null;
    }
    if (parsed.some((p) => p.key === key || (p.floor === floor && p.branch === branch))) {
      return null;
    }
    parsed.push({
      key,
      floor,
      branch,
      content: content as NetFloorContent,
      blackIceKey,
      dv,
      description,
      iceActor,
      npcActor,
    });
  }
  return { name, nodes: sorted(parsed) };
}
