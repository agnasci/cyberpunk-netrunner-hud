import { describe, expect, it } from "vitest";
import { type NetArchitecture, toPublicFloor } from "../../src/domain/net-architecture";
import { normalizeNetArch } from "../../src/integrations/cpr/netarch-adapter";
import type { RuleContext } from "../../src/domain/net-rules";
import { buildArchitectureView } from "../../src/session/architecture-view";
import type { PublicRun } from "../../src/session/session-state";
import { sampleNetArch } from "../fixtures/cpr-netarch";

function arch(): NetArchitecture {
  const { architecture } = normalizeNetArch(sampleNetArch());
  if (!architecture) throw new Error("fixture inválida");
  return architecture;
}

const revealed = (keys: number[]) =>
  arch()
    .floors.filter((f) => keys.includes(f.key))
    .map(toPublicFloor);

describe("buildArchitectureView", () => {
  it("mestre vê todos os nós, com DV, descrição e marca de oculto", () => {
    const view = buildArchitectureView(arch(), revealed([0]), "gm");
    const nodes = view.rows.flatMap((r) => r.cells).filter((c) => c !== null);
    expect(nodes).toHaveLength(4);
    expect(view.columns).toEqual(["a", "b"]);
    expect(nodes.find((n) => n.key === 0)).toMatchObject({ revealed: true, dv: 6 });
    expect(nodes.find((n) => n.key === 3)).toMatchObject({ revealed: false, dv: 10 });
    expect(view.canReveal).toBe(true);
    expect(view.showUnexplored).toBe(false);
  });

  it("Netrunner vê só nós revelados, sem DV nem descrição, e sem colunas extras", () => {
    const view = buildArchitectureView(arch(), revealed([0, 1]), "netrunner");
    const nodes = view.rows.flatMap((r) => r.cells).filter((c) => c !== null);
    expect(nodes.map((n) => n.key)).toEqual([0, 1]);
    expect(view.columns).toEqual(["a"]);
    expect(view.rows.map((r) => r.floor)).toEqual([1, 2]);
    for (const node of nodes) {
      expect(node).not.toHaveProperty("dv");
      expect(node).not.toHaveProperty("description");
    }
    expect(view.canReveal).toBe(false);
    expect(view.showUnexplored).toBe(true);
  });

  it("espectador não depende do item: usa apenas o estado público", () => {
    const view = buildArchitectureView(null, revealed([3]), "spectator");
    expect(view.rows).toEqual([
      { floor: 3, cells: [expect.objectContaining({ key: 3, branch: "b" })], linksAbove: [] },
    ]);
    expect(view.columns).toEqual(["b"]);
  });

  it("mestre sem o item cai para o estado público e sinaliza", () => {
    const view = buildArchitectureView(null, revealed([0]), "gm");
    expect(view.itemMissing).toBe(true);
    expect(view.rows.flatMap((r) => r.cells).filter((c) => c !== null)).toHaveLength(1);
  });

  it("sem nada revelado, jogadores veem só o marcador de não explorado", () => {
    const view = buildArchitectureView(arch(), [], "netrunner");
    expect(view.rows).toEqual([]);
    expect(view.showUnexplored).toBe(true);
  });
});

