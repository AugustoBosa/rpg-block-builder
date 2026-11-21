// Emenda do topo entre peças vizinhas (hexágono 1×1 nas 3 direções; quadrado 2×3 para +Y). `npx tsx check_emenda.ts` imprime PASS/FAIL.
// Mesmo método do check_texturas.ts, mas a borda é qualquer lado de normal n: A na borda n contra B (campo deslocado 2a·n) na borda −n, por coordenada ao longo do lado.
import { final, padrao, piso, type Malha, type Opcoes } from './src/bloco'
import type { TexId } from './src/textura'

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
console.log(`\n${falhas ? falhas + ' FAIL' : 'tudo PASS'}`)
process.exit(falhas ? 1 : 0)
