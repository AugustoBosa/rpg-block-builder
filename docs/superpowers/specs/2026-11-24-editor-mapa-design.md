# Editor de Mapa — design (2026-11-24)

Plano aprovado pelo usuário em 2026-11-24 (equivale à aprovação desta spec). Workflow e rulings: `docs/WORKFLOW_MAPA.md`.

## Objetivo
Página `web/mapa.html` onde se desenha um ambiente (masmorra, taverna, caverna, cripta, templo, navio...) em 2D vista de cima, se vê em 3D com nível de detalhe reduzido, e se exporta o **tileset completo**: STLs únicos × quantidade, grids, degraus, manifesto e planta de montagem. Base de ambientes: `docs/AMBIENTES_DND.md`.

Decisões do usuário: divisão em peças por sala (automática + cortes manuais); salvar/abrir `.json`; rodada 1 com vários níveis, escadas/rampas, hexágono e bloco de escada novo; página separada; sem telhado no mapa.

Números de referência (`docs/MAPAS_REFERENCIA.md`, local): tela padrão 32 × 32 células cobre todos os 50 mapas; mediana 60 peças e 3 níveis (máx. 166 e 12); dedup reduz ~3× por mapa. O editor não limita o nº de níveis.

## 1. Coordenadas (iguais às de `centros()` em `web/src/sistema.ts`)
- Célula = `(c, r)`: coluna `c` (x cresce), linha `r` (y cresce). Chave `"c,r"`.
- Centro no mundo (mm): `x = c * passo[0]`, `y = r * passo[1] + (hex && c ímpar ? passo[1] / 2 : 0)`, com `passo` de `celula(sistema)`.
- Lados: índice `i` = índice de `celula(s).n` (quadrado: 0 = +x, 1 = +y, 2 = −x, 3 = −y; hex: normais a 30°, 90°, 150°, 210°, 270°, 330°). Vizinho do lado `i` = célula cujo centro é `centro + 2·a[i]·n[i]` (calcular pela geometria, nunca por tabela escrita à mão).
- Aresta canônica: guardada pela célula de onde sai com `i < k/2` (k = 4 ou 6); `"c,r,i"`. Função `arestaCanonica(c, r, i)` converte qualquer lado.

## 2. Modelo (`web/src/mapa/modelo.ts`, sem DOM, sem WASM)
```ts
type Dir = '+x' | '-x' | '+y' | '-y'
interface CelulaMapa { tex: TexId; tipo: 'piso' | 'rampa' | 'escada'; dir?: Dir; sala: string }
interface ArestaMapa { tipo: 'parede' | 'porta' | 'janela' | 'arco'; tex?: TexId }   // tex vazio = parede da sala
interface Sala { id: string; nome: string; tema: string /* chave de TEMAS ou '' */; max: [number, number] /* linhas, colunas máx. da peça, padrão [3,3] */; cortes: string[] /* arestas canônicas internas onde a peça DEVE ser cortada */ }
interface Nivel { id: string; nome: string; base: number /* níveis de degrau abaixo (0 = no grid) */; altura_parede: number /* mm, 30 */; celulas: Record<string, CelulaMapa>; arestas: Record<string, ArestaMapa>; colunas: Record<string, { lado: number /* mm, 10 */ }>; salas: Sala[] }
interface Mapa { versao: 1; nome: string; sistema: Sistema /* snapshot */; textura_continua: boolean; niveis: Nivel[] }
```
- `salvar(m) → string` (JSON com 2 espaços) e `abrir(txt) → Mapa` (valida `versao`, campos, chaves; erro claro em português).
- Funções puras: `vizinho`, `arestaCanonica`, `centroMundo`, `cria(sistema)`, `pinta`, `apaga`, `poeAresta`, `tiraAresta`.

## 3. Bloco de escada (gerador, `web/src/bloco.ts`)
- Novas opções em `PISO`: `escada_degraus` [0, 0, 12, 'Escada: degraus', 1] (0 = sem escada) e `escada_altura` [15.5, 4, 40, 'Escada: subida total (mm)'] (padrão = `subidaNivel` do sistema padrão).
- `subidaNivel(s) = altura_degrau − assento(s)` em `sistema.ts` (15,5 mm no padrão): é quanto um nível sobe sobre um degrau. Única fonte do número (modelo, 3D, check).
- Reusa `inclinacao_dir` para o sentido. Só a laje vira degraus (como a rampa: fundo fixo, `piso()` soma o degrau no `zf`); rampa e escada são exclusivas (escada ganha). A suavização de `final()` não pode arredondar o espelho do degrau: travar vértices a < 0,5 mm do espelho (ou aceitar e medir no D17).
- Escada entra nos 3 cortes que hoje olham `inclinacao > 0`: `parede.ts` (~110), `aberturas.ts` `paredesValidas`, `telhado.ts` `temTelhado`; aviso como na rampa. No hex, ±x aponta para vértice (aceito).
- Aba Blocos: os dois controles na seção "Peça". `cli.ts --escada_degraus`.
- Check D17 em `check_paredes.ts`: escada 1×1 e 2×3 (4 sentidos) fecha; D2 (5 hashes) idêntico.

