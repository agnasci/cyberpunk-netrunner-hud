import type {
  CharacterSnapshot,
  CyberdeckSnapshot,
  NetRoleSnapshot,
  ProgramSnapshot,
  SnapshotIssue,
} from "../../domain/character";

/**
 * Dados planos de um ator do Cyberpunk RED – CORE v0.92.4. `system` fica como
 * `unknown`: cada campo lido é validado aqui, o único lugar que conhece os
 * caminhos internos do sistema (ver docs/COMPATIBILITY.md).
 */
export interface CprItemSource {
  id: string;
  name: string;
  type: string;
  system: unknown;
  /** Marca do módulo no programa (D40): neutralizado ou destruído. */
  programState?: unknown;
}

export interface CprActorSource {
  uuid: string;
  name: string;
  type: string;
  system: unknown;
  items: readonly CprItemSource[];
}

export function normalizeCharacter(source: CprActorSource): CharacterSnapshot {
  const issues: SnapshotIssue[] = [];
  const netRole = readNetRole(source, issues);
  const cyberdeckItem = readEquippedCyberdeck(source, issues);
  const cyberdeck: CyberdeckSnapshot | null = cyberdeckItem
    ? { itemId: cyberdeckItem.id, name: cyberdeckItem.name }
    : null;
  const programs = cyberdeckItem ? readInstalledPrograms(source, cyberdeckItem, issues) : [];

  return {
    actorUuid: source.uuid,
    actorName: source.name,
    actorType: source.type,
    netRole,
    cyberdeck,
    programs,
    issues,
  };
}

/** `system.roleInfo.activeNetRole` aponta para o item `role` usado no Netrunning. */
function readNetRole(source: CprActorSource, issues: SnapshotIssue[]): NetRoleSnapshot | null {
  const roleId = readString(source.system, ["roleInfo", "activeNetRole"]);
  const item = roleId ? source.items.find((i) => i.type === "role" && i.id === roleId) : undefined;
  if (!item) {
    issues.push({ code: "no-net-role" });
    return null;
  }
  const rank = readInt(item.system, ["rank"]);
  if (rank === null) {
    issues.push({ code: "invalid-item-data", itemId: item.id, field: "rank" });
    return null;
  }
  return { itemId: item.id, abilityName: readString(item.system, ["mainRoleAbility"]) ?? "", rank };
}

/** Igual a `CPRActor#getEquippedCyberdeck`: o primeiro cyberdeck equipado. */
function readEquippedCyberdeck(
  source: CprActorSource,
  issues: SnapshotIssue[],
): CprItemSource | null {
  const equipped = source.items.filter(
    (i) => i.type === "cyberdeck" && readString(i.system, ["equipped"]) === "equipped",
  );
  if (equipped.length === 0) {
    issues.push({ code: "no-equipped-cyberdeck" });
    return null;
  }
  if (equipped.length > 1) {
    issues.push({ code: "multiple-equipped-cyberdecks", itemIds: equipped.map((i) => i.id) });
  }
  return equipped[0] ?? null;
}

/** Igual a `getInstalledItems("program")`: ids da lista resolvidos em itens do ator. */
function readInstalledPrograms(
  source: CprActorSource,
  deck: CprItemSource,
  issues: SnapshotIssue[],
): ProgramSnapshot[] {
  const list = readPath(deck.system, ["installedItems", "list"]);
  if (!Array.isArray(list)) {
    issues.push({ code: "invalid-item-data", itemId: deck.id, field: "installedItems.list" });
    return [];
  }
  const programs: ProgramSnapshot[] = [];
  for (const id of list) {
    if (typeof id !== "string") continue;
    const item = source.items.find((i) => i.id === id);
    if (!item) {
      issues.push({ code: "missing-installed-item", itemId: id });
      continue;
    }
    if (item.type !== "program") continue;
    const program = readProgram(item, issues);
    if (program) programs.push(program);
  }
  return programs;
}

function readProgram(item: CprItemSource, issues: SnapshotIssue[]): ProgramSnapshot | null {
  const rezValue = readInt(item.system, ["rez", "value"]);
  const rezMax = readInt(item.system, ["rez", "max"]);
  if (rezValue === null || rezMax === null) {
    issues.push({ code: "invalid-item-data", itemId: item.id, field: "rez" });
    return null;
  }
  const stats = {
    atk: readInt(item.system, ["atk"]) ?? 0,
    def: readInt(item.system, ["def"]) ?? 0,
    per: readInt(item.system, ["per"]) ?? 0,
    spd: readInt(item.system, ["spd"]) ?? 0,
  };
  const isRezzed = readPath(item.system, ["isRezzed"]) === true;
  const mark = item.programState;
  const status =
    mark === "destroyed"
      ? "destroyed"
      : mark === "neutralized"
        ? "neutralized"
        : isRezzed
          ? "rezzed"
          : "stored";
  return {
    itemId: item.id,
    name: item.name,
    programClass: readString(item.system, ["class"]) ?? "",
    status,
    rez: { value: rezValue, max: rezMax },
    stats,
  };
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readString(value: unknown, path: readonly string[]): string | null {
  const found = readPath(value, path);
  return typeof found === "string" && found !== "" ? found : null;
}

/** Inteiro ou texto inteiro (o sistema usa `parseInt` em `rank`). */
function readInt(value: unknown, path: readonly string[]): number | null {
  const found = readPath(value, path);
  if (typeof found === "number") return Number.isInteger(found) ? found : null;
  if (typeof found === "string" && /^-?\d+$/.test(found.trim())) return Number(found.trim());
  return null;
}
