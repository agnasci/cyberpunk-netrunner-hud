/// <reference types="vite/client" />
import type { IceClass } from "./ice-hit";

export interface BuiltinIce {
  id: string;
  name: string;
  iceClass: Extract<IceClass, "antipersonnel" | "antiprogram">;
  per: number;
  spd: number;
  atk: number;
  def: number;
  rez: number;
  damage: string | null;
  cost: number;
  effect: string;
  destroysProgram?: boolean;
}

const local = import.meta.glob<{ BUILTIN_ICE_DATA: readonly BuiltinIce[] }>(
  "./builtin-ice.local.ts",
  { eager: true },
);
export const BUILTIN_ICE: readonly BuiltinIce[] = Object.values(local)[0]?.BUILTIN_ICE_DATA ?? [];

export const BUILTIN_PREFIX = "builtin:";

export function builtinById(id: string): BuiltinIce | null {
  return BUILTIN_ICE.find((b) => b.id === id) ?? null;
}