## 4. Peças (`web/src/mapa/pecas.ts`)
### 4.1 Descritor abstrato
```ts
interface Peca { linhas: number; colunas: number; tex: TexId; texParede: TexId | ''; tipo: 'piso' | 'rampa' | 'escada'; dir?: Dir;
  paredes: { c: number; r: number; i: number; tipo: ArestaMapa['tipo']; tex?: TexId }[]  // c,r relativos à peça
  colunas: { c: number; r: number; lado: number }[] }
interface Instancia { chave: string; nivel: string; c0: number; r0: number; rot: 0 | 1 | 2 | 3; celulas: string[] }
```
### 4.2 Divisão (por sala)
- Uma peça nunca atravessa: borda da sala, aresta com parede/porta/janela/arco (**paredes sempre ficam na borda da peça**), aresta em `sala.cortes`, mudança de `tex` ou de `tipo`/`dir`.
- Automática: varre as células da sala em ordem (r, depois c) e, a partir da primeira livre, cresce o maior retângulo (área, depois colunas) até `sala.max`, respeitando as barreiras. Determinística.
- Hex: peça com mais de 1 coluna só começa em coluna **par** (senão o desencontro das colunas inverte e a peça não corresponde a `centros()`).
- Rampa/escada: a peça inteira é rampa/escada; o sentido `dir` vale para a peça.
### 4.3 Parede da peça
- Dono da aresta: a célula que tem a parede dentro de si. Se as duas células existem: prefere a que **não** é rampa/escada; empate → a célula canônica (lado `i < k/2`). Só rampa/escada disponível → aviso (a parede some). A parede fica **dentro** do dono.
- No `Opcoes`: sempre `Ancora { tipo: 'eixo' }` (quadrado e hex, inclusive lados em zigue-zague). Eixo = direção da aresta = normal + 90° (mod 180): quadrado lado 0/2 → `y`, 1/3 → `x`; hex normal 30°/210° → `h120`, 90°/270° → `h0`, 150°/330° → `h60`. Com `t` o ângulo do eixo: `d = (cos t, sin t)` e **`n = (−d_y, d_x)` como em `quadro()` — nunca a normal da célula**. `desloc = A·n`, `inicio = min(A·d, B·d)`, `comprimento = |AB|`, `lado = 'fora'` se `(centroDono·n) > desloc` (espessura cresce em +n), senão `'dentro'` (faixa [−e, 0]). Coordenadas relativas ao centro da peça (`centros()` centra na origem). Teste: uma parede por lado (4 no quadrado, 6 no hex) bate com a faixa interna de `ladoBloco()`.
- **Reforço nas quinas côncavas** (sala em L, corredor que entra na sala), onde duas paredes de donos diferentes só se tocam numa linha: quadrado — num vértice com paredes em 2 arestas que não são da célula diagonal Q (e Q sem parede no vértice), Q recebe um poste e×e no canto (eixo, comprimento e, espessura e); hex — cada dono recebe um retângulo ao longo da sua aresta interna (dono | outra célula), para dentro, comprimento 1,155·e, espessura e, a partir do vértice. Teste 2D: pontos a < e da aresta com parede, do lado de dentro, sempre cobertos por alguma parede.
- Aceito: onde o dono troca de lado ao longo da mesma linha, a parede dá um degrau de e mm.
- Porta/janela/arco: `aberturaNova(...)` com **`pos = comprimento/2`** (nasce com 0) e **`batente.ligado = false`** (o batente sairia da peça); arco = porta com `forma: 'arco'` e altura 22.
- Coluna: parede `eixo x` de `comprimento = lado`, `espessura = lado`, `lado: 'centro'`, no centro da célula.
### 4.4 Opcoes e dedup
- `opcoesDe(peca, mapa, sala) → Opcoes`: `padrao()` + `sistema` do mapa + `aplicaTema` (se a sala tiver tema) + `textura`/`texturaParede` da peça + rampa ou escada + paredes + `posicao_x/y = 0` e semente fixa. Rampa que liga níveis: `inclinacao = atan(subidaNivel / ext)` (ext = extensão da peça no eixo do `dir`), limitada a 40° com aviso; escada: `escada_altura = subidaNivel`, `escada_degraus = max(2, round(ext / 8))`.
- Chave = JSON canônico do descritor (chaves ordenadas). Rotação gira paredes (lado `(i+2)%4` no quadrado, `(i+3)%6` no hex), colunas e `dir`. Permitidas: quadrado com **célula** quadrada (`largura == comprimento`) e textura sem direção: 0/90/180/270° (90° troca linhas e colunas); Tábuas e Tijolo (piso ou parede): só 0/180°; quadrado retangular: 0/180°; hex: 0/180° **só com 1 coluna ou nº par de colunas**, senão só 0°. A chave da peça é a menor entre as rotações; a instância guarda `rot`.
- Sem textura contínua nesta rodada (desligaria a dedup e `posicao_*` só vai de −8 a 8).
- `tileset(mapa) → { pecas: Map<chave, {peca, qtd}>, instancias: Instancia[], grids, degraus, avisos }`.