describe("buildArchitectureView — posição e movimento", () => {
  const cells = (view: ReturnType<typeof buildArchitectureView>) =>
    view.rows.flatMap((r) => r.cells).filter((c) => c !== null);

  it("marca o nó atual para todos os papéis", () => {
    for (const role of ["gm", "netrunner", "spectator"] as const) {
      const view = buildArchitectureView(arch(), revealed([0, 1]), role, 0);
      expect(cells(view).find((n) => n.key === 0)?.isCurrent).toBe(true);
    }
  });

  const progress = (position: number, run: Partial<PublicRun> = {}) => {
    const full: PublicRun = {
      turn: 1,
      actionsUsed: 0,
      cleared: [],
      evaded: [],
      pending: null,
      usedRolls: [],
      ice: [],
      awaitingDamage: null,
      damageProgram: null,
      lastOutcome: null,
      iceHit: null,
      lastIceDamage: null,
      undoSeq: 0,
      iceTurn: false,
      npcs: [],
      fight: null,
      ambush: null,
      ambushed: [],
      programsUsed: [],
      atBottom: false,
      allKnown: false,
      controlChoices: [],
      netrunUsed: [],
      ...run,
    };
    const rules: RuleContext = {
      runner: { interfaceRank: 4, hasCyberdeck: true },
      hasEntry: true,
      nodes: arch().floors,
      run: {
        position: revealed([position])[0] ?? null,
        actionsUsed: full.actionsUsed,
        cleared: new Set(full.cleared),
        evaded: new Set(full.evaded),
      },
    };
    return { run: full, rules };
  };

  it("só a Netrunner recebe dica de movimento, para nós que o motor permite", () => {
    const runner = buildArchitectureView(
      arch(),
      revealed([0, 1, 2]),
      "netrunner",
      1,
      progress(1, { evaded: [1] }),
    );
    expect(
      cells(runner)
        .filter((n) => n.movable)
        .map((n) => n.key),
    ).toEqual([0, 2]);
    const spectator = buildArchitectureView(
      arch(),
      revealed([0, 1, 2]),
      "spectator",
      1,
      progress(1, { evaded: [1] }),
    );
    expect(cells(spectator).some((n) => n.movable)).toBe(false);
  });

  it("bloqueios do motor tiram a dica: Black ICE engaja, Password trava a descida", () => {
    const engaged = buildArchitectureView(arch(), revealed([0, 1, 2]), "netrunner", 1, progress(1));
    expect(cells(engaged).some((n) => n.movable)).toBe(false);
    const locked = buildArchitectureView(arch(), revealed([0, 1]), "netrunner", 0, progress(0));
    expect(cells(locked).some((n) => n.movable)).toBe(false);
    const spent = buildArchitectureView(
      arch(),
      revealed([0, 1]),
      "netrunner",
      0,
      progress(0, { cleared: [0], actionsUsed: 3 }),
    );
    expect(
      cells(spent)
        .filter((n) => n.movable)
        .map((n) => n.key),
    ).toEqual([1]);
  });

  it("marca nós resolvidos e driblados para todos; só o GM pode liberar", () => {
    const p = progress(1, { cleared: [0], evaded: [1] });
    for (const role of ["gm", "netrunner", "spectator"] as const) {
      const view = buildArchitectureView(arch(), revealed([0, 1, 2]), role, 1, p);
      const byKey = new Map(cells(view).map((n) => [n.key, n]));
      expect(byKey.get(0)?.state).toBe("cleared");
      expect(byKey.get(1)?.state).toBe("evaded");
      expect(byKey.get(2)?.state).toBeNull();
      expect(byKey.get(0)?.clearable).toBe(role === "gm");
      expect(byKey.get(2)?.clearable).toBe(role === "gm");
    }
    const gm = buildArchitectureView(arch(), revealed([0]), "gm", null, p);
    expect(cells(gm).find((n) => n.key === 3)?.clearable).toBe(false);
  });

  it("sem conexão ninguém tem dica de movimento", () => {
    const view = buildArchitectureView(arch(), revealed([0, 1]), "netrunner", null);
    expect(cells(view).some((n) => n.movable || n.isCurrent)).toBe(false);
  });
});

describe("buildArchitectureView — conectores entre andares (D28)", () => {
  it("liga a mesma branch na vertical e marca a bifurcação para a branch B", () => {
    const view = buildArchitectureView(arch(), revealed([0, 1, 2, 3]), "gm");
    expect(view.rows.map((r) => r.floor)).toEqual([1, 2, 3]);
    expect(view.rows[0]?.linksAbove).toEqual([]);
    expect(view.rows[1]?.linksAbove).toEqual([
      { down: true, forkIn: false, forkOut: false, forkPass: false },
      { down: false, forkIn: false, forkOut: false, forkPass: false },
    ]);
    expect(view.rows[2]?.linksAbove).toEqual([
      { down: true, forkIn: false, forkOut: true, forkPass: false },
      { down: false, forkIn: true, forkOut: false, forkPass: false },
    ]);
  });

  it("jogadores só veem ligações entre nós revelados", () => {
    const view = buildArchitectureView(null, revealed([0, 3]), "netrunner");
    expect(view.rows.map((r) => r.floor)).toEqual([1, 3]);
    expect(view.rows[1]?.linksAbove.some((l) => l.down || l.forkIn)).toBe(false);
  });
});
