# RPG Block Builder: 3D-printable dungeon terrain generator
[![en](https://img.shields.io/badge/lang-en-red.svg)](README.md) [![pt-br](https://img.shields.io/badge/lang-pt--br-green.svg)](README.pt-br.md)

Free online generator of **tabletop RPG terrain and dungeon tiles** (D&D and similar), ready for **3D printing** as STL.

**Use it online:** https://augustobosa.github.io/rpg-block-builder/

This project generates dungeon blocks for 3D printing (FDM). The blocks fit onto a cell grid. The tool runs **in the browser** (three.js) and writes STL files ready for the slicer. No Blender and no server needed. Interface in Brazilian Portuguese.

The measured data of the original reference product (catalog, indexes and `spec_encaixe.json`) are not part of this repository. The Python measurement scripts and `gerar.py` expect those files and only run on the author's local copy.

**License:** MIT (see `LICENSE`). The manifold-3d library used on the web is Apache-2.0, compatible with MIT.

## Status (2026-11-23)

| Part | Status |
|---|---|
| Web tool (`web/`) | **Tab 1 · System:** cell shape (square with independent width and length, or hexagon) and parametric custom joint. **Tab 2 · Grids:** grid and step (level adapter) using the System measurements, with hole chamfer (free angle), locks (clip or male/female) and magnets (up to 4 per side). **Tab 3 · Blocks:** N × M cell floor with **15 textures** (floor and wall separate) and 13 themes; walls with doors and windows, corner with pillar, ramp and roof (shed, gable, hip or flat with parapet; removable or fused; hollow by default). 3D view with section, elevation, modes and dimensions; 2D drawings. Final STL in the browser, in a Web Worker |
| Map editor (`web/mapa.html`) | 2D drawing (square or hex) of dungeon, tavern, cave etc., with walls, doors, windows, arches, columns, ramps, stairs, rooms and levels; 3D view (instant boxes, real pieces later); splits the map into pieces per room, deduplicates by rotation and exports the tileset as ZIP (unique STLs, grids, steps, manifest and assembly plan). 3 scales: Combat, City (houses, towers, trees, crenellated wall) and Kingdom (mountain, hill, volcano, water, markers; each hex is a loose piece). 5 ready-made templates |
| Blender generator (`gerar.py`) | **Frozen.** Kept only as a reference for quality and texture recipes. The plugin (panel) was discontinued on 2026-11-06 |
| Measurement tools (Python) | Active: check the web and Blender STLs |
| Printing | Nothing printed yet |

## Where to start (docs in Portuguese)

1. `RETOMAR.md`: status, decisions and next step. **Read first.**
2. `USO.md`: how to run the web tool, generate STL from the command line and measure.
3. `docs/MIGRACAO.md`: inventory of everything the Blender generator does and the plan to bring each part to the web.
4. Reference: `docs/PROPS.md` (external objects), `docs/HD.md` and `docs/AMOSTRA_HD.md` (original pieces for measurement).

## Folders and files

| Path | What it is |
|---|---|
| `web/` | Online tool (Vite + TypeScript + three.js + meshoptimizer) |
| `gerar.py` | Blender generator (frozen reference). `piloto_externos.py` uses its functions |
| `validar.py`, `emenda.py`, `facetas.py`, `calibrar.py`, `medir_stl.py` | STL measurement |
| `campo_textura.py` (Blender) and `web/campo.ts` | A texture field over a large area, to compare Blender and web |
| `render_stl.py`, `folha.py` | Comparison images (the render uses Blender) |
| `spec_encaixe.json` | Foot and grid measurements taken from the original pieces. **Testing only:** the product will have its own joint |
| `piloto_externos.py` | External props pilot (Blender, outside the web) |
| `indice_*.csv`, `hd_listagem.tsv`, `gerar_indice.py`, `AMOSTRA_HD_MANIFESTO.csv` | Index of the original HD pieces |
| `catalogo/` | Pages from the original catalogs (visual reference) |
| `saida/` | Generated output (not in git) |
