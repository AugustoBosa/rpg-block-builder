// Passo 1 — o sistema: formato da célula e encaixe. O pé do bloco e o furo do grid saem do mesmo perfil.
// Encaixe próprio (não é o das originais): pé com chanfro embaixo, parede reta ou cônica, ombro até a nervura do grid.
import Module from 'manifold-3d'
import type { Vec3 } from 'manifold-3d/manifold'

const wasm = await Module()
wasm.setup()
const { Manifold } = wasm
type Solido = InstanceType<typeof Manifold>
export interface Malha { pos: Float32Array; idx: Uint32Array }

export const FORMATOS = { quadrado: 'Quadrado', retangulo: 'Retângulo', hexagono: 'Hexágono' } as const
export const SISTEMA = { // nome: [padrão, mín, máx, rótulo]
  largura: [35, 15, 100, 'Largura (mm)'], comprimento: [35, 15, 100, 'Comprimento (mm)'],
  altura_pe: [6, 2, 20, 'Pé: altura (mm)'], recuo: [4, 1.5, 10, 'Pé: recuo da borda (mm)'], chanfro: [.8, 0, 2, 'Pé: chanfro embaixo (mm)'],
  conicidade: [0, 0, 3, 'Pé: conicidade (mm)'], ombro: [2.5, 0, 10, 'Ombro: altura (mm)'], nervura: [3, .8, 8, 'Nervura do grid (mm)'],
  folga: [.15, -.3, .6, 'Folga lateral (mm)'], folga_fundo: [.3, 0, 2, 'Folga embaixo do pé (mm)'],
  ima_d: [0, 0, 12, 'Ímã: diâmetro (mm, 0 = sem)'], ima_h: [2, .5, 5, 'Ímã: altura (mm)'], folga_ima: [.15, 0, .5, 'Ímã: folga (mm)'],
  fundo: [0, 0, 5, 'Grid: fundo (mm, 0 = vazado)'],
} as const
export const ENCAIXES = { // presets: só ajustam os números, todos continuam editáveis
  reto: ['Pé reto + chanfro', { conicidade: 0, ima_d: 0 }],
  conico: ['Pé cônico', { conicidade: 1.5, ima_d: 0 }],
  ima: ['Pé reto + ímã', { conicidade: 0, ima_d: 6, ima_h: 2 }],
} as const
export type Sistema = { -readonly [k in keyof typeof SISTEMA]: number } & { formato: keyof typeof FORMATOS }

/** Célula convexa: normais e apótemas dos lados (sentido anti-horário), passo da grade e área. */
export interface Celula { n: [number, number][]; a: number[]; passo: [number, number]; area: number; hex: boolean }
export function celula(s: Sistema): Celula {
  if (s.formato === 'hexagono') { // lados planos em cima e embaixo; largura = distância entre lados
    const F = s.largura, l = F / Math.sqrt(3)
    const n = [0, 1, 2, 3, 4, 5].map(i => [Math.cos((30 + 60 * i) * Math.PI / 180), Math.sin((30 + 60 * i) * Math.PI / 180)] as [number, number])
    return { n, a: n.map(() => F / 2), passo: [1.5 * l, F], area: 1.5 * Math.sqrt(3) * l * l, hex: true }
  }
  const L = s.largura, C = s.formato === 'quadrado' ? L : s.comprimento
  return { n: [[1, 0], [0, 1], [-1, 0], [0, -1]], a: [L / 2, C / 2, L / 2, C / 2], passo: [L, C], area: L * C, hex: false }
}

/** Distância até a borda (positiva dentro). */
export function distBorda(c: Celula, x: number, y: number) {
  let d = 1e9
  for (let i = 0; i < c.a.length; i++) d = Math.min(d, c.a[i] - c.n[i][0] * x - c.n[i][1] * y)
  return d
}

/** Vértices da célula encolhida `d` mm (anti-horário). */
export function contorno(c: Celula, d: number): [number, number][] {
  d = Math.min(d, Math.min(...c.a) - .5) // nunca inverte o polígono
  return c.n.map((n1, i) => {
    const j = (i + 1) % c.n.length, n2 = c.n[j], a1 = c.a[i] - d, a2 = c.a[j] - d, det = n1[0] * n2[1] - n1[1] * n2[0]
    return [(a1 * n2[1] - a2 * n1[1]) / det, (n1[0] * a2 - n2[0] * a1) / det]
  })
}

/** Centros das células de uma peça linhas × colunas (hexágono: colunas desencontradas), centrados na origem. */
export function centros(c: Celula, linhas: number, colunas: number): [number, number][] {
  const P: [number, number][] = []
  for (let r = 0; r < linhas; r++) for (let k = 0; k < colunas; k++)
    P.push([k * c.passo[0], r * c.passo[1] + (c.hex && k % 2 ? c.passo[1] / 2 : 0)])
  const cx = (Math.min(...P.map(p => p[0])) + Math.max(...P.map(p => p[0]))) / 2
  const cy = (Math.min(...P.map(p => p[1])) + Math.max(...P.map(p => p[1]))) / 2
  return P.map(([x, y]) => [x - cx, y - cy])
}

