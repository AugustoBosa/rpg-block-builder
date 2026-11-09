// Check dos temas: `npx tsx check_temas.ts`. Imprime PASS/FAIL e o valor medido.
import { padrao, PISO } from './src/bloco'
import { aplicaTema, TEMAS, TEXTURAS, TEXTURAS_DISPONIVEIS, texturaDe } from './src/temas'

let falhas = 0
const confere = (nome: string, ok: boolean, medido: string) => { if (!ok) falhas++; console.log(`${ok ? 'PASS' : 'FAIL'} ${nome}: ${medido}`) }
const base = padrao(), json0 = JSON.stringify(base)
const ids = Object.keys(TEMAS)
confere('13 temas', ids.length === 13, String(ids.length))

const [dMin, dMax] = [PISO.desgaste[1], PISO.desgaste[2]], [tMin, tMax] = [PISO.tamanho_pedra[1], PISO.tamanho_pedra[2]]
const fora = ids.filter(id => { const o = padrao(); aplicaTema(o, TEMAS[id]); return !(o.desgaste >= dMin && o.desgaste <= dMax && o.tamanho_pedra >= tMin && o.tamanho_pedra <= tMax) })
confere('desgaste e tamanho dentro das faixas de PISO', !fora.length, fora.join(',') || `desgaste ${dMin}..${dMax}, tamanho ${tMin}..${tMax}`)

// dungeon, deserto, inundada e navio têm os mesmos números do padrão (só mudam de textura no gerar.py)
const mudam = ids.filter(id => { const o = padrao(); aplicaTema(o, TEMAS[id]); return o.desgaste !== base.desgaste || o.tamanho_pedra !== base.tamanho_pedra })
confere('temas que alteram desgaste ou tamanho (>= 9)', mudam.length >= 9, `${mudam.length}: sem mudança = ${ids.filter(i => !mudam.includes(i)).join(',')}`)
const pares = new Set(ids.map(id => `${TEMAS[id].desgaste}/${TEMAS[id].tamanho_pedra}`))
confere('combinações únicas de desgaste/tamanho (>= 10)', pares.size >= 10, String(pares.size))

confere('aplicar tema só mexe em desgaste, tamanho_pedra, textura e texturaParede', ids.every(id => { const o = padrao(); aplicaTema(o, TEMAS[id]); o.desgaste = base.desgaste; o.tamanho_pedra = base.tamanho_pedra; o.textura = base.textura; o.texturaParede = base.texturaParede; return JSON.stringify(o) === json0 }), 'ok')
confere('padrao(): texturaParede vazia (igual ao piso)', base.texturaParede === '', JSON.stringify(base.texturaParede))
const tp = (id: string) => { const o = padrao(); aplicaTema(o, TEMAS[id]); return `${o.textura}/${o.texturaParede || '(igual)'}` }
confere('castelo = lajota/tijolo', tp('castelo') === 'lajota/tijolo', tp('castelo'))
confere('dungeon = pedra, parede igual ao piso', tp('dungeon') === 'pedra/(igual)', tp('dungeon'))
confere('taverna: piso e parede iguais gravam texturaParede vazia (indisponível cai para pedra)', tp('taverna') === 'pedra/(igual)', tp('taverna'))
confere('cripta (lajota + parede indisponível) = lajota/pedra', tp('cripta') === 'lajota/pedra', tp('cripta'))
confere('padrao() não mudou depois dos temas', JSON.stringify(padrao()) === json0 && base.desgaste === .5 && base.tamanho_pedra === 10, `desgaste ${base.desgaste}, tamanho ${base.tamanho_pedra}`)
confere('texturas dos temas existem', ids.every(id => TEXTURAS.includes(TEMAS[id].piso) && TEXTURAS.includes(TEMAS[id].parede)), `${TEXTURAS.length} ids`)
const fb = ids.filter(id => TEXTURAS_DISPONIVEIS.includes(TEMAS[id].piso) !== (texturaDe(TEMAS[id].piso) === TEMAS[id].piso))
confere('textura indisponível cai para pedra', !fb.length && texturaDe('lava') === (TEXTURAS_DISPONIVEIS.includes('lava') ? 'lava' : 'pedra'), `disponíveis: ${TEXTURAS_DISPONIVEIS.join(',')}`)
process.exit(falhas ? 1 : 0)
