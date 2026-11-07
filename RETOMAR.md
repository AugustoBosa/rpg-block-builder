# RETOMAR — estado do projeto (2026-11-06, master)

Projeto: **RPG Block Builder** (nome decidido em 2026-11-06; pasta renomeada pelo usuário depois disso). "Dungeon Blocks" nos documentos é sempre o produto original de referência, nunca o nosso.

Leia este arquivo primeiro. Comandos: `USO.md`. Visão: `README.md`. Inventário, decisões e plano da migração: `docs/MIGRACAO.md`.

## Onde estamos
- **A ferramenta é web.** Em 2026-11-06 o usuário aprovou o piloto do piso de Pedra em `web/` e **descontinuou o plugin do Blender**. O desenvolvimento segue só na web.
- **Piloto (passo 1 de 4, feito):** piso de Pedra, quadrado ou retângulo (20–80 mm), pé longo ou curto, folga, os 13 ajustes da Pedra, a borda, prévia ao vivo e STL final no navegador (~2 s). Em 35 × 35: `validar.py` OK, emenda 0,0000 mm, 216 mil triângulos, facetas p90 14,4°, arestas ≥ 60° 1,7 %. Campo da Pedra igual ao do Blender em 200 × 200 mm. Detalhes em `docs/MIGRACAO.md` §3.
- **Passo 1b (feito em 2026-11-06, falta a aprovação do usuário):** a interface tem 2 passos. **Passo 1 · Sistema** define o formato da célula (quadrado, retângulo, hexágono) e o encaixe próprio. **Passo 2 · Blocos** gera o piso de Pedra de N × M células (um pé por célula, laje contínua, inclusive no hexágono). **Passo 3 · Grids** (aba própria) gera grid e degrau N × M nas medidas do Sistema. A interface tem layout de celular. O encaixe tem 3 tipos de partida (pé reto + chanfro, cônico, com ímã), e todas as medidas são editáveis. O pé e o furo saem do mesmo perfil (`web/src/sistema.ts`). As booleanas usam `manifold-3d`. Nada é salvo: cada abertura começa do padrão (decisão do usuário; o formato de salvar fica para depois). Conferido: as 9 combinações de peça e formato fecham; emenda de 0,0000 mm no quadrado e no hexágono; o campo da Pedra não mudou.
- **Blender congelado:** `gerar.py` fica como referência de qualidade e de receita das 15 texturas. Não investir nele. O plugin, a extensão, o cache de grupos e a matriz de regressão foram apagados (recuperar no git: commit `05a1a97`).
- **Nada foi impresso.**

## Próximo
Plano em `docs/MIGRACAO.md` §4. Ordem decidida em 2026-11-06:
1. **Revisar o passo 1b com o usuário** (`npm --prefix web run dev`). Depois, imprimir 1 grid 1 × 1 e 1 bloco para testar o encaixe.
2. Passo 2: parede, canto e telhado, com portas e janelas, dentro do Passo 2 da interface (booleana com `manifold-3d`, já instalado). Cerca de 1 semana. Os materiais e os props também entram no Passo 2 da interface.
3. Passo 3: as outras 14 texturas. Cerca de 2–3 semanas.
4. Passo 4: conjuntos, temas, interface, Web Worker e hospedagem. Cerca de 1 semana.
5. Depois: gerador de grid próprio (semelhante ao original, furo no formato do bloco, parâmetros em `docs/MIGRACAO.md` §5) e props importados.

## Decisões do usuário (em vigor)
- Ferramenta online em three.js, sem servidor; medidas e formato configuráveis pelo usuário.
- Formatos: quadrado e retângulo prontos; hexágono entra já (2026-11-06).
- Encaixe próprio e ajustável entra já (2026-11-06); o pé medido das originais deixa de ser o padrão.
- Água: teto do relevo maior só nela.
- Baú, prop, estátua e Espalhar não vão para a web. Props prontos importados numa etapa futura (`docs/PROPS.md`). Decidido (2026-11-06): prop sobre qualquer piso, sempre fundido ao bloco. Falta decidir: licenças CC0 ou CC0 + CC BY.
- Impressão **com suportes**: overhang só informa.
- Textura Lisa pode ter relevo < 0,4 mm.
- Copyright: avisado que medidas configuráveis não bastam. Faltam encaixe próprio, nome próprio (decidido: RPG Block Builder; falta conferir INPI, USPTO e lojas de STL), revisão de Glifos e Nichos, termos de uso e advogado.

## Pendências do usuário
1. **Fase física:** imprimir 3 blocos de folga (0, −0,1, −0,2 mm) antes de qualquer impressão (`USO.md` §5).
2. Backup de `amostra_hd/`: o usuário decidiu não fazer (2026-11-06). Não sugerir de novo.
3. Aprovar as folhas do Blender (`saida/qualidade/`): perdeu o sentido com a migração, a não ser como referência visual das texturas.

## Armadilhas técnicas (web)
- **Comparar textura com o Blender numa área grande.** A janela de 16 mm do `calibrar.py` pega 2 ou 3 pedras; o sorteio domina e engana (no piloto, o p50 deu 1,07 contra 0,48 mm só por isso). Use `campo_textura.py` (Blender) contra `web/campo.ts`.
- **Lateral da laje:** toda coluna da lateral precisa encolher até o relevo do ponto. Se só a fileira de cima descer, sobra uma parede fina em volta do bloco (defeito que o Blender tem).
- **Redução com meshoptimizer** cria triângulos de área zero em áreas planas junto à borda travada. Não gerar grade fina em face plana escondida (fundo da laje) e conferir com `fechada()` depois de reduzir.
- **Emenda:** gerar os vizinhos com `--lateral_gasto 0 --quina_gasto 0`; o gasto da borda muda a borda de propósito.
- `validar.py` só conhece a célula de 35 mm.
- **GPL (decisão do usuário, 2026-11-06):** respeitar a GPL. Nunca copiar código do Blender ou de outro projeto GPL; recriar do zero o que for preciso. O ruído da web é próprio (`web/src/ruido.ts`).
- Scripts de teste com `tsx` fora de `web/`: imports por caminho absoluto do Windows falham; rodar o script de dentro de `web/`.

## Armadilhas técnicas (Blender, só para gerar referência)
- Blender 5.2: entrada do modificador GN = `m.properties.inputs[id]['value']`. O `wm.stl_export` sai vazio com GN: usar `exportar_stl`.
- Booleana na parede: triangular antes do corte; planos de corte no meio entre linhas da grade; o `exportar_stl` limpa triângulos de área zero.
- Voronoi 3D com z = semente: objetos por célula quase somem. Use Voronoi 2D (`Gr.seixos`).
- Detalhe com raio menor que ~1,3 mm vira ponta na malha de 0,5 mm.
- `render_stl.py` grava `<nome>.png`: dois STL de mesmo nome se sobrescrevem. Use pastas separadas.

## Regras do usuário
pt-BR. Modo ADHD (ação primeiro, passos numerados). `ponytail` e `karpathy-guidelines` em código. Nada de Artifacts sem pedido. STL do HD só como referência de medida, nunca como malha de saída. Commit só quando pedido.
