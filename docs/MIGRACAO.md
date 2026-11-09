# Migração do Blender para a web

Este documento tem o inventário do gerador em Blender (`gerar.py`), o que já existe na web e o plano para o resto. Estado em 2026-11-07.

Legenda da coluna **Web**: ✅ feito · ⏳ a portar · 🔁 repensar · ❌ não portar.

## 1. Decisões do usuário

| Data | Decisão |
|---|---|
| 2026-11-05 | Sair do Blender para uma ferramenta online em three.js, sem servidor. Motivo: distribuição e facilidade de uso |
| 2026-11-05 | Produto: tamanho e formato de blocos e grids configuráveis pelo usuário |
| 2026-11-05 | Formato: no teste, só quadrado e retângulo de qualquer medida. Hexágono e outros formatos depois |
| 2026-11-05 | Encaixe: o pé atual (medido das originais) só durante o teste. Depois, encaixe ajustável pelo usuário |
| 2026-11-05 | Água: na web, o teto do relevo pode ser maior só nela (originais: p95 de 2,3–3,4 mm) |
| 2026-11-05 | Baú, prop, estátua e Espalhar não vão para a web. No lugar, props prontos importados (ver `PROPS.md`) |
| 2026-11-06 | Piloto do piso de Pedra aprovado. Plugin do Blender descontinuado. Desenvolvimento segue só na web |
| 2026-11-06 | Encaixe próprio e ajustável e hexágono antecipados: implementar já, antes do passo 2 |
| 2026-11-06 | Props importados: sobre qualquer piso, sempre fundidos ao bloco. Licença ainda em aberto |
| 2026-11-06 | Respeitar a GPL: nunca copiar código do Blender ou de outro projeto GPL; recriar do zero |
| 2026-11-06 | Grid próprio, semelhante ao original, com furo no formato do bloco e gerador parametrizável (§5) |
| 2026-11-06 | Nome do projeto: **RPG Block Builder** |
| 2026-11-06 | Interface em 2 passos: o Passo 1 define o sistema (formato e encaixe) e o Passo 2 cria blocos e guias (grid e degrau) dentro dele; depois entram paredes, materiais e props. Todo o encaixe é parametrizado, com 3 tipos de partida (reto + chanfro, cônico, ímã) |
| 2026-11-06 | Nada é salvo por enquanto: cada abertura começa do padrão. O formato de salvar fica para depois |
| 2026-11-06 | Repositório público com histórico limpo (branch `main`) e GitHub Pages; os dados do original ficam só no PC (`master` local) |
| 2026-11-06 | Interface de celular básica, só funcional |
| 2026-11-07 | Blocos de N × M células. Grids e adaptadores (degrau) em aba própria, seguindo o Sistema. Interface em 3 abas: Sistema, Blocos, Grids |
| 2026-11-07 | Linhas, colunas e similares só com valores inteiros (passo por parâmetro) |
| 2026-11-07 | Abas em ordem: 1 Sistema, 2 Grids, 3 Blocos. Formato retângulo removido: quadrado com largura X e comprimento Y independentes, ou hexágono (entre lados) |
| 2026-11-07 | Interface com seções recolhíveis; vista 3D com gizmo, corte por eixo, elevação do bloco, modos de vista e cotas; esquemas 2D (planta, frontal, lateral, isométrica) ao lado |
| 2026-11-06 | Backup de `amostra_hd/` não será feito |

Risco de copyright (avisado ao usuário): medidas configuráveis reduzem o risco, mas não o eliminam. Faltam: encaixe próprio (não publicar `spec_encaixe.json` como padrão), nome próprio (decidido: RPG Block Builder; falta conferir marca no INPI e no USPTO), texturas revisadas (Glifos e Nichos são as mais próximas das originais), termos de uso e revisão por advogado.

## 2. Inventário

