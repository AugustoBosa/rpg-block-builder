// Piso de Pedra de linhas × colunas células (qualquer formato do sistema): corpo com um pé por célula (sistema.ts)
// + uma laje texturizada contínua; duas cascas fechadas sobrepostas. Malha final: suavização e redução,
// sem mexer na borda nem no encaixe.
import { MeshoptSimplifier } from 'meshoptimizer'
import { mapa, ruido } from './ruido'
import { pedra, PEDRA, type KnobsPedra } from './pedra'
import { corpos, distBorda, distSeg, malha, regiao, SISTEMA, type Malha, type Regiao, type Sistema } from './sistema'
export type { Malha }

const RELEVO = 2.6 // mm: o corpo termina RELEVO abaixo do topo
const BORDA_FIXA = 1.2 // mm: a redução não toca esta faixa da borda
const TRI_MIN = 240000, SUAVIZA = 4 // TRI_MIN: triângulos do piso 35 × 35 (como as originais); cresce com a área^0,75

export const PISO = { // nome: [padrão, mín, máx, rótulo, passo?] (sem passo: contínuo)
  linhas: [1, 1, 6, 'Linhas (células)', 1], colunas: [1, 1, 6, 'Colunas (células)', 1], altura: [24.5, 12, 60, 'Altura total (mm)'],
  semente: [1, 0, 9999, 'Semente', 1], desgaste: [.5, 0, 1, 'Desgaste'], tamanho_pedra: [10, 5, 25, 'Tamanho da pedra (mm)'],
  profundidade: [.5, .4, .7, 'Profundidade'], posicao_x: [0, -8, 8, 'Posição X no mapa (células)', .5], posicao_y: [0, -8, 8, 'Posição Y no mapa (células)', .5],
  quina_largura: [1.8, 0, 5, 'Quina: largura (mm)'], quina_gasto: [1, 0, 3, 'Quina: gasto'], lateral_largura: [2, 0, 5, 'Lateral: largura (mm)'],
  lateral_gasto: [1, 0, 3, 'Lateral: gasto'], ruido_borda: [.3, .05, 2, 'Ruído da borda'], teto: [2.5, .5, 2.5, 'Teto do relevo (mm)'],
  junta_piso: [2.4, .5, 5, 'Ganho da junta (× profundidade)'], resolucao: [.125, .1, 1, 'Malha (mm)'],
} as const
export const GUIAS = { // grid e degrau (aba própria)
  grid_linhas: [3, 1, 12, 'Linhas', 1], grid_colunas: [3, 1, 12, 'Colunas', 1], altura_degrau: [24, 10, 80, 'Degrau: altura (mm)'],
} as const
type Num<T> = { -readonly [k in keyof T]: number }
export type Opcoes = Sistema & Num<typeof PISO> & Num<typeof GUIAS> & { pedra: KnobsPedra }
const ini = (t: object) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v[0]]))
export const padrao = (): Opcoes => ({ ...ini(SISTEMA), ...ini(PISO), ...ini(GUIAS), formato: 'quadrado', pedra: ini(PEDRA) } as any)

/** Rede do topo da laje: xy por ponto, triângulos e o contorno de cada célula (anti-horário).
 *  Todas as células caem na mesma rede global, então os pontos dos lados comuns são os mesmos. */
