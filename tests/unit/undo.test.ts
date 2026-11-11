import { describe, expect, it } from "vitest";
import { diffFx } from "../../src/session/hud-fx";
import { parseSession, type PublicSession } from "../../src/session/session-state";
import { UNDO_LIMIT } from "../../src/session/undo";
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

function harness(extra: Partial<Harness> = {}): Harness {
  return {
    rolls: {
      "m-zap": roll(RUNNER.id, "Actor.abc", 14),
      "m-def": roll(GM.id, "Actor.ice1", 9),
      "m-dmg": roll(RUNNER.id, "Actor.abc", 4, "1d6"),
      "m-atk": roll(GM.id, "Actor.ice1", 16),
      "m-defense": roll(RUNNER.id, "Actor.abc", 10),
      "m-ice-dmg": roll(GM.id, "Actor.ice1", 9, "2d6"),
      "m-atk2": roll(GM.id, "Actor.ice2", 16),
      "m-ice2-dmg": roll(GM.id, "Actor.ice2", 14, "4d6"),
    },
    ices: {
      "Actor.ice1": {
        name: "Hellhound",
        rez: { value: 10, max: 10 },
        iceClass: "antipersonnel",
        damageFormula: "2d6",
      },
      "Actor.ice2": {
        name: "Killer",
        rez: { value: 10, max: 10 },
        iceClass: "antiprogram",
        damageFormula: "4d6",
      },
    },
    vitals: { hp: 30, brainDamageReduction: 2 },
    runner: {
      ...DECK,
      programs: [
        { itemId: "p-armor", programClass: "defender", rezzed: false, rez: 7 },
        { itemId: "p-shield", programClass: "defender", rezzed: true, rez: 3 },
      ],
    },
    ...extra,
  };
}

/** Desconectada, Password (0) vencida, Black ICE (1) vinculado. */
function start(link = "Actor.ice1"): PublicSession {
  return withRun(reveal(base(), [0, 1, 2]), { cleared: [0], ice: [{ key: 1, actorUuid: link }] });
}

