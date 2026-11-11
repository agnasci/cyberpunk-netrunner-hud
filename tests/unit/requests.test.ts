import { describe, expect, it } from "vitest";
import type { NetArchitecture } from "../../src/domain/net-architecture";
import { toPublicFloor } from "../../src/domain/net-architecture";
import { normalizeNetArch } from "../../src/integrations/cpr/netarch-adapter";
import { type ActionResult, processRequest } from "../../src/session/requests";
import { createSession, type PublicSession, revealFloor } from "../../src/session/session-state";
import { sampleNetArch } from "../fixtures/cpr-netarch";

const RUNNER = { id: "u-runner", isGM: false };
const SPECTATOR = { id: "u-spect", isGM: false };
const GM = { id: "u-gm", isGM: true };
const DECK = { interfaceRank: 4, hasCyberdeck: true };
/** Cards de rolagem no chat, como a autoridade os leria (E3-02b). */
const ROLLS: Record<string, { authorId: string; actorUuid: string; total: number }> = {
  "m-run": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 13 },
  "m-run2": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 4 },
  "m-gm": { authorId: GM.id, actorUuid: "Actor.abc", total: 9 },
  "m-other-actor": { authorId: RUNNER.id, actorUuid: "Actor.zzz", total: 20 },
};

function arch(): NetArchitecture {
  const { architecture } = normalizeNetArch(sampleNetArch());
  if (!architecture) throw new Error("fixture inválida");
  return architecture;
}

function base(): PublicSession {
  return createSession(
    {
      actorUuid: "Actor.abc",
      controllerUserId: RUNNER.id,
      netArch: { itemUuid: "Item.arch01", name: "Arquitetura Sintética" },
    },
    { id: "s1", now: 1 },
  );
}

function reveal(session: PublicSession, keys: number[]): PublicSession {
  return arch()
    .floors.filter((f) => keys.includes(f.key))
    .reduce((s, f) => revealFloor(s, toPublicFloor(f)), session);
}

function withRun(session: PublicSession, run: Partial<PublicSession["run"]>): PublicSession {
  return { ...session, run: { ...session.run, ...run } };
}

function request(session: PublicSession, action: unknown, requestId = "r1") {
  return { requestId, sessionId: session.id, expectedRevision: session.revision, action };
}

function run(
  session: PublicSession | null,
  raw: unknown,
  sender = RUNNER,
  processed = new Map<string, ActionResult>(),
  runner = DECK,
) {
  const outcome = processRequest(raw, {
    session,
    sender,
    architecture: arch(),
    processed,
    runner,
    readRoll: (id) => ROLLS[id] ?? null,
    readIce: () => null,
    readVitals: () => null,
    pick: () => 0,
    readResources: () => ({ interfaceRank: 0, hasCyberdeck: false }),
    readRef: () => null,
    npcLinkAt: () => null,
  });
  // Contrato: o chamador (autoridade GM) registra o resultado pela chave devolvida.
  if (outcome.processedKey) processed.set(outcome.processedKey, outcome.result);
  return outcome;
}

