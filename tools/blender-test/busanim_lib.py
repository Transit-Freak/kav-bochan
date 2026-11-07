"""אנימציות האוטובוס — ספרייה משותפת: שלד לאוטובוס (גלגלים, הטיה, כריעה, דלתות), רמפה ומושב מתקפל,
רחוב ותחנה, כיסא גלגלים, ובני אדם מ-MPFB עם IK לידיים ולרגליים ותנועה מצולמת (CMU) להליכה.
הקואורדינטות כמו ב-bus.py: חזית האוטובוס ב--Y, הדלתות ב--X. אנשים מסתכלים ל--Y בתנוחת הבסיס."""
import bpy, bmesh, math, os, glob, importlib, random
from mathutils import Matrix, Vector, Quaternion, Euler

SC = bpy.context.scene
L, W, H, Z0 = 12.0, 2.55, 2.85, 0.30
YF, YR = -L/2, L/2
FLZ = Z0 + 0.36
FLOOR = FLZ + 0.015                      # פני הרצפה בתוך האוטובוס
MD = (YF + 5.35, YF + 6.6)               # הדלת האמצעית
FD = (YF + 0.25, YF + 1.45)
FA, RA = YF + 2.65, YF + 8.6
WHEEL_R = 0.53
ZT = Z0 + H - 0.62
HINGE_X = -(W - 0.12) / 2                # ציר הרמפה: קצה הרצפה בפתח הדלת
RAMP_L, RAMP_W = 1.15, 0.9
KNEEL = 0.07
PLAT_Z = 0.30                            # תחנה מוגבהת
SIDE_Z = 0.18
CURB_X = -1.50
FPS = 24


def log(*a):
    print('ANIM', *a, flush=True)


def upd():
    bpy.context.view_layer.update()


