// Esquemas SVG do sistema e do grid: planta, frontal, lateral e isométrica, com cotas.
// Os números vêm só de medidas() e das funções de sistema.ts; aqui é projeção e desenho.
import type { Opcoes } from './bloco'
import { alturaGrid, celula, centros, contorno, medidas, type Celula, type Medidas } from './sistema'

type P2 = [number, number]
type Modo = 'bloco' | 'grade' | 'degrau' // bloco = sistema (bloco sobre grid 1×1); grade; degrau = bloco com furos no topo
interface Modelo { M: Medidas; c: Celula; cs: P2[]; modo: Modo; G: number; T: number; zb: number; f: number; plate: number[][] | null; pe: number[][] | null; furo: number[][] }
interface Cota { a: P2; b: P2; off: P2; txt: string } // pontas em coordenadas de tela (mm, y para baixo) e deslocamento da linha (unidades)

const COR = { traco: '#cfd3da', cota: '#ffb000', fundo: '#1b1d21', peca: '#2c3038' }
const PAD = 84 // unidades do viewBox: espaço para as cotas e o título
const f1 = (v: number) => v.toFixed(1).replace('.', ',') + ' mm'
const pt = (p: P2) => p[0].toFixed(1) + ',' + p[1].toFixed(1)
const poli = (P: (p: P2) => P2, ps: P2[], attr: string) => `<polygon points="${ps.map(p => pt(P(p))).join(' ')}" ${attr}/>`

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

function modelo(o: Opcoes, cs: P2[], modo: Modo): Modelo {
  const M = medidas(o), G = alturaGrid(o), zf = M.fundoReal + o.folga_fundo
  const T = modo === 'degrau' ? Math.max(o.altura_degrau, G + M.assento + 1) : G // topo do grid (ou do degrau)
  const zb = modo === 'degrau' ? 0 : zf // base do pé: o bloco assenta em zf sobre o grid
  const pf = M.perfilFuro.map(([z, d]) => [z + (T - G), d])
  return {
    M, c: celula(o), cs, modo, G, T, zb, f: M.fundoReal,
    plate: modo === 'degrau' ? null : [[0, 0], [G, 0]],
    pe: modo === 'grade' ? null : [...M.perfilPe.map(([z, d]) => [z + zb, d]), [modo === 'degrau' ? T : G + 6, 0]],
    furo: recorte(pf, Math.max(pf[0][0], 0), T),
  }
}

/** Contorno de um corte: lado direito [u + meia-extensão, z] de baixo para cima e o esquerdo espelhado (tela: z para baixo). */
function secao(c: Celula, k: 0 | 1, u: number, perfil: number[][]): P2[] {
  const w = (d: number) => ext(contorno(c, d), k)
  return [...perfil.map(([z, d]): P2 => [u + w(d), -z]), ...[...perfil].reverse().map(([z, d]): P2 => [u - w(d), -z])]
}

/** Cota: linha com setas, deslocada por `off` (unidades) das pontas; texto acompanha a inclinação. */
function cota(P: (p: P2) => P2, q: Cota) {
  const A = P(q.a), B = P(q.b), Ao: P2 = [A[0] + q.off[0], A[1] + q.off[1]], Bo: P2 = [B[0] + q.off[0], B[1] + q.off[1]]
  const dx = Bo[0] - Ao[0], dy = Bo[1] - Ao[1], L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L, nx = -uy * 2.5, ny = ux * 2.5 // meia-largura da seta
  const seta = (p: P2, s: number) => `<polygon points="${pt(p)} ${pt([p[0] + s * ux * 7 + nx, p[1] + s * uy * 7 + ny])} ${pt([p[0] + s * ux * 7 - nx, p[1] + s * uy * 7 - ny])}"/>`
  let rot = Math.atan2(uy, ux) * 180 / Math.PI
  if (rot >= 90) rot -= 180
  if (rot < -90) rot += 180
  const mx = (Ao[0] + Bo[0]) / 2, my = (Ao[1] + Bo[1]) / 2
  return `<g stroke="${COR.cota}" fill="${COR.cota}" stroke-width="0.8"><line x1="${A[0]}" y1="${A[1]}" x2="${Ao[0]}" y2="${Ao[1]}"/><line x1="${B[0]}" y1="${B[1]}" x2="${Bo[0]}" y2="${Bo[1]}"/><line x1="${Ao[0]}" y1="${Ao[1]}" x2="${Bo[0]}" y2="${Bo[1]}"/>${seta(Ao, 1)}${seta(Bo, -1)}</g><text transform="rotate(${rot.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})" x="${mx.toFixed(1)}" y="${(my - 4).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${COR.cota}">${q.txt}</text>`
}

