import { inCombat } from "./combat-turn";
import { LOG_LIMIT, type LogEntry, type LogEvent, type LogValue } from "./log-entry";
import type { NetAction } from "./requests";
import type { PublicSession } from "./session-state";

type Draft = [LogEvent, Record<string, LogValue>];

export function describeAction(
  prev: PublicSession,
  next: PublicSession,
  action: NetAction,
): Draft[] {
  const drafts: Draft[] = [];
  const add = (event: LogEvent, data: Record<string, LogValue> = {}) => drafts.push([event, data]);
  switch (action.type) {
    case "jackIn":
      if (next.runnerPosition !== null) add("jackIn", { key: next.runnerPosition });
      break;
    case "jackOut":
      add("jackOut");
      break;
    case "moveTo":
      add("move", { key: action.key });
      break;
    case "reveal":
      add("reveal", action.masked ? { key: action.key, masked: true } : { key: action.key });
      break;
    case "iceTarget":
      add("iceTarget", { programId: action.programId });
      break;
    case "controlOption": {
      const choice = next.run.controlChoices.at(-1);
      if (choice) add("controlOption", { key: choice.key, label: choice.label });
      break;
    }
    case "clearNode":
      add("cleared", { key: action.key });
      break;
    case "restoreNode":
      add("restored", { key: action.key });
      break;
    case "rezProgram":
      add("rez", { programId: action.programId, rez: action.rez });
      break;
    case "newTurn":
      add("newTurn");
      break;
    case "adjustActions":
      add("actions", { delta: action.delta });
      break;
    case "undo": {
      const label = prev.history.at(-1)?.label;
      add("undo", label ? { label } : {});
      break;
    }
    case "initiative": {
      const f = next.run.fight;
      const total = action.side === "npc" ? f?.npcInit : f?.runnerInit;
      if (typeof total === "number") add("initiative", { side: action.side, total });
      break;
    }
    case "resolveCheck": {
      const p = prev.run.pending;
      if (!p) {
        add("damageSkipped");
        break;
      }
      const data: Record<string, LogValue> = {
        ability: p.ability,
        outcome: action.outcome,
        key: p.key,
        total: p.total,
      };
      if (p.opposed) data["opposed"] = p.opposed.total;
      if (p.programId) data["programId"] = p.programId;
      if (p.ability === "pathfinder" && action.outcome === "success") {
        const before = prev.netArch?.discovered.length ?? 0;
        data["found"] = Math.max(0, (next.netArch?.discovered.length ?? 0) - before);
      }
      if (p.ability === "damage" && prev.run.npcs.some((n) => n.key === p.key && !n.defeated)) {
        data["npc"] = true;
      }
      if (p.ability === "damage" && action.outcome === "success" && p.rezAfter !== null) {
        if (p.rezBefore !== null) data["rezBefore"] = p.rezBefore;
        data["rezAfter"] = p.rezAfter;
      }
      add("outcome", data);
      break;
    }
    default:
      break;
  }

  if (action.type === "undo") return drafts;
  for (const npc of next.run.npcs) {
    const before = prev.run.npcs.find((n) => n.key === npc.key);
    if (!before) add("npc", { key: npc.key });
    else if (npc.defeated && !before.defeated) add("npcDefeated", { key: npc.key });
  }
  for (const npc of prev.run.npcs) {
    const gone = !npc.defeated && !next.run.npcs.some((n) => n.key === npc.key);
    if (gone && npc.key === prev.runnerPosition) add("npcLeft", { key: npc.key });
  }
  if (next.run.ambush !== null && next.run.ambush !== prev.run.ambush) {
    add("ambush", { key: next.run.ambush });
  }
  const damage = next.run.lastIceDamage;
  if (damage && damage.seq !== prev.run.lastIceDamage?.seq) {
    const r = damage.result;
    const by: Record<string, LogValue> = damage.byNpc ? { npc: true } : {};
    if (r.kind === "brain") {
      add("iceDamage", { kind: r.kind, taken: r.taken, after: r.after, ...by });
    } else if (r.kind === "program") {
      add("iceDamage", {
        kind: r.kind,
        programId: r.programId,
        taken: r.taken,
        after: r.after,
        destroyed: r.destroyed,
      });
    } else add("iceDamage", { kind: r.kind, reason: r.reason, ...by });
  }
  if (inCombat(next) && next.run.iceTurn !== prev.run.iceTurn) {
    const npcFight = next.run.npcs.some((n) => n.key === next.runnerPosition && !n.defeated);
    add("turn", {
      holder: next.run.iceTurn ? "ice" : "runner",
      ...(npcFight ? { npc: true } : {}),
    });
  }
  return drafts;
}

export function appendLog(
  prev: PublicSession,
  next: PublicSession,
  action: NetAction,
): PublicSession {
  const drafts = describeAction(prev, next, action);
  if (drafts.length === 0) return next;
  let seq = prev.log.at(-1)?.seq ?? 0;
  const entries: LogEntry[] = drafts.map(([event, data]) => {
    seq += 1;
    return { seq, event, turn: next.run.turn, data };
  });
  return { ...next, log: [...prev.log, ...entries].slice(-LOG_LIMIT) };
}
