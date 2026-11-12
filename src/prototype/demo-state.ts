import { DEMO_FLOORS, DEMO_PROGRAMS } from "./fixture";

export type FloorContent = "password" | "file" | "controlnode" | "blackice";

export interface DemoFloor {
  floor: number;
  branch: string;
  content: FloorContent;
  dv: number | null;
  label: string;
  iceRez?: number;
}

export interface DemoProgram {
  id: string;
  name: string;
  kind: "attacker" | "defender" | "booster";
  rezzed: boolean;
  rez: number;
  rezMax: number;
}

export const DEMO_ACTIONS = [
  "jackIn",
  "pathfinder",
  "advance",
  "backdoor",
  "zap",
  "control",
  "newTurn",
  "jackOut",
] as const;
export type DemoAction = (typeof DEMO_ACTIONS)[number];

export type DemoEventKind =
  | "jack-in"
  | "jack-out"
  | "scan"
  | "move"
  | "ice-alert"
  | "denied"
  | "fail"
  | "breach"
  | "hit"
  | "derez"
  | "control"
  | "new-turn"
  | "no-actions"
  | "invalid";

export interface DemoEvent {
  id: number;
  kind: DemoEventKind;
  floorIndex: number | null;
}

export interface DemoLogEntry {
  id: number;
  kind: DemoEventKind;
  key: string;
  data: Record<string, string>;
}

export interface DemoState {
  floors: readonly DemoFloor[];
  discovered: readonly number[];
  unlocked: readonly number[];
  iceRez: Readonly<Record<number, number>>;
  position: number | null;
  netActions: { used: number; max: number };
  programs: readonly DemoProgram[];
  backdoorAttempts: number;
  log: readonly DemoLogEntry[];
  lastEvent: DemoEvent | null;
  seq: number;
}

const LOG_LIMIT = 12;
const DEMO_ZAP_DAMAGE = 4;

export function createDemoState(): DemoState {
  const iceRez: Record<number, number> = {};
  DEMO_FLOORS.forEach((floor, index) => {
    if (floor.iceRez !== undefined) iceRez[index] = floor.iceRez;
  });
  return {
    floors: DEMO_FLOORS,
    discovered: [],
    unlocked: [],
    iceRez,
    position: null,
    netActions: { used: 0, max: 3 },
    programs: DEMO_PROGRAMS,
    backdoorAttempts: 0,
    log: [],
    lastEvent: null,
    seq: 0,
  };
}

export function isFloorBlocking(state: DemoState, index: number): boolean {
  const floor = state.floors[index];
  if (!floor) return false;
  if (floor.content === "password") return !state.unlocked.includes(index);
  if (floor.content === "blackice") return (state.iceRez[index] ?? 0) > 0;
  return false;
}

function emit(
  state: DemoState,
  kind: DemoEventKind,
  floorIndex: number | null,
  key: string,
  data: Record<string, string> = {},
): DemoState {
  const id = state.seq + 1;
  const log = [{ id, kind, key, data }, ...state.log].slice(0, LOG_LIMIT);
  return { ...state, seq: id, lastEvent: { id, kind, floorIndex }, log };
}

function spend(state: DemoState): DemoState {
  return { ...state, netActions: { ...state.netActions, used: state.netActions.used + 1 } };
}

function discover(state: DemoState, index: number): DemoState {
  if (state.discovered.includes(index)) return state;
  return { ...state, discovered: [...state.discovered, index] };
}

function floorName(state: DemoState, index: number): Record<string, string> {
  const floor = state.floors[index];
  return { floor: String(floor?.floor ?? "?"), label: floor?.label ?? "" };
}

export function applyDemoAction(state: DemoState, action: DemoAction): DemoState {
  if (action === "newTurn") {
    return emit(
      { ...state, netActions: { ...state.netActions, used: 0 } },
      "new-turn",
      null,
      "NewTurn",
    );
  }
  if (action === "jackOut") {
    if (state.position === null) return emit(state, "invalid", null, "NotJackedIn");
    return emit(
      { ...createDemoState(), log: state.log, seq: state.seq },
      "jack-out",
      null,
      "JackOut",
    );
  }
  if (action === "jackIn" && state.position !== null) {
    return emit(state, "invalid", state.position, "AlreadyIn");
  }
  if (action !== "jackIn" && state.position === null) {
    return emit(state, "invalid", null, "NotJackedIn");
  }
  if (state.netActions.used >= state.netActions.max) {
    return emit(state, "no-actions", state.position, "NoActions");
  }

  const position = state.position ?? 0;
  switch (action) {
    case "jackIn":
      return emit(
        spend(discover({ ...state, position: 0 }, 0)),
        "jack-in",
        0,
        "JackIn",
        floorName(state, 0),
      );
    case "pathfinder": {
      const next = state.floors.findIndex((_, i) => i > position && !state.discovered.includes(i));
      if (next === -1) return emit(spend(state), "scan", null, "ScanNothing");
      return emit(spend(discover(state, next)), "scan", next, "Scan", floorName(state, next));
    }
    case "advance": {
      if (isFloorBlocking(state, position)) {
        return emit(state, "denied", position, "Blocked", floorName(state, position));
      }
      const next = position + 1;
      if (next >= state.floors.length) return emit(state, "invalid", position, "Bottom");
      const moved = spend(discover({ ...state, position: next }, next));
      const isIce = state.floors[next]?.content === "blackice";
      return emit(
        moved,
        isIce ? "ice-alert" : "move",
        next,
        isIce ? "IceAlert" : "Move",
        floorName(state, next),
      );
    }
    case "backdoor": {
      const floor = state.floors[position];
      if (floor?.content !== "password" || state.unlocked.includes(position)) {
        return emit(state, "invalid", position, "NoPassword");
      }
      const attempts = state.backdoorAttempts + 1;
      const tried = spend({ ...state, backdoorAttempts: attempts });
      if (attempts % 2 === 1)
        return emit(tried, "fail", position, "BackdoorFail", floorName(state, position));
      return emit(
        { ...tried, unlocked: [...state.unlocked, position] },
        "breach",
        position,
        "Breach",
        floorName(state, position),
      );
    }
    case "zap": {
      const rez = state.iceRez[position];
      if (state.floors[position]?.content !== "blackice" || rez === undefined || rez <= 0) {
        return emit(state, "invalid", position, "NoTarget");
      }
      const remaining = Math.max(0, rez - DEMO_ZAP_DAMAGE);
      const hit = spend({ ...state, iceRez: { ...state.iceRez, [position]: remaining } });
      const data = { ...floorName(state, position), damage: String(DEMO_ZAP_DAMAGE) };
      return emit(
        hit,
        remaining === 0 ? "derez" : "hit",
        position,
        remaining === 0 ? "Derez" : "Hit",
        data,
      );
    }
    case "control":
      if (state.floors[position]?.content !== "controlnode") {
        return emit(state, "invalid", position, "NoControlNode");
      }
      return emit(spend(state), "control", position, "Control", floorName(state, position));
  }
}
