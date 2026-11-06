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

silver = mat('M_Silver', (0.42, 0.44, 0.46), 0.32, metal=0.75, coat=0.5)
white = mat('M_RoofWhite', (0.85, 0.86, 0.86), 0.35, coat=0.3)
gloss_black = mat('M_GlossBlack', (0.012, 0.013, 0.015), 0.12, coat=1.0)
glass = mat('M_Glass', (0.01, 0.012, 0.014), 0.03, alpha=0.78, coat=1.0)
trim = mat('M_Trim', (0.025, 0.025, 0.025), 0.55)
rubber = mat('M_Rubber', (0.018, 0.018, 0.018), 0.88)
steel = mat('M_Steel', (0.5, 0.51, 0.52), 0.4, metal=1.0)
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
sol = body.modifiers.new('Shell', 'SOLIDIFY'); sol.thickness = 0.05; sol.offset = -1.0; sol.use_even_offset = True   # גוף חלול — יש פנים

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
    p1 = Vector((sd*(W/2 - 0.08), YF + 0.15, Z0 + H - 0.12)); p2 = Vector((sd*(W/2 + 0.16), YF - 0.32, Z0 + 2.42))
    d = p2 - p1; arm = box(f'SM_MirrorArm{sd}', (0.035, 0.035, d.length), (p1 + p2) / 2)
    arm.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); setm(arm, trim)
    setm(box(f'SM_Mirror{sd}', (0.22, 0.07, 0.4), (sd*(W/2 + 0.17), YF - 0.34, Z0 + 2.2)), trim)
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

# ---------- פנים (לפי תמונות של אוטובוסים עירוניים בישראל): מושבי פלסטיק אפור עם ריפוד כחול מנוקד,
# מוטות צהובים אנכיים ומעקות תקרה עם רצועות, לחצני "עצור" כחולים, מתקפי רב-קו, שלט LED פנימי,
# תעלות מיזוג ופסי תאורה בתקרה, אזור כיסא גלגלים מול הדלת האמצעית, תא נהג עם מחיצה
def fabric(name, base, dots):
    m = bpy.data.materials.new(name); nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
    vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 60
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (*dots, 1); ramp.color_ramp.elements[0].position = 0.12
    ramp.color_ramp.elements[1].color = (*base, 1); ramp.color_ramp.elements[1].position = 0.16
    nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m
def tiled(name, path, scale, rough=0.85):
    m = bpy.data.materials.new(name); nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = rough
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale)
    t = nt.nodes.new('ShaderNodeTexImage')
    try: t.image = bpy.data.images.load(os.path.abspath(path))
    except Exception as e: print('tex', e); return mat(name, (0.1, 0.2, 0.5), rough)
    t.projection = 'BOX'; t.projection_blend = 0.2
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    nt.links.new(t.outputs['Color'], b.inputs['Base Color']); return m
def tex_mat(name, path, emit=1.2):
    m = bpy.data.materials.new(name); nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    t = nt.nodes.new('ShaderNodeTexImage')
    try: t.image = bpy.data.images.load(os.path.abspath(path))
    except Exception as e: print('tex', e); return mat(name, (0.1, 0.2, 0.6), 0.3)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = emit; b.inputs['Roughness'].default_value = 0.15
    return m
def uv_plane(name, w, h, loc, m):
    me = bpy.data.meshes.new(name); bmx = bmesh.new()
    vs = [bmx.verts.new(v) for v in ((-w/2, 0, -h/2), (w/2, 0, -h/2), (w/2, 0, h/2), (-w/2, 0, h/2))]
    f = bmx.faces.new(vs); uv = bmx.loops.layers.uv.new()
    for lp, co in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uv].uv = co     # פונה ל--Y; ‎+X מימין לצופה
    bmx.to_mesh(me); bmx.free(); ob = link(bpy.data.objects.new(name, me)); ob.location = loc; setm(ob, m); return ob
