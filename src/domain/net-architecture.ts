import type { NodeSecret } from "./node-secrets";

export const FLOOR_CONTENTS = ["password", "file", "controlnode", "blackice"] as const;
export type NetFloorContent = (typeof FLOOR_CONTENTS)[number];

export const BRANCHES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const MAX_FLOOR = 18;
export const LOBBY_FLOORS = 2;

export type ForkMap = Readonly<Record<string, string>>;

export const BLACK_ICE_KEY_PREFIX = "CPR.netArchitecture.floor.options.blackIce.";

export interface NetFloor {
  key: number;
  floor: number;
  branch: string;
  content: NetFloorContent;
  blackIceKey: string | null;
  dv: number | null;
  description: string;
}

export interface NetArchitecture {
  itemUuid: string;
  name: string;
  floors: NetFloor[];
  forks?: ForkMap;
  secrets?: Readonly<Record<number, NodeSecret>>;
}

export interface PublicFloor {
  key: number;
  floor: number;
  branch: string;
  content: NetFloorContent;
  blackIceKey: string | null;
}

export function toPublicFloor(floor: NetFloor): PublicFloor {
  return {
    key: floor.key,
    floor: floor.floor,
    branch: floor.branch,
    content: floor.content,
    blackIceKey: floor.blackIceKey,
  };
}

export function parsePublicFloor(value: unknown): PublicFloor | null {
  if (typeof value !== "object" || value === null) return null;
  const { key, floor, branch, content, blackIceKey } = value as Record<string, unknown>;
  if (typeof key !== "number" || !Number.isInteger(key) || key < 0) return null;
  if (typeof floor !== "number" || !Number.isInteger(floor) || floor < 1 || floor > MAX_FLOOR) {
    return null;
  }
  if (typeof branch !== "string" || !(BRANCHES as readonly string[]).includes(branch)) return null;
  if (typeof content !== "string" || !(FLOOR_CONTENTS as readonly string[]).includes(content)) {
    return null;
  }
  const iceKey =
    typeof blackIceKey === "string" && blackIceKey.startsWith(BLACK_ICE_KEY_PREFIX)
      ? blackIceKey
      : null;
  return { key, floor, branch, content: content as NetFloorContent, blackIceKey: iceKey };
}

export interface NodePosition {
  floor: number;
  branch: string;
}

export function areLinked(
  a: NodePosition,
  b: NodePosition,
  nodes: readonly NodePosition[],
  forks: ForkMap = {},
): boolean {
  if (Math.abs(a.floor - b.floor) !== 1) return false;
  if (a.branch === b.branch) return true;
  const [upper, lower] = a.floor < b.floor ? [a, b] : [b, a];
  return startsBranch(lower, nodes) && forkParent(lower, nodes, forks) === upper.branch;
}

export function startsBranch(node: NodePosition, nodes: readonly NodePosition[]): boolean {
  return (
    node.branch !== "a" &&
    !nodes.some((n) => n.branch === node.branch && n.floor === node.floor - 1)
  );
}

export function forkOptions(first: NodePosition, nodes: readonly NodePosition[]): string[] {
  return [
    ...new Set(
      nodes
        .filter((n) => n.floor === first.floor - 1 && n.branch < first.branch)
        .map((n) => n.branch),
    ),
  ].sort();
}

export function forkParent(
  first: NodePosition,
  nodes: readonly NodePosition[],
  forks: ForkMap = {},
): string | null {
  const options = forkOptions(first, nodes);
  const chosen = forks[first.branch];
  if (chosen !== undefined && options.includes(chosen)) return chosen;
  return options.at(-1) ?? null;
}

export function inLobby(floor: number, branch: string): boolean {
  return branch !== "a" && floor <= LOBBY_FLOORS;
}

export function parseForks(value: unknown): Record<string, string> {
  const forks: Record<string, string> = {};
  if (typeof value !== "object" || value === null) return forks;
  const letters = BRANCHES as readonly string[];
  for (const [branch, parent] of Object.entries(value)) {
    if (letters.includes(branch) && typeof parent === "string" && letters.includes(parent)) {
      if (parent < branch) forks[branch] = parent;
    }
  }
  return forks;
}
