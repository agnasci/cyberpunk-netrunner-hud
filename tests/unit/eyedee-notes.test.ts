import { describe, expect, it } from "vitest";
import { checkAction, type RuleContext } from "../../src/domain/net-rules";
import { diffFx } from "../../src/session/hud-fx";
import { revealedNotes } from "../../src/session/notes";
import type { PendingCheck, PublicSession } from "../../src/session/session-state";
import {
  arch,
  base,
  GM,
  type Harness,
  request,
  reveal,
  RUNNER,
  runWith,
  withRun,
} from "../fixtures/requests-harness";

const FILE = { key: 2, floor: 3, branch: "a", content: "file" as const, blackIceKey: null };

function ctx(cleared: number[] = [], actionsUsed = 0): RuleContext {
  return {
    runner: { interfaceRank: 4, hasCyberdeck: true },
    hasEntry: true,
    nodes: [FILE],
    run: { position: FILE, actionsUsed, cleared: new Set(cleared), evaded: new Set() },
  };
}

describe("Eye-Dee (E6-04)", () => {
  it("vale só no nó File não identificado e custa 1 ação", () => {
    expect(checkAction(ctx(), "eyedee")).toEqual({ allowed: true, cost: 1 });
    expect(checkAction(ctx([2]), "eyedee")).toEqual({ allowed: false, reason: "already-cleared" });
    expect(checkAction(ctx([], 3), "eyedee")).toEqual({
      allowed: false,
      reason: "no-actions-left",
    });
    const atPassword: RuleContext = {
      ...ctx(),
      run: { ...ctx().run, position: { ...FILE, key: 0, floor: 1, content: "password" } },
    };
    expect(checkAction(atPassword, "eyedee")).toEqual({ allowed: false, reason: "wrong-node" });
  });

  it("checagem e confirmação marcam o arquivo como identificado", () => {
    const harness: Harness = {
      rolls: { "m-eye": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 11 } },
      ices: {},
    };
    const run = runWith(harness);
    const atFile = withRun(
      { ...reveal(base(), [0, 1, 2]), runnerPosition: 2 },
      { cleared: [0, 1] },
    );
    const checked = run(
      atFile,
      request(atFile, { type: "check", ability: "eyedee", messageId: "m-eye" }),
    );
    expect(checked.session?.run.pending).toMatchObject({ ability: "eyedee", key: 2, total: 11 });
    if (!checked.session) throw new Error("esperava sessão");
    const s = checked.session;
    const done = run(s, request(s, { type: "resolveCheck", outcome: "success" }, "r2"), GM);
    expect(done.session?.run.cleared).toEqual([0, 1, 2]);
  });

  it("GM pode liberar um arquivo à mão", () => {
    const run = runWith({ rolls: {}, ices: {} });
    const s = reveal(base(), [0, 1, 2]);
    expect(run(s, request(s, { type: "clearNode", key: 2 }), GM).session?.run.cleared).toEqual([2]);
  });

  it("faixa própria ao identificar o arquivo", () => {
    const s = withRun({ ...reveal(base(), [0, 1, 2]), runnerPosition: 2 }, {});
    const outcome = {
      seq: 1,
      ability: "eyedee" as PendingCheck["ability"],
      key: 2,
      outcome: "success" as const,
    };
    const next = withRun(s, { cleared: [2], lastOutcome: outcome });
    expect(diffFx(s, next)).toMatchObject({ nodes: { 2: "breach" }, banner: "identify" });
  });
});

describe("revealedNotes (D29)", () => {
  const full = arch();
  full.floors = full.floors.map((f) =>
    f.key === 2
      ? { ...f, description: "planta do cofre" }
      : f.key === 3
        ? { ...f, description: "câmeras" }
        : f,
  );
  const session = (cleared: number[]): PublicSession =>
    withRun(reveal(base(), [0, 1, 2, 3]), { cleared });

  it("controlador recebe descrições de Password vencida e arquivo identificado", () => {
    expect(revealedNotes(session([0, 2, 3]), full, RUNNER)).toEqual({
      0: { text: "senha secreta: swordfish" },
      2: { text: "planta do cofre" },
    });
  });

  it("nada de nós não resolvidos, Control Node ou descrição vazia", () => {
    expect(revealedNotes(session([]), full, RUNNER)).toEqual({});
    const blank = { ...full, floors: full.floors.map((f) => ({ ...f, description: "" })) };
    expect(revealedNotes(session([0, 2]), blank, RUNNER)).toEqual({});
  });

  it("espectador não recebe; GM recebe", () => {
    expect(revealedNotes(session([0]), full, { id: "u-spect", isGM: false })).toBeNull();
    expect(revealedNotes(session([0]), full, GM)).toEqual({
      0: { text: "senha secreta: swordfish" },
    });
  });

  it("sem arquitetura, nada", () => {
    expect(revealedNotes(session([0]), null, RUNNER)).toEqual({});
  });
});
