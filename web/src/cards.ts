// Cards sobre a vista: Vista (Home e olhos) e Desempenho à esquerda; Aparência, Corte e Cotas à direita; elevação (passo 1) no meio da lateral esquerda.
// O corte é um por aba, então os cards se resincronizam ao trocar de aba.
import type { Opcoes } from './bloco'
import { cotas, estilo, limpaCotas } from './cotas'
import { EIXO } from './esquema'
import { esfera } from './esferas'
import { aplicaCorte, aplicaVisivel, cena, config, type Corte, eleva, enquadra, MODOS, type Modo, setCor, setModo, setOverlays, setPixelRatioMax, setTransp } from './vista'
import { $, botao, campo, cartao, controle, marca, opcoes, secao, segmentos } from './ui'

// resolução da PRÉVIA do piso (só a tela): nunca altera o STL, que usa o.resolucao
export const RES = [.25, .5, 1, 2] // mm; do mais fino ao mais grosso
export const perf = { auto: true, manual: .5, orcamento: 300, refina: true, k: 0 } // k: ms·mm² medido: a prévia do piso leva ≈ k / res² ms
export const resRapida = () => !perf.auto ? perf.manual : perf.k ? RES.find(r => perf.k / r ** 2 <= perf.orcamento) ?? RES[RES.length - 1] : .5
export const gerando = Object.assign(document.createElement('div'), { className: 'gerando', textContent: 'gerando…', hidden: true })
export const infoPerf = document.createElement('div')

const cDesemp = cartao('Desempenho'), hud = Object.assign(document.createElement('span'), { className: 'hud', textContent: '—' })
cDesemp.s.append(hud)
/** Mini HUD do Desempenho (visível com o card recolhido): verde dentro do orçamento, amarelo até 1,5×, vermelho com ⚠ acima disso, lento ou com erro. */
export function hudPerf(nivel: 'ok' | 'atencao' | 'ruim', texto: string) {
  hud.className = 'hud ' + nivel; hud.textContent = (nivel === 'ruim' ? '⚠ ' : '● ') + texto
  cDesemp.d.classList.toggle('alerta', nivel === 'ruim')
}

/** Monta todos os cards na vista. Devolve o que o main precisa: refazer as cotas, saber se estão ligadas e resincronizar ao trocar de aba. */
export function montaCards(o: Opcoes, previa: () => void, redesenhaEsquema: () => void, peca: () => string) {
  const celular = matchMedia('(max-width: 700px)').matches // mesmo breakpoint do CSS de celular: cards Aparência/Corte/Cotas começam recolhidos
  const corte = () => config.corte[config.passo]

  // cotas 3D: um estado só (vale para as três abas); refaz só as linhas, não as malhas
  let mostrarCotas = false
  function atualizaCotas() {
    limpaCotas()
    if (!mostrarCotas) return
    const raiz = cotas(config.passo as 1 | 2 | 3, o, peca(), config.mostrar)
    raiz.userData.elevavel.position.z = config.passo === 1 ? config.elevacao : 0 // o pé, ombro e folga sobem com o bloco
    cena.add(raiz)
  }

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
  const refinaCk = marca(), modoPerf = segmentos([['auto', 'Auto'], ['manual', 'Manual']], v => { perf.auto = v === 'auto'; previa() })
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
  cDesemp.c.append(pixRot, modoRot)
  controle(cDesemp.c, 'Manual (mm)', perf.manual, .25, 2, v => { perf.manual = v }, .25)
  controle(cDesemp.c, 'Orçamento Auto (ms)', perf.orcamento, 100, 1500, v => { perf.orcamento = v }, 50)
  cDesemp.c.append(campo('Refinar ao parar', refinaCk), infoPerf, tituloExp)
  controle(cDesemp.c, 'Malha do STL (mm)', o.resolucao, .1, .5, v => { o.resolucao = v }, .025, () => {})

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
  addEventListener('keydown', e => { // Home: volta à pose isométrica (nos campos de texto, Home continua sendo do campo)
    if (e.key !== 'Home' || (e.target instanceof Element && e.target.closest('select, textarea, input:not([type=range])'))) return
    e.preventDefault()
    enquadra(mostrarCotas)
  })
  return {
    atualizaCotas,
    cotasLigadas: () => mostrarCotas,
    /** Valores do corte da aba atual; itens do passo 1 só aparecem no passo 1. */
    sincronizaBarra(n: number) {
      const c = config.corte[n]
      cortar.checked = c.ativo; inverte.checked = c.inverte; eixoSeg.marca(c.eixo); poeCorte(c.pos)
      $('vista').dataset.passo = String(n)
      elev.hidden = n !== 1
    },
  }
}
