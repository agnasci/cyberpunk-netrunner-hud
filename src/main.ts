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
import { ArchEditorApp } from "./ui/arch-editor-app";
import { DeckApp } from "./ui/deck-app";
import { canOpenDeck, listDeckActors } from "./integrations/cpr/foundry-deck";
import { SessionHudApp } from "./ui/session-hud-app";
import { promptStartSession } from "./ui/start-session-dialog";

let prototypeApp: NetrunnerHudPrototype | null = null;
let sessionHud: SessionHudApp | null = null;
let activeSessions: PublicSession[] = [];

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
  editArchitecture: (itemUuid: string | null): void => openArchEditor(itemUuid),
  openDeck: (actorUuid: string): void => openDeck(actorUuid),
};

let deckApp: DeckApp | null = null;

function openDeck(actorUuid: string | null): void {
  deckApp ??= new DeckApp({
    jackedIn: (uuid) =>
      activeSessions.some((s) => s.actorUuid === uuid && s.runnerPosition !== null),
  });
  void deckApp.open(actorUuid);
}

const refreshDeck = foundry.utils.debounce(() => {
  if (deckApp?.rendered) void deckApp.render();
}, 50);

let archEditor: ArchEditorApp | null = null;

function openArchEditor(itemUuid: string | null): void {
  archEditor ??= new ArchEditorApp({
    inUse: (uuid) => activeSessions.some((s) => s.netArch?.itemUuid === uuid),
  });
  void archEditor.open(itemUuid);
}

function openPrototype(): void {
  prototypeApp ??= new NetrunnerHudPrototype();
  if (prototypeApp.rendered) prototypeApp.bringToFront();
  else void prototypeApp.render(true);
}

const autoAttempted = new Set<string>();
const autoSeen = new Map<string, PublicSession>();
let autoRunning = false;

function autoStepFor(session: PublicSession): AutoStep | null {
  const floors = session.netArch ? readNetArchitecture(session.netArch.itemUuid)?.floors : null;
  return nextAutoStep(session, {
    dvOf: (key) => floors?.find((f) => f.key === key)?.dv ?? null,
    readIce: readIceStats,
  });
}

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

function runAutopilot(previous: PublicSession | null, session: PublicSession): void {
  if (!game.user?.isGM || authorityGmId() !== game.user.id) return;
  if (game.settings.get(MODULE_ID, AUTO_SETTING) !== true) return;
  if (autoRunning) {
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
  setTimeout(() => {
    void (async () => {
      try {
        await executeStep(session.id, step);
      } catch (error) {
        console.error(`${MODULE_ID} | modo automático`, error);
      } finally {
        autoRunning = false;
      }
      const now = activeSessions.find((s) => s.id === session.id);
      if (now) runAutopilot(session, now);
      for (const other of activeSessions) {
        if (other.id !== session.id) runAutopilot(autoSeen.get(other.id) ?? null, other);
      }
    })();
  }, 0);
}

async function nextRevision(sessionId: string, revision: number): Promise<PublicSession | null> {
  for (let i = 0; i < 40; i += 1) {
    const now = activeSessions.find((s) => s.id === sessionId);
    if (!now) return null;
    if (now.revision > revision) return now;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return activeSessions.find((s) => s.id === sessionId) ?? null;
}

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

function applySessions(sessions: PublicSession[]): void {
  const previous = activeSessions;
  activeSessions = sessions;
  for (const session of sessions) {
    runAutopilot(previous.find((s) => s.id === session.id) ?? null, session);
  }
  const archsOf = (list: PublicSession[]) => list.map((x) => x.netArch?.itemUuid ?? "").join("|");
  if (archEditor?.rendered && archsOf(previous) !== archsOf(sessions)) void archEditor.render();
  if (deckApp?.rendered) refreshDeck();
  if (sessions.length === 0) {
    void sessionHud?.close();
    return;
  }
  const isNew = sessions.some((s) => !previous.some((p) => p.id === s.id));
  if (!sessionHud) sessionHud = new SessionHudApp(sessions, hudHandlers);
  else sessionHud.setSessions(sessions);
  if (isNew) void sessionHud.render(true);
}

function promptAndStart(): void {
  if (!game.user?.isGM) return;
  void promptStartSession().then(async (choice) => {
    if (!choice) return;
    const check = canStart(activeSessions, choice.actorUuid);
    if (check !== "ok") {
      ui.notifications.warn(game.i18n.localize(`CNH.Session.StartBlocked.${check}`));
      return;
    }
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
  controls
    .find((control) => control.name === "token")
    ?.tools.push({
      name: `${MODULE_ID}-arch-editor`,
      title: "CNH.Editor.ControlTitle",
      icon: "fa-solid fa-diagram-project",
      button: true,
      visible: game.user?.isGM === true,
      onClick: () => openArchEditor(null),
    });
  controls
    .find((control) => control.name === "token")
    ?.tools.push({
      name: `${MODULE_ID}-deck`,
      title: "CNH.Deck.ControlTitle",
      icon: "fa-solid fa-microchip",
      button: true,
      visible: listDeckActors(game.user).length > 0,
      onClick: () => openDeck(null),
    });
});

Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  const uuid = app.actor?.uuid;
  if (!uuid || !canOpenDeck(uuid, game.user)) return;
  buttons.unshift({
    label: game.i18n.localize("CNH.Deck.SheetButton"),
    class: "cnh-open-deck",
    icon: "fa-solid fa-microchip",
    onclick: () => openDeck(uuid),
  });
});

Hooks.on("updateActor", (actor) => {
  if (actor.uuid === deckApp?.actorUuid) refreshDeck();
});
for (const hook of ["createItem", "updateItem", "deleteItem"] as const) {
  Hooks.on(hook, (item) => {
    if (item.parent?.uuid && item.parent.uuid === deckApp?.actorUuid) refreshDeck();
  });
}

Hooks.on("renderItemDirectory", (_app, html) => {
  if (!game.user?.isGM) return;
  const root = (html as { 0?: HTMLElement })[0] ?? (html as HTMLElement);
  const footer = root.querySelector?.(".directory-footer");
  if (!footer || footer.querySelector(".cnh-open-editor")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cnh-open-editor";
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-diagram-project";
  button.append(icon, ` ${game.i18n.localize("CNH.Editor.ControlTitle")}`);
  button.addEventListener("click", () => openArchEditor(null));
  footer.append(button);
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
  applySessions(readTrustedSessions());
});
