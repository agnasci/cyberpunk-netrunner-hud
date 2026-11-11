import { describe, expect, it } from "vitest";
import { parseCardTotal } from "../../src/integrations/cpr/foundry-roll";

describe("parseCardTotal", () => {
  it("lê o total inteiro do card, inclusive negativo", () => {
    expect(parseCardTotal(" 13 ")).toBe(13);
    expect(parseCardTotal("-2")).toBe(-2);
  });

  it("recusa texto que não é um inteiro", () => {
    for (const text of ["", "13a", "1.5", "treze"]) expect(parseCardTotal(text)).toBeNull();
  });
});
