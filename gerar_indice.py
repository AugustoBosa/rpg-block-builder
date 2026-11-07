"""Gera o indice dos arquivos Dungeon Blocks a partir de hd_listagem.tsv (tamanho<TAB>caminho_posix).

Saidas:
  indice_arquivos.csv  -> 1 linha por arquivo de modelo (stl/lys/3mf/gcode)
  indice_pecas.csv     -> 1 linha por peca (colecao+codigo+nome), com variantes disponiveis
  indice_mapas.csv     -> mapas .json do Builder (hd_meta/) com pecas usadas
  catalogo/<COL>/pNN.jpg -> paginas dos PDFs-catalogo (imagem de cada peca com codigo)
"""
import csv, glob, json, os, re
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = "/001 - DUNGEON BLOCKS/"

COLECOES = {  # prefixo -> (nome, tema)
    "MH": ("Majestic Highlands", "campo / natureza"),
    "ET": ("Egyptian Temple", "deserto / templo egipcio"),
    "PS": ("Pirate Ship", "navio pirata"),
    "DE1": ("Dungeon Extension 1", "dungeon classica"),
    "HG": ("Haunted Graveyard", "cemiterio assombrado"),
    "HG2": ("Haunted Graveyard 2", "cemiterio assombrado"),
    "LC": ("Lost Cave", "caverna / mina"),
    "MT1": ("Medieval Town 1", "cidade medieval"),
    "MT2": ("Medieval Town 2", "cidade medieval"),
    "RR": ("Rampart and Ruins", "muralhas / ruinas"),
    "CD": ("The Colossal Dungeon", "dungeon gigante (grid XL)"),
    "CS": ("The Creepy Swamp", "pantano sombrio"),
    "UD": ("The Ultimate Dungeon", "dungeon classica"),
}
PASTA_PREFIXO = {  # fallback para arquivos sem prefixo (Basic Elements etc.)
    "01 - Majestic Highlands": "MH", "09 Egyptian Temple": "ET", "20 PirateShip": "PS",
    "Dungeon Blocks - Dungeon Extension 1.7z": "DE1", "Haunted Graveyard": "HG",
    "Lost Cave-Pre-Supported": "LC", "Medieval Town PT1 (full)(sup)(stl)": "MT1",
    "Medieval Town II": "MT2", "Rampart and Ruins.7z": "RR", "The Colossal dungeon": "CD",
    "The Creepy Swamp": "CS", "The Ultimate Dungeon": "UD",
}
VARIANTES = {"HOL": "oco (hollowed)", "SUP": "com suportes", "NL": "sem logo",
             "UNS": "sem suportes", "": "?"}
# ordem importa: primeira palavra-chave que casar define a categoria
CATEGORIAS = [
    ("sistema/encaixe", r"grid|border|lock|key|adaptor|level|plate|support\b"),
    ("escada", r"stair|ladder|step"),
    ("porta/entrada", r"door|gate|entrance|portal|arch"),
    ("ponte", r"bridge"),
    ("agua", r"river|water|lake|pond|swamp water|well|fountain|sea|waterfall"),
    ("parede", r"wall|rampart|fence|palisade|hull"),
    ("coluna", r"column|pillar|pilar|statue|obelisk"),
    ("vegetacao", r"tree|bush|grass|forest|plant|flower|mushroom|root"),
    ("rocha/caverna", r"rock|stalag|cave|crystal|cliff|boulder"),
    ("caminho/corredor", r"path|road|corridor|railway|street|dock|sidewalk"),
    ("construcao", r"house|roof|tower|temple|tent|shop|tavern|building|mast|deck|window|balcony|buttress|sail|market"),
    ("chao", r"ground|floor|sand|dirt|tile|mud"),
    ("cripta/tumulo", r"grave|tomb|coffin|sarcophag|crypt|mausoleum|catacomb|skull|bone"),
    ("armadilha/perigo", r"trap|lava|prison|chains|crossbow|catapult"),
    ("criatura", r"dragon|boar|crocodil|snake|spider|rat"),
    ("mobilia/prop", r"table|chair|bed|chest|barrel|crate|cannon|light|lit\b|torch|altar|throne|wagon|treasure"
                     r"|library|fireplace|fire|chandelier|candle|bench|bath|shel|vase|wardrobe|desk|bar\b|boat|captain|magic"),
    # segmentos de parede por altura (ex.: "Tall Angle", "Low End")
    ("parede", r"\b(low|medium|tall)\b|angle|corner|\bend\b|diagonal"),
]

NOME_RE = re.compile(
    r"^(?P<pre>[A-Z]+\d?)-(?:(?P<v1>HOL|SUP|NL)-)?(?P<cod>\d{3})-(?:(?P<v2>HOL|SUP|NL)-)?(?P<nome>.+)$")
SEM_PREFIXO_RE = re.compile(r"^(?:(?P<v>HOL|SUP|NL)-)?(?P<nome>.+)$")


def variante_da_pasta(pasta):
    p = pasta.lower()
    if "hollow" in p or "holloweed" in p or "(hol)" in p: return "HOL"
    if "unsupported" in p or "uns" in p: return "UNS"
    if "supported" in p or "-sup" in p or "pre-supported" in p: return "SUP"
    if "no logo" in p or "nl" in p.split("-"): return "NL"
    return ""


