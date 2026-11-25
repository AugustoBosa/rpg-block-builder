// Divisão do mapa em peças (puro: sem WASM; só modelo.ts e temas.ts). O editor 2D usa ao vivo.
import { arestaCanonica, chave, nLados, vizinho, type ArestaMapa, type CelulaMapa, type Dir, type Mapa, type Sala } from './modelo'
import type { Sistema } from '../sistema'
import type { TexId } from '../textura'
import { TEMAS } from '../temas'

type P2 = [number, number]
export const ESP = 6 // mm: espessura da parede e do reforço das quinas
const DIRS: Dir[] = ['+x', '+y', '-x', '-y'] // anti-horário: +90° leva +x a +y

/** Parede, abertura ou reforço de uma peça. c, r: célula dona, relativa à peça; i: lado dela (orientação da peça).
 *  `reforco`: retângulo de `comp` mm a partir do vértice inicial do lado i (`ini`) ou do final, espessura ESP para dentro da dona. */
export interface Entrada { c: number; r: number; i: number; tipo: ArestaMapa['tipo'] | 'reforco'; tex?: TexId; ini?: boolean; comp?: number }
/** Descritor da peça. `linhas`/`colunas` são o tamanho (números); `colunasCel` são as colunas de célula (antes `colunas` na spec). */
export interface Peca {
  linhas: number; colunas: number; tex: TexId; texParede: TexId | ''; tipo: CelulaMapa['tipo']; dir?: Dir; tema: string; altura_parede: number
  paredes: Entrada[]; colunasCel: { c: number; r: number; lado: number }[]
}
/** `rot`: quartos de volta que levam a peça canônica à posição do mapa (no hexágono, 2 = 180°). */
export interface Instancia { chave: string; nivel: string; c0: number; r0: number; linhas: number; colunas: number; rot: 0 | 1 | 2 | 3; celulas: string[]; peca: Peca }
/** Grid (base 0, `pilha` 1) ou degraus empilhados (`pilha` = base do nível) num retângulo do mapa. */
export interface Suporte { tipo: 'grid' | 'degrau'; nivel: string; c0: number; r0: number; linhas: number; colunas: number; pilha: number }
type Ret = { c0: number; r0: number; linhas: number; colunas: number; cels: string[] }

/** Aplica uma transformação às entradas e colunas; `dir` gira junto (`voltas` quartos). */
const transforma = (p: Peca, cr: (c: number, r: number) => P2, lado: (i: number) => number, linhas: number, colunas: number, voltas: number): Peca => {
  const q: Peca = {
    ...p, linhas, colunas,
    paredes: p.paredes.map(e => { const [c, r] = cr(e.c, e.r); return { ...e, c, r, i: lado(e.i) } }),
    colunasCel: p.colunasCel.map(x => { const [c, r] = cr(x.c, x.r); return { ...x, c, r } }),
  }
  if (p.dir) q.dir = DIRS[(DIRS.indexOf(p.dir) + voltas) % 4]
  return q
}
/** Quarto de volta anti-horário (só quadrado): célula (c, r) vai a (linhas−1−r, c); lado i vai a i+1. */
const quarto = (p: Peca): Peca => transforma(p, (c, r) => [p.linhas - 1 - r, c], i => (i + 1) % 4, p.colunas, p.linhas, 1)
/** Meia volta: célula (c, r) vai a (colunas−1−c, linhas−1−r); lado i vai a i + k/2. */
const meia = (p: Peca, k: number): Peca => transforma(p, (c, r) => [p.colunas - 1 - c, p.linhas - 1 - r], i => (i + k / 2) % k, p.linhas, p.colunas, 2)

/** Gira a peça `rot` quartos de volta (hex: rot 2 = 180°). */
export function gira(p: Peca, s: Sistema, rot: number): Peca {
  if (s.formato === 'hexagono') return rot === 2 ? meia(p, 6) : p
  let q = p
  for (let t = 0; t < rot; t++) q = quarto(q)
  return q
}

/** Rotações permitidas (quartos de volta). Quadrado com célula quadrada e sem tábuas/tijolo: 0..3; senão 0 e 2. Hex: 0 e 2 com 1 coluna ou nº par de colunas; senão 0. */
export function rotacoes(p: Peca, s: Sistema): number[] {
  if (s.formato === 'hexagono') return p.colunas === 1 || p.colunas % 2 === 0 ? [0, 2] : [0]
  const t = TEMAS[p.tema]
  const direcional = [p.tex, p.texParede, t?.piso, t?.parede].some(x => x === 'tabuas' || x === 'tijolo')
  return s.largura === s.comprimento && !direcional ? [0, 1, 2, 3] : [0, 2]
}

