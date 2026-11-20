// Textura Água: Pedra na margem; nas manchas, espelho d'água com ondas em anéis, marola e pedras que saem da água (gerar.py, Gr.tex_agua).
// O teto do relevo da Água é maior que o das outras texturas (tetoDe em textura.ts).
import { mapa, ruido } from './ruido'
import { pedra } from './pedra'
import { seixos } from './seixos'
import type { Opcoes } from './bloco'

export const AGUA = { // nome: [padrão, mín, máx, rótulo]
  manchas: [.38, 0, 1, 'Limiar das poças (maior = menos água)'], nivel: [2, 0, 2.5, 'Nível da água (mm abaixo do topo)'],
  onda: [.3, 0, 1, 'Ondas (mm)'], marola: [.15, 0, .6, 'Marola (mm)'], seixos: [.2, 0, 1, 'Pedras na água (fração)'],
} as const
export type KnobsAgua = { -readonly [k in keyof typeof AGUA]: number }

/** `o` = opções completas: fora da poça vale a Pedra com os ajustes `o.pedra`. */
export function agua(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsAgua, o: Opcoes) {
  const n = ruido(x, y, z, .05, 2), lim = k.manchas - desg * .2, m = mapa(n, lim, lim + .2, 0, 1)
  const base = m < 1 ? pedra(x, y, z, tam, prof, desg, o.pedra) : 0
  if (m <= 0) return base
  const onda = (.5 + Math.sin(n * 55) * .5) * k.onda + ruido(x, y, z, .35, 2) * k.marola
  const a = Math.min(k.nivel + onda, seixos(x, y, z, tam * .9, k.seixos + desg * .1, 1.2))
  return base * (1 - m) + a * m
}
