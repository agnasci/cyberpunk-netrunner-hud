import { isEngaged } from "../domain/net-rules";
import { iceLinkOf, needsOpposed, suggestOutcome, targetOf } from "./checks";
import type { IceStats } from "./requests";
import { DV_CHECKS, npcAt, type PublicSession, toRunState } from "./session-state";

/**
 * Modo sem confirmação do mestre (E6-10, D35; NPC na E6-11b, D37). Puro: diz qual o
 * próximo passo que o cliente da autoridade faz sozinho. Só o que a regra decide sem o
 * mestre: rolagem oposta do inimigo, iniciativa da NPC, resultado com sugestão e dano do
 * acerto. Rolagens da jogadora e o início dos ataques continuam com as pessoas.
 */
export type AutoStep =
  | { kind: "rollIce"; key: string; link: string; stat: "def" | "per" }
  /** Black ICE à espreita: SPD do ICE (a jogadora responde com a velocidade). */
  | { kind: "rollAmbush"; key: string; link: string }
  /** Vez do Black ICE: ele ataca sozinho (E6-14); o mestre só escolhe programa. */
  | { kind: "rollIceAttack"; key: string; link: string }
  | { kind: "rollNpcDefense"; key: string; link: string }
  | { kind: "rollNpcInitiative"; key: string; link: string }
  | { kind: "resolve"; key: string; outcome: "success" | "failure" }
  | { kind: "rollIceDamage"; key: string; link: string; formula: string }
  | { kind: "rollNpcDamage"; key: string; link: string; programId: string | null };

export interface AutopilotInput {
  /** DV do nó pela arquitetura completa (autoridade); `null` = sem DV. */
  dvOf(key: number): number | null;
  readIce(actorUuid: string): IceStats | null;
}

export function nextAutoStep(session: PublicSession, input: AutopilotInput): AutoStep | null {
  const { run } = session;
  const p = run.pending;
  if (p) {
    if (needsOpposed(p.ability) && !p.opposed) {
      // Ataques contra a jogadora: o lado oposto é a Defense (ou a velocidade) dela.
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
  // Antiprograma com vários programas rezzados: espera o mestre escolher o alvo.
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
  // Encontro com o Black ICE à espreita: o ICE rola o SPD.
  if (run.ambush !== null) {
    const link = iceLinkOf(session, run.ambush);
    return link ? { kind: "rollAmbush", key: `${session.id}:${run.ambush}:ambush`, link } : null;
  }
  // Vez do Black ICE (sem NPC no nó): ataque automático, uma vez por rodada.
  const pos = session.runnerPosition;
  if (run.iceTurn && pos !== null && !npcAt(session) && isEngaged(toRunState(session))) {
    const link = iceLinkOf(session, pos);
    return link
      ? { kind: "rollIceAttack", key: `${session.id}:${run.turn}:${pos}:iceAttack`, link }
      : null;
  }
  // Iniciativa da NPC do nó (a da jogadora é dela).
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

/**
 * O piloto só reage a uma transição nova: não age no primeiro estado visto (recarregar
 * não refaz nada) nem no resultado de um desfazer (o mestre voltou de propósito).
 */
export function shouldReact(prev: PublicSession | null, next: PublicSession): boolean {
  if (!prev || prev.id !== next.id) return false;
  if (next.revision <= prev.revision) return false;
  return next.run.undoSeq === prev.run.undoSeq;
}