/** JSON com chaves e entradas ordenadas: duas peças iguais dão a mesma string. */
const ordena = (x: unknown): unknown => Array.isArray(x)
  ? x.map(ordena).sort((a, b) => { const u = JSON.stringify(a), v = JSON.stringify(b); return u < v ? -1 : u > v ? 1 : 0 })
  : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, ordena((x as Record<string, unknown>)[k])])) : x
const chaveDe = (p: Peca) => JSON.stringify(ordena(p))

/** Forma canônica: a menor chave entre as rotações permitidas; `rot` é a inversa (leva a canônica ao mapa). */
function canonica(p: Peca, s: Sistema): { peca: Peca; rot: 0 | 1 | 2 | 3; chave: string } {
  let melhor: { peca: Peca; r: number; chave: string } | undefined
  for (const r of rotacoes(p, s)) { const g = gira(p, s, r), k = chaveDe(g); if (!melhor || k < melhor.chave) melhor = { peca: g, r, chave: k } }
  const m = melhor!
  return { peca: m.peca, rot: (s.formato === 'hexagono' ? m.r : (4 - m.r) % 4) as 0 | 1 | 2 | 3, chave: m.chave }
}

/** Retângulos sobre as células de `lista` (ordem r, c): da primeira livre cresce o maior que `cabe` aceita, até maxL×maxC. Hex: com mais de 1 coluna só começa em coluna par. Marca `usado`. */
function retangulos(lista: P2[], usado: Set<string>, maxL: number, maxC: number, hex: boolean, cabe: (c0: number, r0: number, L: number, C: number) => boolean): Ret[] {
  const out: Ret[] = []
  for (const [c0, r0] of lista) {
    if (usado.has(chave(c0, r0))) continue
    const maxCol = hex && (c0 & 1) ? 1 : maxC
    let L = 1, C = 1
    for (let l = 1; l <= maxL; l++) for (let c = 1; c <= maxCol; c++) if (l * c > L * C || (l * c === L * C && c > C)) if (cabe(c0, r0, l, c)) { L = l; C = c }
    const cels: string[] = []
    for (let r = r0; r < r0 + L; r++) for (let c = c0; c < c0 + C; c++) { usado.add(chave(c, r)); cels.push(chave(c, r)) }
    out.push({ c0, r0, linhas: L, colunas: C, cels })
  }
  return out
}

/** Suportes (grids ou degraus) de um conjunto de células: mesma divisão das peças, sem olhar paredes nem salas. */
function suportesDe(ks: Set<string>, tipo: Suporte['tipo'], nivel: string, pilha: number, max: number, hex: boolean): Suporte[] {
  const usado = new Set<string>()
  const lista = [...ks].map(k => k.split(',').map(Number) as P2).sort(([c1, r1], [c2, r2]) => r1 - r2 || c1 - c2)
  const cabe = (c0: number, r0: number, L: number, C: number) => {
    for (let r = r0; r < r0 + L; r++) for (let c = c0; c < c0 + C; c++) if (!ks.has(chave(c, r)) || usado.has(chave(c, r))) return false
    return true
  }
  return retangulos(lista, usado, max, max, hex, cabe).map(q => ({ tipo, nivel, c0: q.c0, r0: q.r0, linhas: q.linhas, colunas: q.colunas, pilha }))
}

export function dividir(m: Mapa, nivelId: string): Instancia[] { return dividirComAvisos(m, nivelId, []) }

