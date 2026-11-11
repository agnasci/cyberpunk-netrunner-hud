/**
 * Opções do diálogo de início de sessão (E6-03). Puro: recebe atores e usuários já
 * lidos pelo adaptador e decide quem aparece, o controlador sugerido e os Black ICE.
 */
export interface ActorOption {
  uuid: string;
  name: string;
  type: string;
  /** Ids dos usuários com permissão OWNER. */
  ownerIds: readonly string[];
}

export interface UserOption {
  id: string;
  isGM: boolean;
}

export interface StartCandidate {
  uuid: string;
  name: string;
  playerOwned: boolean;
}

/** Tipos que podem ser a Netrunner da sessão. */
const NETRUNNER_TYPES: ReadonlySet<string> = new Set(["character", "mook"]);

function isPlayerOwned(actor: ActorOption, users: readonly UserOption[]): boolean {
  return actor.ownerIds.some((id) => users.some((u) => u.id === id && !u.isGM));
}

/**
 * Por padrão, só personagens (`character`) com dono jogador; com `showAll`, também NPCs e
 * mooks. Personagens de jogadores vêm primeiro, depois ordem alfabética.
 */
export function startCandidates(
  actors: readonly ActorOption[],
  users: readonly UserOption[],
  showAll: boolean,
): StartCandidate[] {
  return actors
    .filter((a) => NETRUNNER_TYPES.has(a.type))
    .map((a) => ({
      uuid: a.uuid,
      name: a.name,
      type: a.type,
      playerOwned: isPlayerOwned(a, users),
    }))
    .filter((a) => showAll || (a.type === "character" && a.playerOwned))
    .sort((a, b) => Number(b.playerOwned) - Number(a.playerOwned) || a.name.localeCompare(b.name))
    .map(({ uuid, name, playerOwned }) => ({ uuid, name, playerOwned }));
}

/** Primeiro jogador (não GM) dono do personagem; `null` se não há. */
export function defaultController(
  actor: ActorOption | undefined,
  users: readonly UserOption[],
): string | null {
  if (!actor) return null;
  return users.find((u) => !u.isGM && actor.ownerIds.includes(u.id))?.id ?? null;
}

/**
 * Ator Black ICE sugerido para um nó pelo nome do Black ICE: igual (sem diferenciar
 * maiúsculas) ou que começa igual, pulando atores já usados em outros nós.
 */
export function suggestIce(
  iceName: string,
  actors: ReadonlyArray<{ uuid: string; name: string }>,
  used: ReadonlySet<string>,
): string | null {
  const wanted = iceName.trim().toLowerCase();
  if (wanted === "") return null;
  const free = actors.filter((a) => !used.has(a.uuid));
  const exact = free.find((a) => a.name.trim().toLowerCase() === wanted);
  const prefix = free.find((a) => a.name.trim().toLowerCase().startsWith(wanted));
  return (exact ?? prefix)?.uuid ?? null;
}

/** Nós Black ICE ainda sem ator escolhido. */
export function missingIceLinks(
  iceKeys: readonly number[],
  chosen: Readonly<Record<number, string>>,
): number[] {
  return iceKeys.filter((key) => !chosen[key]);
}
