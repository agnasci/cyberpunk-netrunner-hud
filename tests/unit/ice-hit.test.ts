import { describe, expect, it } from "vitest";
import { chooseIceTarget, iceDamageResult, sameFormula } from "../../src/domain/ice-hit";
import { checkProgramRez, type RunnerResources } from "../../src/domain/net-rules";
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

const PROGRAMS: RunnerResources = {
  ...DECK,
  programs: [
    { itemId: "p-armor", programClass: "defender", rezzed: true, rez: 7 },
    { itemId: "p-seeya", programClass: "booster", rezzed: false, rez: 7 },
    { itemId: "p-shield", programClass: "defender", rezzed: true, rez: 3 },
  ],
};

function harness(extra: Partial<Harness> = {}): Harness {
  return {
    rolls: {
      "m-atk": roll(GM.id, "Actor.hound", 16),
      "m-atk-killer": roll(GM.id, "Actor.killer", 16),
      "m-atk-other": roll(GM.id, "Actor.other", 16),
      "m-defense": roll(RUNNER.id, "Actor.abc", 10),
      "m-hound-dmg": roll(GM.id, "Actor.hound", 9, "2d6"),
      "m-hound-dmg2": roll(GM.id, "Actor.hound", 5, "2d6"),
      "m-hound-wrong": roll(GM.id, "Actor.hound", 9, "1d6"),
      "m-hound-runner": roll(RUNNER.id, "Actor.hound", 9, "2d6"),
      "m-killer-dmg": roll(GM.id, "Actor.killer", 14, "4d6"),
    },
    ices: {
      "Actor.hound": {
        name: "Hellhound",
        rez: { value: 20, max: 20 },
        iceClass: "antipersonnel",
        damageFormula: "2d6",
      },
      "Actor.killer": {
        name: "Killer",
        rez: { value: 20, max: 20 },
        iceClass: "antiprogram",
        damageFormula: "4d6",
      },
      "Actor.other": {
        name: "Liche",
        rez: { value: 20, max: 20 },
        iceClass: "other",
        damageFormula: null,
      },
    },
    vitals: { hp: 30, brainDamageReduction: 2 },
    pick: () => 1,
    ...extra,
  };
}

function atIce(link: string): PublicSession {
  return withRun(
    { ...reveal(base(), [0, 1, 2]), runnerPosition: 1 },
    { cleared: [0], ice: [{ key: 1, actorUuid: link }] },
  );
}

function chain(run: ReturnType<typeof runWith>, start: PublicSession) {
  let session = start;
  let n = 0;
  return {
    get session() {
      return session;
    },
    step(action: unknown, sender = RUNNER) {
      n += 1;
      const outcome = run(session, request(session, action, `s${n}`), sender);
      if (outcome.session) session = outcome.session;
      return outcome;
    },
  };
}

/** Black ICE ataca e acerta (ATK 16 × Defense 10), confirmado pelo GM. */
function hit(c: ReturnType<typeof chain>, atk = "m-atk") {
  c.step({ type: "iceAttack", messageId: atk }, GM);
  c.step({ type: "oppose", messageId: "m-defense" });
  return c.step({ type: "resolveCheck", outcome: "success" }, GM);
}

describe("motor do acerto do Black ICE (D31)", () => {
  it("antipessoal mira o HP com a redução cerebral; antiprograma sorteia um programa rezzado", () => {
    const vitals = { hp: 30, brainDamageReduction: 2 };
    expect(chooseIceTarget("antipersonnel", vitals, [], () => 0)).toEqual({
      kind: "brain",
      hpBase: 30,
      reduction: 2,
    });
    const programs = PROGRAMS.programs ?? [];
    expect(chooseIceTarget("antiprogram", vitals, programs, () => 1)).toEqual({
      kind: "program",
      programId: "p-shield",
      rezBase: 3,
    });
    expect(chooseIceTarget("antiprogram", vitals, programs, () => 0)).toMatchObject({
      programId: "p-armor",
    });
    expect(chooseIceTarget("antiprogram", vitals, [], () => 0)).toEqual({
      kind: "none",
      reason: "no-program",
    });
    expect(chooseIceTarget("other", vitals, programs, () => 0)).toEqual({
      kind: "none",
      reason: "manual",
    });
    expect(chooseIceTarget("antipersonnel", null, [], () => 0)).toEqual({
      kind: "none",
      reason: "manual",
    });
  });

  it("dano não passa de zero e REZ 0 destrói o programa", () => {
    expect(iceDamageResult({ kind: "brain", hpBase: 30, reduction: 2 }, 9)).toEqual({
      kind: "brain",
      taken: 7,
      after: 23,
    });
    expect(iceDamageResult({ kind: "brain", hpBase: 3, reduction: 10 }, 9)).toEqual({
      kind: "brain",
      taken: 0,
      after: 3,
    });
    expect(iceDamageResult({ kind: "brain", hpBase: 3, reduction: 0 }, 9)).toMatchObject({
      after: 0,
    });
    // REZ 0 neutraliza; só destrói quando o efeito do ICE manda (D40).
    expect(iceDamageResult({ kind: "program", programId: "p", rezBase: 7 }, 14)).toEqual({
      kind: "program",
      programId: "p",
      taken: 14,
      after: 0,
      destroyed: false,
    });
    expect(
      iceDamageResult({ kind: "program", programId: "p", rezBase: 7, destroys: true }, 14),
    ).toMatchObject({ after: 0, destroyed: true });
  });

  it("compara fórmulas sem espaços nem caixa", () => {
    expect(sameFormula("2d6 + 1", "2D6+1")).toBe(true);
    expect(sameFormula("1d6", "2d6")).toBe(false);
  });

  it("programa destruído não se rezza de novo", () => {
    const runner: RunnerResources = {
      ...DECK,
      programs: [{ itemId: "p", programClass: "defender", rezzed: false, rez: 0, destroyed: true }],
    };
    const rules = {
      runner,
      run: {
        position: null,
        actionsUsed: 0,
        cleared: new Set<number>(),
        evaded: new Set<number>(),
      },
      hasEntry: true,
      nodes: [],
    };
    const jacked = {
      ...rules,
      run: {
        ...rules.run,
        position: {
          key: 0,
          floor: 1,
          branch: "a",
          content: "password" as const,
          blackIceKey: null,
        },
      },
    };
    expect(checkProgramRez(jacked, "p", true)).toEqual({
      allowed: false,
      reason: "program-destroyed",
    });
  });
});

