import { describe, expect, it } from "vitest";
import type { CharacterSnapshot } from "../../src/domain/character";
import { runnerResources } from "../../src/domain/net-rules";
import { diffFx } from "../../src/session/hud-fx";
import type { PendingCheck, PublicSession } from "../../src/session/session-state";
import {
  base,
  GM,
  type Harness,
  request,
  reveal,
  RUNNER,
  runWith,
  withRun,
} from "../fixtures/requests-harness";

const PROGRAMS = [
  { itemId: "armor", programClass: "defender", rezzed: false },
  { itemId: "seeya", programClass: "booster", rezzed: true },
  { itemId: "sword", programClass: "antiprogramattacker", rezzed: false },
  { itemId: "vrizz", programClass: "antipersonnelattacker", rezzed: false },
];

const HARNESS: Harness = {
  rolls: {
    "m-sword": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 15 },
    "m-def": { authorId: GM.id, actorUuid: "Actor.ice1", total: 9 },
    "m-sword-dmg": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 7, formula: null },
  },
  ices: { "Actor.ice1": { name: "Hellhound", rez: { value: 10, max: 10 } } },
  runner: { interfaceRank: 4, hasCyberdeck: true, programs: PROGRAMS },
};

function at(position: number | null, run: Partial<PublicSession["run"]> = {}): PublicSession {
  return withRun(
    { ...reveal(base(), [0, 1, 2]), runnerPosition: position },
    { cleared: [0], ice: [{ key: 1, actorUuid: "Actor.ice1" }], ...run },
  );
}

function chain(start: PublicSession) {
  const run = runWith(HARNESS);
  let session = start;
  let n = 0;
  return {
    step(action: unknown, sender = RUNNER) {
      n += 1;
      const out = run(session, request(session, action, `p${n}`), sender);
      if (out.session) session = out.session;
      return out;
    },
  };
}

describe("runnerResources com programas", () => {
  it("lê classe e estado de rez dos programas do snapshot", () => {
    const snapshot = {
      netRole: { itemId: "r", abilityName: "Interface", rank: 4 },
      cyberdeck: { itemId: "d", name: "Deck" },
      programs: [
        {
          itemId: "a",
          name: "Armor",
          programClass: "defender",
          status: "rezzed",
          rez: { value: 7, max: 7 },
        },
        {
          itemId: "s",
          name: "Sword",
          programClass: "antiprogramattacker",
          status: "stored",
          rez: { value: 0, max: 0 },
        },
        {
          itemId: "f",
          name: "Flak",
          programClass: "defender",
          status: "destroyed",
          rez: { value: 0, max: 7 },
        },
      ],
    } as unknown as CharacterSnapshot;
    expect(runnerResources(snapshot).programs).toMatchObject([
      { itemId: "a", programClass: "defender", rezzed: true, rez: 7, rezMax: 7, name: "Armor" },
      { itemId: "s", programClass: "antiprogramattacker", rezzed: false, destroyed: false },
      { itemId: "f", programClass: "defender", rezzed: false, rez: 0, destroyed: true },
    ]);
  });
});

describe("rezzar e derrezzar (E6-05)", () => {
  it("rezzar Defender gasta 1 ação e gera o efeito absoluto na ficha", () => {
    const out = chain(at(0)).step({ type: "rezProgram", programId: "armor", rez: true });
    expect(out.result.ok).toBe(true);
    expect(out.effects).toMatchObject([
      {
        type: "setProgramState",
        actorUuid: "Actor.abc",
        programId: "armor",
        state: { rezzed: true, mark: "none" },
      },
    ]);
    expect(out.session?.run.actionsUsed).toBe(1);
  });

  it("derrezzar Booster rezzado também vale", () => {
    const out = chain(at(0)).step({ type: "rezProgram", programId: "seeya", rez: false });
    expect(out.effects).toMatchObject([
      { type: "setProgramState", programId: "seeya", state: { rezzed: false, mark: "none" } },
    ]);
  });

  it("recusa atacante, programa inexistente, estado igual, desconectada e sem ações", () => {
    const c = chain(at(0));
    expect(c.step({ type: "rezProgram", programId: "sword", rez: true }).result).toMatchObject({
      error: "invalid-program",
    });
    expect(c.step({ type: "rezProgram", programId: "nada", rez: true }).result).toMatchObject({
      error: "invalid-program",
    });
    expect(c.step({ type: "rezProgram", programId: "seeya", rez: true }).result).toMatchObject({
      error: "program-state",
    });
    expect(
      chain(at(null)).step({ type: "rezProgram", programId: "armor", rez: true }).result,
    ).toMatchObject({ error: "not-jacked-in" });
    expect(
      chain(at(0, { actionsUsed: 3 })).step({ type: "rezProgram", programId: "armor", rez: true })
        .result,
    ).toMatchObject({ error: "no-actions-left" });
  });
});

describe("ataque com programa contra Black ICE (E6-05)", () => {
  it("Sword: disputa com a DEF, sucesso, dano do card nativo e efeito no REZ", () => {
    const c = chain(at(1));
    const atk = c.step({
      type: "check",
      ability: "programAttack",
      messageId: "m-sword",
      programId: "sword",
    });
    expect(atk.session?.run.pending).toMatchObject({
      ability: "programAttack",
      programId: "sword",
      total: 15,
    });
    expect(atk.session?.run.actionsUsed).toBe(1);
    c.step({ type: "oppose", messageId: "m-def" }, GM);
    const won = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(won.session?.run).toMatchObject({ awaitingDamage: 1, damageProgram: "sword" });
    const dmg = c.step({ type: "check", ability: "damage", messageId: "m-sword-dmg" });
    expect(dmg.session?.run.pending).toMatchObject({ ability: "damage", total: 7, rezAfter: 3 });
    const applied = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(applied.effects).toEqual([
      { type: "setIceRez", actorUuid: "Actor.ice1", value: 3, before: 10 },
    ]);
    expect(applied.session?.run).toMatchObject({ awaitingDamage: null, damageProgram: null });
  });

  it("antipessoal e programa inexistente não atacam Black ICE; fora do Black ICE, nó errado", () => {
    expect(
      chain(at(1)).step({
        type: "check",
        ability: "programAttack",
        messageId: "m-sword",
        programId: "vrizz",
      }).result,
    ).toMatchObject({ error: "invalid-program" });
    expect(
      chain(at(0)).step({
        type: "check",
        ability: "programAttack",
        messageId: "m-sword",
        programId: "sword",
      }).result,
    ).toMatchObject({ error: "wrong-node" });
  });

  it("faixa própria quando o programa acerta", () => {
    const s = at(1);
    const outcome = {
      seq: 1,
      ability: "programAttack" as PendingCheck["ability"],
      key: 1,
      outcome: "success" as const,
    };
    expect(diffFx(s, withRun(s, { lastOutcome: outcome }))).toMatchObject({
      nodes: { 1: "hit" },
      banner: "program-hit",
    });
  });
});
