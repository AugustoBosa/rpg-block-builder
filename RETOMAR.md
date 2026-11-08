# RETOMAR — estado do projeto (2026-11-08, branch main, último commit publicado `63e2f50`)

Projeto: **RPG Block Builder**. "Dungeon Blocks" nos documentos é sempre o produto original de referência, nunca o nosso.

Leia este arquivo primeiro. Comandos: `USO.md`. Visão: `README.md`. Inventário, decisões e plano: `docs/MIGRACAO.md`.

## Onde estamos
- **Site no ar:** https://augustobosa.github.io/rpg-block-builder/ (GitHub Pages). Repositório **público**: https://github.com/AugustoBosa/rpg-block-builder. Cada push no `main` compila `web/` e publica (`.github/workflows/pages.yml`, cerca de 1 min; o Pages guarda cópia por até 10 min).
- **Git (importante):**
  - Trabalhar e commitar no **`main`** (histórico limpo, começou em 2026-11-06).
  - O **`master`** existe só no PC: tem o histórico antigo e os dados do produto original. **Nunca enviar o `master`** e nunca rodar `git push --all`.
  - Os dados do original ficam no disco, mas ignorados pelo `.gitignore` do `main`: `catalogo/` (302 jpg), índices e listagem do HD, `spec_encaixe.json`, `docs/HD.md`, `docs/AMOSTRA_HD.md` e `graphify-out/`. Nunca usar `git add -f` neles.
  - Sem o `spec_encaixe.json`, `gerar.py`, `validar.py` e outros scripts Python só rodam nesta cópia local.
  - O hook `pre-commit` (graphify) só adiciona o grafo quando ele não está no `.gitignore`.
- **A ferramenta (web, three.js + `manifold-3d`), em 3 abas, nesta ordem:**
  1. **Sistema:** formato da célula (quadrado, com largura X e comprimento Y independentes, ou hexágono com lados planos em cima e embaixo, medido entre lados; de 15 a 100 mm) e **encaixe próprio**. São 3 tipos de partida (pé reto + chanfro, que é o padrão; cônico; com ímã), e todas as medidas são editáveis: altura do pé, recuo, chanfro, conicidade, ombro, nervura, folga lateral, folga embaixo, ímã (diâmetro, altura, folga) e fundo do grid. O pé do bloco e o furo do grid saem do mesmo perfil (`web/src/sistema.ts`). A prévia mostra o bloco assentado num grid 1 × 1, em corte. Medidas padrão: grid de 8,8 mm de altura; o bloco apoia na nervura a 8,5 mm do fundo do pé.
  2. **Grids:** grid N × M (vazado ou com fundo) e degrau N × M (adaptador de nível: pé embaixo, furos em cima). Ambos seguem o Sistema.
  3. **Blocos:** piso de Pedra de **linhas × colunas** células (de 1 a 6), com um pé por célula e uma laje contínua. Todas as células usam a mesma rede de pontos (no hexágono, a rede é triangular), e o desgaste só acontece na borda externa. Mais os 13 ajustes da Pedra, em 3 seções avançadas (Forma das pedras, Superfície, Desgaste).
