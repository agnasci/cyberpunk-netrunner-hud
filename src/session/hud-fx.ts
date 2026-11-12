import { isEngaged } from "../domain/net-rules";
import { inCombat } from "./combat-turn";
import type { NetFloorContent } from "../domain/net-architecture";
import { type PublicSession, toRunState } from "./session-state";

export type NodeFx =
  "scan" | "jack-in" | "move" | "ice-alert" | "breach" | "control" | "hit" | "derez" | "fail";

export type BannerFx =
  | "jack-in"
  | "jack-out"
  | "ice-alert"
  | "ice-attack"
  | "breach"
  | "identify"
  | "mapped"
  | "cloaked"
  | "virus"
  | "control"
  | "zap-hit"
  | "program-hit"
  | "damage"
  | "derez"
  | "fail"
  | "evade"
  | "ice-hit"
  | "brain-damage"
  | "program-crash"
  | "ice-miss"
  | "new-turn"
  | "ice-turn"
  | "runner-turn"
  | "npc-alert"
  | "npc-turn"
  | "npc-hit"
  | "npc-miss"
  | "npc-attack"
  | "npc-down"
  | "undo";

export type AlertFx = "ice-alert" | "fail";

export interface HudFx {
  nodes: Record<number, NodeFx>;
  banner: BannerFx | null;
  alert: AlertFx | null;
}

export const BANNER_FX: readonly BannerFx[] = [
  "undo",
  "npc-down",
  "derez",
  "brain-damage",
  "program-crash",
  "ice-hit",
  "npc-hit",
  "fail",
  "breach",
  "identify",
  "mapped",
  "cloaked",
  "virus",
  "control",
  "damage",
  "zap-hit",
  "program-hit",
  "evade",
  "npc-attack",
  "ice-attack",
  "npc-alert",
  "ice-alert",
  "ice-miss",
  "npc-miss",
  "jack-in",
  "jack-out",
  "ice-turn",
  "npc-turn",
  "runner-turn",
  "new-turn",
];

const CLEARED_FX: Record<NetFloorContent, [NodeFx, BannerFx]> = {
  password: ["breach", "breach"],
  controlnode: ["control", "control"],
  blackice: ["derez", "derez"],
  file: ["breach", "identify"],
};

export function diffFx(prev: PublicSession | null, next: PublicSession): HudFx {
  const nodes: Record<number, NodeFx> = {};
  const banners = new Set<BannerFx>();
  let alert: AlertFx | null = null;
  if (!prev || prev.id !== next.id) return { nodes, banner: null, alert };
  if (next.run.undoSeq !== prev.run.undoSeq) return { nodes, banner: "undo", alert };

  const prevKeys = new Set(prev.netArch?.discovered.map((f) => f.key) ?? []);
  const discovered = next.netArch?.discovered ?? [];
  for (const floor of discovered) if (!prevKeys.has(floor.key)) nodes[floor.key] = "scan";

  const from = prev.runnerPosition;
  const to = next.runnerPosition;
  if (from === null && to !== null) {
    nodes[to] = "jack-in";
    banners.add("jack-in");
  } else if (from !== null && to === null) {
    banners.add("jack-out");
  } else if (from !== null && to !== null && from !== to) {
    nodes[to] = "move";
  }

  const engagedNow = isEngaged(toRunState(next));
  const engagedBefore = isEngaged(toRunState(prev)) && from === to;
  if (to !== null && engagedNow && !engagedBefore) {
    nodes[to] = "ice-alert";
    banners.add("ice-alert");
    alert = "ice-alert";
  }
  const attack = next.run.pending;
  const isAttack = attack?.ability === "iceAttack" || attack?.ability === "npcAttack";
  if (attack && isAttack && prev.run.pending?.messageId !== attack.messageId) {
    nodes[attack.key] = "ice-alert";
    banners.add(attack.ability === "npcAttack" ? "npc-attack" : "ice-attack");
    alert = "ice-alert";
  }
  for (const npc of next.run.npcs) {
    const before = prev.run.npcs.find((n) => n.key === npc.key);
    if (!before) {
      nodes[npc.key] = "ice-alert";
      banners.add("npc-alert");
      alert = "ice-alert";
    } else if (npc.defeated && !before.defeated) {
      nodes[npc.key] = "derez";
      banners.add("npc-down");
    }
  }

  const result = next.run.lastOutcome;
  const resultKey = result && result.seq !== prev.run.lastOutcome?.seq ? result.key : null;
  if (result && resultKey !== null) {
    const ok = result.outcome === "success";
    switch (result.ability) {
      case "backdoor":
      case "control":
      case "eyedee":
      case "zap":
      case "slide": {
        if (!ok) {
          nodes[resultKey] = "fail";
          banners.add("fail");
          alert = "fail";
        } else if (result.ability === "slide") {
          banners.add("evade");
        } else {
          const [fx, banner]: [NodeFx, BannerFx] =
            result.ability === "backdoor"
              ? ["breach", "breach"]
              : result.ability === "control"
                ? ["control", "control"]
                : result.ability === "eyedee"
                  ? ["breach", "identify"]
                  : ["hit", "zap-hit"];
          nodes[resultKey] = fx;
          banners.add(banner);
        }
        break;
      }
      case "programAttack":
        if (ok) {
          nodes[resultKey] = "hit";
          banners.add("program-hit");
        } else {
          nodes[resultKey] = "fail";
          banners.add("fail");
          alert = "fail";
        }
        break;
      case "damage":
        if (ok) {
          nodes[resultKey] = "hit";
          banners.add("damage");
        }
        break;
      case "iceAttack":
        banners.add(ok ? "ice-hit" : "ice-miss");
        if (ok) alert = "fail";
        break;
      case "npcAttack":
        banners.add(ok ? "npc-hit" : "npc-miss");
        if (ok) alert = "fail";
        break;
      case "ambush":
        banners.add(ok ? "ice-hit" : "ice-miss");
        if (ok) alert = "fail";
        break;
      case "pathfinder":
      case "cloak":
      case "virus":
        if (ok) {
          banners.add(
            result.ability === "pathfinder"
              ? "mapped"
              : result.ability === "cloak"
                ? "cloaked"
                : "virus",
          );
        } else {
          banners.add("fail");
          alert = "fail";
        }
        break;
    }
  }

  const iceDamage = next.run.lastIceDamage;
  if (iceDamage && iceDamage.seq !== prev.run.lastIceDamage?.seq) {
    const kind = iceDamage.result.kind;
    if (kind !== "none") {
      banners.add(kind === "brain" ? "brain-damage" : "program-crash");
      if (to !== null) nodes[to] = "fail";
      alert = "fail";
    }
  }

  const prevCleared = new Set(prev.run.cleared);
  for (const key of next.run.cleared) {
    if (prevCleared.has(key)) continue;
    const content = discovered.find((f) => f.key === key)?.content;
    if (!content) continue;
    const [fx, banner] = CLEARED_FX[content];
    nodes[key] = fx;
    banners.add(banner);
  }

  if (inCombat(next) && next.run.iceTurn !== prev.run.iceTurn) {
    const npcFight = next.run.npcs.some((n) => n.key === to && !n.defeated);
    banners.add(next.run.iceTurn ? (npcFight ? "npc-turn" : "ice-turn") : "runner-turn");
  }
  if (next.run.turn > prev.run.turn) banners.add("new-turn");
  const banner = BANNER_FX.find((b) => banners.has(b)) ?? null;
  return { nodes, banner, alert };
}
