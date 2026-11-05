"""שורה 2: ארבעת הגברים שאהבת, חייל וחיילת, ובנות בלבוש מכוסה. תיקים/כיפות/משקפיים ממוקמים לפי הגוף הנראה (רשת מוערכת) והשלד."""
import bpy, bmesh, os, glob, importlib, math, random, traceback, json
from mathutils import Matrix, Vector
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
base = next(p for p in ('bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb') if importlib.util.find_spec(p))
HS = importlib.import_module(base + '.services.humanservice').HumanService
TS = importlib.import_module(base + '.services.targetservice').TargetService
ud = importlib.import_module(base + '.services.locationservice').LocationService.get_user_data()
def A(rel):
    r = glob.glob(f'{ud}/**/{rel}', recursive=True)
    if not r: raise FileNotFoundError(rel)
    return r[0]
SC = bpy.context.scene

def matc(name, rgb, rough=0.7, metal=0.0):
    m = bpy.data.materials.new(name); b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
def mesh_box(name, size, loc, mat, bev=0.02, rot=None):
    me = bpy.data.meshes.new(name); b = bmesh.new(); bmesh.ops.create_cube(b, size=1.0); b.to_mesh(me); b.free()
    ob = bpy.data.objects.new(name, me); SC.collection.objects.link(ob); ob.scale = size; ob.location = loc
    if rot: ob.rotation_euler = rot
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bev:
        m = ob.modifiers.new('bev', 'BEVEL'); m.width = bev; m.segments = 4; m.limit_method = 'NONE'
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(mat); return ob

def eval_verts(objs):
    dg = bpy.context.evaluated_depsgraph_get(); pts = []
    for o in objs:
        e = o.evaluated_get(dg); me = e.to_mesh()
        pts += [o.matrix_world @ v.co for v in me.vertices]; e.to_mesh_clear()
    return pts
def body_info(bm, rig):
    bpy.context.view_layer.update()
    pts = eval_verts([bm])
    sh = max((rig.matrix_world @ pb.head).z for pb in rig.pose.bones if pb.name.startswith('upperarm01'))
    cx = rig.location.x
    band = [p for p in pts if abs(p.x - cx) < 0.11 and sh - 0.38 < p.z < sh - 0.08]
    return dict(sh=sh, cx=cx, back=max(p.y for p in band), front=min(p.y for p in band), top=max(p.z for p in pts))

