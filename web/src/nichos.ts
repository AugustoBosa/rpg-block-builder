// Textura Nichos: silharia de blocos grandes em fiadas, com nichos rasos de topo em arco abatido, moldura chanfrada e argamassa funda (desenho próprio).
import { desloca, G, grade, grao, juntaPerfil, lasca } from './grade'
import { mapa } from './ruido'

export const NICHOS = { // nome: [padrão, mín, máx, rótulo]
  bloco: [2.6, 1, 5, 'Bloco (× tamanho)'], altura: [2, .8, 4, 'Altura da fiada (× tamanho)'], argamassa: [.6, 0, 2, 'Meia argamassa (mm)'], bisel: [.5, 0, 3, 'Bisel (mm)'],
  largura: [.6, .2, .9, 'Largura do nicho (× bloco)'], alto: [.62, .2, .9, 'Altura do nicho (× fiada)'], flecha: [.25, 0, .5, 'Flecha do arco (× largura)'],
  fundo: [1.5, 0, 2.5, 'Fundo do nicho (mm)'], variacao: [.4, 0, 1, 'Variação do fundo (fração)'], moldura: [1.1, .2, 3, 'Moldura chanfrada (mm)'],
  fracao: [.5, 0, 1, 'Blocos com nicho (fração)'], lasca_fundo: [.5, 0, 2, 'Lascas: fundo (mm)'], grao: [.07, 0, .5, 'Grão (mm)'],
} as const
export type KnobsNichos = { -readonly [k in keyof typeof NICHOS]: number }

export function nichos(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsNichos) {
  const h = tam * k.altura
  grade(desloca(x, x, y, z, .3, .2, 21), desloca(y, x, y, z, .3, .2, 22), z, tam * k.bloco, h, .5)
  const { dist, fu, fv, bw, r0, r1, r2 } = G
  const junta = juntaPerfil(dist, k.argamassa, k.bisel + r2 * .4 + desg * .5, prof, x, y, z)
  let nicho = 0
  if (r1 < k.fracao + desg * .2) {
    const c = bw * k.largura / 2, s = c * 2 * k.flecha, nh = h * k.alto, yb = (h - nh) / 2, dx = Math.abs(fu - bw / 2)
    let topo = yb + nh - s // topo das laterais; acima dele, arco abatido (segmento de círculo)
    if (s > 1e-6) { const R = (c * c + s * s) / (2 * s); topo += dx < c ? Math.sqrt(R * R - dx * dx) - (R - s) : -9 } else if (dx >= c) topo = -9
    const d = Math.min(c - dx, fv - yb, topo - fv) // distância aprox. à borda externa do nicho (> 0 = dentro)
    nicho = mapa(d, 0, k.moldura, 0, 1) * k.fundo * (1 + (r0 - .5) * 2 * k.variacao)
  }
  return junta + r2 * .15 + nicho + lasca(dist, x, y, z, desg, 1.6, k.lasca_fundo) + grao(x, y, z, k.grao)
}
