export interface NetRoleSnapshot {
  itemId: string;
  abilityName: string;
  rank: number;
}

export interface CyberdeckSnapshot {
  itemId: string;
  name: string;
}

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
