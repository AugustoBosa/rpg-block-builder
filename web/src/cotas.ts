// Cotas da vista 3D: linhas finas âmbar na cena + rótulos HTML (CSS2D). Todos os números vêm de sistema.ts (medidas, celula, contorno, centros, fundo).
import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { Opcoes } from './bloco'
import { celula, centros, contorno, fundo, medidas, type Celula } from './sistema'

// sem clippingPlanes: o corte das peças não corta as cotas
const LINHA = new THREE.LineBasicMaterial({ color: 0xffb000, depthTest: false })
const OFF = 6 // mm: cota afastada da peça
const EXT = 1 // mm: a linha de extensão passa 1 mm da peça e 1 mm além da linha de cota
const TICK = 1.2 // mm: traço de 45° nas pontas

type V = [number, number, number]
interface Caixa { x0: number; x1: number; y0: number; y1: number }

const soma = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const meio = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
const unidade = (a: V): V => { const l = Math.hypot(...a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1] }
const n = (v: number) => v.toFixed(1).replace('.', ',') // vírgula decimal, 1 casa
const mm = (v: number) => n(v) + ' mm'

/** Caixa envolvente de uma peça linhas × colunas (centrada na origem, como centros()). */
function caixa(c: Celula, linhas: number, colunas: number): Caixa {
  const v = contorno(c, 0), cs = centros(c, linhas, colunas)
  const xs = cs.flatMap(([x]) => v.map(p => x + p[0])), ys = cs.flatMap(([, y]) => v.map(p => y + p[1]))
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

/** Vértice mais externo em y (s = 1 topo, −1 base); empatado, o mais à direita. No hexágono, a cota sai do lado plano. */
function ponta(c: Celula, s: number): V {
  const v = contorno(c, 0), m = Math.max(...v.map(p => s * p[1]))
  const p = v.filter(q => s * q[1] > m - 1e-6).reduce((a, b) => (b[0] > a[0] ? b : a))
  return [p[0], p[1], 0]
}

const cruz = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const ponto = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
interface Item { a: V; b: V; v0: V; dist: number; r: CSS2DObject }

/** Guarda as cotas de um grupo e as redesenha (`orienta`) no plano perpendicular à câmera: a linha de cota
 *  sai sempre na direção que a câmera vê de lado, para o outro lado do centro da peça. `v0` é o respaldo (de frente para a cota). */
class Desenho {
  g = new THREE.Group()
  private itens: Item[] = []
  private linhas: THREE.LineSegments | null = null
  constructor(private centro: V = [0, 0, 0]) {}
  /** Cota linear de a até b; a linha de cota fica `dist` mm na direção `v0` (unitária) até a câmera pedir outra. */
  cota(a: V, b: V, v0: V, dist: number, texto: string) {
    const el = document.createElement('div')
    el.className = 'cota'
    el.textContent = texto
    el.style.cssText = 'font:11px sans-serif;color:#ffb000;pointer-events:none;white-space:nowrap;text-shadow:0 0 3px #000'
    const r = new CSS2DObject(el)
    this.g.add(r)
    this.itens.push({ a, b, v0, dist, r })
  }
  /** Recalcula linhas e rótulos para a direção de visão `dir` (da câmera para a cena). */
  orienta(dir: V) {
    const pos: number[] = [], seg = (p: V, q: V) => pos.push(...p, ...q)
    for (const { a, b, v0, dist, r } of this.itens) {
      const u = unidade(soma(b, a, -1)), c = cruz(dir, u), m = meio(a, b)
      let v = Math.hypot(...c) > .2 ? unidade(c) : v0 // u quase paralelo à visão: mantém o lado original
      if (ponto(v, soma(m, this.centro, -1)) < 0) v = [-v[0], -v[1], -v[2]] // sempre para fora da peça
      const dA = soma(a, v, dist), dB = soma(b, v, dist), w = soma(u, v, TICK / (2 * Math.SQRT2)) // meio traço: (u + v) / √2 × TICK / 2
      seg(soma(a, v, EXT), soma(a, v, dist + EXT))
      seg(soma(b, v, EXT), soma(b, v, dist + EXT))
      seg(dA, dB)
      for (const p of [dA, dB]) seg(soma(p, w, -1), soma(p, w, 1))
      r.position.set(...soma(meio(dA, dB), v, 3))
    }
    if (!this.linhas) {
      this.linhas = new THREE.LineSegments(new THREE.BufferGeometry(), LINHA)
      this.linhas.renderOrder = 999
      this.linhas.frustumCulled = false
      this.g.add(this.linhas)
    }
    this.linhas.geometry.dispose()
    this.linhas.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  }
  fecha(): THREE.Group { return this.g }
}

/** Cota vertical (Z) em x = xf; a linha de cota fica `dist` mm à esquerda (−X). */
const alt = (d: Desenho, xf: number, dist: number, z0: number, z1: number, texto: string) =>
  d.cota([xf, 0, z0], [xf, 0, z1], [-1, 0, 0], dist, texto)

/** Dimensões externas de uma peça: X embaixo, Y à direita, altura à esquerda (de 0 a `h`). */
function externas(d: Desenho, k: Caixa, h: number, rotuloZ: string) {
  d.cota([k.x0, k.y0, 0], [k.x1, k.y0, 0], [0, -1, 0], OFF, mm(k.x1 - k.x0))
  d.cota([k.x1, k.y0, 0], [k.x1, k.y1, 0], [1, 0, 0], OFF, mm(k.y1 - k.y0))
  alt(d, k.x0, 2 * OFF, 0, h, rotuloZ + ' ' + mm(h))
}

/** Passo 1: bloco sobre o grid 1 × 1. A célula e o grid ficam; o pé, o ombro, a folga e o recuo vão no grupo `bloco` (sobe com a elevação). */
function sistema(o: Opcoes, fixa: Desenho, bloco: Desenho) {
  const c = celula(o), M = medidas(o), k = caixa(c, 1, 1)
  const zb = fundo(o) + o.folga_fundo // base do pé (como em main.ts)
  if (!c.hex) fixa.cota([k.x0, k.y0, 0], [k.x1, k.y0, 0], [0, -1, 0], OFF, mm(k.x1 - k.x0))
  const a = ponta(c, -1), b = ponta(c, 1), L = mm(b[1] - a[1])
  fixa.cota(a, b, [1, 0, 0], k.x1 + OFF - a[0], c.hex ? 'entre lados ' + L : L)
  alt(fixa, k.x0, 3 * OFF, 0, M.alturaGrid, 'grid ' + mm(M.alturaGrid))

  alt(bloco, k.x0 + o.recuo, 2 * OFF, zb, zb + M.hPe, `pé ${mm(M.hPe)} · chanfro ${mm(o.chanfro)} · cônico ${mm(o.conicidade)}`)
  alt(bloco, k.x0 + M.nervuraMeia, OFF, zb + M.hPe, M.alturaGrid, 'ombro ' + mm(M.assento - M.hPe))
  alt(bloco, k.x0 + o.recuo, OFF, fundo(o), zb, 'folga ' + mm(o.folga_fundo))
  bloco.cota([0, c.a[1] - o.recuo, zb], [0, c.a[1], zb], [1, 0, 0], 2, 'recuo ' + mm(o.recuo)) // planta: lado de cima
}

/** Passo 2: grid N × M (ou degrau, com a altura do degrau). */
function grade(o: Opcoes, peca: string, fixa: Desenho) {
  const c = celula(o), M = medidas(o), k = caixa(c, o.grid_linhas, o.grid_colunas)
  const degrau = peca === 'degrau'
  // mesma conta de degrau() em sistema.ts
  const H = degrau ? Math.max(o.altura_degrau, M.alturaGrid + M.assento + 1) : M.alturaGrid
  externas(fixa, k, H, degrau ? 'degrau' : 'grid')
}

/** Cotas do passo: cada chamada troca as anteriores. O grupo devolvido vai para a cena; `userData.elevavel` é o que sobe com a elevação do passo 1. */
export function cotas(passo: 1 | 2 | 3, o: Opcoes, peca: string): THREE.Group {
  limpaCotas()
  const h = passo === 3 ? o.altura : medidas(o).alturaGrid, c: V = [0, 0, h / 2] // centro aproximado da peça: as cotas saem para fora dele
  const fixa = new Desenho(c), bloco = new Desenho(c)
  desenhos = [fixa, bloco]
  ultima = null
  if (passo === 1) sistema(o, fixa, bloco)
  else if (passo === 2) grade(o, peca, fixa)
  else externas(fixa, caixa(celula(o), o.linhas, o.colunas), o.altura, 'altura')
  const raiz = new THREE.Group()
  raiz.add(fixa.fecha(), bloco.fecha())
  raiz.userData.elevavel = bloco.g
  atual = raiz
  return raiz
}

let atual: THREE.Group | null = null // última raiz de cotas
let desenhos: Desenho[] = []
let ultima: THREE.Vector3 | null = null // direção de visão do último desenho
let rotulos: CSS2DRenderer | null = null

/** Tira as cotas da cena e libera as linhas e os rótulos. */
export function limpaCotas() {
  if (!atual) return
  atual.removeFromParent()
  atual.traverse(x => {
    if (x instanceof THREE.LineSegments) x.geometry.dispose()
    if (x instanceof CSS2DObject) x.element.remove()
  })
  atual = null
}

/** Cria o renderizador de rótulos sobre a vista (mesmo tamanho, sem pegar o mouse). */
export function criaRotulos(vista: HTMLElement) {
  rotulos = new CSS2DRenderer()
  const el = rotulos.domElement
  el.style.position = 'absolute'
  el.style.top = '0'
  el.style.left = '0'
  el.style.pointerEvents = 'none'
  vista.appendChild(el)
  redimensionaRotulos(vista.clientWidth, vista.clientHeight)
}
/** Chame depois de render.render(cena, cam): desenha os rótulos da cena. */
export function renderRotulos(cena: THREE.Scene, cam: THREE.Camera) {
  if (atual) { // câmera girou mais de ~2°: refaz as cotas no plano da vista
    const d = cam.getWorldDirection(new THREE.Vector3())
    if (!ultima || ultima.dot(d) < .9994) { ultima = d; for (const x of desenhos) x.orienta([d.x, d.y, d.z]) }
  }
  rotulos?.render(cena, cam)
}
/** Chame junto com o resize da vista. */
export function redimensionaRotulos(w: number, h: number) { rotulos?.setSize(w, h) }