- **Vista 3D (`web/src/vista.ts`):** gizmo de orientação; corte por eixo X, Y ou Z, com posição e inverter (um estado por aba; ligado só no Sistema, eixo Y, posição 0); elevação do bloco de 0 a 30 mm (só no Sistema; 0 = assentado); modos Sólido, Inclinação, Normais, Arestas e Matcap; checkbox "Mostrar cotas".
- **Barra da vista (estilo Blender, em `main.ts`):** ⌂ Home (tecla Home: pose isométrica), Visibilidade ▾ (checks de Bloco e Grid, passo 1), Corte ▾ (eixos nas cores do gizmo; o plano do corte aparece na cor do eixo), Overlays ▾ (Arestas e Vértices valem em qualquer modo), Transparência ▾ (vale em qualquer modo), Cotas, e 4 esferas de sombreamento (`esferas.ts`: Sólido, Inclinação, Normais, Matcap). Elevação: slider vertical curto à esquerda da vista (passo 1). O gizmo é clicável: clicar numa esfera leva a câmera àquele eixo.
- **Cotas 3D (`cotas.ts`):** somem quando ficam atrás da peça, na direção da visão ou de peça oculta. As alturas vão para a quina que aparece no contorno (esquerda ou direita), em colunas, sem rótulos em cima de rótulos; as horizontais escolhem a aresta mais visível.
- **Esquemas (`esquema.ts`, estilo desenho técnico):** isométrica fixa com os planos de corte tracejados nas cores do gizmo; abaixo, a vista 2D mais próxima da câmera em tamanho cheio e as outras duas em miniatura (só se sobrar espaço). "Mostrar tudo" abre as quatro num diálogo. Cotas com traços de 45°, texto horizontal em colunas, hachura nas seções, eixos traço-ponto. Seguem Bloco/Grid. `medidas()` em `sistema.ts` é a única fonte dos números.
- **Interface:** controles em seções recolhíveis (`<details>`); os textos de nota foram removidos.
  - **Passo por parâmetro:** linhas, colunas e semente só aceitam números inteiros; a posição no mapa anda de 0,5 em 0,5 célula. O passo fica na 5ª posição da tabela de opções (`PISO`, `GUIAS` em `bloco.ts`), e o valor digitado é arredondado.
  - **Layout de celular** (até 700 px): a prévia fica em cima e os controles embaixo.
  - **Nada é salvo:** cada abertura começa do padrão. O formato de salvar fica para depois (decisão do usuário; não propor antes).
- **Conferido:**
  - As 9 combinações de peça e formato geram malha fechada (`cli.ts` diz "fechada: sim").
  - Pisos 2 × 3 fecham no quadrado e no hexágono (o formato retângulo foi removido).
  - Emenda de 0,0000 mm entre vizinhos 1 × 1, no quadrado e no hexágono.
  - O 1 × 1 continua com 216 mil triângulos, e o campo da Pedra não mudou (p50 1,509, p95 1,895).
  - Correção visual: z-fighting entre o ombro do bloco e o topo do grid, com polygonOffset no grid (só na vista; STL inalterado).
  - Rodada de abas, vista 3D, cotas e esquemas: **publicada em 2026-11-07** (commits `e9aad89`, `09b1c5e`, `3082644` no `main`; árvore limpa). Build ok, CLI fechada (grid 312 tri, piso 1×1 216204 tri). Desktop verificado no navegador; celular e "Mostrar tudo" retestados em 2026-11-08 (itens 3–8, em 375 px, 700 px e desktop).
- **Geração em Web Worker (2026-11-08):** `gera.worker.ts` + `cliente.ts` (a prévia reinicia o worker a cada pedido novo; a exportação tem worker próprio e botão Cancelar). `vite.config.ts` força worker em formato `es` (top-level await do WASM). Barra da vista → popover **Desempenho** (pixels da vista 1×/1,5×/2×, e na prévia do piso): malha da PRÉVIA (Auto por orçamento de ms, com refino ao parar; ou Manual) e malha do STL separada (`o.resolucao`). A prévia nunca altera o STL: os 5 STL de referência (piso 1×1, 2×3 quadrado e hexágono, grid, degrau) saem com hash idêntico.
- **Blender congelado:** `gerar.py` fica só como referência de qualidade e de receita das 15 texturas.
- **Nada foi impresso.** O encaixe próprio ainda não foi testado na mão.

