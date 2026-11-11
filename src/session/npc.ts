import type { NetFloor } from "../domain/net-architecture";
import type { PublicSession } from "./session-state";

/**
 * Netrunner NPC inimiga (E6-11b, D37). Puro: o vínculo nó↔NPC fica na flag do item da
 * arquitetura (só o GM lê); a autoridade só o torna público quando a jogadora está no
 * nó. Nós de Black ICE não recebem NPC (um encontro por nó).
 */
export function revealNpc(
  current: PublicSession,
  npcLinkAt: (key: number) => string | null,
): PublicSession {
  // Vínculo removido ou trocado pelo GM: a NPC antiga sai do estado público (não reaparece
  // ao voltar ao nó nem pede iniciativa).
  const kept = current.run.npcs.filter((n) => npcLinkAt(n.key) === n.actorUuid);
  const session =
    kept.length === current.run.npcs.length
      ? current
      : { ...current, run: { ...current.run, npcs: kept } };
  const pos = session.runnerPosition;
  if (pos === null || session.run.npcs.some((n) => n.key === pos)) return session;
  const node = session.netArch?.discovered.find((f) => f.key === pos);
  if (!node || node.content === "blackice") return session;
  const actorUuid = npcLinkAt(pos);
  if (!actorUuid || actorUuid === session.actorUuid) return session;
  return {
    ...session,
    run: { ...session.run, npcs: [...session.run.npcs, { key: pos, actorUuid, defeated: false }] },
  };
}

export type NpcMoveError = "invalid-target";

/**
 * O GM arrasta a NPC para qualquer nó (pedido do usuário, sem regras de caminho): só não
 * entra em nó de Black ICE nem em nó com outra NPC (um inimigo por nó, como o vínculo);
 * derrotada não se move. `floors` = arquitetura completa.
 */
export function checkNpcMove(
  session: PublicSession,
  floors: readonly NetFloor[],
  npcLinkAt: (key: number) => string | null,
  from: number,
  to: number,
): NpcMoveError | null {
  const a = floors.find((f) => f.key === from);
  const b = floors.find((f) => f.key === to);
  if (!a || !b || from === to || !npcLinkAt(from) || npcLinkAt(to)) return "invalid-target";
  if (b.content === "blackice") return "invalid-target";
  if (session.run.npcs.some((n) => n.key === from && n.defeated)) return "invalid-target";
  return null;
}

/**
 * Estado público depois do movimento: a NPC só fica visível onde a jogadora está. Sai do
 * nó dela → some do estado público; chega ao nó dela → aparece.
 */
export function moveNpcPublic(
  session: PublicSession,
  from: number,
  to: number,
  actorUuid: string,
): PublicSession {
  const npcs = session.run.npcs.filter((n) => n.key !== from);
  if (to === session.runnerPosition && !npcs.some((n) => n.key === to)) {
    npcs.push({ key: to, actorUuid, defeated: false });
  }
  return { ...session, run: { ...session.run, npcs } };
}
