# Gerador de grid completo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chanfro na entrada do furo; travas clip ou macho/fêmea (quadrado e hexágono); ímãs na borda, no cruzamento e no meio da nervura; alívio sob o fundo.

**Architecture:** `web/src/travas.ts` (novo) tem a geometria pura (vértices da borda com ângulo e bissetriz, pontos de ímã) e os sólidos (osso, rabo-de-andorinha, cilindros) com o Manifold de `wasm.ts`; não importa `sistema.ts` (evita ciclo com top-level await). `grid(s, linhas, colunas, x?)` em `sistema.ts` recebe as opções extras e aplica: recortes testados contra a união dos furos (engordados 0,8 mm) antes de entrar. Avisos em `avisosGrid`.

**Tech Stack:** TypeScript, manifold-3d (WASM), tsx.

**Spec:** `docs/superpowers/specs/2026-11-20-grid-completo-design.md`

## Global Constraints
- Tudo desligado (`chanfro_furo = 0`, `trava = 'nenhuma'`, ímãs do grid e alívio desligados) ⇒ os 5 hashes de `web/ref_hashes.json` iguais (`npx tsx check_paredes.ts D2`) — grid e degrau estão lá.
- `travas.ts` não importa `sistema.ts`; recebe segmentos, centros e números.
- Recorte que não cabe (engordado 0,8 mm toca os furos) é pulado e vira aviso; nunca gera furo atravessado.
- Sem dependência nova. Comentários curtos em pt-BR. Comandos em `web/`. Checks levam minutos: segundo plano.
- Commits no `main`, sem `--no-verify`, sem `git add -f`, trailer com o modelo que implementou. Sem push.

## Opções novas
- `SISTEMA` (`sistema.ts`, seção 'Grid' em `SECAO`): `chanfro_furo: [0, 0, 2, 'Furo: chanfro na entrada (mm)']`.
- `GUIAS` (`bloco.ts`) + `SECAO_GUIAS`: `trava_altura: [3, 1.5, 6, 'Trava: altura (mm)']`, `trava_comprimento: [8, 4, 16, 'Trava: comprimento (mm)']`, `trava_largura: [4, 2, 8, 'Trava: cabeça (mm)']`, `trava_haste: [2, 1, 5, 'Trava: haste/pescoço (mm)']`, `trava_folga: [.15, 0, .5, 'Trava: folga (mm)']` → seção 'Travas'; `ima_grid_d: [5, 2, 10, 'Ímã do grid: diâmetro (mm)']`, `ima_grid_h: [2, 1, 5, 'Ímã do grid: altura (mm)']` → seção 'Ímãs do grid'.
- `Opcoes` + `padrao()`: `trava: 'nenhuma' | 'clip' | 'macho'` (`'nenhuma'`), `ima_borda`, `ima_cruz`, `ima_meio`, `alivio`: boolean (false).
- `export interface ExtrasGrid` em `travas.ts` com esses 12 campos + `folga_ima` (já no Sistema).

---

### Task 1: WASM único em `sistema.ts` e chanfro na entrada do furo

**Files:** Modify `web/src/sistema.ts`; Test `web/check_paredes.ts` (D16).

- [ ] **Step 1: testes (falham)** — em `check_paredes.ts`, antes do bloco do D11:
```ts
// ---- D16: grid completo ----
const larguraFuroTopo = (m: Malha, zTopo: number) => { // menor |x| dos vértices na faixa do topo perto do eixo y = 0 (meia largura do furo central)
  let r = 1e9
  for (let i = 0; i < m.pos.length; i += 3) if (Math.abs(m.pos[i + 2] - zTopo) < 1e-3 && Math.abs(m.pos[i + 1]) < 1) r = Math.min(r, Math.abs(m.pos[i]))
  return r
}
t('D16', 'chanfro do furo 1 mm: grid fecha e o furo abre 1 mm de cada lado no topo', () => {
  const o0 = op(), o1 = op({ chanfro_furo: 1 }), G = medidas(o0).alturaGrid
  const a = malha(grid(o0, 1, 1)), b = malha(grid(o1, 1, 1))
  if (!fechada(b.pos, b.idx)) throw new Error('fechada: NÃO')
  const d = larguraFuroTopo(a, G) - larguraFuroTopo(b, G)
  if (Math.abs(d - 1) > .02) throw new Error(`abriu ${d.toFixed(3)} mm`); return `abriu ${d.toFixed(3)} mm`
})
```
(importar `medidas` de `./src/sistema`. Se `larguraFuroTopo` pegar a borda externa em vez do furo, troque por "menor |x| entre os vértices com |x| < metade da célula − 0,5": o furo é o único contorno no topo perto do centro.)

