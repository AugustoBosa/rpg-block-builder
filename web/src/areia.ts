// Textura Areia: dunas suaves, ondulações de vento assimétricas, pedrinhas raras e grão fino (gerar.py, Gr.tex_areia).
import { grao } from './grade'
import { mapa, ruido } from './ruido'
import { seixos } from './seixos'

export const AREIA = { // nome: [padrão, mín, máx, rótulo]
  nivel: [.4, 0, 2, 'Nível (mm abaixo do topo)'], onda_passo: [.65, .2, 3, 'Passo das ondulações (× tamanho)'], onda: [.7, 0, 2, 'Ondulações (mm)'],
  duna: [.7, 0, 2, 'Dunas (mm)'], seixos: [.15, 0, 1, 'Pedrinhas (fração)'], grao: [.05, 0, .5, 'Grão (mm)'],
} as const
export type KnobsAreia = { -readonly [k in keyof typeof AREIA]: number }

export function areia(x: number, y: number, z: number, tam: number, _prof: number, desg: number, k: KnobsAreia) {
  const q = (x * .85 + y * .5 + ruido(x, y, z, .06, 2, .5, 2) * 6) / (tam * k.onda_passo), t = q - Math.floor(q) // subida longa, descida curta
  const crista = Math.min(mapa(t, 0, .75, 0, 1), mapa(t, .75, 1, 1, 0))
  const onda = (1 - crista) * mapa(ruido(x, y, z, .08, 2, .5, 3), .35, .7, .15, 1) * k.onda
  const duna = mapa(ruido(x, y, z, .045, 2, .5, 4), .3, .7, 0, 1) * (k.duna + desg * .35)
  return Math.min(k.nivel + onda + duna, seixos(x, y, z, tam * 1.1, k.seixos + desg * .2, .3)) + grao(x, y, z, k.grao)
}
