// Modelo do editor de mapa: células, arestas, salas e níveis. Sem DOM, sem WASM (a geometria repete as contas de celula() sem importar sistema.ts, que carrega o WASM).
import type { Sistema } from '../sistema'
import { TEX, type TexId } from '../textura'

export type Dir = '+x' | '-x' | '+y' | '-y'
export interface CelulaMapa { tex: TexId; tipo: 'piso' | 'rampa' | 'escada'; dir?: Dir; sala: string }
export interface ArestaMapa { tipo: 'parede' | 'porta' | 'janela' | 'arco'; tex?: TexId }
export interface Sala { id: string; nome: string; tema: string; max: [number, number]; cortes: string[] }
export interface Nivel { id: string; nome: string; base: number; altura_parede: number; celulas: Record<string, CelulaMapa>; arestas: Record<string, ArestaMapa>; colunas: Record<string, { lado: number }>; salas: Sala[] }
export interface Mapa { versao: 1; nome: string; sistema: Sistema; niveis: Nivel[] }

const TEX_IDS = Object.keys(TEX), TIPOS = ['piso', 'rampa', 'escada'], ARESTAS = ['parede', 'porta', 'janela', 'arco'], DIRS: Dir[] = ['+x', '-x', '+y', '-y']
const INT2 = /^-?\d+,-?\d+$/, INT3 = /^-?\d+,-?\d+,\d+$/

function geo(s: Sistema) {
  if (s.formato === 'hexagono') {
    const F = s.largura, l = F / Math.sqrt(3), ang = [0, 1, 2, 3, 4, 5].map(i => (30 + 60 * i) * Math.PI / 180)
    return { hex: true, n: ang.map(t => [Math.cos(t), Math.sin(t)]), a: ang.map(() => F / 2), passo: [1.5 * l, F] }
  }
  return { hex: false, n: [[1, 0], [0, 1], [-1, 0], [0, -1]], a: [s.largura / 2, s.comprimento / 2, s.largura / 2, s.comprimento / 2], passo: [s.largura, s.comprimento] }
}
const deslocH = (g: ReturnType<typeof geo>, c: number) => g.hex && (c & 1) ? g.passo[1] / 2 : 0 // c & 1 vale para negativos também

export const chave = (c: number, r: number) => `${c},${r}`
export const nLados = (s: Sistema) => s.formato === 'hexagono' ? 6 : 4

export function centroMundo(s: Sistema, c: number, r: number): [number, number] {
  const g = geo(s)
  return [c * g.passo[0], r * g.passo[1] + deslocH(g, c)]
}

/** Vizinho do lado i pela geometria: acha a célula cujo centro cai em centro + 2·a·n. */
export function vizinho(s: Sistema, c: number, r: number, i: number): [number, number] {
  const g = geo(s), [x, y] = centroMundo(s, c, r), d = 2 * g.a[i]
  const tx = x + d * g.n[i][0], ty = y + d * g.n[i][1]
  const c2 = Math.round(tx / g.passo[0]), r2 = Math.round((ty - deslocH(g, c2)) / g.passo[1])
  return [c2, r2]
}

/** Chave da aresta: sempre pela célula com lado i < k/2. */
export function arestaCanonica(s: Sistema, c: number, r: number, i: number): string {
  const k = nLados(s)
  if (i < k / 2) return `${c},${r},${i}`
  const [c2, r2] = vizinho(s, c, r, i)
  return `${c2},${r2},${(i + k / 2) % k}`
}

export function cria(sistema: Sistema, nome = 'Mapa'): Mapa {
  const sala: Sala = { id: 's1', nome: 'Sala 1', tema: '', max: [3, 3], cortes: [] }
  return { versao: 1, nome, sistema: { ...sistema }, niveis: [{ id: 'terreo', nome: 'Térreo', base: 0, altura_parede: 30, celulas: {}, arestas: {}, colunas: {}, salas: [sala] }] }
}

const nivel = (m: Mapa, id: string) => {
  const n = m.niveis.find(x => x.id === id)
  if (!n) throw new Error(`Nível "${id}" não existe.`)
  return n
}

