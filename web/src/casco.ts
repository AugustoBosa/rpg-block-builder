// Textura Casco: tábuas em fiadas que se sobrepõem, junta de topo, empeno, veio, cavilhas e pontas gastas (gerar.py, Gr.tex_casco).
// Na parede u = ao longo da parede e z = altura (parede.ts), como no Blender.
import { G, grade, grao, lasca } from './grade'
import { mapa, ruido } from './ruido'

export const CASCO = { // nome: [padrão, mín, máx, rótulo]
  altura: [.55, .2, 2, 'Fiada (× tamanho)'], comprimento: [3, 1, 10, 'Tábua: comprimento (× tamanho)'], variacao: [.5, 0, 1.5, 'Variação do comprimento'],
  sobreposicao: [.6, 0, 2, 'Sobreposição (× profundidade)'], junta_topo: [.5, 0, 2, 'Junta de topo (× profundidade)'], empeno: [.4, 0, 2, 'Empeno (mm)'],
  altura_var: [.2, 0, 1.5, 'Variação de altura (mm)'], veio: [.12, 0, .8, 'Veio (mm)'], cavilha_dist: [1.6, .5, 6, 'Cavilha: distância da ponta (mm)'],
  cavilha_fundo: [.35, 0, 1.5, 'Cavilha: fundo (mm)'], ponta_gasta: [.4, 0, 2, 'Ponta gasta (mm)'], lasca_fundo: [.3, 0, 2, 'Lascas: fundo (mm)'],
  grao: [.05, 0, .5, 'Grão (mm)'],
} as const
export type KnobsCasco = { -readonly [k in keyof typeof CASCO]: number }

export function casco(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsCasco) {
  const h = tam * k.altura
  grade(x, y, z, tam * k.comprimento, h, .4, k.variacao)
  const { dist, du, fu, fv, bw: L, r0, r1 } = G
  const t = fv / h
  const perfil = Math.max(mapa(t, 0, .55, 1, 0), mapa(t, .9, 1, 0, 1)) * prof * k.sobreposicao // fundo embaixo, degrau seco em cima
  const topo = mapa(du, .3, 1.2, 1, 0) * prof * k.junta_topo
  const emp = Math.max((fu / L - .5) * (r1 - .5) * k.empeno + r0 * k.altura_var + .1, 0)
  const veio = (.5 + Math.sin(y * 2.4 + ruido(x * .08, y, z, .5, 3) * 9) * .5) * k.veio
  const px = Math.min(Math.abs(fu - k.cavilha_dist), Math.abs(fu - (L - k.cavilha_dist)))
  const cavilha = mapa(Math.hypot(px, fv - h * .6), .35, .7, 1, 0) * k.cavilha_fundo
  const ponta = mapa(du, 0, 2.5, 1, 0) * desg * k.ponta_gasta
  return Math.max(perfil, topo) + emp + veio + cavilha + ponta + lasca(dist, x, y, z, desg, 1.2, k.lasca_fundo) + grao(x, y, z, k.grao)
}
