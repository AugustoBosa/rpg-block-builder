// Prévia 1 mm de uma peça do mapa (opcoesDe → pisoComParedes) e opções para a exportação (peça ou grid/degrau). Só números entram e saem; roda fora da thread principal (WASM).
import { padrao, type Opcoes } from '../bloco'
import { pisoComParedes } from '../parede'
import { opcoesDe } from './opcoes'
import type { Peca } from './divisao'
import type { Mapa } from './modelo'

type Pedido =
  | { tipo?: 'previa'; m: Mapa; nivel: string; sala: string; peca: Peca; res: number }
  | { tipo: 'opcoes'; m: Mapa; nivel: string; sala: string; peca: Peca }
  | { tipo: 'opcoesSuporte'; m: Mapa; sup: 'grid' | 'degrau'; linhas: number; colunas: number }

const w = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent<Pedido>) => void) | null }

w.onmessage = async ({ data: q }) => {
  try {
    if (q.tipo === 'opcoesSuporte') {
      const o: Opcoes = padrao()
      Object.assign(o, q.m.sistema, { grid_linhas: q.linhas, grid_colunas: q.colunas }) // degrau: altura_degrau padrão
      return w.postMessage({ o })
    }
    const n = q.m.niveis.find(x => x.id === q.nivel)!, s = n.salas.find(x => x.id === q.sala)!
    if (q.tipo === 'opcoes') return w.postMessage({ o: opcoesDe(q.peca, q.m, s, n) })
    const malha = await pisoComParedes({ ...opcoesDe(q.peca, q.m, s, n), resolucao: q.res }, true)
    w.postMessage({ pos: malha.pos, idx: malha.idx }, [malha.pos.buffer, malha.idx.buffer])
  } catch (e) {
    w.postMessage({ erro: String(e) })
  }
}
w.postMessage('pronto')