def recolor(objs, rgb, keep_shading=True):
    """צובע בגד בצבע אחיד (מסיר הדפסים) ושומר קפלים: בהירות הטקסטורה × הצבע."""
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.node_tree: continue
            nt = m.node_tree
            for b in [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED']:
                inp = b.inputs['Base Color']
                src = inp.links[0].from_socket if inp.is_linked else None
                col = nt.nodes.new('ShaderNodeRGB'); col.outputs[0].default_value = (*rgb, 1)
                if src is not None and keep_shading:
                    bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(src, bw.inputs[0])
                    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 1.9; mul.use_clamp = True
                    nt.links.new(bw.outputs[0], mul.inputs[0])
                    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
                    nt.links.new(col.outputs[0], mix.inputs['A']); nt.links.new(mul.outputs[0], mix.inputs['B'])
                    nt.links.new(mix.outputs['Result'], inp)
                else:
                    nt.links.new(col.outputs[0], inp)

def add_backpack(bi, rgb, big=False):
    w, d, h = (0.36, 0.22, 0.58) if big else (0.30, 0.13, 0.42)
    top = bi['sh'] - 0.04; zc = top - h/2
    mat = matc('M_Bag', rgb, 0.8)
    mesh_box('Backpack', (w, d, h), (bi['cx'], bi['back'] + d/2 + 0.005, zc), mat, 0.045)
    mesh_box('BagPocket', (w*0.7, 0.05, h*0.35), (bi['cx'], bi['back'] + d + 0.02, zc - h*0.18), mat, 0.02)
    strap = matc('M_Strap', (0.04, 0.04, 0.045), 0.8)
    for sd in (1, -1):
        x = bi['cx'] + sd*0.085
        mesh_box('StrapFront', (0.045, 0.012, 0.30), (x, bi['front'] - 0.004, bi['sh'] - 0.2), strap, 0.005)
        mesh_box('StrapTop', (0.045, bi['back'] - bi['front'] + 0.03, 0.014), (x, (bi['back'] + bi['front'])/2, bi['sh'] + 0.012), strap, 0.005)

def add_kippa(bm, hair, rig, rgb):
    pts = eval_verts([bm] + ([hair] if hair else []))
    cx = rig.location.x; top = max(p.z for p in pts if abs(p.x - cx) < 0.05)
    ys = [p.y for p in pts if abs(p.x - cx) < 0.05 and p.z > top - 0.02]; yc = sum(ys)/len(ys)
    me = bpy.data.meshes.new('Kippa'); b = bmesh.new(); bmesh.ops.create_uvsphere(b, u_segments=32, v_segments=16, radius=0.07)
    bmesh.ops.delete(b, geom=[v for v in b.verts if v.co.z < 0.025], context='VERTS'); b.to_mesh(me); b.free()
    ob = bpy.data.objects.new('Kippa', me); SC.collection.objects.link(ob)
    ob.scale = (1, 1, 0.5); ob.location = (cx, yc + 0.04, top - 0.025); ob.rotation_euler = (math.radians(-18), 0, 0)
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(matc('M_Kippa', rgb, 0.9))

def add_sunglasses(eyes, rig):
    pts = eval_verts([eyes]); cx = rig.location.x
    z = sum(p.z for p in pts)/len(pts); yf = min(p.y for p in pts) - 0.018
    lens = matc('M_Lens', (0.01, 0.01, 0.012), 0.05, 0.3); frame = matc('M_Frame', (0.02, 0.02, 0.02), 0.4)
    for sd in (1, -1):
        mesh_box('Lens', (0.052, 0.006, 0.038), (cx + sd*0.033, yf, z), lens, 0.012)
        mesh_box('Temple', (0.005, 0.11, 0.006), (cx + sd*0.07, yf + 0.055, z + 0.01), frame, 0)
    mesh_box('Bridge', (0.018, 0.005, 0.005), (cx, yf, z + 0.01), frame, 0)

def add_skirt(bm, rig, rgb):
    """חצאית ארוכה: חרוט מהמותניים עד הקרסול, ברוחב הירכיים הנראות"""
    pts = eval_verts([bm]); cx = rig.location.x
    H = max(p.z for p in pts); zt = H * 0.585; zb = 0.13
    band = [p for p in pts if abs(p.z - zt) < 0.02]
    rx = max(abs(p.x - cx) for p in band) + 0.025; cy = sum(p.y for p in band)/len(band)
    ry = max(abs(p.y - cy) for p in band) + 0.03
    me = bpy.data.meshes.new('Skirt'); b = bmesh.new(); seg = 48; rings = []
    for k in range(7):
        t = k / 6; z = zt + (zb - zt) * t; f = 1 + 0.55 * t ** 1.3
        rings.append([b.verts.new((cx + rx*f*math.cos(2*math.pi*s/seg), cy + ry*f*math.sin(2*math.pi*s/seg), z)) for s in range(seg)])
    for a, c in zip(rings, rings[1:]):
        for s in range(seg): b.faces.new((a[s], a[(s+1) % seg], c[(s+1) % seg], c[s]))
    b.to_mesh(me); b.free()
    ob = bpy.data.objects.new('Skirt', me); SC.collection.objects.link(ob)
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.008; ob.modifiers.new('sub', 'SUBSURF').levels = 1
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(matc('M_Skirt', rgb, 0.85))

def add_beret(bi, rgb):
    mesh_box('Beret', (0.05, 0.11, 0.14), (bi['cx'] - 0.17, (bi['back'] + bi['front'])/2, bi['sh'] - 0.05), matc('M_Beret', rgb, 0.9), 0.02, rot=(0, math.radians(-15), 0))

OLIVE = (0.27, 0.26, 0.15)
# (מגדר, גיל, מוצא c/af/as, עור, שיער, בגדים[], נעליים, תוספות, צבע-מחדש)
PEOPLE = [
    (1.0, 0.45, (0.80, 0.12, 0.08), 'middleage_caucasian_male', 'short04', ['male_casualsuit01'], 'shoes02', {'bag': (0.08, 0.10, 0.16)}, None),
    (1.0, 0.40, (0.82, 0.10, 0.08), 'young_caucasian_male',     'short03', ['male_casualsuit03'], 'shoes03', {'sun': 1}, None),
    (1.0, 0.35, (0.15, 0.80, 0.05), 'young_african_male',       'short02', ['male_casualsuit05'], 'shoes06', {}, None),
    (1.0, 0.50, (0.75, 0.15, 0.10), 'middleage_caucasian_male', 'short02', ['male_casualsuit06'], 'shoes04', {'kippa': (0.85, 0.85, 0.82)}, None),
    (1.0, 0.25, (0.78, 0.14, 0.08), 'young_caucasian_male',     'short01', ['male_casualsuit01'], 'shoes05', {'bag': OLIVE, 'big': 1, 'beret': (0.15, 0.25, 0.1)}, OLIVE),
    (0.0, 0.25, (0.80, 0.12, 0.08), 'young_caucasian_female',   'ponytail01', ['female_casualsuit01'], 'shoes05', {'bag': OLIVE, 'big': 1}, OLIVE),
    (0.0, 0.40, (0.80, 0.12, 0.08), 'middleage_caucasian_female', 'long01', ['male_casualsuit03'], 'shoes02', {'skirt': (0.08, 0.1, 0.2), 'bag': (0.35, 0.12, 0.1)}, None),
    (0.0, 0.25, (0.78, 0.14, 0.08), 'young_caucasian_female',   'bob02',  ['male_casualsuit01'], 'shoes01', {'sun': 1}, None),
    (0.0, 0.22, (0.20, 0.75, 0.05), 'young_african_female',     'ponytail01', ['male_casualsuit05'], 'shoes06', {'bag': (0.12, 0.12, 0.12)}, None),
    (0.0, 0.65, (0.82, 0.10, 0.08), 'old_caucasian_female',     'bob01',  ['male_casualsuit06'], 'shoes03', {'skirt': (0.3, 0.3, 0.32)}, None),
]
for i, row in enumerate(PEOPLE):
    g, age, (c, af, asi), skin, hair, suits, shoe, extra, recol = row
    try:
        md = TS.get_default_macro_info_dict()
        md.update(gender=g, age=age, proportions=0.5 + 0.08*((i % 3) - 1), muscle=0.5, weight=0.55 if i % 3 else 0.6, height=0.55 if g else 0.45)
        md['race'] = {'caucasian': c, 'african': af, 'asian': asi}
        bm = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
        rnd = random.Random(100 + i)
        root = os.path.dirname(importlib.import_module(base).__file__) + '/data/targets'
        cands = [p for g_ in ('nose', 'eyes', 'eyebrows', 'mouth', 'chin', 'cheek', 'head') for p in glob.glob(f'{root}/{g_}/*.target.gz')]
        for pth in rnd.sample(cands, min(12, len(cands))):
            try: TS.load_target(bm, pth, weight=rnd.uniform(0.15, 0.5))
            except Exception: pass
        HS.add_builtin_rig(bm, 'default', import_weights=True)
        HS.set_character_skin(A(f'skins/{skin}/{skin}.mhmat'), bm)
        objs = {}
        for kind, rel in [('Eyes', 'eyes/high-poly/high-poly.mhclo'), ('Eyebrows', f'eyebrows/eyebrow00{(i % 3) + 6}/eyebrow00{(i % 3) + 6}.mhclo'),
                          ('Eyelashes', 'eyelashes/eyelashes01/eyelashes01.mhclo'), ('Hair', f'hair/{hair}/{hair}.mhclo')] + \
                         [('Clothes', f'{s}/{s.split("/")[-1].split("__")[-1]}.mhclo' if '/' not in s else s) for s in suits] + [('Clothes', f'clothes/{shoe}/{shoe}.mhclo')]:
            try: objs.setdefault(kind, []).append(HS.add_mhclo_asset(A(rel), bm, asset_type=kind))
            except Exception as e: print('asset fail', rel, e)
        rig = bm.parent
        for pb in rig.pose.bones:
            if pb.name.startswith('upperarm01'):
                h = pb.head.copy(); sgn = 1 if h.x > 0 else -1
                pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(sgn * math.radians(38), 4, 'Y') @ Matrix.Translation(-h) @ pb.matrix
                bpy.context.view_layer.update()
        rig.location.x = (i - (len(PEOPLE) - 1)/2) * 0.9
        bpy.context.view_layer.update()
        if recol: recolor([o for o in objs.get('Clothes', [])[:-1]], recol)
        bi = body_info(bm, rig)
        if 'bag' in extra: add_backpack(bi, extra['bag'], extra.get('big'))
        if 'kippa' in extra: add_kippa(bm, (objs.get('Hair') or [None])[0], rig, extra['kippa'])
        if 'sun' in extra: add_sunglasses(objs['Eyes'][0], rig)
        if 'beret' in extra: add_beret(bi, extra['beret'])
        if 'skirt' in extra: add_skirt(bm, rig, extra['skirt'])
        print('PERSON', i, suits, skin, hair, list(extra))
    except Exception:
        traceback.print_exc()
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/lineup2.blend'))
SC.render.engine = 'CYCLES'; SC.cycles.device = 'CPU'; SC.cycles.samples = 96; SC.cycles.use_denoising = True
n = len(PEOPLE); SC.render.resolution_x, SC.render.resolution_y = max(1600, 230 * n), 800
w = bpy.data.worlds.new('W'); SC.world = w
bg = next(nd for nd in w.node_tree.nodes if nd.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.8, 0.82, 0.85, 1); bg.inputs[1].default_value = 0.6
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); SC.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), 0, math.radians(-20))
me = bpy.data.meshes.new('floor'); fl = bpy.data.objects.new('floor', me); SC.collection.objects.link(fl)
b = bmesh.new(); bmesh.ops.create_grid(b, x_segments=1, y_segments=1, size=30); b.to_mesh(me); b.free()
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('C')); SC.collection.objects.link(cam)
cam.data.lens = 40; cam.location = (0, -1.25 * 0.9 * n - 2, 1.1); cam.rotation_euler = (math.radians(88), 0, 0); SC.camera = cam
SC.render.filepath = os.path.abspath('out/lineup2.png'); bpy.ops.render.render(write_still=True); print('RENDER lineup2')
# גב: אותה שורה מאחור, לבדיקת התיקים
cam.location = (0, 1.25 * 0.9 * n + 2, 1.1); cam.rotation_euler = (math.radians(88), 0, math.radians(180))
SC.render.filepath = os.path.abspath('out/lineup2_back.png'); bpy.ops.render.render(write_still=True); print('RENDER back')