def smooth(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def ease_keys(keys, f):
    """keys: [(frame, value)] — מעבר רך (smoothstep) בין מפתחות. value: מספר / Vector / tuple"""
    if f <= keys[0][0]: return _cp(keys[0][1])
    if f >= keys[-1][0]: return _cp(keys[-1][1])
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f0 <= f <= f1:
            t = smooth((f - f0) / max(1e-6, f1 - f0))
            return _lerp(v0, v1, t)


def _cp(v):
    return v.copy() if hasattr(v, 'copy') else v


def _lerp(a, b, t):
    if isinstance(a, (int, float)): return a + (b - a) * t
    if isinstance(a, tuple): return tuple(x + (y - x) * t for x, y in zip(a, b))
    return a.lerp(b, t)


# ---------------------------------------------------------------- חומרים ועצמים פשוטים
def mat(name, base, rough=0.6, metal=0.0, emit=None, es=1.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = es
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    return m


def link(ob, parent=None):
    SC.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent; ob.matrix_parent_inverse = Matrix.Identity(4)
    return ob


def empty(name, loc=(0, 0, 0), parent=None, size=0.1):
    e = bpy.data.objects.new(name, None); e.empty_display_size = size
    link(e, parent); e.location = loc; e.rotation_mode = 'QUATERNION'; return e


def mesh_from_bm(name, bm, m=None, parent=None, smooth_=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me), parent)
    if m: ob.data.materials.append(m)
    if smooth_:
        for p in me.polygons: p.use_smooth = True
    return ob


def box(name, size, loc, m=None, parent=None, bev=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts); bmesh.ops.translate(bm, vec=loc, verts=bm.verts)
    ob = mesh_from_bm(name, bm, m, parent)
    if bev:
        md = ob.modifiers.new('bev', 'BEVEL'); md.width = bev; md.segments = 3; md.limit_method = 'NONE'
    return ob


def cyl(name, r, depth, loc, axis='Z', seg=24, m=None, parent=None, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    rot = {'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Y': Matrix.Rotation(math.pi / 2, 4, 'X'), 'Z': Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts); bmesh.ops.translate(bm, vec=loc, verts=bm.verts)
    ob = mesh_from_bm(name, bm, m, parent, smooth_=True)
    return ob


def rod(name, a, b, r, m=None, parent=None, seg=12):
    """גליל בין שתי נקודות"""
    a, b = Vector(a), Vector(b); d = b - a
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.transform(bm, matrix=q.to_matrix().to_4x4(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
    return mesh_from_bm(name, bm, m, parent, smooth_=True)


def torus(name, R, r, loc, axis='X', m=None, parent=None, seg=48, seg2=10):
    bm = bmesh.new(); vs = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; ring = []
        for j in range(seg2):
            b = 2 * math.pi * j / seg2
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            ring.append(bm.verts.new(p))
        vs.append(ring)
    for i in range(seg):
        for j in range(seg2):
            bm.faces.new((vs[i][j], vs[(i + 1) % seg][j], vs[(i + 1) % seg][(j + 1) % seg2], vs[i][(j + 1) % seg2]))
    rot = {'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Y': Matrix.Rotation(math.pi / 2, 4, 'X'), 'Z': Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts); bmesh.ops.translate(bm, vec=loc, verts=bm.verts)
    return mesh_from_bm(name, bm, m, parent, smooth_=True)


def key_obj(ob, f, loc=None, rot=None):
    if loc is not None: ob.location = loc; ob.keyframe_insert('location', frame=f)
    if rot is not None:
        if ob.rotation_mode == 'QUATERNION':
            ob.rotation_quaternion = rot if isinstance(rot, Quaternion) else Euler(rot).to_quaternion()
            ob.keyframe_insert('rotation_quaternion', frame=f)
        else:
            ob.rotation_euler = rot; ob.keyframe_insert('rotation_euler', frame=f)


# ---------------------------------------------------------------- האוטובוס: היררכיה לתנועה
def bbox_w(o):
    return [o.matrix_world @ Vector(c) for c in o.bound_box]


def split_y(name, y0, y1):
    """מפצל קיר/זכוכית שעוברים דרך פתח הדלת לשני חלקים (לפני ואחרי הפתח)"""
    o = bpy.data.objects.get(name)
    if not o: log('split: missing', name); return
    pts = bbox_w(o); mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    m = o.data.materials[0] if o.data.materials else None
    for k, (a, b) in enumerate(((mn.y, y0), (y1, mx.y))):
        if b - a > 0.01:
            box(f'{name}_s{k}', (mx.x - mn.x, b - a, mx.z - mn.z), ((mn.x + mx.x) / 2, (a + b) / 2, (mn.z + mx.z) / 2), m)
    bpy.data.objects.remove(o)


def setup_bus():
    """אחרי טעינת out/bus.blend: מנקה, מתקן, ובונה שלד: Chassis → Pitch (הטיה וכריעה) → Body; גלגלים על השלדה"""
    for o in list(bpy.data.objects):
        if o.name.startswith('ENV_') or o.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(o)
        elif o.name.startswith('Cut_'):
            o.hide_render = True; o.hide_viewport = True
    # מוטות שעוברים דרך מושב הנהג (תיקון לדגם), ושקע USB בתוך פתח הדלת האמצעית
    for n in ('SM_Pole01', 'SM_Pole21', 'SM_PoleFoot01', 'SM_PoleFoot21', 'SM_Btn01', 'SM_BtnF01', 'SM_Btn21', 'SM_BtnF21',
              'SM_USB2-1', 'SM_USBp2-10', 'SM_USBp2-11'):
        o = bpy.data.objects.get(n)
        if o: bpy.data.objects.remove(o)
    # קיר פנימי וזכוכית שעוברים דרך פתח הדלת האמצעית
    split_y('SM_WallLow-1', MD[0], MD[1]); split_y('SM_SideGlass-1', MD[0], MD[1])
    # מחיצת הנהג: רק החלק הקדמי (פתח יציאה ליד המושב)
    cs = bpy.data.objects.get('SM_CabScreen')
    if cs:
        m = cs.data.materials[0]; bpy.data.objects.remove(cs)
        box('SM_CabScreen', (0.03, 0.2, 1.25), (0.32, YF + 0.97 + 0.1, FLZ + 0.95), m)
    upd()
    roots = [o for o in bpy.data.objects if o.parent is None]
    ch = empty('BusChassis', size=1); pitch = empty('BusPitch', (0, 0, 0.55), ch, size=0.6)
    body = empty('BusBody', (0, 0, -0.55), pitch, size=0.3)
    wheels = {}
    for nm, y in (('F', FA), ('R', RA)):
        for sd in (1, -1):
            w = empty(f'Wheel{nm}{sd}', (sd * (W / 2 - 0.2), y, WHEEL_R), ch, size=0.6); w.rotation_mode = 'XYZ'
            wheels[(nm, sd)] = w
    upd()
    WP = ('SM_Tire', 'SM_Rim', 'SM_Hub', 'SM_Nut')
    doors = {}
    for k in (0, 1):
        a, b = MD; wd = (b - a) / 2; yc = a + wd / 2 + k * wd
        doors[k] = empty(f'DoorMid{k}', (-(W / 2 - 0.03), yc, Z0 + 1.24), body, size=0.3)
    upd()
    for o in roots:
        if o.name.startswith(WP):
            c = sum(bbox_w(o), Vector()) / 8
            w = min(wheels.values(), key=lambda e: (e.matrix_world.translation - c).length)
            o.parent = w; o.matrix_parent_inverse = w.matrix_world.inverted()
        else:
            p = body
            for k in (0, 1):
                if o.name in (f'SM_DoorMid{k}', f'SM_DoorFrMid{k}', f'SM_DoorRailMid{k}', f'SG_14Mid{k}'): p = doors[k]
            o.parent = p; o.matrix_parent_inverse = p.matrix_world.inverted()
    upd()
    # תאורת תקרה
    lights = []
    for k in range(5):
        l = bpy.data.objects.new(f'Ceil{k}', bpy.data.lights.new(f'C{k}', 'AREA')); link(l, body)
        l.data.shape = 'RECTANGLE'; l.data.size = 0.25; l.data.size_y = 1.6; l.data.energy = 85; l.data.color = (1.0, 0.95, 0.88)
        l.location = (0, -4.3 + k * 2.1, 2.93); l.rotation_euler = (math.pi, 0, 0); lights.append(l)
    bus = dict(chassis=ch, pitch=pitch, body=body, wheels=wheels, doors=doors, lights=lights)
    bus['ramp'] = make_ramp(body)
    bus['pan'] = make_foldseat(body)
    log('bus rig ok', len(roots), 'objects')
    return bus


def drive(bus, f, y, pitch=0.0, kneel=0.0, roll=0.0, bounce=0.0):
    """y: מיקום מרכז השלדה; הגלגלים מסתובבים לפי המרחק (נסיעה ל--Y = סיבוב חיובי סביב X)"""
    key_obj(bus['chassis'], f, loc=(0, y, 0))
    key_obj(bus['pitch'], f, loc=(0, 0, 0.55 - kneel + bounce), rot=Euler((pitch, roll, 0)).to_quaternion())
    for w in bus['wheels'].values():
        w.rotation_euler = ((bus.get('y0', 0.0) - y) / WHEEL_R, 0, 0); w.keyframe_insert('rotation_euler', frame=f)


def door_open(bus, f, t):
    """t: 0 סגור → 1 פתוח. כנף יוצאת החוצה 7 ס"מ ואז מחליקה לאורך הדופן"""
    a, b = MD; wd = (b - a) / 2
    out = smooth(t / 0.35); sl = smooth((t - 0.25) / 0.75)
    for k in (0, 1):
        yc = a + wd / 2 + k * wd + (-1 if k == 0 else 1) * 0.58 * sl
        key_obj(bus['doors'][k], f, loc=(-(W / 2 - 0.03) - 0.07 * out, yc, Z0 + 1.24))


# ---------------------------------------------------------------- רמפה מתקפלת ומושב מתקפל
def make_ramp(body):
    piv = empty('RampPivot', (HINGE_X, 0, FLOOR + 0.006), body, size=0.2); piv.rotation_mode = 'XYZ'
    alu = mat('M_RampAlu', (0.55, 0.56, 0.57), 0.45, metal=0.8)
    nt = alu.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord'); wv = nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 18
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector']); nt.links.new(wv.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    yel = mat('M_RampEdge', (0.95, 0.72, 0.05), 0.4)
    # במצב מקופל: הלוח שוכב על הרצפה מהציר פנימה (+X); הסיבוב סביב Y השלילי מרים את הקצה
    box('Ramp', (RAMP_L, RAMP_W, 0.03), (RAMP_L / 2, 0, 0.015), alu, piv, bev=0.006)
    for s in (1, -1):
        box(f'RampSide{s}', (RAMP_L, 0.03, 0.05), (RAMP_L / 2, s * (RAMP_W / 2 - 0.015), 0.025), yel, piv, bev=0.005)
    box('RampLip', (0.06, RAMP_W, 0.012), (RAMP_L - 0.03, 0, 0.006), yel, piv)
    box('RampHandle', (0.03, 0.22, 0.012), (RAMP_L - 0.07, 0, 0.034), mat('M_RampHandle', (0.03, 0.03, 0.03), 0.6), piv)
    # רצועת משיכה (לקיפול חזרה) — מעוגנת באמצע הרמפה
    att = empty('RampStrapAnchor', (0.85, 0.0, 0.032), piv, size=0.05)
    return dict(pivot=piv, anchor=att)


def ramp_deploy_angle():
    # הקצה התחתון של הלוח נח על התחנה המוגבהת (הבוס כרע)
    drop = (FLOOR + 0.006 - KNEEL) - PLAT_Z - 0.03
    return math.pi + math.asin(drop / RAMP_L)


def ramp_point(phi, r, z=0.0, floor=FLOOR + 0.006):
    """נקודה על הרמפה במרחק r מהציר (במערכת האוטובוס)"""
    return Vector((HINGE_X + r * math.cos(phi) - z * math.sin(phi), 0, floor + r * math.sin(phi) + z * math.cos(phi)))


def key_ramp(bus, f, phi):
    p = bus['ramp']['pivot']; p.rotation_euler = (0, -phi, 0); p.keyframe_insert('rotation_euler', frame=f)


PAN_HINGE = Vector((W / 2 - 0.1 - 0.22, 0.385, FLOOR + 0.45))


def make_foldseat(body):
    piv = empty('PanPivot', PAN_HINGE, body, size=0.2); piv.rotation_mode = 'XYZ'
    fab = bpy.data.materials.get('M_SeatFabric') or mat('M_PanFab', (0.05, 0.12, 0.3), 0.8)
    shell = bpy.data.materials.get('M_SeatShell') or mat('M_PanShell', (0.32, 0.33, 0.35), 0.45)
    box('PanCushion', (0.40, 0.40, 0.035), (0, -0.21, -0.018), fab, piv, bev=0.012)
    box('PanShell', (0.42, 0.42, 0.025), (0, -0.21, -0.048), shell, piv, bev=0.008)
    steel = bpy.data.materials.get('M_Steel') or mat('M_PanSteel', (0.5, 0.5, 0.5), 0.4, 1.0)
    for s in (1, -1):
        box(f'PanArm{s}', (0.02, 0.05, 0.05), (s * 0.2, -0.01, -0.03), steel, piv)
    return piv


def key_pan(bus, f, phi):
    bus['pan'].rotation_euler = (-phi, 0, 0); bus['pan'].keyframe_insert('rotation_euler', frame=f)


def pan_edge(phi, dx=0.0):
    """אמצע השפה הקדמית של המושב המתקפל (במערכת האוטובוס)"""
    return PAN_HINGE + Vector((dx, -0.42 * math.cos(phi), 0.42 * math.sin(phi) - 0.03 * math.cos(phi)))


# ---------------------------------------------------------------- רחוב ותחנה
def facade_mat(name, wall, glass=(0.05, 0.07, 0.09)):
    m = bpy.data.materials.new(name); nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.8
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); cb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(tc.outputs['Object'], sp.inputs[0]); nt.links.new(sp.outputs['Y'], cb.inputs['X']); nt.links.new(sp.outputs['Z'], cb.inputs['Y'])
    br = nt.nodes.new('ShaderNodeTexBrick'); br.offset = 0.0; br.inputs['Scale'].default_value = 1.0
    br.inputs['Color1'].default_value = (*glass, 1); br.inputs['Color2'].default_value = (*[g * 1.4 for g in glass], 1)
    br.inputs['Mortar'].default_value = (*wall, 1); br.inputs['Mortar Size'].default_value = 0.55
    br.inputs['Brick Width'].default_value = 3.0; br.inputs['Row Height'].default_value = 3.0; br.inputs['Mortar Smooth'].default_value = 0.0
    nt.links.new(cb.outputs[0], br.inputs['Vector']); nt.links.new(br.outputs['Color'], b.inputs['Base Color'])
    return m


def build_street(stop_y=0.0, with_people_props=True):
    rnd = random.Random(7)
    asphalt = mat('M_Asphalt2', (0.06, 0.06, 0.065), 0.9)
    nt = asphalt.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 40; rp = nt.nodes.new('ShaderNodeValToRGB')
    rp.color_ramp.elements[0].color = (0.045, 0.045, 0.05, 1); rp.color_ramp.elements[1].color = (0.085, 0.085, 0.09, 1)
    nt.links.new(nz.outputs['Fac'], rp.inputs['Fac']); nt.links.new(rp.outputs['Color'], b.inputs['Base Color'])
    box('ST_Road', (60, 400, 0.02), (2.0, 0, -0.01), asphalt)
    paint = mat('M_Paint', (0.85, 0.85, 0.82), 0.6)
    for k in range(-30, 31):
        box(f'ST_Dash{k}', (0.12, 3.0, 0.004), (2.25, k * 7.0, 0.002), paint)
    box('ST_EdgeLine', (0.12, 400, 0.004), (5.3, 0, 0.002), paint)
    pave = mat('M_Pave2', (0.52, 0.49, 0.44), 0.85)
    nt = pave.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord'); br = nt.nodes.new('ShaderNodeTexBrick'); br.inputs['Scale'].default_value = 3.0
    br.inputs['Color1'].default_value = (0.5, 0.47, 0.42, 1); br.inputs['Color2'].default_value = (0.56, 0.53, 0.47, 1)
    br.inputs['Mortar'].default_value = (0.36, 0.34, 0.31, 1); br.inputs['Mortar Size'].default_value = 0.01
    nt.links.new(tc.outputs['Object'], br.inputs['Vector']); nt.links.new(br.outputs['Color'], b.inputs['Base Color'])
    curb_m = mat('M_Curb2', (0.6, 0.6, 0.57), 0.8)
    red = mat('M_CurbRed', (0.6, 0.04, 0.03), 0.7); yel = mat('M_CurbYel', (0.9, 0.7, 0.05), 0.7)
    P0, P1 = stop_y - 9.0, stop_y + 9.0                      # תחנה מוגבהת
    # מדרכה רגילה משני צדי התחנה, ובאמצע רציף מוגבה עם שיפועים
    box('ST_SideA', (8, 200 - (P1 + 1.2 - stop_y), SIDE_Z), (CURB_X - 4, (P1 + 1.2 + 100 + stop_y) / 2, SIDE_Z / 2), pave)
    box('ST_SideB', (8, (P0 - 1.2) + 100 - stop_y, SIDE_Z), (CURB_X - 4, (P0 - 1.2 - 100 + stop_y) / 2, SIDE_Z / 2), pave)
    box('ST_Plat', (8, P1 - P0, PLAT_Z), (CURB_X - 4, stop_y, PLAT_Z / 2), pave)
    for s, y0 in ((1, P1), (-1, P0)):                         # שיפוע מהרציף למדרכה
        bm = bmesh.new()
        ya, yb = y0, y0 + s * 1.2
        vs = [bm.verts.new(v) for v in ((CURB_X, ya, 0), (CURB_X - 8, ya, 0), (CURB_X - 8, yb, 0), (CURB_X, yb, 0),
                                        (CURB_X, ya, PLAT_Z), (CURB_X - 8, ya, PLAT_Z), (CURB_X - 8, yb, SIDE_Z), (CURB_X, yb, SIDE_Z))]
        for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2)):
            bm.faces.new([vs[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); mesh_from_bm(f'ST_PlatRamp{s}', bm, pave)
    # אבן שפה: אדום-צהוב לאורך התחנה (תחבורה ציבורית בלבד), אפור בשאר הרחוב
    n = int((P1 - P0) / 1.0)
    for k in range(n):
        y = P0 + 0.5 + k
        box(f'ST_CurbS{k}', (0.16, 0.98, PLAT_Z + 0.004), (CURB_X - 0.08, y, PLAT_Z / 2 + 0.002), red if k % 2 else yel)
    box('ST_FarSide', (8, 400, 0.15), (9.5, 0, 0.075), pave)
    # בניינים
    walls = [(0.82, 0.76, 0.64), (0.88, 0.86, 0.8), (0.78, 0.74, 0.68), (0.9, 0.82, 0.7), (0.7, 0.7, 0.68), (0.85, 0.8, 0.72)]
    mats = [facade_mat(f'M_Fac{i}', w) for i, w in enumerate(walls)]
    for side, x0 in ((-1, CURB_X - 8.0), (1, 13.5)):
        y = -180.0
        while y < 180:
            w = rnd.uniform(9, 17); h = rnd.choice((9, 12, 12, 15, 18, 21)); d = 10.0
            box(f'ST_Bld{side}_{int(y)}', (d, w, h), (x0 + side * d / 2, y + w / 2, h / 2), rnd.choice(mats))
            y += w + rnd.uniform(0.0, 2.5)
    # עצים
    trunk = mat('M_Trunk', (0.2, 0.14, 0.09), 0.9); leaf = mat('M_Leaf', (0.09, 0.2, 0.06), 0.8)
    for side, x in ((-1, CURB_X - 6.2), (1, 7.5)):
        for k in range(-14, 15):
            y = k * 11.0 + rnd.uniform(-1.5, 1.5)
            if side < 0 and abs(y - stop_y) < 10: continue
            zb = SIDE_Z if side < 0 else 0.15
            cyl(f'ST_Trunk{side}{k}', 0.11, 2.6, (x, y, zb + 1.3), m=trunk, seg=10)
            bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.6)
            for v in bm.verts: v.co *= 1 + 0.18 * math.sin(v.co.x * 3.1 + k) * math.cos(v.co.y * 2.7 + side)
            bmesh.ops.translate(bm, vec=(x, y, zb + 3.6), verts=bm.verts)
            o = mesh_from_bm(f'ST_Crown{side}{k}', bm, leaf, smooth_=True); o.scale = (1, 1, 0.8)
    build_stop(stop_y)


def build_stop(stop_y):
    """סככת המתנה + עמוד שלט תחנה"""
    dark = mat('M_StopFrame', (0.12, 0.13, 0.14), 0.4, metal=0.6)
    glass = mat('M_StopGlass', (0.6, 0.7, 0.75), 0.05, alpha=0.25)
    roof = mat('M_StopRoof', (0.82, 0.83, 0.84), 0.4, metal=0.3)
    x0, x1 = CURB_X - 3.4, CURB_X - 1.6; y0, y1 = stop_y - 3.0, stop_y + 2.0; zt = PLAT_Z + 2.45
    for x in (x0, x1):
        for y in (y0, y1):
            box(f'ST_Post{x:.1f}{y:.1f}', (0.08, 0.08, 2.45), (x, y, PLAT_Z + 1.225), dark)
    box('ST_Roof', (x1 - x0 + 0.5, y1 - y0 + 0.4, 0.08), ((x0 + x1) / 2 + 0.15, (y0 + y1) / 2, zt + 0.04), roof, bev=0.02)
    box('ST_Back', (0.02, y1 - y0 - 0.1, 1.9), (x0, (y0 + y1) / 2, PLAT_Z + 1.2), glass)
    wood = mat('M_Bench', (0.35, 0.22, 0.12), 0.6)
    box('ST_Bench', (0.42, 2.2, 0.05), (x0 + 0.3, stop_y - 0.8, PLAT_Z + 0.46), wood, bev=0.01)
    for y in (stop_y - 1.7, stop_y + 0.1):
        box(f'ST_BenchLeg{y:.1f}', (0.3, 0.05, 0.44), (x0 + 0.3, y, PLAT_Z + 0.22), dark)
    adm = mat('M_Ad', (0.2, 0.45, 0.6), 0.3, emit=(0.15, 0.35, 0.5), es=0.6)
    box('ST_Ad', (1.0, 0.06, 1.6), ((x0 + x1) / 2, y1, PLAT_Z + 1.25), adm)
    # עמוד השלט ליד הדלת הקדמית של האוטובוס כשהוא עוצר
    ys = stop_y - 5.0; xp = CURB_X - 0.5
    cyl('ST_SignPole', 0.04, 3.0, (xp, ys, PLAT_Z + 1.5), m=dark, seg=16)
    sm = mat('M_StopSign', (1, 1, 1), 0.4)
    try:
        nt = sm.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.abspath('tex/stop_sign.png'))
        nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = 0.15
    except Exception as e: log('sign tex', e)
    # לוח שלט דו-צדדי, פונה לכביש (‎+X) ולמדרכה
    for k, rz in ((0, math.pi / 2), (1, -math.pi / 2)):
        me = bpy.data.meshes.new(f'ST_Sign{k}'); bm = bmesh.new()
        vs = [bm.verts.new(v) for v in ((-0.3, 0, -0.42), (0.3, 0, -0.42), (0.3, 0, 0.42), (-0.3, 0, 0.42))]
        f = bm.faces.new(vs); uv = bm.loops.layers.uv.new()
        for lp, co in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uv].uv = co
        bm.to_mesh(me); bm.free(); o = link(bpy.data.objects.new(f'ST_Sign{k}', me)); o.data.materials.append(sm)
        o.location = (xp + (0.012 if k == 0 else -0.012), ys + 0.32, PLAT_Z + 2.55); o.rotation_euler = (0, 0, rz)
    box('ST_SignBack', (0.02, 0.62, 0.86), (xp, ys + 0.32, PLAT_Z + 2.55), dark)