/** Divide um nível em peças (retângulos por sala, sem barreira por dentro). Paredes ficam na dona; reforços nas quinas côncavas. */
function dividirComAvisos(m: Mapa, nivelId: string, avisos: string[]): Instancia[] {
  const n = m.niveis.find(x => x.id === nivelId)
  if (!n) throw new Error(`Nível "${nivelId}" não existe.`)
  const s = m.sistema, K = nLados(s), hex = s.formato === 'hexagono'
  const cel = (c: number, r: number) => n.celulas[chave(c, r)] as CelulaMapa | undefined
  const at = (a: P2) => cel(a[0], a[1])
  const sala = (id: string) => n.salas.find(x => x.id === id) as Sala
  const ehRampa = (x: CelulaMapa) => x.tipo !== 'piso'
  const ladoPara = (a: P2, b: P2) => { for (let i = 0; i < K; i++) { const [x, y] = vizinho(s, a[0], a[1], i); if (x === b[0] && y === b[1]) return i } return -1 }
  const temParede = (a: P2, b: P2) => { const i = ladoPara(a, b); return i >= 0 && n.arestas[arestaCanonica(s, a[0], a[1], i)] !== undefined }
  // aresta (c, r, i) separa duas células que não podem ficar na mesma peça
  const barreira = (c: number, r: number, i: number) => {
    const A = cel(c, r), [c2, r2] = vizinho(s, c, r, i), B = cel(c2, r2)
    if (!A || !B || A.sala !== B.sala || A.tex !== B.tex || A.tipo !== B.tipo || A.dir !== B.dir) return true
    const k = arestaCanonica(s, c, r, i)
    return n.arestas[k] !== undefined || (n.salas.find(x => x.id === A.sala)?.cortes ?? []).includes(k)
  }

  // 1. retângulos por sala: da primeira célula livre (ordem r, c), o maior que cabe até sala.max
  const usado = new Set<string>(), pos: Ret[] = []
  const todas = Object.keys(n.celulas).map(k => k.split(',').map(Number) as P2)
  for (const sa of n.salas) {
    const lista = todas.filter(([c, r]) => n.celulas[chave(c, r)].sala === sa.id).sort(([c1, r1], [c2, r2]) => r1 - r2 || c1 - c2)
    pos.push(...retangulos(lista, usado, sa.max[0], sa.max[1], hex, (c0, r0, L, C) => {
      for (let r = r0; r < r0 + L; r++) for (let c = c0; c < c0 + C; c++) {
        const x = cel(c, r)
        if (!x || x.sala !== sa.id || usado.has(chave(c, r))) return false
        for (let i = 0; i < K; i++) {
          const [c2, r2] = vizinho(s, c, r, i)
          if (c2 >= c0 && c2 < c0 + C && r2 >= r0 && r2 < r0 + L && barreira(c, r, i)) return false
        }
      }
      return true
    }))
  }
  const atrib = new Map<string, number>()
  pos.forEach((q, j) => q.cels.forEach(k => atrib.set(k, j)))

  const ent: Entrada[][] = pos.map(() => [])
  const cols: { c: number; r: number; lado: number }[][] = pos.map(() => [])
  const rel = (j: number, c: number, r: number) => ({ c: c - pos[j].c0, r: r - pos[j].r0 })

  // 2. paredes: dona = célula não rampa/escada; empate → a canônica (a que a chave cita)
  const donoDe = new Map<string, string>() // aresta canônica → chave da célula dona
  for (const k of Object.keys(n.arestas)) {
    const [c, r, i] = k.split(',').map(Number), a = n.arestas[k], [c2, r2] = vizinho(s, c, r, i), j2 = (i + K / 2) % K
    const A = cel(c, r), B = cel(c2, r2)
    let dono: [number, number, number] | undefined
    if (A && !ehRampa(A)) dono = [c, r, i]
    else if (B && !ehRampa(B)) dono = [c2, r2, j2]
    if (!dono) { avisos.push(`Parede na aresta ${k} some: só há rampa ou escada do lado dela.`); continue }
    donoDe.set(k, chave(dono[0], dono[1]))
    const j = atrib.get(chave(dono[0], dono[1]))
    if (j === undefined) continue
    ent[j].push({ ...rel(j, dono[0], dono[1]), i: dono[2], tipo: a.tipo, ...(a.tex ? { tex: a.tex } : {}) })
  }
  // 3. colunas de célula
  for (const k of Object.keys(n.colunas)) {
    const [c, r] = k.split(',').map(Number), j = atrib.get(chave(c, r))
    if (j !== undefined) cols[j].push({ ...rel(j, c, r), lado: n.colunas[k].lado })
  }
  // 4. reforços nas quinas côncavas (dono = peça que recebe; só piso)
  const ref = (a: P2, i: number, ini: boolean, comp: number) => {
    const j = atrib.get(chave(a[0], a[1]))
    if (j !== undefined) ent[j].push({ ...rel(j, a[0], a[1]), i, tipo: 'reforco', ini, comp })
  }
  const donaDe = (a: P2, b: P2) => donoDe.get(arestaCanonica(s, a[0], a[1], ladoPara(a, b))) === chave(a[0], a[1]) // a é dona da parede a|b
  const reforcoEm = (D: P2, Y: P2, X: P2, comp: number) => { // D ganha retângulo ao longo do lado para Y, a partir do vértice comum com X
    if (!at(D) || ehRampa(at(D)!) || !donaDe(D, X)) return // só a dona da parede X|D tem a faixa a emendar
    const iY = ladoPara(D, Y), iX = ladoPara(D, X)
    ref(D, iY, iX !== (iY + 1) % K, comp)
  }
  const vistos = new Set<string>()
  for (const k of Object.keys(n.celulas)) {
    const [c, r] = k.split(',').map(Number)
    for (let j = 0; j < K; j++) {
      const N1 = vizinho(s, c, r, j) as P2, N2 = vizinho(s, c, r, (j + 1) % K) as P2
      const roda: P2[] = hex ? [[c, r], N1, N2] : [[c, r], N1, vizinho(s, N1[0], N1[1], (j + 1) % K) as P2, N2] // em volta do vértice, em ordem
      const id = roda.map(a => chave(a[0], a[1])).sort().join('|')
      if (vistos.has(id)) continue
      vistos.add(id)
      const L = roda.length
      for (let p = 0; p < L; p++) {
        if (!hex) { // quadrado: P sem parede do lado de A e de B; Q (diagonal) livre: ganha poste e×e no canto
          const Pc = roda[p], A = roda[(p + 3) % 4], Q = roda[(p + 2) % 4], B = roda[(p + 1) % 4]
          if (!temParede(Pc, A) || !temParede(Pc, B)) continue
          if (!at(A) || !at(B) || !at(Q) || temParede(Q, A) || temParede(Q, B) || ehRampa(at(Q)!)) continue
          if (!donaDe(A, Pc) || !donaDe(B, Pc)) continue // buraco no canto Q só quando as duas paredes estão fora de P
          const iA = ladoPara(Q, A), iB = ladoPara(Q, B)
          ref(Q, iA, iB !== (iA + 1) % K, ESP)
        } else { // hex: X com paredes para D1 e D2, D1|D2 sem parede: cada dono ganha 1,155·e ao longo da aresta interna
          const X = roda[p], D1 = roda[(p + 1) % 3], D2 = roda[(p + 2) % 3]
          if (!temParede(X, D1) || !temParede(X, D2) || temParede(D1, D2) || !at(D1) || !at(D2)) continue
          reforcoEm(D1, D2, X, 1.155 * ESP)
          reforcoEm(D2, D1, X, 1.155 * ESP)
        }
      }
    }
  }

  // 5. peças: textura da parede (uniforme na peça), canônica e chave
  const out: Instancia[] = []
  pos.forEach((q, j) => {
    const c0 = at([q.c0, q.r0])!
    const texs = [...new Set(ent[j].filter(e => e.tipo !== 'reforco').map(e => e.tex ?? ''))]
    if (texs.length > 1) avisos.push(`Peça em (${q.c0},${q.r0}) tem paredes com texturas diferentes: usa a primeira.`)
    const texParede = (texs.find(t => t) ?? '') as TexId | ''
    const peca: Peca = {
      linhas: q.linhas, colunas: q.colunas, tex: c0.tex, texParede, tipo: c0.tipo, tema: sala(c0.sala).tema, altura_parede: n.altura_parede,
      paredes: ent[j], colunasCel: cols[j], ...(c0.tipo !== 'piso' && c0.dir ? { dir: c0.dir } : {}),
    }
    const cn = canonica(peca, s)
    out.push({ chave: cn.chave, nivel: n.id, c0: q.c0, r0: q.r0, linhas: q.linhas, colunas: q.colunas, rot: cn.rot, celulas: q.cels, peca: cn.peca })
  })
  return out
}

