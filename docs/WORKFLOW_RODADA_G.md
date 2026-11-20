# Rodada G — pendências resolvíveis só em código

Plano aprovado em 2026-11-20. Fora: impressão, revisão no site, Nichos/Glifos/props (jurídico), borda do grid hex (zigue-zague é o que encaixa dois grids), `validar.py` (legado), parede lisa na prévia (desempenho).

## G1 — casa e CI
- `.gitignore`: exceções inúteis do graphify removidas.
- Tábuas em pé na parede (`parede.ts`: troca u e z só para `tabuas`, como `gerar.py:596-601`).
- `check_texturas.ts`: emenda entre peças 2×3 vizinhas (Pedra e Tábuas; hexágono fora).
- CI (`pages.yml`): checks rápidos antes do build.

## G2 — Caverna, Casco, Metal
Padrão de textura nova (igual a `d3ab621`): `web/src/<x>.ts` com `export const X = { nome: [padrão, mín, máx, rótulo] } as const` + `export function x(x, y, z, tam, prof, desg, k, o?)` (mm ≥ 0, coordenadas globais); entrada em `TEX` (`textura.ts`) e em `TEXTURAS_DISPONIVEIS` (`temas.ts`). Interface, `padrao()`, `check_texturas.ts` e `cli.ts` derivam de `TEX`.
Fontes: `gerar.py` `tex_caverna` (~432), `tex_casco` (~534), `tex_metal` (~551), ajustes em `TEX_KNOBS`. Ruído próprio de `ruido.ts` (`voronoi2`), `seixos.ts`, `grade.ts`. Nunca copiar código GPL.

**DoD por textura**
1. `tsc --noEmit` limpo; `npm run build` ok.
2. Linha de base intacta: `check_paredes.ts D2` (5 hashes), `check_temas.ts` PASS, estatísticas das 8 texturas atuais idênticas no `check_texturas.ts`.
3. `check_texturas.ts` 0 falha (malha fecha 1×1 quadrado/hex e 2×3, emenda 0,0000 mm, média 0,3–2,5 mm, parede unida fecha, ≤ 300 mil tri no 1×1, texturas diferem).
4. `cli.ts --textura <id>` 1×1 ≤ 2,5 s.
5. `check_temas.ts`: caverna = caverna/caverna, navio parede = casco, forja = metal/metal.
6. Navegador (orquestrador): distinta no piso, 1024 e 375 px, console limpo.

## G3 — Água e Lava
Manchas de ruído (`gerar.py` ~242), `tex_agua` (~458), `tex_lava` (~469). Pedra fora da mancha. Teto maior só na Água. Na parede caem para Pedra (`gerar.py:608`). Mesmo DoD da G2; temas inundada e vulcão.

## G4 — facetas
Medida de `facetas.py` em TS; ajuste de `final()` (`bloco.ts`). Meta: arestas ≥ 60° ≤ 0,5 % sem passar 2,5 s no 1×1. Muda os hashes (regravar só com malha fechada). Limite: 1 dia.

## Execução
Managers `Agent` Sonnet effort medium, em sequência (mexem em `textura.ts`/`temas.ts`). Orquestrador confere DoD e navegador. Um commit por rodada; push com CI verde.
