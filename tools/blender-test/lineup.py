"""שורת אנשים לבחירה: גוף ממוצע ים-תיכוני/ישראלי (תערובת מוצא), עור, שיער ובגדים שונים — בלי הדפסים."""
import bpy, bmesh, os, sys, glob, importlib, math, traceback
from mathutils import Matrix
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
base = next(p for p in ('bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb') if importlib.util.find_spec(p))
HS = importlib.import_module(base + '.services.humanservice').HumanService
TS = importlib.import_module(base + '.services.targetservice').TargetService
ud = importlib.import_module(base + '.services.locationservice').LocationService.get_user_data()
A = lambda rel: glob.glob(f'{ud}/**/{rel}', recursive=True)[0]
# (מגדר, גיל, מוצא caucasian/african/asian, עור, שיער, בגדים, נעליים)
def bevbox(name, size, loc, mat_rgb, bev=0.03):
    me = bpy.data.meshes.new(name); b = bmesh.new(); bmesh.ops.create_cube(b, size=1.0); b.to_mesh(me); b.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.scale = size; ob.location = loc
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    m = ob.modifiers.new('bev', 'BEVEL'); m.width = bev; m.segments = 4; m.limit_method = 'NONE'
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(cloth(name + '_m', mat_rgb)); return ob
def cloth(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name); b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; return m
def attach(ob, rig, bone):
    mw = ob.matrix_world.copy(); ob.parent = rig; ob.parent_type = 'BONE'; ob.parent_bone = bone
    bpy.context.view_layer.update(); ob.matrix_world = mw
def add_backpack(bm, rig, rgb):
    bpy.context.view_layer.update()
    top = max((bm.matrix_world @ v.co).z for v in bm.data.vertices)
    zc = top * 0.70; back = max((bm.matrix_world @ v.co).y for v in bm.data.vertices if abs((bm.matrix_world @ v.co).z - zc) < 0.05)
    bag = bevbox('Backpack', (0.30, 0.14, 0.42), (rig.location.x, back + 0.075, zc), rgb, 0.04)
    for sd in (1, -1):
        st = bevbox('Strap', (0.045, 0.02, 0.36), (rig.location.x + sd*0.09, back - 0.04 if False else back - 0.005, zc + 0.12), (0.05, 0.05, 0.05), 0.008)
        attach(st, rig, 'spine03')
    attach(bag, rig, 'spine03')
def add_kippa(bm, rig, rgb):
    bpy.context.view_layer.update()
    vs = [bm.matrix_world @ v.co for v in bm.data.vertices]
    top = max(v.z for v in vs); yc = sum(v.y for v in vs if v.z > top - 0.03) / max(1, len([v for v in vs if v.z > top - 0.03]))
    me = bpy.data.meshes.new('Kippa'); b = bmesh.new(); bmesh.ops.create_uvsphere(b, u_segments=32, v_segments=16, radius=0.075)
    bmesh.ops.delete(b, geom=[v for v in b.verts if v.co.z < 0.03], context='VERTS'); b.to_mesh(me); b.free()
    ob = bpy.data.objects.new('Kippa', me); bpy.context.scene.collection.objects.link(ob)
    ob.scale = (1, 1, 0.45); ob.location = (rig.location.x, yc + 0.035, top - 0.012); ob.rotation_euler = (math.radians(-12), 0, 0)
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(cloth('Kippa_m', rgb, 0.9)); attach(ob, rig, 'head')
PEOPLE = [
    (1.0, 0.45, (0.80, 0.12, 0.08), 'middleage_caucasian_male', 'short04', 'male_casualsuit01', 'shoes02'),
    (1.0, 0.30, (0.70, 0.22, 0.08), 'young_caucasian_male2',    'short01', 'male_casualsuit02', 'shoes01'),
    (1.0, 0.60, (0.85, 0.08, 0.07), 'middleage_caucasian_male', 'short03', 'male_casualsuit03', 'shoes03'),
    (1.0, 0.35, (0.15, 0.80, 0.05), 'young_african_male',       'short02', 'male_casualsuit05', 'shoes06'),
    (1.0, 0.50, (0.75, 0.15, 0.10), 'middleage_caucasian_male', 'short02', 'male_casualsuit06', 'shoes04'),
    (1.0, 0.40, (0.78, 0.14, 0.08), 'young_caucasian_male',     'short04', 'male_worksuit01',   'shoes05'),
    (0.0, 0.30, (0.78, 0.14, 0.08), 'young_caucasian_female',   'long01',  'female_casualsuit01', 'shoes01'),
    (0.0, 0.45, (0.80, 0.12, 0.08), 'middleage_caucasian_female','bob02',  'female_casualsuit02', 'shoes02'),
    (0.0, 0.25, (0.20, 0.75, 0.05), 'young_african_female',     'ponytail01','female_sportsuit01', 'shoes06'),
    (0.0, 0.70, (0.82, 0.10, 0.08), 'old_caucasian_female',     'bob01',   'female_elegantsuit01','shoes03'),
]
import random
def vary_face(bm, seed):
    """שוברים את הפנים ה'ממוצעות': 10–14 מאפייני פנים אקראיים בעוצמה מתונה (אף, עיניים, גבות, לסת, לחיים, שפתיים, סנטר)"""
    rnd = random.Random(seed)
    root = os.path.dirname(importlib.import_module(base).__file__) + '/data/targets'
    groups = ['nose', 'eyes', 'eyebrows', 'mouth', 'chin', 'cheek', 'head', 'ears', 'neck']
    cands = [p for g_ in groups for p in glob.glob(f'{root}/{g_}/*.target.gz')]
    if seed == 0: print('TS fns', [n for n in dir(TS) if not n.startswith('_')]); print('targets', len(cands), [os.path.basename(c) for c in cands[:15]])
    for pth in rnd.sample(cands, min(14, len(cands))):
        try: TS.load_target(bm, pth, weight=rnd.uniform(0.15, 0.55))
        except Exception as e: print('target fail', os.path.basename(pth), e); break
