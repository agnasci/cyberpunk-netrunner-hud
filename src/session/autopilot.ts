import { isEngaged } from "../domain/net-rules";
import { iceLinkOf, needsOpposed, suggestOutcome, targetOf } from "./checks";
import type { IceStats } from "./requests";
import { DV_CHECKS, npcAt, type PublicSession, toRunState } from "./session-state";

export type AutoStep =
  | { kind: "rollIce"; key: string; link: string; stat: "def" | "per" }
  | { kind: "rollAmbush"; key: string; link: string }
  | { kind: "rollIceAttack"; key: string; link: string }
  | { kind: "rollNpcDefense"; key: string; link: string }
  | { kind: "rollNpcInitiative"; key: string; link: string }
  | { kind: "resolve"; key: string; outcome: "success" | "failure" }
  | { kind: "rollIceDamage"; key: string; link: string; formula: string }
  | { kind: "rollNpcDamage"; key: string; link: string; programId: string | null };

export interface AutopilotInput {
  dvOf(key: number): number | null;
  readIce(actorUuid: string): IceStats | null;
}

export function nextAutoStep(session: PublicSession, input: AutopilotInput): AutoStep | null {
  const { run } = session;
  const p = run.pending;
  if (p) {
    if (needsOpposed(p.ability) && !p.opposed) {
      if (p.ability === "iceAttack" || p.ability === "npcAttack" || p.ability === "ambush") {
        return null;
      }
      const target = targetOf(session, p.key);
      if (!target) return null;
      const key = `${session.id}:${p.messageId}:oppose`;
      if (target.kind === "npc") return { kind: "rollNpcDefense", key, link: target.actorUuid };
      const stat = p.ability === "slide" ? "per" : "def";
      return { kind: "rollIce", key, link: target.actorUuid, stat };
    }
    const dv = (DV_CHECKS as readonly string[]).includes(p.ability) ? input.dvOf(p.key) : null;
    const outcome = suggestOutcome(p, dv);
    return outcome
      ? { kind: "resolve", key: `${session.id}:${p.messageId}:resolve`, outcome }
      : null;
  }
  const hit = run.iceHit;
  if (hit?.byNpc) {
    return {
      kind: "rollNpcDamage",
      key: `${session.id}:${session.revision}:npcDamage`,
      link: hit.byNpc.actorUuid,
      programId: hit.byNpc.programId,
    };
  }
  if (hit?.pickProgram) return null;
  if (hit) {
    const link = iceLinkOf(session, hit.key);
    const formula = link ? (input.readIce(link)?.damageFormula ?? null) : null;
    if (!link || !formula) return null;
    return {
      kind: "rollIceDamage",
      key: `${session.id}:${session.revision}:iceDamage`,
      link,
      formula,
    };
  }
  if (run.awaitingDamage !== null) return null;
  if (run.ambush !== null) {
    const link = iceLinkOf(session, run.ambush);
    return link ? { kind: "rollAmbush", key: `${session.id}:${run.ambush}:ambush`, link } : null;
  }
  const pos = session.runnerPosition;
  if (run.iceTurn && pos !== null && !npcAt(session) && isEngaged(toRunState(session))) {
    const link = iceLinkOf(session, pos);
    return link
      ? { kind: "rollIceAttack", key: `${session.id}:${run.turn}:${pos}:iceAttack`, link }
      : null;
  }
  const npc = npcAt(session);
  const fight = run.fight;
  if (npc && fight?.key === npc.key && fight.npcInit === null && run.awaitingDamage === null) {
    return {
      kind: "rollNpcInitiative",
      key: `${session.id}:${session.revision}:npcInit`,
      link: npc.actorUuid,
    };
  }
  return null;
}

export function shouldReact(prev: PublicSession | null, next: PublicSession): boolean {
  if (!prev || prev.id !== next.id) return false;
  if (next.revision <= prev.revision) return false;
  return next.run.undoSeq === prev.run.undoSeq;
}
