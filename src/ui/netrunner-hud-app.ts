import { MODULE_ID } from "../constants";
import {
  applyDemoAction,
  createDemoState,
  DEMO_ACTIONS,
  type DemoAction,
  type DemoEventKind,
  type DemoState,
  type FloorContent,
} from "../prototype/demo-state";
import { buildHudView, type HudView, type ViewerRole } from "../prototype/view-model";

const ROLES: readonly ViewerRole[] = ["gm", "netrunner", "spectator"];

const CONTENT_ICON: Record<FloorContent, string> = {
  password: "fa-key",
  file: "fa-file-code",
  controlnode: "fa-microchip",
  blackice: "fa-skull",
};

const ACTION_ICON: Record<DemoAction, string> = {
  jackIn: "fa-plug",
  pathfinder: "fa-satellite-dish",
  advance: "fa-angles-down",
  backdoor: "fa-door-open",
  zap: "fa-bolt",
  control: "fa-gamepad",
  newTurn: "fa-rotate",
  jackOut: "fa-plug-circle-xmark",
};

const BANNER_EVENTS: ReadonlySet<DemoEventKind> = new Set([
  "jack-in",
  "ice-alert",
  "breach",
  "fail",
  "denied",
  "derez",
  "control",
  "jack-out",
]);

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NetrunnerHudPrototype extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-prototype`,
    classes: ["cnh-app"],
    window: {
      title: "CNH.Prototype.WindowTitle",
      icon: "fa-solid fa-terminal",
      resizable: true,
    },
    position: { width: 1040, height: 700 },
    actions: {
      demo: NetrunnerHudPrototype.#onDemo,
      setRole: NetrunnerHudPrototype.#onSetRole,
      toggleMotion: NetrunnerHudPrototype.#onToggleMotion,
    },
  };

  static PARTS = {
    hud: { template: `modules/${MODULE_ID}/templates/netrunner-hud.hbs` },
  };

  #state: DemoState = createDemoState();
  #role: ViewerRole = "netrunner";
  #reducedMotion = false;
  #animatedEventId = 0;
  #booting = true;

  protected override async _prepareContext(): Promise<Record<string, unknown>> {
    const booting = this.#booting;
    this.#booting = false;
    const view = buildHudView(this.#state, this.#role);
    const event = view.lastEvent;
    const isNewEvent = event !== null && event.id > this.#animatedEventId;
    if (event) this.#animatedEventId = event.id;
    const fxFloor = isNewEvent ? event.floorIndex : null;
    const eventKind = isNewEvent ? event.kind : "";
    const t = (key: string, data?: Record<string, string>) =>
      data ? game.i18n.format(key, data) : game.i18n.localize(key);

    return {
      view,
      booting,
      reducedMotion: this.#reducedMotion,
      eventKind,
      banner:
        isNewEvent && BANNER_EVENTS.has(event.kind) ? t(`CNH.Prototype.Banner.${event.kind}`) : "",
      floorCount: String(view.floors.length).padStart(2, "0"),
      gmOnlyLabel: t("CNH.Hud.GmOnly"),
      netActionsLabel: t("CNH.Hud.NetActionsLabel", {
        left: String(view.netActions.max - view.netActions.used),
        max: String(view.netActions.max),
      }),
      roles: ROLES.map((id) => ({ id, label: t(`CNH.Role.${id}`), active: id === this.#role })),
      floors: view.floors.map((floor) => ({
        ...floor,
        floorLabel: String(floor.floor).padStart(2, "0"),
        icon: floor.state === "known" ? CONTENT_ICON[floor.content] : "fa-question",
        typeLabel: t(
          floor.state === "known" ? `CNH.Content.${floor.content}` : "CNH.Content.unknown",
        ),
        dvLabel: floor.state === "known" && floor.dv !== null ? `DV ${floor.dv}` : "",
        icePercent:
          floor.state === "known" && floor.iceRez
            ? percent(floor.iceRez.value, floor.iceRez.max)
            : 0,
        fxClass: fxFloor === floor.index ? `cnh-fx--${eventKind}` : "",
      })),
      programs: view.programs.map((program) => ({
        ...program,
        stateLabel: t(program.rezzed ? "CNH.Hud.Rezzed" : "CNH.Hud.Derezzed"),
        kindLabel: "stats" in program ? t(`CNH.ProgramKind.${program.stats.kind}`) : "",
        percent: "stats" in program ? percent(program.stats.rez, program.stats.rezMax) : 0,
      })),
      log: view.log.map((entry) => ({
        ...entry,
        text: t(`CNH.Prototype.Log.${entry.key}`, entry.data),
      })),
      actions: view.actions.map((action) => ({
        ...action,
        icon: ACTION_ICON[action.id],
        label: t(`CNH.Action.${action.id}`),
      })),
    } satisfies Record<string, unknown> & { view: HudView };
  }

  protected override _onClose(options: Record<string, unknown>): void {
    super._onClose(options);
    this.#booting = true;
  }

  static #onDemo(this: NetrunnerHudPrototype, _event: Event, target: HTMLElement): void {
    const action = target.dataset["demoAction"];
    if (!isDemoAction(action)) return;
    this.#state = applyDemoAction(this.#state, action);
    void this.render();
  }

  static #onSetRole(this: NetrunnerHudPrototype, _event: Event, target: HTMLElement): void {
    const role = target.dataset["role"];
    if (!ROLES.includes(role as ViewerRole)) return;
    this.#role = role as ViewerRole;
    void this.render();
  }

  static #onToggleMotion(this: NetrunnerHudPrototype): void {
    this.#reducedMotion = !this.#reducedMotion;
    void this.render();
  }
}

function percent(value: number, max: number): number {
  return max <= 0 ? 0 : Math.round((value / max) * 100);
}

function isDemoAction(value: string | undefined): value is DemoAction {
  return (DEMO_ACTIONS as readonly string[]).includes(value ?? "");
}
