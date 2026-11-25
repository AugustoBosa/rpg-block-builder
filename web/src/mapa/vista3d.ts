// Vista 3D do mapa. L0 = caixas por instância (thread principal, na hora). L1 = prévia 1 mm de cada peça única (pecas.worker), trocada quando chega.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { centroMundo, nLados, RELEVOS, vizinho, type ArestaMapa, type Mapa } from './modelo'
import { COR, lados } from './editor2d'
import { gira, tileset, type Instancia, type Peca } from './divisao'
import type { Sistema } from '../sistema'

type V = [number, number, number]
type P2 = [number, number]
type Tileset = ReturnType<typeof tileset>
type Acc = { p: number[]; c: number[] }

// mm por nível: subidaNivel() padrão (bloco.ts não pode ser importado aqui, puxa o WASM)
const ALTURA_DEGRAU = 15.5
const H_CHAO = 8, ESP = 6, COL = 6, CINZA = '#9a9a94'
const COR_OBJ: Record<string, string> = { arvore: '#4f8a3c', bosque: '#3f7a32', montanha: '#8a8a86', colina: '#7da05a', vulcao: '#8a3b2a', casa: '#b5835a', torre: '#a9a49a', cidade: '#c9a56a', castelo: '#a9a49a' }
const parse = (k: string): P2 => k.split(',').map(Number) as P2
const rgb = (hex: string) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b] }

// ---- geometria L0: triângulos com cor por vértice
function tri(a: Acc, A: V, B: V, C: V, cor: number[]) { for (const P of [A, B, C]) { a.p.push(...P); a.c.push(...cor) } }
function quad(a: Acc, A: V, B: V, C: V, D: V, cor: number[]) { tri(a, A, B, C, cor); tri(a, A, C, D, cor) }
/** Caixa de u0..u1, v0..v1, z0..z1 no eixo local, mapeada por f. */
function caixa(a: Acc, f: (u: number, v: number, z: number) => V, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, cor: number[]) {
  const P = [[u0, v0, z0], [u1, v0, z0], [u1, v1, z0], [u0, v1, z0], [u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]].map(([u, v, z]) => f(u, v, z))
  for (const [i, j, k, l] of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) quad(a, P[i], P[j], P[k], P[l], cor)
}
/** Célula: prisma do contorno com altura H_CHAO, a partir de z. */
function prisma(a: Acc, s: Sistema, c: number, r: number, z: number, cor: number[]) {
  const [cx, cy] = centroMundo(s, c, r), zt = z + H_CHAO
  for (const [A, B] of lados(s, c, r)) {
    quad(a, [A[0], A[1], z], [B[0], B[1], z], [B[0], B[1], zt], [A[0], A[1], zt], cor)
    tri(a, [cx, cy, zt], [A[0], A[1], zt], [B[0], B[1], zt], cor)
    tri(a, [cx, cy, z], [B[0], B[1], z], [A[0], A[1], z], cor)
  }
}
// partes da parede por [u0, u1, z0, z1] (u ao longo da aresta, z acima do piso do nível); vão de porta/arco = 22 mm
const PARTES: Record<ArestaMapa['tipo'], (L: number, H: number) => number[][]> = {
  parede: (L, H) => [[0, L, 0, H]],
  porta: (L, H) => [[0, L * .35, 0, H], [L * .65, L, 0, H], [L * .35, L * .65, 22, H]],
  arco: (L, H) => [[0, L * .35, 0, H], [L * .65, L, 0, H], [L * .35, L * .65, 22, H]],
  janela: (L, H) => [[0, L, 0, 10], [0, L, 20, H]],
}
/** Parede dentro da célula dona (canônica) do lado i: espessura ESP para dentro. */
function parede(a: Acc, s: Sistema, c: number, r: number, i: number, ar: ArestaMapa, H: number, z: number) {
  const [A, B] = lados(s, c, r)[i], [cx, cy] = centroMundo(s, c, r)
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
  const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nl = Math.hypot(cx - mx, cy - my), n = [(cx - mx) / nl, (cy - my) / nl]
  const f = (u: number, v: number, zz: number): V => [A[0] + d[0] * u + n[0] * v, A[1] + d[1] * u + n[1] * v, z + zz]
  const cor = rgb(ar.tex ? COR[ar.tex] : CINZA)
  for (const [u0, u1, z0, z1] of PARTES[ar.tipo](L, H)) caixa(a, f, u0, u1, 0, ESP, z0, z1, cor)
}
function coluna(a: Acc, s: Sistema, c: number, r: number, H: number, z: number) {
  const [cx, cy] = centroMundo(s, c, r)
  caixa(a, (u, v, zz) => [cx + u, cy + v, z + zz], -COL / 2, COL / 2, -COL / 2, COL / 2, 0, H, rgb('#c9c4b8'))
}

