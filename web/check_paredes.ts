// Checks do DoD das paredes (docs/WORKFLOW_PAREDES.md §4). `npx tsx check_paredes.ts` lista PASS/FAIL e o valor medido.
// `--grava` regrava ref_hashes.json (baseline D2: STL de referência SEM paredes, gerados pelo código de 63e2f50). Só grave com o código sem paredes.
// D9 e o lado de interface do D10 só rodam no navegador: aparecem como TODO no fim.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fechada, final, padrao, piso, stl, type Malha } from './src/bloco'
import { pedra } from './src/pedra'
import { degrau, grid, malha, regiao } from './src/sistema'
import { ladoBloco, orfa, paredesValidas } from './src/aberturas'
import { aberturaNova, areaDentro, foraDaArea, paredeNova, parede, perfilAbertura, pisoComParedes, type OpcoesP, type Parede } from './src/parede'

const op = (e: Record<string, unknown> = {}): OpcoesP => ({ ...padrao(), paredes: [], ...e }) as OpcoesP
const hash = (m: Malha) => createHash('sha256').update(Buffer.from(stl(m))).digest('hex')
const volume = (m: Malha) => { // volume com sinal (mm³) pela soma dos tetraedros com a origem
  let v = 0
  const P = m.pos
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t] * 3, b = m.idx[t + 1] * 3, c = m.idx[t + 2] * 3
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])
  }
  return v / 6
}
const bbox = (m: Malha) => {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
  for (let i = 0; i < m.pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], m.pos[i]); hi[i % 3] = Math.max(hi[i % 3], m.pos[i]) }
  return { lo, hi }
}
const area2 = (L: [number, number][]) => Math.abs(L.reduce((s, [x, y], i) => s + x * L[(i + 1) % L.length][1] - L[(i + 1) % L.length][0] * y, 0) / 2)
const err = (v: number, ref: number) => ref === 0 ? Math.abs(v) : Math.abs(v - ref) / Math.abs(ref)
const pct = (x: number) => `${(x * 100).toFixed(3)} %`
const REF = 'ref_hashes.json'

// ---- D2: as 5 peças de referência (sem paredes) ----
const refs: Record<string, () => Promise<Malha>> = {
  'piso 1x1': () => pisoComParedes(op()),
  'piso 2x3 quadrado': () => pisoComParedes(op({ linhas: 2, colunas: 3 })),
  'piso 2x3 hexagono': () => pisoComParedes(op({ linhas: 2, colunas: 3, formato: 'hexagono' })),
  'grid': async () => malha(grid(op(), op().grid_linhas, op().grid_colunas)),
  'degrau': async () => malha(degrau(op(), op().grid_linhas, op().grid_colunas, op().altura_degrau)),
}
if (process.argv.includes('--grava')) {
  const h: Record<string, string> = {}
  for (const [k, f] of Object.entries(refs)) h[k] = hash(await f())
  writeFileSync(REF, JSON.stringify(h, null, 2) + '\n'); console.log('gravado', REF, h); process.exit(0)
}

// ---- cenários ----
const seg = (o: OpcoesP, i: number, n = 1, m = 1) => { const g = regiao(o, n, m).seg[i]; return { g, len: Math.hypot(g[2] - g[0], g[3] - g[1]) } }
const naAresta = (o: OpcoesP, i: number, id: string, extra: Partial<Parede> = {}): Parede =>
  ({ ...paredeNova(id, { tipo: 'aresta', celula: 0, lado: i }, seg(o, i, o.linhas, o.colunas).len), ...extra })
const noEixo = (eixo: 'x' | 'y' | 'h0' | 'h60', desloc: number, id: string, len = 30): Parede => paredeNova(id, { tipo: 'eixo', eixo, desloc }, len)
const D3: [string, (f: 'quadrado' | 'hexagono') => OpcoesP][] = [
  ['1 em aresta', f => { const o = op({ formato: f }); return { ...o, paredes: [naAresta(o, 0, 'a')] } }],
  ['uma em cada aresta', f => { const o = op({ formato: f }); return { ...o, paredes: regiao(o, 1, 1).seg.map((_, i) => naAresta(o, i, 'a' + i)) } }],
  ['1 em eixo', f => ({ ...op({ formato: f }), paredes: [noEixo('x', 3, 'e')] })],
  ['2 cruzadas em eixos', f => ({ ...op({ formato: f }), paredes: f === 'quadrado' ? [noEixo('x', 0, 'x'), noEixo('y', 0, 'y')] : [noEixo('h0', 0, 'x'), noEixo('h60', 0, 'y')] })],
  ['2x3 com 3 mistas', f => { const o = op({ formato: f, linhas: 2, colunas: 3 }); return { ...o, paredes: [naAresta(o, 0, 'a'), noEixo('x', 5, 'e'), naAresta(o, 1, 'b', { lado: 'dentro' })] } }],
  ['balanço, lado centro', f => { const o = op({ formato: f }); return { ...o, paredes: [naAresta(o, 0, 'a', { lado: 'centro', inicio: -8, comprimento: seg(o, 0).len + 16 })] } }],
]

