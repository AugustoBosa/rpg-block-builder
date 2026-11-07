"""Valida STL binário contra spec_encaixe.json.  python validar.py a.stl [b.stl ...]
Saída: OK/FALHA + motivos por arquivo; código de saída 1 se algum falhar. Overhang só é reportado (informativo: a impressão usa suportes)."""
import sys, os, json, numpy as np
from medir_stl import carregar, perfil, desvio, PASSO
from calibrar import amostras, campo, estreito

SPEC = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'spec_encaixe.json'), encoding='utf-8'))
TOL = .1  # mm, desvio máximo do perfil do pé
ESTREITO = .25  # fração máxima do sulco mais estreita que 0,8 mm (bico 0,4); regressão de 2026-11-02: máx. 14 %


def estanque(t):
    """Malha fechada? Devolve (ok, contagem das arestas, arestas sem par, triângulos degenerados). Também usado no exportar_stl do gerar.py."""
    v = t.reshape(-1, 3)
    area = np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1) / 2
    lado2 = np.max([((t[:, i] - t[:, (i + 1) % 3]) ** 2).sum(1) for i in range(3)], axis=0)  # maior lado ao quadrado
    # malha: vértices soldados (exato em float32; se não fechar, a 1e-4 mm para STL de outras origens); cada aresta dirigida aparece 1x e sua inversa 1x
    for casas in (None, 4):
        _, ids = np.unique(v if casas is None else np.round(v, casas), axis=0, return_inverse=True)
        f = ids.reshape(-1, 3)
        deg = ((area < 1e-6) & (area < 1e-3 * lado2)) | (f[:, 0] == f[:, 1]) | (f[:, 1] == f[:, 2]) | (f[:, 0] == f[:, 2])  # lasca = achatada; micro-triângulo compacto é face válida
        g = f[~deg]
        e = np.concatenate([g[:, [0, 1]], g[:, [1, 2]], g[:, [2, 0]]])
        k, kr = e[:, 0].astype(np.int64) * (f.max() + 1) + e[:, 1], e[:, 1].astype(np.int64) * (f.max() + 1) + e[:, 0]
        u, c = np.unique(k, return_counts=True)
        sem = ~np.isin(kr, u)
        if not (c > 1).any() and sem.any():  # junções em T (corte de porta/janela): a→b de um lado, b→m→a do outro, m colinear
            sem[sem] = ~juncao_t(e, sem, f[deg], np.unique(ids, return_index=True)[1], v)
        ok = not (c > 1).any() and not sem.any()
        if ok:
            break
    return ok, c, sem, deg, area


