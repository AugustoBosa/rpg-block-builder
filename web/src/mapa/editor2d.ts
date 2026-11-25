// Editor 2D do mapa: canvas do nível atual (e do nível de baixo, esmaecido), ponteiros, teclas e pilha de desfazer. Os controles ficam em main.ts.
import { abrir, apaga, arestaCanonica, centroMundo, chave, OBJ, pinta, poeAresta, salvar, tiraAresta, vizinho, type ArestaMapa, type Dir, type Mapa, type Nivel } from './modelo'
import type { Sistema } from '../sistema'
import type { TexId } from '../textura'
import { dividir } from './divisao'

export type Ferr = 'piso' | 'apagar' | 'parede' | 'porta' | 'janela' | 'arco' | 'coluna' | 'rampa' | 'escada' | 'sala' | 'corte' | 'objeto'
export const ed = { m: undefined as unknown as Mapa, niv: 0, sala: '', tex: 'pedra' as TexId, ferr: 'piso' as Ferr, dir: '+x' as Dir, obj: 'casa' }

export const COR: Record<TexId, string> = {
  pedra: '#7d766a', lisa: '#a3a3a0', lajota: '#a68e68', tijolo: '#9a5b3e', terra: '#6e5238', areia: '#c8b07a', rachado: '#6d6b67', tabuas: '#8c6a44',
  caverna: '#4f4a58', casco: '#5f7079', metal: '#8b9199', agua: '#2f6ea0', lava: '#c4501f', nichos: '#56606b', glifos: '#4e6e58',
}
const CORA: Record<ArestaMapa['tipo'], string> = { parede: '#e8e4da', porta: '#e9a35a', janela: '#7ec8e3', arco: '#d9c26a' }
const VD: Record<Dir, [number, number]> = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] }
const ORDEM: Dir[] = ['+x', '+y', '-x', '-y']
const TECLAS: Record<string, Ferr> = { p: 'piso', e: 'apagar', w: 'parede', d: 'porta', j: 'janela', a: 'arco', c: 'coluna', m: 'rampa', s: 'escada', t: 'sala', x: 'corte', o: 'objeto' }
const ARRASTA: Ferr[] = ['piso', 'apagar', 'parede', 'sala', 'rampa', 'escada', 'objeto']

type Pt = [number, number]
type Gesto = { antes: string; modo: 'add' | 'del'; arrasta: boolean; ult: Pt }

// Geometria: vértices locais da célula (quadrado: cantos; hex: raio l = largura/√3, de 60 em 60°). Lado i = vértices i e i+1 (mesma ordem de nLados/vizinho).
const passo = (s: Sistema): Pt => [centroMundo(s, 1, 0)[0], centroMundo(s, 0, 1)[1]]
function verts(s: Sistema): Pt[] {
  if (s.formato === 'hexagono') {
    const l = s.largura / Math.sqrt(3)
    return [0, 1, 2, 3, 4, 5].map(k => [l * Math.cos(k * Math.PI / 3), l * Math.sin(k * Math.PI / 3)] as Pt)
  }
  const w = s.largura / 2, h = s.comprimento / 2
  return [[w, -h], [w, h], [-w, h], [-w, -h]]
}
export function lados(s: Sistema, c: number, r: number): [Pt, Pt][] {
  const [cx, cy] = centroMundo(s, c, r), V = verts(s)
  return V.map((a, i) => { const b = V[(i + 1) % V.length]; return [[cx + a[0], cy + a[1]], [cx + b[0], cy + b[1]]] })
}
/** Célula cujo centro está mais perto do ponto (mundo, mm). */
function celulaEm(wx: number, wy: number): Pt {
  const s = ed.m.sistema, [px, py] = passo(s), c0 = Math.round(wx / px)
  let melhor: Pt = [c0, 0], dm = Infinity
  for (let c = c0 - 1; c <= c0 + 1; c++) {
    const r0 = Math.round((wy - centroMundo(s, c, 0)[1]) / py)
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      const [x, y] = centroMundo(s, c, r), d = (x - wx) ** 2 + (y - wy) ** 2
      if (d < dm) { dm = d; melhor = [c, r] }
    }
  }
  return melhor
}
function distSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(a[0] + t * dx - px, a[1] + t * dy - py)
}
/** Lado i da célula (c, r) mais perto do cursor, se ele estiver a < 30% do lado; senão -1. (Mais perto, e não "normal mais alinhada": perto do canto a normal engana e a parede sai na lateral.) */
function ladoEm(c: number, r: number, wx: number, wy: number): number {
  const s = ed.m.sistema, L = lados(s, c, r)
  let melhor = 0, dm = Infinity
  L.forEach(([a, b], i) => { const d = distSeg(wx, wy, a, b); if (d < dm) { dm = d; melhor = i } })
  const [a, b] = L[melhor]
  return dm < .3 * Math.hypot(b[0] - a[0], b[1] - a[1]) ? melhor : -1
}