seat_fab = tiled('M_SeatFabric', 'tex/fabric.png', 2.5)
shell = mat('M_SeatShell', (0.32, 0.33, 0.35), 0.45)
panel = mat('M_Panel', (0.72, 0.73, 0.74), 0.5)
blue_btn = mat('M_StopBtn', (0.05, 0.25, 0.75), 0.35)
yel_face = mat('M_StopFace', (0.95, 0.75, 0.05), 0.3, emit=(0.6, 0.45, 0.02), es=0.6)
egg = mat('M_Validator', (0.55, 0.56, 0.57), 0.3)
screen = mat('M_Screen', (0.02, 0.04, 0.08), 0.2, emit=(0.15, 0.4, 0.8), es=1.5)
plexi = mat('M_Plexi', (0.6, 0.65, 0.7), 0.05, alpha=0.25)
wheelchair = mat('M_WheelBlue', (0.05, 0.25, 0.7), 0.5)
redm = mat('M_RedHammer', (0.8, 0.05, 0.03), 0.4)
FLZ = Z0 + 0.36                                                   # גובה הרצפה (קומה נמוכה)
setm(box('SM_FloorIn', (W - 0.12, L - 0.5, 0.03), (0, 0.1, FLZ)), floorm)
for nm, (a, b_) in (('Front', FD), ('Mid', MD)):                 # פס צהוב בשפת הכניסה
    setm(box(f'SM_StepEdge{nm}', (0.05, b_ - a, 0.005), (R*(W/2 - 0.45), (a + b_)/2, FLZ + 0.017)), yellow)
# קירות פנימיים מתחת לחלונות ומעליהם
for sd in (1, -1):
    setm(box(f'SM_WallLow{sd}', (0.03, L - 1.2, WZ0 - FLZ), (sd*(W/2 - 0.07), 0.2, (WZ0 + FLZ)/2)), panel)
    setm(box(f'SM_Duct{sd}', (0.32, L - 1.6, 0.22), (sd*(W/2 - 0.22), 0.3, Z0 + H - 0.2)), panel)     # תעלת מיזוג
    for k in range(9):
        setm(box(f'SM_Vent{sd}{k}', (0.12, 0.25, 0.01), (sd*(W/2 - 0.3), YF + 1.6 + k*1.1, Z0 + H - 0.312)), trim)
setm(box('SM_Ceiling', (W - 0.7, L - 1.2, 0.02), (0, 0.3, Z0 + H - 0.08)), tiled('M_CeilPerf', 'tex/ceiling.png', 3.0, 0.6))
# פסי נקודות LED לאורך שולי התקרה, ופתחי מיזוג בצבע שמנת (לפי צילום)
cream = mat('M_VentCream', (0.85, 0.82, 0.72), 0.5)
for sd in (1, -1):
    for k in range(40):
        setm(box(f'SM_LedDot{sd}{k}', (0.03, 0.05, 0.008), (sd*(W/2 - 0.42), YF + 1.4 + k*0.25, Z0 + H - 0.312)), lamp)
    for k in range(6):
        v = box(f'SM_VentC{sd}{k}', (0.02, 0.4, 0.14), (sd*(W/2 - 0.075), YF + 2.0 + k*1.6, WZ1 + 0.18)); setm(v, cream)
        mm = v.modifiers.new('bev', 'BEVEL'); mm.width = 0.03; mm.segments = 4
        for j in range(4): setm(box(f'SM_VentS{sd}{k}{j}', (0.025, 0.34, 0.012), (sd*(W/2 - 0.086), YF + 2.0 + k*1.6, WZ1 + 0.13 + j*0.032)), trim)
st_ = uv_plane('SM_QRSticker', 0.3, 0.13, (0.55, YF + 3.0, Z0 + H - 0.095), tex_mat('M_QRSticker', 'tex/qr_sticker.png', 0.2)); st_.rotation_euler = (math.radians(90), 0, 0)
for k in (-1, 1):                                                 # פסי תאורה
    setm(box(f'SM_Light{k}', (0.12, L - 2.0, 0.015), (k*0.42, 0.3, Z0 + H - 0.095)), lamp)

