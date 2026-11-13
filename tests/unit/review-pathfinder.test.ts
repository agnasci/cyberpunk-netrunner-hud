import { describe, expect, it } from "vitest";
import type { NetFloor } from "../../src/domain/net-architecture";
import { pathfinderReveal } from "../../src/domain/pathfinder";
import { buildArchitectureView } from "../../src/session/architecture-view";
import type { PublicSession } from "../../src/session/session-state";
import {
  arch,
  base,
  GM,
  type Harness,
  request,
  reveal,
  RUNNER,
  runWith,
  withRun,
} from "../fixtures/requests-harness";

const node = (
  key: number,
  floor: number,
  branch: string,
  content: NetFloor["content"] = "file",
  dv: number | null = 6,
): NetFloor => ({ key, floor, branch, content, blackIceKey: null, dv, description: "" });

const FLOORS: NetFloor[] = [
  node(0, 1, "a"),
  node(1, 2, "a"),
  node(2, 2, "b", "password", 15),
  node(3, 3, "a"),
  node(4, 3, "b"),
  node(5, 3, "c"),
  node(6, 4, "a"),
  node(7, 4, "d"),
];

describe("Pathfinder em todas as branches (revisão do usuário)", () => {
  it("revela os andares abaixo de outras branches, não só os da própria", () => {
    expect(pathfinderReveal(FLOORS, 1, 16)).toEqual([3, 4, 5, 6, 7]);
  });

  it("Password de outra branch com DV maior esconde só o que está abaixo dela", () => {
    expect(pathfinderReveal(FLOORS, 1, 10)).toEqual([3, 6]);
  });

  it("com a opção qualquer DV, File ou Control Node de DV maior também barra", () => {
    const without = FLOORS.filter((f) => f.key !== 2);
    expect(
      pathfinderReveal([...without, node(2, 2, "b", "controlnode", 12)], 1, 10, {}, "anyDv"),
    ).toEqual([3, 6]);
    expect(pathfinderReveal([...without, node(2, 2, "b", "file", 12)], 1, 12, {}, "anyDv")).toEqual(
      [3, 4, 5, 6, 7],
    );
  });

  it("Black ICE sem DV não barra", () => {
    const without = FLOORS.filter((f) => f.key !== 2);
    expect(
      pathfinderReveal([...without, node(2, 2, "b", "blackice", null)], 1, 6, {}, "anyDv"),
    ).toEqual([3, 4, 5, 6, 7]);
  });

  it("Password já percorrida (acima dela) não barra", () => {
    expect(pathfinderReveal(FLOORS, 4, 10)).toEqual([6, 7]);
  });
});

describe("opção do mestre: o que barra o Pathfinder", () => {
  const floors = [node(0, 1, "a", "password", 6), node(1, 2, "a", "file", 14), node(2, 3, "a")];

  it("só Password (padrão) ou qualquer DV", () => {
    expect(pathfinderReveal(floors, 0, 9)).toEqual([1, 2]);
    expect(pathfinderReveal(floors, 0, 9, {}, "anyDv")).toEqual([1]);
    expect(pathfinderReveal(floors, 0, 9, {}, "password")).toEqual([1, 2]);
    const pw = [node(0, 1, "a"), node(1, 2, "a", "password", 14), node(2, 3, "a")];
    expect(pathfinderReveal(pw, 0, 9, {}, "password")).toEqual([1]);
  });

  it("a autoridade aplica a opção recebida no contexto", () => {
    const resolved = (pathfinderGate?: "anyDv" | "password") => {
      const h: Harness = {
        rolls: { "m-path": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 9 } },
        ices: {},
        architecture: { ...arch(), floors },
        ...(pathfinderGate ? { pathfinderGate } : {}),
      };
      const run = runWith(h);
      let s: PublicSession = {
        ...withRun(reveal(base(), [0]), { cleared: [0] }),
        runnerPosition: 0,
      };
      s =
        run(s, request(s, { type: "check", ability: "pathfinder", messageId: "m-path" }, "p1"))
          .session ?? s;
      s = run(s, request(s, { type: "resolveCheck", outcome: "success" }, "p2"), GM).session ?? s;
      return s.netArch?.discovered.map((f) => f.key);
    };
    expect(resolved()).toEqual([0, 1, 2]);
    expect(resolved("anyDv")).toEqual([0, 1]);
  });
});

describe("arquitetura toda conhecida", () => {
  it("a autoridade marca quando todos os nós estão revelados; o sinal não mapeado some", () => {
    const h: Harness = { rolls: {}, ices: {} };
    const run = runWith(h);
    let s: PublicSession = { ...reveal(base(), [0, 1, 2]), runnerPosition: 0 };
    let out = run(s, request(s, { type: "reveal", key: 3, masked: true }, "a"), GM);
    s = out.session ?? s;
    expect(s.run.allKnown).toBe(true);
    const view = buildArchitectureView(null, s.netArch?.discovered ?? [], "netrunner", 0, {
      run: s.run,
      rules: null,
    });
    expect(view.showUnexplored).toBe(false);
    out = run(s, request(s, { type: "conceal", key: 3 }, "b"), GM);
    expect(out.session?.run.allKnown).toBe(false);
  });
});

describe("faixas de Pathfinder, Cloak e Virus", () => {
  it('cada uma tem a sua (não mais "arquivo identificado")', async () => {
    const { diffFx } = await import("../../src/session/hud-fx");
    const prev = { ...reveal(base(), [0]), runnerPosition: 0 };
    const banner = (ability: "pathfinder" | "cloak" | "virus") =>
      diffFx(prev, {
        ...prev,
        revision: prev.revision + 1,
        run: { ...prev.run, lastOutcome: { seq: 1, ability, key: 0, outcome: "success" } },
      }).banner;
    expect(banner("pathfinder")).toBe("mapped");
    expect(banner("cloak")).toBe("cloaked");
    expect(banner("virus")).toBe("virus");
  });
});
