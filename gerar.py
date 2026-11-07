"""RPG Block Builder: gerador de blocos (referência congelada). Roda dentro do Blender, headless:
  blender.exe -b -P gerar.py -- --peca liso|piso|parede|porta|canto --pe pe_longo --celulas 1 --semente 1 [--lote 20] [--desgaste .5 ...] --saida saida/
Lê spec_encaixe.json; pé + corpo = bmesh (exato); topos = grupos de nós (GN) criados aqui e aplicados como modificador.
Saída: STL + JSON lateral + PNG (por semente quando --lote)."""
import sys, os, json, functools, hashlib, tempfile, bpy, bmesh
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
CODIGOS = {('pe_longo', 1): 1, ('pe_longo', 2): 2, ('pe_curto', 1): 3, ('pe_curto', 2): 4}  # GEN-nnn (D3)


def arg(nome, padrao):
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return a[a.index(nome) + 1] if nome in a else padrao


def liso(pe, n, spec, folga=0, marcas=0, rebaixo=0, ny=1):
    """Malha fechada: grade de n colunas (x) × ny linhas (y) de pés (loft) + corpo prisma: os pés só se unem em cima. Origem: centro do conjunto, base em z=0."""
    p = spec['passo_celula']
    # folga por lado só no pé (hw < meia célula); o ponto final fica em hw = 17,5
    perfil = [(z, hw + folga if hw < p / 2 else hw) for z, hw in spec['pes'][pe]['perfil']]
    H = spec['pes'][pe]['altura_liso'] - rebaixo  # topos por nós sobem RELEVO acima do corpo
    h = p / 2
    xs = [(k - n / 2) * p for k in range(n + 1)]  # divisas de célula
    ys = [(k - ny / 2) * p for k in range(ny + 1)]
    bm = bmesh.new()
    V = {}

    def v(x, y, z):
        k = (round(x, 4), round(y, 4), round(z, 4))
        if k not in V:
            V[k] = bm.verts.new((x, y, z))
        return V[k]

    def anel(cx, cy, z, hw):
        return [v(cx + sx * hw, cy + sy * hw, z) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]

    def faixa(a, b):  # quads entre dois anéis de 4 vértices
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))

    for k in range(n):
        for j in range(ny):
            cx, cy = (xs[k] + xs[k + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            an = [anel(cx, cy, z, hw) for z, hw in perfil]
            bm.faces.new(an[0])  # base
            for a, b in zip(an, an[1:]):
                faixa(a, b)
    zf = perfil[-1][0]  # onde o pé enche a célula (hw = 17,5)
    assert perfil[-1][1] == h and H > zf
    # corpo: contorno em z=zf (vértices nas divisas, iguais aos do topo dos pés) e em H
    ctn = [(x, ys[0]) for x in xs] + [(xs[-1], y) for y in ys[1:]] + [(x, ys[-1]) for x in reversed(xs[:-1])] + [(xs[0], y) for y in reversed(ys[1:-1])]
    base, topo = [v(x, y, zf) for x, y in ctn], [v(x, y, H) for x, y in ctn]
    for i in range(len(base)):
        j = (i + 1) % len(base)
        bm.faces.new((base[i], base[j], topo[j], topo[i]))
    bm.faces.new(topo)
    for i in range(marcas):  # relevo de identificação: barras 20x2,5, topo 0,4 mm acima do liso, casca fechada afundada 0,2
        y0 = (i - (marcas - 1) / 2) * 5
        r = [[v(x, y, z) for x, y in ((-10, y0 - 1.25), (10, y0 - 1.25), (10, y0 + 1.25), (-10, y0 + 1.25))] for z in (H - .2, H + .4)]
        bm.faces.new(r[0][::-1])
        bm.faces.new(r[1])
        faixa(r[0], r[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('bloco')
    bm.to_mesh(me)
    bm.free()
    return me


# ---------- topos por nós (Fase 4) ----------
RELEVO = 2.6  # mm: o topo (laje) sobe até altura_liso; o corpo termina RELEVO abaixo = profundidade máxima de corte (impressão com suportes: sem limite de 45°)
PARAMS = {  # nome: (padrão, mín, máx, tipo)
    'semente': (1, 0, 9999, 'Int'), 'desgaste': (.5, 0, 1, 'Float'), 'tamanho_pedra': (10, 5, 25, 'Float'),
    'orientacao': (0, 0, 270, 'Int'), 'profundidade': (.5, .4, .7, 'Float'),
    'espessura_parede': (7, 4, 10, 'Float'), 'altura_parede': (25, 10, 60, 'Float'),
    'estado': (0, 0, 2, 'Int'), 'fundir_com_bloco': (True, 0, 1, 'Bool'), 'tipo': (0, 0, 2, 'Int'),
    'pose': (0, 0, 2, 'Int'),
    'textura_piso': (0, 0, 14, 'Int'), 'textura_parede': (0, 0, 14, 'Int'), 'posicao_x': (0, -8, 8, 'Float'), 'posicao_y': (0, -8, 8, 'Float'),
    'biblioteca': (0, 0, 5, 'Int'),
    'angulo_telhado': (30, 15, 40, 'Float'), 'celula': (0, 0, 2, 'Int'),
    'espalhar': (False, 0, 1, 'Bool'), 'densidade': (.8, 0, 1, 'Float'), 'escala': (1.1, 1, 1.2, 'Float'),
    'divisao': (0, 0, 2, 'Int'), 'divisao_largura': (1.6, .5, 5, 'Float'), 'divisao_fundo': (1, .2, 2.5, 'Float'),  # conjunto: 0 laje contínua, 1 junta, 2 bisel entre os blocos
    'resolucao': (.125, .1, 1, 'Float')}  # mm entre vértices da laje e das paredes: 0,5 na prévia do painel, 0,125 no STL final (o exportar_stl reduz a malha)
for _k in (1, 2):  # aberturas: tipo 0 nenhuma, 1 porta, 2 janela; lado 0 = parede A, 1 = parede B (canto); pos = mm a partir do centro; verga 0 reta, 1 arco, 2 abatido, 3 ogiva
    PARAMS.update({f'ab{_k}_tipo': (0, 0, 2, 'Int'), f'ab{_k}_lado': (0, 0, 1, 'Int'), f'ab{_k}_pos': (0, -122.5, 122.5, 'Float'), f'ab{_k}_largura': (12, 3, 30, 'Float'),
                   f'ab{_k}_altura': (20, 4, 50, 'Float'), f'ab{_k}_peitoril': (10, 0, 40, 'Float'), f'ab{_k}_verga': (1, 0, 3, 'Int'), f'ab{_k}_moldura': (True, 0, 1, 'Bool'),
                   f'ab{_k}_moldura_largura': (2.2, .5, 5, 'Float'), f'ab{_k}_moldura_saliencia': (.7, .1, 2, 'Float'), f'ab{_k}_moldura_relevo': (.5, 0, 1.5, 'Float')})
PARAMS.update({  # avançado (padrão = valor fixo de antes): borda da laje, parede, limites das aberturas
    'quina_largura': (1.8, 0, 5, 'Float'), 'quina_gasto': (1, 0, 3, 'Float'), 'lateral_largura': (2, 0, 5, 'Float'), 'lateral_gasto': (1, 0, 3, 'Float'),
    'ruido_borda': (.3, .05, 2, 'Float'), 'parede_relevo_max': (.8, .1, .95, 'Float'), 'topo_parede_faixa': (2.5, .5, 5, 'Float'), 'topo_parede_gasto': (1, 0, 3, 'Float'),
    'ab_pilar_min': (3, 1, 10, 'Float'), 'ab_verga_min': (2.5, 1, 10, 'Float'), 'verga_abatimento': (.22, .05, .5, 'Float')})
TIPOS_AB = ['Nenhuma', 'Porta', 'Janela']
DIVISOES = ['Contínua', 'Junta', 'Bisel']
VERGAS = ['Reta', 'Arco', 'Abatido', 'Ogiva']
ATALHOS = {'porta': dict(ab1_tipo=1), 'janela': dict(ab1_tipo=2, ab1_largura=8, ab1_altura=8)}  # CLI antiga: --peca porta|janela = parede + 1 abertura
BASE = list(PARAMS)[:5] + ['resolucao']
TEXTURAS = ['Pedra', 'Lajota', 'Rachado', 'Tijolo', 'Tabuas', 'Terra', 'Areia', 'Agua', 'Lava', 'Nichos', 'Glifos', 'Caverna', 'Casco', 'Metal', 'Lisa']  # ids 0..14 (textura_piso / textura_parede); Agua e Lava só no piso (parede cai para Pedra)
BIBLIOTECAS = ['Detalhes', 'Grama', 'Cristais', 'Estalagmites', 'Ossos', 'Correntes']  # Espalhar: 0 moedas/pedregulhos/ossos, 1 tufos, 2 cristais, 3 estalagmites, 4 caveiras e ossos
PROF_PAREDE = 3.2  # ganho de profundidade das juntas na parede (calibrar.py)
TETO = 2.5  # mm: teto do relevo (RELEVO 2,6)
TEMAS = {'dungeon': dict(textura_piso=0, textura_parede=0, desgaste=.5, tamanho_pedra=10),
         'castelo': dict(textura_piso=1, textura_parede=3, desgaste=.35, tamanho_pedra=12),
         'ruina': dict(textura_piso=2, textura_parede=3, desgaste=.9, tamanho_pedra=10),
         'taverna': dict(textura_piso=4, textura_parede=4, desgaste=.5, tamanho_pedra=8),
         'pantano': dict(textura_piso=5, textura_parede=3, desgaste=.8, tamanho_pedra=9, espalhar=True, biblioteca=1),
         'deserto': dict(textura_piso=6, textura_parede=3, desgaste=.5, tamanho_pedra=10),
         'inundada': dict(textura_piso=7, textura_parede=0, desgaste=.5, tamanho_pedra=10),
         'vulcao': dict(textura_piso=8, textura_parede=0, desgaste=.6, tamanho_pedra=13),
         'caverna': dict(textura_piso=11, textura_parede=11, desgaste=.8, tamanho_pedra=12, espalhar=True, biblioteca=3),
         'cripta': dict(textura_piso=1, textura_parede=9, desgaste=.6, tamanho_pedra=9, espalhar=True, biblioteca=4),
         'templo': dict(textura_piso=6, textura_parede=10, desgaste=.4, tamanho_pedra=10),
         'navio': dict(textura_piso=4, textura_parede=12, desgaste=.5, tamanho_pedra=10),
         'forja': dict(textura_piso=13, textura_parede=13, desgaste=.3, tamanho_pedra=10)}
for _t in TEMAS.values():  # todo tema define tudo: trocar de tema nunca deixa sobra do anterior
    _t.setdefault('espalhar', False)
    _t.setdefault('biblioteca', 0)
AB = [f'ab{k}_{n}' for k in (1, 2) for n in ('tipo', 'lado', 'pos', 'largura', 'altura', 'peitoril', 'verga', 'moldura', 'moldura_largura', 'moldura_saliencia', 'moldura_relevo')]
TEX_KNOBS = {  # parâmetros internos das texturas: nome -> (padrão, mín, máx, rótulo). Viram `<textura>_<nome>` no painel e na CLI.
    'Pedra': {'distorcao': (.12, 0, .4, 'Distorção (× tamanho)'), 'vao': (.5, 0, 2, 'Vão entre pedras (mm)'), 'vao_desgaste': (.6, 0, 2, 'Vão extra com desgaste (mm)'),
              'bisel': (1.2, 0, 4, 'Bisel da borda (mm)'), 'domo': (.3, 0, 1.5, 'Abaulado (mm)'), 'cascalho': (.5, 0, 1.5, 'Cascalho no vão (mm)'),
              'inclinacao': (.3, 0, 1, 'Inclinação por pedra'), 'altura_var': (.35, 0, 1.5, 'Variação de altura (mm)'), 'rachadas': (.12, 0, 1, 'Pedras rachadas (fração)'),
              'racha_fundo': (.7, 0, 2, 'Fundo da rachadura (mm)'), 'lasca_largura': (1.8, 0, 5, 'Lascas: faixa (mm)'), 'lasca_fundo': (.5, 0, 2, 'Lascas: fundo (mm)'),
              'grao': (.1, 0, .5, 'Grão (mm)')},
    'Lajota': {'lado': (.9, .3, 3, 'Lado (× tamanho)'), 'junta': (.5, 0, 2, 'Meia junta (mm)'), 'bisel': (.4, 0, 3, 'Bisel (mm)'), 'junta_fundo': (.85, 0, 2, 'Fundo da junta (×)'),
               'inclinacao': (.5, 0, 2, 'Inclinação por lajota'), 'altura_var': (.25, 0, 1.5, 'Variação de altura (mm)'), 'rachadas': (.2, 0, 1, 'Lajotas rachadas (fração)'),
               'racha_fundo': (.6, 0, 2, 'Fundo da rachadura (mm)'), 'lascadas': (.3, 0, 1, 'Cantos lascados (fração)'), 'lasca_fundo': (.7, 0, 2, 'Fundo da lasca (mm)'),
               'grao': (.07, 0, .5, 'Grão (mm)')},
    'Tijolo': {'comprimento': (1.2, .3, 4, 'Comprimento (× tamanho)'), 'altura': (.6, .2, 2, 'Altura da fiada (× tamanho)'), 'argamassa': (.55, 0, 2, 'Meia argamassa (mm)'),
               'bisel': (.8, 0, 3, 'Bisel (mm)'), 'torto': (.5, 0, 2, 'Tijolo torto (mm)'), 'altura_var': (.35, 0, 1.5, 'Variação de altura (mm)'),
               'quebrados': (.4, 0, 1, 'Quinas quebradas (fração)'), 'quebra_fundo': (.9, 0, 2, 'Fundo da quebra (mm)'), 'faltando': (.07, 0, .5, 'Tijolos faltando (× desgaste)'),
               'poros': (.35, 0, 1.5, 'Poros (mm)'), 'lasca_fundo': (.6, 0, 2, 'Lascas: fundo (mm)'), 'grao': (.08, 0, .5, 'Grão (mm)')},
    'Tabuas': {'comprimento': (3.5, 1, 10, 'Comprimento (× tamanho)'), 'largura': (.85, .3, 3, 'Largura (× tamanho)'), 'variacao': (.6, 0, 1.5, 'Variação do comprimento'),
               'fresta': (.5, 0, 2, 'Fresta (mm)'), 'empeno': (.5, 0, 2, 'Empeno (mm)'), 'abaulado': (.12, 0, 1, 'Abaulado (mm)'), 'veio': (.16, 0, .8, 'Veio (mm)'),
               'nos': (.45, 0, 1, 'Tábuas com nó (fração)'), 'prego_dist': (1.8, .5, 6, 'Prego: distância da ponta (mm)'), 'prego_fundo': (.45, 0, 1.5, 'Prego: fundo (mm)'),
               'ponta_gasta': (.5, 0, 2, 'Ponta gasta (mm)'), 'grao': (.05, 0, .5, 'Grão (mm)')},
    'Lisa': {'placa': (2, .5, 6, 'Placa (× tamanho)'), 'junta_fundo': (.3, 0, 1.5, 'Fundo da junta (mm)'), 'grao': (.03, 0, .3, 'Grão (mm)')},
    'Rachado': {'lajota': (1.6, .5, 4, 'Lajota de base (× tamanho)'), 'manchas': (.6, 0, 1, 'Limiar das manchas (menor = mais rachado)'),
                'racha_largura': (.5, 0, 2, 'Largura da rachadura (mm)'), 'racha_fundo': (.9, 0, 2, 'Fundo da rachadura (mm)'),
                'cacos': (.1, 0, 1, 'Cacos afundados (fração)'), 'lasca_fundo': (.5, 0, 2, 'Lascas: fundo (mm)')},
    'Terra': {'chao': (1.45, 0, 2.5, 'Nível do chão (mm abaixo do topo)'), 'torrao': (.3, 0, 1.5, 'Torrões (mm)'), 'fino': (.25, 0, 1, 'Grão grosso (mm)'),
              'seixos_tam': (.5, .1, 2, 'Pedrinhas: tamanho (× tamanho)'), 'seixos': (.5, 0, 1, 'Pedrinhas (fração)'), 'pedras': (.35, 0, 1, 'Pedras grandes (fração)'),
              'grao': (.08, 0, .5, 'Grão (mm)')},
    'Areia': {'nivel': (.4, 0, 2, 'Nível (mm abaixo do topo)'), 'onda_passo': (.65, .2, 3, 'Passo das ondulações (× tamanho)'), 'onda': (.7, 0, 2, 'Ondulações (mm)'),
              'duna': (.7, 0, 2, 'Dunas (mm)'), 'seixos': (.15, 0, 1, 'Pedrinhas (fração)'), 'grao': (.05, 0, .5, 'Grão (mm)')},
    'Caverna': {'laje': (1.3, .5, 4, 'Laje de rocha (× tamanho)'), 'vao': (.4, 0, 2, 'Fenda (mm)'), 'fenda_fundo': (1.3, 0, 3, 'Fundo da fenda (× profundidade)'),
                'cascalho': (.6, 0, 1.5, 'Cascalho na fenda (mm)'), 'inclinacao': (.5, 0, 2, 'Inclinação por laje'), 'rugas': (.6, 0, 2, 'Rugas (mm)'),
                'altura_var': (.9, 0, 2, 'Variação de altura (mm)'), 'racha_fundo': (.6, 0, 2, 'Rachaduras: fundo (mm)'), 'lasca_fundo': (.7, 0, 2, 'Lascas: fundo (mm)'),
                'seixos': (.1, 0, 1, 'Pedregulhos (fração)'), 'grao': (.12, 0, .5, 'Grão (mm)')},
    'Agua': {'manchas': (.38, 0, 1, 'Limiar das poças (maior = menos água)'), 'nivel': (2, 0, 2.5, 'Nível da água (mm abaixo do topo)'),
             'onda': (.3, 0, 1, 'Ondas (mm)'), 'marola': (.15, 0, .6, 'Marola (mm)'), 'seixos': (.2, 0, 1, 'Pedras na água (fração)')},
    'Lava': {'manchas': (.47, 0, 1, 'Limiar do rio (maior = menos lava)'), 'nivel': (1.85, 0, 2.5, 'Nível da lava (mm abaixo do topo)'), 'fluxo': (.4, 0, 1, 'Linhas de fluxo (mm)'),
             'crosta_tam': (.8, .2, 3, 'Placas de crosta (× tamanho)'), 'crosta': (.55, 0, 1, 'Crosta (fração)'), 'crosta_nivel': (1.2, 0, 2.5, 'Nível da crosta (mm abaixo do topo)')},
    'Nichos': {'comprimento': (1.4, .5, 4, 'Bloco: comprimento (× tamanho)'), 'altura': (1.1, .5, 4, 'Bloco: altura (× tamanho)'), 'largura': (.3, .1, .45, 'Nicho: meia largura (× bloco)'),
               'fundo': (1.4, 0, 3, 'Nicho: fundo (× profundidade)'), 'volumes': (.55, 0, 1, 'Nichos com volume (fração)'), 'junta': (.45, 0, 2, 'Meia junta (mm)'),
               'altura_var': (.25, 0, 1.5, 'Variação de altura (mm)'), 'lasca_fundo': (.3, 0, 2, 'Lascas: fundo (mm)'), 'grao': (.08, 0, .5, 'Grão (mm)')},
    'Glifos': {'comprimento': (2.4, .5, 6, 'Bloco: comprimento (× tamanho)'), 'altura': (1.8, .5, 5, 'Bloco: altura (× tamanho)'), 'painel': (.35, 0, 1.5, 'Painel rebaixado (mm)'),
               'celula': (.8, .3, 2, 'Célula do glifo (× tamanho)'), 'glifo_fundo': (.55, 0, 1.5, 'Glifo: fundo (mm)'), 'altura_var': (.2, 0, 1.5, 'Variação de altura (mm)'),
               'lasca_fundo': (.4, 0, 2, 'Lascas: fundo (mm)'), 'grao': (.06, 0, .5, 'Grão (mm)')},
    'Casco': {'altura': (.55, .2, 2, 'Fiada (× tamanho)'), 'comprimento': (3, 1, 10, 'Tábua: comprimento (× tamanho)'), 'variacao': (.5, 0, 1.5, 'Variação do comprimento'),
              'sobreposicao': (.6, 0, 2, 'Sobreposição (× profundidade)'), 'junta_topo': (.5, 0, 2, 'Junta de topo (× profundidade)'), 'empeno': (.4, 0, 2, 'Empeno (mm)'),
              'altura_var': (.2, 0, 1.5, 'Variação de altura (mm)'), 'veio': (.12, 0, .8, 'Veio (mm)'), 'cavilha_dist': (1.6, .5, 6, 'Cavilha: distância da ponta (mm)'),
              'cavilha_fundo': (.35, 0, 1.5, 'Cavilha: fundo (mm)'), 'ponta_gasta': (.4, 0, 2, 'Ponta gasta (mm)'), 'lasca_fundo': (.3, 0, 2, 'Lascas: fundo (mm)'),
              'grao': (.05, 0, .5, 'Grão (mm)')},
    'Metal': {'altura': (1, .3, 4, 'Chapa: altura (× tamanho)'), 'comprimento': (1.6, .3, 5, 'Chapa: comprimento (× tamanho)'), 'costura': (.45, 0, 2, 'Meia costura (mm)'),
              'costura_fundo': (1.2, 0, 3, 'Fundo da costura (× profundidade)'), 'amassado': (.3, 0, 1.5, 'Amassados (mm)'), 'inclinacao': (.25, 0, 1, 'Inclinação por chapa'),
              'altura_var': (.2, 0, 1.5, 'Variação de altura (mm)'), 'rebite_dist': (2.6, .8, 8, 'Rebite: distância da borda (mm)'), 'rebite_raio': (1.35, .5, 3, 'Rebite: raio (mm)'),
              'corrosao': (.24, 0, 1, 'Corrosão (fração)'), 'corrosao_fundo': (.35, 0, 1.5, 'Corrosão: fundo (mm)'), 'grao': (.04, 0, .5, 'Grão (mm)')},
    'Relevo': {'teto': (TETO, .5, 2.5, 'Teto do relevo (mm)'), 'junta_piso': (2.4, .5, 5, 'Ganho da junta no piso (× profundidade)'),
               'junta_parede': (PROF_PAREDE, .5, 6, 'Ganho da junta na parede (× profundidade)')}}  # Relevo: vale para todas as texturas
TEXK = [f'{t.lower()}_{n}' for t, d in TEX_KNOBS.items() for n in d]
PARAMS.update({f'{t.lower()}_{n}': (v[0], v[1], v[2], 'Float') for t, d in TEX_KNOBS.items() for n, v in d.items()})
DIVISAO = ['divisao', 'divisao_largura', 'divisao_fundo']
LAJE = ['quina_largura', 'quina_gasto', 'lateral_largura', 'lateral_gasto', 'ruido_borda'] + DIVISAO + TEXK  # + parâmetros das texturas (todo topo com laje)
PAREDE = ['parede_relevo_max', 'topo_parede_faixa', 'topo_parede_gasto', 'ab_pilar_min', 'ab_verga_min', 'verga_abatimento'] + AB  # 2 aberturas por parede
CONV = {'Int': int, 'Float': float, 'Bool': lambda x: bool(int(x))}  # --fundir_com_bloco 0|1
TOPOS = {  # topo: (grupo GN, código GEN, nome, parâmetros)
    'piso': ('Topo_Piso', 10, 'Piso', BASE + ['textura_piso', 'posicao_x', 'posicao_y'] + LAJE),
    'parede': ('Topo_Parede', 11, 'Parede', BASE + ['textura_piso', 'textura_parede', 'posicao_x', 'posicao_y', 'espessura_parede', 'altura_parede'] + LAJE + PAREDE),
    'canto': ('Topo_Canto', 13, 'Canto', BASE + ['textura_piso', 'textura_parede', 'posicao_x', 'posicao_y', 'espessura_parede', 'altura_parede'] + LAJE + PAREDE),
    'telhado': ('Topo_Telhado', 14, 'Telhado', BASE + ['textura_piso', 'posicao_x', 'posicao_y', 'angulo_telhado'] + LAJE),
    'bau': ('Obj_Bau', 20, 'Bau', ['estado', 'orientacao', 'fundir_com_bloco', 'semente']),
    'prop': ('Obj_Prop', 21, 'Prop', ['tipo', 'orientacao', 'fundir_com_bloco', 'semente', 'celula']),
    'estatua': ('Obj_Estatua', 22, 'Estatua', ['pose', 'orientacao', 'fundir_com_bloco', 'semente', 'desgaste'])}


class Gr:
    """Mini-construtor de grupo GN: números viram valor padrão, sockets/nós viram links."""

    def __init__(s, nome, params, campos=()):
        s.ng = bpy.data.node_groups.new(nome, 'GeometryNodeTree')
        i = s.ng.interface
        if campos:  # grupo de campo (textura): entradas Float + saída Profundidade, sem geometria
            for c in campos:
                i.new_socket(c, in_out='INPUT', socket_type='NodeSocketFloat')
            i.new_socket('Profundidade', in_out='OUTPUT', socket_type='NodeSocketFloat')
        else:
            i.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
            i.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
        for p in params:
            d, lo, hi, t = PARAMS[p]
            it = i.new_socket(p, in_out='INPUT', socket_type='NodeSocket' + t)
            it.default_value = d
            if t != 'Bool':
                it.min_value, it.max_value = lo, hi
        s.res = .5  # resolução da caixa (o topo troca pela entrada `resolucao`)
        s.campo = bool(campos)
        s.ent = s.ng.nodes.new('NodeGroupInput')
        s.sai = s.ng.nodes.new('NodeGroupOutput')

    def lig(s, entrada, v):
        if isinstance(v, bpy.types.Node):
            v = v.outputs[0]
        if isinstance(v, bpy.types.NodeSocket):
            s.ng.links.new(v, entrada)
        else:
            entrada.default_value = v

    def no(s, tipo, ent=None, **props):
        n = s.ng.nodes.new(tipo)
        for k, v in props.items():
            setattr(n, k, v)
        for k, v in (ent or {}).items():
            s.lig(n.inputs[k], v)
        return n

    def mat(s, op, a, b=None, c=None):
        return s.no('ShaderNodeMath', {i: v for i, v in enumerate((a, b, c)) if v is not None}, operation=op).outputs[0]

    def vec(s, x, y, z):
        return s.no('ShaderNodeCombineXYZ', {'X': x, 'Y': y, 'Z': z}).outputs[0]

    def xyz(s, v):
        return list(s.no('ShaderNodeSeparateXYZ', {'Vector': v}).outputs)

    def mapa(s, v, a, b, c, d):  # a..b -> c..d com suavização, preso nas pontas
        return s.no('ShaderNodeMapRange', {'Value': v, 'From Min': a, 'From Max': b, 'To Min': c, 'To Max': d},
                    interpolation_type='SMOOTHSTEP', clamp=True).outputs['Result']

    def _mancha(s, vec, escala, lim, larg=.12):
        """Máscara 0..1 de manchas orgânicas (ruído acima de `lim`): poças, lava. Coordenadas globais = contínua entre blocos."""
        n = s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': escala, 'Detail': 2}).outputs['Factor']
        return n, s.mapa(n, lim, s.mat('ADD', lim, larg), 0, 1)

    def add(s, *a):
        return functools.reduce(lambda p, q: s.mat('ADD', p, q), a)

    def mul(s, *a):
        return functools.reduce(lambda p, q: s.mat('MULTIPLY', p, q), a)

    def ale(s, a, b=0, c=0):
        """3 números aleatórios 0..1 por id inteiro (a, b, c): altura, inclinação e defeitos de cada peça."""
        return s.xyz(s.no('ShaderNodeTexWhiteNoise', {'Vector': s.vec(a, b, c)}, noise_dimensions='3D').outputs['Color'])

    def kn(s, tex, nome):
        """Parâmetro de textura (TEX_KNOBS): no grupo DB_Tex_* vira entrada (o `textura` liga ao slider do topo); fora dele, o padrão."""
        d, lo, hi, _ = TEX_KNOBS[tex][nome]
        p = f'{tex.lower()}_{nome}'
        if not s.campo:
            return d
        if p not in s.ent.outputs:
            it = s.ng.interface.new_socket(p, in_out='INPUT', socket_type='NodeSocketFloat')
            it.default_value, it.min_value, it.max_value = d, lo, hi
        return s.ent.outputs[p]

    def distorce(s, vec, amp, esc=.12):
        """Desloca as coordenadas até ±amp mm com ruído de baixa frequência: juntas e peças irregulares."""
        n = s.xyz(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': esc, 'Detail': 2}).outputs['Color'])
        return s.vec(*[s.add(c, s.mul(s.mat('SUBTRACT', m, .5), amp, 2)) for c, m in zip(s.xyz(vec), n)])

    def grao(s, vec, amp):
        """Micro-relevo (poros da pedra, fibra da madeira): λ ≈ 1 mm, amplitude `amp` mm."""
        return s.mul(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': 1.1, 'Detail': 3, 'Roughness': .6}).outputs['Factor'], amp)

    def lasca(s, dist, vec, desg, larg=2.2, prof=.8):
        """Lascas nas bordas: manchas de ruído só perto da junta (dist < larg mm); mais lascas com mais desgaste."""
        n = s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .45, 'Detail': 3}).outputs['Factor']
        lim = s.mat('SUBTRACT', .66, s.mul(desg, .14))
        return s.mul(s.mapa(dist, 0, larg, 1, 0), s.mapa(n, lim, s.add(lim, .06), 0, 1), prof)

    def grade(s, u, v, ds, bw, h, desloc=.5, var=0.):
        """Peças em fiadas (tijolo, lajota, tábua) por matemática de floor: dá o id e a posição local de cada peça.
        Fiada = altura h; comprimento bw (× 1 ± var/2 por fiada: tábuas); fiadas alternadas deslocadas `desloc`·bw + jitter.
        Devolve (distância à junta mm, fu, fv, aleatórios da peça, comprimento da fiada)."""
        fila = s.mat('FLOOR', s.mat('DIVIDE', v, h))
        rf = s.ale(fila, 7.31, ds)
        bw = s.mul(bw, s.add(s.mat('SUBTRACT', 1, s.mul(var, .5)), s.mul(rf[1], var)))
        off = s.add(s.mul(s.mat('FLOORED_MODULO', fila, 2), desloc, bw), s.mul(s.mat('SUBTRACT', rf[0], .5), .2, bw))
        uu = s.add(u, off)
        col = s.mat('FLOOR', s.mat('DIVIDE', uu, bw))
        fu = s.mat('SUBTRACT', uu, s.mul(col, bw))
        fv = s.mat('SUBTRACT', v, s.mul(fila, h))
        du, dv = s.mat('MINIMUM', fu, s.mat('SUBTRACT', bw, fu)), s.mat('MINIMUM', fv, s.mat('SUBTRACT', h, fv))
        return s.mat('MINIMUM', du, dv), (du, dv), fu, fv, s.ale(col, fila, ds), bw

    def junta_perfil(s, dist, meia, bisel, prof, vec):
        """Junta: fundo irregular (argamassa) de meia-largura `meia` e borda chanfrada de `bisel` mm até o topo da peça."""
        fundo = s.mat('SUBTRACT', 1, s.mul(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .6, 'Detail': 2}).outputs['Factor'], .35))
        return s.mul(s.mapa(dist, meia, s.add(meia, bisel), 1, 0), prof, fundo)

    def tex_pedra(s, vec, tam, prof, desg):
        """Pedra irregular: Voronoi distorcido; cada pedra com altura e inclinação próprias, borda gasta diferente, lascas,
        rachadura interna em ~15 % das pedras e grão."""
        vd = s.distorce(vec, s.mul(tam, s.kn('Pedra', 'distorcao')))
        esc = s.mat('DIVIDE', 1.0, tam)
        vor = lambda f: s.no('ShaderNodeTexVoronoi', {'Vector': vd, 'Scale': esc}, voronoi_dimensions='3D', feature=f)
        f1 = vor('F1')
        r = s.xyz(f1.outputs['Color'])
        (cx, cy, _), (x, y, _) = s.xyz(f1.outputs['Position']), s.xyz(vd)
        dist = s.mul(vor('DISTANCE_TO_EDGE').outputs['Distance'], tam)
        vao = s.add(s.kn('Pedra', 'vao'), s.mul(r[1], .5), s.mul(desg, s.kn('Pedra', 'vao_desgaste')))  # meia-largura do vão entre as pedras: 0,5–1,6 mm
        larg = s.add(s.kn('Pedra', 'bisel'), s.mul(r[2], s.add(.6, s.mul(desg, 1.0))))  # bisel almofadado, cada pedra gasta de um jeito
        junta = s.add(s.mul(s.mapa(dist, vao, s.add(vao, larg), 1, 0), prof), s.mul(s.mapa(dist, 0, s.mul(tam, .35), 1, 0), s.kn('Pedra', 'domo')))  # + domo suave
        cascalho = s.mul(s.mapa(dist, s.mat('SUBTRACT', vao, .3), vao, 1, 0), s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .9, 'Detail': 3}).outputs['Factor'], s.kn('Pedra', 'cascalho'))
        junta = s.mat('MAXIMUM', s.mat('SUBTRACT', junta, cascalho), 0)  # chão áspero entre as pedras
        ang = s.mul(r[1], 6.2831853)
        rampa = s.add(s.mul(s.mat('SUBTRACT', x, cx), s.mat('COSINE', ang)), s.mul(s.mat('SUBTRACT', y, cy), s.mat('SINE', ang)))
        incl = s.mat('MAXIMUM', s.add(s.mul(s.mat('DIVIDE', rampa, tam), s.kn('Pedra', 'inclinacao')), .1), 0)  # até ~0,25 mm de desnível dentro da pedra
        vr = s.vec(*[s.add(c, 51.7) for c in s.xyz(vd)])
        d2 = s.mul(s.no('ShaderNodeTexVoronoi', {'Vector': vr, 'Scale': s.mat('DIVIDE', 1.0, s.mul(tam, .45))}, voronoi_dimensions='3D', feature='DISTANCE_TO_EDGE').outputs['Distance'], tam, .45)
        racha = s.mul(s.mat('GREATER_THAN', r[0], s.mat('SUBTRACT', s.mat('SUBTRACT', 1, s.kn('Pedra', 'rachadas')), s.mul(desg, .08))), s.mapa(d2, 0, .9, 1, 0), s.mapa(dist, 1.5, 3, 0, 1), s.kn('Pedra', 'racha_fundo'))
        return s.add(junta, s.mul(r[0], s.kn('Pedra', 'altura_var')), incl, racha, s.lasca(dist, vec, desg, s.kn('Pedra', 'lasca_largura'), s.kn('Pedra', 'lasca_fundo')), s.grao(vec, s.kn('Pedra', 'grao')))

    def tex_tijolo(s, vec, ds, tam, prof, desg):
        """Tijolo em fiadas: argamassa funda e irregular, tijolo recuado/saliente e levemente torto, quinas quebradas,
        tijolo faltando com desgaste alto, poros e grão."""
        x, y, _ = s.xyz(s.distorce(vec, .3, .2))
        h = s.mul(tam, s.kn('Tijolo', 'altura'))
        dist, (du, dv), fu, fv, r, bw = s.grade(x, y, ds, s.mul(tam, s.kn('Tijolo', 'comprimento')), h, .5)
        junta = s.junta_perfil(dist, s.kn('Tijolo', 'argamassa'), s.add(s.kn('Tijolo', 'bisel'), s.mul(r[2], .6), s.mul(desg, .6)), prof, vec)
        torto = s.mul(s.mat('SUBTRACT', s.mat('DIVIDE', fu, bw), .5), s.mat('SUBTRACT', r[1], .5), s.kn('Tijolo', 'torto'))
        peca = s.mat('MAXIMUM', s.add(s.mul(r[0], s.kn('Tijolo', 'altura_var')), torto, .12), 0)
        quina = s.mat('SQRT', s.add(s.mul(du, du), s.mul(dv, dv)))
        quebra = s.mul(s.mat('GREATER_THAN', r[1], s.mat('SUBTRACT', s.mat('SUBTRACT', 1, s.kn('Tijolo', 'quebrados')), s.mul(desg, .3))), s.mapa(quina, 0, s.add(1.2, s.mul(r[0], 1.5)), 1, 0), s.kn('Tijolo', 'quebra_fundo'))
        falta = s.mul(s.mat('GREATER_THAN', r[2], s.mat('SUBTRACT', 1, s.mul(desg, s.kn('Tijolo', 'faltando')))), s.mul(prof, .8))
        poro = s.mul(s.mapa(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .9, 'Detail': 2}).outputs['Factor'], .64, .68, 0, 1), desg, s.kn('Tijolo', 'poros'))
        return s.add(s.mat('MAXIMUM', junta, falta), peca, quebra, poro, s.lasca(dist, vec, desg, 1.6, s.kn('Tijolo', 'lasca_fundo')), s.grao(vec, s.kn('Tijolo', 'grao')))

    def tex_lajota(s, vec, ds, tam, prof, desg):
        """Lajota quadrada: desnível e inclinação por peça, junta com sujeira, cantos lascados e rachadura diagonal em ~20 %."""
        x, y, _ = s.xyz(s.distorce(vec, .2, .2))
        L = s.mul(tam, s.kn('Lajota', 'lado'))
        dist, (du, dv), fu, fv, r, _ = s.grade(x, y, ds, L, L, 0)
        junta = s.mul(s.junta_perfil(dist, s.kn('Lajota', 'junta'), s.add(s.kn('Lajota', 'bisel'), s.mul(desg, .5)), prof, vec), s.kn('Lajota', 'junta_fundo'))
        ang = s.mul(r[1], 6.2831853)
        rampa = s.add(s.mul(s.mat('SUBTRACT', fu, s.mul(L, .5)), s.mat('COSINE', ang)), s.mul(s.mat('SUBTRACT', fv, s.mul(L, .5)), s.mat('SINE', ang)))
        incl = s.mat('MAXIMUM', s.add(s.mul(s.mat('DIVIDE', rampa, L), s.kn('Lajota', 'inclinacao')), .25), 0)
        diag = s.mat('ABSOLUTE', s.mat('SUBTRACT', fu, s.mat('SUBTRACT', L, fv)))  # a diagonal da lajota
        racha = s.mul(s.mat('GREATER_THAN', r[2], s.mat('SUBTRACT', s.mat('SUBTRACT', 1, s.kn('Lajota', 'rachadas')), s.mul(desg, .1))), s.mapa(diag, 0, .9, 1, 0), s.mapa(dist, 1.0, 2.0, 0, 1), s.kn('Lajota', 'racha_fundo'))
        quina = s.mat('SQRT', s.add(s.mul(du, du), s.mul(dv, dv)))
        lasca = s.mul(s.mat('GREATER_THAN', r[0], s.mat('SUBTRACT', s.mat('SUBTRACT', 1, s.kn('Lajota', 'lascadas')), s.mul(desg, .3))), s.mapa(quina, 0, 2.2, 1, 0), s.kn('Lajota', 'lasca_fundo'))
        return s.add(junta, s.mul(r[0], s.kn('Lajota', 'altura_var')), incl, racha, lasca, s.grao(vec, s.kn('Lajota', 'grao')))

    def tex_tabuas(s, u, v, vec, ds, tam, prof, desg):
        """Tábuas: comprimento variado, frestas, tábua empenada (ponta alta/baixa) e abaulada, veio esticado, nós da madeira,
        pregos martelados (anel afundado) perto das pontas e pontas gastas."""
        h = s.mul(tam, s.kn('Tabuas', 'largura'))
        dist, (du, dv), fu, fv, r, L = s.grade(u, v, ds, s.mul(tam, s.kn('Tabuas', 'comprimento')), h, .33, var=s.kn('Tabuas', 'variacao'))
        junta = s.mul(s.mapa(dist, s.kn('Tabuas', 'fresta'), s.add(1.0, s.mul(desg, .6)), 1, 0), prof)
        emp = s.mul(s.mat('SUBTRACT', s.mat('DIVIDE', fu, L), .5), s.mat('SUBTRACT', r[1], .5), s.kn('Tabuas', 'empeno'))  # empenada ao longo
        meio = s.mat('SUBTRACT', s.mat('DIVIDE', fv, h), .5)
        abaul = s.mul(meio, meio, s.kn('Tabuas', 'abaulado'))  # levemente abaulada na largura
        peca = s.mat('MAXIMUM', s.add(s.mul(r[0], .25), emp, abaul, .2), 0)
        fase = s.add(s.mul(v, 2.4), s.mul(s.no('ShaderNodeTexNoise', {'Vector': s.vec(s.mul(u, .08), v, ds), 'Scale': .5, 'Detail': 3}).outputs['Factor'], 9))
        veio = s.mul(s.add(.5, s.mul(s.mat('SINE', fase), .5)), s.kn('Tabuas', 'veio'))
        kx, ky = s.mul(L, s.add(.25, s.mul(r[2], .5))), s.mul(h, s.add(.3, s.mul(r[0], .4)))
        dk = s.mat('SQRT', s.add(s.mul(s.mat('SUBTRACT', fu, kx), s.mat('SUBTRACT', fu, kx), .35), s.mul(s.mat('SUBTRACT', fv, ky), s.mat('SUBTRACT', fv, ky))))
        no_ = s.mul(s.mat('GREATER_THAN', r[2], s.mat('SUBTRACT', 1, s.kn('Tabuas', 'nos'))), s.mapa(dk, .6, 1.6, 1, 0), s.add(.2, s.mul(s.add(.5, s.mul(s.mat('SINE', s.mul(dk, 5)), .5)), .2)))
        px = s.mat('MINIMUM', s.mat('ABSOLUTE', s.mat('SUBTRACT', fu, s.kn('Tabuas', 'prego_dist'))), s.mat('ABSOLUTE', s.mat('SUBTRACT', fu, s.mat('SUBTRACT', L, s.kn('Tabuas', 'prego_dist')))))
        dp = s.mat('SQRT', s.add(s.mul(px, px), s.mul(s.mat('SUBTRACT', fv, s.mul(h, .5)), s.mat('SUBTRACT', fv, s.mul(h, .5)))))
        prego = s.mul(s.mapa(s.mat('ABSOLUTE', s.mat('SUBTRACT', dp, .75)), .2, .45, 1, 0), s.kn('Tabuas', 'prego_fundo'))
        ponta = s.mul(s.mapa(du, 0, 2.5, 1, 0), desg, s.kn('Tabuas', 'ponta_gasta'))
        return s.add(junta, peca, veio, no_, prego, ponta, s.grao(vec, s.kn('Tabuas', 'grao')))

    def tex_lisa(s, u, v, vec, ds, tam):
        """Lisa: placas grandes (2·tamanho) quase planas, junta rasa de 0,3 mm (como os pisos 'limpos' das originais) e grão mínimo."""
        L = s.mul(tam, s.kn('Lisa', 'placa'))
        dist, *_ = s.grade(u, v, ds, L, L, 0)
        return s.add(s.mul(s.mapa(dist, .25, .7, 1, 0), s.kn('Lisa', 'junta_fundo')), s.grao(vec, s.kn('Lisa', 'grao')))

    def seixos(s, vec, cel, dens, topo):
        """Pedrinhas soltas: Voronoi de célula `cel` mm; cada célula tem uma pedra com chance `dens`, raio e altura próprios.
        Devolve a profundidade da face da pedra (topo a `topo`·0,5..1,5 mm; fora da pedra, 9 mm): junte ao chão com MINIMUM."""
        x, y, z = s.xyz(s.distorce(vec, s.mul(cel, .15), .3))
        p = s.vec(s.add(x, s.mul(z, .37)), s.add(y, s.mul(z, .23)), 0)  # 2D: em 3D o plano corta longe da maioria dos centros
        f1 = s.no('ShaderNodeTexVoronoi', {'Vector': p, 'Scale': s.mat('DIVIDE', 1.0, cel)}, voronoi_dimensions='2D', feature='F1')
        r = s.xyz(f1.outputs['Color'])
        raio = s.mul(cel, s.add(.28, s.mul(r[1], .17)))
        domo = s.mapa(s.mat('DIVIDE', s.mul(f1.outputs['Distance'], cel), raio), .35, 1, 1, 0)  # topo achatado, flanco íngreme
        return s.add(s.mul(topo, s.add(.5, r[2])), s.mul(s.mat('SUBTRACT', 1, domo), 2.0), s.mul(s.mat('GREATER_THAN', r[0], dens), 9))

    def tex_rachado(s, vec, ds, tam, prof, desg):
        """Piso rachado: lajotas grandes (tex_lajota) cortadas por uma rede de rachaduras de largura variável que aparece em
        manchas; alguns cacos afundados (mais com desgaste) e borda lascada junto da rachadura."""
        base = s.tex_lajota(vec, ds, s.mul(tam, s.kn('Rachado', 'lajota')), prof, desg)
        k = s.mul(tam, 1.1)
        vd = s.distorce(vec, s.mul(tam, .25), .15)
        vor = lambda f: s.no('ShaderNodeTexVoronoi', {'Vector': vd, 'Scale': s.mat('DIVIDE', 1.0, k)}, voronoi_dimensions='3D', feature=f)
        dist = s.mul(vor('DISTANCE_TO_EDGE').outputs['Distance'], k)
        r = s.xyz(vor('F1').outputs['Color'])
        lim = s.mat('SUBTRACT', s.kn('Rachado', 'manchas'), s.mul(desg, .25))
        rede = s.mapa(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .07, 'Detail': 2}).outputs['Factor'], lim, s.add(lim, .08), 0, 1)  # onde o piso rachou
        larg = s.add(s.kn('Rachado', 'racha_largura'), s.mul(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .3}).outputs['Factor'], .8))
        racha = s.mul(s.mapa(dist, 0, larg, 1, 0), rede, s.kn('Rachado', 'racha_fundo'))
        caco = s.mul(s.mat('GREATER_THAN', r[0], s.mat('SUBTRACT', s.mat('SUBTRACT', 1, s.kn('Rachado', 'cacos')), s.mul(desg, .15))), rede, s.add(.5, s.mul(r[1], .5)))
        return s.add(s.mat('MAXIMUM', base, s.mat('MAXIMUM', racha, caco)), s.mul(s.lasca(dist, vec, desg, 1.5, s.kn('Rachado', 'lasca_fundo')), rede))

    def tex_terra(s, vec, tam, desg):
        """Terra batida: torrões irregulares e grão sobre um chão 1,45 mm abaixo do topo; pedrinhas meio enterradas
        (mais com desgaste) e pedras maiores raras saem do chão."""
        n = s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .12, 'Detail': 3}).outputs['Factor']
        torrao = s.mul(s.mapa(n, .35, .65, 0, 1), s.add(s.kn('Terra', 'torrao'), s.mul(desg, .2)))
        fino = s.mul(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .7, 'Detail': 2}).outputs['Factor'], s.kn('Terra', 'fino'))
        chao = s.add(s.kn('Terra', 'chao'), torrao, fino)
        vr = s.vec(*[s.add(c, 23.1) for c in s.xyz(vec)])
        pedra = s.mat('MINIMUM', s.seixos(vec, s.mul(tam, s.kn('Terra', 'seixos_tam')), s.add(s.kn('Terra', 'seixos'), s.mul(desg, .3)), .5), s.seixos(vr, s.mul(tam, .9), s.kn('Terra', 'pedras'), .35))
        return s.add(s.mat('MINIMUM', chao, pedra), s.grao(vec, s.kn('Terra', 'grao')))

    def tex_areia(s, u, v, vec, tam, desg):
        """Areia: dunas suaves, ondulações de vento assimétricas (subida longa, descida curta) que somem e voltam,
        pedrinhas raras (mais com desgaste) e grão fino."""
        aviso = s.mul(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .06}).outputs['Factor'], 6)
        t = s.mat('FRACT', s.mat('DIVIDE', s.add(s.mul(u, .85), s.mul(v, .5), aviso), s.mul(tam, s.kn('Areia', 'onda_passo'))))
        crista = s.mat('MINIMUM', s.mapa(t, 0, .75, 0, 1), s.mapa(t, .75, 1, 1, 0))
        mascara = s.mapa(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .08}).outputs['Factor'], .35, .7, .15, 1)
        onda = s.mul(s.mat('SUBTRACT', 1, crista), mascara, s.kn('Areia', 'onda'))
        duna = s.mul(s.mapa(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .045, 'Detail': 2}).outputs['Factor'], .3, .7, 0, 1), s.add(s.kn('Areia', 'duna'), s.mul(desg, .35)))
        pedra = s.seixos(vec, s.mul(tam, 1.1), s.add(s.kn('Areia', 'seixos'), s.mul(desg, .2)), .3)
        return s.add(s.mat('MINIMUM', s.add(s.kn('Areia', 'nivel'), onda, duna), pedra), s.grao(vec, s.kn('Areia', 'grao')))

    def tex_caverna(s, vec, tam, prof, desg):
        """Chão de rocha: lajes grandes (Voronoi distorcido, 1,3·tamanho) com altura e inclinação próprias, superfície em cristas,
        fendas fundas de largura irregular com cascalho, rachaduras finas, lascas, pedregulhos soltos e grão."""
        T = s.mul(tam, s.kn('Caverna', 'laje'))
        vd = s.distorce(vec, s.mul(T, .2))
        vor = lambda f: s.no('ShaderNodeTexVoronoi', {'Vector': vd, 'Scale': s.mat('DIVIDE', 1.0, T)}, voronoi_dimensions='3D', feature=f)
        f1 = vor('F1')
        r = s.xyz(f1.outputs['Color'])
        (cx, cy, _), (x, y, _) = s.xyz(f1.outputs['Position']), s.xyz(vd)
        dist = s.mul(vor('DISTANCE_TO_EDGE').outputs['Distance'], T)
        vao = s.add(s.kn('Caverna', 'vao'), s.mul(r[1], .6), s.mul(desg, .5))
        fenda = s.mul(s.mapa(dist, vao, s.add(vao, .8, s.mul(r[2], 1.2)), 1, 0), prof, s.kn('Caverna', 'fenda_fundo'))
        cascalho = s.mul(s.mapa(dist, s.mat('SUBTRACT', vao, .3), vao, 1, 0), s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .9, 'Detail': 3}).outputs['Factor'], s.kn('Caverna', 'cascalho'))
        fenda = s.mat('MAXIMUM', s.mat('SUBTRACT', fenda, cascalho), 0)
        ang = s.mul(r[1], 6.2831853)
        rampa = s.add(s.mul(s.mat('SUBTRACT', x, cx), s.mat('COSINE', ang)), s.mul(s.mat('SUBTRACT', y, cy), s.mat('SINE', ang)))
        incl = s.mat('MAXIMUM', s.add(s.mul(s.mat('DIVIDE', rampa, T), s.kn('Caverna', 'inclinacao')), .2), 0)
        n = s.no('ShaderNodeTexNoise', {'Vector': vd, 'Scale': .2, 'Detail': 4, 'Roughness': .6}).outputs['Factor']
        rugas = s.mul(s.mat('ABSOLUTE', s.mat('SUBTRACT', s.mul(n, 2), 1)), s.kn('Caverna', 'rugas'))  # cristas: vales em V entre as rugas
        vr = s.vec(*[s.add(c, 51.7) for c in s.xyz(vd)])
        d2 = s.mul(s.no('ShaderNodeTexVoronoi', {'Vector': vr, 'Scale': s.mat('DIVIDE', 1.0, s.mul(T, .4))}, voronoi_dimensions='3D', feature='DISTANCE_TO_EDGE').outputs['Distance'], T, .4)
        racha = s.mul(s.mat('GREATER_THAN', r[0], .55), s.mapa(d2, 0, .7, 1, 0), s.mapa(dist, 1.5, 3, 0, 1), s.kn('Caverna', 'racha_fundo'))
        rocha = s.add(fenda, s.mul(r[0], s.kn('Caverna', 'altura_var')), incl, rugas, racha, s.lasca(dist, vec, desg, 2.5, s.kn('Caverna', 'lasca_fundo')))
        pedra = s.seixos(vec, s.mul(tam, .8), s.add(s.kn('Caverna', 'seixos'), s.mul(desg, .2)), .4)
        return s.add(s.mat('MINIMUM', rocha, pedra), s.grao(vec, s.kn('Caverna', 'grao')))

    def tex_agua(s, vec, tam, prof, desg):
        """Água: pedra (tex_pedra) na margem; nas manchas (maiores com desgaste), espelho d'água 2 mm abaixo do topo com ondas
        (seno do ruído = anéis) e marola fina; pedras saem da água."""
        base = s.tex_pedra(vec, tam, prof, desg)
        n, m = s._mancha(vec, .05, s.mat('SUBTRACT', s.kn('Agua', 'manchas'), s.mul(desg, .2)), .2)
        fino = s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .35, 'Detail': 2}).outputs['Factor']
        onda = s.add(s.mul(s.add(.5, s.mul(s.mat('SINE', s.mul(n, 55)), .5)), s.kn('Agua', 'onda')), s.mul(fino, s.kn('Agua', 'marola')))
        pedra = s.seixos(vec, s.mul(tam, .9), s.add(s.kn('Agua', 'seixos'), s.mul(desg, .1)), 1.2)
        agua = s.mat('MINIMUM', s.add(s.kn('Agua', 'nivel'), onda), pedra)
        return s.add(s.mul(base, s.mat('SUBTRACT', 1, m)), s.mul(agua, m))

    def tex_lava(s, vec, tam, prof, desg):
        """Rio de lava: pedra (tex_pedra) fora da mancha; dentro, linhas de fluxo em curva (seno do ruído) 1,85 mm abaixo do topo
        e placas de crosta soltas (Voronoi) mais altas, com borda arredondada; menos crosta com mais desgaste."""
        base = s.tex_pedra(vec, tam, prof, desg)
        vl = s.vec(*[s.add(c, 37.0) for c in s.xyz(vec)])
        _, m = s._mancha(vl, .06, s.mat('SUBTRACT', s.kn('Lava', 'manchas'), s.mul(desg, .15)), .18)
        n2 = s.no('ShaderNodeTexNoise', {'Vector': vl, 'Scale': .07, 'Detail': 2}).outputs['Factor']
        fluxo = s.add(s.kn('Lava', 'nivel'), s.mul(s.add(.5, s.mul(s.mat('SINE', s.mul(n2, 45)), .5)), s.kn('Lava', 'fluxo')))
        k = s.mul(tam, s.kn('Lava', 'crosta_tam'))
        vd = s.distorce(vec, s.mul(k, .2))
        vor = lambda f: s.no('ShaderNodeTexVoronoi', {'Vector': vd, 'Scale': s.mat('DIVIDE', 1.0, k)}, voronoi_dimensions='3D', feature=f)
        r = s.xyz(vor('F1').outputs['Color'])
        borda = s.mul(vor('DISTANCE_TO_EDGE').outputs['Distance'], k)
        crosta = s.add(s.kn('Lava', 'crosta_nivel'), s.mul(r[1], .25), s.mul(s.mapa(borda, 0, 1.4, 1, 0), 9), s.mul(s.mat('LESS_THAN', r[0], s.add(s.mat('SUBTRACT', 1, s.kn('Lava', 'crosta')), s.mul(desg, .25))), 9))
        lava = s.add(s.mat('MINIMUM', fluxo, crosta), s.grao(vec, .05))
        return s.add(s.mul(base, s.mat('SUBTRACT', 1, m)), s.mul(lava, m))

    def tex_nichos(s, u, v, vec, ds, tam, prof, desg):
        """Parede de cripta: blocos em fiadas, cada um com um nicho em arco (fundo 1,4·prof); ~55 % dos nichos guardam
        um volume (caveira, pote); bloco com altura própria, junta, borda do nicho lascada e grão."""
        h = s.mul(tam, s.kn('Nichos', 'altura'))
        dist, _, fu, fv, r, bw = s.grade(u, v, ds, s.mul(tam, s.kn('Nichos', 'comprimento')), h, .5)
        cx, w, m0 = s.mat('SUBTRACT', fu, s.mul(bw, .5)), s.mul(bw, s.kn('Nichos', 'largura')), s.mul(h, .14)
        topo = s.add(m0, s.mul(h, .42))
        sq = lambda a: s.mul(a, a)
        arco = s.mat('SUBTRACT', s.mat('SQRT', s.add(sq(cx), sq(s.mat('SUBTRACT', fv, topo)))), w)
        reto = s.mat('MAXIMUM', s.mat('SUBTRACT', s.mat('ABSOLUTE', cx), w), s.mat('SUBTRACT', m0, fv))
        acima = s.mat('GREATER_THAN', fv, topo)
        d = s.add(s.mul(arco, acima), s.mul(reto, s.mat('SUBTRACT', 1, acima)))  # mm até a borda do nicho (< 0 dentro)
        fundo = s.mul(prof, s.kn('Nichos', 'fundo'), s.add(.85, s.mul(r[0], .3)))
        nicho = s.mul(s.mapa(d, -1.3, .3, 1, 0), fundo)  # flanco de 1,6 mm: borda íngreme dobra a malha da parede
        dv = s.mat('SQRT', s.add(sq(cx), sq(s.mat('SUBTRACT', fv, s.add(m0, s.mul(w, .75))))))
        volume = s.mul(s.mapa(dv, s.mul(w, .3), s.mul(w, .75), 1, 0), s.mat('LESS_THAN', r[1], s.kn('Nichos', 'volumes')), fundo, .75)
        junta = s.junta_perfil(dist, s.kn('Nichos', 'junta'), .7, s.mul(prof, .6), vec)
        return s.add(s.mat('MAXIMUM', s.mat('SUBTRACT', nicho, volume), junta), s.mul(r[2], s.kn('Nichos', 'altura_var')), s.lasca(s.mat('ABSOLUTE', d), vec, desg, 1.0, s.kn('Nichos', 'lasca_fundo')), s.grao(vec, s.kn('Nichos', 'grao')))

    def tex_glifos(s, u, v, vec, ds, tam, prof, desg):
        """Glifos: blocos de pedra em fiadas; cada bloco tem um painel rebaixado (0,35 mm) com glifos gravados (0,55 mm, traço ≥ 0,8 mm):
        células de 0,8·tamanho, cada uma sorteia 1 de 5 glifos (anel, cruz, 3 barras, onda, olho) por SDF; o desgaste apaga parte dos traços."""
        h = s.mul(tam, s.kn('Glifos', 'altura'))
        bd, _, fu, fv, rb, bw = s.grade(u, v, ds, s.mul(tam, s.kn('Glifos', 'comprimento')), h, .5)
        dp = s.mat('MAXIMUM', s.mat('SUBTRACT', s.mat('ABSOLUTE', s.mat('SUBTRACT', fu, s.mul(bw, .5))), s.mat('SUBTRACT', s.mul(bw, .5), 2.4)),
                   s.mat('SUBTRACT', s.mat('ABSOLUTE', s.mat('SUBTRACT', fv, s.mul(h, .5))), s.mat('SUBTRACT', s.mul(h, .5), 2.4)))  # mm até a borda do painel (< 0 dentro)
        painel = s.mul(s.mapa(dp, -.3, .4, 1, 0), s.kn('Glifos', 'painel'))
        S = s.mul(tam, s.kn('Glifos', 'celula'))
        k = s.mat('DIVIDE', S, 6.0)  # os glifos são desenhados numa célula de 6 mm
        cu, cv = (s.mat('SUBTRACT', s.mat('FLOORED_MODULO', c, S), s.mul(S, .5)) for c in (u, v))
        x, y = s.mat('DIVIDE', cu, k), s.mat('DIVIDE', cv, k)
        ids = s.vec(s.mat('FLOOR', s.mat('DIVIDE', u, S)), s.mat('FLOOR', s.mat('DIVIDE', v, S)), ds)
        sel = s.mat('MINIMUM', s.mat('FLOOR', s.mul(s.no('ShaderNodeTexWhiteNoise', {'Vector': ids}, noise_dimensions='3D').outputs['Value'], 5)), 4)
        sq = lambda a: s.mul(a, a)
        raio = lambda: s.mat('SQRT', s.add(sq(x), sq(y)))
        seg_v = lambda xx, L: s.mat('SQRT', s.add(sq(xx), sq(s.mat('MAXIMUM', s.mat('SUBTRACT', s.mat('ABSOLUTE', y), L), 0))))
        seg_h = lambda L: s.mat('SQRT', s.add(sq(y), sq(s.mat('MAXIMUM', s.mat('SUBTRACT', s.mat('ABSOLUTE', x), L), 0))))
        mn = lambda *a: functools.reduce(lambda p, q: s.mat('MINIMUM', p, q), a)
        formas = (s.mat('ABSOLUTE', s.mat('SUBTRACT', raio(), 1.9)), mn(seg_v(x, 2.3), seg_h(2.3)),
                  mn(seg_v(s.mat('SUBTRACT', x, -1.7), 2.2), seg_v(x, 2.2), seg_v(s.mat('SUBTRACT', x, 1.7), 2.2)),
                  s.mul(s.mat('ABSOLUTE', s.mat('SUBTRACT', y, s.mul(s.mat('SINE', s.mul(x, 1.8)), 1.1))), .75),
                  mn(s.mat('ABSOLUTE', s.mat('SUBTRACT', raio(), .8)), seg_h(2.5)))
        tot = s.add(*[s.mul(s.mat('COMPARE', sel, q, .1), s.mapa(s.mul(d, k), .45, 1.55, 1, 0)) for q, d in enumerate(formas)])  # flanco largo: ≤ 45° na parede
        gasto = s.mapa(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .25, 'Detail': 2}).outputs['Factor'], s.mat('SUBTRACT', .7, s.mul(desg, .3)), .75, 1, .5)
        glifo = s.mul(tot, s.mapa(dp, -1.6, -.9, 1, 0), gasto, s.kn('Glifos', 'glifo_fundo'))
        junta = s.junta_perfil(bd, .45, .7, prof, vec)
        return s.add(s.mat('MAXIMUM', s.add(painel, glifo), junta), s.mul(rb[0], s.kn('Glifos', 'altura_var')), s.lasca(bd, vec, desg, 1.4, s.kn('Glifos', 'lasca_fundo')), s.grao(vec, s.kn('Glifos', 'grao')))

    def tex_casco(s, u, v, vec, ds, tam, prof, desg):
        """Casco trincado: tábuas em fiadas (h = 0,55·tamanho, comprimento variado); cada fiada sobrepõe a de baixo (rampa até 0,6·prof
        e degrau seco no topo); tábua com altura e empeno próprios, junta de topo, cavilhas perto das pontas, veio, pontas gastas e grão."""
        h = s.mul(tam, s.kn('Casco', 'altura'))
        dist, (du, dv), fu, fv, r, L = s.grade(u, v, ds, s.mul(tam, s.kn('Casco', 'comprimento')), h, .4, var=s.kn('Casco', 'variacao'))
        t = s.mat('DIVIDE', fv, h)
        perfil = s.mul(s.mat('MAXIMUM', s.mapa(t, 0, .55, 1, 0), s.mapa(t, .9, 1.0, 0, 1)), prof, s.kn('Casco', 'sobreposicao'))  # sobreposição: fundo embaixo, degrau em cima
        topo = s.mul(s.mapa(du, .3, 1.2, 1, 0), prof, s.kn('Casco', 'junta_topo'))
        emp = s.mat('MAXIMUM', s.add(s.mul(s.mat('SUBTRACT', s.mat('DIVIDE', fu, L), .5), s.mat('SUBTRACT', r[1], .5), s.kn('Casco', 'empeno')), s.mul(r[0], s.kn('Casco', 'altura_var')), .1), 0)
        fase = s.add(s.mul(v, 2.4), s.mul(s.no('ShaderNodeTexNoise', {'Vector': s.vec(s.mul(u, .08), v, ds), 'Scale': .5, 'Detail': 3}).outputs['Factor'], 9))
        veio = s.mul(s.add(.5, s.mul(s.mat('SINE', fase), .5)), s.kn('Casco', 'veio'))
        px = s.mat('MINIMUM', s.mat('ABSOLUTE', s.mat('SUBTRACT', fu, s.kn('Casco', 'cavilha_dist'))), s.mat('ABSOLUTE', s.mat('SUBTRACT', fu, s.mat('SUBTRACT', L, s.kn('Casco', 'cavilha_dist')))))
        dc = s.mat('SQRT', s.add(s.mul(px, px), s.mul(s.mat('SUBTRACT', fv, s.mul(h, .6)), s.mat('SUBTRACT', fv, s.mul(h, .6)))))
        cavilha = s.mul(s.mapa(dc, .35, .7, 1, 0), s.kn('Casco', 'cavilha_fundo'))
        ponta = s.mul(s.mapa(du, 0, 2.5, 1, 0), desg, s.kn('Casco', 'ponta_gasta'))
        return s.add(s.mat('MAXIMUM', perfil, topo), emp, veio, cavilha, ponta, s.lasca(dist, vec, desg, 1.2, s.kn('Casco', 'lasca_fundo')), s.grao(vec, s.kn('Casco', 'grao')))

    def tex_metal(s, u, v, vec, ds, tam, prof, desg):
        """Chapas rebitadas: placas alinhadas (1,6·tamanho × tamanho) com costura chanfrada; cada placa com altura, inclinação e
        amassados próprios; rebites em cúpula (0,45 mm acima da placa) nos cantos e no meio das bordas longas; corrosão em
        pontos (mais com desgaste) e grão."""
        h = s.mul(tam, s.kn('Metal', 'altura'))
        dist, (du, dv), fu, fv, r, bw = s.grade(u, v, ds, s.mul(tam, s.kn('Metal', 'comprimento')), h, 0)
        junta = s.junta_perfil(dist, s.kn('Metal', 'costura'), .6, s.mul(prof, s.kn('Metal', 'costura_fundo')), vec)
        amassado = s.mul(s.no('ShaderNodeTexNoise', {'Vector': s.vec(*[s.add(c, s.mul(r[2], 9)) for c in s.xyz(vec)]), 'Scale': .15, 'Detail': 1}).outputs['Factor'], s.kn('Metal', 'amassado'))
        ang = s.mul(r[1], 6.2831853)
        rampa = s.add(s.mul(s.mat('SUBTRACT', fu, s.mul(bw, .5)), s.mat('COSINE', ang)), s.mul(s.mat('SUBTRACT', fv, s.mul(h, .5)), s.mat('SINE', ang)))
        placa = s.add(.5, s.mul(r[0], s.kn('Metal', 'altura_var')), s.mat('MAXIMUM', s.mul(s.mat('DIVIDE', rampa, bw), s.kn('Metal', 'inclinacao')), 0), amassado)
        sq = lambda a: s.mul(a, a)
        rd = s.kn('Metal', 'rebite_dist')
        canto = s.mat('SQRT', s.add(sq(s.mat('SUBTRACT', du, rd)), sq(s.mat('SUBTRACT', dv, rd))))
        meio = s.mat('SQRT', s.add(sq(s.mat('SUBTRACT', fu, s.mul(bw, .5))), sq(s.mat('SUBTRACT', dv, rd))))
        rebite = s.mul(s.mapa(s.mat('MINIMUM', canto, meio), .5, s.kn('Metal', 'rebite_raio'), 1, 0), s.add(placa, -.05))  # cúpula de 1,35 mm: na malha de 0,5 mm um rebite menor vira ponta
        lim = s.mat('SUBTRACT', s.mat('SUBTRACT', 1, s.kn('Metal', 'corrosao')), s.mul(desg, .12))
        corrosao = s.mul(s.mapa(s.no('ShaderNodeTexNoise', {'Vector': vec, 'Scale': .8, 'Detail': 3}).outputs['Factor'], lim, s.add(lim, .05), 0, 1), s.kn('Metal', 'corrosao_fundo'))
        return s.add(s.mat('MAXIMUM', s.mat('SUBTRACT', placa, rebite), junta), corrosao, s.grao(vec, s.kn('Metal', 'grao')))

    def textura(s, idx, onde, px, py, pz, ds, tam, prof, desg, ox, oy):
        """Profundidade de corte (mm ≥ 0, a partir de altura_liso) da textura `idx` em coordenadas GLOBAIS (posicao_x/y somam o bloco: padrão contínuo entre vizinhos).
        Cada textura é um grupo de nós próprio (DB_Tex_<Nome>_<onde>); o Index Switch escolhe uma (índice de valor único: só ela é avaliada)."""
        vals = (s.mat('ADD', px, ox), s.mat('ADD', py, oy), pz, py, ds, tam, prof, desg)
        sw = s.no('GeometryNodeIndexSwitch', data_type='FLOAT')
        while len(sw.index_switch_items) < len(TEXTURAS):
            sw.index_switch_items.new()
        s.lig(sw.inputs['Index'], idx)
        for k in range(len(TEXTURAS)):
            n = s.no('GeometryNodeGroup', node_tree=grupo_tex(k, onde))
            for c, v in zip(CAMPOS_TEX, vals):
                s.lig(n.inputs[c], v)
            for i in n.inputs[len(CAMPOS_TEX):]:  # parâmetros da textura (Gr.kn): do slider do topo, se ele tiver
                if i.name in s.ent.outputs:
                    s.ng.links.new(s.ent.outputs[i.name], i)
            s.ng.links.new(n.outputs[0], sw.inputs[k + 1])
        return sw.outputs[0]

    def tex(s, k, onde, gx, gy, pz, py, ds, tam, prof, desg):
        """Campo da textura k (só ela). Piso: (u, v) = (x, y). Parede: u ao longo da parede, v na altura; tábuas ficam em pé."""
        if onde == 'piso':
            u, v, vec, uw, vw = gx, gy, s.vec(gx, gy, ds), gx, gy
        else:
            u, v = gx, pz
            vec = s.vec(gx, pz, s.mat('ADD', ds, s.mat('MULTIPLY', py, .5)))  # sem esticar em z: o flanco da junta horizontal fica ≤ 45°
            uw, vw = pz, gx
        pf = s.mul(prof, s.kn('Relevo', 'junta_piso' if onde == 'piso' else 'junta_parede'))  # junta das texturas realistas
        F = {'Pedra': lambda: s.tex_pedra(vec, tam, pf, desg), 'Lajota': lambda: s.tex_lajota(vec, ds, tam, pf, desg),
             'Rachado': lambda: s.tex_rachado(vec, ds, tam, pf, desg),
             'Tijolo': lambda: s.tex_tijolo(vec, ds, tam, pf, desg),
             'Tabuas': lambda: s.tex_tabuas(uw, vw, s.vec(uw, vw, ds), ds, tam, pf, desg), 'Lisa': lambda: s.tex_lisa(u, v, vec, ds, tam),
             'Terra': lambda: s.tex_terra(vec, tam, desg), 'Areia': lambda: s.tex_areia(u, v, vec, tam, desg),
             'Agua': lambda: s.tex_agua(vec, tam, pf, desg), 'Lava': lambda: s.tex_lava(vec, tam, pf, desg),
             'Nichos': lambda: s.tex_nichos(u, v, vec, ds, tam, pf, desg),
             'Glifos': lambda: s.tex_glifos(u, v, vec, ds, tam, pf, desg), 'Caverna': lambda: s.tex_caverna(vec, tam, pf, desg),
             'Casco': lambda: s.tex_casco(u, v, vec, ds, tam, pf, desg), 'Metal': lambda: s.tex_metal(u, v, vec, ds, tam, pf, desg)}
        nome = TEXTURAS[k]
        if onde != 'piso' and nome in ('Agua', 'Lava'):  # água e lava só no piso
            nome = 'Pedra'
        c = F[nome]()
        return s.mat('MINIMUM', c, s.kn('Relevo', 'teto'))

    def caixa(s, x0, x1, y0, y1, z0, z1, sel, desloc):
        """Cubo subdividido a `s.res` mm entre os limites; vértices de `sel` movidos por `desloc` (campos avaliados em coords do mundo)."""
        r = lambda a, b: s.mat('ROUND', s.mat('ADD', s.mat('DIVIDE', s.mat('SUBTRACT', b, a), s.res), 1))
        med = lambda a, b: s.mat('MULTIPLY', s.mat('ADD', a, b), .5)
        c = s.no('GeometryNodeMeshCube', {'Size': s.vec(s.mat('SUBTRACT', x1, x0), s.mat('SUBTRACT', y1, y0), s.mat('SUBTRACT', z1, z0)),
                                          'Vertices X': r(x0, x1), 'Vertices Y': r(y0, y1), 'Vertices Z': r(z0, z1)})
        t = s.no('GeometryNodeTransform', {'Geometry': c.outputs['Mesh'], 'Translation': s.vec(med(x0, x1), med(y0, y1), med(z0, z1))})
        return s.no('GeometryNodeSetPosition', {'Geometry': t, 'Selection': sel, 'Offset': desloc})