def seat(name, x, y, facing=-1):
    """מושב עירוני: מעטפת פלסטיק מעוגלת, ריפוד כחול, ידית אחיזה בראש המשענת"""
    zc = FLZ + 0.46
    cu = box(name + '_Cush', (0.42, 0.42, 0.06), (x, y, zc), rot=None); setm(cu, seat_fab)
    sh = box(name + '_Shell', (0.44, 0.06, 0.66), (x, y - facing*0.21, zc + 0.3)); setm(sh, shell)
    bk = box(name + '_Back', (0.38, 0.02, 0.5), (x, y - facing*0.175, zc + 0.3)); setm(bk, seat_fab)
    for o in (cu, sh, bk):
        mm = o.modifiers.new('bev', 'BEVEL'); mm.width = 0.025; mm.segments = 3
        smooth(o)
    hd = cyl(name + '_Grab', 0.014, 0.22, (x, y - facing*0.25, zc + 0.66), seg=10, axis='X'); setm(hd, steel)
    leg = box(name + '_Leg', (0.04, 0.04, 0.42), (x - 0.12, y, FLZ + 0.22)); setm(leg, steel)

ys = [YF + 2.0 + k*0.8 for k in range(12)]
for k, y in enumerate(ys):
    if y > YR - 0.9: break
    for sd in (1, -1):
        if sd == R and MD[0] - 0.4 < y < MD[1] + 0.3: continue        # מול הדלת האמצעית — רצפה פנויה
        if sd == -R and MD[0] - 0.3 < y < MD[1] + 0.5: continue       # אזור כיסא גלגלים
        if FA - 0.6 < y < FA + 0.6 and sd == -R: continue              # מעל הגלגל הקדמי
        for xo in (0.33, 0.77):
            seat(f'SM_Seat{k}_{sd}_{xo}', sd*(W/2 - xo), y)
usb_m = mat('M_USB', (0.02, 0.02, 0.02), 0.3)
for k, y in enumerate(ys[::2]):
    for sd in (1, -1):
        setm(box(f'SM_USB{k}{sd}', (0.05, 0.08, 0.14), (sd*(W/2 - 0.1), y + 0.3, WZ0 - 0.1)), usb_m)
        for j in (0, 1): setm(box(f'SM_USBp{k}{sd}{j}', (0.004, 0.02, 0.008), (sd*(W/2 - 0.126), y + 0.3, WZ0 - 0.13 + j*0.05)), steel)
# אזור כיסא גלגלים: מושב מתקפל, חגורה ושלט כחול
wy = (MD[0] + MD[1]) / 2
xw = -R*(W/2 - 0.1)
fs = box('SM_FoldSeat', (0.42, 0.08, 0.62), (xw - (-R)*0.25, wy + 0.45, FLZ + 0.95)); setm(fs, seat_fab)     # מושב מתקפל גבוה
mm = fs.modifiers.new('bev', 'BEVEL'); mm.width = 0.03; mm.segments = 3
setm(box('SM_FoldBase', (0.3, 0.2, 0.25), (xw - (-R)*0.25, wy + 0.45, FLZ + 0.13)), trim)
setm(box('SM_BeltRetractor', (0.04, 0.07, 0.12), (xw - (-R)*0.02, wy - 0.42, FLZ + 0.8)), trim)
setm(box('SM_Belt', (0.01, 0.04, 0.22), (xw - (-R)*0.03, wy - 0.42, FLZ + 0.62)), trim)
for zz in (0.85, 1.05):
    setm(cyl(f'SM_WheelRail{zz}', 0.018, 1.2, (xw - (-R)*0.05, wy, FLZ + zz), seg=12, axis='Y'), yellow)
bw = box('SM_WallBtn', (0.02, 0.05, 0.07), (xw - (-R)*0.02, wy - 0.7, FLZ + 0.75)); setm(bw, blue_btn)
# מוטות: אנכיים ליד כל שורה שנייה ובדלתות, מעקות תקרה לכל האורך, רצועות תלויות
poles = [YF + 1.6, FD[0] + 0.1, FD[1] + 0.05, MD[0] - 0.1, MD[1] + 0.1] + [y + 0.36 for y in ys[1::2]]
for k, y in enumerate(poles):
    for sd in (1, -1):
        x = sd * 0.42
        setm(cyl(f'SM_Pole{k}{sd}', 0.019, Z0 + H - 0.12 - FLZ, (x, y, (FLZ + Z0 + H - 0.12)/2), seg=14, axis='Z'), yellow)
        if k % 2 == 0:                                                # לחצן עצור על המוט
            bb = box(f'SM_Btn{k}{sd}', (0.05, 0.045, 0.12), (x, y - 0.03, FLZ + 1.35)); setm(bb, blue_btn)
            mm = bb.modifiers.new('bev', 'BEVEL'); mm.width = 0.012; mm.segments = 3
            setm(box(f'SM_BtnF{k}{sd}', (0.03, 0.006, 0.035), (x, y - 0.054, FLZ + 1.36)), yel_face)
