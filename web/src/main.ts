import { GUIAS, padrao, PISO, SECAO_GUIAS, SECAO_PISO, type Opcoes } from './bloco'
import { cancelaExporta, exporta, previa as pedePrevia } from './cliente'
import { PEDRA, SECAO_PEDRA } from './pedra'
import { aberturaNova, ladoBloco, orfa, paredeNova, paredesValidas, tracejado3D } from './aberturas'
import type { Abertura, Parede } from './parede'
import { avisos, ENCAIXES, FORMATOS, fundo, regiao, SECAO, SISTEMA } from './sistema'
import { cotas, estilo, limpaCotas } from './cotas'
import { EIXO, esquema } from './esquema'
import { esfera } from './esferas'
import { aoMudarVer, aplicaCorte, aplicaVisivel, cena, config, type Corte, enquadra, eleva, MODOS, mostra, type Modo, setModo, setCor, setOverlays, mostraTracejado, setPixelRatioMax, setTransp, type Ver } from './vista'

// nada é salvo: cada abertura começa do padrão
const o: Opcoes = padrao()
let enquadrar = true // só ao trocar de passo ou de peça; mexer num slider não move a câmera
let ver: Ver = 'frontal' // vista 2D do painel de esquemas: a mais próxima da câmera (ver vista.ts)
const $ = (id: string) => document.getElementById(id)!

// resolução da PRÉVIA do piso (só a tela): nunca altera o STL, que usa o.resolucao
const RES = [.25, .5, 1, 2] // mm; do mais fino ao mais grosso
const perf = { auto: true, manual: .5, orcamento: 300, refina: true }
let k = 0 // ms·mm² medido: a prévia do piso leva ≈ k / res² ms
const resRapida = () => !perf.auto ? perf.manual : k ? RES.find(r => k / r ** 2 <= perf.orcamento) ?? RES[RES.length - 1] : .5
const gerando = Object.assign(document.createElement('div'), { className: 'gerando', textContent: 'gerando…', hidden: true })
const infoPerf = document.createElement('div')

let pendente: ReturnType<typeof setTimeout>, refino: ReturnType<typeof setTimeout>, geracao = 0
function previa(res = resRapida()) {
  clearTimeout(pendente); clearTimeout(refino)
  pendente = setTimeout(async () => {
    const eu = ++geracao, passo = config.passo, snap = structuredClone(o), p = peca()
    snap.paredes = paredesValidas(snap) // aresta que não existe mais no bloco atual é ignorada
    gerando.hidden = false
    const lento = setTimeout(() => hudPerf('ruim', 'lento…'), 2 * perf.orcamento + 1000) // ainda gerando bem depois do orçamento: sobrecarga
    try {
      const r = await pedePrevia({ tipo: 'previa', passo, peca: p, o: snap, res })
      if (eu !== geracao) return
      hudPerf(r.ms > 1.5 * perf.orcamento ? 'ruim' : r.ms > perf.orcamento ? 'atencao' : 'ok', `${r.ms.toFixed(0)} ms`)
      if (passo === 1) { // bloco liso assentado num grid 1 × 1, cortado ao meio (a elevação é somada pela vista)
        mostra(0, r.m[0], fundo(snap) + snap.folga_fundo)
        mostra(1, r.m[1])
        $('aviso').textContent = avisos(snap).join(' ')
      } else {
        mostra(0, r.m[0])
        mostra(1, null)
      }
      mostraTracejado(passo === 3 ? snap.paredes.flatMap(w => tracejado3D(snap, w)) : [])
      if (passo === 3) {
        const nk = r.ms * res ** 2
        k = k ? (k + nk) / 2 : nk
        infoPerf.textContent = `Malha atual: ${String(res).replace('.', ',')} mm · ${r.ms.toFixed(0)} ms`
        const fina = res / 2 // refino ao parar: um passo mais fino por vez, enquanto couber em 8× o orçamento
        if (perf.auto && perf.refina && fina >= RES[0] && k / fina ** 2 <= 8 * perf.orcamento) refino = setTimeout(() => previa(fina), 400)
      }
      atualizaCotas()
      redesenhaEsquema()
      if (enquadrar) { enquadra(mostrarCotas); enquadrar = false }
    } catch (e) { if (e !== 'cancelado') { hudPerf('ruim', 'erro'); $('estado').textContent = `Erro: ${e}`; console.error(e) } }
    finally { clearTimeout(lento); if (eu === geracao) gerando.hidden = true }
  }, 60)
}
// painel de esquemas: isométrica com os planos + a vista 2D mais próxima da câmera; "Mostrar tudo" abre todas
function redesenhaEsquema() {
  $('dirc').innerHTML = esquema(o, config.passo, sel3.value, config.mostrar, ver, config.elevacao)
  const dir = $('dir'), mini = $('dirc').querySelector<HTMLElement>('.thumbs')
  if (mini && esquemas.open && dir.scrollHeight > dir.clientHeight) mini.hidden = true // as miniaturas só entram se sobrar espaço
}
aoMudarVer(v => { ver = v; redesenhaEsquema() })
const tudo = $('tudo') as HTMLDialogElement
$('verTudo').onclick = () => { $('tudoc').innerHTML = esquema(o, config.passo, sel3.value, config.mostrar, 'tudo', config.elevacao); tudo.showModal() }
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
const celular = matchMedia('(max-width: 700px)').matches // mesmo breakpoint do CSS de celular: cards Aparência/Corte/Cotas começam recolhidos
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

