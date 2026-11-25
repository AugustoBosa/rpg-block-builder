// Piso de Pedra de linhas × colunas células (qualquer formato do sistema): corpo com um pé por célula (sistema.ts)
// + uma laje texturizada contínua; duas cascas fechadas sobrepostas. Malha final: suavização e redução,
// sem mexer na borda nem no encaixe.
import { MeshoptSimplifier } from 'meshoptimizer'
import { mapa, ruido } from './ruido'
import { PEDRA, type KnobsPedra } from './pedra'
import { LISA, type KnobsLisa } from './lisa'
import { LAJOTA, type KnobsLajota } from './lajota'
import { TIJOLO, type KnobsTijolo } from './tijolo'
import type { KnobsTerra } from './terra'
import type { KnobsAreia } from './areia'
import type { KnobsRachado } from './rachado'
import type { KnobsTabuas } from './tabuas'
import type { KnobsCaverna } from './caverna'
import type { KnobsCasco } from './casco'
import type { KnobsMetal } from './metal'
import type { KnobsAgua } from './agua'
import type { KnobsLava } from './lava'
import type { KnobsNichos } from './nichos'
import type { KnobsGlifos } from './glifos'
import { profTex, TEX, tetoDe, type TexId } from './textura'
import type { Parede } from './parede'
import type { Objeto } from './miniaturas'
import { assento, corpos, distBorda, distSeg, malha, regiao, SISTEMA, type Malha, type Regiao, type Sistema } from './sistema'
export type { Malha }

export const RELEVO = 2.6 // mm: o corpo termina RELEVO abaixo do topo
const BORDA_FIXA = 1.2 // mm: a redução não toca esta faixa da borda
const TRI_MIN = 240000, SUAVIZA = 4 // TRI_MIN: triângulos do piso 35 × 35 (como as originais); cresce com a área^0,75

export const PISO = { // nome: [padrão, mín, máx, rótulo, passo?] (sem passo: contínuo)
  linhas: [1, 1, 6, 'Linhas (células)', 1], colunas: [1, 1, 6, 'Colunas (células)', 1], altura: [24.5, 12, 60, 'Altura total (mm)'],
  semente: [1, 0, 9999, 'Semente', 1], desgaste: [.5, 0, 1, 'Desgaste'], tamanho_pedra: [10, 5, 25, 'Tamanho da pedra (mm)'],
  profundidade: [.5, .4, .7, 'Profundidade'], posicao_x: [0, -8, 8, 'Posição X no mapa (células)', .5], posicao_y: [0, -8, 8, 'Posição Y no mapa (células)', .5],
  inclinacao: [0, 0, 40, 'Inclinação da rampa (graus)', 1],
  escada_degraus: [0, 0, 12, 'Escada: degraus', 1], escada_altura: [15.5, 4, 40, 'Escada: subida total (mm)'],
  quina_largura: [1.8, 0, 5, 'Quina: largura (mm)'], quina_gasto: [1, 0, 3, 'Quina: gasto'], lateral_largura: [2, 0, 5, 'Lateral: largura (mm)'],
  lateral_gasto: [1, 0, 3, 'Lateral: gasto'], ruido_borda: [.3, .05, 2, 'Ruído da borda'], teto: [2.5, .5, 2.5, 'Teto do relevo (mm)'],
  junta_piso: [2.4, .5, 5, 'Ganho da junta (× profundidade)'], resolucao: [.125, .1, 1, 'Malha (mm)'],
  relevo_altura: [20, 2, 60, 'Relevo: altura (mm)'],
} as const
export const GUIAS = { // grid e degrau (aba própria)
  grid_linhas: [3, 1, 12, 'Linhas', 1], grid_colunas: [3, 1, 12, 'Colunas', 1], altura_degrau: [24, 10, 80, 'Degrau: altura (mm)'],
  trava_altura: [3, 1.5, 6, 'Trava: altura (mm)'], trava_comprimento: [8, 4, 16, 'Trava: comprimento (mm)'], trava_largura: [4, 2, 8, 'Trava: cabeça (mm)'],
  trava_haste: [2, 1, 5, 'Trava: haste/pescoço (mm)'], trava_folga: [.15, 0, .5, 'Trava: folga (mm)'],
  ima_grid_d: [4, 2, 10, 'Ímã do grid: diâmetro (mm)'], ima_grid_h: [2, 1, 5, 'Ímã do grid: altura (mm)'], ima_por_lado: [1, 1, 4, 'Ímãs por lado', 1],
} as const
// seções das abas Blocos e Grids (chave → título; as tuplas acima não mudam)
export const SECAO_PISO = {
  linhas: 'Peça', colunas: 'Peça', altura: 'Peça', posicao_x: 'Peça', posicao_y: 'Peça', inclinacao: 'Peça', escada_degraus: 'Peça', escada_altura: 'Peça',
  semente: 'Textura', desgaste: 'Textura', tamanho_pedra: 'Textura', profundidade: 'Textura', teto: 'Textura', junta_piso: 'Textura',
  quina_largura: 'Borda', quina_gasto: 'Borda', lateral_largura: 'Borda', lateral_gasto: 'Borda', ruido_borda: 'Borda',
  relevo_altura: 'Terreno',
} as const
export const SECAO_GUIAS = { grid_linhas: 'Dimensões', grid_colunas: 'Dimensões', altura_degrau: 'Dimensões',
  trava_altura: 'Travas', trava_comprimento: 'Travas', trava_largura: 'Travas', trava_haste: 'Travas', trava_folga: 'Travas', ima_grid_d: 'Ímãs do grid', ima_grid_h: 'Ímãs do grid', ima_por_lado: 'Ímãs do grid' } as const
