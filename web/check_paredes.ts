// Checks do DoD das paredes (docs/WORKFLOW_PAREDES.md §4). `npx tsx check_paredes.ts` lista PASS/FAIL e o valor medido.
// `--grava` regrava ref_hashes.json (baseline D2: STL de referência SEM paredes, gerados pelo código de 63e2f50). Só grave com o código sem paredes.
// D9 e o lado de interface do D10 só rodam no navegador: aparecem como TODO no fim.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fechada, final, padrao, piso, stl, subida, type Malha } from './src/bloco'
import { pedra } from './src/pedra'
import { avisosGrid, degrau, grid, malha, medidas, regiao } from './src/sistema'
import { clipSolido, poe, rabo, verticesBorda } from './src/travas'
import { canto, ladoBloco, orfa, paredesValidas, pilares } from './src/aberturas'
import { geoTelhado, telhadoMalha, telhadoSolto } from './src/telhado'
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
  if (s > 3 && !process.env.CI) throw new Error(`${s.toFixed(1)} s`); return `${s.toFixed(2)} s` // no CI (runner mais lento e variável) o tempo só é informado
})
// ---- D12: rampa (piso inclinado) ----
const DIRS = ['+y', '-y', '+x', '-x'] as const
for (const [nome, e] of [['1x1 quadrado', {}], ['2x3 quadrado', { linhas: 2, colunas: 3 }], ['1x1 hexágono', { formato: 'hexagono' }]] as [string, Record<string, unknown>][])
  for (const ang of [15, 40]) for (const dir of DIRS)
    t('D12', `rampa ${ang}° ${dir}, ${nome}: fecha e sobe o esperado`, async () => {
      const o = op({ ...e, inclinacao: ang, inclinacao_dir: dir }), m = await pisoComParedes(o), b = bbox(m), alto = o.altura + subida(o)
      if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
      if (b.hi[2] > alto + .05 || b.hi[2] < alto - 4) throw new Error(`topo ${b.hi[2].toFixed(2)}, esperado ≤ ${alto.toFixed(2)} e > ${(alto - 4).toFixed(2)}`)
      let i = 0; for (let v = 1; v < m.pos.length / 3; v++) if (m.pos[v * 3 + 2] > m.pos[i * 3 + 2]) i = v // vértice de maior z
      const coord = m.pos[i * 3 + (dir[1] === 'x' ? 0 : 1)]
      if ((dir[0] === '-' ? -coord : coord) <= 0) throw new Error('rampa sobe para o lado errado')
      return `fechada, topo ${b.hi[2].toFixed(2)} (≤ ${alto.toFixed(2)}), sobe para ${dir}`
    })
t('D12', 'rampa ignora as paredes (mesmo hash que sem paredes)', async () => {
  const o = op({ inclinacao: 20 }), com = { ...o, paredes: [naAresta(o, 0, 'a')] }
  if (hash(await pisoComParedes(com)) !== hash(await pisoComParedes(o))) throw new Error('paredes entraram na rampa')
  return 'iguais'
})
t('D12', 'rampa: piso 1×1 ≤ tempo sem rampa + 10 %', async () => {
  const med = async (e: Record<string, unknown>) => { const t0 = performance.now(); await pisoComParedes(op(e)); return performance.now() - t0 }
  await med({}) // aquece
  const a = await med({}), b = await med({ inclinacao: 30 })
  if (b > a * 1.1 + 50 && !process.env.CI) throw new Error(`${b.toFixed(0)} ms vs ${a.toFixed(0)} ms`); return `${b.toFixed(0)} ms vs ${a.toFixed(0)} ms`
})
// ---- D13: atalho de canto ----
for (const [l, c] of [[1, 1], [2, 3]] as const) for (const q of [0, 1, 2, 3])
  t('D13', `canto na quina ${q}, ${l}x${c}: 2 paredes do lado inteiro, malha fecha`, async () => {
    const o = op({ linhas: l, colunas: c }), ps = canto(o, q, i => 'c' + i)
    if (ps.length !== 2) throw new Error(`${ps.length} paredes`)
    for (const p of ps) { const L = ladoBloco(o, (p.ancora as { lado: number }).lado)!.L; if (Math.abs(p.comprimento - L) > .06 || p.lado !== 'dentro') throw new Error(`comprimento ${p.comprimento} vs ${L}, lado ${p.lado}`) }
    const m = await pisoComParedes({ ...o, paredes: ps })
    if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
    return 'fechada: sim'
  })
