# Workflow multiagente — sistema de paredes (sem telhado)

Escopo: paredes com aberturas (portas e janelas = só vão e batente) na aba Blocos, só textura Pedra. **Fora do escopo:** telhado, canto/conjunto, outras texturas, portões, vitrais, props, salvar projeto.

## 1. Papéis e fluxo

```
Claude (loop, decide ACEITO/REFAZER)
  └─ Gerente  = Agent model=sonnet, effort=medium, 1 só, reaproveitado por SendMessage
       └─ Executores = Agent model=haiku, 1 tarefa curta cada, 1 escritor por arquivo
```

- **Claude** não escreve código de feature. Roda os checks do DoD por conta própria (não confia no relatório), dá o veredito e devolve correções ao gerente.
- **Gerente** quebra a fase em ordens de serviço, dispara os haiku, junta os resultados, roda `npm run build` e o `check_paredes.ts`, verifica no navegador (desktop 1024×768, 700 px, 375 px) e devolve **um relatório estruturado** (§5).
- **Haiku** implementa 1 ordem (arquivos nomeados, assinatura pronta, critério numérico). Só roda `npm run build` e o check da sua ordem. Não testa no navegador.
- Se o gerente não conseguir disparar subagentes: ele devolve a lista de ordens de serviço e o Claude dispara os haiku (mesmo protocolo).

Regras fixas: pt-BR; `ponytail` + `karpathy-guidelines` em código; sem commit/push (só quando o usuário pedir); sem Artifact; nunca copiar código GPL; nunca tocar nos dados do original (`catalogo/`, `spec_encaixe.json`, `docs/HD.md`); usar `git add` só em arquivos nomeados.

## 2. Modelo de dados (travado; mudar só com aval do Claude)

```ts
type Ancora =
  | { tipo: 'aresta'; celula: number; lado: number }      // lado EXTERNO de uma célula do bloco (índice de regiao().seg)
  | { tipo: 'eixo'; eixo: 'x' | 'y' | 'h0' | 'h60' | 'h120'; desloc: number } // reta paralela ao eixo, passando a desloc mm do centro do bloco (h* só no hexágono)
interface Parede {
  id: string; ancora: Ancora
  inicio: number        // mm ao longo da âncora, a partir do começo do lado/centro do bloco
  comprimento: number   // mm (livre; pode passar da aresta)
  altura: number        // mm acima do topo do piso
  espessura: number     // mm
  lado: 'fora' | 'centro' | 'dentro' // de que lado da linha a espessura cresce
  aberturas: Abertura[]
}
interface Abertura {
  tipo: 'porta' | 'janela'
  forma: 'reta' | 'arco' | 'abatido' | 'ogiva'
  pos: number           // centro, mm ao longo da parede (pode cair fora → buraco no ar)
  largura: number; altura: number
  peitoril: number      // mm do pé da parede até a base do vão (porta = 0 por padrão)
  batente: { ligado: boolean; largura: number; saliencia: number }
}
```
- Cada parede é um sólido **independente**; as paredes e o piso são unidos por booleana no fim. Sobreposição de paredes = união, sem erro.
- Padrões: espessura 6 mm, altura 30 mm, comprimento = lado inteiro, lado `fora`.
- Base da parede afundada 0,6 mm no piso (fusão, como a laje). Estado vive em `Opcoes.paredes: Parede[]`, vazio por padrão (nada muda sem paredes).
- Aberturas: perfil 2D (u, v) extrudado através da espessura e subtraído. **Parte do perfil fora do retângulo da parede não corta nada e vira polilinha tracejada** (função pura `foraDaArea()` devolve os segmentos). Abertura toda fora = só tracejado, volume da parede inalterado.
- Batente = anel do perfil (largura `batente.largura`) com saliência para os dois lados da parede, recortado ao que cai dentro da parede.
- Textura: Pedra nas duas faces grandes e no topo; vão e batente podem ficar lisos na fase 1 (limite já conhecido do Blender).

## 3. Fases (um escritor por arquivo; gate numérico ao fim de cada uma)

| Fase | Entrega | Arquivos | Gate (medido) |
|---|---|---|---|
| F0 | Tipos + `parede.ts` esqueleto + `web/check_paredes.ts` (todos os checks do §4, falhando) | `parede.ts`, `check_paredes.ts` | check roda e lista os testes; build ok |
| F1 | Parede lisa, as 2 âncoras, `lado`, união com o piso, quadrado e hexágono | `parede.ts`, `bloco.ts` (só ganchos) | D2, D3, D4 |
| F2 | Aberturas: 4 formas, peitoril, batente, `foraDaArea()` | `aberturas.ts` | D5, D6, D7 |
| F3 | Textura Pedra nas faces/topo (reusa `pedra()`), sem mudar o campo | `parede.ts` | D8 |
| F4 | UI: seção "Paredes" na aba Blocos (lista, +/−, todos os parâmetros, âncora), tracejado na vista 3D, paredes no esquema, worker/cliente, exportar STL | `main.ts`, `vista.ts`, `esquema.ts`, `cliente.ts`, `gera.worker.ts` (um escritor por vez) | D9, D10, D11 |
| F5 | Verificação final completa + atualizar `RETOMAR.md` e `MIGRACAO.md` | docs | todos |

