import {
  chooseIceTarget,
  type IceDamageResult,
  iceDamageResult,
  type RunnerVitals,
  sameFormula,
} from "../domain/ice-hit";
import { toPublicFloor } from "../domain/net-architecture";
import { pathfinderReveal } from "../domain/pathfinder";
import { programStateOf } from "./sheet-effects";
import {
  armorReduction,
  beatsDv,
  flakAtk,
  checkAction,
  checkProgramAttack,
  ONCE_PER_RUN_PROGRAMS,
  programKey,
  NETRUNNER_ATTACKER_CLASSES,
  netActionsPerTurn,
  type RuleContext,
  winsContest,
} from "../domain/net-rules";
import type {
  NetAction,
  ProcessContext,
  RequestError,
  RollEvidence,
  SheetEffect,
} from "./requests";
import {
  CONTEST_CHECKS,
  DV_CHECKS,
  type PendingCheck,
  type PendingKind,
  type PublicRun,
  initiativePending,
  npcAt,
  type PublicSession,
  USED_ROLLS_LIMIT,
} from "./session-state";

export const ZAP_DAMAGE_FORMULA = "1d6";

type Applied = PublicSession | RequestError;

export function withRun(session: PublicSession, run: Partial<PublicRun>): PublicSession {
  return { ...session, run: { ...session.run, ...run } };
}

export function needsOpposed(kind: PendingKind): boolean {
  return (
    kind === "programAttack" ||
    kind === "iceAttack" ||
    kind === "npcAttack" ||
    kind === "ambush" ||
    (CONTEST_CHECKS as readonly string[]).includes(kind)
  );
}

export function suggestOutcome(
  pending: PendingCheck,
  dv: number | null,
): "success" | "failure" | null {
  if ((DV_CHECKS as readonly string[]).includes(pending.ability)) {
    return dv === null ? null : beatsDv(pending.total, dv) ? "success" : "failure";
  }
  if (pending.opposed)
    return winsContest(pending.total, pending.opposed.total) ? "success" : "failure";
  if (pending.ability === "pathfinder" || pending.ability === "cloak") return "success";
  return pending.ability === "damage" ? "success" : null;
}

export function iceLinkOf(session: PublicSession, key: number): string | null {
  return session.run.ice.find((l) => l.key === key)?.actorUuid ?? null;
}

export function npcLinkOf(session: PublicSession, key: number): string | null {
  return session.run.npcs.find((n) => n.key === key && !n.defeated)?.actorUuid ?? null;
}

export function targetOf(
  session: PublicSession,
  key: number,
): { kind: "npc" | "ice"; actorUuid: string } | null {
  const npc = npcLinkOf(session, key);
  if (npc) return { kind: "npc", actorUuid: npc };
  const ice = iceLinkOf(session, key);
  return ice ? { kind: "ice", actorUuid: ice } : null;
}

function acceptRoll(
  session: PublicSession,
  ctx: ProcessContext,
  messageId: string,
  actorUuid: string,
): RollEvidence | null {
  const roll = ctx.readRoll(messageId);
  const valid =
    roll !== null &&
    roll.authorId === ctx.sender.id &&
    roll.actorUuid === actorUuid &&
    Number.isInteger(roll.total) &&
    !session.run.usedRolls.includes(messageId);
  return valid ? roll : null;
}

function pendingFrom(
  kind: PendingKind,
  key: number,
  roll: RollEvidence,
  messageId: string,
  userId: string,
  rezAfter: number | null = null,
  programId: string | null = null,
  rezBefore: number | null = null,
): PendingCheck {
  return {
    ability: kind,
    key,
    total: roll.total,
    messageId,
    userId,
    opposed: null,
    rezAfter,
    rezBefore,
    programId,
  };
}

function used(session: PublicSession, messageId: string): string[] {
  return [...session.run.usedRolls, messageId].slice(-USED_ROLLS_LIMIT);
}