// ---- D14: pilar de canto ----
t('D14', 'canto 1x1 com pilar: 1 pilar e malha fecha', async () => {
  const o = op({ pilar: true }), ps = canto(o, 0, i => 'c' + i), pl = pilares(o, ps)
  if (pl.length !== 1) throw new Error(`${pl.length} pilares`)
  const m = await pisoComParedes({ ...o, paredes: ps }), b = bbox(m), b0 = bbox(await pisoComParedes({ ...op(), paredes: ps }))
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
  for (const k of [0, 1]) if (b.lo[k] < b0.lo[k] - .01 || b.hi[k] > b0.hi[k] + .01) throw new Error('pilar aumenta a área além do canto sem pilar')
  return `fechada, dentro do contorno, pilar ${pl[0].comprimento.toFixed(1)} mm`
})
t('D14', 'contorno 2x2 com pilar: 4 pilares e malha fecha', async () => {
  const o = op({ pilar: true, linhas: 2, colunas: 2 }), ps = [0, 1, 2, 3].map(i => paredeNova('a' + i, { tipo: 'aresta', celula: 0, lado: i }, +ladoBloco(o, i)!.L.toFixed(1)))
  if (pilares(o, ps).length !== 4) throw new Error(`${pilares(o, ps).length} pilares`)
  const m = await pisoComParedes({ ...o, paredes: ps })
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO'); return 'fechada: sim'
})
t('D14', 'espessuras diferentes: pilar pelo maior, malha fecha', async () => {
  const o = op({ pilar: true }), [a, b] = canto(o, 1, i => 'c' + i), ps = [{ ...a, espessura: 4 }, { ...b, espessura: 8 }], pl = pilares(o, ps)
  if (pl.length !== 1 || Math.abs(pl[0].comprimento - (8 + 2 * o.pilar_saliencia)) > 1e-6) throw new Error(`pilares ${pl.map(p => p.comprimento)}`)
  const m = await pisoComParedes({ ...o, paredes: ps }), bm = bbox(m), bs = bbox(await pisoComParedes({ ...op(), paredes: ps }))
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
  for (const k of [0, 1]) if (bm.lo[k] < bs.lo[k] - .01 || bm.hi[k] > bs.hi[k] + .01) throw new Error('pilar aumenta a área além do canto sem pilar')
  return 'fechada: sim, dentro do canto sem pilar'
})
t('D14', 'paralelas e em T não geram pilar; pilar desligado não muda o hash', async () => {
  const o = op({ pilar: true })
  if (pilares(o, [noEixo('x', -5, 'a'), noEixo('x', 5, 'b')]).length) throw new Error('paralelas geraram pilar')
  // T: A no eixo x de x = 0 a 40; B no eixo y em x = 20 (eixo y ⇒ n = [−1, 0], desloc −20), de y = 0 a 20: toca o meio de A
  if (pilares(o, [noEixo('x', 0, 'a', 40), { ...noEixo('y', -20, 'b', 20), inicio: 0 }]).length) throw new Error('T gerou pilar')
  const ps = canto(op(), 0, i => 'c' + i)
  if (hash(await pisoComParedes({ ...op(), paredes: ps })) !== hash(await pisoComParedes({ ...op({ pilar: false, pilar_saliencia: 3 }), paredes: ps }))) throw new Error('pilar desligado mudou o STL')
  return 'ok'
})
t('D14', 'hexágono 1x1, paredes nos lados 0 e 1 com pilar: 0 pilares, malha fecha', async () => {
  const o = op({ formato: 'hexagono', pilar: true }), ps = [0, 1].map(i => paredeNova('h' + i, { tipo: 'aresta', celula: 0, lado: i }, +ladoBloco(o, i)!.L.toFixed(1)))
  if (pilares(o, ps).length !== 0) throw new Error(`${pilares(o, ps).length} pilares no canto de 120°`)
  const m = await pisoComParedes({ ...o, paredes: ps })
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO'); return 'fechada: sim, 0 pilares'
})
t('D14', 'L em eixo (lado centro) com pilar: 1 pilar, fecha, não aumenta o bbox', async () => {
  const o = op({ pilar: true }), ps = [{ ...noEixo('x', 0, 'a', 30), inicio: 0 }, { ...noEixo('y', 0, 'b', 30), inicio: 0 }], pl = pilares(o, ps)
  if (pl.length !== 1) throw new Error(`${pl.length} pilares`)
  const m = await pisoComParedes({ ...o, paredes: ps }), b = bbox(m), b0 = bbox(await pisoComParedes({ ...op(), paredes: ps }))
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
  for (const k of [0, 1]) if (b.lo[k] < b0.lo[k] - .01 || b.hi[k] > b0.hi[k] + .01) throw new Error('pilar aumenta a área além do L sem pilar')
  return `fechada, dentro do bbox, pilar ${pl[0].comprimento.toFixed(1)} mm`
})
// ---- D15: telhado ----
const comCanto = (e: Record<string, unknown>) => { const o = op(e); return { ...o, paredes: canto(o, 0, i => 'c' + i) } }
for (const forma of ['uma', 'duas', 'quatro', 'plano'] as const) for (const [l, c] of [[1, 1], [2, 3]] as const)
  t('D15', `telhado ${forma} removível ${l}x${c}: fecha`, () => {
    const m = telhadoSolto(comCanto({ linhas: l, colunas: c, telhado_forma: forma }))
    if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO'); return `fechada, ${m.idx.length / 3} tri`
  })
