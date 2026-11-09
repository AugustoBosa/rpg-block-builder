// Textura Tábuas: comprimento variado, frestas, empeno, abaulado, veio, nós, pregos e pontas gastas (gerar.py, Gr.tex_tabuas).
// Na parede as tábuas ficam na horizontal (no Blender giravam para a vertical).
import { G, grade, grao } from './grade'
import { mapa, ruido } from './ruido'

export const TABUAS = { // nome: [padrão, mín, máx, rótulo]
  comprimento: [3.5, 1, 10, 'Comprimento (× tamanho)'], largura: [.85, .3, 3, 'Largura (× tamanho)'], variacao: [.6, 0, 1.5, 'Variação do comprimento'],
  fresta: [.5, 0, 2, 'Fresta (mm)'], empeno: [.5, 0, 2, 'Empeno (mm)'], abaulado: [.12, 0, 1, 'Abaulado (mm)'], veio: [.16, 0, .8, 'Veio (mm)'],
  nos: [.45, 0, 1, 'Tábuas com nó (fração)'], prego_dist: [1.8, .5, 6, 'Prego: distância da ponta (mm)'], prego_fundo: [.45, 0, 1.5, 'Prego: fundo (mm)'],
  ponta_gasta: [.5, 0, 2, 'Ponta gasta (mm)'], grao: [.05, 0, .5, 'Grão (mm)'],
} as const
export type KnobsTabuas = { -readonly [k in keyof typeof TABUAS]: number }

export function tabuas(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsTabuas) {
  const h = tam * k.largura
  grade(x, y, z, tam * k.comprimento, h, .33, k.variacao)
  const { dist, du, fu, fv, bw: L, r0, r1, r2 } = G
  const junta = mapa(dist, k.fresta, 1 + desg * .6, 1, 0) * prof
  const meio = fv / h - .5
  const peca = Math.max(r0 * .25 + (fu / L - .5) * (r1 - .5) * k.empeno + meio * meio * k.abaulado + .2, 0) // empenada ao longo, abaulada na largura
  const veio = (.5 + Math.sin(y * 2.4 + ruido(x * .08, y, z, .5, 3) * 9) * .5) * k.veio
  const kx = L * (.25 + r2 * .5), ky = h * (.3 + r0 * .4), dk = Math.sqrt((fu - kx) ** 2 * .35 + (fv - ky) ** 2)
  const no = (r2 > 1 - k.nos ? 1 : 0) * mapa(dk, .6, 1.6, 1, 0) * (.2 + (.5 + Math.sin(dk * 5) * .5) * .2)
  const px = Math.min(Math.abs(fu - k.prego_dist), Math.abs(fu - (L - k.prego_dist))), dp = Math.hypot(px, fv - h * .5)
  const prego = mapa(Math.abs(dp - .75), .2, .45, 1, 0) * k.prego_fundo
  const ponta = mapa(du, 0, 2.5, 1, 0) * desg * k.ponta_gasta
  return junta + peca + veio + no + prego + ponta + grao(x, y, z, k.grao)
}
