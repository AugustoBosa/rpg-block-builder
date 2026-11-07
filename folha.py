"""Folha de contato: python folha.py saida/lote_piso  -> folha.png (5 colunas, PNGs da pasta cortados no conteúdo)."""
import sys, glob, os
from PIL import Image, ImageDraw

pasta = sys.argv[1]
fs = sorted(glob.glob(os.path.join(pasta, '*.png')))
fs = [f for f in fs if os.path.basename(f) != 'folha.png']
T, C = 300, 5
fol = Image.new('RGB', (C * T, -(-len(fs) // C) * T), 'white')
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGBA')  # fundo transparente: corta pelo alfa e compõe sobre branco
    bg = Image.new('RGBA', im.size, 'white')
    im = Image.alpha_composite(bg, im).convert('RGB').crop(im.getchannel('A').getbbox())
    im.thumbnail((T - 10, T - 30))
    fol.paste(im, (i % C * T + (T - im.width) // 2, i // C * T + 22))
    ImageDraw.Draw(fol).text((i % C * T + 6, i // C * T + 4), os.path.basename(f)[:-4].split('-NL-')[-1], fill='black')
fol.save(os.path.join(pasta, 'folha.png'))
print(len(fs), 'miniaturas ->', os.path.join(pasta, 'folha.png'))
