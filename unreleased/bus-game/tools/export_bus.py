"""ייצוא האוטובוס של Blender (tools/blender-test/bus.py בענף claude/blender-test) ל-GLB קל למשחק.

הרצה (מתוך תיקיית tools/blender-test, אחרי ש-bus.py בנה את out/bus.blend ו-screens.py את tex/):
    blender -b out/bus.blend -P export_bus.py -- <out.glb>
או עם bpy כמודול פייתון:  python export_bus.py -- out/bus.blend <out.glb>

מה עושים:
- מחילים את החיתוכים (חלונות, דלתות, קשתות), ואז מוחקים את כלי החיתוך ואת הכביש/המדרכה של הסצנה.
- כל כנף דלת (4 כנפיים: קדמית ואמצעית, שתיים לכל דלת) מאוחדת לאובייקט אחד תחת Empty בשם Door_<דלת><כנף>.
- כל השאר מאוחד לגוף אחד (Bus_Body) — פחות draw calls במשחק.
- אנימציה "DoorsOpen": הכנפיים יוצאות החוצה ומחליקות לצדדים (דלת נוסעת-מחליקה), 0 עד 1.25 שניות.
  המשחק מחזיק את האנימציה בזמן לפי כמה הדלת פתוחה.
- נקודות עזר Anchor_DoorFront / Anchor_DoorMid: המקום שבו הנוסעים עולים ויורדים.
- טקסטורות מוקטנות ל-512 פיקסלים לכל היותר, ב-JPEG (תמונות עם שקיפות נשארות PNG).
מערכת הצירים ב-glTF: חזית האוטובוס לכיוון ‎+Z, הדלתות בצד ‎-X (ימין הנהג), הגג ב-‎+Y.
"""
import bpy, sys, os, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if bpy.data.filepath == '' and len(argv) >= 2:
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(argv[0])); argv = argv[1:]
OUT = os.path.abspath(argv[0] if argv else 'out/bus.glb')

L, W, H, Z0 = 12.0, 2.55, 2.85, 0.30
YF = -L / 2; R = -1
FD = (YF + 0.25, YF + 1.45); MD = (YF + 5.35, YF + 6.6)
SC = bpy.context.scene

def remove(o):
    bpy.data.objects.remove(o, do_unlink=True)

# 0. חלון נהג בצד ‎+X: ב-bus.py הצד של הנהג אטום מהשמשה ועד חלון הנוסעים הראשון, ולא רואים את הנהג מהצד.
# חותכים חלון בגוף (Boolean, מוחל יחד עם שאר החיתוכים בשלב 1), עם זכוכית כמו בשאר החלונות ועמוד שחור
# בינו לבין חלונות הנוסעים
def _box(name, size, loc, m):
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); SC.collection.objects.link(ob); ob.scale = size; ob.location = loc
    if m: me.materials.append(m)
    return ob
