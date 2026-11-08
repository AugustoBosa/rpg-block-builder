// Aberturas (porta e janela = só o vão): perfil 2D (u ao longo da parede, v para cima), parte dentro e parte fora do retângulo da parede.
// Geometria pura (sem WASM); o corte do sólido está em parede.ts.
import type { Opcoes } from './bloco'
import { celula, regiao } from './sistema'
import type { Abertura, Ancora, Linha, Parede } from './parede'

export const paredeNova = (id: string, ancora: Ancora, comprimento: number): Parede =>
  ({ id, ancora, inicio: 0, comprimento, altura: 30, espessura: 6, lado: ancora.tipo === 'aresta' ? 'dentro' : 'centro', aberturas: [] })

/** Lado `i` do contorno do bloco (4 no quadrado, 6 no hexágono; `i` = direção da normal): a reta externa mais afastada, do primeiro ao último ponto das células. */
export function ladoBloco(o: Opcoes, i: number) {
  const nc = celula(o).n[i]
  if (!nc) return null // lado além do formato atual (ex.: lado 4 num quadrado)
  const k = regiao(o, o.linhas, o.colunas).seg, n0 = k.find(g => Math.abs(Math.atan2(g[5], g[4]) - Math.atan2(nc[1], nc[0])) < 1e-6)
  if (!n0) return null
  const n: [number, number] = [n0[4], n0[5]], off = (g: number[]) => g[0] * n[0] + g[1] * n[1]
  const m = Math.max(...k.filter(g => g[4] === n0[4] && g[5] === n0[5]).map(off))
  const gs = k.filter(g => g[4] === n0[4] && g[5] === n0[5] && m - off(g) < 1e-3)
  const L0 = Math.hypot(n0[2] - n0[0], n0[3] - n0[1]), d: [number, number] = [(n0[2] - n0[0]) / L0, (n0[3] - n0[1]) / L0]
  const t = gs.flatMap(g => [g[0] * d[0] + g[1] * d[1], g[2] * d[0] + g[3] * d[1]]), t0 = Math.min(...t)
  const b = gs[0], tb = b[0] * d[0] + b[1] * d[1]
  return { d, n, L: Math.max(...t) - t0, s: [b[0] + d[0] * (t0 - tb), b[1] + d[1] * (t0 - tb)] as [number, number] }
}
export const aberturaNova = (tipo: Abertura['tipo'] = 'porta'): Abertura =>
  ({ tipo, forma: 'reta', pos: 0, largura: 10, altura: 18, peitoril: tipo === 'porta' ? 0 : 8, batente: { ligado: false, largura: 1.5, saliencia: .6 } })

/** Sistema de coordenadas da parede no plano do bloco: d = sentido ao longo dela, n = normal (para onde a espessura cresce com `lado` = fora),
 *  s = ponto de partida da âncora, [o1, o2] = faixa da espessura em n (engordada `dl`), pt(u, w) = ponto (x, y) em u ao longo e w de lado. */
export function quadro(o: Opcoes, p: Parede, dl = 0) {
  const a = p.ancora
  let d: [number, number], n: [number, number], s: [number, number]
  if (a.tipo === 'aresta') {
    const g = ladoBloco(o, a.lado)
    if (!g) throw new Error(`parede ${p.id}: lado ${a.lado} não existe`)
    d = g.d; n = g.n; s = g.s
  } else {
    const t = ({ x: 0, y: 90, h0: 0, h60: 60, h120: 120 }[a.eixo]) * Math.PI / 180
    d = [Math.cos(t), Math.sin(t)]; n = [-d[1], d[0]]; s = [n[0] * a.desloc, n[1] * a.desloc]
  }
  const e = p.espessura, [a1, a2] = p.lado === 'fora' ? [0, e] : p.lado === 'dentro' ? [-e, 0] : [-e / 2, e / 2]
  const pt = (u: number, w: number): [number, number] => [s[0] + d[0] * (p.inicio + u) + n[0] * w, s[1] + d[1] * (p.inicio + u) + n[1] * w]
  return { d, n, s, o1: a1 - dl, o2: a2 + dl, pt }
}

/** Tracejado 3D das aberturas fora da área: uma polilinha (xyz achatado) por trecho contínuo, no meio da espessura; o pé da parede fica em z = altura do piso. */
export function tracejado3D(o: Opcoes, p: Parede): number[][] {
  const { pt, o1, o2 } = quadro(o, p), w = (o1 + o2) / 2
  return p.aberturas.flatMap(ab => foraDaArea(p, ab)).map(l => l.flatMap(([u, v]) => [...pt(u, w), o.altura + v]))
}

const N = 24 // segmentos por arco (semicírculo)

