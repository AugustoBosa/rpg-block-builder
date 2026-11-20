# Rampa, atalho de canto e pilar de canto — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** piso inclinado (rampa, 4 direções), botão "+ Canto" (2 paredes em L) e pilar automático onde duas paredes se encontram.

**Architecture:** rampa = deslocamento em z dos vértices da laje dentro de `piso()` (`web/src/bloco.ts`), proporcional à altura dentro da laje; com rampa, as paredes são ignoradas. Canto = 2 paredes `aresta` comuns criadas por um botão. Pilar = geometria pura em `aberturas.ts` que devolve `Parede`s quadradas (âncora `eixo`), geradas pelo mesmo `solido()` de `parede.ts` com textura também nas pontas.

**Tech Stack:** TypeScript, manifold-3d (WASM), three.js, tsx para os checks.

**Spec:** `docs/superpowers/specs/2026-11-20-rampa-canto-pilar-design.md`

## Global Constraints
- Responder e comentar em pt-BR; comentários curtos no estilo do arquivo.
- Tudo desligado (`inclinacao = 0`, `pilar = false`, sem paredes novas) ⇒ os 5 hashes de `web/ref_hashes.json` ficam iguais (`npx tsx check_paredes.ts D2`).
- A palavra "telhado" não pode aparecer em `web/src` (check D11 conta ocorrências). Usar "rampa", "inclinação".
- Sem dependência nova, sem abstração nova além das funções citadas.
- `pilares()` fica em `aberturas.ts` (geometria pura): `parede.ts` carrega o WASM no topo e não pode ser importado pelo `esquema.ts`.
- Commits: sem `--no-verify`, sem `git add -f`, mensagem termina com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Sem push (o orquestrador publica).
- Rodar comandos dentro de `web/`. `check_paredes.ts` completo leva ~5 min e `check_texturas.ts` ~7 min: rodar em segundo plano.
- Ajuste em relação ao spec (decisão do orquestrador): o seletor de direção da rampa fica sempre visível (sem lógica de esconder), e o "+ Canto" não é desabilitado na rampa (as paredes já são ignoradas e o aviso explica).

---

### Task 1: Rampa

**Files:**
- Modify: `web/src/bloco.ts` (PISO, SECAO_PISO, Opcoes, padrao, `piso()` linhas ~123–153, nova `subida`)
- Modify: `web/src/aberturas.ts:109` (`paredesValidas`)
- Modify: `web/src/parede.ts:119-130` (`pisoComParedes`)
- Modify: `web/src/main.ts` (~linha 98: seletor de direção; ~linha 38: aviso)
- Modify: `web/src/paredes.ts` (nota `avisoRampa`)
- Modify: `web/src/cotas.ts:208,219` (altura com a subida)
- Test: `web/check_paredes.ts` (casos `D12`)

**Interfaces:**
- Produces: `Opcoes.inclinacao: number` (graus), `Opcoes.inclinacao_dir: '+y' | '-y' | '+x' | '-x'`, `export function subida(o: Opcoes): number` (mm que o topo sobe de uma ponta à outra; 0 sem rampa) em `bloco.ts`.

- [ ] **Step 1: testes D12 (falham)** — em `web/check_paredes.ts`, antes do bloco `const TELHADO_F0`, adicionar (e `subida` no import de `./src/bloco`):

