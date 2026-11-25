// Miniaturas das escalas Cidade e Reino (docs/superpowers/specs/2026-11-25-escalas-design.md): sólidos lisos sobre a laje.
// Cada sólido nasce com o chão em z = 0 e desce até z = −fundo (entra na laje; tapa os buracos da textura embaixo dele).
import { Manifold } from './wasm'

type Solido = InstanceType<typeof Manifold>
export type TipoObjeto = 'casa' | 'torre' | 'arvore' | 'bosque' | 'cidade' | 'castelo'
/** x, y: centro em mm (relativo ao centro do bloco); rot: graus; tam: escala (1 = padrão). */
export interface Objeto { tipo: TipoObjeto; x: number; y: number; rot: number; tam: number; semente: number }
export const OBJETOS: Record<TipoObjeto, { nome: string; raio: number }> = { // raio: meia largura da planta (mm, tam 1), para achar o chão
  casa: { nome: 'Casa', raio: 8 }, torre: { nome: 'Torre', raio: 5 }, arvore: { nome: 'Árvore', raio: 5 },
  bosque: { nome: 'Bosque', raio: 16 }, cidade: { nome: 'Cidade (marcador)', raio: 12 }, castelo: { nome: 'Castelo (marcador)', raio: 12 },
}
export const objetoNovo = (tipo: TipoObjeto, x = 0, y = 0): Objeto => ({ tipo, x, y, rot: 0, tam: 1, semente: 1 })

// operações que liberam os operandos
const uniao = (ss: Solido[]) => { const u = Manifold.union(ss); for (const s of ss) s.delete(); return u }
const sub = (a: Solido, b: Solido) => { const n = a.subtract(b); a.delete(); b.delete(); return n }
const mov = (s: Solido, x: number, y: number, z = 0, rot = 0, k = 1) => {
  const a = k !== 1 ? s.scale(k) : s, b = rot ? a.rotate([0, 0, rot]) : a, c = b.translate([x, y, z])
  for (const q of new Set([s, a, b])) q.delete()
  return c
}
const caixa = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => mov(Manifold.cube([x1 - x0, y1 - y0, z1 - z0]), x0, y0, z0)
const cil = (r0: number, r1: number, z0: number, z1: number, seg = 16) => mov(Manifold.cylinder(z1 - z0, r0, r1, seg), 0, 0, z0)

/** Casa: corpo + telhado de duas águas numa peça só (pentágono extrudado ao longo de x). */
function casa(f: number) {
  const L = 14, W = 10, H = 8, T = 5
  const p: [number, number][] = [[-W / 2, -f], [W / 2, -f], [W / 2, H], [0, H + T], [-W / 2, H]]
  const e = Manifold.extrude([p], L), m = e.transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, -L / 2, 0, 0, 1]) // local (u, v, w) → mundo (w, u, v)
  e.delete()
  const ch = caixa(2.5, 5, 1, 3.5, H - 1, H + T) // chaminé
  return uniao([m, ch])
}
/** Torre redonda com ameias. */
function torre(f: number, H = 18, R = 5) {
  let t = cil(R, R, -f, H)
  for (let i = 0; i < 4; i++) { const c = mov(caixa(-R - 1, R + 1, -1.2, 1.2, H - 2.5, H + 1), 0, 0, 0, i * 45); t = sub(t, c) }
  return t
}
/** Árvore: tronco + copa (cone = conífera, esfera = folhosa, pela semente). */
function arvore(f: number, semente: number) {
  const tronco = cil(1.2, 1, -f, 5, 10)
  const copa = semente % 2 ? cil(5, 0, 3, 15, 16) : mov(Manifold.sphere(5, 16), 0, 0, 8.5)
  return uniao([tronco, copa])
}
// sorteio determinístico (LCG): a mesma semente dá o mesmo bosque
const sorteio = (s: number) => { let a = (s * 2654435761) >>> 0 || 1; return () => (a = (a * 1664525 + 1013904223) >>> 0) / 2 ** 32 }
/** Bosque: 5 a 7 árvores sorteadas num raio de 10 mm, sem sair do raio do objeto. */
function bosque(f: number, semente: number) {
  const rnd = sorteio(semente), n = 5 + Math.floor(rnd() * 3), ss: Solido[] = []
  for (let i = 0; i < n; i++) {
    const a = (i + rnd() * .6) * 2 * Math.PI / n, d = i ? 4 + rnd() * 6 : 0, k = .7 + rnd() * .4
    ss.push(mov(arvore(f / k, i + semente), d * Math.cos(a), d * Math.sin(a), 0, 0, k))
  }
  return uniao(ss)
}
/** Marcador de cidade (escala Reino): casinhas em volta de uma torre. */
function cidade(f: number) {
  const ss = [mov(torre(f / .6), 0, 0, 0, 0, .6)]
  for (let i = 0; i < 4; i++) { const a = i * 90 + 45, c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); ss.push(mov(casa(f / .5), 7 * c, 7 * s, 0, a + 90, .5)) }
  return uniao(ss)
}
/** Marcador de castelo: torre de menagem, 4 torres nos cantos e muralha com ameias. */
function castelo(f: number) {
  const q = 8, ss = [mov(torre(f / .7, 20), 0, 0, 0, 0, .7)]
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) ss.push(mov(torre(f / .45, 18), sx * q, sy * q, 0, 0, .45))
  let mur = sub(caixa(-q, q, -q, q, -f, 7), caixa(-q + 1.6, q - 1.6, -q + 1.6, q - 1.6, -f - 1, 8))
  for (let s = -q + 3; s <= q - 3; s += 3) mur = sub(sub(mur, caixa(s - .7, s + .7, -q - 1, q + 1, 5.5, 8)), caixa(-q - 1, q + 1, s - .7, s + .7, 5.5, 8))
  ss.push(mur)
  return uniao(ss)
}

/** Sólido do objeto no lugar: chão em z = `chao`, descendo `fundo` mm abaixo dele. */
export function solidoObjeto(ob: Objeto, chao: number, fundo: number): Solido {
  const f = fundo / ob.tam // o fundo é em mm do mundo; o modelo é escalado por tam depois
  const m = ob.tipo === 'casa' ? casa(f) : ob.tipo === 'torre' ? torre(f) : ob.tipo === 'arvore' ? arvore(f, ob.semente)
    : ob.tipo === 'bosque' ? bosque(f, ob.semente) : ob.tipo === 'cidade' ? cidade(f) : castelo(f)
  return mov(m, ob.x, ob.y, chao, ob.rot, ob.tam)
}
