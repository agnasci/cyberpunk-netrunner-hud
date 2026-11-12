import {
  areLinked,
  type NetArchitecture,
  type NodePosition,
  type NetFloorContent,
  type PublicFloor,
} from "../domain/net-architecture";
import { checkMove, type RuleContext } from "../domain/net-rules";
import type { MappedFloor, PublicRun, ViewerRole } from "./session-state";

const CLEARABLE: ReadonlySet<NetFloorContent> = new Set([
  "password",
  "controlnode",
  "blackice",
  "file",
]);

export interface ArchitectureProgress {
  run: PublicRun;
  rules: RuleContext | null;
}

interface NodeBase {
  key: number;
  floor: number;
  branch: string;
  content: NetFloorContent | "unknown";
  masked: boolean;
  blackIceKey: string | null;
  isCurrent: boolean;
  movable: boolean;
  state: "cleared" | "evaded" | null;
  clearable: boolean;
}

export type ArchitectureNodeView =
  | (NodeBase & { revealed: true })
  | (NodeBase & { revealed: boolean; dv: number | null; description: string });

export interface LinkCell {
  down: boolean;
  forkIn: boolean;
  forkOut: boolean;
  forkPass: boolean;
}

export interface ArchitectureRow {
  floor: number;
  cells: Array<ArchitectureNodeView | null>;
  linksAbove: LinkCell[];
}

export interface ArchitectureView {
  columns: string[];
  rows: ArchitectureRow[];
  showUnexplored: boolean;
  canReveal: boolean;
  itemMissing: boolean;
}

export function buildArchitectureView(
  full: NetArchitecture | null,
  discovered: readonly PublicFloor[],
  role: ViewerRole,
  runnerPosition: number | null = null,
  progress: ArchitectureProgress | null = null,
  mapped: readonly MappedFloor[] = [],
): ArchitectureView {
  const isGm = role === "gm";
  const byKey = new Map(discovered.map((f) => [f.key, f]));
  const mappedKeys = new Set(mapped.map((m) => m.key));
  const rules = role === "netrunner" ? (progress?.rules ?? null) : null;
  const flags = (key: number, content: NetFloorContent | "unknown") => {
    const known = byKey.get(key);
    const position = known ?? mapped.find((m) => m.key === key);
    const state = progress?.run.cleared.includes(key)
      ? ("cleared" as const)
      : progress?.run.evaded.includes(key)
        ? ("evaded" as const)
        : null;
    return {
      isCurrent: runnerPosition !== null && key === runnerPosition,
      movable: rules !== null && position !== undefined && checkMove(rules, position).allowed,
      state,
      clearable: isGm && known !== undefined && content !== "unknown" && CLEARABLE.has(content),
      masked: mappedKeys.has(key),
    };
  };
  const nodes: ArchitectureNodeView[] =
    isGm && full
      ? full.floors.map((f) => ({
          key: f.key,
          floor: f.floor,
          branch: f.branch,
          content: f.content,
          blackIceKey: f.blackIceKey,
          revealed: byKey.has(f.key),
          ...flags(f.key, f.content),
          dv: f.dv,
          description: f.description,
        }))
      : [
          ...discovered.map((f) => ({
            key: f.key,
            floor: f.floor,
            branch: f.branch,
            content: f.content,
            blackIceKey: f.blackIceKey,
            revealed: true as const,
            ...flags(f.key, f.content),
          })),
          ...mapped.map((m) => ({
            key: m.key,
            floor: m.floor,
            branch: m.branch,
            content: "unknown" as const,
            blackIceKey: null,
            revealed: true as const,
            ...flags(m.key, "unknown"),
          })),
        ];

  const columns = [...new Set(nodes.map((n) => n.branch))].sort();
  const floors = [...new Set(nodes.map((n) => n.floor))].sort((a, b) => a - b);
  const grid = floors.map((floor) => ({
    floor,
    cells: columns.map(
      (branch) => nodes.find((n) => n.floor === floor && n.branch === branch) ?? null,
    ),
  }));
  const rows: ArchitectureRow[] = grid.map((row, i) => ({
    ...row,
    linksAbove: i === 0 ? [] : linksBetween(grid[i - 1]?.cells ?? [], row.cells, nodes),
  }));

  return {
    columns,
    rows,
    showUnexplored: !isGm && progress?.run.allKnown !== true,
    canReveal: isGm && full !== null,
    itemMissing: isGm && full === null,
  };
}

export function linksBetween(
  upper: ReadonlyArray<NodePosition | null>,
  lower: ReadonlyArray<NodePosition | null>,
  known: readonly NodePosition[],
): LinkCell[] {
  const links = lower.map(() => ({ down: false, forkIn: false, forkOut: false, forkPass: false }));
  lower.forEach((node, col) => {
    if (!node) return;
    const parentCol = upper.findIndex((up) => up !== null && areLinked(up, node, known));
    const link = links[col];
    if (parentCol < 0 || !link) return;
    if (parentCol === col) {
      link.down = true;
      return;
    }
    link.forkIn = true;
    const origin = links[parentCol];
    if (origin) origin.forkOut = true;
    for (let c = parentCol + 1; c < col; c++) {
      const pass = links[c];
      if (pass) pass.forkPass = true;
    }
  });
  return links;
}
