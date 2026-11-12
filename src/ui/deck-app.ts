import { MODULE_ID } from "../constants";
import {
  checkInstall,
  checkRez,
  checkUninstall,
  type DeckCheck,
  type DeckItem,
  type DeckLoadout,
  type DeckProgram,
  deckOf,
  equippedDeck,
  equipPlan,
  freeSlots,
  isEquipPlan,
  loosePrograms,
  rezPlan,
} from "../domain/deck-config";
import { netActionsPerTurn, REZZABLE_CLASSES } from "../domain/net-rules";
import { readCharacterSnapshot } from "../integrations/cpr/foundry-actor";
import {
  equipDeck,
  installProgram,
  listDeckActors,
  readDeckLoadout,
  setDeckProgramState,
  uninstallProgram,
} from "../integrations/cpr/foundry-deck";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const t = (key: string, data?: Record<string, string>) =>
  data ? game.i18n.format(key, data) : game.i18n.localize(key);

const CLASS_ICON: Record<string, string> = {
  booster: "fa-bolt",
  defender: "fa-shield-halved",
  antiprogramattacker: "fa-bug",
  antipersonnelattacker: "fa-hand-fist",
  blackice: "fa-skull",
};

export interface DeckAppHandlers {
  /** A Netrunner deste ator está conectada (Jack In) numa sessão ativa agora. */
  jackedIn(actorUuid: string): boolean;
}

type DragSource = { kind: "loose" | "installed"; programId: string };

/**
 * Cyberdeck da jogadora (E7-02, D43): configurar o deck antes do Jack In, no visual do HUD.
 * Lê e grava a ficha nativa (funções do CPR); nada vai ao estado público. Conectada numa
 * sessão, só leitura: rezzar passa a custar ação NET pelo HUD da sessão.
 */