// alturas do encaixe (z = 0 no fundo do pé)
const hPe = (s: Sistema) => Math.max(s.altura_pe, s.chanfro + .1)
const nervura = (s: Sistema) => Math.min(s.nervura / 2, s.recuo) // meia nervura: onde o ombro termina
export const assento = (s: Sistema) => hPe(s) + s.ombro // o bloco apoia na nervura do grid nesta altura
export const fundo = (s: Sistema) => s.ima_d > 0 ? Math.max(s.fundo, s.ima_h + .8) : s.fundo // ímã pede fundo fechado
export const alturaGrid = (s: Sistema) => fundo(s) + s.folga_fundo + assento(s)

/** Avisos de medidas que não fecham (a geometria é limitada, mas o usuário precisa saber). */
export function avisos(s: Sistema): string[] {
  const c = celula(s), amin = Math.min(...c.a), av: string[] = []
  const pe = s.recuo + s.conicidade + s.chanfro + s.folga
  if (pe > amin - 1) av.push(`O pé some: recuo + conicidade + chanfro + folga (${pe.toFixed(1)} mm) passa da metade da célula.`)
  if (s.nervura / 2 > s.recuo) av.push('A nervura é mais larga que 2 × recuo: o ombro foi limitado ao recuo.')
  if (s.ima_d > 0 && s.ima_d / 2 + s.folga_ima > amin - pe - .8) av.push('O ímã não cabe no fundo do pé.')
  return av
}

// ponytail: os sólidos intermediários vão para `lixo` e são liberados em malha(); sem isso a memória do WASM cresce a cada prévia
const lixo: Solido[] = []
const g = (m: Solido) => (lixo.push(m), m)
const anel = (c: Celula, d: number, z: number) => contorno(c, d).map(([x, y]) => [x, y, z] as Vec3)
/** Sólido de revolução poligonal: perfil [z, recuo] de baixo para cima; cada trecho é a casca convexa de dois anéis. */
function pilha(c: Celula, perfil: number[][]) {
  const partes: Solido[] = []
  for (let i = 0; i + 1 < perfil.length; i++) {
    const [z0, d0] = perfil[i], [z1, d1] = perfil[i + 1]
    if (z1 - z0 > 1e-6) partes.push(g(Manifold.hull([...anel(c, d0, z0), ...anel(c, d1, z1)])))
  }
  return g(Manifold.union(partes))
}
const ima = (s: Sistema, z: number) => { // cilindro do ímã com o fundo em z; passa 0,5 mm para os dois lados do corte
  const h = s.ima_h + .2
  return g(Manifold.cylinder(h + 1, s.ima_d / 2 + s.folga_ima, s.ima_d / 2 + s.folga_ima, 48).translate(0, 0, z - .5))
}

/** Bloco de 1 célula até `topo`: pé (com folga e ímã) + corpo cheio. */
export function corpo(s: Sistema, topo: number) {
  const c = celula(s), r = s.recuo + s.folga, zs = assento(s)
  let m = pilha(c, [[0, r + s.conicidade + s.chanfro], [s.chanfro, r + s.conicidade], [hPe(s), r], [zs, nervura(s) + s.folga], [zs, 0], [Math.max(topo, zs + .5), 0]])
  if (s.ima_d > 0) m = g(m.subtract(ima(s, 0)))
  return m
}

/** Furo de 1 célula com o topo do grid em zTopo (o mesmo perfil do pé, sem folga e sem o chanfro de baixo). */
function furo(s: Sistema, c: Celula, zTopo: number) {
  const base = zTopo - alturaGrid(s), f = fundo(s), zf = base + f + s.folga_fundo, h = hPe(s), r = s.recuo
  const zb = f > 0 ? base + f : base - 1
  const db = r + s.conicidade + s.conicidade * (zf + s.chanfro - zb) / Math.max(h - s.chanfro, .1) // parede do pé prolongada até zb
  let m = pilha(c, [[zb, db], [zf + h, r], [zTopo, nervura(s)], [zTopo + 1, nervura(s)]])
  if (s.ima_d > 0) m = g(m.add(ima(s, base + f - s.ima_h - .2)))
  return m
}

/** Grid linhas × colunas: placa cheia menos um furo por célula. */
export function grid(s: Sistema, linhas: number, colunas: number) {
  const c = celula(s), G = alturaGrid(s), cs = centros(c, linhas, colunas)
  const placa = g(Manifold.union(cs.map(([x, y]) => g(pilha(c, [[0, 0], [G, 0]]).translate(x, y, 0)))))
  return g(placa.subtract(g(Manifold.union(cs.map(([x, y]) => g(furo(s, c, G).translate(x, y, 0)))))))
}

/** Degrau linhas × colunas: blocos com pé embaixo e furos de grid em cima, para empilhar níveis. */
export function degrau(s: Sistema, linhas: number, colunas: number, altura: number) {
  const c = celula(s), H = Math.max(altura, alturaGrid(s) + assento(s) + 1), cs = centros(c, linhas, colunas)
  const blocos = g(Manifold.union(cs.map(([x, y]) => g(corpo(s, H).translate(x, y, 0)))))
  return g(blocos.subtract(g(Manifold.union(cs.map(([x, y]) => g(furo(s, c, H).translate(x, y, 0)))))))
}

/** Malha do sólido (libera os sólidos da construção). */
export function malha(m: Solido): Malha {
  const k = m.getMesh(), np = k.numProp, nv = k.vertProperties.length / np
  const pos = new Float32Array(nv * 3)
  for (let i = 0; i < nv; i++) for (let j = 0; j < 3; j++) pos[i * 3 + j] = k.vertProperties[i * np + j]
  for (const x of lixo.splice(0)) x.delete()
  return { pos, idx: new Uint32Array(k.triVerts) }
}