for sd in (1, -1):
    setm(cyl(f'SM_CeilRail{sd}', 0.016, L - 2.6, (sd*0.42, 0.4, Z0 + H - 0.42), seg=12, axis='Y'), yellow)
    for k in range(14):
        y = YF + 2.2 + k*0.62
        sp = box(f'SM_Strap{sd}{k}', (0.03, 0.012, 0.18), (sd*0.42, y, Z0 + H - 0.53)); setm(sp, yellow)
        ring = cyl(f'SM_StrapRing{sd}{k}', 0.045, 0.012, (sd*0.42, y, Z0 + H - 0.66), seg=16, axis='Y'); setm(ring, yellow)
# מכשיר התיקוף החדש (לפי תמונות): גוף שחור מלבני מעוגל על המוט הצהוב, מסך לאורך עם כותרת כחולה וכרטיס צהוב,
# ומתחתיו אזור ההנחה עם סמל ה-NFC. המסכים נוצרים ב-screens.py (tex/)
val_body = mat('M_ValBody', (0.025, 0.025, 0.028), 0.35)
scr_idle = tex_mat('M_ValScreen', 'tex/screen_idle.png')
nfc_m = tex_mat('M_ValNFC', 'tex/nfc.png', 0.3)
for nm, y in (('F', FD[1] + 0.05), ('M1', MD[0] - 0.1)):
    x = R*0.42; yv = y - 0.06
    bd = box(f'SM_Val{nm}', (0.19, 0.075, 0.36), (x, yv, FLZ + 1.25)); setm(bd, val_body)
    mm = bd.modifiers.new('bev', 'BEVEL'); mm.width = 0.03; mm.segments = 5; smooth(bd)
    uv_plane(f'SM_ValScr{nm}', 0.15, 0.2, (x, yv - 0.039, FLZ + 1.31), scr_idle)
    uv_plane(f'SM_ValNFC{nm}', 0.13, 0.068, (x, yv - 0.039, FLZ + 1.14), nfc_m)
    for sx in (-1, 1):                                                     # פסי תאורה בצדי אזור ההנחה
        setm(box(f'SM_ValLed{nm}{sx}', (0.008, 0.004, 0.05), (x + sx*0.072, yv - 0.039, FLZ + 1.14)), lamp)
    setm(box(f'SM_ValClamp{nm}', (0.06, 0.05, 0.05), (x, y - 0.015, FLZ + 1.03)), val_body)
# הדגם השני (לפי תמונות): גוף אפור כהה, מסך לרוחב בראש מוטה לאחור, ומתחתיו משטח הנחה משופע עם סמל ה-NFC
land_scr = tex_mat('M_ValScreenLand', 'tex/land_idle.png')
val_grey = mat('M_ValGrey', (0.22, 0.23, 0.25), 0.4)
x, y = R*0.42, MD[1] + 0.05
base = box('SM_ValL_Base', (0.22, 0.14, 0.2), (x, y - 0.08, FLZ + 1.02)); setm(base, val_grey)
head = box('SM_ValL_Head', (0.26, 0.1, 0.2), (x, y - 0.1, FLZ + 1.24), rot=(math.radians(-18), 0, 0)); setm(head, val_grey)
for o in (base, head):
    mm = o.modifiers.new('bev', 'BEVEL'); mm.width = 0.035; mm.segments = 5; smooth(o)
sc_ = uv_plane('SM_ValL_Scr', 0.19, 0.115, (x, y - 0.158, FLZ + 1.25), land_scr); sc_.rotation_euler = (math.radians(-18), 0, 0)
pad = uv_plane('SM_ValL_NFC', 0.17, 0.085, (x, y - 0.155, FLZ + 1.06), tex_mat('M_ValPad', 'tex/pad_land.png', 0.1)); pad.rotation_euler = (math.radians(-35), 0, 0)
setm(box('SM_ValL_Led', (0.05, 0.004, 0.008), (x, y - 0.153, FLZ + 1.12)), lamp)
for k in range(6):                                                         # רמקול מתחת למסך
    setm(box(f'SM_ValL_Spk{k}', (0.06, 0.004, 0.004), (x, y - 0.152, FLZ + 1.15 - k*0.008)), trim)

