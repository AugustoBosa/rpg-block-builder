# RPG Block Builder

Gerador de blocos de terreno para RPG de mesa.

Este projeto gera blocos de masmorra para imprimir em 3D (FDM). Os blocos encaixam num grid de células. A ferramenta roda **no navegador** (three.js) e grava STL prontos para o fatiador. Ela não precisa de Blender nem de servidor.

**Usar online:** https://augustobosa.github.io/rpg-block-builder/

Os dados medidos do produto original de referência (catálogo, índices e `spec_encaixe.json`) não fazem parte deste repositório. Os scripts Python de medição e o `gerar.py` esperam esses arquivos e só rodam na cópia local do autor.

## Estado (2026-11-06)

| Parte | Estado |
|---|---|
| Ferramenta web (`web/`) | **Passo 1 · Sistema:** formato da célula (quadrado, retângulo, hexágono) e encaixe próprio parametrizado. **Passo 2 · Peças:** piso de Pedra, grid e degrau. STL final no navegador |
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