CAMPOS_TEX = ['gx', 'gy', 'pz', 'py', 'fatia', 'tamanho', 'profundidade', 'desgaste']  # entradas de todo grupo DB_Tex_* (gx/gy = coordenadas globais; fatia = semente × 13,7)


def grupo_tex(k, onde):
    """Grupo de nós DB_Tex_<Nome>_<piso|parede>: campo de profundidade da textura k. Criado uma vez e reutilizado (aparece no editor de nós)."""
    nome = f'DB_Tex_{TEXTURAS[k]}_{onde}'
    if nome in bpy.data.node_groups:
        return bpy.data.node_groups[nome]
    g = Gr(nome, [], campos=CAMPOS_TEX)
    g.lig(g.sai.inputs['Profundidade'], g.tex(k, onde, *(g.ent.outputs[c] for c in CAMPOS_TEX)))
    return g.ng


def construir(topo):
    """Grupo GN do topo: recebe o bloco (corpo plano em zt), devolve bloco + laje de pedra (+ paredes), girado por `orientacao`."""
    if topo in OBJETOS:
        return OBJETOS[topo]()
    nome, _, _, params = TOPOS[topo]
    g = Gr(nome, params)
    ent = g.ent.outputs
    sem, des, tam, ori = ent['semente'], ent['desgaste'], ent['tamanho_pedra'], ent['orientacao']
    g.res = g.mat('MAXIMUM', ent['resolucao'], .1)
    prof = g.mat('MAXIMUM', ent['profundidade'], .4)  # relevo mínimo 0,4 mm, mesmo se o slider for forçado
    bb = g.no('GeometryNodeBoundBox', {'Geometry': ent['Geometry']})
    (x0, y0, z0), (x1, y1, zt) = g.xyz(bb.outputs['Min']), g.xyz(bb.outputs['Max'])
    px, py, pz = g.xyz(g.no('GeometryNodeInputPosition').outputs[0])
    ds = g.mat('MULTIPLY', sem, 13.7)  # semente = fatia diferente do campo 3D
    partes = [ent['Geometry']]
    # laje do piso: face de cima (z = zt+RELEVO) cortada pelo relevo
    ox, oy = g.mat('MULTIPLY', ent['posicao_x'], 35), g.mat('MULTIPLY', ent['posicao_y'], 35)
    campo = g.textura(ent['textura_piso'], 'piso', px, py, pz, ds, tam, prof, des, ox, oy)
    db = g.mat('MINIMUM', g.mat('MINIMUM', g.mat('SUBTRACT', px, x0), g.mat('SUBTRACT', x1, px)), g.mat('MINIMUM', g.mat('SUBTRACT', py, y0), g.mat('SUBTRACT', y1, py)))
    rn = g.no('ShaderNodeTexNoise', {'Vector': g.vec(g.mat('ADD', px, ox), g.mat('ADD', py, oy), ds), 'Scale': ent['ruido_borda'], 'Detail': 3}).outputs['Factor']
    borda = g.mul(g.mapa(db, 0, ent['quina_largura'], 1, 0), g.add(.25, g.mul(des, .8)), g.add(.6, g.mul(rn, .8)), ent['quina_gasto'])  # quina do topo gasta

    def divisa(p, a, b):
        """mm até a divisa interna de célula mais próxima (bloco 1×1 na direção: longe de tudo; a borda externa não conta)."""
        nc, t = g.mat('ROUND', g.mat('DIVIDE', g.mat('SUBTRACT', b, a), 35)), g.mat('DIVIDE', g.mat('SUBTRACT', p, a), 35)
        k = g.mat('MINIMUM', g.mat('MAXIMUM', g.mat('ROUND', t), 1), g.mat('MAXIMUM', g.mat('SUBTRACT', nc, 1), 1))
        return g.add(g.mul(g.mat('ABSOLUTE', g.mat('SUBTRACT', t, k)), 35), g.mul(g.mat('LESS_THAN', nc, 1.5), 1000))

    def corte_div(d):
        """Corte (mm) da divisão entre blocos: bisel = V até o fundo; junta = mesmo V × 4, preso em 1 (fundo reto, paredes quase verticais)."""
        v = g.mat('MAXIMUM', g.mat('SUBTRACT', 1, g.mat('DIVIDE', d, g.mul(ent['divisao_largura'], .5))), 0)
        return g.mul(g.mat('MINIMUM', g.mul(v, g.add(1, g.mul(g.mat('COMPARE', ent['divisao'], 1, .1), 3))), 1), ent['divisao_fundo'], g.mat('GREATER_THAN', ent['divisao'], .5))

    dx_div = divisa(px, x0, x1)
    campo = g.mat('MINIMUM', g.add(campo, borda, corte_div(g.mat('MINIMUM', dx_div, divisa(py, y0, y1)))), ent['relevo_teto'])
    inc = 0  # telhado: o topo da laje sobe com a tangente do ângulo ao longo de +y (a textura vira telhas; campo = corte em z sobre o plano inclinado)
    if topo == 'telhado':
        inc = g.mat('MULTIPLY', g.mat('SUBTRACT', py, y0), g.mat('TANGENT', g.mat('RADIANS', ent['angulo_telhado'])))
    topo_l = g.mat('GREATER_THAN', pz, g.mat('ADD', zt, RELEVO - .1))
    cx_, cy_ = g.mul(g.add(x0, x1), .5), g.mul(g.add(y0, y1), .5)
    lado = g.mul(g.add(.2, g.mul(des, .5)), g.add(.4, g.mul(rn, 1.2)), g.mapa(pz, zt, g.mat('ADD', zt, RELEVO), 0, 1), ent['lateral_gasto'])  # recuo da lateral: até ~1 mm no topo
    ex, ey = (g.mapa(g.mat('MINIMUM', g.mat('SUBTRACT', p, a), g.mat('SUBTRACT', b, p)), 0, ent['lateral_largura'], 1, 0) for p, a, b in ((px, x0, x1), (py, y0, y1)))
    partes.append(g.caixa(x0, x1, y0, y1, g.mat('SUBTRACT', zt, .6), g.mat('ADD', zt, RELEVO), 1,
                          g.vec(g.mul(g.mat('SIGN', g.mat('SUBTRACT', cx_, px)), ex, lado), g.mul(g.mat('SIGN', g.mat('SUBTRACT', cy_, py)), ey, lado),
                                g.mul(g.mat('SUBTRACT', inc, campo), topo_l))))
    if topo not in ('piso', 'telhado'):
        t, alt = ent['espessura_parede'], ent['altura_parede']
        meio = g.mat('MULTIPLY', t, .5)
        yc = g.mat('SUBTRACT', y1, g.mat('ADD', meio, .02))  # recuo de 0,02/0,04 mm: sem faces coplanares com o corpo/laje (booleana limpa)
        x0, x1 = g.mat('ADD', x0, .04), g.mat('SUBTRACT', x1, .04)
        zb, zc = g.mat('SUBTRACT', zt, .3), g.mat('ADD', zt, g.mat('ADD', alt, RELEVO))
        dy = g.mat('SUBTRACT', py, yc)
        py_f = g.add(yc, g.mul(g.mat('SIGN', dy), meio))  # textura lida no plano da face: o recuo não varia com y dentro da parede (a malha não dobra)
        cw = g.add(g.textura(ent['textura_parede'], 'parede', px, py_f, pz, ds, tam, prof, des, ox, oy), corte_div(dx_div))  # a divisão sobe pela face da parede
        rp = g.no('ShaderNodeTexNoise', {'Vector': g.vec(g.mat('ADD', px, ox), pz, ds), 'Scale': ent['ruido_borda'], 'Detail': 3}).outputs['Factor']
        def parede(xa, xb, za, zb_):
            # o recuo é proporcional à distância do meio da parede (|dy|/meio): as faces grandes recuam tudo; topo, pontas e base acompanham
            # em parte. Com relevo < meia espessura a ordem dos vértices em y se mantém (malha não dobra) e a borda fica esculpida, sem moldura lisa.
            prop = g.mat('MINIMUM', g.mat('DIVIDE', g.mat('ABSOLUTE', dy), meio), 1)
            dy_ = g.mul(g.mat('SIGN', dy), g.mat('MINIMUM', cw, g.mul(meio, ent['parede_relevo_max'])), -1, prop)
            cap = g.mul(g.mapa(pz, g.mat('SUBTRACT', zb_, ent['topo_parede_faixa']), zb_, 0, 1), g.add(.2, g.mul(des, .7)), g.add(.3, rp), ent['topo_parede_gasto'], -1)  # topo irregular (rampa: sem cruzar)
            return g.caixa(xa, xb, g.mat('SUBTRACT', yc, meio), g.mat('ADD', yc, meio), za, zb_, 1, g.vec(0, dy_, cap))

        # ---- aberturas (Fase 3): até 2 por peça (porta ou janela), cortadas por booleana Manifold em qualquer parede ----
        saida = lambda p: p if isinstance(p, bpy.types.NodeSocket) else p.outputs[0]
        vazio = g.no('GeometryNodeJoinGeometry')
        se = lambda cond, geo: g.no('GeometryNodeSwitch', {'Switch': cond, 'False': vazio, 'True': geo}, input_type='GEOMETRY')  # lazy: só calcula o ramo ligado
        zpiso = g.mat('ADD', zt, RELEVO)

        def bloco(xa, xb, za, zb_, ya, yb):
            c = g.no('GeometryNodeMeshCube', {'Size': g.vec(g.mat('SUBTRACT', xb, xa), g.mat('SUBTRACT', yb, ya), g.mat('SUBTRACT', zb_, za))})
            return g.no('GeometryNodeTransform', {'Geometry': c.outputs['Mesh'], 'Translation': g.vec(g.mul(g.add(xa, xb), .5), g.mul(g.add(ya, yb), .5), g.mul(g.add(za, zb_), .5))})

        def cil(xc, zc_, R, ya, yb):  # cilindro com eixo em y (atravessa a parede)
            c = g.no('GeometryNodeMeshCylinder', {'Vertices': 64, 'Radius': R, 'Depth': g.mat('SUBTRACT', yb, ya)})
            return g.no('GeometryNodeTransform', {'Geometry': c.outputs['Mesh'], 'Rotation': g.vec(1.5707963, 0, 0), 'Translation': g.vec(xc, g.mul(g.add(ya, yb), .5), zc_)})

        def booleana(op, malhas, base=None, solver='MANIFOLD'):
            b = g.no('GeometryNodeMeshBoolean', operation=op, solver=solver)
            if base is not None:
                g.ng.links.new(saida(base), b.inputs['Mesh 1'])
            for m in reversed(malhas):  # entrada múltipla: a ordem não importa na booleana
                g.ng.links.new(saida(m), b.inputs['Mesh 2'])
            return b

        def no_meio(v, a, b):
            """Leva v para o meio entre duas linhas da grade da caixa a..b (mesmo espaçamento de Gr.caixa): o plano de corte nunca raspa
            uma linha de vértices (corte a 0,02 mm de um vértice gera lascas invertidas = arestas repetidas no STL)."""
            sp = g.mat('DIVIDE', g.mat('SUBTRACT', b, a), g.mat('ROUND', g.mat('DIVIDE', g.mat('SUBTRACT', b, a), g.res)))
            return g.add(a, g.mul(g.add(g.mat('FLOOR', g.mat('DIVIDE', g.mat('SUBTRACT', v, a), sp)), .5), sp))

        def ativa(k, lado):
            a = g.mat('GREATER_THAN', ent[f'ab{k}_tipo'], .5)
            return g.mul(a, g.mat('COMPARE', ent[f'ab{k}_lado'], lado, .1)) if topo == 'canto' else a

        def vao(k, lado, f, ya, yb):
            """Sólidos do vão da abertura k (retângulo + arco da verga), já ligados/desligados; f = folga do contorno (moldura)."""
            p = lambda n: ent[f'ab{k}_{n}']
            liga = ativa(k, lado)
            jan = g.mat('COMPARE', p('tipo'), 2, .1)
            wl = g.mat('MAXIMUM', p('largura'), 3)
            fx = g.add(g.mul(wl, .5), ent['ab_pilar_min'])  # pilar mínimo de cada lado
            xc0 = g.mat('MINIMUM', g.mat('MAXIMUM', g.add(g.mul(g.add(x0, x1), .5), p('pos')), g.add(x0, fx)), g.mat('SUBTRACT', x1, fx))
            xl, xr = no_meio(g.mat('SUBTRACT', xc0, g.mul(wl, .5)), x0, x1), no_meio(g.add(xc0, g.mul(wl, .5)), x0, x1)  # batentes entre linhas da grade
            xc, hw = g.mul(g.add(xl, xr), .5), g.add(g.mul(g.mat('SUBTRACT', xr, xl), .5), f)
            w = g.mul(hw, 2)
            base = no_meio(g.add(zpiso, g.mul(jan, g.mat('MINIMUM', p('peitoril'), g.mul(alt, .7)))), zb, zc)  # porta parte do piso; janela do peitoril
            top = g.add(no_meio(g.mat('MINIMUM', g.add(base, p('altura')), g.mat('SUBTRACT', zc, ent['ab_verga_min'])), zb, zc), f)  # verga mínima acima do vão
            z0 = g.add(g.mul(jan, g.mat('SUBTRACT', base, f)), g.mul(g.mat('SUBTRACT', 1, jan), g.mat('SUBTRACT', zt, 1)))
            # nascença do arco: reta = topo, pleno = topo − w/2, abatido = topo − 0,22·w, ogiva (2 arcos de raio w) = topo − 0,866·w
            sw = g.no('GeometryNodeIndexSwitch', data_type='FLOAT')
            while len(sw.index_switch_items) < len(VERGAS):
                sw.index_switch_items.new()
            g.lig(sw.inputs['Index'], p('verga'))
            for i, n in enumerate((top, g.mat('SUBTRACT', top, hw), g.mat('SUBTRACT', top, g.mul(w, ent['verga_abatimento'])), g.mat('SUBTRACT', top, g.mul(w, .866)))):
                g.lig(sw.inputs[i + 1], n)
            nasc = g.mat('MAXIMUM', sw.outputs[0], g.add(z0, .5))
            arco = g.mat('GREATER_THAN', p('verga'), .5)
            ret = se(liga, bloco(g.mat('SUBTRACT', xc, hw), g.add(xc, hw), z0, g.add(nasc, g.mul(arco, .05)), ya, yb))
            faixa = lambda a: bloco(g.mat('SUBTRACT', xc, a), g.add(xc, a), nasc, g.add(top, 1), ya, yb)
            v = lambda i: g.mul(liga, g.mat('COMPARE', p('verga'), i, .1))
            s_ = g.mul(w, ent['verga_abatimento'])
            R = g.mat('DIVIDE', g.add(g.mul(hw, hw), g.mul(s_, s_)), g.mul(s_, 2))
            pleno = se(v(1), booleana('INTERSECT', [cil(xc, nasc, hw, ya, yb), faixa(g.add(hw, 1))]))
            abat = se(v(2), booleana('INTERSECT', [cil(xc, g.mat('SUBTRACT', top, R), R, ya, yb), faixa(hw)]))
            ogiva = se(v(3), booleana('INTERSECT', [cil(g.add(xc, hw), nasc, w, ya, yb), cil(g.mat('SUBTRACT', xc, hw), nasc, w, ya, yb), faixa(g.add(hw, 1))]))
            return [ret, pleno, abat, ogiva]

        ya, yb = g.mat('SUBTRACT', yc, g.add(meio, 3)), g.add(yc, meio, 3)  # o vão atravessa a parede com folga

        def aspero(geo, cap):
            """Moldura refeita como volume (voxel = resolução: malha densa e estanque) e recuada pela textura da parede ao longo da normal (≤ cap mm).
            Só a moldura: o remesh da parede apagaria os sulcos finos da face, e booleana entre malhas densas deslocadas deixa arestas repetidas."""
            m = g.no('GeometryNodeVolumeToMesh', {'Volume': g.no('GeometryNodeMeshToVolume', {'Mesh': saida(geo), 'Resolution Mode': 'Size', 'Voxel Size': g.res})})
            nx, ny, nz = g.xyz(g.no('GeometryNodeInputNormal').outputs[0])
            T = lambda u, v: g.textura(ent['textura_parede'], 'parede', u, py, v, ds, tam, prof, des, ox, oy)
            c = g.add(g.mul(nx, nx, T(py, pz)), g.mul(ny, ny, T(px, pz)), g.mul(nz, nz, T(px, py)))  # triplanar, pesos n² (somam 1): sem degrau no arco
            c = g.mul(g.mat('MINIMUM', c, cap), -1)
            sp = g.no('GeometryNodeSetPosition', {'Geometry': m.outputs[0], 'Offset': g.vec(g.mul(nx, c), g.mul(ny, c), g.mul(nz, c))})
            return g.no('GeometryNodeTriangulate', {'Mesh': sp})

        def parede_com_vaos(lado):
            """Parede (coordenadas da parede A) com os vãos do `lado` cortados e as molduras (sobressaem só para dentro: a planta não passa de 35 mm).
            Com moldura, o vão da parede abre (relevo + 0,1) mm: o batente visível é a face interna da moldura, texturizada."""
            w = parede(x0, x1, zb, zc)
            algum = g.mat('MAXIMUM', ativa(1, lado), ativa(2, lado))
            tri = g.no('GeometryNodeTriangulate', {'Mesh': w})  # quads deslocados não são planos: cortados, viram n-gons tortos que o STL triangula invertido
            rel = {k: g.mat('MINIMUM', ent[f'ab{k}_moldura_relevo'], g.mul(ent[f'ab{k}_moldura_largura'], .6)) for k in (1, 2)}  # o recuo nunca fura a moldura
            limpo = booleana('DIFFERENCE', vao(1, lado, g.mul(ent['ab1_moldura'], g.add(rel[1], .1)), ya, yb) + vao(2, lado, g.mul(ent['ab2_moldura'], g.add(rel[2], .1)), ya, yb), base=tri)
            out = [g.no('GeometryNodeSwitch', {'Switch': algum, 'False': w, 'True': limpo}, input_type='GEOMETRY')]
            for k in (1, 2):
                fora = booleana('UNION', vao(k, lado, ent[f'ab{k}_moldura_largura'], g.mat('SUBTRACT', yc, g.add(meio, ent[f'ab{k}_moldura_saliencia'])), g.mat('SUBTRACT', g.add(yc, meio), .05)))
                mold = aspero(booleana('DIFFERENCE', vao(k, lado, .05, ya, yb), base=fora), rel[k])  # 0,05 mm além do vão: a moldura não divide faces com a parede cortada
                out.append(se(g.mul(ativa(k, lado), ent[f'ab{k}_moldura']), mold))
            return out

        partes += parede_com_vaos(0)
        if topo == 'canto':  # 2ª parede = parede A (com os vãos do lado B) girada -90° (célula quadrada)
            jb = g.no('GeometryNodeJoinGeometry')
            for p in parede_com_vaos(1):
                g.ng.links.new(saida(p), jb.inputs[0])
            partes.append(g.no('GeometryNodeTransform', {'Geometry': jb, 'Rotation': g.vec(0, 0, -1.5707963)}))
    junta = g.no('GeometryNodeJoinGeometry')  # cascas fechadas sobrepostas (o fatiador une); booleana só na porta
    for p in partes:
        g.ng.links.new(p if isinstance(p, bpy.types.NodeSocket) else p.outputs[0], junta.inputs[0])
    giro = g.no('GeometryNodeTransform', {'Geometry': junta, 'Rotation': g.vec(0, 0, g.mat('RADIANS', ori))})
    g.ng.links.new(giro.outputs[0], g.sai.inputs[0])
    return g.ng


