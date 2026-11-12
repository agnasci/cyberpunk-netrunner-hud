import { describe, expect, it } from "vitest";
import { turnHolder } from "../../src/session/combat-turn";
import { type NetArchitecture, toPublicFloor } from "../../src/domain/net-architecture";
import type { PublicSession } from "../../src/session/session-state";
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

const roll = (
  authorId: string,
  actorUuid: string,
  total: number,
  formula: string | null = null,
) => ({
  authorId,
  actorUuid,
  total,
  formula,
});

const NPC = "Actor.npc";

function harness(): Harness {
  return {
    rolls: {
      "m-init": roll(RUNNER.id, "Actor.abc", 12, "1d10 + 6"),
      "m-init-low": roll(RUNNER.id, "Actor.abc", 8, "1d10 + 6"),
      "m-init-bad": roll(RUNNER.id, "Actor.abc", 12, "1d10 + 9"),
      "m-npc-init": roll(GM.id, NPC, 10, "1d10 + 5"),
      "m-npc-init-tie": roll(GM.id, NPC, 12, "1d10 + 5"),
      "m-zap": roll(RUNNER.id, "Actor.abc", 14),
      "m-npc-def": roll(GM.id, NPC, 9),
      "m-dmg": roll(RUNNER.id, "Actor.abc", 4, "1d6"),
      "m-dmg-big": roll(RUNNER.id, "Actor.abc", 30, "1d6"),
      "m-hellbolt": roll(RUNNER.id, "Actor.abc", 15),
      "m-npc-zap": roll(GM.id, NPC, 13),
      "m-npc-zap2": roll(GM.id, NPC, 11),
      "m-npc-prog": roll(GM.id, NPC, 16),
      "m-defense": roll(RUNNER.id, "Actor.abc", 8),
      "m-defense2": roll(RUNNER.id, "Actor.abc", 20),
      "m-npc-dmg": roll(GM.id, NPC, 5, "1d6"),
    },
    ices: {},
    vitals: { hp: 30, brainDamageReduction: 0 },
    vitalsOf: { [NPC]: { hp: 10, brainDamageReduction: 1 } },
    runner: {
      ...DECK,
      programs: [
        { itemId: "p-hellbolt", programClass: "antipersonnelattacker", rezzed: false },
        { itemId: "p-sword", programClass: "antiprogramattacker", rezzed: false },
      ],
    },
    resources: {
      [NPC]: {
        interfaceRank: 2,
        hasCyberdeck: true,
        programs: [
          { itemId: "n-bolt", programClass: "antipersonnelattacker", rezzed: false },
          { itemId: "n-armor", programClass: "defender", rezzed: false },
        ],
      },
    },
    refs: { "Actor.abc": 6, [NPC]: 5 },
    npcLinks: { 2: NPC },
  };
}

function start(): PublicSession {
  return {
    ...withRun(reveal(base(), [0, 1, 2, 3]), { cleared: [0, 1] }),
    runnerPosition: 1,
  };
}

function chain(session: PublicSession = start(), h: Harness = harness()) {
  const run = runWith(h);
  let current = session;
  let n = 0;
  return {
    get session() {
      return current;
    },
    step(action: unknown, sender = RUNNER) {
      n += 1;
      const outcome = run(current, request(current, action, `s${n}`), sender);
      if (outcome.session) current = outcome.session;
      return outcome;
    },
  };
}

function engaged(npcRoll = "m-npc-init") {
  const c = chain();
  c.step({ type: "moveTo", key: 2 });
  c.step({ type: "initiative", side: "runner", messageId: "m-init" });
  c.step({ type: "initiative", side: "npc", messageId: npcRoll }, GM);
  return c;
}