t('D15', 'duas águas: cumeeira = zb + borda + tg × W/2', () => {
  const o = comCanto({ telhado_forma: 'duas' }), g = geoTelhado(o), b = bbox(telhadoMalha(o)), alvo = g.zb + g.b + g.tg * (g.y1 - g.y0) / 2
  if (Math.abs(b.hi[2] - alvo) > .05) throw new Error(`${b.hi[2].toFixed(3)} vs ${alvo.toFixed(3)}`); return `${b.hi[2].toFixed(2)} mm`
})
t('D15', 'quatro águas 1x1: ápice no centro', () => {
  const m = telhadoMalha(comCanto({ telhado_forma: 'quatro' }))
  let k = 0; for (let i = 2; i < m.pos.length; i += 3) if (m.pos[i] > m.pos[k * 3 + 2]) k = (i - 2) / 3
  if (Math.hypot(m.pos[k * 3], m.pos[k * 3 + 1]) > .1) throw new Error(`ápice em ${m.pos[k * 3].toFixed(2)}, ${m.pos[k * 3 + 1].toFixed(2)}`); return 'centro'
})
t('D15', 'saia por dentro das paredes do canto (folga)', () => {
  const o = comCanto({ telhado_forma: 'duas' }), m = telhadoSolto(o), lim = 17.5 - 6 - o.saia_folga
  let mx = -1e9, my = -1e9
  for (let i = 0; i < m.pos.length; i += 3) if (m.pos[i + 2] < -.01) { mx = Math.max(mx, m.pos[i]); my = Math.max(my, m.pos[i + 1]) }
  if (mx > lim + .01 || my > lim + .01) throw new Error(`saia até ${mx.toFixed(2)}, ${my.toFixed(2)} (limite ${lim})`); return `saia até ${Math.max(mx, my).toFixed(2)} ≤ ${lim}`
})
t('D15', 'saia por dentro dos pilares (folga)', () => {
  const o = comCanto({ telhado_forma: 'duas', pilar: true }), m = telhadoSolto(o), lim = 17.5 - 6 - 2 * o.pilar_saliencia - o.saia_folga
  let mx = -1e9, my = -1e9
  for (let i = 0; i < m.pos.length; i += 3) if (m.pos[i + 2] < -.01) { mx = Math.max(mx, m.pos[i]); my = Math.max(my, m.pos[i + 1]) }
  if (mx > lim + .01 || my > lim + .01) throw new Error(`saia até ${mx.toFixed(2)}, ${my.toFixed(2)} (limite ${lim})`); return `saia até ${Math.max(mx, my).toFixed(2)} ≤ ${lim}`
})
t('D15', 'uma água eixo y: sobe para +y', () => {
  const o = comCanto({ telhado_forma: 'uma', telhado_eixo: 'y' }), g = geoTelhado(o), m = telhadoMalha(o)
  let k = 0; for (let i = 2; i < m.pos.length; i += 3) if (m.pos[i] > m.pos[k * 3 + 2]) k = (i - 2) / 3
  if (m.pos[k * 3 + 1] < g.y1 - .01) throw new Error(`topo em y = ${m.pos[k * 3 + 1].toFixed(2)} (y1 ${g.y1})`); return `topo em y = ${m.pos[k * 3 + 1].toFixed(2)}`
})
t('D15', 'fundido com pilar: topo das paredes dentro do telhado', async () => {
  const o = comCanto({ telhado_forma: 'duas', telhado_modo: 'fundido', pilar: true })
  if (Math.abs(geoTelhado(o).zb - (o.altura + 30)) > 1e-6) throw new Error(`zb ${geoTelhado(o).zb} vs ${o.altura + 30}`)
  const m = await pisoComParedes(o); if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO'); return 'zb sem pilar_sobe, fechada'
})
for (const forma of ['uma', 'duas', 'quatro', 'plano'] as const)
  t('D15', `textura aplicada no telhado ${forma}`, () => {
    const o = comCanto({ telhado_forma: forma }), g = geoTelhado(o), m = telhadoSolto(o)
    let n = 0, afund = 0
    for (let i = 0; i < m.pos.length; i += 3) {
      const x = m.pos[i], y = m.pos[i + 1], d = g.topo(x, y) - m.pos[i + 2]
      if (Math.abs(x) < 10 && Math.abs(y) < 10 && d >= -1e-3 && d < 3) { n++; if (d > .05) afund++ }
    }
    if (!n || afund < n / 2) throw new Error(`${afund}/${n} vértices afundados`); return `${afund}/${n} afundados`
  })