def world_and_sun(strength=0.9, sun=5.0):
    w = bpy.data.worlds.new('W'); SC.world = w
    nt = w.node_tree; bg = next(n for n in nt.nodes if n.type == 'BACKGROUND')
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); rp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sp.inputs[0]); nt.links.new(sp.outputs['Z'], rp.inputs['Fac'])
    rp.color_ramp.elements[0].position = 0.0; rp.color_ramp.elements[0].color = (0.78, 0.84, 0.92, 1)
    rp.color_ramp.elements[1].position = 0.45; rp.color_ramp.elements[1].color = (0.25, 0.45, 0.85, 1)
    nt.links.new(rp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = strength
    s = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); link(s)
    s.data.energy = sun; s.data.angle = math.radians(1.0); s.rotation_euler = (math.radians(48), 0, math.radians(62))
    return s


def camera(name, pos, target, lens=24, parent=None):
    c = bpy.data.objects.new(name, bpy.data.cameras.new(name)); link(c, parent)
    c.data.lens = lens; c.data.clip_start = 0.05; c.location = pos
    c.rotation_mode = 'QUATERNION'; c.rotation_quaternion = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y')
    return c


def aim_cam(c, f, pos, target):
    c.location = pos; c.rotation_quaternion = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y')
    c.keyframe_insert('location', frame=f); c.keyframe_insert('rotation_quaternion', frame=f)


