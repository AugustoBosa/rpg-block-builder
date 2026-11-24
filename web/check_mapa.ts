// Check do modelo do mapa: `cd web && npx tsx check_mapa.ts`. Imprime PASS/FALHA por caso.
import { centros, celula, SISTEMA, type Sistema } from './src/sistema'
import { abrir, arestaCanonica, apaga, cria, centroMundo, nLados, pinta, poeAresta, salvar, vizinho, type CelulaMapa, type Mapa } from './src/mapa/modelo'

let falhas = 0
const confere = (nome: string, ok: boolean, medido: string) => { if (!ok) falhas++; console.log(`${ok ? 'PASS' : 'FALHA'} ${nome}: ${medido}`) }
const sis = (formato: Sistema['formato'], extra: Partial<Sistema> = {}): Sistema =>
  ({ ...Object.fromEntries(Object.entries(SISTEMA).map(([k, v]) => [k, v[0]])), formato, ...extra }) as Sistema
const Q = sis('quadrado', { largura: 30, comprimento: 40 }), H = sis('hexagono', { largura: 30 })
const celsQ: [number, number][] = [[0, 0], [3, -2], [-4, 5], [-1, -1], [2, 7]]
const celsH: [number, number][] = [[0, 0], [1, 0], [2, 3], [-1, 2], [-2, -3], [3, -1], [-3, 4]]

const volta = (s: Sistema, cels: [number, number][]) => cels.every(([c, r]) => {
  const k = nLados(s)
  return Array.from({ length: k }, (_, i) => i).every(i => {
    const [c2, r2] = vizinho(s, c, r, i), [c3, r3] = vizinho(s, c2, r2, (i + k / 2) % k)
    return c3 === c && r3 === r
  })
})
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])
const bateCentros = (s: Sistema) => {
  const P = centros(celula(s), 4, 4), [x0, y0] = centroMundo(s, 0, 0)
  return [0, 1, 2, 3].every(r => [0, 1, 2, 3].every(c => {
    const [x, y] = centroMundo(s, c, r), [px, py] = [P[r * 4 + c][0] - P[0][0], P[r * 4 + c][1] - P[0][1]]
    return Math.abs(x - x0 - px) < 1e-6 && Math.abs(y - y0 - py) < 1e-6
  }))
}

confere('quadrado: vizinho de cada lado volta pelo lado oposto', volta(Q, celsQ), `v(0,0,0) = ${vizinho(Q, 0, 0, 0)}, v(0,0,1) = ${vizinho(Q, 0, 0, 1)}`)
confere('quadrado: centroMundo bate com centros() de sistema.ts', bateCentros(Q), 'ok')
confere('hex: vizinho de cada lado volta pelo lado oposto (colunas pares e ímpares, negativas)', volta(H, celsH), `v(0,0,0) = ${vizinho(H, 0, 0, 0)}, v(1,0,0) = ${vizinho(H, 1, 0, 0)}`)
confere('hex: centroMundo bate com centros() de sistema.ts', bateCentros(H), 'ok')
const distOk = celsH.every(([c, r]) => Array.from({ length: 6 }, (_, i) => dist(centroMundo(H, c, r), centroMundo(H, ...vizinho(H, c, r, i)))).every(d => Math.abs(d - 30) < 1e-6))
confere('hex: centros de vizinhos distam a largura (30 mm)', distOk, `d(0,0) = ${dist(centroMundo(H, 0, 0), centroMundo(H, ...vizinho(H, 0, 0, 0))).toFixed(3)}`)

for (const [nome, s, cels] of [['quadrado', Q, celsQ], ['hex', H, celsH]] as [string, Sistema, [number, number][]][]) {
  const k = nLados(s)
  const ok = cels.every(([c, r]) => Array.from({ length: k }, (_, i) => i).every(i => {
    const [c2, r2] = vizinho(s, c, r, i), j = (i + k / 2) % k
    return arestaCanonica(s, c, r, i) === arestaCanonica(s, c2, r2, j)
  }))
  confere(`${nome}: as duas células de uma aresta dão a mesma chave canônica`, ok, 'ok')
}