export class DeckApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-deck`,
    classes: ["cnh-app"],
    window: {
      title: "CNH.Deck.WindowTitle",
      icon: "fa-solid fa-microchip",
      resizable: true,
    },
    position: { width: 880, height: 640 },
    actions: {
      selectDeck: DeckApp.#onSelectDeck,
      equipDeck: DeckApp.#onEquip,
      install: DeckApp.#onInstall,
      uninstall: DeckApp.#onUninstall,
      rez: DeckApp.#onRez,
      openSheet: DeckApp.#onOpenSheet,
    },
  };

  static PARTS = {
    deck: { template: `modules/${MODULE_ID}/templates/deck.hbs` },
  };

  readonly #handlers: DeckAppHandlers;
  #actorUuid: string | null = null;
  #deckId: string | null = null;
  #busy = false;
  #dragEndedAt = 0;

  constructor(handlers: DeckAppHandlers) {
    super();
    this.#handlers = handlers;
  }

  get actorUuid(): string | null {
    return this.#actorUuid;
  }

  /** Abre no ator pedido; sem ator, o personagem do usuário ou o primeiro com cyberdeck. */
  async open(actorUuid: string | null): Promise<void> {
    const choices = listDeckActors(game.user);
    const own = game.user?.character?.uuid;
    const uuid =
      actorUuid ??
      (own && choices.some((c) => c.uuid === own) ? own : null) ??
      this.#actorUuid ??
      choices[0]?.uuid ??
      null;
    if (!uuid) {
      ui.notifications.warn(t("CNH.Deck.NoActor"));
      return;
    }
    if (uuid !== this.#actorUuid) {
      this.#actorUuid = uuid;
      this.#deckId = null;
    }
    if (this.rendered) {
      this.bringToFront();
      await this.render();
    } else {
      await this.render(true);
    }
  }

  get #locked(): boolean {
    return this.#actorUuid !== null && this.#handlers.jackedIn(this.#actorUuid);
  }

  #loadout(): DeckLoadout | null {
    return this.#actorUuid ? readDeckLoadout(this.#actorUuid) : null;
  }

  /** Deck mostrado: o escolhido, senão o equipado, senão o primeiro. */
  #deck(loadout: DeckLoadout): DeckItem | null {
    return (
      loadout.decks.find((d) => d.itemId === this.#deckId) ??
      equippedDeck(loadout) ??
      loadout.decks[0] ??
      null
    );
  }

  protected override async _prepareContext(): Promise<Record<string, unknown>> {
    const uuid = this.#actorUuid;
    const loadout = this.#loadout();
    const snapshot = uuid ? readCharacterSnapshot(uuid) : null;
    const choices = listDeckActors(game.user);
    const locked = this.#locked;
    const disabled = locked || this.#busy;
    if (!loadout || !snapshot) {
      return { missing: true, actors: choices, hasActors: choices.length > 1 };
    }
    const deck = this.#deck(loadout);
    const rank = snapshot.netRole?.rank ?? 0;
    const reason = (check: DeckCheck) => (check.ok ? "" : t(`CNH.Deck.Error.${check.error}`));
    const withReason = (key: string, check: DeckCheck) => {
      const why = locked ? t("CNH.Deck.LockedShort") : reason(check);
      return why ? `${t(key)} — ${why}` : t(key);
    };

    const installed = deck
      ? deck.installed
          .map((id) => loadout.programs.find((p) => p.itemId === id))
          .filter((p): p is DeckProgram => p !== undefined)
      : [];
    const upgrades = deck ? loadout.upgrades.filter((u) => deck.installed.includes(u.itemId)) : [];

    const programView = (p: DeckProgram, inDeck: boolean) => {
      const running = p.rezzed || p.mark === "neutralized";
      const rezzable = REZZABLE_CLASSES.has(p.programClass);
      const rezCheck = rezzable ? checkRez(loadout, p.itemId, !running) : null;
      const attacker = p.programClass.endsWith("attacker");
      const state =
        p.mark === "destroyed"
          ? t("CNH.Program.Destroyed")
          : p.mark === "neutralized"
            ? t("CNH.Program.Neutralized")
            : attacker
              ? t("CNH.Program.Attacker")
              : t(p.rezzed ? "CNH.Hud.Rezzed" : "CNH.Hud.Derezzed");
      const installCheck = deck ? checkInstall(loadout, deck.itemId, p.itemId) : null;
      const uninstallCheck = deck ? checkUninstall(loadout, deck.itemId, p.itemId) : null;
      return {
        itemId: p.itemId,
        name: p.name,
        icon: CLASS_ICON[p.programClass] ?? "fa-code",
        stateLabel: state,
        kindLabel: p.programClass ? t(`CNH.ProgramClass.${p.programClass}`) : "",
        sizeLabel: t("CNH.Deck.Size", { size: String(p.size) }),
        isRezzed: p.rezzed && p.mark === "none",
        isAttacker: attacker,
        // LED do cartucho: ligado, neutralizado, destruído, atacante (pronto) ou desligado.
        led:
          p.mark === "destroyed"
            ? "dead"
            : p.mark === "neutralized"
              ? "warn"
              : attacker
                ? "ready"
                : p.rezzed
                  ? "on"
                  : "off",
        isNeutralized: p.mark === "neutralized",
        isDepleted: p.mark === "destroyed",
        rezLabel: p.rez.max > 0 ? `${p.rez.value}/${p.rez.max}` : "",
        percent: p.rez.max > 0 ? Math.round((p.rez.value / p.rez.max) * 100) : 0,
        statLabel: attacker ? `ATK ${p.atk}` : p.def > 0 ? `DEF ${p.def}` : "",
        draggable: !disabled,
        rezAction: inDeck &&
          rezCheck !== null && {
            rez: !running,
            label: t(running ? "CNH.Program.Derez" : "CNH.Program.Rez"),
            disabled: disabled || !rezCheck.ok,
            tip: withReason(running ? "CNH.Deck.Help.derez" : "CNH.Deck.Help.rez", rezCheck),
          },
        installAction: !inDeck &&
          installCheck !== null && {
            disabled: disabled || !installCheck.ok,
            tip: withReason("CNH.Deck.Help.install", installCheck),
          },
        uninstallAction: inDeck &&
          uninstallCheck !== null && {
            disabled: disabled || !uninstallCheck.ok,
            tip: withReason("CNH.Deck.Help.uninstall", uninstallCheck),
          },
      };
    };

    const loose = loosePrograms(loadout);
    // Programas em outro deck aparecem só nele (um programa fica em um deck por vez).
    const elsewhere = loadout.programs.filter((p) => {
      const where = deckOf(loadout, p.itemId);
      return where !== null && where.itemId !== deck?.itemId;
    });
    const free = deck ? freeSlots(deck) : 0;
    const equipped = equippedDeck(loadout);
    const equipCheck = deck ? equipPlan(loadout, deck.itemId) : null;
    const rezzedCount = loadout.programs.filter(
      (p) =>
        p.rezzed && REZZABLE_CLASSES.has(p.programClass) && equipped?.installed.includes(p.itemId),
    ).length;

    // Baias numeradas do deck: programas (um intervalo se ocupam mais de um slot), upgrades, slots
    // presos por item apagado (o sistema conta em usedSlots) e livres.
    const pad = (n: number) => String(n).padStart(2, "0");
    const bays: Array<Record<string, unknown>> = [];
    const segments: Array<{ kind: string; on: boolean }> = [];
    let next = 1;
    const take = (size: number, kind: string, on = false) => {
      const span = Math.max(1, size);
      const label = span > 1 ? `${pad(next)}–${pad(next + span - 1)}` : pad(next);
      for (let i = 0; i < span; i += 1) segments.push({ kind, on });
      next += span;
      return label;
    };
    for (const p of installed) {
      const view = programView(p, true);
      bays.push({ kind: "program", num: take(p.size, "program", view.led === "on"), card: view });
    }
    for (const u of upgrades) {
      bays.push({
        kind: "upgrade",
        num: take(u.size, "upgrade"),
        name: u.name,
        sizeLabel: t("CNH.Deck.Size", { size: String(u.size) }),
      });
    }
    if (deck) {
      const known = [...installed, ...upgrades].reduce((sum, i) => sum + Math.max(1, i.size), 0);
      const ghost = Math.max(0, deck.usedSlots - known);
      if (ghost > 0) bays.push({ kind: "ghost", ghost: true, num: take(ghost, "ghost") });
      for (let i = 0; i < free; i += 1)
        bays.push({ kind: "free", free: true, num: take(1, "free") });
    }

    return {
      missing: false,
      bays,
      segments,
      actorName: snapshot.actorName,
      actorUuid: uuid,
      actors: choices.map((c) => ({ ...c, selected: c.uuid === uuid })),
      hasActors: choices.length > 1,
      locked,
      busy: this.#busy,
      interface: snapshot.netRole
        ? { label: snapshot.netRole.abilityName || t("CNH.Hud.Interface"), rank }
        : null,
      netActions: netActionsPerTurn(rank),
      rezzedCount,
      decks: loadout.decks.map((d) => ({
        itemId: d.itemId,
        name: d.name,
        equipped: d.equipped,
        active: d.itemId === deck?.itemId,
        slotsLabel: `${d.usedSlots}/${d.slots}`,
      })),
      manyDecks: loadout.decks.length > 1,
      deck: deck && {
        itemId: deck.itemId,
        name: deck.name,
        equipped: deck.equipped,
        slotsLabel: `${deck.usedSlots}/${deck.slots}`,
        slotsPercent: deck.slots > 0 ? Math.round((deck.usedSlots / deck.slots) * 100) : 0,
        full: free === 0,
        equipAction: !deck.equipped && {
          disabled: disabled || (equipCheck !== null && !isEquipPlan(equipCheck)),
          tip: withReason("CNH.Deck.Help.equip", { ok: true }),
        },
      },
      noEquipped: equipped === null,
      multipleEquipped: loadout.decks.filter((d) => d.equipped).length > 1,
      installed: installed.map((p) => programView(p, true)),
      upgrades: upgrades.map((u) => ({
        name: u.name,
        sizeLabel: t("CNH.Deck.Size", { size: String(u.size) }),
      })),
      freeSlots: Array.from({ length: free }, (_, i) => i + 1),
      loose: loose.map((p) => programView(p, false)),
      elsewhere: elsewhere.map((p) => ({
        name: p.name,
        deckName: deckOf(loadout, p.itemId)?.name ?? "",
      })),
    };
  }

  protected override _onRender(
    context: Record<string, unknown>,
    options: Record<string, unknown>,
  ): void {
    super._onRender(context, options);
    this.element
      .querySelector<HTMLSelectElement>("select[name='deckActor']")
      ?.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value;
        if (value) void this.open(value);
      });
    if (!this.#locked) this.#bindDrag();
  }

  /**
   * Arrastar por ponteiro (como no editor de arquitetura): programa da ficha para o deck
   * instala; programa do deck para a lista da ficha desinstala.
   */
  #bindDrag(): void {
    const root = this.element;
    for (const el of root.querySelectorAll<HTMLElement>(".cnh-dk-card[data-program-id]")) {
      const source: DragSource = {
        kind: el.dataset["zone"] === "deck" ? "installed" : "loose",
        programId: el.dataset["programId"] ?? "",
      };
      el.addEventListener("pointerdown", (down) => {
        if (down.button !== 0 || this.#busy) return;
        if ((down.target as HTMLElement).closest("button")) return;
        let ghost: HTMLElement | null = null;
        let over: HTMLElement | null = null;
        const wanted = source.kind === "loose" ? "deck" : "loose";
        const targetAt = (x: number, y: number) =>
          document.elementFromPoint(x, y)?.closest<HTMLElement>(`[data-drop='${wanted}']`) ?? null;
        const move = (event: PointerEvent) => {
          const far = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 6;
          if (!ghost && !far) return;
          event.preventDefault();
          if (!ghost) {
            ghost = el.cloneNode(true) as HTMLElement;
            ghost.classList.add("cnh-ed-ghost");
            ghost.style.width = `${el.getBoundingClientRect().width}px`;
            root.querySelector(".cnh-deckapp")?.append(ghost);
            root.querySelector(".cnh-deckapp")?.classList.add("is-dragging", `drag-${source.kind}`);
            el.classList.add("is-drag-source");
          }
          // `.window-content` tem container query (contenção): é a referência do `fixed`.
          const frame = root.querySelector(".window-content")?.getBoundingClientRect();
          ghost.style.left = `${event.clientX - (frame?.left ?? 0) + 8}px`;
          ghost.style.top = `${event.clientY - (frame?.top ?? 0) + 8}px`;
          const target = targetAt(event.clientX, event.clientY);
          if (target === over) return;
          over?.classList.remove("is-drop-over");
          target?.classList.add("is-drop-over");
          over = target;
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          if (!ghost) return;
          ghost.remove();
          this.#dragEndedAt = Date.now();
          root
            .querySelector(".cnh-deckapp")
            ?.classList.remove("is-dragging", "drag-loose", "drag-installed");
          el.classList.remove("is-drag-source");
          over?.classList.remove("is-drop-over");
          if (!over) return;
          if (source.kind === "loose") void this.#install(source.programId);
          else void this.#uninstall(source.programId);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
    }
  }

  /** Executa uma gravação na ficha; recusa conectada, mostra o motivo e renderiza de novo. */
  async #run(check: DeckCheck, write: () => Promise<unknown>): Promise<void> {
    if (this.#busy) return;
    if (this.#locked) {
      ui.notifications.warn(t("CNH.Deck.Locked"));
      return;
    }
    if (!check.ok) {
      ui.notifications.warn(t(`CNH.Deck.Error.${check.error}`));
      return;
    }
    this.#busy = true;
    void this.render();
    try {
      await write();
    } catch (error) {
      console.error("cyberpunk-netrunner-hud | falha ao gravar o cyberdeck", error);
      ui.notifications.error(t("CNH.Deck.WriteFailed"));
    } finally {
      this.#busy = false;
      void this.render();
    }
  }

  async #install(programId: string): Promise<void> {
    const loadout = this.#loadout();
    const deck = loadout ? this.#deck(loadout) : null;
    if (!loadout || !deck || !this.#actorUuid) return;
    const uuid = this.#actorUuid;
    await this.#run(checkInstall(loadout, deck.itemId, programId), () =>
      installProgram(uuid, deck.itemId, programId),
    );
  }

  async #uninstall(programId: string): Promise<void> {
    const loadout = this.#loadout();
    const deck = loadout ? this.#deck(loadout) : null;
    if (!loadout || !deck || !this.#actorUuid) return;
    const uuid = this.#actorUuid;
    await this.#run(checkUninstall(loadout, deck.itemId, programId), () =>
      uninstallProgram(uuid, deck.itemId, programId),
    );
  }

  #justDragged(): boolean {
    return Date.now() - this.#dragEndedAt < 250;
  }

  static #onSelectDeck(this: DeckApp, _event: Event, target: HTMLElement): void {
    this.#deckId = target.dataset["deckId"] ?? null;
    void this.render();
  }

  static async #onEquip(this: DeckApp): Promise<void> {
    const loadout = this.#loadout();
    const deck = loadout ? this.#deck(loadout) : null;
    if (!loadout || !deck || !this.#actorUuid) return;
    const uuid = this.#actorUuid;
    const plan = equipPlan(loadout, deck.itemId);
    await this.#run(isEquipPlan(plan) ? { ok: true } : plan, async () => {
      if (isEquipPlan(plan)) await equipDeck(uuid, plan);
    });
  }

  static async #onInstall(this: DeckApp, _event: Event, target: HTMLElement): Promise<void> {
    if (this.#justDragged()) return;
    await this.#install(target.dataset["programId"] ?? "");
  }

  static async #onUninstall(this: DeckApp, _event: Event, target: HTMLElement): Promise<void> {
    if (this.#justDragged()) return;
    await this.#uninstall(target.dataset["programId"] ?? "");
  }

  static async #onRez(this: DeckApp, _event: Event, target: HTMLElement): Promise<void> {
    const loadout = this.#loadout();
    const programId = target.dataset["programId"] ?? "";
    const program = loadout?.programs.find((p) => p.itemId === programId);
    if (!loadout || !program || !this.#actorUuid) return;
    const uuid = this.#actorUuid;
    const rez = target.dataset["rez"] === "true";
    await this.#run(checkRez(loadout, programId, rez), () =>
      setDeckProgramState(uuid, programId, rezPlan(program, rez)),
    );
  }

  static #onOpenSheet(this: DeckApp): void {
    const actor = this.#actorUuid
      ? (fromUuidSync(this.#actorUuid) as { sheet?: { render(force: boolean): unknown } } | null)
      : null;
    actor?.sheet?.render(true);
  }
}