export function applyCheck(
  session: PublicSession,
  action: Extract<NetAction, { type: "check" }>,
  ctx: ProcessContext,
  rules: RuleContext,
): Applied {
  const { run } = session;
  if (run.pending || run.iceHit) return "check-pending";
  const roll = acceptRoll(session, ctx, action.messageId, session.actorUuid);
  if (action.ability === "damage") {
    const key = run.awaitingDamage;
    if (key === null) return "no-damage-pending";
    const fromProgram = run.damageProgram !== null;
    if (!roll || (!fromProgram && roll.formula !== ZAP_DAMAGE_FORMULA)) return "invalid-roll";
    const npc = npcLinkOf(session, key);
    if (npc) {
      const vitals = withArmor(ctx.readVitals(npc), ctx.readResources(npc).programs);
      if (!vitals) return "no-ice-link";
      const after = Math.max(0, vitals.hp - Math.max(0, roll.total - vitals.brainDamageReduction));
      return withRun(session, {
        pending: pendingFrom(
          "damage",
          key,
          roll,
          action.messageId,
          ctx.sender.id,
          after,
          null,
          vitals.hp,
        ),
        usedRolls: used(session, action.messageId),
      });
    }
    const link = iceLinkOf(session, key);
    const ice = link ? ctx.readIce(link) : null;
    if (!ice) return "no-ice-link";
    const rezAfter = Math.max(0, ice.rez.value - roll.total);
    return withRun(session, {
      pending: pendingFrom(
        "damage",
        key,
        roll,
        action.messageId,
        ctx.sender.id,
        rezAfter,
        null,
        ice.rez.value,
      ),
      usedRolls: used(session, action.messageId),
    });
  }
  if (run.awaitingDamage !== null) return "check-pending";
  const programId = action.ability === "programAttack" ? (action.programId ?? "") : null;
  const eligibility =
    programId !== null ? checkProgramAttack(rules, programId) : checkAction(rules, action.ability);
  if (!eligibility.allowed) return eligibility.reason;
  const at = rules.run.position;
  if (!roll || !at) return "invalid-roll";
  const npcTarget = programId !== null ? npcLinkOf(session, at.key) : null;
  const flak = npcTarget
    ? flakAtk(
        ctx.readResources(npcTarget).programs,
        ctx.runner.programs?.find((p) => p.itemId === programId),
      )
    : 0;
  return withRun(session, {
    pending: pendingFrom(
      action.ability,
      at.key,
      { ...roll, total: roll.total - flak },
      action.messageId,
      ctx.sender.id,
      null,
      programId,
    ),
    usedRolls: used(session, action.messageId),
    actionsUsed: run.actionsUsed + eligibility.cost,
    programsUsed:
      programId !== null && !run.programsUsed.includes(programId)
        ? [...run.programsUsed, programId]
        : run.programsUsed,
    netrunUsed:
      programId !== null && onceProgram(ctx, programId) && !run.netrunUsed.includes(programId)
        ? [...run.netrunUsed, programId]
        : run.netrunUsed,
  });
}

function withArmor(
  vitals: RunnerVitals | null,
  programs: ProcessContext["runner"]["programs"],
): RunnerVitals | null {
  if (!vitals) return null;
  return {
    ...vitals,
    brainDamageReduction: vitals.brainDamageReduction + armorReduction(programs),
  };
}

function onceProgram(ctx: ProcessContext, programId: string): boolean {
  const program = ctx.runner.programs?.find((p) => p.itemId === programId);
  return ONCE_PER_RUN_PROGRAMS.has(programKey(program?.name));
}

