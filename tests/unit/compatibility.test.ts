import { describe, expect, it } from "vitest";
import { checkSystemCompatibility } from "../../src/compatibility";

describe("checkSystemCompatibility", () => {
  it("aceita o sistema e a versão homologados", () => {
    expect(checkSystemCompatibility({ id: "cyberpunk-red-core", version: "v0.92.4" })).toEqual({
      status: "supported",
    });
  });

  it("sinaliza versão do sistema não testada sem bloquear", () => {
    expect(checkSystemCompatibility({ id: "cyberpunk-red-core", version: "v0.93.0" })).toEqual({
      status: "untested-version",
      tested: "v0.92.4",
      found: "v0.93.0",
    });
  });

  it("rejeita outro sistema", () => {
    expect(checkSystemCompatibility({ id: "dnd5e", version: "4.0.0" })).toEqual({
      status: "wrong-system",
      found: "dnd5e",
    });
  });
});
