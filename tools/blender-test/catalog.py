"""קטלוג בגדים: אותה אישה בכל פריט, בשתי שורות, עם שם הפריט מתחת — כדי לבחור לבוש צנוע ויומיומי."""
import bpy, os, glob, importlib, math, re, traceback
from mathutils import Matrix
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
base = next(p for p in ('bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb') if importlib.util.find_spec(p))
HS = importlib.import_module(base + '.services.humanservice').HumanService
TS = importlib.import_module(base + '.services.targetservice').TargetService
ud = importlib.import_module(base + '.services.locationservice').LocationService.get_user_data()
allc = sorted(glob.glob(f'{ud}/data/clothes/**/*.mhclo', recursive=True) + glob.glob(f'{ud}/clothes/**/*.mhclo', recursive=True))
allc = sorted(set(allc))
print('ALL', len(allc))
KEY = re.compile(r'(female|woman|women|girl|skirt|dress|blouse|top|shirt|sweater|cardigan|jacket|coat|pants|jeans|trouser|legging|tunic|hoodie)', re.I)
SKIP = re.compile(r'(shoe|boot|sandal|hat|fedora|cap|glasses|helmet|male_|bikini|swim|underwear|bra|lingerie|corset)', re.I)
items = [c for c in allc if KEY.search(os.path.basename(c)) and not SKIP.search(os.path.basename(c))][:28]
print('ITEMS', [os.path.basename(c) for c in items])
A = lambda rel: glob.glob(f'{ud}/**/{rel}', recursive=True)[0]
COLS = 14
for i, c in enumerate(items):
    try:
        md = TS.get_default_macro_info_dict(); md.update(gender=0.0, age=0.35, weight=0.52, height=0.45)
        md['race'] = {'caucasian': 0.8, 'african': 0.12, 'asian': 0.08}
        bm = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
        HS.add_builtin_rig(bm, 'default', import_weights=True)
        HS.set_character_skin(A('skins/young_caucasian_female/young_caucasian_female.mhmat'), bm)
        HS.add_mhclo_asset(A('hair/long01/long01.mhclo'), bm, asset_type='Hair')
        HS.add_mhclo_asset(c, bm, asset_type='Clothes')
        HS.add_mhclo_asset(A('clothes/shoes02/shoes02.mhclo'), bm, asset_type='Clothes')
        rig = bm.parent
        for pb in rig.pose.bones:
            if pb.name.startswith('upperarm01'):
                h = pb.head.copy(); sgn = 1 if h.x > 0 else -1
                pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(sgn * math.radians(38), 4, 'Y') @ Matrix.Translation(-h) @ pb.matrix
                bpy.context.view_layer.update()
        row, colx = divmod(i, COLS)
        rig.location = ((colx - (COLS - 1)/2) * 0.75, row * 40.0, 0)
        t = bpy.data.curves.new(f'T{i}', 'FONT'); t.body = f'{i+1}'; t.size = 0.22; t.align_x = 'CENTER'
        to = bpy.data.objects.new(f'L{i}', t); bpy.context.scene.collection.objects.link(to)
        to.location = (rig.location.x, rig.location.y - 0.4, 0.01)
        print('ITEM', i + 1, os.path.relpath(c, ud))
    except Exception:
        traceback.print_exc()
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 3000, 800
w = bpy.data.worlds.new('W'); sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.8, 0.82, 0.85, 1); bg.inputs[1].default_value = 0.6
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), 0, math.radians(-20))
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('C')); sc.collection.objects.link(cam)
cam.data.lens = 35; cam.rotation_euler = (math.radians(87), 0, 0); sc.camera = cam
for row in range((len(items) + COLS - 1) // COLS):
    cam.location = (0, row * 40.0 - 12.0, 1.0)
    sc.render.filepath = os.path.abspath(f'out/catalog{row}.png'); bpy.ops.render.render(write_still=True); print('RENDER catalog', row)