// ---- estado
let cena: THREE.Scene, cam: THREE.PerspectiveCamera, ren: THREE.WebGLRenderer, ctl: OrbitControls, grupo: THREE.Group
let atual: { m: Mapa; t: Tileset } | undefined
let l0: THREE.Mesh[] = []
let soCaixasOn = false, enquadrado = false, prog: ((x: number, y: number) => void) | undefined
const cache = new Map<string, THREE.BufferGeometry>(), pedidos = new Set<string>()
const matL0 = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
const matL1 = new THREE.MeshLambertMaterial({ color: '#c9c4b8', side: THREE.DoubleSide })

// ---- pool de workers (fila sem cancelamento: cada pedido espera a vez)
const fila: { chave: string; msg: object }[] = [], livres: Worker[] = []
const emUso = new Map<Worker, { chave: string; msg: object }>()
function pool() {
  const n = Math.min(3, Math.max(2, (navigator.hardwareConcurrency || 4) - 1))
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL('./pecas.worker.ts', import.meta.url), { type: 'module' })
    // só fica livre no 'pronto': mensagem mandada antes do WASM carregar (top-level await) se perde
    w.onerror = e => console.error('vista3d: worker de peças falhou', e.message)
    w.onmessage = ({ data: r }: MessageEvent) => {
      if (r === 'pronto') { livres.push(w); return despacha() }
      const j = emUso.get(w)!
      emUso.delete(w); livres.push(w)
      if (r.erro) { pedidos.delete(j.chave); console.warn(`Peça ${j.chave}: ${r.erro}`) } else chegou(j.chave, r)
      despacha()
    }
  }
}
function despacha() {
  while (livres.length && fila.length) { const w = livres.pop()!, j = fila.shift()!; emUso.set(w, j); w.postMessage(j.msg) }
}
function pede(k: string) {
  const { m, t } = atual!, it = t.instancias.find(x => x.chave === k)!, nivel = m.niveis.find(n => n.id === it.nivel)!
  pedidos.add(k)
  fila.push({ chave: k, msg: { m, nivel: it.nivel, sala: nivel.celulas[it.celulas[0]].sala, peca: it.peca, res: 1 } })
  despacha()
}

// ---- API
/** Cria a cena (uma vez). `progresso` recebe (prontas, total) das peças 3D. */
export function iniciaVista3d(el: HTMLElement, progresso?: (x: number, y: number) => void) {
  prog = progresso
  cena = new THREE.Scene(); cena.background = new THREE.Color('#2a2c30')
  cam = new THREE.PerspectiveCamera(40, 1, 1, 1e6); cam.up.set(0, 0, 1)
  cena.add(new THREE.AmbientLight(0xffffff, .7))
  const luz = new THREE.DirectionalLight(0xffffff, 1.6); luz.position.set(1, -2, 3); cena.add(luz)
  grupo = new THREE.Group(); cena.add(grupo)
  ren = new THREE.WebGLRenderer({ antialias: true }); ren.setPixelRatio(Math.min(devicePixelRatio, 2))
  ren.domElement.style.display = 'block'
  el.appendChild(ren.domElement)
  ctl = new OrbitControls(cam, ren.domElement); ctl.addEventListener('change', render)
  new ResizeObserver(() => {
    const w = el.clientWidth, h = el.clientHeight
    if (!w || !h) return
    ren.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); render()
  }).observe(el)
  pool()
  checaRotacoes().forEach(e => console.error('vista3d: rotação', e))
}

