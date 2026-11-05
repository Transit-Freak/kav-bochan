"""בן אדם: MPFB (MakeHuman ל-Blender) בונה גוף אמיתי, ואחריו הסקילים — rigify/qa/review."""
import bpy, os, sys, glob, inspect, traceback, math
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
mods = [m for m in sys.modules if 'mpfb' in m]
import importlib
base = next((p for p in ('bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb') if importlib.util.find_spec(p)), None)
print('MPFB pkg', base)
HS = importlib.import_module(base + '.services.humanservice').HumanService
LS = importlib.import_module(base + '.services.locationservice').LocationService
print('HumanService:', [n for n in dir(HS) if not n.startswith('_')])
ud = LS.get_user_data() if hasattr(LS, 'get_user_data') else None
print('user data', ud)
assets = sorted(glob.glob(f'{ud}/**/*.mhclo', recursive=True) + glob.glob(f'{ud}/**/*.mhmat', recursive=True) + glob.glob(f'{ud}/**/*.mhm', recursive=True))
print('ASSETS', len(assets)); [print(' ', a.replace(ud, '')) for a in assets[:200]]
print('create_human sig', inspect.signature(HS.create_human))
TS = importlib.import_module(base + '.services.targetservice').TargetService
md = TS.get_default_macro_info_dict(); print('macro', md)
md['gender'] = 1.0; md['age'] = 0.6; md['muscle'] = 0.55; md['weight'] = 0.55; md['height'] = 0.6
bm = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
print('BASEMESH', bm.name, bm.dimensions[:])
def first(pat):
    r = [a for a in assets if pat in a.lower()]
    return r[0] if r else None
for fn, pat, kw in (('set_character_skin', 'skins/', {}),):
    f = first(pat) if pat else None
    for a in assets:
        if a.endswith('/young_caucasian_male/young_caucasian_male.mhmat'):
            f = a; break
    try:
        if f: print(fn, f, getattr(HS, fn)(f, bm)); 
    except Exception: traceback.print_exc()
try: print('rig', HS.add_builtin_rig(bm, 'default', import_weights=True))
except Exception: traceback.print_exc()
for kind, pat in (('Eyes', '/eyes/'), ('Eyebrows', '/eyebrows/'), ('Eyelashes', '/eyelashes/'), ('Hair', '/hair/'), ('Clothes', '/clothes/')):
    picks = [a for a in assets if pat in a and a.endswith('.mhclo')]
    print(kind, len(picks), [os.path.basename(p) for p in picks[:30]])
    take = picks[:1] if kind not in ('Clothes', 'Hair') else ([p for p in picks if p.endswith('/short02.mhclo')] if kind == 'Hair' else [p for p in picks if p.endswith(('/male_casualsuit04.mhclo', '/shoes01.mhclo'))])
    for p in take:
        try: print(' add', p, HS.add_mhclo_asset(p, bm, asset_type=kind))
        except Exception: traceback.print_exc()
# ידיים למטה: סיבוב הזרועות סביב ציר Y של השלד, סביב ראש העצם
from mathutils import Matrix
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
print('BONES', [b.name for b in rig.pose.bones][:60])
for pb in rig.pose.bones:
    if pb.name.startswith('upperarm01'):
        h = pb.head.copy(); sgn = 1 if h.x > 0 else -1
        R = Matrix.Translation(h) @ Matrix.Rotation(sgn * math.radians(38), 4, 'Y') @ Matrix.Translation(-h)
        pb.matrix = R @ pb.matrix
        bpy.context.view_layer.update()
        print('ARM', pb.name, h[:])
print('MODS', [(o.name, [m.type for m in o.modifiers]) for o in bpy.data.objects if o.type == 'MESH'])
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/person.blend'))
print('OBJS', [(o.name, o.type) for o in bpy.data.objects])
