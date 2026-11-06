"""ניסוי הנפשה: אדם מ-MPFB הולך, בתנועה מצולמת אמיתית (CMU Motion Capture, המרת BVH של Bruce Hahne — בלי הגבלות שימוש).
העברת התנועה: לכל עצם — הסיבוב בעולם של העצם המקביל ב-BVH, כפול ההפרש בין תנוחות המנוחה (retarget ידני)."""
import bpy, os, sys, glob, importlib, math
from mathutils import Matrix, Vector
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
SC = bpy.context.scene
base = next(p for p in ('bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb') if importlib.util.find_spec(p))
HS = importlib.import_module(base + '.services.humanservice').HumanService
TS = importlib.import_module(base + '.services.targetservice').TargetService
ud = importlib.import_module(base + '.services.locationservice').LocationService.get_user_data()
A = lambda rel: glob.glob(f'{ud}/**/{rel}', recursive=True)[0]
BVH = os.environ['BVH']; RIG = os.environ.get('RIG', 'cmu_mb')

md = TS.get_default_macro_info_dict(); md.update(gender=1.0, age=0.45, weight=0.55, height=0.55)
md['race'] = {'caucasian': 0.8, 'african': 0.12, 'asian': 0.08}
bm = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
HS.add_builtin_rig(bm, RIG, import_weights=True)
HS.set_character_skin(A('skins/middleage_caucasian_male/middleage_caucasian_male.mhmat'), bm)
for kind, rel in (('Eyes', 'eyes/high-poly/high-poly.mhclo'), ('Eyebrows', 'eyebrows/eyebrow006/eyebrow006.mhclo'),
                  ('Hair', 'hair/short04/short04.mhclo'), ('Clothes', 'clothes/male_casualsuit01/male_casualsuit01.mhclo'),
                  ('Clothes', 'clothes/shoes02/shoes02.mhclo')):
    HS.add_mhclo_asset(A(rel), bm, asset_type=kind)
rig = bm.parent
print('RIG BONES', [b.name for b in rig.data.bones][:40])

bpy.ops.import_anim.bvh(filepath=BVH, axis_forward='-Z', axis_up='Y', use_fps_scale=True, rotate_mode='NATIVE')
src = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o is not rig)
print('BVH BONES', [b.name for b in src.data.bones][:40])
act = src.animation_data.action
f0, f1 = (int(x) for x in act.frame_range)
f1 = min(f1, f0 + int(os.environ.get('FRAMES', '160')))
SC.frame_start, SC.frame_end = f0, f1
names = [b.name for b in rig.data.bones if b.name in src.data.bones]
print('MATCHED', len(names), names[:20])
# תנוחת ייחוס: מסובבים את עצמות MPFB כך שכיוון כל עצם יתאים לכיוון שלה במנוחת ה-BVH (תנוחת T).
# בלי זה, הפרש בין תנוחת A של MPFB לתנוחת T של CMU מכניס את הידיים לתוך הגוף.
def wrot(ob, M): return (ob.matrix_world.to_3x3() @ M.to_3x3()).normalized()
for pb in rig.pose.bones: pb.matrix_basis.identity()
bpy.context.view_layer.update()
# מיישרים רק את הגפיים הארוכות (ידיים ורגליים) לתנוחת T. כפות רגליים, בהונות, מפרקי אגן וידיים נשארים בתנוחת המנוחה
# של MPFB — יישור שלהם (בלי סיבוב סביב הציר) הוא מה שגרם להליכה "על קצות האצבעות" כמו בבלט
ALIGN = ('UpLeg', 'Leg', 'Arm', 'ForeArm', 'Shoulder')
order0 = [b.name for b in rig.data.bones if b.name in names and any(b.name.endswith(a) for a in ALIGN) and 'Hand' not in b.name]
for n in order0:
    sb = src.data.bones[n]
    t_dir = (src.matrix_world @ sb.tail_local) - (src.matrix_world @ sb.head_local)
    pb = rig.pose.bones[n]
    c_dir = (rig.matrix_world @ pb.tail) - (rig.matrix_world @ pb.head)
    if t_dir.length < 1e-6 or c_dir.length < 1e-6: continue
    q = c_dir.normalized().rotation_difference(t_dir.normalized())
    Rw = q.to_matrix() @ (rig.matrix_world.to_3x3() @ pb.matrix.to_3x3())
    M = (rig.matrix_world.to_3x3().inverted() @ Rw).to_4x4(); M.translation = pb.matrix.translation
    pb.matrix = M; bpy.context.view_layer.update()
