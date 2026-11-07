"""Mede o quanto a malha aparece: python facetas.py a.stl [b.stl ...]. Ângulo entre triângulos vizinhos, por comprimento de aresta, fora dos planos. Originais: p90 de 17 a 23 graus."""
import sys,numpy as np,os
sys.path.insert(0,'.')
from medir_stl import carregar
def med(f):
    t=carregar(f).reshape(-1,3,3).astype(np.float64)
    _,inv=np.unique(np.round(t.reshape(-1,3),4),axis=0,return_inverse=True); inv=inv.ravel(); idx=inv.reshape(-1,3)
    n=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]); a=np.linalg.norm(n,axis=1); n=n/np.maximum(a,1e-12)[:,None]
    e=np.vstack([idx[:,[0,1]],idx[:,[1,2]],idx[:,[2,0]]]); fi=np.tile(np.arange(len(t)),3)
    e.sort(1); k=e[:,0]*(idx.max()+1)+e[:,1]; o=np.argsort(k); k=k[o]; fi=fi[o]; e=e[o]
    p=np.flatnonzero((k[1:]==k[:-1]))
    cos=np.clip((n[fi[p]]*n[fi[p+1]]).sum(1),-1,1); ang=np.degrees(np.arccos(cos))
    v=np.unique(np.round(t.reshape(-1,3),4),axis=0); L=np.linalg.norm(v[e[p,0]]-v[e[p,1]],axis=1)
    m=ang>2  # ignora plano
    tot=L[m].sum()
    return len(t),(a.sum()/2),np.median(L),(L[(ang>15)&(ang<60)].sum()/tot),(L[ang>=60].sum()/tot),np.percentile(ang[m],90)
print('arquivo | tri | área mm² | aresta p50 | % vinco 15-60° | % >=60° | p90 ângulo')
for f in sys.argv[1:]:
    r=med(f); print(f"{os.path.basename(os.path.dirname(f))[:6]}/{os.path.basename(f)[:30]:30} {r[0]:7d} {r[1]:7.0f} {r[2]:.3f} {r[3]*100:5.1f} {r[4]*100:5.1f} {r[5]:5.1f}")