// cards sobre a vista: Vista (Home e olhos) e Desempenho à esquerda; Aparência, Corte e Cotas à direita; elevação (passo 1) no meio da lateral esquerda.
// O corte é um por aba, então os cards se resincronizam ao trocar de aba.
/** Card recolhível: `d` é o <details>, `s` o título (summary) e `c` o corpo. */
function cartao(titulo: string, aberto = false) {
  const d = document.createElement('details'), s = document.createElement('summary'), c = document.createElement('div')
  d.className = 'card'; d.open = aberto; s.textContent = titulo; d.append(s, c)
  return { d, s, c }
}
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
const corte = () => config.corte[config.passo]
const marca = () => Object.assign(document.createElement('input'), { type: 'checkbox' })

// card Vista: Home e a visibilidade de Bloco e Grid, um abaixo do outro
const cVista = cartao('Vista', true)
const home = botao('', () => enquadra(mostrarCotas), 'Início: pose isométrica (tecla Home)')
home.classList.add('olho'); home.append(Object.assign(document.createElement('span'), { textContent: '⌂' }), 'Home')
// visibilidade (passo 1): um check para o bloco e outro para o grid, direto na barra
const verBloco = marca(), verGrid = marca()
verBloco.checked = verGrid.checked = true
// olho aberto e colorido = visível; olho fechado e apagado = oculto (o checkbox só guarda o estado)
const OLHO = (a: boolean) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${a
  ? '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'
  : '<path d="M2 10c3 5 7 7 10 7s7-2 10-7"/><path d="M6 15l-2 3M12 17v3M18 15l2 3"/>'}</svg>`
function olho(texto: string, el: HTMLInputElement, cor: string) {
  const b = botao('', () => { el.checked = !el.checked; el.dispatchEvent(new Event('change')) }, texto)
  const ico = document.createElement('span')
  const pinta = () => { ico.innerHTML = OLHO(el.checked); b.style.color = el.checked ? cor : '#6b7077'; b.title = `${texto}: ${el.checked ? 'visível' : 'oculto'}`; b.setAttribute('aria-pressed', String(el.checked)) }
  el.addEventListener('change', pinta); pinta()
  b.classList.add('olho', 'so1'); b.append(ico, texto)
  return b
}
const mudaVis = (quem: HTMLInputElement) => {
  if (!verBloco.checked && !verGrid.checked) quem.checked = true // ao menos uma peça fica visível
  config.mostrar = verBloco.checked && verGrid.checked ? 'ambos' : verBloco.checked ? 'bloco' : 'grid'
  aplicaVisivel(); atualizaCotas(); redesenhaEsquema() // cotas e esquemas seguem as peças visíveis
}
verBloco.onchange = () => mudaVis(verBloco)
verGrid.onchange = () => mudaVis(verGrid)

// corte: eixo nas cores do gizmo; o plano do corte aparece na cor do eixo
const cCorte = cartao('Corte'), corpoCorte = cCorte.c, cortar = marca(), inverte = marca(), mostraPlano = marca()
mostraPlano.checked = config.planoCorte
cortar.onchange = () => { corte().ativo = cortar.checked; aplicaCorte() }
inverte.onchange = () => { corte().inverte = inverte.checked; aplicaCorte() }
mostraPlano.onchange = () => { config.planoCorte = mostraPlano.checked; aplicaCorte() }
const eixoSeg = segmentos([['x', 'X'], ['y', 'Y'], ['z', 'Z']], v => { corte().eixo = v as Corte['eixo']; aplicaCorte() })
;(['x', 'y', 'z'] as const).forEach((e, i) => { (eixoSeg.el.children[i] as HTMLElement).style.color = EIXO[e] })
const eixoRot = document.createElement('label')
eixoRot.append('Eixo', eixoSeg.el)
const poeCorte = controle(corpoCorte, 'Posição (mm)', 0, -60, 60, v => { corte().pos = v }, .5, aplicaCorte)
corpoCorte.prepend(campo('Cortar', cortar), eixoRot)
corpoCorte.append(campo('Inverter lado', inverte), campo('Mostrar plano', mostraPlano))

// card "Aparência": materiais (esferas), overlays e transparência (valem em qualquer modo) e, em Avançado, a cor dos objetos
const cApar = cartao('Aparência', !celular), cardCorpo = cApar.c, ovArestas = marca(), ovVertices = marca()
ovArestas.onchange = ovVertices.onchange = () => { config.arestas = ovArestas.checked; config.vertices = ovVertices.checked; setOverlays() }
// desempenho (aba Blocos): resolução da prévia na tela; a malha do STL é separada e não depende dela
const cDesemp = cartao('Desempenho'), pd = { pop: cDesemp.c }, hud = Object.assign(document.createElement('span'), { className: 'hud', textContent: '—' }), refinaCk = marca(), modoPerf = segmentos([['auto', 'Auto'], ['manual', 'Manual']], v => { perf.auto = v === 'auto'; previa() })
const pixels = segmentos([['1', '1×'], ['1.5', '1,5×'], ['2', '2×']], v => setPixelRatioMax(+v))
pixels.marca('2')
const pixRot = document.createElement('label')
pixRot.append('Pixels da vista', pixels.el)
refinaCk.checked = true
refinaCk.onchange = () => { perf.refina = refinaCk.checked; previa() }
modoPerf.marca('auto')
const modoRot = document.createElement('label'), tituloExp = document.createElement('div')
modoRot.append('Malha da prévia', modoPerf.el)
tituloExp.className = 'nota'; tituloExp.textContent = 'Exportação (não depende da tela)'
pd.pop.append(pixRot, modoRot)
controle(pd.pop, 'Manual (mm)', perf.manual, .25, 2, v => { perf.manual = v }, .25)
controle(pd.pop, 'Orçamento Auto (ms)', perf.orcamento, 100, 1500, v => { perf.orcamento = v }, 50)
pd.pop.append(campo('Refinar ao parar', refinaCk), infoPerf, tituloExp)
controle(pd.pop, 'Malha do STL (mm)', o.resolucao, .1, .5, v => { o.resolucao = v }, .025, () => {})
cDesemp.s.append(hud)
/** Mini HUD do Desempenho (visível com o card recolhido): verde dentro do orçamento, amarelo até 1,5×, vermelho com ⚠ acima disso, lento ou com erro. */
function hudPerf(nivel: 'ok' | 'atencao' | 'ruim', texto: string) {
  hud.className = 'hud ' + nivel; hud.textContent = (nivel === 'ruim' ? '⚠ ' : '● ') + texto
  cDesemp.d.classList.toggle('alerta', nivel === 'ruim')
}

// card Cotas: liga/desliga e estilo (tamanho, fonte, afastamento, cor); qualquer mudança refaz as cotas
const cCotas = cartao('Cotas'), mostraCotas = marca(), fonteSel = document.createElement('select'), corCotas = Object.assign(document.createElement('input'), { type: 'color', value: estilo.cor })
mostraCotas.onchange = () => { mostrarCotas = mostraCotas.checked; atualizaCotas() }
opcoes(fonteSel, [['sans-serif', 'Sem serifa'], ['serif', 'Com serifa'], ['monospace', 'Monoespaçada']])
fonteSel.onchange = () => { estilo.fonte = fonteSel.value; atualizaCotas() }
corCotas.oninput = () => { estilo.cor = corCotas.value; atualizaCotas() }
cCotas.c.append(campo('Mostrar cotas', mostraCotas))
controle(cCotas.c, 'Tamanho do texto (px)', estilo.tam, 8, 24, v => { estilo.tam = v }, 1, atualizaCotas)
cCotas.c.append(campo('Fonte', fonteSel))
controle(cCotas.c, 'Afastamento (%)', estilo.afast * 100, 50, 250, v => { estilo.afast = v / 100 }, 10, atualizaCotas)
cCotas.c.append(campo('Cor', corCotas))

// sombreamento: esferas como no Blender
const esfs = document.createElement('div'), esfBtn = new Map<Modo, HTMLButtonElement>()
esfs.className = 'esfs'
const marcaModo = (m: Modo) => esfBtn.forEach((b, k) => b.classList.toggle('ativo', k === m))
for (const [v, t] of MODOS) { const b = botao('', () => { setModo(v); marcaModo(v) }, t); b.append(esfera(v)); esfBtn.set(v, b); esfs.append(b) }
cardCorpo.append(esfs, campo('Arestas', ovArestas), campo('Vértices', ovVertices))
controle(cardCorpo, 'Transparência (%)', 0, 0, 100, v => setTransp(v / 100), 5, () => {})
const avancado = secao(cardCorpo, 'Avançado'), cor = (i: number, hex: string) => Object.assign(document.createElement('input'), { type: 'color', value: hex, oninput(this: HTMLInputElement) { setCor(i, this.value) } })
avancado.append(campo('Cor do bloco / piso', cor(0, '#b8b4ac')), campo('Cor do grid', cor(1, '#6f8fa8')))

// elevação: slider vertical sempre à mostra na lateral esquerda da vista (só no passo 1)
const elev = document.createElement('div'), elevV = document.createElement('span'), elevS = document.createElement('input')
elev.className = 'elev'; elev.title = 'Elevação do bloco sobre o grid (0 = assentado)'
Object.assign(elevS, { type: 'range', min: 0, max: 30, step: .5, value: config.elevacao })
const textoElev = () => { elevV.textContent = String(config.elevacao).replace('.', ',') + ' mm' }
elevS.oninput = () => { config.elevacao = +elevS.value; textoElev(); eleva(); redesenhaEsquema() } // os esquemas seguem o deslocamento
textoElev()
elev.append(elevV, elevS)

cVista.c.append(home, olho('Bloco', verBloco, '#d9b36c'), olho('Grid', verGrid, '#6fa8dc'))
const colunas = [['cards esq', [cVista.d]], ['cards', [cApar.d, cCorte.d, cCotas.d]]] as const // esquerda-topo e direita-topo
for (const [cls, ds] of colunas) { const col = document.createElement('div'); col.className = cls; col.append(...ds); $('vista').append(col) }
cDesemp.d.classList.add('desemp') // esquerda-baixo
$('vista').append(cDesemp.d, elev, gerando)
marcaModo(config.modo)
function sincronizaBarra(n: number) { // valores do corte da aba atual; itens do passo 1 só aparecem no passo 1
  const c = config.corte[n]
  cortar.checked = c.ativo; inverte.checked = c.inverte; eixoSeg.marca(c.eixo); poeCorte(c.pos)
  $('vista').dataset.passo = String(n)
  elev.hidden = n !== 1
}
addEventListener('keydown', e => { // Home: volta à pose isométrica (nos campos de texto, Home continua sendo do campo)
  if (e.key !== 'Home' || (e.target instanceof Element && e.target.closest('select, textarea, input:not([type=range])'))) return
  e.preventDefault()
  enquadra(mostrarCotas)
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
formato.onchange = () => { o.formato = formato.value as Opcoes['formato']; montaSistema(); montaParedes() }
encaixe.onchange = () => { Object.assign(o, ENCAIXES[encaixe.value as keyof typeof ENCAIXES][1]); montaSistema() }

// aba Blocos (peça de piso e Pedra avançada) e aba Grids (grid e degrau). As duas leem as medidas do Sistema.
grupo(PISO, o, SECAO_PISO, secoes($('gerais'), ['Peça', 'Paredes', 'Textura Pedra', 'Borda'], ['Peça']), ['resolucao'])
// paredes (aba Blocos): lista recolhível; cada parede com âncora, medidas, lado e aberturas. Nada é salvo.
const paredesDiv = $('gerais').querySelector<HTMLElement>('details:nth-child(2) > div')!
const escolha = (pai: HTMLElement, rot: string, v: string, itens: [string, string][], muda: (v: string) => void) => {
  const sl = document.createElement('select')
  opcoes(sl, itens); sl.value = v
  sl.onchange = () => muda(sl.value)
  pai.append(campo(rot, sl))
}
function montaParedes() {
  const div = paredesDiv, hex = o.formato === 'hexagono'
  div.replaceChildren()
  const refaz = () => { montaParedes(); previa() }
  o.paredes.forEach((p, i) => {
    const d = document.createElement('details'), sm = document.createElement('summary'), c = document.createElement('div')
    sm.textContent = `Parede ${i + 1} · ${p.ancora.tipo === 'aresta' ? 'em aresta' : 'em eixo'}`
    if (orfa(o, p)) { sm.textContent += ' ⚠ lado inexistente, ignorada'; sm.style.color = '#e9a35a' }
    d.open = true; d.append(sm, c); div.append(d)
    escolha(c, 'Âncora', p.ancora.tipo, [['aresta', 'Lado do bloco'], ['eixo', 'Eixo (reta livre)']], v => {
      p.ancora = v === 'aresta' ? { tipo: 'aresta', celula: 0, lado: 0 } : { tipo: 'eixo', eixo: 'x', desloc: 0 }
      p.lado = v === 'aresta' ? 'dentro' : 'centro'; refaz()
    })
    const a = p.ancora
    if (a.tipo === 'aresta') controle(c, 'Lado do bloco nº', a.lado, 0, (hex ? 6 : 4) - 1, v => { a.lado = v }, 1)
    else {
      escolha(c, 'Eixo', a.eixo, [['x', 'X'], ['y', 'Y'], ...(hex ? [['h0', '0°'], ['h60', '60°'], ['h120', '120°']] as [string, string][] : [])], v => { a.eixo = v as typeof a.eixo; previa() })
      controle(c, 'Deslocamento (mm)', a.desloc, -100, 100, v => { a.desloc = v }, .5)
    }
    controle(c, 'Início (mm)', p.inicio, -100, 100, v => { p.inicio = v }, .5)
    controle(c, 'Comprimento (mm)', p.comprimento, 1, 200, v => { p.comprimento = v }, .5)
    controle(c, 'Altura (mm)', p.altura, 1, 100, v => { p.altura = v }, .5)
    controle(c, 'Espessura (mm)', p.espessura, 1, 20, v => { p.espessura = v }, .5)
    escolha(c, 'Lado da espessura', p.lado, [['fora', 'Fora'], ['centro', 'Centro'], ['dentro', 'Dentro']], v => { p.lado = v as Parede['lado']; previa() })
    p.aberturas.forEach((ab, j) => {
      const h = document.createElement('div')
      h.className = 'nota'; h.textContent = `Abertura ${j + 1}`
      c.append(h)
      escolha(c, 'Tipo', ab.tipo, [['porta', 'Porta'], ['janela', 'Janela']], v => { ab.tipo = v as Abertura['tipo']; previa() })
      escolha(c, 'Forma', ab.forma, [['reta', 'Reta'], ['arco', 'Arco'], ['abatido', 'Arco abatido'], ['ogiva', 'Ogiva']], v => { ab.forma = v as Abertura['forma']; previa() })
      controle(c, 'Posição do centro (mm)', ab.pos, -100, 200, v => { ab.pos = v }, .5)
      controle(c, 'Largura (mm)', ab.largura, 2, 60, v => { ab.largura = v }, .5)
      controle(c, 'Altura (mm)', ab.altura, 2, 100, v => { ab.altura = v }, .5)
      controle(c, 'Peitoril (mm)', ab.peitoril, -50, 100, v => { ab.peitoril = v }, .5)
      const ck = marca()
      ck.checked = ab.batente.ligado
      ck.onchange = () => { ab.batente.ligado = ck.checked; previa() }
      c.append(campo('Batente', ck))
      controle(c, 'Batente: largura (mm)', ab.batente.largura, .5, 6, v => { ab.batente.largura = v }, .1)
      controle(c, 'Batente: saliência (mm)', ab.batente.saliencia, 0, 3, v => { ab.batente.saliencia = v }, .1)
      c.append(botao('− Abertura', () => { p.aberturas.splice(j, 1); refaz() }))
    })
    c.append(botao('+ Abertura', () => { const ab = aberturaNova('porta'); ab.pos = p.comprimento / 2; p.aberturas.push(ab); refaz() }), botao('− Parede', () => { o.paredes.splice(i, 1); refaz() }))
  })
  div.append(botao('+ Parede', () => {
    o.paredes.push(paredeNova('p' + ++nParede, { tipo: 'aresta', celula: 0, lado: 0 }, +ladoBloco(o, 0)!.L.toFixed(1))); refaz()
  }))
}
let nParede = 0
montaParedes()
grupo(PEDRA, o.pedra, SECAO_PEDRA, secoes($('pedra'), ['Avançado — Forma das pedras', 'Avançado — Superfície', 'Avançado — Desgaste']))
grupo(GUIAS, o, SECAO_GUIAS, secoes($('op-guias'), ['Dimensões']))
const sel3 = $('peca3') as HTMLSelectElement
const peca = () => config.passo === 3 ? 'piso' : sel3.value
sel3.onchange = () => { enquadrar = true; previa() }

function vaiPara(n: number) {
  config.passo = n
  for (const i of [1, 2, 3]) { $('passo' + i).hidden = n !== i; $('ir' + i).classList.toggle('ativo', n === i) }
  $('saida').hidden = n === 1
  sincronizaBarra(n)
  enquadrar = true
  previa()
}
for (const i of [1, 2, 3]) $('ir' + i).onclick = () => vaiPara(i)

const estado = $('estado'), baixar = $('baixar') as HTMLButtonElement, cancela = $('cancela')
baixar.onclick = async () => { // roda num worker; os parâmetros ficam congelados no clique
  const t = performance.now(), p = peca(), s = structuredClone(o), f = FORMATOS[s.formato]
  s.paredes = paredesValidas(s)
  const nome = p === 'piso' ? `Piso Pedra ${f} ${s.linhas}x${s.colunas} s${s.semente}` : `${p === 'grid' ? 'Grid' : 'Degrau'} ${f} ${s.grid_linhas}x${s.grid_colunas}`
  baixar.disabled = true; cancela.hidden = false
  estado.textContent = 'Gerando...'
  try {
    const r = await exporta({ tipo: 'exporta', peca: p, o: s }, e => { estado.textContent = e })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([r.stl], { type: 'model/stl' }))
    a.download = nome + '.stl'
    a.click()
    estado.textContent = `${r.tri} triângulos em ${((performance.now() - t) / 1000).toFixed(1)} s`
  } catch (e) { estado.textContent = e === 'cancelado' ? 'Cancelado.' : `Erro: ${e}` }
  finally { baixar.disabled = false; cancela.hidden = true }
}
cancela.onclick = cancelaExporta
montaSistema()
vaiPara(1)
