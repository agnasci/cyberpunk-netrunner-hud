import { MODULE_ID } from "../../constants";
import type { CharacterSnapshot } from "../../domain/character";
import type { RunnerVitals } from "../../domain/ice-hit";
import type { SheetEffect } from "../../session/requests";
import { type CprActorSource, normalizeCharacter } from "./character-adapter";

export function toActorSource(actor: FoundryActor): CprActorSource {
  return {
    uuid: actor.uuid,
    name: actor.name,
    type: actor.type,
    system: actor.system,
    items: Array.from(actor.items, (item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      system: item.system,
      programState: (item as { flags?: Record<string, Record<string, unknown> | undefined> })
        .flags?.[MODULE_ID]?.["programState"],
    })),
  };
}

export function readCharacterSnapshot(actorUuid: string): CharacterSnapshot | null {
  const doc = fromUuidSync(actorUuid);
  if (!isActor(doc)) return null;
  return normalizeCharacter(toActorSource(doc));
}

function isActor(doc: unknown): doc is FoundryActor {
  return (
    typeof doc === "object" &&
    doc !== null &&
    (doc as { documentName?: unknown }).documentName === "Actor"
  );
}

export function readRunnerVitals(actorUuid: string): RunnerVitals | null {
  const doc = fromUuidSync(actorUuid);
  if (!isActor(doc)) return null;
  const hp = Number(
    (doc.system as { derivedStats?: { hp?: { value?: unknown } } } | null)?.derivedStats?.hp?.value,
  );
  if (!Number.isInteger(hp)) return null;
  const reduction = Number(
    (doc as { bonuses?: { brainDamageReduction?: unknown } }).bonuses?.brainDamageReduction,
  );
  return { hp, brainDamageReduction: Number.isFinite(reduction) ? reduction : 0 };
}

export async function applyRunnerHpEffect(
  effect: Extract<SheetEffect, { type: "setRunnerHp" }>,
): Promise<void> {
  const doc = fromUuidSync(effect.actorUuid) as
    (FoundryActor & { update(data: Record<string, unknown>): Promise<unknown> }) | null;
  if (!isActor(doc)) throw new Error(`Ator não encontrado: ${effect.actorUuid}`);
  const current = Number(
    (doc.system as { derivedStats?: { hp?: { value?: unknown } } } | null)?.derivedStats?.hp?.value,
  );
  if (current === effect.value) return;
  await doc.update({ "system.derivedStats.hp.value": effect.value });
}
