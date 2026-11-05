"""בדיקת פנים האוטובוס: מתא הנהג אחורה, ומהדלת האמצעית קדימה. תאורת תקרה פנימית."""
import bpy, math, os
from mathutils import Vector
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 128; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
try: sc.view_settings.view_transform = 'AgX'
except TypeError: pass
w = bpy.data.worlds.new('W'); sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.75, 0.8, 0.9, 1); bg.inputs[1].default_value = 1.0
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 4; sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
for k in range(5):                                   # פסי תאורה בתקרה
    l = bpy.data.objects.new(f'Ceil{k}', bpy.data.lights.new(f'C{k}', 'AREA')); sc.collection.objects.link(l)
    l.data.shape = 'RECTANGLE'; l.data.size = 0.25; l.data.size_y = 1.6; l.data.energy = 60
    l.location = (0, -4.3 + k * 2.1, 2.95); l.rotation_euler = (0, 0, 0)
    l.rotation_euler = (math.pi, 0, 0)
def shot(name, pos, target, lens=18):
    cam = bpy.data.objects.new('Cam_' + name, bpy.data.cameras.new('C')); sc.collection.objects.link(cam)
    cam.data.lens = lens; cam.data.clip_start = 0.05; cam.location = pos
    cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam; sc.render.filepath = os.path.abspath(f'out/inside_{name}.png'); bpy.ops.render.render(write_still=True); print('RENDER', name)
shot('fwd_back', (0.0, -3.4, 1.95), (0, 5.0, 1.25))
shot('mid_front', (0.4, 1.8, 1.9), (0, -6.0, 1.3))
