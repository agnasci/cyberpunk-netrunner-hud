import { MODULE_ID } from "../constants";
import {
  type ArchDraft,
  type DraftNode,
  type DraftResult,
  draftIssues,
  DV_CHOICES,
  editorGrid,
  lockConflicts,
  moveNode,
  type NodePatch,
  patchNode,
  parseDraft,
  placeNode,
  reachableKeys,
  removeNode,
  toFloor,
} from "../domain/arch-draft";
import { FLOOR_CONTENTS, type NetFloorContent } from "../domain/net-architecture";
import { ensureIceActor, listWorldIce } from "../integrations/cpr/foundry-ice";
import {
  listWorldNetArchs,
  readLinkFlag,
  readNetArchitecture,
  saveNetArch,
} from "../integrations/cpr/foundry-netarch";
import { listWorldNetrunners, readActorName } from "../integrations/cpr/foundry-npc";
import { BLACK_ICE_KEYS } from "../integrations/cpr/netarch-adapter";
import { linksBetween } from "../session/architecture-view";
import { suggestIce } from "../session/start-options";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CONTENT_ICON: Record<NetFloorContent, string> = {
  password: "fa-key",
  file: "fa-file-code",
  controlnode: "fa-microchip",
  blackice: "fa-skull",
};

const t = (key: string, data?: Record<string, string>) =>
  data ? game.i18n.format(key, data) : game.i18n.localize(key);

const where = (n: { floor: number; branch: string }) =>
  t("CNH.Editor.Where", { floor: String(n.floor), branch: n.branch.toUpperCase() });

export interface ArchEditorHandlers {
  inUse(itemUuid: string): boolean;
}

const DRAFTS_KEY = `${MODULE_ID}.archDrafts`;
type StoredDrafts = Record<string, { draft: unknown; at: number }>;

function readStored(): StoredDrafts {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "{}");
    return typeof raw === "object" && raw !== null ? (raw as StoredDrafts) : {};
  } catch {
    return {};
  }
}

function writeStored(slot: string, draft: ArchDraft | null): void {
  try {
    const rest = Object.fromEntries(Object.entries(readStored()).filter(([k]) => k !== slot));
    const all: StoredDrafts = draft ? { ...rest, [slot]: { draft, at: Date.now() } } : rest;
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
  } catch (error) {
    console.warn(`${MODULE_ID} | rascunho não guardado`, error);
  }
}

function loadStored(slot: string): { draft: ArchDraft; at: number } | null {
  const entry = readStored()[slot];
  const draft = entry ? parseDraft(entry.draft) : null;
  return draft && entry ? { draft, at: Number(entry.at) || 0 } : null;
}

type DragSource = { kind: "tile"; content: NetFloorContent } | { kind: "node"; key: number };

