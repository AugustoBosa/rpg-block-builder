// ZIP "store" (sem compressão), CRC32 próprio, nomes UTF-8 (flag 11). Sem zip64: passa de 4 GB, erro.
export type Arquivo = { nome: string; dados: Blob | Uint8Array<ArrayBuffer> | string }

const TAB = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TAB[(c ^ b[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const agora = new Date()
const HORA = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1)
const DATA = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()
const cab = (n: number) => { const b = new Uint8Array(new ArrayBuffer(n)); return { b, v: new DataView(b.buffer) } }

/** Cabeçalho local (30 bytes) + nome. */
function local(nome: Uint8Array<ArrayBuffer>, crc: number, t: number): BlobPart[] {
  const { b, v } = cab(30)
  v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true)
  v.setUint16(10, HORA, true); v.setUint16(12, DATA, true); v.setUint32(14, crc, true); v.setUint32(18, t, true); v.setUint32(22, t, true); v.setUint16(26, nome.length, true)
  return [b, nome]
}
/** Entrada do diretório central (46 bytes) + nome. */
function central(nome: Uint8Array<ArrayBuffer>, crc: number, t: number, off: number): BlobPart[] {
  const { b, v } = cab(46)
  v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x800, true)
  v.setUint16(12, HORA, true); v.setUint16(14, DATA, true); v.setUint32(16, crc, true); v.setUint32(20, t, true); v.setUint32(24, t, true)
  v.setUint16(28, nome.length, true); v.setUint32(42, off, true)
  return [b, nome]
}

export async function zip(arquivos: Arquivo[]): Promise<Blob> {
  const enc = new TextEncoder(), ERRO = 'O ZIP passa de 4 GB; baixe peça por peça.'
  const ent = arquivos.map(a => {
    const dados = typeof a.dados === 'string' ? enc.encode(a.dados) : a.dados
    return { nome: enc.encode(a.nome), dados, tam: dados instanceof Blob ? dados.size : dados.byteLength }
  })
  const total = 22 + ent.reduce((s, e) => s + 76 + 2 * e.nome.length + e.tam, 0)
  if (ent.length > 65535 || total > 0xffffffff) throw new Error(ERRO)
  const partes: BlobPart[] = [], dir: BlobPart[] = []
  let off = 0
  for (const e of ent) {
    const bytes: Uint8Array = e.dados instanceof Blob ? new Uint8Array(await e.dados.arrayBuffer()) : e.dados
    const crc = crc32(bytes)
    partes.push(...local(e.nome, crc, e.tam), e.dados)
    dir.push(...central(e.nome, crc, e.tam, off))
    off += 30 + e.nome.length + e.tam
  }
  const { b: fimB, v: fim } = cab(22)
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, ent.length, true); fim.setUint16(10, ent.length, true)
  fim.setUint32(12, ent.reduce((s, e) => s + 46 + e.nome.length, 0), true); fim.setUint32(16, off, true)
  return new Blob([...partes, ...dir, fimB], { type: 'application/zip' })
}