type Num<T> = { -readonly [k in keyof T]: number }
export type Opcoes = Sistema & Num<typeof PISO> & Num<typeof GUIAS> & { textura: TexId; texturaParede: TexId | ''; pedra: KnobsPedra; lisa: KnobsLisa; lajota: KnobsLajota; tijolo: KnobsTijolo; terra: KnobsTerra; areia: KnobsAreia; rachado: KnobsRachado; tabuas: KnobsTabuas; caverna: KnobsCaverna; casco: KnobsCasco; metal: KnobsMetal; agua: KnobsAgua; lava: KnobsLava; nichos: KnobsNichos; glifos: KnobsGlifos; paredes: Parede[]; trava: 'nenhuma' | 'clip' | 'macho'; ima_borda: boolean; ima_cruz: boolean; ima_meio: boolean; alivio: boolean; inclinacao_dir: '+y' | '-y' | '+x' | '-x'; pilar: boolean; pilar_saliencia: number; pilar_sobe: number; telhado_forma: 'nenhum' | 'uma' | 'duas' | 'quatro' | 'plano'; telhado_modo: 'removivel' | 'fundido'; telhado_eixo: 'x' | 'y'; telhado_angulo: number; telhado_beiral: number; telhado_borda: number; mureta_altura: number; mureta_espessura: number; ameias: boolean; saia_altura: number; saia_folga: number; telhado_casca: number; texturaTelhado: TexId; relevo_tipo: Relevo; objetos: Objeto[] }
export type Relevo = '' | 'colina' | 'montanha' | 'vulcao'
const ini = (t: object) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v[0]]))
export const padrao = (): Opcoes => ({ ...ini(SISTEMA), ...ini(PISO), ...ini(GUIAS), formato: 'quadrado', trava: 'nenhuma', ima_borda: false, ima_cruz: false, ima_meio: false, alivio: false, textura: 'pedra', texturaParede: '', inclinacao_dir: '+y', pilar: false, pilar_saliencia: 1.5, pilar_sobe: 2, telhado_forma: 'nenhum', telhado_modo: 'removivel', telhado_eixo: 'x', telhado_angulo: 35, telhado_beiral: 2, telhado_borda: 2, mureta_altura: 4, mureta_espessura: 2, ameias: true, saia_altura: 3, saia_folga: .3, telhado_casca: 2, texturaTelhado: 'casco', relevo_tipo: '', objetos: [], ...Object.fromEntries(Object.entries(TEX).map(([id, t]) => [id, ini(t.knobs)])), paredes: [] } as any)

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

/** O relevo de cada ponto da rede depende só das coordenadas do ponto: dá para calcular em partes, em paralelo. */
function relevo(o: Opcoes, r: Regiao, XY: number[]) {
  const ox = o.posicao_x * r.c.passo[0], oy = o.posicao_y * r.c.passo[1], ds = o.semente * 13.7
  const prof = Math.max(o.profundidade, .4) * o.junta_piso, des = o.desgaste
  return {
    rn: (L: number) => ruido(XY[L * 2] + ox, XY[L * 2 + 1] + oy, ds, o.ruido_borda, 3, .5, 9),
    corte: (L: number, rn: number) => { // profundidade do corte do topo no ponto L
      const x = XY[L * 2], y = XY[L * 2 + 1]
      const quina = mapa(distBorda(r, x, y), 0, o.quina_largura, 1, 0) * (.25 + des * .8) * (.6 + rn * .8) * o.quina_gasto
      const teto = tetoDe(o)
      return Math.min(Math.min(profTex(o, x + ox, y + oy, ds, prof), teto) + quina, teto)
    },
  }
}
/** Parte `i` de `n` do relevo do topo (pontos [de, de + c.length) da rede); `piso()` aceita o resultado montado em `cortes`. */
export function cortesParte(o: Opcoes, i: number, n: number) {
  const r = regiao(o, o.linhas, o.colunas), { XY } = rede(o, r, Math.max(o.resolucao, .1)), nl = XY.length / 2
  const f = relevo(o, r, XY), de = Math.floor(nl * i / n), c = new Float64Array(Math.floor(nl * (i + 1) / n) - de)
  for (let L = de; L < de + c.length; L++) c[L - de] = f.corte(L, f.rn(L))
  return { de, nl, c }
}

