import type { DeckLoadout, EquipPlan, ProgramStatePlan } from "../../domain/deck-config";
import { normalizeLoadout } from "./deck-adapter";
import { toActorSource } from "./foundry-actor";
import { applyProgramEffect } from "./foundry-program";

/**
 * Gravação do cyberdeck pela janela do deck (E7-02, D43), com as funções nativas do CPR v0.92.4
 * (`item/mixins/cpr-container.js`): `installItems` confere tipo e slots e grava a lista;
 * `uninstallItems` tira da lista, recalcula os slots e derrezza o programa
 * (`cyberdeck.uninstallPrograms`). Roda no cliente da dona do ator: o servidor valida a posse.
 */
type DeckUser = NonNullable<typeof game.user>;

interface NativeItem {
  readonly id: string;
  readonly type: string;
  readonly system: unknown;
  availableInstallSlots?: () => number;
  installItems?: (items: NativeItem[]) => Promise<boolean>;
  uninstallItems?: (items: NativeItem[]) => Promise<unknown>;
}

interface NativeActor {
  readonly documentName?: string;
  readonly type: string;
  readonly items: Iterable<NativeItem>;
  updateEmbeddedDocuments(type: "Item", updates: Record<string, unknown>[]): Promise<unknown>;
  testUserPermission(user: DeckUser, level: "OWNER" | "OBSERVER"): boolean;
}

function actorOf(actorUuid: string): NativeActor | null {
  const doc = fromUuidSync(actorUuid) as NativeActor | null;
  return doc?.documentName === "Actor" ? doc : null;
}

function itemOf(actor: NativeActor, id: string): NativeItem | null {
  return Array.from(actor.items).find((i) => i.id === id) ?? null;
}

export function readDeckLoadout(actorUuid: string): DeckLoadout | null {
  const actor = actorOf(actorUuid);
  if (!actor) return null;
  return normalizeLoadout(toActorSource(actor as unknown as FoundryActor), (deckId) => {
    const deck = itemOf(actor, deckId);
    if (typeof deck?.availableInstallSlots !== "function") return null;
    const used = Number(
      (deck.system as { installedItems?: { usedSlots?: unknown } } | null)?.installedItems
        ?.usedSlots,
    );
    const free = Number(deck.availableInstallSlots());
    return Number.isFinite(free) && Number.isFinite(used) ? free + used : null;
  });
}

function pair(actorUuid: string, deckId: string, programId: string) {
  const actor = actorOf(actorUuid);
  const deck = actor ? itemOf(actor, deckId) : null;
  const program = actor ? itemOf(actor, programId) : null;
  if (!deck || deck.type !== "cyberdeck" || !program || program.type !== "program") {
    throw new Error(`Deck ou programa não encontrado: ${deckId}/${programId}`);
  }
  return { deck, program };
}

export async function installProgram(
  actorUuid: string,
  deckId: string,
  programId: string,
): Promise<boolean> {
  const { deck, program } = pair(actorUuid, deckId, programId);
  if (typeof deck.installItems !== "function") throw new Error("installItems ausente");
  return deck.installItems([program]);
}

export async function uninstallProgram(
  actorUuid: string,
  deckId: string,
  programId: string,
): Promise<void> {
  const { deck, program } = pair(actorUuid, deckId, programId);
  if (typeof deck.uninstallItems !== "function") throw new Error("uninstallItems ausente");
  await deck.uninstallItems([program]);
}

/** Rezzar/derrezzar fora da invasão: o mesmo estado absoluto da sessão (D40). */
export async function setDeckProgramState(
  actorUuid: string,
  programId: string,
  state: ProgramStatePlan,
): Promise<void> {
  await applyProgramEffect({
    type: "setProgramState",
    actorUuid,
    programId,
    state,
    before: state,
  });
}

/** Equipar: `system.equipped` dos decks e derrezzar o que estava ligado nos outros. */
export async function equipDeck(actorUuid: string, plan: EquipPlan): Promise<void> {
  const actor = actorOf(actorUuid);
  if (!actor) throw new Error(`Ator não encontrado: ${actorUuid}`);
  await actor.updateEmbeddedDocuments("Item", [
    ...plan.decks.map((d) => ({ _id: d.itemId, "system.equipped": d.equipped })),
    ...plan.derez.map((id) => ({ _id: id, "system.isRezzed": false })),
  ]);
}

export interface DeckActorChoice {
  uuid: string;
  name: string;
}

function hasCyberdeck(actor: { items: Iterable<{ type: string }> }): boolean {
  return Array.from(actor.items).some((i) => i.type === "cyberdeck");
}

/** Atores com cyberdeck de que o usuário é dono (o mestre vê todos os personagens e mooks). */
export function listDeckActors(user: DeckUser | null): DeckActorChoice[] {
  if (!user) return [];
  return game.actors.contents
    .filter((a) => a.type === "character" || a.type === "mook")
    .filter((a) => hasCyberdeck(a))
    .filter((a) => a.testUserPermission(user, "OWNER"))
    .map((a) => ({ uuid: a.uuid, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** O ator tem cyberdeck e o usuário é dono (botão no cabeçalho da ficha). */
export function canOpenDeck(actorUuid: string, user: DeckUser | null): boolean {
  const actor = actorOf(actorUuid);
  return !!actor && !!user && hasCyberdeck(actor) && actor.testUserPermission(user, "OWNER");
}
