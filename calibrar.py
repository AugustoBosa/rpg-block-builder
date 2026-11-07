"""Mede o relevo de pisos e paredes (originais do HD e nossos) com o MESMO método, para calibrar texturas.
  python calibrar.py piso  arq.stl [...]    campo de alturas do topo (centro 16x16 do pé), profundidade abaixo do plano
  python calibrar.py parede arq.stl [...]   campo de alturas da face externa da parede (eixo fino, lado da borda)
Saída por arquivo: p50/p95 da profundidade (mm), fração > 0,4 mm, inclinação p95 (graus), comprimento de onda dominante (mm)."""
import sys, os, numpy as np
from medir_stl import carregar

CEL = .5  # mm, grade do campo de alturas (vértices das originais têm ~0,2–0,5 mm)


def amostras(t):
    """Pontos (n,3) por triângulo: 3 vértices + 3 pontos médios + centroide (cobre as faces planas grandes, que têm poucos vértices)."""
    a, b, c = t[:, 0], t[:, 1], t[:, 2]
    return np.concatenate([a, b, c, (a + b) / 2, (b + c) / 2, (c + a) / 2, (a + b + c) / 3])


def campo(u, v, h, u0, u1, v0, v1, cel=CEL):
    """Máximo de h por célula (u,v); células vazias recebem o vizinho mais próximo (varredura simples)."""
    nu, nv = int((u1 - u0) / cel), int((v1 - v0) / cel)
    iu, iv = ((u - u0) / cel).astype(int), ((v - v0) / cel).astype(int)
    m = (iu >= 0) & (iu < nu) & (iv >= 0) & (iv < nv)
    G = np.full((nu, nv), -np.inf)
    np.maximum.at(G, (iu[m], iv[m]), h[m])
    vazio = ~np.isfinite(G)
    if vazio.all():
        return None
    for _ in range(4):  # preenche buracos pequenos pela média dos vizinhos válidos
        if not vazio.any():
            break
        P = np.pad(np.where(vazio, np.nan, G), 1, constant_values=np.nan)
        viz = np.stack([P[:-2, 1:-1], P[2:, 1:-1], P[1:-1, :-2], P[1:-1, 2:]])
        med = np.nanmean(viz, axis=0)
        G = np.where(vazio & np.isfinite(med), med, G)
        vazio = ~np.isfinite(G)
    return None if vazio.mean() > .3 else np.where(np.isfinite(G), G, np.nanmedian(G[np.isfinite(G)]))


def estreito(G, cel=CEL, larg=.8):
    """Fração do sulco (profundidade > metade do p95) mais estreita que `larg`: o que sobra fora da abertura morfológica com quadrado de ~larg."""
    d = np.percentile(G, 98) - G
    M = d > .5 * np.percentile(d, 95)
    k = max(2, round(larg / cel))
    if M.sum() == 0 or min(M.shape) < k:
        return 0.
    E = np.lib.stride_tricks.sliding_window_view(M, (k, k)).all(axis=(2, 3))
    A = np.zeros_like(M)
    for a in range(k):
        for b in range(k):
            A[a:a + E.shape[0], b:b + E.shape[1]] |= E
    return float((M & ~A).sum() / M.sum())


def estatisticas(G):
    plano = np.percentile(G, 98)
    d = plano - G
    gy, gx = np.gradient(G, CEL)
    incl = np.degrees(np.arctan(np.hypot(gx, gy)))
    Gd = G - G.mean()
    P = np.abs(np.fft.fft2(Gd * np.outer(np.hanning(G.shape[0]), np.hanning(G.shape[1])))) ** 2
    fu, fv = np.fft.fftfreq(G.shape[0], CEL), np.fft.fftfreq(G.shape[1], CEL)
    k = np.hypot(*np.meshgrid(fu, fv, indexing='ij'))
    banda = (k > 1 / 40) & (k < 1 / 1.5)  # comprimentos de onda de 1,5 a 40 mm
    kk, pp = k[banda], P[banda]
    lam = 1 / (np.sum(kk * pp) / np.sum(pp))  # comprimento de onda médio ponderado pela energia
    return dict(p50=np.percentile(d, 50), p95=np.percentile(d, 95), max=d.max(), f04=(d > .4).mean(), inc95=np.percentile(incl, 95), inc50=np.percentile(incl, 50), lam=lam)


def piso(path):
    t = carregar(path)
    v = amostras(t)
    pe = v[v[:, 2] < 8]
    cx, cy = (pe[:, 0].min() + pe[:, 0].max()) / 2, (pe[:, 1].min() + pe[:, 1].max()) / 2  # o centro do pé, não da bbox
    x, y, z = v[:, 0] - cx, v[:, 1] - cy, v[:, 2]
    c = (np.abs(x) < 8) & (np.abs(y) < 8)
    zr = np.percentile(z[c], 98)  # plano do piso = topo do centro (pé longo ≈ 24,5; pé curto ≈ 17–19)
    m = c & (z > zr - 3)
    G = campo(x[m], y[m], z[m], -8, 8, -8, 8)
    return None if G is None else estatisticas(G)


def parede(path):
    t = carregar(path)
    v = t.reshape(-1, 3)
    pe = v[v[:, 2] < 8]
    cx, cy = (pe[:, 0].min() + pe[:, 0].max()) / 2, (pe[:, 1].min() + pe[:, 1].max()) / 2
    a = v - [cx, cy, 0]
    alto = a[a[:, 2] > 27.5]
    if len(alto) < 100:
        return None
    ext = [np.ptp(alto[:, 0]), np.ptp(alto[:, 1])]
    eixo = int(np.argmin(ext))  # eixo fino = espessura da parede
    lado = 1 if alto[:, eixo].max() > -alto[:, eixo].min() else -1  # face externa = a que chega mais perto da borda
    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    sai = n[:, eixo] * lado > 0
    b = (t.mean(1) - [cx, cy, 0])
    tris = sai & (b[:, 2] > 28) & (np.abs(b[:, 1 - eixo]) < 8)
    p = amostras(t[tris]) - [cx, cy, 0]
    zt = p[:, 2].max() - 2
    p = p[p[:, 2] < zt]
    z0 = max(30., p[:, 2].min())
    G = campo(p[:, 1 - eixo], p[:, 2], p[:, eixo] * lado, -8, 8, z0, z0 + 16)
    return None if G is None else estatisticas(G)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    f = piso if sys.argv[1] == 'piso' else parede
    for a in sys.argv[2:]:
        r = f(a)
        nome = os.path.basename(a)[:44]
        print(f"{nome:44s} " + ('sem dados' if r is None else f"p50 {r['p50']:.2f}  p95 {r['p95']:.2f}  máx {r['max']:.2f}  f>0,4 {r['f04']:.2f}  incl50/95 {r['inc50']:.0f}/{r['inc95']:.0f}°  λ {r['lam']:.1f} mm"))
