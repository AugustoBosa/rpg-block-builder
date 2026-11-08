// Seção "Paredes" da aba Blocos: lista recolhível; cada parede com âncora, medidas, lado e aberturas. Nada é salvo.
import type { Opcoes } from './bloco'
import { aberturaNova, ladoBloco, orfa, paredeNova } from './aberturas'
import type { Abertura, Parede } from './parede'
import { botao, campo, controle, escolha, marca } from './ui'

let nParede = 0
export function montaParedes(div: HTMLElement, o: Opcoes, previa: () => void) {
  const hex = o.formato === 'hexagono'
  div.replaceChildren()
  const refaz = () => { montaParedes(div, o, previa); previa() }
  o.paredes.forEach((p, i) => {
    const d = document.createElement('details'), sm = document.createElement('summary'), c = document.createElement('div')
    sm.textContent = `Parede ${i + 1} · ${p.ancora.tipo === 'aresta' ? 'em aresta' : 'em eixo'}`
    if (orfa(o, p)) { sm.textContent += ' ⚠ lado inexistente, ignorada'; sm.style.color = '#e9a35a' }
    d.open = true; d.append(sm, c); div.append(d)
    escolha(c, 'Âncora', p.ancora.tipo, [['aresta', 'Lado do bloco'], ['eixo', 'Eixo (reta livre)']], v => {
      p.ancora = v === 'aresta' ? { tipo: 'aresta', celula: 0, lado: 0 } : { tipo: 'eixo', eixo: 'x', desloc: 0 }
      p.lado = v === 'aresta' ? 'dentro' : 'centro'; refaz()
    })
    const a = p.ancora
    if (a.tipo === 'aresta') controle(c, 'Lado do bloco nº', a.lado, 0, (hex ? 6 : 4) - 1, v => { a.lado = v }, 1)
    else {
      escolha(c, 'Eixo', a.eixo, [['x', 'X'], ['y', 'Y'], ...(hex ? [['h0', '0°'], ['h60', '60°'], ['h120', '120°']] as [string, string][] : [])], v => { a.eixo = v as typeof a.eixo; previa() })
      controle(c, 'Deslocamento (mm)', a.desloc, -100, 100, v => { a.desloc = v }, .5)
    }
    controle(c, 'Início (mm)', p.inicio, -100, 100, v => { p.inicio = v }, .5)
    controle(c, 'Comprimento (mm)', p.comprimento, 1, 200, v => { p.comprimento = v }, .5)
    controle(c, 'Altura (mm)', p.altura, 1, 100, v => { p.altura = v }, .5)
    controle(c, 'Espessura (mm)', p.espessura, 1, 20, v => { p.espessura = v }, .5)
    escolha(c, 'Lado da espessura', p.lado, [['fora', 'Fora'], ['centro', 'Centro'], ['dentro', 'Dentro']], v => { p.lado = v as Parede['lado']; previa() })
    p.aberturas.forEach((ab, j) => {
      const h = document.createElement('div')
      h.className = 'nota'; h.textContent = `Abertura ${j + 1}`
      c.append(h)
      escolha(c, 'Tipo', ab.tipo, [['porta', 'Porta'], ['janela', 'Janela']], v => { ab.tipo = v as Abertura['tipo']; previa() })
      escolha(c, 'Forma', ab.forma, [['reta', 'Reta'], ['arco', 'Arco'], ['abatido', 'Arco abatido'], ['ogiva', 'Ogiva']], v => { ab.forma = v as Abertura['forma']; previa() })
      controle(c, 'Posição do centro (mm)', ab.pos, -100, 200, v => { ab.pos = v }, .5)
      controle(c, 'Largura (mm)', ab.largura, 2, 60, v => { ab.largura = v }, .5)
      controle(c, 'Altura (mm)', ab.altura, 2, 100, v => { ab.altura = v }, .5)
      controle(c, 'Peitoril (mm)', ab.peitoril, -50, 100, v => { ab.peitoril = v }, .5)
      const ck = marca()
      ck.checked = ab.batente.ligado
      ck.onchange = () => { ab.batente.ligado = ck.checked; previa() }
      c.append(campo('Batente', ck))
      controle(c, 'Batente: largura (mm)', ab.batente.largura, .5, 6, v => { ab.batente.largura = v }, .1)
      controle(c, 'Batente: saliência (mm)', ab.batente.saliencia, 0, 3, v => { ab.batente.saliencia = v }, .1)
      c.append(botao('− Abertura', () => { p.aberturas.splice(j, 1); refaz() }))
    })
    c.append(botao('+ Abertura', () => { const ab = aberturaNova('porta'); ab.pos = p.comprimento / 2; p.aberturas.push(ab); refaz() }), botao('− Parede', () => { o.paredes.splice(i, 1); refaz() }))
  })
  div.append(botao('+ Parede', () => {
    o.paredes.push(paredeNova('p' + ++nParede, { tipo: 'aresta', celula: 0, lado: 0 }, +ladoBloco(o, 0)!.L.toFixed(1))); refaz()
  }))
}
