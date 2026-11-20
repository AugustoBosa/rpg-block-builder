# Rampa, atalho de canto e pilar de canto — design

Data: 2026-11-20. Aprovado em conversa (escolhas do usuário: rampa com direção escolhível, atalho de canto com seletor de quina, pilar automático).
Fora deste spec: **telhado sobre paredes** (duas águas, beiral, cumeeira) — brainstorm próprio depois.

## Contexto
No Blender (`gerar.py`) existiam as peças `telhado` (piso com a laje do topo inclinada, `gerar.py:671-673`, ângulo 15–40°) e `canto` (parede A + parede B girada 90°, só conjunto quadrado). Na web, as paredes já se ancoram em qualquer lado do bloco (`ladoBloco`, `aberturas.ts:11`) e se unem por booleana exata, então duas paredes em lados vizinhos já formam um canto. Faltam: a rampa, um atalho para criar o canto e um pilar na quina.

## 1. Rampa (piso inclinado)
**Opções novas** (`Opcoes` e `padrao()` em `web/src/bloco.ts`, card Peça):
- `inclinacao`: graus, `[0, 0, 40]`, passo 1. 0 = desligado (padrão). Valores entre 0 e 15 são aceitos (o Blender ia de 15 a 40; não há motivo para proibir menos).
- `inclinacao_dir`: `'+y' | '-y' | '+x' | '-x'` (padrão `'+y'`, como no Blender). Seletor de 4 opções, visível só com `inclinacao > 0`.

**Geometria** (`piso()`, `web/src/bloco.ts:123-168`): na função `v(L, k)`, a cota final do vértice ganha `sobe(x, y) × t`, onde:
- `sobe(x, y) = tan(inclinacao) × (s − s_min)`, com `s` = coordenada no eixo da direção (x ou y, com sinal) e `s_min` = mínimo de `s` sobre `r.seg` (contorno da peça);
- `t = (z − z0) / (z1 − z0)` ∈ [0, 1] (0 no fundo da laje, 1 no topo).
O fundo da laje (`z0`, escondido no corpo) não sobe; o topo e a lateral sobem, e a laje vira uma cunha fechada. Corpo, pé e encaixe não mudam. Funciona em quadrado e hexágono, em qualquer N × M.

**Textura:** a do piso, lida em (x, y) global, como hoje (no Blender também). A 40° ela estica ~30 % ao longo da rampa. Emenda entre rampas vizinhas na direção perpendicular à subida continua exata.

**Pós-processo:** `final()` (suavização acima de `zt`, `BORDA_FIXA`) segue igual; conferir que a suavização não arredonda a aresta alta da cunha (se arredondar, o check de malha fechada pega; ajuste só se a malha falhar).

**Paredes:** com `inclinacao > 0`, as paredes não são geradas (`pisoComParedes` devolve só o piso) e a seção Paredes mostra o aviso "Paredes desligadas na rampa". As paredes da lista não são apagadas.

**Prévia e vista:** a prévia usa a mesma `piso()`, então a rampa aparece sozinha. Cotas 3D: a altura total passa a ser `altura + sobe_max`; o Home já enquadra pelas peças visíveis.

## 2. Atalho "+ Canto"
Na seção Paredes (`web/src/paredes.ts`), ao lado do "+" atual: seletor de quina (4 opções: as quinas entre os lados `k` e `k+1`, `k = 0..3`) e botão **"+ Canto"**.
- Cria 2 paredes com `paredeNova` (`aberturas.ts`): âncora `{ tipo: 'aresta', lado: k }` e `{ tipo: 'aresta', lado: (k + 1) % 4 }`, `inicio: 0`, `comprimento` = `ladoBloco(o, lado).L` (lado inteiro do bloco), `lado: 'dentro'`, demais valores padrão de `paredeNova`.
- Só no formato quadrado: no hexágono, o seletor e o botão ficam ocultos.
- Desabilitado com `inclinacao > 0`.
- As 2 paredes são paredes normais (editáveis e removíveis uma a uma).

## 3. Pilar de canto (automático)
**Opções novas** (card Paredes): `pilar`: liga/desliga (padrão desligado); `pilar_saliencia`: `[1.5, 0, 4, 'Saliência do pilar (mm)']`; `pilar_sobe`: `[2, 0, 6, 'Pilar acima da parede (mm)']`.

**Detecção** (função nova em `web/src/parede.ts`, ~20 linhas): para cada par de paredes não paralelas (|det(dA, dB)| > 0,1), calcular a interseção das linhas centrais (`quadro(...).pt(u, (o1 + o2) / 2)`). Há pilar se a interseção cai a no máximo `max(eA, eB)` de uma ponta (u = 0 ou u = comprimento) de cada parede. Pilares a menos de 0,5 mm um do outro viram um só.

**Sólido:** prisma quadrado alinhado à parede A, centro na interseção deslocado `saliência × (vA + vB)` (vA, vB = para onde cada parede segue a partir da quina), para a saliência crescer para dentro do canto e o pilar não passar do contorno do bloco (blocos vizinhos continuam encostando); lado = `max(eA, eB) + 2 × pilar_saliencia`, do mesmo pé das paredes (`baixo`, afundado `AFUNDA`) até `max(altura A, altura B) + pilar_sobe`. Textura da parede (`texParede`) nas 4 faces e no topo, pelo mesmo `warp` de `solido()` (refatorar o trecho de textura de `solido()` numa função usada pelos dois, sem mudar o resultado das paredes). Unido em `pisoComParedes` como mais uma parede.

**Prévia:** igual às paredes (lisa na prévia, texturizada no STL). No esquema 2D (`esquema.ts`), o pilar aparece na planta como quadrado.

## Testes (DoD)
- `npx tsc --noEmit` limpo; `npm run build` ok.
- Tudo desligado: 5 hashes de `ref_hashes.json` iguais; `check_paredes.ts` 42/42; `check_texturas.ts` 0 falha.
- Casos novos em `check_paredes.ts` (malha fechada, `fechada()`):
  - rampa 15° e 40°, nas 4 direções, quadrado 1×1 e 2×3, hexágono 1×1; altura máxima medida = `altura + tan(θ) × extensão` (±0,1 mm);
  - rampa com paredes na lista: STL sem parede (mesmo hash que sem paredes);
  - "+ Canto" nas 4 quinas (quadrado 1×1 e 2×3): 2 paredes com `L` do lado inteiro, malha unida fecha;
  - pilar: canto com pilar fecha; 2 paredes de espessuras diferentes fecham; 2 paredes paralelas não geram pilar; parede em T (ponta de uma no meio da outra) não gera pilar.
- `check_paredes.ts` D11 (hoje conta a palavra "telhado" em `web/src`): manter; este spec não usa "telhado" no código (a peça se chama rampa).
- Navegador (orquestrador): rampa nas 4 direções, "+ Canto" nas 4 quinas, pilar ligado; 1024 e 375 px sem estouro; console sem erro novo.
- Tempo: piso 1×1 com rampa ≤ tempo sem rampa + 10 %.

## Ordem de execução
1. Rampa (independe do resto).
2. Atalho "+ Canto".
3. Pilar (usa o canto nos testes).
Um commit por item; push com CI verde no fim.