/** Rampa e escada: eixo (0 = x, 1 = y), sinal, `sobe(x, y)` = quanto o topo sobe no ponto (mm) e `espelho` = perto de um espelho da escada.
 *  Escada (≥ 2 degraus) tem prioridade: n degraus de piso plano, o 1º no nível 0 e o último em `escada_altura`. */
function rampa(o: Opcoes, r: Regiao) {
  const esc = o.escada_degraus >= 2, n = o.escada_degraus, tg = Math.tan(o.inclinacao * Math.PI / 180), ei = o.inclinacao_dir[1] === 'x' ? 0 : 1, sn = o.inclinacao_dir[0] === '-' ? -1 : 1
  const s = r.seg.flatMap(g => [sn * g[ei], sn * g[ei + 2]]), s0 = Math.min(...s), ext = Math.max(...s) - s0
  const t = (x: number, y: number) => sn * (ei ? y : x) - s0, p = ext / n // p: largura de cada degrau
  return {
    tg, ext,
    sobe: (x: number, y: number) => esc ? o.escada_altura * Math.min(n - 1, Math.max(0, Math.floor(t(x, y) / p))) / (n - 1) : tg * t(x, y),
    espelho: (x: number, y: number) => esc && Math.abs(t(x, y) - Math.round(t(x, y) / p) * p) < .5, // a < 0,5 mm de um espelho: sem suavizar nem reduzir
  }
}
const MARGEM_RELEVO = 3 // mm: faixa da borda sem relevo grande (emenda 0 com o vizinho plano)
/** Relevo grande da escala Reino: quanto o topo sobe no ponto (mm); null sem relevo. Vai a 0 na borda. */
export function relevoGrande(o: Opcoes, r: Regiao): ((x: number, y: number) => number) | null {
  if (!o.relevo_tipo) return null
  const xs = r.seg.flatMap(g => [g[0], g[2]]), ys = r.seg.flatMap(g => [g[1], g[3]])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.min(x1 - x0, y1 - y0) / 2, A = o.relevo_altura, ds = o.semente * 13.7, t = o.relevo_tipo
  return (x, y) => {
    const p = Math.min(1, Math.hypot(x - cx, y - cy) / R)
    const h = t === 'colina' ? .5 * (1 + Math.cos(Math.PI * p))
      : t === 'montanha' ? (1 - p) ** 1.3 * (.65 + .7 * ruido(x, y, ds, .09, 3, .55, 7)) // cristas pelo ruído
      : p < .22 ? .5 + .28 * (p / .22) ** 2 : 1 - p // vulcão: cone com cratera (fundo a meia altura)
    return A * h * mapa(distBorda(r, x, y), 0, MARGEM_RELEVO, 0, 1)
  }
}
/** Rampa ou escada: a laje sobe e as paredes saem. */
export const inclinado = (o: Opcoes) => o.escada_degraus >= 2 || o.inclinacao > 0
/** Subida de um degrau padrão (mm): altura do degrau menos o assento. */
export const subidaNivel = (o: Opcoes) => o.altura_degrau - assento(o)
/** Quanto o topo sobe de uma ponta à outra (mm); 0 sem rampa. */
export const subida = (o: Opcoes) => { if (o.escada_degraus >= 2) return o.escada_altura; const k = rampa(o, regiao(o, o.linhas, o.colunas)); return k.tg * k.ext }

