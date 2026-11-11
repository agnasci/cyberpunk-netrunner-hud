import type { CharacterSnapshot } from "../domain/character";
import type { LogEntry } from "../session/log-entry";
import type { PublicSession } from "../session/session-state";

/**
 * Texto do registro de eventos (E6-09, D34), no estilo de um terminal do cyberdeck: um
 * "comando" fixo (sabor, sem tradução) e uma mensagem em linguagem simples, traduzida.
 * Cada cliente monta as linhas com o que já vê: nós descobertos e programas da ficha.
 */
type Translate = (key: string, data?: Record<string, string>) => string;

export type LogTone = "ok" | "fail" | "dmg" | "warn" | "info";

export interface LogLine {
  seq: number;
  turn: number;
  tone: LogTone;
  /** Comando simulado, ex.: `zap.exe --target 2a`. */
  cmd: string;
  /** Mensagem legível para quem não é técnico. */
  msg: string;
  /** Selo de status, ex.: `OK`; vazio quando é só informação. */
  status: string;
}

const STATUS: Record<LogTone, string> = {
  ok: "OK",
  fail: "FAIL",
  dmg: "DMG",
  warn: "WARN",
  info: "",
};
const HITS = new Set(["zap", "programAttack", "iceAttack", "slide", "npcAttack", "ambush"]);
const EXE: Record<string, string> = {
  backdoor: "backdoor.exe",
  control: "control.exe",
  eyedee: "eyedee.exe",
  zap: "zap.exe",
  slide: "slide.exe",
  iceAttack: "ice.attack",
  pathfinder: "pathfinder.exe",
  cloak: "cloak.exe",
  virus: "virus.exe",
  ambush: "ice.ambush",
};

/** Nome curto para o comando: minúsculas, sem espaços. */
function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 24) || "prog"
  );
}

/** Linhas em ordem de terminal: a mais antiga em cima, a mais nova embaixo. */
export function logLines(
  session: PublicSession,
  snapshot: CharacterSnapshot | null,
  t: Translate,
): LogLine[] {
  const nodeOf = (key: unknown) => session.netArch?.discovered.find((f) => f.key === key) ?? null;
  const ctx: LineContext = {
    t,
    code: (key) => {
      const node = nodeOf(key);
      return node ? `${node.floor}${node.branch}` : "??";
    },
    node: (key) => {
      const node = nodeOf(key);
      if (!node) return t("CNH.Log.HiddenNode");
      const name =
        node.content === "blackice" && node.blackIceKey
          ? t(node.blackIceKey)
          : t(`CNH.Content.${node.content}`);
      return `${node.floor}${node.branch} ${name}`;
    },
    program: (id) => snapshot?.programs.find((p) => p.itemId === id)?.name ?? t("CNH.Log.Program"),
  };
  return session.log.map((entry) => line(entry, ctx));
}

interface LineContext {
  t: Translate;
  /** Código do nó para o comando, ex.: `2a`. */
  code(key: unknown): string;
  /** Nó por extenso para a mensagem. */
  node(key: unknown): string;
  program(id: unknown): string;
}

