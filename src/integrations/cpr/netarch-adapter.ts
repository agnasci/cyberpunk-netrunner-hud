import {
  BLACK_ICE_KEY_PREFIX,
  BRANCHES,
  MAX_FLOOR,
  type NetArchitecture,
  type NetFloor,
  type NetFloorContent,
} from "../../domain/net-architecture";

/** Dados planos de um item `netarch` do CPR CORE v0.92.4 (ver COMPATIBILITY.md). */
export interface CprNetArchSource {
  uuid: string;
  name: string;
  type: string;
  system: unknown;
}

export type NetArchIssue =
  | { code: "not-netarch" }
  | { code: "invalid-floor"; key: number | null; field: string }
  | { code: "duplicate-floor-key"; key: number };

/** Valores de `floors[].content` no sistema são chaves i18n. */
const CONTENT_BY_KEY: Record<string, NetFloorContent> = {
  "CPR.netArchitecture.floor.options.password": "password",
  "CPR.netArchitecture.floor.options.file": "file",
  "CPR.netArchitecture.floor.options.controlnode": "controlnode",
  "CPR.global.programClass.blackice": "blackice",
};

export function normalizeNetArch(source: CprNetArchSource): {
  architecture: NetArchitecture | null;
  issues: NetArchIssue[];
} {
  if (source.type !== "netarch") return { architecture: null, issues: [{ code: "not-netarch" }] };
  const issues: NetArchIssue[] = [];
  const raw = (source.system as { floors?: unknown } | null)?.floors;
  const floors: NetFloor[] = [];
  const seen = new Set<number>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    const floor = readFloor(entry, issues);
    if (!floor) continue;
    if (seen.has(floor.key)) {
      issues.push({ code: "duplicate-floor-key", key: floor.key });
      continue;
    }
    seen.add(floor.key);
    floors.push(floor);
  }
  floors.sort((a, b) => a.floor - b.floor || a.branch.localeCompare(b.branch));
  return { architecture: { itemUuid: source.uuid, name: source.name, floors }, issues };
}

function readFloor(entry: unknown, issues: NetArchIssue[]): NetFloor | null {
  if (typeof entry !== "object" || entry === null) {
    issues.push({ code: "invalid-floor", key: null, field: "entry" });
    return null;
  }
  const e = entry as Record<string, unknown>;
  const index = e["index"];
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    issues.push({ code: "invalid-floor", key: null, field: "index" });
    return null;
  }
  const key = index;
  const rawContent = e["content"];
  const content = typeof rawContent === "string" ? CONTENT_BY_KEY[rawContent] : undefined;
  if (!content) {
    issues.push({ code: "invalid-floor", key, field: "content" });
    return null;
  }
  const floorNo = Number(e["floor"]);
  if (!Number.isInteger(floorNo) || floorNo < 1 || floorNo > MAX_FLOOR) {
    issues.push({ code: "invalid-floor", key, field: "floor" });
    return null;
  }
  // O layout do sistema trata branch ausente como a primeira linha ("a").
  const rawBranch = e["branch"];
  const branch =
    rawBranch === undefined || rawBranch === null || rawBranch === "" ? "a" : rawBranch;
  if (typeof branch !== "string" || !(BRANCHES as readonly string[]).includes(branch)) {
    issues.push({ code: "invalid-floor", key, field: "branch" });
    return null;
  }
  const rawDv = e["dv"];
  const dvNumber = Number(rawDv);
  const dv =
    typeof rawDv === "string" && /^\d+$/.test(rawDv) && Number.isInteger(dvNumber)
      ? dvNumber
      : null;
  const ice = e["blackice"];
  const blackIceKey =
    content === "blackice" && typeof ice === "string" && ice.startsWith(BLACK_ICE_KEY_PREFIX)
      ? ice
      : null;
  const description = typeof e["description"] === "string" ? e["description"] : "";
  return { key, floor: floorNo, branch, content, blackIceKey, dv, description };
}
