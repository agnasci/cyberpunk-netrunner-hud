import {
  areLinked,
  BRANCHES,
  FLOOR_CONTENTS,
  forkOptions,
  forkParent,
  inLobby,
  MAX_FLOOR,
  parseForks,
  startsBranch,
  type NetFloor,
  type NetFloorContent,
} from "./net-architecture";
import { type NodeSecret, parseNodeSecret, secretFor } from "./node-secrets";

export interface DraftNode extends NetFloor {
  iceActor: string | null;
  npcActor: string | null;
  secret: NodeSecret;
}

export interface ArchDraft {
  name: string;
  nodes: DraftNode[];
  forks: Record<string, string>;
}

export const DV_CHOICES: readonly number[] = Array.from({ length: 17 }, (_, i) => i + 4);

export type DraftError = "out-of-grid" | "missing" | "locked" | "invalid" | "lobby";

export type DraftResult =
  { ok: true; draft: ArchDraft; key: number } | { ok: false; error: DraftError };

export type NodePatch = Partial<
  Pick<
    DraftNode,
    "content" | "blackIceKey" | "dv" | "description" | "iceActor" | "npcActor" | "secret"
  >
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

export function placeNode(
  draft: ArchDraft,
  content: NetFloorContent,
  floor: number,
  branch: string,
): DraftResult {
  if (!inGrid(floor, branch)) return { ok: false, error: "out-of-grid" };
  if (inLobby(floor, branch)) return { ok: false, error: "lobby" };
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
    secret: {},
  };
  return { ok: true, key, draft: { ...draft, nodes: sorted([...draft.nodes, node]) } };
}

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
  if (inLobby(floor, branch) || (other && inLobby(node.floor, node.branch))) {
    return { ok: false, error: "lobby" };
  }
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
  const merged: DraftNode = { ...node, ...patch };
  const next: DraftNode = {
    ...merged,
    secret: secretFor(merged.content, parseNodeSecret(merged.secret) ?? {}),
  };
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
  | { code: "ice-type"; key: number }
  | { code: "lobby"; key: number };

export interface ForkChoice {
  branch: string;
  parent: string | null;
  options: string[];
}

export function forkChoice(draft: ArchDraft, key: number): ForkChoice | null {
  const node = draft.nodes.find((n) => n.key === key);
  if (!node || !startsBranch(node, draft.nodes)) return null;
  const options = forkOptions(node, draft.nodes);
  if (options.length === 0) return null;
  return { branch: node.branch, parent: forkParent(node, draft.nodes, draft.forks), options };
}

export function setFork(
  draft: ArchDraft,
  key: number,
  parent: string,
  locked: ReadonlySet<number> = new Set(),
): DraftResult {
  const choice = forkChoice(draft, key);
  if (!choice) return { ok: false, error: "missing" };
  if (!choice.options.includes(parent)) return { ok: false, error: "invalid" };
  if (locked.has(key)) return { ok: false, error: "locked" };
  return { ok: true, key, draft: { ...draft, forks: { ...draft.forks, [choice.branch]: parent } } };
}

export function savedForks(draft: ArchDraft): Record<string, string> {
  const forks: Record<string, string> = {};
  for (const node of draft.nodes) {
    const choice = forkChoice(draft, node.key);
    const chosen = draft.forks[node.branch];
    if (choice && chosen !== undefined && choice.options.includes(chosen)) {
      forks[node.branch] = chosen;
    }
  }
  return forks;
}

export function reachableKeys(
  nodes: readonly DraftNode[],
  forks: Readonly<Record<string, string>> = {},
): Set<number> {
  const root = nodes.find((n) => n.floor === 1 && n.branch === "a");
  const seen = new Set<number>();
  if (!root) return seen;
  const queue = [root];
  seen.add(root.key);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const n of nodes) {
      if (!seen.has(n.key) && areLinked(current, n, nodes, forks)) {
        seen.add(n.key);
        queue.push(n);
      }
    }
  }
  return seen;
}

export function draftIssues(draft: ArchDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.name.trim() === "") issues.push({ code: "no-name" });
  if (draft.nodes.length === 0) return [...issues, { code: "empty" }];
  if (!nodeAt(draft, 1, "a")) issues.push({ code: "no-root" });
  const reachable = reachableKeys(draft.nodes, draft.forks);
  for (const n of draft.nodes) {
    if (inLobby(n.floor, n.branch)) issues.push({ code: "lobby", key: n.key });
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
  cells: Array<{ floor: number; branch: string; node: DraftNode | null; blocked: boolean }>;
}

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
        blocked: inLobby(floor, branch),
      })),
    });
  }
  return { columns: [...columns], rows };
}

export function draftSecrets(draft: ArchDraft): Record<number, NodeSecret> {
  const secrets: Record<number, NodeSecret> = {};
  for (const node of draft.nodes) {
    const secret = secretFor(node.content, node.secret);
    if (Object.keys(secret).length > 0) secrets[node.key] = secret;
  }
  return secrets;
}

export function toFloor(node: DraftNode): NetFloor {
  const { key, floor, branch, content, blackIceKey, dv, description } = node;
  return { key, floor, branch, content, blackIceKey, dv, description };
}

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

export function parseDraft(value: unknown): ArchDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const { name, nodes, forks } = value as Record<string, unknown>;
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
      secret: secretFor(content as NetFloorContent, parseNodeSecret(n["secret"]) ?? {}),
    });
  }
  return { name, nodes: sorted(parsed), forks: parseForks(forks) };
}
