import { describe, expect, it } from "vitest";
import { checkAction, checkProgramRez } from "../../src/domain/net-rules";
import { turnHolder } from "../../src/session/combat-turn";
import { diffFx } from "../../src/session/hud-fx";
import { parseSession, type PublicSession, toRunState } from "../../src/session/session-state";
import {
  arch,
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
      "m-zap2": roll(RUNNER.id, "Actor.abc", 12),
      "m-zap3": roll(RUNNER.id, "Actor.abc", 11),
      "m-def": roll(GM.id, "Actor.ice1", 9),
      "m-def2": roll(GM.id, "Actor.ice1", 15),
      "m-def3": roll(GM.id, "Actor.ice1", 16),
      "m-def4": roll(GM.id, "Actor.ice1", 17),
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
    vitals: { hp: 30, brainDamageReduction: 0 },
    runner: {
      ...DECK,
      programs: [{ itemId: "p-armor", programClass: "defender", rezzed: false, rez: 7 }],
    },
  };
}

/** Conectada no Password (0) vencido, ao lado do Black ICE (1) vinculado. Interface 4 = 3 ações. */
function start(run: Partial<PublicSession["run"]> = {}): PublicSession {
  return {
    ...withRun(reveal(base(), [0, 1, 2]), {
      cleared: [0],
      ice: [{ key: 1, actorUuid: "Actor.ice1" }],
      ...run,
    }),
    runnerPosition: 0,
  };
}

function chain(session: PublicSession) {
  const run = runWith(harness());
  let current = session;
  let n = 0;
  return {
    get session() {
      return current;
    },
    step(action: unknown, sender = RUNNER) {
      n += 1;
      const outcome = run(current, request(current, action, `s${n}`), sender);
      if (outcome.session) current = outcome.session;
      return outcome;
    },
  };
}

/** Zap falho: gasta 1 ação e nada fica pendente. */
function missedZap(c: ReturnType<typeof chain>, zap: string, def: string) {
  c.step({ type: "check", ability: "zap", messageId: zap });
  c.step({ type: "oppose", messageId: def }, GM);
  c.step({ type: "resolveCheck", outcome: "failure" }, GM);
}

/** Black ICE ataca e erra. */
function missedAttack(c: ReturnType<typeof chain>) {
  c.step({ type: "iceAttack", messageId: "m-atk" }, GM);
  c.step({ type: "oppose", messageId: "m-defense" });
  c.step({ type: "resolveCheck", outcome: "failure" }, GM);
}

