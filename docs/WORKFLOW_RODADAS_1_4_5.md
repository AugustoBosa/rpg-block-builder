# Workflow multiagentes — etapas 1, 4 e 5 (2026-11-08)

Decidido pelo orquestrador. Tudo é reversível: 1 commit local por manager, e só o M1 publica (push).

## Estrutura
- **Orquestrador** (sessão principal): escreve este plano, repassa a cada manager só o escopo dele, verifica o DoD por conta própria (comandos + navegador) e repete até cumprir.
- **Managers**: `Agent` com `model: sonnet`, `effort: medium`. Rodam um de cada vez, na ordem M1 → M2 → M3 (M2 e M3 mexem nos mesmos arquivos).
- **Workers**: `Agent` com `model: haiku`. Cada worker faz uma tarefa pequena, com arquivos próprios (nunca dois workers no mesmo arquivo) e devolve um relatório de até 8 linhas. Quem integra e revisa é o manager.
- Se o manager não tiver a ferramenta `Agent`, ele faz sozinho e diz isso na 1ª linha do relatório.
- Relatório do manager ao orquestrador: até 15 linhas (o que mudou, comandos rodados com resultado, o que falhou).
- A verificação **no navegador** é do orquestrador (os managers não abrem o navegador).

## Regras para todos
- Branch `main`. Nunca tocar no `master`, nunca `git add -f` em dados ignorados, nunca `--no-verify` (o hook do graphify roda no commit).
- Código: ponytail (o mínimo que funciona) e karpathy (mudança cirúrgica, sem abstração de uso único). Textos da interface em pt-BR, linguagem simples. Nada de Artifacts.
- Scripts `tsx` rodam de dentro de `web/`.
- Linha de base que **não pode mudar** com o padrão da interface: os 5 hashes de `web/ref_hashes.json`; piso 1×1 = 216204 triângulos; campo da Pedra p50 1,509 e p95 1,895 (`cd web && npx tsx campo.ts`).
- Só o M1 faz `git push`.

## M1 — Etapa 1: publicar os commits locais
Escopo: `fa57b83`, `f2b26d4` e a mudança pendente do `RETOMAR.md`.
Passos:
1. Conferir que nenhum dado do produto original está versionado: `git ls-files` não pode listar `catalogo/`, `spec_encaixe.json`, `docs/HD.md`, `docs/AMOSTRA_HD.md`, `graphify-out/`, `*.stl`. (Pode usar um worker haiku para essa varredura.)
2. `cd web && npm run build` (precisa passar).
3. Commitar o `RETOMAR.md` (`git add RETOMAR.md` só ele).
4. `git push origin main` (nunca `--all`, nunca o `master`).
5. Conferir o CI: `gh run list --limit 1` até terminar com sucesso; depois `curl -sI https://augustobosa.github.io/rpg-block-builder/` deve dar 200.

**DoD M1:** `git status` limpo; `git log origin/main..main` vazio; CI da última execução = success; site responde 200; varredura sem arquivo proibido.

## M2 — Etapa 4 (Rodada D): quebrar `main.ts` + temas
Contexto: `web/src/main.ts` tem 26 kB e concentra interface, estado e orquestração. "Conjuntos" (linhas × colunas, 1 a 6) **já existe** na aba Blocos, então não se constrói nada novo para eles. Falta só **Temas**.

**D1 — Quebrar `main.ts` sem mudar o comportamento.**
- Extrair por assunto, onde o corte for natural (sugestão: cards da vista, seção Paredes, geração de controles `grupo/secoes`, exportação/desempenho). Nomes e limites ficam a critério do manager; fatiar só quando reduz o tamanho, sem camada nova.
- Sem dependência circular.

**D2 — Temas (predefinições).**
- Os 13 temas do `TEMAS` em `gerar.py` (dungeon, castelo, ruína, taverna, pântano, deserto, inundada, vulcão, caverna, cripta, templo, navio, forja). Cada um define textura do piso, textura da parede, desgaste e tamanho da pedra.
- Módulo novo `web/src/temas.ts` com os 13 (só dados). Hoje só a Pedra existe: o tema grava a textura desejada, e a interface usa `pedra` quando a textura ainda não está disponível (lista `TEXTURAS_DISPONIVEIS`, que o M3 amplia).
- Interface: seletor **Tema** no topo da aba Blocos. Escolher um tema muda desgaste, tamanho da pedra (e a textura, quando existir) nos controles e regenera a prévia. Sem tema escolhido, nada muda. Nada é salvo.

**DoD M2** (todos mensuráveis):
1. `cd web && npx tsc --noEmit` limpo e `npm run build` ok.
2. `main.ts` com no máximo 14 kB, e nenhum módulo novo acima de 12 kB.
3. `cd web && npx tsx check_paredes.ts` = todos PASS (42/42, cerca de 3 min; rodar em segundo plano) e os 5 hashes de referência iguais.
4. `npx tsx cli.ts` fecha a malha (piso 1×1 e grid) como antes (216204 triângulos no piso 1×1).
5. Com o tema não escolhido, o `padrao()` não mudou (mesmos valores).
6. Os 13 temas existem e cada um altera pelo menos desgaste ou tamanho da pedra (teste simples num arquivo `check_temas.ts` de até 40 linhas: aplica cada tema a `padrao()`, confere faixas mín/máx de `PISO` e valores únicos).
7. 1 commit local `Rodada D: ...` no `main`. Sem push.
8. Navegador (orquestrador): abas, cards, esquemas, cotas, Home, corte, elevação, seção Paredes e exportar STL funcionam como antes em 1024 px e 375 px; seletor de temas aplica; console sem erro.

