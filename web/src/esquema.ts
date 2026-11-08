// Esquemas SVG do sistema e do grid: planta, frontal, lateral e isométrica, no estilo de desenho técnico
// (contorno grosso, tracejado para o que está oculto, eixos traço-ponto, hachura nas seções, cotas com traços de 45°).
// Os números vêm só de medidas() e das funções de sistema.ts; aqui é projeção e desenho.
import type { Opcoes } from './bloco'
import { foraDaArea, paredesValidas, perfilAbertura, quadro } from './aberturas'
import { alturaGrid, celula, centros, contorno, medidas, regiao, type Celula, type Medidas } from './sistema'

type P2 = [number, number]
type Modo = 'bloco' | 'grade' | 'degrau' // bloco = sistema (bloco sobre grid 1×1); grade; degrau = bloco com furos no topo
// plate = placa do grid, furo = furo do grid, pe = bloco (pé + ombro); null = peça oculta ou inexistente
interface Modelo { M: Medidas; c: Celula; cs: P2[]; modo: Modo; G: number; T: number; zb: number; f: number; plate: number[][] | null; pe: number[][] | null; furo: number[][] | null }
interface Cota { a: P2; b: P2; off: P2; txt: string } // pontas em coordenadas de tela (mm, y para baixo) e deslocamento da linha (unidades)

const COR = { traco: '#e3e8ee', cota: '#ffb000', fundo: '#1b1d21', eixo: '#7d8590', grid: '#6fa8dc', bloco: '#d9b36c' }
export const EIXO = { x: '#ff3653', y: '#8adb00', z: '#2c8fff' } // as cores do gizmo da vista 3D
const VW = 400 // largura do viewBox: o painel (340 px) e o diálogo mostram quase em tamanho real, então o texto fica legível
const f0 = (v: number) => String(+v.toFixed(2)).replace('.', ',') // vírgula decimal, até 2 casas, sem zeros finais
const f1 = (v: number) => f0(v) + ' mm'
const pt = (p: P2) => p[0].toFixed(1) + ',' + p[1].toFixed(1)
const poli = (P: (p: P2) => P2, ps: P2[], attr: string) => `<polygon points="${ps.map(p => pt(P(p))).join(' ')}" ${attr}/>`
const DEFS = `<defs>${[['hg', COR.grid], ['hb', COR.bloco]].map(([id, c]) => `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#262a30"/><line x1="0" y1="0" x2="0" y2="5" stroke="${c}" stroke-width="1"/></pattern>`).join('')}</defs>`
const TRACO_PONTO = `stroke="${COR.eixo}" stroke-width="0.8" stroke-dasharray="10 2 2 2"` // linha de eixo

/** Meia-extensão de um polígono convexo no eixo k, no corte da outra coordenada = 0 (cel.a para o quadrado). */
function ext(poly: P2[], k: 0 | 1) {
  let m = 0
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], u = p[1 - k], v = q[1 - k]
    if ((u <= 0 && v >= 0) || (u >= 0 && v <= 0)) m = Math.max(m, Math.abs(p[k] + (u === v ? 0 : u / (u - v)) * (q[k] - p[k])))
  })
  return m
}

/** Perfil [z, recuo] recortado entre a e b, com as pontas interpoladas. */
function recorte(p: number[][], a: number, b: number): number[][] {
  const d = (z: number) => {
    for (let i = 0; i + 1 < p.length; i++) {
      const [z0, d0] = p[i], [z1, d1] = p[i + 1]
      if (z1 > z0 && z >= z0 && z <= z1) return d0 + (d1 - d0) * (z - z0) / (z1 - z0)
    }
    return p[p.length - 1][1]
  }
  return [[a, d(a)], ...p.filter(([z]) => z > a && z < b), [b, d(b)]]
}

/** Células do corte: as que têm a outra coordenada mais perto de 0 (uma fileira/coluna). */
function noCorte(cs: P2[], k: 0 | 1): P2[] {
  const o = (p: P2) => p[1 - k], m = Math.min(...cs.map(p => Math.abs(o(p))))
  const cand = cs.filter(p => Math.abs(Math.abs(o(p)) - m) < 1e-6), v0 = Math.min(...cand.map(o))
  return cand.filter(p => Math.abs(o(p) - v0) < 1e-6)
}

