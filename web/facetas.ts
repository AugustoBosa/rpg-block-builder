// Mede as facetas da malha (mesmo método do facetas.py da raiz): ângulo entre triângulos vizinhos, ponderado pelo
// comprimento da aresta, ignorando < 2°. npx tsx facetas.ts [textura]
import { final, padrao, piso } from './src/bloco'
import { TEX, type TexId } from './src/textura'

export function facetas(pos: Float32Array, idx: Uint32Array, aresta?: (a: number, b: number, ang: number, L: number) => void) {
  const w = new Map<string, number>(), nv = pos.length / 3, mapaV = new Uint32Array(nv)
  for (let i = 0; i < nv; i++) { // solda por arredondamento em 4 casas, como o .py
    const k = [0, 1, 2].map(c => Math.round(pos[i * 3 + c] * 1e4)).join()
    mapaV[i] = w.get(k) ?? (w.set(k, w.size), w.size - 1)
  }
  const nt = idx.length / 3, N = new Float64Array(nt * 3), vizinho = new Map<number, number>()
  const ang: number[] = [], len: number[] = [], big = nv + 1
  for (let t = 0; t < nt; t++) {
    const [a, b, c] = [0, 1, 2].map(e => idx[t * 3 + e] * 3)
    const u = [0, 1, 2].map(k => pos[b + k] - pos[a + k]), v = [0, 1, 2].map(k => pos[c + k] - pos[a + k])
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], m = Math.max(Math.hypot(...n), 1e-12)
    for (let k = 0; k < 3; k++) N[t * 3 + k] = n[k] / m
  }
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
    const a = idx[t * 3 + e], b = idx[t * 3 + (e + 1) % 3], wa = mapaV[a], wb = mapaV[b]
    const key = Math.min(wa, wb) * big + Math.max(wa, wb), o = vizinho.get(key)
    if (o === undefined) { vizinho.set(key, t); continue }
    const cos = Math.max(-1, Math.min(1, N[t * 3] * N[o * 3] + N[t * 3 + 1] * N[o * 3 + 1] + N[t * 3 + 2] * N[o * 3 + 2]))
    const g = Math.acos(cos) * 180 / Math.PI, L = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2])
    ang.push(g); len.push(L); aresta?.(a, b, g, L)
  }
  // p90 do .py é percentil sem peso (numpy, interpolado) sobre os ângulos > 2°
  const as = ang.filter(g => g > 2).sort((x, y) => x - y)
  const pct = (p: number) => { const r = (as.length - 1) * p, i = Math.floor(r); return as[i] + (as[Math.min(i + 1, as.length - 1)] - as[i]) * (r - i) }
  let tot = 0, v60 = 0, v15 = 0
  const ls = len.filter((_, i) => ang[i] > 2).sort((x, y) => x - y)
  for (let i = 0; i < ang.length; i++) if (ang[i] > 2) { tot += len[i]; if (ang[i] >= 60) v60 += len[i]; else if (ang[i] > 15) v15 += len[i] }
  return { tri: nt, p50: ls[ls.length >> 1], p90: pct(.9), pct15_60: v15 / tot * 100, pct60: v60 / tot * 100 }
}

if (process.argv[1].endsWith('facetas.ts')) {
  const o = padrao(), t = process.argv[2] ?? 'pedra'
  if (!(t in TEX)) throw new Error(`textura desconhecida: ${t}`)
  o.textura = t as TexId
  const t0 = performance.now(), m = await final(piso(o)), ms = performance.now() - t0
  const r = facetas(m.pos, m.idx)
  console.log(`${t}: ${r.tri} tri, ${ms.toFixed(0)} ms, aresta p50 ${r.p50.toFixed(3)} mm, vinco 15-60 ${r.pct15_60.toFixed(1)} %, >=60 ${r.pct60.toFixed(2)} %, p90 ${r.p90.toFixed(1)} graus`)
}
