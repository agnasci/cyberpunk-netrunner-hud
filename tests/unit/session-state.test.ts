import { describe, expect, it } from "vitest";
import type { PublicFloor } from "../../src/domain/net-architecture";
import {
  concealFloor,
  createSession,
  parseSession,
  resolveViewerRole,
  revealFloor,
  toRunState,
} from "../../src/session/session-state";

const password: PublicFloor = {
  key: 0,
  floor: 1,
  branch: "a",
  content: "password",
  blackIceKey: null,
};
const ice: PublicFloor = {
  key: 1,
  floor: 2,
  branch: "a",
  content: "blackice",
  blackIceKey: "CPR.netArchitecture.floor.options.blackIce.hellhound",
};

const valid = {
  schemaVersion: 4,
  id: "s1",
  revision: 1,
  actorUuid: "Actor.abc",
  controllerUserId: "u-runner",
  startedAt: 1000,
  netArch: { itemUuid: "Item.arch01", name: "Arquitetura Sintética", discovered: [], mapped: [] },
  runnerPosition: null,
  run: {
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
    netrunUsed: [],
    atBottom: false,
    allKnown: false,
  },
  history: [],
  log: [],
};

function session() {
  return createSession(
    {
      actorUuid: "Actor.abc",
      controllerUserId: "u-runner",
      netArch: { itemUuid: "Item.arch01", name: "Arquitetura Sintética" },
    },
    { id: "s1", now: 1000 },
  );
}

describe("parseSession", () => {
  it("aceita o estado público válido", () => {
    expect(parseSession(valid)).toEqual(valid);
  });

  it("aceita sessão sem controlador e sem arquitetura", () => {
    const parsed = parseSession({ ...valid, controllerUserId: null, netArch: null });
    expect(parsed?.controllerUserId).toBeNull();
    expect(parsed?.netArch).toBeNull();
  });

  it.each([
    ["nulo", null],
    ["versão anterior", { ...valid, schemaVersion: 2 }],
    ["posição inválida", { ...valid, runnerPosition: -1 }],
    ["sem progresso", { ...valid, run: undefined }],
    ["turno inválido", { ...valid, run: { ...valid.run, turn: 0 } }],
    ["ações negativas", { ...valid, run: { ...valid.run, actionsUsed: -1 } }],
    ["nós resolvidos inválidos", { ...valid, run: { ...valid.run, cleared: "0" } }],
    ["sem ator", { ...valid, actorUuid: "" }],
    ["revisão inválida", { ...valid, revision: "1" }],
    ["controlador inválido", { ...valid, controllerUserId: 7 }],
    ["arquitetura sem item", { ...valid, netArch: { name: "x", discovered: [] } }],
  ])("rejeita estado %s", (_label, value) => {
    expect(parseSession(value)).toBeNull();
  });

  it("migra a versão 3 com turno zerado, sem perder posição e descobertas", () => {
    const v3: Record<string, unknown> = { ...valid, schemaVersion: 3, runnerPosition: 0 };
    delete v3["run"];
    const parsed = parseSession({ ...v3, netArch: { ...valid.netArch, discovered: [password] } });
    expect(parsed?.schemaVersion).toBe(4);
    expect(parsed?.runnerPosition).toBe(0);
    expect(parsed?.netArch?.discovered).toEqual([password]);
    expect(parsed?.run).toEqual(valid.run);
  });

  it("sessão v4 sem os campos de checagem recebe o padrão", () => {
    const old: Record<string, unknown> = { ...valid.run };
    delete old["pending"];
    delete old["usedRolls"];
    delete old["ice"];
    delete old["awaitingDamage"];
    delete old["damageProgram"];
    delete old["lastOutcome"];
    expect(parseSession({ ...valid, run: old })?.run).toEqual(valid.run);
  });

  it("aceita checagem pendente válida e rejeita a malformada", () => {
    const pending = { ability: "backdoor", key: 0, total: 13, messageId: "m1", userId: "u" };
    expect(parseSession({ ...valid, run: { ...valid.run, pending } })?.run.pending).toEqual({
      ...pending,
      opposed: null,
      rezAfter: null,
      rezBefore: null,
      programId: null,
    });
    for (const bad of [{ ...pending, ability: "teleport" }, { ...pending, total: "13" }, "x"]) {
      expect(parseSession({ ...valid, run: { ...valid.run, pending: bad } })).toBeNull();
    }
  });

  it("guarda só as últimas mensagens usadas e descarta ids inválidos", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `m${i}`);
    const parsed = parseSession({ ...valid, run: { ...valid.run, usedRolls: [...ids, 7, ""] } });
    expect(parsed?.run.usedRolls).toEqual(ids.slice(-20));
  });

  it("descarta chaves inválidas ou repetidas no progresso", () => {
    const parsed = parseSession({ ...valid, run: { ...valid.run, cleared: [1, 1, -2, "x", 3] } });
    expect(parsed?.run.cleared).toEqual([1, 3]);
  });

  it("descarta campos desconhecidos, inclusive DV e descrição em nós revelados", () => {
    const parsed = parseSession({
      ...valid,
      secret: "x",
      netArch: { ...valid.netArch, discovered: [{ ...password, dv: 6, description: "segredo" }] },
    });
    expect(parsed).not.toHaveProperty("secret");
    expect(parsed?.netArch?.discovered).toEqual([password]);
  });

  it("ignora nós revelados inválidos ou repetidos", () => {
    const parsed = parseSession({
      ...valid,
      netArch: {
        ...valid.netArch,
        discovered: [
          password,
          { ...password },
          { key: -1, floor: 1, branch: "z", content: "file" },
        ],
      },
    });
    expect(parsed?.netArch?.discovered).toEqual([password]);
  });
});