describe("acerto do Black ICE na sessão (D31, D26)", () => {
  it("antipessoal: alvo fixado na confirmação; GM rola e o HP cai direto", () => {
    const c = chain(runWith(harness()), atIce("Actor.hound"));
    const resolved = hit(c);
    expect(resolved.session?.run.iceHit).toEqual({
      key: 1,
      target: { kind: "brain", hpBase: 30, reduction: 2 },
    });
    const out = c.step({ type: "iceDamage", messageId: "m-hound-dmg" }, GM);
    expect(out.result).toMatchObject({ ok: true });
    expect(out.effects).toEqual([
      { type: "setRunnerHp", actorUuid: "Actor.abc", value: 23, before: 30 },
    ]);
    expect(out.session?.run.iceHit).toBeNull();
    expect(out.session?.run.lastIceDamage).toMatchObject({
      seq: 1,
      key: 1,
      result: { kind: "brain", taken: 7, after: 23 },
    });
  });

  it("antiprograma: o mestre escolhe o programa (mais de um rezzado); REZ 0 destrói", () => {
    const c = chain(runWith(harness({ runner: PROGRAMS })), atIce("Actor.killer"));
    expect(hit(c, "m-atk-killer").session?.run.iceHit?.pickProgram).toBe(true);
    // Sem a escolha, o dano espera.
    expect(c.step({ type: "iceDamage", messageId: "m-killer-dmg" }, GM).result).toMatchObject({
      error: "check-pending",
    });
    expect(c.step({ type: "iceTarget", programId: "p-seeya" }, GM).result).toMatchObject({
      error: "invalid-program",
    });
    expect(c.step({ type: "iceTarget", programId: "p-shield" }).result).toMatchObject({
      error: "not-authorized",
    });
    expect(c.step({ type: "iceTarget", programId: "p-shield" }, GM).session?.run.iceHit).toEqual({
      key: 1,
      target: { kind: "program", programId: "p-shield", rezBase: 3 },
    });
    const out = c.step({ type: "iceDamage", messageId: "m-killer-dmg" }, GM);
    // Ator de teste sem o efeito de destruir: REZ 0 neutraliza (D40).
    expect(out.effects).toEqual([
      {
        type: "setProgramState",
        actorUuid: "Actor.abc",
        programId: "p-shield",
        state: { rezzed: false, rezValue: 0, mark: "neutralized" },
        before: { rezzed: true, rezValue: 3, mark: "none" },
      },
    ]);
    expect(out.session?.run.lastIceDamage?.result).toMatchObject({ destroyed: false, after: 0 });
  });

  it("sem alvo automático: não bloqueia e registra o motivo", () => {
    const c = chain(runWith(harness()), atIce("Actor.killer"));
    const out = hit(c, "m-atk-killer");
    expect(out.session?.run.iceHit).toBeNull();
    expect(out.session?.run.lastIceDamage?.result).toEqual({ kind: "none", reason: "no-program" });
    const other = chain(runWith(harness()), atIce("Actor.other"));
    expect(hit(other, "m-atk-other").session?.run.lastIceDamage?.result).toEqual({
      kind: "none",
      reason: "manual",
    });
  });

  it("recusa Netrunner, fórmula errada, card de outro autor e dano sem acerto", () => {
    const run = runWith(harness());
    const c = chain(run, atIce("Actor.hound"));
    expect(c.step({ type: "iceDamage", messageId: "m-hound-dmg" }, GM).result).toMatchObject({
      error: "no-damage-pending",
    });
    hit(c);
    expect(c.step({ type: "iceDamage", messageId: "m-hound-dmg" }).result).toMatchObject({
      error: "not-authorized",
    });
    expect(c.step({ type: "iceDamage", messageId: "m-hound-wrong" }, GM).result).toMatchObject({
      error: "invalid-roll",
    });
    expect(c.step({ type: "iceDamage", messageId: "m-hound-runner" }, GM).result).toMatchObject({
      error: "invalid-roll",
    });
  });

  it("dano pendente bloqueia checagens e movimento; GM pode dispensar", () => {
    const c = chain(runWith(harness()), atIce("Actor.hound"));
    hit(c);
    expect(c.step({ type: "moveTo", key: 0 }).result).toMatchObject({ error: "check-pending" });
    const skipped = c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    expect(skipped.session?.run.iceHit).toBeNull();
    expect(skipped.effects).toEqual([]);
  });

  it("reenvio após falha ao gravar reaplica o mesmo valor (HP base fixado)", () => {
    const h = harness();
    const c = chain(runWith(h), atIce("Actor.hound"));
    hit(c);
    const before = c.session;
    // Primeira tentativa: efeito aplicado, gravação falhou (sessão não muda).
    const first = runWith(h)(
      before,
      request(before, { type: "iceDamage", messageId: "m-hound-dmg" }, "x1"),
      GM,
    );
    h.vitals = { hp: 23, brainDamageReduction: 2 };
    const retry = runWith(h)(
      before,
      request(before, { type: "iceDamage", messageId: "m-hound-dmg" }, "x1"),
      GM,
    );
    expect(retry.effects).toEqual(first.effects);
  });

  it("sessões antigas sem os campos novos recebem padrão", () => {
    const raw = JSON.parse(JSON.stringify(base())) as { run: Record<string, unknown> };
    delete raw.run["iceHit"];
    delete raw.run["lastIceDamage"];
    const parsed = parseSession(raw);
    expect(parsed?.run.iceHit).toBeNull();
    expect(parsed?.run.lastIceDamage).toBeNull();
    const roundTrip = parseSession(
      JSON.parse(
        JSON.stringify(
          withRun(base(), {
            iceHit: { key: 1, target: { kind: "program", programId: "p", rezBase: 3 } },
            lastIceDamage: { seq: 2, key: 1, result: { kind: "brain", taken: 4, after: 10 } },
          }),
        ),
      ),
    );
    expect(roundTrip?.run.iceHit?.target).toEqual({ kind: "program", programId: "p", rezBase: 3 });
    expect(roundTrip?.run.lastIceDamage?.result).toEqual({ kind: "brain", taken: 4, after: 10 });
  });
});