```ts
// ---- D12: rampa (piso inclinado) ----
const DIRS = ['+y', '-y', '+x', '-x'] as const
for (const [nome, e] of [['1x1 quadrado', {}], ['2x3 quadrado', { linhas: 2, colunas: 3 }], ['1x1 hexágono', { formato: 'hexagono' }]] as [string, Record<string, unknown>][])
  for (const ang of [15, 40]) for (const dir of DIRS)
    t('D12', `rampa ${ang}° ${dir}, ${nome}: fecha e sobe o esperado`, async () => {
      const o = op({ ...e, inclinacao: ang, inclinacao_dir: dir }), m = await pisoComParedes(o), b = bbox(m), alto = o.altura + subida(o)
      if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
      if (b.hi[2] > alto + .05 || b.hi[2] < alto - 4) throw new Error(`topo ${b.hi[2].toFixed(2)}, esperado ≤ ${alto.toFixed(2)} e > ${(alto - 4).toFixed(2)}`)
      return `fechada, topo ${b.hi[2].toFixed(2)} (≤ ${alto.toFixed(2)})`
    })
t('D12', 'rampa ignora as paredes (mesmo hash que sem paredes)', async () => {
  const o = op({ inclinacao: 20 }), com = { ...o, paredes: [naAresta(o, 0, 'a')] }
  if (hash(await pisoComParedes(com)) !== hash(await pisoComParedes(o))) throw new Error('paredes entraram na rampa')
  return 'iguais'
})
t('D12', 'rampa: piso 1×1 ≤ tempo sem rampa + 10 %', async () => {
  const med = async (e: Record<string, unknown>) => { const t0 = performance.now(); await pisoComParedes(op(e)); return performance.now() - t0 }
  await med({}) // aquece
  const a = await med({}), b = await med({ inclinacao: 30 })
  if (b > a * 1.1 + 50) throw new Error(`${b.toFixed(0)} ms vs ${a.toFixed(0)} ms`); return `${b.toFixed(0)} ms vs ${a.toFixed(0)} ms`
})
```

- [ ] **Step 2: rodar e ver falhar** — `npx tsx check_paredes.ts D12` → erro de tipo/import (`subida` não existe) ou FAIL.

- [ ] **Step 3: opções** — em `web/src/bloco.ts`:
  - em `PISO`, depois de `posicao_y`: `inclinacao: [0, 0, 40, 'Inclinação da rampa (graus)', 1],`
  - em `SECAO_PISO`: `inclinacao: 'Peça',`
  - no tipo `Opcoes`, dentro do objeto final: `inclinacao_dir: '+y' | '-y' | '+x' | '-x'; pilar: boolean; pilar_saliencia: number; pilar_sobe: number;`
  - em `padrao()`, junto de `texturaParede: ''`: `inclinacao_dir: '+y', pilar: false, pilar_saliencia: 1.5, pilar_sobe: 2,`
  (os 3 campos do pilar entram já aqui para não mexer no tipo duas vezes; só a Task 3 os usa.)

- [ ] **Step 4: geometria** — em `web/src/bloco.ts`, antes de `piso()`:

```ts
/** Rampa: eixo (0 = x, 1 = y), sinal, tangente e o começo da subida (mínimo da coordenada com sinal sobre o contorno). */
function rampa(o: Opcoes, r: Regiao) {
  const tg = Math.tan(o.inclinacao * Math.PI / 180), ei = o.inclinacao_dir[1] === 'x' ? 0 : 1, sn = o.inclinacao_dir[0] === '-' ? -1 : 1
  const s = r.seg.flatMap(g => [sn * g[ei], sn * g[ei + 2]]), s0 = Math.min(...s)
  return { tg, sobe: (x: number, y: number) => tg * (sn * (ei ? y : x) - s0), ext: Math.max(...s) - s0 }
}
/** Quanto o topo sobe de uma ponta à outra da rampa (mm); 0 sem rampa. */
export const subida = (o: Opcoes) => { const k = rampa(o, regiao(o, o.linhas, o.colunas)); return k.tg * k.ext }
```

Em `piso()`, logo depois de `const f = relevo(o, r, XY), des = o.desgaste`: `const rp = rampa(o, r)`.
Trocar a linha `P.push(x + dx * lado, y + dy * lado, z0 + (z - z0) * (1 - ct / (z1 - z0)))` por:

```ts
    let zf = z0 + (z - z0) * (1 - ct / (z1 - z0))
    if (rp.tg) zf += rp.sobe(x, y) * k / (nz - 1) // rampa: o fundo (k = 0) fica, o topo sobe tudo; a laje vira cunha
    P.push(x + dx * lado, y + dy * lado, zf)
```

- [ ] **Step 5: paredes ignoradas na rampa**
  - `web/src/aberturas.ts:109`: `export const paredesValidas = (o: Opcoes) => o.inclinacao > 0 ? [] : o.paredes.filter(p => !orfa(o, p))`
  - `web/src/parede.ts` em `pisoComParedes`: trocar `if (!o.paredes.length) return base` por `if (!o.paredes.length || o.inclinacao > 0) return base // rampa: paredes ignoradas`.

