// Gera as malhas fora da thread principal (WASM do manifold + relevo da Pedra). Só números entram e saem (buffers transferidos).
import { cortesParte, final, piso, stl, type Malha, type Opcoes } from './bloco'
import { corpo, degrau, grid, malha } from './sistema'

export type Pedido =
  | { id: number; tipo: 'previa'; passo: number; peca: string; o: Opcoes; res: number }
  | { id: number; tipo: 'exporta'; peca: string; o: Opcoes; cortes?: Float64Array } // cortes: relevo do topo, calculado em paralelo
  | { id: number; tipo: 'cortes'; o: Opcoes; i: number; n: number } // parte i de n do relevo do topo
export type Resposta =
  | { id: number; ms: number; m: (Malha | null)[] } // prévia: [peça 0, peça 1]
  | { id: number; stl: ArrayBuffer; tri: number }
  | { id: number; de: number; nl: number; c: Float64Array }
  | { id: number; etapa: string }
  | { id: number; erro: string }

const w = self as unknown as { postMessage(m: Resposta | 'pronto', t?: Transferable[]): void; onmessage: ((e: MessageEvent<Pedido>) => void) | null }
const gera = (p: string, o: Opcoes) => p === 'grid' ? malha(grid(o, o.grid_linhas, o.grid_colunas)) : malha(degrau(o, o.grid_linhas, o.grid_colunas, o.altura_degrau))
const solta = (m: Malha) => ({ pos: m.pos, idx: m.idx }) // piso() devolve campos a mais (zt, r)

w.onmessage = async ({ data: q }) => {
  try {
    const t0 = performance.now()
    if (q.tipo === 'previa') {
      const { o } = q
      const m = q.passo === 1 ? [malha(corpo(o, o.altura)), malha(grid(o, 1, 1))]
        : q.peca === 'piso' ? [solta(piso({ ...o, resolucao: q.res })), null] : [gera(q.peca, o), null]
      w.postMessage({ id: q.id, ms: performance.now() - t0, m }, m.flatMap(x => x ? [x.pos.buffer, x.idx.buffer] : []))
    } else if (q.tipo === 'cortes') {
      const r = cortesParte(q.o, q.i, q.n)
      w.postMessage({ id: q.id, ...r }, [r.c.buffer])
    } else {
      w.postMessage({ id: q.id, etapa: 'Gerando o relevo...' })
      let m: Malha
      if (q.peca === 'piso') {
        const cru = piso(q.o, q.cortes)
        w.postMessage({ id: q.id, etapa: 'Suavizando e reduzindo...' })
        m = await final(cru)
      } else m = gera(q.peca, q.o)
      const buf = stl(m)
      w.postMessage({ id: q.id, stl: buf, tri: m.idx.length / 3 }, [buf])
    }
  } catch (e) {
    w.postMessage({ id: q.id, erro: String(e) })
  }
}
w.postMessage('pronto') // o WASM já carregou (top-level await dos imports)
