// Travas e ímãs do grid (docs/superpowers/specs/2026-11-20-grid-completo-design.md): geometria pura + sólidos do Manifold de wasm.ts.
// Não importa sistema.ts (ciclo com top-level await): recebe segmentos e números.
import { CrossSection, Manifold } from './wasm'
type Solido = InstanceType<typeof Manifold>
type P = [number, number]

export interface ExtrasGrid {
  trava: 'nenhuma' | 'clip' | 'macho'; trava_altura: number; trava_comprimento: number; trava_largura: number; trava_haste: number; trava_folga: number
  ima_borda: boolean; ima_cruz: boolean; ima_meio: boolean; ima_grid_d: number; ima_grid_h: number; ima_por_lado: number; folga_ima: number; alivio: boolean
}

const k = ([x, y]: P) => `${x.toFixed(4)},${y.toFixed(4)}`
/** Vértices do contorno externo (segmentos [ax, ay, bx, by, nx, ny], anti-horário): ângulo interno, bissetriz interna e normal do lado que sai. */
export function verticesBorda(seg: number[][]) {
  const sai = new Map<string, number[]>(), entra = new Map<string, number[]>()
  for (const g of seg) { sai.set(k([g[0], g[1]]), g); entra.set(k([g[2], g[3]]), g) }
  const out: { p: P; b: P; ang: number; n: P }[] = []
  for (const [key, gs] of sai) {
    const ge = entra.get(key); if (!ge) continue
    const din: P = [ge[2] - ge[0], ge[3] - ge[1]], dout: P = [gs[2] - gs[0], gs[3] - gs[1]]
    const li = Math.hypot(...din), lo = Math.hypot(...dout), a: P = [din[0] / li, din[1] / li], b: P = [dout[0] / lo, dout[1] / lo]
    const giro = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180 / Math.PI // > 0: vira à esquerda (convexo)
    const bi: P = [-a[1] - b[1], a[0] + b[0]], h = Math.hypot(...bi) // soma das normais internas (esquerda de cada direção)
    out.push({ p: [gs[0], gs[1]], b: [bi[0] / h, bi[1] / h], ang: 180 - giro, n: [gs[4], gs[5]] })
  }
  return out
}
const extr = (c: InstanceType<typeof CrossSection>, h: number) => { const m = Manifold.extrude(c, h); c.delete(); return m }
/** "Osso" em planta ao longo de +x, centrado na origem: haste + duas cabeças. */
export function osso(L: number, cab: number, haste: number, folga: number, h: number): Solido {
  const r = cab / 2 + folga, x = L / 2 - cab / 2
  const k = CrossSection.circle(r, 32), c1 = k.translate([-x, 0]), c2 = k.translate([x, 0]); k.delete()
  const hs = CrossSection.square([2 * x, haste + 2 * folga], true)
  const u = CrossSection.union([c1, c2, hs]); for (const q of [c1, c2, hs]) q.delete()
  return extr(u, h)
}
/** Rabo-de-andorinha em planta: pescoço `haste` em x = 0, alarga até `cab` em x = L/2 (folga engorda tudo). */
export function rabo(L: number, cab: number, haste: number, folga: number, h: number): Solido {
  const a = haste / 2 + folga, b = cab / 2 + folga, e = L / 2 + folga
  return extr(new CrossSection([[[-.3, -a], [e, -b], [e, b], [-.3, a]]]), h) // começa 0,3 mm antes do vértice: sem face coplanar com a borda
}
/** Gira +x para a direção b e põe em p. */
export const poe = (s: Solido, p: P, b: P) => { const r = s.rotate([0, 0, Math.atan2(b[1], b[0]) * 180 / Math.PI]), t = r.translate([p[0], p[1], 0]); r.delete(); s.delete(); return t }
/** Vértices (cruz: 4 células no quadrado, 3 no hexágono) e meios de lado (meio: 2 células) internos, a partir dos contornos de cada célula. */
export function pontosInternos(celulas: P[][], hex: boolean) {
  const vc = new Map<string, { p: P; n: number }>(), lados = new Map<string, { e: [P, P]; n: number }>()
  for (const poli of celulas) poli.forEach((p, i) => {
    const q = poli[(i + 1) % poli.length], m: P = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    const a = vc.get(k(p)) ?? { p, n: 0 }; a.n++; vc.set(k(p), a)
    const b = lados.get(k(m)) ?? { e: [p, q], n: 0 }; b.n++; lados.set(k(m), b)
  })
  const nc = hex ? 3 : 4
  return { cruz: [...vc.values()].filter(v => v.n >= nc).map(v => v.p), meio: [...lados.values()].filter(v => v.n === 2).map(v => v.e) } // meio: extremos do lado compartilhado
}
/** `n` pontos igualmente espaçados entre a e b (t = (i+1)/(n+1)); n = 1 é o meio exato. */
export const divide = (a: P, b: P, n: number): P[] =>
  Array.from({ length: n }, (_, i) => { const t = (i + 1) / (n + 1); return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t] as P })
/** Cilindro vertical do ímã por baixo (de z = −0,5 a h) em p. */
export const imaV = (p: P, d: number, h: number) => {
  const c = Manifold.cylinder(h + .5, d / 2, d / 2, 48), t = c.translate([p[0], p[1], -.5]); c.delete(); return t
}
/** Cilindro horizontal entrando pela borda: em p (meio do lado), eixo −n, centro em z, profundidade h (+0,5 para fora). */
export const imaH = (p: P, n: P, d: number, h: number, z: number) => {
  const c = Manifold.cylinder(h + .5, d / 2, d / 2, 48), r = c.rotate([0, 90, 0]); c.delete() // eixo +x, de x = 0 a h + 0,5
  const t = r.translate([-.5, 0, z]); r.delete()
  return poe(t, p, [-n[0], -n[1]])
}
/** Peça clip (STL próprio): osso sem folga, mais baixo que o recorte. */
export const clipSolido = (x: ExtrasGrid) => osso(x.trava_comprimento, x.trava_largura, x.trava_haste, 0, x.trava_altura - .3)