# ---------------------------------------------------------------- כיסא גלגלים
CH_R, CH_TRACK = 0.30, 0.31            # רדיוס הגלגל האחורי, חצי רוחב בין הגלגלים
CH_RIM = 0.27
CH_CASTER = (0.21, -0.46, 0.065)


def make_wheelchair(name='Chair'):
    """כיסא גלגלים ידני. ראשית: הקרקע מתחת לאמצע הסרן האחורי. החזית ל--Y"""
    root = empty(name, size=0.3); root.rotation_mode = 'XYZ'
    alu = mat('M_ChFrame', (0.08, 0.09, 0.1), 0.35, metal=0.7)
    chrome = mat('M_ChRim', (0.75, 0.76, 0.78), 0.2, metal=1.0)
    tire = mat('M_ChTire', (0.02, 0.02, 0.02), 0.85)
    fab = mat('M_ChFab', (0.02, 0.025, 0.035), 0.9)
    wheels = {}
    for s in (1, -1):
        hub = empty(f'{name}_W{s}', (s * CH_TRACK, 0, CH_R), root, size=0.1); hub.rotation_mode = 'XYZ'
        torus(f'{name}_Tire{s}', CH_R - 0.018, 0.018, (0, 0, 0), 'X', tire, hub)
        torus(f'{name}_RimW{s}', CH_R - 0.04, 0.008, (0, 0, 0), 'X', chrome, hub, seg2=6)
        torus(f'{name}_Hand{s}', CH_RIM, 0.009, (s * 0.028, 0, 0), 'X', chrome, hub, seg2=6)
        for k in range(4):                                  # מחזיקי טבעת ההנעה
            a = 2 * math.pi * k / 4 + 0.3
            rod(f'{name}_HB{s}{k}', (0, CH_RIM * math.cos(a), CH_RIM * math.sin(a)), (s * 0.028, CH_RIM * math.cos(a), CH_RIM * math.sin(a)), 0.005, chrome, hub, 6)
        cyl(f'{name}_Hub{s}', 0.035, 0.07, (0, 0, 0), 'X', m=chrome, parent=hub)
        for k in range(12):                                 # חישורים — רואים בהם את כיוון הסיבוב
            a = 2 * math.pi * k / 12
            off = s * 0.02 * (1 if k % 2 else -1)
            rod(f'{name}_Sp{s}{k}', (off, 0, 0), (0, (CH_R - 0.045) * math.cos(a), (CH_R - 0.045) * math.sin(a)), 0.0025, chrome, hub, 5)
        wheels[s] = hub
    cx, cy, cr = CH_CASTER
    casters = {}
    for s in (1, -1):
        piv = empty(f'{name}_Fork{s}', (s * cx, cy, 0.27), root, size=0.05)
        rod(f'{name}_ForkT{s}', (0, 0, 0), (0, 0.04, -0.27 + cr), 0.009, alu, piv)
        cw = empty(f'{name}_CW{s}', (0, 0.04, -0.27 + cr), piv, size=0.05); cw.rotation_mode = 'XYZ'
        cyl(f'{name}_Caster{s}', cr, 0.03, (0, 0, 0), 'X', m=tire, parent=cw, seg=20)
        cyl(f'{name}_CasterHub{s}', 0.02, 0.035, (0, 0, 0), 'X', m=chrome, parent=cw, seg=10)
        casters[s] = cw
    zs = 0.50
    for s in (1, -1):
        x = s * 0.225
        rod(f'{name}_SeatRail{s}', (x, 0.06, zs), (x, -0.42, zs), 0.012, alu, root)
        rod(f'{name}_FrontPost{s}', (x, -0.42, zs), (x * 0.95, cy, 0.27), 0.012, alu, root)
        rod(f'{name}_LowRail{s}', (x, 0.02, 0.24), (x * 0.95, cy, 0.25), 0.011, alu, root)
        rod(f'{name}_BackPost{s}', (x, 0.04, 0.22), (x, 0.12, 0.95), 0.012, alu, root)
        rod(f'{name}_Handle{s}', (x, 0.12, 0.95), (x, 0.24, 0.96), 0.014, fab, root)
        rod(f'{name}_Axle{s}', (x, 0.0, CH_R), (s * (CH_TRACK - 0.03), 0.0, CH_R), 0.01, alu, root)
        rod(f'{name}_FootPost{s}', (x * 0.95, cy - 0.02, 0.27), (s * 0.13, -0.56, 0.12), 0.011, alu, root)
        box(f'{name}_Foot{s}', (0.14, 0.12, 0.012), (s * 0.1, -0.58, 0.115), alu, root)
        box(f'{name}_Guard{s}', (0.008, 0.26, 0.16), (s * 0.245, -0.06, zs + 0.08), mat(f'M_Guard{s}', (0.04, 0.045, 0.05), 0.5), root)
    box(f'{name}_Seat', (0.44, 0.46, 0.025), (0, -0.18, zs + 0.01), fab, root, bev=0.008)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(0.44, 0.02, 0.42), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-10), 3, 'X'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0.09, zs + 0.24), verts=bm.verts); mesh_from_bm(f'{name}_Back', bm, fab, root)
    return dict(root=root, wheels=wheels, casters=casters, forks={s: bpy.data.objects[f'{name}_Fork{s}'] for s in (1, -1)})


def rim_point(chair_wheel_angle, side, theta):
    """נקודה על טבעת ההנעה, במערכת הכיסא. theta נמדד מהכיוון קדימה (‎-Y), נגד השעון כשמסתכלים מבחוץ"""
    a = theta
    return Vector((side * (CH_TRACK + 0.028), -CH_RIM * math.cos(a), CH_R + CH_RIM * math.sin(a)))


