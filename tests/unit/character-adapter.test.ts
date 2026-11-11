import { describe, expect, it } from "vitest";
import { normalizeCharacter } from "../../src/integrations/cpr/character-adapter";
import { actor, cyberdeck, program, role } from "../fixtures/cpr-actor";

describe("normalizeCharacter", () => {
  it("lê role ativa, deck equipado e apenas os programas instalados nele", () => {
    const snapshot = normalizeCharacter(
      actor([
        role("role1", 6),
        cyberdeck("deck1", "equipped", ["prog1", "prog2"]),
        program("prog1", { isRezzed: true, class: "antiprogramattacker" }),
        program("prog2"),
        program("prog3"),
      ]),
    );
    expect(snapshot.netRole).toEqual({ itemId: "role1", abilityName: "Interface", rank: 6 });
    expect(snapshot.cyberdeck).toEqual({ itemId: "deck1", name: "Deck deck1" });
    expect(snapshot.programs.map((p) => [p.itemId, p.status, p.programClass])).toEqual([
      ["prog1", "rezzed", "antiprogramattacker"],
      ["prog2", "stored", "booster"],
    ]);
    expect(snapshot.programs[0]?.stats).toEqual({ atk: 1, def: 2, per: 3, spd: 4 });
    expect(snapshot.issues).toEqual([]);
  });

  it("sinaliza ausência de role de Netrunning ativa ou role removida", () => {
    expect(normalizeCharacter(actor([role("role1", 4)], "")).issues).toContainEqual({
      code: "no-net-role",
    });
    const removed = normalizeCharacter(actor([role("role2", 4)], "role1"));
    expect(removed.netRole).toBeNull();
    expect(removed.issues).toContainEqual({ code: "no-net-role" });
  });

  it("sinaliza ausência de deck equipado e não lista programas", () => {
    const snapshot = normalizeCharacter(
      actor([role("role1", 4), cyberdeck("deck1", "carried", ["prog1"]), program("prog1")]),
    );
    expect(snapshot.cyberdeck).toBeNull();
    expect(snapshot.programs).toEqual([]);
    expect(snapshot.issues).toContainEqual({ code: "no-equipped-cyberdeck" });
  });

  it("usa o primeiro deck equipado, como a ficha nativa, e avisa sobre o excedente", () => {
    const snapshot = normalizeCharacter(
      actor([
        role("role1", 4),
        cyberdeck("deckA", "equipped", []),
        cyberdeck("deckB", "equipped", []),
      ]),
    );
    expect(snapshot.cyberdeck?.itemId).toBe("deckA");
    expect(snapshot.issues).toContainEqual({
      code: "multiple-equipped-cyberdecks",
      itemIds: ["deckA", "deckB"],
    });
  });

  it("reflete a troca de deck equipado na próxima leitura", () => {
    const items = [
      role("role1", 4),
      cyberdeck("deckA", "equipped", ["prog1"]),
      cyberdeck("deckB", "carried", ["prog2"]),
      program("prog1"),
      program("prog2"),
    ];
    expect(normalizeCharacter(actor(items)).programs.map((p) => p.itemId)).toEqual(["prog1"]);
    const swapped = [
      role("role1", 4),
      cyberdeck("deckA", "carried", ["prog1"]),
      cyberdeck("deckB", "equipped", ["prog2"]),
      program("prog1"),
      program("prog2"),
    ];
    const snapshot = normalizeCharacter(actor(swapped));
    expect(snapshot.cyberdeck?.itemId).toBe("deckB");
    expect(snapshot.programs.map((p) => p.itemId)).toEqual(["prog2"]);
  });

  it("ignora id instalado que não existe mais e registra o problema", () => {
    const snapshot = normalizeCharacter(
      actor([
        role("role1", 4),
        cyberdeck("deck1", "equipped", ["gone", "prog1"]),
        program("prog1"),
      ]),
    );
    expect(snapshot.programs.map((p) => p.itemId)).toEqual(["prog1"]);
    expect(snapshot.issues).toContainEqual({ code: "missing-installed-item", itemId: "gone" });
  });

  it("REZ 0 sozinho não destrói (D40): o estado vem da marca do módulo no item", () => {
    const base = actor([
      role("role1", 4),
      cyberdeck("deck1", "equipped", ["prog1"]),
      program("prog1", { isRezzed: true, rez: { value: 0, max: 7 } }),
    ]);
    expect(normalizeCharacter(base).programs[0]?.status).toBe("rezzed");
    const mark = (state: string) => ({
      ...base,
      items: base.items.map((i) => (i.id === "prog1" ? { ...i, programState: state } : i)),
    });
    expect(normalizeCharacter(mark("neutralized")).programs[0]?.status).toBe("neutralized");
    expect(normalizeCharacter(mark("destroyed")).programs[0]?.status).toBe("destroyed");
  });

  it("não trata programa sem trilha de REZ (0/0, como ataques do compêndio) como esgotado", () => {
    const snapshot = normalizeCharacter(
      actor([
        role("role1", 4),
        cyberdeck("deck1", "equipped", ["atk1", "atk2"]),
        program("atk1", {
          isRezzed: true,
          rez: { value: 0, max: 0 },
          class: "antiprogramattacker",
        }),
        program("atk2", {
          isRezzed: false,
          rez: { value: 0, max: 0 },
          class: "antiprogramattacker",
        }),
      ]),
    );
    expect(snapshot.programs.map((p) => p.status)).toEqual(["rezzed", "stored"]);
  });

  it("descarta programa com dados inválidos sem quebrar a leitura", () => {
    const snapshot = normalizeCharacter(
      actor([
        role("role1", 4),
        cyberdeck("deck1", "equipped", ["bad", "prog1"]),
        program("bad", { rez: "muito" }),
        program("prog1"),
      ]),
    );
    expect(snapshot.programs.map((p) => p.itemId)).toEqual(["prog1"]);
    expect(snapshot.issues).toContainEqual({
      code: "invalid-item-data",
      itemId: "bad",
      field: "rez",
    });
  });

  it("aceita rank numérico em texto, como o parseInt do sistema", () => {
    const snapshot = normalizeCharacter(
      actor([{ ...role("role1", 0), system: { rank: "5", mainRoleAbility: "Interface" } }]),
    );
    expect(snapshot.netRole?.rank).toBe(5);
  });
});
