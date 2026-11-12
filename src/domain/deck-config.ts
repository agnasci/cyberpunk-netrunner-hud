import { ONE_COPY_PROGRAMS, programKey, REZZABLE_CLASSES } from "./net-rules";

export type DeckProgramMark = "none" | "neutralized" | "destroyed";

export interface DeckItem {
  itemId: string;
  name: string;
  equipped: boolean;
  slots: number;
  usedSlots: number;
  installed: string[];
}

export interface DeckProgram {
  itemId: string;
  name: string;
  programClass: string;
  size: number;
  rezzed: boolean;
  rez: { value: number; max: number };
  atk: number;
  def: number;
  mark: DeckProgramMark;
}

export interface DeckUpgrade {
  itemId: string;
  name: string;
  size: number;
}

export interface DeckLoadout {
  decks: DeckItem[];
  programs: DeckProgram[];
  upgrades: DeckUpgrade[];
}

export type DeckError =
  | "no-deck"
  | "no-program"
  | "already-installed"
  | "installed-elsewhere"
  | "no-slots"
  | "not-installed"
  | "not-rezzable"
  | "destroyed"
  | "deck-not-equipped"
  | "state"
  | "one-copy"
  | "already-equipped";

export type DeckCheck = { ok: true } | { ok: false; error: DeckError };

const ok: DeckCheck = { ok: true };
const fail = (error: DeckError): DeckCheck => ({ ok: false, error });

export interface ProgramStatePlan {
  rezzed: boolean;
  rezValue: number;
  mark: "none" | "neutralized" | "destroyed";
}

export function freeSlots(deck: DeckItem): number {
  return Math.max(0, deck.slots - deck.usedSlots);
}

export function deckOf(loadout: DeckLoadout, programId: string): DeckItem | null {
  return loadout.decks.find((d) => d.installed.includes(programId)) ?? null;
}

export function loosePrograms(loadout: DeckLoadout): DeckProgram[] {
  return loadout.programs.filter((p) => deckOf(loadout, p.itemId) === null);
}

export function equippedDeck(loadout: DeckLoadout): DeckItem | null {
  return loadout.decks.find((d) => d.equipped) ?? null;
}

export function checkInstall(loadout: DeckLoadout, deckId: string, programId: string): DeckCheck {
  const deck = loadout.decks.find((d) => d.itemId === deckId);
  if (!deck) return fail("no-deck");
  const program = loadout.programs.find((p) => p.itemId === programId);
  if (!program) return fail("no-program");
  if (deck.installed.includes(programId)) return fail("already-installed");
  if (deckOf(loadout, programId)) return fail("installed-elsewhere");
  if (program.size > freeSlots(deck)) return fail("no-slots");
  return ok;
}

export function checkUninstall(loadout: DeckLoadout, deckId: string, programId: string): DeckCheck {
  const deck = loadout.decks.find((d) => d.itemId === deckId);
  if (!deck) return fail("no-deck");
  if (!loadout.programs.some((p) => p.itemId === programId)) return fail("no-program");
  if (!deck.installed.includes(programId)) return fail("not-installed");
  return ok;
}

export function checkRez(loadout: DeckLoadout, programId: string, rez: boolean): DeckCheck {
  const program = loadout.programs.find((p) => p.itemId === programId);
  if (!program) return fail("no-program");
  const deck = deckOf(loadout, programId);
  if (!deck) return fail("not-installed");
  if (!REZZABLE_CLASSES.has(program.programClass)) return fail("not-rezzable");
  const running = program.rezzed || program.mark === "neutralized";
  if (!rez) return running ? ok : fail("state");
  if (program.mark === "destroyed") return fail("destroyed");
  if (!deck.equipped) return fail("deck-not-equipped");
  if (running) return fail("state");
  const key = programKey(program.name);
  if (ONE_COPY_PROGRAMS.has(key)) {
    const other = loadout.programs.some(
      (p) =>
        p.itemId !== programId &&
        p.rezzed &&
        programKey(p.name) === key &&
        deckOf(loadout, p.itemId) !== null,
    );
    if (other) return fail("one-copy");
  }
  return ok;
}

export function rezPlan(program: DeckProgram, rez: boolean): ProgramStatePlan {
  return rez
    ? { rezzed: true, rezValue: Math.max(0, program.rez.max), mark: "none" }
    : { rezzed: false, rezValue: Math.max(0, program.rez.value), mark: "none" };
}

export interface EquipPlan {
  decks: Array<{ itemId: string; equipped: "equipped" | "carried" }>;
  derez: string[];
}

export function equipPlan(loadout: DeckLoadout, deckId: string): EquipPlan | DeckCheck {
  const deck = loadout.decks.find((d) => d.itemId === deckId);
  if (!deck) return fail("no-deck");
  const others = loadout.decks.filter((d) => d.itemId !== deckId && d.equipped);
  if (deck.equipped && others.length === 0) return fail("already-equipped");
  const derez = others.flatMap((d) =>
    loadout.programs.filter((p) => d.installed.includes(p.itemId) && p.rezzed).map((p) => p.itemId),
  );
  return {
    decks: [
      ...(deck.equipped ? [] : [{ itemId: deckId, equipped: "equipped" as const }]),
      ...others.map((d) => ({ itemId: d.itemId, equipped: "carried" as const })),
    ],
    derez,
  };
}

export function isEquipPlan(value: EquipPlan | DeckCheck): value is EquipPlan {
  return "decks" in value;
}