// ---- testes ----
type R = string | true // texto = valor medido (PASS); lançar = FAIL
const T: [string, string, () => Promise<R>][] = []
const t = (id: string, nome: string, fn: () => Promise<R> | R) => T.push([id, nome, async () => fn()])

t('D1', 'tsc --noEmit sem erro', () => { execFileSync('npx', ['tsc', '--noEmit'], { shell: true, stdio: 'pipe' }); return '0 erros' })
t('D1', 'cli.ts "fechada: sim" nas 9 combinações (3 peças × quadrado/hexágono/2x3)', () => {
  let ok = 0
  for (const peca of ['piso', 'grid', 'degrau']) for (const extra of [[], ['--formato', 'hexagono'], ['--linhas', '2', '--colunas', '3', '--grid_linhas', '2', '--grid_colunas', '3']]) {
    const s = execFileSync(process.execPath, ['--import', 'tsx', 'cli.ts', process.env.TEMP + '/cli_paredes', '--peca', peca, ...extra], { encoding: 'utf8' })
    if (!s.includes('fechada: sim')) throw new Error(`NÃO fechada: ${peca} ${extra.join(' ')}`)
    ok++
  }
  return `${ok}/9`
})
t('D2', 'regressão: 5 STL de referência sem paredes com hash idêntico', async () => {
  if (!existsSync(REF)) throw new Error(`${REF} ausente (rode --grava no código sem paredes)`)
  const base = JSON.parse(readFileSync(REF, 'utf8')) as Record<string, string>
  let ok = 0
  const ruins: string[] = []
  for (const [k, f] of Object.entries(refs)) { if (hash(await f()) === base[k]) ok++; else ruins.push(k) }
  if (ok < 5) throw new Error(`${ok}/5, diferem: ${ruins.join(', ')}`)
  return `${ok}/5`
})
for (const f of ['quadrado', 'hexagono'] as const) for (const [nome, mk] of D3)
  t('D3', `malha fechada: ${f}, ${nome}`, async () => {
    const m = await pisoComParedes(mk(f))
    if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
    return 'fechada: sim'
  })
// uma parede em cada lado do contorno, comprimento pelo lado real (ladoBloco), em blocos multi-célula
for (const f of ['quadrado', 'hexagono'] as const) for (const [l, c] of [[2, 2], [3, 2]] as const)
  t('D3', `malha fechada: ${f} ${l}x${c}, contorno completo`, async () => {
    const o = op({ formato: f, linhas: l, colunas: c })
    const lados = [...Array(f === 'hexagono' ? 6 : 4).keys()].filter(i => ladoBloco(o, i))
    if (lados.length !== (f === 'hexagono' ? 6 : 4)) throw new Error(`só ${lados.length} lados`)
    const m = await pisoComParedes({ ...o, paredes: lados.map(i => paredeNova('a' + i, { tipo: 'aresta', celula: 0, lado: i }, +ladoBloco(o, i)!.L.toFixed(1))) })
    if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
    return `fechada: sim (${lados.length} paredes)`
  })
