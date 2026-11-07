# Como usar

Todas as medidas estão em mm. Os comandos rodam na raiz do projeto, salvo indicação.

## 1. Ferramenta web (navegador)

Instalar (uma vez): `npm --prefix web install`.

1. Rode `npm --prefix web run dev`.
2. Abra `http://localhost:5173`.
3. Ajuste os sliders. A prévia usa malha de 0,5 mm e muda na hora.
4. Clique **Baixar STL (malha final)**. O STL sai com malha de 0,125 mm, suavizada e reduzida. Leva cerca de 2 s, e a tela trava nesse tempo.

Versão para hospedar: `npm --prefix web run build` grava o site estático em `web/dist/`.

### Ajustes do piloto (piso de Pedra)
| Grupo | Ajustes |
|---|---|
| Bloco | largura e comprimento (20–80 mm), pé longo ou curto, folga do pé |
| Superfície | semente, desgaste, tamanho da pedra, profundidade, posição X/Y no mapa (emenda com o vizinho) |
| Borda | quina (largura e gasto), lateral (largura e gasto), ruído da borda |
| Relevo | teto do relevo, ganho da junta |
| Pedra avançada | os 13 ajustes internos da Pedra (vão, bisel, cascalho, rachaduras, lascas, grão...) |

## 2. Linha de comando (mesmo código da web)

```
cd web
npx tsx cli.ts <pasta> [--opção valor ...]
```
Grava o STL e diz se a malha fecha. `--peca piso|grid|degrau` (padrão: piso), `--formato quadrado|retangulo|hexagono`. As outras opções são as mesmas da web: sistema (`--largura 60`, `--recuo 4`, `--ima_d 6`...), piso (`--semente 3`, `--posicao_x 1`...), grid e degrau (`--linhas 2 --colunas 3 --altura_degrau 30`). Ajustes da Pedra: `--pedra_<nome>` (por exemplo, `--pedra_vao 0.8`).

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
