// Paredes sem cobertura sobre o piso de Pedra (ver docs/WORKFLOW_PAREDES.md). F0: tipos travados + esqueleto; cada função
// lança "F<n>" até a fase que a implementa. Sem paredes, nada muda no piso.
import Module from 'manifold-3d'
import { fechada, final, piso, RELEVO, type Malha, type Opcoes } from './bloco'
import { perfilAbertura, quadro } from './aberturas'
import { pedra } from './pedra'

// ponytail: instância própria do WASM (sistema.ts não exporta o Manifold); piso e paredes são unidos aqui dentro
const wasm = await Module()
wasm.setup()
const { Manifold, Mesh, CrossSection } = wasm

export type Ancora =
  | { tipo: 'aresta'; celula: number; lado: number }      // lado EXTERNO de uma célula do bloco (lado = índice de regiao().seg; celula = índice em regiao().cs, informativo)
  | { tipo: 'eixo'; eixo: 'x' | 'y' | 'h0' | 'h60' | 'h120'; desloc: number } // reta paralela ao eixo, a desloc mm do centro do bloco (h* só no hexágono)
export interface Abertura {
  tipo: 'porta' | 'janela'
  forma: 'reta' | 'arco' | 'abatido' | 'ogiva'
  pos: number           // centro, mm ao longo da parede (pode cair fora → buraco no ar)
  largura: number; altura: number
  peitoril: number      // mm do pé da parede até a base do vão (porta = 0 por padrão)
  batente: { ligado: boolean; largura: number; saliencia: number }
}
export interface Parede {
  id: string; ancora: Ancora
  inicio: number        // mm ao longo da âncora, a partir do começo do lado / do centro do bloco
  comprimento: number   // mm (livre; pode passar da aresta)
  altura: number        // mm acima do topo do piso
  espessura: number     // mm
  lado: 'fora' | 'centro' | 'dentro' // de que lado da linha a espessura cresce
  aberturas: Abertura[]
}
export type OpcoesP = Opcoes // Opcoes já traz `paredes`
/** Polilinha 2D (u ao longo da parede, v para cima, mm, origem no começo e no pé da parede). */
export type Linha = [number, number][]

export const AFUNDA = .6 // mm: a base da parede entra no piso (fusão, como a laje)

export { aberturaNova, paredeNova } from './aberturas'

/** Sólido da parede com as aberturas cortadas e os batentes. Pé nominal em z = `baixo` (a parede desce até z = 0), topo em baixo + altura.
 *  Planta: retângulo [0, comprimento] × espessura (conforme `lado`); `dl` engorda a planta em todos os lados. */