### 2.1 Base do bloco
| Item | O que é | Valores no Blender | Web |
|---|---|---|---|
| Célula | Tamanho do bloco no grid | 35 mm fixo | ✅ Aba Sistema: quadrado (largura e comprimento independentes) ou hexágono, 15–100 mm |
| Pé longo / curto | Encaixe no grid | 16,6 / 9,8 mm até encher a célula; altura 24,5 / 17,5 | ❌ substituído pelo encaixe próprio |
| Folga | Pé mais estreito ou largo | −0,2 a 0 testados | ✅ slider |
| Bloco de teste de folga | Marcas da folga em relevo | 3 blocos | ⏳ |
| Liso | Bloco sem textura | — | ⏳ (trivial) |
| Encaixe próprio | Pé e grid nossos, ajustáveis | não existe | ✅ `sistema.ts`: pé reto + chanfro, cônico ou com ímã; altura, recuo, chanfro, conicidade, ombro, nervura, folgas, ímã, fundo |
| Grid e degrau | Placa com furos; degrau para empilhar | não existe no gerador | ✅ N × M, no formato do sistema (versão simples; o resto do §5 depois) |
| Hexágono | — | não existe | ✅ lados planos em cima e embaixo; emenda 0,0000 mm |

### 2.2 Peças
| Peça | Ajustes próprios | Web |
|---|---|---|
| Piso | textura do piso | ✅ só Pedra |
| Parede | espessura 4–10, altura 10–60 mm, textura da parede | ⏳ |
| Canto | igual à parede; só conjunto quadrado | ⏳ |
| Telhado | ângulo 15–40° | ⏳ |
| Porta / Janela (atalho) | parede + 1 abertura | ⏳ |
| Baú, Prop, Estátua, Espalhar | — | ❌ (props importados) |

### 2.3 Texturas (15) — 137 ajustes internos no total
| # | Textura | Como ela é | Ajustes | Onde | Web |
|---|---|---|---|---|---|
| 0 | Pedra | Pedras irregulares, vão com cascalho, rachaduras, lascas | 13 | piso e parede | ✅ piso |
| 1 | Lajota | Placas quadradas, cantos lascados | 11 | ambos | ✅ |
| 2 | Rachado | Lajota grande quebrada em cacos | 6 | ambos | ⏳ |
| 3 | Tijolo | Fiadas, argamassa, quinas quebradas, tijolos faltando | 12 | ambos | ✅ |
| 4 | Tábuas | Fresta, empeno, veio, nós, pregos | 12 | ambos | ⏳ |
| 5 | Terra | Torrões e pedrinhas | 7 | ambos | ⏳ |
| 6 | Areia | Ondulações e dunas | 6 | ambos | ⏳ |
| 7 | Água | Pedra com poças, ondas, pedras saindo | 5 + Pedra | só piso | ⏳ (teto maior) |
| 8 | Lava | Pedra com rio de lava, fluxo e crosta | 6 + Pedra | só piso | ⏳ |
| 9 | Nichos | Nichos em arco; parte com caveira ou pote | 9 | ambos | 🔁 revisar visual (copyright) |
| 10 | Glifos | Painel rebaixado com símbolos | 8 | ambos | 🔁 revisar visual (copyright) |
| 11 | Caverna | Rocha em lajes, fendas, rugas | 11 | ambos | ⏳ |
| 12 | Casco | Tábuas de navio sobrepostas, cavilhas | 13 | ambos | ⏳ |
| 13 | Metal | Chapas, costura, rebites, amassados, corrosão | 12 | ambos | ⏳ |
| 14 | Lisa | Quase plana, placas grandes | 3 | ambos | ✅ |
| — | Relevo | Teto e ganho da junta, para todas | 3 | todas | ✅ |

Rodada E1: Lisa, Lajota e Tijolo estão ✅ no piso e na parede (`web/src/lisa.ts`, `lajota.ts`, `tijolo.ts`, auxiliares em `grade.ts`, registro em `textura.ts`, check em `web/check_texturas.ts`). Falta portar as outras 11.

Funções comuns do Blender que as texturas usam (portar junto): `grade` (fiadas), `junta_perfil`, `seixos` (Voronoi 2D), `lasca`, `grao`, `distorce`, `_mancha`.

