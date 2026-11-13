import { areLinked, type ForkMap, type NetFloor } from "./net-architecture";

export const PATHFINDER_GATES = ["password", "anyDv"] as const;
export type PathfinderGate = (typeof PATHFINDER_GATES)[number];

export function isPathfinderGate(value: unknown): value is PathfinderGate {
  return (PATHFINDER_GATES as readonly unknown[]).includes(value);
}

export function pathfinderReveal(
  floors: readonly NetFloor[],
  fromKey: number,
  total: number,
  forks: ForkMap = {},
  mode: PathfinderGate = "password",
): number[] {
  const from = floors.find((f) => f.key === fromKey);
  if (!from || !Number.isFinite(total) || total < 1) return [];
  const limit = from.floor + Math.floor(total);
  const deeper = floors.filter((f) => f.floor > from.floor && f.floor <= limit);
  const hidden = new Set<number>();
  for (const gate of floors) {
    if (gate.dv === null || gate.key === from.key || gate.dv <= total) continue;
    if (mode === "password" && gate.content !== "password") continue;
    const below = descendants(floors, gate, forks);
    if (below.includes(from.key)) continue;
    for (const key of below) hidden.add(key);
  }
  return deeper
    .filter((f) => !hidden.has(f.key))
    .sort((a, b) => a.floor - b.floor || a.branch.localeCompare(b.branch))
    .map((f) => f.key);
}

function descendants(floors: readonly NetFloor[], root: NetFloor, forks: ForkMap): number[] {
  const found: number[] = [];
  let frontier: NetFloor[] = [root];
  while (frontier.length > 0) {
    const next: NetFloor[] = [];
    for (const node of frontier) {
      for (const child of floors) {
        if (child.floor !== node.floor + 1 || found.includes(child.key)) continue;
        if (!areLinked(node, child, floors, forks)) continue;
        found.push(child.key);
        next.push(child);
      }
    }
    frontier = next;
  }
  return found;
}
