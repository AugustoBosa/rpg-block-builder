# Workflow — Editor de Mapa (rodada iniciada em 2026-11-24)

Spec: `docs/superpowers/specs/2026-11-24-editor-mapa-design.md`. Plano aprovado pelo usuário em 2026-11-24.

## Papéis
- **Orquestrador** (sessão principal, Opus): spec, briefs com interfaces e DoD, revisão de cada diff, checks, navegador (desktop + 375 px), commit por tarefa no `main`. Push só quando o usuário pedir.
- **Workers** (`Agent`, `model: haiku`): uma tarefa cada; relatório ≤ 15 linhas.
- **Advisor** (`Agent`, `model: opus`, `effort: medium`): revisa a spec, responde decisões difíceis via `SendMessage`, faz o check final.

## Fases
| Fase | Tarefa | Estado |
|---|---|---|
| F0 | Pesquisa D&D (`docs/AMBIENTES_DND.md`) + estatística dos mapas locais (`docs/MAPAS_REFERENCIA.md`, gitignored) | feito |
| F1 | Spec + revisão do Advisor | feito |
| T1 | Modelo + salvar/abrir + `check_mapa.ts` | `791ac46` |
| T2 | Bloco de escada + D17 | `0d4346a` |
| T3 | Divisão em peças + dedup | `227bb83` |
| T4 | Níveis: grids + degraus | `33b4919` |
| T5 | Página + editor 2D | `ee7e2eb` |
| T6 | Vista 3D com LOD | `95efd3e` (orquestrador: worker só livre no 'pronto', parede de borda no L0, enquadramento) |
| T7 | Exportação ZIP | `c65d4ea` |
| T8 | Modelos prontos | `b573bb3` |
| T9 | Docs + CI | este commit |
| F3 | Check final (Advisor) + navegador | Advisor bloqueou 2: 2D e montagem.svg espelhados em y (corrigido: só a exibição inverte y) e reforço de quina sem olhar o dono (corrigido: só onde as paredes são de donos fora de P; caso 9 no check_mapa). Escada limitada a 12 degraus. Ressalvas abertas: sentido de rampa/escada na montagem.svg, rampa > 3 células, altura do nível fixa 15,5 na 3D, aviso de acesso global |

## Rulings (decisões do orquestrador; reversíveis)
1. **Coordenadas = as de `centros()`** (coluna/linha, hex com colunas ímpares descidas meia célula), não axiais: evita conversão e bate com o gerador. Custo se errado: só o modelo e as funções de vizinho.
2. **Paredes sempre na borda da peça** (a divisão corta em toda aresta com parede): elimina parede interna/eixo central e o caso hex em zigue-zague dentro da peça.
3. **Dedup com posição de textura 0 e semente fixa**; opção `textura_continua` liga a posição real (peças únicas, sem dedup).
4. **Andar de cima sem apoio físico sobre paredes** nesta rodada (empilhado só na vista 3D).
5. **ZIP próprio (store + CRC32)**, sem dependência nova; montado por Blob de partes, limite 4 GB.
6. (Advisor R1) Nível sobe `subidaNivel = altura_degrau − assento` (15,5 mm), não `altura_degrau`. Escada usa esse valor; rampa entre níveis calcula o ângulo (máx. 40°).
7. (Advisor R2) Âncora eixo com `n = (−d_y, d_x)` de `quadro()`; tabela lado→eixo na spec; abertura `pos = comprimento/2`, batente desligado.
8. (Advisor R3) Reforço nas quinas côncavas (poste e×e no quadrado; retângulo 1,155·e no hex). Degrau de e mm na troca de dono aceito.
9. (Advisor R4) Dono da parede prefere célula que não é rampa/escada; escada entra nos 3 cortes de rampa.
10. (Advisor R5) Dedup: hex 180° só com 1 ou nº par de colunas; 90° só com célula quadrada e textura sem direção.
11. (Advisor R6) L1 com fila própria sem cancelamento (2–3 workers); sem L2 e sem LOD por orçamento.
12. (Advisor R8, parcial) Sem textura contínua; 3 modelos prontos. **Mantidos contra o Advisor:** ferramenta Corte (o usuário pediu divisão escolhida por sala) e `montagem.svg` (~40 linhas; sem ela o tileset é difícil de montar).
