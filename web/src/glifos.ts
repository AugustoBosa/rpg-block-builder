// Textura Glifos: lajotas quadradas com um sinal geométrico gravado (traços e anel numa malha 3×3 de pontos, sorteados por lajota; desenho próprio).
import { desloca, G, grade, grao, juntaPerfil } from './grade'
import { mapa, ruido } from './ruido'

export const GLIFOS = { // nome: [padrão, mín, máx, rótulo]
  lado: [1.5, .8, 4, 'Lajota (× tamanho)'], junta: [.6, 0, 2, 'Meia junta (mm)'], sulco: [1.3, 0, 2.5, 'Fundo do sulco (mm)'], larg: [.55, .2, 1.5, 'Meia largura do sulco (mm)'],
  min: [3, 1, 8, 'Traços: mínimo'], max: [6, 1, 8, 'Traços: máximo'], circulo: [.35, 0, 1, 'Chance de círculo'], margem: [2, 1, 6, 'Margem (mm)'],
  apagado: [.8, 0, 1, 'Apagado pelo desgaste (fração)'], grao: [.06, 0, .5, 'Grão (mm)'],
} as const
export type KnobsGlifos = { -readonly [k in keyof typeof GLIFOS]: number }

// pares de pontos vizinhos da malha 3×3 (índice = 3·linha + coluna): 6 horizontais, 6 verticais, 8 diagonais
const SEG: number[][] = []
for (let a = 0; a < 9; a++) for (const [dc, dl] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
  const c = a % 3 + dc, l = (a / 3 | 0) + dl
  if (c >= 0 && c < 3 && l < 3) SEG.push([a, 3 * l + c])
}
const sorteio = (s: number) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s }

export function glifos(x: number, y: number, z: number, tam: number, prof: number, desg: number, k: KnobsGlifos) {
  const L = tam * k.lado
  grade(desloca(x, x, y, z, .2, .2, 21), desloca(y, x, y, z, .2, .2, 22), z, L, L, 0)
  const { dist, fu, fv, r0, r1, r2 } = G
  const base = juntaPerfil(dist, k.junta, .5 + desg * .5, prof, x, y, z) + r2 * .15 + grao(x, y, z, k.grao)
  const m = k.margem, passo = (L - 2 * m) / 2, w = k.larg * (1 + desg * .3)
  if (dist < m - w || passo <= 0) return base // fora da área do sinal
  let s = (r0 * 4294967296) >>> 0, d = 1e9
  const n = k.min + Math.floor(r1 * (Math.max(k.max, k.min) - k.min + 1))
  for (let i = 0; i < n; i++) {
    s = sorteio(s); const [a, b] = SEG[(s >>> 8) % SEG.length]
    s = sorteio(s); if ((s >>> 8) / 16777216 >= 1 - desg * k.apagado) continue // apagado pelo tempo
    const ax = m + a % 3 * passo, ay = m + (a / 3 | 0) * passo, ex = m + b % 3 * passo - ax, ey = m + (b / 3 | 0) * passo - ay
    const t = Math.min(Math.max(((fu - ax) * ex + (fv - ay) * ey) / (ex * ex + ey * ey), 0), 1)
    d = Math.min(d, Math.hypot(fu - ax - t * ex, fv - ay - t * ey))
  }
  s = sorteio(sorteio(s))
  if ((s >>> 8) / 16777216 < k.circulo && (sorteio(s) >>> 8) / 16777216 < 1 - desg * k.apagado) d = Math.min(d, Math.abs(Math.hypot(fu - L / 2, fv - L / 2) - passo * .7))
  if (d >= w) return base
  return base + k.sulco * (1 - d / w) * (1 - desg * .4 * mapa(ruido(x, y, z, .8, 2, .5, 9), .4, .7, 0, 1))
}
