import type {
  DeckItem,
  DeckLoadout,
  DeckProgram,
  DeckProgramMark,
  DeckUpgrade,
} from "../../domain/deck-config";
import { type CprActorSource, readInt, readPath, readString } from "./character-adapter";

export function normalizeLoadout(
  source: CprActorSource,
  totalSlots: (deckId: string) => number | null,
): DeckLoadout {
  const decks: DeckItem[] = [];
  const programs: DeckProgram[] = [];
  const upgrades: DeckUpgrade[] = [];
  const ids = new Set(source.items.map((i) => i.id));
  for (const item of source.items) {
    if (item.type === "cyberdeck") {
      const installed = readPath(item.system, ["installedItems"]);
      const list = readPath(installed, ["list"]);
      const usedSlots = readInt(installed, ["usedSlots"]) ?? 0;
      const slots = totalSlots(item.id) ?? readInt(installed, ["slots"]) ?? 0;
      decks.push({
        itemId: item.id,
        name: item.name,
        equipped: readPath(item.system, ["equipped"]) === "equipped",
        slots,
        usedSlots,
        installed: Array.isArray(list)
          ? [...new Set(list)].filter((id): id is string => typeof id === "string" && ids.has(id))
          : [],
      });
    } else if (item.type === "program") {
      const mark: DeckProgramMark =
        item.programState === "destroyed"
          ? "destroyed"
          : item.programState === "neutralized"
            ? "neutralized"
            : "none";
      programs.push({
        itemId: item.id,
        name: item.name,
        programClass: readString(item.system, ["class"]) ?? "",
        size: readInt(item.system, ["size"]) ?? 1,
        rezzed: readPath(item.system, ["isRezzed"]) === true,
        rez: {
          value: readInt(item.system, ["rez", "value"]) ?? 0,
          max: readInt(item.system, ["rez", "max"]) ?? 0,
        },
        atk: readInt(item.system, ["atk"]) ?? 0,
        def: readInt(item.system, ["def"]) ?? 0,
        mark,
      });
    } else if (item.type === "itemUpgrade") {
      upgrades.push({
        itemId: item.id,
        name: item.name,
        size: readInt(item.system, ["size"]) ?? 0,
      });
    }
  }
  return { decks, programs, upgrades };
}