/** Mostra o mapa: L0 de tudo, L1 das peças já prontas; pede as peças novas. */
export function mostraMapa(m: Mapa) {
  if (!ren) return
  atual = { m, t: tileset(m) }
  l0.forEach(x => x.geometry.dispose())
  grupo.clear()
  l0 = constroiL0(m, atual.t)
  if (!soCaixasOn) for (const k of atual.t.pecas.keys()) {
    if (cache.has(k)) montaL1(k)
    else if (!pedidos.has(k)) pede(k)
  }
  if (!enquadrado) enquadra()
  progressoAtual(); render()
}

/** Liga/desliga a prévia 1 mm (L1); com `v` só caixas. */
export function soCaixas(v: boolean) {
  soCaixasOn = v
  if (atual) mostraMapa(atual.m)
}

// ---- internos
function constroiL0(m: Mapa, t: Tileset): THREE.Mesh[] {
  const s = m.sistema, acc = t.instancias.map((): Acc => ({ p: [], c: [] })), dono = new Map<string, number>()
  t.instancias.forEach((it, j) => it.celulas.forEach(k => dono.set(`${it.nivel}/${k}`, j)))
  for (const n of m.niveis) {
    const z = n.base * ALTURA_DEGRAU, dn = (k: string) => dono.get(`${n.id}/${k}`)
    for (const [k, cel] of Object.entries(n.celulas)) {
      const j = dn(k)
      if (j === undefined) continue
      const [c, r] = parse(k)
      prisma(acc[j], s, c, r, z, rgb(COR[cel.tex]))
      if (cel.obj) { // L0 do objeto: caixa no centro (relevo: larga e alta; miniatura: pequena)
        const [cx, cy] = centroMundo(s, c, r), rl = RELEVOS.includes(cel.obj), h = rl ? 20 : 12, a = rl ? 9 : 5
        caixa(acc[j], (u, v, zz) => [cx + u, cy + v, z + H_CHAO + zz], -a, a, -a, a, 0, h, rgb(COR_OBJ[cel.obj] ?? CINZA))
      }
    }
    for (const [k, ar] of Object.entries(n.arestas)) {
      // a chave canônica pode apontar para a célula vazia: aí a parede vai na vizinha, pelo lado oposto
      let [c, r, i] = k.split(',').map(Number), j = dn(`${c},${r}`)
      if (j === undefined) { const K = nLados(s); [c, r] = vizinho(s, c, r, i); i = (i + K / 2) % K; j = dn(`${c},${r}`) }
      if (j !== undefined) parede(acc[j], s, c, r, i, ar, n.altura_parede, z)
    }
    for (const k of Object.keys(n.colunas)) { const j = dn(k); if (j !== undefined) { const [c, r] = parse(k); coluna(acc[j], s, c, r, n.altura_parede, z) } }
  }
  return acc.map(a => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(a.c, 3))
    g.computeVertexNormals()
    const mesh = new THREE.Mesh(g, matL0)
    grupo.add(mesh)
    return mesh
  })
}
/** Matriz da instância: canônica girada por `rot` (rotZ rot·90°, hex: 2 = 180°) e levada ao centro da bbox das células da instância, na altura do nível. */
function matriz(m: Mapa, it: Instancia): THREE.Matrix4 {
  const s = m.sistema, P = it.celulas.map(k => { const [c, r] = parse(k); return centroMundo(s, c, r) })
  const xs = P.map(p => p[0]), ys = P.map(p => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const z = (m.niveis.find(n => n.id === it.nivel)?.base ?? 0) * ALTURA_DEGRAU
  return new THREE.Matrix4().makeTranslation(cx, cy, z).multiply(new THREE.Matrix4().makeRotationZ(it.rot * Math.PI / 2))
}
/** Uma InstancedMesh por peça única; as caixas L0 dessas instâncias somem. */
function montaL1(k: string) {
  const { m, t } = atual!, g = cache.get(k)!, js = t.instancias.flatMap((it, j) => it.chave === k ? [j] : [])
  const im = new THREE.InstancedMesh(g, matL1, js.length)
  js.forEach((j, q) => { im.setMatrixAt(q, matriz(m, t.instancias[j])); l0[j].visible = false })
  im.instanceMatrix.needsUpdate = true
  grupo.add(im)
}
function chegou(k: string, r: { pos: Float32Array; idx: Uint32Array }) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3))
  g.setIndex(new THREE.BufferAttribute(r.idx, 1))
  g.computeVertexNormals()
  cache.set(k, g); pedidos.delete(k)
  if (atual?.t.pecas.has(k) && !soCaixasOn) montaL1(k)
  progressoAtual(); render()
}
function progressoAtual() {
  if (!atual || !prog) return
  const ks = [...atual.t.pecas.keys()]
  prog(ks.filter(k => cache.has(k)).length, ks.length)
}
/** Enquadra tudo na primeira vez (câmera com Z para cima). */
function enquadra() {
  if (!atual) return
  const b = new THREE.Box3(), s = atual.m.sistema
  for (const n of atual.m.niveis) {
    const z = n.base * ALTURA_DEGRAU
    for (const k of Object.keys(n.celulas)) {
      const [c, r] = parse(k), [x, y] = centroMundo(s, c, r)
      b.expandByPoint(new THREE.Vector3(x, y, z)); b.expandByPoint(new THREE.Vector3(x, y, z + n.altura_parede))
    }
  }
  if (b.isEmpty()) return
  const c = b.getCenter(new THREE.Vector3()), d = b.getSize(new THREE.Vector3()).length() || 100
  ctl.target.copy(c)
  cam.position.copy(c).add(new THREE.Vector3(1, -1.2, 1.1).normalize().multiplyScalar(d * 1.4)) // FOV 40°: a diagonal inteira cabe
  cam.near = d / 200; cam.far = d * 20; cam.updateProjectionMatrix(); ctl.update()
  enquadrado = true
}
function render() { ren?.render(cena, cam) }

