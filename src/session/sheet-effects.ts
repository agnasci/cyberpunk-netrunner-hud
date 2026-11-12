export type SheetEffect =
  | {
      type: "setIceRez";
      actorUuid: string;
      value: number;
      before: number;
    }
  | {
      type: "setProgramRez";
      actorUuid: string;
      programId: string;
      rezzed: boolean;
    }
  | {
      type: "setRunnerHp";
      actorUuid: string;
      value: number;
      before: number;
    }
  | {
      type: "setProgramRezValue";
      actorUuid: string;
      programId: string;
      value: number;
      before: number;
      rezzedBefore: boolean;
    }
  | {
      type: "setProgramState";
      actorUuid: string;
      programId: string;
      state: ProgramState;
      before: ProgramState;
    }
  | {
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

export function inverseEffects(effects: readonly SheetEffect[]): SheetEffect[] {
  return [...effects].reverse().flatMap(inverseOf);
}

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
