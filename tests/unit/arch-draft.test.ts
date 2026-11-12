import { describe, expect, it } from "vitest";
import {
  type ArchDraft,
  draftIssues,
  editorGrid,
  lockConflicts,
  moveNode,
  parseDraft,
  patchNode,
  placeNode,
  removeNode,
  toFloor,
} from "../../src/domain/arch-draft";
import type { NetFloorContent } from "../../src/domain/net-architecture";
import { normalizeNetArch, toCprFloors } from "../../src/integrations/cpr/netarch-adapter";

const empty: ArchDraft = { name: "Test", nodes: [] };

function build(cells: Array<[NetFloorContent, number, string]>): ArchDraft {
  return cells.reduce((d, [content, floor, branch]) => {
    const r = placeNode(d, content, floor, branch);
    if (!r.ok) throw new Error(r.error);
    return r.draft;
  }, empty);
}

describe("rascunho do editor (E7-01)", () => {
  it("chave nova é a maior + 1 e não reaproveita chave removida", () => {
    let d = build([
      ["password", 1, "a"],
      ["file", 2, "a"],
    ]);
    expect(d.nodes.map((n) => n.key)).toEqual([0, 1]);
    const removed = removeNode(d, 0);
    if (!removed.ok) throw new Error();
    d = removed.draft;
    const placed = placeNode(d, "controlnode", 1, "a");
    expect(placed.ok && placed.key).toBe(2);
  });

  it("não coloca em célula ocupada nem fora da grade do CPR", () => {
    const d = build([["password", 1, "a"]]);
    expect(placeNode(d, "file", 1, "a")).toEqual({ ok: false, error: "invalid" });
    expect(placeNode(d, "file", 19, "a")).toEqual({ ok: false, error: "out-of-grid" });
    expect(placeNode(d, "file", 2, "i")).toEqual({ ok: false, error: "out-of-grid" });
  });

  it("mover para célula ocupada troca os dois de lugar", () => {
    const d = build([
      ["password", 1, "a"],
      ["file", 2, "a"],
    ]);
    const r = moveNode(d, 0, 2, "a");
    if (!r.ok) throw new Error(r.error);
    expect(r.draft.nodes.map((n) => [n.key, n.floor])).toEqual([
      [1, 1],
      [0, 2],
    ]);
  });

  it("nó travado (sessão ativa) não move, não sai e não troca de tipo; DV e nota mudam", () => {
    const d = build([
      ["password", 1, "a"],
      ["file", 2, "a"],
    ]);
    const locked = new Set([0]);
    expect(moveNode(d, 0, 3, "a", locked)).toEqual({ ok: false, error: "locked" });
    expect(moveNode(d, 1, 1, "a", locked)).toEqual({ ok: false, error: "locked" });
    expect(removeNode(d, 0, locked)).toEqual({ ok: false, error: "locked" });
    expect(patchNode(d, 0, { content: "file" }, locked)).toEqual({ ok: false, error: "locked" });
    const r = patchNode(d, 0, { dv: 8, description: "senha" }, locked);
    expect(r.ok && r.draft.nodes[0]).toMatchObject({ dv: 8, description: "senha" });
  });

  it("trocar o tipo limpa o que não cabe; DV fora das escolhas do CPR é recusado", () => {
    let d = build([["blackice", 1, "a"]]);
    let r = patchNode(d, 0, { blackIceKey: "CPR.x", iceActor: "Actor.1" });
    if (!r.ok) throw new Error();
    d = r.draft;
    r = patchNode(d, 0, { content: "password", npcActor: "Actor.npc" });
    expect(r.ok && r.draft.nodes[0]).toMatchObject({
      blackIceKey: null,
      iceActor: null,
      npcActor: "Actor.npc",
    });
    expect(patchNode(d, 0, { dv: 3 })).toEqual({ ok: false, error: "invalid" });
    const onIce = patchNode(d, 0, { npcActor: "Actor.npc" });
    expect(onIce.ok && onIce.draft.nodes[0]?.npcActor).toBe(null);
  });

  it("avisa sem 1A, nó sem caminho (D28) e Black ICE sem tipo", () => {
    expect(draftIssues(empty)).toEqual([{ code: "empty" }]);
    expect(draftIssues({ name: " ", nodes: [] })[0]).toEqual({ code: "no-name" });
    const noRoot = build([["file", 2, "a"]]);
    expect(draftIssues(noRoot)).toEqual([{ code: "no-root" }]);
    const d = build([
      ["password", 1, "a"],
      ["file", 2, "a"],
      ["blackice", 2, "b"],
      ["controlnode", 4, "a"],
    ]);
    expect(draftIssues(d)).toEqual([
      { code: "ice-type", key: 2 },
      { code: "unreachable", key: 3 },
    ]);
  });

  it("grade tem uma linha e uma branch livres além das usadas, até o limite", () => {
    expect(editorGrid(empty)).toMatchObject({ columns: ["a"], rows: [{ floor: 1 }] });
    const g = editorGrid(build([["password", 3, "b"]]));
    expect(g.columns).toEqual(["a", "b", "c"]);
    expect(g.rows.map((r) => r.floor)).toEqual([1, 2, 3, 4]);
    expect(g.rows[2]?.cells[1]?.node?.content).toBe("password");
    const full = editorGrid(build([["file", 18, "h"]]));
    expect(full.columns).toHaveLength(8);
    expect(full.rows).toHaveLength(18);
  });
});

