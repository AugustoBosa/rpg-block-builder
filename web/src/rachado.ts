// Textura Rachado: lajotas grandes (Lajota de base) cortadas por rachaduras que aparecem em manchas, cacos afundados e lascas (gerar.py, Gr.tex_rachado).
import { desloca, lasca } from './grade'
import { lajota } from './lajota'
import { mapa, ruido, voronoi, type Vor } from './ruido'
import type { Opcoes } from './bloco'

export const RACHADO = { // nome: [padrão, mín, máx, rótulo]
  lajota: [1.6, .5, 4, 'Lajota de base (× tamanho)'], manchas: [.6, 0, 1, 'Limiar das manchas (menor = mais rachado)'],
  racha_largura: [.5, 0, 2, 'Largura da rachadura (mm)'], racha_fundo: [.9, 0, 2, 'Fundo da rachadura (mm)'],
  cacos: [.1, 0, 1, 'Cacos afundados (fração)'], lasca_fundo: [.5, 0, 2, 'Lascas: fundo (mm)'],
} as const
export type KnobsRachado = { -readonly [k in keyof typeof RACHADO]: number }

const f: Vor = { r0: 0, r1: 0, r2: 0, px: 0, py: 0, borda: 0 }

/** `o` = opções completas: a base usa `o.lajota` (os ajustes da Lajota continuam valendo). */
export function rachado(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsRachado, o: Opcoes) {
  const base = lajota(x, y, z, tam * k.lajota, prof, desg, o.lajota)
  const c = tam * 1.1, a = tam * .25
  voronoi(desloca(x, x, y, z, a, .15, 21), desloca(y, x, y, z, a, .15, 22), desloca(z, x, y, z, a, .15, 23), 1 / c, f)
  const dist = f.borda * c
  const lim = k.manchas - desg * .25, rede = mapa(ruido(x, y, z, .07, 2, .5, 2), lim, lim + .08, 0, 1) // onde o piso rachou
  const larg = k.racha_largura + ruido(x, y, z, .3, 2, .5, 3) * .8
  const racha = mapa(dist, 0, larg, 1, 0) * rede * k.racha_fundo
  const caco = (f.r0 > 1 - k.cacos - desg * .15 ? 1 : 0) * rede * (.5 + f.r1 * .5)
  return Math.max(base, racha, caco) + lasca(dist, x, y, z, desg, 1.5, k.lasca_fundo) * rede
}
