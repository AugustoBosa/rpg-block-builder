import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Malha } from './bloco'
import { criaRotulos, MARGEM, redimensionaRotulos, renderRotulos, reorienta } from './cotas'
import { EIXO } from './esquema'

// cena da prévia (z para cima, como no fatiador): renderer, câmera, luzes, gizmo e as duas peças
export type Modo = 'solido' | 'inclinacao' | 'normais' | 'matcap'
export const MODOS: [Modo, string][] = [['solido', 'Sólido'], ['inclinacao', 'Inclinação'], ['normais', 'Normais'], ['matcap', 'Matcap']]
export interface Corte { ativo: boolean; eixo: 'x' | 'y' | 'z'; pos: number; inverte: boolean }
// estado da vista: um corte por passo; passo 1 começa cortado em y = 0 (mostra o pé dentro do furo)
export const config = {
  passo: 1,
  modo: 'solido' as Modo,
  elevacao: 0, // mm, só passo 1: sobe o bloco em relação ao grid
  mostrar: 'ambos' as 'ambos' | 'bloco' | 'grid', // só passo 1: quais peças aparecem
  transp: 0, // transparência das peças em qualquer modo: 0 = opaco, 1 = invisível (só overlays)
  arestas: false, // overlay (vale em qualquer modo, como no Blender): arestas vivas da malha
  vertices: false, // overlay: vértices da malha
  planoCorte: true, // mostra o plano do corte, na cor do eixo
  corte: {
    1: { ativo: true, eixo: 'y', pos: 0, inverte: false },
    2: { ativo: false, eixo: 'y', pos: 0, inverte: false },
    3: { ativo: false, eixo: 'y', pos: 0, inverte: false },
  } as Record<number, Corte>,
}

const TRI_MAX_ARESTAS = 300_000 // acima disso as arestas pesam demais no navegador
const COR = [0xb8b4ac, 0x6f8fa8] // peça 0: bloco ou piso; peça 1: grid
const CINZA = new THREE.Color(0xd0d4d8), VERDE = new THREE.Color(0x3fa34d), AMARELO = new THREE.Color(0xf0dc4a)
const LARANJA = new THREE.Color(0xf08a24), VERMELHO = new THREE.Color(0xd83a3a)

const vista = document.getElementById('vista')!
const render = new THREE.WebGLRenderer({ antialias: true })
render.localClippingEnabled = true
render.autoClear = false // o gizmo desenha por cima da cena
render.setPixelRatio(Math.min(devicePixelRatio, 2)) // tela de celular: nítido sem pesar
vista.appendChild(render.domElement)
criaRotulos(vista)
export const cena = new THREE.Scene()
cena.background = new THREE.Color(0x1d1f22)
const cam = new THREE.PerspectiveCamera(35, 1, 1, 3000)
cam.up.set(0, 0, 1)
cam.position.set(70, -90, 90)
const ctl = new OrbitControls(cam, render.domElement)
ctl.target.set(0, 0, 10)
cena.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2))
const sol = new THREE.DirectionalLight(0xffffff, 2)
sol.position.set(-40, -60, 120)
cena.add(sol)

// gizmo de orientação: a versão 0.187 fixa 128 px e canto inferior direito (não há placement nem tamanho).
// O clique é nosso (o do ViewHelper supõe y para cima): a esfera de um eixo leva a câmera para aquele lado, girando em volta do alvo.
const gizmo = new ViewHelper(cam, render.domElement)
gizmo.setLabels('X', 'Y', 'Z')
const EIXOS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...(a as [number, number, number])))
let anim: { d0: THREE.Vector3; q: THREE.Quaternion; dist: number; t0: number } | null = null
let apertou: [number, number] | null = null
render.domElement.addEventListener('pointerdown', e => { apertou = [e.clientX, e.clientY]; anim = null })
render.domElement.addEventListener('click', e => {
  if (!apertou || Math.hypot(e.clientX - apertou[0], e.clientY - apertou[1]) > 4) return // arrastar não conta como clique
  const r = render.domElement.getBoundingClientRect(), dx = e.clientX - (r.right - 64), dy = e.clientY - (r.bottom - 64)
  if (Math.abs(dx) > 64 || Math.abs(dy) > 64) return
  cam.updateMatrixWorld()
  const dir = (i: number) => new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, i) // direita, cima, para o observador
  const dr = dir(0), dc = dir(1), dv = dir(2)
  let alvo: THREE.Vector3 | null = null, prof = -Infinity
  for (const a of EIXOS) { // 32 px por unidade no gizmo; vence a esfera mais perto do observador
    if (Math.hypot(a.dot(dr) * 32 - dx, -a.dot(dc) * 32 - dy) < 14 && a.dot(dv) > prof) { alvo = a; prof = a.dot(dv) }
  }
  if (!alvo) return
  const d0 = cam.position.clone().sub(ctl.target), dist = d0.length()
  const d1 = alvo.clone()
  if (d1.z) d1.y -= .001 // vista de cima/baixo exata não tem "para cima": o leve desvio põe +y no alto da tela
  anim = { d0: d0.normalize(), q: new THREE.Quaternion().setFromUnitVectors(d0, d1.normalize()), dist, t0: performance.now() }
})
function anima() {
  if (!anim) return
  const t = Math.min(1, (performance.now() - anim.t0) / 300)
  const q = new THREE.Quaternion().slerp(anim.q, t * t * (3 - 2 * t))
  cam.position.copy(ctl.target).addScaledVector(anim.d0.clone().applyQuaternion(q), anim.dist)
  if (t >= 1) anim = null
}

