import { GUIAS, padrao, PISO, SECAO_GUIAS, SECAO_PISO, type Opcoes } from './bloco'
import { cancelaExporta, exporta, previa as pedePrevia } from './cliente'
import { TEX, texParede, type TexId } from './textura'
import { paredesValidas, tracejado3D } from './aberturas'
import { avisos, ENCAIXES, FORMATOS, fundo, SECAO, SISTEMA } from './sistema'
import { esquema } from './esquema'
import { aoMudarVer, config, enquadra, mostra, mostraTracejado, type Ver } from './vista'
import { gerando, hudPerf, infoPerf, montaCards, perf, RES, resRapida } from './cards'
import { montaParedes } from './paredes'
import { temTelhado } from './telhado'
import { aplicaTema, TEMAS } from './temas'
import { $, aoMudar, botao, campo, controle, escolha, grupo, opcoes, secoes } from './ui'

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
        $('avisoGrid').textContent = ''
      } else {
        mostra(0, r.m[0])
        mostra(1, r.m[1])
        $('aviso').textContent = ''
        $('avisoGrid').textContent = passo === 2 ? [...avisos(snap), ...(r.av ?? [])].join(' ') : ''
      }
      mostraTracejado(passo === 3 ? snap.paredes.flatMap(w => tracejado3D(snap, w)) : [])
      const ar = document.getElementById('avisoRampa')
      const semApoio = temTelhado(snap) && !snap.paredes.length
      if (ar) ar.textContent = snap.inclinacao > 0 && o.paredes.length ? '⚠ Paredes desligadas na rampa (inclinação > 0).'
        : snap.telhado_forma !== 'nenhum' && !temTelhado(snap) ? '⚠ Telhado só no bloco quadrado e sem rampa (ignorado).'
        : semApoio ? (snap.telhado_modo === 'fundido' ? '⚠ Telhado fundido precisa de paredes (ignorado).' : '⚠ Telhado sem paredes para apoiar.') : ''
      $('baixarClip').hidden = !(passo === 2 && snap.trava === 'clip')
      $('baixarTelhado').hidden = !(passo === 3 && temTelhado(snap) && snap.telhado_modo === 'removivel')
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
const dPiso = secoes($('gerais'), ['Peça', 'Paredes', 'Telhado', 'Textura', 'Borda'], ['Peça'])
const poePiso = grupo(PISO, o, SECAO_PISO, dPiso, ['resolucao'])
escolha(dPiso['Peça'], 'Rampa sobe para', o.inclinacao_dir, [['+y', '+Y'], ['-y', '−Y'], ['+x', '+X'], ['-x', '−X']], v => { o.inclinacao_dir = v as Opcoes['inclinacao_dir']; previa() })
const paredesDiv = dPiso['Paredes']
montaParedes(paredesDiv, o, previa)
{ // telhado (só bloco quadrado e sem rampa; fora disso é ignorado)
  const d = dPiso['Telhado']
  escolha(d, 'Forma', o.telhado_forma, [['nenhum', 'Nenhum'], ['uma', 'Uma água'], ['duas', 'Duas águas'], ['quatro', 'Quatro águas'], ['plano', 'Plano com mureta']], v => { o.telhado_forma = v as Opcoes['telhado_forma']; previa() })
  escolha(d, 'Modo', o.telhado_modo, [['removivel', 'Removível (STL próprio)'], ['fundido', 'Fundido ao bloco']], v => { o.telhado_modo = v as Opcoes['telhado_modo']; previa() })
  escolha(d, 'Cumeeira ao longo de (uma água: sobe para)', o.telhado_eixo, [['x', 'X'], ['y', 'Y']], v => { o.telhado_eixo = v as Opcoes['telhado_eixo']; previa() })
  escolha(d, 'Textura do telhado', o.texturaTelhado, Object.entries(TEX).map(([k, t]) => [k, t.nome]) as [string, string][], v => { o.texturaTelhado = v as TexId; previa() })
  const n = (rot: string, k: 'telhado_angulo' | 'telhado_beiral' | 'telhado_borda' | 'mureta_altura' | 'mureta_espessura' | 'saia_altura' | 'saia_folga' | 'telhado_casca', min: number, max: number, passo: number) =>
    controle(d, rot, o[k], min, max, v => { o[k] = v }, passo)
  n('Ângulo (graus)', 'telhado_angulo', 15, 60, 1); n('Beiral (mm)', 'telhado_beiral', 0, 6, .5); n('Borda das águas (mm)', 'telhado_borda', 1, 4, .1)
  n('Mureta: altura (mm)', 'mureta_altura', 0, 10, .5); n('Mureta: espessura (mm)', 'mureta_espessura', 1, 4, .1)
  const ck = Object.assign(document.createElement('input'), { type: 'checkbox', checked: o.ameias })
  ck.onchange = () => { o.ameias = ck.checked; previa() }
  d.append(campo('Ameias', ck))
  n('Casca do telhado (mm, 0 = maciço)', 'telhado_casca', 0, 5, .1); n('Saia: altura (mm)', 'saia_altura', 0, 6, .5); n('Saia: folga (mm)', 'saia_folga', 0, 1, .05)
}
// tema: grava textura, desgaste e tamanho da pedra nos controles; sem tema escolhido, nada muda
const temaSel = document.createElement('select'), texSel = document.createElement('select'), texParSel = document.createElement('select')
// ajustes avançados: um bloco por textura, só o da textura escolhida fica visível
const avancado = Object.fromEntries(Object.entries(TEX).map(([id, t]) => {
  const w = document.createElement('div')
  w.hidden = id !== o.textura && id !== texParede(o)
  $('pedra').append(w)
  grupo(t.knobs, o[id as TexId], t.secao, secoes(w, [...new Set(Object.values(t.secao))]))
  return [id, w]
}))
const mostraTextura = () => { texSel.value = o.textura; texParSel.value = o.texturaParede; for (const id in avancado) avancado[id].hidden = id !== o.textura && id !== texParede(o) }
opcoes(temaSel, [['', '—'], ...Object.entries(TEMAS).map(([k, t]) => [k, t.nome] as [string, string])])
temaSel.onchange = () => {
  if (!temaSel.value) return
  aplicaTema(o, TEMAS[temaSel.value]); mostraTextura()
  poePiso.desgaste(o.desgaste); poePiso.tamanho_pedra(o.tamanho_pedra)
  previa()
}
opcoes(texSel, Object.entries(TEX).map(([k, t]) => [k, t.nome] as [string, string]))
texSel.onchange = () => { o.textura = texSel.value as TexId; mostraTextura(); previa() }
opcoes(texParSel, [['', 'Igual ao piso'], ...Object.entries(TEX).map(([k, t]) => [k, t.nome] as [string, string])])
texParSel.onchange = () => { o.texturaParede = texParSel.value as Opcoes['texturaParede']; mostraTextura(); previa() }
$('gerais').prepend(campo('Tema', temaSel), campo('Textura', texSel), campo('Textura da parede', texParSel))
const dG = secoes($('op-guias'), ['Dimensões', 'Travas', 'Ímãs do grid', 'Economia'])
grupo(GUIAS, o, SECAO_GUIAS, dG)
const caixa = (pai: HTMLElement, rot: string, k: 'ima_borda' | 'ima_cruz' | 'ima_meio' | 'alivio') => {
  const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: o[k] })
  c.onchange = () => { o[k] = c.checked; previa() }
  pai.append(campo(rot, c))
}
const bClip = botao('Baixar clip', () => $('baixarClip').click(), 'Exporta o clip separado'); bClip.hidden = o.trava !== 'clip'
escolha(dG['Travas'], 'Trava', o.trava, [['nenhuma', 'Nenhuma'], ['clip', 'Clip separado'], ['macho', 'Macho e fêmea']], v => { o.trava = v as Opcoes['trava']; bClip.hidden = v !== 'clip'; previa() })
dG['Travas'].append(bClip)
caixa(dG['Ímãs do grid'], 'Borda', 'ima_borda'); caixa(dG['Ímãs do grid'], 'Cruzamento das nervuras', 'ima_cruz'); caixa(dG['Ímãs do grid'], 'Meio da nervura', 'ima_meio')
caixa(dG['Economia'], 'Alívio sob o fundo (precisa de fundo fechado)', 'alivio')
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

