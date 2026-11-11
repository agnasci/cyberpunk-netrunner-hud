import { describe, expect, it } from "vitest";
import type { CharacterSnapshot } from "../../src/domain/character";
import type { NetFloorContent, PublicFloor } from "../../src/domain/net-architecture";
import {
  actionsLeft,
  beatsDv,
  checkAction,
  checkMove,
  isEngaged,
  netActionsPerTurn,
  type RuleContext,
  runnerResources,
  winsContest,
} from "../../src/domain/net-rules";

function node(key: number, floor: number, content: NetFloorContent, branch = "a"): PublicFloor {
  return {
    key,
    floor,
    branch,
    content,
    blackIceKey: content === "blackice" ? "x.hellhound" : null,
  };
}

const PASSWORD = node(0, 1, "password");
const ICE = node(1, 2, "blackice");
const FILE = node(2, 3, "file");
const CONTROL = node(3, 3, "controlnode", "b");

function ctx(overrides: Partial<RuleContext["run"]> = {}, rank = 4, deck = true): RuleContext {
  return {
    runner: { interfaceRank: rank, hasCyberdeck: deck },
    hasEntry: true,
    nodes: [PASSWORD, ICE, FILE, CONTROL],
    run: {
      position: null,
      actionsUsed: 0,
      cleared: new Set(),
      evaded: new Set(),
      ...overrides,
    },
  };
}