# שלט LED פנימי בחזית התקרה, פטישי חירום אדומים
setm(box('SM_LCDFrame', (1.1, 0.05, 0.36), (0, YF + 1.3, Z0 + H - 0.4)), trim)
lc = uv_plane('SM_LCD', 1.0, 0.3, (0, YF + 1.33, Z0 + H - 0.4), tex_mat('M_LCD', 'tex/lcd.png', 1.0)); lc.rotation_euler = (0, 0, math.pi)
for k, y in enumerate((YF + 4.0, YF + 8.0)):
    for sd in (1, -1):
        setm(box(f'SM_Hammer{k}{sd}', (0.03, 0.05, 0.12), (sd*(W/2 - 0.09), y, WZ1 - 0.1)), redm)
# תא נהג: לוח מחוונים, הגה, מושב, מחיצת פרספקס ומכונת כרטוס
setm(box('SM_Dash', (W - 0.3, 0.55, 0.42), (0, YF + 0.5, FLZ + 0.45)), trim)
sw = cyl('SM_SteerWheel', 0.24, 0.04, (-R*0.62, YF + 0.95, FLZ + 0.86), seg=32, axis='Y'); sw.rotation_euler = (math.radians(40), 0, 0); setm(sw, trim)
setm(box('SM_DriverSeat', (0.5, 0.5, 0.12), (-R*0.62, YF + 1.45, FLZ + 0.46)), seatm)
setm(box('SM_DriverBack', (0.5, 0.09, 0.75), (-R*0.62, YF + 1.72, FLZ + 0.86)), seatm)
setm(box('SM_CabScreen', (0.03, 0.95, 1.25), (-R*0.32, YF + 1.45, FLZ + 0.95)), plexi)
setm(box('SM_TicketMachine', (0.25, 0.2, 0.18), (-R*0.25, YF + 0.95, FLZ + 1.05)), trim)
setm(box('SM_TicketScr', (0.16, 0.005, 0.1), (-R*0.25, YF + 1.051, FLZ + 1.07)), screen)

# ---------- שילוט לפי "שילוט אוטובוסים אחיד — הנחיות וכללי מפתח מחייבים" (משרד התחבורה, V-01.24):
# המדבקות נחתכו מהמסמך (signs/signN.png), בגודל ובמיקום שבטבלת היישום לאוטובוס עירוני
_FACE = {'-Y': 0.0, '+Y': math.pi, '+X': math.pi/2, '-X': -math.pi/2}
_OFF = {'-Y': (0, -1, 0), '+Y': (0, 1, 0), '+X': (1, 0, 0), '-X': (-1, 0, 0)}
_sign_mats = {}
def decal(num, w_cm, h_cm, loc, face, tag=''):
    if num not in _sign_mats:
        _sign_mats[num] = tex_mat(f'M_Sign{num}', f'signs/sign{num}.png', 0.08)
    o = _OFF[face]; x, y, z = loc
    ob = uv_plane(f'SG_{num}{tag}', w_cm/100, h_cm/100, (x + o[0]*0.006, y + o[1]*0.006, z), _sign_mats[num])
    ob.rotation_euler = (0, 0, _FACE[face]); return ob
