# Plano — Revisão da interface (Fase 0): Sistema, Grids, Blocos

## Contexto
O usuário revisou o site (https://augustobosa.github.io/rpg-block-builder/) e pediu 24 ajustes nas 3 abas.
Código pequeno (~700 linhas em `web/`): `src/main.ts` (UI + cena three.js), `src/sistema.ts` (geometria do encaixe, `manifold-3d`),
`src/bloco.ts` (piso Pedra, tabelas `PISO`/`GUIAS`), `src/pedra.ts` (tabela `PEDRA`), `index.html` (HTML + CSS), `cli.ts` (gera STL no terminal).
Resultado esperado: interface organizada em seções recolhíveis, abas reordenadas (1 Sistema, **2 Grids, 3 Blocos**), vista 3D com gizmo, corte controlável,
elevação, modos de visualização, cotas na 3D e esquemas 2D com cotas ao lado direito. **A geometria gerada (STL) não pode mudar.**

Decisões do usuário nesta rodada: o pedido "3D do Grid reativa às dimensões do pino" foi **retirado** (já é reativo). Modos de vista = **Sólido + Inclinação + Normais + Arestas + Matcap**.
Fora de escopo: salvar estado, Web Worker, paredes, texturas novas, commit/push.

## Regras para todos os agentes (copiar em cada prompt)
- Repo: `C:\Users\augus\Desktop\augusto\rpg_block_builder`. Trabalhar só em `web/` (e docs no fim). Branch `main`.
- **Não** fazer commit, push, `git add`, nem tocar no `master`. **Nunca** `git add -f`. Não editar `catalogo/`, `amostra_hd/`, `spec_encaixe.json`.
- Mudanças cirúrgicas (ponytail + karpathy): só o que a tarefa pede, sem abstração nova, sem biblioteca nova (three.js 0.187 já tem tudo). Código em TS, comentários em pt-BR.
- Não mudar números das tabelas `SISTEMA`, `PISO`, `GUIAS`, `PEDRA` nem a lógica de geometria em `sistema.ts`/`bloco.ts`, salvo o que está dito.
- Terminar cada tarefa com: `cd web && npm run build` (roda `tsc --noEmit`) sem erro. Relatório final de **no máximo 10 linhas**: arquivos alterados, o que foi feito, resultado do build.
- Scripts com `tsx` rodam de dentro de `web/`. Sistema de arquivos: Windows (Git Bash).
- Se uma instrução for ambígua ou impossível, parar e reportar a dúvida (não inventar).

## Modelo, memória e execução
- Subagentes: `model: "haiku"` (Haiku 5.5). Iniciar o Claude com autocompact em 40%: `$env:CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40` (PowerShell) antes de `claude`.
- **Orquestrador** (a sessão principal, não-Haiku) lê o diff após cada fase, roda a verificação visual (Haiku não é confiável em estética) e só então libera a próxima fase.
- Fases são **sequenciais**, porque quase todas editam `main.ts` e `index.html`. Exceção: Fase 4 (dois agentes em arquivos novos distintos).
- Cada agente recebe só: regras acima + a sua tarefa + a lista de arquivos a ler. Não passar o plano inteiro.

---

## Fase 0 — Base e diagnóstico da falha visual (1 agente Haiku + orquestrador)
**Tarefa 0.1 (agente):** `cd web && npm ci` se faltar `node_modules`; rodar `npm run build` e anotar se passa. Rodar `npx tsx cli.ts <pasta temporária do scratchpad> --peca grid` e `--peca piso` e anotar "fechada" e nº de triângulos do piso 1×1 (esperado **216 mil**, p50 1,509 / p95 1,895 é do campo da Pedra, só informativo). Esses valores são a **linha de base** que a Fase 5 compara.
**Tarefa 0.2 (orquestrador):** `preview_start` nome `web` (`.claude/launch.json`). Reproduzir a falha da imagem do usuário (aba Sistema, valores padrão, zoom no encaixe cortado em y=0): uma linha azul fina em cima e faixas "escada" na lateral direita do grid.
**Hipótese:** z-fighting. Com `folga_fundo`, o bloco é posto em `z = fundo + folga_fundo` e o ombro dele (z = `assento`) cai **exatamente** na altura do topo do grid (`alturaGrid`), então a face de baixo do corpo e o topo do grid são coplanares. Código: `main.ts` função `mostra(0, …, fundo(o)+o.folga_fundo)` e `sistema.ts` `corpo()`/`grid()`.
**Correção (só na vista, nunca no STL):** na prévia do passo 1, elevar o bloco `+0,01 mm` OU aplicar `polygonOffset` (factor 1, units 1) no material do grid. Preferir `polygonOffset` no grid (não mexe em medida nenhuma). Se a falha persistir, trocar para o modo Arestas (Fase 2) e inspecionar se vem da casca convexa de `pilha()` (degraus de `hull`); só então reportar ao usuário antes de mexer em `sistema.ts`.
**Aceite:** zoom na região da imagem sem faixas nem linha azul; build ok.

---

## Fase 1 — Estrutura: abas, textos, formato, seções recolhíveis (1 agente; editar `index.html`, `main.ts`, `sistema.ts`, `bloco.ts`, `pedra.ts`, `cli.ts`)

### 1.A Ordem das abas
Nova ordem: **1 · Sistema, 2 · Grids, 3 · Blocos**.
- `index.html`: botões `ir1/ir2/ir3` com rótulos nessa ordem; `<section id="passo2">` passa a ser **Grids** (select `peca3` + `op-guias`) e `<section id="passo3">` passa a ser **Blocos** (`gerais` + `pedra`). Renomear `peca3` → `peca2` (ou manter o id, só trocar o conteúdo; preferir manter ids de controle e trocar apenas a posição do HTML + números).
- `main.ts`: `peca = () => passo === 3 ? 'piso' : sel.value`; em `previa()` o ramo `else` usa `peca()`; `vaiPara` já alterna `passoN` por número; `$('saida').hidden = n === 1` continua. Corte padrão só no passo 1 (ver Fase 2).

### 1.B Remover "retângulo"; quadrado passa a ter largura e comprimento
- `sistema.ts`: `FORMATOS = { quadrado: 'Quadrado', hexagono: 'Hexágono' }`. Em `celula()`: para `quadrado`, `C = s.comprimento` (hoje é `L`); o ramo `retangulo` some. Padrão `comprimento` continua 35.
- `main.ts` `montaSistema()`: hexágono mostra só "Entre lados (mm)" (`largura`); quadrado mostra "Largura X (mm)" e "Comprimento Y (mm)" (as duas chaves de `SISTEMA`). Remover a referência a `'retangulo'`.
- `cli.ts`: ajustar a linha de comentário/uso (`quadrado|hexagono`) e qualquer ramo `retangulo` (grep). `README.md`, `USO.md`, `docs/MIGRACAO.md`: trocar menções (Fase 5 cuida de docs).
- **Checar:** `grep -rn "retangulo" web/src web/cli.ts` deve voltar vazio. `bloco.ts` `rede()` já usa `c.a[0]`/`c.a[1]`, então comprimento ≠ largura funciona; confirmar rodando `cli.ts --peca piso --linhas 2 --colunas 3 --largura 30 --comprimento 50` → "fechada: sim".

### 1.C Remover textos
Apagar do `index.html`: os três `<p class="nota">` (Sistema, Blocos, Grids). Apagar `<div class="nota" id="resumo">` e a linha que preenche `#resumo` em `previa()` (e os imports `assento` se ficarem sem uso — só remover se o `tsc` reclamar). **Manter** `#aviso` (avisos de medida), `#estado` (resultado do download) e o CSS `.nota` (usado por `#estado`).

### 1.D Seções recolhíveis (`<details>`/`<summary>`, já estilizados em `index.html`)
Novo helper em `main.ts`: `secao(pai, titulo, aberta = false): HTMLElement` cria `<details>` (+`open` se `aberta`) com `<summary>` e devolve o `<div>` interno. Nada é salvo (sem localStorage).
`grupo()` passa a receber um mapa `chave → seção` para despejar cada controle na seção certa. Os mapas ficam ao lado das tabelas (`SECAO` em `sistema.ts`, `SECAO_PISO`/`SECAO_GUIAS` em `bloco.ts`, `SECAO_PEDRA` em `pedra.ts`), **sem** mexer nas tuplas das tabelas.

**Aba Sistema** (ordem; abertas: "Célula" e "Pé do bloco"):
1. *Célula* — formato (select), largura, comprimento (ou "entre lados").
2. *Encaixe (preset)* — select `encaixe` (reto/cônico/ímã).
3. *Pé do bloco* — altura_pe, recuo, chanfro, conicidade, folga.
4. *Ombro e nervura* — ombro, nervura, folga_fundo.
5. *Ímã* — ima_d, ima_h, folga_ima.
6. *Grid* — fundo.
7. *Vista 3D* — ver Fase 2 (corte, elevação, modo, cotas).

**Aba Grids:** *Peça* (select Grid/Degrau), *Dimensões* (grid_linhas, grid_colunas, altura_degrau), *Vista 3D*.
**Aba Blocos:** *Peça* (linhas, colunas, altura, posicao_x, posicao_y), *Textura Pedra* (semente, desgaste, tamanho_pedra, profundidade, teto, junta_piso), *Borda* (quina_largura, quina_gasto, lateral_largura, lateral_gasto, ruido_borda), *Avançado — Forma das pedras* (distorcao, vao, vao_desgaste, bisel, domo), *Avançado — Superfície* (cascalho, inclinacao, altura_var, grao), *Avançado — Desgaste* (rachadas, racha_fundo, lasca_largura, lasca_fundo), *Vista 3D*. O `<details>` "Pedra avançada" atual é substituído por essas 3 seções avançadas, marcadas com o rótulo "Avançado —".
`resolucao` continua escondida (`pular`).

**Aceite 1:** `npm run build` ok; abas na ordem nova; nenhum texto removido reaparece; "Retângulo" some do select; quadrado 30 × 50 gera prévia correta; seções abrem/fecham.

---

## Fase 2 — Vista 3D: gizmo, corte, elevação, modos (1 agente; novo `web/src/vista.ts` + edição de `main.ts`/`index.html`)
Mover para `vista.ts` o que for cena (renderer, câmera, luzes, `pecas`, `mostra`, `enquadra`) e exportar uma API pequena: `mostra(i, malha, z)`, `enquadra(passo)`, `config` (estado) e `setModo()`. `main.ts` só orquestra. **Não mudar** `sistema.ts`/`bloco.ts`.

### 2.A Gizmo de orientação
Usar `ViewHelper` de `three/examples/jsm/helpers/ViewHelper.js` (já está em three 0.187): instanciar com a câmera e o `render.domElement`, `placement: 'bottom-right'`, `size: 96`, rótulos X Y Z; no loop: `render.autoClear = false; render.clear(); render.render(cena, cam); viewHelper.render(render)`; clique nos eixos anima a câmera (`viewHelper.handleClick(e)` + `update(delta)` com `THREE.Clock`). O app usa **z para cima** (`cam.up.set(0,0,1)`): se o ViewHelper assumir y para cima, usar fallback próprio: mini-cena com `AxesHelper` rotacionada pelo inverso da `cam.quaternion`, desenhada num `viewport` de 96 px no canto. Aceite: gizmo acompanha a rotação da câmera nos 3 passos e no celular.

### 2.B Corte controlável (por passo)
Estado `corte = { ativo, eixo: 'x'|'y'|'z', pos (mm), inverte }`, **um por passo**. Padrões: passo 1 → ativo, eixo y, pos 0 (igual hoje); passos 2 e 3 → desativado.
Seção "Vista 3D" → subseção *Corte*: checkbox "Cortar", select eixo (X | Y | Z), slider+número "Posição (mm)" (limites ± metade da maior dimensão da peça, passo 0,5), checkbox "Inverter lado". Implementação: `THREE.Plane(normal do eixo, -pos)`; inverter = negar normal e constante; aplicar em `material.clippingPlanes` dos dois meshes (face de fora e BackSide) das duas peças. Reutilizar a lógica de `mostra()` (`clippingPlanes = ativo ? [plano] : []`). Não reconstruir malha ao mexer no corte (só atualizar o plano); recortar a câmera não pode resetar (`enquadrar` só muda ao trocar passo/peça).

### 2.C Elevação do bloco em relação ao grid (só passo 1)
Slider+número "Elevação do bloco (mm)", 0 a 30, passo 0,5, padrão 0 (assentado). Somar ao `z` do bloco em `mostra(0, …, fundo(o)+o.folga_fundo + elevacao)`. Sem reconstruir malha (só `position.z`). Texto do rótulo: "Elevação (0 = assentado)".

### 2.D Modos de visualização (select "Vista")
Modos: `solido` (padrão atual), `inclinacao`, `normais`, `arestas`, `matcap`. Aplicar à face de fora de cada peça; a face de dentro (BackSide chapada, serve de "tampa" do corte) fica igual em todos.
- **Sólido:** material atual (`MeshStandardMaterial`).
- **Inclinação:** `MeshBasicMaterial({ vertexColors: true })` sobre geometria **não indexada** (`toNonIndexed()`), cor por face a partir do ângulo da normal com +Z (a normal da face vem do produto vetorial): 0° (topo plano) cinza-claro → 0–45° verde→amarelo → 45–90° laranja (parede) → normal para baixo (overhang, n.z < 0) vermelho. Mostrar legenda pequena (HTML sobre a vista) com essas 4 faixas.
- **Normais:** vertex colors = `(n·0,5+0,5)` por face (mesma geometria não indexada; direção fixa no mundo).
- **Arestas:** sólido + `LineSegments(EdgesGeometry(geo, 20))` com `LineBasicMaterial` escura e os mesmos `clippingPlanes`. Se a malha tiver > 300 mil triângulos, não gerar arestas e mostrar aviso "malha grande demais para arestas".
- **Matcap:** `MeshMatcapMaterial` com `CanvasTexture` 256 px gerada por código (gradiente radial: luz clara no alto-esquerda, argila bege, sombra no canto) — sem arquivo de imagem.
Todos aceitam `clippingPlanes`. Regenerar a geometria derivada (não indexada/arestas) só quando a malha mudar ou o modo mudar; descartar (`dispose`) a antiga. Peso: o piso na prévia usa `PREVIA = .5` mm; medir e anotar o tempo de trocar de modo.
**Aceite 2:** gizmo ok; corte nos 3 eixos + inverter + slider; elevação separa o bloco do grid; 5 modos funcionam com o corte ligado; sem erro no console; o piso 2×3 não trava mais de 1 s ao trocar de modo (ou anotar o tempo).

---

## Fase 3 — Dados das cotas (1 agente; `sistema.ts`, só adicionar uma função pura)
Criar em `sistema.ts` a função exportada `medidas(s: Sistema)` que **devolve**, sem criar geometria: `{ cel: Celula, perfilPe: [z, recuo][], perfilFuro: [z, recuo][], alturaGrid, assento, hPe, nervuraMeia, fundoReal }` e **refatorar `corpo()` e `furo()` para lerem as mesmas listas** (`perfilPe`, `perfilFuro`). A saída de `corpo()`/`furo()` deve continuar **idêntica**: conferir com a linha de base da Fase 0 (mesmo nº de triângulos, "fechada: sim") e `Manifold` volume igual (`m.volume()` antes/depois num script temporário no scratchpad). Essa função é a **única fonte** de números para cotas 3D e esquemas 2D.

---

## Fase 4 — Cotas 3D e esquemas 2D (2 agentes Haiku em paralelo, arquivos novos disjuntos)

### 4.A Agente A — `web/src/cotas.ts` (cotas no modelo 3D)
Função `cotas(passo, o, peca): THREE.Group` com linhas finas (`LineBasicMaterial`, cor âmbar, `depthTest:false`) + setas/ticks nas pontas + rótulos HTML via `CSS2DRenderer` (`three/examples/jsm/renderers/CSS2DRenderer.js`; elemento `div` com "12,5 mm"; `pointer-events:none`). Posicionar **fora** da peça (afastar ~6 mm) e não afetadas pelo plano de corte (sem `clippingPlanes`).
- Passo 1: largura (X), comprimento (Y) ou "entre lados" (hexágono); alturas ao longo de Z: altura do pé, ombro, altura total do grid, folga embaixo; recuo da borda (planta); chanfro e conicidade como texto no rótulo do pé.
- Passo 2: dimensões externas do grid N×M (X, Y) e altura do grid; degrau: altura do degrau.
- Passo 3: dimensões do bloco N×M e altura total.
Toggle "Mostrar cotas" (checkbox, em *Vista 3D*, padrão desligado). Ao mudar medidas, reconstruir o grupo (barato, só linhas). Entregar também a função `limpaCotas()`. O agente **não** edita `main.ts`: entrega as funções exportadas + um bloco de instrução de integração de 5 linhas no relatório.

### 4.B Agente B — `web/src/esquema.ts` (desenhos 2D ao lado direito)
SVG em string, sem biblioteca. Funções `esquemaSistema(o): string` e `esquemaGrid(o): string`. Cada uma gera **4 vistas** num grid 2×2 de `<svg viewBox>` (fundo escuro, traço claro, cotas em âmbar, texto 11 px, setas nas cotas, valores com 1 casa em mm):
1. **Planta (vista superior)**: contorno da célula (quadrado/hexágono via `celula()`/`contorno()`), contorno do pé (recuo+folga), círculo do ímã se houver; cotas largura/comprimento (ou entre lados) e recuo.
2. **Frontal (corte em y = 0)**: perfil de bloco + grid seção lado a lado/sobrepostos (perfis de `medidas()`), cotas de altura do pé, ombro, altura do grid, folga embaixo, chanfro, conicidade, nervura.
3. **Lateral (corte em x = 0)**: mesmo princípio, no outro eixo.
4. **Isométrica**: projeção isométrica (`x' = (x−y)·cos30°`, `y' = (x+y)·sin30° − z`) dos anéis do perfil (camadas do `perfilPe`/`perfilFuro`) ligados por linhas verticais, com o grid N×M quando `esquemaGrid`. Sem remoção de linha oculta (aramado).
`esquemaSistema` mostra bloco sobre grid 1×1; `esquemaGrid` mostra o grid `grid_linhas × grid_colunas` (ou degrau com `altura_degrau`). Recebe só `Opcoes`. O agente não edita `main.ts`/`index.html`: entrega as funções e 5 linhas de integração.

### 4.C Integração (1 agente, depois dos dois; edita `index.html`, `main.ts`)
- Layout em 3 colunas no desktop: `aside` controles (300 px) | `main` 3D (flex) | **`aside#dir` esquemas (340 px, rolagem própria)**. `#dir` só aparece nos passos 1 e 2 (`hidden` no passo 3). Atualiza dentro de `previa()` (mesmo debounce de 60 ms): `$('dir').innerHTML = passo === 1 ? esquemaSistema(o) : esquemaGrid(o)`.
- Largura < 1100 px: `#dir` vai **abaixo** da vista 3D como `<details>` "Esquemas" fechado. Celular (≤ 700 px): mantém prévia fixa em cima; `#dir` dentro da área de rolagem dos controles, recolhido.
- `cotas.ts`: instanciar `CSS2DRenderer` sobreposto ao canvas (mesmo tamanho, `position:absolute; top:0; pointer-events:none`); atualizar o `resize`. Checkbox "Mostrar cotas" em *Vista 3D* chama `cotas()`/`limpaCotas()`.
**Aceite 4:** esquemas mudam ao mexer nos sliders (ex.: recuo, altura_pe, ímã); cotas 3D aparecem/somem; números dos esquemas = números das cotas 3D = valores dos controles.

---

## Fase 5 — Verificação, docs e fechamento (orquestrador + 1 agente para docs)
**Orquestrador no navegador** (`preview_start web`; `resize_window` desktop 1280×800 e mobile 375×812; **voltar a `desktop` no fim**):
1. Passo 1, 2, 3: screenshot de cada aba; `read_console_messages` sem erro.
2. Passo 1: corte nos 3 eixos, inverter, elevação 0 → 15 mm, os 5 modos, cotas ligadas, esquemas atualizando; zoom na região da falha original da imagem.
3. Hexágono e quadrado 30 × 50: prévia e esquemas coerentes; "Retângulo" ausente.
4. Celular: abas funcionam, seções abrem, esquemas recolhidos, gizmo visível.
**Números** (Bash, de `web/`): `npm run build` ok; `tsx cli.ts` das combinações (grid, degrau, piso × quadrado, hexágono, + quadrado 30×50, piso 2×3) todas "fechada: sim"; piso 1×1 quadrado = **mesmo nº de triângulos da Fase 0**.
**Agente de docs (Haiku):** atualizar `RETOMAR.md` (abas na nova ordem, retângulo removido, gizmo/corte/elevação/modos/cotas/esquemas, o que ficou pendente), `USO.md` e `README.md` (menções a "retângulo" e à ordem das abas), `docs/MIGRACAO.md` (§ interface), e apagar do RETOMAR o item "Retângulo" das decisões. Copiar este plano para `docs/PLANO_UI.md`. Atualizar memória do projeto (`estado-projeto.md`).
**Sem commit.** O orquestrador mostra o `git status`/`git diff --stat` e pergunta ao usuário se comita e publica (regra do repo: verificar no navegador antes de publicar; `graphify` roda no pre-commit).

## Riscos e o que fazer
- **Haiku errar geometria na Fase 3:** compensar com teste de volume/triângulos antes×depois; se divergir, reverter `git checkout -- web/src/sistema.ts` e fazer a refatoração menor (só exportar `medidas()` sem mexer em `corpo`/`furo`).
- **ViewHelper com eixo z para cima:** fallback de mini-cena descrito na 2.A.
- **Peso dos modos em malha grande:** Arestas com limite de 300 mil triângulos; modos de cor usam `toNonIndexed()` só no piso da prévia (0,5 mm).
- **Conflito de edição:** fases sequenciais; Fase 4 paralela só em arquivos novos.
- **Dúvida de design (esquemas/cotas):** o agente reporta e o orquestrador decide; se for subjetivo, perguntar ao usuário.

## Arquivos críticos
`web/index.html`, `web/src/main.ts`, `web/src/sistema.ts`, `web/src/bloco.ts`, `web/src/pedra.ts`, `web/cli.ts`; novos: `web/src/vista.ts`, `web/src/cotas.ts`, `web/src/esquema.ts`.
Reutilizar: `celula()`, `contorno()`, `centros()`, `alturaGrid()`, `assento()`, `fundo()`, `malha()` (`sistema.ts`); tabelas `SISTEMA/PISO/GUIAS/PEDRA`; `controle()`/`grupo()` (`main.ts`); `.claude/launch.json` (servidor `web`, porta 5173).
