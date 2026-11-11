import { describe, expect, it } from "vitest";
import type { PublicSession } from "../../src/session/session-state";
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

const roll = (
  authorId: string,
  actorUuid: string,
  total: number,
  formula: string | null = null,
) => ({ authorId, actorUuid, total, formula });

const HARNESS: Harness = {
  rolls: {
    "m-zap": roll(RUNNER.id, "Actor.abc", 14),
    "m-slide": roll(RUNNER.id, "Actor.abc", 11),
    "m-def": roll(GM.id, "Actor.ice1", 12),
    "m-per": roll(GM.id, "Actor.ice1", 15),
    "m-atk": roll(GM.id, "Actor.ice1", 16),
    "m-atk-runner": roll(RUNNER.id, "Actor.ice1", 16),
    "m-def-other": roll(GM.id, "Actor.ice2", 12),
    "m-defense": roll(RUNNER.id, "Actor.abc", 10),
    "m-dmg": roll(RUNNER.id, "Actor.abc", 4, "1d6"),
    "m-dmg-big": roll(RUNNER.id, "Actor.abc", 5, "1d6"),
    "m-dmg-2d6": roll(RUNNER.id, "Actor.abc", 9, "2d6"),
  },
  ices: {
    "Actor.ice1": { name: "Hellhound", rez: { value: 10, max: 10 } },
    "Actor.ice2": { name: "Wisp", rez: { value: 3, max: 10 } },
  },
};

/** Netrunner no nó Black ICE (chave 1), Password já vencida, Black ICE vinculado. */
function atIce(link: string | null = "Actor.ice1"): PublicSession {
  return withRun(
    { ...reveal(base(), [0, 1, 2]), runnerPosition: 1 },
    { cleared: [0], ice: link ? [{ key: 1, actorUuid: link }] : [] },
  );
}

const act = (s: PublicSession, action: unknown, id = "r1") => request(s, action, id);

/** Encadeia passos sobre a sessão resultante, com requestIds distintos. */
function chain(run: ReturnType<typeof runWith>, start: PublicSession = atIce()) {
  let session = start;
  let n = 0;
  return {
    step(action: unknown, sender = RUNNER) {
      n += 1;
      const outcome = run(session, act(session, action, `s${n}`), sender);
      if (outcome.session) session = outcome.session;
      return outcome;
    },
  };
}

describe("vínculo do Black ICE (D25)", () => {
  it("GM vincula e troca o ator de um nó Black ICE revelado", () => {
    const c = chain(runWith(HARNESS), atIce(null));
    const linked = c.step({ type: "linkIce", key: 1, actorUuid: "Actor.ice1" }, GM);
    expect(linked.session?.run.ice).toEqual([{ key: 1, actorUuid: "Actor.ice1" }]);
    const swapped = c.step({ type: "linkIce", key: 1, actorUuid: "Actor.ice2" }, GM);
    expect(swapped.session?.run.ice).toEqual([{ key: 1, actorUuid: "Actor.ice2" }]);
  });

  it("recusa nó que não é Black ICE, ator que não é Black ICE e Netrunner", () => {
    const c = chain(runWith(HARNESS), atIce(null));
    expect(c.step({ type: "linkIce", key: 0, actorUuid: "Actor.ice1" }, GM).result).toMatchObject({
      error: "invalid-target",
    });
    expect(c.step({ type: "linkIce", key: 1, actorUuid: "Actor.abc" }, GM).result).toMatchObject({
      error: "invalid-target",
    });
    expect(c.step({ type: "linkIce", key: 1, actorUuid: "Actor.ice1" }).result).toMatchObject({
      error: "not-authorized",
    });
  });
});

