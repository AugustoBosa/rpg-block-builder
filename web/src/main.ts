import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { final, GUIAS, padrao, piso, PISO, stl, type Malha, type Opcoes } from './bloco'
import { PEDRA } from './pedra'
import { alturaGrid, assento, avisos, corpo, degrau, ENCAIXES, FORMATOS, fundo, grid, malha, SISTEMA } from './sistema'

// nada é salvo: cada abertura começa do padrão
const o: Opcoes = padrao()
const PREVIA = .5 // mm: malha da prévia do piso
let passo = 1
const $ = (id: string) => document.getElementById(id)!

// cena (z para cima, como no fatiador)
const vista = $('vista')
const render = new THREE.WebGLRenderer({ antialias: true })
render.localClippingEnabled = true
render.setPixelRatio(Math.min(devicePixelRatio, 2)) // tela de celular: nítido sem pesar
vista.appendChild(render.domElement)
const cena = new THREE.Scene()
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
const corte = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)] // passo 1: corte em y = 0 mostra o pé dentro do furo
// cada peça: face de fora iluminada + face de dentro chapada (no corte, a de dentro aparece como a seção cheia)
const pecas = [0xb8b4ac, 0x6f8fa8].map(cor => {
  const g = new THREE.BufferGeometry(), m = new THREE.Group()
  m.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: cor, roughness: .9 })))
  m.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(.55), side: THREE.BackSide })))
  return m
})
cena.add(...pecas)
function tamanho() {
  render.setSize(vista.clientWidth, vista.clientHeight)
  cam.aspect = vista.clientWidth / vista.clientHeight
  cam.updateProjectionMatrix()
}
addEventListener('resize', tamanho)
tamanho()
render.setAnimationLoop(() => { ctl.update(); render.render(cena, cam) })

function mostra(i: number, m: Malha | null, z = 0) {
  const g = new THREE.BufferGeometry()
  if (m) {
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3))
    g.setIndex(new THREE.BufferAttribute(m.idx, 1))
    g.computeVertexNormals()
  }
  for (const k of pecas[i].children as THREE.Mesh[]) {
    k.geometry.dispose()
    k.geometry = g
    ;(k.material as THREE.Material).clippingPlanes = passo === 1 ? corte : []
  }
  pecas[i].position.z = z
}

let enquadrar = true // só ao trocar de passo ou de peça; mexer num slider não move a câmera
function enquadra() {
  const g = (pecas[0].children[0] as THREE.Mesh).geometry
  g.computeBoundingSphere()
  const { center: c, radius: r } = g.boundingSphere!
  const dir = passo === 1 ? new THREE.Vector3(.25, -1, .3) : new THREE.Vector3(.6, -.8, .8)
  ctl.target.set(c.x, c.y, c.z + pecas[0].position.z * .5)
  cam.position.copy(ctl.target).addScaledVector(dir.normalize(), r * 3.2)
  enquadrar = false
}

let pendente: ReturnType<typeof setTimeout>
function previa() {
  clearTimeout(pendente)
  pendente = setTimeout(() => {
    if (passo === 1) { // bloco liso assentado num grid 1 × 1, cortado ao meio
      mostra(0, malha(corpo(o, o.altura)), fundo(o) + o.folga_fundo)
      mostra(1, malha(grid(o, 1, 1)))
      $('aviso').textContent = avisos(o).join(' ')
      $('resumo').textContent = `Grid: ${alturaGrid(o).toFixed(1)} mm de altura. O bloco apoia na nervura a ${assento(o).toFixed(1)} mm do fundo do pé.`
    } else {
      const p = ($('peca') as HTMLSelectElement).value
      mostra(0, p === 'piso' ? piso({ ...o, resolucao: PREVIA }) : p === 'grid' ? malha(grid(o, o.linhas, o.colunas)) : malha(degrau(o, o.linhas, o.colunas, o.altura_degrau)))
      mostra(1, null)
    }
    if (enquadrar) enquadra()
  }, 60)
}