export function applyOppose(
  session: PublicSession,
  action: Extract<NetAction, { type: "oppose" }>,
  ctx: ProcessContext,
): Applied {
  const pending = session.run.pending;
  if (!pending || pending.opposed || !needsOpposed(pending.ability)) return "nothing-to-oppose";
  let actorUuid = session.actorUuid;
  if (
    pending.ability !== "iceAttack" &&
    pending.ability !== "npcAttack" &&
    pending.ability !== "ambush"
  ) {
    if (!ctx.sender.isGM) return "not-authorized";
    const target = targetOf(session, pending.key);
    if (!target) return "no-ice-link";
    actorUuid = target.actorUuid;
  }
  const roll = acceptRoll(session, ctx, action.messageId, actorUuid);
  if (!roll) return "invalid-roll";
  return withRun(session, {
    pending: {
      ...pending,
      opposed: { total: roll.total, messageId: action.messageId, userId: ctx.sender.id },
    },
    usedRolls: used(session, action.messageId),
  });
}

export function applyIceAttack(
  session: PublicSession,
  action: Extract<NetAction, { type: "iceAttack" }>,
  ctx: ProcessContext,
  rules: RuleContext,
): Applied {
  const { run } = session;
  if (run.pending || run.awaitingDamage !== null || run.iceHit) return "check-pending";
  const at = rules.run.position;
  if (!at || at.content !== "blackice" || run.cleared.includes(at.key)) return "invalid-target";
  const link = iceLinkOf(session, at.key);
  if (!link) return "no-ice-link";
  const roll = acceptRoll(session, ctx, action.messageId, link);
  if (!roll) return "invalid-roll";
  return withRun(session, {
    pending: pendingFrom("iceAttack", at.key, roll, action.messageId, ctx.sender.id),
    usedRolls: used(session, action.messageId),
  });
}

export function applyResolve(
  session: PublicSession,
  action: Extract<NetAction, { type: "resolveCheck" }>,
  effects: SheetEffect[],
  ctx: ProcessContext,
): Applied {
  const { run } = session;
  const pending = run.pending;
  const success = action.outcome === "success";
  if (!pending) {
    if (!success && (run.awaitingDamage !== null || run.iceHit || run.ambush !== null)) {
      return withRun(session, {
        awaitingDamage: null,
        damageProgram: null,
        iceHit: null,
        ambush: null,
      });
    }
    return "no-pending-check";
  }
  if (needsOpposed(pending.ability) && !pending.opposed) return "awaiting-opposed";
  const decided = withRun(session, {
    lastOutcome: {
      seq: (run.lastOutcome?.seq ?? 0) + 1,
      ability: pending.ability,
      key: pending.key,
      outcome: action.outcome,
    },
  });
  return resolvePending(decided, pending, success, effects, ctx);
}

function resolvePending(
  session: PublicSession,
  pending: PendingCheck,
  success: boolean,
  effects: SheetEffect[],
  ctx: ProcessContext,
): Applied {
  const { run } = session;
  const clearedWith = (key: number) =>
    run.cleared.includes(key) ? run.cleared : [...run.cleared, key];
  switch (pending.ability) {
    case "cloak":
    case "virus":
      return withRun(session, { pending: null });
    case "pathfinder":
      return success ? pathfinderFrom(session, pending, ctx) : withRun(session, { pending: null });
    case "ambush":
      return success ? iceHitFrom(session, pending.key, ctx) : withRun(session, { pending: null });
    case "backdoor":
    case "control":
    case "eyedee":
      return withRun(session, {
        pending: null,
        cleared: success ? clearedWith(pending.key) : run.cleared,
      });
    case "zap":
    case "programAttack":
      return withRun(session, {
        pending: null,
        awaitingDamage: success ? pending.key : null,
        damageProgram: success ? pending.programId : null,
      });
    case "slide":
      return withRun(session, {
        pending: null,
        evaded:
          success && !run.evaded.includes(pending.key) ? [...run.evaded, pending.key] : run.evaded,
      });
    case "iceAttack":
      return success ? iceHitFrom(session, pending.key, ctx) : withRun(session, { pending: null });
    case "npcAttack":
      return success
        ? npcHitFrom(session, pending, ctx, effects)
        : withRun(session, { pending: null });
    case "damage": {
      if (!success) return withRun(session, { pending: null });
      const npc = npcLinkOf(session, pending.key);
      if (npc && pending.rezAfter !== null) {
        effects.push({
          type: "setRunnerHp",
          actorUuid: npc,
          value: pending.rezAfter,
          before: pending.rezBefore ?? pending.rezAfter,
        });
        return withRun(session, {
          pending: null,
          awaitingDamage: null,
          damageProgram: null,
          npcs:
            pending.rezAfter === 0
              ? run.npcs.map((n) => (n.key === pending.key ? { ...n, defeated: true } : n))
              : run.npcs,
        });
      }
      const link = iceLinkOf(session, pending.key);
      if (!link || pending.rezAfter === null) return "no-ice-link";
      effects.push({
        type: "setIceRez",
        actorUuid: link,
        value: pending.rezAfter,
        before: pending.rezBefore ?? pending.rezAfter,
      });
      return withRun(session, {
        pending: null,
        awaitingDamage: null,
        damageProgram: null,
        cleared: pending.rezAfter === 0 ? clearedWith(pending.key) : run.cleared,
      });
    }
  }
}

