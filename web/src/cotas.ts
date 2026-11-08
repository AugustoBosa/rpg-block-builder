// Cotas da vista 3D: linhas finas âmbar na cena + rótulos HTML (CSS2D). Todos os números vêm de sistema.ts (medidas, celula, contorno, centros, fundo).
import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { Opcoes } from './bloco'
import { celula, centros, contorno, fundo, medidas, type Celula } from './sistema'

// sem clippingPlanes: o corte das peças não corta as cotas
const LINHA = new THREE.LineBasicMaterial({ color: 0xffb000, depthTest: false })
const OFF = 6 // mm: cota horizontal afastada da peça
const DV = 8 // mm: primeira coluna das cotas verticais (cada coluna extra soma COL)
const COL = 7 // mm entre colunas de cotas verticais
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
const retangulo = (k: Caixa) => (i: number): [number, number][] => [[k.x0 + i, k.y0 + i], [k.x1 - i, k.y0 + i], [k.x1 - i, k.y1 - i], [k.x0 + i, k.y1 - i]]

/** Vértice mais externo em y (s = 1 topo, −1 base); empatado, o mais à direita. No hexágono, a cota sai do lado plano. */
function ponta(c: Celula, s: number): V {
  const v = contorno(c, 0), m = Math.max(...v.map(p => s * p[1]))
  const p = v.filter(q => s * q[1] > m - 1e-6).reduce((a, b) => (b[0] > a[0] ? b : a))
  return [p[0], p[1], 0]
}

const cruz = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const ponto = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
type Ret = [number, number, number, number] // retângulo de rótulo na tela (px)
const cruza = (p: Ret, q: Ret) => p[0] < q[2] + 3 && q[0] < p[2] + 3 && p[1] < q[3] + 3 && q[1] < p[3] + 3
/** `inset`: cota vertical (z) — vai para uma quina do contorno encolhido de `inset` mm. `alt`: outro lugar possível (aresta oposta) de uma cota horizontal. */
interface Extra { inset?: number; alt?: [V, V] }
interface Item extends Extra { a: V; b: V; dist: number; txt: string; r: CSS2DObject }
/** Contexto de um redesenho: direção da visão, teste de oclusão e projeção (mundo → px), e os rótulos já postos. */
interface Ctx { dir: V; oculto: (p: V) => boolean; proj: (p: V) => [number, number]; ret: Ret[]; lw: number; lh: number }

/** Guarda as cotas de um grupo e as redesenha (`orienta`) para a câmera atual:
 *  - cota sem boa leitura (medida na direção da visão) ou atrás da peça some;
 *  - a linha de cota sai no plano perpendicular à visão, para fora da peça;
 *  - altura vai para a quina que aparece no contorno (esquerda ou direita), em colunas, sem rótulos em cima de rótulos;
 *  - cota horizontal escolhe a aresta (de duas) mais visível e mais afastada do centro.
 *  `ativo = false` esconde o grupo (peça oculta). */
