import type { NetArchitecture } from "../../src/domain/net-architecture";
import { toPublicFloor } from "../../src/domain/net-architecture";
import type { RunnerVitals } from "../../src/domain/ice-hit";
import type { RunnerResources } from "../../src/domain/net-rules";
import { normalizeNetArch } from "../../src/integrations/cpr/netarch-adapter";
import {
  type ActionResult,
  type IceStats,
  processRequest,
  type RollEvidence,
} from "../../src/session/requests";
import { createSession, type PublicSession, revealFloor } from "../../src/session/session-state";
import { sampleNetArch } from "./cpr-netarch";

export const RUNNER = { id: "u-runner", isGM: false };
export const GM = { id: "u-gm", isGM: true };
export const DECK: RunnerResources = { interfaceRank: 4, hasCyberdeck: true, programs: [] };

export function arch(): NetArchitecture {
  const { architecture } = normalizeNetArch(sampleNetArch());
  if (!architecture) throw new Error("fixture inválida");
  return architecture;
}

export function base(): PublicSession {
  return createSession(
    {
      actorUuid: "Actor.abc",
      controllerUserId: RUNNER.id,
      netArch: { itemUuid: "Item.arch01", name: "Arquitetura Sintética" },
    },
    { id: "s1", now: 1 },
  );
}

export function reveal(session: PublicSession, keys: number[]): PublicSession {
  return arch()
    .floors.filter((f) => keys.includes(f.key))
    .reduce((s, f) => revealFloor(s, toPublicFloor(f)), session);
}

export function withRun(session: PublicSession, run: Partial<PublicSession["run"]>): PublicSession {
  return { ...session, run: { ...session.run, ...run } };
}

export function request(session: PublicSession, action: unknown, requestId = "r1") {
  return { requestId, sessionId: session.id, expectedRevision: session.revision, action };
}

export interface Harness {
  rolls: Record<string, RollEvidence>;
  ices: Record<string, IceStats>;
  /** Recursos da ficha; padrão: Interface 4, deck, sem programas. */
  runner?: RunnerResources;
  /** HP e redução cerebral da Netrunner (E6-06); padrão: indisponível. */
  vitals?: RunnerVitals | null;
  /** Sorteio do alvo antiprograma; padrão: primeiro. */
  pick?: (count: number) => number;
  /** HP por ator (NPC, E6-11b); sem entrada, vale `vitals`. */
  vitalsOf?: Record<string, RunnerVitals>;
  /** Recursos por ator (NPC); sem entrada, Interface 0. */
  resources?: Record<string, RunnerResources>;
  /** REF por ator, para a iniciativa. */
  refs?: Record<string, number>;
  /** NPC vinculada por nó (flag do item da arquitetura). */
  npcLinks?: Record<number, string>;
  /** Arquitetura completa lida pela autoridade; padrão: a amostra. */
  architecture?: NetArchitecture;
}

/** Processa como a autoridade, registrando o resultado pela chave devolvida. */
export function runWith(harness: Harness) {
  const processed = new Map<string, ActionResult>();
  return (session: PublicSession | null, raw: unknown, sender = RUNNER) => {
    const outcome = processRequest(raw, {
      session,
      sender,
      architecture: harness.architecture ?? arch(),
      processed,
      runner: harness.runner ?? DECK,
      readRoll: (id) => harness.rolls[id] ?? null,
      readIce: (uuid) => harness.ices[uuid] ?? null,
      readVitals: (uuid) => harness.vitalsOf?.[uuid] ?? harness.vitals ?? null,
      pick: (count) => harness.pick?.(count) ?? 0,
      readResources: (uuid) =>
        harness.resources?.[uuid] ?? { interfaceRank: 0, hasCyberdeck: false },
      readRef: (uuid) => harness.refs?.[uuid] ?? null,
      npcLinkAt: (key) => harness.npcLinks?.[key] ?? null,
    });
    if (outcome.processedKey) processed.set(outcome.processedKey, outcome.result);
    return outcome;
  };
}
