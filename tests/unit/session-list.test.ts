import { describe, expect, it } from "vitest";
import {
  canStart,
  MAX_SESSIONS,
  newestSessions,
  parseSessions,
  pickSession,
  replaceSession,
} from "../../src/session/session-list";
import { createSession, type PublicSession } from "../../src/session/session-state";

function make(id: string, actor: string, controller: string | null = null): PublicSession {
  return createSession(
    { actorUuid: actor, controllerUserId: controller, netArch: null },
    { id, now: 1 },
  );
}

describe("lista de sessões (E6-11a, D36)", () => {
  it("parser descarta inválidas, ids e atores repetidos e respeita o limite", () => {
    const a = make("s1", "Actor.a");
    const raw = JSON.parse(
      JSON.stringify([
        a,
        { nope: true },
        { ...a },
        { ...make("s2", "Actor.a") },
        make("s3", "Actor.b"),
        make("s4", "Actor.c"),
        make("s5", "Actor.d"),
        make("s6", "Actor.e"),
      ]),
    ) as unknown;
    const list = parseSessions(raw);
    expect(list.map((s) => s.id)).toEqual(["s1", "s3", "s4", "s5"]);
    expect(list).toHaveLength(MAX_SESSIONS);
    expect(parseSessions(null)).toEqual([]);
  });

  it("troca, acrescenta e remove sem mexer nas outras", () => {
    const s2 = make("s2", "Actor.b");
    const list = [make("s1", "Actor.a"), s2];
    const next = { ...s2, revision: 5 };
    expect(replaceSession(list, "s2", next).map((s) => s.revision)).toEqual([1, 5]);
    expect(replaceSession(list, "s3", make("s3", "Actor.c")).map((s) => s.id)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
    expect(replaceSession(list, "s1", null).map((s) => s.id)).toEqual(["s2"]);
  });

  it("autoridade usa a mais nova por sessão e esquece as encerradas", () => {
    const s1 = make("s1", "Actor.a");
    const s2 = make("s2", "Actor.b");
    const written = new Map<string, PublicSession | null>([
      ["s1", { ...s1, revision: 3 }],
      ["s2", null],
      ["s3", make("s3", "Actor.c")],
    ]);
    const list = newestSessions([{ ...s1, revision: 2 }, s2], written);
    expect(list.map((s) => [s.id, s.revision])).toEqual([
      ["s1", 3],
      ["s3", 1],
    ]);
    // Servidor já à frente: vale a armazenada.
    expect(newestSessions([{ ...s1, revision: 4 }], written)[0]?.revision).toBe(4);
  });

  it("uma invasão por ator e no máximo o limite", () => {
    const list = [make("s1", "Actor.a")];
    expect(canStart(list, "Actor.a")).toBe("actor-busy");
    expect(canStart(list, "Actor.b")).toBe("ok");
    const full = ["a", "b", "c", "d"].map((x, i) => make(`s${i}`, `Actor.${x}`));
    expect(canStart(full, "Actor.z")).toBe("full");
  });

  it("aba padrão: a atual, senão a que o usuário controla, senão a primeira", () => {
    const list = [make("s1", "Actor.a", "u1"), make("s2", "Actor.b", "u2")];
    expect(pickSession(list, "s1", "u2")).toBe("s1");
    expect(pickSession(list, null, "u2")).toBe("s2");
    expect(pickSession(list, "gone", "gm")).toBe("s1");
    expect(pickSession([], null, "u1")).toBeNull();
  });
});