# ---------- objetos nível A: baú (Fase 5) e mobília (Fase 6) ----------
BAU = dict(W=18.9, L=26.1, hb=9.5, hl=7.6, parede=1.6, plinto=1.2, angulo=105)  # DE1-056: 18,9 × 26,1 × 17,1 acima do piso
ESTADOS = ['Fechado', 'Aberto', 'Tesouro']
PROPS = ['Caixote', 'Barril', 'Banco']


def rebaixo(topo):
    return RELEVO if topo in ('piso', 'parede', 'canto', 'telhado') else 0


def kit(g):
    """Kit de primitivas do construtor (coordenadas locais; z = 0 é o topo do piso). tábua/viga/cinta = `tabua`."""
    px, py, pz = g.xyz(g.no('GeometryNodeInputPosition').outputs[0])
    sgn = lambda v: g.mat('SIGN', v)

    def tabua(cx, cy, cz, sx, sy, sz):
        c = g.no('GeometryNodeMeshCube', {'Size': g.vec(sx, sy, sz)})
        return g.no('GeometryNodeTransform', {'Geometry': c.outputs['Mesh'], 'Translation': g.vec(cx, cy, cz)})

    def tapa(cx, cy, z0, sx, sy, h, ix, iy, baixo=False):
        """3 camadas em z; a de cima (ou a de baixo) encolhe ix/iy por lado: chanfro sem overhang > 45°."""
        c = g.no('GeometryNodeMeshCube', {'Size': g.vec(sx, sy, h), 'Vertices X': 2, 'Vertices Y': 2, 'Vertices Z': 3})
        sel = g.mat('LESS_THAN', pz, -h / 4) if baixo else g.mat('GREATER_THAN', pz, h / 4)
        e = g.no('GeometryNodeSetPosition', {'Geometry': c.outputs['Mesh'], 'Selection': sel,
                                              'Offset': g.vec(g.mat('MULTIPLY', sgn(px), -ix), g.mat('MULTIPLY', sgn(py), -iy), 0)})
        return g.no('GeometryNodeTransform', {'Geometry': e, 'Translation': g.vec(cx, cy, z0 + h / 2)})

    def pedra_chanfrada(sx, sy, h, c):  # plinto: base e topo recuados c (chanfro de 40°)
        cu = g.no('GeometryNodeMeshCube', {'Size': g.vec(sx, sy, h), 'Vertices X': 2, 'Vertices Y': 2, 'Vertices Z': 3})
        borda = g.mat('GREATER_THAN', g.mat('ABSOLUTE', pz), h / 4)
        e = g.no('GeometryNodeSetPosition', {'Geometry': cu.outputs['Mesh'], 'Selection': borda,
                                              'Offset': g.vec(g.mat('MULTIPLY', sgn(px), -c), g.mat('MULTIPLY', sgn(py), -c), 0)})
        return g.no('GeometryNodeTransform', {'Geometry': e, 'Translation': g.vec(0, 0, h / 2)})

    def junta(*partes):
        j = g.no('GeometryNodeJoinGeometry')
        for p in partes:
            g.ng.links.new(p if isinstance(p, bpy.types.NodeSocket) else p.outputs[0], j.inputs[0])
        return j

    def chave(cond, falso, verdadeiro):
        return g.no('GeometryNodeSwitch', {'Switch': cond, 'False': falso, 'True': verdadeiro}, input_type='GEOMETRY')
    return px, py, pz, tabua, tapa, pedra_chanfrada, junta, chave