- [ ] **Step 6: interface**
  - `web/src/main.ts`: importar `escolha` de `./ui` e, logo depois de `const poePiso = grupo(PISO, ...)`:
    ```ts
    escolha(dPiso['Peça'], 'Rampa sobe para', o.inclinacao_dir, [['+y', '+Y'], ['-y', '−Y'], ['+x', '+X'], ['-x', '−X']], v => { o.inclinacao_dir = v as Opcoes['inclinacao_dir']; previa() })
    ```
  - `web/src/main.ts` em `previa`, depois da linha `mostraTracejado(...)`:
    ```ts
    const ar = document.getElementById('avisoRampa')
    if (ar) ar.textContent = snap.inclinacao > 0 && o.paredes.length ? '⚠ Paredes desligadas na rampa (inclinação > 0).' : ''
    ```
  - `web/src/paredes.ts`, no começo de `montaParedes` depois de `div.replaceChildren()`:
    ```ts
    const av = document.createElement('div')
    av.id = 'avisoRampa'; av.className = 'nota'; av.style.color = '#e9a35a'
    div.append(av)
    ```
  - `web/src/cotas.ts`: importar `subida` de `./bloco`; linha 208 `passo === 3 ? o.altura + subida(o) : ...`; linha 219 `externas(fixa, k, o.altura + subida(o), 'altura')`.
  - Se `ui.ts` não reexportar `escolha` para o `main`, ele já é `export const escolha` em `ui.ts:47`: só importar.

- [ ] **Step 7: rodar** — `npx tsc --noEmit` (limpo); `npx tsx check_paredes.ts D12 D2 D11` → tudo PASS (D2 5/5, D11 sem "telhado").

- [ ] **Step 8: commit**
```bash
git add web/src/bloco.ts web/src/aberturas.ts web/src/parede.ts web/src/main.ts web/src/paredes.ts web/src/cotas.ts web/check_paredes.ts
git commit -m "Rampa: piso inclinado 0-40 graus em 4 direcoes, paredes ignoradas na rampa, check D12" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Atalho "+ Canto"

**Files:**
- Modify: `web/src/aberturas.ts` (nova `canto`)
- Modify: `web/src/paredes.ts` (seletor de quina + botão)
- Test: `web/check_paredes.ts` (casos `D13`)

**Interfaces:**
- Consumes: `paredeNova(id, ancora, comprimento)` e `ladoBloco(o, i)` de `aberturas.ts`.
- Produces: `export function canto(o: Opcoes, quina: number, id: (i: number) => string): Parede[]` em `aberturas.ts` — 2 paredes `aresta` nos lados `quina` e `(quina + 1) % 4`, comprimento = lado inteiro, `lado: 'dentro'`.

- [ ] **Step 1: testes D13 (falham)** — em `web/check_paredes.ts` (import `canto` de `./src/aberturas`):

```ts
// ---- D13: atalho de canto ----
for (const [l, c] of [[1, 1], [2, 3]] as const) for (const q of [0, 1, 2, 3])
  t('D13', `canto na quina ${q}, ${l}x${c}: 2 paredes do lado inteiro, malha fecha`, async () => {
    const o = op({ linhas: l, colunas: c }), ps = canto(o, q, i => 'c' + i)
    if (ps.length !== 2) throw new Error(`${ps.length} paredes`)
    for (const p of ps) { const L = ladoBloco(o, (p.ancora as { lado: number }).lado)!.L; if (Math.abs(p.comprimento - L) > .06 || p.lado !== 'dentro') throw new Error(`comprimento ${p.comprimento} vs ${L}, lado ${p.lado}`) }
    const m = await pisoComParedes({ ...o, paredes: ps })
    if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
    return 'fechada: sim'
  })
```

- [ ] **Step 2: rodar e ver falhar** — `npx tsx check_paredes.ts D13` → `canto` não existe.

- [ ] **Step 3: implementar** — em `web/src/aberturas.ts`, depois de `paredesValidas`:

```ts
/** Atalho de canto (só quadrado): 2 paredes nos lados inteiros `quina` e `quina + 1`, espessura para dentro. */
export const canto = (o: Opcoes, quina: number, id: (i: number) => string): Parede[] =>
  [quina, (quina + 1) % 4].map((lado, i) => paredeNova(id(i), { tipo: 'aresta', celula: 0, lado }, +ladoBloco(o, lado)!.L.toFixed(1)))
