/**
 * Efeitos em documentos executados pela autoridade antes de gravar a sessão (D26).
 * Valores absolutos: reaplicar não duplica. Cada um traz o valor anterior, fixado ao
 * criar o efeito, para o desfazer (E6-07, D32) não depender de reler a ficha.
 */
export type SheetEffect =
  | {
      type: "setIceRez";
      actorUuid: string;
      value: number;
      before: number;
    }
  | {
      /** Estado absoluto de rez de um programa da Netrunner (E6-05); o anterior é o oposto. */
      type: "setProgramRez";
      actorUuid: string;
      programId: string;
      rezzed: boolean;
    }
  | {
      /** HP absoluto da Netrunner depois do dano no cérebro (E6-06). */
      type: "setRunnerHp";
      actorUuid: string;
      value: number;
      before: number;
    }
  | {
      /** REZ absoluto de um programa atingido; 0 = destruído e derrezzado (D31). */
      type: "setProgramRezValue";
      actorUuid: string;
      programId: string;
      value: number;
      before: number;
      /** Rez antes do efeito: REZ 0 derrezza, o desfazer rezza de novo. */
      rezzedBefore: boolean;
    }
  | {
      /**
       * Estado absoluto de um programa (D40): rez, REZ e marca do módulo (neutralizado ou
       * destruído). Rezzar volta com o REZ cheio; dano a 0 neutraliza ou destrói.
       */
      type: "setProgramState";
      actorUuid: string;
      programId: string;
      state: ProgramState;
      before: ProgramState;
    }
  | {
      /** NPC arrastada pelo GM (E6-11b): move o vínculo na flag do item da arquitetura. */
      type: "moveNpcLink";
      itemUuid: string;
      actorUuid: string;
      from: number;
      to: number;
    };

export type ProgramMark = "none" | "neutralized" | "destroyed";

export interface ProgramState {
  rezzed: boolean;
  rezValue: number;
  mark: ProgramMark;
}

/** Efeitos que desfazem `effect`, na ordem em que devem ser aplicados. */
function inverseOf(effect: SheetEffect): SheetEffect[] {
  switch (effect.type) {
    case "setIceRez":
    case "setRunnerHp":
      return [{ ...effect, value: effect.before, before: effect.value }];
    case "setProgramRez":
      return [{ ...effect, rezzed: !effect.rezzed }];
    case "moveNpcLink":
      return [{ ...effect, from: effect.to, to: effect.from }];
    case "setProgramState":
      return [{ ...effect, state: effect.before, before: effect.state }];
    case "setProgramRezValue": {
      const derezzed = effect.value === 0 && effect.rezzedBefore;
      const restore: SheetEffect[] = [
        {
          ...effect,
          value: effect.before,
          before: effect.value,
          rezzedBefore: effect.value === 0 ? false : effect.rezzedBefore,
        },
      ];
      if (derezzed) {
        restore.push({
          type: "setProgramRez",
          actorUuid: effect.actorUuid,
          programId: effect.programId,
          rezzed: true,
        });
      }
      return restore;
    }
  }
}

/** Desfaz uma lista de efeitos: inversos na ordem reversa. */
export function inverseEffects(effects: readonly SheetEffect[]): SheetEffect[] {
  return [...effects].reverse().flatMap(inverseOf);
}

/** Lê um efeito guardado no histórico; formato inesperado vira `null`. */
export function parseSheetEffect(value: unknown): SheetEffect | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const id = (x: unknown): x is string => typeof x === "string" && x !== "" && x.length <= 64;
  const n = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
  if (!id(v["actorUuid"])) return null;
  const actorUuid = v["actorUuid"];
  switch (v["type"]) {
    case "setProgramState": {
      const state = parseProgramState(v["state"]);
      const before = parseProgramState(v["before"]);
      return id(v["programId"]) && state && before
        ? { type: "setProgramState", actorUuid, programId: v["programId"], state, before }
        : null;
    }
    case "moveNpcLink":
      return id(v["itemUuid"]) && n(v["from"]) && n(v["to"])
        ? { type: "moveNpcLink", itemUuid: v["itemUuid"], actorUuid, from: v["from"], to: v["to"] }
        : null;
    case "setIceRez":
    case "setRunnerHp":
      return n(v["value"]) && n(v["before"])
        ? { type: v["type"], actorUuid, value: v["value"], before: v["before"] }
        : null;
    case "setProgramRez":
      return id(v["programId"]) && typeof v["rezzed"] === "boolean"
        ? { type: "setProgramRez", actorUuid, programId: v["programId"], rezzed: v["rezzed"] }
        : null;
    case "setProgramRezValue":
      return id(v["programId"]) &&
        n(v["value"]) &&
        n(v["before"]) &&
        typeof v["rezzedBefore"] === "boolean"
        ? {
            type: "setProgramRezValue",
            actorUuid,
            programId: v["programId"],
            value: v["value"],
            before: v["before"],
            rezzedBefore: v["rezzedBefore"],
          }
        : null;
    default:
      return null;
  }
}

function parseProgramState(value: unknown): ProgramState | null {
  if (typeof value !== "object" || value === null) return null;
  const { rezzed, rezValue, mark } = value as Record<string, unknown>;
  if (typeof rezzed !== "boolean") return null;
  if (typeof rezValue !== "number" || !Number.isInteger(rezValue) || rezValue < 0) return null;
  if (mark !== "none" && mark !== "neutralized" && mark !== "destroyed") return null;
  return { rezzed, rezValue, mark };
}

/** Estado atual de um programa como o motor o conhece (para o `before` do efeito). */
export function programStateOf(p: {
  rezzed: boolean;
  rez?: number;
  neutralized?: boolean;
  destroyed?: boolean;
}): ProgramState {
  return {
    rezzed: p.rezzed,
    rezValue: Math.max(0, p.rez ?? 0),
    mark: p.destroyed ? "destroyed" : p.neutralized ? "neutralized" : "none",
  };
}
