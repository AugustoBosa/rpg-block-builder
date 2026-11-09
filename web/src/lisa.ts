// Textura Lisa: placas grandes quase planas, junta rasa e grão mínimo (gerar.py, Gr.tex_lisa).
import { G, grade, grao } from './grade'
import { mapa } from './ruido'

export const LISA = { // nome: [padrão, mín, máx, rótulo]
  placa: [2, .5, 6, 'Placa (× tamanho)'], junta_fundo: [.3, 0, 1.5, 'Fundo da junta (mm)'], grao: [.03, 0, .3, 'Grão (mm)'],
} as const
export type KnobsLisa = { -readonly [k in keyof typeof LISA]: number }

/** Mesma assinatura da pedra(): (x, y) globais em mm, z = fatia da semente; devolve a profundidade (mm ≥ 0). Não usa `prof` nem `desg`. */
export function lisa(x: number, y: number, z: number, tam: number, _prof: number, _desg: number, k: KnobsLisa) {
  const L = tam * k.placa
  grade(x, y, z, L, L, 0)
  return mapa(G.dist, .25, .7, 1, 0) * k.junta_fundo + grao(x, y, z, k.grao)
}
