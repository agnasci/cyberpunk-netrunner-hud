import {
  AUTO_SETTING,
  LOG_SETTING,
  LOG_WORLD_SETTING,
  MODULE_ID,
  MOTION_SETTING,
  SOUND_SETTING,
} from "../constants";
import type { CharacterSnapshot, SnapshotIssue } from "../domain/character";
import type { NetArchitecture, NetFloorContent } from "../domain/net-architecture";
import { secretFor } from "../domain/node-secrets";
import type { RevealedNotes } from "../session/notes";
import {
  actionsLeft,
  checkAction,
  checkControlOption,
  checkProgramAttack,
  checkProgramRez,
  ICE_ATTACKER_CLASSES,
  NETRUNNER_ATTACKER_CLASSES,
  REZZABLE_CLASSES,
  type Eligibility,
  isEngaged,
  netActionsPerTurn,
  type RuleContext,
  runnerResources,
} from "../domain/net-rules";
import { readCharacterSnapshot } from "../integrations/cpr/foundry-actor";
import { canOpenDeck } from "../integrations/cpr/foundry-deck";
import { readNetArchitecture } from "../integrations/cpr/foundry-netarch";
import { ensureIceActor, listWorldIce, readIceStats } from "../integrations/cpr/foundry-ice";
import {
  listNpcLinks,
  listWorldNetrunners,
  readActorHp,
  rollInitiative,
  setNpcLink,
} from "../integrations/cpr/foundry-npc";
import {
  rollIceStat,
  rollInterfaceAbility,
  rollProgram,
  rollIceDamage,
  rollZapDamage,
} from "../integrations/cpr/foundry-roll";
import { buildArchitectureView } from "../session/architecture-view";
import { nextAutoStep } from "../session/autopilot";
import { turnHolder } from "../session/combat-turn";
import { checkNpcMove } from "../session/npc";
import { MAX_SESSIONS, pickSession } from "../session/session-list";
import { buildEncounterView, type EncounterView } from "../session/encounter-view";
import { diffFx, type HudFx } from "../session/hud-fx";
import { playTones } from "./hud-sound";
import { logLines } from "./log-text";
import { soundCue } from "./sound-cues";
import type { ActionResult, NetAction } from "../session/requests";
import {
  ABILITY_CHECKS,
  npcAt,
  type PublicSession,
  resolveViewerRole,
  toRunState,
  type ViewerRole,
} from "../session/session-state";
import { buildSessionHudView } from "../session/session-view";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const CONTENT_ICON: Record<NetFloorContent | "unknown", string> = {
  password: "fa-key",
  file: "fa-file-code",
  controlnode: "fa-microchip",
  blackice: "fa-skull",
  unknown: "fa-question",
};

const SCROLLERS = [".cnh-arch", ".cnh-runner", ".cnh-body--session", ".cnh-enemy-float"];

export interface SessionHudHandlers {
  request(sessionId: string, action: NetAction): Promise<ActionResult>;
  hasAuthority(): boolean;
  requestNotes(sessionId: string): Promise<RevealedNotes>;
  requestJournal(sessionId: string, key: number): void;
  startSession(): void;
  resolveNow(sessionId: string): Promise<void>;
  editArchitecture(itemUuid: string | null): void;
  openDeck(actorUuid: string): void;
}

const FOCUS_KEYS = ["action", "netAction", "key", "ability", "outcome"] as const;

const FX_WINDOW_MS = 2500;

const STATUS_KEY = {
  rezzed: "CNH.Hud.Rezzed",
  stored: "CNH.Hud.Derezzed",
  neutralized: "CNH.Program.Neutralized",
  destroyed: "CNH.Program.Destroyed",
};

