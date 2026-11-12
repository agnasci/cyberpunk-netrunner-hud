import { describe, expect, it } from "vitest";
import { LOG_LIMIT, parseLog } from "../../src/session/log-entry";
import { parseSession, type PublicSession } from "../../src/session/session-state";
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

const roll = (
  authorId: string,
  actorUuid: string,
  total: number,
  formula: string | null = null,
) => ({
  authorId,
  actorUuid,
  total,
  formula,
});

function harness(): Harness {
  return {
    rolls: {
      "m-zap": roll(RUNNER.id, "Actor.abc", 14),
      "m-def": roll(GM.id, "Actor.ice1", 9),
      "m-dmg": roll(RUNNER.id, "Actor.abc", 4, "1d6"),
      "m-atk": roll(GM.id, "Actor.ice1", 16),
      "m-defense": roll(RUNNER.id, "Actor.abc", 10),
      "m-ice-dmg": roll(GM.id, "Actor.ice1", 9, "2d6"),
    },
    ices: {
      "Actor.ice1": {
        name: "Hellhound",
        rez: { value: 10, max: 10 },
        iceClass: "antipersonnel",
        damageFormula: "2d6",
      },
    },
    vitals: { hp: 30, brainDamageReduction: 2 },
    runner: {
      ...DECK,
      programs: [{ itemId: "p-armor", programClass: "defender", rezzed: false, rez: 7 }],
    },
  };
}

function start(): PublicSession {
  return withRun(reveal(base(), [0, 1, 2]), {
    cleared: [0],
    ice: [{ key: 1, actorUuid: "Actor.ice1" }],
  });
}

function chain(session: PublicSession) {
  const run = runWith(harness());
  let current = session;
  let n = 0;
  return {
    get session() {
      return current;
    },
    get log() {
      return current.log.map(({ event, data }) => ({ event, data }));
    },
    step(action: unknown, sender = RUNNER) {
      n += 1;
      const outcome = run(current, request(current, action, `s${n}`), sender);
      if (outcome.session) current = outcome.session;
      return outcome;
    },
  };
}