function iceHitFrom(session: PublicSession, key: number, ctx: ProcessContext): Applied {
  const link = iceLinkOf(session, key);
  const ice = link ? ctx.readIce(link) : null;
  const target = chooseIceTarget(
    ice?.specialOnly ? "other" : (ice?.iceClass ?? "other"),
    withArmor(ctx.readVitals(session.actorUuid), ctx.runner.programs),
    ctx.runner.programs ?? [],
    (count) => ctx.pick(count),
  );
  if (target.kind === "none") {
    return withRun(session, {
      pending: null,
      iceHit: null,
      lastIceDamage: nextIceDamage(session, key, target),
    });
  }
  const rezzed = (ctx.runner.programs ?? []).filter((p) => p.rezzed && (p.rez ?? 0) > 0);
  const pickProgram = target.kind === "program" && rezzed.length > 1;
  const fixed =
    target.kind === "program" && ice?.destroysPrograms ? { ...target, destroys: true } : target;
  return withRun(session, {
    pending: null,
    iceHit: pickProgram ? { key, target: fixed, pickProgram } : { key, target: fixed },
  });
}

function pathfinderFrom(
  session: PublicSession,
  pending: PendingCheck,
  ctx: ProcessContext,
): Applied {
  const arch = session.netArch;
  const floors = ctx.architecture?.floors ?? [];
  if (!arch) return withRun(session, { pending: null });
  const keys = pathfinderReveal(
    floors,
    pending.key,
    pending.total,
    ctx.architecture?.forks,
    ctx.pathfinderGate,
  );
  const known = new Set(arch.discovered.map((f) => f.key));
  const added = floors.filter((f) => keys.includes(f.key) && !known.has(f.key)).map(toPublicFloor);
  const revealed = new Set(added.map((f) => f.key));
  return {
    ...session,
    netArch: {
      ...arch,
      discovered: [...arch.discovered, ...added],
      mapped: arch.mapped.filter((m) => !revealed.has(m.key)),
    },
    run: { ...session.run, pending: null },
  };
}

export function applyAmbush(
  session: PublicSession,
  action: Extract<NetAction, { type: "ambush" }>,
  ctx: ProcessContext,
): Applied {
  const { run } = session;
  if (run.pending || run.awaitingDamage !== null || run.iceHit) return "check-pending";
  const key = run.ambush;
  if (key === null || key !== session.runnerPosition) return "invalid-target";
  const link = iceLinkOf(session, key);
  if (!link) return "no-ice-link";
  const roll = acceptRoll(session, ctx, action.messageId, link);
  if (!roll) return "invalid-roll";
  return withRun(session, {
    ambush: null,
    pending: pendingFrom("ambush", key, roll, action.messageId, ctx.sender.id),
    usedRolls: used(session, action.messageId),
  });
}

