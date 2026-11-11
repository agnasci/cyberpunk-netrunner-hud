import { isEngaged } from "../domain/net-rules";
import type { RequestError } from "./requests";
import {
  initiativePending,
  npcAt,
  type NpcFight,
  type PublicRun,
  type PublicSession,
  toRunState,
} from "./session-state";

/**
 * Vez no combate (E6-08, D33; E6-11b, D37). Puro. Combate = Netrunner engajada por Black
 * ICE (que abre a rodada, no topo da iniciativa, como no CPR) ou diante de uma Netrunner
 * NPC com as duas iniciativas roladas (a maior começa; empate a favor da jogadora).
 * A vez passa sozinha: última ação NET gasta sem pendência; ataque do Black ICE resolvido;
 * ações NET da NPC gastas sem pendência.
 */
export type TurnHolder = "runner" | "ice";

/** Combate com a NPC do nó atual, já com as duas iniciativas. */
function npcFight(session: PublicSession): NpcFight | null {
  const npc = npcAt(session);
  const f = session.run.fight;
  if (!npc || !f || f.key !== npc.key || f.runnerInit === null || f.npcInit === null) return null;
  return f;
}

export function inCombat(session: PublicSession): boolean {
  return isEngaged(toRunState(session)) || npcFight(session) !== null;
}

/** De quem é a vez; `null` fora do combate ("ice" = o inimigo do nó). */
export function turnHolder(session: PublicSession): TurnHolder | null {
  if (!inCombat(session)) return null;
  return session.run.iceTurn ? "ice" : "runner";
}

function busy(run: PublicRun): boolean {
  // Encontro com Black ICE à espreita sem resolver: a vez espera (o encontro é imediato).
  return (
    run.pending !== null ||
    run.awaitingDamage !== null ||
    run.iceHit !== null ||
    run.ambush !== null
  );
}

/** Ataque do Black ICE em andamento: rolagem pendente ou acerto aguardando dano. */
function iceActing(run: PublicRun): boolean {
  return run.pending?.ability === "iceAttack" || (run.iceHit !== null && !run.iceHit.byNpc);
}

/** Fim da vez da Netrunner: nova rodada, que abre com o inimigo (a NPC recarrega). */
function toIceTurn(session: PublicSession): PublicSession {
  const fight = session.run.fight;
  return {
    ...session,
    run: {
      ...session.run,
      iceTurn: true,
      turn: session.run.turn + 1,
      fight: fight ? { ...fight, npcActionsUsed: 0 } : null,
    },
  };
}

/** Fim da vez do inimigo: a Netrunner age com as ações recarregadas. */
function toRunnerTurn(session: PublicSession): PublicSession {
  return {
    ...session,
    run: { ...session.run, iceTurn: false, actionsUsed: 0, programsUsed: [] },
  };
}

/** Abre ou fecha o combate com a NPC conforme a posição; decide quem começa. */
function syncFight(prev: PublicSession, next: PublicSession): PublicSession {
  const npc = npcAt(next);
  const fight = next.run.fight;
  if (!npc) return fight ? { ...next, run: { ...next.run, fight: null } } : next;
  if (!fight || fight.key !== npc.key) {
    const fresh: NpcFight = { key: npc.key, runnerInit: null, npcInit: null, npcActionsUsed: 0 };
    return { ...next, run: { ...next.run, fight: fresh, iceTurn: false } };
  }
  // Iniciativas completas agora: a maior começa (empate a favor da jogadora, D37).
  if (initiativePending(prev) && !initiativePending(next)) {
    const npcFirst = (fight.npcInit ?? 0) > (fight.runnerInit ?? 0);
    return {
      ...next,
      run: { ...next.run, iceTurn: npcFirst, fight: { ...fight, npcActionsUsed: 0 } },
    };
  }
  return next;
}

/**
 * Passagem automática depois de cada ação (menos o desfazer, que restaura o estado exato).
 * `maxActions` = ações NET por turno da Netrunner; `npcMaxActions` = da NPC do nó (0 = sem).
 */
export function settleTurn(
  prev: PublicSession,
  next: PublicSession,
  maxActions: number,
  npcMaxActions = 0,
): PublicSession {
  const synced = syncFight(prev, next);
  if (!inCombat(synced)) {
    // Combate encerrado na vez do inimigo: a rodada já virou, a Netrunner recarrega.
    return synced.run.iceTurn ? toRunnerTurn(synced) : synced;
  }
  const fight = npcFight(synced);
  if (synced.run.iceTurn) {
    if (fight) {
      const spent = npcMaxActions > 0 && fight.npcActionsUsed >= npcMaxActions;
      return spent && !busy(synced.run) ? toRunnerTurn(synced) : synced;
    }
    return iceActing(prev.run) && !iceActing(synced.run) ? toRunnerTurn(synced) : synced;
  }
  const spent = maxActions > 0 && synced.run.actionsUsed >= maxActions;
  return spent && !busy(synced.run) ? toIceTurn(synced) : synced;
}

/** "Encerrar vez" (Netrunner ou GM) e "Passar a vez" do inimigo (só GM). */
export function applyEndTurn(session: PublicSession, isGM: boolean): PublicSession | RequestError {
  if (!inCombat(session)) return "not-engaged";
  if (busy(session.run)) return "check-pending";
  if (!session.run.iceTurn) return toIceTurn(session);
  return isGM ? toRunnerTurn(session) : "ice-turn";
}

/** "Novo turno" do GM: em combate, a rodada abre pela vez do inimigo. */
export function newTurnRun(session: PublicSession): Partial<PublicRun> {
  const fight = session.run.fight;
  return {
    turn: session.run.turn + 1,
    actionsUsed: 0,
    programsUsed: [],
    iceTurn: inCombat(session),
    fight: fight ? { ...fight, npcActionsUsed: 0 } : null,
  };
}