/** Moldura de uma vista: enquadra os pontos (tela, mm) no viewBox e desenha o título. */
function vista(titulo: string, ps: P2[], corpo: (P: (p: P2) => P2) => string): string {
  const xs = ps.map(p => p[0]), ys = ps.map(p => p[1])
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
  const k = 170 / Math.max(w, h, 1e-6)
  const P = (p: P2): P2 => [PAD + (p[0] - x0) * k, PAD + (p[1] - y0) * k]
  return `<svg viewBox="0 0 ${(w * k + 2 * PAD).toFixed(0)} ${(h * k + 2 * PAD).toFixed(0)}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto"><rect width="100%" height="100%" fill="${COR.fundo}"/><text x="10" y="18" font-family="sans-serif" font-size="11" fill="${COR.traco}">${titulo}</text>${corpo(P)}</svg>`
}

function planta(o: Opcoes, m: Modelo): string {
  const { c, cs, M } = m, a0 = c.a[0], a1 = c.a[1]
  const S = (x: number, y: number): P2 => [x, -y] // planta: y para cima na peça, para baixo na tela
  const contA = (cx: number, cy: number, d: number) => contorno(c, d).map(([x, y]): P2 => S(cx + x, cy + y))
  const formas: [P2[], string][] = [], ima: P2[] = []
  for (const [cx, cy] of cs) {
    formas.push([contA(cx, cy, 0), `fill="none" stroke="${COR.traco}"`])
    formas.push([contA(cx, cy, o.recuo), `fill="none" stroke="${COR.traco}" stroke-dasharray="3 2"`]) // furo do grid
    if (m.pe) formas.push([contA(cx, cy, M.perfilPe[2][1]), `fill="none" stroke="${COR.traco}"`]) // pé: recuo + folga
    if (o.ima_d > 0) ima.push(S(cx, cy))
  }
  const [rx, ry] = cs.reduce((p, q) => Math.hypot(q[0], q[1]) < Math.hypot(p[0], p[1]) ? q : p) // célula mais perto da origem
  const W = (d: number) => ext(contorno(c, d), 0)
  const cot: Cota[] = c.hex
    ? [{ a: S(rx, ry - a1), b: S(rx, ry + a1), off: [-24, 0], txt: `entre lados ${f1(o.largura)}` }]
    : [{ a: S(rx - a0, ry - a1), b: S(rx + a0, ry - a1), off: [0, 24], txt: `largura ${f1(o.largura)}` },
       { a: S(rx + a0, ry - a1), b: S(rx + a0, ry + a1), off: [24, 0], txt: `comprimento ${f1(o.comprimento)}` }]
  cot.push({ a: S(rx + W(0), ry), b: S(rx + W(o.recuo), ry), off: [0, -14], txt: `recuo ${f1(o.recuo)}` })
  const ps = [...formas.flatMap(f => f[0]), ...cot.flatMap(q => [q.a, q.b]), ...ima]
  return vista('Planta', ps, P => formas.map(([p, a]) => poli(P, p, a)).join('') + ima.map(q => {
    const [u, v] = P(q), r = P([q[0] + o.ima_d / 2, q[1]])[0] - u // círculo do ímã
    return `<circle cx="${u.toFixed(1)}" cy="${v.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${COR.cota}"/><text x="${u.toFixed(1)}" y="${(v + 4).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${COR.cota}">ímã Ø ${f1(o.ima_d)}</text>`
  }).join('') + cot.map(q => cota(P, q)).join(''))
}

