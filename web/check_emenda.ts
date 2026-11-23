// Emenda do topo entre peças vizinhas (hexágono 1×1 nas 3 direções; quadrado 2×3 para +Y). `npx tsx check_emenda.ts` imprime PASS/FAIL.
// Mesmo método do check_texturas.ts, mas a borda é qualquer lado de normal n: A na borda n contra B (campo deslocado 2a·n) na borda −n, por coordenada ao longo do lado.
import { final, padrao, piso, type Malha, type Opcoes } from './src/bloco'
import type { TexId } from './src/textura'
import { regiao } from './src/sistema'

const op = (e: Partial<Opcoes>): Opcoes => ({ ...padrao(), lateral_gasto: 0, quina_gasto: 0, ...e })
const pisoFinal = (o: Opcoes) => final(piso(o))

// topo (z máx por posição ao longo do lado) dos vértices sobre a reta p·n = a, na janela de 3,2 mm da laje
function topoBorda(m: Malha, n: [number, number], a: number, H: number, g: [number, number]) { // g = tangente do lado (a mesma para A e B)
  const z = new Map<number, number>()
  for (let i = 0; i < m.pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 1], zz = m.pos[i + 2]
    if (Math.abs(x * n[0] + y * n[1] - a) < 1e-3 && zz > H - 3.2 && zz <= H + .01) {
      const t = Math.round((g[0] * x + g[1] * y) * 1000)
      z.set(t, Math.max(z.get(t) ?? -1e9, zz))
    }
  }
  return z
}
async function emenda(base: Opcoes, n: [number, number], a: number, dx: number, dy: number) { // dx, dy em células (posicao_x/y)
  const g: [number, number] = [-n[1], n[0]]
  const A = topoBorda(await pisoFinal(base), n, a, base.altura, g)
  const B = topoBorda(await pisoFinal({ ...base, posicao_x: dx, posicao_y: dy }), [-n[0], -n[1]], a, base.altura, g)
  let c = 0, max = 0, ruins: number[] = []
  for (const [t, za] of A) { const zb = B.get(t); if (zb === undefined) continue; c++; const d = Math.abs(za - zb); max = Math.max(max, d); if (d > 5e-5) ruins.push(t / 1000) }
  return { c, max, ruins, total: A.size, totalB: B.size }
}

