import type { SheetEffect } from "../../session/requests";

interface ProgramItem {
  readonly id: string;
  readonly type: string;
  readonly system: unknown;
  update(data: Record<string, unknown>): Promise<unknown>;
}

interface ActorWithItems {
  readonly documentName?: string;
  readonly items: Iterable<ProgramItem>;
}

export async function applyProgramEffect(
  effect: Extract<
    SheetEffect,
    { type: "setProgramRez" | "setProgramRezValue" | "setProgramState" }
  >,
): Promise<void> {
  const actor = fromUuidSync(effect.actorUuid) as ActorWithItems | null;
  if (actor?.documentName !== "Actor") throw new Error(`Ator não encontrado: ${effect.actorUuid}`);
  const program = Array.from(actor.items).find(
    (item) => item.id === effect.programId && item.type === "program",
  );
  if (!program) throw new Error(`Programa não encontrado: ${effect.programId}`);
  const system = program.system as { isRezzed?: unknown; rez?: { value?: unknown } } | null;
  const rezzed = system?.isRezzed === true;
  if (effect.type === "setProgramState") {
    const { state } = effect;
    await program.update({
      "system.isRezzed": state.rezzed,
      "system.rez.value": state.rezValue,
      "flags.cyberpunk-netrunner-hud.programState": state.mark === "none" ? null : state.mark,
    });
    return;
  }
  if (effect.type === "setProgramRezValue") {
    const data: Record<string, unknown> = {};
    if (Number(system?.rez?.value) !== effect.value) data["system.rez.value"] = effect.value;
    if (effect.value === 0 && rezzed) data["system.isRezzed"] = false;
    if (Object.keys(data).length > 0) await program.update(data);
    return;
  }
  if (rezzed === effect.rezzed) return;
  await program.update({ "system.isRezzed": effect.rezzed });
}