/** `mostrar` só vale no sistema (bloco sobre grid): filtra grid e/ou bloco. */
function modelo(o: Opcoes, cs: P2[], modo: Modo, mostrar = 'ambos'): Modelo {
  const M = medidas(o), G = alturaGrid(o), zf = M.fundoReal + o.folga_fundo
  const T = modo === 'degrau' ? Math.max(o.altura_degrau, G + M.assento + 1) : G // topo do grid (ou do degrau)
  const zb = modo === 'degrau' ? 0 : zf // base do pé: o bloco assenta em zf sobre o grid
  const pf = M.perfilFuro.map(([z, d]) => [z + (T - G), d])
  const comGrid = modo !== 'bloco' || mostrar !== 'bloco', comBloco = modo !== 'grade' && (modo !== 'bloco' || mostrar !== 'grid')
  return {
    M, c: celula(o), cs, modo, G, T, zb, f: M.fundoReal,
    plate: modo === 'degrau' || !comGrid ? null : [[0, 0], [G, 0]],
    pe: comBloco ? [...M.perfilPe.map(([z, d]) => [z + zb, d]), [modo === 'degrau' ? T : G + 6, 0]] : null,
    furo: comGrid ? recorte(pf, Math.max(pf[0][0], 0), T) : null,
  }
}

/** Contorno de um corte: lado direito [u + meia-extensão, z] de baixo para cima e o esquerdo espelhado (tela: z para baixo). */
function secao(c: Celula, k: 0 | 1, u: number, perfil: number[][]): P2[] {
  const w = (d: number) => ext(contorno(c, d), k)
  return [...perfil.map(([z, d]): P2 => [u + w(d), -z]), ...[...perfil].reverse().map(([z, d]): P2 => [u - w(d), -z])]
}

/** Afasta valores até haver `min` entre vizinhos (em ordem crescente), sem mover o conjunto para longe do original. Devolve na ordem de entrada.
 *  Determinístico: empurra cada um para baixo até o anterior + min, depois recentra o grupo na média original. */
function afasta(vs: number[], min: number): number[] {
  const idx = vs.map((_, i) => i).sort((i, j) => vs[i] - vs[j]), r = idx.map(i => vs[i]), m0 = r.reduce((s, v) => s + v, 0) / r.length
  for (let t = 1; t < r.length; t++) r[t] = Math.max(r[t], r[t - 1] + min)
  const sh = m0 - r.reduce((s, v) => s + v, 0) / r.length
  const out: number[] = []
  idx.forEach((i, t) => { out[i] = r[t] + sh })
  return out
}

/** Cotas no estilo de desenho técnico: linha de extensão, linha de cota com traços de 45° e o texto sempre na horizontal.
 *  Cota vertical: o texto vai para uma coluna ao lado (com chamada, se precisou descer ou subir para não bater); horizontal: acima ou abaixo da linha. */
