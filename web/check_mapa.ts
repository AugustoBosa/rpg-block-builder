// Check do modelo do mapa: `cd web && npx tsx check_mapa.ts`. Imprime PASS/FALHA por caso.
import { centros, celula, contorno, SISTEMA, type Sistema } from './src/sistema'
import { abrir, arestaCanonica, apaga, cria, centroMundo, nLados, pinta, poeAresta, salvar, vizinho, type CelulaMapa, type Mapa } from './src/mapa/modelo'
import { dividir, gira, tileset, type Instancia, type Peca } from './src/mapa/divisao'
import { opcoesDe } from './src/mapa/opcoes'
import { quadro } from './src/aberturas'
import { pisoComParedes } from './src/parede'
import { fechada } from './src/bloco'

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

// ---- divisão em peças (T3): divisao.ts e opcoes.ts ----
type P2 = [number, number]
const ESP = 6
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1]
const dentroConvexo = (p: P2, P: P2[]) => { // p dentro (ou na borda) de polígono convexo, em qualquer sentido
  const cs = P.map((a, j) => { const b = P[(j + 1) % P.length]; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) })
  return cs.every(x => x >= -1e-6) || cs.every(x => x <= 1e-6)
}
const giraPt = (p: P2, voltas: number): P2 => { let [x, y] = p; for (let t = 0; t < voltas; t++) [x, y] = [-y, x]; return [x, y] } // anti-horário, quarto de volta por passo
const mapaDe = (s: Sistema, cels: P2[], max: P2 = [3, 3]): Mapa => {
  const mp = cria(s, 'T'), N = mp.niveis[0]
  N.salas = [{ id: 's1', nome: 'Sala', tema: '', max, cortes: [] }]
  for (const [c, r] of cels) pinta(mp, 'terreo', c, r, { tex: 'pedra', tipo: 'piso', sala: 's1' })
  return mp
}
const bordaParede = (mp: Mapa, s: Sistema) => { // parede em toda aresta de célula que dá para fora do mapa
  const N = mp.niveis[0]
  for (const k of Object.keys(N.celulas)) {
    const [c, r] = k.split(',').map(Number)
    for (let i = 0; i < nLados(s); i++) { const [c2, r2] = vizinho(s, c, r, i); if (!N.celulas[`${c2},${r2}`]) poeAresta(mp, 'terreo', s, c, r, i, { tipo: 'parede' }) }
  }
}
const salaDe = (mp: Mapa, it: Instancia) => mp.niveis[0].salas.find(x => x.id === mp.niveis[0].celulas[it.celulas[0]].sala)!
const atravessa = (mp: Mapa, it: Instancia) => { // independente de divisao.ts: aresta interna da peça com parede, corte, sala, tex, tipo ou dir diferente
  const N = mp.niveis[0], s = mp.sistema, set = new Set(it.celulas)
  return it.celulas.some(key => {
    const [c, r] = key.split(',').map(Number), A = N.celulas[key]
    return Array.from({ length: nLados(s) }, (_, i) => i).some(i => {
      const [c2, r2] = vizinho(s, c, r, i), k2 = `${c2},${r2}`, ak = arestaCanonica(s, c, r, i)
      if (!set.has(k2)) return false
      const B = N.celulas[k2], sa = N.salas.find(x => x.id === A.sala)!
      return N.arestas[ak] !== undefined || sa.cortes.includes(ak) || A.tex !== B.tex || A.tipo !== B.tipo || A.sala !== B.sala || A.dir !== B.dir
    })
  })
}
const retangulos = (o: ReturnType<typeof opcoesDe>) => o.paredes.map(p => { const q = quadro(o, p); return [q.pt(0, q.o1), q.pt(p.comprimento, q.o1), q.pt(p.comprimento, q.o2), q.pt(0, q.o2)] as P2[] })
const meioCelulas = (s: Sistema, keys: string[]): P2 => { // centro da caixa das células no mapa (mesmo critério de centros())
  const P = keys.map(k => { const [c, r] = k.split(',').map(Number); return centroMundo(s, c, r) })
  const xs = P.map(p => p[0]), ys = P.map(p => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}
const pecaUm = (i: number): Peca => ({ linhas: 1, colunas: 1, tex: 'pedra', texParede: '', tipo: 'piso', tema: '', altura_parede: 30, paredes: [{ c: 0, r: 0, i, tipo: 'parede' }], colunasCel: [] })
const sQ2 = sis('quadrado', { largura: 35, comprimento: 35 }), sH2 = sis('hexagono', { largura: 35 })

{ // 1. cobertura, tamanho e barreiras num mapa 7×5 com 2 salas, cortes, paredes, porta, rampa e coluna
  const s7 = sis('quadrado', { largura: 35, comprimento: 35 })
  const m1 = cria(s7, 'Mapa 7x5'), N1 = m1.niveis[0]
  N1.salas = [{ id: 's1', nome: 'A', tema: '', max: [3, 3], cortes: [arestaCanonica(s7, 1, 2, 0)] }, { id: 's2', nome: 'B', tema: 'taverna', max: [2, 4], cortes: [] }]
  for (let c = 0; c < 7; c++) for (let r = 0; r < 5; r++) {
    const sala = c <= 3 ? 's1' : 's2', tipo = c === 2 && r === 4 ? 'rampa' : 'piso'
    pinta(m1, 'terreo', c, r, { tex: c === 5 && r <= 1 ? 'lajota' : 'pedra', tipo, sala, ...(tipo === 'rampa' ? { dir: '+x' as const } : {}) })
  }
  bordaParede(m1, s7)
  poeAresta(m1, 'terreo', s7, 3, 3, 0, { tipo: 'porta' })
  poeAresta(m1, 'terreo', s7, 1, 1, 1, { tipo: 'parede' })
  N1.colunas['1,1'] = { lado: 10 }
  const ins1 = dividir(m1, 'terreo'), cob = new Map<string, number>()
  for (const it of ins1) for (const k of it.celulas) cob.set(k, (cob.get(k) ?? 0) + 1)
  const todas = Object.keys(N1.celulas)
  const cobreTudo = todas.length === cob.size && todas.every(k => cob.get(k) === 1)
  const cabe = ins1.every(it => { const sa = salaDe(m1, it); return it.linhas <= sa.max[0] && it.colunas <= sa.max[1] })
  const cruza = ins1.some(it => atravessa(m1, it))
  confere('cobertura: toda célula em 1 peça; nenhuma passa de sala.max; nenhuma atravessa parede, corte, sala, tex, tipo ou dir', cobreTudo && cabe && !cruza, `${todas.length} células em ${ins1.length} peças`)

  // 2. toda aresta com parede tem exatamente 1 dono (contado pelas peças, já desgiradas para o mapa)
  const cont = new Map<string, number>()
  for (const it of ins1) for (const e of gira(it.peca, m1.sistema, it.rot).paredes) if (e.tipo !== 'reforco') {
    const k = arestaCanonica(s7, it.c0 + e.c, it.r0 + e.r, e.i); cont.set(k, (cont.get(k) ?? 0) + 1)
  }
  const esperado = (k: string) => { const [c, r, i] = k.split(',').map(Number), [c2, r2] = vizinho(s7, c, r, i); return N1.celulas[`${c},${r}`]?.tipo === 'piso' || N1.celulas[`${c2},${r2}`]?.tipo === 'piso' ? 1 : 0 }
  const donosOk = Object.keys(N1.arestas).every(k => (cont.get(k) ?? 0) === esperado(k))
  confere('dono: toda aresta com parede tem exatamente 1 dono', donosOk, `${Object.keys(N1.arestas).length} arestas com parede`)
}

{ // 3. simetria: sala 6×6 cercada, max 3×3
  const cels66: P2[] = []
  for (let c = 0; c < 6; c++) for (let r = 0; r < 6; r++) cels66.push([c, r])
  const mq = mapaDe(sQ2, cels66, [3, 3]); bordaParede(mq, sQ2)
  const iq = dividir(mq, 'terreo'), uq = tileset(mq).pecas
  const mr = mapaDe(sis('quadrado', { largura: 35, comprimento: 50 }), cels66, [3, 3]); bordaParede(mr, mr.sistema)
  const ur = tileset(mr).pecas
  const quadrada = iq.length === 4 && uq.size === 1 && [...uq.values()][0].qtd === 4
  const retangular = ur.size === 2 && [...ur.values()].every(e => e.qtd === 2)
  confere('simetria: 6×6 quadrada → 4 peças e 1 única (qtd 4); retângulo 35×50 → 2 únicas', quadrada && retangular, `quadrada: ${iq.length} peças, ${uq.size} única(s); retângulo: ${ur.size} única(s)`)
}

{ // 4. hexágono: sala 4×4 cercada cobre tudo; coluna ímpar não inicia peça de mais de 1 coluna
  const cels44: P2[] = []
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) cels44.push([c, r])
  const mh = mapaDe(sH2, cels44, [3, 3]); bordaParede(mh, sH2)
  const ins = dividir(mh, 'terreo'), cob = new Map<string, number>()
  for (const it of ins) for (const k of it.celulas) cob.set(k, (cob.get(k) ?? 0) + 1)
  const cobre = cels44.length === cob.size && cels44.every(([c, r]) => cob.get(`${c},${r}`) === 1)
  const colunas = ins.every(it => it.colunas === 1 || it.c0 % 2 === 0)
  confere('hex 4×4 cercada: cobre tudo 1 vez; coluna ímpar não inicia peça de mais de 1 coluna', cobre && colunas, `${ins.length} peças`)
}