function corte(o: Opcoes, m: Modelo, k: 0 | 1): string {
  const { c, M, G, T, zb, f, plate, pe, furo, modo } = m
  const cut = noCorte(m.cs, k), us = cut.map(p => p[k]), uMax = Math.max(...us), uMin = Math.min(...us)
  const formas: [P2[], string][] = []
  const PECA = `fill="${COR.peca}" stroke="${COR.traco}"`, FURO = `fill="${COR.fundo}" stroke="${COR.traco}"`
  for (const p of cut) { // ordem: grid, furo (vazio), bloco por cima
    const u = p[k]
    if (plate) formas.push([secao(c, k, u, plate), PECA])
    formas.push([secao(c, k, u, furo), FURO])
    if (pe) formas.push([secao(c, k, u, pe), PECA])
  }
  const W = (d: number) => ext(contorno(c, d), k), W0 = W(0), xr = uMax + W0, xl = uMin - W0
  const vz = (x: number, z1: number, z2: number, dx: number, txt: string): Cota => ({ a: [x, -z1], b: [x, -z2], off: [dx, 0], txt })
  const hz = (z: number, x1: number, x2: number, dy: number, txt: string): Cota => ({ a: [x1, -z], b: [x2, -z], off: [0, dy], txt })
  const cot: Cota[] = [vz(xr, 0, T, 44, `${modo === 'degrau' ? 'altura' : 'grid'} ${f1(T)}`)]
  if (modo === 'grade' && f > 0) cot.push(vz(xl, 0, f, -24, `fundo ${f1(f)}`))
  if (modo === 'bloco' && o.folga_fundo > 0) cot.push(vz(xl, f, zb, -24, `folga ${f1(o.folga_fundo)}`))
  if (modo !== 'grade') {
    const h = M.hPe, zs = M.assento, uc = uMax
    cot.push(vz(xr, zb, zb + h, 24, `pé ${f1(h)}`), vz(xr, zb + h, zb + zs, 24, `ombro ${f1(zs - h)}`))
    if (o.chanfro > 0) cot.push(vz(xl, zb, zb + o.chanfro, -44, `chanfro ${f1(o.chanfro)}`))
    if (o.conicidade > 0) cot.push(hz(zb + o.chanfro, uc + W(M.perfilPe[1][1]), uc + W(M.perfilPe[2][1]), 14, `conicidade ${f1(o.conicidade)}`))
  }
  cot.push(hz(T, uMax + W(M.nervuraMeia), xr, -14, `nervura/2 ${f1(M.nervuraMeia)}`))
  const ps = [...formas.flatMap(f => f[0]), ...cot.flatMap(q => [q.a, q.b])]
  return vista(k === 0 ? 'Frontal · corte y = 0' : 'Lateral · corte x = 0', ps, P =>
    formas.map(([p, a]) => poli(P, p, a)).join('') + cot.map(q => cota(P, q)).join(''))
}

/** Projeção isométrica (y para baixo na tela). */
const iso = (x: number, y: number, z: number): P2 => [(x - y) * Math.cos(Math.PI / 6), (x + y) * 0.5 - z]

/** Anéis do perfil (z, recuo) ligados por verticais, aramado: cada anel é uma polilinha fechada. */
function aramado(c: Celula, cx: number, cy: number, perfil: number[][], out: P2[][]) {
  const aneis = perfil.map(([z, d]) => contorno(c, d).map(([x, y]) => iso(cx + x, cy + y, z)))
  aneis.forEach(a => out.push([...a, a[0]]))
  for (let i = 0; i + 1 < aneis.length; i++) aneis[i].forEach((p, j) => out.push([p, aneis[i + 1][j]]))
}

function isometrica(m: Modelo): string {
  const out: P2[][] = []
  for (const [cx, cy] of m.cs) for (const perfil of [m.plate, m.furo, m.pe]) if (perfil) aramado(m.c, cx, cy, perfil, out)
  return vista('Isométrica', out.flat(), P => out.map(l => `<polyline points="${l.map(p => pt(P(p))).join(' ')}" fill="none" stroke="${COR.traco}"/>`).join(''))
}

const grade = (vistas: string[]) => `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px;background:${COR.fundo};border-radius:6px">${vistas.join('')}</div>`

/** Esquema do sistema: bloco (pé + ombro + corpo) sobre um grid 1×1. */
export function esquemaSistema(o: Opcoes): string {
  const m = modelo(o, [[0, 0]], 'bloco')
  return grade([planta(o, m), corte(o, m, 0), corte(o, m, 1), isometrica(m)])
}

/** Esquema do grid linhas × colunas; com `peca = 'degrau'`, o degrau de altura_degrau (blocos com furos no topo). */
export function esquemaGrid(o: Opcoes, peca: string = 'grid'): string {
  const m = modelo(o, centros(celula(o), o.grid_linhas, o.grid_colunas), peca === 'degrau' ? 'degrau' : 'grade')
  return grade([planta(o, m), corte(o, m, 0), corte(o, m, 1), isometrica(m)])
}
