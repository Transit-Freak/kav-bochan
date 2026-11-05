"""אוטובוס עירוני חשמלי 12 מ' בסגנון הנפוץ בישראל (לפי תמונות ייחוס מוויקישיתוף), בלי סמלי חברה.
blender-hardsurface-modeling: blockout בקנה מידה אמיתי → חיתוכים → Bevel + Weighted Normal; חומרים לפי blender-pbr-materials.
החזית ב--Y; צד הדלתות הוא צד ימין של הנהג = ‎-X (נסיעה בימין)."""
import bpy, bmesh, math, sys, os
from mathutils import Vector
S = os.environ['SK']
sys.path.insert(0, f'{S}/blender-hardsurface-modeling/scripts')
import apply_stack

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
col = bpy.context.scene.collection
cut = bpy.data.collections.new('Cutters'); col.children.link(cut)
L, W, H, Z0 = 12.0, 2.55, 2.85, 0.30
YF, YR = -L/2, L/2
R = -1   # צד הדלתות (‎-X)

def link(ob, c=col):
    c.objects.link(ob); return ob
def apply_tf(ob):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
def box(name, size, loc, c=col, rot=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me), c); ob.scale = size; ob.location = loc
    if rot: ob.rotation_euler = rot
    apply_tf(ob); return ob
def cyl(name, r, depth, loc, seg=32, axis='X', c=col):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me), c)
    ob.rotation_euler = {'X': (0, math.pi/2, 0), 'Y': (math.pi/2, 0, 0), 'Z': (0, 0, 0)}[axis]
    ob.location = loc; apply_tf(ob); return ob
def mat(name, base, rough, metal=0.0, emit=None, es=4.0, alpha=1.0, coat=0.0):
    m = bpy.data.materials.new(name)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal; b.inputs['Coat Weight'].default_value = coat
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = es
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    return m
def setm(ob, m):
    ob.data.materials.clear(); ob.data.materials.append(m); return ob
def smooth(ob):
    for p in ob.data.polygons: p.use_smooth = True

silver = mat('M_Silver', (0.62, 0.64, 0.66), 0.28, metal=0.55, coat=0.6)
white = mat('M_RoofWhite', (0.85, 0.86, 0.86), 0.35, coat=0.3)
gloss_black = mat('M_GlossBlack', (0.012, 0.013, 0.015), 0.12, coat=1.0)
glass = mat('M_Glass', (0.03, 0.04, 0.045), 0.04, alpha=0.42)
trim = mat('M_Trim', (0.025, 0.025, 0.025), 0.55)
rubber = mat('M_Rubber', (0.018, 0.018, 0.018), 0.88)
steel = mat('M_Steel', (0.7, 0.71, 0.72), 0.35, metal=1.0)
seatm = mat('M_Seat', (0.05, 0.12, 0.3), 0.75)
yellow = mat('M_Pole', (0.95, 0.72, 0.05), 0.35, metal=0.4)
floorm = mat('M_Floor', (0.22, 0.23, 0.24), 0.85)
lamp = mat('M_Lamp', (1, 1, 1), 0.05, emit=(1, 0.98, 0.92), es=6)
amber = mat('M_Amber', (1, 0.45, 0.05), 0.2, emit=(1, 0.4, 0.02), es=3)
redl = mat('M_Red', (0.5, 0.0, 0.0), 0.2, emit=(0.9, 0.02, 0.02), es=3)
led = mat('M_LED', (1, 0.42, 0.05), 0.4, emit=(1, 0.42, 0.04), es=5)
plate = mat('M_Plate', (0.95, 0.75, 0.05), 0.4)

