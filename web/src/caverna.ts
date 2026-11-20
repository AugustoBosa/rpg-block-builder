// Textura Caverna: lajes de rocha com fendas e cascalho, cristas, rachaduras, lascas e pedregulhos (gerar.py, Gr.tex_caverna).
import { desloca, grao, lasca } from './grade'
import { mapa, ruido, voronoi, type Vor } from './ruido'
import { seixos } from './seixos'

export const CAVERNA = { // nome: [padrão, mín, máx, rótulo]
  laje: [1.3, .5, 4, 'Laje de rocha (× tamanho)'], vao: [.4, 0, 2, 'Fenda (mm)'], fenda_fundo: [1.3, 0, 3, 'Fundo da fenda (× profundidade)'],
  cascalho: [.6, 0, 1.5, 'Cascalho na fenda (mm)'], inclinacao: [.5, 0, 2, 'Inclinação por laje'], rugas: [.6, 0, 2, 'Rugas (mm)'],
  altura_var: [.9, 0, 2, 'Variação de altura (mm)'], racha_fundo: [.6, 0, 2, 'Rachaduras: fundo (mm)'], lasca_fundo: [.7, 0, 2, 'Lascas: fundo (mm)'],
  seixos: [.1, 0, 1, 'Pedregulhos (fração)'], grao: [.12, 0, .5, 'Grão (mm)'],
} as const
export type KnobsCaverna = { -readonly [k in keyof typeof CAVERNA]: number }

const f: Vor = { r0: 0, r1: 0, r2: 0, px: 0, py: 0, borda: 0 }, g: Vor = { ...f }

export function caverna(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsCaverna) {
  const T = tam * k.laje, a = T * .2
  const X = desloca(x, x, y, z, a, .12, 21), Y = desloca(y, x, y, z, a, .12, 22)
  voronoi(X, Y, z, 1 / T, f) // z sem distorção: desempenho (a fatia só escolhe a semente)
  const dist = f.borda * T, { r0, r1, r2 } = f
  const vao = k.vao + r1 * .6 + desg * .5
  const cascalho = dist < vao ? mapa(dist, vao - .3, vao, 1, 0) * ruido(x, y, z, .9, 3) * k.cascalho : 0 // só perto da fenda
  const fenda = Math.max(mapa(dist, vao, vao + .8 + r2 * 1.2, 1, 0) * prof * k.fenda_fundo - cascalho, 0)
  const ang = r1 * 6.2831853, rampa = (X - f.px) * Math.cos(ang) + (Y - f.py) * Math.sin(ang)
  const incl = Math.max(rampa / T * k.inclinacao + .2, 0)
  const rugas = Math.abs(ruido(X, Y, z, .2, 4, .6) * 2 - 1) * k.rugas // cristas: vales em V entre as rugas
  let racha = 0
  if (r0 > .55 && dist > 1.5) { // rachaduras só nas lajes sorteadas e longe da fenda
    voronoi(X + 51.7, Y + 51.7, z + 51.7, 1 / (T * .4), g, false)
    racha = mapa(g.borda * T * .4, 0, .7, 1, 0) * mapa(dist, 1.5, 3, 0, 1) * k.racha_fundo
  }
  const rocha = fenda + r0 * k.altura_var + incl + rugas + racha + lasca(dist, x, y, z, desg, 2.5, k.lasca_fundo)
  return Math.min(rocha, seixos(x, y, z, tam * .8, k.seixos + desg * .2, .4)) + grao(x, y, z, k.grao)
}