const nivel = (): Nivel => ed.m.niveis[ed.niv]
/** Garante nível e sala válidos (depois de abrir, desfazer, excluir). */
export function ajusta() {
  ed.niv = Math.max(0, Math.min(ed.niv, ed.m.niveis.length - 1))
  if (!nivel().salas.some(x => x.id === ed.sala)) ed.sala = nivel().salas[0].id
}

// Vista: tela = mundo · z + (tx, ty) em px CSS
let cv: HTMLCanvasElement
let ctx: CanvasRenderingContext2D
const vis = { tx: 0, ty: 0, z: 1, pronto: false }
const lw = (px: number) => px / vis.z
const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top } }
// tela: y para baixo; mundo (STL, vista 3D): y para cima. Só a exibição inverte.
const mundo = (p: { x: number; y: number }): Pt => [(p.x - vis.tx) / vis.z, (vis.ty - p.y) / vis.z]
/** Enquadra as células de todos os níveis (+1 célula de margem); mapa vazio: 32 × 32 células. */
function enquadra() {
  const W = cv.clientWidth, H = cv.clientHeight, [px, py] = passo(ed.m.sistema)
  const ps = ed.m.niveis.flatMap(n => Object.keys(n.celulas)).map(k => k.split(',').map(Number)).map(([c, r]) => centroMundo(ed.m.sistema, c, r))
  const [x0, x1, y0, y1] = ps.length ? [Math.min(...ps.map(p => p[0])) - px, Math.max(...ps.map(p => p[0])) + px, Math.min(...ps.map(p => p[1])) - py, Math.max(...ps.map(p => p[1])) + py] : [-.5 * px, 31.5 * px, -.5 * py, 31.5 * py]
  vis.z = Math.min(W / (x1 - x0), H / (y1 - y0))
  vis.tx = W / 2 - (x0 + x1) / 2 * vis.z
  vis.ty = H / 2 + (y0 + y1) / 2 * vis.z
  vis.pronto = true
}
export const reenquadra = () => { vis.pronto = false }
function zoomEm(sx: number, sy: number, f: number) {
  const wx = (sx - vis.tx) / vis.z, wy = (vis.ty - sy) / vis.z
  vis.z = Math.min(20, Math.max(.02, vis.z * f))
  vis.tx = sx - wx * vis.z
  vis.ty = sy + wy * vis.z
}

