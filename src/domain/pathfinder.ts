import { areLinked, type NetFloor } from "./net-architecture";

/**
 * Pathfinder (Core, pp. 195-210, conferido em fontes secundárias): a Netrunner vê os andares
 * mais fundos que o atual, até tantos andares quanto o total da rolagem, em todas as branches.
 * Uma Password cujo DV supera o total aparece, mas esconde o que fica abaixo dela. Mostra o
 * conteúdo geral dos nós, sem DV nem descrição. Puro: recebe a arquitetura completa (só a
 * autoridade).
 */
export function pathfinderReveal(
  floors: readonly NetFloor[],
  fromKey: number,
  total: number,
): number[] {
  const from = floors.find((f) => f.key === fromKey);
  if (!from || !Number.isFinite(total) || total < 1) return [];
  const limit = from.floor + Math.floor(total);
  const deeper = floors.filter((f) => f.floor > from.floor && f.floor <= limit);
  // Abaixo de uma Password que barra (DV maior que o total) fica oculto, em qualquer branch;
  // as que estão no caminho já percorrido por ela (acima, até o nó atual) não contam.
  const hidden = new Set<number>();
  for (const pw of floors) {
    if (pw.content !== "password" || pw.key === from.key || (pw.dv ?? 0) <= total) continue;
    const below = descendants(floors, pw);
    if (below.includes(from.key)) continue;
    for (const key of below) hidden.add(key);
  }
  return deeper
    .filter((f) => !hidden.has(f.key))
    .sort((a, b) => a.floor - b.floor || a.branch.localeCompare(b.branch))
    .map((f) => f.key);
}

/** Nós abaixo de `root` pelos caminhos da arquitetura (D28), sem incluir `root`. */
function descendants(floors: readonly NetFloor[], root: NetFloor): number[] {
  const found: number[] = [];
  let frontier: NetFloor[] = [root];
  while (frontier.length > 0) {
    const next: NetFloor[] = [];
    for (const node of frontier) {
      for (const child of floors) {
        if (child.floor !== node.floor + 1 || found.includes(child.key)) continue;
        if (!areLinked(node, child, floors)) continue;
        found.push(child.key);
        next.push(child);
      }
    }
    frontier = next;
  }
  return found;
}
