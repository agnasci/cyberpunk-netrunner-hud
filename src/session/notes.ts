import type { NetArchitecture, NetFloorContent } from "../domain/net-architecture";
import {
  MAX_PATH,
  MAX_TEXT,
  type NodeSecret,
  parseOptions,
  secretFor,
} from "../domain/node-secrets";
import type { PublicSession, ViewerIdentity } from "./session-state";

export interface RevealedNote extends NodeSecret {
  text?: string;
}

export type RevealedNotes = Record<number, RevealedNote>;

const REVEALABLE: ReadonlySet<NetFloorContent> = new Set(["password", "file", "controlnode"]);
const MAX_NOTE = 2000;

export function revealedNotes(
  session: PublicSession,
  architecture: NetArchitecture | null,
  sender: ViewerIdentity,
): RevealedNotes | null {
  if (!sender.isGM && session.controllerUserId !== sender.id) return null;
  const notes: RevealedNotes = {};
  for (const floor of architecture?.floors ?? []) {
    if (!REVEALABLE.has(floor.content) || !session.run.cleared.includes(floor.key)) continue;
    const note: RevealedNote = secretFor(floor.content, architecture?.secrets?.[floor.key]);
    if (floor.content !== "controlnode" && floor.description.trim() !== "") {
      note.text = floor.description;
    }
    if (Object.keys(note).length > 0) notes[floor.key] = note;
  }
  return notes;
}

function clip(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value !== "" ? value.slice(0, max) : undefined;
}

export function sanitizeNotes(value: unknown): RevealedNotes {
  const notes: RevealedNotes = {};
  if (typeof value !== "object" || value === null) return notes;
  for (const [key, raw] of Object.entries(value)) {
    const k = Number(key);
    if (!Number.isInteger(k) || k < 0 || typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const note: RevealedNote = {};
    const fields = {
      text: clip(r["text"], MAX_NOTE),
      password: clip(r["password"], MAX_TEXT),
      image: clip(r["image"], MAX_PATH),
      journal: clip(r["journal"], MAX_TEXT),
      options: parseOptions(r["options"]),
    };
    for (const [field, v] of Object.entries(fields)) {
      if (v !== undefined) Object.assign(note, { [field]: v });
    }
    if (Object.keys(note).length > 0) notes[k] = note;
  }
  return notes;
}
