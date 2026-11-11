/**
 * Visão normalizada do personagem para o HUD. A ficha nativa continua sendo a
 * fonte de verdade: este snapshot é derivado e descartável (E1-01, R05).
 */
export interface NetRoleSnapshot {
  itemId: string;
  /** Nome da habilidade principal, ex.: "Interface". */
  abilityName: string;
  rank: number;
}

export interface CyberdeckSnapshot {
  itemId: string;
  name: string;
}

/**
 * Estado do programa (regras de programas do Core, D40):
 * - rezzed: `isRezzed` verdadeiro, com efeito;
 * - stored: instalado, desligado;
 * - neutralized: REZ chegou a 0 em execução; sem efeito até derrezzar (1 ação) e rezzar de novo
 *   (1 ação, volta com o REZ cheio). Marca do módulo no item;
 * - destroyed: apagado por um efeito que destrói (ex.: Dragon); não volta. Marca do módulo.
 * REZ 0 sozinho não destrói (Core).
 */
export type ProgramStatus = "rezzed" | "stored" | "neutralized" | "destroyed";

export interface ProgramSnapshot {
  itemId: string;
  name: string;
  programClass: string;
  status: ProgramStatus;
  rez: { value: number; max: number };
  stats: { atk: number; def: number; per: number; spd: number };
}

export type SnapshotIssue =
  | { code: "no-net-role" }
  | { code: "no-equipped-cyberdeck" }
  | { code: "multiple-equipped-cyberdecks"; itemIds: string[] }
  | { code: "missing-installed-item"; itemId: string }
  | { code: "invalid-item-data"; itemId: string; field: string };

export interface CharacterSnapshot {
  actorUuid: string;
  actorName: string;
  actorType: string;
  netRole: NetRoleSnapshot | null;
  cyberdeck: CyberdeckSnapshot | null;
  programs: ProgramSnapshot[];
  issues: SnapshotIssue[];
}
