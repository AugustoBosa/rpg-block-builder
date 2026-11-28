# RPG Block Builder: gerador de terreno de masmorra para impressão 3D

Gerador online e grátis de **blocos de terreno e masmorra para RPG de mesa** (D&D e similares), prontos para **impressão 3D** em STL.

**Usar online:** https://augustobosa.github.io/rpg-block-builder/

> **In English:** Free browser tool to generate 3D-printable tabletop RPG dungeon tiles and terrain (floors, walls, doors, ramps, roofs, grids with magnets or clips) and export STL files. Includes a 2D map editor that splits a whole dungeon, tavern or cave into printable pieces. Square or hex grids, three.js, no server needed. Interface in Brazilian Portuguese.

Este projeto gera blocos de masmorra para imprimir em 3D (FDM). Os blocos encaixam num grid de células. A ferramenta roda **no navegador** (three.js) e grava STL prontos para o fatiador. Ela não precisa de Blender nem de servidor.


Os dados medidos do produto original de referência (catálogo, índices e `spec_encaixe.json`) não fazem parte deste repositório. Os scripts Python de medição e o `gerar.py` esperam esses arquivos e só rodam na cópia local do autor.

**Licença:** MIT (ver `LICENSE`). A biblioteca manifold-3d usada na web é Apache-2.0, compatível com a MIT.

## Estado (2026-11-23)

| Parte | Estado |
|---|---|
| Ferramenta web (`web/`) | **Aba 1 · Sistema:** formato da célula (quadrado com largura e comprimento independentes, ou hexágono) e encaixe próprio parametrizado. **Aba 2 · Grids:** grid e degrau (adaptador de nível) nas medidas do Sistema, com chanfro do furo (ângulo livre), travas (clip ou macho/fêmea) e ímãs (até 4 por lado). **Aba 3 · Blocos:** piso de N × M células com **15 texturas** (piso e parede separados) e 13 temas; paredes com portas e janelas, canto com pilar, rampa e telhado (uma, duas, quatro águas ou plano com mureta; removível ou fundido; oco por padrão). Vista 3D com corte, elevação, modos e cotas; esquemas 2D. STL final no navegador, em Web Worker |
| Editor de mapa (`web/mapa.html`) | Desenho 2D (quadrado ou hexágono) de masmorra, taverna, caverna etc., com paredes, portas, janelas, arcos, colunas, rampas, escadas, salas e níveis; vista 3D (caixas na hora, peças reais depois); divide o mapa em peças por sala, deduplica por rotação e exporta o tileset em ZIP (STL únicos, grids, degraus, manifesto e planta de montagem). 3 escalas: Combate, Cidade (casas, torres, árvores, muralha com ameias) e Reino (montanha, colina, vulcão, água, marcadores; cada hex é uma peça solta). 5 modelos prontos |
| Gerador em Blender (`gerar.py`) | **Congelado.** Fica só como referência de qualidade e de receita das texturas. O plugin (painel) foi descontinuado em 2026-11-06 |
| Ferramentas de medição (Python) | Ativas: conferem os STL da web e do Blender |
| Impressão | Nada foi impresso ainda |

## Por onde começar

1. `RETOMAR.md`: estado, decisões e próximo passo. **Leia primeiro.**
2. `USO.md`: como rodar a web, gerar STL pela linha de comando e medir.
3. `docs/MIGRACAO.md`: inventário de tudo que o gerador do Blender faz e o plano para levar cada parte à web.
4. Referência: `docs/PROPS.md` (objetos externos), `docs/HD.md` e `docs/AMOSTRA_HD.md` (peças originais para medida).

## Pastas e arquivos

| Caminho | O que é |
|---|---|
| `web/` | Ferramenta online (Vite + TypeScript + three.js + meshoptimizer) |
| `gerar.py` | Gerador em Blender (referência congelada). `piloto_externos.py` usa funções dele |
| `validar.py`, `emenda.py`, `facetas.py`, `calibrar.py`, `medir_stl.py` | Medição dos STL |
| `campo_textura.py` (Blender) e `web/campo.ts` | Campo de uma textura em área grande, para comparar Blender e web |
| `render_stl.py`, `folha.py` | Imagens para comparar (o render usa o Blender) |
| `spec_encaixe.json` | Medidas do pé e do grid, tiradas das peças originais. **Só para teste:** o produto vai ter encaixe próprio |
| `piloto_externos.py` | Piloto de props externos (Blender, fora da web) |
| `indice_*.csv`, `hd_listagem.tsv`, `gerar_indice.py`, `AMOSTRA_HD_MANIFESTO.csv` | Índice das peças originais do HD |
| `catalogo/` | Páginas dos catálogos originais (referência visual) |
| `saida/` | Resultados gerados (fora do git) |