describe("processRequest", () => {
  it("jackIn coloca a Netrunner no andar 1 (branch a), revela o nó e incrementa a revisão uma vez", () => {
    const session = base();
    const { result, session: next } = run(session, request(session, { type: "jackIn" }));
    expect(result).toEqual({ requestId: "r1", ok: true, revision: 2 });
    expect(next?.runnerPosition).toBe(0);
    expect(next?.netArch?.discovered.map((f) => f.key)).toEqual([0]);
    expect(next?.revision).toBe(2);
  });

  it("moveTo aceita nó revelado e ligado, sem gastar ação NET (D27)", () => {
    const inside = withRun({ ...reveal(base(), [0, 1]), runnerPosition: 0 }, { cleared: [0] });
    const { result, session: next } = run(inside, request(inside, { type: "moveTo", key: 1 }));
    expect(result.ok).toBe(true);
    expect(next?.runnerPosition).toBe(1);
    expect(next?.run.actionsUsed).toBe(0);
  });

  it.each([
    ["nó não revelado", [0], 1, "not-revealed"],
    ["nó dois andares abaixo", [0, 1, 2], 2, "not-adjacent"],
    ["nó inexistente", [0], 99, "not-revealed"],
  ])("moveTo rejeita %s", (_label, revealed, key, error) => {
    const inside = withRun({ ...reveal(base(), revealed), runnerPosition: 0 }, { cleared: [0] });
    const { result, session: next } = run(inside, request(inside, { type: "moveTo", key }));
    expect(result).toMatchObject({ ok: false, error });
    expect(next).toBeNull();
  });

  it("jackOut tira a Netrunner da arquitetura e gasta 1 ação NET", () => {
    const inside = { ...reveal(base(), [0]), runnerPosition: 0 };
    const { session: next } = run(inside, request(inside, { type: "jackOut" }));
    expect(next?.runnerPosition).toBeNull();
    expect(next?.run.actionsUsed).toBe(1);
  });

  it("jackIn gasta 1 ação NET (Core, D39)", () => {
    const session = base();
    const { session: next } = run(session, request(session, { type: "jackIn" }));
    expect(next?.run.actionsUsed).toBe(1);
  });

  it("rejeita espectador sem alterar a sessão", () => {
    const session = base();
    const { result, session: next } = run(session, request(session, { type: "jackIn" }), SPECTATOR);
    expect(result).toMatchObject({ ok: false, error: "not-authorized" });
    expect(next).toBeNull();
  });

  it("ignora identidade declarada no payload: vale apenas o remetente do servidor", () => {
    const session = base();
    const forged = {
      ...request(session, { type: "jackIn" }),
      userId: RUNNER.id,
      sender: RUNNER.id,
    };
    expect(run(session, forged, SPECTATOR).result).toMatchObject({
      ok: false,
      error: "not-authorized",
    });
  });

  it("GM pode agir mesmo sem ser o controlador", () => {
    const session = base();
    expect(run(session, request(session, { type: "jackIn" }), GM).result.ok).toBe(true);
  });

  it("requestId repetido devolve o mesmo resultado sem novo efeito", () => {
    const session = base();
    const processed = new Map<string, ActionResult>();
    const first = run(session, request(session, { type: "jackIn" }), RUNNER, processed);
    expect(first.session).not.toBeNull();
    const again = run(first.session, request(session, { type: "jackIn" }), RUNNER, processed);
    expect(again.result).toEqual(first.result);
    expect(again.session).toBeNull();
  });

  it("o mesmo requestId de outro usuário não reaproveita o resultado alheio", () => {
    const session = base();
    const processed = new Map<string, ActionResult>();
    const first = run(session, request(session, { type: "jackIn" }), RUNNER, processed);
    const other = run(first.session, request(session, { type: "jackIn" }), SPECTATOR, processed);
    expect(other.result).toMatchObject({ ok: false, error: "not-authorized" });
  });

  it("duplo clique com requestIds diferentes: o segundo chega com revisão obsoleta", () => {
    const session = base();
    const processed = new Map<string, ActionResult>();
    const first = run(session, request(session, { type: "jackIn" }, "a"), RUNNER, processed);
    const second = run(first.session, request(session, { type: "jackIn" }, "b"), RUNNER, processed);
    expect(second.result).toEqual({
      requestId: "b",
      ok: false,
      error: "stale-revision",
      revision: 2,
    });
    expect(second.session).toBeNull();
  });

  it.each([
    ["sem requestId", { sessionId: "s1", expectedRevision: 1, action: { type: "jackIn" } }],
    [
      "ação desconhecida",
      { requestId: "x", sessionId: "s1", expectedRevision: 1, action: { type: "nuke" } },
    ],
    [
      "moveTo sem alvo",
      { requestId: "x", sessionId: "s1", expectedRevision: 1, action: { type: "moveTo" } },
    ],
    [
      "requestId gigante",
      {
        requestId: "x".repeat(200),
        sessionId: "s1",
        expectedRevision: 1,
        action: { type: "jackIn" },
      },
    ],
  ])("rejeita requisição malformada: %s", (_label, raw) => {
    expect(run(base(), raw).result).toMatchObject({ ok: false, error: "invalid-request" });
  });

  it("rejeita sessão diferente ou inexistente", () => {
    const session = base();
    expect(
      run(session, { ...request(session, { type: "jackIn" }), sessionId: "outra" }).result,
    ).toMatchObject({
      error: "wrong-session",
    });
    expect(run(null, request(session, { type: "jackIn" })).result).toMatchObject({
      error: "no-session",
    });
  });

  it("jackIn exige arquitetura e não pode repetir", () => {
    const noArch = { ...base(), netArch: null };
    expect(run(noArch, request(noArch, { type: "jackIn" })).result).toMatchObject({
      error: "no-architecture",
    });
    const inside = { ...reveal(base(), [0]), runnerPosition: 0 };
    expect(run(inside, request(inside, { type: "jackIn" })).result).toMatchObject({
      error: "already-jacked-in",
    });
  });

  it("moveTo e jackOut exigem estar conectada", () => {
    const session = reveal(base(), [0, 1]);
    expect(run(session, request(session, { type: "moveTo", key: 1 })).result).toMatchObject({
      error: "not-jacked-in",
    });
    expect(run(session, request(session, { type: "jackOut" })).result).toMatchObject({
      error: "not-jacked-in",
    });
  });
});

