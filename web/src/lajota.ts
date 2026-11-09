// Textura Lajota: placas quadradas com desnível e inclinação, junta suja, cantos lascados e rachadura diagonal (gerar.py, Gr.tex_lajota).
import { desloca, G, grade, grao, juntaPerfil } from './grade'
import { mapa } from './ruido'

export const LAJOTA = { // nome: [padrão, mín, máx, rótulo]
  lado: [.9, .3, 3, 'Lado (× tamanho)'], junta: [.5, 0, 2, 'Meia junta (mm)'], bisel: [.4, 0, 3, 'Bisel (mm)'], junta_fundo: [.85, 0, 2, 'Fundo da junta (×)'],
  inclinacao: [.5, 0, 2, 'Inclinação por lajota'], altura_var: [.25, 0, 1.5, 'Variação de altura (mm)'], rachadas: [.2, 0, 1, 'Lajotas rachadas (fração)'],
  racha_fundo: [.6, 0, 2, 'Fundo da rachadura (mm)'], lascadas: [.3, 0, 1, 'Cantos lascados (fração)'], lasca_fundo: [.7, 0, 2, 'Fundo da lasca (mm)'],
  grao: [.07, 0, .5, 'Grão (mm)'],
} as const
export type KnobsLajota = { -readonly [k in keyof typeof LAJOTA]: number }

export function lajota(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsLajota) {
  const L = tam * k.lado
  grade(desloca(x, x, y, z, .2, .2, 21), desloca(y, x, y, z, .2, .2, 22), z, L, L, 0)
  const { dist, du, dv, fu, fv, r0, r1, r2 } = G
  const junta = juntaPerfil(dist, k.junta, k.bisel + desg * .5, prof, x, y, z) * k.junta_fundo
  const ang = r1 * 6.2831853, rampa = (fu - L / 2) * Math.cos(ang) + (fv - L / 2) * Math.sin(ang)
  const incl = Math.max(rampa / L * k.inclinacao + .25, 0)
  const racha = (r2 > 1 - k.rachadas - desg * .1 ? 1 : 0) * mapa(Math.abs(fu - (L - fv)), 0, .9, 1, 0) * mapa(dist, 1, 2, 0, 1) * k.racha_fundo
  const lasca = (r0 > 1 - k.lascadas - desg * .3 ? 1 : 0) * mapa(Math.hypot(du, dv), 0, 2.2, 1, 0) * k.lasca_fundo
  return junta + r0 * k.altura_var + incl + racha + lasca + grao(x, y, z, k.grao)
}
