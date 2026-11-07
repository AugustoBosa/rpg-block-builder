# Objetos 3D externos gratuitos para decorar os blocos

Data: 2026-11-02 (pesquisa e piloto). **Decisão de 2026-11-05:** os props prontos importados substituem baú, prop, estátua e Espalhar. A integração com a ferramenta web é uma etapa futura. O preparo dos arquivos (Remesh no Blender, `piloto_externos.py`) pode continuar fora da web.

## 1. Fontes recomendadas (ordem de prioridade)

| # | Fonte | Licença | Formato | O que tem | Pronto p/ imprimir? |
|---|---|---|---|---|---|
| 1 | [Quaternius — Fantasy Props MegaKit](https://quaternius.com/packs/fantasypropsmegakit.html) | CC0 | FBX, OBJ, glTF | 200+ props medievais: mobília, baús, barris, livros, poções, armas, ferramentas, barracas de feira. Grátis = 60–70 % do pack | Não: low poly de jogo; precisa fechar/engrossar |
| 2 | [KayKit Dungeon Remastered](https://kaylousberg.itch.io/kaykit-dungeon-remastered) + [Furniture Bits](https://kaylousberg.itch.io/furniture-bits) | CC0 | FBX, OBJ, glTF | 200+ itens de masmorra (tochas, baús, barris, mesas, colunas, armadilhas) + 50+ móveis | Não: idem |
| 3 | [Kenney Furniture Kit](https://opengameart.org/content/furniture-kit) (e outros kits Kenney: Graveyard, Pirate, Castle) | CC0 | OBJ, FBX, glTF | Mesas, cadeiras, camas, estantes; lápides/cruzes; canhões/barris | Não: idem, muito simples |
| 4 | [Scan the World (MyMiniFactory)](https://www.myminifactory.com/) | Grátis; licença varia por peça (ler cada uma) | STL | 20.000+ esculturas e estátuas reais escaneadas (gregas, romanas, egípcias, góticas) | **Sim**: STL fechado; só reduzir escala |
| 5 | [OpenForge](https://printables.com/model/63538-openforge-20-dungeon-stone-separate-wall-bases-wit) (Printables/Thingiverse) | CC-BY-SA (antigas) / CC-BY-SA-NC (novas) | STL | Mobília e scatter de masmorra feitos para impressão (escala 25–28 mm, a mesma nossa) | **Sim** |
| 6 | [Poly Haven](https://polyhaven.com) | CC0 | blend, glTF, FBX | Poucos modelos, realistas (vasos, cadeiras, baús, estátuas) | Parcial: malhas densas, boas para remesh |
| 7 | [OpenGameArt — Modular Dungeon 2](https://opengameart.org/node/82359), [Sketchfab low-poly dungeon (CC0)](https://sketchfab.com/3d-models/free-modular-low-poly-dungeon-pack-31f2e88017574702bb2c1c1e286dc747) | CC0 | OBJ/FBX | Tocha, braseiro, cela, caixote, barril, armadilhas | Não |

Extra (só uso pessoal, não CC): [Dungeon Props – Village Essentials (MakerWorld)](https://makerworld.com/models/1724262): poço, barril, caixote, baú com moedas; já em STL.

**Regra prática:** CC0 (1, 2, 3, 6, 7) = livre para tudo, até remixar e distribuir os blocos. STL de impressão (4, 5) = melhor qualidade, mas ler a licença de cada peça.

## 2. Objeto por tema (13 temas do `gerar.py`)

| Tema | Objetos sugeridos | Fonte principal |
|---|---|---|
| dungeon | tocha de parede, braseiro, grade/cela, alavanca, armadilha | KayKit Dungeon, Modular Dungeon 2 |
| castelo | trono, estandarte, armadura em pé, mesa longa, lareira | Quaternius, KayKit |
| ruina | coluna quebrada, estátua sem braço, escombros | Scan the World (fragmentos clássicos) |
| taverna | mesa redonda, banquinho, balcão, barril com torneira, canecas | Quaternius, Kenney Furniture |
| pantano | tronco caído, cogumelos, caldeirão de bruxa | Quaternius (Ultimate Nature/props) |
| deserto | ânfora, vaso de barro, obelisco | Scan the World (egípcio), Poly Haven |
| inundada | barco a remo, caixote boiando, ponte de tábuas | KayKit, Kenney Pirate |
| vulcao | bigorna, caldeirão, ídolo, braseiro | Quaternius, KayKit |
| caverna | acampamento (fogueira, saco de dormir), carrinho de mina | Quaternius |
| cripta | sarcófago, lápide, urna funerária, estátua de anjo | Kenney Graveyard, Scan the World |
| templo | altar, estátua de deus, pira, pedestal com orbe | Scan the World, Quaternius |
| navio | canhão, timão, mastro, rolos de corda, baú pirata | Kenney Pirate, KayKit |
| forja | bigorna, forja, prateleira de armas, barril d'água | Quaternius, KayKit |

## 3. O que muda no nosso pipeline (antes de integrar)

1. **Escala:** 7 mm por pé (`ANALISE_PROPS.md` §3). Objeto de 1 célula cabe em ~26 × 26 mm; mesa/cama em 2×1.
2. **Malha fechada:** assets de jogo têm faces abertas e planos sem espessura (folhas, correntes, panos). O `validar.py` reprova isso. Correção: modificador Remesh (voxel ~0,2 mm) + Solidify antes de exportar.
3. **Espessura mínima FDM:** peças < 0,8 mm somem (cabo de caneca, lâmina, pernas finas de cadeira). Remesh + escalar partes finas, ou descartar o objeto.
4. **Fixação:** apoiar o objeto no topo do bloco (z do piso) e unir como os nossos `OBJETOS` (fundido ou solto). Sobreposição basta, o fatiador une.
5. **Licença:** guardar a origem e a licença de cada arquivo numa coluna de manifesto.

## 4. Piloto (2026-11-02): 3/3 aprovados no `validar.py`

`blender.exe -b -P piloto_externos.py -- --saida saida/externos` (opções `--voxel 0.15 --parede 0.8`). Originais em `externos/` (fora do git).

| Peça | Fonte (licença) | Original | Objeto final (mm) | Triângulos finais | STL |
|---|---|---|---|---|---|
| Caldeirão 1×1 | Quaternius MegaKit, `Cauldron.gltf` (CC0) | 2.020 tri, low poly | 24 × 23 × 20 | 279 mil | 14 MB |
| Estátua sentada 1×1 | Smithsonian 3D, Greenough *George Washington* 1840 (CC0, SAAM) | 150 mil tri, scan | 28 × 23 × 36 | 381 mil | 19 MB |
| Altar 2×1 | Printables 281644 *Holy Alter*, owen Harriman (CC BY: citar o autor) | 3,1 mi tri, STL | 60 × 30 × 40 | 924 mil | 46 MB |

Pipeline: importa e junta as malhas → escala (maior lado da planta = alvo) → Solidify 0,8 mm para dentro → Remesh voxel 0,15 mm → limpeza (`remove_doubles` + `dissolve_degenerate`, 1e-3) → afunda 0,3 mm no topo do bloco liso → STL + JSON + PNG.

Achados:
1. **Remesh voxel fecha qualquer fonte** (low poly de jogo, scan e STL de impressão). Não precisa conserto manual.
2. **Decimate abre arestas** (3 a 6 sem par): tirado. O tamanho fica no nível das originais (340 a 680 mil tri).
3. **O Remesh deixa faces quase sem área** e o validador reprova (4 a 153 arestas sem par, variando ao acaso com o voxel). A limpeza com `dissolve_degenerate` resolveu: 0 slivers.
4. Smithsonian e Printables baixam sem login (Printables via API GraphQL `getDownloadLink`). **MyMiniFactory e Thingiverse não** (403 / Cloudflare): Scan the World e OpenForge ficam para download manual.
5. Não verificado (precisa impressão): pernas do caldeirão, velas do altar e braço/espada da estátua têm ~1 mm.