// ---- check: a canônica girada por rot cai onde estava a peça original (parede de teste num lado)
const SQ = { formato: 'quadrado', largura: 35, comprimento: 35 } as Sistema
const HEX = { formato: 'hexagono', largura: 35, comprimento: 35 } as Sistema
const TESTE = { linhas: 1, colunas: 2, tex: 'pedra', texParede: '', tipo: 'piso', tema: '', altura_parede: 30, paredes: [{ c: 0, r: 0, i: 0, tipo: 'parede' }], colunasCel: [] } as unknown as Peca
function centroDaPeca(s: Sistema, L: number, C: number): P2 {
  const P: P2[] = []
  for (let r = 0; r < L; r++) for (let c = 0; c < C; c++) P.push(centroMundo(s, c, r))
  const xs = P.map(p => p[0]), ys = P.map(p => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}
/** Ponto médio do lado da parede de teste, com o centro da peça na origem. */
function meioDaParede(s: Sistema, p: Peca): P2 {
  const e = p.paredes[0], [A, B] = lados(s, e.c, e.r)[e.i], o = centroDaPeca(s, p.linhas, p.colunas)
  return [(A[0] + B[0]) / 2 - o[0], (A[1] + B[1]) / 2 - o[1]]
}
/** Devolve os erros (vazio = ok). Quadrado: rot = (4 − r) % 4; hex: rot = r (180°). */
export function checaRotacoes(): string[] {
  const erros: string[] = []
  for (const s of [SQ, HEX]) {
    const hex = s.formato === 'hexagono'
    for (const r of hex ? [0, 2] : [0, 1, 2, 3]) {
      const q = gira(TESTE, s, r), rot = hex ? r : (4 - r) % 4, th = rot * Math.PI / 2
      const [a, b] = meioDaParede(s, q), [x, y] = meioDaParede(s, TESTE)
      const rx = a * Math.cos(th) - b * Math.sin(th), ry = a * Math.sin(th) + b * Math.cos(th)
      if (Math.hypot(rx - x, ry - y) > 1e-3) erros.push(`${hex ? 'hex' : 'quad'} r=${r} rot=${rot} fora do lugar`)
    }
  }
  return erros
}
