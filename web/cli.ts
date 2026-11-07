// Gera peças pela linha de comando (mesmo código do navegador), para medir com as ferramentas Python.
// npx tsx cli.ts <pasta> [--peca piso|grid|degrau] [--formato quadrado|retangulo|hexagono] [--semente 1] [--recuo 4] [--pedra_vao 0.8] ...
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fechada, final, padrao, piso, stl, type Malha } from './src/bloco'
import { degrau, grid, malha } from './src/sistema'

const [pasta, ...args] = process.argv.slice(2)
const o = padrao()
let peca = 'piso'
for (let i = 0; i < args.length; i += 2) {
  const k = args[i].replace(/^--/, ''), v = args[i + 1]
  if (k === 'peca') peca = v
  else if (k === 'formato') o.formato = v as typeof o.formato
  else if (k.startsWith('pedra_')) (o.pedra as any)[k.slice(6)] = +v
  else if (k in o) (o as any)[k] = +v
  else throw new Error(`opção desconhecida: ${k}`)
}
const t0 = performance.now()
let m: Malha, nome: string
if (peca === 'piso') {
  const cru = piso(o)
  m = await final(cru)
  nome = `WEB-Piso Pedra ${o.formato} s${String(o.semente).padStart(2, '0')} x${o.posicao_x} y${o.posicao_y}`
} else if (peca === 'grid') { m = malha(grid(o, o.linhas, o.colunas)); nome = `WEB-Grid ${o.formato} ${o.linhas}x${o.colunas}` }
else if (peca === 'degrau') { m = malha(degrau(o, o.linhas, o.colunas, o.altura_degrau)); nome = `WEB-Degrau ${o.formato} ${o.linhas}x${o.colunas}` }
else throw new Error(`peça desconhecida: ${peca}`)
const t1 = performance.now()
mkdirSync(pasta, { recursive: true })
writeFileSync(join(pasta, nome + '.stl'), Buffer.from(stl(m)))
console.log(`${nome}: ${m.idx.length / 3} tri, ${(t1 - t0).toFixed(0)} ms, fechada: ${fechada(m.pos, m.idx) ? 'sim' : 'NÃO'}`)