t('D3', 'parede em lado inexistente (hexágono → quadrado) é ignorada e listada como órfã', () => {
  const h = op({ formato: 'hexagono' }), p = paredeNova('a', { tipo: 'aresta', celula: 0, lado: 4 }, 10), q = { ...h, formato: 'quadrado' as const, paredes: [p] }
  if (orfa(h, p) || paredesValidas({ ...h, paredes: [p] }).length !== 1) throw new Error('lado 4 deveria existir no hexágono')
  if (!orfa(q, p) || paredesValidas(q).length !== 0) throw new Error('lado 4 deveria sumir no quadrado')
  return 'ok'
})
t('D4', 'volume da parede lisa = comprimento × altura × espessura', () => {
  const o = op(), p = { ...paredeNova('a', { tipo: 'eixo', eixo: 'x', desloc: 0 }, 35), altura: 30, espessura: 6 }
  const e = err(volume(parede({ ...o, paredes: [p] }, p)), 35 * 30 * 6)
  if (e > .005) throw new Error(pct(e)); return `erro ${pct(e)} (limite 0,5 %)`
})
t('D5', 'independência: mudar A não muda o hash da parede B isolada', () => {
  const o = op(), B = noEixo('y', 4, 'B', 25), A = noEixo('x', -3, 'A', 35)
  const h0 = hash(parede({ ...o, paredes: [A, B] }, B))
  const vars: Partial<Parede>[] = [{ comprimento: 10 }, { altura: 12 }, { espessura: 3 }, { lado: 'dentro' }, { inicio: 5 }, { ancora: { tipo: 'eixo', eixo: 'y', desloc: 9 } }, { aberturas: [aberturaNova('porta')] }]
  let ok = 0
  for (const v of vars) if (hash(parede({ ...o, paredes: [{ ...A, ...v }, B] }, B)) === h0) ok++
  if (ok < vars.length) throw new Error(`${ok}/${vars.length}`); return `${ok}/${vars.length} (100 %)`
})
const W = (extra: Partial<Parede> = {}): Parede => ({ ...paredeNova('a', { tipo: 'eixo', eixo: 'x', desloc: 0 }, 40), ...extra })
const removido = (p: Parede) => { const o = op(), cheia = W(); return volume(parede({ ...o, paredes: [cheia] }, cheia)) - volume(parede({ ...o, paredes: [p] }, p)) }
for (const tipo of ['porta', 'janela'] as const) for (const forma of ['reta', 'arco', 'abatido', 'ogiva'] as const)
  t('D6', `volume removido = área do perfil × espessura: ${tipo} ${forma}`, () => {
    const a = { ...aberturaNova(tipo), forma, pos: 20, largura: 12, altura: tipo === 'porta' ? 20 : 12 }, p = W({ aberturas: [a] })
    const esp = area2(perfilAbertura(a)) * p.espessura, e = err(removido(p), esp)
    if (e > .01) throw new Error(`${pct(e)} (removido ${removido(p).toFixed(2)} vs ${esp.toFixed(2)})`); return `erro ${pct(e)} (limite 1 %)`
  })