describe("processRequest — turno e bloqueios (D21/D22)", () => {
  it("bloqueia ao esgotar as ações do turno", () => {
    const inside = withRun(
      { ...reveal(base(), [0, 1]), runnerPosition: 0 },
      { cleared: [0], actionsUsed: 3 },
    );
    const { result, session: next } = run(inside, request(inside, { type: "jackOut" }));
    expect(result).toMatchObject({ ok: false, error: "no-actions-left" });
    expect(next).toBeNull();
  });

  it("limite segue a Interface da ficha", () => {
    const inside = withRun(
      { ...reveal(base(), [0, 1]), runnerPosition: 0 },
      { cleared: [0], actionsUsed: 3 },
    );
    const rank7 = { interfaceRank: 7, hasCyberdeck: true };
    const req = request(inside, { type: "jackOut" });
    expect(run(inside, req, RUNNER, new Map(), rank7).result.ok).toBe(true);
  });

  it("Password não vencida impede descer", () => {
    const inside = { ...reveal(base(), [0, 1]), runnerPosition: 0 };
    expect(run(inside, request(inside, { type: "moveTo", key: 1 })).result).toMatchObject({
      ok: false,
      error: "password-locked",
    });
  });

  it("Black ICE ativo prende a Netrunner; driblado, libera", () => {
    const atIce = { ...reveal(base(), [0, 1, 2]), runnerPosition: 1 };
    expect(run(atIce, request(atIce, { type: "moveTo", key: 2 })).result).toMatchObject({
      error: "engaged",
    });
    const evaded = withRun(atIce, { evaded: [1] });
    expect(run(evaded, request(evaded, { type: "moveTo", key: 2 })).result.ok).toBe(true);
  });

  it("sem função NET ou cyberdeck não conecta; Jack Out continua possível", () => {
    const session = base();
    const noRole = { interfaceRank: 0, hasCyberdeck: true };
    const noDeck = { interfaceRank: 4, hasCyberdeck: false };
    const jackIn = request(session, { type: "jackIn" });
    expect(run(session, jackIn, RUNNER, new Map(), noRole).result).toMatchObject({
      error: "no-net-role",
    });
    expect(run(session, jackIn, RUNNER, new Map(), noDeck).result).toMatchObject({
      error: "no-cyberdeck",
    });
    const inside = { ...reveal(base(), [0]), runnerPosition: 0 };
    const out = request(inside, { type: "jackOut" });
    expect(run(inside, out, RUNNER, new Map(), noDeck).result.ok).toBe(true);
  });

  it("GM inicia novo turno: recarrega ações e avança o turno", () => {
    const session = withRun(base(), { actionsUsed: 3 });
    const { result, session: next } = run(session, request(session, { type: "newTurn" }), GM);
    expect(result.ok).toBe(true);
    expect(next?.run).toMatchObject({ turn: 2, actionsUsed: 0 });
  });

  it("GM libera e restaura um nó revelado", () => {
    const session = reveal(base(), [0, 1]);
    const cleared = run(session, request(session, { type: "clearNode", key: 0 }), GM).session;
    expect(cleared?.run.cleared).toEqual([0]);
    if (!cleared) throw new Error("esperava sessão");
    const again = run(cleared, request(cleared, { type: "clearNode", key: 0 }, "r2"), GM);
    expect(again.result.ok).toBe(true);
    expect(again.session).toBeNull();
    const evaded = withRun(cleared, { evaded: [1] });
    const restored = run(evaded, request(evaded, { type: "restoreNode", key: 1 }, "r3"), GM);
    expect(restored.session?.run.evaded).toEqual([]);
    expect(restored.session?.run.cleared).toEqual([0]);
  });

  it("liberar exige nó revelado e existente", () => {
    const session = reveal(base(), [0, 2]);
    for (const key of [1, 99]) {
      expect(run(session, request(session, { type: "clearNode", key }), GM).result).toMatchObject({
        ok: false,
        error: "invalid-target",
      });
    }
  });

  it("Netrunner não inicia turno nem libera nó", () => {
    const session = reveal(base(), [0]);
    for (const action of [{ type: "newTurn" }, { type: "clearNode", key: 0 }]) {
      expect(run(session, request(session, action)).result).toMatchObject({
        error: "not-authorized",
      });
    }
  });

  it("GM não oculta o nó onde a Netrunner está", () => {
    const inside = { ...reveal(base(), [0]), runnerPosition: 0 };
    expect(run(inside, request(inside, { type: "conceal", key: 0 }), GM).result).toMatchObject({
      error: "invalid-target",
    });
  });
});