## Próximo
1. **Revisão do usuário** no site. Depois, imprimir 1 grid 1 × 1 e 1 bloco para testar o encaixe e a folga.
2. **Paredes com aberturas: implementadas em 2026-11-08 (F0–F5 do `docs/WORKFLOW_PAREDES.md`, ainda sem commit).** Só Pedra, sem telhado e sem canto. Código: `web/src/parede.ts` (sólido, união com o piso, textura), `web/src/aberturas.ts` (perfis reta/arco/abatido/ogiva, `foraDaArea`, tracejado, batente), seção "Paredes" na aba Blocos (`main.ts`), tracejado na vista 3D (`vista.ts`) e planta + elevações no esquema (`esquema.ts`). Check: `cd web && npx tsx check_paredes.ts` (37/37 PASS, cerca de 3 min; `ref_hashes.json` é o baseline dos 5 STL). Na prévia a parede sai lisa; o STL sempre texturizado. Pendências conhecidas: parede em aresta que deixa de existir é ignorada sem aviso; tracejado por aresta (não polilinha); erro raro "firstElem.toArray" visto 1× em sessão com HMR. Telhado, canto, outras texturas e props ficam para depois.
3. As outras 14 texturas. Cerca de 2–3 semanas.
4. ~~Web Worker~~ **feito e publicado (2026-11-08, `63e2f50`)**. Restam conjuntos e temas (predefinições). Cerca de 3 dias.
5. Depois: o gerador de grid completo (`docs/MIGRACAO.md` §5: travas, borda, alívio, ímãs na nervura) e os props importados.

## Em aberto (chamar direcionado: "faça o item N")
| # | Item | Área | Tamanho |
|---|------|------|---------|
| 1 | ~~Retestar o celular~~ **feito** (usuário testou no celular, 2026-11-07) | — | — |
| 2 | ~~Retestar "Mostrar tudo"~~ **aceitável** (usuário, 2026-11-07) | — | — |
| 3 | ~~Cotas 3D empilham numa vista 3D muito estreita (~330 px)~~ **feito** (2026-11-08): Cotas 3D em vista estreita: a menor sem vaga some; as 2 horizontais maiores e a maior altura sempre saem (menor custo). Resta no máximo 1 cruzamento principal × menor em pose extrema a 375 px | — | — |
| 4 | ~~Slider vertical de elevação (à esquerda) pode cobrir cotas do lado esquerdo~~ **feito** (2026-11-08): Slider de elevação: `.elev` virou zona proibida para rótulos (`zonaElev` em `cotas.ts`) | — | — |
| 5 | ~~Esquemas 2D: rótulos colados em medidas pequenas (folga 0,3; chanfro 0,8)~~ **feito** (2026-11-08): Esquemas: `afasta` determinístico, mínimo de 16 px (sem rótulos colados) | — | — |
| 6 | ~~Cota 0,15 mm aparece como "0,1" (1 casa decimal)~~ **feito** (2026-11-08): Cotas com até 2 casas decimais (0,15 aparece como "0,15") | — | — |
| 7 | ~~Hexágono: cota do esquema vai de vértice a vértice, mas o texto diz "entre lados"~~ **feito** (2026-11-08): Hexágono: recuo medido entre lados planos; conicidade e nervura/2 omitidas na frontal do hexágono (lá a linha vai de vértice a vértice) | — | — |
| 8 | ~~Câmera não enquadra as cotas (só as peças)~~ **feito** (2026-11-08): Home enquadra peças visíveis + elevação + margem das cotas (`MARGEM` 18 mm, fator 1,3 com cotas) | — | — |
| 9 | Skill de desenho técnico de terceiros (`technical-drawing`, skills.sh) não foi instalada; só decidir se vale | fora do repo | 10 min |
| 10 | Revisão do usuário no site e impressão 1 × 1 de teste (itens de "Próximo") | físico | — |

## Pendências conhecidas (web)
- **Bloco grande:** 2 × 3 gera ~0,9 a 1,1 milhão de triângulos. Na exportação, o relevo do topo é calculado em paralelo (pool de até 6 workers, `cortesParte` em `bloco.ts`; 17 s → 6,4 s com 12 núcleos, mesmo hash); a tela não trava e há Cancelar. Sobra em série: a malha e `final()` (suavizar + reduzir). A prévia usa 1 worker só.
- **Não feito de propósito:** renderização sob demanda (o laço do three tem amortecimento, animação e gizmo) e relevo em GPU/WASM-SIMD (o float da GPU difere da CPU e a prévia deixaria de ser igual ao STL).
- Emenda entre dois blocos N × M vizinhos não foi medida. Dentro de um bloco, as células se emendam por construção.
- No hexágono, a borda externa do grid N × M fica recortada, célula a célula.
- `validar.py` só conhece a célula de 35 mm e o pé das originais: ele reprova o encaixe próprio. Para conferir se a malha fecha, use o `cli.ts`.
- Facetas p90 14,4° e arestas ≥ 60° em 1,7 % (originais: 0,1–0,3 %).
- Cotas 3D: a 375 px ainda pode haver 1 cruzamento entre cota principal e menor em pose extrema, e a principal pode cruzar o slider (item 3/4).
- O gizmo tem 128 px fixos (o ViewHelper do three 0.187 não aceita tamanho).