// vista 2D mais próxima da câmera (eixo que ela mais olha): o painel de esquemas mostra só essa
export type Ver = 'planta' | 'frontal' | 'lateral'
const VERES: Ver[] = ['lateral', 'frontal', 'planta'] // olhando ao longo de x, y, z
let ver: Ver | null = null, aoVer: (v: Ver) => void = () => {}
export const aoMudarVer = (f: (v: Ver) => void) => { aoVer = f }
const dv = new THREE.Vector3()
function veMaisPerto() {
  cam.getWorldDirection(dv)
  const a = [Math.abs(dv.x), Math.abs(dv.y), Math.abs(dv.z)], i = [1, 2, 0].reduce((m, e) => a[e] > a[m] + .03 ? e : m, 1) // quase empate (isométrica): a frontal
  if (VERES[i] !== ver && (!ver || a[i] > a[VERES.indexOf(ver)] * 1.1)) { ver = VERES[i]; aoVer(ver) } // 10 % de folga: não pisca na divisa
}

// legenda e aviso sobre a vista (só aparecem em certos modos)
const info = document.createElement('div')
info.style.cssText = 'position:absolute;left:8px;bottom:8px;max-width:260px;font-size:12px;color:#ddd;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:4px;pointer-events:none;display:none'
vista.appendChild(info)
const LEGENDA = [['#d0d4d8', 'topo plano (0°)'], ['linear-gradient(90deg,#3fa34d,#f0dc4a)', '0–45°'], ['#f08a24', '45–90° (parede)'], ['#d83a3a', 'normal para baixo']]
  .map(([c, t]) => `<div><span style="display:inline-block;width:14px;height:10px;background:${c};margin-right:6px;vertical-align:middle"></span>${t}</div>`).join('')

// malha como veio (indexada, com normais) e, por cima, a face de fora no modo escolhido
const base = [new THREE.BufferGeometry(), new THREE.BufferGeometry()]
const zBase = [0, 0]
const deslocamento = (i: number) => i === 1 ? { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } : {} // grid: recuado no buffer de profundidade (ombro coplanar com o topo)
// cada peça: face de fora (modo escolhido) + face de dentro chapada (no corte, aparece como a seção cheia)
const pecas = COR.map((cor, i) => {
  const m = new THREE.Group()
  m.add(new THREE.Mesh(base[i], novoMaterial(i, 'solido')))
  m.add(new THREE.Mesh(base[i], new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(.55), side: THREE.BackSide, ...deslocamento(i) })))
  cena.add(m)
  return m
})

