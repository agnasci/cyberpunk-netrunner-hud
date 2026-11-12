import { describe, expect, it } from "vitest";
import { commitOutcome } from "../../src/session/commit";
import type { ProcessOutcome, SheetEffect } from "../../src/session/requests";
import { base } from "../fixtures/requests-harness";

const effect: SheetEffect = { type: "setIceRez", actorUuid: "Actor.ice1", value: 6, before: 10 };

function outcome(over: Partial<ProcessOutcome> = {}): ProcessOutcome {
  return {
    result: { requestId: "r1", ok: true, revision: 2 },
    session: { ...base(), revision: 2 },
    processedKey: "u:r1",
    ended: false,
    effects: [effect],
    ...over,
  };
}

function fakeWorld() {
  const sheet = { rez: 10, applied: 0 };
  const writes: unknown[] = [];
  const flags = { failEffect: false, failWrite: false };
  return {
    sheet,
    writes,
    flags,
    deps: {
      applyEffect: async (e: SheetEffect) => {
        if (flags.failEffect) throw new Error("sem permissão");
        if (e.type === "setIceRez") sheet.rez = e.value;
        sheet.applied += 1;
      },
      write: async (s: unknown) => {
        if (flags.failWrite) throw new Error("servidor caiu");
        writes.push(s);
      },
    },
  };
}

describe("commitOutcome (D20/D26)", () => {
  it("aplica efeitos antes de gravar a sessão e memoriza o resultado", async () => {
    const w = fakeWorld();
    const out = await commitOutcome(outcome(), w.deps);
    expect(out.result.ok).toBe(true);
    expect(out.remember).toBe(true);
    expect(w.sheet).toEqual({ rez: 6, applied: 1 });
    expect(w.writes).toHaveLength(1);
  });

  it("efeito falha: não grava a sessão nem memoriza", async () => {
    const w = fakeWorld();
    w.flags.failEffect = true;
    const out = await commitOutcome(outcome(), w.deps);
    expect(out.result).toMatchObject({ ok: false, error: "effect-failed" });
    expect(out.remember).toBe(false);
    expect(w.writes).toHaveLength(0);
    expect(w.sheet.rez).toBe(10);
  });

  it("gravação falha depois do efeito: reenvio reaplica o mesmo valor, sem dano em dobro", async () => {
    const w = fakeWorld();
    w.flags.failWrite = true;
    const first = await commitOutcome(outcome(), w.deps);
    expect(first.result).toMatchObject({ ok: false, error: "write-failed" });
    expect(first.remember).toBe(false);
    w.flags.failWrite = false;
    const retry = await commitOutcome(outcome(), w.deps);
    expect(retry.result.ok).toBe(true);
    expect(w.sheet.rez).toBe(6);
    expect(w.writes).toHaveLength(1);
  });

  it("encerramento grava nulo; rejeição não grava nada e é memorizada", async () => {
    const w = fakeWorld();
    await commitOutcome(outcome({ session: null, ended: true, effects: [] }), w.deps);
    expect(w.writes).toEqual([null]);
    const rejected = await commitOutcome(
      outcome({
        result: { requestId: "r2", ok: false, error: "engaged", revision: 2 },
        session: null,
        effects: [],
      }),
      w.deps,
    );
    expect(rejected.remember).toBe(true);
    expect(w.writes).toHaveLength(1);
  });
});
