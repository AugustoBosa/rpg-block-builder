// Exportação do tileset: peças únicas, grids, degraus (STL via cliente.ts), manifesto, planta por nível, mapa.json e ZIP. Sem WASM aqui: as Opcoes vêm do pecas.worker.
import { chave, centroMundo, nLados, salvar, vizinho, type Mapa, type Nivel } from './modelo'
import { tileset, type Peca } from './divisao'
import { lados } from './editor2d'
import { zip, type Arquivo } from './zip'
import type { Opcoes } from '../bloco'

type Tileset = ReturnType<typeof tileset>
type P2 = [number, number]
export interface Item {
  id: string; kind: 'piso' | 'grid' | 'degrau'; caminho: string; desc: string; qtd: number; linhas: number; colunas: number
  chave?: string; nivel: string; sala: string; peca?: Peca
}
const ROTULO = { piso: 'Peça', grid: 'Grid', degrau: 'Degrau' }
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const num = (i: number) => String(i).padStart(2, '0')

/** Ids e caminhos: P01… (peças, ordem de t.pecas), G01… e D01… (grids e degraus, ordem de t.extras). */
export function planoExporta(m: Mapa): { itens: Item[]; t: Tileset } {
  const t = tileset(m), itens: Item[] = []
  let p = 0
  for (const [k, { peca, qtd }] of t.pecas) {
    const it = t.instancias.find(x => x.chave === k)!, sala = m.niveis.find(n => n.id === it.nivel)!.celulas[it.celulas[0]].sala
    const paredes = peca.paredes.filter(e => e.tipo !== 'reforco').length
    const desc = slug(`${peca.linhas}x${peca.colunas}_${peca.tex}_${paredes}paredes${peca.tipo === 'piso' ? '' : '_' + peca.tipo}`)
    const id = `P${num(++p)}`
    itens.push({ id, kind: 'piso', caminho: `pecas/${id}_${desc}.stl`, desc, qtd, linhas: peca.linhas, colunas: peca.colunas, chave: k, nivel: it.nivel, sala, peca })
  }
  let g = 0, d = 0
  for (const e of t.extras.values()) {
    const grade = e.tipo === 'grid', id = grade ? `G${num(++g)}` : `D${num(++d)}`, desc = `${e.tipo}_${e.linhas}x${e.colunas}`
    itens.push({ id, kind: e.tipo, caminho: `${grade ? 'grids' : 'degraus'}/${id}_${desc}.stl`, desc, qtd: e.qtd, linhas: e.linhas, colunas: e.colunas, nivel: '', sala: '' })
  }
  return { itens, t }
}

/** Tamanho e tempo estimados. Chute: 1×1 ≈ 11 MB de STL, cresce com área^0,75; grid/degrau ≈ 1 MB; ~20 MB por minuto (não medido). */
export function estimativa(m: Mapa) {
  const { itens } = planoExporta(m)
  const mb = itens.reduce((s, it) => s + (it.kind === 'piso' ? 11 * (it.linhas * it.colunas) ** .75 : 1), 0)
  return { pecas: itens.filter(i => i.kind === 'piso').length, arquivos: itens.length + m.niveis.length + 2, mb, minutos: mb / 20 }
}

/** Trabalhador de peças dedicado (espera 'pronto': mensagem antes do WASM carregar se perde). Termina ao fim. */
async function trabalhador<T>(fn: (pede: <R>(q: object) => Promise<R>) => Promise<T>): Promise<T> {
  const w = new Worker(new URL('./pecas.worker.ts', import.meta.url), { type: 'module' })
  try {
    await new Promise<void>((ok, no) => {
      w.onerror = e => no(new Error(`Worker de peças falhou: ${e.message}`))
      w.onmessage = ({ data }) => { if (data === 'pronto') ok() }
    })
    return await fn(<R>(q: object) => new Promise<R>((ok, no) => {
      w.onerror = e => no(new Error(`Worker de peças falhou: ${e.message}`))
      w.onmessage = ({ data }) => data.erro ? no(new Error(data.erro)) : ok(data)
      w.postMessage(q)
    }))
  } finally { w.terminate() }
}

/** Opções do item (peça, grid ou degrau) e STL dele, com cliente.ts (import dinâmico: cria workers ao carregar). */
async function gera(it: Item, m: Mapa, pede: <R>(q: object) => Promise<R>, etapa: (s: string) => void) {
  const { exporta } = await import('../cliente')
  const { o } = it.kind === 'piso'
    ? await pede<{ o: Opcoes }>({ tipo: 'opcoes', m, nivel: it.nivel, sala: it.sala, peca: it.peca! })
    : await pede<{ o: Opcoes }>({ tipo: 'opcoesSuporte', m, sup: it.kind as 'grid' | 'degrau', linhas: it.linhas, colunas: it.colunas })
  return exporta({ tipo: 'exporta', peca: it.kind, o }, etapa)
}

