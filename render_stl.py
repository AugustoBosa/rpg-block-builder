"""Renderiza STLs (nossos ou originais) com o shading do gerar.py: close do topo, para comparar o detalhe das texturas.
  blender.exe -b -P render_stl.py -- saida/pasta a.stl [b.stl ...] [--longe]
PNG de 768 px ao lado de cada nome em saida/pasta. --longe = câmera da folha de contato (peça inteira)."""
import sys, os, bpy

a = sys.argv[sys.argv.index('--') + 1:]
longe = '--longe' in a
a = [x for x in a if x != '--longe']
out, stls = os.path.abspath(a[0]), a[1:]
os.makedirs(out, exist_ok=True)
for stl in stls:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=stl)
    o = bpy.context.selected_objects[0]
    xs, ys, zs = zip(*[o.matrix_world @ v.co for v in o.data.vertices])
    cx, cy, zt = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(zs)
    d = 1.0 if longe else .38  # close: o topo de 35 mm enche o quadro
    bpy.ops.object.camera_add(location=(cx + 90 * d, cy - 90 * d, zt + 45 * d + (25 if longe else 0)), rotation=(1.1 if longe else .95, 0, .785))
    s = bpy.context.scene
    s.camera = bpy.context.object
    s.render.engine = 'BLENDER_WORKBENCH'
    s.render.resolution_x = s.render.resolution_y = 768
    sh = s.display.shading
    sh.show_cavity, sh.cavity_type = True, 'BOTH'
    s.render.filepath = os.path.join(out, os.path.basename(stl)[:-4] + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDER', s.render.filepath)
