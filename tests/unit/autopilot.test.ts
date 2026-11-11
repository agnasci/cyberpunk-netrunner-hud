import { describe, expect, it } from "vitest";
import { nextAutoStep, shouldReact } from "../../src/session/autopilot";
import type { PublicSession } from "../../src/session/session-state";
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

const ICE = {
  name: "Hellhound",
  rez: { value: 10, max: 10 },
  iceClass: "antipersonnel" as const,
  damageFormula: "2d6",
};

function harness(): Harness {
  return {
    rolls: {
      "m-zap": roll(RUNNER.id, "Actor.abc", 14),
      "m-slide": roll(RUNNER.id, "Actor.abc", 12),
      "m-def": roll(GM.id, "Actor.ice1", 9),
      "m-backdoor": roll(RUNNER.id, "Actor.abc", 7),
      "m-low": roll(RUNNER.id, "Actor.abc", 5),
      "m-dmg": roll(RUNNER.id, "Actor.abc", 4, "1d6"),
      "m-atk": roll(GM.id, "Actor.ice1", 16),
      "m-defense": roll(RUNNER.id, "Actor.abc", 10),
    },
    ices: { "Actor.ice1": ICE },
    vitals: { hp: 30, brainDamageReduction: 0 },
    runner: DECK,
  };
}

const input = {
  dvOf: (key: number) => {
    const dv = arch().floors.find((f) => f.key === key)?.dv;
    return typeof dv === "number" ? dv : null;
  },
  readIce: (uuid: string) => (uuid === "Actor.ice1" ? ICE : null),
};

/** Conectada; Password (0, DV 6) aberta; Black ICE (1) vinculado. */
function start(position: number, cleared: number[] = []): PublicSession {
  return {
    ...withRun(reveal(base(), [0, 1, 2]), { cleared, ice: [{ key: 1, actorUuid: "Actor.ice1" }] }),
    runnerPosition: position,
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

describe("modo sem confirmação do mestre (E6-10, D35)", () => {
  it("nada pendente: nenhum passo", () => {
    expect(nextAutoStep(start(1, [0]), input)).toBeNull();
  });

  it("Zap enviado: rola a DEF do Black ICE; com as duas, aplica a sugestão", () => {
    const c = chain(start(1, [0]));
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    expect(nextAutoStep(c.session, input)).toEqual({
      kind: "rollIce",
      key: `${c.session.id}:m-zap:oppose`,
      link: "Actor.ice1",
      stat: "def",
    });
    c.step({ type: "oppose", messageId: "m-def" }, GM);
    expect(nextAutoStep(c.session, input)).toMatchObject({ kind: "resolve", outcome: "success" });
  });

  it("Slide rola a PER do Black ICE", () => {
    const c = chain(start(1, [0]));
    c.step({ type: "check", ability: "slide", messageId: "m-slide" });
    expect(nextAutoStep(c.session, input)).toMatchObject({ kind: "rollIce", stat: "per" });
  });

  it("checagem contra DV: aplica o resultado pela DV da arquitetura", () => {
    const pass = chain(start(0));
    pass.step({ type: "check", ability: "backdoor", messageId: "m-backdoor" });
    expect(nextAutoStep(pass.session, input)).toMatchObject({
      kind: "resolve",
      outcome: "success",
    });
    const fail = chain(start(0));
    fail.step({ type: "check", ability: "backdoor", messageId: "m-low" });
    expect(nextAutoStep(fail.session, input)).toMatchObject({
      kind: "resolve",
      outcome: "failure",
    });
  });

  it("sem DV não há sugestão: o mestre confirma", () => {
    const c = chain(start(0));
    c.step({ type: "check", ability: "backdoor", messageId: "m-backdoor" });
    expect(nextAutoStep(c.session, { ...input, dvOf: () => null })).toBeNull();
  });

  it("dano do Zap rolado pela Netrunner é aplicado; a rolagem dela não é automática", () => {
    const c = chain(start(1, [0]));
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    c.step({ type: "oppose", messageId: "m-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(c.session.run.awaitingDamage).toBe(1);
    expect(nextAutoStep(c.session, input)).toBeNull();
    c.step({ type: "check", ability: "damage", messageId: "m-dmg" });
    expect(nextAutoStep(c.session, input)).toMatchObject({ kind: "resolve", outcome: "success" });
  });

  it("ataque do Black ICE: espera a Defense; depois aplica e rola o dano do acerto", () => {
    const c = chain(start(1, [0]));
    c.step({ type: "iceAttack", messageId: "m-atk" }, GM);
    expect(nextAutoStep(c.session, input)).toBeNull();
    c.step({ type: "oppose", messageId: "m-defense" });
    expect(nextAutoStep(c.session, input)).toMatchObject({ kind: "resolve", outcome: "success" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(nextAutoStep(c.session, input)).toEqual({
      kind: "rollIceDamage",
      key: `${c.session.id}:${c.session.revision}:iceDamage`,
      link: "Actor.ice1",
      formula: "2d6",
    });
  });

  it("sem vínculo ou sem fórmula, o mestre faz à mão", () => {
    const c = chain(start(1, [0]));
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    expect(nextAutoStep({ ...c.session, run: { ...c.session.run, ice: [] } }, input)).toBeNull();
    const hit = chain(start(1, [0]));
    hit.step({ type: "iceAttack", messageId: "m-atk" }, GM);
    hit.step({ type: "oppose", messageId: "m-defense" });
    hit.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(
      nextAutoStep(hit.session, { ...input, readIce: () => ({ ...ICE, damageFormula: null }) }),
    ).toBeNull();
  });

  it("reage só a transições novas, nunca ao desfazer", () => {
    const c = chain(start(1, [0]));
    const first = c.session;
    expect(shouldReact(null, first)).toBe(false);
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    const sent = c.session;
    expect(shouldReact(first, sent)).toBe(true);
    expect(shouldReact(sent, sent)).toBe(false);
    c.step({ type: "undo" }, GM);
    expect(shouldReact(sent, c.session)).toBe(false);
    expect(shouldReact(sent, { ...sent, id: "other" })).toBe(false);
  });
});
