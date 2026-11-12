import type { NetAction, RequestError } from "./requests";
import { type PublicSession, type UndoEntry, USED_ROLLS_LIMIT } from "./session-state";
import { inverseEffects, type SheetEffect } from "./sheet-effects";

export const UNDO_LIMIT = 10;

const UNRECORDED: ReadonlySet<NetAction["type"]> = new Set([
  "reveal",
  "conceal",
  "end",
  "undo",
  "moveNpc",
]);

export function isRecorded(action: NetAction): boolean {
  return !UNRECORDED.has(action.type);
}

export function pushHistory(
  prev: PublicSession,
  next: PublicSession,
  action: NetAction,
  effects: readonly SheetEffect[],
): PublicSession {
  const entry: UndoEntry = {
    label: action.type,
    runnerPosition: prev.runnerPosition,
    run: prev.run,
    undo: inverseEffects(effects),
  };
  return { ...next, history: [...prev.history, entry].slice(-UNDO_LIMIT) };
}

export function applyUndo(
  session: PublicSession,
  effects: SheetEffect[],
): PublicSession | RequestError {
  const entry = session.history.at(-1);
  if (!entry) return "nothing-to-undo";
  const position = entry.runnerPosition;
  if (position !== null && !session.netArch?.discovered.some((f) => f.key === position)) {
    return "invalid-target";
  }
  effects.push(...entry.undo);
  const kept = entry.run.usedRolls.filter((id) => !session.run.usedRolls.includes(id));
  return {
    ...session,
    runnerPosition: position,
    run: {
      ...entry.run,
      usedRolls: [...kept, ...session.run.usedRolls].slice(-USED_ROLLS_LIMIT),
      undoSeq: session.run.undoSeq + 1,
    },
    history: session.history.slice(0, -1),
  };
}
