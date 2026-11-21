# Gerador de grid completo — design

Data: 2026-11-20. Aprovado em conversa: chanfro na entrada do furo; travas **clip separado ou macho/fêmea** (seletor), no **quadrado e no hexágono**; ímãs na borda, no cruzamento e no meio da nervura; alívio = cavidade sob o fundo. Base: `docs/MIGRACAO.md` §5.

## O que já existe (não muda)
`grid()` em `web/src/sistema.ts`: placa N × M (quadrado ou hexágono) menos um furo por célula com o perfil do pé (`medidas().perfilFuro`), fundo vazado ou fechado (`fundo`), ímã sob o pé (`ima_d`). Tudo novo desligado ⇒ STL do grid e do degrau idênticos (hashes D2).

## Geometria disponível (por que as posições são estas)
Abaixo do ombro (z < `folga_fundo + fundo + hPe`), a parede entre dois furos tem ≈ `2 × recuo` (8 mm no padrão) e a parede da borda ≈ `recuo` (4 mm). Acima, só a nervura. Todo recorte novo fica na faixa baixa.

## 1. Chanfro na entrada do furo
`chanfro_furo` (tabela `SISTEMA`, seção "Grid", 0–2 mm, padrão 0): no topo do furo o recuo cai de `nm` para `nm − c` nos últimos `c` mm (45°), com `c = min(chanfro_furo, nm − 0,4)` (sobra crista de 0,8 mm na nervura). Entra em `medidas().perfilFuro`, então vale para grid e degrau. 0 ⇒ perfil idêntico.

## 2. Travas (`trava`: `'nenhuma' | 'clip' | 'macho'`, padrão `'nenhuma'`)
- **Onde:** vértices do contorno externo (`regiao().seg`) com ângulo interno ≥ 119° (quadrado: pontos entre duas células da borda, 180°; hexágono: 120° e 240°). Quinas de 90° ficam sem trava. **Direção:** bissetriz interna do vértice. **Altura:** de z = 0 a `trava_altura` (padrão 3 mm), por baixo — o topo do grid fica limpo.
- Ao encostar dois grids, as bissetrizes dos vértices que se tocam ficam na mesma reta (quadrado alinhado: 180° + 180°; hexágono: 240° + 120°), então a trava atravessa de um grid para o outro.
- **Clip:** "osso" em planta: haste de largura `trava_haste` (2 mm) e duas cabeças circulares de diâmetro `trava_largura` (4 mm), comprimento total `trava_comprimento` (8 mm), centrado no vértice ao longo da bissetriz. No grid recorta-se o osso aumentado de `trava_folga` (0,15 mm) e com altura `trava_altura + 0,3`; a peça clip (STL próprio, botão "Baixar clip" na aba Grids) tem a altura `trava_altura − 0,3`.
- **Macho/fêmea:** rabo-de-andorinha em planta — pescoço `trava_haste` no vértice, alarga até `trava_largura` a `trava_comprimento / 2` da borda. Macho: saliente para fora do grid (sentido oposto à bissetriz), unido ao grid. Fêmea: recortada para dentro ao longo da bissetriz, aumentada de `trava_folga`. Quem é macho: **quadrado** — vértices nos lados de normal +X ou +Y; **hexágono** — vértices de 240°; os demais são fêmea.
- **Cabe?** Cada recorte para dentro, engordado 0,8 mm, é intersectado com a união dos furos; se a interseção tiver volume, aquela trava é pulada e entra o aviso "Trava não cabe em N vértices (aumente o recuo ou diminua a trava)".

## 3. Ímãs do grid
Tamanho próprio `ima_grid_d` (5 mm) e `ima_grid_h` (2 mm); folga = `folga_ima` do sistema. Três liga/desliga (padrão desligados):
- **`ima_borda`:** furo horizontal no meio de cada lado externo de cada célula da borda, profundidade `ima_grid_h + 0,2`, centro em z = metade da faixa baixa.
- **`ima_cruz`:** furo vertical por baixo (de z = 0, profundidade `ima_grid_h + 0,2`) nos vértices internos (onde 4 células quadradas ou 3 hexagonais se encontram).
- **`ima_meio`:** furo vertical por baixo no meio de cada lado compartilhado por 2 células.
- **Cabe?** Mesmo teste do engordado de 0,8 mm contra os furos; borda: também exige o furo inteiro dentro da faixa baixa (z de 0,8 a topo − 0,8). Pulados entram no aviso.

## 4. Alívio de material (`alivio`, padrão desligado)
Só com fundo fechado (`fundo(s) > 1,4`): cada célula ganha por baixo uma cavidade = contorno da célula recuado `recuo + 1,2`, de z = −1 até `fundo − 1` (sobra 1 mm de piso); com ímã do pé, a cavidade desvia de um cilindro de raio `ima_d/2 + folga_ima + 1,2`. Com fundo vazado a opção não tem efeito (aviso).

## Interface (aba Grids)
Seções novas: "Travas" (seletor + 5 ajustes + botão "Baixar clip" quando `clip`), "Ímãs do grid" (3 caixas + 2 ajustes), "Economia" (alívio). `chanfro_furo` fica na aba Sistema, seção Grid. Avisos do grid (vindos do worker) aparecem no `#aviso`.

## Código
- `web/src/sistema.ts` passa a usar a instância única de `web/src/wasm.ts` (mesmo resultado).
- `web/src/travas.ts` (novo, só geometria pura + Manifold de `wasm.ts`, sem importar `sistema.ts`): vértices da borda com ângulo e bissetriz, formas do clip e do rabo-de-andorinha, posições de ímãs.
- `grid(s, linhas, colunas, x?)`: `x` = opções extras (`ExtrasGrid`); sem `x`, igual a hoje. Devolve o sólido; avisos em `avisosGrid` (exportado, limpo a cada chamada) e devolvidos pelo worker na resposta da prévia.

## Testes (D16 em `web/check_paredes.ts`)
- Tudo desligado: 5 hashes D2 iguais.
- Chanfro 1 mm: grid fecha; o furo no topo fica 2 × 1 mm mais largo (bbox de um corte horizontal) e a crista ≥ 0,8 mm.
- Para quadrado 2×3 e hexágono 2×3: clip e macho/fêmea — grid fecha; nº de travas = nº de vértices elegíveis (quadrado 2×3: 2×(2−1) + 2×(3−1) = 6); clip cabe no recorte (volume do clip − volume(clip ∩ grid) = volume do clip); macho de um grid ∩ grid vizinho posicionado ao lado = só dentro da fêmea (volume da interseção = 0 após aplicar a fêmea).
- Ímãs (borda, cruz, meio) em quadrado e hexágono 2×3: grid fecha; volume removido ≈ nº de furos × volume do cilindro (±3 %); com ímã grande (10 mm) os que não cabem são pulados e há aviso.
- Alívio com `fundo = 3`: fecha; piso mínimo ≥ 1 mm (nenhum vértice da cavidade acima de `fundo − 1`); sem fundo: STL igual a sem alívio.
