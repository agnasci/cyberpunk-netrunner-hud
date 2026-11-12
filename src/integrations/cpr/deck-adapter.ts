import type {
  DeckItem,
  DeckLoadout,
  DeckProgram,
  DeckProgramMark,
  DeckUpgrade,
} from "../../domain/deck-config";
import type { CprActorSource } from "./character-adapter";

/**
 * Lê a carga de cyberdecks de um ator do CPR v0.92.4 (E7-02). Campos verificados em
 * `cyberdeck-datamodel.js`/`container-schema.js`: `system.equipped`, `system.installedItems`
 * (`list`, `slots`, `usedSlots`); programa: `class`, `size`, `isRezzed`, `rez`, `atk`, `def`.
 * `totalSlots` vem do método nativo (`availableInstallSlots` + `usedSlots`), que soma upgrades.
 */
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
        // Programa apagado deixa o id na lista (COMPATIBILITY): só ids que existem.
        installed: Array.isArray(list)
          ? list.filter((id): id is string => typeof id === "string" && ids.has(id))
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

function readInt(value: unknown, path: readonly string[]): number | null {
  const found = readPath(value, path);
  if (typeof found === "number") return Number.isInteger(found) ? found : null;
  if (typeof found === "string" && /^-?\d+$/.test(found.trim())) return Number(found.trim());
  return null;
}