# ---------- גוף: חתך רוחב עם פינות גג מעוגלות, מוחלץ לאורך; חזית בשיפוע קל
def section(n_round=8, rr=0.32, rb=0.06):
    pts = []
    hw = W/2
    for i in range(n_round + 1):               # פינה תחתונה ימנית (+X)
        a = -math.pi/2 + (math.pi/2) * i / n_round
        pts.append((hw - rb + rb*math.cos(a), Z0 + rb + rb*math.sin(a)))
    for i in range(n_round + 1):               # פינת גג ימנית
        a = 0 + (math.pi/2) * i / n_round
        pts.append((hw - rr + rr*math.cos(a), Z0 + H - rr + rr*math.sin(a)))
    for i in range(n_round + 1):               # פינת גג שמאלית
        a = math.pi/2 + (math.pi/2) * i / n_round
        pts.append((-hw + rr + rr*math.cos(a), Z0 + H - rr + rr*math.sin(a)))
    for i in range(n_round + 1):               # פינה תחתונה שמאלית
        a = math.pi + (math.pi/2) * i / n_round
        pts.append((-hw + rb + rb*math.cos(a), Z0 + rb + rb*math.sin(a)))
    return pts
sec = section()
me = bpy.data.meshes.new('SM_Body'); bm = bmesh.new()
rings = []
for y in (YF, YF + 0.18, YR - 0.15, YR):
    ring = []
    for x, z in sec:
        yy = y
        if y == YF:                              # חזית: שיפוע — למעלה 12 ס"מ אחורה, למטה פגוש בולט
            t = (z - Z0) / H; yy = YF + 0.12 * max(0, t - 0.35) / 0.65
            x *= 0.985
        if y == YR: x *= 0.985
        ring.append(bm.verts.new((x, yy, z)))
    rings.append(ring)
n = len(sec)
for a, b in zip(rings, rings[1:]):
    for i in range(n):
        bm.faces.new((a[i], a[(i+1) % n], b[(i+1) % n], b[i]))
bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free()
body = link(bpy.data.objects.new('SM_Body', me)); setm(body, silver)

# ---------- חיתוכים
cutters = []
def cutter(name, size, loc, rot=None):
    c = box(name, size, loc, cut, rot); c.display_type = 'WIRE'; c.hide_render = True; cutters.append(c.name); return c
WZ0, WZ1 = Z0 + 1.02, Z0 + 2.42               # רצועת החלונות
cutter('Cut_WinBand', (W + 0.4, L - 3.0, WZ1 - WZ0), (0, 0.65, (WZ0 + WZ1)/2))          # חוצה — פנים נראה
cutter('Cut_Windshield', (W - 0.16, 1.2, 1.62), (0, YF + 0.35, Z0 + 1.78))
FD = (YF + 0.25, YF + 1.45); MD = (YF + 5.35, YF + 6.6)                                  # דלת קדמית ודלת אמצעית
for nm, (a, b) in (('Front', FD), ('Mid', MD)):
    cutter(f'Cut_Door{nm}', (0.9, b - a, 2.48), (R*W/2, (a + b)/2, Z0 + 0.02 + 1.24))
FA, RA = YF + 2.65, YF + 8.6                                                              # סרנים
for nm, y in (('F', FA), ('R', RA)):
    c = cyl(f'Cut_Arch{nm}', 0.66, W + 0.4, (0, y, 0.53), seg=64, c=cut); c.display_type = 'WIRE'; c.hide_render = True; cutters.append(c.name)
cutter('Cut_RearWin', (W - 0.7, 0.6, 0.75), (0, YR, Z0 + 2.15))
print(apply_stack.run(objects=[body.name], preset='render', cutters=cutters, width=0.025, segments=3, solver='EXACT'))
smooth(body)