let matcap: THREE.CanvasTexture | null = null
function texturaMatcap() { // luz clara no alto-esquerda, argila bege, sombra no canto
  if (!matcap) {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 256
    const x = cv.getContext('2d')!, g = x.createRadialGradient(90, 90, 10, 128, 128, 170)
    g.addColorStop(0, '#fff8ec'); g.addColorStop(.45, '#c9b28c'); g.addColorStop(1, '#2a2118')
    x.fillStyle = g
    x.fillRect(0, 0, 256, 256)
    matcap = new THREE.CanvasTexture(cv)
    matcap.colorSpace = THREE.SRGBColorSpace
  }
  return matcap
}
function novoMaterial(i: number, modo: Modo): THREE.Material {
  const d = deslocamento(i)
  if (modo === 'matcap') return new THREE.MeshMatcapMaterial({ matcap: texturaMatcap(), ...d })
  if (modo === 'inclinacao' || modo === 'normais') return new THREE.MeshBasicMaterial({ vertexColors: true, ...d })
  return new THREE.MeshStandardMaterial({ color: COR[i], roughness: .9, ...d })
}
// cor por inclinação da normal com +Z: plano cinza, 0–45° verde→amarelo, 45–90° laranja, para baixo vermelho
function corInclinacao(n: THREE.Vector3, out: THREE.Color) {
  if (n.z < -1e-3) return out.copy(VERMELHO)
  const ang = Math.acos(Math.min(1, n.z)) * 180 / Math.PI
  if (ang < 1) out.copy(CINZA)
  else if (ang <= 45) out.lerpColors(VERDE, AMARELO, ang / 45)
  else out.copy(LARANJA)
}
// geometria da face de fora: só inclinação e normais precisam de cor por face (não indexada)
function derivada(g: THREE.BufferGeometry, modo: Modo): THREE.BufferGeometry {
  if (!g.getAttribute('position')) return g
  // peças de encaixe (poucos triângulos): normais com vinco de 30°, para faces planas não sombrearem como pirâmide;
  // o piso de Pedra (terreno) fica suave
  if (modo !== 'inclinacao' && modo !== 'normais') return (g.index?.count ?? 0) / 3 <= 30000 ? toCreasedNormals(g, Math.PI / 6) : g
  const ni = g.toNonIndexed(), pos = ni.getAttribute('position'), cor = new Float32Array(pos.count * 3)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), k = new THREE.Color()
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2)
    n.subVectors(b, a).cross(c.sub(a))
    n.lengthSq() ? n.normalize() : n.set(0, 0, 1)
    if (modo === 'normais') k.setRGB(n.x * .5 + .5, n.y * .5 + .5, n.z * .5 + .5, THREE.SRGBColorSpace)
    else corInclinacao(n, k)
    for (let j = 0; j < 3; j++) k.toArray(cor, (t + j) * 3)
  }
  ni.setAttribute('color', new THREE.BufferAttribute(cor, 3))
  return ni
}
// refaz a face de fora (material, geometria e arestas) de uma peça
function refaz(i: number) {
  const p = pecas[i], fora = p.children[0] as THREE.Mesh
  const antiga = fora.geometry
  fora.geometry = derivada(base[i], config.modo)
  if (antiga !== base[i]) antiga.dispose()
  ;(fora.material as THREE.Material).dispose()
  fora.material = novoMaterial(i, config.modo)
  for (const nome of ['arestas', 'vertices']) { // overlays (arestas e vértices) valem em qualquer modo
    const velha = p.getObjectByName(nome) as THREE.LineSegments | THREE.Points | undefined
    if (velha) { if (nome === 'arestas') velha.geometry.dispose(); (velha.material as THREE.Material).dispose(); p.remove(velha) } // os vértices usam a geometria da peça
  }
  const tri = (base[i].index?.count ?? 0) / 3
  if (tri > 0 && tri <= TRI_MAX_ARESTAS) {
    if (config.arestas) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(base[i], 20), new THREE.LineBasicMaterial({ color: 0x15171a }))
      l.name = 'arestas'
      p.add(l)
    }
    if (config.vertices) {
      const v = new THREE.Points(base[i], new THREE.PointsMaterial({ color: 0xffa31a, size: 4, sizeAttenuation: false })) // usa a posição da malha (sem copiar)
      v.name = 'vertices'
      p.add(v)
    }
  }
  aplicaTransp()
}
const ESCURO = new THREE.Color(0x15171a), CLARO = new THREE.Color(0xd8dde3)
/** Transparência das faces (de fora e de dentro) em qualquer modo; as arestas clareiam com ela para aparecerem no fundo escuro. */
function aplicaTransp() {
  const t = config.transp
  for (const p of pecas) for (const k of p.children) {
    if (k.name === 'vertices') continue
    if (k.name === 'arestas') { ((k as THREE.LineSegments).material as THREE.LineBasicMaterial).color.copy(ESCURO).lerp(CLARO, t); continue }
    const m = (k as THREE.Mesh).material as THREE.Material
    if (m.transparent !== t > 0) m.needsUpdate = true
    m.transparent = t > 0; m.opacity = 1 - t; m.depthWrite = t === 0
  }
}
/** Liga ou desliga arestas e vértices, sem trocar o modo. */
export function setOverlays() {
  for (let i = 0; i < pecas.length; i++) refaz(i)
  aplicaCorte()
  atualizaInfo()
}
export function setTransp(v: number) { config.transp = v; aplicaTransp() }
// bloco sobe com a elevação só no passo 1
const sobe = (i: number) => zBase[i] + (i === 0 && config.passo === 1 ? config.elevacao : 0)