```
(confirmar em `paredeNova` que parede em aresta nasce com `lado: 'dentro'`; se não, fazer `({ ...paredeNova(...), lado: 'dentro' as const })`.)

Em `web/src/paredes.ts`: importar `canto`; `let quina = 0` no nível do módulo (junto de `nParede`); no fim de `montaParedes`, antes do botão `+ Parede`:

```ts
  if (!hex) {
    escolha(div, 'Quina do canto', String(quina), [['0', '+X +Y'], ['1', '−X +Y'], ['2', '−X −Y'], ['3', '+X −Y']], v => { quina = +v })
    div.append(botao('+ Canto', () => { o.paredes.push(...canto(o, quina, () => 'p' + ++nParede)); refaz() }))
  }
```

- [ ] **Step 4: rodar** — `npx tsc --noEmit`; `npx tsx check_paredes.ts D13 D2` → PASS.

- [ ] **Step 5: commit**
```bash
git add web/src/aberturas.ts web/src/paredes.ts web/check_paredes.ts
git commit -m "Canto: botao + Canto cria 2 paredes em L numa das 4 quinas, check D13" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pilar de canto automático

**Files:**
- Modify: `web/src/aberturas.ts` (nova `pilares`)
- Modify: `web/src/parede.ts` (`solido` com textura nas pontas; `pisoComParedes` soma os pilares)
- Modify: `web/src/paredes.ts` (liga/desliga e 2 ajustes)
- Modify: `web/src/esquema.ts:248-255` (pilares na planta)
- Test: `web/check_paredes.ts` (casos `D14`)

**Interfaces:**
- Consumes: `Opcoes.pilar`, `pilar_saliencia`, `pilar_sobe` (Task 1); `canto()` (Task 2); `quadro(o, p)` de `aberturas.ts`.
- Produces: `export function pilares(o: Opcoes, ps: Parede[]): Parede[]` em `aberturas.ts`. Cada pilar é uma `Parede` com `id` começando por `'pilar'`, âncora `eixo`, `lado: 'centro'`, `comprimento = espessura = lado do pilar`, sem aberturas.

- [ ] **Step 1: testes D14 (falham)** — em `web/check_paredes.ts` (import `pilares`):

```ts
// ---- D14: pilar de canto ----
t('D14', 'canto 1x1 com pilar: 1 pilar e malha fecha', async () => {
  const o = op({ pilar: true }), ps = canto(o, 0, i => 'c' + i), pl = pilares(o, ps)
  if (pl.length !== 1) throw new Error(`${pl.length} pilares`)
  const m = await pisoComParedes({ ...o, paredes: ps }), b = bbox(m), b0 = bbox(await pisoComParedes(op()))
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO')
  for (const k of [0, 1]) if (b.lo[k] < b0.lo[k] - .01 || b.hi[k] > b0.hi[k] + .01) throw new Error('pilar passa do contorno do bloco')
  return `fechada, dentro do contorno, pilar ${pl[0].comprimento.toFixed(1)} mm`
})
t('D14', 'contorno 2x2 com pilar: 4 pilares e malha fecha', async () => {
  const o = op({ pilar: true, linhas: 2, colunas: 2 }), ps = [0, 1, 2, 3].map(i => paredeNova('a' + i, { tipo: 'aresta', celula: 0, lado: i }, +ladoBloco(o, i)!.L.toFixed(1)))
  if (pilares(o, ps).length !== 4) throw new Error(`${pilares(o, ps).length} pilares`)
  const m = await pisoComParedes({ ...o, paredes: ps })
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO'); return 'fechada: sim'
})
t('D14', 'espessuras diferentes: pilar pelo maior, malha fecha', async () => {
  const o = op({ pilar: true }), [a, b] = canto(o, 1, i => 'c' + i), ps = [{ ...a, espessura: 4 }, { ...b, espessura: 8 }], pl = pilares(o, ps)
  if (pl.length !== 1 || Math.abs(pl[0].comprimento - (8 + 2 * o.pilar_saliencia)) > 1e-6) throw new Error(`pilares ${pl.map(p => p.comprimento)}`)
  const m = await pisoComParedes({ ...o, paredes: ps })
  if (!fechada(m.pos, m.idx)) throw new Error('fechada: NÃO'); return 'fechada: sim'
})
t('D14', 'paralelas e em T não geram pilar; pilar desligado não muda o hash', async () => {
  const o = op({ pilar: true })
  if (pilares(o, [noEixo('x', -5, 'a'), noEixo('x', 5, 'b')]).length) throw new Error('paralelas geraram pilar')
  // T: A no eixo x de x = 0 a 40; B no eixo y em x = 20 (eixo y ⇒ n = [−1, 0], desloc −20), de y = 0 a 20: toca o meio de A
  if (pilares(o, [noEixo('x', 0, 'a', 40), { ...noEixo('y', -20, 'b', 20), inicio: 0 }]).length) throw new Error('T gerou pilar')
  const ps = canto(op(), 0, i => 'c' + i)
  if (hash(await pisoComParedes({ ...op(), paredes: ps })) !== hash(await pisoComParedes({ ...op({ pilar: false, pilar_saliencia: 3 }), paredes: ps }))) throw new Error('pilar desligado mudou o STL')
  return 'ok'
})
```
(`noEixo` cria parede com `inicio` padrão de `paredeNova`; se esse padrão não for 0 para `eixo`, o `{ ..., inicio: 0 }` acima já força. Para A, conferir que `paredeNova` em eixo nasce com `inicio: 0` e `lado: 'centro'`; se não, passar os dois explicitamente.)

