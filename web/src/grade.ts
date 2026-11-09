// Auxiliares das texturas em fiadas (Lisa, Lajota, Tijolo): grade de peças, junta, lascas, grão e distorção.
// Mesma receita do gerar.py, com o ruído próprio de ruido.ts. Tudo em coordenadas globais (mm); z = fatia da semente.
import { mapa, rnd, ruido } from './ruido'

/** Resultado de `grade` (objeto reaproveitado: sem alocar por ponto). */
export const G = { dist: 0, du: 0, dv: 0, fu: 0, fv: 0, bw: 0, r0: 0, r1: 0, r2: 0 }

/** Peças em fiadas: fiada = altura h, comprimento bw (× 1 ± vari/2 por fiada, se vari > 0); fiadas ímpares deslocadas `desloc`·bw (+ folga aleatória de ±0,1·bw). G.bw = comprimento efetivo. */
export function grade(u: number, v: number, ds: number, bw: number, h: number, desloc: number, vari = 0) {
  const fila = Math.floor(v / h), s = Math.floor(ds)
  if (vari > 0) bw *= 1 - vari / 2 + rnd(fila, 8, s, 31) * vari
  const off = (((fila % 2) + 2) % 2) * desloc * bw + (rnd(fila, 7, s, 31) - .5) * .2 * bw
  const uu = u + off, col = Math.floor(uu / bw), fu = uu - col * bw, fv = v - fila * h
  G.du = Math.min(fu, bw - fu); G.dv = Math.min(fv, h - fv); G.dist = Math.min(G.du, G.dv)
  G.fu = fu; G.fv = fv; G.bw = bw
  G.r0 = rnd(col, fila, s, 31); G.r1 = rnd(col, fila, s, 32); G.r2 = rnd(col, fila, s, 33)
}
/** Deslocamento suave de uma coordenada, até ±amp mm (sem = 21 para x, 22 para y). */
export const desloca = (c: number, x: number, y: number, z: number, amp: number, esc: number, sem: number) => c + (ruido(x, y, z, esc, 2, .5, sem) - .5) * 2 * amp
/** Micro-relevo, λ ≈ 1 mm. */
export const grao = (x: number, y: number, z: number, a: number) => ruido(x, y, z, 1.1, 3, .6, 7) * a
/** Junta: fundo irregular a partir de `meia` mm da borda, com chanfro de `bisel` mm. */
export const juntaPerfil = (dist: number, meia: number, bisel: number, prof: number, x: number, y: number, z: number) =>
  mapa(dist, meia, meia + bisel, 1, 0) * prof * (1 - .35 * ruido(x, y, z, .6, 2, .5, 3))
/** Lascas nas bordas: manchas de ruído só perto da junta. */
export function lasca(dist: number, x: number, y: number, z: number, desg: number, larg: number, fundo: number) {
  const lim = .66 - desg * .14
  return mapa(dist, 0, larg, 1, 0) * mapa(ruido(x, y, z, .45, 3, .5, 5), lim, lim + .06, 0, 1) * fundo
}
