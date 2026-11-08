import { final, GUIAS, padrao, piso, PISO, SECAO_GUIAS, SECAO_PISO, stl, type Opcoes } from './bloco'
import { PEDRA, SECAO_PEDRA } from './pedra'
import { alturaGrid, assento, avisos, corpo, degrau, ENCAIXES, FORMATOS, fundo, grid, malha, SECAO, SISTEMA } from './sistema'
import { cotas, limpaCotas } from './cotas'
import { EIXO, esquema } from './esquema'
import { esfera } from './esferas'
import { aoMudarVer, aplicaCorte, aplicaVisivel, cena, config, type Corte, enquadra, eleva, MODOS, mostra, type Modo, setModo, setOverlays, setTransp, type Ver } from './vista'

// nada é salvo: cada abertura começa do padrão
const o: Opcoes = padrao()
const PREVIA = .5 // mm: malha da prévia do piso
let enquadrar = true // só ao trocar de passo ou de peça; mexer num slider não move a câmera
let ver: Ver = 'frontal' // vista 2D do painel de esquemas: a mais próxima da câmera (ver vista.ts)
const $ = (id: string) => document.getElementById(id)!

let pendente: ReturnType<typeof setTimeout>
function previa() {
  clearTimeout(pendente)
  pendente = setTimeout(() => {
    if (config.passo === 1) { // bloco liso assentado num grid 1 × 1, cortado ao meio (a elevação é somada pela vista)
      mostra(0, malha(corpo(o, o.altura)), fundo(o) + o.folga_fundo)
      mostra(1, malha(grid(o, 1, 1)))
      $('aviso').textContent = avisos(o).join(' ')
    } else {
      mostra(0, peca() === 'piso' ? piso({ ...o, resolucao: PREVIA }) : gera(peca()))
      mostra(1, null)
    }
    atualizaCotas()
    redesenhaEsquema()
    if (enquadrar) { enquadra(); enquadrar = false }
  }, 60)
}
// painel de esquemas: isométrica com os planos + a vista 2D mais próxima da câmera; "Mostrar tudo" abre todas
function redesenhaEsquema() {
  if (config.passo === 3) return
  $('dirc').innerHTML = esquema(o, config.passo, sel3.value, config.mostrar, ver)
  const dir = $('dir'), mini = $('dirc').querySelector<HTMLElement>('.thumbs')
  if (mini && esquemas.open && dir.scrollHeight > dir.clientHeight) mini.hidden = true // as miniaturas só entram se sobrar espaço
}
aoMudarVer(v => { ver = v; redesenhaEsquema() })
const tudo = $('tudo') as HTMLDialogElement
$('verTudo').onclick = () => { $('tudoc').innerHTML = esquema(o, config.passo, sel3.value, config.mostrar, 'tudo'); tudo.showModal() }
$('fechaTudo').onclick = () => tudo.close()
tudo.onclick = e => { if (e.target === tudo) tudo.close() } // clique fora da caixa

// cotas 3D: um estado só (vale para as três abas); refaz só as linhas, não as malhas
let mostrarCotas = false
function atualizaCotas() {
  limpaCotas()
  if (!mostrarCotas) return
  const raiz = cotas(config.passo as 1 | 2 | 3, o, peca(), config.mostrar)
  raiz.userData.elevavel.position.z = config.passo === 1 ? config.elevacao : 0 // o pé, ombro e folga sobem com o bloco
  cena.add(raiz)
}
// esquemas: abertos no desktop (sem summary); abaixo da vista e recolhidos em telas menores
const abaDir = $('abaDir'), meio = $('meio')
abaDir.onclick = () => { // desktop: recolhe o painel de esquemas para a direita; a aba fica para puxá-lo de volta
  const fechado = meio.classList.toggle('sem-dir')
  abaDir.textContent = fechado ? '◂ Esquemas' : 'Esquemas ▸'
}
const esquemas = $('esquemas') as HTMLDetailsElement, larguraDesk = matchMedia('(min-width: 1100px)')
esquemas.open = larguraDesk.matches
larguraDesk.addEventListener('change', e => { esquemas.open = e.matches })

