// Página do editor de mapa: barra lateral (mapa, ferramentas, textura, níveis, salas) e o canvas 2D. #vista3d é o lugar da vista 3D (T6).
import { TEX, type TexId } from '../textura'
import { TEMAS } from '../temas'
import type { Sistema } from '../sistema'
import { abrir, cria, salvar } from './modelo'
import { ajusta, aoMudar, atualiza, carrega, desfaz, edita, ed, gira, iniciaEditor, reenquadra, refaz, type Ferr } from './editor2d'

// Padrões de SISTEMA (sistema.ts) copiados aqui: importar sistema.ts puxaria o WASM, que não cabe nesta página.
const PADRAO = {
  largura: 35, comprimento: 35, altura_pe: 6, recuo: 4, chanfro: .8, conicidade: 0, ombro: 2.5, nervura: 3, folga: .15, folga_fundo: .3,
  ima_d: 0, ima_h: 2, folga_ima: .15, fundo: 0, chanfro_furo: 0, chanfro_furo_ang: 45,
}
const sistemaPadrao = (formato: Sistema['formato'], largura: number): Sistema => ({ ...PADRAO, largura, comprimento: largura, formato })

const FERRAMENTAS: [Ferr, string, string][] = [
  ['piso', 'Piso', 'P'], ['apagar', 'Apagar', 'E'], ['parede', 'Parede', 'W'], ['porta', 'Porta', 'D'], ['janela', 'Janela', 'J'], ['arco', 'Arco', 'A'],
  ['coluna', 'Coluna', 'C'], ['rampa', 'Rampa', 'M'], ['escada', 'Escada', 'S'], ['sala', 'Sala', 'T'], ['corte', 'Corte', 'X'],
]
const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (t: string) => t.replace(/[&<>"]/g, c => ENT[c])
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const lim = (v: string, a: number, b: number) => Math.min(b, Math.max(a, Math.round(Number(v)) || a))
const nivelAtual = () => ed.m.niveis[ed.niv]
const proximoId = (p: string, usados: string[]) => { let k = 1; while (usados.includes(p + k)) k++; return p + k }

const nomeEl = $<HTMLInputElement>('nome'), formatoEl = $<HTMLSelectElement>('formato'), larguraEl = $<HTMLInputElement>('largura')
const arquivoEl = $<HTMLInputElement>('arquivo'), texEl = $<HTMLSelectElement>('textura'), sentidoEl = $<HTMLButtonElement>('sentido')
const niveisEl = $('niveis'), nomeNivelEl = $<HTMLInputElement>('nomeNivel'), baseEl = $<HTMLInputElement>('base')
const excluirEl = $<HTMLButtonElement>('excluirNivel'), salasEl = $('salas'), estadoEl = $('estado')

function renderUI() {
  const m = ed.m, n = nivelAtual(), celulas = m.niveis.reduce((t, x) => t + Object.keys(x.celulas).length, 0)
  nomeEl.value = m.nome
  document.querySelectorAll<HTMLButtonElement>('[data-ferr]').forEach(b => b.classList.toggle('ativo', b.dataset.ferr === ed.ferr))
  sentidoEl.textContent = `Sentido: ${ed.dir} (tecla R)`
  texEl.value = ed.tex
  niveisEl.innerHTML = m.niveis.map((x, i) => `<button data-n="${i}"${i === ed.niv ? ' class="ativo"' : ''}>${esc(x.nome)}</button>`).join('') + '<button data-n="novo">+ nível</button>'
  nomeNivelEl.value = n.nome
  baseEl.value = String(n.base)
  excluirEl.disabled = m.niveis.length < 2
  salasEl.innerHTML = n.salas.map((s, i) => `<div class="sala${s.id === ed.sala ? ' ativa' : ''}" data-i="${i}">
    <div class="linha"><button data-sel="${i}">${s.id === ed.sala ? 'Atual' : 'Usar'}</button><input data-f="nome" value="${esc(s.nome)}"></div>
    <div class="linha"><select data-f="tema"><option value="">—</option>${Object.entries(TEMAS).map(([k, t]) => `<option value="${k}"${k === s.tema ? ' selected' : ''}>${t.nome}</option>`).join('')}</select></div>
    <div class="linha">Máx. linhas <input type="number" min="1" max="6" data-f="lin" value="${s.max[0]}"> colunas <input type="number" min="1" max="6" data-f="col" value="${s.max[1]}"></div>
  </div>`).join('')
  estadoEl.textContent = `${m.sistema.formato === 'hexagono' ? 'Hexágono' : 'Quadrado'} de ${m.sistema.largura} mm · ${celulas} células · ${m.niveis.length} nível(is)`
}

function novoNivel() {
  edita(() => {
    const id = proximoId('n', ed.m.niveis.map(x => x.id)), base = Math.min(12, nivelAtual().base + 1)
    ed.m.niveis.push({ id, nome: `Nível ${ed.m.niveis.length + 1}`, base, altura_parede: 30, celulas: {}, arestas: {}, colunas: {}, salas: [{ id: 's1', nome: 'Sala 1', tema: '', max: [3, 3], cortes: [] }] })
    ed.niv = ed.m.niveis.length - 1
    ed.sala = 's1'
  })
}

// Barra: mapa
$('novo').onclick = () => {
  const cheio = ed.m.niveis.some(n => Object.keys(n.celulas).length > 0)
  if (cheio && !confirm('Criar um mapa novo descarta o atual. Continuar?')) return
  carrega(cria(sistemaPadrao(formatoEl.value as Sistema['formato'], lim(larguraEl.value, 15, 100)), nomeEl.value.trim() || 'Mapa'))
}
$('abrirBtn').onclick = () => arquivoEl.click()
arquivoEl.onchange = async () => {
  const f = arquivoEl.files?.[0]
  arquivoEl.value = ''
  if (!f) return
  try { carrega(abrir(await f.text())) } catch (e) { alert((e as Error).message) }
}
// Modelos prontos: lista de public/mapas/indice.json (caminho relativo: o site roda em subpasta). Carregar entra no desfazer.
const modeloEl = $<HTMLSelectElement>('modelo'), vazioModelo = modeloEl.innerHTML
fetch('mapas/indice.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() }).then((lista: { arquivo: string; nome: string; descricao: string }[]) => {
  modeloEl.innerHTML = vazioModelo + lista.map(x => `<option value="${esc(x.arquivo)}" title="${esc(x.descricao)}">${esc(x.nome)}</option>`).join('')
}).catch(() => { modeloEl.disabled = true; modeloEl.title = 'Modelos indisponíveis' })
modeloEl.onchange = async () => {
  const arq = modeloEl.value
  modeloEl.value = ''
  if (!arq) return
  try {
    const txt = await fetch(`mapas/${arq}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
    const m = abrir(txt)
    reenquadra()
    edita(() => { ed.m = m; ed.niv = 0; ed.sala = '' })
  } catch (e) { alert(`Não foi possível abrir o modelo: ${(e as Error).message}`) }
}
$('salvarBtn').onclick = () => {
  const url = URL.createObjectURL(new Blob([salvar(ed.m)], { type: 'application/json' })), a = document.createElement('a')
  a.href = url
  a.download = ed.m.nome.replace(/[\\/:*?"<>|]/g, '_') + '.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
$('desfazer').onclick = desfaz
$('refazer').onclick = refaz
nomeEl.onchange = () => edita(() => { ed.m.nome = nomeEl.value.trim() || 'Mapa' })
// Vista 3D: módulo carregado na primeira vez (import dinâmico: o 2D não paga o three)
type Vista3d = typeof import('./vista3d')
let v3p: Promise<Vista3d> | undefined, em3d = false, ultimo = '', tempo = 0
const cvEl = $('cv'), vista3dEl = $('vista3d'), barra3dEl = $('barra3d'), caixasEl = $<HTMLInputElement>('soCaixas'), progEl = $('progresso')
$('alternaVista').onclick = async () => {
  em3d = !em3d
  vista3dEl.hidden = !em3d; cvEl.hidden = em3d; barra3dEl.hidden = !em3d
  if (!em3d) return
  v3p ??= import('./vista3d').then(v => {
    v.iniciaVista3d(vista3dEl, (x, y) => { progEl.textContent = `Peças 3D: ${x}/${y}` })
    v.soCaixas(caixasEl.checked)
    return v
  })
  const v = await v3p
  if (em3d) { ultimo = salvar(ed.m); v.mostraMapa(ed.m) }
}
caixasEl.onchange = () => { v3p?.then(v => v.soCaixas(caixasEl.checked)) }
/** Com a vista 3D visível, mudança do mapa regera a 3D (300 ms de espera; ignora mudanças que não são do mapa). */
function agendaVista() {
  if (!em3d || !v3p) return
  clearTimeout(tempo)
  tempo = window.setTimeout(async () => {
    const s = salvar(ed.m)
    if (s === ultimo) return
    ultimo = s
    ;(await v3p!).mostraMapa(ed.m)
  }, 300)
}

// Barra: ferramentas e textura
$('ferramentas').innerHTML = FERRAMENTAS.map(([f, nome, tecla]) => `<button data-ferr="${f}">${nome} <small>${tecla}</small></button>`).join('')
$('ferramentas').onclick = e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ferr]')
  if (b) { ed.ferr = b.dataset.ferr as Ferr; atualiza() }
}
sentidoEl.onclick = gira
texEl.innerHTML = Object.entries(TEX).map(([k, t]) => `<option value="${k}">${t.nome}</option>`).join('')
texEl.onchange = () => { ed.tex = texEl.value as TexId }

// Barra: níveis
niveisEl.onclick = e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!b) return
  if (b.dataset.n === 'novo') return novoNivel()
  ed.niv = Number(b.dataset.n); ed.sala = ''; ajusta(); atualiza()
}
nomeNivelEl.onchange = () => edita(() => { nivelAtual().nome = nomeNivelEl.value.trim() || 'Nível' })
baseEl.onchange = () => edita(() => { nivelAtual().base = lim(baseEl.value, 0, 12) })
excluirEl.onclick = () => {
  if (ed.m.niveis.length < 2 || !confirm(`Excluir o nível "${nivelAtual().nome}" e tudo o que tem nele?`)) return
  edita(() => { ed.m.niveis.splice(ed.niv, 1); ed.niv = Math.max(0, ed.niv - 1); ed.sala = '' })
}

// Barra: salas do nível
$('novaSala').onclick = () => edita(() => {
  const n = nivelAtual(), id = proximoId('s', n.salas.map(x => x.id))
  n.salas.push({ id, nome: `Sala ${n.salas.length + 1}`, tema: '', max: [3, 3], cortes: [] })
  ed.sala = id
})
salasEl.onclick = e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-sel]')
  if (b) { ed.sala = nivelAtual().salas[Number(b.dataset.sel)].id; atualiza() }
}
salasEl.onchange = e => {
  const t = e.target as HTMLInputElement | HTMLSelectElement, s = nivelAtual().salas[Number(t.closest<HTMLElement>('[data-i]')?.dataset.i)], f = t.dataset.f
  if (!s) return
  edita(() => {
    if (f === 'nome') s.nome = t.value.trim() || s.nome
    if (f === 'tema') s.tema = t.value
    if (f === 'lin') s.max[0] = lim(t.value, 1, 6)
    if (f === 'col') s.max[1] = lim(t.value, 1, 6)
  })
}

iniciaEditor($<HTMLCanvasElement>('cv'))
aoMudar(renderUI)
aoMudar(agendaVista)
carrega(cria(sistemaPadrao('quadrado', 35), 'Mapa'))
