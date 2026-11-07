"""Emenda entre blocos vizinhos: python emenda.py bloco_x0.stl bloco_x1.stl [altura 24.5]
Compara a altura do topo na borda x=+17,5 do 1º com x=-17,5 do 2º (gerados com --posicao_x 0 e 1, mesma semente/textura): 0 = sem degrau."""
import sys, numpy as np
from medir_stl import carregar


def borda(path, x, H):
    v = carregar(path).reshape(-1, 3)
    v = v[(np.abs(v[:, 0] - x) < 1e-3) & (v[:, 2] > H - 2.0) & (v[:, 2] <= H + .01)]
    u, i = np.unique(np.round(v[:, 1], 3), return_inverse=True)
    z = np.full(len(u), -1e9)
    np.maximum.at(z, i, v[:, 2])  # topo por y (a coluna lateral tem vários vértices)
    return u, z


if __name__ == '__main__':
    H = float(sys.argv[3]) if len(sys.argv) > 3 else 24.5
    (ya, za), (yb, zb) = borda(sys.argv[1], 17.5, H), borda(sys.argv[2], -17.5, H)
    assert np.allclose(ya, yb), 'grades de y diferentes'
    d = np.abs(za - zb)
    print(f'{len(ya)} pontos; descasamento médio {d.mean():.4f} mm, máximo {d.max():.4f} mm')
    sys.exit(int(d.max() > .01))