// controles: um slider + caixa numérica por opção
function controle(pai: HTMLElement, rotulo: string, ini: number, min: number, max: number, muda: (v: number) => void, passo?: number, ao: () => void = previa) {
  const l = document.createElement('label'), num = document.createElement('input'), sl = document.createElement('input')
  l.append(rotulo, num, sl)
  const step = passo ?? (max - min) / 200 // com passo: só valores cheios (linhas, colunas, semente...)
  for (const e of [num, sl]) Object.assign(e, { type: e === sl ? 'range' : 'number', min, max, step, value: ini })
  const ao2 = (e: HTMLInputElement) => () => {
    if (e.value === '') return // caixa sendo apagada para digitar
    let v = Math.min(max, Math.max(min, +e.value))
    if (passo) v = +(Math.round(v / passo) * passo).toFixed(6)
    sl.value = String(v)
    if (e === sl || +num.value !== v) num.value = String(v)
    muda(v); ao()
  }
  num.oninput = ao2(num); sl.oninput = ao2(sl)
  pai.append(l)
  return (v: number) => { sl.value = num.value = String(v) } // põe um valor de fora (troca de aba)
}
/** Seção recolhível (nada é salvo): devolve o div interno, onde entram os controles. */
function secao(pai: HTMLElement, titulo: string, aberta = false): HTMLElement {
  const d = document.createElement('details'), s = document.createElement('summary'), div = document.createElement('div')
  s.textContent = titulo
  d.open = aberta
  d.name = pai.closest('section')?.id ?? '' // só uma seção aberta por vez em cada aba
  d.append(s, div)
  pai.append(d)
  return div
}
/** Cria as seções na ordem dada; devolve título → div. */
const secoes = (pai: HTMLElement, titulos: string[], abertas: string[] = []) =>
  Object.fromEntries(titulos.map(t => [t, secao(pai, t, abertas.includes(t))])) as Record<string, HTMLElement>
/** mapa: chave da tabela → título da seção; divs: título → div da seção. */
const grupo = (tab: Record<string, readonly [number, number, number, string, number?]>, alvo: any, mapa: Record<string, string>, divs: Record<string, HTMLElement>, pular: string[] = []) => {
  for (const [k, [, min, max, rot, passo]] of Object.entries(tab))
    if (!pular.includes(k)) controle(divs[mapa[k]], rot, alvo[k], min, max, v => { alvo[k] = v }, passo)
}
const opcoes = (sel: HTMLSelectElement, itens: [string, string][]) => sel.append(...itens.map(([v, t]) => new Option(t, v)))

const formato = document.createElement('select'), encaixe = document.createElement('select')
const campo = (texto: string, sel: HTMLElement) => { const l = document.createElement('label'); l.append(texto, sel); return l }

// barra "Vista 3D" sobre a vista, como o cabeçalho do Blender: peças (passo 1), corte, elevação (passo 1), cotas e sombreamento.
// Os popovers abrem sob o botão; o corte é um por aba, então a barra se resincroniza ao trocar de aba.
const barra = document.createElement('div')
barra.className = 'barra'
const pops: HTMLElement[] = []
const botao = (texto: string, clique: (e: MouseEvent) => void, titulo = '') => {
  const b = document.createElement('button')
  b.textContent = texto; b.title = titulo; b.onclick = clique
  return b
}
/** Botões lado a lado (um ativo); devolve o contêiner e o `marca` que pinta o ativo. */
function segmentos(itens: [string, string][], muda: (v: string) => void) {
  const el = document.createElement('div'), bs = new Map<string, HTMLButtonElement>()
  el.className = 'seg'
  const marca = (v: string) => bs.forEach((b, k) => b.classList.toggle('ativo', k === v))
  for (const [v, t] of itens) { const b = botao(t, () => { muda(v); marca(v) }, t); bs.set(v, b); el.append(b) }
  return { el, marca }
}
/** Botão com painel flutuante embaixo dele; abrir um fecha os outros. */
function popover(texto: string) {
  const pop = document.createElement('div'), b = botao(texto + ' ▾', () => {
    const abrir = !pop.classList.contains('aberto')
    for (const p of pops) p.classList.remove('aberto')
    pop.classList.toggle('aberto', abrir)
    pop.style.left = Math.min(b.offsetLeft, Math.max(0, barra.clientWidth - 230)) + 'px'
  })
  pop.className = 'pop'
  pops.push(pop)
  return { b, pop }
}
addEventListener('click', e => { if (!(e.target as Element).closest('.barra, .pop')) for (const p of pops) p.classList.remove('aberto') })

const corte = () => config.corte[config.passo]
const marca = () => Object.assign(document.createElement('input'), { type: 'checkbox' })