/** Perfil fechado (anti-horário) do vão. Nas formas em arco a altura nunca é menor que a flecha do arco (arco w/2, abatido w/4, ogiva w·√3/2). */
export function perfilAbertura(a: Abertura): Linha {
  const w = a.largura, u0 = a.pos - w / 2, u1 = a.pos + w / 2, v0 = a.peitoril
  if (a.forma === 'reta') return [[u0, v0], [u1, v0], [u1, v0 + a.altura], [u0, v0 + a.altura]]
  const rise = a.forma === 'arco' ? w / 2 : a.forma === 'abatido' ? w / 4 : w * Math.sqrt(3) / 2, vs = v0 + Math.max(a.altura, rise) - rise // vs: início do arco
  const topo: Linha = []
  if (a.forma === 'ogiva') { // dois arcos de raio w, centros nas bases opostas, ponta em 60°
    const M = N / 2, k = Math.PI / 3
    for (let i = 1; i <= M; i++) topo.push([u0 + w * Math.cos(k * i / M), vs + w * Math.sin(k * i / M)])
    for (let i = M - 1; i >= 1; i--) topo.push([u1 - w * Math.cos(k * i / M), vs + w * Math.sin(k * i / M)])
  } else { // arco circular de raio R e centro (pos, vs + rise − R)
    const R = (w * w / 4 + rise * rise) / (2 * rise), ang = a.forma === 'arco' ? Math.PI / 2 : Math.asin(w / 2 / R)
    for (let i = 1; i < N; i++) { const t = ang * (1 - 2 * i / N); topo.push([a.pos + R * Math.sin(t), vs + rise - R + R * Math.cos(t)]) }
  }
  return [[u0, v0], [u1, v0], [u1, vs], ...topo, [u0, vs]]
}

const rect = (p: Parede) => [0, 0, p.comprimento, p.altura] as const

/** Área (mm²) do perfil que cai dentro do retângulo da parede (Sutherland–Hodgman nos 4 lados). */
export function areaDentro(p: Parede, a: Abertura): number {
  const [x0, y0, x1, y1] = rect(p)
  let P = perfilAbertura(a)
  const corta = (dentro: (q: [number, number]) => boolean, cruza: (q: [number, number], r: [number, number]) => [number, number]) => {
    const S: Linha = []
    P.forEach((q, i) => { const r = P[(i + P.length - 1) % P.length]; if (dentro(q)) { if (!dentro(r)) S.push(cruza(r, q)); S.push(q) } else if (dentro(r)) S.push(cruza(r, q)) })
    P = S
  }
  const ux = (q: [number, number], r: [number, number], x: number): [number, number] => [x, q[1] + (r[1] - q[1]) * (x - q[0]) / (r[0] - q[0])]
  const uy = (q: [number, number], r: [number, number], y: number): [number, number] => [q[0] + (r[0] - q[0]) * (y - q[1]) / (r[1] - q[1]), y]
  corta(q => q[0] >= x0, (q, r) => ux(q, r, x0)); corta(q => q[0] <= x1, (q, r) => ux(q, r, x1))
  corta(q => q[1] >= y0, (q, r) => uy(q, r, y0)); corta(q => q[1] <= y1, (q, r) => uy(q, r, y1))
  return Math.abs(P.reduce((s, [x, y], i) => s + x * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * y, 0) / 2)
}

/** Pedaços das arestas do perfil que ficam fora do retângulo da parede (para o tracejado); o que está sobre a borda conta como dentro. */
export function foraDaArea(p: Parede, a: Abertura): Linha[] {
  const [x0, y0, x1, y1] = rect(p), P = perfilAbertura(a), out: Linha[] = []
  P.forEach((q, i) => {
    const r = P[(i + 1) % P.length], dx = r[0] - q[0], dy = r[1] - q[1]
    let t0 = 0, t1 = 1 // trecho [t0, t1] dentro (Liang–Barsky); fora = o resto
    for (const [pp, qq] of [[-dx, q[0] - x0], [dx, x1 - q[0]], [-dy, q[1] - y0], [dy, y1 - q[1]]]) {
      if (pp === 0) { if (qq < 0) { t0 = 1; t1 = 0 } } else { const t = qq / pp; if (pp < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t) }
    }
    const trechos = t0 > t1 ? [[0, 1]] : [[0, t0], [t1, 1]]
    for (const [s, e] of trechos) if (e - s > 1e-9) {
      const A: [number, number] = [q[0] + dx * s, q[1] + dy * s], B: [number, number] = [q[0] + dx * e, q[1] + dy * e], ult = out[out.length - 1]
      const fim = ult?.[ult.length - 1]
      if (fim && Math.hypot(fim[0] - A[0], fim[1] - A[1]) < 1e-9) ult.push(B) // continua a polilinha anterior (tracejado sem quebra de fase)
      else out.push([A, B])
    }
  })
  return out
}

/** Paredes cuja âncora existe no bloco atual (uma aresta some se linhas, colunas ou formato mudam): as outras são ignoradas. */
export const paredesValidas = (o: Opcoes) => o.paredes.filter(p => !orfa(o, p))
/** Parede em aresta cujo lado não existe mais no bloco atual (ignorada na prévia, no STL e no esquema). */
export const orfa = (o: Opcoes, p: Parede) => p.ancora.tipo === 'aresta' && !ladoBloco(o, p.ancora.lado)
