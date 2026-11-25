# Como usar

Todas as medidas estão em mm. Os comandos rodam na raiz do projeto, salvo indicação.

**Atenção:** os scripts Python da raiz (`gerar.py`, `validar.py`, `emenda.py`, `facetas.py`, `calibrar.py`, `medir_stl.py`, `campo_textura.py`, `piloto_externos.py` etc.) só rodam na cópia local do autor. Eles dependem de `spec_encaixe.json` e dos dados do produto original, que ficam fora do repositório público (`.gitignore`). A ferramenta web e a linha de comando (`web/cli.ts`) funcionam sem eles.

## 1. Ferramenta web (navegador)

Instalar (uma vez): `npm --prefix web install`.

1. Rode `npm --prefix web run dev`.
2. Abra `http://localhost:5173`.
3. Ajuste os controles. A prévia usa malha mais grossa e muda na hora (a parede e o telhado saem lisos na prévia; o STL sai texturizado).
4. Clique **Baixar STL**. O STL sai com malha de 0,125 mm, suavizada e reduzida. É gerado num Web Worker (a tela não trava), com botão Cancelar. Piso 1×1 leva cerca de 1 a 2 s; 2×3 com paredes e telhado, cerca de 15 s. O telhado removível tem botão próprio (**Baixar telhado**), e o grid tem **Baixar clip**.
5. Na exportação, fragmentos soltos menores que 5 mm³ são descartados (aparece um aviso).

Versão para hospedar: `npm --prefix web run build` grava o site estático em `web/dist/`. Cada push no `main` publica no GitHub Pages.

Nada é salvo: cada abertura começa do padrão.

### Escalas (Combate, Cidade, Reino)
O Sistema (célula, pé, grid) é o mesmo nas três; muda o que a célula representa e o que se põe nela.
- **Combate:** salas, ruínas, florestas (o que já existia).
- **Cidade:** casas, torres, árvores e bosques como miniaturas sobre a laje; muralha = parede com **Ameias**; portão = porta.
- **Reino:** relevo (colina, montanha, vulcão) que sobe no meio da peça e volta ao nível na borda (emenda com o vizinho plano); marcadores de cidade e castelo; água = textura Água. No mapa, cada hex é uma peça solta: o mestre põe na mesa quando os jogadores chegam lá.
- **Gerador (aba Blocos):** seletor **Escala** no topo; Cidade abre a seção **Construções** (+ casa, torre...: posição, giro, tamanho); Reino abre também **Terreno** (relevo e altura). CLI: `--relevo_tipo montanha --relevo_altura 25`.
- **Editor de mapa:** a escala é escolhida ao criar o mapa (fixa depois). Ferramenta **Objeto** (tecla O) + lista do objeto: clique põe ou tira, arrasto põe.

### Editor de mapa (`/mapa.html`, link na página principal)
1. **Novo mapa** (quadrado ou hexágono, largura da célula, escala) ou **Novo a partir de modelo…** (Masmorra, Taverna 2 andares, Caverna hex, Cidade murada, Reino).
2. Desenhe com as ferramentas (teclas): Piso P, Apagar E, Parede W, Porta D, Janela J, Arco A, Coluna C, Rampa M, Escada S, Sala T, Corte X; R gira o sentido da rampa/escada; Ctrl+Z / Ctrl+Y. Arrastar com o botão do meio (ou Espaço + arrastar) move a vista; a roda dá zoom.
3. **Níveis:** "+ nível" cria um andar; "Base (degraus)" sobe o nível 15,5 mm por degrau. **Salas:** cada sala tem tema e tamanho máximo da peça (linhas × colunas); a ferramenta Corte força um corte entre duas células. O tracejado azul mostra as peças.
4. **2D / 3D:** a 3D mostra caixas na hora e troca pela peça real (1 mm) quando cada peça única fica pronta; "Só caixas (L0)" para máquinas fracas.
5. **Exportar tileset (ZIP):** uma STL por peça única + grids + degraus, `manifesto.csv` (quantidades), `montagem_<nível>.svg` (planta com o id de cada peça) e `mapa.json`. A estimativa aparece antes (um mapa médio passa de 500 MB e ~30 min); "Baixar uma peça…" baixa um STL só.
6. **Salvar / Abrir:** arquivo `.json` do mapa.

### Abas e ajustes
| Aba | O que ajusta |
|---|---|
| 1 · Sistema | formato (quadrado ou hexágono, 15–100 mm), encaixe (reto + chanfro, cônico ou ímã), altura do pé, recuo, chanfro, conicidade, ombro, nervura, folgas, ímã, fundo, chanfro do furo (largura e ângulo 30–75°) |
| 2 · Grids | grid e degrau N × M; travas (clip, macho/fêmea), ímãs na borda, cruzamento e meio (1–4 por lado; o que não cabe é reduzido com aviso), alívio sob o fundo |
| 3 · Blocos | linhas × colunas (1–6), tema, **textura do piso e da parede** (15: Pedra, Lisa, Lajota, Tijolo, Terra, Areia, Rachado, Tábuas, Caverna, Casco, Metal, Água, Lava, Nichos, Glifos), semente, desgaste, tamanho da pedra, posição X/Y no mapa (emenda com o vizinho), borda, relevo, rampa; seções **Paredes** (portas, janelas, canto, pilar) e **Telhado** (forma, modo, ângulo, beiral, mureta, ameias, casca, saia) |
| Avançado | ajustes internos de cada textura (a Pedra tem 13), mostrados só para a textura escolhida |