function atualizaInfo() {
  const grande = base.some(g => (g.index?.count ?? 0) / 3 > TRI_MAX_ARESTAS)
  const html = config.modo === 'inclinacao' ? LEGENDA : (config.arestas || config.vertices) && grande ? 'malha grande demais para arestas e vértices' : ''
  info.innerHTML = html
  info.style.display = html ? 'block' : 'none'
}

// plano do corte do passo atual; inverter = negar normal e constante
function planoDe(c: Corte) {
  const p = new THREE.Plane(new THREE.Vector3(c.eixo === 'x' ? 1 : 0, c.eixo === 'y' ? 1 : 0, c.eixo === 'z' ? 1 : 0), -c.pos)
  return c.inverte ? p.negate() : p
}
/** Aplica o corte do passo atual às duas faces e às arestas das duas peças. Só mexe no plano. */
export function aplicaCorte() {
  const c = config.corte[config.passo]
  const planos = c.ativo ? [planoDe(c)] : []
  for (const p of pecas) for (const k of p.children) {
    const m = (k as THREE.Mesh).material as THREE.Material
    if ((m.clippingPlanes?.length ?? 0) !== planos.length) m.needsUpdate = true // número de planos mudou: recompila o shader
    m.clippingPlanes = planos
  }
  atualizaPlano()
  reorienta() // as cotas atrás da parte cortada voltam a aparecer
}

// plano do corte: quadro translúcido com borda, na cor do eixo (como no gizmo e nos esquemas), do tamanho das peças visíveis
const planoCor = new THREE.MeshBasicMaterial({ transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false })
const planoBorda = new THREE.LineBasicMaterial({})
const plano = new THREE.Group()
plano.add(new THREE.Mesh(new THREE.BufferGeometry(), planoCor), new THREE.LineLoop(new THREE.BufferGeometry(), planoBorda))
plano.visible = false
cena.add(plano)
const caixaTmp = new THREE.Box3(), caixaPeca = new THREE.Box3()
function atualizaPlano() {
  const c = config.corte[config.passo]
  caixaTmp.makeEmpty()
  pecas.forEach((p, i) => {
    if (!p.visible || !base[i].getAttribute('position')) return
    base[i].computeBoundingBox()
    caixaTmp.union(caixaPeca.copy(base[i].boundingBox!).translate(p.position))
  })
  plano.visible = c.ativo && config.planoCorte && !caixaTmp.isEmpty()
  if (!plano.visible) return
  const m = 4, ax = { x: 0, y: 1, z: 2 }[c.eixo], [u, v] = [0, 1, 2].filter(e => e !== ax) // eixos do plano; ax = normal
  const lo = caixaTmp.min.toArray(), hi = caixaTmp.max.toArray()
  const q = [[lo[u] - m, lo[v] - m], [hi[u] + m, lo[v] - m], [hi[u] + m, hi[v] + m], [lo[u] - m, hi[v] + m]]
    .map(([a, b]) => { const r = [0, 0, 0]; r[ax] = c.pos; r[u] = a; r[v] = b; return r })
  const pos = new THREE.Float32BufferAttribute(q.flat(), 3)
  const [fill, borda] = plano.children as [THREE.Mesh, THREE.LineLoop]
  fill.geometry.dispose(); borda.geometry.dispose()
  fill.geometry = new THREE.BufferGeometry().setAttribute('position', pos).setIndex([0, 1, 2, 0, 2, 3])
  borda.geometry = new THREE.BufferGeometry().setAttribute('position', pos)
  planoCor.color.set(EIXO[c.eixo]); planoBorda.color.set(EIXO[c.eixo])
}

/** Põe a malha na peça i (z = base do encaixe; a elevação do passo 1 é somada). Sem malha: esvazia. */
export function mostra(i: number, m: Malha | null, z = 0) {
  const g = new THREE.BufferGeometry()
  if (m) {
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3))
    g.setIndex(new THREE.BufferAttribute(m.idx, 1))
    g.computeVertexNormals()
  }
  const velha = base[i]
  base[i] = g
  ;(pecas[i].children[1] as THREE.Mesh).geometry = g
  zBase[i] = z
  refaz(i)
  velha.dispose()
  pecas[i].position.z = sobe(i)
  aplicaCorte()
  aplicaVisivel()
  atualizaInfo()
}
/** Passo 1: mostra só o bloco, só o grid ou os dois. Nos outros passos as duas peças ficam visíveis. */
export function aplicaVisivel() {
  const m = config.passo === 1 ? config.mostrar : 'ambos'
  pecas[0].visible = m !== 'grid'
  pecas[1].visible = m !== 'bloco'
  atualizaPlano()
  reorienta()
}
/** Só move o bloco pela elevação (sem reconstruir malha). */
export function eleva() {
  pecas[0].position.z = sobe(0)
  const raiz = cena.children.find(c => c.userData.elevavel) // raiz das cotas (cotas.ts), se existir
  if (raiz) raiz.userData.elevavel.position.z = config.elevacao
  atualizaPlano()
  reorienta()
}

