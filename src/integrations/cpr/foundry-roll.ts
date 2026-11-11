import type { RollEvidence } from "../../session/requests";
import type { AbilityCheck } from "../../session/session-state";

/**
 * Rolagens nativas do CPR v0.92.4 (E3-02b/c, D23). Verificado em 2026-11-10:
 * `actor.sheet._onRoll` com um evento cujo `currentTarget` traz os `data-*` do botão
 * da ficha executa o fluxo nativo (diálogo, Sorte, modificadores) e cria a
 * ChatMessage do card depois de retornar. O total fica em `.d10-number-div span`;
 * a mensagem não tem `rolls`. Vale para a ficha da Netrunner (`interfaceAbility`) e
 * para a do Black ICE (`stat` com `data-roll-title` = def/per/atk).
 */
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

/** Rolagem de Interface da Netrunner no cliente atual; `null` = cancelada/indisponível. */
export async function rollInterfaceAbility(
  actorUuid: string,
  ability: InterfaceRoll,
  skipDialog = false,
): Promise<string | null> {
  const actor = fromUuidSync(actorUuid) as RollableActor | null;
  if (!actor) return null;
  const deck = Array.from(actor.items).find(
    (item) =>
      item.type === "cyberdeck" &&
      (item.system as { equipped?: unknown } | null)?.equipped === "equipped",
  );
  if (!deck) return null;
  return rollFromSheet(
    actor,
    { rollType: "interfaceAbility", interfaceAbility: ability, cyberdeckId: deck.id },
    skipDialog,
  );
}

/** Ataque ou dano de um programa instalado, pela ficha da Netrunner (E6-05). */
export async function rollProgram(
  actorUuid: string,
  programId: string,
  executionType: "atk" | "damage",
  skipDialog = false,
): Promise<string | null> {
  const actor = fromUuidSync(actorUuid) as RollableActor | null;
  if (!actor) return null;
  const deck = Array.from(actor.items).find(
    (item) =>
      item.type === "cyberdeck" &&
      (item.system as { equipped?: unknown } | null)?.equipped === "equipped",
  );
  if (!deck) return null;
  return rollFromSheet(
    actor,
    { rollType: "cyberdeckProgram", programId, cyberdeckId: deck.id, executionType },
    skipDialog,
  );
}

/**
 * Rolagem de atributo na ficha do Black ICE (GM). `skipDialog` (E6-10, D35): o CPR pula o
 * diálogo com `ctrlKey`; fora de um clique o ajuste `invertRollCtrlFunction` não inverte.
 */
export async function rollIceStat(
  actorUuid: string,
  stat: IceStat,
  skipDialog = false,
): Promise<string | null> {
  const actor = fromUuidSync(actorUuid) as RollableActor | null;
  if (!actor) return null;
  return rollFromSheet(actor, { rollType: "stat", rollTitle: stat }, skipDialog);
}

/**
 * Dano do Zap (1d6, como `_createInterfaceRoll` do sistema). A rota nativa do dano
 * passa por `CPRChat`, que não é exportado; usa-se o Roll do core, que grava
 * fórmula e total na própria mensagem.
 */
export async function rollZapDamage(actorUuid: string, flavor: string): Promise<string | null> {
  const actor = fromUuidSync(actorUuid);
  if (!actor) return null;
  const message = await new Roll("1d6").toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
  });
  return message.id;
}

/** Dano do acerto do Black ICE pelo GM (E6-06): Roll do core com o ator Black ICE no speaker. */
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
    // A ficha só cria o card depois do diálogo; o tempo de espera começa ao voltar.
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

/** Lê, no cliente da autoridade, a evidência da rolagem pelo id da mensagem. */
export function readRollEvidence(messageId: string): RollEvidence | null {
  const message = game.messages.get(messageId);
  if (!message?.author || !message.speaker.actor) return null;
  const base = { authorId: message.author.id, actorUuid: `Actor.${message.speaker.actor}` };
  const [roll] = message.rolls;
  if (roll) return { ...base, total: roll.total, formula: roll.formula };
  const doc = new DOMParser().parseFromString(message.content, "text/html");
  // Cards de d10 trazem o total no span; o de dano de programa, em `data-total-damage`.
  const d10 = doc.querySelector(".d10-number-div span")?.textContent;
  const damage = doc.querySelector("[data-total-damage]")?.getAttribute("data-total-damage");
  const total = parseCardTotal(d10 ?? damage ?? "");
  return total === null ? null : { ...base, total, formula: null };
}

/** Total exibido no card: só inteiros (pode ser negativo em falha crítica). */
export function parseCardTotal(text: string): number | null {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null;
}