describe("Zap e dano no REZ", () => {
  it("disputa completa: Zap → DEF do GM → sucesso → dano → efeito absoluto no REZ", () => {
    const c = chain(runWith(HARNESS));
    const zap = c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    expect(zap.session?.run.pending).toMatchObject({ ability: "zap", total: 14, opposed: null });
    expect(zap.session?.run.actionsUsed).toBe(1);

    expect(c.step({ type: "resolveCheck", outcome: "success" }, GM).result).toMatchObject({
      error: "awaiting-opposed",
    });
    expect(c.step({ type: "oppose", messageId: "m-def" }).result).toMatchObject({
      error: "not-authorized",
    });
    expect(c.step({ type: "oppose", messageId: "m-def-other" }, GM).result).toMatchObject({
      error: "invalid-roll",
    });
    const opposed = c.step({ type: "oppose", messageId: "m-def" }, GM);
    expect(opposed.session?.run.pending?.opposed).toEqual({
      total: 12,
      messageId: "m-def",
      userId: GM.id,
    });
    expect(c.step({ type: "oppose", messageId: "m-def" }, GM).result).toMatchObject({
      error: "nothing-to-oppose",
    });

    const won = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(won.session?.run.pending).toBeNull();
    expect(won.session?.run.awaitingDamage).toBe(1);
    expect(c.step({ type: "check", ability: "slide", messageId: "m-slide" }).result).toMatchObject({
      error: "check-pending",
    });

    expect(
      c.step({ type: "check", ability: "damage", messageId: "m-dmg-2d6" }).result,
    ).toMatchObject({ error: "invalid-roll" });
    const dmg = c.step({ type: "check", ability: "damage", messageId: "m-dmg" });
    expect(dmg.session?.run.pending).toMatchObject({ ability: "damage", total: 4, rezAfter: 6 });
    expect(dmg.session?.run.actionsUsed).toBe(1);

    const applied = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(applied.effects).toEqual([
      { type: "setIceRez", actorUuid: "Actor.ice1", value: 6, before: 10 },
    ]);
    expect(applied.session?.run).toMatchObject({ pending: null, awaitingDamage: null });
    expect(applied.session?.run.cleared).toEqual([0]);
  });

  it("REZ zerado derrota o Black ICE", () => {
    const c = chain(runWith(HARNESS), withRun(atIce("Actor.ice2"), { awaitingDamage: 1 }));
    const dmg = c.step({ type: "check", ability: "damage", messageId: "m-dmg-big" });
    expect(dmg.session?.run.pending?.rezAfter).toBe(0);
    const applied = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(applied.effects).toEqual([
      { type: "setIceRez", actorUuid: "Actor.ice2", value: 0, before: 3 },
    ]);
    expect(applied.session?.run.cleared).toEqual([0, 1]);
  });

  it("GM descarta o dano: nenhum efeito e a Netrunner rola de novo", () => {
    const c = chain(runWith(HARNESS), withRun(atIce(), { awaitingDamage: 1 }));
    c.step({ type: "check", ability: "damage", messageId: "m-dmg" });
    const out = c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    expect(out.effects).toEqual([]);
    expect(out.session?.run).toMatchObject({ pending: null, awaitingDamage: 1 });
  });

  it("dano sem Zap vencido é recusado; GM pode dispensar o dano pendente", () => {
    const run = runWith(HARNESS);
    const s = atIce();
    expect(
      run(s, act(s, { type: "check", ability: "damage", messageId: "m-dmg" })).result,
    ).toMatchObject({ error: "no-damage-pending" });
    const waiting = withRun(s, { awaitingDamage: 1 });
    const skipped = run(
      waiting,
      act(waiting, { type: "resolveCheck", outcome: "failure" }, "r2"),
      GM,
    );
    expect(skipped.session?.run.awaitingDamage).toBeNull();
  });

  it("defesa do Black ICE exige vínculo", () => {
    const c = chain(runWith(HARNESS), atIce(null));
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    expect(c.step({ type: "oppose", messageId: "m-def" }, GM).result).toMatchObject({
      error: "no-ice-link",
    });
  });
});

describe("Slide", () => {
  it("vencido contra PER deixa o Black ICE driblado", () => {
    const c = chain(runWith(HARNESS));
    c.step({ type: "check", ability: "slide", messageId: "m-slide" });
    c.step({ type: "oppose", messageId: "m-per" }, GM);
    const out = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(out.session?.run.evaded).toEqual([1]);
    expect(out.session?.run.pending).toBeNull();
  });
});

describe("ataque do Black ICE", () => {
  it("GM rola ATK, Netrunner rola Defense, GM confirma sem mudar o estado", () => {
    const c = chain(runWith(HARNESS));
    const atk = c.step({ type: "iceAttack", messageId: "m-atk" }, GM);
    expect(atk.session?.run.pending).toMatchObject({ ability: "iceAttack", total: 16, key: 1 });
    expect(atk.session?.run.actionsUsed).toBe(0);
    const def = c.step({ type: "oppose", messageId: "m-defense" });
    expect(def.session?.run.pending?.opposed?.total).toBe(10);
    const out = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(out.session?.run).toMatchObject({ pending: null, cleared: [0], evaded: [] });
    expect(out.effects).toEqual([]);
  });

  it("exige GM, vínculo, Netrunner no nó do Black ICE e card do próprio GM", () => {
    const run = runWith(HARNESS);
    const s = atIce();
    expect(run(s, act(s, { type: "iceAttack", messageId: "m-atk" })).result).toMatchObject({
      error: "not-authorized",
    });
    const unlinked = atIce(null);
    expect(
      run(unlinked, act(unlinked, { type: "iceAttack", messageId: "m-atk" }, "r2"), GM).result,
    ).toMatchObject({ error: "no-ice-link" });
    const away = { ...s, runnerPosition: 0 };
    expect(
      run(away, act(away, { type: "iceAttack", messageId: "m-atk" }, "r3"), GM).result,
    ).toMatchObject({ error: "invalid-target" });
    expect(
      run(s, act(s, { type: "iceAttack", messageId: "m-atk-runner" }, "r4"), GM).result,
    ).toMatchObject({ error: "invalid-roll" });
  });
});
