import {
  type DemoAction,
  type DemoEvent,
  type DemoLogEntry,
  type DemoState,
  type FloorContent,
  isFloorBlocking,
} from "./demo-state";
import { DEMO_ARCHITECTURE_NAME, DEMO_RUNNER } from "./fixture";

export type ViewerRole = "gm" | "netrunner" | "spectator";

export type FloorView =
  | { index: number; floor: number; state: "unknown"; isCurrent: boolean }
  | {
      index: number;
      floor: number;
      state: "known";
      isCurrent: boolean;
      content: FloorContent;
      label: string;
      dv: number | null;
      blocking: boolean;
      iceRez: { value: number; max: number } | null;
      hiddenFromPlayers: boolean;
    };

export type ProgramView =
  | { id: string; name: string; rezzed: boolean }
  | {
      id: string;
      name: string;
      rezzed: boolean;
      stats: { kind: string; rez: number; rezMax: number };
    };

export interface ActionView {
  id: DemoAction;
  enabled: boolean;
}

export interface HudView {
  role: ViewerRole;
  canAct: boolean;
  architectureName: string;
  runner: typeof DEMO_RUNNER;
  jackedIn: boolean;
  depth: string;
  floors: FloorView[];
  programs: ProgramView[];
  netActions: { used: number; max: number; pips: boolean[] };
  actions: ActionView[];
  log: readonly DemoLogEntry[];
  lastEvent: DemoEvent | null;
}

/**
 * Monta a visão do protótipo para um papel. Campos ocultos são omitidos, não
 * apenas marcados, para que o template nunca os receba (D11).
 */
export function buildHudView(state: DemoState, role: ViewerRole): HudView {
  const isGm = role === "gm";
  const canAct = role !== "spectator";
  const floors: FloorView[] = state.floors.map((floor, index) => {
    const discovered = state.discovered.includes(index);
    const isCurrent = state.position === index;
    if (!discovered && !isGm) return { index, floor: floor.floor, state: "unknown", isCurrent };
    const rez = state.iceRez[index];
    return {
      index,
      floor: floor.floor,
      state: "known",
      isCurrent,
      content: floor.content,
      label: floor.label,
      dv: floor.dv,
      blocking: isFloorBlocking(state, index),
      iceRez:
        rez === undefined || floor.iceRez === undefined ? null : { value: rez, max: floor.iceRez },
      hiddenFromPlayers: !discovered,
    };
  });

  const programs: ProgramView[] = state.programs.map((program) =>
    role === "spectator"
      ? { id: program.id, name: program.name, rezzed: program.rezzed }
      : {
          id: program.id,
          name: program.name,
          rezzed: program.rezzed,
          stats: { kind: program.kind, rez: program.rez, rezMax: program.rezMax },
        },
  );

  const { used, max } = state.netActions;
  const pips = Array.from({ length: max }, (_, i) => i < max - used);
  const jackedIn = state.position !== null;
  const exhausted = used >= max;
  const here = state.position === null ? undefined : state.floors[state.position];

  const enabledFor: Record<DemoAction, boolean> = {
    jackIn: !jackedIn,
    pathfinder: jackedIn && !exhausted,
    advance: jackedIn && !exhausted,
    backdoor: jackedIn && !exhausted && here?.content === "password",
    zap: jackedIn && !exhausted && here?.content === "blackice",
    control: jackedIn && !exhausted && here?.content === "controlnode",
    newTurn: true,
    jackOut: jackedIn,
  };
  const actions: ActionView[] = canAct
    ? (Object.keys(enabledFor) as DemoAction[]).map((id) => ({ id, enabled: enabledFor[id] }))
    : [];

  return {
    role,
    canAct,
    architectureName: DEMO_ARCHITECTURE_NAME,
    runner: DEMO_RUNNER,
    jackedIn,
    depth: here ? String(here.floor).padStart(2, "0") : "--",
    floors,
    programs,
    netActions: { used, max, pips },
    actions,
    log: state.log,
    lastEvent: state.lastEvent,
  };
}