export function applyIceTarget(
  session: PublicSession,
  action: Extract<NetAction, { type: "iceTarget" }>,
  ctx: ProcessContext,
): Applied {
  const hit = session.run.iceHit;
  if (!hit || hit.byNpc || hit.target.kind !== "program") return "no-damage-pending";
  const program = (ctx.runner.programs ?? []).find(
    (p) => p.itemId === action.programId && p.rezzed && (p.rez ?? 0) > 0,
  );
  if (!program) return "invalid-program";
  const destroys = hit.target.destroys === true;
  return withRun(session, {
    iceHit: {
      key: hit.key,
      target: {
        kind: "program",
        programId: program.itemId,
        rezBase: program.rez ?? 0,
        ...(destroys ? { destroys: true } : {}),
      },
    },
  });
}

function nextIceDamage(
  session: PublicSession,
  key: number,
  result: IceDamageResult,
  byNpc = false,
): PublicRun["lastIceDamage"] {
  const seq = (session.run.lastIceDamage?.seq ?? 0) + 1;
  return byNpc ? { seq, key, result, byNpc } : { seq, key, result };
}

function npcHitFrom(
  session: PublicSession,
  pending: PendingCheck,
  ctx: ProcessContext,
  effects: SheetEffect[],
): Applied {
  const npc = npcLinkOf(session, pending.key);
  if (!npc) return withRun(session, { pending: null });
  const shield =
    pending.programId !== null
      ? (ctx.runner.programs ?? []).find(
          (p) => p.rezzed && (p.rez ?? 0) > 0 && programKey(p.name) === "shield",
        )
      : undefined;
  if (shield) {
    effects.push({
      type: "setProgramState",
      actorUuid: session.actorUuid,
      programId: shield.itemId,
      state: { rezzed: false, rezValue: Math.max(0, shield.rez ?? 0), mark: "neutralized" },
      before: programStateOf(shield),
    });
    return withRun(session, {
      pending: null,
      lastIceDamage: nextIceDamage(session, pending.key, { kind: "none", reason: "shield" }, true),
    });
  }
  const vitals = withArmor(ctx.readVitals(session.actorUuid), ctx.runner.programs);
  if (!vitals) {
    return withRun(session, {
      pending: null,
      lastIceDamage: nextIceDamage(session, pending.key, { kind: "none", reason: "manual" }, true),
    });
  }
  return withRun(session, {
    pending: null,
    iceHit: {
      key: pending.key,
      target: { kind: "brain", hpBase: vitals.hp, reduction: vitals.brainDamageReduction },
      byNpc: { actorUuid: npc, programId: pending.programId },
    },
  });
}

export function applyNpcAttack(
  session: PublicSession,
  action: Extract<NetAction, { type: "npcAttack" }>,
  ctx: ProcessContext,
): Applied {
  const { run } = session;
  if (run.pending || run.awaitingDamage !== null || run.iceHit) return "check-pending";
  const npc = npcAt(session);
  const fight = run.fight;
  if (!npc || !fight || fight.key !== npc.key) return "invalid-target";
  if (initiativePending(session)) return "initiative";
  const resources = ctx.readResources(npc.actorUuid);
  if (fight.npcActionsUsed >= netActionsPerTurn(resources.interfaceRank)) return "no-actions-left";
  const programId = action.programId ?? null;
  const program =
    programId === null ? undefined : resources.programs?.find((p) => p.itemId === programId);
  if (programId !== null && (!program || !NETRUNNER_ATTACKER_CLASSES.has(program.programClass))) {
    return "invalid-program";
  }
  const roll = acceptRoll(session, ctx, action.messageId, npc.actorUuid);
  if (!roll) return "invalid-roll";
  return withRun(session, {
    pending: pendingFrom(
      "npcAttack",
      npc.key,
      { ...roll, total: roll.total - flakAtk(ctx.runner.programs, program) },
      action.messageId,
      ctx.sender.id,
      null,
      programId,
    ),
    usedRolls: used(session, action.messageId),
    fight: { ...fight, npcActionsUsed: fight.npcActionsUsed + 1 },
  });
}