describe("processRequest — ações do GM (D20)", () => {
  it("GM revela um nó pela autoridade, mesmo com revisão desatualizada", () => {
    const session = { ...base(), revision: 7 };
    const stale = { ...request(session, { type: "reveal", key: 2 }), expectedRevision: 3 };
    const { result, session: next } = run(session, stale, GM);
    expect(result).toEqual({ requestId: "r1", ok: true, revision: 8 });
    expect(next?.netArch?.discovered).toEqual([
      { key: 2, floor: 3, branch: "a", content: "file", blackIceKey: null },
    ]);
  });

  it("revelar nó já revelado é aceito sem novo efeito", () => {
    const session = reveal(base(), [2]);
    const { result, session: next } = run(
      session,
      request(session, { type: "reveal", key: 2 }),
      GM,
    );
    expect(result).toEqual({ requestId: "r1", ok: true, revision: session.revision });
    expect(next).toBeNull();
  });

  it("GM oculta um nó revelado", () => {
    const session = reveal(base(), [0, 1]);
    const { session: next } = run(session, request(session, { type: "conceal", key: 0 }), GM);
    expect(next?.netArch?.discovered.map((f) => f.key)).toEqual([1]);
  });

  it("revelar nó inexistente na arquitetura é rejeitado", () => {
    const session = base();
    expect(run(session, request(session, { type: "reveal", key: 99 }), GM).result).toMatchObject({
      ok: false,
      error: "invalid-target",
    });
  });

  it("Netrunner não pode revelar, ocultar nem encerrar", () => {
    const session = base();
    for (const action of [
      { type: "reveal", key: 0 },
      { type: "conceal", key: 0 },
      { type: "end" },
    ]) {
      expect(run(session, request(session, action)).result).toMatchObject({
        ok: false,
        error: "not-authorized",
      });
    }
  });

  it("GM encerra a sessão pela autoridade", () => {
    const session = base();
    const outcome = run(session, request(session, { type: "end" }), GM);
    expect(outcome.result.ok).toBe(true);
    expect(outcome.ended).toBe(true);
    expect(outcome.session).toBeNull();
  });
});