_body, _glass, _black = bpy.data.objects.get('SM_Body'), bpy.data.materials.get('M_Glass'), bpy.data.materials.get('M_GlossBlack')
if _body and _glass:
    WZ0, WZ1 = Z0 + 1.02, Z0 + 2.42                 # רצועת החלונות, כמו ב-bus.py
    y0, y1 = YF + 0.32, YF + 2.2                    # מאחורי עמוד השמשה ועד תחילת חלונות הנוסעים
    c = _box('Cut_DriverWin', (0.4, y1 - y0, WZ1 - WZ0), (W / 2, (y0 + y1) / 2, (WZ0 + WZ1) / 2), None)
    c.hide_render = True; c.display_type = 'WIRE'
    m = _body.modifiers.new('DriverWin', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c
    try: m.solver = 'EXACT'
    except Exception: pass
    _box('SM_DriverGlass', (0.02, y1 - y0 + 0.04, WZ1 - WZ0), (W / 2 - 0.012, (y0 + y1) / 2, (WZ0 + WZ1) / 2), _glass)
    if _black: _box('SM_PillarDriver', (0.03, 0.09, WZ1 - WZ0), (W / 2 - 0.005, y1, (WZ0 + WZ1) / 2), _black)
    print('EXPORT driver window', round(y0, 2), round(y1, 2))

# 1. החלת modifiers (bevel/boolean/wireframe) — הופכים כל אובייקט לרשת סופית.
# קודם מחילים ורק אחר כך מוחקים את כלי החיתוך: כשמחקו אותם קודם, החיתוכים (חלונות, דלתות, קשתות הגלגלים)
# לא נעשו, והפח הכסוף כיסה את החלונות במשחק
dg = bpy.context.evaluated_depsgraph_get()
for o in [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Cut_')]:
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    o.modifiers.clear(); old = o.data; o.data = me
    if old.users == 0: bpy.data.meshes.remove(old)

# 2. ניקוי
for o in list(bpy.data.objects):
    if o.name.startswith(('Cut_', 'ENV_')) or o.type in ('LIGHT', 'CAMERA') or o.hide_render:
        remove(o)
for c in list(bpy.data.collections):
    if c.name == 'Cutters': bpy.data.collections.remove(c)
# תא הנהג נבנה במשחק (js/driver.js: לוח מחוונים, הגה, מושב, נהג יושב) — מוחקים את הקופסאות הפשוטות של bus.py.
# וגם מוטות שעומדים בתוך תא הנהג (שלושה בצד ‎+X ליד הדלת הקדמית — אחד מהם עבר דרך מושב הנהג),
# ומוט כפול בצד הדלת, 10 ס"מ מהמוט של מסגרת הדלת — כל אחד עם הבסיס והלחצן שלו
DROP = ['SM_Dash', 'SM_SteerWheel', 'SM_DriverSeat', 'SM_DriverBack']
for k, sd in ((0, 1), (1, 1), (2, 1), (0, -1)):
    DROP += [f'SM_Pole{k}{sd}', f'SM_PoleFoot{k}{sd}', f'SM_Btn{k}{sd}', f'SM_BtnF{k}{sd}']
for n in DROP:
    o = bpy.data.objects.get(n)
    if o: remove(o)
    else: print('EXPORT missing', n)
# הקלה: המושבים, הלחצנים והצמיגים עם bevel עדין — Decimate (במשחק רואים אותם מרחוק). הגוף: איחוד משטחים שטוחים בלבד
DEC = float(os.environ.get('BUS_DECIMATE', '0.25'))
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if o.name.startswith('SM_Body'):
        m = o.modifiers.new('d', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(1.5)
    elif n > 150:
        m = o.modifiers.new('d', 'DECIMATE'); m.ratio = DEC if not o.name.startswith('SM_Tire') else 0.35
    else:
        continue
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
        bpy.ops.object.modifier_apply(modifier='d')
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    if o.parent:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw

def join(objs, name):
    objs = [o for o in objs if o and o.type == 'MESH']
    if not objs: return None
    with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    ob = objs[0]; ob.name = name; ob.data.name = name
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob

# 3. כנפי הדלתות
leaves = []
for nm, (a, b) in (('Front', FD), ('Mid', MD)):
    w = (b - a) / 2
    for k in (0, 1):
        yc = a + w / 2 + k * w
        parts = [bpy.data.objects.get(n) for n in (f'SM_Door{nm}{k}', f'SM_DoorFr{nm}{k}', f'SM_DoorRail{nm}{k}', f'SG_14{nm}{k}')]
        leaf = join(parts, f'Leaf_{nm}{k}')
        e = bpy.data.objects.new(f'Door_{nm}{k}', None); SC.collection.objects.link(e)
        e.location = (R * (W / 2 - 0.03), yc, Z0 + 1.24)
        bpy.context.view_layer.update()
        mw = leaf.matrix_world.copy(); leaf.parent = e; leaf.matrix_world = mw
        leaves.append((e, -1 if k == 0 else 1, w))
    an = bpy.data.objects.new(f'Anchor_Door{nm}', None); SC.collection.objects.link(an)
    an.location = (R * (W / 2 + 0.6), (a + b) / 2, 0.0)

# 4. כל השאר: גוף אחד
rest = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Leaf_')]
body = join(rest, 'Bus_Body')

# 5. אנימציית פתיחת הדלתות (24 פריימים לשנייה): 0 סגור → 0.4 שנ' החוצה → 1.25 שנ' פתוח לגמרי
SC.render.fps = 24
for e, sgn, w in leaves:
    x0, y0, z0 = e.location
    e.animation_data_create()
    act = bpy.data.actions.new(f'DoorsOpen_{e.name}')
    e.animation_data.action = act
    for f, dx, dy in ((1, 0, 0), (10, 0.09, 0), (31, 0.11, sgn * (w * 0.92))):
        e.location = (x0 + R * dx, y0 + dy, z0)
        e.keyframe_insert('location', frame=f)
    e.location = (x0, y0, z0)
    tr = e.animation_data.nla_tracks.new(); tr.name = 'DoorsOpen'
    tr.strips.new('DoorsOpen', 1, act)
    e.animation_data.action = None
SC.frame_start, SC.frame_end = 1, 31

# 6. טקסטורות קטנות
for im in bpy.data.images:
    try:
        if im.size[0] > 512 or im.size[1] > 512:
            s = 512 / max(im.size); im.scale(max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s)))
    except Exception as ex:
        print('IMG', im.name, ex)

print('EXPORT objects', [(o.name, o.type) for o in bpy.data.objects])
print('EXPORT tris', sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
opts = dict(filepath=OUT, export_format='GLB', export_apply=True, export_lights=False, export_cameras=False,
            export_animation_mode='NLA_TRACKS', export_image_format=os.environ.get('BUS_IMG', 'JPEG'), export_yup=True)
for q in ({'export_image_quality': 85}, {'export_jpeg_quality': 85}, {}):
    try:
        bpy.ops.export_scene.gltf(**opts, **q); break
    except TypeError as ex:
        print('EXPORT option', q, ex)
print('BUS GLB', OUT, os.path.getsize(OUT))
