import type { NetFloorContent } from "./net-architecture";

export interface NodeSecret {
  password?: string;
  image?: string;
  journal?: string;
  options?: string[];
}

export type NodeSecrets = Record<number, NodeSecret>;

export const MAX_OPTIONS = 8;
export const MAX_TEXT = 64;
export const MAX_PATH = 256;

const FIELDS_BY_CONTENT: Record<NetFloorContent, ReadonlyArray<keyof NodeSecret>> = {
  password: ["password"],
  file: ["image", "journal"],
  controlnode: ["options"],
  blackice: [],
};

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed.slice(0, max);
}

export function parseOptions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .map((v) => text(v, MAX_TEXT))
    .filter((v): v is string => v !== undefined)
    .slice(0, MAX_OPTIONS);
  return options.length > 0 ? options : undefined;
}

export function parseNodeSecret(value: unknown): NodeSecret | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const secret: NodeSecret = {};
  const password = text(v["password"], MAX_TEXT);
  const image = text(v["image"], MAX_PATH);
  const journal = text(v["journal"], MAX_TEXT);
  const options = parseOptions(v["options"]);
  if (password) secret.password = password;
  if (image) secret.image = image;
  if (journal) secret.journal = journal;
  if (options) secret.options = options;
  return Object.keys(secret).length > 0 ? secret : null;
}

export function secretList(secrets: NodeSecrets): Array<NodeSecret & { key: number }> {
  return Object.entries(secrets).map(([key, secret]) => ({ key: Number(key), ...secret }));
}

export function parseSecretList(value: unknown): NodeSecrets {
  const secrets: NodeSecrets = {};
  if (!Array.isArray(value)) return secrets;
  for (const raw of value) {
    const key = (raw as { key?: unknown } | null)?.key;
    const secret = parseNodeSecret(raw);
    if (typeof key === "number" && Number.isInteger(key) && key >= 0 && secret) {
      secrets[key] = secret;
    }
  }
  return secrets;
}

export function secretFor(content: NetFloorContent, secret: NodeSecret | undefined): NodeSecret {
  const kept: NodeSecret = {};
  for (const field of FIELDS_BY_CONTENT[content]) {
    const value = secret?.[field];
    if (value !== undefined) Object.assign(kept, { [field]: value });
  }
  return kept;
}
