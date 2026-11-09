# Rodada E2 — textura separada (piso/parede) + Terra, Areia, Rachado e Tábuas

## Contexto
A Rodada E1 (publicada, `7640edf`) criou o registro de texturas (`web/src/textura.ts`) com Pedra, Lisa, Lajota e Tijolo.
Duas falhas ficaram:
1. A opção `Opcoes.textura` é uma só: piso e parede usam a mesma. No `gerar.py` os temas têm textura separada (castelo = piso Lajota + parede Tijolo), então 6 dos 13 temas não saem fiéis.
2. Só 4 das 15 texturas existem. Este lote porta as 4 mais simples e sem dependência de Água/Lava: **Terra, Areia, Rachado, Tábuas**.

Resultado esperado: seletor "Textura da parede" (padrão "Igual ao piso"), 8 texturas, e temas fiéis para castelo, ruína, taverna, pântano e deserto (cripta e templo ficam parciais: Nichos e Glifos ainda não existem).
Fora do lote: Água, Lava, Nichos, Glifos, Caverna, Casco, Metal, telhado/canto, gerador de grid, props, rodada B (CI).

## Como executar (mesmo fluxo da rodada anterior; o usuário já aprovou)
- Primeiro passo: copiar este plano para `docs/WORKFLOW_RODADA_E2.md` (vira o registro versionado).
- Orquestrador (sessão principal) escreve o escopo de cada manager, verifica o DoD com os próprios comandos e no navegador, e repete até cumprir (máx. 3 voltas por manager; se falhar, corta escopo e registra). Não para para pedir instrução.
- Managers: `Agent` com `model: sonnet`, `effort: medium`, em sequência (M4 → M5, mexem nos mesmos arquivos). Workers: `model: haiku`, 1 arquivo por worker, relatório ≤ 8 linhas. Relatórios dos managers ≤ 15 linhas.
- Só o orquestrador abre o navegador. Commit local por manager (`Rodada E2a:` / `Rodada E2b:`, com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`), sem `--no-verify`, sem `git add -f`. **Sem push** (só quando o usuário pedir).

## M4 — textura separada para piso e parede (item 1)
Decisão: `Opcoes.texturaParede: TexId | ''`, padrão `''` = "igual ao piso". Assim o comportamento atual (E1) e os hashes de referência não mudam.
Arquivos e mudanças:
- `web/src/textura.ts`: `profTex(o, x, y, z, prof, id = o.textura)`; novo `texParede = (o) => o.texturaParede || o.textura`.
- `web/src/parede.ts:70`: `rel` passa a chamar `profTex(..., texParede(o))`. `bloco.ts` (piso) continua com `o.textura`.
- `web/src/bloco.ts`: `Opcoes` e `padrao()` ganham `texturaParede: ''`.
- `web/src/main.ts` (~linhas 101–121): segundo seletor "Textura da parede" (primeira opção "Igual ao piso") logo abaixo de "Textura"; o bloco avançado de cada textura fica visível se `id === o.textura || id === texParede(o)`.
- `web/src/temas.ts` `aplicaTema`: `o.textura = piso`; `o.texturaParede = parede === piso ? '' : parede` (já com `texturaDe` para o fallback). O seletor de parede é atualizado em `mostraTextura`.
- `web/cli.ts`: flag `--textura_parede`.
- `web/check_temas.ts` e `web/check_texturas.ts`: ajustar à nova opção (ver DoD).

**DoD M4**
1. `cd web && npx tsc --noEmit` limpo; `npm run build` ok.
2. Com o padrão: 5 hashes de `web/ref_hashes.json` iguais; piso 1×1 = 216204 tri; `npx tsx campo.ts` = p50 1,509 / p95 1,895; `npx tsx check_paredes.ts` = 42/42 (≈3 min, rodar em segundo plano).
3. Novo teste em `check_texturas.ts`: a parede (`parede(o, p, true)`) com `textura='lajota'` e `texturaParede='tijolo'` tem o mesmo hash que a mesma parede com `textura='tijolo'`; com `texturaParede=''` tem o mesmo hash que `texturaParede=textura`; e o piso unido a essa parede fecha a malha.
4. `check_temas.ts` todo PASS: cada tema aplica `textura`/`texturaParede` corretos (castelo = lajota/tijolo) e o padrão do `padrao()` não muda.
5. Navegador (orquestrador): seletor aparece abaixo de Textura, tema Castelo muda os dois seletores (Lajota / Tijolo), os blocos avançados de Lajota e Tijolo aparecem juntos; 1024 px e 375 px sem estouro e sem erro no console. (A parede segue lisa na prévia, só o STL é texturizado: a textura da parede é conferida pelos hashes e pelo `check_texturas`.)
6. 1 commit local `Rodada E2a: ...`.

## M5 — Terra, Areia, Rachado e Tábuas (item 2)
Fonte das receitas: `gerar.py` `tex_terra` (409), `tex_areia` (420), `tex_rachado` (393), `tex_tabuas` (355), tabela de ajustes `TEX_KNOBS` (134–146), `seixos` (382), `grade` com `var` (282). Cada ajuste vem como `[padrão, mín, máx, rótulo]` e entra na interface sozinho (o registro cria os controles).
Peças novas e mudanças (ruído próprio de `ruido.ts`; nunca copiar código GPL; coordenadas globais para a emenda continuar 0,0000 mm):
- `web/src/ruido.ts`: **Voronoi 2D** (F1: distância + cor da célula, ~15 linhas). O 3D existente com z fixo faz as pedrinhas sumirem (RETOMAR, armadilhas do Blender).
- `web/src/seixos.ts` (novo, ~25 linhas): `seixos(x, y, z, cel, dens, topo)` = pedrinhas por célula Voronoi 2D, devolve a profundidade da face da pedra (9 mm fora). Usado por Terra e Areia.
- `web/src/grade.ts`: `grade(u, v, ds, bw, h, desloc, vari = 0)`; com `vari > 0` o comprimento da fiada varia (`bw·(1 − vari/2 + r·vari)`, r por fiada) e `G.bw` devolve o comprimento efetivo. Com `vari = 0` o resultado não pode mudar (Lajota, Tijolo, Lisa).
- `web/src/terra.ts` (7 ajustes), `areia.ts` (6), `rachado.ts` (6), `tabuas.ts` (12): um arquivo por textura, mesmo formato de `lajota.ts` (`export const TERRA = {...}` + função de profundidade).
- Rachado usa a Lajota como base (ajustes da Lajota continuam valendo, como no Blender): o registro passa `o` como 8º argumento de `fn` (`profTex`: `fn(x, y, z, tam, prof, desg, o[id], o)`); as outras texturas ignoram.
- `web/src/textura.ts`: 4 entradas em `TEX`. `web/src/bloco.ts`: `Opcoes` e `padrao()` com os 4 conjuntos de ajustes (preferir derivar de `TEX` a escrever 4 linhas à mão, se couber sem criar camada).
- `web/src/temas.ts`: `TEXTURAS_DISPONIVEIS` += `terra`, `areia`, `rachado`, `tabuas`.
- `web/check_texturas.ts`: iterar todas as chaves de `TEX` (hoje a lista é fixa).
- Docs: `docs/MIGRACAO.md` §2.3 marca as 4 como ✅ e a separação piso/parede; `RETOMAR.md` atualizado pelo orquestrador no fim.

Workers (haiku): W1 `seixos.ts` + Voronoi 2D; W2 `terra.ts`; W3 `areia.ts`; W4 `rachado.ts`; W5 `tabuas.ts` (+ `var` no `grade`, feito pelo manager porque mexe em arquivo compartilhado); W6 ajuste de `check_texturas.ts`. O manager faz a costura (registro, `Opcoes`, `profTex`, temas), lê cada diff e confere os números (não confia no relatório do worker). Se um worker não resolver, o manager escreve o arquivo.

**DoD M5**
1. `tsc --noEmit` limpo; `npm run build` ok.
2. Linha de base que **não pode mudar**: 5 hashes de `ref_hashes.json`; piso 1×1 Pedra = 216204 tri; `campo.ts` p50 1,509 / p95 1,895; `check_paredes.ts` 42/42; `check_temas.ts` PASS; e as estatísticas de relevo (média/desvio, mm) de Pedra 1,331/0,502, Lisa 0,043/0,084, Lajota 0,727/0,438, Tijolo 0,928/0,501 saem idênticas no `check_texturas.ts`.
3. Para cada textura nova, `check_texturas.ts` PASS em: (a) malha fechada no piso 1×1 quadrado, 1×1 hexágono e 2×3 quadrado; (b) emenda 0,0000 mm entre pisos 1×1 vizinhos; (c) profundidade do campo entre 0 e `teto` e média entre 0,3 e 2,5 mm numa amostra de 200 × 200 mm; (d) parede da textura unida ao piso fecha a malha; (e) piso 1×1 padrão ≤ 300 mil triângulos.
4. As 8 texturas diferem entre si (média e desvio; nenhum par igual).
5. Tempo: `cli.ts --textura <id>` do piso 1×1 não passa de 2× o tempo da Pedra (≈2 s).
6. `check_temas.ts`: com as 8 texturas disponíveis, castelo = lajota/tijolo, ruína = rachado/tijolo, taverna = tabuas/tabuas, pântano = terra/tijolo, deserto = areia/tijolo; os demais caem para Pedra onde a textura ainda não existe.
7. Navegador (orquestrador, 1024 px e 375 px, console limpo): cada textura nova aparece no piso e é visualmente distinta (Terra: torrões e pedrinhas; Areia: ondulações; Rachado: lajotas com rachaduras; Tábuas: tábuas com fresta), o seletor de parede funciona, e os temas aplicam as texturas esperadas.
8. 1 commit local `Rodada E2b: ...`.

## Verificação final (orquestrador)
Rodar de novo os comandos acima por conta própria (`git show --stat`, tsc, build, checks, `check_paredes` completo), navegador nos dois tamanhos, atualizar `RETOMAR.md` (estado, decisões, próxima fatia: Água/Lava, Nichos/Glifos, Caverna/Casco/Metal, telhado/canto) e a memória do fluxo se algo novo aparecer. Terminar perguntando se publica (`git push origin main`).

## Estimativa
M4 ≈ 30–45 min de agente; M5 ≈ 1,5–2 h de agente (a maior parte é conferir os números e o visual das 4 texturas). Risco principal: fidelidade visual das receitas em Haiku (por isso a revisão numérica e visual do manager e do orquestrador).
