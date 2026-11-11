import { describe, expect, it } from "vitest";
import type { RunnerProgram, RunnerResources } from "../../src/domain/net-rules";
import type { PublicSession } from "../../src/session/session-state";
import {
  base,
  DECK,
  GM,
  type Harness,
  request,
  reveal,
  RUNNER,
  runWith,
  withRun,
} from "../fixtures/requests-harness";

/** Regras de uso dos programas (Core, errata e manual do Netrunning Deck; D40). */
function chain(h: Harness, start: PublicSession) {
  const run = runWith(h);
  let current = start;
  let n = 0;
  return {
    get session() {
      return current;
    },
    step(action: unknown, sender = RUNNER) {
      n += 1;
      const outcome = run(current, request(current, action, `p${n}`), sender);
      if (outcome.session) current = outcome.session;
      return outcome;
    },
  };
}

function runner(programs: RunnerProgram[]): RunnerResources {
  // Interface 10: ações de sobra para os testes.
  return { ...DECK, interfaceRank: 10, programs };
}

const atEntry = (): PublicSession => ({
  ...withRun(reveal(base(), [0]), { cleared: [0] }),
  runnerPosition: 0,
});

describe("ativação e recuperação (D40)", () => {
  it("cada cópia ativa uma vez por rodada; nova rodada libera", () => {
    const worm: RunnerProgram = {
      itemId: "worm",
      name: "Worm",
      programClass: "booster",
      rezzed: false,
      rez: 7,
      rezMax: 7,
    };
    const h: Harness = { rolls: {}, ices: {}, runner: runner([worm]) };
    const c = chain(h, atEntry());
    expect(c.step({ type: "rezProgram", programId: "worm", rez: true }).result.ok).toBe(true);
    h.runner = runner([{ ...worm, rezzed: true }]);
    expect(c.step({ type: "rezProgram", programId: "worm", rez: false }).result.ok).toBe(true);
    h.runner = runner([worm]);
    expect(c.step({ type: "rezProgram", programId: "worm", rez: true }).result).toMatchObject({
      error: "program-used",
    });
    c.step({ type: "newTurn" }, GM);
    expect(c.step({ type: "rezProgram", programId: "worm", rez: true }).result.ok).toBe(true);
  });

  it("neutralizado: derrezzar antes; rezzar de novo volta com o REZ cheio", () => {
    const worm = {
      itemId: "worm",
      name: "Worm",
      programClass: "booster",
      rezzed: false,
      rez: 0,
      rezMax: 7,
      neutralized: true,
    };
    const h: Harness = { rolls: {}, ices: {}, runner: runner([worm]) };
    const c = chain(h, atEntry());
    expect(c.step({ type: "rezProgram", programId: "worm", rez: true }).result).toMatchObject({
      error: "program-neutralized",
    });
    const derez = c.step({ type: "rezProgram", programId: "worm", rez: false });
    expect(derez.effects).toEqual([
      {
        type: "setProgramState",
        actorUuid: "Actor.abc",
        programId: "worm",
        state: { rezzed: false, rezValue: 0, mark: "none" },
        before: { rezzed: false, rezValue: 0, mark: "neutralized" },
      },
    ]);
    h.runner = runner([{ ...worm, neutralized: false }]);
    const rez = c.step({ type: "rezProgram", programId: "worm", rez: true });
    expect(rez.effects[0]).toMatchObject({ state: { rezzed: true, rezValue: 7, mark: "none" } });
  });

  it("destruído não volta", () => {
    const h: Harness = {
      rolls: {},
      ices: {},
      runner: runner([
        { itemId: "a", name: "Armor", programClass: "defender", rezzed: false, destroyed: true },
      ]),
    };
    expect(
      chain(h, atEntry()).step({ type: "rezProgram", programId: "a", rez: true }).result,
    ).toMatchObject({ error: "program-destroyed" });
  });
});

