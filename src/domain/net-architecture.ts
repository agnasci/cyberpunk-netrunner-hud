/**
 * Arquitetura NET normalizada (E2-01). `NetFloor` é a visão completa, só do GM;
 * `PublicFloor` é o que pode ir ao estado público depois de revelado (D18).
 */
export const FLOOR_CONTENTS = ["password", "file", "controlnode", "blackice"] as const;
export type NetFloorContent = (typeof FLOOR_CONTENTS)[number];

export const BRANCHES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const MAX_FLOOR = 18;

/** Prefixo das chaves i18n de tipo de Black ICE no sistema (v0.92.4). */
export const BLACK_ICE_KEY_PREFIX = "CPR.netArchitecture.floor.options.blackIce.";

export interface NetFloor {
  /** `index` do sistema: estável e único na NetArch. */
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

/** Valida um nó público; campos extras (ex.: DV) são descartados. */
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

/** Posição de um nó na grade (andar × branch), suficiente para os caminhos. */
export interface NodePosition {
  floor: number;
  branch: string;
}

/**
 * Caminhos entre nós (D28), como a cena gerada pelo CPR v0.92.4 desenha: andares
 * consecutivos da mesma branch se ligam; o primeiro andar F de uma branch liga-se ao
 * andar F−1 da branch anterior (letra anterior com nó nesse andar, a mais próxima).
 * `nodes` são os nós conhecidos por quem pergunta (todos para o GM; revelados para os demais).
 */
export function areLinked(
  a: NodePosition,
  b: NodePosition,
  nodes: readonly NodePosition[],
): boolean {
  if (Math.abs(a.floor - b.floor) !== 1) return false;
  if (a.branch === b.branch) return true;
  const [upper, lower] = a.floor < b.floor ? [a, b] : [b, a];
  const branchStartsHere = !nodes.some(
    (n) => n.branch === lower.branch && n.floor === lower.floor - 1,
  );
  return branchStartsHere && forkParentBranch(lower, nodes) === upper.branch;
}

/** Branch de onde `first` (primeiro andar de sua branch) se ramifica. */
function forkParentBranch(first: NodePosition, nodes: readonly NodePosition[]): string | null {
  const candidates = nodes
    .filter((n) => n.floor === first.floor - 1 && n.branch < first.branch)
    .map((n) => n.branch)
    .sort();
  return candidates.at(-1) ?? null;
}