WALL = W/2 - 0.085                                  # הקיר הפנימי מתחת לחלונות
# פנים — אזור הנהג: שלט מאוחד (12) ושלט מרכז ידיעת/חובת הנוסע (2) על גב המחיצה, פונים לנוסעים
decal('12', 15, 20, (-R*0.62, YF + 1.78, FLZ + 1.4), '+Y')
decal('2', 37, 25, (-R*0.2, YF + 1.98, FLZ + 1.55), '+Y')
decal('13', 15, 6, (-R*0.62, YF + 1.78, FLZ + 1.18), '+Y')                 # WiFi
decal('29', 16, 11, (-R*0.62, YF + 0.32, Z0 + H - 0.35), '+Y')            # נתוני מקסימום — מעל הנהג
decal('30', 7, 7.5, (-R*0.95, YF + 0.78, FLZ + 0.67), '+Y')               # גובה האוטובוס — ליד לוח המחוונים
decal('22', 6, 6, (-R*0.25, YF + 0.78, FLZ + 0.67), '+Y')                 # עזרה ראשונה — תא הנהג
# מטף כיבוי ליד המחיצה + שלט 24
ext = cyl('SM_Extinguisher', 0.075, 0.45, (-R*0.95, YF + 1.85, FLZ + 0.3), seg=24, axis='Z'); setm(ext, redm)
decal('24', 11, 11, (-R*0.95, YF + 1.92, FLZ + 0.7), '+Y')
# תיקוף בסלולרי (1, A5): משני צדי מסך המידע, מול אזור כסא הגלגלים, ובמחיצה האחורית
for k, x in enumerate((-0.72, 0.72)):
    decal('1', 14.8, 21, (x, YF + 1.33, Z0 + H - 0.4), '+Y', f'lcd{k}')
decal('1', 14.8, 21, (R*WALL, (MD[0] + MD[1])/2 + 0.9, WZ0 - 0.25), '+X' if R < 0 else '-X', 'opp')
decal('1', 14.8, 21, (0.5, YR - 0.62, FLZ + 1.5), '-Y', 'rear')
# אזור כסא גלגלים: טקסט (8), כסא גלגלים (5) ועגלה (7) — על הקיר, פונים פנימה
wf = '-X' if -R > 0 else '+X'
decal('8', 20, 13, (-R*WALL, wy - 0.1, FLZ + 1.25), wf)
decal('5', 13, 13, (-R*WALL, wy - 0.3, FLZ + 0.95), wf, 'w')
decal('7', 13, 13, (-R*WALL, wy + 0.1, FLZ + 0.95), wf, 'w')
decal('6', 13, 13, (WALL * (-R), YF + 2.3, WZ0 - 0.15), wf, 'front')       # מקום שמור לבעלי צרכים מיוחדים — מושבים קדמיים
decal('4', 13, 13, (WALL * (-R), YF + 2.6, WZ0 - 0.15), wf, 'front')       # מקום לעיוור עם כלב
# זהירות מהדלת (14): על כל כנף, מבפנים
for nm, (a, b_) in (('Front', FD), ('Mid', MD)):
    wd = (b_ - a) / 2
    for k in (0, 1):
        decal('14', 10, 10, (R*(W/2 - 0.05), a + wd/2 + k*wd, FLZ + 1.0), '+X' if R < 0 else '-X', f'{nm}{k}')
# פטיש חירום (15) ליד הפטישים, יציאת חירום (16) על שני חלונות בכל צד
for k, y in enumerate((YF + 4.0, YF + 8.0)):
    for sd in (1, -1):
        decal('15', 7.5, 12.5, (sd*(W/2 - 0.09), y + 0.12, WZ1 - 0.12), '-X' if sd > 0 else '+X', f'{k}{sd}')
        decal('16', 17, 14, (sd*(W/2 - 0.03), y - 0.5, WZ1 - 0.35), '-X' if sd > 0 else '+X', f'{k}{sd}')
# חוץ: תיקוף בסלולרי משמאל לכל דלת, מצלמה (27), סולר (28), דיווח נהיגה ופליטת עשן (31, 32) מאחור
for nm, (a, b_) in (('Front', FD), ('Mid', MD)):
    decal('1', 14.8, 21, (R*(W/2 + 0.002), b_ + 0.18, Z0 + 1.45), '-X' if R < 0 else '+X', f'out{nm}')
decal('27', 13, 13, (R*(W/2 + 0.002), FD[0] - 0.12, Z0 + 2.0), '-X' if R < 0 else '+X')
decal('28', 15, 10, (-R*(W/2 + 0.002), YR - 2.4, Z0 + 0.65), '+X' if R < 0 else '-X')
decal('31', 40, 18, (-0.45, YR + 0.025, Z0 + 1.35), '+Y')
decal('32', 40, 18, (0.45, YR + 0.025, Z0 + 1.35), '+Y')

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
