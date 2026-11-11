import type { DemoFloor, DemoProgram } from "./demo-state";

/**
 * Dados sintéticos do protótipo visual (E1-00). Nomes inventados; nenhum valor
 * aqui representa regra, estatística ou conteúdo do livro.
 */
export const DEMO_ARCHITECTURE_NAME = "HALCYON MERIDIAN // NÓ 03";

export const DEMO_RUNNER = {
  handle: "GLITCH//VOX",
  deck: "Deck sintético MK-II",
  interface: 6,
};

export const DEMO_FLOORS: readonly DemoFloor[] = [
  { floor: 1, branch: "a", content: "password", dv: 6, label: "Portão de credenciais" },
  { floor: 2, branch: "a", content: "file", dv: 6, label: "Registros de folha" },
  { floor: 3, branch: "a", content: "blackice", dv: null, label: "WARDEN-7", iceRez: 9 },
  { floor: 4, branch: "a", content: "password", dv: 8, label: "Cofre interno" },
  { floor: 5, branch: "a", content: "blackice", dv: null, label: "MIRROR-HOUND", iceRez: 12 },
  { floor: 6, branch: "a", content: "controlnode", dv: 8, label: "Câmeras do saguão" },
];

export const DEMO_PROGRAMS: readonly DemoProgram[] = [
  { id: "p1", name: "Lâmina-Ø", kind: "attacker", rezzed: true, rez: 7, rezMax: 7 },
  { id: "p2", name: "Escudo de Fase", kind: "defender", rezzed: true, rez: 5, rezMax: 7 },
  { id: "p3", name: "Sonda Espectral", kind: "booster", rezzed: false, rez: 4, rezMax: 4 },
];