t('D15', 'saia não atravessa parede em eixo', () => {
  const b = comCanto({ telhado_forma: 'duas' }), o = { ...b, paredes: [...b.paredes, { ...noEixo('x', 0, 'e', 35), inicio: -17.5 }] }, m = telhadoSolto(o)
  const band = 3 + o.saia_folga - .01 // vértice ou triângulo da saia (z < −0,01) dentro/atravessando a faixa da parede em eixo
  for (let i = 0; i < m.pos.length; i += 3) if (m.pos[i + 2] < -.01 && Math.abs(m.pos[i + 1]) < band) throw new Error(`vértice da saia em y = ${m.pos[i + 1].toFixed(2)}`)
  for (let i = 0; i < m.idx.length; i += 3) {
    const ys = [0, 1, 2].map(k => m.pos[m.idx[i + k] * 3 + 1]), zs = [0, 1, 2].map(k => m.pos[m.idx[i + k] * 3 + 2])
    if (Math.min(...zs) < -.01 && Math.min(...ys) < -band && Math.max(...ys) > band) throw new Error('triângulo da saia atravessa a parede em eixo')
  }
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO'); return 'ok'
})
for (const forma of ['uma', 'duas', 'quatro', 'plano'] as const) for (const [l, c] of [[1, 1], [2, 3]] as const)
  t('D15', `telhado ${forma} fundido ${l}x${c}: piso unido fecha e sobe`, async () => {
    const o = comCanto({ linhas: l, colunas: c, telhado_forma: forma, telhado_modo: 'fundido' }), m = await pisoComParedes(o)
    if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
    if (bbox(m).hi[2] < geoTelhado(o).zb + 1) throw new Error('telhado não entrou'); return 'fechada, com telhado'
  })
