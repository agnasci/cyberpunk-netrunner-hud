import { describe, expect, it } from "vitest";
import { toPublicFloor } from "../../src/domain/net-architecture";
import { normalizeNetArch } from "../../src/integrations/cpr/netarch-adapter";
import { floor, ICE_KEY, netarch, sampleNetArch } from "../fixtures/cpr-netarch";

describe("normalizeNetArch", () => {
  it("converte andares do sistema em nós ordenados por andar e branch", () => {
    const { architecture, issues } = normalizeNetArch(sampleNetArch());
    expect(issues).toEqual([]);
    expect(architecture?.name).toBe("Arquitetura Sintética");
    expect(architecture?.floors.map((f) => [f.key, f.floor, f.branch, f.content])).toEqual([
      [0, 1, "a", "password"],
      [1, 2, "a", "blackice"],
      [2, 3, "a", "file"],
      [3, 3, "b", "controlnode"],
    ]);
    expect(architecture?.floors[0]).toMatchObject({
      dv: 6,
      description: "senha secreta: swordfish",
    });
    expect(architecture?.floors[1]).toMatchObject({ dv: null, blackIceKey: ICE_KEY });
  });

  it("rejeita item que não é NetArch", () => {
    const result = normalizeNetArch({ ...sampleNetArch(), type: "program" });
    expect(result.architecture).toBeNull();
    expect(result.issues).toEqual([{ code: "not-netarch" }]);
  });

  it("descarta andar inválido ou com chave repetida e registra o problema", () => {
    const { architecture, issues } = normalizeNetArch(
      netarch([
        floor(0, "1", "a", "password"),
        { ...floor(1, "2", "a", "file"), content: "conteúdo estranho" },
        floor(0, "3", "a", "file"),
        { ...floor(2, "19", "a", "file") },
      ]),
    );
    expect(architecture?.floors.map((f) => f.key)).toEqual([0]);
    expect(issues).toEqual([
      { code: "invalid-floor", key: 1, field: "content" },
      { code: "duplicate-floor-key", key: 0 },
      { code: "invalid-floor", key: 2, field: "floor" },
    ]);
  });

  it("usa a branch a quando o andar não tem branch, como o layout do sistema", () => {
    const { architecture } = normalizeNetArch(
      netarch([{ ...floor(0, "1", "a", "file"), branch: undefined }]),
    );
    expect(architecture?.floors[0]?.branch).toBe("a");
  });

  it("Black ICE sem tipo definido fica sem chave de tipo", () => {
    const { architecture } = normalizeNetArch(netarch([floor(0, "1", "a", "blackice")]));
    expect(architecture?.floors[0]?.blackIceKey).toBeNull();
  });
});

describe("toPublicFloor", () => {
  it("nunca inclui DV nem descrição", () => {
    const { architecture } = normalizeNetArch(sampleNetArch());
    const first = architecture?.floors[0];
    if (!first) throw new Error("fixture inválida");
    const publicFloor = toPublicFloor(first);
    expect(publicFloor).toEqual({
      key: 0,
      floor: 1,
      branch: "a",
      content: "password",
      blackIceKey: null,
    });
  });
});
