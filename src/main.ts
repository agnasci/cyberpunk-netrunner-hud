import { checkSystemCompatibility } from "./compatibility";
import {
  AUTO_SETTING,
  LOG_SETTING,
  LOG_WORLD_SETTING,
  MODULE_ID,
  MOTION_SETTING,
  SEED_ICE_SETTING,
  SOUND_SETTING,
} from "./constants";
import {
  applyRunnerHpEffect,
  readCharacterSnapshot,
  readRunnerVitals,
} from "./integrations/cpr/foundry-actor";
import { readNetArchitecture } from "./integrations/cpr/foundry-netarch";
import {
  applyIceEffect,
  ensureAllBuiltinIce,
  ensureIceActor,
  readIceStats,
} from "./integrations/cpr/foundry-ice";
import { type AutoStep, nextAutoStep, shouldReact } from "./session/autopilot";
import { applyProgramEffect } from "./integrations/cpr/foundry-program";
import {
  readRollEvidence,
  rollIceDamage,
  rollIceStat,
  rollInterfaceAbility,
  rollProgram,
  rollZapDamage,
} from "./integrations/cpr/foundry-roll";
import {
  applyNpcMoveEffect,
  readActorRef,
  readNpcLink,
  rollInitiative,
} from "./integrations/cpr/foundry-npc";
import { BUILTIN_ICE } from "./domain/builtin-ice";
import { runnerResources } from "./domain/net-rules";
import type { ActionResult, NetAction } from "./session/requests";
import { createSession, type PublicSession } from "./session/session-state";
import { canStart, replaceSession } from "./session/session-list";
import {
  clearLegacySession,
  hasUnusableStoredSession,
  readLegacySession,
  readTrustedSessions,
  registerSessionSetting,
  writeSessions,
} from "./session/session-store";
import { authorityGmId, RequestChannel } from "./transport/request-channel";
import { NetrunnerHudPrototype } from "./ui/netrunner-hud-app";
import { SessionHudApp } from "./ui/session-hud-app";
import { promptStartSession } from "./ui/start-session-dialog";

let prototypeApp: NetrunnerHudPrototype | null = null;
/**
 * Uma única instância do HUD por cliente: render/close da mesma instância são
 * serializados pelo Foundry. Instâncias novas com o mesmo id de DOM disputavam o
 * registro em `foundry.applications.instances` e deixavam janelas órfãs.
 */
let sessionHud: SessionHudApp | null = null;
/** Sessões públicas confiáveis (E6-11a: várias invasões independentes). */
let activeSessions: PublicSession[] = [];

/** Toda mutação, inclusive do GM, passa pela autoridade (D20). */
const channel = new RequestChannel({
  getSessions: () => activeSessions,
  write: writeSessions,
  readArchitecture: readNetArchitecture,
  readRunner: (actorUuid) => runnerResources(readCharacterSnapshot(actorUuid)),
  readRoll: readRollEvidence,
  readIce: readIceStats,
  readVitals: readRunnerVitals,
  readRef: readActorRef,
  readNpcLink,
  applyEffect: (effect) => {
    switch (effect.type) {
      case "setIceRez":
        return applyIceEffect(effect);
      case "setRunnerHp":
        return applyRunnerHpEffect(effect);
      case "setProgramRez":
      case "setProgramRezValue":
      case "setProgramState":
        return applyProgramEffect(effect);
      case "moveNpcLink":
        return applyNpcMoveEffect(effect);
    }
  },
});

const hudHandlers = {
  request: (sessionId: string, action: NetAction): Promise<ActionResult> =>
    channel.send(sessionId, action),
  hasAuthority: (): boolean => authorityGmId() !== null,
  requestNotes: (sessionId: string): Promise<Record<number, string>> =>
    channel.queryNotes(sessionId),
  startSession: (): void => promptAndStart(),
  resolveNow: (sessionId: string): Promise<void> => resolveNow(sessionId),
};

/** Abre (ou traz à frente) o protótipo visual local (E1-00). */
function openPrototype(): void {
  prototypeApp ??= new NetrunnerHudPrototype();
  if (prototypeApp.rendered) prototypeApp.bringToFront();
  else void prototypeApp.render(true);
}

