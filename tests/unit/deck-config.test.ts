import { describe, expect, it } from "vitest";
import {
  checkInstall,
  checkRemove,
  checkRez,
  checkUninstall,
  type DeckLoadout,
  type DeckProgram,
  equipPlan,
  isEquipPlan,
  loosePrograms,
  rezPlan,
} from "../../src/domain/deck-config";
import { normalizeLoadout } from "../../src/integrations/cpr/deck-adapter";
import { actor, cyberdeck, program } from "../fixtures/cpr-actor";

const prog = (itemId: string, over: Partial<DeckProgram> = {}): DeckProgram => ({
  itemId,
  name: `P ${itemId}`,
  programClass: "booster",
  size: 1,
  rezzed: false,
  rez: { value: 7, max: 7 },
  atk: 0,
  def: 0,
  mark: "none",
  ...over,
});

function loadout(over: Partial<DeckLoadout> = {}): DeckLoadout {
  return {
    decks: [
      { itemId: "d1", name: "Deck 1", equipped: true, slots: 3, usedSlots: 1, installed: ["p1"] },
      { itemId: "d2", name: "Deck 2", equipped: false, slots: 2, usedSlots: 0, installed: [] },
    ],
    programs: [prog("p1"), prog("p2"), prog("p3", { size: 3 })],
    upgrades: [],
    ...over,
  };
}

describe("instalar e desinstalar (E7-02)", () => {
  it("instala com slot livre e recusa sem slots ou já instalado", () => {
    const l = loadout();
    expect(checkInstall(l, "d1", "p2")).toEqual({ ok: true });
    expect(checkInstall(l, "d1", "p3")).toEqual({ ok: false, error: "no-slots" });
    expect(checkInstall(l, "d1", "p1")).toEqual({ ok: false, error: "already-installed" });
    expect(checkInstall(l, "d2", "p1")).toEqual({ ok: false, error: "installed-elsewhere" });
    expect(checkInstall(l, "dx", "p2")).toEqual({ ok: false, error: "no-deck" });
  });

  it("desinstala só o que está no deck; fora do deck fica na lista da ficha", () => {
    const l = loadout();
    expect(checkUninstall(l, "d1", "p1")).toEqual({ ok: true });
    expect(checkUninstall(l, "d1", "p2")).toEqual({ ok: false, error: "not-installed" });
    expect(loosePrograms(l).map((p) => p.itemId)).toEqual(["p2", "p3"]);
  });
});

describe("rezzar fora da invasão (E7-02, D40)", () => {
  it("rezza Booster/Defender instalado em deck equipado, com REZ cheio", () => {
    const p1 = prog("p1", { rez: { value: 2, max: 7 } });
    const l = loadout({ programs: [p1] });
    expect(checkRez(l, "p1", true)).toEqual({ ok: true });
    expect(rezPlan(p1, true)).toEqual({ rezzed: true, rezValue: 7, mark: "none" });
  });

  it("recusa atacante, não instalado, deck guardado e destruído", () => {
    const base = loadout();
    expect(
      checkRez(
        loadout({ programs: [prog("p1", { programClass: "antiprogramattacker" })] }),
        "p1",
        true,
      ),
    ).toEqual({ ok: false, error: "not-rezzable" });
    expect(checkRez(base, "p2", true)).toEqual({ ok: false, error: "not-installed" });
    const stowed = loadout({
      decks: [
        { itemId: "d1", name: "D", equipped: false, slots: 3, usedSlots: 1, installed: ["p1"] },
      ],
    });
    expect(checkRez(stowed, "p1", true)).toEqual({ ok: false, error: "deck-not-equipped" });
    expect(
      checkRez(loadout({ programs: [prog("p1", { mark: "destroyed" })] }), "p1", true),
    ).toEqual({ ok: false, error: "destroyed" });
  });

  it("remover da ficha só vale para programa destruído", () => {
    const l = loadout({ programs: [prog("p1", { mark: "destroyed" }), prog("p2")] });
    expect(checkRemove(l, "p1")).toEqual({ ok: true });
    expect(checkRemove(l, "p2")).toEqual({ ok: false, error: "not-destroyed" });
    expect(checkRemove(l, "p9")).toEqual({ ok: false, error: "no-program" });
  });

  it("neutralizado: derrezzar desliga e limpa a marca; rezzar direto é recusado", () => {
    const neutral = prog("p1", { rezzed: true, mark: "neutralized", rez: { value: 0, max: 7 } });
    const l = loadout({
      programs: [neutral],
    });
    expect(checkRez(l, "p1", true)).toEqual({ ok: false, error: "state" });
    expect(checkRez(l, "p1", false)).toEqual({ ok: true });
    expect(rezPlan(neutral, false)).toEqual({ rezzed: false, rezValue: 0, mark: "none" });
  });

  it("Armor: uma cópia ligada por vez", () => {
    const l = loadout({
      decks: [
        {
          itemId: "d1",
          name: "D",
          equipped: true,
          slots: 3,
          usedSlots: 2,
          installed: ["a1", "a2"],
        },
      ],
      programs: [
        prog("a1", { name: "Armor", programClass: "defender", rezzed: true }),
        prog("a2", { name: "Armor", programClass: "defender" }),
      ],
    });
    expect(checkRez(l, "a2", true)).toEqual({ ok: false, error: "one-copy" });
    expect(checkRez(l, "a1", false)).toEqual({ ok: true });
  });
});

describe("equipar (E7-02)", () => {
  it("equipa um deck, guarda o outro e derrezza os programas dele", () => {
    const l = loadout({ programs: [prog("p1", { rezzed: true }), prog("p2")] });
    const plan = equipPlan(l, "d2");
    expect(isEquipPlan(plan) && plan).toEqual({
      decks: [
        { itemId: "d2", equipped: "equipped" },
        { itemId: "d1", equipped: "carried" },
      ],
      derez: ["p1"],
    });
    expect(equipPlan(l, "d1")).toEqual({ ok: false, error: "already-equipped" });
  });
});

describe("leitura da ficha do CPR (E7-02)", () => {
  it("lê decks, slots nativos, programas, marca e ignora ids apagados", () => {
    const deck = cyberdeck("d1", "equipped", ["p1", "gone"]);
    (deck.system as { installedItems: Record<string, unknown> }).installedItems["usedSlots"] = 1;
    const p1 = { ...program("p1", { isRezzed: true }), programState: "neutralized" };
    const source = actor([deck, p1, program("p2", { class: "antiprogramattacker" })]);
    const l = normalizeLoadout(source, (id) => (id === "d1" ? 9 : null));
    expect(l.decks).toEqual([
      { itemId: "d1", name: "Deck d1", equipped: true, slots: 9, usedSlots: 1, installed: ["p1"] },
    ]);
    expect(l.programs.map((p) => [p.itemId, p.programClass, p.rezzed, p.mark, p.size])).toEqual([
      ["p1", "booster", true, "neutralized", 1],
      ["p2", "antiprogramattacker", false, "none", 1],
    ]);
  });
});