def finalizar(g, ent, junta, chave, objeto, plinto_solto, pl, ori=None, dx=None):
    """Modo: fundido = sobre o bloco de entrada (z do topo da bounding box); solto = plinto plano próprio em z = 0. Gira por `orientacao`."""
    fundir = ent['fundir_com_bloco']
    zt = g.xyz(g.no('GeometryNodeBoundBox', {'Geometry': ent['Geometry']}).outputs['Max'])[2]
    z0 = g.mat('ADD', g.mat('MULTIPLY', fundir, zt), g.mat('MULTIPLY', g.mat('SUBTRACT', 1, fundir), pl))
    vazio = g.no('GeometryNodeJoinGeometry')
    alto = g.no('GeometryNodeTransform', {'Geometry': objeto, 'Translation': g.vec(0, 0, z0)})
    giro = g.no('GeometryNodeTransform', {'Geometry': junta(alto, chave(fundir, plinto_solto, vazio)),
                                           'Rotation': g.vec(0, 0, g.mat('RADIANS', ent['orientacao'] if ori is None else ori))})
    if dx is not None:  # objeto numa célula de bloco 2×1 (gira em torno do próprio centro, depois desloca)
        giro = g.no('GeometryNodeTransform', {'Geometry': giro, 'Translation': g.vec(dx, 0, 0)})
    g.ng.links.new(junta(giro, chave(fundir, vazio, ent['Geometry'])).outputs[0], g.sai.inputs[0])
    return g.ng