- [ ] **Step 2:** `npx tsx check_paredes.ts D16` → falha (chanfro sem efeito).
- [ ] **Step 3: WASM** — em `sistema.ts` trocar `import Module from 'manifold-3d'`, `const wasm = await Module()`, `wasm.setup()`, `const { Manifold } = wasm` por `import { Manifold } from './wasm'` (manter `import type { Vec3 }`). `wasm.ts` importa só o tipo `Malha` de `sistema.ts` (`import type`), sem ciclo em tempo de execução.
- [ ] **Step 4: chanfro** — `SISTEMA` + `SECAO` (seção 'Grid'). Em `medidas()`:
```ts
  const cf = Math.max(0, Math.min(s.chanfro_furo, nm - .4)) // chanfro na entrada: sobra crista de 0,8 mm na nervura
  ...
  perfilFuro: cf > 0 ? [[zb, db], [zf + h, s.recuo], [G - cf, nm], [G, nm - cf], [G + 1, nm - cf]] : [[zb, db], [zf + h, s.recuo], [G, nm], [G + 1, nm]],
```
(com `cf = 0` o perfil é o mesmo de hoje ⇒ hashes iguais).
- [ ] **Step 5:** `npx tsc --noEmit`; `npx tsx check_paredes.ts D16 D2` PASS. Commit `Grid: sistema.ts usa wasm.ts; chanfro na entrada do furo, check D16`.

---

### Task 2: Travas (clip e macho/fêmea) em quadrado e hexágono

**Files:** Create `web/src/travas.ts`; Modify `web/src/sistema.ts` (`grid`), `web/src/bloco.ts` (opções); Test `web/check_paredes.ts`.

**Interfaces (Produces):** `ExtrasGrid`; `verticesBorda(seg): { p: [number, number]; b: [number, number]; ang: number; n: [number, number] }[]` (p = ponto, b = bissetriz interna unitária, ang = ângulo interno em graus, n = normal externa do lado de saída); `osso(L, cab, haste, folga, h): Solido` (planta centrada na origem ao longo de +x, de z = 0 a h); `rabo(L, cab, haste, folga, h): Solido` (pescoço em x = 0, alarga até cab em x = L/2, de z = 0 a h); `poe(s, p, b): Solido` (gira +x para b e translada para p); `clipSolido(x): Solido`; `avisosGrid: string[]` (exportado de `sistema.ts`).

- [ ] **Step 1: testes (falham)**:
```ts
const xg = (e: Record<string, unknown>) => op({ grid_linhas: 2, grid_colunas: 3, ...e })
for (const f of ['quadrado', 'hexagono'] as const) for (const tv of ['clip', 'macho'] as const)
  t('D16', `trava ${tv}, ${f} 2x3: grid fecha e todas as travas entram`, () => {
    const o = xg({ formato: f, trava: tv }), m = malha(grid(o, 2, 3, o))
    if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
    const n = verticesBorda(regiao(o, 2, 3).seg).filter(v => v.ang >= 119).length
    if (f === 'quadrado' && n !== 6) throw new Error(`${n} vértices elegíveis (esperado 6)`)
    if (avisosGrid.length) throw new Error(avisosGrid.join(' ')); return `${n} travas`
  })
t('D16', 'clip cabe no recorte do grid', () => {
  const o = xg({ trava: 'clip' }), g = grid(o, 2, 3, o), v = verticesBorda(regiao(o, 2, 3).seg).find(v => v.ang > 179)!
  const c = poe(clipSolido(o), v.p, v.b), dentro = c.intersect(g).volume()
  if (dentro > 1e-3) throw new Error(`clip invade o grid: ${dentro.toFixed(4)} mm³`); return 'sem interferência'
})
t('D16', 'sem trava: grid igual (hash)', () => { const o = op(); if (hash(malha(grid(o, 3, 3, o))) !== hash(malha(grid(o, 3, 3)))) throw new Error('mudou'); return 'igual' })
```
(importar `verticesBorda`, `poe`, `clipSolido` de `./src/travas` e `avisosGrid` de `./src/sistema`. O clip testado fica no vértice com a metade de fora do grid: `intersect` só pode dar a parte que cairia no material — tem de ser 0. `volume()` existe no Manifold; conferir o nome na d.ts.)