function exemplo(s: Sistema): Mapa {
  const m = cria(s, 'Teste'), L = m.niveis[0]
  pinta(m, 'terreo', 0, 0, { tex: 'pedra', tipo: 'piso', sala: 's1' })
  pinta(m, 'terreo', 1, 0, { tex: 'lajota', tipo: 'rampa', dir: '+x', sala: 's1' })
  pinta(m, 'terreo', 0, 1, { tex: 'tijolo', tipo: 'piso', sala: 's2' })
  L.salas.push({ id: 's2', nome: 'Taverna', tema: 'taverna', max: [2, 4], cortes: [arestaCanonica(s, 0, 1, 0)] })
  poeAresta(m, 'terreo', s, 0, 0, 0, { tipo: 'porta', tex: 'tijolo' })
  poeAresta(m, 'terreo', s, 1, 0, 2, { tipo: 'janela' })
  L.colunas['0,0'] = { lado: 10 }
  m.niveis.push({ id: 'andar', nome: 'Andar', base: 1, altura_parede: 30, celulas: {}, arestas: {}, colunas: {}, salas: [{ id: 's1', nome: 'Quarto', tema: '', max: [3, 3], cortes: [] }] })
  pinta(m, 'andar', 0, 0, { tex: 'tabuas', tipo: 'escada', dir: '-y', sala: 's1' })
  poeAresta(m, 'andar', s, 1, 0, 1, { tipo: 'arco' })
  return m
}

for (const [nome, s] of [['quadrado', Q], ['hex', H]] as [string, Sistema][]) {
  const txt = salvar(exemplo(s)), txt2 = salvar(abrir(txt))
  confere(`${nome}: salvar, abrir e salvar de novo dá o mesmo texto`, txt === txt2, `${txt.length} caracteres`)
}

const qTxt = salvar(exemplo(Q)), hTxt = salvar(exemplo(H))
const rejeita = (nome: string, txt: string) => {
  try { abrir(txt); confere(nome, false, 'aceitou o arquivo') }
  catch (e) { confere(nome, true, (e as Error).message) }
}
rejeita('abrir rejeita versao 2', qTxt.replace('"versao": 1', '"versao": 2'))
rejeita('abrir rejeita JSON quebrado', qTxt.slice(0, -10))
rejeita('abrir rejeita célula com sala inexistente', (() => { const o = JSON.parse(qTxt); o.niveis[0].celulas['0,0'].sala = 'nada'; return JSON.stringify(o) })())
rejeita('abrir rejeita aresta com i >= k/2 (quadrado)', (() => { const o = JSON.parse(qTxt); o.niveis[0].arestas['0,0,2'] = { tipo: 'parede' }; return JSON.stringify(o) })())
rejeita('abrir rejeita aresta com i >= k/2 (hex)', (() => { const o = JSON.parse(hTxt); o.niveis[0].arestas['0,0,3'] = { tipo: 'parede' }; return JSON.stringify(o) })())

const m = cria(Q), C: CelulaMapa = { tex: 'pedra', tipo: 'piso', sala: 's1' }
pinta(m, 'terreo', 0, 0, C); pinta(m, 'terreo', 1, 0, C)
poeAresta(m, 'terreo', Q, 1, 0, 2, { tipo: 'parede' })
poeAresta(m, 'terreo', Q, 0, 0, 1, { tipo: 'parede' })
const arestasAntes = Object.keys(m.niveis[0].arestas).sort().join(' ')
apaga(m, 'terreo', 0, 0)
const depoisUm = Object.keys(m.niveis[0].arestas).sort().join(' ')
apaga(m, 'terreo', 1, 0)
const depoisDois = Object.keys(m.niveis[0].arestas).length
confere('apaga: aresta com vizinho ainda pintado fica; órfã some', arestasAntes === '0,0,0 0,0,1' && depoisUm === '0,0,0' && depoisDois === 0, `antes "${arestasAntes}", depois de apagar (0,0) "${depoisUm}", depois de apagar (1,0) ${depoisDois} arestas`)

if (falhas) process.exit(1)