## Decisões do usuário (em vigor)
- Ferramenta online, sem servidor. Tudo é parametrizado.
- A interface é dividida em passos: o Sistema define o padrão; Grids e Blocos criam as peças dentro dele.
- Os 3 tipos de encaixe ficam disponíveis; a tela abre no reto + chanfro.
- "Guias" = grid + degrau (Level), em aba própria.
- Repositório público com histórico limpo; os dados do original nunca vão a público.
- Interface de celular: só funcional, sem preocupação estética.
- Linhas, colunas e similares só aceitam valores inteiros.
- Água: teto do relevo maior só nela.
- Baú, prop, estátua e Espalhar não vão para a web. Props prontos importados numa etapa futura (`docs/PROPS.md`): sobre qualquer piso, sempre fundidos ao bloco. Falta decidir as licenças (CC0 ou CC0 + CC BY).
- Impressão **com suportes**: overhang só informa.
- Textura Lisa pode ter relevo < 0,4 mm.
- Copyright: medidas configuráveis e encaixe próprio reduzem o risco, mas não o eliminam. Faltam conferir o nome no INPI, no USPTO e nas lojas de STL, revisar Glifos e Nichos, escrever os termos de uso e consultar um advogado.
- Backup de `amostra_hd/`: não fazer (decisão do usuário). Não sugerir de novo.

## Armadilhas técnicas (web)
- **Comparar textura com o Blender numa área grande.** A janela de 16 mm do `calibrar.py` pega 2 ou 3 pedras, e o sorteio domina. Use `campo_textura.py` (Blender) contra `web/campo.ts`.
- **Lateral da laje:** toda coluna da lateral precisa encolher até o relevo do ponto; se só a fileira de cima descer, sobra uma parede fina em volta.
- **Redução com meshoptimizer:** trava o corpo, o encaixe (z ≤ topo do corpo) e a faixa da borda. Não gerar grade fina em face plana escondida: o fundo da laje é um leque por célula. Conferir com `fechada()` depois de reduzir.
- **Laje N × M:** as células precisam cair na mesma rede global (`rede()` em `bloco.ts`). As laterais só nascem nas arestas do topo sem par.
- **Emenda:** gerar os vizinhos com `--lateral_gasto 0 --quina_gasto 0`.
- **`manifold-3d`:** liberar os sólidos depois de `getMesh` (lista `lixo` em `sistema.ts`), senão a memória do WASM cresce a cada prévia. A licença é Apache-2.0.
- **GPL:** nunca copiar código do Blender ou de outro projeto GPL. O ruído da web é próprio (`web/src/ruido.ts`).
- Scripts com `tsx`: rodar de dentro de `web/`, porque caminho absoluto do Windows falha.
- Num heredoc do Git Bash, um script Python com `'''` quebra o comando. Escreva o script num arquivo.

## Armadilhas técnicas (Blender, só para gerar referência)
- Blender 5.2: entrada do modificador GN = `m.properties.inputs[id]['value']`. O `wm.stl_export` sai vazio com GN: usar `exportar_stl`.
- Booleana na parede: triangular antes do corte; planos de corte no meio entre linhas da grade.
- Voronoi 3D com z = semente: objetos por célula quase somem. Use Voronoi 2D (`Gr.seixos`).
- `render_stl.py` grava `<nome>.png`: dois STL de mesmo nome se sobrescrevem.

## Regras do usuário
pt-BR. Modo ADHD (ação primeiro, passos numerados). `ponytail` e `karpathy-guidelines` em código. Nada de Artifacts sem pedido. STL do HD só como referência de medida, nunca como malha de saída. Commit e push só quando pedido. Sempre verificar no navegador (inclusive em tamanho de celular) antes de publicar.
