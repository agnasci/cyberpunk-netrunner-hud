export const LOG_EVENTS = [
  "jackIn",
  "jackOut",
  "move",
  "reveal",
  "outcome",
  "damageSkipped",
  "iceDamage",
  "cleared",
  "restored",
  "rez",
  "turn",
  "newTurn",
  "actions",
  "undo",
  "npc",
  "initiative",
  "npcDefeated",
  "npcLeft",
  "ambush",
  "iceTarget",
  "controlOption",
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

export type LogValue = string | number | boolean;

export interface LogEntry {
  seq: number;
  event: LogEvent;
  turn: number;
  data: Record<string, LogValue>;
}

export const LOG_LIMIT = 30;
const MAX_FIELDS = 8;
const MAX_TEXT = 64;

function isValue(value: unknown): value is LogValue {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isInteger(value) && Math.abs(value) < 1e6;
  return typeof value === "string" && value.length <= MAX_TEXT;
}

export function parseLogEntry(value: unknown): LogEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const { seq, event, turn, data } = value as Record<string, unknown>;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1) return null;
  if (typeof turn !== "number" || !Number.isInteger(turn) || turn < 0) return null;
  const kind = LOG_EVENTS.find((e) => e === event);
  if (!kind || typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length > MAX_FIELDS) return null;
  const clean: Record<string, LogValue> = {};
  for (const [k, v] of entries) {
    if (k.length > 16 || !isValue(v)) return null;
    clean[k] = v;
  }
  return { seq, event: kind, turn, data: clean };
}

export function parseLog(value: unknown): LogEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-LOG_LIMIT)
    .map(parseLogEntry)
    .filter((e): e is LogEntry => e !== null);
}