class Desenho {
  g = new THREE.Group()
  ativo = true
  private itens: Item[] = []
  private linhas: THREE.LineSegments | null = null
  /** `poligono(i)`: contorno da peça encolhido de i mm (quinas candidatas das cotas de altura). */
  constructor(private centro: V, private poligono: (inset: number) => [number, number][]) {}
  /** Cota linear de a até b; a linha de cota fica `dist` mm afastada, na direção que `orienta` escolhe. */
  cota(a: V, b: V, dist: number, texto: string, extra: Extra = {}) {
    const el = document.createElement('div')
    el.className = 'cota'
    el.textContent = texto
    el.style.cssText = 'font:11px sans-serif;color:#ffb000;pointer-events:none;white-space:nowrap;text-shadow:0 0 3px #000'
    const r = new CSS2DObject(el)
    this.g.add(r)
    this.itens.push({ a, b, dist, txt: texto, r, ...extra })
  }
  /** Altura (z0 a z1) numa quina do contorno encolhido de `inset` mm. */
  altura(inset: number, z0: number, z1: number, texto: string) { this.cota([0, 0, z0], [0, 0, z1], DV, texto, { inset }) }
  orienta(cx: Ctx) {
    const pos: number[] = [], seg = (p: V, q: V) => pos.push(...p, ...q)
    const off = this.g.position, mundo = (p: V): V => [p[0] + off.x, p[1] + off.y, p[2] + off.z] // o grupo do bloco sobe com a elevação
    const centroMundo = mundo(this.centro)
    for (const it of this.itens) it.r.visible = false
    type Geo = { a: V; b: V; v: V; dist: number; dA: V; dB: V; lab: V; ret: Ret }
    const geo = (it: Item, a: V, b: V, v: V, dist: number): Geo => {
      const dA = soma(a, v, dist), dB = soma(b, v, dist), lab = soma(meio(dA, dB), v, 3)
      const [x, y] = cx.proj(mundo(lab)), w = it.txt.length * 6.4 + 8
      return { a, b, v, dist, dA, dB, lab, ret: [x - w / 2, y - 8, x + w / 2, y + 8] }
    }
    const livre = (g: Geo) => g.ret[0] > 0 && g.ret[2] < cx.lw && g.ret[1] > 0 && g.ret[3] < cx.lh && !cx.ret.some(q => cruza(q, g.ret)) // dentro da vista e sem bater em outro rótulo
    const desenha = (it: Item, g: Geo) => {
      const u = unidade(soma(g.b, g.a, -1)), w = soma(u, g.v, TICK / (2 * Math.SQRT2)) // meio traço: (u + v) / √2 × TICK / 2
      seg(soma(g.a, g.v, EXT), soma(g.a, g.v, g.dist + EXT))
      seg(soma(g.b, g.v, EXT), soma(g.b, g.v, g.dist + EXT))
      seg(g.dA, g.dB)
      for (const p of [g.dA, g.dB]) seg(soma(p, w, -1), soma(p, w, 1))
      it.r.position.set(...g.lab)
      it.r.visible = true
      cx.ret.push(g.ret)
    }
    if (this.ativo) {
      // horizontais e inclinadas: a candidata livre, não escondida, mais longe do centro (na tela)
      const [cxp, cyp] = cx.proj(centroMundo)
      for (const it of this.itens.filter(i => i.inset === undefined)) {
        let melhor: Geo | null = null, nota = -Infinity
        for (const [a, b] of [[it.a, it.b], ...(it.alt ? [it.alt] : [])]) {
          const u = unidade(soma(b, a, -1)), c = cruz(cx.dir, u)
          if (Math.hypot(...c) < .25) continue // medida na direção da visão: não há como ler
          let v = unidade(c)
          if (ponto(v, soma(meio(a, b), this.centro, -1)) < 0) v = [-v[0], -v[1], -v[2]] // sempre para fora da peça
          const g = geo(it, a, b, v, it.dist)
          if (cx.oculto(mundo(meio(g.dA, g.dB)))) continue // atrás da peça
          const [mx, my] = cx.proj(mundo(meio(a, b))), s = Math.hypot(mx - cxp, my - cyp) - (livre(g) ? 0 : 1e6)
          if (s > nota) { nota = s; melhor = g }
        }
        if (melhor) desenha(it, melhor)
      }
      // alturas: menores primeiro, uma quina do contorno visível (esquerda ou direita), colunas para fora até o rótulo caber
      const carga = [0, 0]
      for (const it of this.itens.filter(i => i.inset !== undefined).sort((p, q) => Math.abs(p.b[2] - p.a[2]) - Math.abs(q.b[2] - q.a[2]))) {
        if (Math.hypot(...cruz(cx.dir, [0, 0, 1])) < .25) continue // vista de cima ou de baixo
        const zm = (it.a[2] + it.b[2]) / 2
        const q = this.poligono(it.inset!).map(([x, y]) => ({ x, y, sx: cx.proj(mundo([x, y, zm]))[0] }))
        const lados = [q.reduce((m, p) => p.sx < m.sx ? p : m), q.reduce((m, p) => p.sx > m.sx ? p : m)]
        const ordem = [0, 1].sort((i, j) => carga[i] - carga[j]) // começa pelo lado menos carregado
        const tenta = (lado: number, col: number) => {
          const p = lados[lado], vx = p.x - this.centro[0], vy = p.y - this.centro[1], l = Math.hypot(vx, vy) || 1
          return geo(it, [p.x, p.y, it.a[2]], [p.x, p.y, it.b[2]], [vx / l, vy / l, 0], it.dist + it.inset! + col * COL) // a coluna fica `DV` mm além da quina real, mesmo com a quina encolhida
        }
        let escolhida: { g: Geo; lado: number } | null = null
        for (let col = 0; col < 6 && !escolhida; col++) {
          for (const lado of ordem) {
            const g = tenta(lado, col)
            if (livre(g) && !cx.oculto(mundo(meio(g.dA, g.dB)))) { escolhida = { g, lado }; break }
          }
        }
        escolhida ??= { g: tenta(ordem[0], 0), lado: ordem[0] } // sem vaga: coluna 0, mesmo sobrepondo
        carga[escolhida.lado]++
        desenha(it, escolhida.g)
      }
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

/** Dimensões externas de uma peça: X e Y na base (cada uma pode ir para a aresta oposta) e a altura numa quina (de 0 a `h`). */
function externas(d: Desenho, k: Caixa, h: number, rotuloZ: string) {
  d.cota([k.x0, k.y0, 0], [k.x1, k.y0, 0], OFF, mm(k.x1 - k.x0), { alt: [[k.x0, k.y1, 0], [k.x1, k.y1, 0]] })
  d.cota([k.x1, k.y0, 0], [k.x1, k.y1, 0], OFF, mm(k.y1 - k.y0), { alt: [[k.x0, k.y0, 0], [k.x0, k.y1, 0]] })
  d.altura(0, 0, h, rotuloZ + ' ' + mm(h))
}

/** Passo 1: bloco sobre o grid 1 × 1. A célula e o grid ficam; o pé, o ombro, a folga e o recuo vão no grupo `bloco` (sobe com a elevação). */
function sistema(o: Opcoes, c: Celula, fixa: Desenho, bloco: Desenho) {
  const M = medidas(o), k = caixa(c, 1, 1)
  const zb = fundo(o) + o.folga_fundo // base do pé (como em main.ts)
  if (!c.hex) fixa.cota([k.x0, k.y0, 0], [k.x1, k.y0, 0], OFF, mm(k.x1 - k.x0), { alt: [[k.x0, k.y1, 0], [k.x1, k.y1, 0]] })
  const a = ponta(c, -1), b = ponta(c, 1), L = mm(b[1] - a[1])
  fixa.cota(a, b, k.x1 + OFF - a[0], c.hex ? 'entre lados ' + L : L, c.hex ? {} : { alt: [[k.x0, a[1], 0], [k.x0, b[1], 0]] })
  fixa.altura(0, 0, M.alturaGrid, 'grid ' + mm(M.alturaGrid))

  bloco.altura(o.recuo, zb, zb + M.hPe, `pé ${mm(M.hPe)}` + (o.conicidade > 0 ? ` · cônico ${mm(o.conicidade)}` : ''))
  bloco.altura(M.nervuraMeia, zb + M.hPe, M.alturaGrid, 'ombro ' + mm(M.assento - M.hPe))
  bloco.altura(o.recuo, fundo(o), zb, 'folga ' + mm(o.folga_fundo))
  if (o.chanfro > 0) bloco.altura(o.recuo, zb, zb + o.chanfro, `chanfro ${mm(o.chanfro)}`)
  bloco.cota([0, c.a[1] - o.recuo, zb], [0, c.a[1], zb], 2, 'recuo ' + mm(o.recuo)) // planta: lado de cima
}

/** Passo 2: grid N × M (ou degrau, com a altura do degrau). */
function grade(o: Opcoes, peca: string, fixa: Desenho, k: Caixa) {
  const M = medidas(o), degrau = peca === 'degrau'
  // mesma conta de degrau() em sistema.ts
  const H = degrau ? Math.max(o.altura_degrau, M.alturaGrid + M.assento + 1) : M.alturaGrid
  externas(fixa, k, H, degrau ? 'degrau' : 'grid')
}

/** Cotas do passo: cada chamada troca as anteriores. O grupo devolvido vai para a cena; `userData.elevavel` é o que sobe com a elevação do passo 1. */
export function cotas(passo: 1 | 2 | 3, o: Opcoes, peca: string, mostrar = 'ambos'): THREE.Group {
  limpaCotas()
  const h = passo === 3 ? o.altura : medidas(o).alturaGrid, c: V = [0, 0, h / 2] // centro aproximado da peça: as cotas saem para fora dele
  const cel = celula(o), k = passo === 1 ? caixa(cel, 1, 1) : passo === 2 ? caixa(cel, o.grid_linhas, o.grid_colunas) : caixa(cel, o.linhas, o.colunas)
  const poli = passo === 1 ? (i: number) => contorno(cel, i) : retangulo(k)
  const fixa = new Desenho(c, poli), bloco = new Desenho(c, poli)
  desenhos = [fixa, bloco]
  ultima = null
  if (passo === 1) { // no passo 1 a fixa é do grid e a outra é do bloco; peça oculta, cotas ocultas
    fixa.ativo = mostrar !== 'bloco'
    bloco.ativo = mostrar !== 'grid'
    sistema(o, cel, fixa, bloco)
  } else if (passo === 2) grade(o, peca, fixa, k)
  else externas(fixa, k, o.altura, 'altura')
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
let lw = 1, lh = 1 // tamanho da vista (px), para projetar pontos na tela

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

/** Faz as cotas se refazerem no próximo quadro (corte, elevação ou peça visível mudaram). */
export function reorienta() { ultima = null }

const raio = new THREE.Raycaster(), alvo = new THREE.Vector3(), tmp = new THREE.Vector3()
/** Chame depois de render.render(cena, cam): desenha os rótulos da cena. `oclusores` dá as peças que escondem cotas. */
export function renderRotulos(cena: THREE.Scene, cam: THREE.Camera, oclusores: () => THREE.Mesh[]) {
  if (atual) { // câmera girou mais de ~2°: refaz as cotas no plano da vista
    const d = cam.getWorldDirection(new THREE.Vector3())
    if (!ultima || ultima.dot(d) < .9994) {
      ultima = d
      const ocl = oclusores()
      const oculto = (p: V) => { // há superfície da peça (fora do corte) entre a câmera e o ponto?
        alvo.set(...p).sub(cam.position)
        const L = alvo.length()
        raio.set(cam.position, alvo.normalize())
        raio.far = L - .5
        return raio.intersectObjects(ocl, false).some(h => !((h.object as THREE.Mesh).material as THREE.Material).clippingPlanes?.some(q => q.distanceToPoint(h.point) < 0))
      }
      const proj = (p: V): [number, number] => { tmp.set(...p).project(cam); return [(tmp.x + 1) / 2 * lw, (1 - tmp.y) / 2 * lh] }
      const cx: Ctx = { dir: [d.x, d.y, d.z], oculto, proj, ret: [], lw, lh }
      for (const x of desenhos) x.orienta(cx)
    }
  }
  rotulos?.render(cena, cam)
}
/** Chame junto com o resize da vista. */
export function redimensionaRotulos(w: number, h: number) { lw = w || 1; lh = h || 1; rotulos?.setSize(w, h) }
