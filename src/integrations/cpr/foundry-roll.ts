import type { RollEvidence } from "../../session/requests";
import type { AbilityCheck } from "../../session/session-state";

const CARD_WAIT_MS = 5000;

interface CprSheet {
  _onRoll(event: Record<string, unknown>): Promise<unknown>;
}

interface RollableActor {
  readonly id: string;
  readonly items: Iterable<{ id: string; type: string; system: unknown }>;
  readonly sheet: unknown;
}

export type InterfaceRoll = AbilityCheck | "defense" | "speed";
export type IceStat = "def" | "per" | "atk" | "spd";

function equippedDeck(actor: RollableActor): { id: string } | undefined {
  return Array.from(actor.items).find(
    (item) =>
      item.type === "cyberdeck" &&
      (item.system as { equipped?: unknown } | null)?.equipped === "equipped",
  );
}

export async function rollInterfaceAbility(
  actorUuid: string,
  ability: InterfaceRoll,
  skipDialog = false,
): Promise<string | null> {
  const actor = fromUuidSync(actorUuid) as RollableActor | null;
  const deck = actor ? equippedDeck(actor) : undefined;
  if (!actor || !deck) return null;
  return rollFromSheet(
    actor,
    { rollType: "interfaceAbility", interfaceAbility: ability, cyberdeckId: deck.id },
    skipDialog,
  );
}

export async function rollProgram(
  actorUuid: string,
  programId: string,
  executionType: "atk" | "damage",
  skipDialog = false,
): Promise<string | null> {
  const actor = fromUuidSync(actorUuid) as RollableActor | null;
  const deck = actor ? equippedDeck(actor) : undefined;
  if (!actor || !deck) return null;
  return rollFromSheet(
    actor,
    { rollType: "cyberdeckProgram", programId, cyberdeckId: deck.id, executionType },
    skipDialog,
  );
}

export async function rollIceStat(
  actorUuid: string,
  stat: IceStat,
  skipDialog = false,
): Promise<string | null> {
  const actor = fromUuidSync(actorUuid) as RollableActor | null;
  if (!actor) return null;
  return rollFromSheet(actor, { rollType: "stat", rollTitle: stat }, skipDialog);
}

export async function rollZapDamage(actorUuid: string, flavor: string): Promise<string | null> {
  const actor = fromUuidSync(actorUuid);
  if (!actor) return null;
  const message = await new Roll("1d6").toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
  });
  return message.id;
}

export async function rollIceDamage(
  iceUuid: string,
  formula: string,
  flavor: string,
): Promise<string | null> {
  const actor = fromUuidSync(iceUuid);
  if (!actor || !Roll.validate(formula)) return null;
  const message = await new Roll(formula).toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
  });
  return message.id;
}

async function rollFromSheet(
  actor: RollableActor,
  dataset: Record<string, string>,
  skipDialog = false,
): Promise<string | null> {
  const sheet = actor.sheet as Partial<CprSheet> | undefined;
  if (typeof sheet?._onRoll !== "function") return null;
  const target = document.createElement("a");
  Object.assign(target.dataset, dataset);

  let hookId = 0;
  let resolveCard: (id: string | null) => void = () => undefined;
  const card = new Promise<string | null>((resolve) => {
    resolveCard = resolve;
    hookId = Hooks.on("createChatMessage", (message) => {
      if (message.author?.id === game.user?.id && message.speaker.actor === actor.id) {
        resolve(message.id);
      }
    });
  });
  try {
    await sheet._onRoll({
      currentTarget: target,
      type: skipDialog ? "auto" : "click",
      ctrlKey: skipDialog,
      metaKey: false,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    });
    const timer = setTimeout(() => resolveCard(null), CARD_WAIT_MS);
    const id = await card;
    clearTimeout(timer);
    return id;
  } finally {
    Hooks.off("createChatMessage", hookId);
  }
}

export function readRollEvidence(messageId: string): RollEvidence | null {
  const message = game.messages.get(messageId);
  if (!message?.author || !message.speaker.actor) return null;
  const base = { authorId: message.author.id, actorUuid: `Actor.${message.speaker.actor}` };
  const [roll] = message.rolls;
  if (roll) return { ...base, total: roll.total, formula: roll.formula };
  const doc = new DOMParser().parseFromString(message.content, "text/html");
  const d10 = doc.querySelector(".d10-number-div span")?.textContent;
  const damage = doc.querySelector("[data-total-damage]")?.getAttribute("data-total-damage");
  const total = parseCardTotal(d10 ?? damage ?? "");
  return total === null ? null : { ...base, total, formula: null };
}

export function parseCardTotal(text: string): number | null {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null;
}
