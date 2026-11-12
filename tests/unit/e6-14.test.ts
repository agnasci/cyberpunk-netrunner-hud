import { describe, expect, it } from "vitest";
import type { NetFloor } from "../../src/domain/net-architecture";
import { checkAction, checkProgramAttack, type RuleContext } from "../../src/domain/net-rules";
import { pathfinderReveal } from "../../src/domain/pathfinder";
import { buildArchitectureView } from "../../src/session/architecture-view";
import { nextAutoStep } from "../../src/session/autopilot";
import { newTurnRun } from "../../src/session/combat-turn";
import { parseSession, type PublicSession, toRunState } from "../../src/session/session-state";
import {
  arch,
  base,
  DECK,
  GM,
  type Harness,
  request,
  reveal,
  RUNNER,
  runWith,
  withRun,
} from "../fixtures/requests-harness";

const HOUND = {
  name: "Hellhound",
  rez: { value: 20, max: 20 },
  iceClass: "antipersonnel" as const,
  damageFormula: "2d6",
};

function harness(extra: Partial<Harness> = {}): Harness {
  return {
    rolls: {
      "m-spd": { authorId: GM.id, actorUuid: "Actor.hound", total: 12 },
      "m-speed-low": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 9 },
      "m-speed-high": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 12 },
      "m-zap": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 15 },
      "m-sword": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 15 },
      "m-sword2": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 16 },
      "m-def": { authorId: GM.id, actorUuid: "Actor.hound", total: 20 },
      "m-path": { authorId: RUNNER.id, actorUuid: "Actor.abc", total: 9 },
    },
    ices: { "Actor.hound": HOUND },
    vitals: { hp: 30, brainDamageReduction: 0 },
    ...extra,
  };
}

function chain(h: Harness, start: PublicSession) {
  const run = runWith(h);
  let current = start;
  let n = 0;
  return {
    get session() {
      return current;
    },
    step(action: unknown, sender = RUNNER) {
      n += 1;
      const outcome = run(current, request(current, action, `e${n}`), sender);
      if (outcome.session) current = outcome.session;
      return outcome;
    },
  };
}

function beforeIce(): PublicSession {
  return {
    ...withRun(reveal(base(), [0, 1]), {
      cleared: [0],
      ice: [{ key: 1, actorUuid: "Actor.hound" }],
    }),
    runnerPosition: 0,
  };
}

describe("Pathfinder (domínio)", () => {
  const floors = arch().floors;

  it("revela os andares abaixo até o total, seguindo os caminhos", () => {
    expect(pathfinderReveal(floors, 0, 10).sort()).toEqual([1, 2, 3]);
    expect(pathfinderReveal(floors, 0, 1)).toEqual([1]);
    expect(pathfinderReveal(floors, 2, 10)).toEqual([]);
  });

  it("para numa Password com DV maior que o total (ela aparece, o resto não)", () => {
    const custom: NetFloor[] = [
      { key: 0, floor: 1, branch: "a", content: "file", blackIceKey: null, dv: 6, description: "" },
      {
        key: 1,
        floor: 2,
        branch: "a",
        content: "password",
        blackIceKey: null,
        dv: 15,
        description: "",
      },
      { key: 2, floor: 3, branch: "a", content: "file", blackIceKey: null, dv: 6, description: "" },
    ];
    expect(pathfinderReveal(custom, 0, 10)).toEqual([1]);
    expect(pathfinderReveal(custom, 0, 16)).toEqual([1, 2]);
  });
});

describe("Pathfinder, Cloak e Virus (motor)", () => {
  const ctx = (position: NonNullable<RuleContext["run"]["position"]>): RuleContext => ({
    runner: DECK,
    run: { position, actionsUsed: 0, cleared: new Set(), evaded: new Set() },
    hasEntry: true,
    nodes: arch().floors,
  });
  const file = { key: 2, floor: 3, branch: "a", content: "file" as const, blackIceKey: null };
  const ice = { key: 1, floor: 2, branch: "a", content: "blackice" as const, blackIceKey: null };

  it("Pathfinder e Cloak em qualquer nó; Virus só no andar mais fundo", () => {
    expect(checkAction(ctx(file), "pathfinder")).toEqual({ allowed: true, cost: 1 });
    expect(checkAction(ctx(file), "cloak")).toEqual({ allowed: true, cost: 1 });
    expect(checkAction(ctx(file), "virus")).toEqual({ allowed: true, cost: 1 });
    const pw = { key: 0, floor: 1, branch: "a", content: "password" as const, blackIceKey: null };
    expect(checkAction(ctx(pw), "virus")).toEqual({ allowed: false, reason: "not-lowest" });
  });

  it("engajada por Black ICE, só Zap, Slide e Jack Out", () => {
    expect(checkAction(ctx(ice), "pathfinder")).toEqual({ allowed: false, reason: "engaged" });
  });

  it("Pathfinder confirmado revela os nós; o registro conta quantos", () => {
    const start = { ...withRun(reveal(base(), [0]), { cleared: [0] }), runnerPosition: 0 };
    const c = chain(harness(), start);
    expect(
      c.step({ type: "check", ability: "pathfinder", messageId: "m-path" }).result,
    ).toMatchObject({ ok: true });
    expect(c.session.run.actionsUsed).toBe(1);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(c.session.netArch?.discovered.map((f) => f.key).sort()).toEqual([0, 1, 2, 3]);
    expect(c.session.log.at(-1)?.data).toMatchObject({ ability: "pathfinder", found: 3 });
  });
});