function rede(o: Opcoes, r: Regiao, res: number) {
  const { c, cs } = r, XY: number[] = [], tri: number[] = [], loops: number[][] = []
  // célula local: pontos (inteiros da rede e xy), triângulos e contorno; `ofs` leva o centro da célula à rede global
  const lp: [number, number, number, number][] = [], lt: number[] = [], ll: number[] = []
  let ofs: (dx: number, dy: number) => [number, number]
  if (c.hex) { // rede triangular: o hexágono fecha exato nela; (q, r) axiais
    const l = o.largura / Math.sqrt(3), n = Math.max(2, Math.round(l / res)), e = l / n, h = e * Math.sqrt(3) / 2
    const ix = new Map<number, number>(), ok = (q: number, r: number) => Math.abs(q) <= n && Math.abs(r) <= n && Math.abs(q + r) <= n
    const p = (q: number, r: number) => {
      const k = (q + n) * (2 * n + 1) + r + n
      let i = ix.get(k)
      if (i === undefined) { i = lp.length; lp.push([q, r, q * e + r * e / 2, r * h]); ix.set(k, i) }
      return i
    }
    for (let q = -n; q <= n; q++) for (let r = -n; r <= n; r++) {
      if (ok(q, r) && ok(q + 1, r) && ok(q, r + 1)) lt.push(p(q, r), p(q + 1, r), p(q, r + 1))
      if (ok(q + 1, r) && ok(q + 1, r + 1) && ok(q, r + 1)) lt.push(p(q + 1, r), p(q + 1, r + 1), p(q, r + 1))
    }
    let q = n, rr = 0
    for (const [dq, dr] of [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]]) for (let t = 0; t < n; t++) { ll.push(p(q, rr)); q += dq; rr += dr }
    ofs = (dx, dy) => { const R = Math.round(dy / h); return [Math.round((dx - R * e / 2) / e), R] }
  } else {
    const L = c.a[0] * 2, C = c.a[1] * 2, nx = Math.round(L / res + 1), ny = Math.round(C / res + 1), sx = L / (nx - 1), sy = C / (ny - 1)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) lp.push([i, j, -L / 2 + i * sx, -C / 2 + j * sy])
    const p = (i: number, j: number) => i + nx * j
    for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) lt.push(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j), p(i + 1, j + 1), p(i, j + 1))
    for (let i = 0; i + 1 < nx; i++) ll.push(p(i, 0))
    for (let j = 0; j + 1 < ny; j++) ll.push(p(nx - 1, j))
    for (let i = nx - 1; i > 0; i--) ll.push(p(i, ny - 1))
    for (let j = ny - 1; j > 0; j--) ll.push(p(0, j))
    ofs = (dx, dy) => [Math.round(dx / sx), Math.round(dy / sy)]
  }
  const id = new Map<number, number>()
  for (const [cx, cy] of cs) {
    const [Q, R] = ofs(cx - cs[0][0], cy - cs[0][1])
    const glob = lp.map(([q, r, x, y]) => {
      const k = (q + Q) * 1e6 + (r + R)
      let i = id.get(k)
      if (i === undefined) { i = XY.length / 2; XY.push(cx + x, cy + y); id.set(k, i) }
      return i
    })
    for (const t of lt) tri.push(glob[t])
    loops.push(ll.map(i => glob[i]))
  }
  return { XY, tri, loops }
}

/** Malha crua (sem suavizar). zt = topo do corpo. */
export function piso(o: Opcoes): Malha & { zt: number; r: Regiao } {
  const r = regiao(o, o.linhas, o.colunas), zt = o.altura - RELEVO
  const cp = malha(corpos(o, r.cs, zt))
  const P: number[] = Array.from(cp.pos), T: number[] = Array.from(cp.idx)
  const quad = (a: number, b: number, c: number, d: number) => T.push(a, b, c, a, c, d)

  // laje: de zt − 0,6 até zt + RELEVO; topo cortado pela textura, laterais gastas perto do topo
  const res = Math.max(o.resolucao, .1)
  const z0 = zt - .6, z1 = zt + RELEVO, nz = Math.round((z1 - z0) / res + 1)
  const { XY, tri, loops } = rede(o, r, res), nl = XY.length / 2
  const base = P.length / 3, id = new Int32Array(nl * nz).fill(-1)
  const ox = o.posicao_x * r.c.passo[0], oy = o.posicao_y * r.c.passo[1], ds = o.semente * 13.7
  const prof = Math.max(o.profundidade, .4) * o.junta_piso, des = o.desgaste, tam = o.tamanho_pedra
  const corte = new Float32Array(nl).fill(-1) // corte do topo por ponto da rede, calculado uma vez
  const v = (L: number, k: number) => {
    const n = L + nl * k
    if (id[n] >= 0) return id[n]
    const x = XY[L * 2], y = XY[L * 2 + 1], z = z0 + k * (z1 - z0) / (nz - 1)
    const gx = x + ox, gy = y + oy
    const rn = ruido(gx, gy, ds, o.ruido_borda, 3, .5, 9)
    const lado = (.2 + des * .5) * (.4 + rn * 1.2) * mapa(z, zt, z1, 0, 1) * o.lateral_gasto // recuo da lateral: até ~1 mm no topo
    let dx = 0, dy = 0 // recuo para dentro, somado por lado externo (perto da quina, dos dois)
    for (const g of r.seg) {
      const e = mapa(distSeg(g, x, y), 0, o.lateral_largura, 1, 0)
      dx -= e * g[4]; dy -= e * g[5]
    }
    let ct = corte[L]
    if (ct < 0) {
      const quina = mapa(distBorda(r, x, y), 0, o.quina_largura, 1, 0) * (.25 + des * .8) * (.6 + rn * .8) * o.quina_gasto
      ct = corte[L] = Math.min(Math.min(pedra(gx, gy, ds, tam, prof, des, o.pedra), o.teto) + quina, o.teto)
    }
    // a coluna da lateral encolhe até o relevo daquele ponto: a textura desce pela lateral, sem parede fina em volta (o fundo z0 fica)
    P.push(x + dx * lado, y + dy * lado, z0 + (z - z0) * (1 - ct / (z1 - z0)))
    return (id[n] = base + (P.length / 3 - 1 - base))
  }
  for (let t = 0; t < tri.length; t++) T.push(v(tri[t], nz - 1)) // topo
  // laterais: só nas arestas do topo sem par (borda externa); a orientação do triângulo dá o lado de fora
  const ar = new Set<number>()
  for (let t = 0; t < tri.length; t += 3) for (let e = 0; e < 3; e++) ar.add(tri[t + e] * nl + tri[t + (e + 1) % 3])
  for (let t = 0; t < tri.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = tri[t + e], b = tri[t + (e + 1) % 3]
    if (!ar.has(b * nl + a)) for (let k = 0; k + 1 < nz; k++) quad(v(a, k), v(b, k), v(b, k + 1), v(a, k + 1))
  }
  // fundo da laje: plano e escondido no corpo, então só um leque por célula, do centro até o contorno (sem grade fina)
  r.cs.forEach(([cx, cy], i) => {
    const ctr = P.length / 3, lp = loops[i]
    P.push(cx, cy, z0)
    for (let m = 0; m < lp.length; m++) T.push(ctr, v(lp[(m + 1) % lp.length], 0), v(lp[m], 0))
  })
  return { pos: new Float32Array(P), idx: new Uint32Array(T), zt, r }
}