- [ ] **Step 2:** rodar D16 → falha (imports).
- [ ] **Step 3: `travas.ts`**:
```ts
// Travas e ímãs do grid (docs/superpowers/specs/2026-11-20-grid-completo-design.md): geometria pura + sólidos do Manifold de wasm.ts.
// Não importa sistema.ts (ciclo com top-level await): recebe segmentos e números.
import { CrossSection, Manifold } from './wasm'
type Solido = InstanceType<typeof Manifold>
type P = [number, number]

export interface ExtrasGrid {
  trava: 'nenhuma' | 'clip' | 'macho'; trava_altura: number; trava_comprimento: number; trava_largura: number; trava_haste: number; trava_folga: number
  ima_borda: boolean; ima_cruz: boolean; ima_meio: boolean; ima_grid_d: number; ima_grid_h: number; folga_ima: number; alivio: boolean
}

const k = ([x, y]: P) => `${x.toFixed(4)},${y.toFixed(4)}`
/** Vértices do contorno externo (segmentos [ax, ay, bx, by, nx, ny], anti-horário): ângulo interno, bissetriz interna e normal do lado que sai. */
export function verticesBorda(seg: number[][]) {
  const sai = new Map<string, number[]>(), entra = new Map<string, number[]>()
  for (const g of seg) { sai.set(k([g[0], g[1]]), g); entra.set(k([g[2], g[3]]), g) }
  const out: { p: P; b: P; ang: number; n: P }[] = []
  for (const [key, gs] of sai) {
    const ge = entra.get(key); if (!ge) continue
    const din: P = [ge[2] - ge[0], ge[3] - ge[1]], dout: P = [gs[2] - gs[0], gs[3] - gs[1]]
    const li = Math.hypot(...din), lo = Math.hypot(...dout), a: P = [din[0] / li, din[1] / li], b: P = [dout[0] / lo, dout[1] / lo]
    const giro = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180 / Math.PI // > 0: vira à esquerda (convexo)
    const bi: P = [-a[1] - b[1], a[0] + b[0]], h = Math.hypot(...bi) // soma das normais internas (esquerda de cada direção)
    out.push({ p: [gs[0], gs[1]], b: [bi[0] / h, bi[1] / h], ang: 180 - giro, n: [gs[4], gs[5]] })
  }
  return out
}
const extr = (c: InstanceType<typeof CrossSection>, h: number) => { const m = Manifold.extrude(c, h); c.delete(); return m }
/** "Osso" em planta ao longo de +x, centrado na origem: haste + duas cabeças. */
export function osso(L: number, cab: number, haste: number, folga: number, h: number): Solido {
  const r = cab / 2 + folga, x = L / 2 - cab / 2
  const c1 = CrossSection.circle(r, 32).translate([-x, 0]), c2 = CrossSection.circle(r, 32).translate([x, 0])
  const hs = CrossSection.square([2 * x, haste + 2 * folga], true)
  const u = CrossSection.union([c1, c2, hs]); for (const q of [c1, c2, hs]) q.delete()
  return extr(u, h)
}
/** Rabo-de-andorinha em planta: pescoço `haste` em x = 0, alarga até `cab` em x = L/2 (folga engorda tudo). */
export function rabo(L: number, cab: number, haste: number, folga: number, h: number): Solido {
  const a = haste / 2 + folga, b = cab / 2 + folga, e = L / 2 + folga
  return extr(new CrossSection([[[-.3, -a], [e, -b], [e, b], [-.3, a]]]), h) // começa 0,3 mm antes do vértice: sem face coplanar com a borda
}
/** Gira +x para a direção b e põe em p. */
export const poe = (s: Solido, p: P, b: P) => { const t = s.rotate([0, 0, Math.atan2(b[1], b[0]) * 180 / Math.PI]).translate([p[0], p[1], 0]); s.delete(); return t }
/** Peça clip (STL próprio): osso sem folga, mais baixo que o recorte. */
export const clipSolido = (x: ExtrasGrid) => osso(x.trava_comprimento, x.trava_largura, x.trava_haste, 0, x.trava_altura - .3)
```
(Conferir na d.ts: `CrossSection.circle`, `.square(size, center)`, `CrossSection.union`, construtor `new CrossSection(polígonos)`, `Manifold.extrude(cs, h)`, `rotate([x,y,z])` em graus, `volume()`. Ajustar nomes se diferirem.)

