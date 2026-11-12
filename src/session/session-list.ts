import { parseSession, type PublicSession } from "./session-state";

export const MAX_SESSIONS = 4;

export function parseSessions(value: unknown): PublicSession[] {
  if (!Array.isArray(value)) return [];
  const list: PublicSession[] = [];
  for (const item of value) {
    const session = parseSession(item);
    if (!session) continue;
    if (list.some((s) => s.id === session.id || s.actorUuid === session.actorUuid)) continue;
    list.push(session);
    if (list.length === MAX_SESSIONS) break;
  }
  return list;
}

export function replaceSession(
  list: readonly PublicSession[],
  id: string,
  next: PublicSession | null,
): PublicSession[] {
  if (next === null) return list.filter((s) => s.id !== id);
  return list.some((s) => s.id === id)
    ? list.map((s) => (s.id === id ? next : s))
    : [...list, next];
}

export function newestSessions(
  stored: readonly PublicSession[],
  written: ReadonlyMap<string, PublicSession | null>,
): PublicSession[] {
  const list = stored
    .filter((s) => written.get(s.id) !== null)
    .map((s) => {
      const w = written.get(s.id);
      return w && w.revision > s.revision ? w : s;
    });
  for (const [id, w] of written) {
    if (w && !list.some((s) => s.id === id)) list.push(w);
  }
  return list;
}

export function canStart(
  list: readonly PublicSession[],
  actorUuid: string,
): "ok" | "full" | "actor-busy" {
  if (list.some((s) => s.actorUuid === actorUuid)) return "actor-busy";
  return list.length >= MAX_SESSIONS ? "full" : "ok";
}

export function pickSession(
  list: readonly PublicSession[],
  current: string | null,
  userId: string | null,
): string | null {
  if (current && list.some((s) => s.id === current)) return current;
  return (list.find((s) => s.controllerUserId === userId) ?? list[0])?.id ?? null;
}
