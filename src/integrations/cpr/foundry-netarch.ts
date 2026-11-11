import type { NetArchitecture } from "../../domain/net-architecture";
import { normalizeNetArch } from "./netarch-adapter";

/** NetArchs do mundo disponíveis para iniciar uma sessão. */
export function listWorldNetArchs(): Array<{ uuid: string; name: string }> {
  return game.items.contents
    .filter((item) => item.type === "netarch")
    .map((item) => ({ uuid: item.uuid, name: item.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Lê a arquitetura completa (uso do GM); `null` se o item não existir. */
export function readNetArchitecture(itemUuid: string): NetArchitecture | null {
  const doc = fromUuidSync(itemUuid);
  if (typeof doc !== "object" || doc === null) return null;
  const item = doc as Partial<FoundryWorldItem>;
  if (item.documentName !== "Item" || typeof item.uuid !== "string") return null;
  const { architecture, issues } = normalizeNetArch({
    uuid: item.uuid,
    name: item.name ?? "",
    type: item.type ?? "",
    system: item.system,
  });
  if (issues.length > 0) console.warn("cyberpunk-netrunner-hud | NetArch com problemas", issues);
  return architecture;
}