function solido(o: OpcoesP, p: Parede, baixo: number, dl = 0, tex = false) {
  const { d, n, o1, o2, pt, s } = quadro(o, p, dl), e = p.espessura
  const poly = [pt(-dl, o1), pt(p.comprimento + dl, o1), pt(p.comprimento + dl, o2), pt(-dl, o2)]
  const A = poly.reduce((q, [x, y], i) => q + x * poly[(i + 1) % 4][1] - poly[(i + 1) % 4][0] * y, 0)
  let m = Manifold.extrude([A > 0 ? poly : poly.reverse()], p.altura + baixo)
  // perfil (u, v) → espaço da parede: u ao longo de d, v em z, extrusão contra a normal (determinante positivo); w0 = onde começa a extrusão
  const poe = (x: InstanceType<typeof Manifold>, w0: number) => {
    const [px, py] = pt(0, w0)
    return x.transform([d[0], d[1], 0, 0, 0, 0, 1, 0, -n[0], -n[1], 0, 0, px, py, baixo, 1])
  }
  const T = e + 2 * dl + 1 // atravessa a espessura com 0,5 mm de sobra de cada lado
  for (const ab of p.aberturas) {
    const per = perfilAbertura(ab).map(([u, v]) => [u, v] as [number, number])
    const corte = poe(Manifold.extrude([per], T), o2 + .5)
    const n0 = m; m = m.subtract(corte); n0.delete(); corte.delete()
    const bt = ab.batente
    if (bt.ligado && bt.largura > 0) { // anel do vão, recortado ao retângulo da parede, com saliência para os dois lados
      const anel = CrossSection.ofPolygons([per]).offset(bt.largura, 'Round', 2, 16).subtract(CrossSection.ofPolygons([per]))
        .intersect(CrossSection.square([p.comprimento, p.altura]))
      const sol = poe(Manifold.extrude(anel, e + 2 * bt.saliencia), o2 + bt.saliencia)
      const n1 = m; m = m.add(sol); n1.delete(); sol.delete(); anel.delete()
    }
  }
  if (!tex) return m
  // F3: Pedra (pedra.ts) nas duas faces grandes e no topo: a malha é subdividida e cada vértice dessas faces recua pelo relevo (0..teto, limitado à metade da espessura)
  const r = m.refineToLength(.5); m.delete()
  const ds = o.semente * 13.7, prof = o.profundidade * o.junta_piso, cap = Math.max(Math.min(o.teto, e / 2 - .3), 0), topo = baixo + p.altura
  const rel = (a: number, b: number, k: number) => Math.min(pedra(a, b + k, ds, o.tamanho_pedra, prof, o.desgaste, o.pedra), cap)
  const w = r.warp(v => {
    const dx = v[0] - s[0], dy = v[1] - s[1], u = dx * d[0] + dy * d[1] - p.inicio, ww = dx * n[0] + dy * n[1], z = v[2], alto = Math.abs(z - topo) < 1e-4
    if (Math.abs(ww - o1) < 1e-4) { const t = rel(u, z, 0); v[0] += n[0] * t; v[1] += n[1] * t } // face de trás: recua para +n
    else if (Math.abs(ww - o2) < 1e-4) { const t = rel(u, z, 500); v[0] -= n[0] * t; v[1] -= n[1] * t }
    if (alto) v[2] -= rel(u, ww, 1000)
  })
  r.delete()
  return w
}
const paraMalha = (m: InstanceType<typeof Manifold>): Malha => {
  const k = m.getMesh(), np = k.numProp, nv = k.vertProperties.length / np, pos = new Float32Array(nv * 3)
  for (let i = 0; i < nv; i++) for (let j = 0; j < 3; j++) pos[i * 3 + j] = k.vertProperties[i * np + j]
  return { pos, idx: new Uint32Array(k.triVerts) }
}

/** A booleana deixa triângulos de área ~0 (vértices colineares, p.ex. numa aresta vertical da parede) e o validador os recusa:
 *  empurra o vértice do meio 0,01 mm para o lado (até 6 passadas, cada uma mais forte; a mesma regra de área de `fechada`). */
function desentorta({ pos, idx }: Malha) {
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

/** Sólido ISOLADO de uma parede (F1: lisa), em x, y do bloco e com o pé em z = 0 (sem a parte afundada).
 *  `textura`: relevo da Pedra nas faces grandes e no topo (F3). Aberturas: F2. */
export function parede(o: OpcoesP, p: Parede, textura = false): Malha {
  const m = solido(o, p, 0, 0, textura), r = paraMalha(m)
  m.delete()
  return r
}

export { areaDentro, foraDaArea, perfilAbertura } from './aberturas' // F2: geometria pura do vão

/** F1. Piso final (Pedra) unido às paredes. `previa`: piso cru (sem suavizar/reduzir), como a prévia da interface.
 *  Sem paredes devolve exatamente o piso de antes (regressão D2). */
export async function pisoComParedes(o: OpcoesP, previa = false, cortes?: Float64Array): Promise<Malha> {
  const c = piso(o, cortes), base: Malha = previa ? { pos: c.pos, idx: c.idx } : await final(c)
  if (!o.paredes.length) return base
  const z0 = o.altura - RELEVO - AFUNDA - .05 // a base entra na laje (zt − 0,6) e passa 0,05 mm dela: fundo coplanar gerava triângulos de área zero
  // ponytail: cada parede cresce dl (0,02 mm × índice) em todas as direções: sem faces coplanares com o piso nem entre paredes (a booleana gerava triângulos de área zero)
  const ws = o.paredes.map((p, i) => solido(o, p, RELEVO + AFUNDA + .05, .02 * (i + 1), !previa).translate(0, 0, z0))
  const f = new Manifold(new Mesh({ numProp: 3, vertProperties: base.pos, triVerts: base.idx }))
  const u = Manifold.union([f, ...ws]), r = paraMalha(u)
  for (const x of [u, f, ...ws]) x.delete()
  desentorta(r)
  return r
}
