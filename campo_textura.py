"""Estatística do campo de uma textura do Blender (referência) numa área de 200 × 200 mm, sem malha nem suavização.
  blender.exe -b -P campo_textura.py -- <k> [onde=piso]
Compare com `cd web && npx tsx campo.ts`: p50, p95 e fração > 0,4 mm devem bater. Janela pequena (16 mm) engana: só 2 ou 3 pedras."""
import bpy, sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gerar

a = sys.argv[sys.argv.index('--') + 1:]
k, onde = int(a[0]), a[1] if len(a) > 1 else 'piso'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=600, y_subdivisions=600, size=200)
o = bpy.context.object
ng = bpy.data.node_groups.new('campo', 'GeometryNodeTree')
ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
N, L = ng.nodes, ng.links
ent, sai = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
sep = N.new('ShaderNodeSeparateXYZ')
L.new(N.new('GeometryNodeInputPosition').outputs[0], sep.inputs[0])
g = N.new('GeometryNodeGroup')
g.node_tree = gerar.grupo_tex(k, onde)
L.new(sep.outputs[0], g.inputs['gx'])
L.new(sep.outputs[1], g.inputs['gy'])
for n, v in dict(pz=0, py=0, fatia=13.7, tamanho=10, profundidade=.5, desgaste=.5).items():  # padrões do piso, semente 1
    g.inputs[n].default_value = v
st = N.new('GeometryNodeStoreNamedAttribute')
st.data_type, st.inputs['Name'].default_value = 'FLOAT', 'd'
L.new(ent.outputs[0], st.inputs['Geometry'])
L.new(g.outputs[0], st.inputs['Value'])
L.new(st.outputs[0], sai.inputs[0])
o.modifiers.new('g', 'NODES').node_group = ng
me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
d = np.empty(len(me.vertices))
me.attributes['d'].data.foreach_get('value', d)
print(f'CAMPO {gerar.TEXTURAS[k]} {onde}: p50 {np.median(d):.3f}  p95 {np.percentile(d, 95):.3f}  f>0,4 {(d > .4).mean():.2f}')