def validar(path):
    t = carregar(path)
    erros = []
    v = t.reshape(-1, 3)
    ok, c, sem, deg, area = estanque(t)
    # slivers (área ~0) vêm da booleana dos topos; os fatiadores os ignoram. Descartados e contados; > 0,2% = falha.
    if deg.mean() > .002:
        erros.append(f'{deg.sum()} triângulo(s) degenerado(s) ({deg.mean():.2%})')
    if not ok:
        erros.append(f'malha não estanque/orientação inconsistente ({(c > 1).sum()} aresta(s) repetida(s), {sem.sum()} sem par)')
    elif np.einsum('ij,ij->', t[:, 0], np.cross(t[:, 1], t[:, 2])) <= 0:
        erros.append('normais para dentro (volume negativo)')
    if abs(v[:, 2].min()) > .01:
        erros.append(f'z mínimo = {v[:, 2].min():.3f}, esperado 0')
    # planta: no máximo o múltiplo de 35 mais próximo (+5 mm de cada lado acima de z 30)
    L, p = SPEC['limites'], SPEC['passo_celula']
    lat = path[:-4] + '.json'  # JSON lateral: células, folga (desloca o perfil esperado), modo solto e peça (regras do baú)
    J = json.load(open(lat, encoding='utf-8')) if os.path.exists(lat) else {}
    cel = J.get('celulas')  # [nx, ny]: o objeto não pode passar do bloco
    for nome, m, extra in (('até z 30', v[:, 2] <= L['z_excecao_mm'], 0), ('total', v[:, 2] >= 0, 2 * L['excecao_extra_mm'])):
        for i, eixo in enumerate('xy'):
            tam = np.ptp(v[m, i])
            if tam > (cel[i] if cel else max(round(tam / p), 1)) * p + extra + TOL:
                erros.append(f'planta {eixo} ({nome}) = {tam:.2f} mm excede a célula')
    folga, solto = J.get('folga_extra_mm', 0), J.get('fundir_com_bloco', True) is False
    tipo, desv = 'solto (sem pé)', 0.
    if not solto:  # pé: melhor tipo do spec, desvio ≤ 0,1 mm abaixo de z_protegido
        prof = perfil(t, 20.)
        d = {n: desvio(prof, dict(pe, perfil=[(z, hw + folga if hw < p / 2 else hw) for z, hw in pe['perfil']]), pe['z_protegido']) for n, pe in SPEC['pes'].items()}
        tipo = min(d, key=lambda n: d[n][0])
        desv = d[tipo][0]
        if desv > TOL:
            erros.append(f'pé fora do spec: melhor {tipo} desvia {desv:.3f} mm em z={d[tipo][1]}')
    # overhang > 45° (normal para baixo), sem a face z=0; só conta o que está exposto (embaixo há ar), não faces internas de cascas sobrepostas
    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    nz = n[:, 2] / np.maximum(np.linalg.norm(n, axis=1), 1e-12)
    ov = np.where((nz < -np.cos(np.radians(L['overhang_graus']))) & (t[:, :, 2].max(1) > .01))[0]
    expo = 0.
    if len(ov):
        am = ov[np.linspace(0, len(ov) - 1, min(len(ov), 300)).astype(int)]  # amostra fixa (≤ 300 faces), proporcional à área
        sob = t[am].mean(1) + [1.37e-3, 2.11e-3, -.03]
        livre = np.array([not dentro_de_solido(t, n[:, 2], q) for q in sob])
        expo = area[ov].sum() * area[am][livre].sum() / area[am].sum()
    if J.get('peca') == 'bau':
        erros += regras_bau(t, v, J, area, expo)
    if J.get('peca') == 'estatua':
        erros += regras_estatua(v, J, expo)
    if J.get('espalhar'):
        erros += regras_detalhes(v, J)
    est = ''
    if 'relevo_min_mm' in J and J.get('peca') != 'telhado':  # relevo medido no topo plano (o telhado é inclinado)
        e, fr = regras_relevo(t, v, J)
        erros += e
        est = f', sulco estreito {fr:.0%}'
    info = f'{int(deg.sum())} sliver(s), tipo {tipo} (desvio {desv:.3f}), overhang>45° (área a suportar, só informativo) {expo:.2f} mm²{est}'
    return erros, info


def juncao_t(e, sem, fdeg, primeiro, v, tol=1e-4):
    """Para cada aresta sem par (a→b): True se ela fecha numa junção em T — existe m (vértice de triângulo degenerado) colinear
    entre a e b com b→m e m→a presentes — ou se ela mesma é um pedaço (b→m / m→a) de uma junção assim. Malha fechada; os fatiadores aceitam."""
    E = {(int(a), int(b)) for a, b in e}
    P = v[primeiro]  # posição de cada id
    ms = np.unique(fdeg.ravel())
    idx = np.where(sem)[0]
    falta = {(int(e[i, 0]), int(e[i, 1])) for i in idx}
    resolvidas = set()
    for a, b in falta:
        for m in ms:
            if (b, m) in E and (m, a) in E:
                ab, am = P[b] - P[a], P[m] - P[a]
                t_ = np.dot(am, ab) / max(np.dot(ab, ab), 1e-12)
                if 0 < t_ < 1 and np.linalg.norm(am - t_ * ab) < tol:
                    resolvidas |= {(a, b), (b, m), (m, a)}
                    break
    return np.array([(int(e[i, 0]), int(e[i, 1])) in resolvidas for i in idx])


def regras_relevo(t, v, J):
    """Relevo MEDIDO no STL, no centro 16×16 mm (longe das paredes): p95 da profundidade abaixo de altura_liso ≥ relevo_min_mm
    e no máximo ESTREITO do sulco mais estreito que 0,8 mm. Textura Lisa (relevo_min_mm < 0,4): só exige que o topo exista."""
    H, rmin = J['altura'], min(J['relevo_min_mm'], .4)
    c = v[(v[:, 2] > H - 3.2) & (v[:, 2] <= H + .01) & (np.abs(v[:, 0]) < 8) & (np.abs(v[:, 1]) < 8)]
    if len(c) < 50:
        return ['relevo: sem amostras no topo'], 0.
    e = []
    p95 = np.percentile(H - c[:, 2], 95)
    if p95 < rmin:
        e.append(f'relevo p95 = {p95:.2f} mm < {rmin}')
    p = amostras(t)
    p = p[(p[:, 2] > H - 3.2) & (p[:, 2] <= H + .01)]
    G = campo(p[:, 0], p[:, 1], p[:, 2], -8, 8, -8, 8, cel=.25)
    fr = estreito(G, .25) if G is not None else 0.
    if rmin >= .4 and fr > ESTREITO:
        e.append(f'{fr:.0%} do sulco mais estreito que 0,8 mm (máx. {ESTREITO:.0%})')
    return e, fr