/** Passos já tentados pelo piloto (uma vez cada; falha deixa os botões manuais). */
const autoAttempted = new Set<string>();
/** Estado anterior de cada sessão quando outra estava ocupando o piloto. */
const autoSeen = new Map<string, PublicSession>();
let autoRunning = false;

function autoStepFor(session: PublicSession): AutoStep | null {
  const floors = session.netArch ? readNetArchitecture(session.netArch.itemUuid)?.floors : null;
  return nextAutoStep(session, {
    dvOf: (key) => floors?.find((f) => f.key === key)?.dv ?? null,
    readIce: readIceStats,
  });
}

/** Executa um passo automático: rolagem sem diálogo e envio pelo canal da autoridade. */
async function executeStep(sessionId: string, step: AutoStep): Promise<void> {
  const send = async (action: NetAction) => {
    await channel.send(sessionId, action);
  };
  switch (step.kind) {
    case "resolve":
      return send({ type: "resolveCheck", outcome: step.outcome });
    case "rollIce": {
      const messageId = await rollIceStat(step.link, step.stat, true);
      if (messageId) await send({ type: "oppose", messageId });
      return;
    }
    case "rollAmbush": {
      const messageId = await rollIceStat(step.link, "spd", true);
      if (messageId) await send({ type: "ambush", messageId });
      return;
    }
    case "rollIceAttack": {
      const messageId = await rollIceStat(step.link, "atk", true);
      if (messageId) await send({ type: "iceAttack", messageId });
      return;
    }
    case "rollNpcDefense": {
      const messageId = await rollInterfaceAbility(step.link, "defense", true);
      if (messageId) await send({ type: "oppose", messageId });
      return;
    }
    case "rollNpcInitiative": {
      const flavor = game.i18n.localize("CNH.Npc.InitiativeFlavor");
      const messageId = await rollInitiative(step.link, flavor);
      if (messageId) await send({ type: "initiative", side: "npc", messageId });
      return;
    }
    case "rollNpcDamage": {
      const flavor = game.i18n.localize("CNH.Npc.DamageFlavor");
      const messageId =
        step.programId === null
          ? await rollZapDamage(step.link, flavor)
          : await rollProgram(step.link, step.programId, "damage", true);
      if (messageId) await send({ type: "iceDamage", messageId });
      return;
    }
    case "rollIceDamage": {
      const flavor = game.i18n.localize("CNH.IceHit.Flavor");
      const messageId = await rollIceDamage(step.link, step.formula, flavor);
      if (messageId) await send({ type: "iceDamage", messageId });
      return;
    }
  }
}

/**
 * Modo sem confirmação do mestre (E6-10, D35): só o cliente da autoridade age, pelo mesmo
 * canal de requisições. Reage a transições novas, nunca ao primeiro estado nem ao desfazer.
 */
function runAutopilot(previous: PublicSession | null, session: PublicSession): void {
  if (!game.user?.isGM || authorityGmId() !== game.user.id) return;
  if (game.settings.get(MODULE_ID, AUTO_SETTING) !== true) return;
  if (autoRunning) {
    // Ocupado com outra sessão: guarda o anterior para reagir depois.
    if (previous && !autoSeen.has(session.id)) autoSeen.set(session.id, previous);
    return;
  }
  const before = autoSeen.get(session.id) ?? previous;
  autoSeen.delete(session.id);
  if (!shouldReact(before, session)) return;
  const step = autoStepFor(session);
  if (!step || autoAttempted.has(step.key)) return;
  autoAttempted.add(step.key);
  autoRunning = true;
  // Fora da gravação atual: a autoridade termina de processar antes do próximo passo.
  setTimeout(() => {
    void (async () => {
      try {
        await executeStep(session.id, step);
      } catch (error) {
        console.error(`${MODULE_ID} | modo automático`, error);
      } finally {
        autoRunning = false;
      }
      // O estado pode ter mudado enquanto rolava: tenta o próximo passo de cada sessão.
      const now = activeSessions.find((s) => s.id === session.id);
      if (now) runAutopilot(session, now);
      for (const other of activeSessions) {
        if (other.id !== session.id) runAutopilot(autoSeen.get(other.id) ?? null, other);
      }
    })();
  }, 0);
}

