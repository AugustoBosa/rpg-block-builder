// Dois workers: um para a prévia (reiniciado quando um pedido novo chega, o que cancela o antigo) e outro para a exportação.
import type { Pedido, Resposta } from './gera.worker'
import type { Malha } from './bloco'

type Sem<T> = T extends unknown ? Omit<T, 'id'> : never
class Fila {
  private w!: Worker
  private pronto!: Promise<void>
  private espera?: { id: number, ok: (r: any) => void, falha: (e: unknown) => void, etapa?: (s: string) => void }
  private n = 0
  constructor() { this.inicia() }
  private inicia() {
    this.w = new Worker(new URL('./gera.worker.ts', import.meta.url), { type: 'module' })
    this.pronto = new Promise((ok, no) => {
      this.w.onerror = () => no(new Error('Não foi possível iniciar o gerador (Web Worker ou WASM bloqueado). Recarregue a página ou troque de navegador.'))
      this.w.onmessage = ({ data: r }: MessageEvent<Resposta | 'pronto'>) => {
        if (r === 'pronto') return ok()
        const e = this.espera
        if (!e || r.id !== e.id) return // resposta de um pedido cancelado
        if ('etapa' in r) return e.etapa?.(r.etapa)
        this.espera = undefined
        'erro' in r ? e.falha(new Error(r.erro)) : e.ok(r)
      }
    })
    this.pronto.catch(() => {}) // quem espera o worker recebe o erro; sem isso o navegador acusaria rejeição sem tratamento
  }
  /** Cancela o pedido em andamento (se houver): o worker é descartado e recriado. */
  cancela() {
    if (!this.espera) return
    this.espera.falha('cancelado')
    this.espera = undefined
    this.w.terminate()
    this.inicia()
  }
  async pede<R>(q: Sem<Pedido>, etapa?: (s: string) => void): Promise<R> {
    const id = ++this.n
    await this.pronto
    this.cancela() // depois do await: dois pedidos seguidos antes do worker ficar pronto não se atropelam
    await this.pronto // o worker pode ter sido recriado
    return new Promise<R>((ok, falha) => {
      this.espera = { id, ok, falha, etapa }
      this.w.postMessage({ ...q, id })
    })
  }
}

const filaPrevia = new Fila(), filaExporta = new Fila()
// pool para o relevo da exportação (a parte mais cara): criado na primeira exportação, um worker por núcleo livre (máx. 6)
const pool: Fila[] = []
const nPool = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 1))
let ciclo = 0
export const previa = (q: Extract<Sem<Pedido>, { tipo: 'previa' }>) => filaPrevia.pede<{ ms: number, m: (Malha | null)[] }>(q)
export async function exporta(q: Extract<Sem<Pedido>, { tipo: 'exporta' }>, etapa: (s: string) => void) {
  const eu = ciclo
  if (q.peca === 'piso' && nPool > 1) {
    while (pool.length < nPool) pool.push(new Fila())
    etapa(`Calculando o relevo (${nPool} workers)...`)
    const partes = await Promise.all(pool.map((f, i) => f.pede<{ de: number, nl: number, c: Float64Array }>({ tipo: 'cortes', o: q.o, i, n: nPool })))
    if (eu !== ciclo) throw 'cancelado'
    const cortes = new Float64Array(partes[0].nl)
    for (const p of partes) cortes.set(p.c, p.de)
    q = { ...q, cortes }
  }
  return filaExporta.pede<{ stl: ArrayBuffer, tri: number }>(q, etapa)
}
export function cancelaExporta() {
  ciclo++
  filaExporta.cancela()
  for (const f of pool) f.cancela()
}
