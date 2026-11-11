import { describe, expect, it } from "vitest";
import {
  defaultController,
  missingIceLinks,
  startCandidates,
  suggestIce,
} from "../../src/session/start-options";
import { createSession } from "../../src/session/session-state";

const users = [
  { id: "gm", isGM: true },
  { id: "p1", isGM: false },
  { id: "p2", isGM: false },
];

const actors = [
  { uuid: "Actor.npc", name: "Zeta NPC", type: "character", ownerIds: ["gm"] },
  { uuid: "Actor.pc", name: "Vi", type: "character", ownerIds: ["gm", "p2"] },
  { uuid: "Actor.mook", name: "Capanga", type: "mook", ownerIds: [] },
  { uuid: "Actor.ice", name: "Hellhound", type: "blackIce", ownerIds: [] },
  { uuid: "Actor.pc2", name: "Ana", type: "character", ownerIds: ["p1"] },
];

describe("startCandidates (E6-03)", () => {
  it("por padrão, só personagens com dono jogador, em ordem alfabética", () => {
    expect(startCandidates(actors, users, false).map((a) => a.uuid)).toEqual([
      "Actor.pc2",
      "Actor.pc",
    ]);
  });

  it("mostrar todos inclui NPCs e mooks, jogadores primeiro", () => {
    expect(startCandidates(actors, users, true).map((a) => a.uuid)).toEqual([
      "Actor.pc2",
      "Actor.pc",
      "Actor.mook",
      "Actor.npc",
    ]);
  });
});

describe("defaultController", () => {
  it("primeiro jogador dono do personagem; nenhum para NPC", () => {
    expect(defaultController(actors[1], users)).toBe("p2");
    expect(defaultController(actors[0], users)).toBeNull();
  });
});

describe("suggestIce", () => {
  const ices = [
    { uuid: "Actor.t", name: "Black ICE" },
    { uuid: "Actor.h", name: "Hellhound" },
    { uuid: "Actor.h2", name: "Hellhound (porão)" },
    { uuid: "Actor.w", name: "wisp" },
  ];

  it("prefere nome igual, ignorando maiúsculas", () => {
    expect(suggestIce("Wisp", ices, new Set())).toBe("Actor.w");
    expect(suggestIce("Hellhound", ices, new Set())).toBe("Actor.h");
  });

  it("pula atores já usados e aceita nome que começa igual", () => {
    expect(suggestIce("Hellhound", ices, new Set(["Actor.h"]))).toBe("Actor.h2");
  });

  it("sem correspondência, nenhuma sugestão", () => {
    expect(suggestIce("Kraken", ices, new Set())).toBeNull();
  });
});

describe("missingIceLinks", () => {
  it("lista os nós Black ICE sem ator", () => {
    expect(missingIceLinks([1, 4], { 1: "Actor.h", 4: "" })).toEqual([4]);
    expect(missingIceLinks([1], { 1: "Actor.h" })).toEqual([]);
  });
});

describe("createSession com vínculos", () => {
  it("grava os Black ICE escolhidos no início", () => {
    const s = createSession(
      {
        actorUuid: "Actor.pc",
        controllerUserId: "p2",
        netArch: { itemUuid: "Item.a", name: "A" },
        ice: [{ key: 1, actorUuid: "Actor.h" }],
      },
      { id: "s", now: 1 },
    );
    expect(s.run.ice).toEqual([{ key: 1, actorUuid: "Actor.h" }]);
  });
});