function cotasSvg(P: (p: P2) => P2, lista: Cota[]): string {
  const L = lista.map(q => {
    const A = P(q.a), B = P(q.b), n = Math.hypot(q.off[0], q.off[1]) || 1
    const Ao: P2 = [A[0] + q.off[0], A[1] + q.off[1]], Bo: P2 = [B[0] + q.off[0], B[1] + q.off[1]]
    return { q, A, B, Ao, Bo, e: [q.off[0] / n, q.off[1] / n] as P2, vert: Math.abs(Bo[0] - Ao[0]) < Math.abs(Bo[1] - Ao[1]), mx: (Ao[0] + Bo[0]) / 2, my: (Ao[1] + Bo[1]) / 2 }
  })
  const lar = (txt: string) => txt.length * 6.6 + 6
  const pos = new Map<(typeof L)[number], { x: number; y: number; anc: string; chamada: boolean }>()
  for (const lado of [1, -1]) { // colunas de texto à direita (+) e à esquerda (−)
    const g = L.filter(c => c.vert && (c.q.off[0] >= 0 ? 1 : -1) === lado)
    if (!g.length) continue
    const x = lado > 0 ? Math.max(...g.flatMap(c => [c.Ao[0], c.Bo[0]])) + 12 : Math.min(...g.flatMap(c => [c.Ao[0], c.Bo[0]])) - 12
    const ys = afasta(g.map(c => c.my), 16)
    g.forEach((c, i) => pos.set(c, { x, y: ys[i], anc: lado > 0 ? 'start' : 'end', chamada: true }))
  }
  for (const lado of [1, -1]) { // texto de cota horizontal: acima (−) ou abaixo (+) da linha
    const g = L.filter(c => !c.vert && (c.q.off[1] >= 0 ? 1 : -1) === lado)
    if (!g.length) continue
    const xs = afasta(g.map(c => c.mx), Math.max(...g.map(c => lar(c.q.txt))) + 2)
    g.forEach((c, i) => pos.set(c, { x: xs[i], y: c.my + (lado > 0 ? 14 : -5), anc: 'middle', chamada: false }))
  }
  return L.map(c => {
    const { q, A, B, Ao, Bo, e } = c, u = Math.hypot(Bo[0] - Ao[0], Bo[1] - Ao[1]) || 1
    const ux = (Bo[0] - Ao[0]) / u, uy = (Bo[1] - Ao[1]) / u, tx = (ux - uy) * .7071 * 4, ty = (ux + uy) * .7071 * 4 // traço de 45°
    const ext = (p: P2, po: P2) => `<line x1="${(p[0] + e[0] * 2).toFixed(1)}" y1="${(p[1] + e[1] * 2).toFixed(1)}" x2="${(po[0] + e[0] * 3).toFixed(1)}" y2="${(po[1] + e[1] * 3).toFixed(1)}"/>`
    const tick = (p: P2) => `<line x1="${(p[0] - tx).toFixed(1)}" y1="${(p[1] - ty).toFixed(1)}" x2="${(p[0] + tx).toFixed(1)}" y2="${(p[1] + ty).toFixed(1)}" stroke-width="1.4"/>`
    const t = pos.get(c)!
    const chamada = t.chamada ? `<line x1="${c.Ao[0].toFixed(1)}" y1="${c.my.toFixed(1)}" x2="${(t.x + (t.anc === 'start' ? -3 : 3)).toFixed(1)}" y2="${t.y.toFixed(1)}" stroke-width="0.5"/>` : ''
    return `<g stroke="${COR.cota}" fill="${COR.cota}" stroke-width="0.7">${ext(A, Ao)}${ext(B, Bo)}<line x1="${Ao[0].toFixed(1)}" y1="${Ao[1].toFixed(1)}" x2="${Bo[0].toFixed(1)}" y2="${Bo[1].toFixed(1)}"/>${tick(Ao)}${tick(Bo)}${chamada}</g>` +
      `<text x="${t.x.toFixed(1)}" y="${(t.y + 4).toFixed(1)}" text-anchor="${t.anc}" font-family="sans-serif" font-size="12" fill="${COR.cota}" stroke="${COR.fundo}" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${q.txt}</text>`
  }).join('')
}

/** Moldura de uma vista: enquadra os pontos (tela, mm) num viewBox de largura fixa e desenha o título.
 *  `mini`: miniatura sem cotas (o título cresce, o desenho ocupa a largura toda). `nota`: texto no canto inferior (escala). */