# ---------------------------------------------------------------- אנשים (MPFB)
_MP = {}


def mpfb():
    if not _MP:
        base = next(p for p in ('bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb') if importlib.util.find_spec(p))
        _MP['HS'] = importlib.import_module(base + '.services.humanservice').HumanService
        _MP['TS'] = importlib.import_module(base + '.services.targetservice').TargetService
        _MP['ud'] = importlib.import_module(base + '.services.locationservice').LocationService.get_user_data()
        items = sorted(set(os.path.relpath(p, _MP['ud']) for p in glob.glob(f"{_MP['ud']}/**/*.mh*", recursive=True)))
        log('MPFB assets', len(items), ' | '.join(i for i in items if '/clothes/' in '/' + i or 'hair' in i or 'skins' in i)[:4000])
    return _MP


def asset(*rels):
    ud = mpfb()['ud']
    for rel in rels:
        r = glob.glob(f'{ud}/**/{rel}', recursive=True)
        if r: return r[0]
    log('asset missing', rels); return None


def recolor(objs, top, bottom=None, split=None):
    """צובע בגד בצבע אחיד ושומר את הקפלים (בהירות הטקסטורה × הצבע). split: גובה (בקואורדינטות המקור) שמתחתיו צבע אחר"""
    for o in objs:
        zs = [v.co.z for v in o.data.vertices]; zmin, zmax = min(zs), max(zs)
        t = (split - zmin) / max(1e-6, zmax - zmin) if split is not None else None
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.node_tree: continue
            m = m.copy(); slot.material = m; nt = m.node_tree
            for b in [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED']:
                inp = b.inputs['Base Color']; src = inp.links[0].from_socket if inp.is_linked else None
                c1 = nt.nodes.new('ShaderNodeRGB'); c1.outputs[0].default_value = (*top, 1); col = c1.outputs[0]
                if bottom is not None and t is not None:
                    c2 = nt.nodes.new('ShaderNodeRGB'); c2.outputs[0].default_value = (*bottom, 1)
                    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ')
                    nt.links.new(tc.outputs['Generated'], sp.inputs[0])
                    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = t
                    nt.links.new(sp.outputs['Z'], gt.inputs[0])
                    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
                    nt.links.new(gt.outputs[0], mx.inputs['Factor']); nt.links.new(c2.outputs[0], mx.inputs['A']); nt.links.new(c1.outputs[0], mx.inputs['B'])
                    col = mx.outputs['Result']
                if src is not None:
                    bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(src, bw.inputs[0])
                    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 1.9; mul.use_clamp = True
                    nt.links.new(bw.outputs[0], mul.inputs[0])
                    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
                    nt.links.new(col, mix.inputs['A']); nt.links.new(mul.outputs[0], mix.inputs['B'])
                    nt.links.new(mix.outputs['Result'], inp)
                else:
                    nt.links.new(col, inp)


def make_human(name, gender=1.0, age=0.5, weight=0.5, height=0.5, muscle=0.5, race=None,
               skin=('skins/middleage_caucasian_male/middleage_caucasian_male.mhmat',),
               hair=('hair/short04/short04.mhclo',), clothes=(('clothes/male_casualsuit01/male_casualsuit01.mhclo',),),
               shoes=('clothes/shoes02/shoes02.mhclo',), hair_rgb=(0.03, 0.022, 0.016), cloth_colors=None, eyebrows=('eyebrows/eyebrow006/eyebrow006.mhclo',)):
    M = mpfb(); HS, TS = M['HS'], M['TS']
    before = set(bpy.data.objects)
    md = TS.get_default_macro_info_dict(); md.update(gender=gender, age=age, weight=weight, height=height, muscle=muscle)
    if race: md['race'] = race
    bm = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
    HS.add_builtin_rig(bm, 'cmu_mb', import_weights=True)
    s = asset(*skin)
    if s: HS.set_character_skin(s, bm)
    hair_ob = None; cloth_obs = []
    parts = [('Eyes', ('eyes/high-poly/high-poly.mhclo',)), ('Eyebrows', eyebrows), ('Hair', hair)] + [('Clothes', c) for c in clothes] + [('Clothes', shoes)]
    for kind, rels in parts:
        p = asset(*rels)
        if not p: continue
        try:
            ob = HS.add_mhclo_asset(p, bm, asset_type=kind)
        except Exception as e:
            log('add asset failed', p, e); continue
        if kind == 'Hair': hair_ob = ob
        if kind == 'Clothes' and ob is not None: cloth_obs.append(ob)
    rig = bm.parent
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        o.name = f'{name}_{o.name}'
    rig.name = f'{name}_rig'
    # שיער: כיפה כהה מתחת לשיער וצבע אחיד (כמו ב-anim.py), כדי שהקרקפת לא תבצבץ
    if hair_ob is not None and isinstance(hair_ob, bpy.types.Object):
        try:
            cap = hair_ob.copy(); cap.data = hair_ob.data.copy(); cap.name = f'{name}_hair_cap'; SC.collection.objects.link(cap)
            m = mat(f'M_{name}_cap', hair_rgb, 0.7); cap.data.materials.clear(); cap.data.materials.append(m)
            zs = [v.co.z for v in hair_ob.data.vertices]; top = max(zs)
            for ob in (hair_ob, cap):
                vg = ob.vertex_groups.new(name='above_ears')
                for v in ob.data.vertices:
                    w = max(0.0, min(1.0, (v.co.z - (top - 0.085)) / 0.03))
                    if w > 0: vg.add([v.index], w, 'REPLACE')
            d = cap.modifiers.new('in', 'DISPLACE'); d.strength = 0.003; d.vertex_group = 'above_ears'; cap.modifiers.move(len(cap.modifiers) - 1, 0)
            msk = cap.modifiers.new('only_top', 'MASK'); msk.vertex_group = 'above_ears'; cap.modifiers.move(len(cap.modifiers) - 1, 1)
            dh = hair_ob.modifiers.new('out', 'DISPLACE'); dh.strength = 0.006; dh.vertex_group = 'above_ears'; hair_ob.modifiers.move(len(hair_ob.modifiers) - 1, 0)
            for ms in hair_ob.material_slots:
                nt = ms.material.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
                for l in list(pr.inputs['Base Color'].links): nt.links.remove(l)
                pr.inputs['Base Color'].default_value = (*hair_rgb, 1); pr.inputs['Roughness'].default_value = 0.55
        except Exception as e:
            log('hair fix failed', e)
    if cloth_colors:
        for ob, cc in zip(cloth_obs, cloth_colors):
            if cc is None or not isinstance(ob, bpy.types.Object): continue
            top, bot, split = cc if len(cc) == 3 else (cc[0], None, None)
            if split == 'waist': split = rig.data.bones['Hips'].head_local.z + 0.06
            recolor([ob], top, bot, split)
    a = Actor(name, rig, [o for o in new if o.type == 'MESH'])
    log('human', name, 'bones', len(rig.data.bones), 'meshes', [o.name for o in a.meshes])
    return a


# ---------------------------------------------------------------- תנוחות ו-IK
def rotw(rig, n, axis, ang):
    """סיבוב עצם סביב הראש שלה בציר של מערכת השלד"""
    pb = rig.pose.bones.get(n)
    if pb is None: return
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, Vector(axis).normalized()) @ Matrix.Translation(-h) @ pb.matrix
    upd()


def aim(rig, n, d):
    pb = rig.pose.bones.get(n)
    if pb is None: return
    cur = (pb.tail - pb.head).normalized(); q = cur.rotation_difference(Vector(d).normalized())
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
    upd()


def qang(a, b):
    x = a.rotation_difference(b).angle
    return min(x, 2 * math.pi - x)


ACTORS = []


