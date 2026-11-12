import type { CprActorSource, CprItemSource } from "../../src/integrations/cpr/character-adapter";

export function role(id: string, rank: number, mainRoleAbility = "Interface"): CprItemSource {
  return { id, name: `Role ${id}`, type: "role", system: { rank, mainRoleAbility } };
}

export function cyberdeck(id: string, equipped: string, installed: string[]): CprItemSource {
  return {
    id,
    name: `Deck ${id}`,
    type: "cyberdeck",
    system: { equipped, installedItems: { list: installed } },
  };
}

export function program(
  id: string,
  overrides: Partial<{ isRezzed: boolean; rez: unknown; class: string }> = {},
): CprItemSource {
  return {
    id,
    name: `Programa ${id}`,
    type: "program",
    system: {
      class: overrides.class ?? "booster",
      isRezzed: overrides.isRezzed ?? false,
      rez: overrides.rez ?? { value: 7, max: 7 },
      atk: 1,
      def: 2,
      per: 3,
      spd: 4,
    },
  };
}

export function actor(items: CprItemSource[], activeNetRole = "role1"): CprActorSource {
  return {
    uuid: "Actor.synthetic01",
    name: "Netrunner Sintética",
    type: "character",
    system: { roleInfo: { activeNetRole } },
    items,
  };
}