const home = botao('⌂', () => enquadra(), 'Início: pose isométrica (tecla Home)')
// visibilidade (passo 1): um check para o bloco e outro para o grid
const pv = popover('Visibilidade'), verBloco = marca(), verGrid = marca()
verBloco.checked = verGrid.checked = true
const mudaVis = (quem: HTMLInputElement) => {
  if (!verBloco.checked && !verGrid.checked) quem.checked = true // ao menos uma peça fica visível
  config.mostrar = verBloco.checked && verGrid.checked ? 'ambos' : verBloco.checked ? 'bloco' : 'grid'
  aplicaVisivel(); atualizaCotas(); redesenhaEsquema() // cotas e esquemas seguem as peças visíveis
}
verBloco.onchange = () => mudaVis(verBloco)
verGrid.onchange = () => mudaVis(verGrid)
pv.pop.append(campo('Bloco', verBloco), campo('Grid', verGrid))
pv.b.classList.add('so1')

// corte: eixo nas cores do gizmo; o plano do corte aparece na cor do eixo
const pc = popover('Corte'), cortar = marca(), inverte = marca(), mostraPlano = marca()
mostraPlano.checked = config.planoCorte
cortar.onchange = () => { corte().ativo = cortar.checked; aplicaCorte() }
inverte.onchange = () => { corte().inverte = inverte.checked; aplicaCorte() }
mostraPlano.onchange = () => { config.planoCorte = mostraPlano.checked; aplicaCorte() }
const eixoSeg = segmentos([['x', 'X'], ['y', 'Y'], ['z', 'Z']], v => { corte().eixo = v as Corte['eixo']; aplicaCorte() })
;(['x', 'y', 'z'] as const).forEach((e, i) => { (eixoSeg.el.children[i] as HTMLElement).style.color = EIXO[e] })
const eixoRot = document.createElement('label')
eixoRot.append('Eixo', eixoSeg.el)
const poeCorte = controle(pc.pop, 'Posição (mm)', 0, -60, 60, v => { corte().pos = v }, .5, aplicaCorte)
pc.pop.prepend(campo('Cortar', cortar), eixoRot)
pc.pop.append(campo('Inverter lado', inverte), campo('Mostrar plano', mostraPlano))

// overlays (como no Blender): arestas e vértices valem em qualquer modo de sombreamento
const po = popover('Overlays'), ovArestas = marca(), ovVertices = marca()
ovArestas.onchange = ovVertices.onchange = () => { config.arestas = ovArestas.checked; config.vertices = ovVertices.checked; setOverlays() }
po.pop.append(campo('Arestas', ovArestas), campo('Vértices', ovVertices))

// transparência das peças: vale em qualquer modo e fica recolhida
const ptr = popover('Transparência')
controle(ptr.pop, 'Transparência (%)', 0, 0, 100, v => setTransp(v / 100), 5, () => {})
const cotasBtn = botao('Cotas', () => { mostrarCotas = !mostrarCotas; cotasBtn.classList.toggle('ativo', mostrarCotas); atualizaCotas() }, 'Mostrar cotas no modelo')

// sombreamento: esferas como no Blender
const esfs = document.createElement('div'), esfBtn = new Map<Modo, HTMLButtonElement>()
esfs.className = 'esfs'
const marcaModo = (m: Modo) => esfBtn.forEach((b, k) => b.classList.toggle('ativo', k === m))
for (const [v, t] of MODOS) { const b = botao('', () => { setModo(v); marcaModo(v) }, t); b.append(esfera(v)); esfBtn.set(v, b); esfs.append(b) }

// elevação: slider vertical sempre à mostra na lateral esquerda da vista (só no passo 1)
const elev = document.createElement('div'), elevV = document.createElement('span'), elevS = document.createElement('input')
elev.className = 'elev'; elev.title = 'Elevação do bloco sobre o grid (0 = assentado)'
Object.assign(elevS, { type: 'range', min: 0, max: 30, step: .5, value: config.elevacao })
const textoElev = () => { elevV.textContent = String(config.elevacao).replace('.', ',') + ' mm' }
elevS.oninput = () => { config.elevacao = +elevS.value; textoElev(); eleva() }
textoElev()
elev.append(elevV, elevS)