# ---------- זיגוג שטוח שחור (flush) לכל אורך רצועת החלונות + מעל הדלתות
for sd in (1, -1):
    g = box(f'SM_SideGlass{sd}', (0.02, L - 3.0, WZ1 - WZ0), (sd*(W/2 - 0.012), 0.65, (WZ0 + WZ1)/2)); setm(g, glass)
    for k in range(7):                                                           # מסגרות שחורות בין החלונות
        y = YF + 3.1 + k * 1.3
        if y > YR - 2.2: break
        if sd == R and MD[0] - 0.2 < y < MD[1] + 0.2: continue
        setm(box(f'SM_Pillar{sd}{k}', (0.03, 0.09, WZ1 - WZ0), (sd*(W/2 - 0.005), y, (WZ0 + WZ1)/2)), gloss_black)
    setm(box(f'SM_BandTop{sd}', (0.03, L - 2.6, 0.32), (sd*(W/2 - 0.01), 0.35, WZ1 + 0.16)), gloss_black)   # פס שחור מעל החלונות
setm(box('SM_Windshield', (W - 0.2, 0.025, 1.6), (0, YF + 0.075, Z0 + 1.78), rot=(math.radians(-4.5), 0, 0)), glass)
setm(box('SM_DestBand', (W - 0.2, 0.03, 0.42), (0, YF + 0.105, Z0 + 2.72), rot=(math.radians(-4.5), 0, 0)), gloss_black)
setm(box('SM_RearGlass', (W - 0.75, 0.02, 0.72), (0, YR - 0.01, Z0 + 2.15)), glass)

# שלט יעד: מספר + "תחנה מרכזית" (Blender לא מסדר עברית — הטקסט נכתב הפוך)
fp = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
fnt = bpy.data.fonts.load(fp) if os.path.exists(fp) else None
for nm, body_txt, x, sz in (('Num', '18', -0.88, 0.24), ('Dest', 'תיזכרמ הנחת'[::1], 0.25, 0.2)):
    t = bpy.data.curves.new('T_' + nm, 'FONT'); t.body = body_txt; t.align_x = 'CENTER'; t.align_y = 'CENTER'; t.size = sz
    if fnt: t.font = fnt
    ob = link(bpy.data.objects.new('SM_Sign' + nm, t)); ob.rotation_euler = (math.radians(90 - 4.5), 0, 0)
    ob.location = (x, YF + 0.085, Z0 + 2.72); setm(ob, led)

# ---------- חזית תחתונה: אשכולות פנסים בפינות, פגוש, לוחית
for sd in (1, -1):
    setm(box(f'SM_LampPod{sd}', (0.62, 0.05, 0.26), (sd*(W/2 - 0.38), YF - 0.005, Z0 + 0.52)), gloss_black)
    for k, dx in enumerate((0.16, 0.36, 0.54)):
        l = cyl(f'SM_Lamp{sd}{k}', 0.055 if k else 0.07, 0.03, (sd*(W/2 - dx), YF - 0.03, Z0 + 0.52), seg=24, axis='Y'); setm(l, lamp)
    setm(box(f'SM_Indicator{sd}', (0.12, 0.03, 0.06), (sd*(W/2 - 0.1), YF - 0.025, Z0 + 0.69)), amber)
    setm(box(f'SM_Fog{sd}', (0.16, 0.03, 0.08), (sd*(W/2 - 0.3), YF - 0.03, Z0 + 0.2)), lamp)
    setm(box(f'SM_Tail{sd}', (0.16, 0.03, 0.55), (sd*(W/2 - 0.12), YR + 0.01, Z0 + 0.9)), redl)
    # מראות "אוזני ארנב" על זרוע מפינת הגג
    arm = cyl(f'SM_MirrorArm{sd}', 0.022, 0.55, (sd*(W/2 + 0.12), YF - 0.12, Z0 + 2.55), seg=12, axis='Y'); arm.rotation_euler = (math.radians(70), 0, math.radians(sd*-25)); setm(arm, trim)
    setm(box(f'SM_Mirror{sd}', (0.2, 0.08, 0.38), (sd*(W/2 + 0.2), YF - 0.36, Z0 + 2.28)), trim)
