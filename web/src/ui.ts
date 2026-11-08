// Ajudantes de interface (controles, seções, cards, botões). Sem estado da aplicação.
export const $ = (id: string) => document.getElementById(id)!

/** Chamado por padrão depois de cada mudança de controle; o main liga na prévia. */
export const aoMudar = { f: () => {} }

// controles: um slider + caixa numérica por opção
export function controle(pai: HTMLElement, rotulo: string, ini: number, min: number, max: number, muda: (v: number) => void, passo?: number, ao: () => void = () => aoMudar.f()) {
  const l = document.createElement('label'), num = document.createElement('input'), sl = document.createElement('input')
  l.append(rotulo, num, sl)
  const step = passo ?? (max - min) / 200 // com passo: só valores cheios (linhas, colunas, semente...)
  for (const e of [num, sl]) Object.assign(e, { type: e === sl ? 'range' : 'number', min, max, step, value: ini })
  const ao2 = (e: HTMLInputElement) => () => {
    if (e.value === '') return // caixa sendo apagada para digitar
    let v = Math.min(max, Math.max(min, +e.value))
    if (passo) v = +(Math.round(v / passo) * passo).toFixed(6)
    sl.value = String(v)
    if (e === sl || +num.value !== v) num.value = String(v)
    muda(v); ao()
  }
  num.oninput = ao2(num); sl.oninput = ao2(sl)
  pai.append(l)
  return (v: number) => { sl.value = num.value = String(v) } // põe um valor de fora (troca de aba)
}
/** Seção recolhível (nada é salvo): devolve o div interno, onde entram os controles. */
export function secao(pai: HTMLElement, titulo: string, aberta = false): HTMLElement {
  const d = document.createElement('details'), s = document.createElement('summary'), div = document.createElement('div')
  s.textContent = titulo
  d.open = aberta
  d.name = pai.closest('section')?.id ?? '' // só uma seção aberta por vez em cada aba
  d.append(s, div)
  pai.append(d)
  return div
}
/** Cria as seções na ordem dada; devolve título → div. */
export const secoes = (pai: HTMLElement, titulos: string[], abertas: string[] = []) =>
  Object.fromEntries(titulos.map(t => [t, secao(pai, t, abertas.includes(t))])) as Record<string, HTMLElement>
/** mapa: chave da tabela → título da seção; divs: título → div da seção. Devolve chave → setter do valor. */
export const grupo = (tab: Record<string, readonly [number, number, number, string, number?]>, alvo: any, mapa: Record<string, string>, divs: Record<string, HTMLElement>, pular: string[] = []) => {
  const poe: Record<string, (v: number) => void> = {}
  for (const [k, [, min, max, rot, passo]] of Object.entries(tab))
    if (!pular.includes(k)) poe[k] = controle(divs[mapa[k]], rot, alvo[k], min, max, v => { alvo[k] = v }, passo)
  return poe
}
export const opcoes = (sel: HTMLSelectElement, itens: [string, string][]) => sel.append(...itens.map(([v, t]) => new Option(t, v)))
export const campo = (texto: string, sel: HTMLElement) => { const l = document.createElement('label'); l.append(texto, sel); return l }
export const escolha = (pai: HTMLElement, rot: string, v: string, itens: [string, string][], muda: (v: string) => void) => {
  const sl = document.createElement('select')
  opcoes(sl, itens); sl.value = v
  sl.onchange = () => muda(sl.value)
  pai.append(campo(rot, sl))
}

/** Card recolhível: `d` é o <details>, `s` o título (summary) e `c` o corpo. */
export function cartao(titulo: string, aberto = false) {
  const d = document.createElement('details'), s = document.createElement('summary'), c = document.createElement('div')
  d.className = 'card'; d.open = aberto; s.textContent = titulo; d.append(s, c)
  return { d, s, c }
}
export const botao = (texto: string, clique: (e: MouseEvent) => void, titulo = '') => {
  const b = document.createElement('button')
  b.textContent = texto; b.title = titulo; b.onclick = clique
  return b
}
/** Botões lado a lado (um ativo); devolve o contêiner e o `marca` que pinta o ativo. */
export function segmentos(itens: [string, string][], muda: (v: string) => void) {
  const el = document.createElement('div'), bs = new Map<string, HTMLButtonElement>()
  el.className = 'seg'
  const marca = (v: string) => bs.forEach((b, k) => b.classList.toggle('ativo', k === v))
  for (const [v, t] of itens) { const b = botao(t, () => { muda(v); marca(v) }, t); bs.set(v, b); el.append(b) }
  return { el, marca }
}
export const marca = () => Object.assign(document.createElement('input'), { type: 'checkbox' })