describe("vez no combate (E6-08, D33)", () => {
  it("fora do combate não há vez", () => {
    const c = chain(start());
    expect(turnHolder(c.session)).toBeNull();
    c.step({ type: "endTurn" });
    expect(c.step({ type: "endTurn" }).result).toMatchObject({ error: "not-engaged" });
  });

  it("entrar no nó do Black ICE com ações sobrando mantém a vez da Netrunner", () => {
    const c = chain(start());
    c.step({ type: "moveTo", key: 1 });
    expect(turnHolder(c.session)).toBe("runner");
    expect(c.session.run.iceTurn).toBe(false);
  });

  it("gastar a última ação passa a vez ao Black ICE e abre nova rodada", () => {
    const c = chain({ ...start(), runnerPosition: 1 });
    missedZap(c, "m-zap", "m-def2");
    missedZap(c, "m-zap2", "m-def3");
    expect(turnHolder(c.session)).toBe("runner");
    c.step({ type: "check", ability: "zap", messageId: "m-zap3" });
    // Pendente: a vez espera o GM decidir.
    expect(c.session.run.iceTurn).toBe(false);
    c.step({ type: "oppose", messageId: "m-def4" }, GM);
    expect(c.session.run.iceTurn).toBe(false);
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    expect(turnHolder(c.session)).toBe("ice");
    expect(c.session.run.turn).toBe(2);
  });

  it("o dano do Zap vencido segura a vez até ser resolvido", () => {
    const c = chain({ ...start({ actionsUsed: 2 }), runnerPosition: 1 });
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    c.step({ type: "oppose", messageId: "m-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(c.session.run.awaitingDamage).toBe(1);
    expect(c.session.run.iceTurn).toBe(false);
    c.step({ type: "check", ability: "damage", messageId: "m-dmg" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(turnHolder(c.session)).toBe("ice");
  });

  it("na vez do Black ICE a Netrunner não age, mas rola a Defense", () => {
    const c = chain({ ...start({ iceTurn: true }), runnerPosition: 1 });
    expect(c.step({ type: "jackOut" }).result).toMatchObject({ error: "ice-turn" });
    expect(c.step({ type: "check", ability: "zap", messageId: "m-zap" }).result).toMatchObject({
      error: "ice-turn",
    });
    expect(c.step({ type: "rezProgram", programId: "p-armor", rez: true }).result).toMatchObject({
      error: "ice-turn",
    });
    expect(c.step({ type: "endTurn" }).result).toMatchObject({ error: "ice-turn" });
    c.step({ type: "iceAttack", messageId: "m-atk" }, GM);
    expect(c.step({ type: "oppose", messageId: "m-defense" }).result).toMatchObject({ ok: true });
  });

  it("ataque do Black ICE resolvido devolve a vez com as ações recarregadas", () => {
    const c = chain({ ...start({ iceTurn: true, actionsUsed: 3, turn: 2 }), runnerPosition: 1 });
    missedAttack(c);
    expect(turnHolder(c.session)).toBe("runner");
    expect(c.session.run.actionsUsed).toBe(0);
    expect(c.session.run.turn).toBe(2);
  });

  it("acerto do Black ICE: a vez volta depois do dano aplicado ou dispensado", () => {
    const hit = (c: ReturnType<typeof chain>) => {
      c.step({ type: "iceAttack", messageId: "m-atk" }, GM);
      c.step({ type: "oppose", messageId: "m-defense" });
      c.step({ type: "resolveCheck", outcome: "success" }, GM);
    };
    const applied = chain({ ...start({ iceTurn: true, actionsUsed: 3 }), runnerPosition: 1 });
    hit(applied);
    expect(applied.session.run.iceTurn).toBe(true);
    applied.step({ type: "iceDamage", messageId: "m-ice-dmg" }, GM);
    expect(turnHolder(applied.session)).toBe("runner");

    const skipped = chain({ ...start({ iceTurn: true, actionsUsed: 3 }), runnerPosition: 1 });
    hit(skipped);
    skipped.step({ type: "resolveCheck", outcome: "failure" }, GM);
    expect(turnHolder(skipped.session)).toBe("runner");
  });

  it("Netrunner encerra a própria vez; só o GM passa a vez do Black ICE", () => {
    const c = chain({ ...start(), runnerPosition: 1 });
    expect(c.step({ type: "endTurn" }).result).toMatchObject({ ok: true });
    expect(turnHolder(c.session)).toBe("ice");
    expect(c.session.run.turn).toBe(2);
    expect(c.step({ type: "endTurn" }, GM).result).toMatchObject({ ok: true });
    expect(turnHolder(c.session)).toBe("runner");
  });

  it("não encerra a vez com algo pendente", () => {
    const c = chain({ ...start(), runnerPosition: 1 });
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    expect(c.step({ type: "endTurn" }).result).toMatchObject({ error: "check-pending" });
  });

  it("combate encerrado na vez do Black ICE recarrega as ações", () => {
    const c = chain({ ...start({ iceTurn: true, actionsUsed: 3 }), runnerPosition: 1 });
    c.step({ type: "clearNode", key: 1 }, GM);
    expect(turnHolder(c.session)).toBeNull();
    expect(c.session.run.iceTurn).toBe(false);
    expect(c.session.run.actionsUsed).toBe(0);
  });

  it("novo turno do GM em combate abre pela vez do Black ICE; fora dele, não", () => {
    const fight = chain({ ...start(), runnerPosition: 1 });
    fight.step({ type: "newTurn" }, GM);
    expect(turnHolder(fight.session)).toBe("ice");
    const calm = chain(start());
    calm.step({ type: "newTurn" }, GM);
    expect(calm.session.run.iceTurn).toBe(false);
  });

  it("desfazer restaura a vez exata", () => {
    const c = chain({ ...start(), runnerPosition: 1 });
    c.step({ type: "endTurn" });
    c.step({ type: "undo" }, GM);
    expect(turnHolder(c.session)).toBe("runner");
    expect(c.session.run.turn).toBe(1);
  });

  it("o motor recusa as ações da Netrunner na vez do Black ICE", () => {
    const session = { ...start({ iceTurn: true }), runnerPosition: 1 };
    const rules = {
      runner: harness().runner ?? DECK,
      run: toRunState(session),
      hasEntry: true,
      nodes: arch().floors,
    };
    expect(checkAction(rules, "zap")).toEqual({ allowed: false, reason: "ice-turn" });
    expect(checkAction(rules, "jackOut")).toEqual({ allowed: false, reason: "ice-turn" });
    expect(checkProgramRez(rules, "p-armor", true)).toEqual({ allowed: false, reason: "ice-turn" });
  });

  it("sessão antiga sem o campo lê vez da Netrunner", () => {
    const raw = JSON.parse(JSON.stringify(start())) as { run: Record<string, unknown> };
    delete raw.run["iceTurn"];
    expect(parseSession(raw)?.run.iceTurn).toBe(false);
  });

  it("faixas de vez para quem está no combate", () => {
    const prev = { ...start(), runnerPosition: 1 };
    const ice = withRun(prev, { iceTurn: true, turn: 2 });
    expect(diffFx(prev, ice).banner).toBe("ice-turn");
    expect(diffFx(ice, withRun(ice, { iceTurn: false, actionsUsed: 0 })).banner).toBe(
      "runner-turn",
    );
  });
});
