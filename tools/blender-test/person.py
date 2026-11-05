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
bm = HS.create_human(feet_on_ground=True)
print('BASEMESH', bm.name, bm.dimensions[:])
def first(pat):
    r = [a for a in assets if pat in a.lower()]
    return r[0] if r else None
for fn, pat, kw in (('set_character_skin', 'skins/', {}),):
    f = first(pat) if pat else None
    for a in assets:
        if '/skins/' in a and a.endswith('.mhmat') and ('young' in a or 'middleage' in a):
            f = a; break
    try:
        if f: print(fn, f, getattr(HS, fn)(f, bm)); 
    except Exception: traceback.print_exc()
for kind, pat in (('Eyes', '/eyes/'), ('Eyebrows', '/eyebrows/'), ('Eyelashes', '/eyelashes/'), ('Hair', '/hair/'), ('Clothes', '/clothes/')):
    picks = [a for a in assets if pat in a and a.endswith('.mhclo')]
    print(kind, len(picks), [os.path.basename(p) for p in picks[:30]])
    take = picks[:1] if kind != 'Clothes' else [p for p in picks if any(k in p.lower() for k in ('shirt', 'pants', 'jeans', 'shoes', 'trouser', 'tshirt', 'sweater'))][:3]
    for p in take:
        try: print(' add', p, HS.add_mhclo_asset(p, bm, asset_type=kind))
        except Exception: traceback.print_exc()
try: print('rig', HS.add_builtin_rig(bm, 'default', import_weights=True))
except Exception: traceback.print_exc()
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/person.blend'))
print('OBJS', [(o.name, o.type) for o in bpy.data.objects])