/** Divisão de todos os níveis: peças únicas (chave → peça e quantidade), instâncias, suportes (grids e degraus), extras (contagem por tipo e tamanho) e avisos. */
export function tileset(m: Mapa) {
  const avisos: string[] = [], instancias = m.niveis.flatMap(x => dividirComAvisos(m, x.id, avisos))
  const pecas = new Map<string, { peca: Peca; qtd: number }>()
  for (const it of instancias) { const e = pecas.get(it.chave); if (e) e.qtd++; else pecas.set(it.chave, { peca: it.peca, qtd: 1 }) }
  const hex = m.sistema.formato === 'hexagono', base0 = m.niveis.filter(x => x.base === 0)
  const grades = new Set<string>(); base0.forEach(n => Object.keys(n.celulas).forEach(k => grades.add(k)))
  const suportes: Suporte[] = suportesDe(grades, 'grid', base0[0]?.id ?? '', 1, 6, hex)
  for (const n of m.niveis) if (n.base > 0) suportes.push(...suportesDe(new Set(Object.keys(n.celulas)), 'degrau', n.id, n.base, 3, hex))
  const extras = new Map<string, { tipo: Suporte['tipo']; linhas: number; colunas: number; qtd: number }>()
  for (const x of suportes) { const k = `${x.tipo}:${x.linhas}x${x.colunas}`, e = extras.get(k); if (e) e.qtd += x.pilha; else extras.set(k, { tipo: x.tipo, linhas: x.linhas, colunas: x.colunas, qtd: x.pilha }) }
  const acesso = m.niveis.some(n => Object.values(n.celulas).some(c => c.tipo !== 'piso'))
  for (const n of m.niveis) if (n.base > 0 && !acesso) avisos.push(`Nível "${n.nome}" está elevado e não tem escada nem rampa de acesso.`)
  return { pecas, instancias, avisos, suportes, extras }
}
