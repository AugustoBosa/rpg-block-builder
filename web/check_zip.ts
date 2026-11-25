// Check do zip.ts: `cd web && npx tsx check_zip.ts`. Imprime PASS/FALHA. Usa `unzip -t` se existir; senão relê o diretório central e confere CRC.
import { spawnSync } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zip } from './src/mapa/zip'

let falhas = 0
const confere = (nome: string, ok: boolean, medido: string) => { if (!ok) falhas++; console.log(`${ok ? 'PASS' : 'FALHA'} ${nome}: ${medido}`) }

// CRC32 independente (vetor de teste: "123456789" → CBF43926)
function crc(b: Uint8Array): number {
  let c = 0xffffffff
  for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1 }
  return (c ^ 0xffffffff) >>> 0
}
confere('CRC32 do vetor', crc(new TextEncoder().encode('123456789')) === 0xcbf43926, crc(new TextEncoder().encode('123456789')).toString(16))

const txt = new TextEncoder().encode('olá, mundo\n'.repeat(50))
const bin = new Uint8Array(70000).map((_, i) => (i * 31) & 255)
const blob = await zip([{ nome: 'manifesto.csv', dados: 'olá, mundo\n'.repeat(50) }, { nome: 'pecas/P01_açúcar.stl', dados: bin }])
const arq = join(tmpdir(), `check_zip_${process.pid}.zip`)
writeFileSync(arq, Buffer.from(await blob.arrayBuffer()))

const u = spawnSync('unzip', ['-t', arq], { encoding: 'utf8' })
if (!u.error) {
  confere('unzip -t', u.status === 0, u.status === 0 ? 'zip íntegro' : (u.stdout + u.stderr).trim().slice(0, 300))
} else {
  // relê o diretório central: nome, tamanho, CRC e conteúdo de cada entrada
  const buf = Buffer.from(await blob.arrayBuffer())
  let e = buf.length - 22
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--
  const n = buf.readUInt16LE(e + 10)
  let p = buf.readUInt32LE(e + 16)
  const esperado = [{ nome: 'manifesto.csv', dados: txt }, { nome: 'pecas/P01_açúcar.stl', dados: bin }]
  confere('unzip ausente: quantidade de entradas', n === 2, `${n} entradas`)
  for (let i = 0; i < n; i++) {
    const tam = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), crcGuardado = buf.readUInt32LE(p + 16), off = buf.readUInt32LE(p + 42)
    const nome = buf.toString('utf8', p + 46, p + 46 + nl)
    const ini = off + 30 + buf.readUInt16LE(off + 26)
    const dados = new Uint8Array(buf.subarray(ini, ini + tam))
    const ref = esperado.find(x => x.nome === nome)
    confere(`entrada ${nome}`, !!ref && crc(dados) === crcGuardado && Buffer.compare(Buffer.from(dados), Buffer.from(ref.dados)) === 0, `${tam} bytes, CRC ${crcGuardado.toString(16)}`)
    p += 46 + nl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
}
unlinkSync(arq)
if (falhas) { console.log(`${falhas} falha(s)`); process.exit(1) }