Dependências: F1→F2→F3 em série (mesmo domínio). F4 pode começar a UI (`main.ts`) em paralelo com F2/F3 usando o modelo de dados já travado.

## 4. DoD — critérios numéricos (todos precisam passar)

Executável: `cd web && npx tsx check_paredes.ts` (imprime PASS/FAIL e o valor medido de cada linha) + `npm run build`.

| # | Critério | Limite |
|---|---|---|
| D1 | `npm run build` e `tsc` sem erro; `cli.ts` ainda diz "fechada: sim" nas 9 combinações antigas | 0 erros |
| D2 | **Regressão:** sem paredes, os 5 STL de referência (piso 1×1, 2×3 quadrado, 2×3 hexágono, grid, degrau) com hash idêntico ao de `63e2f50` | 5/5 |
| D3 | Malha fechada ("fechada: sim") com parede, em 12 cenários: quadrado e hexágono × (1 parede em aresta, 4 paredes nas 4 arestas, 1 em eixo, 2 cruzadas em eixos, bloco 2×3 com 3 paredes mistas) | 12/12 |
| D4 | Volume da parede lisa sem abertura = comprimento × altura × espessura | ±0,5 % |
| D5 | Independência: alterar qualquer parâmetro da parede A não muda o hash da malha isolada da parede B | 100 % |
| D6 | Cada abertura (4 formas × porta/janela): volume removido = área do perfil dentro da parede × espessura | ±1 % |
| D7 | Fora da área: abertura toda fora → volume da parede igual ao sem abertura (±0,01 %) e `foraDaArea()` ≥ 1 segmento; abertura meio fora → corta só a parte de dentro, tracejado só a de fora; 2 aberturas na mesma parede sem interferir | 6 casos |
| D8 | Textura: relevo das faces dentro de [0, `teto`] do campo da Pedra; campo do piso inalterado (p50 1,509, p95 1,895); parede 30×6 gera ≤ 120 mil triângulos | limites |
| D9 | Navegador: criar 3 paredes (1 em aresta, 1 em eixo, 1 solta), cada uma com 1 abertura, e 1 abertura toda fora (tracejada) → tracejado visível na vista 3D e no esquema; 0 erros no console; sem rolagem horizontal em 1024, 700 e 375 px | 0 erros, 3/3 tamanhos |
| D10 | Exportar STL com 4 paredes num piso 2×3: conclui, malha fechada, ≤ 60 s; prévia com 4 paredes responde em ≤ 3 s | limites |
| D11 | `grep -ri telhado web/src` sem código novo; textura padrão = Pedra (D11 original, "nenhuma textura além da Pedra", superado pela Rodada E1); sem código GPL | 0 |

Parada: um critério que falha por **resíduo em pose extrema de câmera** (não de geometria) pode ser aceito como limitação conhecida — só o Claude decide.

## 5. Relatório do gerente (formato obrigatório)

```
FASE: Fx   RODADA: n/3
DoD: D? PASS|FAIL valor_medido (uma linha por critério da fase)
ARQUIVOS: lista com linhas alteradas
ORDENS: haiku usados, ok/refeitas
BLOQUEIO: nenhum | descrição + o que precisa de decisão
NAVEGADOR: prints/URLs conferidas (só F4/F5)
```

## 6. Loop do Claude

1. Disparar/continuar o gerente (`SendMessage`) com: fase, DoD da fase, arquivos permitidos, correções da rodada anterior.
2. Receber o relatório. **Rodar eu mesmo**: `npx tsx check_paredes.ts`, `npm run build`, `git diff --stat`. Comparar com o relatório.
3. Veredito:
   - todos os D da fase PASS → **ACEITO**, vai para a próxima fase;
   - senão → **REFAZER**, com a lista exata dos D que falharam, o valor medido e a causa provável.
4. **Freios:** máx. 3 rodadas por fase. Mesma falha 2 vezes seguidas → eu mudo a abordagem (ou peço decisão ao usuário), não repito a ordem. Diff fora dos arquivos permitidos → REFAZER.
5. Fim: todos os D PASS na F5 → relato ao usuário com os números. Commit/push só se o usuário pedir.

## 7. Decisões assumidas (mudar se discordar)

- **"Eixo do bloco"** = reta paralela a X ou Y (ou 3 eixos no hexágono), com deslocamento livre a partir do centro; vale também sobre as linhas entre células.
- Parede pode ultrapassar a aresta/bloco (balanço); o comprimento é livre.
- Parede nasce no topo do piso e não afeta o encaixe do pé.
- Porta e janela são só rótulos/padrões diferentes da mesma abertura (porta: peitoril 0; janela: peitoril > 0).