describe("processRequest — checagens contra DV (E3-02b)", () => {
  const atPassword = () => ({ ...reveal(base(), [0, 1]), runnerPosition: 0 });
  const atControl = () =>
    withRun({ ...reveal(base(), [0, 1, 2, 3]), runnerPosition: 3 }, { cleared: [0, 1] });
  const check = (s: PublicSession, ability: string, messageId: string, id = "c1") =>
    request(s, { type: "check", ability, messageId }, id);

  it("aceita a rolagem da Netrunner, gasta 1 ação e grava a checagem pendente", () => {
    const session = atPassword();
    const { result, session: next } = run(session, check(session, "backdoor", "m-run"));
    expect(result.ok).toBe(true);
    expect(next?.run.actionsUsed).toBe(1);
    expect(next?.run.pending).toEqual({
      ability: "backdoor",
      key: 0,
      total: 13,
      messageId: "m-run",
      userId: RUNNER.id,
      opposed: null,
      rezAfter: null,
      rezBefore: null,
      programId: null,
    });
    expect(next?.run.usedRolls).toEqual(["m-run"]);
  });

  it("dispensa a revisão atual: a rolagem já aconteceu", () => {
    const session = { ...atPassword(), revision: 9 };
    const stale = { ...check(session, "backdoor", "m-run"), expectedRevision: 2 };
    expect(run(session, stale).result.ok).toBe(true);
  });

  it("Control vale no Control Node", () => {
    const session = atControl();
    expect(run(session, check(session, "control", "m-run")).session?.run.pending?.key).toBe(3);
  });

  it.each([
    ["mensagem inexistente", "m-nada"],
    ["mensagem de outro usuário", "m-gm"],
    ["rolagem de outro ator", "m-other-actor"],
  ])("recusa %s", (_label, messageId) => {
    const session = atPassword();
    const { result, session: next } = run(session, check(session, "backdoor", messageId));
    expect(result).toMatchObject({ ok: false, error: "invalid-roll" });
    expect(next).toBeNull();
  });

  it("recusa mensagem já usada", () => {
    const session = withRun(atPassword(), { usedRolls: ["m-run"] });
    expect(run(session, check(session, "backdoor", "m-run")).result).toMatchObject({
      error: "invalid-roll",
    });
  });

  it("GM pode rolar pela Netrunner com a própria mensagem", () => {
    const session = atPassword();
    const { session: next } = run(session, check(session, "backdoor", "m-gm"), GM);
    expect(next?.run.pending).toMatchObject({ total: 9, userId: GM.id });
  });

  it("aplica a elegibilidade do motor", () => {
    const session = atPassword();
    expect(run(session, check(session, "control", "m-run")).result).toMatchObject({
      error: "wrong-node",
    });
    const spent = withRun(session, { actionsUsed: 3 });
    expect(run(spent, check(spent, "backdoor", "m-run")).result).toMatchObject({
      error: "no-actions-left",
    });
    const broken = withRun(session, { cleared: [0] });
    expect(run(broken, check(broken, "backdoor", "m-run")).result).toMatchObject({
      error: "already-cleared",
    });
  });

  it("checagem pendente bloqueia mover e nova checagem, mas não o Jack Out", () => {
    const first = run(atPassword(), check(atPassword(), "backdoor", "m-run")).session;
    if (!first) throw new Error("esperava sessão");
    expect(run(first, check(first, "backdoor", "m-run2", "c2")).result).toMatchObject({
      error: "check-pending",
    });
    const cleared = withRun(first, { cleared: [0] });
    expect(run(cleared, request(cleared, { type: "moveTo", key: 1 }, "c3")).result).toMatchObject({
      error: "check-pending",
    });
    expect(run(first, request(first, { type: "jackOut" }, "c4")).result.ok).toBe(true);
  });

  it("GM confirma sucesso: nó resolvido e pendência limpa", () => {
    const pending = run(atPassword(), check(atPassword(), "backdoor", "m-run")).session;
    if (!pending) throw new Error("esperava sessão");
    const req = request(pending, { type: "resolveCheck", outcome: "success" }, "g1");
    const { result, session: next } = run(pending, req, GM);
    expect(result.ok).toBe(true);
    expect(next?.run.cleared).toEqual([0]);
    expect(next?.run.pending).toBeNull();
    expect(next?.run.actionsUsed).toBe(1);
  });

  it("GM confirma falha: nada resolvido, pendência limpa", () => {
    const pending = run(atPassword(), check(atPassword(), "backdoor", "m-run2")).session;
    if (!pending) throw new Error("esperava sessão");
    const req = request(pending, { type: "resolveCheck", outcome: "failure" }, "g1");
    const next = run(pending, req, GM).session;
    expect(next?.run.cleared).toEqual([]);
    expect(next?.run.pending).toBeNull();
  });

  it("resolver sem pendência é recusado; Netrunner não resolve", () => {
    const session = atPassword();
    const req = request(session, { type: "resolveCheck", outcome: "success" });
    expect(run(session, req, GM).result).toMatchObject({ error: "no-pending-check" });
    expect(run(session, req).result).toMatchObject({ error: "not-authorized" });
  });

  it.each([
    ["habilidade desconhecida", { type: "check", ability: "teleport", messageId: "m-run" }],
    ["sem mensagem", { type: "check", ability: "backdoor" }],
    ["resultado inválido", { type: "resolveCheck", outcome: "maybe" }],
  ])("rejeita malformada: %s", (_label, action) => {
    const session = atPassword();
    expect(run(session, request(session, action), GM).result).toMatchObject({
      error: "invalid-request",
    });
  });
});