function vista(titulo: string, ps: P2[], corpo: (P: (p: P2) => P2) => string, cor = COR.traco, mini = false, pad: [number, number, number] = [100, 58, 56]): string {
  const xs = ps.map(p => p[0]), ys = ps.map(p => p[1])
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
  const [px, pt0, pb] = mini ? [24, 44, 22] : pad, livre = VW - 2 * px
  const k = Math.min(livre / Math.max(w, 1e-6), (mini ? 300 : 230) / Math.max(h, 1e-6))
  const ox = px + (livre - w * k) / 2
  const P = (p: P2): P2 => [ox + (p[0] - x0) * k, pt0 + (p[1] - y0) * k]
  const H = h * k + pt0 + pb
  const nota = mini ? '' : `<text x="10" y="${(H - 8).toFixed(0)}" font-family="sans-serif" font-size="10" fill="${COR.eixo}">cotas em mm · escala ${k.toFixed(1)}:1</text>`
  return `<svg viewBox="0 0 ${VW} ${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">${DEFS}<rect width="100%" height="100%" fill="${COR.fundo}"/><text x="10" y="${mini ? 28 : 20}" font-family="sans-serif" font-size="${mini ? 24 : 13}" fill="${cor}">${titulo}</text><g stroke-width="${mini ? 2.4 : 1.3}" stroke-linejoin="round">${corpo(P)}</g>${nota}</svg>`
}

/** Altura do plano da planta: no meio do pé do bloco; sem bloco, no meio do grid. */
const zPlanta = (m: Modelo) => m.pe ? m.zb + m.M.hPe / 2 : m.G / 2

function planta(o: Opcoes, m: Modelo, mini = false): string {
  const { c, cs, M } = m, a0 = c.a[0], a1 = c.a[1]
  const S = (x: number, y: number): P2 => [x, -y] // planta: y para cima na peça, para baixo na tela
  const contA = (cx: number, cy: number, d: number) => contorno(c, d).map(([x, y]): P2 => S(cx + x, cy + y))
  const formas: [P2[], string][] = [], ima: P2[] = [], eixos: P2[][] = []
  for (const [cx, cy] of cs) {
    formas.push([contA(cx, cy, 0), `fill="none" stroke="${COR.traco}"`])
    if (m.furo) formas.push([contA(cx, cy, o.recuo), `fill="none" stroke="${COR.traco}" stroke-dasharray="4 3" stroke-width="0.9"`]) // furo do grid (oculto)
    if (m.pe) formas.push([contA(cx, cy, M.perfilPe[2][1]), `fill="none" stroke="${COR.traco}"`]) // pé: recuo + folga
    if (o.ima_d > 0 && m.pe) ima.push(S(cx, cy))
    eixos.push([S(cx - a0 - 3, cy), S(cx + a0 + 3, cy)], [S(cx, cy - a1 - 3), S(cx, cy + a1 + 3)])
  }
  const [rx, ry] = cs.reduce((p, q) => Math.hypot(q[0], q[1]) < Math.hypot(p[0], p[1]) ? q : p) // célula mais perto da origem
  const W = (d: number) => ext(contorno(c, d), 0)
  const cot: Cota[] = mini ? [] : c.hex
    ? [{ a: S(rx, ry - a1), b: S(rx, ry + a1), off: [-16, 0], txt: `entre lados ${f0(o.largura)}` }]
    : [{ a: S(rx - a0, ry - a1), b: S(rx + a0, ry - a1), off: [0, 16], txt: `largura ${f0(o.largura)}` },
       { a: S(rx + a0, ry - a1), b: S(rx + a0, ry + a1), off: [16, 0], txt: `comprimento ${f0(o.comprimento)}` }]
  if (!mini) cot.push(c.hex // lados planos: o recuo é a distância perpendicular entre o lado de cima e o recuado (em Y)
    ? { a: S(rx, ry + a1), b: S(rx, ry + a1 - o.recuo), off: [16, 0], txt: `recuo ${f0(o.recuo)}` }
    : { a: S(rx + W(0), ry), b: S(rx + W(o.recuo), ry), off: [0, -16], txt: `recuo ${f0(o.recuo)}` })
  const ps = [...formas.flatMap(f => f[0]), ...cot.flatMap(q => [q.a, q.b]), ...ima, ...eixos.flat()]
  return vista(`Planta · plano z = ${f1(zPlanta(m))}`, ps, P => formas.map(([p, a]) => poli(P, p, a)).join('') +
    eixos.map(([p, q]) => `<line x1="${P(p)[0].toFixed(1)}" y1="${P(p)[1].toFixed(1)}" x2="${P(q)[0].toFixed(1)}" y2="${P(q)[1].toFixed(1)}" ${TRACO_PONTO}/>`).join('') +
    (mini ? '' : ima.map(q => {
      const [u, v] = P(q), r = P([q[0] + o.ima_d / 2, q[1]])[0] - u // círculo do ímã
      return `<circle cx="${u.toFixed(1)}" cy="${v.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${COR.cota}"/><text x="${u.toFixed(1)}" y="${(v + 4).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="${COR.cota}">ímã Ø ${f0(o.ima_d)}</text>`
    }).join('')) + cotasSvg(P, cot), EIXO.z, mini)
}