barra.append(home, pv.b, pc.b, po.b, ptr.b, cotasBtn, esfs, pv.pop, pc.pop, po.pop, ptr.pop)
$('vista').append(barra, elev)
marcaModo(config.modo)
function sincronizaBarra(n: number) { // valores do corte da aba atual; itens do passo 1 só aparecem no passo 1
  const c = config.corte[n]
  cortar.checked = c.ativo; inverte.checked = c.inverte; eixoSeg.marca(c.eixo); poeCorte(c.pos)
  barra.dataset.passo = String(n)
  elev.hidden = n !== 1
  for (const p of pops) p.classList.remove('aberto')
}
addEventListener('keydown', e => { // Home: volta à pose isométrica (nos campos de texto, Home continua sendo do campo)
  if (e.key !== 'Home' || (e.target instanceof Element && e.target.closest('select, textarea, input:not([type=range])'))) return
  e.preventDefault()
  enquadra()
})

// passo 1: sistema (remonta ao trocar formato ou encaixe, porque rótulos e valores mudam)
const TITULOS_SISTEMA = ['Célula', 'Encaixe', 'Pé do bloco', 'Ombro e nervura', 'Ímã', 'Grid']
function montaSistema() {
  const s = $('sistema')
  s.replaceChildren()
  const hex = o.formato === 'hexagono', d = secoes(s, TITULOS_SISTEMA, ['Célula'])
  d['Célula'].append(campo('Formato', formato))
  if (hex) controle(d['Célula'], 'Entre lados (mm)', o.largura, SISTEMA.largura[1], SISTEMA.largura[2], v => { o.largura = v })
  d['Encaixe'].append(campo('Encaixe', encaixe))
  grupo(SISTEMA, o, SECAO, d, hex ? ['largura', 'comprimento'] : [])
  previa()
}
opcoes(formato, Object.entries(FORMATOS))
opcoes(encaixe, Object.entries(ENCAIXES).map(([k, [t]]) => [k, t]))
formato.onchange = () => { o.formato = formato.value as Opcoes['formato']; montaSistema() }
encaixe.onchange = () => { Object.assign(o, ENCAIXES[encaixe.value as keyof typeof ENCAIXES][1]); montaSistema() }

// aba Blocos (peça de piso e Pedra avançada) e aba Grids (grid e degrau). As duas leem as medidas do Sistema.
grupo(PISO, o, SECAO_PISO, secoes($('gerais'), ['Peça', 'Textura Pedra', 'Borda'], ['Peça']), ['resolucao'])
grupo(PEDRA, o.pedra, SECAO_PEDRA, secoes($('pedra'), ['Avançado — Forma das pedras', 'Avançado — Superfície', 'Avançado — Desgaste']))
grupo(GUIAS, o, SECAO_GUIAS, secoes($('op-guias'), ['Dimensões']))
const sel3 = $('peca3') as HTMLSelectElement
const peca = () => config.passo === 3 ? 'piso' : sel3.value
const gera = (p: string) => p === 'grid' ? malha(grid(o, o.grid_linhas, o.grid_colunas)) : malha(degrau(o, o.grid_linhas, o.grid_colunas, o.altura_degrau))
sel3.onchange = () => { enquadrar = true; previa() }

function vaiPara(n: number) {
  config.passo = n
  for (const i of [1, 2, 3]) { $('passo' + i).hidden = n !== i; $('ir' + i).classList.toggle('ativo', n === i) }
  $('saida').hidden = n === 1
  $('dir').hidden = abaDir.hidden = n === 3 // o passo Blocos não tem esquema
  sincronizaBarra(n)
  enquadrar = true
  previa()
}
for (const i of [1, 2, 3]) $('ir' + i).onclick = () => vaiPara(i)

const estado = $('estado')
$('baixar').onclick = () => {
  estado.textContent = 'Gerando a malha final (alguns segundos)...'
  setTimeout(async () => { // ponytail: roda na thread principal (a tela trava ~2 s por célula no piso); passar para Web Worker se incomodar
    const t = performance.now(), p = peca(), f = FORMATOS[o.formato]
    const m = p === 'piso' ? await final(piso(o)) : gera(p)
    const nome = p === 'piso' ? `Piso Pedra ${f} ${o.linhas}x${o.colunas} s${o.semente}` : `${p === 'grid' ? 'Grid' : 'Degrau'} ${f} ${o.grid_linhas}x${o.grid_colunas}`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([stl(m)], { type: 'model/stl' }))
    a.download = nome + '.stl'
    a.click()
    estado.textContent = `${m.idx.length / 3} triângulos em ${((performance.now() - t) / 1000).toFixed(1)} s`
  }, 30)
}
montaSistema()
vaiPara(1)