export function pinta(m: Mapa, nivelId: string, c: number, r: number, cel: CelulaMapa) {
  nivel(m, nivelId).celulas[chave(c, r)] = cel
}

/** Apaga a célula, a coluna dela e as arestas que ficarem sem célula nos dois lados. */
export function apaga(m: Mapa, nivelId: string, c: number, r: number) {
  const n = nivel(m, nivelId), s = m.sistema
  delete n.celulas[chave(c, r)]
  delete n.colunas[chave(c, r)]
  for (let i = 0; i < nLados(s); i++) {
    const [c2, r2] = vizinho(s, c, r, i)
    if (!n.celulas[chave(c2, r2)]) delete n.arestas[arestaCanonica(s, c, r, i)]
  }
}

export function poeAresta(m: Mapa, nivelId: string, s: Sistema, c: number, r: number, i: number, a: ArestaMapa) {
  nivel(m, nivelId).arestas[arestaCanonica(s, c, r, i)] = a
}

export function tiraAresta(m: Mapa, nivelId: string, s: Sistema, c: number, r: number, i: number) {
  delete nivel(m, nivelId).arestas[arestaCanonica(s, c, r, i)]
}

export function salvar(m: Mapa): string {
  return JSON.stringify(m, null, 2)
}

export function abrir(txt: string): Mapa {
  let o: any
  try { o = JSON.parse(txt) } catch { throw new Error('Arquivo de mapa inválido: não é JSON.') }
  if (!o || typeof o !== 'object') throw new Error('Arquivo de mapa inválido: a raiz não é um objeto.')
  if (o.versao !== 1) throw new Error(`Versão de mapa não suportada: ${o.versao} (esperada 1).`)
  const f = o.sistema?.formato
  if (f !== 'quadrado' && f !== 'hexagono') throw new Error(`Sistema inválido: formato "${f}" (use quadrado ou hexagono).`)
  if (!Array.isArray(o.niveis)) throw new Error('Mapa inválido: "niveis" precisa ser uma lista.')
  const k = nLados(o.sistema)
  for (const n of o.niveis) {
    if (!n || !Array.isArray(n.salas)) throw new Error('Nível inválido: falta a lista de salas.')
    const salas = new Set<string>(n.salas.map((x: Sala) => x.id))
    for (const [key, c] of Object.entries<any>(n.celulas ?? {})) {
      if (!INT2.test(key)) throw new Error(`Célula com chave inválida "${key}" (use "c,r" com inteiros).`)
      if (!TEX_IDS.includes(c.tex)) throw new Error(`Célula ${key}: textura "${c.tex}" não existe.`)
      if (!TIPOS.includes(c.tipo)) throw new Error(`Célula ${key}: tipo "${c.tipo}" inválido.`)
      if (c.dir !== undefined && !DIRS.includes(c.dir)) throw new Error(`Célula ${key}: sentido "${c.dir}" inválido.`)
      if (!salas.has(c.sala)) throw new Error(`Célula ${key}: sala "${c.sala}" não existe no nível "${n.id}".`)
    }
    for (const [key, a] of Object.entries<any>(n.arestas ?? {})) {
      if (!INT3.test(key)) throw new Error(`Aresta com chave inválida "${key}" (use "c,r,i").`)
      if (Number(key.split(',')[2]) >= k / 2) throw new Error(`Aresta ${key}: lado não canônico (i deve ser menor que ${k / 2}).`)
      if (!ARESTAS.includes(a.tipo)) throw new Error(`Aresta ${key}: tipo "${a.tipo}" inválido.`)
      if (a.tex && !TEX_IDS.includes(a.tex)) throw new Error(`Aresta ${key}: textura "${a.tex}" não existe.`)
    }
    for (const key of Object.keys(n.colunas ?? {})) if (!INT2.test(key)) throw new Error(`Coluna com chave inválida "${key}" (use "c,r" com inteiros).`)
  }
  return o as Mapa
}