describe("Armor, Flak, Shield e Superglue (D40)", () => {
  it("Armor: uma cópia ligada por vez e cada cópia uma vez por Netrun", () => {
    const a1 = { itemId: "a1", name: "Armor", programClass: "defender", rezzed: false, rez: 7 };
    const a2 = { ...a1, itemId: "a2" };
    const h: Harness = { rolls: {}, ices: {}, runner: runner([a1, a2]) };
    const c = chain(h, atEntry());
    c.step({ type: "rezProgram", programId: "a1", rez: true });
    h.runner = runner([{ ...a1, rezzed: true }, a2]);
    expect(c.step({ type: "rezProgram", programId: "a2", rez: true }).result).toMatchObject({
      error: "one-copy",
    });
    c.step({ type: "rezProgram", programId: "a1", rez: false });
    h.runner = runner([a1, a2]);
    c.step({ type: "newTurn" }, GM);
    expect(c.step({ type: "rezProgram", programId: "a1", rez: true }).result).toMatchObject({
      error: "once-per-run",
    });
    // A outra cópia serve de reserva.
    expect(c.step({ type: "rezProgram", programId: "a2", rez: true }).result.ok).toBe(true);
    // Nova Netrun (Jack Out e Jack In) libera as cópias.
    c.step({ type: "jackOut" });
    c.step({ type: "newTurn" }, GM);
    c.step({ type: "jackIn" });
    expect(c.session.run.netrunUsed).toEqual([]);
  });

  it("Superglue: atacante de uso único por Netrun", () => {
    const glue = {
      itemId: "glue",
      name: "Superglue",
      programClass: "antiprogramattacker",
      rezzed: false,
      rez: 0,
    };
    const start = {
      ...withRun(reveal(base(), [0, 1]), {
        cleared: [0],
        ambushed: [1],
        ice: [{ key: 1, actorUuid: "Actor.ice" }],
      }),
      runnerPosition: 1,
    };
    const h: Harness = {
      rolls: {
        g1: { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 10 },
        g2: { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 10 },
        d1: { authorId: GM.id, actorUuid: "Actor.ice", total: 20 },
      },
      ices: { "Actor.ice": { name: "Wisp", rez: { value: 15, max: 15 } } },
      runner: runner([glue]),
    };
    const c = chain(h, start);
    c.step({ type: "check", ability: "programAttack", messageId: "g1", programId: "glue" });
    expect(c.session.run.netrunUsed).toEqual(["glue"]);
    c.step({ type: "oppose", messageId: "d1" }, GM);
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    c.step({ type: "endTurn" });
    c.step({ type: "endTurn" }, GM);
    const again = c.step({
      type: "check",
      ability: "programAttack",
      messageId: "g2",
      programId: "glue",
    });
    expect(again.result).toMatchObject({ error: "once-per-run" });
  });

  it("Shield absorve o primeiro acerto de programa ofensivo da NPC e se neutraliza", () => {
    const shield = { itemId: "sh", name: "Shield", programClass: "defender", rezzed: true, rez: 7 };
    const start = {
      ...withRun(reveal(base(), [0, 1, 2]), {
        cleared: [0, 1],
        npcs: [{ key: 2, actorUuid: "Actor.npc", defeated: false }],
        fight: { key: 2, runnerInit: 10, npcInit: 20, npcActionsUsed: 0 },
        iceTurn: true,
      }),
      runnerPosition: 2,
    };
    const h: Harness = {
      rolls: {
        n1: { authorId: GM.id, actorUuid: "Actor.npc", total: 20 },
        def: { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 5 },
      },
      ices: {},
      runner: runner([shield]),
      vitals: { hp: 30, brainDamageReduction: 0 },
      npcLinks: { 2: "Actor.npc" },
      resources: {
        "Actor.npc": {
          interfaceRank: 4,
          hasCyberdeck: true,
          programs: [{ itemId: "bolt", programClass: "antipersonnelattacker", rezzed: false }],
        },
      },
    };
    const c = chain(h, start);
    c.step({ type: "npcAttack", messageId: "n1", programId: "bolt" }, GM);
    c.step({ type: "oppose", messageId: "def" });
    const out = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(out.effects).toEqual([
      {
        type: "setProgramState",
        actorUuid: "Actor.abc",
        programId: "sh",
        state: { rezzed: false, rezValue: 7, mark: "neutralized" },
        before: { rezzed: true, rezValue: 7, mark: "none" },
      },
    ]);
    expect(c.session.run.iceHit).toBeNull();
    expect(c.session.run.lastIceDamage?.result).toEqual({ kind: "none", reason: "shield" });
  });
});

describe("Black ICE antiprograma à espreita (FAQ, D40)", () => {
  const start = (): PublicSession => ({
    ...withRun(reveal(base(), [0, 1]), {
      cleared: [0],
      ice: [{ key: 1, actorUuid: "Actor.killer" }],
    }),
    runnerPosition: 0,
  });
  const killer = { name: "Killer", rez: { value: 20, max: 20 }, iceClass: "antiprogram" as const };

  it("sem programa em execução, não dispara", () => {
    const c = chain({ rolls: {}, ices: { "Actor.killer": killer } }, start());
    c.step({ type: "moveTo", key: 1 });
    expect(c.session.run.ambush).toBeNull();
  });

  it("com programa em execução, dispara", () => {
    const h: Harness = {
      rolls: {},
      ices: { "Actor.killer": killer },
      runner: runner([
        { itemId: "w", name: "Worm", programClass: "booster", rezzed: true, rez: 7 },
      ]),
    };
    const c = chain(h, start());
    c.step({ type: "moveTo", key: 1 });
    expect(c.session.run.ambush).toBe(1);
  });

  it("acerto de Black ICE que destrói marca o programa como destruído", async () => {
    const { iceDamageResult } = await import("../../src/domain/ice-hit");
    expect(
      iceDamageResult({ kind: "program", programId: "w", rezBase: 5, destroys: true }, 9),
    ).toMatchObject({ destroyed: true, after: 0 });
  });
});