def regras_detalhes(v, J):
    """Fase 6b: detalhes (tudo acima do piso H) a ≥ 1 mm da borda do bloco, altura ≥ 0,8 mm acima do piso e sem sair da célula."""
    d = v[v[:, 2] > J['altura'] + 1e-3]
    if not len(d):
        return []
    e = []
    for eixo, n in enumerate(J['celulas']):
        lim = n * 17.5
        if np.abs(d[:, eixo]).max() > lim - 1 + 1e-3:
            e.append(f'detalhe a {lim - np.abs(d[:, eixo]).max():.2f} mm da borda (mín. 1)')
    if d[:, 2].max() - J['altura'] < .8:
        e.append(f'detalhe com só {d[:, 2].max() - J["altura"]:.2f} mm de altura (mín. 0,8)')
    return e


def regras_estatua(v, J, expo):
    """Fase 6c: altura acima do piso ±10 % de 28 mm; dentro do bloco (planta já testada). Overhang não reprova (impressão com suportes)."""
    zf = 1.2 if J.get('fundir_com_bloco', True) is False else J['altura']
    h = v[:, 2].max() - zf
    e = [f'estátua com {h:.1f} mm, fora de ±10 % de 28'] if abs(h - 28) > 2.8 else []
    return e


def dentro_de_solido(t, nzs, q):
    """Raio de q para -z: cruzamentos com normal p/ baixo (+1) menos p/ cima (-1) > 0 => dentro de algum sólido."""
    a, b, c = t[:, 0], t[:, 1], t[:, 2]
    s1 = (b[:, 0] - a[:, 0]) * (q[1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (q[0] - a[:, 0])
    s2 = (c[:, 0] - b[:, 0]) * (q[1] - b[:, 1]) - (c[:, 1] - b[:, 1]) * (q[0] - b[:, 0])
    s3 = (a[:, 0] - c[:, 0]) * (q[1] - c[:, 1]) - (a[:, 1] - c[:, 1]) * (q[0] - c[:, 0])
    k = (((s1 >= 0) & (s2 >= 0) & (s3 >= 0)) | ((s1 <= 0) & (s2 <= 0) & (s3 <= 0))) & (np.abs(nzs) > 1e-12)
    n = np.cross(b[k] - a[k], c[k] - a[k])
    zp = a[k, 2] - (n[:, 0] * (q[0] - a[k, 0]) + n[:, 1] * (q[1] - a[k, 1])) / n[:, 2]
    return (np.where(n[:, 2][zp < q[2]] < 0, 1, -1)).sum() > 0


def casco_area(p):
    """Área do fecho convexo 2D (cadeia monotônica)."""
    p = np.unique(np.round(p, 3), axis=0)
    p = p[np.lexsort((p[:, 1], p[:, 0]))]
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    h = []
    for seq in (p, p[::-1]):
        cad = []
        for q in seq:
            while len(cad) >= 2 and cr(cad[-2], cad[-1], q) <= 0:
                cad.pop()
            cad.append(q)
        h += cad[:-1]
    h = np.array(h)
    return abs(np.dot(h[:, 0], np.roll(h[:, 1], -1)) - np.dot(h[:, 1], np.roll(h[:, 0], -1))) / 2


def regras_bau(t, v, J, area, expo):
    """Aceite da Fase 5: dimensões do baú fechado ±15 % de 18,9 × 26,1 × 17,1; solto = apoio plano ≥ 80 % da projeção. Overhang não reprova (impressão com suportes)."""
    e = []
    solto = J.get('fundir_com_bloco', True) is False
    zf = 1.2 if solto else J['altura']  # topo do piso/plinto
    if J.get('estado') == 0:
        acima = v[v[:, 2] > zf + .3]
        tam = sorted(np.ptp(acima[:, :2], axis=0))
        for got, ref, nome in zip(tam + [acima[:, 2].max() - zf], [18.9, 26.1, 17.1], ('menor lado', 'maior lado', 'altura')):
            if abs(got - ref) > .15 * ref:
                e.append(f'baú {nome} = {got:.1f} mm fora de ±15 % de {ref}')
    if solto:
        apoio = area[t[:, :, 2].max(1) < .01].sum()
        proj = casco_area(v[:, :2])
        if apoio < .8 * proj:
            e.append(f'apoio plano {apoio:.0f} mm² < 80 % da projeção ({proj:.0f} mm²)')
    return e


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    falhou = False
    for a in sys.argv[1:]:
        erros, info = validar(a)
        print(('FALHA: ' + '; '.join(erros) if erros else 'OK') + f' | {info} | {os.path.basename(a)}')
        falhou |= bool(erros)
    sys.exit(falhou)
