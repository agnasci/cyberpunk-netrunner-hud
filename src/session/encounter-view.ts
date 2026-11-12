import type { IceDamageResult, IceHitTarget } from "../domain/ice-hit";
import type { RuleContext } from "../domain/net-rules";
import { iceLinkOf, needsOpposed, npcLinkOf, suggestOutcome, targetOf } from "./checks";
import type { IceStats } from "./requests";
import {
  DV_CHECKS,
  initiativePending,
  npcAt,
  type PendingKind,
  type PublicSession,
  type ViewerRole,
} from "./session-state";

export type OpposedRollKind = "def" | "per" | "defense" | "npcDefense" | "speed";

export interface EncounterIceView {
  key: number;
  link: { uuid: string; stats: IceStats | null } | null;
  defeated: boolean;
  canLink: boolean;
  canAttack: boolean;
}

export interface PendingView {
  kind: PendingKind;
  total: number;
  opposed: number | null;
  opposedRoll: OpposedRollKind | null;
  canRollOpposed: boolean;
  dv: number | null;
  suggestion: "success" | "failure" | null;
  canConfirm: boolean;
  rez: { before: number; after: number } | null;
  hp: boolean;
}

export interface EncounterNpcView {
  key: number;
  actorUuid: string;
  runnerInit: number | null;
  npcInit: number | null;
  canRollRunner: boolean;
  canRollNpc: boolean;
  initiativePending: boolean;
  canAttack: boolean;
  actionsUsed: number;
}

export interface IceHitView {
  target: IceHitTarget;
  formula: string | null;
  npc: { actorUuid: string; programId: string | null } | null;
  iceName: string;
  canRoll: boolean;
  canSkip: boolean;
  pickProgram: boolean;
}

export interface AmbushView {
  key: number;
  canRoll: boolean;
  linked: boolean;
  canSkip: boolean;
}

export interface EncounterView {
  ice: EncounterIceView | null;
  pending: PendingView | null;
  awaitingDamage: boolean;
  canRollDamage: boolean;
  canSkipDamage: boolean;
  iceHit: IceHitView | null;
  lastIceDamage: IceDamageResult | null;
  npc: EncounterNpcView | null;
  ambush: AmbushView | null;
}

export interface EncounterInput {
  session: PublicSession;
  role: ViewerRole;
  rules: RuleContext;
  readIce(actorUuid: string): IceStats | null;
  dvOf(key: number): number | null;
}

const OPPOSED: Partial<Record<PendingKind, OpposedRollKind>> = {
  zap: "def",
  slide: "per",
  programAttack: "def",
  iceAttack: "defense",
  npcAttack: "defense",
  ambush: "speed",
};

export function buildEncounterView(input: EncounterInput): EncounterView {
  const { session, role, rules } = input;
  const { run } = session;
  const isGm = role === "gm";
  const canControl = isGm || role === "netrunner";
  const at = rules.run.position;
  const busy = run.pending !== null || run.awaitingDamage !== null || run.iceHit !== null;

  let ice: EncounterIceView | null = null;
  if (at?.content === "blackice") {
    const uuid = iceLinkOf(session, at.key);
    const defeated = run.cleared.includes(at.key);
    ice = {
      key: at.key,
      link: uuid ? { uuid, stats: input.readIce(uuid) } : null,
      defeated,
      canLink: isGm && run.pending === null,
      canAttack: isGm && !busy && !defeated && uuid !== null && run.ambush === null,
    };
  }

  const p = run.pending;
  let pending: PendingView | null = null;
  if (p) {
    let opposedRoll = needsOpposed(p.ability) && !p.opposed ? (OPPOSED[p.ability] ?? null) : null;
    const npcTarget = npcLinkOf(session, p.key);
    if (npcTarget && (opposedRoll === "def" || opposedRoll === "per")) opposedRoll = "npcDefense";
    const rollerIsGm =
      opposedRoll === "def" || opposedRoll === "per" || opposedRoll === "npcDefense";
    const dv =
      isGm && (DV_CHECKS as readonly string[]).includes(p.ability) ? input.dvOf(p.key) : null;
    const link = targetOf(session, p.key)?.actorUuid ?? null;
    const iceLink = iceLinkOf(session, p.key);
    const iceRez =
      p.ability === "damage" && iceLink && !npcTarget
        ? input.readIce(iceLink)?.rez.value
        : undefined;
    const suggestion: PendingView["suggestion"] = isGm ? suggestOutcome(p, dv) : null;
    pending = {
      kind: p.ability,
      total: p.total,
      opposed: p.opposed?.total ?? null,
      opposedRoll,
      canRollOpposed: opposedRoll !== null && (rollerIsGm ? isGm && link !== null : canControl),
      dv,
      suggestion,
      canConfirm: isGm && !(needsOpposed(p.ability) && !p.opposed),
      rez:
        p.ability === "damage" && p.rezAfter !== null
          ? {
              before: npcTarget ? (p.rezBefore ?? p.rezAfter) : (iceRez ?? p.rezAfter),
              after: p.rezAfter,
            }
          : null,
      hp: npcTarget !== null && p.ability === "damage",
    };
  }

  const awaitingDamage = run.awaitingDamage !== null && p === null;
  let iceHit: IceHitView | null = null;
  const byNpc = run.iceHit?.byNpc ?? null;
  if (run.iceHit && byNpc) {
    iceHit = {
      target: run.iceHit.target,
      formula: isGm && byNpc.programId === null ? "1d6" : null,
      npc: byNpc,
      iceName: "",
      canRoll: isGm,
      canSkip: isGm,
      pickProgram: false,
    };
  } else if (run.iceHit) {
    const link = iceLinkOf(session, run.iceHit.key);
    const stats = link ? input.readIce(link) : null;
    const formula = isGm ? (stats?.damageFormula ?? null) : null;
    iceHit = {
      target: run.iceHit.target,
      formula,
      npc: null,
      iceName: stats?.name ?? "",
      canRoll: isGm && formula !== null && run.iceHit.pickProgram !== true,
      canSkip: isGm,
      pickProgram: isGm && run.iceHit.pickProgram === true,
    };
  }
  const here = npcAt(session);
  const fight = run.fight && here && run.fight.key === here.key ? run.fight : null;
  const pendingInit = initiativePending(session);
  const npc: EncounterNpcView | null = here
    ? {
        key: here.key,
        actorUuid: here.actorUuid,
        runnerInit: fight?.runnerInit ?? null,
        npcInit: fight?.npcInit ?? null,
        canRollRunner: canControl && fight !== null && fight.runnerInit === null,
        canRollNpc: isGm && fight !== null && fight.npcInit === null,
        initiativePending: pendingInit,
        canAttack: isGm && !busy && !pendingInit && fight !== null,
        actionsUsed: fight?.npcActionsUsed ?? 0,
      }
    : null;
  const last = run.lastIceDamage;
  const ambushLink = run.ambush !== null ? iceLinkOf(session, run.ambush) : null;
  const ambush: AmbushView | null =
    run.ambush !== null && p === null
      ? {
          key: run.ambush,
          canRoll: isGm && ambushLink !== null,
          linked: ambushLink !== null,
          canSkip: isGm,
        }
      : null;
  return {
    ambush,
    npc,
    iceHit,
    lastIceDamage: last && at?.key === last.key ? last.result : null,
    ice,
    pending,
    awaitingDamage,
    canRollDamage: awaitingDamage && canControl,
    canSkipDamage: awaitingDamage && isGm,
  };
}