describe("Black ICE à espreita (encontro ao chegar)", () => {
  it("marca o encontro ao chegar, bloqueia ações e só acontece uma vez", () => {
    const c = chain(harness(), beforeIce());
    c.step({ type: "moveTo", key: 1 });
    expect(c.session.run.ambush).toBe(1);
    expect(c.session.run.ambushed).toEqual([1]);
    expect(toRunState(c.session).ambushPending).toBe(true);
    expect(c.step({ type: "check", ability: "zap", messageId: "m-zap" }).result).toMatchObject({
      error: "ambush",
    });
    expect(c.step({ type: "ambush", messageId: "m-spd" }).result).toMatchObject({
      error: "not-authorized",
    });
  });

  it("ICE vence a velocidade: efeito na hora (acerto no cérebro)", () => {
    const c = chain(harness(), beforeIce());
    c.step({ type: "moveTo", key: 1 });
    c.step({ type: "ambush", messageId: "m-spd" }, GM);
    expect(c.session.run.pending).toMatchObject({ ability: "ambush", total: 12 });
    expect(c.session.run.ambush).toBeNull();
    c.step({ type: "oppose", messageId: "m-speed-low" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(c.session.run.iceHit).toEqual({
      key: 1,
      target: { kind: "brain", hpBase: 30, reduction: 0 },
    });
  });

  it("empate favorece a Netrunner (o ICE precisa superar)", () => {
    const c = chain(harness(), beforeIce());
    c.step({ type: "moveTo", key: 1 });
    c.step({ type: "ambush", messageId: "m-spd" }, GM);
    c.step({ type: "oppose", messageId: "m-speed-high" });
    const step = nextAutoStep(c.session, { dvOf: () => null, readIce: () => HOUND });
    expect(step).toMatchObject({ kind: "resolve", outcome: "failure" });
  });

  it("sem ações sobrando, a vez só passa ao Black ICE depois do encontro", () => {
    const c = chain(harness(), withRun(beforeIce(), { actionsUsed: 3 }));
    c.step({ type: "moveTo", key: 1 });
    expect(c.session.run.ambush).toBe(1);
    expect(c.session.run.iceTurn).toBe(false);
    c.step({ type: "ambush", messageId: "m-spd" }, GM);
    c.step({ type: "oppose", messageId: "m-speed-high" });
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    expect(c.session.run.iceTurn).toBe(true);
  });

  it("GM pode dispensar o encontro", () => {
    const c = chain(harness(), beforeIce());
    c.step({ type: "moveTo", key: 1 });
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    expect(c.session.run.ambush).toBeNull();
    expect(toRunState(c.session).ambushPending).toBe(false);
  });

  it("modo automático: rola o SPD do ICE e, na vez dele, o ataque", () => {
    const input = { dvOf: () => null, readIce: () => HOUND };
    const waiting = { ...withRun(beforeIce(), { ambush: 1, ambushed: [1] }), runnerPosition: 1 };
    expect(nextAutoStep(waiting, input)).toMatchObject({ kind: "rollAmbush", link: "Actor.hound" });
    const iceTurn = {
      ...withRun(beforeIce(), { iceTurn: true, ambushed: [1] }),
      runnerPosition: 1,
    };
    expect(nextAutoStep(iceTurn, input)).toMatchObject({
      kind: "rollIceAttack",
      link: "Actor.hound",
    });
    const pick = withRun(iceTurn, {
      iceTurn: false,
      iceHit: {
        key: 1,
        target: { kind: "program", programId: "p", rezBase: 5 },
        pickProgram: true,
      },
    });
    expect(nextAutoStep(pick, input)).toBeNull();
  });
});

describe("atacante uma vez por rodada (Core)", () => {
  const sword = {
    ...DECK,
    programs: [{ itemId: "p-sword", programClass: "antiprogramattacker", rezzed: false }],
  };

  it("o segundo ataque com o mesmo programa na rodada é recusado", () => {
    const start = {
      ...withRun(beforeIce(), { ambushed: [1] }),
      runnerPosition: 1,
    };
    const c = chain(harness({ runner: sword }), start);
    c.step({ type: "check", ability: "programAttack", messageId: "m-sword", programId: "p-sword" });
    expect(c.session.run.programsUsed).toEqual(["p-sword"]);
    c.step({ type: "oppose", messageId: "m-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    const again = c.step({
      type: "check",
      ability: "programAttack",
      messageId: "m-sword2",
      programId: "p-sword",
    });
    expect(again.result).toMatchObject({ error: "program-used" });
  });

  it("nova rodada libera os atacantes", () => {
    const s = withRun(beforeIce(), { programsUsed: ["p-sword"] });
    expect(newTurnRun(s).programsUsed).toEqual([]);
    const ctx: RuleContext = {
      runner: sword,
      run: { ...toRunState({ ...s, runnerPosition: 1 }), ambushPending: false },
      hasEntry: true,
      nodes: arch().floors,
    };
    expect(checkProgramAttack(ctx, "p-sword")).toEqual({ allowed: false, reason: "program-used" });
  });
});

describe("revelar só no mapa (conteúdo oculto até entrar)", () => {
  it("GM mapeia sem conteúdo; ao entrar, o conteúdo aparece", () => {
    const start = {
      ...withRun(reveal(base(), [0, 1]), { cleared: [0, 1] }),
      runnerPosition: 1,
    };
    const c = chain(harness(), start);
    c.step({ type: "reveal", key: 2, masked: true }, GM);
    expect(c.session.netArch?.mapped).toEqual([{ key: 2, floor: 3, branch: "a" }]);
    expect(c.session.netArch?.discovered.some((f) => f.key === 2)).toBe(false);
    const stored = JSON.parse(JSON.stringify(c.session)) as Record<string, unknown>;
    expect(JSON.stringify(parseSession(stored)?.netArch?.mapped)).not.toContain("file");
    expect(c.step({ type: "reveal", key: 1, masked: true }, GM).session).toBeNull();
    c.step({ type: "moveTo", key: 2 });
    expect(c.session.runnerPosition).toBe(2);
    expect(c.session.netArch?.mapped).toEqual([]);
    expect(c.session.netArch?.discovered.find((f) => f.key === 2)?.content).toBe("file");
  });

  it("revelar por completo tira o nó do mapa; ocultar tira dos dois", () => {
    const c = chain(harness(), { ...reveal(base(), [0]), runnerPosition: 0 });
    c.step({ type: "reveal", key: 1, masked: true }, GM);
    c.step({ type: "reveal", key: 1 }, GM);
    expect(c.session.netArch?.mapped).toEqual([]);
    expect(c.session.netArch?.discovered.some((f) => f.key === 1)).toBe(true);
    c.step({ type: "reveal", key: 2, masked: true }, GM);
    c.step({ type: "conceal", key: 2 }, GM);
    expect(c.session.netArch?.mapped).toEqual([]);
  });
});

describe("NPC desvinculada sai do estado público", () => {
  it("sem vínculo na flag, a NPC antiga some e não pede iniciativa", () => {
    const start = {
      ...withRun(reveal(base(), [0, 1, 2]), {
        cleared: [0, 1],
        npcs: [{ key: 2, actorUuid: "Actor.npc", defeated: false }],
      }),
      runnerPosition: 1,
    };
    const c = chain(harness({ npcLinks: {} }), start);
    c.step({ type: "npcSync" }, GM);
    expect(c.session.run.npcs).toEqual([]);
    c.step({ type: "moveTo", key: 2 });
    expect(c.session.run.fight).toBeNull();
    expect(toRunState(c.session).initiativePending).toBe(false);
  });
});

describe("Virus no andar mais fundo (marcado pela autoridade)", () => {
  it("a autoridade marca o fundo ao chegar; o cliente libera o Virus por essa marca", () => {
    const start = {
      ...withRun(reveal(base(), [0, 1, 2]), { cleared: [0, 1] }),
      runnerPosition: 1,
    };
    const c = chain(harness(), start);
    expect(c.session.run.atBottom).toBe(false);
    c.step({ type: "moveTo", key: 2 });
    expect(c.session.run.atBottom).toBe(true);
    const client: RuleContext = {
      runner: DECK,
      run: toRunState(c.session),
      hasEntry: true,
      nodes: c.session.netArch?.discovered ?? [],
    };
    expect(checkAction(client, "virus")).toEqual({ allowed: true, cost: 1 });
    const notYet = { ...client, run: { ...client.run, atBottom: false } };
    expect(checkAction(notYet, "virus")).toEqual({ allowed: false, reason: "not-lowest" });
  });
});

describe("mais de duas branches (CPR aceita a–h)", () => {
  it("a grade mostra uma coluna por branch", () => {
    const floors: NetFloor[] = ["a", "b", "c", "d"].map((branch, i) => ({
      key: i,
      floor: i === 0 ? 1 : 2,
      branch,
      content: "file",
      blackIceKey: null,
      dv: 6,
      description: "",
    }));
    const view = buildArchitectureView({ itemUuid: "Item.x", name: "x", floors }, [], "gm");
    expect(view.columns).toEqual(["a", "b", "c", "d"]);
  });
});