/** Planta de um nível em mm: células cinza, contorno de cada instância, id no centro, paredes grossas. */
function montagem(m: Mapa, n: Nivel, t: Tileset, ids: Map<string, string>): string {
  const s = m.sistema, K = nLados(s), cels = Object.keys(n.celulas)
  const pol = (k: string) => { const [c, r] = k.split(',').map(Number); return lados(s, c, r) }
  const pts = cels.flatMap(k => pol(k).map(e => e[0]))
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), mg = 5
  const x0 = Math.min(...xs) - mg, y0 = Math.min(...ys) - mg, w = Math.max(...xs) - x0 + mg, h = Math.max(...ys) - y0 + mg
  const f = (v: number) => +v.toFixed(2)
  const linha = (a: P2, b: P2, cor: string, larg: number) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${cor}" stroke-width="${larg}"/>`
  const cinza = cels.map(k => `<polygon points="${pol(k).map(e => `${f(e[0][0])},${f(e[0][1])}`).join(' ')}" fill="#d9d9d4"/>`)
  const contorno: string[] = [], rotulos: string[] = []
  for (const it of t.instancias.filter(i => i.nivel === n.id)) {
    const dentro = new Set(it.celulas)
    let sx = 0, sy = 0
    for (const k of it.celulas) {
      const [c, r] = k.split(',').map(Number), [cx, cy] = centroMundo(s, c, r)
      sx += cx; sy += cy
      lados(s, c, r).forEach(([a, b], i) => { const [c2, r2] = vizinho(s, c, r, i); if (!dentro.has(chave(c2, r2))) contorno.push(linha(a, b, '#222', 1)) })
    }
    rotulos.push(`<text x="${f(sx / it.celulas.length)}" y="${f(-sy / it.celulas.length)}">${ids.get(it.chave) ?? ''}</text>`)
  }
  const paredes = Object.keys(n.arestas).map(k => { const [c, r, i] = k.split(',').map(Number); const [a, b] = lados(s, c, r)[i]; return linha(a, b, '#000', 4) })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(-(y0 + h))} ${f(w)} ${f(h)}" width="${f(w)}mm" height="${f(h)}mm">
<g transform="scale(1,-1)">${cinza.join('')}${contorno.join('')}${paredes.join('')}</g>
<g font-family="sans-serif" font-size="6" text-anchor="middle" dominant-baseline="middle">${rotulos.join('')}</g>
</svg>
`
}

/** Exporta o tileset inteiro em ZIP. `sinal.cancelado` (ver cancelaExportacao) interrompe entre peças ou no STL em curso. */
export async function exportaMapa(m: Mapa, progresso: (s: string) => void, sinal: { cancelado: boolean }): Promise<Blob> {
  const { itens, t } = planoExporta(m), { cancelaExporta } = await import('../cliente')
  const arq: Arquivo[] = [], csv = ['id;descricao;qtd;triangulos;linhas;colunas'], avisos = [...t.avisos]
  const ids = new Map<string, string>(itens.flatMap(i => i.chave ? [[i.chave, i.id] as [string, string]] : []))
  await trabalhador(async pede => {
    for (const [i, it] of itens.entries()) {
      if (sinal.cancelado) { cancelaExporta(); throw 'cancelado' }
      const r = await gera(it, m, pede, s => progresso(`${ROTULO[it.kind]} ${i + 1}/${itens.length}: ${s}`))
      arq.push({ nome: it.caminho, dados: new Blob([r.stl]) })
      csv.push(`${it.id};${it.desc};${it.qtd};${r.tri};${it.linhas};${it.colunas}`)
      avisos.push(...(r.av ?? []))
    }
  })
  progresso('Montando o ZIP...')
  for (const n of m.niveis) arq.push({ nome: `montagem_${n.id}.svg`, dados: montagem(m, n, t, ids) })
  arq.push({ nome: 'manifesto.csv', dados: '﻿' + csv.join('\r\n') + '\r\n' })
  arq.push({ nome: 'mapa.json', dados: salvar(m) })
  if (avisos.length) arq.push({ nome: 'avisos.txt', dados: [...new Set(avisos)].join('\r\n') })
  return zip(arq)
}

/** Uma peça (ou grid/degrau) só, STL sem zip. */
export async function exportaPeca(m: Mapa, id: string, progresso: (s: string) => void): Promise<{ nome: string; blob: Blob }> {
  const it = planoExporta(m).itens.find(x => x.id === id)
  if (!it) throw new Error(`Peça ${id} não existe.`)
  const r = await trabalhador(pede => gera(it, m, pede, progresso))
  return { nome: it.caminho.split('/').pop()!, blob: new Blob([r.stl], { type: 'model/stl' }) }
}

/** Marca o sinal e interrompe o STL em curso (a exportação lança 'cancelado'). */
export function cancelaExportacao(sinal: { cancelado: boolean }) {
  sinal.cancelado = true
  void import('../cliente').then(c => c.cancelaExporta())
}