function line(entry: LogEntry, c: LineContext): LogLine {
  const { t } = c;
  const d = entry.data;
  const str = (v: unknown) => String(v ?? "");
  let tone: LogTone = "info";
  let cmd: string;
  let msg: string;
  switch (entry.event) {
    case "jackIn":
      cmd = `jack_in --node ${c.code(d["key"])}`;
      msg = t("CNH.Log.JackIn", { node: c.node(d["key"]) });
      tone = "ok";
      break;
    case "jackOut":
      cmd = "jack_out";
      msg = t("CNH.Log.JackOut");
      tone = "ok";
      break;
    case "move":
      cmd = `cd /net/${c.code(d["key"])}`;
      msg = t("CNH.Log.Move", { node: c.node(d["key"]) });
      break;
    case "reveal":
      cmd = `scan --node ${c.code(d["key"])}`;
      msg =
        d["masked"] === true
          ? t("CNH.Log.Mapped")
          : t("CNH.Log.Reveal", { node: c.node(d["key"]) });
      break;
    case "ambush":
      cmd = `ice.ambush --node ${c.code(d["key"])}`;
      msg = t("CNH.Log.Ambush", { node: c.node(d["key"]) });
      tone = "warn";
      break;
    case "iceTarget":
      cmd = `ice.target --prog ${slug(c.program(d["programId"]))}`;
      msg = t("CNH.Log.IceTarget", { program: c.program(d["programId"]) });
      break;
    case "cleared":
      cmd = `sudo override --node ${c.code(d["key"])}`;
      msg = t("CNH.Log.Cleared", { node: c.node(d["key"]) });
      tone = "ok";
      break;
    case "restored":
      cmd = `sudo restore --node ${c.code(d["key"])}`;
      msg = t("CNH.Log.Restored", { node: c.node(d["key"]) });
      break;
    case "outcome": {
      const ability = str(d["ability"]);
      const ok = d["outcome"] === "success";
      const target = c.code(d["key"]);
      if (ability === "damage") {
        cmd = `exec --damage --target ${target}`;
        msg = ok
          ? t(d["npc"] === true ? "CNH.Log.NpcDamage" : "CNH.Log.Damage", {
              total: str(d["total"]),
              before: str(d["rezBefore"] ?? "?"),
              after: str(d["rezAfter"]),
            })
          : t("CNH.Log.DamageDiscarded");
        tone = ok ? "ok" : "info";
        break;
      }
      // Acerto do Black ICE é ruim para a Netrunner; erro dele, bom.
      const againstRunner =
        ability === "iceAttack" || ability === "npcAttack" || ability === "ambush";
      tone = againstRunner ? (ok ? "warn" : "ok") : ok ? "ok" : "fail";
      cmd =
        ability === "programAttack"
          ? `run ${slug(c.program(d["programId"]))}.exe --target ${target}`
          : ability === "iceAttack"
            ? "ice.attack --target netrunner"
            : ability === "npcAttack"
              ? `npc.${d["programId"] ? "run" : "zap"} --target netrunner`
              : `${EXE[ability] ?? `${ability}.exe`} --target ${target}`;
      const name =
        ability === "programAttack"
          ? `${t("CNH.Check.Kind.programAttack")}: ${c.program(d["programId"])}`
          : ability === "npcAttack"
            ? t(d["programId"] ? "CNH.Check.Kind.npcProgram" : "CNH.Check.Kind.npcAttack")
            : t(`CNH.Check.Kind.${ability}`);
      const rolls =
        d["opposed"] !== undefined ? `${str(d["total"])} × ${str(d["opposed"])}` : str(d["total"]);
      const result = HITS.has(ability)
        ? t(`CNH.Check.Confirm.${ability}.${ok ? "success" : "failure"}`)
        : t(ok ? "CNH.Log.Success" : "CNH.Log.Failure");
      msg = t("CNH.Log.Outcome", { ability: name, rolls, result });
      if (ability === "pathfinder" && ok) {
        msg += ` ${t("CNH.Log.PathfinderFound", { count: str(d["found"] ?? 0) })}`;
      }
      break;
    }
    case "damageSkipped":
      cmd = "exec --damage --skip";
      msg = t("CNH.Log.DamageSkipped");
      break;
    case "iceDamage":
      tone = "dmg";
      if (d["kind"] === "brain" && d["npc"] === true) {
        cmd = "npc.payload --brain";
        msg = t("CNH.Log.NpcBrain", { taken: str(d["taken"]), after: str(d["after"]) });
      } else if (d["kind"] === "brain") {
        cmd = "ice.payload --brain";
        msg = t("CNH.Log.IceBrain", { taken: str(d["taken"]), after: str(d["after"]) });
      } else if (d["kind"] === "program") {
        const name = c.program(d["programId"]);
        cmd = `ice.payload --prog ${slug(name)}`;
        msg =
          d["destroyed"] === true
            ? t("CNH.Log.IceDestroyed", { program: name })
            : d["after"] === 0
              ? t("CNH.Log.IceNeutralized", { program: name, taken: str(d["taken"]) })
              : t("CNH.Log.IceProgram", {
                  taken: str(d["taken"]),
                  program: name,
                  after: str(d["after"]),
                });
      } else {
        cmd = "ice.payload";
        msg = t(`CNH.IceHit.None.${str(d["reason"])}`);
        tone = "info";
      }
      break;
    case "rez": {
      const name = c.program(d["programId"]);
      const on = d["rez"] === true;
      cmd = `${on ? "rez" : "derez"} ${slug(name)}`;
      msg = t(on ? "CNH.Log.RezOn" : "CNH.Log.RezOff", { program: name });
      tone = "ok";
      break;
    }
    case "turn": {
      const ice = d["holder"] === "ice";
      cmd = `sys.turn --${ice ? "ice" : "netrunner"}`;
      msg = t(
        ice ? (d["npc"] === true ? "CNH.Fx.npc-turn" : "CNH.Fx.ice-turn") : "CNH.Fx.runner-turn",
      );
      tone = ice ? "warn" : "info";
      break;
    }
    case "newTurn":
      cmd = "sys.tick";
      msg = t("CNH.Log.NewTurn", { turn: String(entry.turn) });
      break;
    case "actions":
      cmd = `sudo actions ${d["delta"] === -1 ? "+1" : "-1"}`;
      msg = t(d["delta"] === -1 ? "CNH.Log.ActionGiven" : "CNH.Log.ActionTaken");
      break;
    case "npc":
      cmd = `trace --node ${c.code(d["key"])}`;
      msg = t("CNH.Log.Npc", { node: c.node(d["key"]) });
      tone = "warn";
      break;
    case "npcLeft":
      cmd = `trace --lost ${c.code(d["key"])}`;
      msg = t("CNH.Log.NpcLeft");
      break;
    case "npcDefeated":
      cmd = `kill --netrunner ${c.code(d["key"])}`;
      msg = t("CNH.Log.NpcDefeated");
      tone = "ok";
      break;
    case "initiative": {
      const npc = d["side"] === "npc";
      cmd = `sys.init --${npc ? "npc" : "netrunner"}`;
      msg = t(npc ? "CNH.Log.InitNpc" : "CNH.Log.InitRunner", { total: str(d["total"]) });
      break;
    }
    case "undo":
      cmd = "sudo rollback";
      msg = t("CNH.Log.Undo", {
        what: d["label"] ? t(`CNH.Undo.What.${str(d["label"])}`) : "—",
      });
      break;
  }
  return { seq: entry.seq, turn: entry.turn, tone, cmd, msg, status: STATUS[tone] };
}
