import { describe, expect, it } from "vitest";
import { diffFx } from "../../src/session/hud-fx";
import type { PendingCheck, PublicSession } from "../../src/session/session-state";
import {
  base,
  GM,
  type Harness,
  request,
  reveal,
  runWith,
  withRun,
} from "../fixtures/requests-harness";

const NONE = { nodes: {}, banner: null, alert: null };

const pending = (over: Partial<PendingCheck>): PendingCheck => ({
  rezBefore: null,
  ability: "backdoor",
  key: 0,
  total: 10,
  messageId: "m1",
  userId: "u",
  opposed: null,
  rezAfter: null,
  programId: null,
  ...over,
});

const outcome = (seq: number, ability: PendingCheck["ability"], key: number, ok: boolean) => ({
  seq,
  ability,
  key,
  outcome: ok ? ("success" as const) : ("failure" as const),
});

describe("lastOutcome no estado público", () => {
  it("resolveCheck grava o resultado decidido com sequência crescente", () => {
    const harness: Harness = { rolls: {}, ices: {} };
    const run = runWith(harness);
    const s = withRun({ ...reveal(base(), [0]), runnerPosition: 0 }, { pending: pending({}) });
    const first = run(s, request(s, { type: "resolveCheck", outcome: "failure" }), GM).session;
    expect(first?.run.lastOutcome).toEqual(outcome(1, "backdoor", 0, false));
    if (!first) throw new Error("esperava sessão");
    const again = withRun(first, { pending: pending({ messageId: "m2" }) });
    const second = run(
      again,
      request(again, { type: "resolveCheck", outcome: "success" }, "r2"),
      GM,
    ).session;
    expect(second?.run.lastOutcome).toEqual(outcome(2, "backdoor", 0, true));
  });
});

describe("diffFx", () => {
  const start = (): PublicSession => reveal(base(), [1, 2]);

  it("primeira abertura ou outra sessão não animam", () => {
    expect(diffFx(null, start())).toEqual(NONE);
    expect(diffFx({ ...start(), id: "outra" }, start())).toEqual(NONE);
  });

  it("nó revelado faz varredura", () => {
    expect(diffFx(start(), reveal(start(), [3])).nodes).toEqual({ 3: "scan" });
  });

  it("Jack In, movimento e Jack Out", () => {
    const outside = start();
    const inside = { ...reveal(outside, [0]), runnerPosition: 0 };
    expect(diffFx(outside, inside)).toMatchObject({
      nodes: { 0: "jack-in" },
      banner: "jack-in",
    });
    const moved = withRun({ ...inside, runnerPosition: 2 }, {});
    expect(diffFx(inside, moved).nodes).toEqual({ 2: "move" });
    expect(diffFx(inside, { ...inside, runnerPosition: null }).banner).toBe("jack-out");
  });

  it("chegar a um Black ICE ativo dispara alerta; driblado não", () => {
    const before = withRun({ ...reveal(start(), [0]), runnerPosition: 0 }, { cleared: [0] });
    const atIce = { ...before, runnerPosition: 1 };
    expect(diffFx(before, atIce)).toEqual({
      nodes: { 1: "ice-alert" },
      banner: "ice-alert",
      alert: "ice-alert",
    });
    const evaded = withRun(atIce, { evaded: [1] });
    expect(diffFx(withRun(before, { evaded: [1] }), evaded).alert).toBeNull();
  });

  it("ataque do Black ICE iniciado alerta todos", () => {
    const atIce = withRun({ ...start(), runnerPosition: 1 }, {});
    const attacked = withRun(atIce, { pending: pending({ ability: "iceAttack", key: 1 }) });
    expect(diffFx(atIce, attacked)).toMatchObject({ alert: "ice-alert", banner: "ice-attack" });
  });

  it("resultados decididos: Backdoor vence, Control vence, falha", () => {
    const s = withRun({ ...reveal(start(), [0, 3]), runnerPosition: 0 }, {});
    const broke = withRun(s, { cleared: [0], lastOutcome: outcome(1, "backdoor", 0, true) });
    expect(diffFx(s, broke)).toMatchObject({ nodes: { 0: "breach" }, banner: "breach" });
    const ctrl = withRun(s, { cleared: [3], lastOutcome: outcome(1, "control", 3, true) });
    expect(diffFx(s, ctrl)).toMatchObject({ nodes: { 3: "control" }, banner: "control" });
    const failed = withRun(s, { lastOutcome: outcome(1, "backdoor", 0, false) });
    expect(diffFx(s, failed)).toEqual({ nodes: { 0: "fail" }, banner: "fail", alert: "fail" });
  });

  it("Zap acerta, dano derruba, Slide dribla, Black ICE acerta ou erra", () => {
    const s = withRun({ ...start(), runnerPosition: 1 }, {});
    expect(diffFx(s, withRun(s, { lastOutcome: outcome(1, "zap", 1, true) }))).toMatchObject({
      nodes: { 1: "hit" },
      banner: "zap-hit",
    });
    const damaged = withRun(s, { lastOutcome: outcome(1, "damage", 1, true) });
    expect(diffFx(s, damaged)).toMatchObject({ nodes: { 1: "hit" }, banner: "damage" });
    const derez = withRun(s, { cleared: [1], lastOutcome: outcome(1, "damage", 1, true) });
    expect(diffFx(s, derez)).toMatchObject({ nodes: { 1: "derez" }, banner: "derez" });
    const slid = withRun(s, { evaded: [1], lastOutcome: outcome(1, "slide", 1, true) });
    expect(diffFx(s, slid).banner).toBe("evade");
    expect(diffFx(s, withRun(s, { lastOutcome: outcome(1, "iceAttack", 1, true) }))).toMatchObject({
      banner: "ice-hit",
      alert: "fail",
    });
    expect(diffFx(s, withRun(s, { lastOutcome: outcome(1, "iceAttack", 1, false) })).banner).toBe(
      "ice-miss",
    );
  });

  it("mesmo resultado em outra atualização não repete a animação", () => {
    const s = withRun(
      { ...start(), runnerPosition: 1 },
      { lastOutcome: outcome(1, "zap", 1, true) },
    );
    expect(diffFx(s, { ...s, revision: s.revision + 1 })).toEqual(NONE);
  });

  it("GM libera um nó à mão e novo turno", () => {
    const s = withRun({ ...reveal(start(), [0]), runnerPosition: 2 }, {});
    expect(diffFx(s, withRun(s, { cleared: [1] }))).toMatchObject({
      nodes: { 1: "derez" },
      banner: "derez",
    });
    expect(diffFx(s, withRun(s, { turn: 2 })).banner).toBe("new-turn");
  });
});