def construir_bau():
    """Obj_Bau: estado (0 fechado, 1 aberto, 2 tesouro), orientacao, fundir_com_bloco, semente (relevo do tesouro)."""
    g = Gr(TOPOS['bau'][0], TOPOS['bau'][3])
    ent = g.ent.outputs
    W, L, hb, hl, pa, pl = (BAU[k] for k in ('W', 'L', 'hb', 'hl', 'parede', 'plinto'))
    px, py, pz, tabua, tapa, pedra, junta, chave = kit(g)
    corpo = tabua(0, 0, (hb - .5) / 2, W, L, hb + .5)
    cinta_l = [tabua(sx * (W / 2 - .2), sy * 7, hb / 2, 1.2, 2.2, hb + .4) for sx in (-1, 1) for sy in (-1, 1)]  # cintas de ferro nas laterais
    # fechado: tampa chanfrada (entra 0,2 no corpo: sem vértices coincidentes) + cintas sobre a tampa
    tampa = tapa(0, 0, hb - .2, W, L, hl + .2, 2.5, 1.5)
    cinta_t = [tapa(0, sy * 7, hb - .2, W + .8, 2.2, hl + .2, 2.7, 0) for sy in (-1, 1)]
    fechado = junta(corpo, *cinta_l, tampa, *cinta_t)
    # aberto: corpo oco (booleana de caixas simples) + tampa = tábua girada em torno da dobradiça, inclinada 15° para trás
    cavidade = tabua(0, 0, (pa + hb + 1) / 2, W - 2 * pa, L - 2 * pa, hb + 1 - pa)
    oco = g.no('GeometryNodeMeshBoolean', {'Mesh 1': corpo, 'Mesh 2': cavidade}, operation='DIFFERENCE', solver='MANIFOLD')
    prancha = tabua(W / 2, 0, 0, W, L - .6, 1.5)  # 1,5 < parede 1,6: a ponta da dobradiça fica toda dentro da parede (sem overhang)
    gira = g.no('GeometryNodeTransform', {'Geometry': prancha, 'Rotation': g.vec(0, -BAU['angulo'] * 3.14159265 / 180, 0)})
    tampa_aberta = g.no('GeometryNodeTransform', {'Geometry': gira, 'Translation': g.vec(-W / 2 + pa / 2, 0, hb - .3)})
    aberto = junta(oco, *cinta_l, tampa_aberta)
    # tesouro: monte de placeholder (cubo a 0,5 mm com o topo deslocado por ruído; a semente muda o relevo)
    mw, ml = W - 2 * pa - 1.2, L - 2 * pa - 1.2
    mz0, mz1 = pa - .6, pa + 5.5
    monte = g.no('GeometryNodeMeshCube', {'Size': g.vec(mw, ml, mz1 - mz0), 'Vertices X': round(2 * mw + 1), 'Vertices Y': round(2 * ml + 1), 'Vertices Z': 2})
    mt = g.no('GeometryNodeTransform', {'Geometry': monte.outputs['Mesh'], 'Translation': g.vec(0, 0, (mz0 + mz1) / 2)})
    rui = g.no('ShaderNodeTexNoise', {'Vector': g.vec(px, py, g.mat('MULTIPLY', ent['semente'], 13.7)), 'Scale': .35, 'Detail': 3}).outputs['Factor']
    mb = g.no('GeometryNodeSetPosition', {'Geometry': mt, 'Selection': g.mat('GREATER_THAN', pz, (mz0 + mz1) / 2),
                                           'Offset': g.vec(0, 0, g.mat('MULTIPLY', g.mat('SUBTRACT', rui, .5), 3))})
    estado = ent['estado']
    obj = chave(g.mat('LESS_THAN', estado, .5), chave(g.mat('LESS_THAN', estado, 1.5), junta(aberto, mb), aberto), fechado)
    p_aberto = g.no('GeometryNodeTransform', {'Geometry': pedra(W + 8, L + 2.4, pl, .5), 'Translation': g.vec(-2.8, 0, 0)})  # cobre a tampa inclinada
    plinto = chave(g.mat('LESS_THAN', estado, .5), p_aberto, pedra(W + 2.4, L + 2.4, pl, .5))
    return finalizar(g, ent, junta, chave, obj, plinto, pl)


