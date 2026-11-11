import { describe, expect, it } from "vitest";
import { BUILTIN_ICE, builtinById } from "../../src/domain/builtin-ice";
import type { PublicSession } from "../../src/session/session-state";

describe("Black ICE básicos (E6-12, D38, D41)", () => {
  it("lista vem só da cópia local; vazia ou com ids e nomes únicos e efeito curto", () => {
    expect(new Set(BUILTIN_ICE.map((b) => b.id)).size).toBe(BUILTIN_ICE.length);
    expect(new Set(BUILTIN_ICE.map((b) => b.name.toLowerCase())).size).toBe(BUILTIN_ICE.length);
    for (const b of BUILTIN_ICE) {
      if (b.damage !== null) expect(b.damage).toMatch(/^[0-9]+d6$/);
      expect(b.effect.length).toBeLessThan(200);
    }
    expect(builtinById("nope")).toBeNull();
  });
});

describe("Black ICE sem dano em dados (E6-12)", () => {
  it("acerto vira efeito especial do GM, sem dano pendente", async () => {
    const h = await import("../fixtures/requests-harness");
    const run = h.runWith({
      rolls: {
        "m-atk": { authorId: h.GM.id, actorUuid: "Actor.asp", total: 18, formula: null },
        "m-def": { authorId: h.RUNNER.id, actorUuid: "Actor.abc", total: 5, formula: null },
      },
      ices: {
        "Actor.asp": {
          name: "Asp",
          rez: { value: 15, max: 15 },
          iceClass: "antipersonnel",
          damageFormula: null,
          specialOnly: true,
        },
      },
      vitals: { hp: 30, brainDamageReduction: 0 },
    });
    let s: PublicSession = {
      ...h.withRun(h.reveal(h.base(), [0, 1]), {
        cleared: [0],
        ice: [{ key: 1, actorUuid: "Actor.asp" }],
      }),
      runnerPosition: 1,
    };
    const step = (action: unknown, sender = h.RUNNER, id = "x") => {
      const out = run(s, h.request(s, action, id), sender);
      if (out.session) s = out.session;
    };
    step({ type: "iceAttack", messageId: "m-atk" }, h.GM, "a");
    step({ type: "oppose", messageId: "m-def" }, h.RUNNER, "b");
    step({ type: "resolveCheck", outcome: "success" }, h.GM, "c");
    expect(s.run.iceHit).toBeNull();
    expect(s.run.lastIceDamage?.result).toEqual({ kind: "none", reason: "manual" });
  });
});
