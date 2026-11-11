import { SYSTEM_ID, TESTED_SYSTEM_VERSION } from "./constants";

export interface SystemInfo {
  id: string;
  version: string;
}

export type CompatibilityResult =
  | { status: "supported" }
  | { status: "untested-version"; tested: string; found: string }
  | { status: "wrong-system"; found: string };

/** Classifica o sistema ativo do mundo; não acessa o Foundry. */
export function checkSystemCompatibility(system: SystemInfo): CompatibilityResult {
  if (system.id !== SYSTEM_ID) return { status: "wrong-system", found: system.id };
  if (system.version !== TESTED_SYSTEM_VERSION) {
    return { status: "untested-version", tested: TESTED_SYSTEM_VERSION, found: system.version };
  }
  return { status: "supported" };
}
