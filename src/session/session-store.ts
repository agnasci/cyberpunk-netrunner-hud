import { MODULE_ID } from "../constants";
import { parseSessions } from "./session-list";
import { parseSession, type PublicSession } from "./session-state";

/** Sessão única antiga (D17), migrada para a lista na carga (E6-11a). */
const LEGACY_KEY = "session";
/** Lista pública de sessões independentes (E6-11a, D36). */
const LIST_KEY = "sessions";

/** O autor só é confiável se for GM (userId vem do servidor, nunca do payload). */
function isGmUser(userId: string | null | undefined): boolean {
  return typeof userId === "string" && game.users.get(userId)?.isGM === true;
}

function trustedDoc(key: string): boolean {
  const doc = game.settings.storage.get("world").getSetting(`${MODULE_ID}.${key}`);
  if (!doc) return false;
  if (!isGmUser(doc._stats?.lastModifiedBy)) {
    console.warn(`${MODULE_ID} | ${key} armazenado ignorado: último autor não é GM`);
    return false;
  }
  return true;
}

/**
 * Registra os settings de mundo (D17/D36). `onChange` recebe do servidor o id de quem
 * gravou; escritas de não-GM são ignoradas.
 */
export function registerSessionSetting(onTrustedChange: (sessions: PublicSession[]) => void): void {
  game.settings.register(MODULE_ID, LEGACY_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: null,
  });
  game.settings.register(MODULE_ID, LIST_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: [],
    onChange: (value: unknown, _options: unknown, userId: string | undefined) => {
      if (!isGmUser(userId)) {
        console.warn(`${MODULE_ID} | sessões ignoradas: escrita por usuário não-GM`, userId);
        return;
      }
      onTrustedChange(parseSessions(value));
    },
  });
}

/** Lê as sessões armazenadas se o último autor registrado pelo servidor for GM. */
export function readTrustedSessions(): PublicSession[] {
  if (!trustedDoc(LIST_KEY)) return [];
  return parseSessions(game.settings.get(MODULE_ID, LIST_KEY));
}

/** Sessão única antiga ainda armazenada e confiável (para migrar). */
export function readLegacySession(): PublicSession | null {
  if (!trustedDoc(LEGACY_KEY)) return null;
  return parseSession(game.settings.get(MODULE_ID, LEGACY_KEY));
}

/**
 * Há valores armazenados que não podem ser usados (esquema antigo, autor não-GM ou itens
 * inválidos)? O GM autoridade os descarta na carga, com aviso.
 */
export function hasUnusableStoredSession(): boolean {
  const raw = game.settings.get(MODULE_ID, LIST_KEY);
  const count = Array.isArray(raw) ? raw.length : raw ? 1 : 0;
  const legacy = game.settings.get(MODULE_ID, LEGACY_KEY);
  const legacyBad = legacy !== null && legacy !== undefined && readLegacySession() === null;
  return legacyBad || readTrustedSessions().length < count;
}

/** Somente o GM chama; o servidor ainda exige SETTINGS_MODIFY. */
export async function writeSessions(sessions: PublicSession[]): Promise<void> {
  await game.settings.set(MODULE_ID, LIST_KEY, sessions);
}

/** Limpa a sessão única antiga depois de migrada. */
export async function clearLegacySession(): Promise<void> {
  await game.settings.set(MODULE_ID, LEGACY_KEY, null);
}
