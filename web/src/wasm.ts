// Instância única do manifold para paredes e telhado (objetos de instâncias diferentes não se unem).
import Module from 'manifold-3d'
import type { Malha } from './sistema'

const w = await Module()
w.setup()
export const { Manifold, Mesh, CrossSection } = w
export const paraMalha = (m: InstanceType<typeof Manifold>): Malha => {
  const k = m.getMesh(), np = k.numProp, nv = k.vertProperties.length / np, pos = new Float32Array(nv * 3)
  for (let i = 0; i < nv; i++) for (let j = 0; j < 3; j++) pos[i * 3 + j] = k.vertProperties[i * np + j]
  return { pos, idx: new Uint32Array(k.triVerts) }
}

/** A booleana deixa triângulos de área ~0 (vértices colineares, p.ex. numa aresta vertical da parede) e o validador os recusa:
 *  empurra o vértice do meio 0,01 mm para o lado (até 6 passadas, cada uma mais forte; a mesma regra de área de `fechada`). */
export function desentorta({ pos, idx }: Malha) {
  const P = (i: number, c: number) => pos[idx[i] * 3 + c]
  for (let passo = 0; passo < 6; passo++) {
    let n = 0
    for (let t = 0; t < idx.length; t += 3) {
      const d = (i: number, j: number) => [0, 1, 2].map(c => P(t + j, c) - P(t + i, c)), L = [d(0, 1), d(1, 2), d(2, 0)]
      const l2 = L.map(v => v[0] ** 2 + v[1] ** 2 + v[2] ** 2), m = l2.indexOf(Math.max(...l2)), u = L[m], w = L[(m + 1) % 3]
      const area = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2
      if (area >= 1e-6 || area >= 1e-3 * l2[m]) continue
      const k = Math.abs(u[0]) < Math.abs(u[2]) ? [1, 0, 0] : [0, 0, 1], r = [u[1] * k[2] - u[2] * k[1], u[2] * k[0] - u[0] * k[2], u[0] * k[1] - u[1] * k[0]]
      const v = idx[t + (m + 2) % 3] * 3, h = Math.hypot(r[0], r[1], r[2])
      for (let c = 0; c < 3; c++) pos[v + c] += r[c] / h * .01 * (passo + 1)
      n++
    }
    if (!n) break
  }
}
