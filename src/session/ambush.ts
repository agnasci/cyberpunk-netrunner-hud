import type { PublicSession } from "./session-state";

export function triggerAmbush(
  prev: PublicSession,
  next: PublicSession,
  dormant: (key: number) => boolean = () => false,
): PublicSession {
  const pos = next.runnerPosition;
  if (pos === null || pos === prev.runnerPosition) return next;
  const { run } = next;
  const node = next.netArch?.discovered.find((f) => f.key === pos);
  if (!node || node.content !== "blackice") return next;
  if (run.cleared.includes(pos) || run.evaded.includes(pos) || run.ambushed.includes(pos)) {
    return next;
  }
  if (dormant(pos)) return next;
  return { ...next, run: { ...run, ambush: pos, ambushed: [...run.ambushed, pos] } };
}
