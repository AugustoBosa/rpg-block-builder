"""Piloto: objeto 3D externo (glTF/STL) fundido a um bloco liso. Roda no Blender, headless:
  blender.exe -b -P piloto_externos.py -- [--voxel 0.15] [--parede 0.8] --saida saida/externos
Para cada item de PILOTO: importa, junta as malhas, escala (maior lado da planta = alvo), Solidify (dá espessura a
planos soltos) + Remesh voxel (fecha a malha; sem Decimate: ele abre arestas), apoia no topo do bloco e exporta STL + JSON + PNG."""
import sys, os, json, bpy, bmesh
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar import arg, liso, AQUI, exportar_stl, info_peca

# nome: (arquivo em externos/, células, maior lado da planta em mm, giro em z (graus), fonte e licença)
PILOTO = {
    'Caldeirao': ('quaternius/Exports/glTF/Cauldron.gltf', 1, 24, 0, 'Quaternius Fantasy Props MegaKit, CC0'),
    'Estatua Washington': ('smithsonian/washington.glb', 1, 28, 0, 'Smithsonian 3D (Greenough 1840), CC0'),
    'Altar': ('printables/holy_altar.stl', 2, 60, 90, 'Printables 281644 (owen Harriman), CC BY'),
}
AFUNDA = .3  # mm do objeto dentro do bloco: sobreposição garante a união no fatiador


def importar(caminho):
    antes = set(bpy.data.objects)
    if caminho.endswith('.stl'):
        bpy.ops.wm.stl_import(filepath=caminho)
    else:
        bpy.ops.import_scene.gltf(filepath=caminho)
    bm = bmesh.new()
    dg = bpy.context.evaluated_depsgraph_get()
    for o in set(bpy.data.objects) - antes:
        if o.type == 'MESH':
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
            me.transform(o.matrix_world)
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
    for o in set(bpy.data.objects) - antes:
        bpy.data.objects.remove(o)
    me = bpy.data.meshes.new('externo')
    bm.to_mesh(me)
    return bpy.data.objects.new('externo', me)


def modificar(obj, tipo, **props):
    """Aplica um modificador congelando a malha avaliada (mesmo truque do exportar_stl do gerar.py)."""
    m = obj.modifiers.new(tipo, tipo)
    for k, v in props.items():
        setattr(m, k, v)
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    obj.modifiers.clear()
    obj.data = me


def main():
    spec = json.load(open(os.path.join(AQUI, 'spec_encaixe.json'), encoding='utf-8'))
    voxel, parede = float(arg('--voxel', .15)), float(arg('--parede', .8))
    out = os.path.abspath(arg('--saida', 'saida/externos'))
    os.makedirs(out, exist_ok=True)
    pe = 'pe_longo'
    for nome, (arq, n, alvo, giro, fonte) in PILOTO.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        s = bpy.context.scene
        obj = importar(os.path.join(AQUI, 'externos', arq))
        s.collection.objects.link(obj)
        tri0 = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        me = obj.data
        xs, ys = [v.co.x for v in me.vertices], [v.co.y for v in me.vertices]
        k = alvo / max(max(xs) - min(xs), max(ys) - min(ys))
        from mathutils import Matrix
        me.transform(Matrix.Rotation(giro * 3.14159265 / 180, 4, 'Z') @ Matrix.Scale(k, 4))
        modificar(obj, 'SOLIDIFY', thickness=parede, offset=-1)  # para dentro: não engorda a peça fechada
        modificar(obj, 'REMESH', mode='VOXEL', voxel_size=voxel)
        me = obj.data
        lo = [min(v.co[i] for v in me.vertices) for i in range(3)]
        hi = [max(v.co[i] for v in me.vertices) for i in range(3)]
        me.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, spec['pes'][pe]['altura_liso'] - AFUNDA - lo[2])))
        bloco = bpy.data.objects.new('bloco', liso(pe, n, spec))
        s.collection.objects.link(bloco)
        for o in (obj, bloco):
            o.select_set(True)
        bpy.context.view_layer.objects.active = bloco
        bpy.ops.object.join()
        base = os.path.join(out, f'EXT-NL-{nome} Fundido Longo' + (f' {n}x1' if n > 1 else ''))  # mesmo padrão do nome_peca: pé e células
        exportar_stl(bloco, base + '.stl', final=False)  # limpa os triângulos de área zero que o remesh deixa
        info = info_peca('liso', pe, n, dict(semente=0, espalhar=False), spec, 0)
        info.update(peca='externo', fonte=fonte, arquivo=arq, escala=k, voxel_mm=voxel, parede_mm=parede, tri_original=tri0,
                    objeto_mm=[round(h - l, 1) for l, h in zip(lo, hi)])
        json.dump(info, open(base + '.json', 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
        f = 1.3 * (1 + (n - 1) * .6)
        bpy.ops.object.camera_add(location=(90 * f, -90 * f, 70 * f), rotation=(1.1, 0, 0.785))
        s.camera = bpy.context.object
        s.render.engine = 'BLENDER_WORKBENCH'
        s.render.resolution_x = s.render.resolution_y = 512
        s.display.shading.show_cavity = True
        s.render.filepath = base + '.png'
        bpy.ops.render.render(write_still=True)
        print('GERADO', nome, f'escala {k:.4f}', f'objeto {[round(h - l, 1) for l, h in zip(lo, hi)]} mm')


if __name__ == '__main__':
    main()
