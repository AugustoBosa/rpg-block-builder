// Textura Tijolo: fiadas, argamassa funda, tijolos tortos, quinas quebradas, tijolos faltando e poros (gerar.py, Gr.tex_tijolo).
import { desloca, G, grade, grao, juntaPerfil, lasca } from './grade'
import { mapa, ruido } from './ruido'

export const TIJOLO = { // nome: [padrão, mín, máx, rótulo]
  comprimento: [1.2, .3, 4, 'Comprimento (× tamanho)'], altura: [.6, .2, 2, 'Altura da fiada (× tamanho)'], argamassa: [.55, 0, 2, 'Meia argamassa (mm)'],
  bisel: [.8, 0, 3, 'Bisel (mm)'], torto: [.5, 0, 2, 'Tijolo torto (mm)'], altura_var: [.35, 0, 1.5, 'Variação de altura (mm)'],
  quebrados: [.4, 0, 1, 'Quinas quebradas (fração)'], quebra_fundo: [.9, 0, 2, 'Fundo da quebra (mm)'], faltando: [.07, 0, .5, 'Tijolos faltando (× desgaste)'],
  poros: [.35, 0, 1.5, 'Poros (mm)'], lasca_fundo: [.6, 0, 2, 'Lascas: fundo (mm)'], grao: [.08, 0, .5, 'Grão (mm)'],
} as const
export type KnobsTijolo = { -readonly [k in keyof typeof TIJOLO]: number }

export function tijolo(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsTijolo) {
  grade(desloca(x, x, y, z, .3, .2, 21), desloca(y, x, y, z, .3, .2, 22), z, tam * k.comprimento, tam * k.altura, .5)
  const { dist, du, dv, fu, bw, r0, r1, r2 } = G
  const junta = juntaPerfil(dist, k.argamassa, k.bisel + r2 * .6 + desg * .6, prof, x, y, z)
  const torto = (fu / bw - .5) * (r1 - .5) * k.torto
  const peca = Math.max(r0 * k.altura_var + torto + .12, 0)
  const quebra = (r1 > 1 - k.quebrados - desg * .3 ? 1 : 0) * mapa(Math.hypot(du, dv), 0, 1.2 + r0 * 1.5, 1, 0) * k.quebra_fundo
  const falta = (r2 > 1 - desg * k.faltando ? 1 : 0) * prof * .8
  const poro = mapa(ruido(x, y, z, .9, 2, .5, 4), .64, .68, 0, 1) * desg * k.poros
  return Math.max(junta, falta) + peca + quebra + poro + lasca(dist, x, y, z, desg, 1.6, k.lasca_fundo) + grao(x, y, z, k.grao)
}
