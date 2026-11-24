// Gera os modelos prontos de public/mapas/ pela API do modelo (cria, pinta, poeAresta, salvar, abrir). Rodar: cd web && npx tsx modelos_mapa.ts
// Cada desenho é uma grade de letras (uma letra = uma sala, '.' = vazio). Linha = r, coluna = c, origem [c0, r0] em células.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { abrir, cria, nLados, pinta, poeAresta, salvar, vizinho, type CelulaMapa, type Dir, type Mapa, type Nivel, type Sala } from './src/mapa/modelo'
import type { TexId } from './src/textura'
import type { Sistema } from './src/sistema'

// Padrões de SISTEMA copiados de web/src/mapa/main.ts (importar sistema.ts puxaria o WASM).
const PADRAO = {
  largura: 35, comprimento: 35, altura_pe: 6, recuo: 4, chanfro: .8, conicidade: 0, ombro: 2.5, nervura: 3, folga: .15, folga_fundo: .3,
  ima_d: 0, ima_h: 2, folga_ima: .15, fundo: 0, chanfro_furo: 0, chanfro_furo_ang: 45,
}
const sistema = (formato: Sistema['formato']): Sistema => ({ ...PADRAO, formato })

type Abertura = [c: number, r: number, i: number, tipo: 'porta' | 'janela' | 'arco']
interface Def {
  id: string; nome: string; base: number; origem?: [number, number]
  grade: string[]
  salas: Record<string, { nome: string; tema: string }>
  texs: Record<string, TexId>                 // textura do piso de cada letra (padrão 'pedra')
  especiais?: [number, number, 'escada' | 'rampa', Dir][]
  paredes: 'tudo' | 'salas' | 'nada'          // 'tudo': toda aresta com outra sala ou vazio; 'salas': só entre salas; 'nada'
  aberturas?: Abertura[]                      // depois das paredes: troca a parede por porta, janela ou arco
  colunas?: [number, number][]
}

function nivel(m: Mapa, d: Def) {
  const salas: Sala[] = Object.entries(d.salas).map(([id, s]) => ({ id, nome: s.nome, tema: s.tema, max: [3, 3], cortes: [] }))
  const nv: Nivel = { id: d.id, nome: d.nome, base: d.base, altura_parede: 30, celulas: {}, arestas: {}, colunas: {}, salas }
  m.niveis.push(nv)
  const [c0, r0] = d.origem ?? [0, 0]
  d.grade.forEach((linha, dr) => [...linha].forEach((ch, dc) => {
    if (ch === '.') return
    if (!d.salas[ch]) throw new Error(`${m.nome}/${d.id}: letra "${ch}" sem sala`)
    pinta(m, d.id, c0 + dc, r0 + dr, { tex: d.texs[ch] ?? 'pedra', tipo: 'piso', sala: ch })
  }))
  for (const [c, r, tipo, dir] of d.especiais ?? []) pinta(m, d.id, c, r, { ...nv.celulas[`${c},${r}`], tipo, dir })
  if (d.paredes !== 'nada') for (const key of Object.keys(nv.celulas)) {
    const [c, r] = key.split(',').map(Number), cel: CelulaMapa = nv.celulas[key]
    for (let i = 0; i < nLados(m.sistema); i++) {
      const [c2, r2] = vizinho(m.sistema, c, r, i), viz = nv.celulas[`${c2},${r2}`]
      if (viz?.sala === cel.sala) continue
      if (d.paredes === 'tudo' || viz) poeAresta(m, d.id, m.sistema, c, r, i, { tipo: 'parede' })
    }
  }
  for (const [c, r, i, tipo] of d.aberturas ?? []) poeAresta(m, d.id, m.sistema, c, r, i, { tipo })
  for (const [c, r] of d.colunas ?? []) nv.colunas[`${c},${r}`] = { lado: 10 }
}

const novo = (formato: Sistema['formato'], nome: string) => { const m = cria(sistema(formato), nome); m.niveis.length = 0; return m }

function masmorra(): Mapa {
  const m = novo('quadrado', 'Masmorra')
  const d = 'dungeon'
  nivel(m, {
    id: 'terreo', nome: 'Térreo', base: 0,
    grade: [
      '',
      '.AAAAAA.........BBBB.........',
      '.AAAAAA.........BBBB.........',
      '.AAAAAA111111111BBBB22222222.',
      '.AAAAAA111111111BBBB22222222.',
      '.AAAAAA.........BBBB......22.',
      '.AAAAAA' + '.'.repeat(19) + '22.',
      ...Array(7).fill('.'.repeat(26) + '22.'),
      ...Array(3).fill('.'.repeat(24) + 'CCCCC'),
    ],
    salas: { A: { nome: 'Sala principal', tema: d }, B: { nome: 'Sala 2', tema: d }, C: { nome: 'Sala 3', tema: d }, '1': { nome: 'Corredor 1', tema: d }, '2': { nome: 'Corredor 2', tema: d } },
    texs: { A: 'pedra', B: 'pedra', C: 'pedra', '1': 'pedra', '2': 'pedra' },
    paredes: 'tudo',
    aberturas: [[6, 3, 0, 'porta'], [15, 3, 0, 'porta'], [19, 3, 0, 'porta'], [26, 13, 1, 'porta']],
    colunas: [[2, 2], [5, 5]],
  })
  return m
}

