import type { NetArchitecture, NetFloorContent } from "../domain/net-architecture";
import type { PublicSession, ViewerIdentity } from "./session-state";

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
