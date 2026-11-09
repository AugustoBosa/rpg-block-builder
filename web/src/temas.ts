// Temas (predefinições): os 13 do TEMAS de gerar.py, só dados. Escolher um tema muda controles; nada é salvo.
import type { Opcoes } from './bloco'

export const TEXTURAS = ['pedra', 'lajota', 'rachado', 'tijolo', 'tabuas', 'terra', 'areia', 'agua', 'lava', 'nichos', 'glifos', 'caverna', 'casco', 'metal', 'lisa'] as const // ids 0..14 do gerar.py
export type Textura = typeof TEXTURAS[number]
/** Texturas que a web já sabe gerar. Quem pede outra cai para 'pedra'. */
export const TEXTURAS_DISPONIVEIS: readonly Textura[] = ['pedra', 'lisa', 'lajota', 'tijolo', 'terra', 'areia', 'rachado', 'tabuas']
export const texturaDe = (t: Textura): Textura => TEXTURAS_DISPONIVEIS.includes(t) ? t : 'pedra'

type Tema = { nome: string; piso: Textura; parede: Textura; desgaste: number; tamanho_pedra: number }
const T = (nome: string, piso: number, parede: number, desgaste: number, tamanho_pedra: number): Tema =>
  ({ nome, piso: TEXTURAS[piso], parede: TEXTURAS[parede], desgaste, tamanho_pedra })
export const TEMAS: Record<string, Tema> = {
  dungeon: T('Dungeon', 0, 0, .5, 10), castelo: T('Castelo', 1, 3, .35, 12), ruina: T('Ruína', 2, 3, .9, 10), taverna: T('Taverna', 4, 4, .5, 8),
  pantano: T('Pântano', 5, 3, .8, 9), deserto: T('Deserto', 6, 3, .5, 10), inundada: T('Inundada', 7, 0, .5, 10), vulcao: T('Vulcão', 8, 0, .6, 13),
  caverna: T('Caverna', 11, 11, .8, 12), cripta: T('Cripta', 1, 9, .6, 9), templo: T('Templo', 6, 10, .4, 10), navio: T('Navio', 4, 12, .5, 10),
  forja: T('Forja', 13, 13, .3, 10),
}

/** Grava desgaste, tamanho da pedra e texturas de piso e parede em `o`. Devolve as texturas efetivas (piso e parede) para quem já souber usá-las. */
export function aplicaTema(o: Opcoes, t: Tema) {
  o.desgaste = t.desgaste; o.tamanho_pedra = t.tamanho_pedra
  const piso = texturaDe(t.piso), parede = texturaDe(t.parede)
  o.textura = piso as Opcoes['textura']
  o.texturaParede = parede === piso ? '' : parede as Opcoes['textura']
  return { piso, parede }
}
