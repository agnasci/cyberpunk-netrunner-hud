import { describe, expect, it } from "vitest";
import { areLinked, type NodePosition } from "../../src/domain/net-architecture";
import { checkMove, type RuleContext } from "../../src/domain/net-rules";

const n = (floor: number, branch: string): NodePosition => ({ floor, branch });

const TREE = [n(1, "a"), n(2, "a"), n(3, "a"), n(4, "a"), n(3, "b"), n(4, "b"), n(5, "c")];

describe("areLinked (D28)", () => {
  it("andares consecutivos na mesma branch se ligam, nos dois sentidos", () => {
    expect(areLinked(n(1, "a"), n(2, "a"), TREE)).toBe(true);
    expect(areLinked(n(3, "a"), n(2, "a"), TREE)).toBe(true);
    expect(areLinked(n(3, "b"), n(4, "b"), TREE)).toBe(true);
  });

  it("primeiro andar de uma branch liga-se ao andar acima da branch anterior", () => {
    expect(areLinked(n(2, "a"), n(3, "b"), TREE)).toBe(true);
    expect(areLinked(n(3, "b"), n(2, "a"), TREE)).toBe(true);
    expect(areLinked(n(4, "b"), n(5, "c"), TREE)).toBe(true);
  });

  it("sem lateral nem diagonal entre branches fora da bifurcação", () => {
    expect(areLinked(n(3, "a"), n(3, "b"), TREE)).toBe(false);
    expect(areLinked(n(3, "b"), n(4, "a"), TREE)).toBe(false);
    expect(areLinked(n(3, "a"), n(4, "b"), TREE)).toBe(false);
    expect(areLinked(n(4, "a"), n(5, "c"), TREE)).toBe(false);
    expect(areLinked(n(1, "a"), n(3, "a"), TREE)).toBe(false);
  });

  it("branch anterior sem nó no andar de cima: liga-se à branch mais próxima à esquerda", () => {
    const nodes = [n(1, "a"), n(2, "a"), n(3, "a"), n(3, "c")];
    expect(areLinked(n(2, "a"), n(3, "c"), nodes)).toBe(true);
  });
});

describe("checkMove com caminhos e sem custo (D27/D28)", () => {
  const floor = (key: number, f: number, branch: string, content = "file" as const) => ({
    key,
    floor: f,
    branch,
    content,
    blackIceKey: null,
  });
  const A2 = floor(1, 2, "a");
  const A3 = floor(2, 3, "a");
  const B3 = floor(3, 3, "b");
  const B4 = floor(4, 4, "b");
  const A4 = floor(5, 4, "a");
  const nodes = [floor(0, 1, "a"), A2, A3, B3, B4, A4];

  function ctx(position: ReturnType<typeof floor>, actionsUsed = 0): RuleContext {
    return {
      runner: { interfaceRank: 4, hasCyberdeck: true },
      hasEntry: true,
      nodes,
      run: { position, actionsUsed, cleared: new Set(), evaded: new Set() },
    };
  }

  it("mover pela bifurcação não custa ação, nem com as ações esgotadas", () => {
    expect(checkMove(ctx(A2), B3)).toEqual({ allowed: true, cost: 0 });
    expect(checkMove(ctx(A2, 3), A3)).toEqual({ allowed: true, cost: 0 });
  });

  it("trocar de branch exige voltar à bifurcação", () => {
    expect(checkMove(ctx(A3), B3)).toEqual({ allowed: false, reason: "not-adjacent" });
    expect(checkMove(ctx(B3), A4)).toEqual({ allowed: false, reason: "not-adjacent" });
    expect(checkMove(ctx(B4), B3)).toEqual({ allowed: true, cost: 0 });
    expect(checkMove(ctx(B3), A2)).toEqual({ allowed: true, cost: 0 });
  });
});