function redesenha() {
  if (!cv || !ed.m) return
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr) }
  if (W && !vis.pronto) enquadra()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#1d1f22'
  ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.setTransform(dpr * vis.z, 0, 0, -dpr * vis.z, dpr * vis.tx, dpr * vis.ty)
  grade()
  const b = abaixo()
  if (b) desenhaNivel(b, .25, false)
  desenhaNivel(nivel(), 1, true)
  desenhaSala()
  desenhaPecas()
  ctx.globalAlpha = 1
}
/** Contorno tracejado de cada peça do nível atual (bbox das células da peça). */
let pecasMemo = { k: '', v: [] as ReturnType<typeof dividir> }
function desenhaPecas() {
  const s = ed.m.sistema, k = JSON.stringify([s, nivel()])
  if (k !== pecasMemo.k) pecasMemo = { k, v: dividir(ed.m, nivel().id) } // pan/zoom não redivide
  ctx.strokeStyle = '#7fd1ff'
  ctx.lineWidth = lw(1)
  ctx.setLineDash([3, 2])
  for (const it of pecasMemo.v) {
    const xs: number[] = [], ys: number[] = []
    for (const k of it.celulas) {
      const [c, r] = k.split(',').map(Number)
      for (const [a] of lados(s, c, r)) { xs.push(a[0]); ys.push(a[1]) }
    }
    const x0 = Math.min(...xs), y0 = Math.min(...ys)
    ctx.strokeRect(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0)
  }
  ctx.setLineDash([])
}
/** Grade fina de células só na área visível (some quando há células demais para desenhar). */
function grade() {
  const s = ed.m.sistema, [px, py] = passo(s), W = cv.clientWidth, H = cv.clientHeight
  const p0 = mundo({ x: 0, y: 0 }), p1 = mundo({ x: W, y: H })
  const x0 = Math.min(p0[0], p1[0]), x1 = Math.max(p0[0], p1[0]), y0 = Math.min(p0[1], p1[1]), y1 = Math.max(p0[1], p1[1])
  const c0 = Math.floor(x0 / px) - 1, c1 = Math.ceil(x1 / px) + 1
  if ((c1 - c0 + 1) * (Math.ceil(y1 / py) - Math.floor(y0 / py) + 4) > 40000) return
  ctx.strokeStyle = '#33363b'
  ctx.lineWidth = lw(.6)
  for (let c = c0; c <= c1; c++) {
    const off = centroMundo(s, c, 0)[1]
    for (let r = Math.floor((y0 - off) / py) - 1; r <= Math.ceil((y1 - off) / py) + 1; r++) {
      ctx.beginPath()
      lados(s, c, r).forEach(([a], i) => (i ? ctx.lineTo(a[0], a[1]) : ctx.moveTo(a[0], a[1])))
      ctx.closePath()
      ctx.stroke()
    }
  }
}
function abaixo(): Nivel | undefined {
  let r: Nivel | undefined
  for (const n of ed.m.niveis) if (n.base < nivel().base && (!r || n.base > r.base)) r = n
  return r
}
function desenhaNivel(n: Nivel, alfa: number, cheio: boolean) {
  const s = ed.m.sistema, t = Math.min(...passo(s)) * .4, cels = Object.entries(n.celulas)
  ctx.globalAlpha = alfa
  for (const [k, cel] of cels) {
    const [c, r] = k.split(',').map(Number), L = lados(s, c, r)
    ctx.beginPath()
    L.forEach(([a], i) => (i ? ctx.lineTo(a[0], a[1]) : ctx.moveTo(a[0], a[1])))
    ctx.closePath()
    ctx.fillStyle = COR[cel.tex]
    ctx.fill()
    ctx.strokeStyle = '#111'
    ctx.lineWidth = lw(.8)
    ctx.stroke()
  }
  if (!cheio) { ctx.globalAlpha = 1; return }
  for (const [k, cel] of cels) {
    const [c, r] = k.split(',').map(Number), [cx, cy] = centroMundo(s, c, r)
    if (cel.tipo !== 'piso') marca(cx, cy, cel.dir ?? '+x', cel.tipo === 'escada', t)
    if (cel.obj) { // letra do objeto (y do canvas invertido: desfaz a escala só no texto)
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, -1)
      ctx.fillStyle = '#111'; ctx.font = `bold ${t * 1.1}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(OBJ[cel.obj].slice(0, 2), 0, 0); ctx.restore()
    }
    const col = n.colunas[k]
    if (col) {
      ctx.fillStyle = '#c9c4b8'; ctx.strokeStyle = '#111'; ctx.lineWidth = lw(1)
      ctx.fillRect(cx - col.lado / 2, cy - col.lado / 2, col.lado, col.lado)
      ctx.strokeRect(cx - col.lado / 2, cy - col.lado / 2, col.lado, col.lado)
    }
  }
  for (const [k] of cels) {
    const [c, r] = k.split(',').map(Number)
    lados(s, c, r).forEach(([a, b], i) => { const ar = n.arestas[arestaCanonica(s, c, r, i)]; if (ar) aresta(a, b, ar.tipo) })
  }
  ctx.globalAlpha = 1
}
/** Parede, porta, janela ou arco: linha grossa com marca própria no meio. */
function aresta(a: Pt, b: Pt, tipo: ArestaMapa['tipo']) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
  ctx.save()
  ctx.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
  ctx.rotate(Math.atan2(dy, dx))
  ctx.strokeStyle = CORA[tipo]
  ctx.lineWidth = lw(4)
  ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke()
  ctx.lineWidth = lw(1.5)
  ctx.beginPath()
  if (tipo === 'porta') { ctx.moveTo(0, -len * .35); ctx.lineTo(0, len * .35) }
  if (tipo === 'janela') ctx.rect(-len * .15, -len * .15, len * .3, len * .3)
  if (tipo === 'arco') ctx.arc(0, 0, len * .18, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
/** Seta no sentido dir; escada leva riscos perpendiculares. t = meia seta em mm. */
function marca(cx: number, cy: number, dir: Dir, escada: boolean, t: number) {
  const [dx, dy] = VD[dir], ex = -dy, ey = dx, tx = cx + dx * t * .7, ty = cy + dy * t * .7
  ctx.strokeStyle = '#f4f1e8'
  ctx.lineWidth = lw(1.6)
  ctx.beginPath()
  ctx.moveTo(cx - dx * t * .7, cy - dy * t * .7); ctx.lineTo(tx, ty)
  ctx.lineTo(tx - dx * t * .3 + ex * t * .25, ty - dy * t * .3 + ey * t * .25)
  ctx.moveTo(tx, ty); ctx.lineTo(tx - dx * t * .3 - ex * t * .25, ty - dy * t * .3 - ey * t * .25)
  if (escada) for (const k of [-.5, -.15, .2, .55]) {
    const px = cx + dx * t * k, py = cy + dy * t * k
    ctx.moveTo(px - ex * t * .6, py - ey * t * .6); ctx.lineTo(px + ex * t * .6, py + ey * t * .6)
  }
  ctx.stroke()
}
/** Contorno amarelo da sala atual e cortes vermelhos tracejados. */
function desenhaSala() {
  const n = nivel(), s = ed.m.sistema
  ctx.strokeStyle = '#f2c94c'
  ctx.lineWidth = lw(1.5)
  for (const [k, cel] of Object.entries(n.celulas)) {
    if (cel.sala !== ed.sala) continue
    const [c, r] = k.split(',').map(Number)
    lados(s, c, r).forEach(([a, b], i) => {
      const [c2, r2] = vizinho(s, c, r, i), o = n.celulas[chave(c2, r2)]
      if (o && o.sala === ed.sala) return
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
    })
  }
  ctx.strokeStyle = '#e5484d'
  ctx.lineWidth = lw(2.5)
  ctx.setLineDash([1.5, 1.5])
  for (const sl of n.salas) for (const k of sl.cortes) {
    const [c, r, i] = k.split(',').map(Number), [a, b] = lados(s, c, r)[i]
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
  }
  ctx.setLineDash([])
}

// Estado de edição: pilha de snapshots (salvar/abrir), um por gesto
const undo: string[] = [], redo: string[] = []
const cbs: (() => void)[] = []
/** Chama `cb` a cada mudança do mapa, da vista ou da seleção (para a UI e para a vista 3D). */
export function aoMudar(cb: () => void) { cbs.push(cb) }
function avisa() { for (const f of cbs) f() }
export function atualiza() { redesenha(); avisa() }
function empilha(antes: string) {
  undo.push(antes)
  if (undo.length > 100) undo.shift()
  redo.length = 0
}
/** Um gesto de edição (clique, arrasto, campo da barra): um único passo de desfazer se algo mudou. */
export function edita(fn: () => void) {
  const antes = salvar(ed.m)
  fn()
  if (salvar(ed.m) !== antes) empilha(antes)
  ajusta()
  atualiza()
}
export function carrega(m: Mapa) {
  ed.m = m; ed.niv = 0; ed.sala = ''
  ajusta()
  undo.length = 0; redo.length = 0
  vis.pronto = false
  atualiza()
}
export function desfaz() {
  const t = undo.pop()
  if (t === undefined) return
  redo.push(salvar(ed.m)); ed.m = abrir(t); ajusta(); atualiza()
}
export function refaz() {
  const t = redo.pop()
  if (t === undefined) return
  undo.push(salvar(ed.m)); ed.m = abrir(t); ajusta(); atualiza()
}
export function gira() { ed.dir = ORDEM[(ORDEM.indexOf(ed.dir) + 1) % ORDEM.length]; avisa() }

// Ponteiros: um dedo ou mouse edita; botão do meio, espaço ou dois dedos movem a vista
let gesto: Gesto | null = null
const ptrs = new Map<number, { x: number; y: number }>()
let pan: { x: number; y: number; tx: number; ty: number } | null = null
let pinca: { d: number; z: number; wx: number; wy: number } | null = null
let espaco = false

function iniciaGesto(p: { x: number; y: number }) {
  const [wx, wy] = mundo(p)
  gesto = { antes: salvar(ed.m), modo: 'add', arrasta: ARRASTA.includes(ed.ferr), ult: [wx, wy] }
  acao(wx, wy, true)
  redesenha()
}
function fimGesto() {
  if (!gesto) return
  const antes = gesto.antes
  gesto = null
  if (salvar(ed.m) !== antes) empilha(antes)
  atualiza()
}
/** Efeito da ferramenta no ponto (mundo). `inicio` = primeiro toque do gesto (cliques alternam; arrasto só aplica). */
function acao(wx: number, wy: number, inicio: boolean) {
  const m = ed.m, s = m.sistema, n = nivel(), id = n.id, [c, r] = celulaEm(wx, wy), k = chave(c, r), cel = n.celulas[k], sala = ed.sala
  switch (ed.ferr) {
    case 'piso': pinta(m, id, c, r, { tex: ed.tex, tipo: 'piso', sala }); break
    case 'apagar': apaga(m, id, c, r); break
    case 'objeto': // clique alterna; arrasto só põe
      if (!cel) break
      if (inicio && cel.obj === ed.obj) delete cel.obj
      else cel.obj = ed.obj
      break
    case 'rampa': case 'escada':
      pinta(m, id, c, r, { tex: cel?.tex ?? ed.tex, tipo: ed.ferr === 'escada' ? 'escada' : 'rampa', dir: ed.dir, sala: cel?.sala ?? sala })
      break
    case 'sala': n.celulas[k] = cel ? { ...cel, sala } : { tex: ed.tex, tipo: 'piso', sala }; break
    case 'coluna':
      if (!cel) break
      if (n.colunas[k]) delete n.colunas[k]
      else n.colunas[k] = { lado: 10 }
      break
    case 'corte': {
      const i = ladoEm(c, r, wx, wy)
      if (!cel || i < 0) break
      const [c2, r2] = vizinho(s, c, r, i), o = n.celulas[chave(c2, r2)], sl = n.salas.find(x => x.id === cel.sala)
      if (!o || o.sala !== cel.sala || !sl) break
      const kk = arestaCanonica(s, c, r, i), j = sl.cortes.indexOf(kk)
      if (j < 0) sl.cortes.push(kk)
      else sl.cortes.splice(j, 1)
      break
    }
    case 'parede': case 'porta': case 'janela': case 'arco': {
      const i = ladoEm(c, r, wx, wy)
      if (i < 0) break
      const [c2, r2] = vizinho(s, c, r, i)
      if (!cel && !n.celulas[chave(c2, r2)]) break
      const tipo = ed.ferr as ArestaMapa['tipo']
      if (inicio && gesto) gesto.modo = n.arestas[arestaCanonica(s, c, r, i)]?.tipo === tipo ? 'del' : 'add'
      if (gesto?.modo === 'del') tiraAresta(m, id, s, c, r, i)
      else poeAresta(m, id, s, c, r, i, { tipo })
      break
    }
  }
}
function pDown(e: PointerEvent) {
  const p = local(e)
  ptrs.set(e.pointerId, p)
  cv.setPointerCapture(e.pointerId)
  if (ptrs.size === 2) {
    fimGesto(); pan = null
    const [a, b] = [...ptrs.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), z: vis.z, wx: (mx - vis.tx) / vis.z, wy: (vis.ty - my) / vis.z }
    return
  }
  if (ptrs.size > 2) return
  if (e.button === 1 || espaco) { e.preventDefault(); pan = { x: p.x, y: p.y, tx: vis.tx, ty: vis.ty }; return }
  if (e.button === 0) iniciaGesto(p)
}
function pMove(e: PointerEvent) {
  if (!ptrs.has(e.pointerId)) return
  const p = local(e)
  ptrs.set(e.pointerId, p)
  if (pinca && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    vis.z = Math.min(20, Math.max(.02, pinca.z * Math.hypot(a.x - b.x, a.y - b.y) / pinca.d))
    vis.tx = mx - pinca.wx * vis.z
    vis.ty = my + pinca.wy * vis.z
    redesenha()
    return
  }
  if (pan) { vis.tx = pan.tx + p.x - pan.x; vis.ty = pan.ty + p.y - pan.y; redesenha(); return }
  if (gesto?.arrasta) {
    // interpola do ponto anterior ao atual, em passos de 1/3 da célula, para não pular células
    const [wx, wy] = mundo(p), [ux, uy] = gesto.ult, n = Math.max(1, Math.ceil(Math.hypot(wx - ux, wy - uy) / (Math.min(...passo(ed.m.sistema)) / 3)))
    for (let k = 1; k <= n; k++) acao(ux + (wx - ux) * k / n, uy + (wy - uy) * k / n, false)
    gesto.ult = [wx, wy]
    redesenha()
  }
}
function pUp(e: PointerEvent) {
  ptrs.delete(e.pointerId)
  if (ptrs.size < 2) pinca = null
  if (ptrs.size === 0) { pan = null; fimGesto() }
}
function tecla(e: KeyboardEvent) {
  const t = e.target
  if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
  const k = e.key.toLowerCase()
  if (e.code === 'Space') { espaco = true; e.preventDefault(); return }
  if (e.ctrlKey || e.metaKey) {
    if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); refaz() }
    else if (k === 'z') { e.preventDefault(); desfaz() }
    return
  }
  if (k === 'r') gira()
  else if (TECLAS[k]) { ed.ferr = TECLAS[k]; avisa() }
}

export function iniciaEditor(c: HTMLCanvasElement) {
  cv = c
  ctx = c.getContext('2d')!
  c.addEventListener('pointerdown', pDown)
  c.addEventListener('pointermove', pMove)
  c.addEventListener('pointerup', pUp)
  c.addEventListener('pointercancel', pUp)
  c.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomEm(p.x, p.y, Math.exp(-e.deltaY * .0015)); redesenha() }, { passive: false })
  c.addEventListener('contextmenu', e => e.preventDefault())
  new ResizeObserver(() => redesenha()).observe(c)
  addEventListener('keydown', tecla)
  addEventListener('keyup', e => { if (e.code === 'Space') espaco = false })
}
