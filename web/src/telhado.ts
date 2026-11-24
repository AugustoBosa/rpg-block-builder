// Telhado sobre as paredes (docs/superpowers/specs/2026-11-20-telhado-design.md): sólido maciço por CSG, base em z = 0;
// cada água é um plano z ≤ c + a·x + b·y aparando uma caixa. Removível (STL próprio, com saia) ou fundido ao bloco (parede.ts).
import type { Malha, Opcoes } from './bloco'
import { paredesValidas, pilares, quadro } from './aberturas'
import { regiao } from './sistema'
import { profTex } from './textura'
import { desentorta, Manifold, paraMalha } from './wasm'

type Solido = InstanceType<typeof Manifold>
/** Telhado vale só no bloco quadrado e sem rampa. */
export const temTelhado = (o: Opcoes) => o.telhado_forma !== 'nenhum' && o.formato === 'quadrado' && !(o.inclinacao > 0)

/** Retângulo do bloco (sem beiral), retângulo do telhado (com beiral), base zb e os planos das águas (altura local do topo = min dos planos). */
export function geoTelhado(o: Opcoes) {
  const r = regiao(o, o.linhas, o.colunas), xs = r.seg.flatMap(g => [g[0], g[2]]), ys = r.seg.flatMap(g => [g[1], g[3]])
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys), bl = o.telhado_beiral
  const x0 = bx0 - bl, x1 = bx1 + bl, y0 = by0 - bl, y1 = by1 + bl, xc = (x0 + x1) / 2, yc = (y0 + y1) / 2
  const ps = paredesValidas(o), pil = o.telhado_modo === 'removivel' && o.pilar && pilares(o, ps).length ? o.pilar_sobe : 0 // removível apoia nos pilares que passam do topo; no fundido a união absorve os pilares
  const zb = o.altura + (ps.length ? Math.max(...ps.map(p => p.altura)) + pil : 30)
  const tg = Math.tan(o.telhado_angulo * Math.PI / 180), b = o.telhado_borda, f = o.telhado_forma
  const P: [number, number, number][] = [] // [a, b, c]: z ≤ c + a·x + b·y
  const duasX = () => P.push([0, -tg, b + tg * (y1 - y0) / 2 + tg * yc], [0, tg, b + tg * (y1 - y0) / 2 - tg * yc]) // cumeeira ao longo de x
  const duasY = () => P.push([-tg, 0, b + tg * (x1 - x0) / 2 + tg * xc], [tg, 0, b + tg * (x1 - x0) / 2 - tg * xc])
  if (f === 'uma') P.push(o.telhado_eixo === 'x' ? [tg, 0, b - tg * x0] : [0, tg, b - tg * y0])
  else if (f === 'duas') (o.telhado_eixo === 'x' ? duasX : duasY)()
  else if (f === 'quatro') { duasX(); duasY() }
  const topo = (x: number, y: number) => P.length ? Math.min(...P.map(([a, bb, c]) => c + a * x + bb * y)) : 3
  return { bx0, bx1, by0, by1, x0, x1, y0, y1, zb, tg, b, P, topo, ps }
}

const caixa = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const c = Manifold.cube([x1 - x0, y1 - y0, z1 - z0]), t = c.translate([x0, y0, z0])
  c.delete(); return t
}

// Operações que liberam os operandos (a prévia chama isto a cada ajuste: sem vazar WASM).
const sub = (a: Solido, b: Solido) => { const n = a.subtract(b); a.delete(); b.delete(); return n }
const fund = (a: Solido) => { const n = a.simplify(.01); a.delete(); return n }
const uni = (a: Solido, b: Solido) => { const n = a.add(b); a.delete(); b.delete(); return n }

