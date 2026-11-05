"""תאורה ומצלמה (blender-lighting-lookdev) + רינדור Cycles על המעבד."""
import bpy, sys, os, math
from mathutils import Vector
S = os.environ['SK']; sys.path.insert(0, f'{S}/blender-lighting-lookdev/scripts')
argv = sys.argv[sys.argv.index('--') + 1:]
out, objs = argv[0], argv[1:]
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
w = bpy.data.worlds.new('W'); sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
sky = w.node_tree.nodes.new('ShaderNodeTexSky')
try: sky.sky_type = 'NISHITA'
except TypeError as e: print('sky', e)
w.node_tree.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.35
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 4; sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35)); sun.data.angle = math.radians(2)
cams = {'q': ((10, -14, 3.0), 45), 'side': ((14, 2, 1.6), 35), 'front': ((2.5, -12, 1.7), 40)}
targets = [bpy.data.objects[n] for n in objs if n in bpy.data.objects] or [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('ENV_') and not o.hide_render]
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in targets for c in o.bound_box]
ctr = sum(pts, Vector()) / len(pts)
for k, (pos, lens) in cams.items():
    cam = bpy.data.objects.new('Cam_' + k, bpy.data.cameras.new('C')); sc.collection.objects.link(cam)
    cam.data.lens = lens
    sc_ = float(os.environ.get('CAMSCALE', '1'))
    cam.location = ctr + (Vector(pos) - Vector((0, 0, 0))) * sc_; cam.location.z = pos[2] * (sc_ if sc_ < 1 else 1)
    d = ctr - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam; sc.render.filepath = os.path.abspath(f'out/{out}_{k}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDER', sc.render.filepath)
