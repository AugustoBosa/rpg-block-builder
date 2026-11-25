# Escalas Cidade e Reino (gerador + editor de mapa)

## Contexto
Hoje só existe a escala de **Combate** (1 célula ≈ 1,5 m: salas, ruínas, florestas). O usuário quer mais duas:
- **Cidade**: exploração urbana e batalha de exércitos. Casas, muralhas, torres, portões, bosques, árvores.
- **Reino**: mapa do continente que se **desbloqueia peça por peça** (o mestre põe o hex na mesa quando os jogadores chegam). Montanhas, colinas, vulcões, rios, mar, lagos, marcadores de cidade/castelo.

Decisões do usuário (2026-11-25): entra **no gerador de blocos e no editor de mapa**; **mesmo Sistema** (célula, pé, grid, encaixe) — só muda o que a célula representa; Reino = **peças soltas**; primeira rodada com **tudo** (casas+muralhas, árvores+bosques, relevo, água+marcadores).

## Ideia central
Escala = rótulo + conjunto de ferramentas/peças. A geometria nova é de 2 tipos, ambos dentro de `pisoComParedes` (`web/src/parede.ts:107-131`), então L1 do mapa, prévia e STL saem de graça:
1. **Miniaturas** (casa, torre, árvore, bosque, marcador): sólidos unidos no `ws` em cima da laje.
2. **Relevo grande** (montanha, colina, vulcão): heightfield somado ao topo em `bloco.ts:178`, igual à rampa (`rp.sobe`).
Muralha/portão de Cidade = **parede/porta já existentes** (mais alta, com ameias reaproveitadas do telhado plano). Água de Reino = **textura Água já existente** por célula.

## Fases (spec → plano → implementador + revisão por tarefa → revisão final Opus, como no fluxo do repo)

### F0 — Spec e modelo (~1 h)
- `docs/superpowers/specs/2026-11-25-escalas-design.md` com este desenho.
- `Opcoes` (`bloco.ts:55` + `padrao()`): `escala: 'combate'|'cidade'|'reino'` (padrão combate), `objetos: Objeto[]` (`{tipo, x, y, rot, tam, alt, semente}`), `relevo_tipo: ''|'colina'|'montanha'|'vulcao'`, `relevo_altura` (tupla em `PISO`). Tudo padrão = nada muda → **D2 (5 hashes) idêntico**.
- `modelo.ts`: `Mapa.escala`; `CelulaMapa.obj?` (tipo de miniatura/relevo + variação). `versao: 2`; `abrir()` aceita v1 como combate.

### F1 — Miniaturas de Cidade (~1 dia)
- Novo `web/src/miniaturas.ts`: `casa` (caixa + telhado de 2 águas), `torre` (cilindro/prisma + ameias), `arvore` (tronco + copa cone/esfera do manifold), `bosque` (N árvores sorteadas pela semente, sem sair da célula), `marcador_cidade`/`marcador_castelo` (aglomerado de casas / torre+muralha mini).
- Refatorar `geoTelhado` (`telhado.ts:14-29`) para aceitar um retângulo `(x0,x1,y0,y1)`; só as linhas 15-17 dependem de `regiao`. Exportar `caixa/sub/uni` em vez de duplicar.
- `pisoComParedes`: une `objetos` no `ws`, apoiados no topo (com relevo: z do heightfield no ponto).
- Muralha: opção `ameias` na `Parede` (reusa o código de ameias de `telhado.ts:51-55`).

### F2 — Relevo de Reino (~1 dia)
- `relevoGrande(o,x,y)` em `bloco.ts`, somado em `:178` (e coerente com `cortesParte`): colina (domo suave), montanha (pico com ruído `perlin` de `ruido.ts`), vulcão (cone com cratera). Borda da peça sempre em z do topo normal → emenda 0 com vizinhos.
- `final()`: conferir que a suavização não estraga o pico; malha fechada.
- Ponytail: montanha maciça (oco só se pesar demais na impressão).

### F3 — Gerador (aba Blocos) (~3 h)
- Seletor **Escala** no topo da aba Blocos (`main.ts:108`). Cidade mostra seção "Construções" (adicionar casa/torre/árvore/bosque, posição, tamanho, rotação — mesmo padrão da seção Paredes em `paredes.ts`). Reino mostra seção "Terreno" (relevo, altura) e "Marcador". Sem aba nova.
- `cli.ts --relevo_tipo --relevo_altura`.

### F4 — Editor de mapa (~1 dia)
- "Novo mapa" pergunta a escala. `FERRAMENTAS` (`mapa/main.ts:16-19`) filtradas por escala:
  - Combate: as de hoje.
  - Cidade: Piso, Apagar, Muralha (parede alta + ameias), Portão (porta), Torre (coluna larga), Casa, Árvore, Bosque.
  - Reino: Piso/Terreno (textura), Água (tex água), Colina, Montanha, Vulcão, Cidade, Castelo; `sala.max` padrão **1×1** (cada hex = peça solta).
- `editor2d.ts`: `Ferr`, `TECLAS`, `case` em `acao()` (`:303-339`), ícone no desenho (`:164-173`).
- `divisao.ts`: `obj` entra em `barreira()` (`:110-115`), no descritor `Peca` (chave de dedup) e em `transforma` (rotação). `opcoesDe` (`mapa/opcoes.ts`) converte `obj` em `objetos`/`relevo_*`.
- `vista3d.ts` L0: caixa/cone colorido por tipo de objeto.
- Modelos: `web/public/mapas/cidade.json` e `reino.json`.

### F5 — Checks, docs, CI (~2 h)
- `web/check_escalas.ts`: cada miniatura e cada relevo fecha a malha (quadrado e hex); emenda 0,0000 mm entre peça com montanha e vizinha plana; mapa v1 abre como combate; dedup/rotação com `obj`. D2 idêntico.
- Entrar no `checks.yml`; atualizar `USO.md`, `README.md`, `RETOMAR.md`.

## Arquivos principais
`web/src/bloco.ts`, `parede.ts`, `telhado.ts`, novo `miniaturas.ts`, `main.ts`/`ui.ts`, `cli.ts`, `web/src/mapa/{modelo,divisao,opcoes,editor2d,vista3d,main}.ts`, `web/public/mapas/`.

## Verificação
1. `cd web && npx tsc --noEmit`
2. `npx tsx check_paredes.ts D2` (hashes iguais) e `npx tsx check_escalas.ts`
3. `npx tsx check_mapa.ts` (mapas antigos seguem iguais)
4. Navegador (dev server), 1024 e 375 px: gerador com casa, bosque, montanha, vulcão; editor de mapa Cidade e Reino (2D, 3D L0→L1, exportar ZIP de um mapa pequeno); console limpo.

## Fora desta rodada
Rio como canal entre células (v1 = célula de água), telhado/casa com interior, ligação entre escalas (clicar na cidade do Reino abre o mapa da Cidade), névoa de guerra na tela.