describe("conversão para o item do CPR (E7-01)", () => {
  it("gera as strings do modelo v0.92.4 e volta igual pela leitura", () => {
    let d = build([
      ["password", 1, "a"],
      ["blackice", 2, "a"],
      ["file", 2, "b"],
    ]);
    const ice = "CPR.netArchitecture.floor.options.blackIce.hellhound";
    for (const [key, patch] of [
      [0, { dv: 8, description: "Porta" }],
      [1, { blackIceKey: ice }],
    ] as const) {
      const r = patchNode(d, key, patch);
      if (!r.ok) throw new Error();
      d = r.draft;
    }
    const floors = toCprFloors(d.nodes);
    expect(floors[0]).toEqual({
      index: 0,
      floor: "1",
      branch: "a",
      content: "CPR.netArchitecture.floor.options.password",
      blackice: "--",
      dv: "8",
      description: "Porta",
    });
    expect(floors[1]).toMatchObject({ content: "CPR.global.programClass.blackice", blackice: ice });
    expect(floors[1]?.dv).toBe("N/A");
    const back = normalizeNetArch({
      uuid: "Item.x",
      name: "X",
      type: "netarch",
      system: { floors },
    });
    expect(back.issues).toEqual([]);
    expect(back.architecture?.floors).toEqual(d.nodes.map(toFloor));
  });

  it("tipo de Black ICE desconhecido vira '--'", () => {
    const [f] = toCprFloors([
      {
        key: 0,
        floor: 1,
        branch: "a",
        content: "blackice",
        blackIceKey: "CPR.netArchitecture.floor.options.blackIce.nope",
        dv: null,
        description: "",
      },
    ]);
    expect(f?.blackice).toBe("--");
  });
});

describe("travas na hora de salvar e rascunho guardado (E7-01)", () => {
  const saved = build([
    ["password", 1, "a"],
    ["file", 2, "a"],
  ]);
  const floors = saved.nodes.map(toFloor);

  it("sem sessão (nada travado) qualquer mudança salva", () => {
    const r = removeNode(saved, 0);
    expect(r.ok && lockConflicts(r.draft, floors, new Set())).toEqual([]);
  });

  it("em uso: nó removido, movido ou com tipo trocado bloqueia; DV e nota não", () => {
    const locked = new Set([0, 1]);
    const removed = removeNode(saved, 0);
    expect(removed.ok && lockConflicts(removed.draft, floors, locked)).toEqual([0]);
    const swapped = moveNode(saved, 0, 2, "a");
    expect(swapped.ok && lockConflicts(swapped.draft, floors, locked)).toEqual([0, 1]);
    const retyped = patchNode(saved, 1, { content: "controlnode" });
    expect(retyped.ok && lockConflicts(retyped.draft, floors, locked)).toEqual([1]);
    const dv = patchNode(saved, 0, { dv: 9, description: "x" });
    expect(dv.ok && lockConflicts(dv.draft, floors, locked)).toEqual([]);
    const added = placeNode(saved, "file", 3, "a");
    expect(added.ok && lockConflicts(added.draft, floors, locked)).toEqual([]);
  });

  it("rascunho guardado volta igual; dado inválido é descartado", () => {
    const r = patchNode(saved, 0, { dv: 8, npcActor: "Actor.n" });
    if (!r.ok) throw new Error();
    expect(parseDraft(JSON.parse(JSON.stringify(r.draft)))).toEqual(r.draft);
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ name: "x", nodes: [{ ...r.draft.nodes[0], dv: 3 }] })).toBeNull();
    expect(parseDraft({ name: "x", nodes: [{ ...r.draft.nodes[0], floor: 19 }] })).toBeNull();
    const dup = r.draft.nodes[0];
    expect(parseDraft({ name: "x", nodes: [dup, { ...dup, key: 5 }] })).toBeNull();
  });
});
