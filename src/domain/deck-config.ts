import { ONE_COPY_PROGRAMS, programKey, REZZABLE_CLASSES } from "./net-rules";

/**
 * Configuração do cyberdeck fora da invasão (E7-02, D43): o que a jogadora pode instalar,
 * desinstalar, rezzar e equipar antes do Jack In. Funções puras sobre uma carga lida da ficha;
 * a gravação fica no adaptador, com as funções nativas do CPR.
 */
export type DeckProgramMark = "none" | "neutralized" | "destroyed";

export interface DeckItem {
  itemId: string;
  name: string;
  /** `system.equipped === "equipped"`. */
  equipped: boolean;
  /** Slots totais (com upgrades), como o sistema calcula. */
  slots: number;
  usedSlots: number;
  /** Ids instalados neste deck (programas e upgrades), na ordem da ficha. */
  installed: string[];
}

export interface DeckProgram {
  itemId: string;
  name: string;
  programClass: string;
  /** Slots que ocupa (`system.size`). */
  size: number;
  rezzed: boolean;
  rez: { value: number; max: number };
  atk: number;
  def: number;
  mark: DeckProgramMark;
}

/** Upgrade instalado num deck (só leitura: ocupa slots). */
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

/** Estado absoluto do programa depois de rezzar/derrezzar (mesma regra da sessão, D40). */
export interface ProgramStatePlan {
  rezzed: boolean;
  rezValue: number;
  mark: "none" | "neutralized" | "destroyed";
}

export function freeSlots(deck: DeckItem): number {
  return Math.max(0, deck.slots - deck.usedSlots);
}

/** Deck em que o programa está instalado, se algum. */
export function deckOf(loadout: DeckLoadout, programId: string): DeckItem | null {
  return loadout.decks.find((d) => d.installed.includes(programId)) ?? null;
}

/** Programas da ficha que não estão em nenhum deck. */
export function loosePrograms(loadout: DeckLoadout): DeckProgram[] {
  return loadout.programs.filter((p) => deckOf(loadout, p.itemId) === null);
}

/** Primeiro deck equipado, como `getEquippedCyberdeck` do CPR. */
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

/**
 * Rezzar/derrezzar fora da invasão: só Booster e Defender instalados num deck equipado; destruído
 * não volta; Armor, Flak e Shield com uma cópia ligada por vez (D40). Neutralizado conta como em
 * execução: derrezzar desliga e rezzar de novo volta com o REZ cheio.
 */
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

/** Estado gravado ao rezzar (REZ cheio, sem marca) ou derrezzar (desliga, sem marca). */
export function rezPlan(program: DeckProgram, rez: boolean): ProgramStatePlan {
  return rez
    ? { rezzed: true, rezValue: Math.max(0, program.rez.max), mark: "none" }
    : { rezzed: false, rezValue: Math.max(0, program.rez.value), mark: "none" };
}

export interface EquipPlan {
  /** Novo `system.equipped` por deck alterado. */
  decks: Array<{ itemId: string; equipped: "equipped" | "carried" }>;
  /** Programas a derrezzar (estavam ligados em decks que deixam de estar equipados). */
  derez: string[];
}

/** Equipar um deck: só ele fica equipado; programas ligados nos outros desligam. */
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
