import { type IceChoice, listWorldIce } from "../integrations/cpr/foundry-ice";
import { listWorldNetArchs, readNetArchitecture } from "../integrations/cpr/foundry-netarch";
import type { IceLink } from "../session/session-state";
import {
  type ActorOption,
  defaultController,
  missingIceLinks,
  startCandidates,
  suggestIce,
  type UserOption,
} from "../session/start-options";

/**
 * Diálogo do GM para iniciar a sessão (DialogV2, V12; E6-03): personagem (só de jogadores,
 * ou todos), controlador sugerido pelo dono, NetArch e um ator Black ICE por nó Black ICE.
 * "Iniciar" fica desabilitado até tudo estar escolhido.
 */
export interface StartSessionChoice {
  actorUuid: string;
  controllerUserId: string | null;
  netArch: { itemUuid: string; name: string } | null;
  ice: IceLink[];
}

interface IceNode {
  key: number;
  label: string;
  iceName: string;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function option(value: string, label: string, selected = false): string {
  return `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

const t = (key: string, data?: Record<string, string>) =>
  data ? game.i18n.format(key, data) : game.i18n.localize(key);

function readActors(users: readonly UserOption[]): ActorOption[] {
  const docs = game.users.contents;
  return game.actors.contents.map((a) => ({
    uuid: a.uuid,
    name: a.name,
    type: a.type,
    ownerIds: users
      .filter((u) => {
        const user = docs.find((d) => d.id === u.id);
        return user ? a.testUserPermission(user, "OWNER") : false;
      })
      .map((u) => u.id),
  }));
}

function iceNodesOf(archUuid: string): IceNode[] {
  const arch = archUuid ? readNetArchitecture(archUuid) : null;
  return (arch?.floors ?? [])
    .filter((f) => f.content === "blackice")
    .sort((a, b) => a.floor - b.floor || a.branch.localeCompare(b.branch))
    .map((f) => {
      const iceName = f.blackIceKey ? t(f.blackIceKey) : t("CNH.Content.blackice");
      const where = `${f.floor}${f.branch.toUpperCase()}`;
      return { key: f.key, iceName, label: t("CNH.Start.IceNode", { where, name: iceName }) };
    });
}

function iceLabel(ice: IceChoice): string {
  const s = ice.stats;
  const name = ice.builtin ? `${ice.name} ${t("CNH.Ice.BuiltinTag")}` : ice.name;
  return `${name} — PER ${s.per} · SPD ${s.spd} · ATK ${s.atk} · DEF ${s.def} · REZ ${s.rez.value}/${s.rez.max}`;
}

export async function promptStartSession(): Promise<StartSessionChoice | null> {
  const users: UserOption[] = game.users.contents.map((u) => ({ id: u.id, isGM: u.isGM }));
  const actors = readActors(users);
  const playerCandidates = startCandidates(actors, users, false);
  const allCandidates = startCandidates(actors, users, true);
  if (allCandidates.length === 0) {
    ui.notifications.warn(t("CNH.Session.NoActors"));
    return null;
  }
  // Sem personagens de jogadores, abre já mostrando todos.
  const startShowAll = playerCandidates.length === 0;
  const players = game.users.contents.filter((u) => !u.isGM);
  const netArchs = listWorldNetArchs();
  const iceActors = listWorldIce();

  const content = `
    <div class="cnh-start">
      <div class="form-group">
        <label>${escapeHtml(t("CNH.Session.Actor"))}</label>
        <select name="actorUuid"></select>
      </div>
      <div class="form-group">
        <label class="checkbox">
          <input type="checkbox" name="showAll" ${startShowAll ? "checked" : ""}>
          ${escapeHtml(t("CNH.Start.ShowAll"))}
        </label>
      </div>
      <div class="form-group">
        <label>${escapeHtml(t("CNH.Session.Controller"))}</label>
        <select name="controllerUserId">${[
          option("", t("CNH.Session.NoController")),
          ...players.map((u) => option(u.id, u.name)),
        ].join("")}</select>
      </div>
      <div class="form-group">
        <label>${escapeHtml(t("CNH.Session.NetArch"))}</label>
        <select name="netArchUuid">${[
          option("", t("CNH.Session.NoNetArch")),
          ...netArchs.map((a, i) => option(a.uuid, a.name, i === 0)),
        ].join("")}</select>
      </div>
      <fieldset class="cnh-start-ice">
        <legend>${escapeHtml(t("CNH.Start.IceLegend"))}</legend>
        <div data-ice-rows></div>
        <p class="hint" data-ice-hint></p>
      </fieldset>
    </div>`;

  const render = (_event: Event, element: HTMLElement) => {
    const form = element.querySelector("form") ?? element;
    const select = (name: string) =>
      form.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
    const actorSelect = select("actorUuid");
    const controllerSelect = select("controllerUserId");
    const archSelect = select("netArchUuid");
    const showAll = form.querySelector<HTMLInputElement>('input[name="showAll"]');
    const iceRows = form.querySelector<HTMLElement>("[data-ice-rows]");
    const iceHint = form.querySelector<HTMLElement>("[data-ice-hint]");
    const startButton = element.querySelector<HTMLButtonElement>('button[data-action="ok"]');
    if (!actorSelect || !controllerSelect || !archSelect || !showAll || !iceRows || !iceHint) {
      return;
    }

    const syncController = () => {
      const actor = actors.find((a) => a.uuid === actorSelect.value);
      controllerSelect.value = defaultController(actor, users) ?? "";
    };
    const fillActors = () => {
      const list = showAll.checked ? allCandidates : playerCandidates;
      const current = actorSelect.value;
      actorSelect.innerHTML = list
        .map((c) => option(c.uuid, c.playerOwned ? c.name : `${c.name} (NPC)`, c.uuid === current))
        .join("");
      syncController();
    };
    const iceSelects = () => [
      ...iceRows.querySelectorAll<HTMLSelectElement>("select[data-ice-key]"),
    ];
    const validate = () => {
      const chosen: Record<number, string> = {};
      for (const s of iceSelects()) chosen[Number(s.dataset["iceKey"])] = s.value;
      const keys = Object.keys(chosen).map(Number);
      const missing = missingIceLinks(keys, chosen);
      const values = Object.values(chosen).filter((v) => v !== "");
      const repeated = values.length !== new Set(values).size;
      const hints: string[] = [];
      if (keys.length > 0 && iceActors.length === 0) hints.push(t("CNH.Start.NoIceActors"));
      else if (missing.length > 0) hints.push(t("CNH.Start.IceMissing"));
      if (repeated) hints.push(t("CNH.Start.IceRepeated"));
      iceHint.textContent = hints.join(" ");
      if (startButton) startButton.disabled = actorSelect.value === "" || missing.length > 0;
    };
    const fillIce = () => {
      const nodes = iceNodesOf(archSelect.value);
      const used = new Set<string>();
      iceRows.innerHTML = nodes
        .map((node) => {
          const suggested = suggestIce(node.iceName, iceActors, used);
          if (suggested) used.add(suggested);
          const options = [
            option("", t("CNH.Start.IceChoose")),
            ...iceActors.map((a) => option(a.uuid, iceLabel(a), a.uuid === suggested)),
          ].join("");
          return `<div class="form-group">
            <label>${escapeHtml(node.label)}</label>
            <select name="ice-${node.key}" data-ice-key="${node.key}">${options}</select>
          </div>`;
        })
        .join("");
      iceRows.closest("fieldset")?.toggleAttribute("hidden", nodes.length === 0);
      for (const s of iceSelects()) s.addEventListener("change", validate);
      validate();
    };

    showAll.addEventListener("change", () => {
      fillActors();
      validate();
    });
    actorSelect.addEventListener("change", () => {
      syncController();
      validate();
    });
    archSelect.addEventListener("change", fillIce);
    fillActors();
    fillIce();
  };

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: "CNH.Session.StartTitle", icon: "fa-solid fa-terminal" },
    position: { width: 560 },
    content,
    rejectClose: false,
    render,
    ok: {
      label: "CNH.Session.Start",
      icon: "fa-solid fa-plug",
      callback: (_event: Event, button: HTMLButtonElement) => {
        const form = button.form;
        if (!form) return null;
        const read = (name: string) =>
          form.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? "";
        const actorUuid = read("actorUuid");
        if (!actorUuid) return null;
        const archUuid = read("netArchUuid");
        const arch = archUuid ? netArchs.find((a) => a.uuid === archUuid) : undefined;
        const ice = [...form.querySelectorAll<HTMLSelectElement>("select[data-ice-key]")]
          .filter((s) => s.value !== "")
          .map((s) => ({ key: Number(s.dataset["iceKey"]), actorUuid: s.value }));
        return {
          actorUuid,
          controllerUserId: read("controllerUserId") || null,
          netArch: arch ? { itemUuid: arch.uuid, name: arch.name } : null,
          ice: arch ? ice : [],
        };
      },
    },
  });
  return isChoice(result) ? result : null;
}

function isChoice(value: unknown): value is StartSessionChoice {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["actorUuid"] === "string" &&
    (v["controllerUserId"] === null || typeof v["controllerUserId"] === "string") &&
    (v["netArch"] === null || typeof v["netArch"] === "object") &&
    Array.isArray(v["ice"])
  );
}