Vista 3D: corte por eixo, elevação do bloco, modos (Sólido, Inclinação, Normais, Arestas, Matcap), cotas e esquemas 2D. A casca do telhado é em mm (0 = maciço).

## 2. Linha de comando (mesmo código da web)

```
cd web
npx tsx cli.ts <pasta> [--opção valor ...]
```
Grava o STL e diz se a malha fecha e quanto tempo levou. `--peca piso|grid|degrau` (padrão: piso), `--formato quadrado|hexagono` (quadrado: `--largura` e `--comprimento` independentes; hexágono: `--largura` é a medida entre lados). As outras opções são as mesmas da web: sistema (`--largura 60`, `--recuo 4`, `--ima_d 6`, `--chanfro_furo_ang 60`...), piso (`--linhas 2 --colunas 3`, `--semente 3`, `--posicao_x 1` em células...), grid e degrau (`--grid_linhas 2 --grid_colunas 3 --altura_degrau 30`, `--ima_por_lado 3`). Textura: `--textura lava` e `--textura_parede tijolo` (as 15 ids: pedra, lisa, lajota, tijolo, terra, areia, rachado, tabuas, caverna, casco, metal, agua, lava, nichos, glifos). Ajustes de uma textura: `--<textura>_<nome>` (por exemplo, `--pedra_vao 0.8`). A CLI gera só o piso, o grid e o degrau; paredes e telhado são pela web e pelos checks.

### Checks (rodar de dentro de `web/`)
| Comando | O que confere | Tempo |
|---|---|---|
| `npx tsc --noEmit` | tipos | segundos |
| `npx tsx check_temas.ts` | os 13 temas aplicam as texturas certas | segundos |
| `npx tsx check_paredes.ts [D2 D15 ...]` | paredes, aberturas, rampa, canto, pilar, telhado, grid, travas, exportação; `D2` = 5 hashes de referência (`ref_hashes.json`) | completo ~8 min |
| `npx tsx check_texturas.ts` | as 15 texturas: malha fecha, emenda 0,0000 mm, média de relevo, parede unida | ~8 min |
| `npx tsx check_emenda.ts` | emenda entre vizinhos (quadrado e hexágono, 1×1, 2×3, 3×2; Pedra e Tábuas) | ~3,5 min |
| `npx tsx check_mapa.ts` | editor de mapa: modelo, salvar/abrir, divisão em peças, dono de parede, dedup, grids e degraus, malha fechada de peças do mapa | ~3 min |
| `npx tsx check_zip.ts` | ZIP da exportação do mapa (CRC32 e `unzip -t`) | segundos |
| `npx tsx check_escalas.ts` | escalas Cidade e Reino: miniaturas e relevos fecham (quadrado e hex), relevo não mexe na borda, muralha com ameias, mapa (escala, relevo, objetos, rotação) | ~30 s |

No GitHub, `pages.yml` roda `check_temas` + `check_paredes D2` antes de publicar (~1 min); `checks.yml` roda a bateria completa (~17 min) e não segura o deploy.

## 3. Medir um STL

| Comando | O que confere | Meta |
|---|---|---|
| `python validar.py a.stl [...]` | Malha fechada, pé, planta, relevo e sulco fino | OK |
| `python emenda.py a.stl b.stl` | Degrau entre vizinhos (gere com `--posicao_x 0` e `1`, `--lateral_gasto 0 --quina_gasto 0`) | 0,000 mm |
| `python facetas.py a.stl [...]` | O quanto a malha aparece | p90 17–23° (originais) |
| `python calibrar.py piso a.stl [...]` | Fundura do relevo (p50, p95) e comprimento de onda, na janela central de 16 mm | Só para ordem de grandeza: a janela pega 2 ou 3 pedras |
| `blender.exe -b -P campo_textura.py -- <k>` contra `cd web && npx tsx campo.ts` | Campo da textura em 200 × 200 mm, Blender contra web | p50 e p95 iguais |

Atenção: o `validar.py` só conhece a célula de 35 mm e o pé das originais. Com o encaixe próprio, ele reprova o pé mesmo com a malha certa. Para conferir se a malha fecha, use a saída do `cli.ts` ("fechada: sim").

## 4. Comparar com o Blender (referência)

O Blender fica em `C:\Users\augus\Blender\blender-5.2.3-windows-x64\blender.exe` (abaixo, `blender.exe`).

```
blender.exe -b -P gerar.py -- --peca piso --saida saida/ref                 # STL de referência (cerca de 1 min)
blender.exe -b -P render_stl.py -- saida/comp a.stl b.stl [--longe]         # close (ou peça inteira) de cada STL
python folha.py saida/pasta                                                 # folha.png com as miniaturas
```
Opções do `gerar.py`: `--peca liso|piso|parede|canto|telhado`, `--pe`, `--colunas`, `--linhas`, `--semente`, `--tema`, `--textura_piso K`, `--textura_parede K`, `--ab1_*` (portas e janelas), `--<textura>_<ajuste>`. A lista completa (padrão, mínimo, máximo) está em `PARAMS` e `TEX_KNOBS` no `gerar.py`. O inventário está em `docs/MIGRACAO.md`.

## 5. Antes de imprimir

Imprima 3 blocos de teste de folga (0, −0,1 e −0,2 mm) e grave a folga que encaixa. Hoje só o `gerar.py` faz o bloco de teste com as marcas da folga em relevo:
```
blender.exe -b -P gerar.py -- --pe pe_longo --folga -0.1 --saida saida/folga
```
