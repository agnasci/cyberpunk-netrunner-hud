import { describe, expect, it } from "vitest";
import { applyDemoAction, createDemoState } from "../../src/prototype/demo-state";
import { buildHudView } from "../../src/prototype/view-model";

describe("buildHudView", () => {
  const jackedIn = applyDemoAction(createDemoState(), "jackIn");

  it("não entrega conteúdo de andares não descobertos à Netrunner", () => {
    const view = buildHudView(jackedIn, "netrunner");
    const hidden = view.floors.filter((floor) => floor.state === "unknown");
    expect(hidden.length).toBeGreaterThan(0);
    for (const floor of hidden) {
      expect(floor).not.toHaveProperty("content");
      expect(floor).not.toHaveProperty("dv");
      expect(floor).not.toHaveProperty("label");
    }
  });

  it("mostra ao mestre todos os andares, marcando os ocultos aos jogadores", () => {
    const view = buildHudView(jackedIn, "gm");
    expect(view.floors.every((floor) => floor.state === "known")).toBe(true);
    expect(view.floors.some((floor) => floor.state === "known" && floor.hiddenFromPlayers)).toBe(
      true,
    );
  });

  it("não dá controles nem detalhes de programas ao espectador", () => {
    const view = buildHudView(jackedIn, "spectator");
    expect(view.canAct).toBe(false);
    expect(view.actions).toEqual([]);
    expect(view.programs.every((program) => !("stats" in program))).toBe(true);
  });
});

describe("applyDemoAction", () => {
  it("bloqueia avançar por senha ainda não quebrada", () => {
    const state = applyDemoAction(applyDemoAction(createDemoState(), "jackIn"), "advance");
    expect(state.position).toBe(0);
    expect(state.lastEvent?.kind).toBe("denied");
  });

  it("falha o primeiro Backdoor e quebra a senha no segundo", () => {
    let state = applyDemoAction(createDemoState(), "jackIn");
    state = applyDemoAction(state, "backdoor");
    expect(state.lastEvent?.kind).toBe("fail");
    state = applyDemoAction(state, "backdoor");
    expect(state.lastEvent?.kind).toBe("breach");
    state = applyDemoAction(applyDemoAction(state, "newTurn"), "advance");
    expect(state.position).toBe(1);
  });

  it("não consome ações além do limite do turno", () => {
    let state = applyDemoAction(createDemoState(), "jackIn");
    while (state.netActions.used < state.netActions.max)
      state = applyDemoAction(state, "pathfinder");
    const before = state;
    state = applyDemoAction(state, "pathfinder");
    expect(state.lastEvent?.kind).toBe("no-actions");
    expect(state.discovered).toEqual(before.discovered);
  });
});