setm(box('SM_BumperF', (W - 0.1, 0.12, 0.22), (0, YF - 0.03, Z0 + 0.08)), trim)
setm(box('SM_BumperR', (W - 0.1, 0.12, 0.22), (0, YR + 0.03, Z0 + 0.08)), trim)
setm(box('SM_PlateF', (0.52, 0.01, 0.11), (0, YF - 0.095, Z0 + 0.27)), plate)
for k in (-1, 1):                                                                  # מגבים
    w = box(f'SM_Wiper{k}', (0.85, 0.018, 0.02), (k*0.45, YF + 0.04, Z0 + 1.02), rot=(0, math.radians(k*12), 0)); setm(w, trim)
setm(box('SM_RearGrille', (W - 0.6, 0.02, 0.5), (0, YR + 0.005, Z0 + 0.6)), trim)
for k in range(10):                                                                # רשת אוורור בצד אחורי
    setm(box(f'SM_Vent{k}', (0.02, 0.6, 0.025), (R*(W/2 + 0.005), YR - 1.1, Z0 + 0.35 + k*0.06)), trim)

# ---------- גג: מארזי סוללות ומיזוג לבנים עם פתחי אוורור
for nm, y0, y1 in (('A', YF + 1.0, YF + 4.6), ('B', YF + 4.8, YF + 8.4)):
    pod = box(f'SM_RoofPod{nm}', (W - 0.55, y1 - y0, 0.34), (0, (y0 + y1)/2, Z0 + H + 0.15)); setm(pod, white)
    print(apply_stack.run(objects=[pod.name], preset='render', width=0.08, segments=5))
    smooth(pod)
    for k in range(6):
        setm(box(f'SM_RoofVent{nm}{k}', (0.5, 0.06, 0.02), (0.35 if k % 2 else -0.35, y0 + 0.5 + (k//2)*0.25, Z0 + H + 0.325)), trim)

# ---------- דלתות: שתי כנפיים מזכוכית עם מסגרת שחורה ומאחז צהוב
for nm, (a, b) in (('Front', FD), ('Mid', MD)):
    w = (b - a) / 2
    for k in (0, 1):
        yc = a + w/2 + k*w
        setm(box(f'SM_Door{nm}{k}', (0.03, w - 0.03, 2.38), (R*(W/2 - 0.03), yc, Z0 + 1.24)), glass)
        fr = box(f'SM_DoorFr{nm}{k}', (0.04, w - 0.02, 2.4), (R*(W/2 - 0.025), yc, Z0 + 1.24)); setm(fr, gloss_black)
        fr.modifiers.new('wf', 'WIREFRAME').thickness = 0.06
        setm(box(f'SM_DoorRail{nm}{k}', (0.02, w*0.55, 0.03), (R*(W/2 - 0.08), yc, Z0 + 1.0), rot=(math.radians(35 if k else -35), 0, 0)), yellow)
    setm(box(f'SM_Step{nm}', (0.4, b - a, 0.04), (R*(W/2 - 0.2), (a + b)/2, Z0 + 0.04)), floorm)

# ---------- פנים: רצפה, מושבים, מוטות, תא נהג
setm(box('SM_FloorIn', (W - 0.1, L - 0.6, 0.03), (0, 0.1, Z0 + 0.36)), floorm)
for k in range(11):
    y = YF + 3.0 + k * 0.82
    if y > YR - 0.8: break
    for sd in (1, -1):
        if sd == R and MD[0] - 0.3 < y < MD[1] + 0.5: continue
        for xo in (0.32, 0.76):
            setm(box(f'SM_Seat{k}{sd}{xo}', (0.42, 0.44, 0.09), (sd*(W/2 - xo), y, Z0 + 0.85)), seatm)
            setm(box(f'SM_Back{k}{sd}{xo}', (0.42, 0.07, 0.62), (sd*(W/2 - xo), y + 0.22, Z0 + 1.18)), seatm)
            setm(cyl(f'SM_Grab{k}{sd}{xo}', 0.016, 0.18, (sd*(W/2 - xo), y + 0.25, Z0 + 1.55), seg=10, axis='X'), steel)
for k in range(7):
    setm(cyl(f'SM_Pole{k}', 0.02, 2.0, ((0.35 if k % 2 else -0.35), YF + 2.4 + k*1.35, Z0 + 1.38), seg=12, axis='Z'), yellow)
for sd in (1, -1):
    setm(cyl(f'SM_HandRail{sd}', 0.018, L - 3.4, (sd*0.55, 0.3, Z0 + 2.3), seg=12, axis='Y'), yellow)
setm(box('SM_Dash', (W - 0.3, 0.55, 0.4), (0, YF + 0.5, Z0 + 0.82)), trim)
sw = cyl('SM_SteerWheel', 0.24, 0.04, (0.62, YF + 0.95, Z0 + 1.22), seg=32, axis='Y'); sw.rotation_euler = (math.radians(40), 0, 0); setm(sw, trim)
setm(box('SM_DriverSeat', (0.5, 0.5, 0.12), (0.62, YF + 1.45, Z0 + 0.82)), seatm)
setm(box('SM_DriverBack', (0.5, 0.09, 0.75), (0.62, YF + 1.72, Z0 + 1.2)), seatm)
setm(box('SM_CabScreen', (0.04, 0.9, 1.3), (0.3, YF + 1.5, Z0 + 1.1)), glass)

# ---------- גלגלים: צמיג 295/80R22.5, חישוק פלדה עם 10 אומים
for nm, y in (('F', FA), ('R', RA)):
    for sd in (1, -1):
        tire = cyl(f'SM_Tire{nm}{sd}', 0.53, 0.3, (sd*(W/2 - 0.2), y, 0.53), seg=64); setm(tire, rubber)
        print(apply_stack.run(objects=[tire.name], preset='render', width=0.07, segments=5)); smooth(tire)
        setm(cyl(f'SM_Rim{nm}{sd}', 0.33, 0.04, (sd*(W/2 - 0.045), y, 0.53), seg=48), steel)
        setm(cyl(f'SM_RimDish{nm}{sd}', 0.2, 0.06, (sd*(W/2 - 0.03), y, 0.53), seg=32), steel)
        setm(cyl(f'SM_Hub{nm}{sd}', 0.09, 0.1, (sd*(W/2 - 0.0), y, 0.53), seg=24), trim)
        for k in range(10):
            a = 2*math.pi*k/10
            setm(cyl(f'SM_Nut{nm}{sd}{k}', 0.018, 0.06, (sd*(W/2 + 0.01), y + 0.14*math.cos(a), 0.53 + 0.14*math.sin(a)), seg=6), steel)
        setm(cyl(f'SM_ArchLiner{nm}{sd}', 0.645, 0.02, (sd*(W/2 - 0.35), y, 0.53), seg=64), trim)

# ---------- סביבה: כביש, מדרכה ואבן שפה בצד הדלתות
setm(box('ENV_Road', (40, 60, 0.02), (0, 0, -0.01)), mat('M_Asphalt', (0.055, 0.055, 0.06), 0.88))
setm(box('ENV_Curb', (0.2, 60, 0.16), (R*(W/2 + 0.35), 0, 0.08)), mat('M_Curb', (0.55, 0.55, 0.52), 0.8))
setm(box('ENV_Sidewalk', (5, 60, 0.15), (R*(W/2 + 0.45 + 2.5), 0, 0.075)), mat('M_Pave', (0.5, 0.47, 0.42), 0.85))
for o in bpy.data.objects:
    if o.type == 'MESH' and cut not in o.users_collection and not o.name.startswith(('SM_Body', 'SM_Tire', 'SM_RoofPod')):
        pass
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/bus.blend'))
print('BUS', tuple(round(v, 2) for v in body.dimensions), len(bpy.data.objects))