// peças visíveis que escondem cotas; malha grande usa a caixa envolvente (raio contra 200 mil triângulos pesaria)
const caixaProxy = pecas.map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })))
function oclusores(): THREE.Mesh[] {
  const r: THREE.Mesh[] = []
  pecas.forEach((p, i) => {
    if (!p.visible || !base[i].getAttribute('position')) return
    if ((base[i].index?.count ?? 0) / 3 <= 30000) { r.push(p.children[0] as THREE.Mesh); return }
    base[i].computeBoundingBox()
    const b = base[i].boundingBox!, m = caixaProxy[i]
    b.getCenter(m.position).add(p.position)
    b.getSize(m.scale)
    m.updateMatrixWorld(true)
    r.push(m)
  })
  return r
}

/** Troca o modo de vista das duas peças. Só regenera geometria e material da face de fora. */
export function setModo(m: Modo) {
  config.modo = m
  for (let i = 0; i < pecas.length; i++) refaz(i)
  aplicaCorte()
  atualizaInfo()
}

/** Câmera olhando a peça na pose isométrica (tecla Home). `comCotas`: soma MARGEM mm ao raio (cotas ligadas). */
export function enquadra(comCotas = false) {
  caixaTmp.makeEmpty() // caixa das peças visíveis, já com a elevação (position.z) e o grid
  pecas.forEach((p, i) => {
    if (!p.visible || !base[i].getAttribute('position')) return
    base[i].computeBoundingBox()
    caixaTmp.union(caixaPeca.copy(base[i].boundingBox!).translate(p.position))
  })
  const c = caixaTmp.getCenter(new THREE.Vector3()), r = caixaTmp.getSize(new THREE.Vector3()).length() / 2
  anim = null
  ctl.target.copy(c)
  const meia = THREE.MathUtils.degToRad(cam.fov / 2), f = Math.min(meia, Math.atan(Math.tan(meia) * cam.aspect)) // a menor meia-abertura (vertical ou horizontal)
  cam.position.copy(ctl.target).addScaledVector(new THREE.Vector3(1, -1, 1).normalize(), (r * (comCotas ? 1.3 : 1.6) + (comCotas ? MARGEM : 0)) / Math.sin(f)) // 1,6: sobra como antes (1,3 com cotas); margem das cotas em mm
}

/** Teto da densidade de pixels da vista (1, 1,5 ou 2): só a tela; menos pixels = menos GPU. */
export function setPixelRatioMax(max: number) { render.setPixelRatio(Math.min(devicePixelRatio, max)); tamanho() }
function tamanho() {
  render.setSize(vista.clientWidth, vista.clientHeight)
  cam.aspect = vista.clientWidth / vista.clientHeight
  cam.updateProjectionMatrix()
  redimensionaRotulos(vista.clientWidth, vista.clientHeight)
}
new ResizeObserver(tamanho).observe(vista) // também reage a painel recolhido, não só à janela
tamanho()
render.setAnimationLoop(() => {
  anima()
  ctl.update()
  veMaisPerto()
  render.clear()
  render.render(cena, cam)
  renderRotulos(cena, cam, oclusores)
  gizmo.render(render)
})

// tracejado das aberturas que caem fora da parede (uma polilinha xyz por trecho contínuo, em mm); fica por cima de tudo
const tracejado = new THREE.Group()
tracejado.renderOrder = 10
const matTr = new THREE.LineDashedMaterial({ color: 0xffa31a, dashSize: 1.5, gapSize: 1, depthTest: false })
cena.add(tracejado)
export function mostraTracejado(linhas: number[][]) {
  for (const k of tracejado.children) (k as THREE.Line).geometry.dispose()
  tracejado.clear()
  for (const pts of linhas) {
    const l = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), matTr)
    l.computeLineDistances(); l.renderOrder = 10; tracejado.add(l)
  }
}