def construir_prop():
    """Obj_Prop: tipo 0 caixote, 1 barril, 2 banco (comprimento = largura do bloco de entrada: 1×1 ou 2×1)."""
    g = Gr(TOPOS['prop'][0], TOPOS['prop'][3])
    ent = g.ent.outputs
    px, py, pz, tabua, tapa, pedra, junta, chave = kit(g)
    # caixote 19 × 19 × 14: corpo, 4 vigas de canto (+0,4) e 2 cintas
    caixote = junta(tabua(0, 0, 6.75, 19, 19, 14.5),
                    *[tabua(sx * 8.6, sy * 8.6, 7, 2.6, 2.6, 14.4) for sx in (-1, 1) for sy in (-1, 1)],
                    *[tabua(0, 0, z, 19.7, 19.7, 1.6) for z in (3.5, 10.5)])
    # barril: cilindro com barriga (≤ 15° de inclinação) + 3 aros em cone que alargam para cima (sem overhang)
    R, H = 8.5, 15.5
    cil = g.no('GeometryNodeMeshCylinder', {'Vertices': 24, 'Side Segments': 6, 'Radius': R, 'Depth': H})
    d = g.mat('DIVIDE', pz, H / 2)
    bojo = g.mat('MULTIPLY', g.mat('SUBTRACT', 1, g.mat('MULTIPLY', d, d)), .12)
    corpo_b = g.no('GeometryNodeSetPosition', {'Geometry': cil.outputs['Mesh'], 'Offset': g.vec(g.mat('MULTIPLY', px, bojo), g.mat('MULTIPLY', py, bojo), 0)})
    zc0 = (H - 1) / 2  # centro do cilindro: z de -0,5 a 15
    aros = []
    for z in (3.0, 7.5, 12.0):
        r = R * (1 + .12 * (1 - ((z - zc0) / (H / 2)) ** 2))
        cone = g.no('GeometryNodeMeshCone', {'Vertices': 24, 'Radius Bottom': r - .3, 'Radius Top': r + .45, 'Depth': 1.8})
        aros.append(g.no('GeometryNodeTransform', {'Geometry': cone.outputs['Mesh'], 'Translation': g.vec(0, 0, z)}))
    barril = junta(g.no('GeometryNodeTransform', {'Geometry': corpo_b, 'Translation': g.vec(0, 0, zc0)}), *aros)
    # banco: tábua com a face de baixo chanfrada (41°: recuo 1,6 em 1,8 de altura) sobre uma espinha central + 2 pés; comprimento = largura do bloco - 8
    x0, x1 = g.xyz(g.no('GeometryNodeBoundBox', {'Geometry': ent['Geometry']}).outputs['Min'])[0], g.xyz(g.no('GeometryNodeBoundBox', {'Geometry': ent['Geometry']}).outputs['Max'])[0]  # largura do bloco
    lb = g.mat('SUBTRACT', g.mat('SUBTRACT', x1, x0), 8)
    banco = junta(tapa(0, 0, 9, lb, 14, 3.6, 0, 1.6, baixo=True),
                  tabua(0, 0, 4.35, g.mat('SUBTRACT', lb, 2), 10.6, 9.7),
                  *[tabua(sx, 0, 4.35, 6, 14, 9.7) for sx in (g.mat('MULTIPLY', g.mat('SUBTRACT', lb, 6), -.5), g.mat('MULTIPLY', g.mat('SUBTRACT', lb, 6), .5))])
    tipo = ent['tipo']
    obj = chave(g.mat('LESS_THAN', tipo, .5), chave(g.mat('LESS_THAN', tipo, 1.5), banco, barril), caixote)
    pl = BAU['plinto']
    plinto = chave(g.mat('LESS_THAN', tipo, 1.5), pedra(g.mat('ADD', lb, 3), 16.4, pl, .5), pedra(24, 24, pl, .5))
    banco = g.mat('GREATER_THAN', tipo, 1.5)  # banco 2×1 só gira 0/180: a 90° sairia do bloco (35 de largura)
    ori = g.mat('ADD', g.mat('MULTIPLY', ent['orientacao'], g.mat('SUBTRACT', 1, banco)), g.mat('MULTIPLY', g.mat('MULTIPLY', g.mat('GREATER_THAN', ent['orientacao'], 134), 180), banco))
    larg = g.mat('SUBTRACT', x1, x0)
    cel = ent['celula']
    dx = g.mat('MULTIPLY', g.mat('MULTIPLY', g.mat('SUBTRACT', g.mat('COMPARE', cel, 2, .1), g.mat('COMPARE', cel, 1, .1)), 17.5),
               g.mat('MULTIPLY', g.mat('GREATER_THAN', larg, 40), g.mat('LESS_THAN', tipo, 1.5)))  # só caixote/barril em bloco largo: célula 1 = esquerda, 2 = direita
    return finalizar(g, ent, junta, chave, obj, plinto, pl, ori, dx)