export class SessionHudApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-session`,
    classes: ["cnh-app"],
    window: { title: "CNH.Session.WindowTitle", icon: "fa-solid fa-terminal", resizable: true },
    position: { width: 960, height: 640 },
    actions: {
      endSession: SessionHudApp.#onEndSession,
      toggleFloor: SessionHudApp.#onToggleFloor,
      netAction: SessionHudApp.#onNetAction,
      controlOption: SessionHudApp.#onControlOption,
      showImage: SessionHudApp.#onShowImage,
      showJournal: SessionHudApp.#onShowJournal,
      toggleClear: SessionHudApp.#onToggleClear,
      newTurn: SessionHudApp.#onNewTurn,
      endTurn: SessionHudApp.#onEndTurn,
      toggleLog: SessionHudApp.#onToggleLog,
      toggleEnemy: SessionHudApp.#onToggleEnemy,
      selectSession: SessionHudApp.#onSelectSession,
      newSession: SessionHudApp.#onNewSession,
      rollInitiative: SessionHudApp.#onRollInitiative,
      npcAttack: SessionHudApp.#onNpcAttack,
      linkNpc: SessionHudApp.#onLinkNpc,
      abilityCheck: SessionHudApp.#onAbilityCheck,
      resolveCheck: SessionHudApp.#onResolveCheck,
      linkIce: SessionHudApp.#onLinkIce,
      iceAttack: SessionHudApp.#onIceAttack,
      rollOpposed: SessionHudApp.#onRollOpposed,
      rollDamage: SessionHudApp.#onRollDamage,
      skipDamage: SessionHudApp.#onSkipDamage,
      rollIceDamage: SessionHudApp.#onRollIceDamage,
      undo: SessionHudApp.#onUndo,
      adjustActions: SessionHudApp.#onAdjustActions,
      programRez: SessionHudApp.#onProgramRez,
      programAttack: SessionHudApp.#onProgramAttack,
      rollAmbush: SessionHudApp.#onRollAmbush,
      iceTarget: SessionHudApp.#onIceTarget,
      resolveNow: SessionHudApp.#onResolveNow,
      toggleSound: SessionHudApp.#onToggleSound,
      mapFloor: SessionHudApp.#onMapFloor,
      editArch: SessionHudApp.#onEditArch,
      openDeck: SessionHudApp.#onOpenDeck,
    },
  };

  static PARTS = {
    hud: { template: `modules/${MODULE_ID}/templates/session-hud.hbs` },
  };

  #session: PublicSession;
  readonly #handlers: SessionHudHandlers;
  #fx: { fx: HudFx; at: number } | null = null;
  #hookIds: Array<[string, number]> = [];
  #booting = true;
  #busy: "rolling" | "waiting" | null = null;
  #lastError: string | null = null;
  #logSeen = 0;
  #logScroll = true;
  #enemyCollapsed = readEnemyCollapsed();
  #logAtEnd = true;
  #logTop = 0;
  #focus: string | null = null;
  #notes: RevealedNotes = {};
  #notesKey = "";
  #scroll: Record<string, number> = {};
  #dragEndedAt = 0;
  readonly #refresh = foundry.utils.debounce(() => {
    this.#rerender();
  }, 100);

  #sessions: PublicSession[];
  readonly #unseen = new Set<string>();

  constructor(sessions: PublicSession[], handlers: SessionHudHandlers) {
    super();
    const id = pickSession(sessions, null, game.user?.id ?? null);
    const shown = sessions.find((s) => s.id === id) ?? sessions[0];
    if (!shown) throw new Error("SessionHudApp precisa de ao menos uma sessão");
    this.#sessions = sessions;
    this.#session = shown;
    this.#handlers = handlers;
  }

  #show(session: PublicSession): void {
    this.#session = session;
    this.#unseen.delete(session.id);
    this.#fx = null;
    this.#lastError = null;
    this.#logSeen = session.log.at(-1)?.seq ?? 0;
    this.#logScroll = true;
    this.#logAtEnd = true;
    this.#notes = {};
    this.#notesKey = "";
  }

  #rerender(): void {
    void this.render();
  }

  #playSound(fx: HudFx): void {
    const visible = this.element?.isConnected === true;
    if (!visible || game.settings.get(MODULE_ID, SOUND_SETTING) !== true) return;
    const tones = soundCue(fx.banner);
    if (tones) playTones(tones);
  }

  #syncNotes(): void {
    const key = `${this.#session.id}:${[...this.#session.run.cleared].sort((a, b) => a - b).join(",")}`;
    if (key === this.#notesKey) return;
    this.#notesKey = key;
    void this.#handlers.requestNotes(this.#session.id).then((notes) => {
      if (key !== this.#notesKey) return;
      this.#notes = notes;
      this.#rerender();
    });
  }

  #releasedView(
    role: ViewerRole,
    full: NetArchitecture | null,
    rules: RuleContext,
    busy: boolean,
    reason: (e: Eligibility) => string,
    tip: (key: string, why?: string) => string,
  ): Array<Record<string, unknown>> {
    const t = (key: string, data?: Record<string, string>) =>
      data ? game.i18n.format(key, data) : game.i18n.localize(key);
    const arch = this.#session.netArch;
    if (!arch || role === "spectator") return [];
    const notes: RevealedNotes = {};
    if (role === "gm" && full) {
      for (const floor of full.floors) {
        if (!this.#session.run.cleared.includes(floor.key)) continue;
        const secret = secretFor(floor.content, full.secrets?.[floor.key]);
        if (Object.keys(secret).length > 0) notes[floor.key] = secret;
      }
    } else {
      Object.assign(notes, this.#notes);
    }
    const optionCheck = checkControlOption(rules);
    const chosen = this.#session.run.controlChoices;
    return Object.entries(notes)
      .map(([k, note]) => {
        const key = Number(k);
        const floor = arch.discovered.find((f) => f.key === key);
        if (!floor || (!note.password && !note.image && !note.journal && !note.options))
          return null;
        const here = this.#session.runnerPosition === key;
        const canChoose = role === "netrunner" && here;
        return {
          key,
          where: `${floor.floor}${floor.branch.toUpperCase()} · ${t(`CNH.Content.${floor.content}`)}`,
          password: note.password ?? "",
          image: note.image ?? "",
          journal: note.journal ? true : false,
          options: (note.options ?? []).map((label, index) => ({
            index,
            label,
            used: chosen.filter((c) => c.key === key && c.index === index).length,
            button: canChoose && {
              disabled: busy || !optionCheck.allowed,
              tip: tip("CNH.Help.controlOption", reason(optionCheck)),
            },
          })),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }

  static async #onControlOption(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const index = Number(target.dataset["index"]);
    if (!Number.isInteger(index)) return;
    await this.#send({ type: "controlOption", index });
  }

  static #onShowImage(this: SessionHudApp, _event: Event, target: HTMLElement): void {
    const src = target.dataset["src"];
    if (src) new ImagePopout(src, { title: this.#session.netArch?.name ?? "" }).render(true);
  }

  static #onShowJournal(this: SessionHudApp, _event: Event, target: HTMLElement): void {
    const key = Number(target.dataset["key"]);
    if (Number.isInteger(key)) this.#handlers.requestJournal(this.#session.id, key);
  }

  get session(): PublicSession {
    return this.#session;
  }

  setSessions(sessions: PublicSession[]): void {
    const previous = this.#sessions;
    this.#sessions = sessions;
    const id = pickSession(sessions, this.#session.id, game.user?.id ?? null);
    const shown = sessions.find((s) => s.id === id);
    if (!shown) return;
    for (const s of sessions) {
      const before = previous.find((p) => p.id === s.id);
      if (s.id !== id && (!before || s.revision > before.revision)) this.#unseen.add(s.id);
    }
    for (const unseen of [...this.#unseen]) {
      if (!sessions.some((s) => s.id === unseen)) this.#unseen.delete(unseen);
    }
    if (shown.id !== this.#session.id) {
      this.#show(shown);
    } else {
      const fx = diffFx(this.#session, shown);
      if (hasFx(fx)) {
        this.#fx = { fx, at: Date.now() };
        this.#playSound(fx);
      }
      this.#session = shown;
    }
    this.#rerender();
  }

  protected override async _prepareContext(): Promise<Record<string, unknown>> {
    const booting = this.#booting;
    this.#booting = false;
    this.#saveScroll();
    const active = document.activeElement;
    const lost = active === null || active === document.body;
    this.#focus = focusSelector(this.element, active) ?? (lost ? this.#focus : null);
    const user = game.user;
    const role = resolveViewerRole(this.#session, {
      id: user?.id ?? "",
      isGM: user?.isGM === true,
    });
    const snapshot = readCharacterSnapshot(this.#session.actorUuid);
    const view = buildSessionHudView(snapshot, role);
    const t = (key: string, data?: Record<string, string>) =>
      data ? game.i18n.format(key, data) : game.i18n.localize(key);
    const arch = this.#session.netArch;
    const full = arch && role === "gm" ? readNetArchitecture(arch.itemUuid) : null;
    const canControl = role === "gm" || role === "netrunner";
    const rules: RuleContext = {
      runner: runnerResources(snapshot),
      run: toRunState(this.#session),
      hasEntry: true,
      nodes: full?.floors ?? [...(arch?.discovered ?? []), ...(arch?.mapped ?? [])],
      forks: full?.forks ?? arch?.forks ?? {},
    };
    if (role === "netrunner") this.#syncNotes();
    const pendingCheck = this.#session.run.pending;
    const busy =
      pendingCheck !== null ||
      this.#session.run.awaitingDamage !== null ||
      this.#session.run.iceHit !== null;
    const archView = arch
      ? buildArchitectureView(
          full,
          arch.discovered,
          role,
          this.#session.runnerPosition,
          {
            run: this.#session.run,
            rules: busy ? null : rules,
          },
          arch.mapped,
          arch.forks,
        )
      : null;
    const jackedIn = this.#session.runnerPosition !== null;
    const reason = (e: Eligibility) => (e.allowed ? "" : t(`CNH.Request.Error.${e.reason}`));
    const tip = (helpKey: string, why = "") => (why ? `${t(helpKey)} — ${why}` : t(helpKey));
    const jackCheck = checkAction(rules, jackedIn ? "jackOut" : "jackIn");
    const at = rules.run.position;
    const holder = turnHolder(this.#session);
    const hints = [
      holder === "ice" ? t(npcAt(this.#session) ? "CNH.Turn.NpcHint" : "CNH.Turn.IceHint") : "",
      at && isEngaged(rules.run) ? t("CNH.Run.Engaged") : "",
      at?.content === "password" && !rules.run.cleared.has(at.key)
        ? t("CNH.Run.PasswordLocked")
        : "",
      jackedIn && holder === null && actionsLeft(rules) === 0 ? t("CNH.Run.NoActions") : "",
      jackedIn && this.#session.run.atBottom ? t("CNH.Run.AtBottom") : "",
    ].filter((h) => h !== "");
    const abilityChecks = ABILITY_CHECKS.map((ability) => ({
      ability,
      eligibility: checkAction(rules, ability),
    }))
      .filter(({ eligibility }) => eligibility.allowed || eligibility.reason !== "wrong-node")
      .filter(({ eligibility }) => eligibility.allowed || eligibility.reason !== "not-jacked-in")
      .filter(({ eligibility }) => eligibility.allowed || eligibility.reason !== "not-lowest")
      .filter(
        ({ ability }) =>
          ability !== "pathfinder" ||
          !(this.#session.run.allKnown && (arch?.mapped.length ?? 0) === 0),
      )
      .map(({ ability, eligibility }) => ({
        ability,
        label: t(`CNH.Action.${ability}`),
        disabled: !eligibility.allowed || busy,
        reason: reason(eligibility),
        tip: tip(`CNH.Help.${ability}`, reason(eligibility)),
      }));
    const encounter = buildEncounterView({
      session: this.#session,
      role,
      rules,
      readIce: readIceStats,
      dvOf: (key) => full?.floors.find((f) => f.key === key)?.dv ?? null,
    });
    const iceNode = encounter.ice;
    const iceName = iceNode
      ? t(arch?.discovered.find((f) => f.key === iceNode.key)?.blackIceKey ?? "")
      : "";
    const iceOptions =
      iceNode?.canLink === true
        ? listWorldIce().map((o) => ({
            ...o,
            selected: iceNode.link
              ? o.uuid === iceNode.link.uuid
              : o.name.toLowerCase() === iceName.toLowerCase(),
          }))
        : [];
    const ep = encounter.pending;
    const runnerRoll = ep?.opposedRoll === "defense" || ep?.opposedRoll === "speed";
    const myMove =
      (ep !== null &&
        (ep.canConfirm || (ep.canRollOpposed && (role === "netrunner" || !runnerRoll)))) ||
      (encounter.canRollDamage && role === "netrunner") ||
      encounter.iceHit?.canRoll === true ||
      encounter.iceHit?.pickProgram === true ||
      encounter.ambush?.canRoll === true ||
      (encounter.npc?.canRollRunner === true && role === "netrunner") ||
      encounter.npc?.canRollNpc === true;
    const elapsed = this.#fx ? Date.now() - this.#fx.at : Infinity;
    const fx = !booting && this.#fx && elapsed < FX_WINDOW_MS ? this.#fx.fx : null;
    const reduced = game.settings.get(MODULE_ID, MOTION_SETTING) === "reduced";
    const controllerId = this.#session.controllerUserId;
    const controller = controllerId ? game.users.get(controllerId) : undefined;

    const logAvailable = game.settings.get(MODULE_ID, LOG_WORLD_SETTING) !== false;
    const showLog = logAvailable && game.settings.get(MODULE_ID, LOG_SETTING) === true;
    const logSeen = this.#logSeen;
    const log = showLog
      ? logLines(this.#session, snapshot, t).map((l) => ({
          ...l,
          isNew: !booting && logSeen > 0 && l.seq > logSeen,
        }))
      : [];
    const lastSeq = this.#session.log.at(-1)?.seq ?? 0;
    if (lastSeq !== logSeen) this.#logScroll = true;
    this.#logSeen = lastSeq;
    const npcView = encounter.npc;
    const npcSnapshot = npcView ? readCharacterSnapshot(npcView.actorUuid) : null;
    const npcHp = npcView ? readActorHp(npcView.actorUuid) : null;
    const npcMax = netActionsPerTurn(npcSnapshot?.netRole?.rank ?? 0);
    const npcLinks = role === "gm" && arch ? listNpcLinks(arch.itemUuid) : {};
    const iceActive =
      iceNode !== null && !iceNode.defeated && !this.#session.run.evaded.includes(iceNode.key);
    const iceTitle = iceNode?.link?.stats?.name ?? iceName;
    const enemyPending =
      encounter.ambush !== null ||
      encounter.iceHit !== null ||
      (ep !== null && ["iceAttack", "npcAttack", "ambush"].includes(ep.kind)) ||
      npcView?.initiativePending === true ||
      (holder === "ice" && role === "gm");
    const enemyCard = (iceActive || npcView !== null) && {
      collapsed: this.#enemyCollapsed,
      alert: role === "gm" && (myMove || holder === "ice") && enemyPending,
      quiet: role !== "gm" && enemyPending,
      pendingLabel: t(role === "gm" ? "CNH.Enemy.PendingGm" : "CNH.Enemy.Pending"),
      ice: iceActive,
      npc: npcView !== null,
      icon: npcView ? "fa-user-ninja" : "fa-skull",
      title: npcView
        ? `${t("CNH.Npc.Encounter")}: ${npcSnapshot?.actorName || t("CNH.Npc.Unknown")}`
        : `${t("CNH.Ice.Encounter")}: ${iceTitle}`,
      summary: npcView
        ? npcHp
          ? `HP ${npcHp.value}/${npcHp.max}`
          : ""
        : iceNode?.link?.stats
          ? `REZ ${iceNode.link.stats.rez.value}/${iceNode.link.stats.rez.max}`
          : "",
      toggleLabel: t(this.#enemyCollapsed ? "CNH.Enemy.Show" : "CNH.Enemy.Hide"),
      headerTip: [
        npcView
          ? `${t("CNH.Npc.Encounter")}: ${npcSnapshot?.actorName || t("CNH.Npc.Unknown")}`
          : `${t("CNH.Ice.Encounter")}: ${iceTitle}`,
        npcView && npcHp
          ? `HP ${npcHp.value}/${npcHp.max}`
          : iceNode?.link?.stats
            ? `REZ ${iceNode.link.stats.rez.value}/${iceNode.link.stats.rez.max}`
            : "",
        enemyPending ? t(role === "gm" ? "CNH.Enemy.PendingGm" : "CNH.Enemy.Pending") : "",
        t(this.#enemyCollapsed ? "CNH.Enemy.Show" : "CNH.Enemy.Hide"),
      ]
        .filter((p) => p !== "")
        .join(" · "),
    };
    const lastUndo = this.#session.history.at(-1);
    const myId = user?.id ?? null;
    const tabs = this.#sessions.map((s) => ({
      id: s.id,
      name: readCharacterSnapshot(s.actorUuid)?.actorName || t("CNH.Session.ActorMissing"),
      active: s.id === this.#session.id,
      unseen: this.#unseen.has(s.id),
      mine: s.controllerUserId !== null && s.controllerUserId === myId,
    }));
    const showTabs = tabs.length > 1 || user?.isGM === true;
    const noAuthority = role !== "gm" && !this.#handlers.hasAuthority();
    const locked = this.#busy !== null || noAuthority;
    return {
      view,
      booting,
      reduced,
      noAuthority,
      lastError: this.#lastError,
      busyLabel: this.#busy
        ? t(this.#busy === "rolling" ? "CNH.Request.Rolling" : "CNH.Request.Pending")
        : "",
      fx: fx && {
        elapsed: Math.round(elapsed),
        alert: fx.alert ?? "",
        banner: fx.banner ?? "",
        bannerText: fx.banner ? t(`CNH.Fx.${fx.banner}`) : "",
        iceAlert: fx.alert === "ice-alert",
      },
      pending: locked,
      moveLabel: t("CNH.Request.Move"),
      controls: canControl &&
        arch !== null && {
          jackedIn,
          pending: locked,
          busy: this.#busy !== null,
          blocked: !jackCheck.allowed,
          blockedReason: reason(jackCheck),
          tip: tip(jackedIn ? "CNH.Help.jackOut" : "CNH.Help.jackIn", reason(jackCheck)),
        },
      abilityChecks: canControl ? abilityChecks : [],
      encounter: iceNode && {
        ...iceNode,
        name: iceNode.link?.stats?.name ?? iceName,
        rezLabel: iceNode.link?.stats
          ? `${iceNode.link.stats.rez.value}/${iceNode.link.stats.rez.max}`
          : "",
        rezPercent: iceNode.link?.stats?.rez.max
          ? Math.round((iceNode.link.stats.rez.value / iceNode.link.stats.rez.max) * 100)
          : 0,
        options: iceOptions.map((o) => ({
          ...o,
          name: o.builtin ? `${o.name} ${t("CNH.Ice.BuiltinTag")}` : o.name,
        })),
        effect: role === "gm" ? (iceNode.link?.stats?.effect ?? "") : "",
        hasOptions: iceOptions.length > 0,
        lastDamage: encounter.lastIceDamage
          ? iceDamageLabel(encounter.lastIceDamage, snapshot, t)
          : "",
      },
      iceHit: encounter.iceHit && {
        title: t(encounter.iceHit.npc ? "CNH.Npc.HitAwaiting" : "CNH.IceHit.Awaiting"),
        targetLabel: iceTargetLabel(encounter.iceHit.target, snapshot, t),
        formulaLabel:
          role !== "gm"
            ? ""
            : encounter.iceHit.npc
              ? encounter.iceHit.npc.programId
                ? t("CNH.Npc.ProgramDamage", {
                    name: npcProgramName(
                      encounter.iceHit.npc.actorUuid,
                      encounter.iceHit.npc.programId,
                    ),
                  })
                : t("CNH.IceHit.Formula", { formula: "1d6" })
              : encounter.iceHit.formula !== null
                ? t("CNH.IceHit.Formula", { formula: encounter.iceHit.formula })
                : t("CNH.IceHit.NoFormula", { name: encounter.iceHit.iceName }),
        canRoll: encounter.iceHit.canRoll,
        canSkip: encounter.iceHit.canSkip,
        isGm: role === "gm",
        pick: encounter.iceHit.pickProgram && {
          options: (snapshot?.programs ?? [])
            .filter((p) => p.status === "rezzed" && p.rez.value > 0)
            .map((p) => ({
              itemId: p.itemId,
              name: `${p.name} (REZ ${p.rez.value})`,
              selected:
                encounter.iceHit?.target.kind === "program" &&
                encounter.iceHit.target.programId === p.itemId,
            })),
        },
      },
      ambush: encounter.ambush && {
        ...encounter.ambush,
        waiting: !encounter.ambush.canRoll,
        hint: t(
          encounter.ambush.linked
            ? role === "gm"
              ? "CNH.Ambush.GmHint"
              : "CNH.Ambush.Waiting"
            : "CNH.Ambush.NeedsLink",
        ),
      },
      canResolveNow:
        role === "gm" &&
        game.settings.get(MODULE_ID, AUTO_SETTING) !== true &&
        nextAutoStep(this.#session, {
          dvOf: (key) => full?.floors.find((f) => f.key === key)?.dv ?? null,
          readIce: readIceStats,
        }) !== null,
      soundToggle: {
        on: game.settings.get(MODULE_ID, SOUND_SETTING) === true,
        label: t(
          game.settings.get(MODULE_ID, SOUND_SETTING) === true
            ? "CNH.Sound.Mute"
            : "CNH.Sound.Unmute",
        ),
      },
      awaitingDamage: encounter.awaitingDamage && {
        program: this.#session.run.damageProgram !== null,
        canRoll: encounter.canRollDamage,
        canSkip: encounter.canSkipDamage,
      },
      pendingCheck: ep && {
        label:
          ep.kind === "programAttack"
            ? `${t("CNH.Check.Kind.programAttack")}: ${programName(snapshot, this.#session.run.pending?.programId ?? null)}`
            : ep.kind === "damage" && this.#session.run.damageProgram !== null
              ? `${t("CNH.Check.Kind.programDamage")}: ${programName(snapshot, this.#session.run.damageProgram)}`
              : t(`CNH.Check.Kind.${ep.kind}`),
        total: ep.total,
        opposed: ep.opposed,
        isGm: role === "gm",
        dvLabel: ep.dv !== null ? `DV ${ep.dv}` : "",
        rezLabel: ep.rez
          ? t(ep.hp ? "CNH.Npc.HpChange" : "CNH.Check.RezChange", {
              before: String(ep.rez.before),
              after: String(ep.rez.after),
            })
          : "",
        suggestion: ep.suggestion ? t(`CNH.Check.Suggest.${ep.kind}.${ep.suggestion}`) : "",
        waiting: ep.opposedRoll
          ? t(`CNH.Check.WaitingRoll.${ep.opposedRoll}`)
          : t("CNH.Check.Waiting"),
        rollOpposed: ep.canRollOpposed && ep.opposedRoll && t(`CNH.Check.Roll.${ep.opposedRoll}`),
        canConfirm: ep.canConfirm,
        successLabel: t(`CNH.Check.Confirm.${ep.kind}.success`),
        failureLabel: t(`CNH.Check.Confirm.${ep.kind}.failure`),
      },
      released: this.#releasedView(role, full, rules, busy, reason, tip),
      run: {
        turn: this.#session.run.turn,
        holder: holder && {
          isIce: holder === "ice",
          label: t(
            holder === "ice"
              ? encounter.npc
                ? "CNH.Turn.Npc"
                : "CNH.Turn.Ice"
              : "CNH.Turn.Runner",
          ),
        },
        showActions: canControl,
        actionsLeft: actionsLeft(rules),
        actionsMax: netActionsPerTurn(rules.runner.interfaceRank),
        actionsUsed: this.#session.run.actionsUsed,
        canAdjust: role === "gm",
        giveLabel: t("CNH.Undo.GiveAction"),
        takeLabel: t("CNH.Undo.TakeAction"),
        hints: canControl ? hints : [],
      },
      canNewTurn: role === "gm" && holder === null,
      endTurn: canControl &&
        holder !== null &&
        (holder === "runner" || role === "gm") && {
          label: t(holder === "ice" ? "CNH.Turn.PassIce" : "CNH.Turn.End"),
          disabled: busy,
          reason: busy ? t("CNH.Request.Error.check-pending") : "",
          tip: tip(
            holder === "ice" ? "CNH.Help.passIce" : "CNH.Help.endTurn",
            busy ? t("CNH.Request.Error.check-pending") : "",
          ),
        },
      undo: role === "gm" && {
        count: this.#session.history.length,
        tooltip: lastUndo
          ? t("CNH.Undo.Tooltip", { what: t(`CNH.Undo.What.${lastUndo.label}`) })
          : t("CNH.Undo.Empty"),
      },
      gmNoteLabel: t("CNH.Session.GmNote"),
      revealedLabel: t("CNH.Session.RevealedNote"),
      npc: npcView && {
        ...npcView,
        name: npcSnapshot?.actorName || t("CNH.Npc.Unknown"),
        hpLabel: npcHp ? `${npcHp.value}/${npcHp.max}` : "",
        hpPercent: npcHp && npcHp.max > 0 ? Math.round((npcHp.value / npcHp.max) * 100) : 0,
        actionsLabel: `${Math.max(0, npcMax - npcView.actionsUsed)}/${npcMax}`,
        canAttack: npcView.canAttack && npcView.actionsUsed < npcMax,
        programs: (npcSnapshot?.programs ?? [])
          .filter((p) => NETRUNNER_ATTACKER_CLASSES.has(p.programClass))
          .map((p) => ({ itemId: p.itemId, name: p.name })),
        waitingInit: npcView.initiativePending && !npcView.canRollRunner && !npcView.canRollNpc,
        initLabel: t("CNH.Npc.Initiative", {
          runner: npcView.runnerInit === null ? "—" : String(npcView.runnerInit),
          npc: npcView.npcInit === null ? "—" : String(npcView.npcInit),
        }),
      },
      decision: (ep !== null ||
        encounter.ambush !== null ||
        encounter.awaitingDamage ||
        encounter.iceHit !== null ||
        npcView?.initiativePending === true) && {
        mine: myMove,
        title: t(myMove ? "CNH.Check.YourMove" : "CNH.Check.Pending"),
        auto: game.settings.get(MODULE_ID, AUTO_SETTING) === true ? t("CNH.Auto.Hint") : "",
      },
      clearLabel: t("CNH.Run.Clear"),
      restoreLabel: t("CNH.Run.Restore"),
      roleLabel: t(`CNH.Role.${role}`),
      isGm: role === "gm",
      controllerName: controller?.name ?? t("CNH.Session.NoController"),
      canOpenDeck: canOpenDeck(this.#session.actorUuid, user ?? null),
      programs: view.programs.map((p) => {
        const programClass = p.programClass;
        const attacker = programClass.endsWith("attacker");
        const rezzable = REZZABLE_CLASSES.has(programClass);
        const running = p.status === "rezzed" || p.status === "neutralized";
        const rezCheck = rezzable ? checkProgramRez(rules, p.itemId, !running) : null;
        const attackClasses = rules.run.npcAt ? NETRUNNER_ATTACKER_CLASSES : ICE_ATTACKER_CLASSES;
        const atkCheck = attackClasses.has(programClass)
          ? checkProgramAttack(rules, p.itemId)
          : null;
        const showAttack =
          atkCheck !== null && (atkCheck.allowed || atkCheck.reason !== "wrong-node");
        const usedRun = attacker && rules.run.netrunUsed?.has(p.itemId) === true;
        const usedNow = attacker && rules.run.programsUsed?.has(p.itemId) === true;
        const attackerLabel =
          p.status === "destroyed"
            ? t(STATUS_KEY[p.status])
            : usedRun
              ? t("CNH.Program.UsedRun")
              : usedNow
                ? t("CNH.Program.UsedRound")
                : t("CNH.Program.Attacker");
        return {
          ...p,
          stateLabel: attacker ? attackerLabel : t(STATUS_KEY[p.status]),
          tone:
            p.status === "destroyed"
              ? "dead"
              : p.status === "neutralized"
                ? "warn"
                : attacker
                  ? usedRun || usedNow
                    ? "used"
                    : "ready"
                  : p.status === "rezzed"
                    ? "on"
                    : "off",
          kindLabel: programClass ? t(`CNH.ProgramClass.${programClass}`) : "",
          rezLabel: "detailed" in p && p.rez.max > 0 ? `${p.rez.value}/${p.rez.max}` : "",
          percent:
            "detailed" in p && p.rez.max > 0 ? Math.round((p.rez.value / p.rez.max) * 100) : 0,
          atkLabel: "detailed" in p && attacker ? `ATK ${p.stats.atk}` : "",
          rezAction: canControl &&
            rezCheck !== null && {
              rez: !running,
              label: t(
                p.status === "neutralized"
                  ? "CNH.Program.Recover"
                  : running
                    ? "CNH.Program.Derez"
                    : "CNH.Program.Rez",
              ),
              disabled: !rezCheck.allowed || busy,
              reason: reason(rezCheck),
              tip: tip(
                p.status === "neutralized" ? "CNH.Help.recover" : "CNH.Help.rez",
                reason(rezCheck),
              ),
            },
          attackAction: canControl &&
            showAttack &&
            atkCheck !== null && {
              label: t("CNH.Program.Attack"),
              disabled: !atkCheck.allowed || busy,
              reason: reason(atkCheck),
              tip: tip("CNH.Help.programAttack", reason(atkCheck)),
            },
          attackHint:
            programClass === "antipersonnelattacker" && !rules.run.npcAt
              ? t("CNH.Program.AttackHint")
              : "",
        };
      }),
      issues: view.issues.map((issue) => ({ code: issue.code, text: issueText(issue, t) })),
      enemyCard,
      showLog,
      log,
      tabs: showTabs && {
        list: tabs,
        canAdd: user?.isGM === true && this.#sessions.length < MAX_SESSIONS,
        addLabel: t("CNH.Session.Tabs.Add"),
        mineLabel: t("CNH.Session.Tabs.Mine"),
        unseenLabel: t("CNH.Session.Tabs.Unseen"),
      },
      logToggle: logAvailable && {
        pressed: showLog,
        label: t(showLog ? "CNH.Log.Hide" : "CNH.Log.Show"),
      },
      logPrompt: `${role === "gm" ? "gm" : role === "netrunner" ? "netrunner" : "guest"}@cyberdeck:~$`,
      architecture: archView && {
        name: arch?.name ?? "",
        ...archView,
        showBranchHeader: archView.columns.length > 1,
        rows: archView.rows.map((row) => ({
          floorLabel: String(row.floor).padStart(2, "0"),
          linksAbove: row.linksAbove,
          cells: row.cells.map(
            (node) =>
              node && {
                ...node,
                icon: CONTENT_ICON[node.content],
                typeLabel: t(`CNH.Content.${node.content}`),
                mapLabel: t(node.masked ? "CNH.Session.Unmask" : "CNH.Session.MapOnly"),
                mappable: role === "gm" && node.key !== this.#session.runnerPosition,
                iceLabel: node.blackIceKey ? t(node.blackIceKey) : "",
                dvLabel: "dv" in node && node.dv !== null ? `DV ${node.dv}` : "",
                description: "description" in node ? node.description : "",
                runnerNote: role === "netrunner" ? (this.#notes[node.key]?.text ?? "") : "",
                npcLinkable: role === "gm" && node.content !== "blackice",

                npcHere:
                  role !== "gm" &&
                  node.key === this.#session.runnerPosition &&
                  this.#session.run.npcs.some((n) => n.key === node.key && !n.defeated)
                    ? t("CNH.Npc.Encounter")
                    : "",
                npcName: npcLinks[node.key] ? actorName(npcLinks[node.key] ?? "") : "",
                npcLabel: npcLinks[node.key]
                  ? t("CNH.Npc.Linked", { name: actorName(npcLinks[node.key] ?? "") })
                  : t("CNH.Npc.Link"),
                fx: fx?.nodes[node.key] ?? "",
                stateLabel:
                  node.state === "cleared"
                    ? t(`CNH.Run.Cleared.${node.content}`)
                    : node.state === "evaded"
                      ? t("CNH.Run.Evaded")
                      : "",
              },
          ),
        })),
      },
    };
  }

  protected override _onFirstRender(
    context: Record<string, unknown>,
    options: Record<string, unknown>,
  ): void {
    super._onFirstRender(context, options);
    const isOurActor = (uuid: string | undefined) =>
      uuid === this.#session.actorUuid || this.#session.run.ice.some((l) => l.actorUuid === uuid);
    const isOurNetArch = (uuid: string | undefined) =>
      uuid !== undefined && uuid === this.#session.netArch?.itemUuid;
    this.#hookIds.push([
      "updateActor",
      Hooks.on("updateActor", (actor) => isOurActor(actor.uuid) && this.#refresh()),
    ]);
    this.#hookIds.push(["userConnected", Hooks.on("userConnected", () => this.#refresh())]);
    for (const hook of ["createItem", "updateItem", "deleteItem"] as const) {
      this.#hookIds.push([
        hook,
        Hooks.on(
          hook,
          (item) => (isOurActor(item.parent?.uuid) || isOurNetArch(item.uuid)) && this.#refresh(),
        ),
      ]);
    }
  }

  protected override _onRender(
    context: Record<string, unknown>,
    options: Record<string, unknown>,
  ): void {
    super._onRender(context, options);
    this.#restoreScroll();
    if (game.user?.isGM) this.#bindNpcDrag();
    const logPanel = this.element.querySelector<HTMLElement>(".cnh-log--terminal");
    if (logPanel) {
      const follow = this.#logScroll || this.#logAtEnd;
      const restore = () => {
        logPanel.scrollTop = follow ? logPanel.scrollHeight : this.#logTop;
      };
      restore();
      requestAnimationFrame(restore);
      this.#logScroll = false;
      logPanel.addEventListener("scroll", () => {
        this.#logTop = logPanel.scrollTop;
        this.#logAtEnd = logPanel.scrollHeight - logPanel.clientHeight - logPanel.scrollTop < 8;
      });
    }
    const selector = this.#focus;
    if (!selector) return;
    const target = this.element.querySelector<HTMLElement>(selector);
    if (!target) {
      this.#focus = null;
      return;
    }
    if ((target as HTMLButtonElement).disabled) return;
    target.focus({ preventScroll: true });
    this.#focus = null;
  }

  protected override _onClose(options: Record<string, unknown>): void {
    super._onClose(options);
    for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
    this.#booting = true;
    this.#fx = null;
  }

  static async #onNetAction(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const type = target.dataset["netAction"];
    const key = Number(target.dataset["key"]);
    let action: NetAction;
    if (type === "jackIn" || type === "jackOut") action = { type };
    else if (type === "moveTo" && Number.isInteger(key)) action = { type, key };
    else return;
    await this.#send(action);
  }

  async #send(action: NetAction): Promise<void> {
    const sessionId = this.#session.id;
    await this.#withPending("waiting", () => this.#request(action, sessionId));
  }

  async #withPending(kind: "rolling" | "waiting", task: () => Promise<void>): Promise<void> {
    if (this.#busy) return;
    this.#busy = kind;
    this.#lastError = null;
    this.#rerender();
    try {
      await task();
    } finally {
      this.#busy = null;
      this.#rerender();
    }
  }

  async #request(action: NetAction, sessionId: string): Promise<void> {
    if (this.#busy === "rolling") {
      this.#busy = "waiting";
      this.#rerender();
    }
    const result = await this.#handlers.request(sessionId, action);
    if (!result.ok) {
      const message = game.i18n.localize(`CNH.Request.Error.${result.error}`);
      this.#lastError = message;
      ui.notifications.warn(message);
    }
  }

  static async #onToggleFloor(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    if (!game.user?.isGM) return;
    const key = Number(target.dataset["key"]);
    const arch = this.#session.netArch;
    if (!arch || !Number.isInteger(key)) return;
    const revealed = arch.discovered.some((f) => f.key === key);
    await this.#send({ type: revealed ? "conceal" : "reveal", key });
  }

  static async #onToggleClear(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    if (!game.user?.isGM) return;
    const key = Number(target.dataset["key"]);
    if (!Number.isInteger(key)) return;
    const { cleared, evaded } = this.#session.run;
    const resolved = cleared.includes(key) || evaded.includes(key);
    await this.#send({ type: resolved ? "restoreNode" : "clearNode", key });
  }

  static async #onAbilityCheck(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const ability = ABILITY_CHECKS.find((a) => a === target.dataset["ability"]);
    if (!ability) return;
    await this.#rollAndSend(
      () => rollInterfaceAbility(this.#session.actorUuid, ability),
      (messageId) => ({ type: "check", ability, messageId }),
    );
  }

  static async #onLinkIce(this: SessionHudApp, _event: Event, target: HTMLElement): Promise<void> {
    if (!game.user?.isGM) return;
    const key = Number(target.dataset["key"]);
    const select = this.element.querySelector<HTMLSelectElement>("select[name='iceActor']");
    const value = select?.value ?? "";
    if (!Number.isInteger(key) || value === "") return;
    const actorUuid = await ensureIceActor(value);
    if (!actorUuid) return;
    await this.#send({ type: "linkIce", key, actorUuid });
  }

  static async #onIceAttack(this: SessionHudApp): Promise<void> {
    const link = this.#iceLinkAtRunner();
    if (!game.user?.isGM || !link) return;
    await this.#rollAndSend(
      () => rollIceStat(link, "atk"),
      (messageId) => ({ type: "iceAttack", messageId }),
    );
  }

  static async #onRollOpposed(this: SessionHudApp): Promise<void> {
    const pending = this.#session.run.pending;
    if (!pending) return;
    const link = this.#session.run.ice.find((l) => l.key === pending.key)?.actorUuid;
    const npc = this.#session.run.npcs.find((n) => n.key === pending.key && !n.defeated);
    let roll: () => Promise<string | null>;
    if (pending.ability === "ambush") {
      roll = () => rollInterfaceAbility(this.#session.actorUuid, "speed");
    } else if (pending.ability === "iceAttack" || pending.ability === "npcAttack") {
      roll = () => rollInterfaceAbility(this.#session.actorUuid, "defense");
    } else if (npc && (pending.ability === "zap" || pending.ability === "programAttack")) {
      roll = () => rollInterfaceAbility(npc.actorUuid, "defense");
    } else if (
      link &&
      (pending.ability === "zap" ||
        pending.ability === "slide" ||
        pending.ability === "programAttack")
    ) {
      roll = () => rollIceStat(link, pending.ability === "slide" ? "per" : "def");
    } else return;
    await this.#rollAndSend(roll, (messageId) => ({ type: "oppose", messageId }));
  }

  static async #onRollDamage(this: SessionHudApp): Promise<void> {
    const flavor = game.i18n.localize("CNH.Check.DamageFlavor");
    const programId = this.#session.run.damageProgram;
    await this.#rollAndSend(
      () =>
        programId
          ? rollProgram(this.#session.actorUuid, programId, "damage")
          : rollZapDamage(this.#session.actorUuid, flavor),
      (messageId) => ({ type: "check", ability: "damage", messageId }),
    );
  }

  static async #onProgramRez(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const programId = target.dataset["programId"];
    if (!programId) return;
    await this.#send({ type: "rezProgram", programId, rez: target.dataset["rez"] === "true" });
  }

  static async #onProgramAttack(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const programId = target.dataset["programId"];
    if (!programId) return;
    await this.#rollAndSend(
      () => rollProgram(this.#session.actorUuid, programId, "atk"),
      (messageId) => ({ type: "check", ability: "programAttack", messageId, programId }),
    );
  }

  static async #onRollIceDamage(this: SessionHudApp): Promise<void> {
    const hit = this.#session.run.iceHit;
    if (!game.user?.isGM || !hit) return;
    if (hit.byNpc) {
      const { actorUuid, programId } = hit.byNpc;
      const npcFlavor = game.i18n.localize("CNH.Npc.DamageFlavor");
      await this.#rollAndSend(
        () =>
          programId
            ? rollProgram(actorUuid, programId, "damage")
            : rollZapDamage(actorUuid, npcFlavor),
        (messageId) => ({ type: "iceDamage", messageId }),
      );
      return;
    }
    const link = this.#session.run.ice.find((l) => l.key === hit.key)?.actorUuid;
    const formula = link ? readIceStats(link)?.damageFormula : null;
    if (!link || !formula) return;
    const flavor = game.i18n.localize("CNH.IceHit.Flavor");
    await this.#rollAndSend(
      () => rollIceDamage(link, formula, flavor),
      (messageId) => ({ type: "iceDamage", messageId }),
    );
  }

  static async #onRollInitiative(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const side = target.dataset["side"] === "npc" ? "npc" : "runner";
    const npc = this.#session.run.npcs.find(
      (n) => n.key === this.#session.runnerPosition && !n.defeated,
    );
    if (!npc || (side === "npc" && !game.user?.isGM)) return;
    const actorUuid = side === "npc" ? npc.actorUuid : this.#session.actorUuid;
    const flavor = game.i18n.localize(
      side === "npc" ? "CNH.Npc.InitiativeFlavor" : "CNH.Npc.RunnerInitiativeFlavor",
    );
    await this.#rollAndSend(
      () => rollInitiative(actorUuid, flavor),
      (messageId) => ({ type: "initiative", side, messageId }),
    );
  }

  static async #onNpcAttack(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    if (!game.user?.isGM) return;
    const npc = this.#session.run.npcs.find(
      (n) => n.key === this.#session.runnerPosition && !n.defeated,
    );
    if (!npc) return;
    const programId = target.dataset["programId"];
    await this.#rollAndSend(
      () =>
        programId
          ? rollProgram(npc.actorUuid, programId, "atk")
          : rollInterfaceAbility(npc.actorUuid, "zap"),
      (messageId) =>
        programId ? { type: "npcAttack", messageId, programId } : { type: "npcAttack", messageId },
    );
  }

  #saveScroll(): void {
    const root = this.element as HTMLElement | null | undefined;
    if (!root?.isConnected) return;
    for (const selector of SCROLLERS) {
      const el = root.querySelector<HTMLElement>(selector);
      if (el) this.#scroll[selector] = el.scrollTop;
    }
  }

  #restoreScroll(): void {
    const apply = () => {
      for (const selector of SCROLLERS) {
        const el = this.element.querySelector<HTMLElement>(selector);
        const top = this.#scroll[selector];
        if (el && top !== undefined) el.scrollTop = top;
      }
    };
    apply();
    requestAnimationFrame(apply);
  }

  #bindNpcDrag(): void {
    const arch = this.#session.netArch;
    if (!arch) return;
    const slots = [...this.element.querySelectorAll<HTMLElement>(".cnh-node-slot[data-key]")];
    for (const tool of this.element.querySelectorAll<HTMLElement>(
      ".cnh-node-tool--npc[data-npc-key]",
    )) {
      tool.addEventListener("pointerdown", (down) => {
        if (down.button !== 0 || this.#busy) return;
        const from = Number(tool.dataset["npcKey"]);
        let dragging = false;
        let over: HTMLElement | null = null;
        const clear = () => {
          tool.classList.remove("is-dragging");
          for (const s of slots) s.classList.remove("is-drop-ok", "is-drop-over");
        };
        const begin = () => {
          dragging = true;
          tool.classList.add("is-dragging");
          const floors = readNetArchitecture(arch.itemUuid)?.floors ?? [];
          const links = listNpcLinks(arch.itemUuid);
          for (const slot of slots) {
            const to = Number(slot.dataset["key"]);
            const ok = checkNpcMove(this.#session, floors, (k) => links[k] ?? null, from, to);
            slot.classList.toggle("is-drop-ok", ok === null);
          }
        };
        const move = (event: PointerEvent) => {
          const far = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 6;
          if (!dragging && !far) return;
          if (!dragging) begin();
          event.preventDefault();
          const hit = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>(".cnh-node-slot[data-key]");
          const target = hit?.classList.contains("is-drop-ok") ? hit : null;
          if (target === over) return;
          over?.classList.remove("is-drop-over");
          target?.classList.add("is-drop-over");
          over = target;
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          if (!dragging) return;
          this.#dragEndedAt = Date.now();
          const to = over ? Number(over.dataset["key"]) : null;
          clear();
          if (to !== null) void this.#send({ type: "moveNpc", from, to });
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
    }
  }

  static async #onRollAmbush(this: SessionHudApp): Promise<void> {
    const key = this.#session.run.ambush;
    const link = this.#session.run.ice.find((l) => l.key === key)?.actorUuid;
    if (!game.user?.isGM || !link) return;
    await this.#rollAndSend(
      () => rollIceStat(link, "spd"),
      (messageId) => ({ type: "ambush", messageId }),
    );
  }

  static async #onIceTarget(this: SessionHudApp): Promise<void> {
    if (!game.user?.isGM) return;
    const select = this.element.querySelector<HTMLSelectElement>("select[name='iceTarget']");
    const programId = select?.value ?? "";
    if (programId) await this.#send({ type: "iceTarget", programId });
  }

  static async #onResolveNow(this: SessionHudApp): Promise<void> {
    if (!game.user?.isGM) return;
    const sessionId = this.#session.id;
    await this.#withPending("waiting", () => this.#handlers.resolveNow(sessionId));
  }

  static async #onToggleSound(this: SessionHudApp): Promise<void> {
    const on = game.settings.get(MODULE_ID, SOUND_SETTING) === true;
    await game.settings.set(MODULE_ID, SOUND_SETTING, !on);
  }

  static async #onMapFloor(this: SessionHudApp, _event: Event, target: HTMLElement): Promise<void> {
    if (!game.user?.isGM) return;
    const key = Number(target.dataset["key"]);
    const arch = this.#session.netArch;
    if (!arch || !Number.isInteger(key)) return;
    const masked = arch.mapped.some((m) => m.key === key);
    await this.#send(masked ? { type: "reveal", key } : { type: "reveal", key, masked: true });
  }

  static async #onLinkNpc(this: SessionHudApp, _event: Event, target: HTMLElement): Promise<void> {
    const arch = this.#session.netArch;
    const key = Number(target.dataset["key"]);
    if (!game.user?.isGM || !arch || !Number.isInteger(key)) return;
    if (Date.now() - this.#dragEndedAt < 400) return;
    const current = listNpcLinks(arch.itemUuid)[key] ?? "";
    const options = listWorldNetrunners(this.#session.actorUuid);
    const t = (k: string) => game.i18n.localize(k);
    const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const content = `<div class="form-group"><label>${esc(t("CNH.Npc.Actor"))}</label>
      <select name="npc"><option value="">${esc(t("CNH.Npc.None"))}</option>${options
        .map(
          (o) =>
            `<option value="${esc(o.uuid)}" ${o.uuid === current ? "selected" : ""}>${esc(o.name)}</option>`,
        )
        .join("")}</select></div>
      <p class="hint">${esc(t(options.length ? "CNH.Npc.LinkHint" : "CNH.Npc.NoActors"))}</p>`;
    const choice: unknown = await DialogV2.prompt({
      window: { title: "CNH.Npc.LinkTitle" },
      content,
      ok: {
        label: "CNH.Npc.Save",
        callback: (_e: Event, button: HTMLButtonElement) =>
          (button.form?.elements.namedItem("npc") as HTMLSelectElement | null)?.value ?? "",
      },
      rejectClose: false,
    });
    if (typeof choice !== "string") return;
    await setNpcLink(arch.itemUuid, key, choice || null);
    await this.#send({ type: "npcSync" });
  }

  static async #onUndo(this: SessionHudApp): Promise<void> {
    if (!game.user?.isGM) return;
    await this.#send({ type: "undo" });
  }

  static async #onAdjustActions(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    if (!game.user?.isGM) return;
    const delta = target.dataset["delta"] === "1" ? 1 : target.dataset["delta"] === "-1" ? -1 : 0;
    if (delta !== 0) await this.#send({ type: "adjustActions", delta });
  }

  static async #onSkipDamage(this: SessionHudApp): Promise<void> {
    if (!game.user?.isGM) return;
    await this.#send({ type: "resolveCheck", outcome: "failure" });
  }

  #iceLinkAtRunner(): string | null {
    const key = this.#session.runnerPosition;
    return this.#session.run.ice.find((l) => l.key === key)?.actorUuid ?? null;
  }

  async #rollAndSend(
    roll: () => Promise<string | null>,
    toAction: (messageId: string) => NetAction,
  ): Promise<void> {
    const sessionId = this.#session.id;
    await this.#withPending("rolling", async () => {
      const messageId = await roll();
      if (!messageId) {
        ui.notifications.info(game.i18n.localize("CNH.Check.Cancelled"));
        return;
      }
      await this.#request(toAction(messageId), sessionId);
    });
  }

  static async #onResolveCheck(
    this: SessionHudApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    if (!game.user?.isGM) return;
    const outcome = target.dataset["outcome"];
    if (outcome !== "success" && outcome !== "failure") return;
    await this.#send({ type: "resolveCheck", outcome });
  }

  static #onSelectSession(this: SessionHudApp, _event: Event, target: HTMLElement): void {
    const id = target.dataset["sessionId"];
    const session = this.#sessions.find((s) => s.id === id);
    if (!session || this.#busy || session.id === this.#session.id) return;
    this.#show(session);
    this.#rerender();
  }

  static #onOpenDeck(this: SessionHudApp): void {
    if (canOpenDeck(this.#session.actorUuid, game.user)) {
      this.#handlers.openDeck(this.#session.actorUuid);
    }
  }

  static #onEditArch(this: SessionHudApp): void {
    if (game.user?.isGM) this.#handlers.editArchitecture(this.#session.netArch?.itemUuid ?? null);
  }

  static #onNewSession(this: SessionHudApp): void {
    if (game.user?.isGM) this.#handlers.startSession();
  }

  static #onToggleEnemy(this: SessionHudApp): void {
    this.#enemyCollapsed = !this.#enemyCollapsed;
    writeEnemyCollapsed(this.#enemyCollapsed);
    this.#rerender();
  }

  static async #onToggleLog(this: SessionHudApp): Promise<void> {
    const shown = game.settings.get(MODULE_ID, LOG_SETTING) === true;
    this.#logScroll = true;
    await game.settings.set(MODULE_ID, LOG_SETTING, !shown);
  }

  static async #onEndTurn(this: SessionHudApp): Promise<void> {
    await this.#send({ type: "endTurn" });
  }

  static async #onNewTurn(this: SessionHudApp): Promise<void> {
    if (!game.user?.isGM) return;
    await this.#send({ type: "newTurn" });
  }

  static async #onEndSession(this: SessionHudApp): Promise<void> {
    if (!game.user?.isGM) return;
    const confirmed = await DialogV2.confirm({
      window: { title: "CNH.Session.EndTitle" },
      content: `<p>${game.i18n.localize("CNH.Session.EndConfirm")}</p>`,
      rejectClose: false,
    });
    if (confirmed === true) await this.#send({ type: "end" });
  }
}