let falhas = 0
// Aceita no máximo 1 vértice de CANTO (|t| = lado/2) fora: ali a Tábuas tem degrau de ripa e o erro de float de 1e-14 do deslocamento vira 0,1 mm. Nos outros pontos, igual.
const confere = (nome: string, r: Awaited<ReturnType<typeof emenda>>, meioLado = 0) => {
  const ok = r.c > 100 && r.c === r.total && r.c === r.totalB && (r.max < 5e-5 || (r.ruins.length === 1 && Math.abs(Math.abs(r.ruins[0]) - meioLado) < .01))
  if (!ok) falhas++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${nome} — ${r.c} pontos de ${r.total}/${r.totalB}, máx ${r.max.toFixed(4)} mm${r.ruins.length ? `, ${r.ruins.length} fora (t = ${r.ruins.join(', ')})` : ''}`)
}

// hexágono 1×1: vizinho pelo lado de normal n está em 2a·n; passo da grade = [1,5·lado, entre lados]
for (const t of ['pedra', 'tabuas'] as TexId[]) {
  const base = op({ textura: t, formato: 'hexagono' }), a = base.largura / 2, F = base.largura, l = F / Math.sqrt(3)
  for (const g of [30, 90, 150]) {
    const n: [number, number] = [Math.cos(g * Math.PI / 180), Math.sin(g * Math.PI / 180)]
    confere(`${t}: emenda 0,0000 mm, hexágono 1×1, lado a ${g}°`, await emenda(base, n, a, 2 * a * n[0] / (1.5 * l), 2 * a * n[1] / F), l / 2)
  }
}
// quadrado 2×3, vizinho em +Y (o +X já é medido no check_texturas.ts)
{
  const base = op({ textura: 'pedra', linhas: 2, colunas: 3 }), a = base.comprimento * 2 / 2
  confere('pedra: emenda 0,0000 mm, quadrado 2×3, vizinho em +Y', await emenda(base, [0, 1], a, 0, 2))
}

// Peça N×M (borda em zigue-zague): para cada lado externo de A cujo oposto (normal −n, mesma reta) existe em B, compara o topo por posição t ao longo do lado, só dentro da sobreposição dos dois segmentos.
// B é gerado na origem com posicao_x/y = (px, py) células; fisicamente está em d = (px·passo x, py·passo y), então o t de B (no seu próprio quadro) ganha g·d.
async function emendaPeca(base: Opcoes, px: number, py: number) {
  const r = regiao(base, base.linhas, base.colunas), d = [px * r.c.passo[0], py * r.c.passo[1]]
  const mA = await pisoFinal(base), mB = await pisoFinal({ ...base, posicao_x: px, posicao_y: py })
  let c = 0, total = 0, max = 0, lados = 0, comp = 0
  for (const s of r.seg) {
    const n: [number, number] = [s[4], s[5]], g: [number, number] = [-n[1], n[0]], a = n[0] * s[0] + n[1] * s[1]
    const tA = [g[0] * s[0] + g[1] * s[1], g[0] * s[2] + g[1] * s[3]].sort((u, v) => u - v)
    for (const s2 of r.seg) {
      if (Math.abs(s2[4] + n[0]) > 1e-6 || Math.abs(s2[5] + n[1]) > 1e-6) continue
      if (Math.abs(n[0] * (s2[0] + d[0]) + n[1] * (s2[1] + d[1]) - a) > 1e-3) continue // não é a mesma reta
      const gd = g[0] * d[0] + g[1] * d[1], tB = [g[0] * s2[0] + g[1] * s2[1] + gd, g[0] * s2[2] + g[1] * s2[3] + gd].sort((u, v) => u - v)
      const lo = Math.max(tA[0], tB[0]) - 1e-6, hi = Math.min(tA[1], tB[1]) + 1e-6
      if (hi - lo < 1) continue
      lados++; comp += hi - lo
      const A = topoBorda(mA, n, a, base.altura, g), B = topoBorda(mB, [-n[0], -n[1]], -(n[0] * s2[0] + n[1] * s2[1]), base.altura, g)
      for (const [t, za] of A) {
        if (t / 1000 < lo || t / 1000 > hi) continue
        total++
        const k = [0, 1, -1].map(e => B.get(t - Math.round(gd * 1000) + e)).find(v => v !== undefined) // t de B em coordenadas próprias; ±1 µm do arredondamento
        if (k === undefined) continue
        c++; max = Math.max(max, Math.abs(za - k))
      }
    }
  }
  return { c, total, max, lados, comp }
}
const conferePeca = (nome: string, r: Awaited<ReturnType<typeof emendaPeca>>) => {
  const ok = r.lados > 0 && r.c > 100 && r.c === r.total && r.max < 5e-5
  if (!ok) falhas++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${nome} — ${r.lados} lados, ${r.comp.toFixed(1)} mm, ${r.c} pontos de ${r.total}, máx ${r.max.toFixed(4)} mm`)
}
// hexágono 2×3 e 3×2 (Pedra): deslocamentos (células) que ladrilham o plano
for (const [L, C, ds] of [[2, 3, [[0, 2], [0, -2], [3, .5], [3, -.5], [-3, .5], [-3, -.5]]], [3, 2, [[0, 3], [0, -3], [2, 0], [-2, 0]]]] as [number, number, number[][]][]) {
  const base = op({ textura: 'pedra', formato: 'hexagono', linhas: L, colunas: C })
  for (const [px, py] of ds) conferePeca(`pedra: emenda 0,0000 mm, hexágono ${L}×${C}, vizinho em (${px}; ${py})`, await emendaPeca(base, px, py))
}
console.log(`\n${falhas ? falhas + ' FAIL' : 'tudo PASS'}`)
process.exit(falhas ? 1 : 0)