def categoria(nome):
    n = nome.lower()
    for cat, rx in CATEGORIAS:
        if re.search(rx, n): return cat
    return "outro"


def main():
    linhas = []
    with open(os.path.join(ROOT, "hd_listagem.tsv"), encoding="utf-8") as f:
        for l in f:
            tam, caminho = l.rstrip("\n").split("\t", 1)
            if not caminho.startswith(BASE): continue
            ext = caminho.rsplit(".", 1)[-1].lower()
            if ext not in ("stl", "lys", "3mf", "gcode"): continue
            partes = caminho[len(BASE):].split("/")
            pasta_col = partes[0] if len(partes) > 1 else ""
            subpasta = "/".join(partes[1:-1])
            base = partes[-1].rsplit(".", 1)[0]
            m = NOME_RE.match(base)
            if m:
                pre, cod, nome = m["pre"], m["cod"], m["nome"]
                var = m["v1"] or m["v2"] or ""
            else:
                pre, cod = PASTA_PREFIXO.get(pasta_col, ""), ""
                m2 = SEM_PREFIXO_RE.match(base)
                var, nome = m2["v"] or "", m2["nome"]
            if not var:
                var = variante_da_pasta(subpasta) or variante_da_pasta(pasta_col) or ("UNS" if pre else "")
            nome = nome.strip()
            col, tema = COLECOES.get(pre, (pasta_col or "(raiz)", "?"))
            linhas.append({
                "colecao": col, "prefixo": pre, "tema": tema, "codigo": cod, "nome": nome,
                "categoria": categoria(nome), "variante": var, "variante_desc": VARIANTES.get(var, var),
                "extensao": ext, "tamanho_mb": round(int(tam) / 1e6, 2),
                "fixed": "sim" if "fixed" in caminho.lower() else "",
                "bonus": "sim" if "bonus" in caminho.lower() else "",
                "subpasta": subpasta, "caminho_hd": caminho,
            })
    linhas.sort(key=lambda r: (r["prefixo"], r["codigo"], r["nome"], r["variante"], r["extensao"]))
    escrever("indice_arquivos.csv", linhas)

    pecas = defaultdict(lambda: {"variantes": set(), "stl_mb": {}, "lys": False, "caminhos": {}})
    for r in linhas:
        k = (r["colecao"], r["prefixo"], r["tema"], r["codigo"], r["nome"], r["categoria"])
        p = pecas[k]
        if r["extensao"] == "lys": p["lys"] = True; continue
        p["variantes"].add(r["variante"])
        p["stl_mb"][r["variante"]] = r["tamanho_mb"]
        p["caminhos"].setdefault(r["variante"], r["caminho_hd"])
    saida = []
    for (col, pre, tema, cod, nome, cat), p in sorted(pecas.items(), key=lambda kv: kv[0][1:]):
        vs = sorted(p["variantes"])
        saida.append({
            "colecao": col, "prefixo": pre, "tema": tema, "codigo": cod, "nome": nome, "categoria": cat,
            "variantes": "+".join(vs), "tem_lys": "sim" if p["lys"] else "",
            "menor_stl_mb": min(p["stl_mb"].values()) if p["stl_mb"] else "",
            # caminho preferido p/ uso digital: sem suporte > sem logo > oco > com suporte
            "caminho_preferido": next((p["caminhos"][v] for v in ("UNS", "NL", "HOL", "SUP", "") if v in p["caminhos"]), ""),
        })
    escrever("indice_pecas.csv", saida)

    mapas = []
    for jp in sorted(glob.glob(os.path.join(ROOT, "hd_meta", "**", "*.json"), recursive=True)):
        try: d = json.load(open(jp, encoding="utf-8"))
        except Exception: continue
        c = Counter(t["element"] for L in d.get("levels", []) for t in L.get("tiles", []))
        mapas.append({"arquivo": os.path.relpath(jp, ROOT).replace("\\", "/"), "titulo": d.get("title", ""),
                      "niveis": len(d.get("levels", [])), "total_tiles": sum(c.values()),
                      "pecas_distintas": len(c), "pecas": " ".join(f"{k}x{v}" for k, v in sorted(c.items()))})
    escrever("indice_mapas.csv", mapas)

    gerar_catalogo()
    print(len(linhas), "arquivos |", len(saida), "pecas |", len(mapas), "mapas")


def gerar_catalogo():
    import fitz
    for pdf in glob.glob(os.path.join(ROOT, "hd_meta", "**", "*PDF*.pdf"), recursive=True):
        pre = os.path.basename(pdf).split("-")[0]
        dst = os.path.join(ROOT, "catalogo", pre)
        if os.path.isdir(dst): continue
        os.makedirs(dst)
        d = fitz.open(pdf)
        for i, pg in enumerate(d, 1):
            pg.get_pixmap(matrix=fitz.Matrix(0.6, 0.6)).save(os.path.join(dst, f"p{i:02d}.jpg"))


def escrever(nome, linhas):
    with open(os.path.join(ROOT, nome), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
        w.writeheader(); w.writerows(linhas)


if __name__ == "__main__":
    main()
