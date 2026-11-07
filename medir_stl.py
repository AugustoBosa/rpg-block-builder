"""Mede STL binário.
  python medir_stl.py a.stl                       resumo + extensão XY por faixa de Z (legado)
  python medir_stl.py a.stl --perfil [--zmax 20]  pés (cx,cy,hw) por Z em passo 0,25 + contorno em 3 alturas
  python medir_stl.py a.stl --spec spec_encaixe.json   classifica o pé e simula o assento no grid
Como módulo: carregar, cortes, perfil (usado por validar.py)."""
import sys, json, numpy as np

sys.stdout.reconfigure(encoding='utf-8')

PASSO = .25
EPS = 1e-3  # desloca o plano de corte para não cair em vértices


def carregar(path):
    b = open(path, 'rb').read()
    a = np.frombuffer(b[84:], dtype=np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')]))
    return a['v'].astype(np.float64)  # (n,3,3)


def cortes(tris, z):
    """Segmentos 2D (n,2,2) da seção do plano z."""
    z += EPS
    za = tris[:, :, 2]
    m = (za.min(1) < z) & (za.max(1) > z)
    t = tris[m]
    s = []
    for i, j in ((0, 1), (1, 2), (2, 0)):
        a, b = t[:, i], t[:, j]
        x = (a[:, 2] < z) != (b[:, 2] < z)
        k = np.where(x, (z - a[:, 2]) / np.where(x, b[:, 2] - a[:, 2], 1), 0)
        s.append((a[:, :2] + k[:, None] * (b[:, :2] - a[:, :2]), x))
    P = np.stack([p for p, _ in s], 1)
    X = np.stack([x for _, x in s], 1)
    ordem = np.argsort(~X, axis=1, kind='stable')[:, :2]
    return np.take_along_axis(P, ordem[:, :, None], 1)


def _grupos(lo, hi, gap=1.0):
    """Une intervalos [lo,hi] que se sobrepõem (folga < gap); devolve índices por grupo."""
    o = np.argsort(lo)
    fim = np.maximum.accumulate(hi[o])
    return np.split(o, np.where(lo[o][1:] > fim[:-1] + gap)[0] + 1)


def pes(seg):
    """Retângulos (cx, cy, hwx, hwy) de cada pé separado na seção (agrupa por segmentos, não por vértices)."""
    if not len(seg):
        return []
    r = []
    for gx in _grupos(seg[:, :, 0].min(1), seg[:, :, 0].max(1)):
        q = seg[gx]
        for gy in _grupos(q[:, :, 1].min(1), q[:, :, 1].max(1)):
            w = q[gy].reshape(-1, 2)
            lo, hi = w.min(0), w.max(0)
            r.append(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2))
    return sorted(r)


def perfil(tris, zmax=20.):
    """{z: [pés]} para z = 0 .. zmax (z=0 usa 0 + EPS)."""
    t = tris[tris[:, :, 2].min(1) < zmax + 1]
    return {round(z, 2): pes(cortes(t, z)) for z in np.arange(0, zmax + PASSO / 2, PASSO)}  # z=0 (face de baixo) pode ter logo/relevo: só medir de 0,25 em diante


def dentro(seg, pts):
    """Paridade de raio +x: pts (m,2) dentro da seção?"""
    a, b = seg[:, 0], seg[:, 1]
    py = pts[:, 1][:, None]
    cruza = (a[:, 1] > py) != (b[:, 1] > py)
    dy = np.where(b[:, 1] == a[:, 1], 1, b[:, 1] - a[:, 1])
    xi = a[:, 0] + (py - a[:, 1]) / dy * (b[:, 0] - a[:, 0])
    return ((cruza & (pts[:, 0][:, None] < xi)).sum(1) % 2) == 1


def contorno(seg, cx, cy):
    p = seg.reshape(-1, 2) - [cx, cy]
    hwx, hwy = np.abs(p).max(0)
    return dict(hwx=hwx, hwy=hwy, canto=np.abs(p).sum(1).max() / (hwx + hwy))  # canto=1 → quina viva


def hw_pe(f):
    return max(f[2], f[3])


# ---------- spec: classificação e assento ----------

def desvio(prof, pe_spec, zmax):
    """Maior |hw medido − hw do perfil do spec| em z < zmax, por pé medido; devolve (desvio, z do pior)."""
    zs, hws = zip(*pe_spec['perfil'])
    pior = (0., 0.)
    for z, fs in prof.items():
        if z >= zmax or z < PASSO:
            continue
        for f in fs:
            d = abs(hw_pe(f) - np.interp(z, zs, hws))
            if d > pior[0]:
                pior = (d, z)
    return pior


