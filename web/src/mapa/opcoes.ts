// Opções do gerador para uma peça canônica do mapa (peça → Opcoes). Usa bloco.ts; sem DOM.
import { padrao, subidaNivel, type Opcoes } from '../bloco'
import { celula, centros, contorno, regiao } from '../sistema'
import { aberturaNova, paredeNova, type Parede } from '../parede'
import { aplicaTema, TEMAS } from '../temas'
import { ESP, type Peca } from './divisao'
import type { Mapa, Nivel, Sala } from './modelo'
import type { Objeto } from '../miniaturas'

type P2 = [number, number]
const ANG = { x: 0, y: 90, h0: 0, h60: 60, h120: 120 } as const
type Eixo = keyof typeof ANG
const EIXO_HEX: Eixo[] = ['h120', 'h0', 'h60'] // lado i do hex: normal a 30° + 60°·i; eixo = normal + 90° (mod 180)
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1]

/** Faixa da parede de A a B no eixo `eixo`, com o sistema de `quadro()` (d = eixo, n = (−d_y, d_x)); a espessura cresce para o lado do `dono`. */
function faixa(A: P2, B: P2, eixo: Eixo, dono: P2) {
  const t = ANG[eixo] * Math.PI / 180, d: P2 = [Math.cos(t), Math.sin(t)], n: P2 = [-d[1], d[0]]
  const desloc = dot([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], n)
  return {
    ancora: { tipo: 'eixo' as const, eixo, desloc }, inicio: Math.min(dot(A, d), dot(B, d)),
    comprimento: Math.hypot(B[0] - A[0], B[1] - A[1]), lado: dot(dono, n) > desloc ? 'fora' as const : 'dentro' as const,
  }
}

/** Opções do gerador para a peça `p` (canônica) da sala `sala` no nível `nivel`. `avisos` recebe os limites (rampa a 40°). */
export function opcoesDe(p: Peca, m: Mapa, sala: Sala, nivel: Nivel, avisos: string[] = []): Opcoes {
  const o = padrao()
  Object.assign(o, m.sistema)
  if (sala.tema && TEMAS[sala.tema]) aplicaTema(o, TEMAS[sala.tema])
  o.textura = p.tex
  if (p.texParede) o.texturaParede = p.texParede
  o.linhas = p.linhas; o.colunas = p.colunas
  if (p.tipo !== 'piso') {
    const dir = p.dir ?? '+y', ei = dir[1] === 'x' ? 0 : 1
    o.inclinacao_dir = dir
    const v = regiao(o, p.linhas, p.colunas).seg.flatMap(g => [g[ei], g[ei + 2]]), ext = Math.max(...v) - Math.min(...v)
    if (p.tipo === 'escada') { o.escada_degraus = Math.min(12, Math.max(2, Math.round(ext / 8))); o.escada_altura = subidaNivel(o) }
    else {
      const graus = Math.atan(subidaNivel(o) / ext) * 180 / Math.PI
      if (graus > 40) avisos.push(`Rampa de ${ext.toFixed(0)} mm: inclinação limitada a 40° (o nível sobe mais que isso).`)
      o.inclinacao = Math.min(40, graus)
    }
  }

  const cl = celula(o), k = cl.n.length, C = centros(cl, p.linhas, p.colunas), V = contorno(cl, 0)
  const ctr = (c: number, r: number): P2 => C[r * p.colunas + c]
  const lados = (c: number, r: number, i: number) => {
    const [x, y] = ctr(c, r), a = V[(i - 1 + k) % k], b = V[i]
    return { A: [x + a[0], y + a[1]] as P2, B: [x + b[0], y + b[1]] as P2, O: [x, y] as P2 }
  }
  const eixoDe = (i: number): Eixo => k === 4 ? (i % 2 ? 'x' : 'y') : EIXO_HEX[i % 3]

  const paredes: Parede[] = []
  let np = 0
  for (const e of p.paredes) {
    const { A, B, O } = lados(e.c, e.r, e.i)
    let P0 = A, P1 = B
    if (e.tipo === 'reforco') { // parte do vértice comum (ini: o inicial A; senão o final B) e segue o lado por `comp`
      const de = e.ini ? A : B, para = e.ini ? B : A, L = Math.hypot(para[0] - de[0], para[1] - de[1]), u: P2 = [(para[0] - de[0]) / L, (para[1] - de[1]) / L]
      P0 = de; P1 = [de[0] + u[0] * (e.comp ?? 0), de[1] + u[1] * (e.comp ?? 0)]
    }
    const f = faixa(P0, P1, eixoDe(e.i), O)
    const par: Parede = { ...paredeNova(`p${np++}`, f.ancora, f.comprimento), inicio: f.inicio, altura: nivel.altura_parede, espessura: ESP, lado: f.lado }
    if (e.tipo !== 'parede' && e.tipo !== 'reforco') {
      const ab = aberturaNova(e.tipo === 'janela' ? 'janela' : 'porta')
      ab.pos = f.comprimento / 2
      if (e.tipo === 'arco') { ab.forma = 'arco'; ab.altura = 22 }
      par.aberturas = [ab]
    }
    paredes.push(par)
  }
  for (const x of p.colunasCel) { // coluna: parede eixo x, quadrada de lado `lado`, no centro da célula
    const [cx, cy] = ctr(x.c, x.r)
    paredes.push({ ...paredeNova(`col${np++}`, { tipo: 'eixo', eixo: 'x', desloc: cy }, x.lado), inicio: cx - x.lado / 2, altura: nivel.altura_parede, espessura: x.lado, lado: 'centro' })
  }
  if (m.escala === 'cidade') for (const w of paredes) if (!w.id.startsWith('col')) { // muralha; o portão fica abaixo das ameias
    w.ameias = true
    for (const ab of w.aberturas) ab.altura = Math.min(ab.altura, w.altura - 4)
  }
  o.paredes = paredes
  if (p.relevo) o.relevo_tipo = p.relevo as Opcoes['relevo_tipo']
  o.objetos = (p.objetos ?? []).map(x => { const [cx, cy] = ctr(x.c, x.r); return { tipo: x.tipo as Objeto['tipo'], x: cx, y: cy, rot: x.rot, tam: 1, semente: 1 } })
  return o
}
