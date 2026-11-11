import { describe, expect, it } from "vitest";
import { buildEncounterView } from "../../src/session/encounter-view";
import {
  type PendingCheck,
  type PublicSession,
  toRunState,
  type ViewerRole,
} from "../../src/session/session-state";
import { base, reveal, withRun } from "../fixtures/requests-harness";

const ICE = { name: "Hellhound", rez: { value: 10, max: 10 } };

function atIce(run: Partial<PublicSession["run"]> = {}): PublicSession {
  return withRun(
    { ...reveal(base(), [0, 1, 2]), runnerPosition: 1 },
    { cleared: [0], ice: [{ key: 1, actorUuid: "Actor.ice1" }], ...run },
  );
}

function view(session: PublicSession, role: ViewerRole) {
  return buildEncounterView({
    session,
    role,
    rules: {
      runner: { interfaceRank: 4, hasCyberdeck: true },
      hasEntry: true,
      nodes: session.netArch?.discovered ?? [],
      run: toRunState(session),
    },
    readIce: (uuid) => (uuid === "Actor.ice1" ? ICE : null),
    dvOf: (key) => (role === "gm" && key === 0 ? 6 : null),
  });
}

const pending = (over: Partial<PendingCheck>): PendingCheck => ({
  rezBefore: null,
  ability: "zap",
  key: 1,
  total: 14,
  messageId: "m",
  userId: "u",
  opposed: null,
  rezAfter: null,
  programId: null,
  ...over,
});

describe("buildEncounterView", () => {
  it("no nó Black ICE, GM vincula e ataca; Netrunner só vê o Black ICE", () => {
    const gm = view(atIce(), "gm");
    expect(gm.ice).toMatchObject({ key: 1, canLink: true, canAttack: true, defeated: false });
    expect(gm.ice?.link?.stats).toEqual(ICE);
    const runner = view(atIce(), "netrunner");
    expect(runner.ice).toMatchObject({ canLink: false, canAttack: false });
  });

  it("sem vínculo o GM não ataca; fora do nó Black ICE não há encontro", () => {
    expect(view(atIce({ ice: [] }), "gm").ice).toMatchObject({ link: null, canAttack: false });
    expect(view({ ...atIce(), runnerPosition: 0 }, "gm").ice).toBeNull();
  });

  it("Zap aguardando DEF: só o GM rola; depois, sugestão pela disputa", () => {
    const waiting = atIce({ pending: pending({}) });
    expect(view(waiting, "gm").pending).toMatchObject({
      opposedRoll: "def",
      canRollOpposed: true,
      canConfirm: false,
    });
    expect(view(waiting, "netrunner").pending).toMatchObject({ canRollOpposed: false });
    const opposed = atIce({
      pending: pending({ opposed: { total: 14, messageId: "d", userId: "g" } }),
    });
    expect(view(opposed, "gm").pending).toMatchObject({
      opposedRoll: null,
      suggestion: "failure",
      canConfirm: true,
    });
    expect(view(opposed, "netrunner").pending?.suggestion).toBeNull();
  });

  it("ataque do Black ICE: a Netrunner rola Defense", () => {
    const s = atIce({ pending: pending({ ability: "iceAttack", total: 16 }) });
    expect(view(s, "netrunner").pending).toMatchObject({
      opposedRoll: "defense",
      canRollOpposed: true,
    });
    expect(view(s, "spectator").pending?.canRollOpposed).toBe(false);
  });

  it("Backdoor: só o GM vê o DV e a sugestão", () => {
    const s = withRun(
      { ...reveal(base(), [0]), runnerPosition: 0 },
      { pending: pending({ ability: "backdoor", key: 0, total: 6 }) },
    );
    expect(view(s, "gm").pending).toMatchObject({ dv: 6, suggestion: "failure" });
    expect(view(s, "netrunner").pending).toMatchObject({ dv: null, suggestion: null });
  });

  it("dano: mostra REZ antes e depois; aguardando, Netrunner rola e GM pode dispensar", () => {
    const dmg = atIce({ pending: pending({ ability: "damage", total: 4, rezAfter: 6 }) });
    expect(view(dmg, "gm").pending).toMatchObject({ rez: { before: 10, after: 6 } });
    const waiting = atIce({ awaitingDamage: 1 });
    expect(view(waiting, "netrunner")).toMatchObject({ canRollDamage: true, canSkipDamage: false });
    expect(view(waiting, "gm")).toMatchObject({ canRollDamage: true, canSkipDamage: true });
    expect(view(waiting, "gm").ice?.canAttack).toBe(false);
  });
});

describe("buildEncounterView — Eye-Dee (E6-04)", () => {
  it("GM vê DV e sugestão do Eye-Dee como nas outras checagens contra DV", () => {
    const s = withRun(
      { ...reveal(base(), [0]), runnerPosition: 0 },
      { pending: pending({ ability: "eyedee", key: 0, total: 9 }) },
    );
    expect(view(s, "gm").pending).toMatchObject({ dv: 6, suggestion: "success" });
  });
});