- [ ] **Step 4: integrar em `grid()`** (`sistema.ts`): assinatura `grid(s: Sistema, linhas: number, colunas: number, x?: ExtrasGrid)`; `export const avisosGrid: string[] = []`. Depois de montar `placa` e a união dos furos `furos` (separar a união numa variável, sem mudar o resultado):
```ts
  avisosGrid.length = 0
  let m = g(placa.subtract(furos))
  if (x && x.trava !== 'nenhuma') {
    const r = regiao(s, linhas, colunas), vs = verticesBorda(r.seg).filter(v => v.ang >= 119)
    const L = x.trava_comprimento, h = x.trava_altura
    let pul = 0
    for (const v of vs) {
      const macho = x.trava === 'macho' && (c.hex ? v.ang > 179 + 30 : v.n[0] > .5 || v.n[1] > .5) // hexágono: 240° é macho; quadrado: lados +X e +Y
      const corte = x.trava === 'clip' ? osso(L, x.trava_largura, x.trava_haste, x.trava_folga, h + .3)
        : macho ? null : rabo(L, x.trava_largura, x.trava_haste, x.trava_folga, h + .3)
      if (corte) { // recorte para dentro: testa o engordado de 0,8 mm contra os furos
        const teste = g(poe(x.trava === 'clip' ? osso(L, x.trava_largura, x.trava_haste, x.trava_folga + .8, h) : rabo(L, x.trava_largura, x.trava_haste, x.trava_folga + .8, h), v.p, v.b))
        if (g(teste.intersect(furos)).volume() > 1e-3) { pul++; corte.delete(); continue }
        m = g(m.subtract(g(poe(corte, v.p, v.b).translate(0, 0, -.3))))
      } else m = g(m.add(g(poe(rabo(L, x.trava_largura, x.trava_haste, 0, h), v.p, [-v.b[0], -v.b[1]])))) // macho: para fora
    }
    if (pul) avisosGrid.push(`Trava não cabe em ${pul} vértice(s): aumente o recuo ou diminua a trava.`)
  }
  return m
```
(`regiao` e `verticesBorda`: importar `verticesBorda, osso, rabo, poe, type ExtrasGrid` de `./travas`. O macho do rabo começa 0,3 mm dentro do grid: une sem face coplanar. Ajustar a regra do macho do hexágono se o teste mostrar que o ângulo vem como 240 exato: `v.ang > 200`.)
- [ ] **Step 5: opções** em `bloco.ts` (GUIAS/SECAO_GUIAS/Opcoes/padrao) conforme "Opções novas".
- [ ] **Step 6:** `npx tsc --noEmit`; `npx tsx check_paredes.ts D16 D2` PASS. Commit `Grid: travas clip e macho/femea nos vertices da borda (quadrado e hexagono), check D16`.

---

### Task 3: Ímãs do grid e alívio

