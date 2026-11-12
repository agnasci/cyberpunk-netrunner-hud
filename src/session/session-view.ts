import type {
  CharacterSnapshot,
  ProgramSnapshot,
  ProgramStatus,
  SnapshotIssue,
} from "../domain/character";
import type { ViewerRole } from "./session-state";

export type SessionProgramView =
  | { itemId: string; name: string; status: ProgramStatus; programClass: string }
  | (Pick<ProgramSnapshot, "itemId" | "name" | "status" | "programClass" | "rez" | "stats"> & {
      detailed: true;
    });

export interface SessionHudView {
  role: ViewerRole;
  actorMissing: boolean;
  actorName: string;
  cyberdeckName: string | null;
  netRole: { abilityName: string; rank: number } | null;
  programs: SessionProgramView[];
  issues: SnapshotIssue[];
  isController: boolean;
  canEndSession: boolean;
}

export function buildSessionHudView(
  snapshot: CharacterSnapshot | null,
  role: ViewerRole,
): SessionHudView {
  const detailed = role !== "spectator";
  const programs: SessionProgramView[] = (snapshot?.programs ?? []).map((p) =>
    detailed
      ? {
          itemId: p.itemId,
          name: p.name,
          status: p.status,
          programClass: p.programClass,
          rez: p.rez,
          stats: p.stats,
          detailed: true,
        }
      : { itemId: p.itemId, name: p.name, status: p.status, programClass: p.programClass },
  );
  return {
    role,
    actorMissing: snapshot === null,
    actorName: snapshot?.actorName ?? "",
    cyberdeckName: snapshot?.cyberdeck?.name ?? null,
    netRole: snapshot?.netRole
      ? { abilityName: snapshot.netRole.abilityName, rank: snapshot.netRole.rank }
      : null,
    programs,
    issues: detailed ? (snapshot?.issues ?? []) : [],
    isController: role === "netrunner",
    canEndSession: role === "gm",
  };
}
