import type { PublicSession } from "./session-state";

/**
 * Black ICE à espreita (Core, conferido em fontes secundárias): ao chegar num nó com Black ICE
 * ativo, o encontro dispara na hora, uma vez por Black ICE. O SPD + 1d10 do ICE disputa com a
 * velocidade da Netrunner (Interface + bônus de SPD + 1d10); se o ICE vencer, o efeito vale
 * imediatamente. Puro: só marca o encontro; as rolagens passam pela autoridade.
 */
export function triggerAmbush(
  prev: PublicSession,
  next: PublicSession,
  /** O ICE do nó não tem o que atacar (antiprograma sem programa dela em execução). */
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
