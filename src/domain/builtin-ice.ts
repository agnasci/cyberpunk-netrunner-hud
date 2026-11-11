/// <reference types="vite/client" />
import type { IceClass } from "./ice-hit";

/**
 * Black ICE básicos sempre disponíveis no vínculo (E6-12, D38). Só dados de jogo (nome,
 * classe, atributos, dano, custo) e um resumo curto do efeito escrito para o módulo; o texto
 * e a aparência ficam no livro. Fonte: tabela de Black ICE do livro, enviada pelo usuário.
 * `damage` = fórmula do acerto; `null` = efeito especial, sem dano em dados (o GM aplica).
 */
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
  /** Preço de mercado em eb. */
  cost: number;
  /** Resumo próprio do efeito (inglês, como os nomes do sistema). */
  effect: string;
  /** Dano que derrezzaria o programa o destrói (D40). */
  destroysProgram?: boolean;
}

/**
 * Os dados ficam em `builtin-ice.local.ts`, fora do git (D41): sem o arquivo (versão pública),
 * a lista é vazia e o módulo não cria nem oferece Black ICE básicos.
 */
const local = import.meta.glob<{ BUILTIN_ICE_DATA: readonly BuiltinIce[] }>(
  "./builtin-ice.local.ts",
  { eager: true },
);
export const BUILTIN_ICE: readonly BuiltinIce[] = Object.values(local)[0]?.BUILTIN_ICE_DATA ?? [];

/** Prefixo do valor no seletor de vínculo: ainda não criado no mundo. */
export const BUILTIN_PREFIX = "builtin:";

export function builtinById(id: string): BuiltinIce | null {
  return BUILTIN_ICE.find((b) => b.id === id) ?? null;
}