{ // 5. âncora: parede de 1 lado, dentro da célula e encostada no lado certo (quadrado e hex); gira leva a parede ao lado girado
  for (const [nome, s] of [['quadrado', sQ2], ['hexágono', sH2]] as [string, Sistema][]) {
    const mp = cria(s, 'A'), N = mp.niveis[0], sa = N.salas[0], k = nLados(s), cl = celula(s), V = contorno(cl, 0)
    const ruins: number[] = []
    for (let i = 0; i < k; i++) {
      const o = opcoesDe(pecaUm(i), mp, sa, N), R = retangulos(o)
      if (o.paredes.length !== 1) { ruins.push(i); continue }
      const nv = cl.n[i], a = cl.a[i], tg: P2 = [-nv[1], nv[0]], pr = R[0].map(p => dot(p, nv)), al = R[0].map(p => dot(p, tg))
      const lado = [dot(V[(i - 1 + k) % k], tg), dot(V[i], tg)]
      const encosta = Math.abs(Math.max(...pr) - a) < .01 && Math.abs(Math.min(...pr) - (a - ESP)) < .01
        && Math.abs(Math.min(...al) - Math.min(...lado)) < .01 && Math.abs(Math.max(...al) - Math.max(...lado)) < .01
      if (!encosta || !R[0].every(p => dentroConvexo(p, V))) ruins.push(i)
    }
    confere(`âncora (${nome}): parede de cada lado dentro da célula e encostada no lado certo`, ruins.length === 0, ruins.length ? `falhou nos lados ${ruins.join(', ')}` : `${k} lados ok`)
    let giro = true
    const voltas = s.formato === 'hexagono' ? [2] : [1, 2, 3]
    for (let i = 0; i < k; i++) {
      const base = retangulos(opcoesDe(pecaUm(i), mp, sa, N))[0]
      for (const rot of voltas) {
        const g = retangulos(opcoesDe(gira(pecaUm(i), s, rot), mp, sa, N)), esp = base.map(p => giraPt(p, rot))
        if (g.length !== 1 || !esp.every(p => g[0].some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < .01))) giro = false
      }
    }
    confere(`gira (${nome}): girar a peça gira a parede no sentido anti-horário`, giro, voltas.map(v => `${v * 90}°`).join(' '))
  }
}

