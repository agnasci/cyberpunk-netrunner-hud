import { describe, expect, it } from "vitest";
import type { CharacterSnapshot } from "../../src/domain/character";
import { buildSessionHudView } from "../../src/session/session-view";

const snapshot: CharacterSnapshot = {
  actorUuid: "Actor.abc",
  actorName: "Netrunner Sintética",
  actorType: "character",
  netRole: { itemId: "r1", abilityName: "Interface", rank: 4 },
  cyberdeck: { itemId: "d1", name: "Deck" },
  programs: [
    {
      itemId: "p1",
      name: "Programa",
      programClass: "defender",
      status: "rezzed",
      rez: { value: 5, max: 7 },
      stats: { atk: 0, def: 2, per: 0, spd: 0 },
    },
  ],
  issues: [{ code: "missing-installed-item", itemId: "x" }],
};

describe("buildSessionHudView", () => {
  it("espectador vê nomes e estados dos programas, sem detalhes nem diagnóstico", () => {
    const view = buildSessionHudView(snapshot, "spectator");
    expect(view.programs).toEqual([{ itemId: "p1", name: "Programa", status: "rezzed" }]);
    expect(view.issues).toEqual([]);
    expect(view.canEndSession).toBe(false);
    expect(view.isController).toBe(false);
  });

  it("netrunner vê detalhes e diagnóstico, mas não encerra a sessão", () => {
    const view = buildSessionHudView(snapshot, "netrunner");
    expect(view.programs[0]).toHaveProperty("rez", { value: 5, max: 7 });
    expect(view.issues).toEqual(snapshot.issues);
    expect(view.isController).toBe(true);
    expect(view.canEndSession).toBe(false);
  });

  it("mestre pode encerrar a sessão", () => {
    expect(buildSessionHudView(snapshot, "gm").canEndSession).toBe(true);
  });

  it("ator ausente gera visão vazia sem quebrar", () => {
    const view = buildSessionHudView(null, "gm");
    expect(view.actorMissing).toBe(true);
    expect(view.programs).toEqual([]);
  });
});