function issueText(
  issue: SnapshotIssue,
  t: (key: string, data?: Record<string, string>) => string,
): string {
  switch (issue.code) {
    case "missing-installed-item":
      return t("CNH.Issue.missing-installed-item", { id: issue.itemId });
    case "invalid-item-data":
      return t("CNH.Issue.invalid-item-data", { id: issue.itemId, field: issue.field });
    case "multiple-equipped-cyberdecks":
      return t("CNH.Issue.multiple-equipped-cyberdecks", { count: String(issue.itemIds.length) });
    default:
      return t(`CNH.Issue.${issue.code}`);
  }
}

function programName(snapshot: CharacterSnapshot | null, programId: string | null): string {
  return snapshot?.programs.find((p) => p.itemId === programId)?.name ?? "";
}

type Translate = (key: string, data?: Record<string, string>) => string;

function iceTargetLabel(
  target: NonNullable<EncounterView["iceHit"]>["target"],
  snapshot: CharacterSnapshot | null,
  t: Translate,
): string {
  switch (target.kind) {
    case "brain":
      return t("CNH.IceHit.TargetBrain", {
        hp: String(target.hpBase),
        reduction: String(target.reduction),
      });
    case "program":
      return t("CNH.IceHit.TargetProgram", {
        name: programName(snapshot, target.programId),
        rez: String(target.rezBase),
      });
    case "none":
      return t(`CNH.IceHit.None.${target.reason}`);
  }
}