{ // 6. reforço: sala em L (4×4 sem o canto 2×2), quadrado e hex. Cada ponto a < e da parede, do lado de dentro, tem de estar coberto
  const faltas = (s: Sistema, cels: P2[]) => {
    const mp = mapaDe(s, cels), N = mp.niveis[0], sa = N.salas[0], k = nLados(s), V = contorno(celula(s), 0)
    bordaParede(mp, s)
    const rects: P2[][] = []
    for (const it of dividir(mp, 'terreo')) {
      const mc = meioCelulas(s, it.celulas)
      for (const R of retangulos(opcoesDe(it.peca, mp, sa, N))) rects.push(R.map(p => { const g = giraPt(p, it.rot); return [g[0] + mc[0], g[1] + mc[1]] as P2 }))
    }
    const celPol = cels.map(([c, r]) => { const [cx, cy] = centroMundo(s, c, r); return V.map(v => [cx + v[0], cy + v[1]] as P2) })
    const bordas: [P2, P2][] = []
    for (const [c, r] of cels) {
      const [cx, cy] = centroMundo(s, c, r)
      for (let i = 0; i < k; i++) {
        const [c2, r2] = vizinho(s, c, r, i), a = V[(i - 1 + k) % k], b = V[i]
        if (!N.celulas[`${c2},${r2}`]) bordas.push([[cx + a[0], cy + a[1]], [cx + b[0], cy + b[1]]])
      }
    }
    const dseg = (p: P2, [a, b]: [P2, P2]) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
    const xs = celPol.flatMap(P => P.map(p => p[0])), ys = celPol.flatMap(P => P.map(p => p[1]))
    let total = 0, falta = 0
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += .5) for (let y = Math.min(...ys); y <= Math.max(...ys); y += .5) {
      const p: P2 = [x, y]
      if (!celPol.some(P => dentroConvexo(p, P))) continue
      if (Math.min(...bordas.map(b => dseg(p, b))) >= ESP - .05) continue
      total++
      if (!rects.some(R => dentroConvexo(p, R))) falta++
    }
    return { total, falta }
  }
  const L: P2[] = []
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) if (!(c >= 2 && r >= 2)) L.push([c, r])
  const rq = faltas(sQ2, L), rh = faltas(sH2, L)
  confere('reforço: pontos a < e da parede, do lado de dentro, cobertos (sala em L, quadrado e hex)', rq.falta === 0 && rh.falta === 0 && rq.total > 0 && rh.total > 0, `quadrado: ${rq.falta}/${rq.total} sem cobrir; hex: ${rh.falta}/${rh.total}`)
}