describe("Netrunner NPC inimiga (E6-11b, D37)", () => {
  it("fica oculta até a jogadora chegar ao nó; aí abre o combate pela iniciativa", () => {
    const c = chain();
    expect(c.session.run.npcs).toEqual([]);
    expect(JSON.stringify(c.session)).not.toContain(NPC);
    c.step({ type: "moveTo", key: 2 });
    expect(c.session.run.npcs).toEqual([{ key: 2, actorUuid: NPC, defeated: false }]);
    expect(c.session.run.fight).toEqual({
      key: 2,
      runnerInit: null,
      npcInit: null,
      npcActionsUsed: 0,
    });
    expect(turnHolder(c.session)).toBeNull();
  });

  it("antes das iniciativas, ações de nó esperam; mover e sair continuam (não prende)", () => {
    const c = chain();
    c.step({ type: "moveTo", key: 2 });
    expect(c.step({ type: "check", ability: "zap", messageId: "m-zap" }).result).toMatchObject({
      error: "initiative",
    });
    c.step({ type: "moveTo", key: 1 });
    expect(c.session.runnerPosition).toBe(1);
    expect(c.session.run.fight).toBeNull();
  });

  it("iniciativa: 1d10 + REF conferida; cada lado rola a sua; a maior começa", () => {
    const c = chain();
    c.step({ type: "moveTo", key: 2 });
    expect(
      c.step({ type: "initiative", side: "runner", messageId: "m-init-bad" }).result,
    ).toMatchObject({ error: "invalid-roll" });
    expect(
      c.step({ type: "initiative", side: "npc", messageId: "m-npc-init" }).result,
    ).toMatchObject({ error: "not-authorized" });
    c.step({ type: "initiative", side: "runner", messageId: "m-init-low" });
    c.step({ type: "initiative", side: "npc", messageId: "m-npc-init" }, GM);
    expect(turnHolder(c.session)).toBe("ice");
  });

  it("empate a favor da jogadora", () => {
    expect(turnHolder(engaged("m-npc-init-tie").session)).toBe("runner");
  });

  it("Zap da jogadora: Defense da NPC pelo GM; dano no HP dela com a redução cerebral", () => {
    const c = engaged();
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    expect(c.step({ type: "oppose", messageId: "m-npc-def" }).result).toMatchObject({
      error: "not-authorized",
    });
    c.step({ type: "oppose", messageId: "m-npc-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "check", ability: "damage", messageId: "m-dmg" });
    expect(c.session.run.pending).toMatchObject({ rezBefore: 10, rezAfter: 7 });
    const applied = c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(applied.effects).toEqual([
      { type: "setRunnerHp", actorUuid: NPC, value: 7, before: 10 },
    ]);
    expect(c.session.run.npcs[0]?.defeated).toBe(false);
  });

  it("HP 0 derruba a NPC e encerra o combate", () => {
    const c = engaged();
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    c.step({ type: "oppose", messageId: "m-npc-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "check", ability: "damage", messageId: "m-dmg-big" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(c.session.run.npcs[0]?.defeated).toBe(true);
    expect(c.session.run.fight).toBeNull();
    expect(turnHolder(c.session)).toBeNull();
  });

  it("programas: antipessoal contra a NPC sim, antiprograma não", () => {
    const c = engaged();
    expect(
      c.step({
        type: "check",
        ability: "programAttack",
        messageId: "m-hellbolt",
        programId: "p-sword",
      }).result,
    ).toMatchObject({ error: "invalid-program" });
    expect(
      c.step({
        type: "check",
        ability: "programAttack",
        messageId: "m-hellbolt",
        programId: "p-hellbolt",
      }).result,
    ).toMatchObject({ ok: true });
  });

  it("vez da NPC: Zap contra a Defense da jogadora, dano 1d6 no cérebro; ações acabam e a vez volta", () => {
    const c = engaged();
    c.step({ type: "endTurn" });
    expect(turnHolder(c.session)).toBe("ice");
    c.step({ type: "npcAttack", messageId: "m-npc-zap" }, GM);
    expect(c.session.run.pending).toMatchObject({ ability: "npcAttack", programId: null });
    c.step({ type: "oppose", messageId: "m-defense" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(c.session.run.iceHit).toMatchObject({
      target: { kind: "brain", hpBase: 30 },
      byNpc: { actorUuid: NPC, programId: null },
    });
    const dmg = c.step({ type: "iceDamage", messageId: "m-npc-dmg" }, GM);
    expect(dmg.effects).toEqual([
      { type: "setRunnerHp", actorUuid: "Actor.abc", value: 25, before: 30 },
    ]);
    expect(c.session.run.lastIceDamage).toMatchObject({ byNpc: true, result: { kind: "brain" } });
    expect(turnHolder(c.session)).toBe("ice");
    c.step({ type: "npcAttack", messageId: "m-npc-zap2" }, GM);
    c.step({ type: "oppose", messageId: "m-defense2" });
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    expect(turnHolder(c.session)).toBe("runner");
    expect(c.session.run.actionsUsed).toBe(0);
  });

  it("programa da NPC precisa ser antipessoal dela", () => {
    const c = engaged();
    c.step({ type: "endTurn" });
    expect(
      c.step({ type: "npcAttack", messageId: "m-npc-prog", programId: "n-armor" }, GM).result,
    ).toMatchObject({ error: "invalid-program" });
    expect(
      c.step({ type: "npcAttack", messageId: "m-npc-prog", programId: "n-bolt" }, GM).result,
    ).toMatchObject({ ok: true });
    expect(c.session.run.pending).toMatchObject({ programId: "n-bolt" });
  });

  it("NPC vinculada com a jogadora já no nó: npcSync revela", () => {
    const h = { ...harness(), npcLinks: {} as Record<number, string> };
    const c = chain({ ...start(), runnerPosition: 3 }, h);
    expect(c.step({ type: "npcSync" }, GM).session).toBeNull();
    h.npcLinks[3] = NPC;
    c.step({ type: "npcSync" }, GM);
    expect(c.session.run.npcs).toEqual([{ key: 3, actorUuid: NPC, defeated: false }]);
  });

  it("desfazer volta o dano da NPC na jogadora", () => {
    const c = engaged();
    c.step({ type: "endTurn" });
    c.step({ type: "npcAttack", messageId: "m-npc-zap" }, GM);
    c.step({ type: "oppose", messageId: "m-defense" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "iceDamage", messageId: "m-npc-dmg" }, GM);
    expect(c.step({ type: "undo" }, GM).effects).toEqual([
      { type: "setRunnerHp", actorUuid: "Actor.abc", value: 30, before: 25 },
    ]);
    expect(c.session.run.iceHit?.byNpc).toBeTruthy();
  });
});

describe("modo sem confirmação com a NPC (E6-11b)", () => {
  const input = { dvOf: () => null, readIce: () => null };

  it("rola a iniciativa e a Defense da NPC e o dano do acerto dela", async () => {
    const { nextAutoStep } = await import("../../src/session/autopilot");
    const c = chain();
    c.step({ type: "moveTo", key: 2 });
    expect(nextAutoStep(c.session, input)).toMatchObject({ kind: "rollNpcInitiative", link: NPC });
    c.step({ type: "initiative", side: "runner", messageId: "m-init" });
    c.step({ type: "initiative", side: "npc", messageId: "m-npc-init" }, GM);
    expect(nextAutoStep(c.session, input)).toBeNull();
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    expect(nextAutoStep(c.session, input)).toMatchObject({ kind: "rollNpcDefense", link: NPC });
    c.step({ type: "oppose", messageId: "m-npc-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    c.step({ type: "endTurn" });
    c.step({ type: "npcAttack", messageId: "m-npc-zap" }, GM);
    expect(nextAutoStep(c.session, input)).toBeNull();
    c.step({ type: "oppose", messageId: "m-defense" });
    expect(nextAutoStep(c.session, input)).toMatchObject({ kind: "resolve", outcome: "success" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(nextAutoStep(c.session, input)).toMatchObject({
      kind: "rollNpcDamage",
      link: NPC,
      programId: null,
    });
  });
});

describe("registro do combate com a NPC (E6-11b)", () => {
  it("marca revelação, iniciativas, vez e dano como da NPC", () => {
    const c = engaged();
    c.step({ type: "check", ability: "zap", messageId: "m-zap" });
    c.step({ type: "oppose", messageId: "m-npc-def" }, GM);
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "check", ability: "damage", messageId: "m-dmg" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    c.step({ type: "endTurn" });
    const log = c.session.log.map((e) => [e.event, e.data]);
    expect(log).toContainEqual(["npc", { key: 2 }]);
    expect(log).toContainEqual(["initiative", { side: "runner", total: 12 }]);
    expect(log).toContainEqual(["initiative", { side: "npc", total: 10 }]);
    expect(log).toContainEqual([
      "outcome",
      {
        ability: "damage",
        outcome: "success",
        key: 2,
        total: 4,
        npc: true,
        rezBefore: 10,
        rezAfter: 7,
      },
    ]);
    expect(log.at(-1)).toEqual(["turn", { holder: "ice", npc: true }]);
  });
});

describe("faixas do combate com a NPC (E6-11b)", () => {
  it("troca de vez mostra a faixa da NPC", async () => {
    const { diffFx } = await import("../../src/session/hud-fx");
    const c = engaged();
    const before = c.session;
    c.step({ type: "endTurn" });
    expect(diffFx(before, c.session).banner).toBe("npc-turn");
  });
});

describe("GM arrasta a Netrunner NPC (E6-11b)", () => {
  const deeper = (): NetArchitecture => {
    const a = arch();
    return {
      ...a,
      floors: [
        ...a.floors,
        {
          key: 4,
          floor: 4,
          branch: "a",
          content: "file",
          blackIceKey: null,
          dv: 8,
          description: "",
        },
      ],
    };
  };
  const withDeeper = (session: PublicSession): PublicSession => {
    const extra = deeper().floors.find((f) => f.key === 4);
    const net = session.netArch;
    return extra && net
      ? { ...session, netArch: { ...net, discovered: [...net.discovered, toPublicFloor(extra)] } }
      : session;
  };
  const deepHarness = (links: Record<number, string>): Harness => ({
    ...harness(),
    architecture: deeper(),
    npcLinks: links,
  });
  function applyMoves(h: Harness, effects: unknown[]) {
    for (const e of effects as Array<{
      type: string;
      from: number;
      to: number;
      actorUuid: string;
    }>) {
      if (e.type !== "moveNpcLink" || !h.npcLinks) continue;
      Reflect.deleteProperty(h.npcLinks, e.from);
      h.npcLinks[e.to] = e.actorUuid;
    }
  }

  it("oculta: move só a flag, sem nada público nem no registro", () => {
    const h = deepHarness({ 2: NPC });
    const c = chain(withDeeper(start()), h);
    const out = c.step({ type: "moveNpc", from: 2, to: 4 }, GM);
    expect(out.effects).toEqual([
      { type: "moveNpcLink", itemUuid: "Item.arch01", actorUuid: NPC, from: 2, to: 4 },
    ]);
    expect(c.session.run.npcs).toEqual([]);
    expect(c.session.log).toEqual([]);
    expect(JSON.stringify(c.session)).not.toContain(NPC);
  });

  it("vai para qualquer nó, menos Black ICE e nó com outra NPC", () => {
    const c = chain(withDeeper(start()), deepHarness({ 2: NPC, 3: "Actor.other" }));
    expect(c.step({ type: "moveNpc", from: 2, to: 1 }, GM).result).toMatchObject({
      error: "invalid-target",
    });
    expect(c.step({ type: "moveNpc", from: 2, to: 3 }, GM).result).toMatchObject({
      error: "invalid-target",
    });
    expect(c.step({ type: "moveNpc", from: 2, to: 0 }).result).toMatchObject({
      error: "not-authorized",
    });
    expect(c.step({ type: "moveNpc", from: 2, to: 0 }, GM).result).toMatchObject({ ok: true });
  });

  it("entra no nó da jogadora: aparece e abre o combate; sai: some e o combate acaba", () => {
    const h = deepHarness({ 4: NPC });
    const c = chain({ ...withDeeper(start()), runnerPosition: 2 }, h);
    applyMoves(h, c.step({ type: "moveNpc", from: 4, to: 2 }, GM).effects);
    expect(c.session.run.npcs).toEqual([{ key: 2, actorUuid: NPC, defeated: false }]);
    expect(c.session.run.fight).toMatchObject({ key: 2, runnerInit: null });
    applyMoves(h, c.step({ type: "moveNpc", from: 2, to: 4 }, GM).effects);
    expect(c.session.run.npcs).toEqual([]);
    expect(c.session.run.fight).toBeNull();
    expect(c.session.log.map((e) => e.event)).toEqual(["npc", "npcLeft"]);
  });

  it("o movimento não entra no histórico público (não vaza a NPC oculta)", () => {
    const c = chain(withDeeper(start()), deepHarness({ 2: NPC }));
    c.step({ type: "moveNpc", from: 2, to: 4 }, GM);
    expect(c.session.history).toEqual([]);
    expect(c.step({ type: "undo" }, GM).result).toMatchObject({ error: "nothing-to-undo" });
  });
});

describe("Armor e Flak contra a NPC (D45)", () => {
  function engagedWith(h: Harness) {
    const c = chain(start(), h);
    c.step({ type: "moveTo", key: 2 });
    c.step({ type: "initiative", side: "runner", messageId: "m-init" });
    c.step({ type: "initiative", side: "npc", messageId: "m-npc-init" }, GM);
    c.step({ type: "endTurn" });
    return c;
  }

  it("Flak ligado zera o ATK do programa atacante da NPC; o Zap não muda", () => {
    const h = harness();
    h.runner = {
      ...DECK,
      programs: [
        { itemId: "p-flak", name: "Flak", programClass: "defender", rezzed: true, rez: 7 },
      ],
    };
    h.resources = {
      [NPC]: {
        interfaceRank: 4,
        hasCyberdeck: true,
        programs: [
          { itemId: "n-bolt", programClass: "antipersonnelattacker", rezzed: false, atk: 3 },
        ],
      },
    };
    const c = engagedWith(h);
    c.step({ type: "npcAttack", messageId: "m-npc-prog", programId: "n-bolt" }, GM);
    expect(c.session.run.pending).toMatchObject({ ability: "npcAttack", total: 13 });
    c.step({ type: "oppose", messageId: "m-defense" });
    c.step({ type: "resolveCheck", outcome: "failure" }, GM);
    c.step({ type: "npcAttack", messageId: "m-npc-zap" }, GM);
    expect(c.session.run.pending).toMatchObject({ total: 13, programId: null });
  });

  it("Armor ligado reduz em 4 o dano no cérebro vindo da NPC", () => {
    const h = harness();
    h.runner = {
      ...DECK,
      programs: [
        { itemId: "p-armor", name: "Armor", programClass: "defender", rezzed: true, rez: 7 },
      ],
    };
    const c = engagedWith(h);
    c.step({ type: "npcAttack", messageId: "m-npc-zap" }, GM);
    c.step({ type: "oppose", messageId: "m-defense" });
    c.step({ type: "resolveCheck", outcome: "success" }, GM);
    expect(c.session.run.iceHit).toMatchObject({ target: { kind: "brain", reduction: 4 } });
    const dmg = c.step({ type: "iceDamage", messageId: "m-npc-dmg" }, GM);
    expect(dmg.effects).toEqual([
      { type: "setRunnerHp", actorUuid: "Actor.abc", value: 29, before: 30 },
    ]);
  });
});
