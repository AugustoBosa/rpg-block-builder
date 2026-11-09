// Ruído próprio (não é cópia do Blender): Perlin melhorado + fBm, Voronoi 3D (F1 e distância à borda) e ruído branco.
// Todas as funções são determinísticas: as mesmas coordenadas globais dão o mesmo valor, então blocos vizinhos emendam.

const h32 = (x: number) => { // lowbias32 (Chris Wellons, domínio público)
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16
  return x >>> 0
}
const hash = (i: number, j: number, k: number, s: number) => h32((i | 0) + h32((j | 0) + h32((k | 0) + h32(s | 0))))
const U = 1 / 4294967296
/** Número 0..1 por célula inteira. */
export const rnd = (i: number, j: number, k: number, s: number) => hash(i, j, k, s) * U

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + t * (b - a)
function grad(h: number, x: number, y: number, z: number) {
  const g = h & 15, u = g < 8 ? x : y, v = g < 4 ? y : g === 12 || g === 14 ? x : z
  return (g & 1 ? -u : u) + (g & 2 ? -v : v)
}

/** Perlin 3D, cerca de −1..1. */
function perlin(x: number, y: number, z: number, s: number) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z)
  x -= X; y -= Y; z -= Z
  const u = fade(x), v = fade(y), w = fade(z)
  const g = (i: number, j: number, k: number) => grad(hash(X + i, Y + j, Z + k, s), x - i, y - j, z - k)
  return lerp(lerp(lerp(g(0, 0, 0), g(1, 0, 0), u), lerp(g(0, 1, 0), g(1, 1, 0), u), v),
    lerp(lerp(g(0, 0, 1), g(1, 0, 1), u), lerp(g(0, 1, 1), g(1, 1, 1), u), v), w)
}

/** fBm normalizado, 0..1 com centro em 0,5. `detalhe` = oitavas extras; `s` muda o canal. */
export function ruido(x: number, y: number, z: number, escala: number, detalhe: number, rugosidade = .5, s = 0) {
  x *= escala; y *= escala; z *= escala
  let soma = 0, amp = 1, norma = 0
  for (let o = 0; o <= detalhe; o++) {
    soma += amp * perlin(x, y, z, s + o * 101)
    norma += amp; amp *= rugosidade; x *= 2; y *= 2; z *= 2
  }
  return .5 + .5 * soma / norma
}

export interface Vor { r0: number; r1: number; r2: number; px: number; py: number; borda: number }
/** Voronoi 3D: cor da célula mais próxima (r0..r2), posição do centro dela (px, py, nas coordenadas de entrada) e distância à borda (nas coordenadas escaladas). */
export function voronoi(x: number, y: number, z: number, escala: number, out: Vor, comCor = true) {
  const qx = x * escala, qy = y * escala, qz = z * escala
  const cx = Math.floor(qx), cy = Math.floor(qy), cz = Math.floor(qz)
  const fx = qx - cx, fy = qy - cy, fz = qz - cz
  let best = 1e9, mx = 0, my = 0, mz = 0, mi = 0, mj = 0, mk = 0
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const a = cx + i, b = cy + j, c = cz + k
    const rx = i + rnd(a, b, c, 1) - fx, ry = j + rnd(a, b, c, 2) - fy, rz = k + rnd(a, b, c, 3) - fz
    const d = rx * rx + ry * ry + rz * rz
    if (d < best) { best = d; mx = rx; my = ry; mz = rz; mi = i; mj = j; mk = k }
  }
  let borda = 1e9
  for (let k = mk - 1; k <= mk + 1; k++) for (let j = mj - 1; j <= mj + 1; j++) for (let i = mi - 1; i <= mi + 1; i++) {
    if (i === mi && j === mj && k === mk) continue
    const a = cx + i, b = cy + j, c = cz + k
    const rx = i + rnd(a, b, c, 1) - fx, ry = j + rnd(a, b, c, 2) - fy, rz = k + rnd(a, b, c, 3) - fz
    const dx = rx - mx, dy = ry - my, dz = rz - mz, L = Math.hypot(dx, dy, dz)
    const e = ((mx + rx) * dx + (my + ry) * dy + (mz + rz) * dz) / (2 * L)
    if (e < borda) borda = e
  }
  out.borda = borda
  if (comCor) {
    const a = cx + mi, b = cy + mj, c = cz + mk
    out.r0 = rnd(a, b, c, 11); out.r1 = rnd(a, b, c, 12); out.r2 = rnd(a, b, c, 13)
    out.px = (qx + mx) / escala; out.py = (qy + my) / escala
  }
  return out
}

export interface Vor2 { dist: number; r0: number; r1: number; r2: number }
/** Voronoi 2D (F1): distância ao centro mais próximo (nas coordenadas escaladas) e cor 0..1 da célula. Para pedrinhas: o 3D com z fixo quase não corta centros. */
export function voronoi2(x: number, y: number, escala: number, out: Vor2) {
  const qx = x * escala, qy = y * escala, cx = Math.floor(qx), cy = Math.floor(qy), fx = qx - cx, fy = qy - cy
  let best = 1e9, bi = 0, bj = 0
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const rx = i + rnd(cx + i, cy + j, 0, 41) - fx, ry = j + rnd(cx + i, cy + j, 0, 42) - fy, d = rx * rx + ry * ry
    if (d < best) { best = d; bi = i; bj = j }
  }
  const a = cx + bi, b = cy + bj
  out.dist = Math.sqrt(best); out.r0 = rnd(a, b, 0, 43); out.r1 = rnd(a, b, 0, 44); out.r2 = rnd(a, b, 0, 45)
  return out
}

/** Mapa a..b → c..d com suavização (smoothstep), preso nas pontas. */
export function mapa(v: number, a: number, b: number, c: number, d: number) {
  let t = (v - a) / (b - a)
  t = t < 0 ? 0 : t > 1 ? 1 : t === t ? t : 1 // a = b = v: NaN vira 1
  return c + t * t * (3 - 2 * t) * (d - c)
}