describe("visão e efeitos do acerto (E6-06)", () => {
  it("faixa de dano no cérebro ou programa quando o dano é aplicado", async () => {
    const { diffFx } = await import("../../src/session/hud-fx");
    const prev = atIce("Actor.hound");
    const brain = withRun(prev, {
      lastIceDamage: { seq: 1, key: 1, result: { kind: "brain", taken: 7, after: 23 } },
    });
    expect(diffFx(prev, brain).banner).toBe("brain-damage");
    const program = withRun(prev, {
      lastIceDamage: {
        seq: 1,
        key: 1,
        result: { kind: "program", programId: "p", taken: 9, after: 0, destroyed: true },
      },
    });
    expect(diffFx(prev, program).banner).toBe("program-crash");
    expect(diffFx(brain, brain).banner).toBeNull();
  });

  it("só o GM vê a fórmula e rola; sem item, não pode rolar mas pode dispensar", async () => {
    const { buildEncounterView } = await import("../../src/session/encounter-view");
    const { toRunState } = await import("../../src/session/session-state");
    const session = withRun(atIce("Actor.hound"), {
      iceHit: { key: 1, target: { kind: "brain", hpBase: 30, reduction: 2 } },
    });
    const h = harness();
    const view = (role: "gm" | "netrunner", ices = h.ices) =>
      buildEncounterView({
        session,
        role,
        rules: { runner: DECK, run: toRunState(session), hasEntry: true, nodes: [] },
        readIce: (uuid) => ices[uuid] ?? null,
        dvOf: () => null,
      });
    expect(view("gm").iceHit).toMatchObject({ formula: "2d6", canRoll: true, canSkip: true });
    expect(view("netrunner").iceHit).toMatchObject({
      formula: null,
      canRoll: false,
      canSkip: false,
    });
    expect(view("gm").ice?.canAttack).toBe(false);
    const noItem = {
      "Actor.hound": {
        name: "Hellhound",
        rez: { value: 20, max: 20 },
        iceClass: "antipersonnel" as const,
        damageFormula: null,
      },
    };
    expect(view("gm", noItem).iceHit).toMatchObject({ canRoll: false, canSkip: true });
  });
});
