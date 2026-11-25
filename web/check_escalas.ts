// Check das escalas Cidade e Reino: `cd web && npx tsx check_escalas.ts`. Imprime PASS/FALHA por caso.
// Miniaturas e relevo grande fecham a malha (quadrado e hexágono); relevo não mexe na borda (emenda 0 com o vizinho plano); muralha com ameias fecha.
import { fechada, padrao, piso, relevoGrande, type Opcoes } from './src/bloco'
import { pisoComParedes, paredeNova } from './src/parede'
import { objetoNovo, OBJETOS, type TipoObjeto } from './src/miniaturas'
import { distBorda } from './src/sistema'
import { readFileSync } from 'node:fs'
import { abrir, cria, pinta, RELEVOS } from './src/mapa/modelo'
import { gira, tileset } from './src/mapa/divisao'
import { opcoesDe } from './src/mapa/opcoes'

let falhas = 0
const confere = (nome: string, ok: boolean, medido: string) => { if (!ok) falhas++; console.log(`${ok ? 'PASS' : 'FALHA'} ${nome}: ${medido}`) }
const base = (extra: Partial<Opcoes> = {}): Opcoes => ({ ...padrao(), resolucao: .25, ...extra })

for (const formato of ['quadrado', 'hexagono'] as const) {
  for (const tipo of Object.keys(OBJETOS) as TipoObjeto[]) {
    const t = performance.now(), m = await pisoComParedes(base({ formato, objetos: [objetoNovo(tipo)] }))
    confere(`${formato}: ${tipo} fecha`, fechada(m.pos, m.idx), `${m.idx.length / 3} tri, ${((performance.now() - t) / 1000).toFixed(1)} s`)
  }
  for (const relevo_tipo of ['colina', 'montanha', 'vulcao'] as const) {
    const o = base({ formato, relevo_tipo }), t = performance.now(), m = await pisoComParedes(o)
    const zmax = Math.max(...Array.from({ length: m.pos.length / 3 }, (_, i) => m.pos[i * 3 + 2]))
    confere(`${formato}: ${relevo_tipo} fecha`, fechada(m.pos, m.idx), `topo ${zmax.toFixed(1)} mm, ${((performance.now() - t) / 1000).toFixed(1)} s`)
    // emenda: na borda, o piso com relevo é idêntico ao piso plano (mesma rede, mesma ordem de vértices)
    const a = piso(o), b = piso({ ...o, relevo_tipo: '' })
    let dmax = 0
    for (let i = 0; i < a.pos.length / 3; i++) if (distBorda(a.r, b.pos[i * 3], b.pos[i * 3 + 1]) < 1e-6) dmax = Math.max(dmax, Math.abs(a.pos[i * 3 + 2] - b.pos[i * 3 + 2]))
    confere(`${formato}: ${relevo_tipo} não mexe na borda`, a.pos.length === b.pos.length && dmax === 0, `${dmax.toFixed(4)} mm`)
  }
  const ob = { ...objetoNovo('castelo'), x: 3, y: -2 }, o = base({ formato, relevo_tipo: 'montanha', objetos: [ob] })
  const m = await pisoComParedes(o), rg = relevoGrande(o, piso(o).r)!
  confere(`${formato}: castelo sobre montanha fecha`, fechada(m.pos, m.idx), `relevo no centro do castelo ${rg(3, -2).toFixed(1)} mm`)
}
{
  const p = { ...paredeNova('m', { tipo: 'eixo', eixo: 'x', desloc: 0 }, 30), inicio: -15, altura: 20, espessura: 4, lado: 'centro' as const, ameias: true }
  const m = await pisoComParedes(base({ paredes: [p] }))
  confere('muralha com ameias fecha', fechada(m.pos, m.idx), `${m.idx.length / 3} tri`)
}
// editor de mapa
{
  const ler = (a: string) => abrir(readFileSync(`public/mapas/${a}`, 'utf8'))
  const mas = ler('masmorra.json')
  confere('mapa antigo (sem escala) abre como combate', mas.escala === undefined, `escala ${mas.escala ?? '(nenhuma)'}`)
  const rn = cria({ ...padrao(), formato: 'hexagono' }, 'R', 'reino')
  confere('Reino nasce com peça 1 × 1', rn.niveis[0].salas[0].max.join('x') === '1x1', rn.niveis[0].salas[0].max.join('x'))
  const re = ler('reino.json'), tr = tileset(re), comRel = tr.instancias.filter(i => i.peca.relevo)
  const nRel = Object.values(re.niveis[0].celulas).filter(c => RELEVOS.includes(c.obj ?? '')).length
  confere('Reino: uma peça por célula, relevo em cada célula com relevo', tr.instancias.length === Object.keys(re.niveis[0].celulas).length && comRel.length === nRel, `${tr.instancias.length} peças, ${comRel.length} com relevo`)
  const it = comRel[0], ni = re.niveis[0], o = opcoesDe(it.peca, re, ni.salas[0], ni)
  const m = await pisoComParedes({ ...o, resolucao: .5 }, true)
  confere('Reino: opcoesDe leva o relevo ao gerador e a peça fecha', o.relevo_tipo === it.peca.relevo && fechada(m.pos, m.idx), `${it.peca.relevo}`)
  const ci = ler('cidade.json'), tc = tileset(ci), obs = tc.instancias.reduce((t, i) => t + (i.peca.objetos?.length ?? 0), 0)
  const nObs = Object.values(ci.niveis[0].celulas).filter(c => c.obj).length
  const oc = opcoesDe(tc.instancias.find(i => i.peca.paredes.length)!.peca, ci, ci.niveis[0].salas[0], ci.niveis[0])
  confere('Cidade: todo objeto cai numa peça; muralha com ameias', obs === nObs && oc.paredes.every(w => w.ameias), `${obs}/${nObs} objetos`)
  // rotação: peça 1 × 1 com casa no quadrado; as 4 voltas dão a mesma chave e a casa gira junto
  const q = cria({ ...padrao(), formato: 'quadrado' }, 'Q', 'cidade')
  pinta(q, 'terreo', 0, 0, { tex: 'pedra', tipo: 'piso', sala: 's1', obj: 'casa' })
  const p = tileset(q).instancias[0].peca, rots = [1, 2, 3].map(r => gira(p, q.sistema, r).objetos![0].rot)
  confere('rotação gira o objeto junto', rots.join(',') === '90,180,270', rots.join(','))
}
console.log(falhas ? `${falhas} FALHA(S)` : 'tudo PASS')
process.exit(falhas ? 1 : 0)