function corte(o: Opcoes, m: Modelo, k: 0 | 1, mini = false): string {
  const { c, M, G, T, zb, f, plate, pe, furo, modo } = m
  const cut = noCorte(m.cs, k), us = cut.map(p => p[k]), uMax = Math.max(...us), uMin = Math.min(...us)
  const formas: [P2[], string][] = []
  const GRID = `fill="url(#hg)" stroke="${COR.traco}"`, BLOCO = `fill="url(#hb)" stroke="${COR.traco}"`, FURO = `fill="${COR.fundo}" stroke="${COR.traco}"`
  for (const p of cut) { // ordem: grid, furo (vazio), bloco por cima
    const u = p[k]
    if (plate) formas.push([secao(c, k, u, plate), GRID])
    if (furo) formas.push([secao(c, k, u, furo), FURO])
    if (pe) formas.push([secao(c, k, u, pe), BLOCO])
  }
  const W = (d: number) => ext(contorno(c, d), k), W0 = W(0), xr = uMax + W0, xl = uMin - W0
  const vz = (x: number, z1: number, z2: number, dx: number, txt: string): Cota => ({ a: [x, -z1], b: [x, -z2], off: [dx, 0], txt })
  const hz = (z: number, x1: number, x2: number, dy: number, txt: string): Cota => ({ a: [x1, -z], b: [x2, -z], off: [0, dy], txt })
  const cot: Cota[] = []
  if (furo) cot.push(vz(xr, 0, T, 30, `${modo === 'degrau' ? 'altura' : 'grid'} ${f0(T)}`))
  if (modo === 'grade' && f > 0) cot.push(vz(xl, 0, f, -14, `fundo ${f0(f)}`))
  if (modo === 'bloco' && furo && pe && o.folga_fundo > 0) cot.push(vz(xl, f, zb, -14, `folga ${f0(o.folga_fundo)}`))
  if (pe) {
    const h = M.hPe, zs = M.assento, uc = uMax
    cot.push(vz(xr, zb, zb + h, 14, `pé ${f0(h)}`), vz(xr, zb + h, zb + zs, 14, `ombro ${f0(zs - h)}`))
    if (o.chanfro > 0) cot.push(vz(xl, zb, zb + o.chanfro, -14, `chanfro ${f0(o.chanfro)}`))
    if (o.conicidade > 0 && !(c.hex && k === 0)) cot.push(hz(zb + o.chanfro, uc + W(M.perfilPe[1][1]), uc + W(M.perfilPe[2][1]), 16, `conicidade ${f0(o.conicidade)}`))
  }
  if (furo && !(c.hex && k === 0)) cot.push(hz(T, uMax + W(M.nervuraMeia), xr, -16, `nervura/2 ${f0(M.nervuraMeia)}`))
  const zTopo = Math.max(T, ...(pe ?? []).map(p => p[0])), eixos = cut.map(p => [[p[k], -zTopo - 3], [p[k], 3]] as P2[])
  const ps = [...formas.flatMap(f => f[0]), ...(mini ? [] : cot.flatMap(q => [q.a, q.b])), ...eixos.flat()]
  return vista(k === 0 ? 'Frontal · plano y = 0' : 'Lateral · plano x = 0', ps, P =>
    formas.map(([p, a]) => poli(P, p, a)).join('') +
    eixos.map(([p, q]) => `<line x1="${P(p)[0].toFixed(1)}" y1="${P(p)[1].toFixed(1)}" x2="${P(q)[0].toFixed(1)}" y2="${P(q)[1].toFixed(1)}" ${TRACO_PONTO}/>`).join('') +
    (mini ? '' : cotasSvg(P, cot)), k === 0 ? EIXO.y : EIXO.x, mini)
}

