# Telhado sobre paredes — design

Data: 2026-11-20. Aprovado em conversa: removível **ou** fundido (seletor); formatos uma água, duas águas, quatro águas e plano com mureta; cobre o bloco inteiro + beiral; encaixe por saia interna; textura com seletor próprio (padrão Casco); sólido maciço por CSG.

## Escopo
- Só formato **quadrado** (no hexágono a seção some e o telhado é ignorado).
- Com **rampa** (`inclinacao > 0`) o telhado é ignorado, como as paredes.
- Fora: telhado oco, beiral com caibros, chaminé, telhado em hexágono, saia que acompanha paredes internas.

## Opções (`Opcoes`, padrão = sem telhado ⇒ nada muda)
| Campo | Valores | Padrão |
|---|---|---|
| `telhado_forma` | `'nenhum' \| 'uma' \| 'duas' \| 'quatro' \| 'plano'` | `'nenhum'` |
| `telhado_modo` | `'removivel' \| 'fundido'` | `'removivel'` |
| `telhado_eixo` | `'x' \| 'y'` (cumeeira ao longo de; em uma água, para onde sobe) | `'x'` |
| `telhado_angulo` | 15–60° | 35 |
| `telhado_beiral` | 0–6 mm | 2 |
| `telhado_borda` | espessura na beirada das águas, 1–4 mm | 2 |
| `mureta_altura` / `mureta_espessura` | 0–10 / 1–4 mm (só plano) | 4 / 2 |
| `ameias` | boolean (só plano) | true |
| `saia_altura` / `saia_folga` | 0–6 / 0–1 mm (só removível) | 3 / 0,3 |
| `texturaTelhado` | qualquer `TexId` | `'casco'` |

## Geometria (`web/src/telhado.ts`, novo)
- **Área:** retângulo do bloco (`regiao(o, linhas, colunas)`, contorno quadrado) aumentado de `telhado_beiral` em todos os lados = R (largura W ao longo do eixo perpendicular à cumeeira, comprimento C ao longo dela).
- **Base:** `zb = o.altura + max(altura das paredes válidas)`; sem paredes, `zb = o.altura + 30` e aviso "Telhado sem paredes para apoiar".
- **Topo é um campo de altura** `f(x, y)` sobre R, com `tg = tan(ângulo)` e `b = telhado_borda`:
  - uma água: `f = zb + b + tg × (s − s0)` (s = coordenada no eixo, s0 = início de R);
  - duas águas: `f = zb + b + tg × (W/2 − |t − tc|)` (t = coordenada perpendicular à cumeeira, tc = meio de R);
  - quatro águas: `min(duas águas em X, duas águas em Y)` (quadrado ⇒ pirâmide);
  - plano: `f = zb + 3` + mureta (anel de largura `mureta_espessura` na borda de R, até `zb + 3 + mureta_altura`); ameias = cortes de 4 mm a cada 8 mm na mureta, com metade da altura dela.
- **Sólido:** CSG no manifold — duas águas = perfil (pentágono: retângulo de altura b + triângulo) extrudado ao longo da cumeeira; uma água = perfil trapézio extrudado; quatro águas = interseção das duas águas X e Y; plano = laje + anel − ameias.
- **Instância do WASM:** um módulo `web/src/wasm.ts` passa a criar a instância única do manifold, usada por `parede.ts` e `telhado.ts` (os objetos precisam ser da mesma instância para a união do modo fundido). Nada mais muda em `parede.ts`.

## Removível
- Peça própria: `telhadoSolto(o)` devolve a malha do telhado com a base em z = 0 (pronta para imprimir de base para baixo, com suportes dentro da saia — impressão com suportes é decisão em vigor).
- **Saia:** anel sob a base, de `−saia_altura` a 0; borda externa = contorno do bloco recuado `max(espessura das paredes) + saia_folga`; largura 1,2 mm. Sem paredes: sem saia.
- **Exportar:** botão **"Baixar telhado"** ao lado de "Baixar STL", visível com telhado removível no passo 3; peça `'telhado'` no worker.

## Fundido
- O telhado desce 0,3 mm (afunda no topo das paredes) e entra em `Manifold.union` de `pisoComParedes` junto com piso e paredes. Sem saia.

## Textura
- Só no topo inclinado (ou no topo da laje do plano): `refineToLength(.5)` + `warp`; um vértice está no topo se `|z − f(x, y)| < 1e-4` e `z > zb + b − 1e-4`; ele desce `min(profTex(o, u, v, ds, prof, texturaTelhado), cap)`.
- Coordenadas da textura: `u` ao longo da cumeeira (da água em que o ponto está), `v` = distância horizontal até a cumeeira dividida por `cos(ângulo)` (comprimento real na água). As fileiras do Casco devem ficar **paralelas à cumeeira** (conferir no navegador; se saírem perpendiculares, trocar u e v).
- Oitões, beirada, laje do plano e mureta: lisos nesta versão (a textura da parede neles fica para depois).

## Prévia
- O worker devolve `[piso (com paredes e, se fundido, telhado), telhado removível ou null]`; o passo 3 mostra a 2ª malha no lugar (base em zb). Removível na prévia = posto em cima das paredes.

## Testes (D15 em `web/check_paredes.ts`)
- 4 formas × 2 modos, piso 1×1 e 2×3 com "+ Canto" na quina 0 (16 casos; as outras quinas já são cobertas pelo D13): malha fechada (removível: telhado sozinho; fundido: piso unido).
- Altura: cumeeira das duas águas = zb + b + tg × W/2 (±0,05 mm); quatro águas no 1×1 tem o ponto mais alto no centro (±0,1 mm em x e y).
- Saia: bbox da saia dentro do vão interno das paredes do canto (nenhum ponto da saia a menos de `saia_folga − 0,01` da face interna das paredes).
- `telhado_forma = 'nenhum'`: 5 hashes de referência iguais; com rampa ou hexágono, piso igual a sem telhado.
- D11 deixa de contar a palavra "telhado" (o check existia para impedir telhado antes da hora); mantém "textura padrão = Pedra".
