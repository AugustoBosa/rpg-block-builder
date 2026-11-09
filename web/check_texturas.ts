// Check das texturas Lisa, Lajota e Tijolo (Rodada E1): `npx tsx check_texturas.ts` imprime PASS/FAIL e o valor medido.
import { fechada, final, padrao, piso, type Malha, type Opcoes } from './src/bloco'
import { ladoBloco } from './src/aberturas'
import { paredeNova, pisoComParedes } from './src/parede'
import { regiao } from './src/sistema'
import { profTex, TEX, type TexId } from './src/textura'

const NOVAS: TexId[] = ['lisa', 'lajota', 'tijolo']
const op = (e: Partial<Opcoes>): Opcoes => ({ ...padrao(), ...e })
let falhas = 0
const confere = (nome: string, ok: boolean, medido: string) => { if (!ok) falhas++; console.log(`${ok ? 'PASS' : 'FAIL'} ${nome} — ${medido}`) }
const pisoFinal = (o: Opcoes) => final(piso(o))

// emenda (mesmo método do emenda.py): topo na borda x = +a do bloco 0 contra x = −a do bloco 1 (posicao_x 0 e 1, sem gasto de borda), por y
const topoBorda = (m: Malha, x: number, H: number) => {
  const z = new Map<number, number>()
  for (let i = 0; i < m.pos.length; i += 3)
    if (Math.abs(m.pos[i] - x) < 1e-3 && m.pos[i + 2] > H - 2 && m.pos[i + 2] <= H + .01) { const y = Math.round(m.pos[i + 1] * 1000); z.set(y, Math.max(z.get(y) ?? -1e9, m.pos[i + 2])) }
  return z
}
async function emenda(t: TexId) {
  const base = op({ textura: t, lateral_gasto: 0, quina_gasto: 0 }), a = regiao(base, 1, 1).c.a[0]
  const A = topoBorda(await pisoFinal(base), a, base.altura), B = topoBorda(await pisoFinal({ ...base, posicao_x: 1 }), -a, base.altura)
  let n = 0, soma = 0, max = 0
  for (const [y, za] of A) { const zb = B.get(y); if (zb === undefined) continue; const d = Math.abs(za - zb); n++; soma += d; max = Math.max(max, d) }
  return { n, media: soma / n, max, total: A.size, totalB: B.size }
}

// campo da textura numa área de 200 × 200 mm, 3 amostras por mm (como campo.ts)
function campo(t: TexId) {
  const o = op({ textura: t }), d: number[] = []
  for (let j = 0; j <= 600; j++) for (let i = 0; i <= 600; i++)
    d.push(Math.min(profTex(o, -100 + i / 3, -100 + j / 3, o.semente * 13.7, o.profundidade * o.junta_piso), o.teto))
  const media = d.reduce((s, v) => s + v, 0) / d.length
  return { min: d.reduce((a, b) => Math.min(a, b), 1e9), max: d.reduce((a, b) => Math.max(a, b), -1e9), teto: o.teto, media, desvio: Math.sqrt(d.reduce((s, v) => s + (v - media) ** 2, 0) / d.length) }
}

const stats: Record<string, { media: number; desvio: number }> = {}
for (const t of ['pedra', ...NOVAS] as TexId[]) {
  const c = campo(t); stats[t] = c
  console.log(`MEDIA ${TEX[t].nome.padEnd(7)} média ${c.media.toFixed(3)} mm, desvio ${c.desvio.toFixed(3)} mm`)
  if (t === 'pedra') continue
  confere(`(c) ${t}: profundidade entre 0 e o teto`, c.min >= 0 && c.max <= c.teto + 1e-9, `mín ${c.min.toFixed(3)}, máx ${c.max.toFixed(3)}, teto ${c.teto}`)
  // decisão do usuário: a Lisa pode ter relevo < 0,4 mm; para ela basta a média ser > 0 (e menor que 2,5)
  const minimo = t === 'lisa' ? 0.01 : 0.3
  confere(`(c) ${t}: média entre ${minimo} e 2,5 mm${t === 'lisa' ? ' (Lisa: exceção, relevo baixo é decisão do usuário)' : ''}`, c.media >= minimo && c.media <= 2.5, `média ${c.media.toFixed(3)} mm`)
}
const ids = Object.keys(stats), difere = (a: string, b: string) => Math.abs(stats[a].media - stats[b].media) > .005 || Math.abs(stats[a].desvio - stats[b].desvio) > .005
const iguais = ids.flatMap((a, i) => ids.slice(i + 1).filter(b => !difere(a, b)).map(b => `${a}=${b}`))
confere('texturas diferem entre si e da Pedra (média e desvio)', !iguais.length, iguais.join(',') || `${ids.length} texturas, nenhum par igual`)

for (const t of NOVAS) {
  for (const [nome, e] of [['1×1 quadrado', {}], ['1×1 hexágono', { formato: 'hexagono' }], ['2×3 quadrado', { linhas: 2, colunas: 3 }]] as [string, Partial<Opcoes>][]) {
    const m = await pisoFinal(op({ textura: t, ...e })), f = fechada(m.pos, m.idx)
    confere(`(a) ${t}: malha fechada, piso ${nome}`, f, `fechada: ${f ? 'sim' : 'NÃO'}, ${m.idx.length / 3} triângulos`)
    if (nome === '1×1 quadrado') confere(`(e) ${t}: piso 1×1 ≤ 300 mil triângulos`, m.idx.length / 3 <= 300000, `${m.idx.length / 3} triângulos`)
  }
  const em = await emenda(t)
  confere(`(b) ${t}: emenda 0,0000 mm entre pisos 1×1 vizinhos`, em.n > 100 && em.n === em.total && em.n === em.totalB && em.max < 5e-5, `${em.n} pontos de ${em.total}/${em.totalB}, média ${em.media.toFixed(4)} mm, máx ${em.max.toFixed(4)} mm`)
  const o = op({ textura: t }), p = { ...paredeNova('a', { tipo: 'aresta', celula: 0, lado: 0 }, +ladoBloco(o, 0)!.L.toFixed(1)), lado: 'dentro' as const }
  const w = await pisoComParedes({ ...o, paredes: [p] }), f = fechada(w.pos, w.idx)
  confere(`(d) ${t}: parede unida ao piso fecha a malha`, f, `fechada: ${f ? 'sim' : 'NÃO'}, ${w.idx.length / 3} triângulos`)
}
console.log(`\n${falhas ? 'FAIL' : 'PASS'}: ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
