// Piso de Pedra de 1 célula (qualquer formato do sistema): corpo com pé (sistema.ts) + laje texturizada,
// duas cascas fechadas sobrepostas. Malha final: suavização e redução, sem mexer na borda nem no encaixe.
import { MeshoptSimplifier } from 'meshoptimizer'
import { mapa, ruido } from './ruido'
import { pedra, PEDRA, type KnobsPedra } from './pedra'
import { celula, corpo, distBorda, malha, SISTEMA, type Celula, type Malha, type Sistema } from './sistema'
export type { Malha }

const RELEVO = 2.6 // mm: o corpo termina RELEVO abaixo do topo
const BORDA_FIXA = 1.2 // mm: a redução não toca esta faixa da borda
const TRI_MIN = 240000, SUAVIZA = 4 // TRI_MIN: triângulos do piso 35 × 35 (como as originais); cresce com a área^0,75

export const PISO = { // nome: [padrão, mín, máx, rótulo]
  altura: [24.5, 12, 60, 'Altura total (mm)'],
  semente: [1, 0, 9999, 'Semente'], desgaste: [.5, 0, 1, 'Desgaste'], tamanho_pedra: [10, 5, 25, 'Tamanho da pedra (mm)'],
  profundidade: [.5, .4, .7, 'Profundidade'], posicao_x: [0, -8, 8, 'Posição X no mapa'], posicao_y: [0, -8, 8, 'Posição Y no mapa'],
  quina_largura: [1.8, 0, 5, 'Quina: largura (mm)'], quina_gasto: [1, 0, 3, 'Quina: gasto'], lateral_largura: [2, 0, 5, 'Lateral: largura (mm)'],
  lateral_gasto: [1, 0, 3, 'Lateral: gasto'], ruido_borda: [.3, .05, 2, 'Ruído da borda'], teto: [2.5, .5, 2.5, 'Teto do relevo (mm)'],
  junta_piso: [2.4, .5, 5, 'Ganho da junta (× profundidade)'], resolucao: [.125, .1, 1, 'Malha (mm)'],
} as const
export const GUIAS = { // grid e degrau
  linhas: [3, 1, 12, 'Linhas'], colunas: [3, 1, 12, 'Colunas'], altura_degrau: [24, 10, 80, 'Degrau: altura (mm)'],
} as const
type Num<T> = { -readonly [k in keyof T]: number }
export type Opcoes = Sistema & Num<typeof PISO> & Num<typeof GUIAS> & { pedra: KnobsPedra }
const ini = (t: object) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v[0]]))
export const padrao = (): Opcoes => ({ ...ini(SISTEMA), ...ini(PISO), ...ini(GUIAS), formato: 'quadrado', pedra: ini(PEDRA) } as any)

/** Rede do topo da laje: xy por ponto, triângulos (índices da rede) e contorno anti-horário. */
function rede(o: Opcoes, c: Celula, res: number) {
  const XY: number[] = [], tri: number[] = [], borda: number[] = []
  if (c.hex) { // rede triangular: o hexágono fecha exato nela; (q, r) axiais
    const l = o.largura / Math.sqrt(3), n = Math.max(2, Math.round(l / res)), e = l / n, h = e * Math.sqrt(3) / 2
    const id = new Map<number, number>(), ok = (q: number, r: number) => Math.abs(q) <= n && Math.abs(r) <= n && Math.abs(q + r) <= n
    const p = (q: number, r: number) => {
      const k = (q + n) * (2 * n + 1) + r + n
      let i = id.get(k)
      if (i === undefined) { i = XY.length / 2; XY.push(q * e + r * e / 2, r * h); id.set(k, i) }
      return i
    }
    for (let q = -n; q <= n; q++) for (let r = -n; r <= n; r++) {
      if (ok(q, r) && ok(q + 1, r) && ok(q, r + 1)) tri.push(p(q, r), p(q + 1, r), p(q, r + 1))
      if (ok(q + 1, r) && ok(q + 1, r + 1) && ok(q, r + 1)) tri.push(p(q + 1, r), p(q + 1, r + 1), p(q, r + 1))
    }
    let q = n, r = 0
    for (const [dq, dr] of [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]]) for (let t = 0; t < n; t++) { borda.push(p(q, r)); q += dq; r += dr }
  } else {
    const L = c.a[0] * 2, C = c.a[1] * 2, nx = Math.round(L / res + 1), ny = Math.round(C / res + 1)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) XY.push(-L / 2 + i * L / (nx - 1), -C / 2 + j * C / (ny - 1))
    const p = (i: number, j: number) => i + nx * j
    for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) tri.push(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j), p(i + 1, j + 1), p(i, j + 1))
    for (let i = 0; i + 1 < nx; i++) borda.push(p(i, 0))
    for (let j = 0; j + 1 < ny; j++) borda.push(p(nx - 1, j))
    for (let i = nx - 1; i > 0; i--) borda.push(p(i, ny - 1))
    for (let j = ny - 1; j > 0; j--) borda.push(p(0, j))
  }
  return { XY, tri, borda }
}

