// Pedrinhas soltas (Terra, Areia): Voronoi 2D de célula `cel` mm, uma pedra por célula com chance `dens` (gerar.py, Gr.seixos).
import { desloca } from './grade'
import { mapa, voronoi2, type Vor2 } from './ruido'

const v: Vor2 = { dist: 0, r0: 0, r1: 0, r2: 0 }

/** Profundidade da face da pedra (mm): topo a `topo`·(0,5..1,5), flancos até 2 mm mais fundo; fora da pedra, +9. Junte ao chão com Math.min. */
export function seixos(x: number, y: number, z: number, cel: number, dens: number, topo: number) {
  const a = cel * .15, X = desloca(x, x, y, z, a, .3, 21), Y = desloca(y, x, y, z, a, .3, 22), Z = desloca(z, x, y, z, a, .3, 23)
  voronoi2(X + Z * .37, Y + Z * .23, 1 / cel, v) // 2D: em 3D o plano corta longe da maioria dos centros
  const raio = cel * (.28 + v.r1 * .17), domo = mapa(v.dist * cel / raio, .35, 1, 1, 0) // topo achatado, flanco íngreme
  return topo * (.5 + v.r2) + (1 - domo) * 2 + (v.r0 > dens ? 9 : 0)
}