**Files:** Modify `web/src/travas.ts` (pontos de ímã), `web/src/sistema.ts` (`grid`); Test `web/check_paredes.ts`.

- [ ] **Step 1: testes (falham)**:
```ts
const cil = (d: number, h: number) => Math.PI * d * d / 4 * h
for (const f of ['quadrado', 'hexagono'] as const) for (const [q, nome] of [['ima_borda', 'borda'], ['ima_cruz', 'cruzamento'], ['ima_meio', 'meio']] as const)
  t('D16', `ímã ${nome}, ${f} 2x3: fecha e remove o volume dos furos`, () => {
    const o = xg({ formato: f, [q]: true }), a = grid(o, 2, 3), b = grid(o, 2, 3, o)
    const va = a.volume(), vb = b.volume(), mb = malha(b)
    if (!fechada(mb.pos, mb.idx)) throw new Error('fechada: NÃO')
    const n = (va - vb) / cil(o.ima_grid_d + 2 * o.folga_ima, o.ima_grid_h + .2)
    if (avisosGrid.length && n < .5) throw new Error(avisosGrid.join(' '))
    if (Math.abs(n - Math.round(n)) > .05 || n < .5) throw new Error(`removido = ${n.toFixed(2)} ímãs`); return `${Math.round(n)} ímãs`
  })
t('D16', 'ímã grande não cabe: pulado com aviso', () => { const o = xg({ ima_meio: true, ima_grid_d: 10 }); grid(o, 2, 3, o); if (!avisosGrid.length) throw new Error('sem aviso'); return avisosGrid[0] })
t('D16', 'alívio com fundo 3: fecha, piso ≥ 1 mm; sem fundo: igual', () => {
  const o = xg({ fundo: 3, alivio: true }), m = malha(grid(o, 2, 3, o))
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
  const o0 = xg({ alivio: true }); if (hash(malha(grid(o0, 2, 3, o0))) !== hash(malha(grid(o0, 2, 3)))) throw new Error('sem fundo mudou')
  return 'ok'
})
```
(o volume removido por ímã inclui a sobra de 0,5 mm do cilindro para fora; se a conta não bater, compare com o volume do próprio cilindro de recorte em vez da fórmula — o objetivo é "n inteiro".)

- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3: pontos de ímã** em `travas.ts`:
```ts
/** Vértices e meios de lado internos (compartilhados entre células) a partir dos contornos de cada célula. */
export function pontosInternos(celulas: P[][]) {
  const vc = new Map<string, { p: P; n: number }>(), lados = new Map<string, { p: P; n: number }>()
  for (const poli of celulas) poli.forEach((p, i) => {
    const q = poli[(i + 1) % poli.length], m: P = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    const a = vc.get(k(p)) ?? { p, n: 0 }; a.n++; vc.set(k(p), a)
    const b = lados.get(k(m)) ?? { p: m, n: 0 }; b.n++; lados.set(k(m), b)
  })
  const nMax = Math.max(...[...vc.values()].map(v => v.n)) // 4 no quadrado, 3 no hexágono (só aparece com grid grande o bastante)
  return { cruz: [...vc.values()].filter(v => v.n >= 3 && v.n === nMax).map(v => v.p), meio: [...lados.values()].filter(v => v.n === 2).map(v => v.p) }
}
/** Cilindro vertical do ímã por baixo (de z = −0,5 a h) em p. */
export const imaV = (p: P, d: number, h: number) => Manifold.cylinder(h + .5, d / 2, d / 2, 48).translate([p[0], p[1], -.5])
/** Cilindro horizontal entrando pela borda: em p (meio do lado), eixo −n, centro em z, profundidade h (+0,5 para fora). */
export const imaH = (p: P, n: P, d: number, h: number, z: number) => {
  const c = Manifold.cylinder(h + .5, d / 2, d / 2, 48).rotate([0, 90, 0]) // eixo +x, de x = 0 a h + 0,5
  return poe(c.translate([-.5, 0, 0]), p, [-n[0], -n[1]]).translate([0, 0, z])
}
```
(`nMax`: num grid 1×N não há cruzamento interno; nesse caso `cruz` fica vazio — use `n >= (hex ? 3 : 4)` passando `hex` se a regra do máximo falhar.)