off = {n: wrot(src, src.data.bones[n].matrix_local).inverted() @ wrot(rig, rig.pose.bones[n].matrix) for n in names}
hips = next((n for n in names if n.lower() in ('hips', 'pelvis', 'root')), names[0])
SC.frame_set(f0); bpy.context.view_layer.update()
h_src = (src.matrix_world @ src.pose.bones[hips].head).z          # גובה האגן בתנוחה (במנוחה הוא 0)
h_dst = (rig.matrix_world @ rig.data.bones[hips].head_local).z
k = h_dst / h_src if h_src else 1.0
order = [b.name for b in rig.data.bones if b.name in off]           # מההורה לילד
SC.frame_set(f0); bpy.context.view_layer.update()
p0_src = src.matrix_world @ src.pose.bones[hips].head
p0_dst = rig.matrix_world @ rig.pose.bones[hips].head
for f in range(f0, f1 + 1):
    SC.frame_set(f)
    for n in order:
        pb = rig.pose.bones[n]
        R = (src.matrix_world.to_3x3() @ src.pose.bones[n].matrix.to_3x3()).normalized() @ off[n]
        Rarm = rig.matrix_world.to_3x3().inverted() @ R
        M = Rarm.to_4x4(); M.translation = pb.matrix.translation
        if n == hips:
            d = (src.matrix_world @ src.pose.bones[hips].head) - p0_src
            M.translation = rig.matrix_world.inverted() @ (p0_dst + d * k)
        pb.matrix = M
        bpy.context.view_layer.update()
        pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=f)
        if n == hips: pb.keyframe_insert('location', frame=f)
    if f % 10 == 1:
        hw = rig.matrix_world @ rig.pose.bones[hips].head
        sw = src.matrix_world @ src.pose.bones[hips].head
        print('DBG', f, 'dst hips', tuple(round(v, 2) for v in hw), 'src hips', tuple(round(v, 2) for v in sw), 'k', round(k, 4), 'rigscale', tuple(round(v, 3) for v in rig.scale), 'mode', rig.pose.bones[hips].rotation_mode)
toes = [n for n in ('LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot') if n in rig.pose.bones]
mz = 1e9
for f in range(f0, f1 + 1, 2):
    SC.frame_set(f)
    for n in toes: mz = min(mz, (rig.matrix_world @ rig.pose.bones[n].tail).z)
rig.location.z -= (mz - 0.03); print('DBG floor offset', round(mz, 3))
src.hide_render = True; src.hide_viewport = True
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/anim.blend'))

# תצוגה: Workbench מהיר לסרטון, ו-Cycles לשלוש תמונות
me = bpy.data.meshes.new('floor'); fl = bpy.data.objects.new('floor', me); SC.collection.objects.link(fl)
import bmesh; b = bmesh.new(); bmesh.ops.create_grid(b, x_segments=20, y_segments=20, size=15); b.to_mesh(me); b.free()
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('C')); SC.collection.objects.link(cam); SC.camera = cam
cam.data.lens = 35
SC.frame_set(f0); a = rig.matrix_world @ rig.pose.bones[hips].head; SC.frame_set(f1); b = rig.matrix_world @ rig.pose.bones[hips].head
mid = (a + b) / 2; mid.z = 0.9
side = Vector((-(b - a).y, (b - a).x, 0)).normalized() if (b - a).length > 0.1 else Vector((1, 0, 0))
cam.location = mid + side * max(4.5, (b - a).length * 1.3) + Vector((0, 0, 0.3))
cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); SC.collection.objects.link(sun); sun.data.energy = 3; sun.rotation_euler = (math.radians(45), 0, math.radians(-30))
w = bpy.data.worlds.new('W'); SC.world = w; bgn = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bgn.inputs[0].default_value = (0.8, 0.83, 0.87, 1)
SC.render.resolution_x, SC.render.resolution_y = 960, 540
SC.render.engine = 'CYCLES'; SC.cycles.device = 'CPU'; SC.cycles.samples = 20; SC.cycles.use_denoising = True
SC.frame_start = f0 + 5   # בלי הפריימים של תנוחת ה-T בתחילת ההקלטה
SC.render.fps = 30
try:
    SC.render.image_settings.file_format = 'FFMPEG'; SC.render.ffmpeg.format = 'MPEG4'; SC.render.ffmpeg.codec = 'H264'
    SC.render.ffmpeg.constant_rate_factor = 'HIGH'; SC.render.filepath = os.path.abspath('out/walk.mp4')
except Exception as e:
    print('ffmpeg', e); SC.render.image_settings.file_format = 'PNG'; SC.render.filepath = os.path.abspath('out/walk/f_')
bpy.ops.render.render(animation=True); print('RENDER walk frames', f0, f1)
SC.render.engine = 'CYCLES'; SC.cycles.device = 'CPU'; SC.cycles.samples = 64; SC.cycles.use_denoising = True
SC.render.image_settings.file_format = 'PNG'
for i, f in enumerate(((f0 + f1)//2,)):
    SC.frame_set(f); SC.render.filepath = os.path.abspath(f'out/walk_hq{i}.png'); bpy.ops.render.render(write_still=True)
print('RENDER hq')