def qa(frames):
    """בדיקה: המרחק בין קצה הגפה (שורש כף היד / הקרסול) ליעד ה-IK, וכיוון הברך ביחס לכיוון הגוף"""
    for a in ACTORS:
        worst = {}
        for f in frames:
            SC.frame_set(f)
            for k, L in a.ik.items():
                if L['con'].influence < 0.9: continue
                pb = a.rig.pose.bones[L['end']]
                d = ((a.rig.matrix_world @ pb.head) - L['tgt'].matrix_world.translation).length
                if d > worst.get(k, (0, 0))[0]: worst[k] = (d, f)
            for S in ('Left', 'Right'):
                hp = a.rig.matrix_world @ a.rig.pose.bones[S + 'UpLeg'].head; kn = a.rig.matrix_world @ a.rig.pose.bones[S + 'Leg'].head
                an = a.rig.matrix_world @ a.rig.pose.bones[S + 'Foot'].head
                fw = (a.rig.matrix_world.to_3x3() @ a.rig.pose.bones['Hips'].matrix.to_3x3() @ a.hrest.to_3x3().inverted() @ Vector((0, -1, 0)))
                bend = (kn - (hp + an) / 2).dot(fw)
                if bend < worst.get('knee' + S, (1, 0))[0]: worst['knee' + S] = (bend, f)
        log('QA', a.name, {k: (round(v[0], 3), v[1]) for k, v in worst.items()})


SIDES = (('L', 'Left', 1), ('R', 'Right', -1))     # השמאל של הדמות ב-‎+X (היא מסתכלת ל--Y)


class Actor:
    def __init__(self, name, rig, meshes):
        self.name, self.rig, self.meshes = name, rig, meshes
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'; pb.matrix_basis = Matrix.Identity(4)
        upd()
        B = rig.data.bones
        self.bones = [b.name for b in B]
        self.h0 = B['Hips'].head_local.copy()
        self.hrest = B['Hips'].matrix_local.copy()
        self.ankle = {s: B[f'{S}Foot'].head_local.copy() for s, S, _ in SIDES}
        self.foot_rot = {s: B[f'{S}Foot'].matrix_local.to_3x3().copy() for s, S, _ in SIDES}
        shoes = [o for o in meshes if 'shoe' in o.name.lower()] or meshes
        self.sole = min((o.matrix_world @ v.co).z for o in shoes for v in o.data.vertices)
        self.ik = {}; self.poses = {}; self.parent = None; self.clip = None
        ACTORS.append(self)
        log(name, 'h0', tuple(round(v, 3) for v in self.h0), 'sole', round(self.sole, 3), 'bones', self.bones)

    # --- תנוחות FK
    def reset(self):
        for pb in self.rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
        upd()

    def grab(self):
        return {pb.name: pb.matrix_basis.to_quaternion() for pb in self.rig.pose.bones}

    def build_poses(self):
        r = self.rig
        self.reset()
        for s, S, sg in SIDES:
            aim(r, f'{S}Arm', (sg * 0.2, 0.03, -1)); aim(r, f'{S}ForeArm', (sg * 0.08, -0.12, -1)); aim(r, f'{S}Hand', (sg * 0.04, -0.1, -1))
        self.poses['arms'] = self.grab(); self.reset()
        for n in ('LowerBack', 'Spine', 'Spine1'): rotw(r, n, (1, 0, 0), math.radians(12))
        self.poses['bend'] = self.grab(); self.reset()
        for n in ('Neck', 'Neck1', 'Head'): rotw(r, n, (1, 0, 0), math.radians(8))
        self.poses['nod'] = self.grab(); self.reset()
        for n in ('LowerBack', 'Spine', 'Spine1'): rotw(r, n, (0, 0, 1), math.radians(8))
        self.poses['twist'] = self.grab(); self.reset()
        for s, S, sg in SIDES:
            rotw(r, f'{S}Shoulder', (0, 1, 0), -sg * math.radians(14))
        self.poses['clav_up'] = self.grab(); self.reset()
        # אגרוף: האצבעות מתקפלות לכיוון כף היד. הכיוון נבדק בניסוי (הקצה צריך להתקרב לצד כף היד)
        self.palm = {}
        for s, S, sg in SIDES:
            hb = r.data.bones[f'{S}Hand']; Mh = hb.matrix_local.to_3x3()
            inward = Vector((-sg, 0, 0))
            cands = [(ax, sgn) for ax in (0, 2) for sgn in (1, -1)]
            ax, sgn = max(cands, key=lambda c: (Mh.col[c[0]] * c[1]).dot(inward))
            self.palm[s] = (ax, sgn)
        for s, S, sg in SIDES:
            ax, sgn = self.palm[s]
            for n, ang in ((f'{S}FingerBase', 55), (f'{S}HandIndex1', 70), (f'L{"" if s == "L" else ""}Thumb' if s == 'L' else 'RThumb', 35)):
                pb = r.pose.bones.get(n)
                if pb is None: continue
                Ml = r.data.bones[n].matrix_local.to_3x3(); palm_dir = r.data.bones[f'{S}Hand'].matrix_local.to_3x3().col[ax] * sgn
                best = None
                for sign in (1, -1):
                    pb.matrix_basis = Matrix.Identity(4); upd(); t0 = pb.tail.copy()
                    pb.matrix_basis = Matrix.Rotation(sign * math.radians(ang), 4, 'X'); upd()
                    gain = (pb.tail - t0).dot(palm_dir)
                    if best is None or gain > best[0]: best = (gain, sign)
                pb.matrix_basis = Matrix.Rotation(best[1] * math.radians(ang), 4, 'X'); upd()
        self.poses['fist'] = self.grab(); self.reset()
        log(self.name, 'palm axes', self.palm)

    def mix(self, layers):
        """layers: [(pose_name, weight)] — מכפיל סיבובים חלקיים (שכבות על עצמות שונות)"""
        out = {}
        I = Quaternion()
        for name, w in layers:
            if w <= 1e-4: continue
            for n, q in self.poses[name].items():
                qq = I.slerp(q, min(1.0, w)) if w <= 1 else q
                out[n] = out.get(n, Quaternion()) @ qq
        return out

    # --- IK
    def attach(self, parent):
        self.parent = parent
        self.rig.parent = parent; self.rig.matrix_parent_inverse = Matrix.Identity(4)
        self.rig.location = (0, 0, 0); self.rig.rotation_euler = (0, 0, 0)

    def setup_ik(self):
        r = self.rig; P = self.parent
        for s, S, sg in SIDES:
            for limb, bone, end, chain_bend, pole_off in (('foot', f'{S}Leg', f'{S}Foot', ('Leg', 30), (sg * 0.1, -0.7, 0.5)),
                                                         ('hand', f'{S}ForeArm', f'{S}Hand', ('ForeArm', -40), (sg * 0.5, 0.4, 0.9))):
                tg = empty(f'{self.name}_{limb}{s}', parent=P, size=0.06)
                pole = empty(f'{self.name}_{limb}{s}_pole', parent=P, size=0.04)
                c = r.pose.bones[bone].constraints.new('IK'); c.target = tg; c.pole_target = pole; c.chain_count = 2
                cr = r.pose.bones[end].constraints.new('COPY_ROTATION'); cr.target = tg
                cr.target_space = 'WORLD'; cr.owner_space = 'WORLD'
                self.ik[limb + s] = dict(con=c, tgt=tg, pole=pole, rcon=cr, bone=bone, end=end)
        look = empty(f'{self.name}_look', parent=P, size=0.05)
        hb = r.data.bones['Head']; Mh = hb.matrix_local.to_3x3()
        fwd = Vector((0, -1, 0))
        opts = {'TRACK_X': Mh.col[0], 'TRACK_NEGATIVE_X': -Mh.col[0], 'TRACK_Z': Mh.col[2], 'TRACK_NEGATIVE_Z': -Mh.col[2]}
        ax = max(opts, key=lambda k: opts[k].dot(fwd))
        dt = r.pose.bones['Head'].constraints.new('DAMPED_TRACK'); dt.target = look; dt.track_axis = ax; dt.influence = 0.0
        self.look = dict(tgt=look, con=dt)
        self.calibrate()

    def calibrate(self):
        """זווית הקוטב: מחושבת מהמנוחה. הברך פונה קדימה (‎-Y) והמרפק אחורה (‎+Y); הזווית היא מציר X של העצם
        העליונה אל כיוון הכפיפה, סביב ציר העצם. הסימן נקבע כך שלרגליים יוצא ‎-90 (הערך שעבד ב-anim.py)"""
        B = self.rig.data.bones
        def ang(bn, d):
            M = B[bn].matrix_local.to_3x3(); X, Y = M.col[0].normalized(), M.col[1].normalized()
            d = Vector(d); d = (d - d.dot(Y) * Y).normalized()
            return math.degrees(math.atan2(X.cross(d).dot(Y), X.dot(d)))
        phi = {}
        for s, S, sg in SIDES:
            phi['foot' + s] = ang(f'{S}UpLeg', (0, -1, 0)); phi['hand' + s] = ang(f'{S}Arm', (0, 1, 0))
        sgn = -1 if phi['footL'] > 0 else 1
        for k, L in self.ik.items():
            L['con'].pole_angle = math.radians(sgn * phi[k]); L['con'].influence = 0.0
        log(self.name, 'pole angles', {k: round(sgn * v, 1) for k, v in phi.items()})

    def hand_rot(self, s, fingers, palm):
        """כיוון כף היד: fingers — לאן האצבעות, palm — לאן פונה כף היד (במערכת ההורה)"""
        f = Vector(fingers).normalized(); n = Vector(palm); n = (n - n.dot(f) * f).normalized()
        ax, sgn = self.palm[s]
        if ax == 2:
            Z = n * sgn; X = f.cross(Z)
        else:
            X = n * sgn; Z = X.cross(f)
        return Matrix((X, f, Z)).transposed()

    def foot_rot_at(self, s, yaw):
        return Matrix.Rotation(yaw, 3, 'Z') @ self.foot_rot[s]

    def placement(self, p, psi):
        """מטריצה מהמערכת הקנונית (עומד בראשית, מסתכל ל--Y) למערכת ההורה; p.z = גובה הרצפה"""
        return Matrix.Translation(Vector(p) + Vector((0, 0, -self.sole))) @ Matrix.Rotation(psi, 4, 'Z')

    def stand_ankle(self, s, p, psi, dx=0.0, dy=0.0):
        a = self.ankle[s].copy(); a.x += (1 if s == 'L' else -1) * dx; a.y += dy
        return self.placement(p, psi) @ a

    def key(self, f, hipsM, quats, limbs=None, look=None, look_w=0.0):
        """hipsM: מטריצת עצם האגן במערכת ההורה. quats: סיבובי FK. limbs: {'footL': dict(w, pos, rot, pole, rw)}"""
        r = self.rig
        for pb in r.pose.bones:
            if pb.name == 'Hips': continue
            pb.rotation_quaternion = quats.get(pb.name, Quaternion()); pb.keyframe_insert('rotation_quaternion', frame=f)
        pb = r.pose.bones['Hips']
        basis = self.hrest.inverted() @ hipsM
        loc, rot, _ = basis.decompose()
        pb.location = loc; pb.rotation_quaternion = rot
        pb.keyframe_insert('location', frame=f); pb.keyframe_insert('rotation_quaternion', frame=f)
        for k, L in self.ik.items():
            st = (limbs or {}).get(k)
            w = st['w'] if st else 0.0
            L['con'].influence = w; L['con'].keyframe_insert('influence', frame=f)
            L['rcon'].influence = (st.get('rw', w) if st else 0.0); L['rcon'].keyframe_insert('influence', frame=f)
            if st:
                L['tgt'].location = st['pos']; L['tgt'].keyframe_insert('location', frame=f)
                if st.get('rot') is not None:
                    L['tgt'].rotation_quaternion = st['rot'].to_quaternion(); L['tgt'].keyframe_insert('rotation_quaternion', frame=f)
                if st.get('pole') is not None:
                    L['pole'].location = st['pole']; L['pole'].keyframe_insert('location', frame=f)
        self.look['con'].influence = look_w; self.look['con'].keyframe_insert('influence', frame=f)
        if look is not None:
            self.look['tgt'].location = look; self.look['tgt'].keyframe_insert('location', frame=f)

    def hips_canon(self, off=(0, 0, 0), bend=0.0, roll=0.0, yaw=0.0):
        """מטריצת האגן במערכת הקנונית: הזזה מהמנוחה, כפיפה קדימה (bend>0 = הגו קדימה), הטיה הצידה"""
        R = Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(bend, 4, 'X') @ Matrix.Rotation(roll, 4, 'Y')
        return Matrix.Translation(self.h0 + Vector(off)) @ R @ Matrix.Translation(-self.h0) @ self.hrest

    def bone_world(self, n, tail=0.0):
        pb = self.rig.pose.bones[n]
        return self.rig.matrix_world @ (pb.head.lerp(pb.tail, tail))


