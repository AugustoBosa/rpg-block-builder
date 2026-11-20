// Textura Metal: chapas rebitadas com costura chanfrada, inclinação, amassados, rebites em cúpula e corrosão (gerar.py, Gr.tex_metal).
import { G, grade, grao, juntaPerfil } from './grade'
import { mapa, ruido } from './ruido'

export const METAL = { // nome: [padrão, mín, máx, rótulo]
  altura: [1, .3, 4, 'Chapa: altura (× tamanho)'], comprimento: [1.6, .3, 5, 'Chapa: comprimento (× tamanho)'], costura: [.45, 0, 2, 'Meia costura (mm)'],
  costura_fundo: [1.2, 0, 3, 'Fundo da costura (× profundidade)'], amassado: [.3, 0, 1.5, 'Amassados (mm)'], inclinacao: [.25, 0, 1, 'Inclinação por chapa'],
  altura_var: [.2, 0, 1.5, 'Variação de altura (mm)'], rebite_dist: [2.6, .8, 8, 'Rebite: distância da borda (mm)'], rebite_raio: [1.35, .5, 3, 'Rebite: raio (mm)'],
  corrosao: [.24, 0, 1, 'Corrosão (fração)'], corrosao_fundo: [.35, 0, 1.5, 'Corrosão: fundo (mm)'], grao: [.04, 0, .5, 'Grão (mm)'],
} as const
export type KnobsMetal = { -readonly [k in keyof typeof METAL]: number }

export function metal(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsMetal) {
  const h = tam * k.altura
  grade(x, y, z, tam * k.comprimento, h, 0)
  const { dist, du, dv, fu, fv, bw, r0, r1, r2 } = G
  const junta = juntaPerfil(dist, k.costura, .6, prof * k.costura_fundo, x, y, z)
  const m = r2 * 9, amassado = ruido(x + m, y + m, z + m, .15, 1) * k.amassado
  const ang = r1 * 6.2831853, rampa = (fu - bw / 2) * Math.cos(ang) + (fv - h / 2) * Math.sin(ang)
  const placa = .5 + r0 * k.altura_var + Math.max(rampa / bw * k.inclinacao, 0) + amassado
  const rd = k.rebite_dist
  const dr = Math.min(Math.hypot(du - rd, dv - rd), Math.hypot(fu - bw / 2, dv - rd)) // cantos e meio das bordas longas
  const rebite = mapa(dr, .5, k.rebite_raio, 1, 0) * (placa - .05) // cúpula de 1,35 mm: na malha de 0,5 mm um rebite menor vira ponta
  const lim = 1 - k.corrosao - desg * .12
  const corrosao = mapa(ruido(x, y, z, .8, 3), lim, lim + .05, 0, 1) * k.corrosao_fundo
  return Math.max(placa - rebite, junta) + corrosao + grao(x, y, z, k.grao)
}
