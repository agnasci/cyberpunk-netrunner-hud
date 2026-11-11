import { MODULE_ID } from "../../constants";
import { BUILTIN_ICE, BUILTIN_PREFIX, builtinById } from "../../domain/builtin-ice";
import { ICE_CLASSES, type IceClass } from "../../domain/ice-hit";
import type { IceStats, SheetEffect } from "../../session/requests";

/**
 * Atores Black ICE do CPR v0.92.4 (E3-02c, D25): `type === "blackIce"`,
 * `system.stats.{per,spd,atk,def}` e `system.stats.rez.{value,max}`.
 */
interface IceActor {
  readonly documentName: "Actor";
  readonly uuid: string;
  readonly name: string;
  readonly type: string;
  readonly system: unknown;
  update(data: Record<string, unknown>): Promise<unknown>;
}

function asIce(doc: unknown): IceActor | null {
  const actor = doc as Partial<IceActor> | null;
  return actor?.documentName === "Actor" && actor.type === "blackIce" ? (actor as IceActor) : null;
}

export function readIceStats(actorUuid: string): IceStats | null {
  const actor = asIce(fromUuidSync(actorUuid));
  if (!actor) return null;
  const rez = (actor.system as { stats?: { rez?: { value?: unknown; max?: unknown } } } | null)
    ?.stats?.rez;
  const value = Number(rez?.value);
  const max = Number(rez?.max);
  if (!Number.isInteger(value) || !Number.isInteger(max)) return null;
  const cls = (actor.system as { class?: unknown } | null)?.class;
  const iceClass = ICE_CLASSES.find((c) => c === cls) ?? "other";
  const damageFormula = iceDamageFormula(actor.name, iceClass);
  const notes = (actor.system as { notes?: unknown } | null)?.notes;
  const effect =
    typeof notes === "string"
      ? notes
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300)
      : "";
  return {
    name: actor.name,
    rez: { value, max },
    iceClass,
    damageFormula,
    specialOnly: damageFormula === null && iceProgram(actor.name) !== undefined,
    effect,
    destroysPrograms:
      BUILTIN_ICE.find((b) => b.name.toLowerCase() === actor.name.trim().toLowerCase())
        ?.destroysProgram === true,
  };
}

function iceProgram(iceName: string): { system: unknown } | undefined {
  const name = iceName.trim().toLowerCase();
  return game.items.contents.find(
    (i) =>
      i.type === "program" &&
      (i.system as { class?: unknown } | null)?.class === "blackice" &&
      i.name.trim().toLowerCase() === name,
  );
}

/**
 * Fórmula do acerto (E6-06, D31), como a ficha do Black ICE no CPR v0.92.4: vem de um
 * item `program` da classe `blackice`; antiprograma usa `damage.blackIce` ("Dano em
 * programas"), os demais `damage.standard`. Aqui o item do mundo com o mesmo nome do ator.
 */
export function iceDamageFormula(iceName: string, iceClass: IceClass): string | null {
  const program = iceProgram(iceName);
  const damage = (program?.system as { damage?: { standard?: unknown; blackIce?: unknown } } | null)
    ?.damage;
  const formula = iceClass === "antiprogram" ? damage?.blackIce : damage?.standard;
  return typeof formula === "string" && formula.trim() !== "" && Roll.validate(formula)
    ? formula.trim()
    : null;
}

/** Atributos exibidos ao escolher o ator (E6-03). */
export interface IceChoice {
  /** UUID do ator, ou `builtin:<id>` para um básico ainda não criado (E6-12). */
  uuid: string;
  name: string;
  builtin?: boolean;
  stats: {
    per: number;
    spd: number;
    atk: number;
    def: number;
    rez: { value: number; max: number };
  };
}

/** Atores Black ICE do mundo, para o GM vincular a um nó, com atributos. */
export function listWorldIce(): IceChoice[] {
  const world: IceChoice[] = game.actors.contents
    .filter((a) => a.type === "blackIce")
    .map((a) => {
      const st = (a.system as { stats?: Record<string, unknown> } | null)?.stats ?? {};
      const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const rez = (st["rez"] ?? {}) as { value?: unknown; max?: unknown };
      return {
        uuid: a.uuid,
        name: a.name,
        stats: {
          per: num(st["per"]),
          spd: num(st["spd"]),
          atk: num(st["atk"]),
          def: num(st["def"]),
          rez: { value: num(rez.value), max: num(rez.max) },
        },
      };
    });
  return world
    .concat(builtinChoices())
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || Number(a.builtin ?? false) - Number(b.builtin ?? false),
    );
}

/** Básicos (D38) que ainda não têm ficha criada no mundo. */
function builtinChoices(): IceChoice[] {
  return BUILTIN_ICE.filter((b) => !builtinActor(b.id)).map((b) => ({
    uuid: `${BUILTIN_PREFIX}${b.id}`,
    name: b.name,
    builtin: true,
    stats: { per: b.per, spd: b.spd, atk: b.atk, def: b.def, rez: { value: b.rez, max: b.rez } },
  }));
}