### 2.4 Ajustes gerais
| Ajuste | Faixa | Web |
|---|---|---|
| Semente, desgaste, tamanho da pedra, profundidade | 0–9999, 0–1, 5–25, 0,4–0,7 | ✅ |
| Posição X/Y no mapa (emenda) | −8 a 8 células | ✅ |
| Borda da laje: quina, lateral, ruído | 5 ajustes | ✅ |
| Face e topo da parede | 3 ajustes | ⏳ |
| Orientação (giro 0/90/180/270) | — | ⏳ |

### 2.5 Portas e janelas (parede e canto)
Até 2 aberturas. Tipo (porta/janela), lado (A/B no canto), posição, largura 3–30, altura 4–50, peitoril 0–40 mm, verga (reta, arco, abatido, ogiva), moldura (liga, largura, saliência, relevo), limites (pilar e verga mínimos, abatimento). **Web: ⏳** — precisa de booleana (`manifold-3d`). Limite conhecido do Blender: batente sem moldura sai liso.

### 2.6 Conjuntos
Colunas × linhas até 7×7, um pé por célula, parede só na borda de trás, divisão contínua, junta ou bisel. **Web: ⏳**.

### 2.7 Temas (13 atalhos)
dungeon, castelo, ruína, taverna, pântano, deserto, inundada, vulcão, caverna, cripta, templo, navio, forja. Cada um escolhe a textura do piso e da parede, o desgaste e o tamanho da pedra (`TEMAS` no `gerar.py`). **Web: ⏳** (são só predefinições). Pântano, caverna e cripta usavam o Espalhar: na web ficam sem esses detalhes.

### 2.8 Malha e exportação
| Etapa | Blender | Web |
|---|---|---|
| Prévia | 0,5 mm | ✅ 0,5 mm |
| STL final | 0,125 mm, 4 passadas de suavização (fator 0,5), redução | ✅ igual; redução com `meshoptimizer` |
| Alvo de triângulos | 240 mil × (n / 368 mil)^0,75 | ✅ 240 mil × (área / 35²)^0,75 |
| Borda travada | 1,2 mm não reduz; 0,2 mm não suaviza | ✅ igual |
| Malha fecha? | retenta outra razão; por fim, malha crua | ✅ igual (`fechada` em `bloco.ts`) |
| JSON lateral | ficha da peça | ✅ só na linha de comando |
| Corte de portas | booleana Manifold | ⏳ `manifold-3d` |

### 2.9 Interface (estado em 2026-11-07)
| Item | O que é | Web |
|---|---|---|
| Abas | 1 Sistema, 2 Grids, 3 Blocos | ✅ |
| Seções recolhíveis | controles em `<details>`; Pedra avançada em 3 seções | ✅ |
| Vista 3D (`web/src/vista.ts`) | gizmo de orientação; corte X/Y/Z com posição e inverter (um estado por aba); elevação 0–30 mm (só Sistema); modos Sólido, Inclinação, Normais, Arestas, Matcap | ✅ |
| Cotas 3D (`web/src/cotas.ts`) | checkbox "Mostrar cotas"; números vêm de `medidas()` | ✅ |
| Esquemas 2D (`web/src/esquema.ts`) | planta, frontal, lateral e isométrica em SVG, nas abas Sistema e Grids | ✅ |
| Correção visual | z-fighting ombro/topo do grid resolvido com polygonOffset (só na vista; STL inalterado) | ✅ |

Pendências desta parte: ver `RETOMAR.md`, seção "Pendências conhecidas (web)".

## 3. Piloto (piso de Pedra) — resultado

Medido em 35 × 35, pé longo, semente 1:

| Critério | Meta | Web | Blender |
|---|---|---|---|
| `validar.py` | OK | OK | OK |
| Emenda | 0,000 mm | 0,0000 mm | 0,000 mm |
| Triângulos | ~240 mil | 216 mil | 242 mil |
| Facetas p90 | 17–23° | 14,4° | 20,7° |
| Arestas ≥ 60° | originais 0,1–0,3 % | 1,7 % | 2,9 % |
| Relevo em 200 × 200 mm | igual | p50 1,509 / p95 1,895 | 1,510 / 1,892 |
| Tempo do STL final | — | ~2 s no navegador | ~1 min |