{ // 7. malha fechada (previa) de 3 peças únicas: com porta, rampa e hexágono
  const pega = async (mp: Mapa, escolhe: (it: Instancia) => boolean) => {
    const it = tileset(mp).instancias.find(escolhe)!
    const ma = await pisoComParedes(opcoesDe(it.peca, mp, salaDe(mp, it), mp.niveis[0]), true)
    return fechada(ma.pos, ma.idx)
  }
  const mA = mapaDe(sQ2, [[0, 0], [1, 0]]); bordaParede(mA, sQ2); poeAresta(mA, 'terreo', sQ2, 0, 0, 2, { tipo: 'porta' })
  const mR = mapaDe(sQ2, [[0, 0], [1, 0]]); bordaParede(mR, sQ2)
  for (const c of [0, 1]) pinta(mR, 'terreo', c, 0, { tex: 'pedra', tipo: 'rampa', dir: '+x', sala: 's1' })
  const mH = mapaDe(sH2, [[0, 0], [1, 0], [0, 1], [1, 1]]); bordaParede(mH, sH2)
  const f1 = await pega(mA, it => it.peca.paredes.some(e => e.tipo === 'porta'))
  const f2 = await pega(mR, it => it.peca.tipo === 'rampa')
  const f3 = await pega(mH, it => it.peca.paredes.length > 0)
  confere('malha fechada (previa): peça com porta, rampa e hexágono', f1 && f2 && f3, `porta ${f1}, rampa ${f2}, hex ${f3}`)
}