# ---------------------------------------------------------------- הליכה מתנועה מצולמת (מ-anim.py)
def walk_clip(actor, bvh, maxf=90):
    """מריץ את העברת התנועה של anim.py על השלד, ושומר כל פריים כתנוחה קנונית: הולך ל--Y מהראשית, רצפה ב-0"""
    rig = actor.rig; src_before = set(bpy.data.objects)
    SC.render.fps = FPS
    keep = (SC.frame_start, SC.frame_end)
    bpy.ops.import_anim.bvh(filepath=bvh, axis_forward='-Z', axis_up='Y', use_fps_scale=True, rotate_mode='NATIVE')
    src = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o not in src_before)
    act = src.animation_data.action
    f0, f1 = (int(x) for x in act.frame_range); f1 = min(f1, f0 + maxf)
    SC.frame_start, SC.frame_end = f0, f1
    names = [b.name for b in rig.data.bones if b.name in src.data.bones and not any(x in b.name for x in ('Finger', 'Thumb', 'HandIndex'))]

    def wrot(ob, M): return (ob.matrix_world.to_3x3() @ M.to_3x3()).normalized()
    for pb in rig.pose.bones: pb.matrix_basis.identity()
    upd()
    ALIGN = ('UpLeg', 'Leg', 'Arm', 'ForeArm', 'Shoulder')
    for n in [b.name for b in rig.data.bones if b.name in names and any(b.name.endswith(a) for a in ALIGN) and 'Hand' not in b.name]:
        sb = src.data.bones[n]
        t_dir = (src.matrix_world @ sb.tail_local) - (src.matrix_world @ sb.head_local)
        pb = rig.pose.bones[n]; c_dir = (rig.matrix_world @ pb.tail) - (rig.matrix_world @ pb.head)
        if t_dir.length < 1e-6 or c_dir.length < 1e-6: continue
        q = c_dir.normalized().rotation_difference(t_dir.normalized())
        Rw = q.to_matrix() @ (rig.matrix_world.to_3x3() @ pb.matrix.to_3x3())
        M = (rig.matrix_world.to_3x3().inverted() @ Rw).to_4x4(); M.translation = pb.matrix.translation
        pb.matrix = M; upd()
    off = {n: wrot(src, src.data.bones[n].matrix_local).inverted() @ wrot(rig, rig.pose.bones[n].matrix) for n in names}
    hips = 'Hips'
    SC.frame_set(f0); upd()
    h_src = (src.matrix_world @ src.pose.bones[hips].head).z
    h_dst = (rig.matrix_world @ rig.data.bones[hips].head_local).z
    k = h_dst / h_src if h_src else 1.0
    order = [b.name for b in rig.data.bones if b.name in off]
    p0_src = src.matrix_world @ src.pose.bones[hips].head
    p0_dst = rig.matrix_world @ rig.pose.bones[hips].head
    SC.frame_set(f1); fwd = (src.matrix_world @ src.pose.bones[hips].head) - p0_src; fwd.z = 0
    fwd = fwd.normalized() if fwd.length > 1e-3 else Vector((0, -1, 0)); SC.frame_set(f0)
    ANG = math.radians(8); ABD = {}
    for side, sg in (('Left', 1), ('Right', -1)):
        root = rig.data.bones[side + 'Arm']
        for b in [root] + list(root.children_recursive):
            if b.name in names: ABD[b.name] = Matrix.Rotation(sg * ANG, 3, fwd)
    for f in range(f0, f1 + 1):
        SC.frame_set(f)
        for n in order:
            pb = rig.pose.bones[n]
            R = (src.matrix_world.to_3x3() @ src.pose.bones[n].matrix.to_3x3()).normalized() @ off[n]
            if n in ABD: R = ABD[n] @ R
            M = (rig.matrix_world.to_3x3().inverted() @ R).to_4x4(); M.translation = pb.matrix.translation
            if n == hips:
                d = (src.matrix_world @ src.pose.bones[hips].head) - p0_src
                M.translation = rig.matrix_world.inverted() @ (p0_dst + d * k)
            pb.matrix = M; upd()
            pb.keyframe_insert('rotation_quaternion', frame=f)
            if n == hips: pb.keyframe_insert('location', frame=f)

    def low_pts():
        pts = []
        for n in ('LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'):
            if n in rig.pose.bones:
                pb = rig.pose.bones[n]; pts += [(rig.matrix_world @ pb.head).z, (rig.matrix_world @ pb.tail).z]
        return min(pts)
    mins = []
    for f in range(f0, f1 + 1):
        SC.frame_set(f); mins.append(low_pts())
    rig.location.z -= sorted(mins)[len(mins) // 5]; upd()
    FEET = [n for s_ in ('Left', 'Right') for n in (s_ + 'Foot', s_ + 'ToeBase') if n in rig.pose.bones]
    footR = {}
    for f in range(f0, f1 + 1):
        SC.frame_set(f); footR[f] = {n: (rig.matrix_world.to_3x3() @ rig.pose.bones[n].matrix.to_3x3()).copy() for n in FEET}
    tmp = []
    for side in ('Left', 'Right'):
        leg, foot, up_n = side + 'Leg', side + 'Foot', side + 'UpLeg'
        tg = bpy.data.objects.new('wik_' + side, None); SC.collection.objects.link(tg)
        pole = bpy.data.objects.new('wpole_' + side, None); SC.collection.objects.link(pole); tmp += [tg, pole]
        Ws, Wd = src.matrix_world, rig.matrix_world
        for f in range(f0, f1 + 1):
            SC.frame_set(f)
            hs = Ws @ src.pose.bones[hips].head; hd = Wd @ rig.pose.bones[hips].head
            ank = hd + ((Ws @ src.pose.bones[foot].head) - hs) * k
            kn = hd + ((Ws @ src.pose.bones[leg].head) - hs) * k
            hip = hd + ((Ws @ src.pose.bones[up_n].head) - hs) * k
            bend = kn - (hip + ank) / 2
            if bend.length < 0.02: bend = fwd.copy()
            tg.location = ank; tg.keyframe_insert('location', frame=f)
            pole.location = kn + bend.normalized() * 0.5; pole.keyframe_insert('location', frame=f)
        c = rig.pose.bones[leg].constraints.new('IK'); c.target = tg; c.pole_target = pole; c.chain_count = 2
        c.pole_angle = math.radians(-90); c.name = 'walkIK'
    # שאר האילוצים (של המערכת שלנו) כבויים בזמן האפייה
    saved = []
    for pb in rig.pose.bones:
        for c in pb.constraints:
            if c.name != 'walkIK': saved.append((c, c.influence)); c.influence = 0.0
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.selected_objects: o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=True, visual_keying=True, clear_constraints=False, use_current_action=True, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        for c in list(pb.constraints):
            if c.name == 'walkIK': pb.constraints.remove(c)
    W3i = rig.matrix_world.to_3x3().inverted()
    for f in range(f0, f1 + 1):
        SC.frame_set(f)
        for n in FEET:
            pb = rig.pose.bones[n]
            M = (W3i @ footR[f][n]).to_4x4(); M.translation = pb.matrix.translation
            pb.matrix = M; upd(); pb.keyframe_insert('rotation_quaternion', frame=f)
    PMIN = -32.0; wdir = math.atan2(fwd.y, fwd.x)
    for f in range(f0, f1 + 1):
        SC.frame_set(f)
        for s_ in ('Left', 'Right'):
            pb = rig.pose.bones[s_ + 'Foot']; Wm = rig.matrix_world
            v = (Wm @ pb.tail) - (Wm @ pb.head); hz = (v.x ** 2 + v.y ** 2) ** .5
            ang = math.degrees(math.atan2(v.z, hz))
            if ang < PMIN and hz > 1e-6:
                ax = v.cross(Vector((0, 0, 1))).normalized()
                Rw = Matrix.Rotation(math.radians(PMIN - ang), 3, ax) @ (Wm.to_3x3() @ pb.matrix.to_3x3())
                M = (Wm.to_3x3().inverted() @ Rw).to_4x4(); M.translation = pb.matrix.translation
                pb.matrix = M; upd(); pb.keyframe_insert('rotation_quaternion', frame=f)
            v = (Wm @ pb.tail) - (Wm @ pb.head)
            if (v.x ** 2 + v.y ** 2) < 1e-8: continue
            d = math.degrees(math.atan2(v.y, v.x) - wdir); d = (d + 180) % 360 - 180; lim = max(-12, min(12, d))
            if abs(d - lim) > 0.5:
                Rw = Matrix.Rotation(math.radians(lim - d), 3, 'Z') @ (Wm.to_3x3() @ pb.matrix.to_3x3())
                M = (Wm.to_3x3().inverted() @ Rw).to_4x4(); M.translation = pb.matrix.translation
                pb.matrix = M; upd(); pb.keyframe_insert('rotation_quaternion', frame=f)
    shoes = [o for o in actor.meshes if 'shoe' in o.name.lower()]
    if shoes:
        lows = []
        for f in range(f0, f1 + 1, 2):
            SC.frame_set(f); dg = bpy.context.evaluated_depsgraph_get(); z = 1e9
            for o in shoes:
                e = o.evaluated_get(dg); me = e.to_mesh(); Mw = e.matrix_world
                z = min(z, min((Mw @ v.co).z for v in me.vertices)); e.to_mesh_clear()
            lows.append(z)
        lows.sort(); rig.location.z -= lows[len(lows) // 10]; upd()
    # שמירת הפריימים כתנוחות קנוניות
    frames = []
    for f in range(f0 + 5, f1 + 1):
        SC.frame_set(f)
        q = {pb.name: pb.rotation_quaternion.copy() for pb in rig.pose.bones if pb.name != 'Hips'}
        Mh = Matrix.Translation(rig.location) @ rig.pose.bones['Hips'].matrix
        frames.append((Mh.copy(), q))
    p0 = frames[0][0].translation.copy(); p1 = frames[-1][0].translation.copy()
    d = (p1 - p0); d.z = 0
    ang = math.atan2(-d.x, -d.y)          # מסובב כך שההליכה תהיה בדיוק ל--Y
    Rc = Matrix.Rotation(ang, 4, 'Z') @ Matrix.Translation(Vector((-p0.x, -p0.y, 0)))
    clip = [(Rc @ Mh, q) for Mh, q in frames]
    actor.clip = clip
    actor.clip_speed = d.length / max(1, len(frames) - 1)
    log('walk clip', len(clip), 'frames', 'dist', round(d.length, 2), 'speed m/frame', round(actor.clip_speed, 4), 'k', round(k, 4))
    # ניקוי
    for c, inf in saved: c.influence = inf
    rig.animation_data_clear(); rig.location = (0, 0, 0)
    for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    for o in tmp + [src]: bpy.data.objects.remove(o)
    SC.frame_start, SC.frame_end = keep
    upd()


# ---------------------------------------------------------------- רינדור
def render_setup(res=(960, 540), samples=24, blur=False):
    SC.render.engine = 'CYCLES'; SC.cycles.device = 'CPU'
    SC.cycles.samples = samples; SC.cycles.use_denoising = True
    SC.cycles.max_bounces = 6; SC.cycles.transparent_max_bounces = 32; SC.cycles.diffuse_bounces = 3; SC.cycles.glossy_bounces = 3
    SC.render.resolution_x, SC.render.resolution_y = res; SC.render.resolution_percentage = 100
    SC.render.use_persistent_data = True
    SC.render.use_motion_blur = blur; SC.render.motion_blur_shutter = 0.5
    SC.render.fps = FPS
    try:
        SC.view_settings.view_transform = 'AgX'; SC.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    SC.render.image_settings.file_format = 'PNG'; SC.render.image_settings.color_mode = 'RGB'
    SC.render.image_settings.compression = 100


def render_frames(shot, frames, cam_for):
    out = os.path.abspath(f'out/{shot}'); os.makedirs(out, exist_ok=True)
    import time
    for f in frames:
        t = time.time()
        SC.frame_set(f); SC.camera = cam_for(f)
        SC.render.filepath = f'{out}/f_{f:04d}.png'; bpy.ops.render.render(write_still=True)
        log('RENDER', shot, f, SC.camera.name, round(time.time() - t, 1), 's')
