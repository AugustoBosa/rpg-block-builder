// Textura Terra: torrões e grão sobre um chão fundo; pedrinhas meio enterradas e pedras maiores raras (gerar.py, Gr.tex_terra).
import { grao } from './grade'
import { mapa, ruido } from './ruido'
import { seixos } from './seixos'

export const TERRA = { // nome: [padrão, mín, máx, rótulo]
  chao: [1.45, 0, 2.5, 'Nível do chão (mm abaixo do topo)'], torrao: [.3, 0, 1.5, 'Torrões (mm)'], fino: [.25, 0, 1, 'Grão grosso (mm)'],
  seixos_tam: [.5, .1, 2, 'Pedrinhas: tamanho (× tamanho)'], seixos: [.5, 0, 1, 'Pedrinhas (fração)'], pedras: [.35, 0, 1, 'Pedras grandes (fração)'],
  grao: [.08, 0, .5, 'Grão (mm)'],
} as const
export type KnobsTerra = { -readonly [k in keyof typeof TERRA]: number }

export function terra(x: number, y: number, z: number, tam: number, _prof: number, desg: number, k: KnobsTerra) {
  const torrao = mapa(ruido(x, y, z, .12, 3), .35, .65, 0, 1) * (k.torrao + desg * .2)
  const chao = k.chao + torrao + ruido(x, y, z, .7, 2, .5, 2) * k.fino
  const pedra = Math.min(seixos(x, y, z, tam * k.seixos_tam, k.seixos + desg * .3, .5), seixos(x + 23.1, y + 23.1, z + 23.1, tam * .9, k.pedras, .35))
  return Math.min(chao, pedra) + grao(x, y, z, k.grao)
}
