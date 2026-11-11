import type { RunnerProgram } from "./net-rules";

/**
 * Acerto do Black ICE na Netrunner (E6-06, D31). Puro: a autoridade injeta HP,
 * redução cerebral, programas e o sorteio. Fontes e lacunas: docs/RULES.md.
 */
/** `system.class` do ator Black ICE no CPR v0.92.4. */
export type IceClass = "antipersonnel" | "antiprogram" | "other";

export const ICE_CLASSES: readonly IceClass[] = ["antipersonnel", "antiprogram", "other"];

/** HP atual e redução de dano cerebral (efeitos ativos) da Netrunner. */
export interface RunnerVitals {
  hp: number;
  brainDamageReduction: number;
}

/** Sem efeito automático: sem programa rezzado, efeito à mão ou Shield absorveu (D40). */
export type NoTargetReason = "no-program" | "manual" | "shield";

/** Alvo fixado quando o GM confirma o acerto (D26): reaplicar não dobra o dano. */
export type IceHitTarget =
  | { kind: "brain"; hpBase: number; reduction: number }
  | {
      kind: "program";
      programId: string;
      rezBase: number;
      /** O efeito do ICE destrói em vez de neutralizar (ex.: Dragon, Killer, Sabertooth). */
      destroys?: boolean;
    }
  | { kind: "none"; reason: NoTargetReason };

export type IceDamageResult =
  | { kind: "brain"; taken: number; after: number }
  | { kind: "program"; programId: string; taken: number; after: number; destroyed: boolean }
  | { kind: "none"; reason: NoTargetReason };

/**
 * Antipessoal: dano no cérebro (HP). Antiprograma: um programa rezzado com REZ,
 * escolhido ao acaso por `pick(n)` (índice de 0 a n−1). "Outro": efeito à mão.
 */
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

/** Valor absoluto depois do dano; nunca abaixo de zero (HP e REZ têm mínimo 0 no CPR). */
export function iceDamageResult(target: IceHitTarget, damage: number): IceDamageResult {
  const rolled = Math.max(0, damage);
  switch (target.kind) {
    case "brain": {
      const taken = Math.max(0, rolled - target.reduction);
      return { kind: "brain", taken, after: Math.max(0, target.hpBase - taken) };
    }
    case "program": {
      const after = Math.max(0, target.rezBase - rolled);
      // REZ 0 neutraliza (D40); só destrói quando o efeito do ICE manda.
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

/** Fórmulas iguais a menos de espaços e caixa ("2d6 + 1" = "2D6+1"). */
export function sameFormula(a: string, b: string): boolean {
  const norm = (f: string) => f.replace(/\s+/g, "").toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
}