function iceDamageLabel(
  result: NonNullable<EncounterView["lastIceDamage"]>,
  snapshot: CharacterSnapshot | null,
  t: Translate,
): string {
  switch (result.kind) {
    case "brain":
      return t("CNH.IceHit.LastBrain", {
        taken: String(result.taken),
        after: String(result.after),
      });
    case "program":
      return t(
        result.destroyed
          ? "CNH.IceHit.LastDestroyed"
          : result.after === 0
            ? "CNH.IceHit.LastNeutralized"
            : "CNH.IceHit.LastProgram",
        {
          name: programName(snapshot, result.programId),
          taken: String(result.taken),
          after: String(result.after),
        },
      );
    case "none":
      return t(`CNH.IceHit.None.${result.reason}`);
  }
}

function hasFx(fx: HudFx): boolean {
  return fx.banner !== null || fx.alert !== null || Object.keys(fx.nodes).length > 0;
}

function focusSelector(root: HTMLElement | null, active: Element | null): string | null {
  if (!root || !(active instanceof HTMLElement) || !root.contains(active)) return null;
  if (active instanceof HTMLSelectElement && active.name) return `select[name="${active.name}"]`;
  const parts = FOCUS_KEYS.flatMap((k) => {
    const value = active.dataset[k];
    if (value === undefined) return [];
    const attr = k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    return [`[data-${attr}="${CSS.escape(value)}"]`];
  });
  return parts.length > 0 ? parts.join("") : null;
}

function actorName(uuid: string): string {
  return (fromUuidSync(uuid) as { name?: string } | null)?.name ?? "?";
}

function npcProgramName(actorUuid: string, programId: string): string {
  return readCharacterSnapshot(actorUuid)?.programs.find((p) => p.itemId === programId)?.name ?? "";
}

const ENEMY_KEY = `${MODULE_ID}.enemyCollapsed`;

function readEnemyCollapsed(): boolean {
  try {
    return localStorage.getItem(ENEMY_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeEnemyCollapsed(collapsed: boolean): boolean {
  try {
    localStorage.setItem(ENEMY_KEY, collapsed ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}