/** Projeção isométrica (y para baixo na tela). */
const iso = (x: number, y: number, z: number): P2 => [(x - y) * Math.cos(Math.PI / 6), (x + y) * 0.5 - z]

/** Anéis do perfil (z, recuo) ligados por verticais, aramado: cada anel é uma polilinha fechada. */
function aramado(c: Celula, cx: number, cy: number, perfil: number[][], out: P2[][]) {
  const aneis = perfil.map(([z, d]) => contorno(c, d).map(([x, y]) => iso(cx + x, cy + y, z)))
  aneis.forEach(a => out.push([...a, a[0]]))
  for (let i = 0; i + 1 < aneis.length; i++) aneis[i].forEach((p, j) => out.push([p, aneis[i + 1][j]]))
}

/** Aramado isométrico fixo, com os três planos de corte que as outras vistas representam, tracejados nas cores do gizmo. */
function isometrica(m: Modelo): string {
  const out: P2[][] = []
  for (const [cx, cy] of m.cs) for (const perfil of [m.plate, m.furo, m.pe]) if (perfil) aramado(m.c, cx, cy, perfil, out)
  const w = (k: 0 | 1) => ext(contorno(m.c, 0), k) + 3 // o plano passa 3 mm da peça
  const x0 = Math.min(...m.cs.map(p => p[0])) - w(0), x1 = Math.max(...m.cs.map(p => p[0])) + w(0)
  const y0 = Math.min(...m.cs.map(p => p[1])) - w(1), y1 = Math.max(...m.cs.map(p => p[1])) + w(1)
  const zt = Math.max(m.T, ...(m.pe ?? []).map(p => p[0])), zp = zPlanta(m)
  const planos: [string, string, P2[]][] = [
    [EIXO.y, 'y = 0', [iso(x0, 0, 0), iso(x1, 0, 0), iso(x1, 0, zt), iso(x0, 0, zt)]],
    [EIXO.x, 'x = 0', [iso(0, y0, 0), iso(0, y1, 0), iso(0, y1, zt), iso(0, y0, zt)]],
    [EIXO.z, `z = ${f1(zp)}`, [iso(x0, y0, zp), iso(x1, y0, zp), iso(x1, y1, zp), iso(x0, y1, zp)]],
  ]
  const ps = [...out.flat(), ...planos.flatMap(p => p[2])]
  return vista('Isométrica · planos de corte', ps, P => out.map(l => `<polyline points="${l.map(p => pt(P(p))).join(' ')}" fill="none" stroke="${COR.traco}" stroke-width="1"/>`).join('') +
    planos.map(([c, t, q]) => {
      const [tx, ty] = P(q[2])
      return `<polygon points="${q.map(p => pt(P(p))).join(' ')}" fill="${c}" fill-opacity=".10" stroke="${c}" stroke-dasharray="5 3" stroke-width="1"/><text x="${(tx + 4).toFixed(1)}" y="${(ty - 4).toFixed(1)}" font-family="sans-serif" font-size="12" fill="${c}">${t}</text>`
    }).join(''), COR.traco, false, [40, 40, 28])
}

const CAIXA = `display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding:8px;background:${COR.fundo};border-radius:6px`
export type Quais = 'planta' | 'frontal' | 'lateral' | 'tudo'
/** Esquema do passo 1 (bloco sobre grid 1×1; `mostrar` filtra grid e bloco) ou do passo 2 (grid ou degrau N × M).
 *  Painel: a isométrica com os planos, a vista pedida em tamanho cheio e, em miniatura (`.thumbs`), as outras duas.
 *  `tudo` (diálogo): as quatro em duas colunas, todas com cotas. */