/** Espera a sessão passar da revisão `revision` (até ~4 s). */
async function nextRevision(sessionId: string, revision: number): Promise<PublicSession | null> {
  for (let i = 0; i < 40; i += 1) {
    const now = activeSessions.find((s) => s.id === sessionId);
    if (!now) return null;
    if (now.revision > revision) return now;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return activeSessions.find((s) => s.id === sessionId) ?? null;
}

/**
 * "Resolver" em um clique (pedido do usuário): o mestre faz agora, sem diálogo, os mesmos
 * passos do modo automático para a sessão, até chegar a algo que exige uma pessoa (rolagem
 * da jogadora, escolha de programa, resultado sem sugestão). Vale com o modo desligado.
 */
async function resolveNow(sessionId: string): Promise<void> {
  if (!game.user?.isGM) return;
  let session = activeSessions.find((s) => s.id === sessionId) ?? null;
  for (let i = 0; session && i < 8; i += 1) {
    const step = autoStepFor(session);
    if (!step) return;
    autoAttempted.add(step.key);
    await executeStep(sessionId, step);
    session = await nextRevision(sessionId, session.revision);
  }
}

/** Reflete as sessões públicas confiáveis: abre, atualiza ou fecha o HUD local. */
function applySessions(sessions: PublicSession[]): void {
  const previous = activeSessions;
  activeSessions = sessions;
  for (const session of sessions) {
    runAutopilot(previous.find((s) => s.id === session.id) ?? null, session);
  }
  if (sessions.length === 0) {
    void sessionHud?.close();
    return;
  }
  const isNew = sessions.some((s) => !previous.some((p) => p.id === s.id));
  if (!sessionHud) sessionHud = new SessionHudApp(sessions, hudHandlers);
  else sessionHud.setSessions(sessions);
  // Sessão nova (ou primeira): abre o HUD para todos, como antes.
  if (isNew) void sessionHud.render(true);
}

/** Mestre escolhe a Netrunner e inicia mais uma invasão (até o limite, uma por ator). */
function promptAndStart(): void {
  if (!game.user?.isGM) return;
  void promptStartSession().then(async (choice) => {
    if (!choice) return;
    const check = canStart(activeSessions, choice.actorUuid);
    if (check !== "ok") {
      ui.notifications.warn(game.i18n.localize(`CNH.Session.StartBlocked.${check}`));
      return;
    }
    // Black ICE básicos escolhidos no início ganham a ficha no mundo agora (E6-12).
    const ice = [];
    for (const link of choice.ice) {
      const actorUuid = await ensureIceActor(link.actorUuid);
      if (actorUuid) ice.push({ key: link.key, actorUuid });
    }
    const session = createSession(
      { ...choice, ice },
      { id: foundry.utils.randomID(), now: Date.now() },
    );
    if (authorityGmId() === game.user?.id) await channel.start(session);
    else await writeSessions(replaceSession(readTrustedSessions(), session.id, session));
  });
}

/** Black ICE básicos no mundo (D38): cria as fichas que faltam; só a autoridade GM. */
async function seedBuiltinIce(): Promise<void> {
  if (BUILTIN_ICE.length === 0) return;
  if (!game.user?.isGM || authorityGmId() !== game.user.id) return;
  try {
    const created = await ensureAllBuiltinIce();
    if (created > 0) {
      ui.notifications.info(game.i18n.format("CNH.Ice.Seeded", { count: String(created) }));
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Black ICE básicos`, error);
  }
}

function openSessionHud(): void {
  if (activeSessions.length > 0 && sessionHud) {
    if (sessionHud.rendered) sessionHud.bringToFront();
    else void sessionHud.render(true);
    return;
  }
  if (!game.user?.isGM) {
    ui.notifications.info(game.i18n.localize("CNH.Session.NoActiveSession"));
    return;
  }
  promptAndStart();
}

Hooks.on("getSceneControlButtons", (controls) => {
  controls
    .find((control) => control.name === "token")
    ?.tools.push({
      name: `${MODULE_ID}-session`,
      title: "CNH.Session.ControlTitle",
      icon: "fa-solid fa-terminal",
      button: true,
      onClick: openSessionHud,
    });
});

Hooks.once("init", () => {
  registerSessionSetting(applySessions);
  game.settings.register(MODULE_ID, MOTION_SETTING, {
    name: "CNH.Settings.Motion.Name",
    hint: "CNH.Settings.Motion.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: { full: "CNH.Settings.Motion.full", reduced: "CNH.Settings.Motion.reduced" },
    default: "full",
    onChange: () => {
      if (sessionHud?.rendered) void sessionHud.render();
    },
  });
  game.settings.register(MODULE_ID, AUTO_SETTING, {
    name: "CNH.Settings.Auto.Name",
    hint: "CNH.Settings.Auto.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      if (sessionHud?.rendered) void sessionHud.render();
    },
  });
  game.settings.register(MODULE_ID, SEED_ICE_SETTING, {
    name: "CNH.Settings.SeedIce.Name",
    hint: "CNH.Settings.SeedIce.Hint",
    scope: "world",
    // Versão pública sem os dados (D41): nada a criar, o ajuste some.
    config: BUILTIN_ICE.length > 0,
    type: Boolean,
    default: true,
    onChange: (value: unknown) => {
      if (value === true) void seedBuiltinIce();
    },
  });
  game.settings.register(MODULE_ID, LOG_WORLD_SETTING, {
    name: "CNH.Settings.LogWorld.Name",
    hint: "CNH.Settings.LogWorld.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      if (sessionHud?.rendered) void sessionHud.render();
    },
  });
  game.settings.register(MODULE_ID, LOG_SETTING, {
    name: "CNH.Settings.Log.Name",
    hint: "CNH.Settings.Log.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      if (sessionHud?.rendered) void sessionHud.render();
    },
  });
  game.settings.register(MODULE_ID, SOUND_SETTING, {
    name: "CNH.Settings.Sound.Name",
    hint: "CNH.Settings.Sound.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      if (sessionHud?.rendered) void sessionHud.render();
    },
  });
  const module = game.modules.get(MODULE_ID);
  // API de depuração/inspeção; não é contrato público estável.
  if (module) module.api = { openPrototype, readCharacterSnapshot, readTrustedSessions };
});

Hooks.once("ready", () => {
  channel.activate();
  const result = checkSystemCompatibility(game.system);
  if (result.status === "supported") {
    console.info(`${MODULE_ID} | pronto`);
  } else {
    console.warn(`${MODULE_ID} | compatibilidade:`, result);
    if (game.user?.isGM) {
      const message =
        result.status === "wrong-system"
          ? game.i18n.format("CNH.Compatibility.WrongSystem", { found: result.found })
          : game.i18n.format("CNH.Compatibility.UntestedVersion", {
              tested: result.tested,
              found: result.found,
            });
      if (result.status === "wrong-system") ui.notifications.error(message);
      else ui.notifications.warn(message);
    }
    if (result.status === "wrong-system") return;
  }
  const isAuthority = game.user?.isGM === true && authorityGmId() === game.user.id;
  if (isAuthority && game.settings.get(MODULE_ID, SEED_ICE_SETTING) === true) {
    void seedBuiltinIce();
  }
  if (isAuthority) {
    // Sessão única antiga (antes da E6-11a): vira a primeira da lista.
    const legacy = readLegacySession();
    if (legacy && readTrustedSessions().length === 0) {
      void writeSessions([legacy]).then(() => clearLegacySession());
      applySessions([legacy]);
      return;
    }
    if (hasUnusableStoredSession()) {
      ui.notifications.warn(game.i18n.localize("CNH.Session.StoredDiscarded"));
      void writeSessions(readTrustedSessions()).then(() => clearLegacySession());
    }
  }
  // Entrada tardia / refresh / reinício do mundo: reabre as sessões ativas, se houver.
  applySessions(readTrustedSessions());
});