- [ ] **Step 4: aplicar em `grid()`** depois das travas, com o mesmo teste do engordado (cilindro de diâmetro `d + 1,6` e altura `h + 0,8`) contra `furos`; contar os pulados num aviso "Ímã do grid não cabe em N ponto(s)". Diâmetro do furo = `ima_grid_d + 2 × folga_ima`, profundidade `ima_grid_h + 0,2`.
  - borda: para cada `g` de `regiao().seg`, ponto médio e normal `[g[4], g[5]]`; `z` = metade de `zOmbro = fundo(s) + s.folga_fundo + hPe(s)`; pular também se `d + 1,6 > zOmbro`.
  - cruz/meio: `pontosInternos(cs.map(([cx, cy]) => contorno(c, 0).map(([x, y]) => [cx + x, cy + y])))`.
  - alívio (`x.alivio && fundo(s) > 1.4`): por célula, `pilha(c, [[-1, s.recuo + 1.2], [fundo(s) - 1, s.recuo + 1.2]])` transladada para o centro; se `s.ima_d > 0`, subtrair desse recorte o cilindro de raio `s.ima_d / 2 + s.folga_ima + 1.2`; subtrair do grid. Sem fundo: nada (o aviso de UI explica).
- [ ] **Step 5:** `npx tsc --noEmit`; `npx tsx check_paredes.ts D16 D2` PASS. Commit `Grid: imas na borda, no cruzamento e no meio da nervura; alivio sob o fundo; check D16`.

---

### Task 4: Interface, prévia, avisos e "Baixar clip"

**Files:** Modify `web/src/main.ts`, `web/src/gera.worker.ts`, `web/src/cliente.ts` (tipo da resposta, se preciso), `web/index.html`.

- [ ] **Step 1: worker** — `gera()` passa `o` como 4º argumento de `grid(...)`; a resposta da prévia ganha `av: avisosGrid.slice()` (tipo `Resposta` com `av?: string[]`); exportação aceita `peca === 'clip'` → `malha(clipSolido(q.o))`.
- [ ] **Step 2: seções** na aba Grids (`main.ts` linha ~147): `secoes($('op-guias'), ['Dimensões', 'Travas', 'Ímãs do grid', 'Economia'])` guardado em `dG`; `grupo(GUIAS, o, SECAO_GUIAS, dG)`; em 'Travas' um `escolha('Trava', o.trava, [['nenhuma', 'Nenhuma'], ['clip', 'Clip separado'], ['macho', 'Macho e fêmea']], ...)` e um botão `Baixar clip` (exporta `peca: 'clip'`, nome `Clip ${o.trava_comprimento}mm.stl`, mesmos cuidados do "Baixar telhado": desabilita os botões de exportar durante a exportação); em 'Ímãs do grid' 3 caixas (Borda, Cruzamento das nervuras, Meio da nervura); em 'Economia' a caixa "Alívio sob o fundo (precisa de fundo fechado)".
- [ ] **Step 3: avisos** — em `previa()`, passos 2: `$('aviso').textContent = [...avisos(snap), ...(r.av ?? [])].join(' ')` (hoje o aviso só é escrito no passo 1; escrever também no passo 2 e limpar no 3).
- [ ] **Step 4:** `npx tsc --noEmit`; `npm run build`; `npx tsx check_paredes.ts D2`. Commit `Grid: secoes Travas, Imas do grid e Economia na aba Grids; avisos; Baixar clip`.

---

### Task 5: Verificação final (orquestrador)
- [ ] Bateria completa (`check_paredes`, `check_texturas`, `check_temas`, build) em segundo plano.
- [ ] Navegador: aba Grids com cada trava em quadrado e hexágono (vista de baixo), ímãs nas 3 posições, alívio com fundo 3, aviso com ímã 10 mm, "Baixar clip"; 1024 e 375 px.
- [ ] `docs/MIGRACAO.md` §5 e `RETOMAR.md`; commit; push; CI verde.
