import type { CprNetArchSource } from "../../src/integrations/cpr/netarch-adapter";

const C = {
  password: "CPR.netArchitecture.floor.options.password",
  file: "CPR.netArchitecture.floor.options.file",
  controlnode: "CPR.netArchitecture.floor.options.controlnode",
  blackice: "CPR.global.programClass.blackice",
};

export const ICE_KEY = "CPR.netArchitecture.floor.options.blackIce.hellhound";

/** NetArch sintética no formato do CPR CORE v0.92.4 (strings como no sistema). */
export function floor(
  index: number,
  floorNo: string,
  branch: string,
  content: keyof typeof C,
  extra: Partial<{ dv: string; blackice: string; description: string }> = {},
): Record<string, unknown> {
  return {
    index,
    floor: floorNo,
    branch,
    content: C[content],
    dv: extra.dv ?? "N/A",
    blackice: extra.blackice ?? "--",
    description: extra.description ?? "",
  };
}

export function netarch(floors: unknown[]): CprNetArchSource {
  return {
    uuid: "Item.arch01",
    name: "Arquitetura Sintética",
    type: "netarch",
    system: { floors },
  };
}

/** Andares 1–3 na branch a; andar 3 também na branch b (bifurcação). */
export function sampleNetArch(): CprNetArchSource {
  return netarch([
    floor(0, "1", "a", "password", { dv: "6", description: "senha secreta: swordfish" }),
    floor(1, "2", "a", "blackice", { blackice: ICE_KEY }),
    floor(2, "3", "a", "file", { dv: "8" }),
    floor(3, "3", "b", "controlnode", { dv: "10" }),
  ]);
}