- [ ] **Step 2: rodar e ver falhar** — `npx tsx check_paredes.ts D14` → `pilares` não existe.

- [ ] **Step 3: `pilares()`** — em `web/src/aberturas.ts`:

```ts
const EIXOS: [number, 'x' | 'y' | 'h60' | 'h120'][] = [[0, 'x'], [90, 'y'], [60, 'h60'], [120, 'h120']]
/** Pilares de canto: onde as linhas centrais de 2 paredes não paralelas se cruzam a até max(espessuras) de uma ponta de cada.
 *  Cada pilar é uma Parede quadrada (âncora eixo alinhada à 1ª parede) com id 'pilar…'; pilares a < 0,5 mm viram um. */
export function pilares(o: Opcoes, ps: Parede[]): Parede[] {
  const out: Parede[] = [], cs: [number, number][] = []
  const cx = (a: [number, number], b: [number, number]) => a[0] * b[1] - a[1] * b[0]
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const A = quadro(o, ps[i]), B = quadro(o, ps[j]), det = cx(A.d, B.d)
    if (Math.abs(det) < .1) continue
    const a0 = A.pt(0, (A.o1 + A.o2) / 2), b0 = B.pt(0, (B.o1 + B.o2) / 2), w: [number, number] = [b0[0] - a0[0], b0[1] - a0[1]]
    const ta = cx(w, B.d) / det, tb = cx(w, A.d) / det, e = Math.max(ps[i].espessura, ps[j].espessura)
    const ponta = (t: number, c: number) => Math.abs(t) <= e || Math.abs(t - c) <= e
    if (!ponta(ta, ps[i].comprimento) || !ponta(tb, ps[j].comprimento)) continue
    const x: [number, number] = [a0[0] + A.d[0] * ta, a0[1] + A.d[1] * ta]
    if (cs.some(q => Math.hypot(q[0] - x[0], q[1] - x[1]) < .5)) continue
    cs.push(x)
    // a saliência cresce para dentro do canto (para onde as paredes seguem): o pilar não passa do contorno do bloco
    const va = ta < ps[i].comprimento / 2 ? A.d : [-A.d[0], -A.d[1]], vb = tb < ps[j].comprimento / 2 ? B.d : [-B.d[0], -B.d[1]], s = o.pilar_saliencia
    const c: [number, number] = [x[0] + s * (va[0] + vb[0]), x[1] + s * (va[1] + vb[1])]
    const ang = ((Math.atan2(A.d[1], A.d[0]) * 180 / Math.PI) % 180 + 180) % 180
    const [t0, eixo] = EIXOS.reduce((m, x) => Math.abs(x[0] - ang) < Math.abs(m[0] - ang) ? x : m)
    const r = t0 * Math.PI / 180, d = [Math.cos(r), Math.sin(r)], n = [-d[1], d[0]], l = e + 2 * o.pilar_saliencia
    out.push({ id: 'pilar' + out.length, ancora: { tipo: 'eixo', eixo, desloc: c[0] * n[0] + c[1] * n[1] }, inicio: c[0] * d[0] + c[1] * d[1] - l / 2,
      comprimento: l, espessura: l, lado: 'centro', altura: Math.max(ps[i].altura, ps[j].altura) + o.pilar_sobe, aberturas: [] })
  }
  return out
}
```
(o `Parede` é importado como tipo em `aberturas.ts`; conferir o import existente. Ângulo 180 ≡ 0: o `% 180` cobre.)

