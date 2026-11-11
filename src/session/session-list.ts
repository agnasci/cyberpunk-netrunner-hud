import { parseSession, type PublicSession } from "./session-state";

/**
 * Várias invasões ao mesmo tempo (E6-11a, D30/D36). Puro: a lista pública de sessões
 * independentes, uma por ator Netrunner, que a autoridade grava inteira de uma vez.
 */
export const MAX_SESSIONS = 4;

/** Lê a lista armazenada; itens inválidos ou repetidos são descartados. */
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

/** Troca a sessão `id` por `next` (ou a remove com `null`), preservando a ordem. */
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

/**
 * Lista mais recente para a autoridade: a armazenada, com o que ela mesma gravou e o
 * servidor ainda não devolveu (mais nova por revisão; `null` = encerrada aqui).
 */
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

/** Pode iniciar outra invasão para este ator? */
export function canStart(
  list: readonly PublicSession[],
  actorUuid: string,
): "ok" | "full" | "actor-busy" {
  if (list.some((s) => s.actorUuid === actorUuid)) return "actor-busy";
  return list.length >= MAX_SESSIONS ? "full" : "ok";
}

/**
 * Aba mostrada: mantém a atual se ainda existe; senão, a sessão que o usuário controla;
 * senão, a primeira.
 */
export function pickSession(
  list: readonly PublicSession[],
  current: string | null,
  userId: string | null,
): string | null {
  if (current && list.some((s) => s.id === current)) return current;
  return (list.find((s) => s.controllerUserId === userId) ?? list[0])?.id ?? null;
}