t('D15', 'telhado ignorado na rampa, no hexágono e fundido sem paredes', async () => {
  const f = { telhado_forma: 'duas', telhado_modo: 'fundido' }
  for (const [nome, a, b] of [
    ['rampa', { ...comCanto({ inclinacao: 20 }), ...f }, comCanto({ inclinacao: 20 })],
    ['hexágono', op({ formato: 'hexagono', ...f }), op({ formato: 'hexagono' })],
    ['sem paredes', op(f), op()],
  ] as [string, OpcoesP, OpcoesP][]) if (hash(await pisoComParedes(a)) !== hash(await pisoComParedes(b))) throw new Error(nome)
  return 'iguais'
})
// ---- D16: grid completo ----
const larguraFuroTopo = (m: Malha, zTopo: number, meiaCelula: number) => { // menor |x| dos vértices do topo com |x| < meia célula − 0,25: o furo é o único contorno ali (a borda externa fica em meia célula)
  let r = 1e9
  for (let i = 0; i < m.pos.length; i += 3) if (Math.abs(m.pos[i + 2] - zTopo) < 1e-3 && Math.abs(m.pos[i]) < meiaCelula - .25) r = Math.min(r, Math.abs(m.pos[i]))
  return r
}
t('D16', 'chanfro do furo 1 mm: grid fecha e o furo abre 1 mm de cada lado no topo', () => {
  const o0 = op(), o1 = op({ chanfro_furo: 1 }), G = medidas(o0).alturaGrid, M = o0.largura / 2
  const a = malha(grid(o0, 1, 1)), b = malha(grid(o1, 1, 1))
  if (!fechada(b.pos, b.idx)) throw new Error('fechada: NÃO')
  const d = larguraFuroTopo(b, G, M) - larguraFuroTopo(a, G, M) // o furo abre: meia largura cresce
  if (Math.abs(d - 1) > .02) throw new Error(`abriu ${d.toFixed(3)} mm`); return `abriu ${d.toFixed(3)} mm`
})
const xg = (e: Record<string, unknown>) => op({ grid_linhas: 2, grid_colunas: 3, ...e })
for (const f of ['quadrado', 'hexagono'] as const) for (const tv of ['clip', 'macho'] as const)
  t('D16', `trava ${tv}, ${f} 2x3: grid fecha e todas as travas entram`, () => {
    // hexágono clip: no canto de 120° o clip precisa de recuo ≥ ~4,7 mm; o macho/fêmea cabe com o recuo padrão (macho sai do canto de 120°)
    const o = xg({ formato: f, trava: tv, ...(f === 'hexagono' && tv === 'clip' ? { recuo: 6 } : {}) }), m = malha(grid(o, 2, 3, o))
    if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
    const vs = verticesBorda(regiao(o, 2, 3).seg), n = vs.filter(v => v.ang >= 119).length
    if (f === 'quadrado' && n !== 6) throw new Error(`${n} vértices elegíveis (esperado 6)`)
    if (avisosGrid.length) throw new Error(avisosGrid.join(' '))
    return `${n} travas; ângulos ${[...new Set(vs.map(v => Math.round(v.ang)))].join('/')}`
  })