## 5. Níveis
- `Nivel.base = k`: o nível fica `k × subidaNivel(s)` acima do grid (degrau assenta no grid como um bloco: sobe `altura_degrau − assento`). Cada célula de nível com `base > 0` precisa de 1 célula de degrau por nível abaixo (empilhados); o tileset conta degraus N×M por retângulos (mesma divisão automática, max 3×3) e grids N×M (max 6×6) cobrindo a pegada do nível 0 + a pegada dos níveis com `base = 0`.
- Escada/rampa ligam níveis: a escada entre `base k` e `k+1` usa `escada_altura = subidaNivel(s)`. O editor não exige ligação (aviso se nível com `base > 0` não tem escada/rampa de acesso).
- Andar de cima de uma casa (taverna): nível com `base` qualquer; na vista 3D aparece empilhado; na mesa o usuário o põe ao lado ou em cima. Sem lógica de apoio sobre paredes nesta rodada.

## 6. Editor 2D (`web/src/mapa/editor2d.ts`, canvas)
Ferramentas: Piso (textura atual), Apagar, Parede (clique ou arrasto nas arestas), Porta, Janela, Arco, Coluna, Rampa, Escada (sentido pela tecla R/botão), Sala (pintar células com a sala atual; nova sala), Corte (clique na aresta alterna corte), Selecionar peça. Níveis em abas (+ novo, renomear, base). Pan (botão do meio/espaço+arrasto/dois dedos), zoom (roda/pinça). Desfazer/refazer (Ctrl+Z/Y, pilha de 100 snapshots JSON). Contorno das peças calculado ao vivo (cor por peça; peças iguais com o mesmo número). Quadrado e hex (formato escolhido ao criar o mapa, fixo depois).

## 7. Vista 3D com LOD (`web/src/mapa/vista3d.ts`)
- three + `OrbitControls`; não usa os cards nem `vista.ts` da página principal.
- **L0** (instantâneo, thread principal): por célula, prisma do contorno da célula com altura do bloco; por parede, caixa com vãos recortados como caixas; cor por textura. Uma `BufferGeometry` mesclada por nível.
- **L1**: prévia de cada peça **única** (`tipo: 'previa'`, `res` 1 mm) numa **fila própria sem cancelamento** com 2–3 workers (`Fila.pede` cancela o pedido anterior: não serve), cache por chave; desenhada com `InstancedMesh` (uma por peça única, matriz = posição + rotação da instância). Troca L0→L1 por peça quando a malha chega; mudar o mapa só regera as chaves novas.
- Sem L2 e sem orçamento/LOD por distância nesta rodada (L1 a 1 mm é leve; a peça fina fica na página principal). Botão "Só caixas (L0)" para máquinas fracas.

## 8. Exportação (`web/src/mapa/zip.ts` + `main.ts`)
- ZIP próprio, só "store" (sem compressão) + CRC32 (~40 linhas, sem dependência), montado como `new Blob([...partes])` (sem concatenar num ArrayBuffer); aborta com mensagem acima de 4 GB (sem zip64).
- Antes de exportar: estimativa de tamanho e tempo (1×1 ≈ 216 mil tri ≈ 11 MB; cresce com área^0,75) e opção de baixar peça por peça.
- Conteúdo: `pecas/P01_<desc>.stl` (uma por chave, via `exporta()` de `cliente.ts`, em série, com progresso e Cancelar), `grids/`, `degraus/`, `manifesto.csv` (id, descrição, qtd, triângulos, dimensões), `montagem_<nivel>.svg` (planta com o id de cada instância), `mapa.json`.

## 9. Modelos prontos
`web/public/mapas/*.json`: masmorra, taverna 2 andares, caverna (rodada 1). Cripta, templo, navio e docas na rodada 2. Menu "Novo a partir de modelo".

## 10. Fora desta rodada
Telhado no mapa, props, paredes curvas/diagonais, escada em caracol, apoio do andar de cima sobre paredes, edição de textura por peça além do tema/textura da célula.