Diferenças da web em relação ao Blender (melhorias, não portar de volta):
1. **Ruído próprio** (`web/src/ruido.ts`: Perlin + fBm, Voronoi 3D com F1 e distância à borda). Não copia o Blender (GPL). A mesma semente sorteia pedras diferentes; a estatística é a mesma.
2. **Lateral acompanha o relevo:** cada coluna da lateral encolhe até o relevo do ponto. No Blender só a fileira de cima descia, e sobrava uma parede fina em volta do bloco.
3. **Fundo da laje só com contorno:** a face de baixo (escondida no corpo) não tem grade fina. A grade fina fazia a redução criar triângulos de área zero.
4. **Alvo de triângulos pela área**, não pela contagem crua.

Como comparar uma textura nova com o Blender sem se enganar: a janela de 16 mm do `calibrar.py` tem só 2 ou 3 pedras, e o sorteio da semente domina. Compare o campo da textura numa área grande (200 × 200 mm): `blender.exe -b -P campo_textura.py -- <k>` (Blender) contra `cd web && npx tsx campo.ts` (web).

## 4. Plano

| Passo | Entrega | Estimativa |
|---|---|---|
| 1 | Piloto do piso de Pedra | ✅ feito (2026-11-06) |
| 2 | Parede, canto e telhado, com portas e janelas (`manifold-3d`), na aba Blocos | ~1 semana |
| 3 | As outras 14 texturas (piso e parede) | 2–3 semanas |
| 4 | Conjuntos, temas, interface, Web Worker, hospedagem | ~1 semana |
| 1b | Encaixe próprio e ajustável; hexágono; grid e degrau; blocos N × M; 3 abas; celular; site no Pages | ✅ feito (2026-11-06/07), falta a aprovação |
| depois | Gerador de grid próprio (§5) | a estimar |
| depois | Props importados (qualquer piso, sempre fundidos) | a definir |

Pendências técnicas conhecidas:
1. A geração do STL final roda na thread principal (a tela trava ~2 s). Levar para um Web Worker.
2. O `validar.py` só conhece a célula de 35 mm. Ele precisa ler a largura e o comprimento do JSON.
3. Arestas com 60° ou mais ainda acima das originais (1,7 % contra 0,1–0,3 %).
4. Hospedagem: a decidir (site estático; qualquer serviço de páginas estáticas serve).

## 5. Gerador de grid (decidido em 2026-11-06, implementação futura)

Infraestrutura semelhante ao grid original (placa com um furo por célula), com geometria própria. O furo tem o mesmo formato do bloco: quadrado ou hexágono. Gerador próprio na web, com o máximo de parâmetros.

| Grupo | Parâmetros |
|---|---|
| Tamanho | linhas, colunas, formato da célula (quadrado ou hexágono), passo da célula |
| Furo (recebe o pé do bloco) | medida do furo, folga, bevel ou chanfro na entrada (largura e ângulo), profundidade |
| Altura | altura total, espessura da nervura na base e no topo |
| Ímãs | com ou sem, diâmetro e altura do ímã, folga, quantidade por célula ou por borda, espaçamento, posição (nervura, canto, borda) |
| Bordas e união | borda externa lisa ou com trava para unir grids, tipo de trava |
| Economia | furo passante ou fundo fechado, alívio de material |

Regras: o furo do grid e o pé do bloco usam os mesmos parâmetros de encaixe (mudar um muda o outro). O grid original serve só como referência de função, nunca de geometria.

## 6. Paredes com aberturas (2026-11-08)
Implementadas via `docs/WORKFLOW_PAREDES.md` (F0–F5, D1–D11 aceitos): paredes independentes ancoradas em aresta ou eixo, unidas ao piso por booleana (afundadas 0,6 mm), aberturas reta/arco/abatido/ogiva com peitoril e batente, parte fora da parede vira tracejado, textura Pedra nas faces e no topo. Check: `web/check_paredes.ts`.
