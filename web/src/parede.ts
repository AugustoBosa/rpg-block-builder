// Paredes sem cobertura sobre o piso de Pedra (ver docs/WORKFLOW_PAREDES.md). F0: tipos travados + esqueleto; cada função
// lança "F<n>" até a fase que a implementa. Sem paredes, nada muda no piso.
import { CrossSection, desentorta, Manifold, Mesh, paraMalha } from './wasm'
import { fechada, final, inclinado, piso, RELEVO, type Malha, type Opcoes } from './bloco'
import { perfilAbertura, pilares, quadro } from './aberturas'
import { profTex, texParede } from './textura'
import { geoTelhado, solidoTelhado, temTelhado } from './telhado'


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
function solido(o: OpcoesP, p: Parede, baixo: number, dl = 0, tex = false, viz?: Parede[]) { // viz (só no pilar): as paredes, para a textura da face coplanar com a delas casar na emenda
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
  const ds = o.semente * 13.7, prof = o.profundidade * o.junta_piso, capDe = (q: Parede) => Math.max(Math.min(o.teto, q.espessura / 2 - .3), 0), cap = capDe(p), topo = baixo + p.altura
  const tp = texParede(o), rel = (a: number, b: number, k: number, c = cap) => Math.min(profTex(o, a, b + k, ds, prof, tp), c)
  const face = (u: number, z: number, k: number, c = cap) => tp === 'tabuas' ? rel(z, u, k, c) : rel(u, z, k, c) // Tábuas em pé na parede (gerar.py: uw, vw = pz, gx)
  // faces das paredes (normal externa g·n, plano em oo, semente k): o pilar usa a textura delas onde a face for coplanar
  const vz = (viz ?? []).flatMap(q => { const Q = quadro(o, q), c = capDe(q); return [[Q.o1, -1, 0], [Q.o2, 1, 500]].map(([oo, g, k]) => ({ ...Q, q, oo, g, k, c })) })
  const w = r.warp(v => {
    const x = v[0], y = v[1], dx = x - s[0], dy = y - s[1], u = dx * d[0] + dy * d[1] - p.inicio, ww = dx * n[0] + dy * n[1], z = v[2], alto = Math.abs(z - topo) < 1e-4
    const recua = (sx: number, sy: number, t: number) => { // face de normal externa (sx, sy) recua t para dentro
      for (const a of vz) {
        const uq = (x - a.s[0]) * a.d[0] + (y - a.s[1]) * a.d[1] - a.q.inicio
        if (Math.abs(a.g * (a.n[0] * sx + a.n[1] * sy) - 1) < 1e-6 && Math.abs((x - a.s[0]) * a.n[0] + (y - a.s[1]) * a.n[1] - a.oo) < 1e-4 && uq > -p.comprimento && uq < a.q.comprimento + p.comprimento) { t = face(uq, z, a.k, a.c); break }
      }
      v[0] -= sx * t; v[1] -= sy * t
    }
    if (Math.abs(ww - o1) < 1e-4) recua(-n[0], -n[1], face(u, z, 0)) // face de trás: recua para +n
    else if (Math.abs(ww - o2) < 1e-4) recua(n[0], n[1], face(u, z, 500))
    if (alto) v[2] -= rel(u, ww, 1000)
    if (viz) { // pilar: textura também nas duas pontas (recua para dentro ao longo de d)
      if (Math.abs(u + dl) < 1e-4) recua(-d[0], -d[1], rel(ww, z, 1500))
      else if (Math.abs(u - p.comprimento - dl) < 1e-4) recua(d[0], d[1], rel(ww, z, 2000))
    }
  })
  r.delete()
  const q = w.simplify(.01); w.delete() // exportação: funde as faces planas do refinamento (erro 0,01 mm; mantém a malha fechada)
  return q
}

/** Sólido ISOLADO de uma parede (F1: lisa), em x, y do bloco e com o pé em z = 0 (sem a parte afundada).
 *  `textura`: relevo da Pedra nas faces grandes e no topo (F3). Aberturas: F2. */
export function parede(o: OpcoesP, p: Parede, textura = false, viz?: Parede[]): Malha {
  const m = solido(o, p, 0, 0, textura, viz), r = paraMalha(m)
  m.delete()
  return r
}

export { areaDentro, foraDaArea, perfilAbertura } from './aberturas' // F2: geometria pura do vão

/** F1. Piso final (Pedra) unido às paredes. `previa`: piso cru (sem suavizar/reduzir), como a prévia da interface.
 *  Sem paredes devolve exatamente o piso de antes (regressão D2). */
export const avisosPiso: string[] = []
const MIN_FRAG = 5 // mm³: componentes menores que isto (e que não são a maior) são fragmentos do relevo e saem na exportação
export async function pisoComParedes(o: OpcoesP, previa = false, cortes?: Float64Array): Promise<Malha> {
  const c = piso(o, cortes), base: Malha = previa ? { pos: c.pos, idx: c.idx } : await final(c)
  const fundido = temTelhado(o) && o.telhado_modo === 'fundido' && o.paredes.length > 0 // fundido sem paredes ficaria solto no ar
  if (!o.paredes.length || inclinado(o)) return base // rampa ou escada: paredes ignoradas
  const z0 = o.altura - RELEVO - AFUNDA - .05 // a base entra na laje (zt − 0,6) e passa 0,05 mm dela: fundo coplanar gerava triângulos de área zero
  // paredes exatas (sem engordar): faces coplanares entre paredes e com o piso se fundem na união (sem degrau de 0,02 mm); `desentorta` limpa triângulos de área ~0
  const ps = o.pilar ? [...o.paredes, ...pilares(o, o.paredes)] : o.paredes
  const ws = ps.map(p => solido(o, p, RELEVO + AFUNDA + .05, 0, !previa, p.id.startsWith('pilar') ? o.paredes : undefined).translate(0, 0, z0))
  if (fundido) { // afunda além do maior relevo do topo das paredes (sem junta aberta sob o beiral); prévia lisa: 0,3 mm
    const s = solidoTelhado(o, !previa), af = previa ? .3 : Math.max(...ps.map(p => Math.max(Math.min(o.teto, p.espessura / 2 - .3), 0))) + .05
    ws.push(s.translate(0, 0, geoTelhado(o).zb - af)); s.delete()
  }
  const f = new Manifold(new Mesh({ numProp: 3, vertProperties: base.pos, triVerts: base.idx }))
  let u = Manifold.union([f, ...ws])
  avisosPiso.length = 0
  if (!previa) { // exportação: descarta fragmentos flutuantes minúsculos (ilhas do relevo na borda); paredes e telhado ficam
    const ps2 = u.decompose(), vs = ps2.map(q => q.volume()), mx = Math.max(...vs), ok = ps2.filter((_, i) => vs[i] >= MIN_FRAG || vs[i] === mx)
    if (ok.length < ps2.length) { u.delete(); u = Manifold.compose(ok); avisosPiso.push(`${ps2.length - ok.length} fragmento(s) minúsculo(s) descartado(s).`) }
    for (const q of ps2) q.delete()
  }
  const r = paraMalha(u)
  for (const x of [u, f, ...ws]) x.delete()
  desentorta(r)
  return r
}