function chain(h: Harness, session = start()) {
  const run = runWith(h);
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

const UNDO = { type: "undo" };

describe("desfazer (E6-07, D32)", () => {
  it("desfaz movimentos em sequência e devolve a posição", () => {
    const c = chain(harness());
    c.step({ type: "jackIn" });
    c.step({ type: "moveTo", key: 1 });
    expect(c.session.runnerPosition).toBe(1);
    expect(c.session.history.map((h) => h.label)).toEqual(["jackIn", "moveTo"]);
    const back = c.step(UNDO, GM);
    expect(back.result).toMatchObject({ ok: true });
    expect(back.effects).toEqual([]);
    expect(c.session.runnerPosition).toBe(0);
    c.step(UNDO, GM);
    expect(c.session.runnerPosition).toBeNull();
    expect(c.session.history).toEqual([]);
    expect(c.step(UNDO, GM).result).toMatchObject({ error: "nothing-to-undo" });
  });

  it("só o GM desfaz; revelar e ocultar não entram no histórico", () => {
    const c = chain(harness());
    c.step({ type: "jackIn" });
    expect(c.step(UNDO).result).toMatchObject({ error: "not-authorized" });
    c.step({ type: "reveal", key: 3 }, GM);
    expect(c.session.history.map((h) => h.label)).toEqual(["jackIn"]);
    c.step(UNDO, GM);
    // Nós descobertos ficam como estão.
    expect(c.session.netArch?.discovered.map((f) => f.key)).toContain(3);
  });

  it("guarda no máximo o limite de passos", () => {
    const c = chain(harness());
    for (let i = 0; i < UNDO_LIMIT + 2; i += 1) c.step({ type: "newTurn" }, GM);
    expect(c.session.history).toHaveLength(UNDO_LIMIT);
  });

  it("desfaz o dano no Black ICE com o REZ anterior e mantém a rolagem usada", () => {
    const c = chain(harness(), { ...start(), runnerPosition: 1 });
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    c.step({ type: "oppose", messageId: "m-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "check", ability: "damage", messageId: "m-dmg" });
    const applied = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(applied.effects).toEqual([
      { type: "setIceRez", actorUuid: "Actor.ice1", value: 6, before: 10 },
    ]);
    const undone = c.step(UNDO, GM);
    expect(undone.effects).toEqual([
      { type: "setIceRez", actorUuid: "Actor.ice1", value: 10, before: 6 },
    ]);
    expect(c.session.run.pending).toMatchObject({ ability: "damage" });
    c.step(UNDO, GM);
    expect(c.session.run.pending).toBeNull();
    expect(c.session.run.awaitingDamage).toBe(1);
    expect(c.step({ type: "check", ability: "damage", messageId: "m-dmg" }).result).toMatchObject({
      error: "invalid-roll",
    });
  });

  it("desfaz o dano do Black ICE no HP e devolve o acerto pendente", () => {
    const c = chain(harness(), { ...start(), runnerPosition: 1 });
    c.step({ type: "iceAttack", messageId: "m-atk" }, GM);
    c.step({ type: "oppose", messageId: "m-defense" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "iceDamage", messageId: "m-ice-dmg" }, GM);
    const undone = c.step(UNDO, GM);
    expect(undone.effects).toEqual([
      { type: "setRunnerHp", actorUuid: "Actor.abc", value: 30, before: 23 },
    ]);
    expect(c.session.run.iceHit).toMatchObject({ target: { kind: "brain", hpBase: 30 } });
  });

  it("desfaz programa neutralizado: REZ, rez e marca de volta", () => {
    const c = chain(harness(), { ...start("Actor.ice2"), runnerPosition: 1 });
    c.step({ type: "iceAttack", messageId: "m-atk2" }, GM);
    c.step({ type: "oppose", messageId: "m-defense" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "iceDamage", messageId: "m-ice2-dmg" }, GM);
    expect(c.step(UNDO, GM).effects).toEqual([
      {
        type: "setProgramState",
        actorUuid: "Actor.abc",
        programId: "p-shield",
        state: { rezzed: true, rezValue: 3, mark: "none" },
        before: { rezzed: false, rezValue: 0, mark: "neutralized" },
      },
    ]);
  });

  it("desfaz rezzar programa e devolve a ação", () => {
    const c = chain(harness());
    c.step({ type: "jackIn" });
    c.step({ type: "rezProgram", programId: "p-armor", rez: true });
    expect(c.session.run.actionsUsed).toBe(2);
    const undone = c.step(UNDO, GM);
    expect(undone.effects).toMatchObject([
      { type: "setProgramState", programId: "p-armor", state: { rezzed: false } },
    ]);
    expect(c.session.run.actionsUsed).toBe(1);
  });

  it("reenvio do desfazer após falha ao gravar reaplica os mesmos valores", () => {
    const h = harness();
    const c = chain(h, { ...start(), runnerPosition: 1 });
    c.step({ type: "iceAttack", messageId: "m-atk" }, GM);
    c.step({ type: "oppose", messageId: "m-defense" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "iceDamage", messageId: "m-ice-dmg" }, GM);
    const s = c.session;
    const first = runWith(h)(s, request(s, UNDO, "u1"), GM);
    h.vitals = { hp: 30, brainDamageReduction: 2 };
    const retry = runWith(h)(s, request(s, UNDO, "u1"), GM);
    expect(retry.effects).toEqual(first.effects);
  });

  it("não reanima resultados antigos e mostra a faixa de desfeito", () => {
    const c = chain(harness(), { ...start(), runnerPosition: 1 });
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    c.step({ type: "oppose", messageId: "m-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    // GM dispensa o dano.
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    const before = c.session;
    c.step(UNDO, GM);
    expect(diffFx(before, c.session).banner).toBe("undo");
    const prev = c.session;
    c.step(UNDO, GM);
    expect(diffFx(prev, c.session).banner).toBe("undo");
  });

  it("recusa voltar para um nó que foi ocultado", () => {
    // Black ICE já derrotado: a Netrunner pode subir de volta.
    const c = chain(harness(), withRun(start(), { cleared: [0, 1] }));
    c.step({ type: "jackIn" });
    c.step({ type: "moveTo", key: 1 });
    c.step({ type: "moveTo", key: 0 });
    c.step({ type: "conceal", key: 1 }, GM);
    expect(c.step(UNDO, GM).result).toMatchObject({ error: "invalid-target" });
  });
});

describe("devolver/tirar ação NET (E6-07)", () => {
  it("GM ajusta o contador dentro dos limites e pode desfazer", () => {
    const c = chain(harness());
    c.step({ type: "jackIn" });
    c.step({ type: "rezProgram", programId: "p-armor", rez: true });
    c.step({ type: "adjustActions", delta: -1 }, GM);
    c.step({ type: "adjustActions", delta: -1 }, GM);
    expect(c.session.run.actionsUsed).toBe(0);
    expect(c.step({ type: "adjustActions", delta: -1 }, GM).result).toMatchObject({ ok: true });
    expect(c.session.run.actionsUsed).toBe(0);
    for (let i = 0; i < 5; i += 1) c.step({ type: "adjustActions", delta: 1 }, GM);
    // Interface 4 → 3 ações por turno.
    expect(c.session.run.actionsUsed).toBe(3);
    expect(c.step({ type: "adjustActions", delta: 1 }).result).toMatchObject({
      error: "not-authorized",
    });
    expect(c.session.history.at(-1)?.label).toBe("adjustActions");
  });

  it("recusa delta inválido", () => {
    const c = chain(harness());
    expect(c.step({ type: "adjustActions", delta: 2 }, GM).result).toMatchObject({
      error: "invalid-request",
    });
  });
});

describe("histórico na sessão gravada", () => {
  it("sessões antigas recebem histórico vazio; entradas inválidas são descartadas", () => {
    const raw = JSON.parse(JSON.stringify(base())) as Record<string, unknown>;
    delete raw["history"];
    expect(parseSession(raw)?.history).toEqual([]);
    const c = chain(harness());
    c.step({ type: "jackIn" });
    const stored = JSON.parse(JSON.stringify(c.session)) as { history: unknown[] };
    stored.history.push({ label: "x", runnerPosition: "bad" });
    const parsed = parseSession(stored);
    expect(parsed?.history).toHaveLength(1);
    expect(parsed?.history[0]).toMatchObject({ label: "jackIn", runnerPosition: null });
  });
});