{ // 8. suportes (rápido, sem malha): grids 7×7 cobrem 1 vez em 6×6, 6×1, 1×6, 1×1; degrau base 2 3×3 → qtd 2; aviso de nível elevado sem escada/rampa
  const m7 = cria(sQ2, 'G')
  for (let c = 0; c < 7; c++) for (let r = 0; r < 7; r++) pinta(m7, 'terreo', c, r, { tex: 'pedra', tipo: 'piso', sala: 's1' })
  const g7 = tileset(m7).suportes.filter(x => x.tipo === 'grid'), cobG = new Map<string, number>()
  for (const x of g7) for (let r = x.r0; r < x.r0 + x.linhas; r++) for (let c = x.c0; c < x.c0 + x.colunas; c++) cobG.set(`${c},${r}`, (cobG.get(`${c},${r}`) ?? 0) + 1)
  const tamG = g7.map(x => `${x.linhas}x${x.colunas}`).sort().join(' ')
  confere('grids 7×7: cobrem as 49 células 1 vez em 6×6, 6×1, 1×6, 1×1', cobG.size === 49 && [...cobG.values()].every(v => v === 1) && tamG === '1x1 1x6 6x1 6x6', tamG)

  const mD = cria(sQ2, 'D')
  mD.niveis.push({ id: 'alto', nome: 'Alto', base: 2, altura_parede: 30, celulas: {}, arestas: {}, colunas: {}, salas: [{ id: 's1', nome: 'Sala', tema: '', max: [3, 3], cortes: [] }] })
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) pinta(mD, 'alto', c, r, { tex: 'pedra', tipo: 'piso', sala: 's1' })
  const qD = tileset(mD).extras.get('degrau:3x3')?.qtd
  confere('degrau: nível base 2 com 3×3 células → extras "degrau:3x3" qtd 2', qD === 2, `qtd ${qD}`)

  const mE = cria(sQ2, 'E')
  mE.niveis.push({ id: 'andar', nome: 'Andar', base: 1, altura_parede: 30, celulas: {}, arestas: {}, colunas: {}, salas: [{ id: 's1', nome: 'Sala', tema: '', max: [3, 3], cortes: [] }] })
  pinta(mE, 'andar', 0, 0, { tex: 'pedra', tipo: 'piso', sala: 's1' })
  const semEscada = tileset(mE).avisos.includes('Nível "Andar" está elevado e não tem escada nem rampa de acesso.')
  pinta(mE, 'terreo', 0, 0, { tex: 'pedra', tipo: 'escada', dir: '+x', sala: 's1' })
  const comEscada = tileset(mE).avisos.some(a => a.includes('está elevado'))
  confere('aviso: nível base 1 sem escada/rampa avisa; com uma célula escada não avisa', semEscada && !comEscada, `sem ${semEscada}, com ${!comEscada}`)

  const mH2 = cria(sH2, 'H'), NH = mH2.niveis[0]; NH.salas = [{ id: 's1', nome: 'Sala', tema: '', max: [3, 3], cortes: [] }]
  for (let c = 0; c < 5; c++) for (let r = 0; r < 4; r++) if (c || r) pinta(mH2, 'terreo', c, r, { tex: 'pedra', tipo: 'piso', sala: 's1' })
  const gH = tileset(mH2).suportes.filter(x => x.tipo === 'grid')
  confere('hex: nenhum grid com mais de 1 coluna começa em coluna ímpar', gH.length > 0 && gH.every(x => x.colunas === 1 || x.c0 % 2 === 0), `${gH.length} grids`)
}

{ // 9. reforço só onde as duas paredes da quina são de donos fora da célula P (sala 2×2 dentro de outra sala, paredes donas das de fora)
  for (const [s, esperado] of [[sQ2, 1], [sH2, -1]] as const) {
    const m = cria(s, 'R'), N = m.niveis[0], K = nLados(s)
    N.salas = [{ id: 's1', nome: 'A', tema: '', max: [3, 3], cortes: [] }, { id: 's2', nome: 'B', tema: '', max: [3, 3], cortes: [] }]
    const dentro = (c: number, r: number) => c >= 0 && c <= 1 && r >= 0 && r <= 1
    for (let c = -1; c <= 2; c++) for (let r = -1; r <= 2; r++) pinta(m, 'terreo', c, r, { tex: 'pedra', tipo: 'piso', sala: dentro(c, r) ? 's1' : 's2' })
    for (let c = 0; c <= 1; c++) for (let r = 0; r <= 1; r++) for (let i = 0; i < K; i++) { const [c2, r2] = vizinho(s, c, r, i); if (!dentro(c2, r2)) poeAresta(m, 'terreo', s, c, r, i, { tipo: 'parede' }) }
    const its = dividir(m, 'terreo'), refs = its.flatMap(it => gira(it.peca, s, it.rot).paredes.filter(e => e.tipo === 'reforco').map(e => [it, e] as const))
    // dona de cada parede: célula da peça cuja entrada (não reforço) cai na aresta
    const donas = new Set(its.flatMap(it => gira(it.peca, s, it.rot).paredes.filter(e => e.tipo !== 'reforco').map(e => `${it.c0 + e.c},${it.r0 + e.r},${e.i}`)))
    const soltos = refs.filter(([it, e]) => { const c = it.c0 + e.c, r = it.r0 + e.r; return ![...Array(K).keys()].some(i => donas.has(`${c},${r},${i}`)) && s.formato === 'hexagono' })
    const ok = esperado >= 0 ? refs.length === esperado : soltos.length === 0
    confere(`reforço ${s.formato}: sala dentro de sala ${esperado >= 0 ? `tem ${esperado} poste (canto -x,-y)` : 'só em célula dona de parede'}`, ok, `${refs.length} reforços, ${soltos.length} em célula sem parede`)
  }
}

if (falhas) process.exit(1)
