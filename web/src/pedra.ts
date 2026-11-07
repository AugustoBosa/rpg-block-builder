// Textura Pedra (piso): profundidade de corte em mm (≥ 0) a partir do topo, em coordenadas globais.
// Mesma receita do gerar.py (Gr.tex_pedra), com o ruído próprio de ruido.ts.
import { mapa, ruido, voronoi, type Vor } from './ruido'

export const PEDRA = { // nome: [padrão, mín, máx, rótulo]
  distorcao: [.12, 0, .4, 'Distorção (× tamanho)'], vao: [.5, 0, 2, 'Vão entre pedras (mm)'], vao_desgaste: [.6, 0, 2, 'Vão extra com desgaste (mm)'],
  bisel: [1.2, 0, 4, 'Bisel da borda (mm)'], domo: [.3, 0, 1.5, 'Abaulado (mm)'], cascalho: [.5, 0, 1.5, 'Cascalho no vão (mm)'],
  inclinacao: [.3, 0, 1, 'Inclinação por pedra'], altura_var: [.35, 0, 1.5, 'Variação de altura (mm)'], rachadas: [.12, 0, 1, 'Pedras rachadas (fração)'],
  racha_fundo: [.7, 0, 2, 'Fundo da rachadura (mm)'], lasca_largura: [1.8, 0, 5, 'Lascas: faixa (mm)'], lasca_fundo: [.5, 0, 2, 'Lascas: fundo (mm)'],
  grao: [.1, 0, .5, 'Grão (mm)'],
} as const
export type KnobsPedra = { -readonly [k in keyof typeof PEDRA]: number }
export const SECAO_PEDRA = { // chave → seção "Avançado" da aba Blocos
  distorcao: 'Avançado — Forma das pedras', vao: 'Avançado — Forma das pedras', vao_desgaste: 'Avançado — Forma das pedras', bisel: 'Avançado — Forma das pedras', domo: 'Avançado — Forma das pedras',
  cascalho: 'Avançado — Superfície', inclinacao: 'Avançado — Superfície', altura_var: 'Avançado — Superfície', grao: 'Avançado — Superfície',
  rachadas: 'Avançado — Desgaste', racha_fundo: 'Avançado — Desgaste', lasca_largura: 'Avançado — Desgaste', lasca_fundo: 'Avançado — Desgaste',
} as const

const v1: Vor = { r0: 0, r1: 0, r2: 0, px: 0, py: 0, borda: 0 }
const v2: Vor = { ...v1 }

/** (x, y) globais em mm, z = fatia da semente; prof = profundidade da junta (mm); desg 0..1. */
export function pedra(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsPedra) {
  const amp = tam * k.distorcao * 2
  const dx = x + (ruido(x, y, z, .12, 2, .5, 21) - .5) * amp
  const dy = y + (ruido(x, y, z, .12, 2, .5, 22) - .5) * amp
  const dz = z + (ruido(x, y, z, .12, 2, .5, 23) - .5) * amp
  const f = voronoi(dx, dy, dz, 1 / tam, v1)
  const dist = f.borda * tam
  const vao = k.vao + f.r1 * .5 + desg * k.vao_desgaste // meia-largura do vão: 0,5–1,6 mm
  const larg = k.bisel + f.r2 * (.6 + desg) // bisel almofadado, cada pedra gasta de um jeito
  let junta = mapa(dist, vao, vao + larg, 1, 0) * prof + mapa(dist, 0, tam * .35, 1, 0) * k.domo
  const cascalho = mapa(dist, vao - .3, vao, 1, 0) * ruido(x, y, z, .9, 3) * k.cascalho
  junta = Math.max(junta - cascalho, 0) // chão áspero entre as pedras
  const ang = f.r1 * 6.2831853
  const rampa = (dx - f.px) * Math.cos(ang) + (dy - f.py) * Math.sin(ang)
  const incl = Math.max(rampa / tam * k.inclinacao + .1, 0)
  const t2 = tam * .45
  const d2 = voronoi(dx + 51.7, dy + 51.7, dz + 51.7, 1 / t2, v2, false).borda * t2
  const racha = (f.r0 > 1 - k.rachadas - desg * .08 ? 1 : 0) * mapa(d2, 0, .9, 1, 0) * mapa(dist, 1.5, 3, 0, 1) * k.racha_fundo
  const lim = .66 - desg * .14
  const lasca = mapa(dist, 0, k.lasca_largura, 1, 0) * mapa(ruido(x, y, z, .45, 3, .5, 5), lim, lim + .06, 0, 1) * k.lasca_fundo
  const grao = ruido(x, y, z, 1.1, 3, .6, 7) * k.grao
  return junta + f.r0 * k.altura_var + incl + racha + lasca + grao
}