describe("registro de eventos (E6-09, D34)", () => {
  it("Jack In e movimento entram com o nó, o turno e a sequência", () => {
    const c = chain(start());
    c.step({ type: "jackIn" });
    c.step({ type: "moveTo", key: 1 });
    expect(c.session.log).toEqual([
      { seq: 1, event: "jackIn", turn: 1, data: { key: 0 } },
      { seq: 2, event: "move", turn: 1, data: { key: 1 } },
      { seq: 3, event: "ambush", turn: 1, data: { key: 1 } },
    ]);
  });

  it("rolagens só entram no resultado, com os totais e o REZ do dano", () => {
    const c = chain({ ...start(), runnerPosition: 1 });
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    c.step({ type: "oppose", messageId: "m-def" }, GM);
    expect(c.log).toEqual([]);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "check", ability: "damage", messageId: "m-dmg" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(c.log).toEqual([
      {
        event: "outcome",
        data: { ability: "zap", outcome: "success", key: 1, total: 14, opposed: 9 },
      },
      {
        event: "outcome",
        data: {
          ability: "damage",
          outcome: "success",
          key: 1,
          total: 4,
          rezBefore: 10,
          rezAfter: 6,
        },
      },
    ]);
  });

  it("dano dispensado pelo GM", () => {
    const c = chain({ ...start(), runnerPosition: 1 });
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    c.step({ type: "oppose", messageId: "m-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    expect(c.log.at(-1)).toEqual({ event: "damageSkipped", data: {} });
  });

  it("acerto do Black ICE e dano no cérebro, sem a fórmula do GM", () => {
    const c = chain({ ...start(), runnerPosition: 1 });
    c.step({ type: "iceAttack", messageId: "m-atk" }, GM);
    c.step({ type: "oppose", messageId: "m-defense" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "iceDamage", messageId: "m-ice-dmg" }, GM);
    expect(c.log).toEqual([
      {
        event: "outcome",
        data: { ability: "iceAttack", outcome: "success", key: 1, total: 16, opposed: 10 },
      },
      { event: "iceDamage", data: { kind: "brain", taken: 7, after: 23 } },
    ]);
    expect(JSON.stringify(c.session.log)).not.toContain("2d6");
  });

  it("troca de vez, novo turno, ajuste de ações e rez de programa", () => {
    const c = chain({ ...start(), runnerPosition: 1 });
    c.step({ type: "rezProgram", programId: "p-armor", rez: true });
    c.step({ type: "endTurn" });
    c.step({ type: "endTurn" }, GM);
    c.step({ type: "adjustActions", delta: 1 }, GM);
    expect(c.log).toEqual([
      { event: "rez", data: { programId: "p-armor", rez: true } },
      { event: "turn", data: { holder: "ice" } },
      { event: "turn", data: { holder: "runner" } },
      { event: "actions", data: { delta: 1 } },
    ]);
    expect(c.session.log.map((e) => e.turn)).toEqual([1, 2, 2, 2]);
    const calm = chain(start());
    calm.step({ type: "newTurn" }, GM);
    expect(calm.log).toEqual([{ event: "newTurn", data: {} }]);
  });

  it("revelar e liberar à mão entram só com a chave do nó (sem DV nem nota)", () => {
    const c = chain(start());
    c.step({ type: "reveal", key: 3 }, GM);
    c.step({ type: "clearNode", key: 3 }, GM);
    c.step({ type: "restoreNode", key: 3 }, GM);
    expect(c.log).toEqual([
      { event: "reveal", data: { key: 3 } },
      { event: "cleared", data: { key: 3 } },
      { event: "restored", data: { key: 3 } },
    ]);
  });

  it("desfazer acrescenta uma entrada e mantém as anteriores", () => {
    const c = chain(start());
    c.step({ type: "jackIn" });
    c.step({ type: "undo" }, GM);
    expect(c.log).toEqual([
      { event: "jackIn", data: { key: 0 } },
      { event: "undo", data: { label: "jackIn" } },
    ]);
  });

  it("desfazer o dano do Black ICE não repete o dano antigo no registro", () => {
    const earlier = {
      seq: 1,
      key: 1,
      result: { kind: "none" as const, reason: "no-program" as const },
    };
    const c = chain({ ...withRun(start(), { lastIceDamage: earlier }), runnerPosition: 1 });
    c.step({ type: "iceAttack", messageId: "m-atk" }, GM);
    c.step({ type: "oppose", messageId: "m-defense" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "iceDamage", messageId: "m-ice-dmg" }, GM);
    c.step({ type: "undo" }, GM);
    expect(c.log.at(-1)).toEqual({ event: "undo", data: { label: "iceDamage" } });
    expect(c.log.filter((e) => e.event === "iceDamage")).toHaveLength(1);
  });

  it("guarda só as últimas entradas", () => {
    const c = chain(start());
    for (let i = 0; i < LOG_LIMIT + 2; i += 1) c.step({ type: "newTurn" }, GM);
    expect(c.session.log).toHaveLength(LOG_LIMIT);
    expect(c.session.log.at(-1)?.seq).toBe(LOG_LIMIT + 2);
  });

  it("ações recusadas não entram", () => {
    const c = chain(start());
    c.step({ type: "moveTo", key: 1 });
    expect(c.log).toEqual([]);
  });

  it("parser descarta entradas inválidas; sessão antiga lê registro vazio", () => {
    const ok = { seq: 1, event: "jackOut", turn: 1, data: {} };
    expect(
      parseLog([
        ok,
        { ...ok, event: "hack" },
        { ...ok, data: { note: "x".repeat(65) } },
        { ...ok, data: { nested: { a: 1 } } },
        { ...ok, seq: 0 },
      ]),
    ).toEqual([ok]);
    const raw = JSON.parse(JSON.stringify(start())) as Record<string, unknown>;
    delete raw["log"];
    expect(parseSession(raw)?.log).toEqual([]);
  });
});