describe("ações NET por turno (D21)", () => {
  it("segue a faixa da Interface", () => {
    expect([0, 1, 3, 4, 6, 7, 9, 10, 12].map(netActionsPerTurn)).toEqual([
      0, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
  });

  it("valores inválidos não dão ações", () => {
    expect(netActionsPerTurn(-1)).toBe(0);
    expect(netActionsPerTurn(Number.NaN)).toBe(0);
  });

  it("desconta as usadas sem ficar negativo", () => {
    expect(actionsLeft(ctx({ actionsUsed: 1 }))).toBe(2);
    expect(actionsLeft(ctx({ actionsUsed: 9 }))).toBe(0);
  });

  it("bloqueia ações NET quando zera", () => {
    const c = ctx({ position: PASSWORD, actionsUsed: 3 });
    expect(checkAction(c, "backdoor")).toEqual({ allowed: false, reason: "no-actions-left" });
    expect(checkAction(c, "jackOut")).toEqual({ allowed: false, reason: "no-actions-left" });
  });
});

describe("Jack In e recursos da ficha (R05)", () => {
  it("permite com custo de 1 ação NET (Core, D39)", () => {
    expect(checkAction(ctx(), "jackIn")).toEqual({ allowed: true, cost: 1 });
  });

  it("exige função NET e cyberdeck", () => {
    expect(checkAction(ctx({}, 0), "jackIn")).toEqual({ allowed: false, reason: "no-net-role" });
    expect(checkAction(ctx({}, 4, false), "jackIn")).toEqual({
      allowed: false,
      reason: "no-cyberdeck",
    });
  });

  it("recusa se já conectada ou sem nó de entrada", () => {
    expect(checkAction(ctx({ position: PASSWORD }), "jackIn")).toEqual({
      allowed: false,
      reason: "already-jacked-in",
    });
    expect(checkAction({ ...ctx(), hasEntry: false }, "jackIn")).toEqual({
      allowed: false,
      reason: "no-entry",
    });
  });

  it("perder o cyberdeck durante a sessão invalida ações, mas não o Jack Out", () => {
    const c = ctx({ position: PASSWORD }, 4, false);
    expect(checkAction(c, "backdoor")).toEqual({ allowed: false, reason: "no-cyberdeck" });
    expect(checkAction(c, "jackOut")).toEqual({ allowed: true, cost: 1 });
  });

  it("deriva recursos do snapshot", () => {
    const snapshot = {
      netRole: { itemId: "r", abilityName: "Interface", rank: 6 },
      cyberdeck: { itemId: "d", name: "Deck" },
    } as CharacterSnapshot;
    expect(runnerResources(snapshot)).toEqual({
      interfaceRank: 6,
      hasCyberdeck: true,
      programs: [],
    });
    expect(runnerResources(null)).toEqual({ interfaceRank: 0, hasCyberdeck: false, programs: [] });
  });
});

describe("ações no nó atual", () => {
  it("exigem estar conectada", () => {
    for (const action of ["jackOut", "backdoor", "control", "zap", "slide"] as const) {
      expect(checkAction(ctx(), action)).toEqual({ allowed: false, reason: "not-jacked-in" });
    }
  });

  it("Backdoor só em Password não vencida", () => {
    expect(checkAction(ctx({ position: PASSWORD }), "backdoor")).toEqual({
      allowed: true,
      cost: 1,
    });
    expect(checkAction(ctx({ position: FILE }), "backdoor")).toEqual({
      allowed: false,
      reason: "wrong-node",
    });
    expect(checkAction(ctx({ position: PASSWORD, cleared: new Set([0]) }), "backdoor")).toEqual({
      allowed: false,
      reason: "already-cleared",
    });
  });

  it("Control só em Control Node não controlado", () => {
    expect(checkAction(ctx({ position: CONTROL }), "control")).toEqual({ allowed: true, cost: 1 });
    expect(checkAction(ctx({ position: PASSWORD }), "control")).toEqual({
      allowed: false,
      reason: "wrong-node",
    });
    expect(checkAction(ctx({ position: CONTROL, cleared: new Set([3]) }), "control")).toEqual({
      allowed: false,
      reason: "already-cleared",
    });
  });

  it("Zap em Black ICE não derrotado, mesmo depois de Slide", () => {
    expect(checkAction(ctx({ position: ICE }), "zap")).toEqual({ allowed: true, cost: 1 });
    expect(checkAction(ctx({ position: ICE, evaded: new Set([1]) }), "zap")).toEqual({
      allowed: true,
      cost: 1,
    });
    expect(checkAction(ctx({ position: ICE, cleared: new Set([1]) }), "zap")).toEqual({
      allowed: false,
      reason: "already-cleared",
    });
    expect(checkAction(ctx({ position: FILE }), "zap")).toEqual({
      allowed: false,
      reason: "wrong-node",
    });
  });

  it("Slide só enquanto engajada", () => {
    expect(checkAction(ctx({ position: ICE }), "slide")).toEqual({ allowed: true, cost: 1 });
    expect(checkAction(ctx({ position: ICE, evaded: new Set([1]) }), "slide")).toEqual({
      allowed: false,
      reason: "not-engaged",
    });
    expect(checkAction(ctx({ position: ICE, cleared: new Set([1]) }), "slide")).toEqual({
      allowed: false,
      reason: "already-cleared",
    });
  });
});

describe("engajamento e movimento (D22)", () => {
  it("Black ICE ativo engaja; derrotado ou driblado, não", () => {
    expect(isEngaged(ctx({ position: ICE }).run)).toBe(true);
    expect(isEngaged(ctx({ position: ICE, cleared: new Set([1]) }).run)).toBe(false);
    expect(isEngaged(ctx({ position: ICE, evaded: new Set([1]) }).run)).toBe(false);
    expect(isEngaged(ctx({ position: PASSWORD }).run)).toBe(false);
  });

  it("mover é livre (D27) e exige alvo revelado e ligado (D28)", () => {
    const at = ctx({ position: ICE });
    const free = ctx({ position: ICE, cleared: new Set([1]) });
    expect(checkMove(free, FILE)).toEqual({ allowed: true, cost: 0 });
    expect(checkMove(free, CONTROL)).toEqual({ allowed: true, cost: 0 });
    expect(checkMove(free, PASSWORD)).toEqual({ allowed: true, cost: 0 });
    expect(checkMove(free, null)).toEqual({ allowed: false, reason: "not-revealed" });
    expect(checkMove(ctx({ position: PASSWORD }), FILE)).toEqual({
      allowed: false,
      reason: "not-adjacent",
    });
    expect(checkMove(at, ICE)).toEqual({ allowed: false, reason: "not-adjacent" });
  });

  it("engajada não se move", () => {
    expect(checkMove(ctx({ position: ICE }), FILE)).toEqual({ allowed: false, reason: "engaged" });
    expect(checkMove(ctx({ position: ICE, evaded: new Set([1]) }), FILE)).toEqual({
      allowed: true,
      cost: 0,
    });
  });

  it("Password não vencida impede descer, mas não subir", () => {
    const below = node(5, 2, "file");
    const above = node(6, 1, "file");
    const onDeepPassword = ctx({ position: node(7, 2, "password") });
    expect(checkMove(ctx({ position: PASSWORD }), below)).toEqual({
      allowed: false,
      reason: "password-locked",
    });
    expect(checkMove(ctx({ position: PASSWORD, cleared: new Set([0]) }), below)).toEqual({
      allowed: true,
      cost: 0,
    });
    expect(checkMove(onDeepPassword, above)).toEqual({ allowed: true, cost: 0 });
  });

  it("mover exige conexão e recursos, mas não ações restantes", () => {
    expect(checkMove(ctx(), FILE)).toEqual({ allowed: false, reason: "not-jacked-in" });
    expect(checkMove(ctx({ position: PASSWORD, cleared: new Set([0]) }, 0), ICE)).toEqual({
      allowed: false,
      reason: "no-net-role",
    });
    expect(
      checkMove(ctx({ position: PASSWORD, cleared: new Set([0]), actionsUsed: 3 }), ICE),
    ).toEqual({ allowed: true, cost: 0 });
  });
});

describe("comparações (D24)", () => {
  it("DV precisa ser superado", () => {
    expect(beatsDv(9, 8)).toBe(true);
    expect(beatsDv(8, 8)).toBe(false);
    expect(beatsDv(7, 8)).toBe(false);
  });

  it("em disputa, empate fica com o defensor", () => {
    expect(winsContest(15, 14)).toBe(true);
    expect(winsContest(14, 14)).toBe(false);
  });
});