const estado = $('estado'), baixar = $('baixar') as HTMLButtonElement, cancela = $('cancela'), baixarTelhado = $('baixarTelhado') as HTMLButtonElement, baixarClip = $('baixarClip') as HTMLButtonElement
baixar.onclick = async () => { // roda num worker; os parâmetros ficam congelados no clique
  const t = performance.now(), p = peca(), s = structuredClone(o), f = FORMATOS[s.formato]
  s.paredes = paredesValidas(s)
  const nome = p === 'piso' ? `Piso ${TEX[s.textura].nome} ${f} ${s.linhas}x${s.colunas} s${s.semente}` : `${p === 'grid' ? 'Grid' : 'Degrau'} ${f} ${s.grid_linhas}x${s.grid_colunas}`
  baixar.disabled = baixarTelhado.disabled = baixarClip.disabled = true; cancela.hidden = false
  estado.textContent = 'Gerando...'
  try {
    const r = await exporta({ tipo: 'exporta', peca: p, o: s }, e => { estado.textContent = e })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([r.stl], { type: 'model/stl' }))
    a.download = nome + '.stl'
    a.click()
    estado.textContent = `${r.tri} triângulos em ${((performance.now() - t) / 1000).toFixed(1)} s`
  } catch (e) { estado.textContent = e === 'cancelado' ? 'Cancelado.' : `Erro: ${e}` }
  finally { baixar.disabled = baixarTelhado.disabled = baixarClip.disabled = false; cancela.hidden = true }
}
baixarTelhado.onclick = async () => {
  const s = structuredClone(o); s.paredes = paredesValidas(s)
  baixar.disabled = baixarTelhado.disabled = baixarClip.disabled = true; cancela.hidden = false
  estado.textContent = 'Gerando o telhado...'
  try {
    const r = await exporta({ tipo: 'exporta', peca: 'telhado', o: s }, e => { estado.textContent = e })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([r.stl], { type: 'model/stl' }))
    a.download = `Telhado ${s.telhado_forma} ${TEX[s.texturaTelhado].nome} ${s.linhas}x${s.colunas} s${s.semente}.stl`; a.click()
    estado.textContent = `Telhado: ${r.tri} triângulos`
  } catch (e) { estado.textContent = e === 'cancelado' ? 'Cancelado.' : `Erro: ${e}` }
  finally { baixar.disabled = baixarTelhado.disabled = baixarClip.disabled = false; cancela.hidden = true }
}
baixarClip.onclick = async () => {
  const s = structuredClone(o)
  baixar.disabled = baixarTelhado.disabled = baixarClip.disabled = true; cancela.hidden = false
  estado.textContent = 'Gerando o clip...'
  try {
    const r = await exporta({ tipo: 'exporta', peca: 'clip', o: s }, e => { estado.textContent = e })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([r.stl], { type: 'model/stl' }))
    a.download = `Clip ${s.trava_comprimento}mm.stl`; a.click()
    estado.textContent = `Clip: ${r.tri} triângulos`
  } catch (e) { estado.textContent = e === 'cancelado' ? 'Cancelado.' : `Erro: ${e}` }
  finally { baixar.disabled = baixarTelhado.disabled = baixarClip.disabled = false; cancela.hidden = true }
}
cancela.onclick = cancelaExporta
montaSistema()
vaiPara(1)
