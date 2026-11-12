import { describe, expect, it } from "vitest";
import { parseDraft, patchNode, placeNode } from "../../src/domain/arch-draft";
import type { NetArchitecture } from "../../src/domain/net-architecture";
import { parseSecretList, secretList } from "../../src/domain/node-secrets";
import { revealedNotes, sanitizeNotes } from "../../src/session/notes";
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

function withSecrets(): NetArchitecture {
  return {
    ...arch(),
    secrets: {
      0: { password: "swordfish", image: "nope.webp" },
      2: { image: "worlds/x/cofre.webp", journal: "JournalEntry.abc", password: "nope" },
      3: { options: ["Desligar câmeras", "Abrir a porta"] },
    },
  };
}

const session = (cleared: number[], position: number | null = null): PublicSession => ({
  ...withRun(reveal(base(), [0, 1, 2, 3]), { cleared }),
  runnerPosition: position,
});

describe("dados liberados por nó (D46)", () => {
  it("só nós resolvidos, só os campos do tipo do nó", () => {
    expect(revealedNotes(session([0, 2, 3]), withSecrets(), RUNNER)).toEqual({
      0: { password: "swordfish", text: "senha secreta: swordfish" },
      2: { image: "worlds/x/cofre.webp", journal: "JournalEntry.abc" },
      3: { options: ["Desligar câmeras", "Abrir a porta"] },
    });
    expect(revealedNotes(session([]), withSecrets(), RUNNER)).toEqual({});
    expect(revealedNotes(session([0]), withSecrets(), { id: "x", isGM: false })).toBeNull();
  });

  it("limpa o que chega pelo socket e a lista guardada na flag", () => {
    expect(
      sanitizeNotes({ 1: { password: 5, options: ["", " ok "], extra: "x" }, bad: {}, 2: "x" }),
    ).toEqual({ 1: { options: ["ok"] } });
    const secrets = withSecrets().secrets ?? {};
    expect(parseSecretList(secretList(secrets))).toEqual(secrets);
    expect(parseSecretList([{ key: -1, password: "a" }, { key: 4 }, null])).toEqual({});
  });
});

describe("opções do Control Node (D46)", () => {
  const harness = (): Harness => ({ rolls: {}, ices: {}, architecture: withSecrets() });
  const send = (s: PublicSession, action: unknown, h = harness()) =>
    runWith(h)(s, request(s, action), RUNNER);

  it("controlado e no nó: aciona por 1 ação NET, fica no estado público e no registro", () => {
    const out = send(session([0, 1, 3], 3), { type: "controlOption", index: 1 });
    expect(out.result.ok).toBe(true);
    expect(out.session?.run.actionsUsed).toBe(1);
    expect(out.session?.run.controlChoices).toEqual([{ key: 3, index: 1, label: "Abrir a porta" }]);
    expect(out.session?.log.at(-1)).toMatchObject({
      event: "controlOption",
      data: { key: 3, label: "Abrir a porta" },
    });
  });

  it("recusa sem controle, fora do nó, opção inexistente e espectador", () => {
    expect(send(session([0, 1], 3), { type: "controlOption", index: 0 }).result).toMatchObject({
      error: "not-controlled",
    });
    expect(send(session([0, 1, 3], 2), { type: "controlOption", index: 0 }).result).toMatchObject({
      error: "wrong-node",
    });
    expect(send(session([0, 1, 3], 3), { type: "controlOption", index: 5 }).result).toMatchObject({
      error: "invalid-option",
    });
    const s = session([0, 1, 3], 3);
    const spectator = runWith(harness())(s, request(s, { type: "controlOption", index: 0 }), {
      id: "u-spect",
      isGM: false,
    });
    expect(spectator.result).toMatchObject({ error: "not-authorized" });
    expect(GM.isGM).toBe(true);
  });
});

describe("campos secretos no editor (D46)", () => {
  it("mantém só os campos do tipo e volta igual do rascunho guardado", () => {
    const placed = placeNode({ name: "x", nodes: [], forks: {} }, "password", 1, "a");
    if (!placed.ok) throw new Error(placed.error);
    const patched = patchNode(placed.draft, placed.key, {
      secret: { password: "  hunter2 ", options: ["x"] },
    });
    if (!patched.ok) throw new Error(patched.error);
    expect(patched.draft.nodes[0]?.secret).toEqual({ password: "hunter2" });
    const asFile = patchNode(patched.draft, placed.key, { content: "file" });
    if (!asFile.ok) throw new Error(asFile.error);
    expect(asFile.draft.nodes[0]?.secret).toEqual({});
    expect(parseDraft(JSON.parse(JSON.stringify(patched.draft)))).toEqual(patched.draft);
  });
});