const reta = (pos: number, peitoril: number, largura = 12, altura = 16) => ({ ...aberturaNova('janela'), forma: 'reta' as const, pos, largura, altura, peitoril })
const fora = (p: Parede, a = p.aberturas[0]) => foraDaArea(p, a)
const dentroEstrito = (L: [number, number][][], c: number, h: number) => L.some(s => s.slice(1).some((q, i) => { const u = (s[i][0] + q[0]) / 2, v = (s[i][1] + q[1]) / 2; return u > 1e-6 && u < c - 1e-6 && v > 1e-6 && v < h - 1e-6 }))
const D7: [string, Parede, number | null][] = [ // [nome, parede, área dentro esperada (mm²) ou null = nada corta]
  ['toda fora (acima)', W({ aberturas: [reta(20, 40)] }), 0],
  ['toda fora (esquerda)', W({ aberturas: [reta(-20, 5)] }), 0],
  ['meia fora (lateral)', W({ aberturas: [reta(-3, 5)] }), 3 * 16],
  ['meia fora (por baixo)', W({ aberturas: [reta(20, -6)] }), 12 * 10],
  ['meia fora (por cima)', W({ aberturas: [reta(20, 20)] }), 12 * 10],
  ['2 aberturas sem interferir', W({ aberturas: [reta(10, 5), reta(30, 5)] }), 2 * 12 * 16],
]
for (const [nome, p, area] of D7) t('D7', nome, () => {
  const rem = removido(p), esp = area! * p.espessura, tol = area === 0 ? 1e-4 : .01
  const e = area === 0 ? Math.abs(rem) / volume(parede({ ...op(), paredes: [W()] }, W())) : err(rem, esp)
  if (e > tol) throw new Error(`volume ${pct(e)} (limite ${pct(tol)})`)
  const f = p.aberturas.flatMap(a => fora(p, a))
  if (area !== null && p.aberturas.length === 1 && !f.length) throw new Error('foraDaArea vazio')
  if (dentroEstrito(f, p.comprimento, p.altura)) throw new Error('tracejado caiu dentro da parede')
  return `volume ${pct(e)}, ${f.length} segmentos fora`
})
t('D8', 'relevo das faces dentro de [0, teto]; perda de volume ≤ faces × teto', () => {
  const o = op(), p = W({ comprimento: 35 }), lisa = parede({ ...o, paredes: [p] }, p), tex = parede({ ...o, paredes: [p] }, p, true)
  const a = bbox(lisa), b = bbox(tex), perda = volume(lisa) - volume(tex), max = (2 * 35 * p.altura + 35 * p.espessura) * o.teto
  for (let i = 0; i < 3; i++) if (b.lo[i] < a.lo[i] - 1e-3 || b.hi[i] > a.hi[i] + 1e-3) throw new Error('textura sai da parede lisa')
  if (perda <= 0 || perda > max) throw new Error(`perda ${perda.toFixed(1)} mm³ fora de (0, ${max.toFixed(1)}]`)
  return `perda ${perda.toFixed(1)} mm³ de no máx. ${max.toFixed(1)}`
})
t('D8', 'campo do piso inalterado (p50 1,509, p95 1,895)', () => {
  const o = op(), d: number[] = []
  for (let j = 0; j <= 600; j++) for (let i = 0; i <= 600; i++)
    d.push(Math.min(pedra(-100 + i / 3, -100 + j / 3, o.semente * 13.7, o.tamanho_pedra, o.profundidade * o.junta_piso, o.desgaste, o.pedra), o.teto))
  d.sort((x, y) => x - y)
  const p50 = d[Math.floor(d.length * .5)], p95 = d[Math.floor(d.length * .95)]
  if (Math.abs(p50 - 1.509) > .0015 || Math.abs(p95 - 1.895) > .0015) throw new Error(`p50 ${p50.toFixed(3)} p95 ${p95.toFixed(3)}`)
  return `p50 ${p50.toFixed(3)} p95 ${p95.toFixed(3)}`
})
t('D8', 'parede 30×6 com textura ≤ 120 mil triângulos', () => {
  const o = op(), p = W({ comprimento: 35, altura: 30, espessura: 6 }), n = parede({ ...o, paredes: [p] }, p, true).idx.length / 3
  if (n > 120000) throw new Error(`${n}`); return `${n} triângulos`
})
t('D10', 'exportar STL, piso 2×3 com 4 paredes: fechada e ≤ 60 s', async () => {
  const o = op({ linhas: 2, colunas: 3 }), la = (i: number, id: string) => paredeNova(id, { tipo: 'aresta', celula: 0, lado: i }, +ladoBloco(o, i)!.L.toFixed(1))
  const ps = [la(0, 'a'), la(2, 'b'), noEixo('x', 4, 'c'), noEixo('y', -6, 'd')] // lados opostos do contorno
  const t0 = performance.now(), m = await pisoComParedes({ ...o, paredes: ps }), s_ = (performance.now() - t0) / 1000
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
  if (s_ > 60) throw new Error(`${s_.toFixed(1)} s`); return `${s_.toFixed(1)} s, fechada: sim`
})
t('D10', 'prévia (piso cru 0,5 mm) com 4 paredes ≤ 3 s', async () => {
  const o = op({ linhas: 2, colunas: 3, resolucao: .5 }), ps = [noEixo('x', 0, 'a'), noEixo('y', 0, 'b'), noEixo('x', 8, 'c'), noEixo('y', 8, 'd')]
  const t0 = performance.now(); await pisoComParedes({ ...o, paredes: ps }, true); const s = (performance.now() - t0) / 1000
  if (s > 3) throw new Error(`${s.toFixed(1)} s`); return `${s.toFixed(2)} s`
})
const TELHADO_F0 = 0 // ocorrências de "telhado" em web/src no F0 (medido); não pode crescer
t('D11', '"telhado" em web/src não cresce; textura padrão = Pedra', () => {
  if (padrao().textura !== 'pedra') throw new Error(`padrão = ${padrao().textura}`)
  const n = readdirSync('src').filter(f => f.endsWith('.ts')).reduce((s, f) => s + (readFileSync('src/' + f, 'utf8').match(/telhado/gi)?.length ?? 0), 0)
  if (n > TELHADO_F0) throw new Error(`${n} > ${TELHADO_F0}`); return `${n} ocorrências`
})

let falhas = 0, nPass = 0
const filtro = process.argv.slice(2).filter(a => !a.startsWith('--'))
for (const [id, nome, fn] of T) {
  if (filtro.length && !filtro.includes(id)) continue
  try { const v = await fn(); nPass++; console.log(`PASS ${id.padEnd(3)} ${nome} — ${v}`) }
  catch (e) { falhas++; console.log(`FAIL ${id.padEnd(3)} ${nome} — ${String(e instanceof Error ? e.message : e).split('\n')[0]}`) }
}
console.log(`\nTODO (só no navegador): D9 (3 paredes + 1 fora, tracejado na vista 3D e no esquema, 0 erros no console, sem rolagem horizontal em 1024/700/375 px); D10-UI (prévia com 4 paredes ≤ 3 s no app)`)
console.log(`TODO (manual): D11 padrão = Pedra; sem código GPL (texturas Lisa, Lajota e Tijolo em check_texturas.ts)`)
console.log(`
${nPass}/${nPass + falhas} PASS, ${falhas} FAIL`)
process.exit(falhas ? 1 : 0)