/**
 * Ficha do básico no mundo: a criada pelo módulo (flag) ou, se não houver, um ator Black ICE
 * do mundo com o mesmo nome (ex.: um Hellhound feito à mão), para não duplicar.
 */
function builtinActor(id: string): { uuid: string } | undefined {
  const flagged = game.actors.contents.find(
    (a) =>
      a.type === "blackIce" &&
      (a as unknown as { getFlag(scope: string, key: string): unknown }).getFlag(
        MODULE_ID,
        "builtin",
      ) === id,
  );
  if (flagged) return flagged;
  const name = builtinById(id)?.name.toLowerCase();
  return game.actors.contents.find(
    (a) => a.type === "blackIce" && a.name.trim().toLowerCase() === name,
  );
}

interface CreatableClass {
  create(data: Record<string, unknown>): Promise<unknown>;
}

const FOLDER_NAME = "Black ICE (CNH)";

/** Classe do documento no V12 (as classes não ficam em `globalThis`). */
function docClass(type: "Folder" | "Item" | "Actor"): CreatableClass {
  const config = (
    globalThis as unknown as { CONFIG: Record<string, { documentClass: CreatableClass }> }
  ).CONFIG;
  const cls = config[type]?.documentClass;
  if (!cls) throw new Error(`Classe de documento indisponível: ${type}`);
  return cls;
}

async function ensureFolder(type: "Actor" | "Item"): Promise<string | null> {
  const folders = (
    game as unknown as { folders: { contents: Array<{ id: string; name: string; type: string }> } }
  ).folders;
  const existing = folders.contents.find((f) => f.name === FOLDER_NAME && f.type === type);
  if (existing) return existing.id;
  await docClass("Folder").create({ name: FOLDER_NAME, type });
  return folders.contents.find((f) => f.name === FOLDER_NAME && f.type === type)?.id ?? null;
}

/**
 * Valor do seletor → UUID do ator. Um básico (`builtin:<id>`) ganha ator Black ICE e item
 * de programa (classe `blackice`, com o dano) na pasta do módulo, se ainda não existirem.
 * Só o GM chama (cria documentos do mundo).
 */
/**
 * Cria no mundo as fichas dos 12 básicos que faltam (D38), na pasta do módulo. Só o GM chama;
 * idempotente (reusa a ficha existente, pela flag ou pelo nome). Devolve quantas criou.
 */
export async function ensureAllBuiltinIce(): Promise<number> {
  let created = 0;
  for (const b of BUILTIN_ICE) {
    if (builtinActor(b.id)) continue;
    if (await ensureIceActor(`${BUILTIN_PREFIX}${b.id}`)) created += 1;
  }
  return created;
}

export async function ensureIceActor(value: string): Promise<string | null> {
  if (!value.startsWith(BUILTIN_PREFIX)) return value || null;
  const b = builtinById(value.slice(BUILTIN_PREFIX.length));
  if (!b) return null;
  const found = builtinActor(b.id);
  if (found) return found.uuid;
  const notes = `<p>${b.effect}</p>`;
  if (!iceProgram(b.name)) {
    const Item = docClass("Item");
    await Item.create({
      name: b.name,
      type: "program",
      folder: await ensureFolder("Item"),
      system: {
        class: "blackice",
        blackIceType: b.iceClass,
        damage: {
          standard: b.iceClass === "antipersonnel" ? (b.damage ?? "") : "",
          blackIce: b.iceClass === "antiprogram" ? (b.damage ?? "") : "",
        },
        atk: b.atk,
        def: b.def,
        per: b.per,
        spd: b.spd,
        rez: { value: b.rez, max: b.rez },
        price: { market: b.cost },
        description: { value: notes },
      },
    });
  }
  const Actor = docClass("Actor");
  // O CPR v0.92.4 sobrescreve `Actor.create` e não devolve o documento: busca pela flag.
  await Actor.create({
    name: b.name,
    type: "blackIce",
    folder: await ensureFolder("Actor"),
    system: {
      class: b.iceClass,
      stats: { per: b.per, spd: b.spd, atk: b.atk, def: b.def, rez: { value: b.rez, max: b.rez } },
      notes,
      cost: b.cost,
    },
    flags: { [MODULE_ID]: { builtin: b.id } },
  });
  // …e pode resolver antes de o ator entrar na coleção: espera até ~3 s.
  for (let i = 0; i < 30; i += 1) {
    const created = builtinActor(b.id);
    if (created) return created.uuid;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

/** Executa o efeito na ficha (só a autoridade GM chama). Valor absoluto (D26). */
export async function applyIceEffect(
  effect: Extract<SheetEffect, { type: "setIceRez" }>,
): Promise<void> {
  const actor = asIce(fromUuidSync(effect.actorUuid));
  if (!actor) throw new Error(`Black ICE não encontrado: ${effect.actorUuid}`);
  await actor.update({ "system.stats.rez.value": effect.value });
}
