import { GUIAS, padrao, PISO, SECAO_GUIAS, SECAO_PISO, type Opcoes } from './bloco'
import { cancelaExporta, exporta, previa as pedePrevia } from './cliente'
import { PEDRA, SECAO_PEDRA } from './pedra'
import { paredesValidas, tracejado3D } from './aberturas'
import { avisos, ENCAIXES, FORMATOS, fundo, SECAO, SISTEMA } from './sistema'
import { esquema } from './esquema'
import { aoMudarVer, config, enquadra, mostra, mostraTracejado, type Ver } from './vista'
import { gerando, hudPerf, infoPerf, montaCards, perf, RES, resRapida } from './cards'
import { montaParedes } from './paredes'
import { aplicaTema, TEMAS } from './temas'
import { $, aoMudar, campo, controle, grupo, opcoes, secoes } from './ui'

// nada é salvo: cada abertura começa do padrão
const o: Opcoes = padrao()
let enquadrar = true // só ao trocar de passo ou de peça; mexer num slider não move a câmera
let ver: Ver = 'frontal' // vista 2D do painel de esquemas: a mais próxima da câmera (ver vista.ts)

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
        perf.k = perf.k ? (perf.k + nk) / 2 : nk
        infoPerf.textContent = `Malha atual: ${String(res).replace('.', ',')} mm · ${r.ms.toFixed(0)} ms`
        const fina = res / 2 // refino ao parar: um passo mais fino por vez, enquanto couber em 8× o orçamento
        if (perf.auto && perf.refina && fina >= RES[0] && perf.k / fina ** 2 <= 8 * perf.orcamento) refino = setTimeout(() => previa(fina), 400)
      }
      cards.atualizaCotas()
      redesenhaEsquema()
      if (enquadrar) { enquadra(cards.cotasLigadas()); enquadrar = false }
    } catch (e) { if (e !== 'cancelado') { hudPerf('ruim', 'erro'); $('estado').textContent = `Erro: ${e}`; console.error(e) } }
    finally { clearTimeout(lento); if (eu === geracao) gerando.hidden = true }
  }, 60)
}
aoMudar.f = previa
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

// esquemas: abertos no desktop (sem summary); abaixo da vista e recolhidos em telas menores
const abaDir = $('abaDir'), meio = $('meio')
abaDir.onclick = () => { // desktop: recolhe o painel de esquemas para a direita; a aba fica para puxá-lo de volta
  const fechado = meio.classList.toggle('sem-dir')
  abaDir.textContent = fechado ? '◂ Esquemas' : 'Esquemas ▸'
}
const esquemas = $('esquemas') as HTMLDetailsElement, larguraDesk = matchMedia('(min-width: 1100px)')
esquemas.open = larguraDesk.matches
larguraDesk.addEventListener('change', e => { esquemas.open = e.matches })

const cards = montaCards(o, previa, redesenhaEsquema, () => peca())

// passo 1: sistema (remonta ao trocar formato ou encaixe, porque rótulos e valores mudam)
const TITULOS_SISTEMA = ['Célula', 'Encaixe', 'Pé do bloco', 'Ombro e nervura', 'Ímã', 'Grid']
const formato = document.createElement('select'), encaixe = document.createElement('select')
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
formato.onchange = () => { o.formato = formato.value as Opcoes['formato']; montaSistema(); montaParedes(paredesDiv, o, previa) }
encaixe.onchange = () => { Object.assign(o, ENCAIXES[encaixe.value as keyof typeof ENCAIXES][1]); montaSistema() }

// aba Blocos (peça de piso e Pedra avançada) e aba Grids (grid e degrau). As duas leem as medidas do Sistema.
const dPiso = secoes($('gerais'), ['Peça', 'Paredes', 'Textura Pedra', 'Borda'], ['Peça'])
const poePiso = grupo(PISO, o, SECAO_PISO, dPiso, ['resolucao'])
const paredesDiv = dPiso['Paredes']
montaParedes(paredesDiv, o, previa)
// tema: grava desgaste e tamanho da pedra nos controles (a textura só entra quando existir); sem tema escolhido, nada muda
const temaSel = document.createElement('select')
opcoes(temaSel, [['', '—'], ...Object.entries(TEMAS).map(([k, t]) => [k, t.nome] as [string, string])])
temaSel.onchange = () => {
  if (!temaSel.value) return
  aplicaTema(o, TEMAS[temaSel.value])
  poePiso.desgaste(o.desgaste); poePiso.tamanho_pedra(o.tamanho_pedra)
  previa()
}
$('gerais').prepend(campo('Tema', temaSel))
grupo(PEDRA, o.pedra, SECAO_PEDRA, secoes($('pedra'), ['Avançado — Forma das pedras', 'Avançado — Superfície', 'Avançado — Desgaste']))
grupo(GUIAS, o, SECAO_GUIAS, secoes($('op-guias'), ['Dimensões']))
const sel3 = $('peca3') as HTMLSelectElement
const peca = () => config.passo === 3 ? 'piso' : sel3.value
sel3.onchange = () => { enquadrar = true; previa() }

function vaiPara(n: number) {
  config.passo = n
  for (const i of [1, 2, 3]) { $('passo' + i).hidden = n !== i; $('ir' + i).classList.toggle('ativo', n === i) }
  $('saida').hidden = n === 1
  cards.sincronizaBarra(n)
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
