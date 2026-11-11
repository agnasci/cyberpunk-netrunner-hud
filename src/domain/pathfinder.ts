import { areLinked, type NetFloor } from "./net-architecture";

/**
 * Pathfinder (Core, pp. 195-210, conferido em fontes secundárias): a Netrunner vê, a partir
 * do andar atual, tantos andares mais fundos quanto o total da rolagem, parando numa Password
 * cujo DV supera o total (a Password aparece; o que está abaixo dela, não). Mostra o conteúdo
 * geral dos nós, sem DV nem descrição. Puro: recebe a arquitetura completa (só a autoridade).
 */
export function pathfinderReveal(
  floors: readonly NetFloor[],
  fromKey: number,
  total: number,
): number[] {
  const from = floors.find((f) => f.key === fromKey);
  if (!from || !Number.isFinite(total) || total < 1) return [];
  const limit = from.floor + Math.floor(total);
  const found: number[] = [];
  let frontier: NetFloor[] = [from];
  while (frontier.length > 0) {
    const next: NetFloor[] = [];
    for (const node of frontier) {
      // Password com DV maior que o total barra o que vem abaixo dela.
      const blocks = node !== from && node.content === "password" && (node.dv ?? 0) > total;
      if (blocks) continue;
      for (const child of floors) {
        if (child.floor !== node.floor + 1 || child.floor > limit) continue;
        if (found.includes(child.key) || !areLinked(node, child, floors)) continue;
        found.push(child.key);
        next.push(child);
      }
    }
    frontier = next;
  }
  return found;
}