t('D16', 'clip no hexágono com recuo padrão: aviso', () => {
  const o = xg({ formato: 'hexagono', trava: 'clip' }); malha(grid(o, 2, 3, o))
  if (!avisosGrid.length) throw new Error('sem aviso'); return avisosGrid[0]
})
for (const f of ['quadrado', 'hexagono'] as const)
  t('D16', `clip cabe no recorte do grid, ${f}`, () => {
    const o = xg({ formato: f, trava: 'clip', ...(f === 'hexagono' ? { recuo: 6 } : {}) }), g = grid(o, 2, 3, o), v = verticesBorda(regiao(o, 2, 3).seg).find(v => v.ang > 179)!
    const c = poe(clipSolido(o), v.p, v.b), ix = c.intersect(g), dentro = ix.volume(); c.delete(); ix.delete()
    if (dentro > 1e-3) throw new Error(`clip invade o grid: ${dentro.toFixed(4)} mm³`); return 'sem interferência'
  })
t('D16', 'hexágono 2x3: 18 vértices elegíveis para trava', () => {
  const n = verticesBorda(regiao(xg({ formato: 'hexagono' }), 2, 3).seg).filter(v => v.ang >= 119).length
  if (n !== 18) throw new Error(`${n} vértices elegíveis (esperado 18)`); return `${n}`
})
for (const f of ['quadrado', 'hexagono'] as const)
  t('D16', `combinação trava macho + 3 ímãs + alívio, ${f} 2x3: fecha`, () => {
    const o = xg({ formato: f, trava: 'macho', ima_borda: true, ima_cruz: true, ima_meio: true, alivio: true, fundo: 3, ...(f === 'hexagono' ? { ima_d: 6 } : {}) }), m = malha(grid(o, 2, 3, o))
    if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO'); return `fechada; avisos: ${avisosGrid.length}`
  })
t('D16', 'chanfro do furo maior que o ombro: fecha e o perfil não decresce', () => {
  const o = op({ chanfro_furo: 2, ombro: .5 }), m = malha(grid(o, 1, 1)), P = medidas(o).perfilFuro
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
  for (let i = 1; i < P.length; i++) if (P[i][0] < P[i - 1][0] - 1e-9) throw new Error(`z decresce: ${JSON.stringify(P)}`)
  return 'ok'
})
t('D16', 'alívio sem fundo fechado: aviso', () => { const o = xg({ alivio: true }); grid(o, 2, 3, o); if (!avisosGrid.some(a => a.includes('Alívio'))) throw new Error('sem aviso'); return avisosGrid[0] })
for (const f of ['quadrado', 'hexagono'] as const)
  t('D16', `macho de um grid entra na fêmea do vizinho, ${f} 2x3`, () => {
    const o = xg({ formato: f, trava: 'macho' }), vs = verticesBorda(regiao(o, 2, 3).seg).filter(v => v.ang >= 119)
    const macho = (v: { ang: number; n: number[] }) => f === 'hexagono' ? v.ang < 200 : v.n[0] > .5 || v.n[1] > .5
    const A0 = grid(o, 2, 3), Af = grid(o, 2, 3, o), L = o.trava_comprimento, h = o.trava_altura
    for (const v of vs.filter(macho)) for (const w of vs.filter(w => !macho(w))) {
      if (Math.hypot(v.b[0] + w.b[0], v.b[1] + w.b[1]) > 1e-3) continue // bissetrizes opostas: o macho aponta para dentro da fêmea
      const d: [number, number, number] = [v.p[0] - w.p[0], v.p[1] - w.p[1], 0], B0 = A0.translate(d)
      const x0 = A0.intersect(B0), sobre = x0.volume(); x0.delete()
      if (sobre > 1e-3) { B0.delete(); continue } // placas se sobrepõem: outro par
      const m = poe(rabo(L, o.trava_largura, o.trava_haste, 0, h), v.p, [-v.b[0], -v.b[1]]), Bf = Af.translate(d)
      const i1 = m.intersect(Bf), i0 = m.intersect(B0), vf = i1.volume(), v0 = i0.volume()
      for (const x of [m, Bf, B0, i1, i0]) x.delete()
      if (vf >= 1e-3) throw new Error(`macho invade o grid vizinho: ${vf.toFixed(4)} mm³`)
      if (v0 <= 1) throw new Error(`macho não cai em material: ${v0.toFixed(3)} mm³`)
      return `d = (${d[0].toFixed(1)}, ${d[1].toFixed(1)}); dentro da fêmea ${vf.toFixed(4)} mm³, no grid cheio ${v0.toFixed(2)} mm³`
    }
    throw new Error('nenhum par macho/fêmea sem sobreposição')
  })