/** Sólido do telhado com base em z = 0. `tex`: textura nas águas (ou no topo da laje do plano). `saia`: anel por dentro das paredes. */
export function solidoTelhado(o: Opcoes, tex = false, saia = false): Solido {
  const g = geoTelhado(o), { x0, x1, y0, y1, P } = g
  const sa = saia && g.ps.length > 0 && o.saia_altura > 0 // saia recuada: espessura + 2 × saliência (pilar entra até aí) + folga
  const es = sa ? Math.max(...g.ps.map(p => p.espessura)) + (o.pilar && pilares(o, g.ps).length ? 2 * o.pilar_saliencia : 0) + o.saia_folga : 0
  let m: Solido, oco = false
  if (o.telhado_forma === 'plano') {
    const me = o.mureta_espessura, mh = o.mureta_altura
    m = caixa(x0, x1, y0, y1, 0, 3)
    if (mh > 0) {
      let anel = sub(caixa(x0, x1, y0, y1, 2.9, 3 + mh), caixa(x0 + me, x1 - me, y0 + me, y1 - me, 2, 4 + mh))
      if (o.ameias) for (const [a0, a1, ao] of [[x0 + me + 2, x1 - me - 2, 'x'], [y0 + me + 2, y1 - me - 2, 'y']] as const)
        for (let s = a0 + ((a1 - a0 - 4) % 8) / 2; s + 4 <= a1; s += 8)
          anel = sub(anel, ao === 'x' ? caixa(s, s + 4, y0 - 1, y1 + 1, 3 + mh / 2, 4 + mh) : caixa(x0 - 1, x1 + 1, s, s + 4, 3 + mh / 2, 4 + mh))
      m = uni(m, anel)
    }
  } else {
    m = caixa(x0, x1, y0, y1, 0, g.b + g.tg * Math.max(x1 - x0, y1 - y0) + 1)
    const apara = (s: Solido, dc: number) => { // fica z ≤ c − dc·k + a·x + b·y; dc = casca: espessura normal a cada água
      for (const [a, bb, c] of P) { const k = Math.hypot(a, bb, 1), n = s.trimByPlane([a / k, bb / k, -1 / k], -(c - dc * k) / k); s.delete(); s = n }
      return s
    }
    m = apara(m, 0)
    // casca: miolo aberto por baixo. Com saia, o anel de apoio (parede + saia) fica maciço: miolo recuado até a face interna da saia
    const e = o.telhado_casca > 0 ? Math.max(o.telhado_casca, 1.2) : 0 // 0 = maciço; abaixo de 1,2 mm sobe para 1,2
    const ap = g.ps.length ? (sa ? es + 1.2 : Math.max(...g.ps.map(p => p.espessura)) + (o.pilar && pilares(o, g.ps).length ? 2 * o.pilar_saliencia : 0)) : 0 // sem saia, o miolo também não passa sobre o topo das paredes
    const ex = g.ps.length ? Math.max(x0 + e, g.bx0 + ap) : x0 + e, ey = g.ps.length ? Math.max(y0 + e, g.by0 + ap) : y0 + e
    if (e > 0 && x0 + x1 - 2 * ex > 2 && y0 + y1 - 2 * ey > 2) { // miolo degenerado (bloco pequeno ou casca grossa): fica maciço
      const mi = apara(caixa(ex, x0 + x1 - ex, ey, y0 + y1 - ey, -1, g.b + g.tg * Math.max(x1 - x0, y1 - y0) + 1), e)
      if (mi.isEmpty()) mi.delete(); else { m = sub(m, mi); oco = true }
    }
  }
  if (tex) {
    const cos = Math.cos(o.telhado_angulo * Math.PI / 180), ds = o.semente * 13.7, prof = o.profundidade * o.junta_piso
    const me = o.mureta_espessura, mh = o.mureta_altura, pl = o.telhado_forma === 'plano'
    const cap = Math.max(Math.min(o.teto, Math.max(g.b - .5, .3), pl ? me / 2 - .3 : 9, oco ? Math.max(o.telhado_casca, 1.2) - .4 : 9), 0) // plano: mureta fina; oco: não fura a casca
    const rel = (a: number, b: number, k: number) => Math.min(profTex(o, a, b + k, ds, prof, o.texturaTelhado), cap)
    const r = m.refineToLength(.5)
    m.delete()
    m = r.warp(v => {
      const [x, y, z] = v, t = g.topo(x, y), ep = 1e-4
      // faces verticais (oitões, beirada, mureta por fora e por dentro) recuam para dentro do sólido, como nas paredes; semente distinta por face
      const im = pl && mh > 0 && z > 3 + ep // faces internas da mureta (acima da laje)
      if (Math.abs(x - x0) < ep) v[0] += rel(y, z, 1500)
      else if (Math.abs(x - x1) < ep) v[0] -= rel(y, z, 2000)
      else if (Math.abs(y - y0) < ep) v[1] += rel(x, z, 2500)
      else if (Math.abs(y - y1) < ep) v[1] -= rel(x, z, 3000)
      else if (im && Math.abs(x - x0 - me) < ep) v[0] -= rel(y, z, 3500)
      else if (im && Math.abs(x - x1 + me) < ep) v[0] += rel(y, z, 4000)
      else if (im && Math.abs(y - y0 - me) < ep) v[1] -= rel(x, z, 4500)
      else if (im && Math.abs(y - y1 + me) < ep) v[1] += rel(x, z, 5000)
      if (pl && mh > 0 && Math.abs(z - 3 - mh) < ep) v[2] -= rel(x, y, 1000) // topo da mureta
      if (Math.abs(z - t) > ep) return
      let u = x, w = y // plano: textura em x, y no topo da laje, fora da mureta
      if (pl) { if (x <= x0 + me || x >= x1 - me || y <= y0 + me || y >= y1 - me) return }
      else { // água ativa: u ao longo da cumeeira (horizontal no plano), w = distância horizontal / cos (comprimento real na água)
        const [a, bb, c] = P.reduce((p, q) => q[2] + q[0] * x + q[1] * y < p[2] + p[0] * x + p[1] * y ? q : p)
        const h = Math.hypot(a, bb); u = (-bb * x + a * y) / h; w = (c + a * x + bb * y - g.b) / (g.tg * cos) // w cresce para a cumeeira
      }
      v[2] -= rel(u, w, 3000)
    })
    r.delete()
    m = fund(m) // funde as faces planas do refinamento (erro 0,01 mm; mantém a malha fechada)
  }
  if (sa) {
    const e = es, i = e + 1.2
    let s = sub(caixa(g.bx0 + e, g.bx1 - e, g.by0 + e, g.by1 - e, -o.saia_altura, .5), caixa(g.bx0 + i, g.bx1 - i, g.by0 + i, g.by1 - i, -o.saia_altura - 1, 1))
    // a saia não atravessa paredes em eixo (que cruzam o interior): subtrai a planta delas, engordada pela folga
    for (const p of g.ps.filter(p => p.ancora.tipo === 'eixo')) {
      const { pt, o1, o2 } = quadro(o, p, o.saia_folga), dl = o.saia_folga
      const poly = [pt(-dl, o1), pt(p.comprimento + dl, o1), pt(p.comprimento + dl, o2), pt(-dl, o2)]
      const A = poly.reduce((q, [x, y], i) => q + x * poly[(i + 1) % 4][1] - poly[(i + 1) % 4][0] * y, 0)
      const ext = Manifold.extrude([A > 0 ? poly : poly.reverse()], o.saia_altura + 2), c = ext.translate([0, 0, -o.saia_altura - 1])
      ext.delete(); s = sub(s, c)
    }
    m = uni(m, s) // o topo da saia entra 0,5 mm no telhado: sem faces coplanares
  }
  return m
}
const malhaDe = (s: Solido, z: number) => { const t = s.translate([0, 0, z]), r = paraMalha(t); desentorta(r); s.delete(); t.delete(); return r }
/** Prévia: telhado no lugar (base em zb); removível com saia. */
export const telhadoMalha = (o: Opcoes, tex = false): Malha => malhaDe(solidoTelhado(o, tex, o.telhado_modo === 'removivel'), geoTelhado(o).zb)
/** Exportar o removível: base em z = 0, com saia e textura. */
export const telhadoSolto = (o: Opcoes): Malha => malhaDe(solidoTelhado(o, true, true), 0)