def construir_espalhar():
    """Espalhar: bibliotecas próprias sobre o topo do bloco, em pontos Poisson: 0 moedas/pedregulhos/ossos, 1 tufos de grama, 2 cristais, 3 estalagmites.
    Todos têm a base chata enterrada 1,5 mm no corpo e topo ≥ 0,8 mm acima do piso; margem de 6 mm até a borda mantém ≥ 1 mm de folga mesmo no tamanho máximo.
    Atua sobre piso liso ou de pedra (plano = z máx. da bounding box)."""
    g = Gr('Espalhar', ['semente', 'densidade', 'escala', 'biblioteca'])
    ent = g.ent.outputs
    bb = g.no('GeometryNodeBoundBox', {'Geometry': ent['Geometry']})
    (x0, y0, _), (x1, y1, zt) = g.xyz(bb.outputs['Min']), g.xyz(bb.outputs['Max'])
    med = lambda a, b: g.mat('MULTIPLY', g.mat('ADD', a, b), .5)
    margem = 6.0
    # por biblioteca: (primeiro índice no instanciador, quantos itens, distância mínima entre pontos, densidade máxima)
    BIB = [(0, 3, 8.4, .03), (3, 1, 5.0, .08), (4, 1, 6.2, .04), (5, 3, 6.2, .04), (8, 2, 7.0, .04), (10, 2, 9.2, .03)]  # distância > 2 x raio máx. (com escala 1,2): instâncias nunca se tocam

    def pega(col):  # valor da biblioteca escolhida (soma de seletores 0/1)
        tot = None
        for k, linha in enumerate(BIB):
            w = g.mat('MULTIPLY', g.mat('COMPARE', ent['biblioteca'], k, .1), linha[col])
            tot = w if tot is None else g.mat('ADD', tot, w)
        return tot
    grade = g.no('GeometryNodeMeshGrid', {'Size X': g.mat('SUBTRACT', g.mat('SUBTRACT', x1, x0), 2 * margem), 'Size Y': g.mat('SUBTRACT', g.mat('SUBTRACT', y1, y0), 2 * margem),
                                          'Vertices X': 2, 'Vertices Y': 2})
    plano = g.no('GeometryNodeTransform', {'Geometry': grade.outputs['Mesh'], 'Translation': g.vec(med(x0, x1), med(y0, y1), zt)})
    pts = g.no('GeometryNodeDistributePointsOnFaces', {'Mesh': plano, 'Distance Min': pega(2), 'Density Max': pega(3), 'Density Factor': ent['densidade'],
                                                       'Seed': ent['semente']}, distribute_method='POISSON')
    T = lambda geo, x=0, y=0, z=0, rot=(0, 0, 0), esc=1.0: g.no('GeometryNodeTransform', {'Geometry': geo, 'Translation': g.vec(x, y, z), 'Rotation': g.vec(*rot), 'Scale': g.vec(esc, esc, esc)})
    cil = lambda r, h, z, cx=0, cy=0, v=16: T(g.no('GeometryNodeMeshCylinder', {'Vertices': v, 'Radius': r, 'Depth': h}).outputs['Mesh'], cx, cy, z)
    cone = lambda rb, rt, h, v, x=0, y=0: T(g.no('GeometryNodeMeshCone', {'Vertices': v, 'Radius Bottom': rb, 'Radius Top': rt, 'Depth': h}).outputs['Mesh'], x, y, -1.5)  # o cone tem a base na origem
    uniao = lambda *p: g.no('GeometryNodeJoinGeometry', {}) if not p else _junta(g, p)

    def _junta(g, partes):
        j = g.no('GeometryNodeJoinGeometry')
        for p in partes:
            g.ng.links.new(p.outputs[0], j.inputs[0])
        return j
    moeda = cil(2.4, 2.7, -.15)
    pedra = cone(2.7, 1.5, 2.7, 7)
    osso = uniao(T(g.no('GeometryNodeMeshCube', {'Size': g.vec(6, 1.3, 2.7)}).outputs['Mesh'], 0, 0, -.15), *[cil(1.0, 2.75, -.125, sx * 3, sy * .65, 12) for sx in (-1, 1) for sy in (-1, 1)])
    tufo = uniao(cone(1.3, .15, 3.2, 6), cone(1.0, .12, 2.6, 6, .9, .5), cone(1.0, .12, 2.9, 6, -.8, .6))

    def cristal(esc=1.0, x=0, y=0, rot=(0, 0, 0)):  # prisma hexagonal (−1,5 a 2,1) + ponta de 1,6; as inclinadas ≤ 15°
        return T(uniao(cil(1.4, 3.6, .3, 0, 0, 6), T(g.no('GeometryNodeMeshCone', {'Vertices': 6, 'Radius Bottom': 1.3, 'Radius Top': 0.0, 'Depth': 1.7}).outputs['Mesh'], 0, 0, 2.0)), x, y, 0, rot, esc)
    cristais = uniao(cristal(), cristal(.7, 1.9, 0, (0, .26, 0)), cristal(.6, -1.2, 1.5, (-.26, 0, 0)))
    est = [cone(2.4, .25, 5.5, 8), cone(1.8, .25, 3.6, 8), cone(1.4, .25, 2.6, 8)]
    lib = g.no('GeometryNodeGeometryToInstance')
    caveira = uniao(cil(2.0, 3.0, 0, 0, 0, 12), T(g.no('GeometryNodeMeshCone', {'Vertices': 12, 'Radius Bottom': 1.9, 'Radius Top': 1.1, 'Depth': 1.0}).outputs['Mesh'], 0, 0, 1.4),
                    T(g.no('GeometryNodeMeshCube', {'Size': g.vec(2.1, 1.7, 2.1)}).outputs['Mesh'], 0, 1.9, -.45))  # crânio (cilindro + cúpula com raio menor: sem anel de vértices em comum) + mandíbula
    def anel(re, ri, cx=0):  # argola = cilindro externo menos interno (booleana Manifold de 2 cilindros simples); base em -1,5, topo em +1,2
        ext = cil(re, 2.7, -.15, cx, 0, 14)
        inte = cil(ri, 3.2, -.15, cx, 0, 14)
        return g.no('GeometryNodeMeshBoolean', {'Mesh 1': ext, 'Mesh 2': inte}, operation='DIFFERENCE', solver='MANIFOLD')
    corrente = uniao(anel(2.1, 1.0, -1.5), anel(2.1, 1.0, 1.5))  # 2 elos que se sobrepõem em planta
    argola = anel(2.8, 1.6)
    for p in reversed((moeda, pedra, osso, tufo, cristais, *est, caveira, osso, corrente, argola)):  # a entrada múltipla do GeometryToInstance fica na ordem inversa dos links
        g.ng.links.new(p.outputs[0], lib.inputs[0])
    rnd = lambda a, b, d: g.no('FunctionNodeRandomValue', {'Min': a, 'Max': b, 'Seed': g.mat('ADD', ent['semente'], d)}).outputs[0]
    quantos = pega(1)
    base = g.mat('ADD', g.mat('MULTIPLY', g.mat('COMPARE', ent['biblioteca'], 1, .1), 3), g.mat('ADD', g.mat('MULTIPLY', g.mat('COMPARE', ent['biblioteca'], 2, .1), 4), g.mat('ADD', g.mat('MULTIPLY', g.mat('COMPARE', ent['biblioteca'], 3, .1), 5), g.mat('ADD', g.mat('MULTIPLY', g.mat('COMPARE', ent['biblioteca'], 4, .1), 8), g.mat('MULTIPLY', g.mat('COMPARE', ent['biblioteca'], 5, .1), 10)))))
    indice = g.mat('ADD', base, g.mat('MINIMUM', g.mat('FLOOR', g.mat('MULTIPLY', rnd(0, 1, 101), quantos)), g.mat('SUBTRACT', quantos, 1)))
    esc = rnd(1, ent['escala'], 202)
    inst = g.no('GeometryNodeInstanceOnPoints', {'Points': pts.outputs['Points'], 'Instance': lib, 'Pick Instance': True, 'Instance Index': indice,
                                                  'Rotation': g.vec(0, 0, rnd(0, 6.2831853, 303)), 'Scale': g.vec(esc, esc, esc)})
    real = g.no('GeometryNodeRealizeInstances', {'Geometry': inst})
    real = g.no('GeometryNodeStoreNamedAttribute', {'Geometry': real, 'Name': 'espalhar', 'Value': True}, data_type='BOOLEAN')  # exportar_stl não suaviza estes
    j = g.no('GeometryNodeJoinGeometry')
    for p in (ent['Geometry'], real):
        g.ng.links.new(p if isinstance(p, bpy.types.NodeSocket) else p.outputs[0], j.inputs[0])
    g.ng.links.new(j.outputs[0], g.sai.inputs[0])
    return g.ng


def construir_estatua():
    """Obj_Estatua (C1): guerreiro blocky em pedra, 28 mm sobre um pedestal chanfrado. pose 0 braços baixos, 1 um braço erguido, 2 os dois.
    Tudo apoiado de baixo (braços descem até o pedestal; tronco com base chanfrada sobre as pernas): sem overhang. `desgaste` + `semente` amassam a pedra."""
    g = Gr(TOPOS['estatua'][0], TOPOS['estatua'][3])
    ent = g.ent.outputs
    px, py, pz, tabua, tapa, pedra, junta, chave = kit(g)
    pl = BAU['plinto']
    ped = tapa(0, 0, -.5, 18, 18, 3.7, 1.2, 1.2)
    pernas = [tabua(sx * 2.4, 0, 7.5, 4, 4, 9.8) for sx in (-1, 1)]
    tronco = tapa(0, 0, 12, 11, 6, 9.4, 1.2, 1.1, baixo=True)
    cabeca = [tabua(0, 0, 23.8, 5, 5, 5.2), tapa(0, 0, 26.2, 5, 5, 1.8, 1, 1)]
    braco = lambda sx, topo: tabua(sx * 6.4, 0, (2.4 + topo) / 2, 2.6, 4, topo - 2.4)
    pose = ent['pose']
    p0 = junta(braco(-1, 21), braco(1, 21))
    p1 = junta(braco(-1, 21), braco(1, 29))
    p2 = junta(braco(-1, 29), braco(1, 29))
    bracos = chave(g.mat('LESS_THAN', pose, .5), chave(g.mat('LESS_THAN', pose, 1.5), p2, p1), p0)
    corpo = junta(ped, *pernas, tronco, *cabeca, bracos)
    sub = g.no('GeometryNodeSubdivideMesh', {'Mesh': corpo, 'Level': 2})
    ruido = g.no('ShaderNodeTexNoise', {'Vector': g.vec(px, py, g.mat('ADD', pz, g.mat('MULTIPLY', ent['semente'], 17.3))), 'Scale': .45, 'Detail': 2}).outputs['Color']
    r = g.xyz(ruido)
    k = g.mat('MULTIPLY', ent['desgaste'], .8)
    obj = g.no('GeometryNodeSetPosition', {'Geometry': sub, 'Offset': g.vec(*[g.mat('MULTIPLY', g.mat('SUBTRACT', c, .5), k) for c in r])})
    return finalizar(g, ent, junta, chave, obj, pedra(22, 22, pl, .5), pl)