- [ ] **Step 4: `solido()` com textura nas pontas e pilares na união** — em `web/src/parede.ts`:
  - assinatura: `function solido(o: OpcoesP, p: Parede, baixo: number, dl = 0, tex = false, pontas = false)`
  - dentro do `warp`, depois da linha `if (alto) v[2] -= rel(u, ww, 1000)`:
    ```ts
    if (pontas) { // pilar: textura também nas duas pontas (recua para dentro ao longo de d)
      if (Math.abs(u + dl) < 1e-4) { const t = rel(ww, z, 1500); v[0] += d[0] * t; v[1] += d[1] * t }
      else if (Math.abs(u - p.comprimento - dl) < 1e-4) { const t = rel(ww, z, 2000); v[0] -= d[0] * t; v[1] -= d[1] * t }
    }
    ```
  - em `pisoComParedes`, importar `pilares` de `./aberturas` e trocar a linha `const ws = o.paredes.map(...)` por:
    ```ts
    const ps = o.pilar ? [...o.paredes, ...pilares(o, o.paredes)] : o.paredes
    const ws = ps.map(p => solido(o, p, RELEVO + AFUNDA + .05, 0, !previa, p.id.startsWith('pilar')).translate(0, 0, z0))
    ```

- [ ] **Step 5: interface** — em `web/src/paredes.ts`, no fim de `montaParedes` (antes do bloco do canto), importar `marca`, `campo` (já importados) e:
```ts
  const ck = marca()
  ck.checked = o.pilar
  ck.onchange = () => { o.pilar = ck.checked; previa() }
  div.append(campo('Pilares nas quinas', ck))
  controle(div, 'Pilar: saliência (mm)', o.pilar_saliencia, 0, 4, v => { o.pilar_saliencia = v }, .1)
  controle(div, 'Pilar: acima da parede (mm)', o.pilar_sobe, 0, 6, v => { o.pilar_sobe = v }, .1)
```

- [ ] **Step 6: esquema** — em `web/src/esquema.ts:248-255`: importar `pilares`; depois da linha `const base = ...`:
```ts
  const pil = (o.pilar ? pilares(o, ps) : []).map(p => { const q = quadro(o, p), L = p.comprimento; return [q.pt(0, q.o1), q.pt(L, q.o1), q.pt(L, q.o2), q.pt(0, q.o2)].map(([x, y]) => S(x, y)) })
```
  incluir `...pil.flat()` em `todos` e, na planta, depois de `base.map(...)`: `+ pil.map(f => poli(P, f, \`fill="${COR.bloco}" fill-opacity=".6" stroke="${COR.bloco}"\`)).join('')`. As elevações continuam só das paredes.

- [ ] **Step 7: rodar** — `npx tsc --noEmit`; `npx tsx check_paredes.ts D14 D13 D12 D2 D8` → PASS.

- [ ] **Step 8: commit**
```bash
git add web/src/aberturas.ts web/src/parede.ts web/src/paredes.ts web/src/esquema.ts web/check_paredes.ts
git commit -m "Pilar de canto automatico: onde 2 paredes se encontram, textura nas 4 faces, planta, check D14" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Verificação final e docs (orquestrador)
- [ ] `npm run build`; `npx tsx check_paredes.ts` completo (todos PASS, incluindo D1 com o cli) e `npx tsx check_texturas.ts` (0 falha), ambos em segundo plano.
- [ ] Navegador (`preview_start web`): rampa nas 4 direções (15° e 40°), aviso com parede na lista, "+ Canto" nas 4 quinas, pilar ligado/desligado e saliência; 1024 e 375 px sem estouro; console sem erro novo.
- [ ] `docs/MIGRACAO.md` §2.2: Canto ✅ (atalho + pilar), linha nova "Rampa (piso inclinado) ✅", Telhado sobre paredes ⏳. `RETOMAR.md`: seção da rodada.
- [ ] Commit `RETOMAR: rampa, canto e pilar`; push; CI verde.