describe("createSession", () => {
  it("cria revisão 1 sem nada revelado", () => {
    expect(session()).toEqual(valid);
  });
});

describe("revealFloor / concealFloor", () => {
  it("revelar incrementa a revisão e é idempotente", () => {
    const once = revealFloor(session(), password);
    expect(once.revision).toBe(2);
    expect(once.netArch?.discovered).toEqual([password]);
    expect(revealFloor(once, password)).toBe(once);
  });

  it("ocultar remove o nó e incrementa a revisão; ocultar ausente não muda nada", () => {
    const revealed = revealFloor(revealFloor(session(), password), ice);
    const concealed = concealFloor(revealed, 0);
    expect(concealed.netArch?.discovered).toEqual([ice]);
    expect(concealed.revision).toBe(revealed.revision + 1);
    expect(concealFloor(concealed, 0)).toBe(concealed);
  });

  it("revelar sem arquitetura não altera a sessão", () => {
    const noArch = createSession(
      { actorUuid: "Actor.abc", controllerUserId: null, netArch: null },
      { id: "s2", now: 1 },
    );
    expect(revealFloor(noArch, password)).toBe(noArch);
  });
});

describe("resolveViewerRole", () => {
  it("mestre é sempre gm, mesmo se for o controlador", () => {
    expect(
      resolveViewerRole({ ...session(), controllerUserId: "u-gm" }, { id: "u-gm", isGM: true }),
    ).toBe("gm");
  });

  it("controlador designado é netrunner", () => {
    expect(resolveViewerRole(session(), { id: "u-runner", isGM: false })).toBe("netrunner");
  });

  it("demais usuários são espectadores", () => {
    expect(resolveViewerRole(session(), { id: "u-other", isGM: false })).toBe("spectator");
    expect(
      resolveViewerRole({ ...session(), controllerUserId: null }, { id: "u-runner", isGM: false }),
    ).toBe("spectator");
  });
});

describe("toRunState", () => {
  it("resolve a posição pelos nós revelados e converte o progresso", () => {
    const s = { ...revealFloor(session(), ice), runnerPosition: 1 };
    const run = toRunState({
      ...s,
      run: { ...s.run, turn: 2, actionsUsed: 1, cleared: [0], evaded: [1] },
    });
    expect(run.position).toEqual(ice);
    expect(run.actionsUsed).toBe(1);
    expect([...run.cleared]).toEqual([0]);
    expect(run.evaded.has(1)).toBe(true);
  });

  it("desconectada não tem posição", () => {
    expect(toRunState(session()).position).toBeNull();
  });
});
