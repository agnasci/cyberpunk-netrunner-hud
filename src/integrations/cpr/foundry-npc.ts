import { MODULE_ID } from "../../constants";

/**
 * Netrunner NPC inimiga (E6-11b, D37). O vínculo nó↔NPC fica na flag do item de NET
 * Architecture (`flags.<módulo>.npcs.<chave>` = uuid do ator): só o GM lê e grava, e a
 * autoridade só o publica quando a jogadora chega ao nó.
 */
interface FlaggedItem {
  documentName?: string;
  flags?: Record<string, { npcs?: Record<string, unknown> } | undefined>;
  update(data: Record<string, unknown>): Promise<unknown>;
}

function netArchItem(itemUuid: string): FlaggedItem | null {
  const doc = fromUuidSync(itemUuid) as FlaggedItem | null;
  return doc && doc.documentName === "Item" ? doc : null;
}

/** Vínculos do item, por chave de nó. */
export function listNpcLinks(itemUuid: string): Record<number, string> {
  const raw = netArchItem(itemUuid)?.flags?.[MODULE_ID]?.npcs ?? {};
  const links: Record<number, string> = {};
  for (const [key, uuid] of Object.entries(raw)) {
    const k = Number(key);
    if (Number.isInteger(k) && k >= 0 && typeof uuid === "string" && uuid !== "") links[k] = uuid;
  }
  return links;
}

export function readNpcLink(itemUuid: string, key: number): string | null {
  return listNpcLinks(itemUuid)[key] ?? null;
}

/** Só o GM: vincula (ou remove, com `null`) a NPC do nó. */
export async function setNpcLink(
  itemUuid: string,
  key: number,
  actorUuid: string | null,
): Promise<void> {
  const item = netArchItem(itemUuid);
  if (!item) throw new Error(`NET Architecture não encontrada: ${itemUuid}`);
  const path = `flags.${MODULE_ID}.npcs`;
  await item.update(actorUuid ? { [`${path}.${key}`]: actorUuid } : { [`${path}.-=${key}`]: null });
}

interface ActorLike {
  uuid: string;
  name: string;
  type: string;
  system?: { stats?: { ref?: { value?: unknown } } };
  items: Iterable<{ type: string; system?: { equipped?: unknown } }>;
}

/**
 * Atores que podem ser Netrunner NPC: personagem ou mook sem dono jogador (nenhum usuário não-GM
 * com permissão de dono, como no diálogo de início) e com cyberdeck equipado.
 */
export function listWorldNetrunners(excludeUuid: string): Array<{ uuid: string; name: string }> {
  const players = game.users.contents.filter((u) => !u.isGM);
  return game.actors.contents
    .filter((a) => !players.some((u) => a.testUserPermission(u, "OWNER")))
    .map((a) => a as unknown as ActorLike)
    .filter((a) => (a.type === "character" || a.type === "mook") && a.uuid !== excludeUuid)
    .filter((a) =>
      Array.from(a.items).some((i) => i.type === "cyberdeck" && i.system?.equipped === "equipped"),
    )
    .map((a) => ({ uuid: a.uuid, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** REF do ator (iniciativa do CPR: `1d10 + @stats.ref.value`). */
export function readActorRef(actorUuid: string): number | null {
  const actor = fromUuidSync(actorUuid) as ActorLike | null;
  const ref = Number(actor?.system?.stats?.ref?.value);
  return Number.isInteger(ref) ? ref : null;
}

/** Iniciativa 1d10 + REF pelo Roll do core, com o ator no speaker (fórmula na mensagem). */
export async function rollInitiative(actorUuid: string, flavor: string): Promise<string | null> {
  const actor = fromUuidSync(actorUuid);
  const ref = readActorRef(actorUuid);
  if (!actor || ref === null) return null;
  const message = await new Roll(`1d10 + ${ref}`).toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
  });
  return message.id;
}

/** HP atual e máximo (`system.derivedStats.hp`, CPR v0.92.4) para o painel do encontro. */
export function readActorHp(actorUuid: string): { value: number; max: number } | null {
  const actor = fromUuidSync(actorUuid) as {
    system?: { derivedStats?: { hp?: { value?: unknown; max?: unknown } } };
  } | null;
  const hp = actor?.system?.derivedStats?.hp;
  const value = Number(hp?.value);
  const max = Number(hp?.max);
  return Number.isInteger(value) && Number.isInteger(max) ? { value, max } : null;
}

/** Move o vínculo (efeito `moveNpcLink`, D26): absoluto, reaplicar não duplica. */
export async function applyNpcMoveEffect(effect: {
  itemUuid: string;
  actorUuid: string;
  from: number;
  to: number;
}): Promise<void> {
  const item = netArchItem(effect.itemUuid);
  if (!item) throw new Error(`NET Architecture não encontrada: ${effect.itemUuid}`);
  const links = listNpcLinks(effect.itemUuid);
  if (links[effect.to] === effect.actorUuid && links[effect.from] === undefined) return;
  const path = `flags.${MODULE_ID}.npcs`;
  await item.update({
    [`${path}.${effect.to}`]: effect.actorUuid,
    [`${path}.-=${effect.from}`]: null,
  });
}

/** Nome do ator vinculado (mesmo que ele não entre mais na lista de escolhas). */
export function readActorName(actorUuid: string): string | null {
  const doc = fromUuidSync(actorUuid) as { documentName?: string; name?: unknown } | null;
  return doc?.documentName === "Actor" && typeof doc.name === "string" ? doc.name : null;
}
