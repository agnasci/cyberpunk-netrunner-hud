import type { NetFloor } from "../domain/net-architecture";
import type { PublicSession } from "./session-state";

export function revealNpc(
  current: PublicSession,
  npcLinkAt: (key: number) => string | null,
): PublicSession {
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