const cil = (d: number, h: number) => 24 * (d / 2) ** 2 * Math.sin(Math.PI / 24) * h // cilindro de 48 lados (não o círculo exato)
for (const f of ['quadrado', 'hexagono'] as const) for (const [q, nome] of [['ima_borda', 'borda'], ['ima_cruz', 'cruzamento'], ['ima_meio', 'meio']] as const)
  t('D16', `ímã ${nome}, ${f} 2x3: fecha e remove o volume dos furos`, () => {
    const o = xg({ formato: f, [q]: true }), a = grid(o, 2, 3), b = grid(o, 2, 3, o)
    const va = a.volume(), vb = b.volume(), mb = malha(b)
    if (!fechada(mb.pos, mb.idx)) throw new Error('fechada: NÃO')
    const n = (va - vb) / cil(o.ima_grid_d + 2 * o.folga_ima, o.ima_grid_h + .2)
    if (avisosGrid.length && n < .5) throw new Error(avisosGrid.join(' '))
    if (Math.abs(n - Math.round(n)) > .05 || n < .5) throw new Error(`removido = ${n.toFixed(2)} ímãs`); return `${Math.round(n)} ímãs${avisosGrid.length ? ' (aviso: ' + avisosGrid[0] + ')' : ''}`
  })
t('D16', 'ímã grande não cabe: pulado com aviso', () => { const o = xg({ ima_meio: true, ima_grid_d: 10 }); grid(o, 2, 3, o); if (!avisosGrid.length) throw new Error('sem aviso'); return avisosGrid[0] })
t('D16', 'alívio com fundo 3: fecha, piso ≥ 1 mm; sem fundo: igual', () => {
  const o = xg({ fundo: 3, alivio: true }), v0 = grid(o, 2, 3).volume(), v1 = grid(o, 2, 3, o).volume() // sem x = sem alívio
  const m = malha(grid(o, 2, 3, o))
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
  if (v0 - v1 < 100) throw new Error(`alívio removeu só ${(v0 - v1).toFixed(1)} mm³`)
  const o1 = xg({ fundo: 3, alivio: true, grid_linhas: 1, grid_colunas: 1 }), p = malha(grid(o1, 1, 1, o1)), lim = o1.largura / 2 - o1.recuo - 1.2 + .1 // vértices do teto ficam na borda da cavidade
  let zc = 1e9; for (let i = 0; i < p.pos.length; i += 3) if (Math.abs(p.pos[i]) < lim && Math.abs(p.pos[i + 1]) < lim && p.pos[i + 2] > .05) zc = Math.min(zc, p.pos[i + 2])
  if (zc < o1.fundo - 1 - .01 || zc > o1.fundo - 1 + .01) throw new Error(`teto da cavidade em z = ${zc.toFixed(3)} (esperado ${o1.fundo - 1})`)
  const o0 = xg({ alivio: true }); if (hash(malha(grid(o0, 2, 3, o0))) !== hash(malha(grid(o0, 2, 3)))) throw new Error('sem fundo mudou')
  return 'ok'
})
t('D16', 'sem trava: grid igual (hash)', () => { const o = op(); if (hash(malha(grid(o, 3, 3, o))) !== hash(malha(grid(o, 3, 3)))) throw new Error('mudou'); return 'igual' })
t('D11', 'textura padrão = Pedra',() => { if (padrao().textura !== 'pedra') throw new Error(`padrão = ${padrao().textura}`); return 'pedra' })

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
