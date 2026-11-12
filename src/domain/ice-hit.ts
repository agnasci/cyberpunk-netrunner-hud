import type { RunnerProgram } from "./net-rules";

export type IceClass = "antipersonnel" | "antiprogram" | "other";

export const ICE_CLASSES: readonly IceClass[] = ["antipersonnel", "antiprogram", "other"];

export interface RunnerVitals {
  hp: number;
  brainDamageReduction: number;
}

export type NoTargetReason = "no-program" | "manual" | "shield";

export type IceHitTarget =
  | { kind: "brain"; hpBase: number; reduction: number }
  | {
      kind: "program";
      programId: string;
      rezBase: number;
      destroys?: boolean;
    }
  | { kind: "none"; reason: NoTargetReason };

export type IceDamageResult =
  | { kind: "brain"; taken: number; after: number }
  | { kind: "program"; programId: string; taken: number; after: number; destroyed: boolean }
  | { kind: "none"; reason: NoTargetReason };

export function chooseIceTarget(
  iceClass: IceClass,
  vitals: RunnerVitals | null,
  programs: readonly RunnerProgram[],
  pick: (count: number) => number,
): IceHitTarget {
  if (iceClass === "antipersonnel" && vitals) {
    return {
      kind: "brain",
      hpBase: Math.max(0, vitals.hp),
      reduction: Math.max(0, vitals.brainDamageReduction),
    };
  }
  if (iceClass === "antiprogram") {
    const rezzed = programs.filter((p) => p.rezzed && (p.rez ?? 0) > 0);
    if (rezzed.length === 0) return { kind: "none", reason: "no-program" };
    const index = Math.min(rezzed.length - 1, Math.max(0, Math.floor(pick(rezzed.length))));
    const target = rezzed[index] ?? rezzed[0];
    if (!target) return { kind: "none", reason: "no-program" };
    return { kind: "program", programId: target.itemId, rezBase: target.rez ?? 0 };
  }
  return { kind: "none", reason: "manual" };
}

export function iceDamageResult(target: IceHitTarget, damage: number): IceDamageResult {
  const rolled = Math.max(0, damage);
  switch (target.kind) {
    case "brain": {
      const taken = Math.max(0, rolled - target.reduction);
      return { kind: "brain", taken, after: Math.max(0, target.hpBase - taken) };
    }
    case "program": {
      const after = Math.max(0, target.rezBase - rolled);
      return {
        kind: "program",
        programId: target.programId,
        taken: rolled,
        after,
        destroyed: after === 0 && target.destroys === true,
      };
    }
    case "none":
      return target;
  }
}

export function sameFormula(a: string, b: string): boolean {
  const norm = (f: string) => f.replace(/\s+/g, "").toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
}