export function esquema(o: Opcoes, passo: number, peca: string, mostrar: string, ver: Quais): string {
  if (passo === 3) return esquemaPiso(o)
  const m = passo === 1 ? modelo(o, [[0, 0]], 'bloco', mostrar) : modelo(o, centros(celula(o), o.grid_linhas, o.grid_colunas), peca === 'degrau' ? 'degrau' : 'grade')
  const vistas = { planta: (mini: boolean) => planta(o, m, mini), frontal: (mini: boolean) => corte(o, m, 0, mini), lateral: (mini: boolean) => corte(o, m, 1, mini) }
  if (ver === 'tudo') return `<div style="${CAIXA.replace('minmax(0,1fr)', 'repeat(2,minmax(0,1fr))')}">${[isometrica(m), vistas.planta(false), vistas.frontal(false), vistas.lateral(false)].join('')}</div>`
  const outras = (['planta', 'frontal', 'lateral'] as const).filter(v => v !== ver)
  return `<div style="${CAIXA}">${isometrica(m)}${vistas[ver](false)}<div class="thumbs">${outras.map(v => vistas[v](true)).join('')}</div></div>`
}

/** Aba Blocos: planta do piso com as paredes (aberturas tracejadas, inclusive a parte fora) e uma elevação por parede
 *  (vão cheio por dentro da parede, tracejado por fora). Mesmo estilo dos outros esquemas. */
export function esquemaPiso(o: Opcoes): string {
  const r = regiao(o, o.linhas, o.colunas), ps = paredesValidas(o), S = (x: number, y: number): P2 => [x, -y]
  const TR = `fill="none" stroke="${COR.cota}" stroke-dasharray="4 3" stroke-width="1"`
  const cel = r.cs.map(([cx, cy]) => contorno(r.c, 0).map(([x, y]) => S(cx + x, cy + y)))
  const base = ps.map(p => { const q = quadro(o, p), L = p.comprimento; return { p, q, f: [q.pt(0, q.o1), q.pt(L, q.o1), q.pt(L, q.o2), q.pt(0, q.o2)].map(([x, y]) => S(x, y)) } })
  const vaos = base.flatMap(({ p, q }) => p.aberturas.map(a => [q.pt(a.pos - a.largura / 2, q.o1), q.pt(a.pos + a.largura / 2, q.o1), q.pt(a.pos + a.largura / 2, q.o2), q.pt(a.pos - a.largura / 2, q.o2)].map(([x, y]) => S(x, y))))
  const todos = [...cel.flat(), ...base.flatMap(b => b.f), ...vaos.flat()]
  const planta = vista('Planta · piso com paredes', todos, P => cel.map(c => poli(P, c, `fill="none" stroke="${COR.traco}"`)).join('') +
    base.map(b => poli(P, b.f, `fill="${COR.bloco}" fill-opacity=".35" stroke="${COR.bloco}"`)).join('') + vaos.map(v => poli(P, v, TR)).join(''), EIXO.z)
  const elev = base.map(({ p }, i) => {
    const E = (u: number, v: number): P2 => [u, -v], per = p.aberturas.map(a => perfilAbertura(a).map(([u, v]) => E(u, v)))
    const pts = [E(0, 0), E(p.comprimento, p.altura), ...per.flat()], id = `cp${i}`
    return vista(`Parede ${i + 1} · elevação (${f0(p.comprimento)} × ${f0(p.altura)} mm)`, pts, P => {
      const [x0, y0] = P(E(0, p.altura)), [x1, y1] = P(E(p.comprimento, 0))
      return `<clipPath id="${id}"><rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}"/></clipPath>` +
        `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" fill="url(#hb)" stroke="${COR.traco}"/>` +
        per.map(l => `<polygon points="${l.map(q => pt(P(q))).join(' ')}" fill="${COR.fundo}" stroke="${COR.traco}" clip-path="url(#${id})"/>`).join('') +
        p.aberturas.flatMap(a => foraDaArea(p, a)).map(l => `<polyline points="${l.map(q => pt(P(E(q[0], q[1])))).join(' ')}" ${TR}/>`).join('')
    }, COR.bloco)
  })
  return `<div style="${CAIXA}">${planta}${elev.join('')}</div>`
}
