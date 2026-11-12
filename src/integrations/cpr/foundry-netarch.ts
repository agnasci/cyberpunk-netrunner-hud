import { MODULE_ID } from "../../constants";
import { type NetArchitecture, type NetFloor, parseForks } from "../../domain/net-architecture";
import { normalizeNetArch, toCprFloors } from "./netarch-adapter";
import { type NodeSecrets, parseSecretList, secretList } from "../../domain/node-secrets";

export function listWorldNetArchs(): Array<{ uuid: string; name: string }> {
  return game.items.contents
    .filter((item) => item.type === "netarch")
    .map((item) => ({ uuid: item.uuid, name: item.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

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
  if (issues.length > 0) console.warn(`${MODULE_ID} | NetArch com problemas`, issues);
  return architecture
    ? { ...architecture, forks: readForks(item.uuid), secrets: readSecrets(item.uuid) }
    : null;
}

type LinkFlag = "ice" | "npcs";

export function readSecrets(itemUuid: string): NodeSecrets {
  return parseSecretList(netArchItem(itemUuid)?.flags?.[MODULE_ID]?.secrets);
}

export function readForks(itemUuid: string): Record<string, string> {
  return parseForks(netArchItem(itemUuid)?.flags?.[MODULE_ID]?.forks);
}

function forksUpdate(
  current: Record<string, string>,
  next: Record<string, string>,
): Record<string, unknown> {
  const path = `flags.${MODULE_ID}.forks`;
  const data: Record<string, unknown> = {};
  for (const branch of Object.keys(current)) {
    if (!(branch in next)) data[`${path}.-=${branch}`] = null;
  }
  for (const [branch, parent] of Object.entries(next)) data[`${path}.${branch}`] = parent;
  return data;
}

interface WritableItem {
  documentName?: string;
  uuid: string;
  flags?: Record<
    string,
    Partial<Record<LinkFlag | "forks" | "secrets" | "editorId", unknown>> | undefined
  >;
  update(data: Record<string, unknown>): Promise<unknown>;
}

function netArchItem(itemUuid: string): WritableItem | null {
  const doc = fromUuidSync(itemUuid) as WritableItem | null;
  return doc && doc.documentName === "Item" ? doc : null;
}

export function readLinkFlag(itemUuid: string, flag: LinkFlag): Record<number, string> {
  const raw = netArchItem(itemUuid)?.flags?.[MODULE_ID]?.[flag];
  const links: Record<number, string> = {};
  if (typeof raw !== "object" || raw === null) return links;
  for (const [key, uuid] of Object.entries(raw)) {
    const k = Number(key);
    if (Number.isInteger(k) && k >= 0 && typeof uuid === "string" && uuid !== "") links[k] = uuid;
  }
  return links;
}

function linkUpdate(
  flag: LinkFlag,
  current: Record<number, string>,
  next: Record<number, string>,
): Record<string, unknown> {
  const path = `flags.${MODULE_ID}.${flag}`;
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(current)) {
    if (!(Number(key) in next)) data[`${path}.-=${key}`] = null;
  }
  for (const [key, uuid] of Object.entries(next)) data[`${path}.${key}`] = uuid;
  return data;
}

export interface NetArchWrite {
  name: string;
  floors: NetFloor[];
  ice: Record<number, string>;
  npcs: Record<number, string>;
  forks: Record<string, string>;
  secrets: NodeSecrets;
}

interface CreatableClass {
  create(data: Record<string, unknown>): Promise<unknown>;
}

export async function saveNetArch(itemUuid: string | null, data: NetArchWrite): Promise<string> {
  const floors = toCprFloors(data.floors);
  if (itemUuid) {
    const item = netArchItem(itemUuid);
    if (!item) throw new Error(`NET Architecture não encontrada: ${itemUuid}`);
    await item.update({
      name: data.name,
      "system.floors": floors,
      ...linkUpdate("ice", readLinkFlag(itemUuid, "ice"), data.ice),
      ...linkUpdate("npcs", readLinkFlag(itemUuid, "npcs"), data.npcs),
      ...forksUpdate(readForks(itemUuid), data.forks),
      [`flags.${MODULE_ID}.secrets`]: secretList(data.secrets),
    });
    return itemUuid;
  }
  const config = (
    globalThis as unknown as { CONFIG: Record<string, { documentClass: CreatableClass }> }
  ).CONFIG;
  const Item = config["Item"]?.documentClass;
  if (!Item) throw new Error("Classe de documento indisponível: Item");
  const editorId = foundry.utils.randomID(16);
  await Item.create({
    name: data.name,
    type: "netarch",
    system: { floors },
    flags: {
      [MODULE_ID]: {
        editorId,
        ice: data.ice,
        npcs: data.npcs,
        forks: data.forks,
        secrets: secretList(data.secrets),
      },
    },
  });
  for (let i = 0; i < 30; i += 1) {
    const created = game.items.contents.find(
      (it) => (it as unknown as WritableItem).flags?.[MODULE_ID]?.editorId === editorId,
    );
    if (created) return created.uuid;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("NET Architecture criada não apareceu no mundo");
}
