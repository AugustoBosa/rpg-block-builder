// Textura Lava: Pedra fora do rio; dentro, linhas de fluxo em curva e placas de crosta soltas, mais altas e de borda arredondada (gerar.py, Gr.tex_lava).
import { desloca, grao } from './grade'
import { mapa, ruido, voronoi, type Vor } from './ruido'
import { pedra } from './pedra'
import type { Opcoes } from './bloco'

export const LAVA = { // nome: [padrão, mín, máx, rótulo]
  manchas: [.47, 0, 1, 'Limiar do rio (maior = menos lava)'], nivel: [1.85, 0, 2.5, 'Nível da lava (mm abaixo do topo)'], fluxo: [.4, 0, 1, 'Linhas de fluxo (mm)'],
  crosta_tam: [.8, .2, 3, 'Placas de crosta (× tamanho)'], crosta: [.55, 0, 1, 'Crosta (fração)'], crosta_nivel: [1.2, 0, 2.5, 'Nível da crosta (mm abaixo do topo)'],
} as const
export type KnobsLava = { -readonly [k in keyof typeof LAVA]: number }

const f: Vor = { r0: 0, r1: 0, r2: 0, px: 0, py: 0, borda: 0 }

/** `o` = opções completas: fora do rio vale a Pedra com os ajustes `o.pedra`. */
export function lava(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsLava, o: Opcoes) {
  const X = x + 37, Y = y + 37, Z = z + 37 // rio deslocado: não coincide com as poças da Água
  const lim = k.manchas - desg * .15, m = mapa(ruido(X, Y, Z, .06, 2), lim, lim + .18, 0, 1)
  const base = m < 1 ? pedra(x, y, z, tam, prof, desg, o.pedra) : 0
  if (m <= 0) return base
  const c = tam * k.crosta_tam, a = c * .2
  voronoi(desloca(x, x, y, z, a, .12, 21), desloca(y, x, y, z, a, .12, 22), z, 1 / c, f) // z sem distorção: desempenho
  const crosta = k.crosta_nivel + f.r1 * .25 + mapa(f.borda * c, 0, 1.4, 1, 0) * 9 + (f.r0 < 1 - k.crosta + desg * .25 ? 9 : 0)
  // fluxo >= nivel: onde a crosta já é mais baixa que o nível, o ruído do fluxo nem entra (mesmo resultado, menos custo)
  const rio = crosta <= k.nivel ? crosta : Math.min(k.nivel + (.5 + Math.sin(ruido(X, Y, Z, .07, 2) * 45) * .5) * k.fluxo, crosta)
  return base * (1 - m) + (rio + grao(x, y, z, .05)) * m
}