/** Malha crua (sem suavizar). zt = topo do corpo. */
export function piso(o: Opcoes): Malha & { zt: number; c: Celula } {
  const c = celula(o), zt = o.altura - RELEVO
  const cp = malha(corpo(o, zt))
  const P: number[] = Array.from(cp.pos), T: number[] = Array.from(cp.idx)
  const quad = (a: number, b: number, c: number, d: number) => T.push(a, b, c, a, c, d)

  // laje: de zt − 0,6 até zt + RELEVO; topo cortado pela textura, laterais gastas perto do topo
  const res = Math.max(o.resolucao, .1)
  const z0 = zt - .6, z1 = zt + RELEVO, nz = Math.round((z1 - z0) / res + 1)
  const { XY, tri, borda } = rede(o, c, res), nl = XY.length / 2
  const base = P.length / 3, id = new Int32Array(nl * nz).fill(-1)
  const ox = o.posicao_x * c.passo[0], oy = o.posicao_y * c.passo[1], ds = o.semente * 13.7
  const prof = Math.max(o.profundidade, .4) * o.junta_piso, des = o.desgaste, tam = o.tamanho_pedra
  const corte = new Float32Array(nl).fill(-1) // corte do topo por ponto da rede, calculado uma vez
  const v = (L: number, k: number) => {
    const n = L + nl * k
    if (id[n] >= 0) return id[n]
    const x = XY[L * 2], y = XY[L * 2 + 1], z = z0 + k * (z1 - z0) / (nz - 1)
    const gx = x + ox, gy = y + oy
    const rn = ruido(gx, gy, ds, o.ruido_borda, 3, .5, 9)
    const lado = (.2 + des * .5) * (.4 + rn * 1.2) * mapa(z, zt, z1, 0, 1) * o.lateral_gasto // recuo da lateral: até ~1 mm no topo
    let dx = 0, dy = 0 // recuo para dentro, somado por lado (perto da quina, dos dois)
    for (let i = 0; i < c.a.length; i++) {
      const e = mapa(c.a[i] - c.n[i][0] * x - c.n[i][1] * y, 0, o.lateral_largura, 1, 0)
      dx -= e * c.n[i][0]; dy -= e * c.n[i][1]
    }
    let ct = corte[L]
    if (ct < 0) {
      const quina = mapa(distBorda(c, x, y), 0, o.quina_largura, 1, 0) * (.25 + des * .8) * (.6 + rn * .8) * o.quina_gasto
      ct = corte[L] = Math.min(Math.min(pedra(gx, gy, ds, tam, prof, des, o.pedra), o.teto) + quina, o.teto)
    }
    // a coluna da lateral encolhe até o relevo daquele ponto: a textura desce pela lateral, sem parede fina em volta (o fundo z0 fica)
    P.push(x + dx * lado, y + dy * lado, z0 + (z - z0) * (1 - ct / (z1 - z0)))
    return (id[n] = base + (P.length / 3 - 1 - base))
  }
  for (let t = 0; t < tri.length; t++) T.push(v(tri[t], nz - 1)) // topo
  for (let m = 0; m < borda.length; m++) { // laterais
    const a = borda[m], b = borda[(m + 1) % borda.length]
    for (let k = 0; k + 1 < nz; k++) quad(v(a, k), v(b, k), v(b, k + 1), v(a, k + 1))
  }
  // fundo da laje: plano e escondido no corpo, então só um leque do centro até o contorno (sem grade fina)
  const ctr = P.length / 3
  P.push(0, 0, z0)
  for (let m = 0; m < borda.length; m++) T.push(ctr, v(borda[(m + 1) % borda.length], 0), v(borda[m], 0))
  return { pos: new Float32Array(P), idx: new Uint32Array(T), zt, c }
}

/** Suaviza (4 passadas, fator 0,5) o relevo longe da borda e reduz para ~240 mil triângulos (alvo ∝ n^0,75), com a borda travada. */
export async function final(m: Malha & { zt: number; c: Celula }): Promise<Malha> {
  const { pos, idx, zt, c: cel } = m, nv = pos.length / 3, nt = idx.length / 3
  const dentro = (i: number, b: number) => distBorda(cel, pos[i * 3], pos[i * 3 + 1]) > b
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
  const alvo = TRI_MIN * (cel.area / 35 ** 2) ** .75
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