// controles: um slider + caixa numérica por opção
function controle(pai: HTMLElement, rotulo: string, ini: number, min: number, max: number, muda: (v: number) => void) {
  const l = document.createElement('label'), num = document.createElement('input'), sl = document.createElement('input')
  l.append(rotulo, num, sl)
  for (const e of [num, sl]) Object.assign(e, { type: e === sl ? 'range' : 'number', min, max, step: max - min > 100 ? 1 : (max - min) / 200, value: ini })
  const ao = (e: HTMLInputElement) => () => { const v = +e.value; num.value = sl.value = String(v); muda(v); previa() }
  num.oninput = ao(num); sl.oninput = ao(sl)
  pai.append(l)
}
const grupo = (pai: HTMLElement, tab: Record<string, readonly [number, number, number, string]>, alvo: any, pular: string[] = []) => {
  for (const [k, [, min, max, rot]] of Object.entries(tab))
    if (!pular.includes(k)) controle(pai, rot, alvo[k], min, max, v => { alvo[k] = v })
}
const opcoes = (sel: HTMLSelectElement, itens: [string, string][]) => sel.append(...itens.map(([v, t]) => new Option(t, v)))

// passo 1: sistema (remonta ao trocar formato ou encaixe, porque rótulos e valores mudam)
function montaSistema() {
  const s = $('sistema')
  s.replaceChildren()
  const hex = o.formato === 'hexagono'
  if (hex) controle(s, 'Entre lados (mm)', o.largura, SISTEMA.largura[1], SISTEMA.largura[2], v => { o.largura = v })
  grupo(s, SISTEMA, o, [...(hex ? ['largura'] : []), ...(o.formato === 'retangulo' ? [] : ['comprimento'])])
  previa()
}
const formato = $('formato') as HTMLSelectElement, encaixe = $('encaixe') as HTMLSelectElement
opcoes(formato, Object.entries(FORMATOS))
opcoes(encaixe, Object.entries(ENCAIXES).map(([k, [t]]) => [k, t]))
formato.onchange = () => { o.formato = formato.value as Opcoes['formato']; montaSistema() }
encaixe.onchange = () => { Object.assign(o, ENCAIXES[encaixe.value as keyof typeof ENCAIXES][1]); montaSistema() }

// passo 2: peças dentro do sistema
grupo($('gerais'), PISO, o, ['resolucao'])
grupo($('pedra'), PEDRA, o.pedra)
grupo($('op-guias'), GUIAS, o)
const peca = $('peca') as HTMLSelectElement
peca.onchange = () => { $('op-piso').hidden = peca.value !== 'piso'; $('op-guias').hidden = peca.value === 'piso'; enquadrar = true; previa() }

function vaiPara(n: number) {
  passo = n
  $('passo1').hidden = n !== 1; $('passo2').hidden = n !== 2
  $('ir1').classList.toggle('ativo', n === 1); $('ir2').classList.toggle('ativo', n === 2)
  enquadrar = true
  previa()
}
$('ir1').onclick = () => vaiPara(1)
$('ir2').onclick = () => vaiPara(2)

const estado = $('estado')
$('baixar').onclick = () => {
  estado.textContent = 'Gerando a malha final (alguns segundos)...'
  setTimeout(async () => { // ponytail: roda na thread principal (a tela trava ~2 s no piso); passar para Web Worker se incomodar
    const t = performance.now(), p = peca.value, f = FORMATOS[o.formato]
    const m = p === 'piso' ? await final(piso(o)) : p === 'grid' ? malha(grid(o, o.linhas, o.colunas)) : malha(degrau(o, o.linhas, o.colunas, o.altura_degrau))
    const nome = p === 'piso' ? `Piso Pedra ${f} s${o.semente}` : `${p === 'grid' ? 'Grid' : 'Degrau'} ${f} ${o.linhas}x${o.colunas}`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([stl(m)], { type: 'model/stl' }))
    a.download = nome + '.stl'
    a.click()
    estado.textContent = `${m.idx.length / 3} triângulos em ${((performance.now() - t) / 1000).toFixed(1)} s`
  }, 30)
}
montaSistema()
vaiPara(1)
