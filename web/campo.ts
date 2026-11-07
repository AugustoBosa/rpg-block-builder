// Estatística do campo da Pedra numa área de 200 × 200 mm (sem malha), para comparar com `campo_textura.py` do Blender.
// npx tsx campo.ts
import { padrao } from './src/bloco'
import { pedra } from './src/pedra'

const o = padrao(), d: number[] = []
for (let j = 0; j <= 600; j++) for (let i = 0; i <= 600; i++)
  d.push(Math.min(pedra(-100 + i / 3, -100 + j / 3, o.semente * 13.7, o.tamanho_pedra, o.profundidade * o.junta_piso, o.desgaste, o.pedra), o.teto))
d.sort((a, b) => a - b)
const p = (q: number) => d[Math.floor(d.length * q)].toFixed(3)
console.log(`CAMPO Pedra piso: p50 ${p(.5)}  p95 ${p(.95)}  f>0,4 ${(d.filter(x => x > .4).length / d.length).toFixed(2)}`)
