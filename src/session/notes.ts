import type { NetArchitecture, NetFloorContent } from "../domain/net-architecture";
import type { PublicSession, ViewerIdentity } from "./session-state";

/**
 * Notas reveladas à Netrunner (D29): descrições de Password vencida e de arquivo
 * identificado. São segredo do GM: só a autoridade calcula e entrega por socket ao
 * remetente, nunca no setting público. `null` = remetente sem direito (espectador).
 */
const REVEALABLE: ReadonlySet<NetFloorContent> = new Set(["password", "file"]);

export function revealedNotes(
  session: PublicSession,
  architecture: NetArchitecture | null,
  sender: ViewerIdentity,
): Record<number, string> | null {
  if (!sender.isGM && session.controllerUserId !== sender.id) return null;
  const notes: Record<number, string> = {};
  for (const floor of architecture?.floors ?? []) {
    const visible =
      REVEALABLE.has(floor.content) &&
      session.run.cleared.includes(floor.key) &&
      floor.description.trim() !== "";
    if (visible) notes[floor.key] = floor.description;
  }
  return notes;
}