OBJETOS = {'bau': construir_bau, 'prop': construir_prop, 'estatua': construir_estatua}


def _cache(grupo):
    """Grupos prontos em .blend: montar pela API é quadrático (canto: ~3 min); carregar leva < 1 s. A chave muda com este arquivo e com a versão do Blender.
    ponytail: versões antigas ficam na pasta temporária (~2 MB cada); apagar junto derrubaria o cache de worktrees paralelos."""
    chave = hashlib.sha1(open(__file__, 'rb').read() + bpy.app.version_string.encode()).hexdigest()[:12]
    return os.path.join(tempfile.gettempdir(), 'rpg_block_builder_cache', f'{grupo}_{chave}.blend')


def _do_cache(grupo):
    try:
        with bpy.data.libraries.load(_cache(grupo)) as (_, novo):
            novo.node_groups = [grupo]
    except OSError:  # não existe ou está corrompido: monta de novo
        return None
    return bpy.data.node_groups.get(grupo)


def _para_cache(ng):
    c = _cache(ng.name)
    tmp = f'{c[:-6]}_{os.getpid()}.blend'  # vários Blenders na regressão: o arquivo só aparece inteiro
    try:
        os.makedirs(os.path.dirname(c), exist_ok=True)
        bpy.data.libraries.write(tmp, {ng}, fake_user=True, compress=True)
        os.replace(tmp, c)
    except OSError as e:  # o cache é opcional: sem ele só fica lento
        print('Cache de grupos não gravado:', e)


def _modificador(obj, nome, grupo, construtor, vals, ultimo=False):
    """Cria/troca o modificador `nome` com o grupo GN `grupo` e grava os sliders. ultimo = fica depois dos demais."""
    cacheia = grupo not in [TOPOS[t][0] for t in OBJETOS]  # baú, prop e estátua serão descontinuados: ficam fora
    ng = bpy.data.node_groups.get(grupo) or (cacheia and _do_cache(grupo)) or None
    if not ng:
        ng = construtor()
        if cacheia:
            _para_cache(ng)
    m = obj.modifiers.get(nome)
    if m and (m.node_group != ng or (ultimo and obj.modifiers[-1] != m)):
        obj.modifiers.remove(m)
        m = None
    m = m or obj.modifiers.new(nome, 'NODES')
    m.node_group = ng
    for it in ng.interface.items_tree:
        if it.item_type == 'SOCKET' and it.in_out == 'INPUT' and it.name in vals:
            v = vals[it.name]
            m.properties.inputs[it.identifier]['value'] = int(v) if isinstance(v, bool) else v  # API de modificador da 5.2
    obj.update_tag()


def aplicar_topo(obj, topo, vals):
    """Modificador GN do topo no objeto (cria/troca) e valores dos sliders. O painel chama a cada ajuste: efeito ao vivo."""
    m = obj.modifiers.get('Topo')
    if topo == 'liso':
        if m:
            obj.modifiers.remove(m)
        return
    _modificador(obj, 'Topo', TOPOS[topo][0], lambda: construir(topo), vals)


def aplicar_espalhar(obj, topo, vals):
    """Camada Espalhar (sempre o último modificador): só sobre piso liso ou de pedra e com vals['espalhar'] ligado."""
    m = obj.modifiers.get('Espalhar')
    if topo in ('liso', 'piso') and vals.get('espalhar'):
        _modificador(obj, 'Espalhar', 'Espalhar', construir_espalhar, vals, ultimo=True)
    elif m:
        obj.modifiers.remove(m)


TRI_MIN = 240000  # exportar_stl: abaixo disto não mexe; acima, suaviza e reduz (originais: 240 mil no piso 1×1)
TRI_PISO = 368000  # triângulos do piso 1×1 em 0,125 mm: o alvo cresce com n^0,75, como nas originais (parede ~400 mil, canto ~540 mil)
SUAVIZA = 4  # iterações: p90 do ângulo entre triângulos igual ao das originais (facetas.py), sem perder relevo
BORDA_FIXA = 1.2  # mm: faixa da borda que a redução não toca (o gasto da lateral recua até ~1 mm)


def _limpa(me):
    """Cortes de porta/janela deixam vértices colineares (junção em T): sem isto o STL ganha triângulos de área zero."""
    bm = bmesh.new()
    bm.from_mesh(me)
    for _ in range(2):  # triangular -> dissolver os de área zero -> triangular o que sobrou
        bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
        bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(me)
    bm.free()


def _estanque(me):
    """Mesma conta do validar.py, nas coordenadas que vão para o STL."""
    from validar import estanque
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    me.calc_loop_triangles()
    t = np.empty(len(me.loop_triangles) * 3, np.int64)
    me.loop_triangles.foreach_get('vertices', t)
    return estanque(co.reshape(-1, 3)[t].reshape(-1, 3, 3))[0]


def _final(me, zt):
    """Malha final: tira os degraus da grade e corta triângulos onde a superfície é plana. Borda, encaixe e objetos do Espalhar não mudam."""
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    xy = co[:, :2]
    dentro = lambda b: np.all((xy > xy.min(0) + b) & (xy < xy.max(0) - b), axis=1)  # peso 0 na borda: a emenda com o vizinho não muda
    relevo = np.ones(len(co), bool)
    usos = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get('edge_index', usos)
    ev = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', ev)
    relevo[ev.reshape(-1, 2)[np.bincount(usos, minlength=len(me.edges)) != 2]] = False  # junção em T do corte: mover o vértice abre uma fresta
    if 'espalhar' in me.attributes:
        esp = np.empty(len(co), bool)
        me.attributes['espalhar'].data.foreach_get('value', esp)
        relevo &= ~esp
    dec = bpy.data.objects.new('stl_dec', me)
    bpy.context.scene.collection.objects.link(dec)
    for nome, livre in (('suave', dentro(.2) & (co[:, 2] > zt) & relevo), ('reduz', dentro(BORDA_FIXA) & relevo)):
        dec.vertex_groups.new(name=nome).add(np.flatnonzero(livre).tolist(), 1, 'REPLACE')
    sv = dec.modifiers.new('s', 'SMOOTH')
    sv.factor, sv.vertex_group = .5, 'suave'
    m = dec.modifiers.new('d', 'DECIMATE')
    m.vertex_group = 'reduz'
    r = max(TRI_MIN, TRI_MIN * (n / TRI_PISO) ** .75) / n
    # o colapso e a suavização às vezes repetem uma aresta perto de um corte: outra razão escapa; a última tentativa é a malha crua, que sempre passou
    for it, ratio in ((SUAVIZA, r), (SUAVIZA, r + .03), (SUAVIZA, r + .06), (SUAVIZA, 1), (0, r), (0, 1)):
        sv.iterations, m.ratio = it, ratio
        res = bpy.data.meshes.new_from_object(dec.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        _limpa(res)
        if (it, ratio) == (0, 1) or _estanque(res):
            break
        bpy.data.meshes.remove(res)
    print(f'MALHA FINAL iter={it} razao={ratio:.2f} {n} -> {len(res.polygons)} tri')
    bpy.data.objects.remove(dec)
    bpy.data.meshes.remove(me)
    return res


def exportar_stl(obj, caminho, final=True):
    """STL da malha avaliada (com o modificador GN): o exportador da 5.2 sai vazio com GN, então exporta uma cópia congelada.
    final=False: só limpa (objetos externos, já remalhados: a redução abre arestas neles)."""
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    me.calc_loop_triangles()
    if final and len(me.loop_triangles) > TRI_MIN:
        me = _final(me, max(v.co.z for v in obj.data.vertices))  # z do topo do bloco liso
    else:
        _limpa(me)
    tmp = bpy.data.objects.new('stl_tmp', me)
    bpy.context.scene.collection.objects.link(tmp)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    tmp.select_set(True)
    bpy.ops.wm.stl_export(filepath=caminho, export_selected_objects=True, global_scale=1.0)
    bpy.data.objects.remove(tmp)
    bpy.data.meshes.remove(me)
    obj.select_set(True)


def nome_peca(topo, pe, n, semente=0, v=None, ny=1):
    tam = f' {pe.split("_")[1].capitalize()}' + (f' {n}x{ny}' if n * ny > 1 else '')  # pé e células: nomes distintos por variante
    if v and v.get('espalhar') and topo in ('liso', 'piso'):
        return f'GEN-030-NL-{"Piso" if topo == "piso" else "Liso"} {BIBLIOTECAS[v["biblioteca"]]} s{semente:02d}' + tam
    if topo == 'liso':
        return f'GEN-{CODIGOS.get((pe, n) if ny == 1 else None, 5 if pe == "pe_longo" else 6):03d}-NL-Liso {pe.split("_")[1].capitalize()} {n}x{ny}'
    return _nome_topo(topo, semente, v) + tam


def _nome_topo(topo, semente, v):
    _, cod, nome, _ = TOPOS[topo]
    if topo in ('piso', 'parede', 'canto', 'telhado'):
        nome += ' ' + (TEXTURAS[v['textura_piso' if topo in ('piso', 'telhado') else 'textura_parede']] if v else 'Pedra')
    for k in (1, 2):  # aberturas no nome: Porta-Arco, Janela-Reta-B (lado B do canto)...
        if v and topo in ('parede', 'canto') and v[f'ab{k}_tipo']:
            nome += f' {TIPOS_AB[v[f"ab{k}_tipo"]]}-{VERGAS[v[f"ab{k}_verga"]]}' + ('-B' if topo == 'canto' and v[f'ab{k}_lado'] else '')
    if topo == 'estatua':
        return f'GEN-{cod:03d}-NL-Estatua Pose{v["pose"]} {"Fundido" if v["fundir_com_bloco"] else "Solto"} {v["orientacao"]:03d} s{semente:02d}'
    if topo == 'prop':
        return f'GEN-{cod:03d}-NL-{PROPS[v["tipo"]]} {"Fundido" if v["fundir_com_bloco"] else "Solto"} {v["orientacao"]:03d}'
    if topo == 'bau':
        return f'GEN-{cod:03d}-NL-{nome} {ESTADOS[v["estado"]]} {"Fundido" if v["fundir_com_bloco"] else "Solto"} {v["orientacao"]:03d}'
    return f'GEN-{cod:03d}-NL-{nome} s{semente:02d}'


def info_peca(peca, pe, n, vals, spec, folga, marcas=0, ny=1):
    """JSON lateral do STL (lido pelo validar.py): o mesmo para a CLI e o painel."""
    girado = peca != 'liso' and peca not in OBJETOS and vals['orientacao'] % 180 == 90  # giro de 90° troca a planta em x e y
    info = dict(peca=peca, pe=pe, celulas=[ny, n] if girado else [n, ny], semente=vals['semente'], folga_fdm_mm=spec['folga_fdm_mm'], folga_extra_mm=folga, marcas=marcas,
                altura=spec['pes'][pe]['altura_liso'])
    if peca != 'liso':
        info.update({k: vals[k] for k in TOPOS[peca][3]})
        if peca not in OBJETOS:
            info['relevo_min_mm'] = .2 if TEXTURAS[vals['textura_piso']] == 'Lisa' else max(vals['profundidade'], .4)  # o validador mede o relevo do piso
            info['textura'] = TEXTURAS[vals['textura_piso'] if peca in ('piso', 'telhado') else vals['textura_parede']]
    if vals['espalhar'] and peca in ('liso', 'piso'):
        info.update(espalhar=True, densidade=vals['densidade'], escala=vals['escala'])
    return info


def main():
    spec = json.load(open(os.path.join(AQUI, 'spec_encaixe.json'), encoding='utf-8'))
    peca, pe, n, ny = arg('--peca', 'liso'), arg('--pe', 'pe_longo'), int(arg('--colunas', arg('--celulas', 1))), int(arg('--linhas', 1))
    semente, lote = int(arg('--semente', 1)), int(arg('--lote', 1))
    folga = float(arg('--folga', spec['folga_fdm_mm']))  # padrão = folga calibrada do spec
    teste = '--folga' in sys.argv  # bloco do teste físico (Fase 3): grava a folga em relevo
    out = os.path.abspath(arg('--saida', 'saida'))
    os.makedirs(out, exist_ok=True)
    if n < 1 or ny < 1:
        sys.exit('ERRO: --colunas e --linhas precisam ser 1 ou mais')
    if peca == 'canto' and n != ny:  # canto = 2ª parede girada 90°: só conjunto quadrado
        sys.exit(f'ERRO: canto só em conjunto quadrado (pedido: {n} colunas × {ny} linhas)')
    if peca in OBJETOS and (n > 2 or ny > 1):  # objetos congelados: só 1×1 e 2×1
        sys.exit(f'ERRO: {peca} só em 1×1 ou 2×1 (pedido: {n} colunas × {ny} linhas)')
    atalho = ATALHOS.get(peca, {})
    peca = 'parede' if atalho else peca
    tema = TEMAS[arg('--tema', 'dungeon')]
    vals = {k: CONV[v[3]](arg('--' + k, tema.get(k, atalho.get(k, v[0])))) for k, v in PARAMS.items()}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    marcas = round(-folga / .1) + 1 if teste else 0
    obj = bpy.data.objects.new('bloco', liso(pe, n, spec, folga, marcas, rebaixo(peca), ny))
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    s = bpy.context.scene
    f = (1 + (max(n, ny) - 1) * .6) * (1.3 if peca in ('parede', 'canto', 'bau', 'prop', 'estatua') else 1)  # paredes são altas
    bpy.ops.object.camera_add(location=(90 * f, -90 * f, 70 * f), rotation=(1.1, 0, 0.785))
    s.camera = bpy.context.object
    s.render.engine = 'BLENDER_WORKBENCH'
    s.render.resolution_x = s.render.resolution_y = 512
    sh = s.display.shading
    sh.show_cavity, sh.cavity_type = True, 'BOTH'  # realça o relevo de 0,5 mm no render
    if peca == 'bau' and '--todos' in sys.argv:  # 3 estados × 4 orientações × 2 modos = 24 peças
        casos = [dict(estado=e, orientacao=o, fundir_com_bloco=f) for f in (True, False) for e in range(3) for o in (0, 90, 180, 270)]
    elif peca == 'estatua' and '--todos' in sys.argv:  # 3 poses × 4 orientações × 2 modos
        casos = [dict(pose=p, orientacao=o, fundir_com_bloco=f) for f in (True, False) for p in range(3) for o in (0, 90, 180, 270)]
    elif peca == 'prop' and '--todos' in sys.argv:  # caixote, barril e (só com --celulas 2) banco × 4 orientações × 2 modos
        casos = [dict(tipo=t, orientacao=o, fundir_com_bloco=f) for f in (True, False) for t in range(3 if n == 2 else 2) for o in (0, 90, 180, 270)]
    else:
        casos = [dict(semente=semente + i) for i in range(lote)]
    for caso in casos:
        vals.update(caso)
        nome = nome_peca(peca, pe, n, vals['semente'], vals, ny)
        if teste:
            nome = f'GEN-T{marcas}-NL-Teste Folga {folga:+.1f}'
        aplicar_topo(obj, peca, vals)
        aplicar_espalhar(obj, peca, vals)
        bpy.context.view_layer.update()
        exportar_stl(obj, os.path.join(out, nome + '.stl'))
        info = info_peca(peca, pe, n, vals, spec, folga, marcas, ny)
        json.dump(info, open(os.path.join(out, nome + '.json'), 'w'), indent=2)
        s.render.filepath = os.path.join(out, nome + '.png')
        bpy.ops.render.render(write_still=True)
        print('GERADO', nome)


if __name__ == '__main__':  # piloto_externos.py importa liso()/exportar_stl() sem rodar o CLI
    main()