export class ArchEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-arch-editor`,
    classes: ["cnh-app"],
    window: {
      title: "CNH.Editor.WindowTitle",
      icon: "fa-solid fa-diagram-project",
      resizable: true,
    },
    position: { width: 1080, height: 680 },
    actions: {
      armTile: ArchEditorApp.#onArmTile,
      placeArmed: ArchEditorApp.#onPlaceArmed,
      selectNode: ArchEditorApp.#onSelectNode,
      removeNode: ArchEditorApp.#onRemoveNode,
      setDv: ArchEditorApp.#onSetDv,
      saveArch: ArchEditorApp.#onSave,
      discardDraft: ArchEditorApp.#onDiscardDraft,
    },
  };

  static PARTS = {
    editor: { template: `modules/${MODULE_ID}/templates/arch-editor.hbs` },
  };

  readonly #handlers: ArchEditorHandlers;
  #itemUuid: string | null = null;
  #draft: ArchDraft = { name: "", nodes: [] };
  #locked = new Set<number>();
  #restoredAt: number | null = null;
  #selected: number | null = null;
  #armed: NetFloorContent | null = null;
  #dirty = false;
  #saving = false;
  #dragEndedAt = 0;
  #scroll = { top: 0, left: 0 };

  constructor(handlers: ArchEditorHandlers) {
    super();
    this.#handlers = handlers;
  }

  async open(itemUuid: string | null): Promise<void> {
    if (!game.user?.isGM) {
      ui.notifications.warn(t("CNH.Editor.GmOnly"));
      return;
    }
    if (this.rendered && itemUuid === this.#itemUuid) {
      this.bringToFront();
      return;
    }
    this.#load(itemUuid);
    if (this.rendered) {
      this.bringToFront();
      await this.render();
    } else {
      await this.render(true);
    }
  }

  #load(itemUuid: string | null): void {
    const arch = itemUuid ? readNetArchitecture(itemUuid) : null;
    this.#itemUuid = arch ? itemUuid : null;
    this.#selected = null;
    this.#armed = null;
    this.#dirty = false;
    this.#restoredAt = null;
    if (itemUuid && !arch) writeStored(itemUuid, null);
    const stored = loadStored(this.#slot);
    if (stored) {
      this.#draft = stored.draft;
      this.#dirty = true;
      this.#restoredAt = stored.at;
      return;
    }
    this.#draft = this.#savedDraft();
  }

  get #slot(): string {
    return this.#itemUuid ?? "new";
  }

  #savedDraft(): ArchDraft {
    const itemUuid = this.#itemUuid;
    const arch = itemUuid ? readNetArchitecture(itemUuid) : null;
    if (!arch || !itemUuid) return { name: t("CNH.Editor.DefaultName"), nodes: [] };
    const ice = readLinkFlag(itemUuid, "ice");
    const npcs = readLinkFlag(itemUuid, "npcs");
    return {
      name: arch.name,
      nodes: arch.floors.map((f) => ({
        ...f,
        iceActor: f.content === "blackice" ? (ice[f.key] ?? null) : null,
        npcActor: f.content !== "blackice" ? (npcs[f.key] ?? null) : null,
      })),
    };
  }

  #refreshLocks(): void {
    const uuid = this.#itemUuid;
    this.#locked =
      uuid && this.#handlers.inUse(uuid)
        ? new Set((readNetArchitecture(uuid)?.floors ?? []).map((f) => f.key))
        : new Set();
  }

  #markDirty(): void {
    this.#dirty = true;
    writeStored(this.#slot, this.#draft);
  }

  #apply(result: DraftResult, select: boolean): boolean {
    if (!result.ok) {
      if (result.error === "locked") ui.notifications.warn(t("CNH.Editor.Locked"));
      return false;
    }
    this.#draft = result.draft;
    this.#markDirty();
    if (select) this.#selected = result.key;
    void this.render();
    return true;
  }

  protected override async _prepareContext(): Promise<Record<string, unknown>> {
    this.#refreshLocks();
    const draft = this.#draft;
    const grid = editorGrid(draft);
    const reachable = reachableKeys(draft.nodes);
    const hasRoot = draft.nodes.some((n) => n.floor === 1 && n.branch === "a");
    const iceChoices = listWorldIce();
    const npcChoices = listWorldNetrunners("");
    const nameOf = (uuid: string | null, list: ReadonlyArray<{ uuid: string; name: string }>) =>
      uuid ? (list.find((c) => c.uuid === uuid)?.name ?? readActorName(uuid) ?? "?") : "";
    const known = draft.nodes;

    const rows = grid.rows.map((row, i) => ({
      floorLabel: String(row.floor).padStart(2, "0"),
      linksAbove:
        i === 0
          ? []
          : linksBetween(
              grid.rows[i - 1]?.cells.map((c) => c.node) ?? [],
              row.cells.map((c) => c.node),
              known,
            ),
      cells: row.cells.map((cell) => ({
        floor: cell.floor,
        branch: cell.branch,
        label: t("CNH.Editor.Place", {
          floor: String(cell.floor),
          branch: cell.branch.toUpperCase(),
        }),
        node: cell.node
          ? this.#nodeView(cell.node, reachable, hasRoot, iceChoices, npcChoices, nameOf)
          : null,
      })),
    }));

    const selectedNode = draft.nodes.find((n) => n.key === this.#selected) ?? null;
    return {
      name: draft.name,
      itemUuid: this.#itemUuid,
      archs: listWorldNetArchs().map((a) => ({ ...a, selected: a.uuid === this.#itemUuid })),
      dirty: this.#dirty,
      restored: this.#restoredAt
        ? t("CNH.Editor.Restored", { time: new Date(this.#restoredAt).toLocaleString() })
        : "",
      saving: this.#saving,
      inUse: this.#locked.size > 0,
      palette: FLOOR_CONTENTS.map((content) => ({
        content,
        icon: CONTENT_ICON[content],
        label: t(`CNH.Content.${content}`),
        armed: this.#armed === content,
      })),
      armedLabel: this.#armed
        ? t("CNH.Editor.Armed", { type: t(`CNH.Content.${this.#armed}`) })
        : "",
      grid: { columns: grid.columns.map((c) => c.toUpperCase()), rows },
      selected: selectedNode ? this.#configView(selectedNode, iceChoices, npcChoices) : null,
      issues: draftIssues(draft).map((issue) => {
        const node = "key" in issue ? draft.nodes.find((n) => n.key === issue.key) : undefined;
        return t(`CNH.Editor.Issue.${issue.code}`, { where: node ? where(node) : "" });
      }),
    };
  }

  #nodeView(
    node: DraftNode,
    reachable: ReadonlySet<number>,
    hasRoot: boolean,
    iceChoices: ReadonlyArray<{ uuid: string; name: string }>,
    npcChoices: ReadonlyArray<{ uuid: string; name: string }>,
    nameOf: (uuid: string | null, list: ReadonlyArray<{ uuid: string; name: string }>) => string,
  ): Record<string, unknown> {
    const warn =
      (hasRoot && !reachable.has(node.key)) ||
      (node.content === "blackice" && node.blackIceKey === null);
    const iceName = nameOf(node.iceActor, iceChoices);
    const npcName = nameOf(node.npcActor, npcChoices);
    return {
      key: node.key,
      content: node.content,
      icon: CONTENT_ICON[node.content],
      typeLabel: t(`CNH.Content.${node.content}`),
      iceLabel: node.blackIceKey ? t(node.blackIceKey) : "",
      dvLabel: node.dv !== null ? `DV ${node.dv}` : "",
      description: node.description,
      selected: node.key === this.#selected,
      locked: this.#locked.has(node.key),
      warn,
      linkIcon: npcName ? "fa-user-ninja" : iceName ? "fa-link" : "",
      linkName: npcName || iceName,
      tip: this.#locked.has(node.key) ? t("CNH.Editor.Locked") : "",
    };
  }

  #configView(
    node: DraftNode,
    iceChoices: ReadonlyArray<{ uuid: string; name: string; builtin?: boolean }>,
    npcChoices: ReadonlyArray<{ uuid: string; name: string }>,
  ): Record<string, unknown> {
    const usedIce = new Set(
      this.#draft.nodes.filter((n) => n.key !== node.key).map((n) => n.iceActor),
    );
    const usedNpc = new Set(
      this.#draft.nodes.filter((n) => n.key !== node.key).map((n) => n.npcActor),
    );
    return {
      where: where(node),
      content: node.content,
      isIce: node.content === "blackice",
      locked: this.#locked.has(node.key),
      types: FLOOR_CONTENTS.map((c) => ({
        value: c,
        label: t(`CNH.Content.${c}`),
        selected: c === node.content,
      })),
      iceTypes: BLACK_ICE_KEYS.map((key) => ({
        value: key,
        label: t(key),
        selected: key === node.blackIceKey,
      })).sort((a, b) => a.label.localeCompare(b.label)),
      iceActors: iceChoices
        .filter((c) => !usedIce.has(c.uuid))
        .map((c) => ({
          value: c.uuid,
          label: c.builtin ? `${c.name} ${t("CNH.Ice.BuiltinTag")}` : c.name,
          selected: c.uuid === node.iceActor,
        })),
      npcs: [
        ...(node.npcActor && !npcChoices.some((c) => c.uuid === node.npcActor)
          ? [{ uuid: node.npcActor, name: readActorName(node.npcActor) ?? "?" }]
          : []),
        ...npcChoices.filter((c) => !usedNpc.has(c.uuid)),
      ].map((c) => ({ value: c.uuid, label: c.name, selected: c.uuid === node.npcActor })),
      dvs: [
        { value: "", label: "N/A", selected: node.dv === null },
        ...DV_CHOICES.map((dv) => ({
          value: String(dv),
          label: String(dv),
          selected: dv === node.dv,
        })),
      ],
      description: node.description,
    };
  }

  protected override _onRender(
    context: Record<string, unknown>,
    options: Record<string, unknown>,
  ): void {
    super._onRender(context, options);
    const root = this.element;
    const wrap = root.querySelector<HTMLElement>(".cnh-ed-grid-wrap");
    if (wrap) {
      wrap.scrollTop = this.#scroll.top;
      wrap.scrollLeft = this.#scroll.left;
      wrap.addEventListener("scroll", () => {
        this.#scroll = { top: wrap.scrollTop, left: wrap.scrollLeft };
      });
    }
    const nameInput = root.querySelector<HTMLInputElement>("input[name='archName']");
    nameInput?.addEventListener("input", () => {
      this.#draft = { ...this.#draft, name: nameInput.value };
      this.#markDirty();
    });
    nameInput?.addEventListener("change", () => void this.render());
    root
      .querySelector<HTMLSelectElement>("select[name='archSelect']")
      ?.addEventListener("change", (event) => {
        const select = event.currentTarget as HTMLSelectElement;
        const value = select.value || null;
        void this.open(value).then(() => {
          select.value = this.#itemUuid ?? "";
        });
      });
    for (const field of root.querySelectorAll<HTMLSelectElement | HTMLTextAreaElement>(
      ".cnh-ed-config [data-field]",
    )) {
      field.addEventListener("change", () =>
        this.#onField(field.dataset["field"] ?? "", field.value),
      );
    }
    this.#bindDrag();
  }

  #onField(field: string, value: string): void {
    const key = this.#selected;
    if (key === null) return;
    const node = this.#draft.nodes.find((n) => n.key === key);
    if (!node) return;
    let patch: NodePatch;
    switch (field) {
      case "content":
        if (!(FLOOR_CONTENTS as readonly string[]).includes(value)) return;
        patch = { content: value as NetFloorContent };
        break;
      case "blackIceKey": {
        const iceKey = BLACK_ICE_KEYS.includes(value) ? value : null;
        patch = { blackIceKey: iceKey };
        if (iceKey && node.iceActor === null) {
          const used = new Set(
            this.#draft.nodes.map((n) => n.iceActor).filter((u): u is string => u !== null),
          );
          patch.iceActor = suggestIce(t(iceKey), listWorldIce(), used);
        }
        break;
      }
      case "iceActor":
        patch = { iceActor: value || null };
        break;
      case "npcActor":
        patch = { npcActor: value || null };
        break;
      case "description":
        patch = { description: value };
        break;
      default:
        return;
    }
    this.#apply(patchNode(this.#draft, key, patch, this.#locked), false);
  }

  #bindDrag(): void {
    const root = this.element;
    const sources: Array<[HTMLElement, DragSource]> = [];
    for (const tile of root.querySelectorAll<HTMLElement>(".cnh-ed-tile[data-content]")) {
      sources.push([tile, { kind: "tile", content: tile.dataset["content"] as NetFloorContent }]);
    }
    for (const node of root.querySelectorAll<HTMLElement>(".cnh-ed-node[data-key]")) {
      const key = Number(node.dataset["key"]);
      if (!this.#locked.has(key)) sources.push([node, { kind: "node", key }]);
    }
    for (const [el, source] of sources) {
      el.addEventListener("pointerdown", (down) => {
        if (down.button !== 0 || this.#saving) return;
        let ghost: HTMLElement | null = null;
        let over: HTMLElement | null = null;
        const targetAt = (x: number, y: number): HTMLElement | null => {
          const hit = document.elementFromPoint(x, y);
          const trash = hit?.closest<HTMLElement>("[data-drop='trash']");
          if (trash && source.kind === "node") return trash;
          return hit?.closest<HTMLElement>(".cnh-ed-cell[data-floor]") ?? null;
        };
        const move = (event: PointerEvent) => {
          const far = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 6;
          if (!ghost && !far) return;
          event.preventDefault();
          if (!ghost) {
            ghost = el.cloneNode(true) as HTMLElement;
            ghost.classList.add("cnh-ed-ghost");
            ghost.style.width = `${el.getBoundingClientRect().width}px`;
            root.querySelector(".cnh-editor")?.append(ghost);
            root.querySelector(".cnh-editor")?.classList.add("is-dragging");
            el.classList.add("is-drag-source");
          }
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
          root.querySelector(".cnh-editor")?.classList.remove("is-dragging");
          el.classList.remove("is-drag-source");
          over?.classList.remove("is-drop-over");
          if (over) this.#drop(source, over);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
    }
  }

  #drop(source: DragSource, target: HTMLElement): void {
    if (target.dataset["drop"] === "trash") {
      if (source.kind !== "node") return;
      if (this.#selected === source.key) this.#selected = null;
      this.#apply(removeNode(this.#draft, source.key, this.#locked), false);
      return;
    }
    const floor = Number(target.dataset["floor"]);
    const branch = target.dataset["branch"] ?? "";
    if (source.kind === "tile") {
      this.#armed = null;
      this.#apply(placeNode(this.#draft, source.content, floor, branch), true);
    } else {
      this.#apply(moveNode(this.#draft, source.key, floor, branch, this.#locked), true);
    }
  }

  #justDragged(): boolean {
    return Date.now() - this.#dragEndedAt < 250;
  }

  static #onArmTile(this: ArchEditorApp, _event: Event, target: HTMLElement): void {
    if (this.#justDragged()) return;
    const content = target.dataset["content"] as NetFloorContent;
    this.#armed = this.#armed === content ? null : content;
    void this.render();
  }

  static #onPlaceArmed(this: ArchEditorApp, _event: Event, target: HTMLElement): void {
    if (this.#justDragged() || !this.#armed) return;
    const content = this.#armed;
    this.#armed = null;
    this.#apply(
      placeNode(
        this.#draft,
        content,
        Number(target.dataset["floor"]),
        target.dataset["branch"] ?? "",
      ),
      true,
    );
  }

  static #onSelectNode(this: ArchEditorApp, _event: Event, target: HTMLElement): void {
    if (this.#justDragged()) return;
    const key = Number(target.dataset["key"]);
    this.#selected = this.#selected === key ? null : key;
    void this.render();
  }

  static #onRemoveNode(this: ArchEditorApp): void {
    const key = this.#selected;
    if (key === null) return;
    if (this.#apply(removeNode(this.#draft, key, this.#locked), false)) this.#selected = null;
  }

  static #onSetDv(this: ArchEditorApp, _event: Event, target: HTMLElement): void {
    const key = this.#selected;
    if (key === null) return;
    const raw = target.dataset["dv"] ?? "";
    this.#apply(
      patchNode(this.#draft, key, { dv: raw === "" ? null : Number(raw) }, this.#locked),
      false,
    );
  }

  static async #onSave(this: ArchEditorApp): Promise<void> {
    if (this.#saving || !game.user?.isGM) return;
    this.#refreshLocks();
    const saved = this.#itemUuid ? (readNetArchitecture(this.#itemUuid)?.floors ?? []) : [];
    const conflicts = lockConflicts(this.#draft, saved, this.#locked);
    if (conflicts.length > 0) {
      const list = saved.filter((f) => conflicts.includes(f.key)).map(where);
      ui.notifications.warn(t("CNH.Editor.LockedConflict", { nodes: list.join(", ") }));
      void this.render();
      return;
    }
    const slot = this.#slot;
    this.#saving = true;
    await this.render();
    try {
      const ice: Record<number, string> = {};
      const npcs: Record<number, string> = {};
      const live =
        this.#itemUuid && this.#locked.size > 0 ? readLinkFlag(this.#itemUuid, "npcs") : {};
      const nodes: DraftNode[] = [];
      for (const node of this.#draft.nodes) {
        const iceActor = node.iceActor ? await ensureIceActor(node.iceActor) : null;
        const npcActor = this.#locked.has(node.key) ? (live[node.key] ?? null) : node.npcActor;
        if (iceActor) ice[node.key] = iceActor;
        if (npcActor) npcs[node.key] = npcActor;
        nodes.push({ ...node, iceActor, npcActor });
      }
      const name = this.#draft.name.trim() || t("CNH.Editor.DefaultName");
      const floors = nodes.map(toFloor);
      this.#itemUuid = await saveNetArch(this.#itemUuid, { name, floors, ice, npcs });
      this.#draft = { name, nodes };
      this.#dirty = false;
      this.#restoredAt = null;
      writeStored(slot, null);
      writeStored(this.#slot, null);
      ui.notifications.info(t("CNH.Editor.Saved", { name }));
    } catch (error) {
      console.error(`${MODULE_ID} | falha ao salvar a arquitetura`, error);
      ui.notifications.error(t("CNH.Editor.SaveFailed"));
    } finally {
      this.#saving = false;
      void this.render();
    }
  }

  static #onDiscardDraft(this: ArchEditorApp): void {
    writeStored(this.#slot, null);
    this.#draft = this.#savedDraft();
    this.#dirty = false;
    this.#restoredAt = null;
    this.#selected = null;
    void this.render();
  }
}