for i, (g, age, (c, af, asi), skin, hair, suit, shoe) in enumerate(PEOPLE):
    try:
        md = TS.get_default_macro_info_dict()
        md.update(gender=g, age=age, proportions=0.5 + 0.08*((i % 3) - 1), muscle=0.5, weight=0.55 if i % 3 else 0.62, height=0.55 if g else 0.45)
        md['race'] = {'caucasian': c, 'african': af, 'asian': asi}
        bm = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
        vary_face(bm, i)
        HS.add_builtin_rig(bm, 'default', import_weights=True)
        HS.set_character_skin(A(f'skins/{skin}/{skin}.mhmat'), bm)
        for kind, rel in (('Eyes', 'eyes/high-poly/high-poly.mhclo'), ('Eyebrows', f'eyebrows/eyebrow00{(i % 3) + 6}/eyebrow00{(i % 3) + 6}.mhclo'),
                          ('Eyelashes', 'eyelashes/eyelashes01/eyelashes01.mhclo'), ('Hair', f'hair/{hair}/{hair}.mhclo'),
                          ('Clothes', f'clothes/{suit}/{suit}.mhclo'), ('Clothes', f'clothes/{shoe}/{shoe}.mhclo')):
            HS.add_mhclo_asset(A(rel), bm, asset_type=kind)
        rig = bm.parent
        for pb in rig.pose.bones:
            if pb.name.startswith('upperarm01'):
                h = pb.head.copy(); sgn = 1 if h.x > 0 else -1
                pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(sgn * math.radians(38), 4, 'Y') @ Matrix.Translation(-h) @ pb.matrix
                bpy.context.view_layer.update()
        rig.location.x = (i - (len(PEOPLE) - 1)/2) * 0.85
        bpy.context.view_layer.update()
        if i in (0, 1, 3, 6, 8): add_backpack(bm, rig, [(0.08, 0.1, 0.16), (0.12, 0.12, 0.12), (0.35, 0.08, 0.06), (0.1, 0.2, 0.12), (0.2, 0.2, 0.22)][[0, 1, 3, 6, 8].index(i)])
        if i in (2, 4): add_kippa(bm, rig, (0.03, 0.03, 0.05) if i == 2 else (0.85, 0.85, 0.82))
        rig.name = f'P{i}_{suit}'
        print('PERSON', i, suit, skin, hair)
    except Exception:
        traceback.print_exc()
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/lineup.blend'))
# רינדור: מצלמה מלפנים לכל השורה
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 2200, 800
w = bpy.data.worlds.new('W'); sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.8, 0.82, 0.85, 1); bg.inputs[1].default_value = 0.6
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), 0, math.radians(-20))
me = bpy.data.meshes.new('floor'); fl = bpy.data.objects.new('floor', me); sc.collection.objects.link(fl)
import bmesh; b = bmesh.new(); bmesh.ops.create_grid(b, x_segments=1, y_segments=1, size=20); b.to_mesh(me); b.free()
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('C')); sc.collection.objects.link(cam)
cam.data.lens = 40; cam.location = (0, -11.5, 1.1); cam.rotation_euler = (math.radians(88), 0, 0); sc.camera = cam
sc.render.filepath = os.path.abspath('out/lineup.png'); bpy.ops.render.render(write_still=True); print('RENDER lineup')