function taverna(): Mapa {
  const m = novo('quadrado', 'Taverna')
  const t = 'taverna', piso = { K: 'tabuas', S: 'tabuas', C: 'tabuas', '1': 'tabuas', '2': 'tabuas', '3': 'tabuas' } as Record<string, TexId>
  nivel(m, {
    id: 'terreo', nome: 'Térreo', base: 0,
    grade: ['KKKSSSSSSS', 'KKKSSSSSSS', 'KKKSSSSSSS', 'KKKSSSSSSS', 'KKKSSSSSSS', 'KKKCCCCCCC', 'KKKCCCCCCC', 'KKKCCCCCCC'],
    salas: { K: { nome: 'Cozinha', tema: t }, S: { nome: 'Salão', tema: t }, C: { nome: 'Corredor', tema: t } },
    texs: piso, paredes: 'tudo',
    aberturas: [[2, 2, 0, 'porta'], [5, 4, 1, 'porta'], [5, 7, 1, 'porta'], [4, 0, 3, 'janela'], [8, 0, 3, 'janela'], [0, 3, 2, 'janela'], [9, 2, 0, 'janela']],
    especiais: [[9, 5, 'escada', '-y'], [9, 6, 'escada', '-y'], [9, 7, 'escada', '-y']],
  })
  nivel(m, {
    id: 'primeiro', nome: '1º andar', base: 1, origem: [0, 2],
    grade: ['111222333C', '111222333C', '111222333C', 'CCCCCCCCCC', '.........C', '.........C'],
    salas: { '1': { nome: 'Quarto 1', tema: t }, '2': { nome: 'Quarto 2', tema: t }, '3': { nome: 'Quarto 3', tema: t }, C: { nome: 'Corredor', tema: t } },
    texs: piso, paredes: 'tudo',
    aberturas: [[1, 4, 1, 'porta'], [4, 4, 1, 'porta'], [7, 4, 1, 'porta'], [1, 2, 3, 'janela'], [7, 2, 3, 'janela']],
  })
  return m
}

function caverna(): Mapa {
  const m = novo('hexagono', 'Caverna')
  const t = 'caverna'
  nivel(m, {
    id: 'terreo', nome: 'Térreo', base: 0,
    grade: [
      '...CCCCC......',
      '..CCCCCCC.....',
      '.CCCLLCCCC....',
      '.CCLLLLCCCC...',
      '.CCCCCCCCC....',
      'CCCCCCCCCC....',
      'CCCCCCCCCCC...',
      'CCCCCCCCCCCC..',
      '.CCCCCCCCCC...',
      '..CCCCCCCCC...',
      '...CCCCCCC....',
      '....CCCCC.....',
    ],
    salas: { C: { nome: 'Caverna', tema: t }, L: { nome: 'Lago', tema: '' } },
    texs: { C: 'caverna', L: 'agua' },
    paredes: 'salas',
    especiais: [[7, 4, 'rampa', '+y'], [7, 5, 'rampa', '+y']],
  })
  nivel(m, {
    id: 'plataforma', nome: 'Plataforma', base: 1,
    grade: ['', '', '', '', '', '', '......PPP', '......PPP', '......PP'],
    salas: { P: { nome: 'Plataforma', tema: t } },
    texs: { P: 'caverna' }, paredes: 'tudo',
    aberturas: [[7, 6, 4, 'arco']],
  })
  return m
}

// Confere que cada sala é contígua (todas as células da sala se alcançam pela vizinhança).
function conexa(m: Mapa, nv: Nivel, sala: string) {
  const cels = Object.keys(nv.celulas).filter(k => nv.celulas[k].sala === sala)
  if (!cels.length) return
  const vis = new Set([cels[0]]), fila = [cels[0]]
  while (fila.length) {
    const [c, r] = fila.pop()!.split(',').map(Number)
    for (let i = 0; i < nLados(m.sistema); i++) {
      const k = vizinho(m.sistema, c, r, i).join(',')
      if (nv.celulas[k]?.sala === sala && !vis.has(k)) { vis.add(k); fila.push(k) }
    }
  }
  if (vis.size !== cels.length) throw new Error(`${m.nome}: sala "${sala}" do nível "${nv.id}" não é contígua`)
}

const modelos = [
  { arquivo: 'masmorra.json', nome: 'Masmorra', descricao: 'Três salas de pedra ligadas por corredores, 2 colunas na sala principal (quadrado, 35 mm)', m: masmorra() },
  { arquivo: 'taverna.json', nome: 'Taverna', descricao: 'Térreo com cozinha e salão, escada e 1º andar com três quartos (quadrado, 35 mm)', m: taverna() },
  { arquivo: 'caverna.json', nome: 'Caverna', descricao: 'Caverna irregular com lago, rampa e plataforma (hexágono, 35 mm)', m: caverna() },
]

const pasta = fileURLToPath(new URL('./public/mapas/', import.meta.url))
mkdirSync(pasta, { recursive: true })
for (const x of modelos) {
  writeFileSync(pasta + x.arquivo, salvar(x.m))
  const lido = abrir(readFileSync(pasta + x.arquivo, 'utf8'))
  for (const nv of lido.niveis) for (const s of nv.salas) conexa(lido, nv, s.id)
  const arestas = lido.niveis.reduce((t, nv) => t + Object.keys(nv.arestas).length, 0)
  console.log(`${x.arquivo}: ${lido.sistema.formato}, ${lido.niveis.map(nv => `${nv.nome} ${Object.keys(nv.celulas).length} células`).join(', ')}, ${arestas} arestas`)
}
writeFileSync(pasta + 'indice.json', JSON.stringify(modelos.map(({ arquivo, nome, descricao }) => ({ arquivo, nome, descricao })), null, 2) + '\n')
console.log('indice.json gravado; modelos relidos com abrir() sem erro')