/** Suaviza (4 passadas, fator 0,5) o relevo longe da borda e reduz para ~240 mil triângulos (alvo ∝ n^0,75), com a borda travada. */
export async function final(m: Malha & { zt: number; r: Regiao }): Promise<Malha> {
  const { pos, idx, zt, r: reg } = m, nv = pos.length / 3, nt = idx.length / 3
  const dentro = (i: number, b: number) => distBorda(reg, pos[i * 3], pos[i * 3 + 1]) > b
  // vizinhos (CSR): cada aresta aparece 2× numa malha fechada, então a média não muda
  const cont = new Uint32Array(nv + 1)
  for (let t = 0; t < idx.length; t++) cont[idx[t] + 1] += 2
  for (let i = 0; i < nv; i++) cont[i + 1] += cont[i]
  const viz = new Uint32Array(cont[nv]), cur = cont.slice(0, nv)
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
    const a = idx[t * 3 + e], b = idx[t * 3 + (e + 1) % 3]
    viz[cur[a]++] = b; viz[cur[b]++] = a
  }
  const suave = [] as number[]
  for (let i = 0; i < nv; i++) if (dentro(i, .2) && pos[i * 3 + 2] > zt) suave.push(i)
  for (let it = 0; it < SUAVIZA; it++) {
    const ant = pos.slice()
    for (const i of suave) for (let c = 0; c < 3; c++) {
      let s = 0
      for (let q = cont[i]; q < cont[i + 1]; q++) s += ant[viz[q] * 3 + c]
      pos[i * 3 + c] = .5 * ant[i * 3 + c] + .5 * s / (cont[i + 1] - cont[i])
    }
  }
  const trava = new Uint8Array(nv)
  for (let i = 0; i < nv; i++) trava[i] = dentro(i, BORDA_FIXA) && pos[i * 3 + 2] > zt + 1e-4 ? 0 : 1 // corpo e encaixe travados
  await MeshoptSimplifier.ready
  const alvo = TRI_MIN * (reg.area / 35 ** 2) ** .75
  // a redução às vezes deixa triângulo de área zero ou aresta repetida: tenta um alvo maior; a última opção é a malha sem redução
  for (const f of [1, 1.05, 1.1]) {
    if (alvo * f >= nt) break
    const [novo] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, new Float32Array(nv), 1, [0], trava, Math.floor(alvo * f) * 3, 1)
    if (fechada(pos, novo)) return { pos, idx: novo }
  }
  return { pos, idx }
}

/** Mesma regra do validar.py: cada aresta orientada aparece 1× e a inversa também; nenhum triângulo de área ~0. */
export function fechada(pos: Float32Array, idx: Uint32Array) {
  const nv = pos.length / 3, arestas = new Set<number>()
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]])
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const area = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2
    const lado2 = Math.max(...[[a, b], [b, c], [c, a]].map(([p, q]) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2))
    if (area < 1e-6 && area < 1e-3 * lado2) return false
    for (let e = 0; e < 3; e++) {
      const k = idx[t + e] * nv + idx[t + (e + 1) % 3]
      if (arestas.has(k)) return false
      arestas.add(k)
    }
  }
  for (const k of arestas) if (!arestas.has((k % nv) * nv + Math.floor(k / nv))) return false
  return true
}

/** STL binário (só os triângulos; vértices sem uso ficam de fora naturalmente). */
export function stl(m: Malha): ArrayBuffer {
  const nt = m.idx.length / 3, buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf)
  dv.setUint32(80, nt, true)
  for (let t = 0; t < nt; t++) {
    const o = 84 + t * 50 + 12 // normal = 0: os fatiadores recalculam
    for (let c = 0; c < 9; c++) dv.setFloat32(o + c * 4, m.pos[m.idx[t * 3 + (c / 3 | 0)] * 3 + c % 3], true)
  }
  return buf
}