**Divisão em workers sugerida (haiku):** W1 extrai o módulo A (arquivo próprio), W2 extrai o módulo B, W3 escreve `temas.ts` lendo o `TEMAS` de `gerar.py`, W4 escreve `check_temas.ts`. O manager faz a costura em `main.ts` e a revisão.

## M3 — Etapa 5 (Rodada E, fatia 1): texturas Lisa, Lajota e Tijolo
A rodada E inteira (14 texturas, telhado, canto, gerador de grid completo, props) leva semanas. **Esta fatia entrega o que dá para verificar de ponta a ponta:** a infraestrutura de texturas + 3 texturas novas, no piso **e** na parede. Ficam para depois: as outras 11 texturas, telhado e canto, gerador de grid, props. Quem decide a próxima fatia é o orquestrador, a partir do que o M3 aprender.

**E1 — Infraestrutura.** Um registro de texturas (`textura.ts` ou dentro do módulo que couber): `id`, função de profundidade com a assinatura da `pedra()` (`(x, y, z, tam, prof, desg, knobs) → mm ≥ 0`), tabela de ajustes `[padrão, mín, máx, rótulo]` e seções da interface. `bloco.ts` (`relevo`) e `parede.ts` (linha do relevo da face/topo) chamam a função da textura escolhida. Opção `textura` (`pedra` por padrão) em `Opcoes`. Seletor **Textura** na aba Blocos que mostra só os ajustes da textura escolhida. Os ajustes da Pedra continuam como estão.

**E2 — Texturas**, portadas da receita do `gerar.py` (`tex_lisa`, `tex_lajota`, `tex_tijolo`, com os auxiliares `grade`, `junta_perfil`, `lasca`, `grao`, `distorce`; ajustes: Lisa 3, Lajota 11, Tijolo 12 — ver `docs/MIGRACAO.md` §2.3). Regras:
- Usar o ruído próprio (`ruido.ts`). Não copiar código de Blender de terceiros (GPL).
- As coordenadas são globais (como a Pedra), para a emenda entre vizinhos continuar em 0,0000 mm.
- Cada textura em arquivo próprio (`lisa.ts`, `lajota.ts`, `tijolo.ts`); auxiliares comuns num arquivo só, se mais de uma textura os usar.

**E3 — Temas ligados.** Ampliar `TEXTURAS_DISPONIVEIS` com as 3 novas; temas que pedem essas texturas passam a usá-las no piso e na parede.

**DoD M3:**
1. `tsc --noEmit` limpo, `npm run build` ok.
2. Com `textura = pedra` (padrão): 5 hashes de `ref_hashes.json` iguais, piso 1×1 com 216204 triângulos, campo da Pedra p50 1,509 / p95 1,895, `check_paredes.ts` todos PASS.
3. Novo `web/check_texturas.ts` (até 150 linhas) que, para Lisa, Lajota e Tijolo, confirma: (a) malha fechada (`fechada`) no piso 1×1 quadrado, 1×1 hexágono e 2×3 quadrado; (b) emenda 0,0000 mm entre dois pisos 1×1 vizinhos (mesmo método já usado para a Pedra); (c) profundidade do campo entre 0 e `teto` numa amostra de 200 × 200 mm, e média entre 0,3 e 2,5 mm; (d) uma parede com a textura, unida ao piso, fecha a malha; (e) piso 1×1 padrão com no máximo 300 mil triângulos. Imprime PASS/FAIL e o valor medido, no mesmo formato do `check_paredes.ts`.
4. As 3 texturas diferem de verdade entre si e da Pedra (o check imprime média e desvio de cada uma; nenhum par igual).
5. Interface: seletor Textura funciona e o STL exporta com cada uma (o check do item 3 cobre o código; o orquestrador cobre a tela).
6. 1 commit local `Rodada E1: ...` no `main`. Sem push.
7. Navegador (orquestrador): cada textura aparece no piso e na parede, em 1024 px e 375 px; sem erro no console; o tempo de prévia não passa de 2× o orçamento (HUD não fica vermelho no padrão).

**Divisão em workers sugerida (haiku):** W1 escreve a "receita" em texto (≤ 30 linhas por textura) a partir do `gerar.py`; W2 implementa `lisa.ts`; W3 implementa `lajota.ts`; W4 implementa `tijolo.ts`; W5 escreve `check_texturas.ts`. O manager faz o registro (E1), a costura no `bloco.ts`/`parede.ts`/`main.ts` e a revisão numérica.

## Loop do orquestrador
Para cada manager, em ordem:
1. Dispara com o escopo dele (o texto acima, só a parte dele).
2. Quando o relatório chega, **não confia nele**: roda `git diff --stat`, `tsc`, `build`, os checks do DoD, e faz a verificação no navegador.
3. Se algum item do DoD falha: manda ao mesmo manager (`SendMessage`) a lista exata do que falta. Máximo de 3 voltas por manager.
4. Se após 3 voltas ainda falha: corta o escopo (por exemplo, tira uma textura), registra a decisão e segue. Nunca para para pedir instrução.
5. Ao fim: atualiza o `RETOMAR.md`, mostra o resultado e deixa o push das rodadas D e E1 como decisão do usuário.