export function applyInitiative(
  session: PublicSession,
  action: Extract<NetAction, { type: "initiative" }>,
  ctx: ProcessContext,
): Applied {
  const npc = npcAt(session);
  const fight = session.run.fight;
  if (!npc || !fight || fight.key !== npc.key) return "invalid-target";
  const forNpc = action.side === "npc";
  if (forNpc && !ctx.sender.isGM) return "not-authorized";
  if ((forNpc ? fight.npcInit : fight.runnerInit) !== null) return "invalid-roll";
  const actorUuid = forNpc ? npc.actorUuid : session.actorUuid;
  const roll = acceptRoll(session, ctx, action.messageId, actorUuid);
  const ref = ctx.readRef(actorUuid);
  if (!roll || ref === null || !roll.formula || !sameFormula(roll.formula, `1d10 + ${ref}`)) {
    return "invalid-roll";
  }
  return withRun(session, {
    fight: forNpc ? { ...fight, npcInit: roll.total } : { ...fight, runnerInit: roll.total },
    usedRolls: used(session, action.messageId),
  });
}

export function applyIceDamage(
  session: PublicSession,
  action: Extract<NetAction, { type: "iceDamage" }>,
  ctx: ProcessContext,
  effects: SheetEffect[],
): Applied {
  const hit = session.run.iceHit;
  if (!hit) return "no-damage-pending";
  if (hit.pickProgram) return "check-pending";
  if (hit.byNpc) return applyNpcDamage(session, hit, action, ctx, effects);
  const link = iceLinkOf(session, hit.key);
  const ice = link ? ctx.readIce(link) : null;
  if (!link || !ice) return "no-ice-link";
  const formula = ice.damageFormula ?? null;
  const roll = acceptRoll(session, ctx, action.messageId, link);
  if (!roll || formula === null || !roll.formula || !sameFormula(roll.formula, formula)) {
    return "invalid-roll";
  }
  const result = iceDamageResult(hit.target, roll.total);
  if (result.kind === "brain") {
    const before = hit.target.kind === "brain" ? hit.target.hpBase : result.after;
    effects.push({
      type: "setRunnerHp",
      actorUuid: session.actorUuid,
      value: result.after,
      before,
    });
  } else if (result.kind === "program") {
    const before = hit.target.kind === "program" ? hit.target.rezBase : result.after;
    effects.push({
      type: "setProgramState",
      actorUuid: session.actorUuid,
      programId: result.programId,
      state: {
        rezzed: result.after > 0,
        rezValue: result.after,
        mark: result.after > 0 ? "none" : result.destroyed ? "destroyed" : "neutralized",
      },
      before: { rezzed: true, rezValue: before, mark: "none" },
    });
  }
  return withRun(session, {
    iceHit: null,
    usedRolls: used(session, action.messageId),
    lastIceDamage: nextIceDamage(session, hit.key, result),
  });
}

function applyNpcDamage(
  session: PublicSession,
  hit: NonNullable<PublicRun["iceHit"]>,
  action: Extract<NetAction, { type: "iceDamage" }>,
  ctx: ProcessContext,
  effects: SheetEffect[],
): Applied {
  const npc = hit.byNpc;
  if (!npc) return "no-damage-pending";
  const roll = acceptRoll(session, ctx, action.messageId, npc.actorUuid);
  if (!roll) return "invalid-roll";
  if (npc.programId === null && (!roll.formula || !sameFormula(roll.formula, ZAP_DAMAGE_FORMULA))) {
    return "invalid-roll";
  }
  const result = iceDamageResult(hit.target, roll.total);
  if (result.kind === "brain" && hit.target.kind === "brain") {
    effects.push({
      type: "setRunnerHp",
      actorUuid: session.actorUuid,
      value: result.after,
      before: hit.target.hpBase,
    });
  }
  return withRun(session, {
    iceHit: null,
    usedRolls: used(session, action.messageId),
    lastIceDamage: nextIceDamage(session, hit.key, result, true),
  });
}