/** Malha crua (sem suavizar). zt = topo do corpo. `cortes` (opcional): relevo do topo já calculado por cortesParte. */
export function piso(o: Opcoes, cortes?: Float64Array): Malha & { zt: number; r: Regiao; espelho: (x: number, y: number) => boolean } {
  const r = regiao(o, o.linhas, o.colunas), zt = o.altura - RELEVO
  const cp = malha(corpos(o, r.cs, zt))
  const P: number[] = Array.from(cp.pos), T: number[] = Array.from(cp.idx)
  const quad = (a: number, b: number, c: number, d: number) => T.push(a, b, c, a, c, d)

  // laje: de zt − 0,6 até zt + RELEVO; topo cortado pela textura, laterais gastas perto do topo
  const res = Math.max(o.resolucao, .1)
  const z0 = zt - .6, z1 = zt + RELEVO, nz = Math.round((z1 - z0) / res + 1)
  const { XY, tri, loops } = rede(o, r, res), nl = XY.length / 2
  const base = P.length / 3, id = new Int32Array(nl * nz).fill(-1)
  const f = relevo(o, r, XY), des = o.desgaste, rp = rampa(o, r), rg = relevoGrande(o, r)
  const corte = new Float32Array(nl).fill(-1) // corte do topo por ponto da rede, calculado uma vez
  const v = (L: number, k: number) => {
    const n = L + nl * k
    if (id[n] >= 0) return id[n]
    const x = XY[L * 2], y = XY[L * 2 + 1], z = z0 + k * (z1 - z0) / (nz - 1)
    const rn = f.rn(L)
    const lado = (.2 + des * .5) * (.4 + rn * 1.2) * mapa(z, zt, z1, 0, 1) * o.lateral_gasto // recuo da lateral: até ~1 mm no topo
    let dx = 0, dy = 0 // recuo para dentro, somado por lado externo (perto da quina, dos dois)
    for (const g of r.seg) {
      const e = mapa(distSeg(g, x, y), 0, o.lateral_largura, 1, 0)
      dx -= e * g[4]; dy -= e * g[5]
    }
    let ct = corte[L]
    if (ct < 0) ct = corte[L] = cortes ? cortes[L] : f.corte(L, rn) // 1ª vez em precisão dupla, as seguintes em Float32 (como sempre foi)
    // a coluna da lateral encolhe até o relevo daquele ponto: a textura desce pela lateral, sem parede fina em volta (o fundo z0 fica)
    let zf = z0 + (z - z0) * (1 - ct / (z1 - z0))
    zf += rp.sobe(x, y) * k / (nz - 1) // rampa ou escada: o fundo (k = 0) fica, o topo sobe tudo; a laje vira cunha ou escada
    if (rg) zf += rg(x, y) * k / (nz - 1) // relevo grande (Reino): igual à rampa
    P.push(x + dx * lado, y + dy * lado, zf)
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
  return { pos: new Float32Array(P), idx: new Uint32Array(T), zt, r, espelho: rp.espelho }
}

/** Suaviza (4 passadas, fator 0,5) o relevo longe da borda e reduz para ~240 mil triângulos (alvo ∝ n^0,75), com a borda travada. */
export async function final(m: Malha & { zt: number; r: Regiao; espelho: (x: number, y: number) => boolean }): Promise<Malha> {
  const { pos, idx, zt, r: reg, espelho } = m, nv = pos.length / 3, nt = idx.length / 3
  const dentro = (i: number, b: number) => distBorda(reg, pos[i * 3], pos[i * 3 + 1]) > b
  const perto = (i: number) => espelho(pos[i * 3], pos[i * 3 + 1])
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
  for (let i = 0; i < nv; i++) if (dentro(i, .2) && pos[i * 3 + 2] > zt && !perto(i)) suave.push(i)
  for (let it = 0; it < SUAVIZA; it++) {
    const ant = pos.slice()
    for (const i of suave) for (let c = 0; c < 3; c++) {
      let s = 0
      for (let q = cont[i]; q < cont[i + 1]; q++) s += ant[viz[q] * 3 + c]
      pos[i * 3 + c] = .5 * ant[i * 3 + c] + .5 * s / (cont[i + 1] - cont[i])
    }
  }
  const trava = new Uint8Array(nv)
  for (let i = 0; i < nv; i++) trava[i] = dentro(i, BORDA_FIXA) && pos[i * 3 + 2] > zt + 1e-4 && !perto(i) ? 0 : 1 // corpo, encaixe e espelho da escada travados
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
    // sem arrays temporários: roda a cada tentativa de redução, em malhas de milhões de triângulos
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const u0 = pos[b] - pos[a], u1 = pos[b + 1] - pos[a + 1], u2 = pos[b + 2] - pos[a + 2]
    const w0 = pos[c] - pos[a], w1 = pos[c + 1] - pos[a + 1], w2 = pos[c + 2] - pos[a + 2]
    const area = Math.hypot(u1 * w2 - u2 * w1, u2 * w0 - u0 * w2, u0 * w1 - u1 * w0) / 2
    const d2 = (p: number, q: number) => (pos[p] - pos[q]) ** 2 + (pos[p + 1] - pos[q + 1]) ** 2 + (pos[p + 2] - pos[q + 2]) ** 2
    const lado2 = Math.max(d2(a, b), d2(b, c), d2(c, a))
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
