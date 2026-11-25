// Prévia 1 mm de uma peça do mapa (opcoesDe → pisoComParedes). Só números entram e saem; roda fora da thread principal (WASM).
import { pisoComParedes } from '../parede'
import { opcoesDe } from './opcoes'
import type { Peca } from './divisao'
import type { Mapa } from './modelo'

interface Pedido { m: Mapa; nivel: string; sala: string; peca: Peca; res: number }

const w = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent<Pedido>) => void) | null }

w.onmessage = async ({ data: q }) => {
  try {
    const n = q.m.niveis.find(x => x.id === q.nivel)!, s = n.salas.find(x => x.id === q.sala)!
    const malha = await pisoComParedes({ ...opcoesDe(q.peca, q.m, s, n), resolucao: q.res }, true)
    w.postMessage({ pos: malha.pos, idx: malha.idx }, [malha.pos.buffer, malha.idx.buffer])
  } catch (e) {
    w.postMessage({ erro: String(e) })
  }
}
w.postMessage('pronto')
