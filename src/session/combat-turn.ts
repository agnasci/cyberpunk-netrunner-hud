import { isEngaged } from "../domain/net-rules";
import type { RequestError } from "./requests";
import {
  initiativePending,
  npcAt,
  type NpcFight,
  type PublicRun,
  type PublicSession,
  toRunState,
} from "./session-state";

export type TurnHolder = "runner" | "ice";

function npcFight(session: PublicSession): NpcFight | null {
  const npc = npcAt(session);
  const f = session.run.fight;
  if (!npc || !f || f.key !== npc.key || f.runnerInit === null || f.npcInit === null) return null;
  return f;
}

export function inCombat(session: PublicSession): boolean {
  return isEngaged(toRunState(session)) || npcFight(session) !== null;
}

export function turnHolder(session: PublicSession): TurnHolder | null {
  if (!inCombat(session)) return null;
  return session.run.iceTurn ? "ice" : "runner";
}

function busy(run: PublicRun): boolean {
  return (
    run.pending !== null ||
    run.awaitingDamage !== null ||
    run.iceHit !== null ||
    run.ambush !== null
  );
}

function iceActing(run: PublicRun): boolean {
  return run.pending?.ability === "iceAttack" || (run.iceHit !== null && !run.iceHit.byNpc);
}

function toIceTurn(session: PublicSession): PublicSession {
  const fight = session.run.fight;
  return {
    ...session,
    run: {
      ...session.run,
      iceTurn: true,
      turn: session.run.turn + 1,
      fight: fight ? { ...fight, npcActionsUsed: 0 } : null,
    },
  };
}

function toRunnerTurn(session: PublicSession): PublicSession {
  return {
    ...session,
    run: { ...session.run, iceTurn: false, actionsUsed: 0, programsUsed: [] },
  };
}

function syncFight(prev: PublicSession, next: PublicSession): PublicSession {
  const npc = npcAt(next);
  const fight = next.run.fight;
  if (!npc) return fight ? { ...next, run: { ...next.run, fight: null } } : next;
  if (!fight || fight.key !== npc.key) {
    const fresh: NpcFight = { key: npc.key, runnerInit: null, npcInit: null, npcActionsUsed: 0 };
    return { ...next, run: { ...next.run, fight: fresh, iceTurn: false } };
  }
  if (initiativePending(prev) && !initiativePending(next)) {
    const npcFirst = (fight.npcInit ?? 0) > (fight.runnerInit ?? 0);
    return {
      ...next,
      run: { ...next.run, iceTurn: npcFirst, fight: { ...fight, npcActionsUsed: 0 } },
    };
  }
  return next;
}

export function settleTurn(
  prev: PublicSession,
  next: PublicSession,
  maxActions: number,
  npcMaxActions = 0,
): PublicSession {
  const synced = syncFight(prev, next);
  if (!inCombat(synced)) {
    return synced.run.iceTurn ? toRunnerTurn(synced) : synced;
  }
  const fight = npcFight(synced);
  if (synced.run.iceTurn) {
    if (fight) {
      const spent = npcMaxActions > 0 && fight.npcActionsUsed >= npcMaxActions;
      return spent && !busy(synced.run) ? toRunnerTurn(synced) : synced;
    }
    return iceActing(prev.run) && !iceActing(synced.run) ? toRunnerTurn(synced) : synced;
  }
  const spent = maxActions > 0 && synced.run.actionsUsed >= maxActions;
  return spent && !busy(synced.run) ? toIceTurn(synced) : synced;
}

export function applyEndTurn(session: PublicSession, isGM: boolean): PublicSession | RequestError {
  if (!inCombat(session)) return "not-engaged";
  if (busy(session.run)) return "check-pending";
  if (!session.run.iceTurn) return toIceTurn(session);
  return isGM ? toRunnerTurn(session) : "ice-turn";
}

export function newTurnRun(session: PublicSession): Partial<PublicRun> {
  const fight = session.run.fight;
  return {
    turn: session.run.turn + 1,
    actionsUsed: 0,
    programsUsed: [],
    iceTurn: inCombat(session),
    fight: fight ? { ...fight, npcActionsUsed: 0 } : null,
  };
}
