// Registro das texturas do piso e da parede: função de profundidade (mm ≥ 0), ajustes [padrão, mín, máx, rótulo] e seção de cada ajuste.
import { pedra, PEDRA, SECAO_PEDRA } from './pedra'
import { lisa, LISA } from './lisa'
import { lajota, LAJOTA } from './lajota'
import { tijolo, TIJOLO } from './tijolo'
import { terra, TERRA } from './terra'
import { areia, AREIA } from './areia'
import { rachado, RACHADO } from './rachado'
import { tabuas, TABUAS } from './tabuas'
import { caverna, CAVERNA } from './caverna'
import { casco, CASCO } from './casco'
import { metal, METAL } from './metal'
import { agua, AGUA } from './agua'
import { lava, LAVA } from './lava'
import type { Opcoes } from './bloco'

const secao = (t: object, titulo: string) => Object.fromEntries(Object.keys(t).map(k => [k, titulo]))
export const TEX = {
  pedra: { nome: 'Pedra', fn: pedra, knobs: PEDRA, secao: SECAO_PEDRA as Record<string, string> },
  lisa: { nome: 'Lisa', fn: lisa, knobs: LISA, secao: secao(LISA, 'Avançado — Lisa') },
  lajota: { nome: 'Lajota', fn: lajota, knobs: LAJOTA, secao: secao(LAJOTA, 'Avançado — Lajota') },
  tijolo: { nome: 'Tijolo', fn: tijolo, knobs: TIJOLO, secao: secao(TIJOLO, 'Avançado — Tijolo') },
  terra: { nome: 'Terra', fn: terra, knobs: TERRA, secao: secao(TERRA, 'Avançado — Terra') },
  areia: { nome: 'Areia', fn: areia, knobs: AREIA, secao: secao(AREIA, 'Avançado — Areia') },
  rachado: { nome: 'Rachado', fn: rachado, knobs: RACHADO, secao: secao(RACHADO, 'Avançado — Rachado') },
  tabuas: { nome: 'Tábuas', fn: tabuas, knobs: TABUAS, secao: secao(TABUAS, 'Avançado — Tábuas') },
  caverna: { nome: 'Caverna', fn: caverna, knobs: CAVERNA, secao: secao(CAVERNA, 'Avançado — Caverna') },
  casco: { nome: 'Casco', fn: casco, knobs: CASCO, secao: secao(CASCO, 'Avançado — Casco') },
  metal: { nome: 'Metal', fn: metal, knobs: METAL, secao: secao(METAL, 'Avançado — Metal') },
  agua: { nome: 'Água', fn: agua, knobs: AGUA, secao: secao(AGUA, 'Avançado — Água') },
  lava: { nome: 'Lava', fn: lava, knobs: LAVA, secao: secao(LAVA, 'Avançado — Lava') },
}
export type TexId = keyof typeof TEX

/** Profundidade da textura escolhida em `o` no ponto (x, y) global; z = fatia da semente; prof = profundidade da junta (mm). */
export const profTex = (o: Opcoes, x: number, y: number, z: number, prof: number, id: TexId = o.textura) =>
  (TEX[id].fn as (...a: any[]) => number)(x, y, z, o.tamanho_pedra, prof, o.desgaste, o[id], o)
/** Textura da parede: '' (padrão) = a mesma do piso. Água e Lava só existem no piso (gerar.py): na parede caem para Pedra. */
export const texParede = (o: Opcoes): TexId => { const t = o.texturaParede || o.textura; return t === 'agua' || t === 'lava' ? 'pedra' : t }
/** Teto do relevo (mm): o da Água é 0,5 mm maior, para o nível e as ondas não ficarem cortados em 2,5 mm (a laje tem 3,2 mm). */
export const tetoDe = (o: Opcoes, id: TexId = o.textura) => id === 'agua' ? o.teto + .5 : o.teto