def assento(prof, spec):
    """Peça descendo no grid: furo de meia-largura h até zf, depois rebaixo que abre com inclinação k até zt.
    Devolve (dz de repouso, pé que encosta, fora_do_passo). Peça z=0 fica dz acima da mesa."""
    g = spec['grid']
    h, zf, zt, k = g['furo_meia_largura'], g['z_furo'][1], g['z_topo'], g['rebaixo_inclinacao']
    zs = [z for z, fs in prof.items() if fs and z >= PASSO]
    hws = [max(hw_pe(f) for f in prof[z]) for z in zs]
    zi = np.arange(zs[0], zs[-1], .01)  # hw é linear por trechos: interpolar acha o contato exato
    hi = np.interp(zi, zs, hws)
    zmin = np.where(hi >= h + (zt - zf) * k, zt, zf + np.maximum(hi - h, 0) / k)
    folga = np.where(hi > h, zmin - zi, -1e9)
    dz = max(0., float(folga.max()))
    quem = f'pé hw>{h} em z={zi[folga.argmax()]:.2f}' if dz > 0 else 'mesa'
    cs = [(f[0], f[1]) for f in prof[5.0]]  # pés a z=5 (retos nos dois tipos): espaçamento entre pés deve ser múltiplo de 35
    p = spec['passo_celula']
    fora = max([abs(((c[i] - cs[0][i] + p / 2) % p) - p / 2) for c in cs for i in (0, 1)], default=0.)
    return round(dz, 2), quem, round(fora, 2)


def main():
    a = sys.argv[1:]
    tris = carregar(a[0])
    v = tris.reshape(-1, 3)
    print('tris', len(tris), 'min', v.min(0).round(2), 'size', (v.max(0) - v.min(0)).round(2))
    if len(a) == 1:
        for lo, hi in [(0, .5), (.5, 2), (2, 4), (4, 8), (8, 12), (12, 16), (16, 20)]:
            m = (v[:, 2] >= lo) & (v[:, 2] < hi)
            if m.any():
                print(f'z[{lo},{hi}) xy', (v[m, :2].max(0) - v[m, :2].min(0)).round(2), 'n', m.sum())
        return
    zmax = float(a[a.index('--zmax') + 1]) if '--zmax' in a else 20.
    if '--spec' in a:
        zmax = max(zmax, 30.)
    prof = perfil(tris, zmax)
    if '--perfil' in a:
        ant = None
        for z, fs in prof.items():
            s = ' | '.join(f'c({f[0]:+.2f},{f[1]:+.2f}) hw({f[2]:.2f},{f[3]:.2f})' for f in fs)
            if s != ant:
                print(f'z={z:5.2f}  {s}')
            ant = s
        for z in (0.5, 6, 14):
            seg = cortes(tris, z)
            for f in prof[z]:
                m = (seg.reshape(-1, 2)[:, 0] > f[0] - f[2] - .01) & (seg.reshape(-1, 2)[:, 0] < f[0] + f[2] + .01)
                print(f'contorno z={z}', {k: round(float(x), 3) for k, x in contorno(seg, f[0], f[1]).items()})
                break
    if '--spec' in a:
        spec = json.load(open(a[a.index('--spec') + 1]))
        melhor = None
        for nome, pe in spec['pes'].items():
            d, z = desvio(prof, pe, pe['z_protegido'])
            print(f'{nome}: desvio {d:.3f} mm (pior em z={z})')
            if melhor is None or d < melhor[1]:
                melhor = (nome, d)
        print('tipo:', melhor[0], 'OK' if melhor[1] <= .1 else 'FORA DE 0,1 mm')
        dz, quem, fora = assento(prof, spec)
        print(f'assento: dz={dz} (encosta em {quem}); pés fora do passo de 35: {fora} mm; centro do 1º pé: ({prof[5.0][0][0]:.2f}, {prof[5.0][0][1]:.2f})')
        zs = [z for z, fs in prof.items() if fs and all(min(f[2], f[3]) >= 17.4 for f in fs[:1]) and max(hw_pe(f) for f in fs) >= 17.4]
        if zs:
            print(f'última seção cheia ±17,5 em z={max(zs)} (+dz = {max(zs) + dz:.2f} mm da mesa; só faz sentido para piso)')


if __name__ == "__main__":
    main()
