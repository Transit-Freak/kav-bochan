"""נוסע עולה לאוטובוס בדלת הקדמית ומתקף: הולך על הרציף, עולה מדרגה אל רצפת האוטובוס, ממשיך אל מכשיר התיקוף שליד תא הנהג,
נעצר, מרים את היד עם כרטיס הרב-קו (או הטלפון), מצמיד למשטח ההנחה, והמסך מתחלף למסך "נסיעה טובה" המלא.
- הליכה: תנועה מצולמת CMU — 16_15 (הליכה, בחירת שלמה) שמתחברת ל-16_34 (האטה ועצירה) של אותו שחקן (bvh_splice.py),
  דרך העברת התנועה של anim.py (הקוד שלה רץ כאן כמו שהוא). המדרגה: גובה כפות הרגליים לפי הקרקע שמתחת לכל צעד (IK של anim.py).
- יד: IK אנליטי בשתי עצמות אל משטח ההנחה; הכרטיס/הטלפון צמוד לעצם כף היד.
VARIANT: ok (כרטיס) / phone (טלפון בקרבה, NFC) / qr (סריקת ה-QR "לתיקוף בישומון" שעל מסך המכשיר).
מריצים: blender -b --online-mode out/bus.blend -P tap.py  (אחרי bus.py, screens.py ו-card_tex.py)."""
import bpy, bmesh, os, math, time
import numpy as np
from mathutils import Matrix, Vector, Quaternion

T0 = time.time()
VAR = os.environ.get('VARIANT', 'ok')
PREVIEW = os.environ.get('TAP_PREVIEW', '0') == '1'
SC = bpy.context.scene
SC.render.fps = 30                       # לפני ייבוא ה-BVH: 120 פריימים בשנייה → 30
os.environ.setdefault('FRAMES', '2000')  # כל ההקלטה
os.environ.setdefault('ARM_OUT', '4')
for o in bpy.context.selected_objects: o.select_set(False)
def upd(): bpy.context.view_layer.update()
def smooth(a, b, x):
    if b == a: return 1.0 if x >= b else 0.0
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
OB = bpy.data.objects

# ---------- הסצנה: רציף מוגבה, דלת קדמית פתוחה, מכשיר התיקוף הקדמי עובר לצד תא הנהג ופונה אל הדלת
floor_ob = OB['SM_FloorIn']
FLOOR = max((floor_ob.matrix_world @ Vector(c)).z for c in floor_ob.bound_box)        # 0.675
STEP = float(os.environ.get('STEP_H', '0.18'))                                          # מדרגה אחת מהרציף אל האוטובוס
SINK = float(os.environ.get('SINK_FIX', '0.02'))      # בסוף ההקלטה הקרסול נמוך ב-2 ס"מ מבהליכה: מפצים בתוך האוטובוס
PLAT = FLOOR - STEP
EDGE = min((floor_ob.matrix_world @ Vector(c)).x for c in floor_ob.bound_box)          # קצה הרצפה בצד הדלתות (-1.215)
sw = OB['ENV_Sidewalk']; sw.scale.z = PLAT / 0.15; sw.location.z = PLAT / 2; sw.location.x = -1.30 - 2.5
OB['ENV_Curb'].hide_render = True
for nm in ('SM_DoorFront0', 'SM_DoorFrFront0', 'SM_DoorRailFront0', 'SM_DoorFront1', 'SM_DoorFrFront1', 'SM_DoorRailFront1'):
    if nm in OB: OB[nm].hide_render = True                             # הדלת הקדמית פתוחה לגמרי (הכנפיים מקופלות)
FD1 = -4.55                                                            # הקצה האחורי של פתח הדלת הקדמית
wl = OB.get('SM_WallLow-1')                                            # הקיר הנמוך הפנימי עבר גם על פני הדלת: מתחיל אחריה
if wl:
    for v in wl.data.vertices:
        if wl.location.y + v.co.y < FD1 + 0.02: v.co.y = FD1 + 0.02 - wl.location.y
for nm in ('SM_TicketMachine', 'SM_TicketScr'):                       # מכונת הכרטוס של הנהג נכנסת לתא הנהג (מאחורי המחיצה)
    if nm in OB: OB[nm].location.x += 0.25
VAL_NAMES = [n for n in ('SM_ValF', 'SM_ValScrF', 'SM_ValNFCF', 'SM_ValLedF-1', 'SM_ValLedF1', 'SM_ValClampF') if n in OB]
piv = OB['SM_ValF'].location.copy()
NEWC = Vector((float(os.environ.get('VAL_X', '0.26')), float(os.environ.get('VAL_Y', '-4.56')), piv.z + float(os.environ.get('VAL_DZ', '0.10'))))
Rz = Matrix.Rotation(-math.pi / 2, 3, 'Z')                             # פונה ל--X (אל הדלת)
for n in VAL_NAMES:
    o = OB[n]; o.location = NEWC + Rz @ (o.location - piv); o.rotation_euler.z -= math.pi / 2
cl = OB.get('SM_ValClampF')
post_me = bpy.data.meshes.new('ValPost'); bm_ = bmesh.new(); bmesh.ops.create_cube(bm_, size=1.0); bm_.to_mesh(post_me); bm_.free()
post = OB.new('SM_ValPostTap', post_me); SC.collection.objects.link(post)
ptop = NEWC.z - 0.18; post.scale = (0.045, 0.045, ptop - FLOOR); post.location = (NEWC.x + 0.015, NEWC.y, (ptop + FLOOR) / 2)
post.data.materials.append(OB['SM_ValF'].data.materials[0])
upd()
pad_ob = OB['SM_ValNFCF']; scr_ob = OB['SM_ValScrF']
PAD = pad_ob.matrix_world.translation.copy(); SCR = scr_ob.matrix_world.translation.copy()
NPAD = Vector((-1, 0, 0)); FWD = Vector((1, 0, 0)); LEFT = Vector((0, 1, 0))
STAND = Vector((PAD.x - float(os.environ.get('HIPS_GAP', '0.15')), PAD.y - float(os.environ.get('LATERAL', '0.37')), PLAT))
print('TAP scene: floor', round(FLOOR, 3), 'platform', round(PLAT, 3), 'edge x', round(EDGE, 3), 'pad', tuple(round(v, 3) for v in PAD),
      'screen', tuple(round(v, 3) for v in SCR), 'stand', tuple(round(v, 3) for v in STAND))

# ---------- הקרקע מתחת לכל צעד: רציף (0) או רצפת האוטובוס (STEP). מחושב פעם אחת מתוך ההקלטה, במערכת של anim.py
TER = {}
def _terrain_init():
    g = NS; src, hips, k, f0, f1 = g['src'], g['hips'], g['k'], g['f0'], g['f1']
    p0s, p0d = g['p0_src'], g['p0_dst']; fwd = g['fwd'].normalized()
    cur = SC.frame_current; Ws = src.matrix_world
    def dst(v): return p0d + (v - p0s) * k
    SC.frame_set(f1); p_end = dst(Ws @ src.pose.bones[hips].head)
    th = -math.atan2(fwd.y, fwd.x); R = Matrix.Rotation(th, 3, 'Z')
    wx = lambda p: (R @ (p - p_end)).x                                  # מיקום בכיוון ההליכה, יחסית לנקודת העצירה
    feet = {}
    for side in ('Left', 'Right'):
        A, T = [], []
        for f in range(f0, f1 + 1):
            SC.frame_set(f)
            A.append(dst(Ws @ src.pose.bones[side + 'Foot'].head))
            tb = src.pose.bones.get(side + 'ToeBase'); T.append(dst(Ws @ (tb.tail if tb else src.pose.bones[side + 'Foot'].tail)))
        zmin = min(a.z for a in A)
        st = [((A[i + 1] - A[i - 1]).xy.length / 2 < 0.012 and A[i].z < zmin + 0.06) if 0 < i < len(A) - 1 else A[i].z < zmin + 0.06 for i in range(len(A))]
        segs, i = [], 0
        while i < len(st):
            if st[i]:
                j = i
                while j + 1 < len(st) and st[j + 1]: j += 1
                if j - i >= 2: segs.append([i, j, min(wx(A[q]) for q in range(i, j + 1)) - 0.07, max(wx(T[q]) for q in range(i, j + 1)) + 0.02])
                i = j + 1
            else: i += 1
        feet[side] = (segs, A)
    SC.frame_set(cur)
    # הזזה קטנה של נקודת העצירה כך שאף צעד לא ייפול על שפת המדרגה
    best = None
    for dd in [x * 0.005 for x in range(-4, 9)]:      # לא קדימה מדי: לפני הנוסע מכונת הכרטוס של הנהג
        e0 = EDGE - (STAND.x + dd)
        clr = min(max(s[2] - (e0 + 0.015), (e0 - 0.01) - s[3]) for side in feet for s in feet[side][0])
        if best is None or clr > best[0]: best = (clr, dd)
    TER['delta'] = best[1]; e0 = EDGE - (STAND.x + best[1])
    n = f1 - f0 + 1; H = {}
    for side, (segs, A) in feet.items():
        for s in segs: s.append(STEP + SINK if s[2] > e0 else 0.0)
        h = [0.0] * n
        for q in range(n):
            prev = [s for s in segs if s[0] <= q]; nxt = [s for s in segs if s[0] > q]
            inside = [s for s in segs if s[0] <= q <= s[1]]
            if inside: h[q] = inside[0][4]; continue
            if not prev: h[q] = nxt[0][4] if nxt else 0.0; continue
            if not nxt: h[q] = prev[-1][4]; continue
            a, b = prev[-1], nxt[0]; t = (q - a[1]) / max(1, b[0] - a[1])
            h[q] = a[4] + (b[4] - a[4]) * smooth(0, 0.55, t) + (0.05 * math.sin(math.pi * t) if b[4] != a[4] else 0.0)
        H[side] = h
    hh = [min(H['Left'][q], H['Right'][q]) + 0.3 * abs(H['Left'][q] - H['Right'][q]) for q in range(n)]
    TER['hips'] = [sum(hh[max(0, q - 5):q + 6]) / len(hh[max(0, q - 5):q + 6]) for q in range(n)]
    TER['foot'] = H; TER['f0'] = f0
    TER['segs'] = {s: [(a, b, round(c, 2), round(d, 2), e) for a, b, c, d, e in feet[s][0]] for s in feet}
    print('TAP terrain: stand shift', round(best[1], 3), 'min clearance to edge', round(best[0], 3), 'edge (walk coords)', round(e0, 3))
    print('TAP stance segments (frame0, frame1, heel, toe, height)', TER['segs'])
def TERR_HIPS(f):
    if not TER: _terrain_init()
    q = max(0, min(len(TER['hips']) - 1, f - TER['f0'])); return TER['hips'][q]
def TERR_FOOT(side, f):
    if not TER: _terrain_init()
    h = TER['foot'][side]; q = max(0, min(len(h) - 1, f - TER['f0'])); return h[q]

# ---------- ההליכה: הקוד של anim.py עד שמירת הקובץ, עם שתי תוספות: גובה האגן וגובה כפות הרגליים לפי הקרקע
src_code = open(os.path.join(os.getcwd(), 'anim.py')).read()
src_code = src_code[:src_code.index('src.hide_render = True')]
for a, b in (('for o in list(bpy.data.objects): bpy.data.objects.remove(o)\n', ''),
             ('M.translation = rig.matrix_world.inverted() @ (p0_dst + d * k)', 'M.translation = rig.matrix_world.inverted() @ (p0_dst + d * k + Vector((0, 0, TERR_HIPS(f))))'),
             ("tg.location = ank; tg.keyframe_insert('location', frame=f)",
              "ank = ank + Vector((0, 0, TERR_FOOT(side, f) - TERR_HIPS(f))); kn = kn + Vector((0, 0, 0.5 * (TERR_FOOT(side, f) - TERR_HIPS(f))))\n        tg.location = ank; tg.keyframe_insert('location', frame=f)")):
    assert a in src_code, a
    src_code = src_code.replace(a, b, 1)
NS = {'__name__': 'anim_walk', 'TERR_HIPS': TERR_HIPS, 'TERR_FOOT': TERR_FOOT}
exec(compile(src_code, 'anim.py', 'exec'), NS)
rig, src, hips, f0, f1, fwd = NS['rig'], NS['src'], NS['hips'], NS['f0'], NS['f1'], NS['fwd']
src.hide_render = True; src.hide_viewport = True
for o in OB:
    if o.type == 'EMPTY' and o.name.startswith(('ik_', 'pole_')): o.hide_render = True
print('TAP walk done', f0, f1, 'fwd', tuple(round(v, 2) for v in fwd), round(time.time() - T0), 's')

def W(): return rig.matrix_world
def bone_w(n): return W() @ rig.pose.bones[n].matrix
def head_w(n): return W() @ rig.pose.bones[n].head
def set_world_rot(n, R3):
    pb = rig.pose.bones[n]
    M = (W().to_3x3().inverted() @ R3).to_4x4(); M.translation = pb.matrix.translation
    pb.matrix = M; upd()

# ---------- מיקום: כיוון ההליכה → +X, נקודת העצירה → STAND (+ההזזה שנבחרה), הרציף בגובה PLAT (anim.py שם את הסוליה ב-0)
SC.frame_set(f1); upd()
p_end = head_w(hips)
th = -math.atan2(fwd.y, fwd.x)
STAND.x += TER.get('delta', 0.0)
Tm = Matrix.Translation(Vector((STAND.x, STAND.y, PLAT))) @ Matrix.Rotation(th, 4, 'Z') @ Matrix.Translation(Vector((-p_end.x, -p_end.y, 0)))
rig.matrix_world = Tm @ rig.matrix_world; upd()
print('TAP placed: hips at end', tuple(round(v, 2) for v in head_w(hips)))

# ---------- כף היד: כיווני האצבעות, כף היד והאגודל במערכת של העצם (מתנוחת המנוחה)
HB = rig.data.bones['LeftHand']
Mbi = HB.matrix_local.to_3x3().inverted()
Yr = (HB.tail_local - HB.head_local).normalized()
th_b = rig.data.bones.get('LThumb')
tv = (th_b.tail_local - HB.head_local) if th_b else Vector((0, -1, 0))
tp = (tv - Yr * tv.dot(Yr)).normalized()
n_arm = Yr.cross(tp).normalized()                      # יד שמאל: כף היד = אצבעות × אגודל
inward = Vector((-HB.head_local.x, 0, 0)).normalized()
if n_arm.dot(inward) < -0.2 and n_arm.z > -0.2: n_arm = -n_arm
F_L = Vector((0, 1, 0)); N_L = Mbi @ n_arm; N_L = (N_L - F_L * N_L.dot(F_L)).normalized(); T_L = N_L.cross(F_L)
TIP = max([(b.tail_local - HB.head_local).dot(Yr) for b in HB.children_recursive] + [HB.length])
DEVICE = 'phone' if VAR in ('phone', 'qr') else 'card'
tilt = float(os.environ.get('FING_TILT', '0.9'))
if DEVICE == 'card':
    # הכרטיס בצד כף היד, כף היד אל המשטח, האצבעות למעלה ומעט החוצה (שמאלה)
    CF = float(os.environ.get('CARD_F', str(round(TIP + 0.01, 3)))); CN = float(os.environ.get('CARD_N', '0.014'))   # הכרטיס נאחז בקצות האצבעות ובולט מעליהן
    OFF_L = F_L * CF + N_L * CN
    CONTACT_L = OFF_L
    f_w = (LEFT * tilt + Vector((0, 0, 1))).normalized()
else:
    # טלפון: גב הטלפון אל המשטח, המסך אל כף היד; החלק העליון בולט מעל האצבעות ומסכו פונה אל הנוסע
    PL, PW, PT = 0.147, 0.0715, 0.0085
    CN = float(os.environ.get('PHONE_N', '0.03')); PF = float(os.environ.get('PHONE_F', str(round(0.85 * TIP, 3))))
    OFF_L = F_L * PF + N_L * (CN + PT / 2)
    CONTACT_L = F_L * (PF + 0.03) + N_L * (CN + PT)
    f_w = (LEFT * tilt * 0.5 + Vector((0, 0, 1))).normalized()
DEV_ROT_L = Matrix((T_L, F_L, -N_L)).transposed()                        # X לרוחב כף היד, Y לאורך האצבעות, Z אל כף היד
n_w = -NPAD; t_w = n_w.cross(f_w)
RH = Matrix((f_w, n_w, t_w)).transposed() @ Matrix((F_L, N_L, T_L))      # סיבוב העולם של עצם היד בהנחה
CARD_AT = PAD + NPAD * 0.009 + Vector((0, 0, -0.008))
if VAR == 'qr':
    # ה-QR "לתיקוף בישומון" בפינה העליונה של מסך המכשיר; מצלמת הטלפון (בגב, ליד הקצה העליון) 11 ס"מ מולו
    RIGHT = -LEFT
    QR = SCR + RIGHT * ((0.28 - 0.5) * 0.15) + Vector((0, 0, (0.646 - 0.5) * 0.2))
    CONTACT_L = F_L * (PF + 0.06) + N_L * (CN + PT)
    CARD_AT = QR + NPAD * float(os.environ.get('QR_DIST', '0.11'))
WR_C = CARD_AT - RH @ CONTACT_L
a_len = rig.data.bones['LeftArm'].length; b_len = rig.data.bones['LeftForeArm'].length
print('TAP', DEVICE, 'shoulder', tuple(round(v, 2) for v in head_w('LeftArm')), 'wrist target', tuple(round(v, 2) for v in WR_C),
      'dist', round((WR_C - head_w('LeftArm')).length, 3), 'arm', round(a_len + b_len, 3))

# ---------- הכרטיס (85.6×54 מ"מ, הדפסה בשני הצדדים) או הטלפון (לוח כהה מעוגל עם מסך), צמוד לעצם כף היד
def tex_node(nt, path):
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.abspath(path)); return t
def slab(name, w, h, t, r, seg=5):
    ring = []
    for cx, cy, a0 in ((w/2 - r, h/2 - r, 0), (-w/2 + r, h/2 - r, 90), (-w/2 + r, -h/2 + r, 180), (w/2 - r, -h/2 + r, 270)):
        for i in range(seg):
            a = math.radians(a0 + i * 90 / (seg - 1)); ring.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    me = bpy.data.meshes.new(name); b = bmesh.new()
    top = [b.verts.new((x, y, t/2)) for x, y in ring]; bot = [b.verts.new((x, y, -t/2)) for x, y in ring]
    ft = b.faces.new(top); fb = b.faces.new(list(reversed(bot)))
    sides = [b.faces.new((bot[i], bot[(i + 1) % len(ring)], top[(i + 1) % len(ring)], top[i])) for i in range(len(ring))]
    uv = b.loops.layers.uv.new()
    for f, mir in ((ft, False), (fb, True)):
        for lp in f.loops:
            u = (lp.vert.co.x + w/2) / w; v = (lp.vert.co.y + h/2) / h
            lp[uv].uv = (1 - u if mir else u, v)
    fb.material_index = 1
    for f in sides:
        f.material_index = 2
        for lp in f.loops: lp[uv].uv = (0.5, 0.5)
    b.to_mesh(me); b.free()
    ob = OB.new(name, me); SC.collection.objects.link(ob); return ob
def pbsdf(m): return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
def mix_node(nt, ta, tb):
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    ia = next(x for x in mx.inputs if x.name == 'A' and x.type == 'RGBA'); ib = next(x for x in mx.inputs if x.name == 'B' and x.type == 'RGBA')
    nt.links.new(ta.outputs['Color'], ia); nt.links.new(tb.outputs['Color'], ib)
    return mx, next(x for x in mx.outputs if x.type == 'RGBA')
PHONE_MIX = None
if DEVICE == 'card':
    card = slab('RavKavCard', 0.0856, 0.054, 0.0009, 0.0035)
    m = bpy.data.materials.new('M_RavKav'); bs = pbsdf(m); tx = tex_node(m.node_tree, 'tex/ravkav_card.png')
    m.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.32
    e = bpy.data.materials.new('M_CardEdge'); pbsdf(e).inputs['Base Color'].default_value = (0.85, 0.87, 0.9, 1)
    for mm_ in (m, m, e): card.data.materials.append(mm_)
else:
    card = slab('Phone', PW, PL, PT, 0.009, seg=7)
    bev = card.modifiers.new('bev', 'BEVEL'); bev.width = 0.0018; bev.segments = 3; bev.limit_method = 'ANGLE'
    m = bpy.data.materials.new('M_PhoneScreen'); nt = m.node_tree; bs = pbsdf(m)
    PHONE_MIX, mo = mix_node(nt, tex_node(nt, 'tex/phone_pay.png'), tex_node(nt, 'tex/phone_ok.png'))
    nt.links.new(mo, bs.inputs['Base Color']); nt.links.new(mo, bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value = 1.6; bs.inputs['Roughness'].default_value = 0.08
    bk = bpy.data.materials.new('M_PhoneBack'); pbsdf(bk).inputs['Base Color'].default_value = (0.03, 0.035, 0.045, 1); pbsdf(bk).inputs['Roughness'].default_value = 0.3
    fr = bpy.data.materials.new('M_PhoneFrame'); pbsdf(fr).inputs['Base Color'].default_value = (0.2, 0.21, 0.23, 1); pbsdf(fr).inputs['Metallic'].default_value = 0.8; pbsdf(fr).inputs['Roughness'].default_value = 0.3
    for mm_ in (m, bk, fr): card.data.materials.append(mm_)
card.parent = rig; card.parent_type = 'BONE'; card.parent_bone = 'LeftHand'
card.matrix_parent_inverse = Matrix.Identity(4)
card.matrix_basis = Matrix.Translation(Vector((0, -HB.length, 0))) @ Matrix.Translation(OFF_L) @ DEV_ROT_L.to_4x4()

# ---------- ציר הזמן (30 פריימים בשנייה)
RA = int(os.environ.get('REACH_START', str(f1 - 9)))       # תחילת ההושטה: בסוף העצירה
C = RA + 20                                                  # הכרטיס על המשטח
HOLD = C + 9
LE, END = HOLD + 22, HOLD + 56
SWITCH = C + 2
print('TAP timeline', dict(f1=f1, RA=RA, C=C, HOLD=HOLD, LE=LE, END=END, SWITCH=SWITCH, var=VAR))

ARM_CHAIN = ('Spine1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand')
base = {}
for f in range(RA - 8, END + 1):
    SC.frame_set(min(f, f1)); upd()
    base[f] = {n: rig.pose.bones[n].matrix_basis.copy() for n in ARM_CHAIN if n in rig.pose.bones}
SC.frame_set(RA); upd(); WR0 = head_w('LeftHand')
SC.frame_set(min(LE, f1)); upd(); WR_LE = head_w('LeftHand')
APP = WR_C + NPAD * 0.075 + Vector((0, 0, -0.02))           # נקודת התקרבות: 7.5 ס"מ מול המשטח
keys = [(RA, WR0), (RA + 13, APP), (C, WR_C), (HOLD, WR_C), (LE, WR_LE)]
def path(f):
    if f <= keys[0][0]: return keys[0][1].copy()
    if f >= keys[-1][0]: return keys[-1][1].copy()
    i = max(j for j in range(len(keys) - 1) if keys[j][0] <= f)
    (t0, p0), (t1, p1) = keys[i], keys[i + 1]
    def tan(j):
        if j == 0 or j == len(keys) - 1: return Vector()
        tp_, pp = keys[j - 1]; tn, pn = keys[j + 1]; pc = keys[j][1]
        if (pn - pc).length < 1e-6 or (pc - pp).length < 1e-6: return Vector()
        return (pn - pp) / (tn - tp_)
    m0, m1 = tan(i) * (t1 - t0), tan(i + 1) * (t1 - t0)
    s = (f - t0) / (t1 - t0); s2, s3 = s * s, s * s * s
    return p0 * (2*s3 - 3*s2 + 1) + m0 * (s3 - 2*s2 + s) + p1 * (-2*s3 + 3*s2) + m1 * (s3 - s2)
w_ik = lambda f: smooth(RA, RA + 6, f) * (1 - smooth(LE - 6, LE, f))
w_hand = lambda f: smooth(RA + 3, C - 2, f) * (1 - smooth(HOLD + 4, LE - 3, f))
w_lean = lambda f: smooth(RA, C, f) * (1 - smooth(HOLD, LE + 4, f))
w_look = lambda f: smooth(RA - 8, RA + 10, f) * (1 - smooth(LE + 2, LE + 20, f))
HINT = (-FWD * 0.4 + LEFT * 0.15 + Vector((0, 0, -1))).normalized()     # המרפק: למטה ומעט אחורה
FACE_L = rig.data.bones['Head'].matrix_local.to_3x3().inverted() @ Vector((0, -1, 0))   # MPFB פונה ל--Y במנוחה

def solve_arm(f):
    S = head_w('LeftArm'); E0 = head_w('LeftForeArm'); W0 = head_w('LeftHand')
    a = (E0 - S).length; b = (W0 - E0).length
    wi = w_ik(f)
    Wt = W0.lerp(path(f), wi)
    d_vec = Wt - S; d = max(abs(a - b) + 1e-3, min(a + b - 1e-3, d_vec.length))
    u = d_vec.normalized(); Wt = S + u * d
    hint = (E0 - S).normalized().lerp(HINT, wi)
    v = (hint - u * hint.dot(u)).normalized()
    x = (a * a - b * b + d * d) / (2 * d); h = math.sqrt(max(0.0, a * a - x * x))
    E = S + u * x + v * h
    set_world_rot('LeftArm', (E0 - S).rotation_difference(E - S).to_matrix() @ bone_w('LeftArm').to_3x3().normalized())
    E1 = head_w('LeftForeArm'); W1 = head_w('LeftHand')
    set_world_rot('LeftForeArm', (W1 - E1).rotation_difference(Wt - E1).to_matrix() @ bone_w('LeftForeArm').to_3x3().normalized())
    return Wt

err_log = []
for f in range(RA - 8, END + 1):
    SC.frame_set(min(f, f1))
    for n, mb in base[f].items(): rig.pose.bones[n].matrix_basis = mb
    upd()
    wl = w_lean(f)                                            # גו: הטיה קלה קדימה ושמאלה אל המכשיר
    if wl > 0:
        set_world_rot('Spine1', Matrix.Rotation(math.radians(6) * wl, 3, 'Z') @ Matrix.Rotation(math.radians(12) * wl, 3, LEFT) @ bone_w('Spine1').to_3x3().normalized())
    wk = w_look(f)                                            # ראש: מבט אל המסך
    if wk > 0:
        Rh_ = bone_w('Head').to_3x3().normalized()
        face = (Rh_ @ FACE_L).normalized(); want_d = (SCR - head_w('Head')).normalized()
        set_world_rot('Head', Quaternion().slerp(face.rotation_difference(want_d), 0.7 * wk).to_matrix() @ Rh_)
    Wt = solve_arm(f)                                         # יד: IK אל המשטח, ואחר כך כיוון כף היד
    wh = w_hand(f)
    if wh > 0:
        Rf = bone_w('LeftForeArm').to_3x3().normalized(); Rcur = bone_w('LeftHand').to_3x3().normalized()
        Rgoal = Rcur.to_quaternion().slerp(RH.to_quaternion(), wh).to_matrix()
        q = (Rf.inverted() @ Rgoal).to_quaternion()
        tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize()
        ang = 2 * math.atan2(tw.y, tw.w); ang = (ang + math.pi) % (2 * math.pi) - math.pi
        set_world_rot('LeftForeArm', Rf @ Matrix.Rotation(0.5 * ang, 3, 'Y'))   # חצי מהסיבוב סביב האמה עובר לאמה
        set_world_rot('LeftHand', Rgoal)
    for n in base[f]: rig.pose.bones[n].keyframe_insert('rotation_quaternion' if rig.pose.bones[n].rotation_mode == 'QUATERNION' else 'rotation_euler', frame=f)
    if f in (RA, RA + 13, C, HOLD, LE):
        cw = W() @ rig.pose.bones['LeftHand'].matrix @ CONTACT_L
        err_log.append((f, round((head_w('LeftHand') - Wt).length, 3), round((cw - CARD_AT).length, 3)))
print('TAP wrist err / contact-to-target (m)', err_log)
SC.frame_set(C); upd()
dg = bpy.context.evaluated_depsgraph_get(); e_ = card.evaluated_get(dg); me_ = e_.to_mesh()
xmax = max((e_.matrix_world @ v.co).x for v in me_.vertices); e_.to_mesh_clear()
print('TAP', DEVICE, 'at contact: gap device-to-pad plane', round(PAD.x - xmax, 4), 'device +Z', tuple(round(v, 2) for v in card.matrix_world.to_3x3() @ Vector((0, 0, 1))))

# ---------- מסך המכשיר: ממסך ההמתנה אל מסך "נסיעה טובה" המלא (בסריקת QR המכשיר לא משתנה — הטלפון מאשר)
def img(p): return bpy.data.images.load(os.path.abspath(p))
sm = bpy.data.materials.new('M_ValScreenTap'); nt = sm.node_tree; bs = pbsdf(sm)
mix, mo = mix_node(nt, tex_node(nt, 'tex/screen_idle.png'), tex_node(nt, 'tex/screen_idle.png' if VAR == 'qr' else 'tex/screen_ok_full.png'))
nt.links.new(mo, bs.inputs['Base Color']); nt.links.new(mo, bs.inputs['Emission Color'])
bs.inputs['Emission Strength'].default_value = 1.2; bs.inputs['Roughness'].default_value = 0.15
fac = mix.inputs['Factor']
fac.default_value = 0.0; fac.keyframe_insert('default_value', frame=SWITCH - 1)
fac.default_value = 1.0; fac.keyframe_insert('default_value', frame=SWITCH)
scr_ob.data.materials.clear(); scr_ob.data.materials.append(sm)
lm = bpy.data.materials.new('M_ValLedTap'); lb = pbsdf(lm); lb.inputs['Emission Strength'].default_value = 6
ec = lb.inputs['Emission Color']; WHT = (1, 0.98, 0.92, 1); GRN = (0.1, 1.0, 0.25, 1)
for fr, col in (((SWITCH - 1, WHT), (SWITCH, GRN), (SWITCH + 40, GRN), (SWITCH + 41, WHT)) if VAR != 'qr' else ((1, WHT),)):
    ec.default_value = col; ec.keyframe_insert('default_value', frame=fr)
for o in OB:
    if o.name.startswith('SM_ValLedF'): o.data.materials.clear(); o.data.materials.append(lm)
if PHONE_MIX is not None:
    PSW = SWITCH + (10 if VAR == 'qr' else 0)
    pf = PHONE_MIX.inputs['Factor']; pf.default_value = 0.0; pf.keyframe_insert('default_value', frame=PSW)
    pf.default_value = 1.0; pf.keyframe_insert('default_value', frame=PSW + 3)

# ---------- בדיקות: חדירות לאוטובוס (תיבות המכשיר, לוח המחוונים, משקופי הדלת, המוטות) ורגליים מתחת לקרקע
def under_rig(o):
    while o.parent is not None:
        if o.parent == rig: return True
        o = o.parent
    return False
body_objs = [o for o in OB if o.type == 'MESH' and under_rig(o) and o is not card] + [card]
obst = [o for o in OB if o.type == 'MESH' and (o.name in VAL_NAMES[:1] + ['SM_ValClampF', 'SM_ValPostTap', 'SM_Dash', 'SM_TicketMachine', 'SM_CabScreen']
        or o.name.startswith(('SM_Seat', 'SM_ArchBox', 'SM_WallLow')))]
def bbox(o):
    ps = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector((min(p.x for p in ps), min(p.y for p in ps), min(p.z for p in ps))), Vector((max(p.x for p in ps), max(p.y for p in ps), max(p.z for p in ps)))
boxes = [(o.name, *bbox(o)) for o in obst]
poles = []
for o in OB:
    if o.type == 'CURVE' and o.name.startswith('SM_Pole') and o.data.splines:
        p = o.matrix_world @ Vector(o.data.splines[0].points[0].co[:3]); poles.append((o.name, p.x, p.y))
DOORY = (-5.75, -4.55)                                       # פתח הדלת הקדמית
hits = {}; lowest = {}
def hit(k_): hits[k_] = hits.get(k_, 0) + 1
for f in sorted(set(list(range(f0 + 2, END + 1, 3)) + [C])):
    SC.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
    for o in body_objs:
        e = o.evaluated_get(dg); me = e.to_mesh(); M = e.matrix_world
        n_ = len(me.vertices); co = np.empty(n_ * 3, dtype=np.float32); me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)[::2] @ np.array(M.to_3x3()).T + np.array(M.translation)
        for x, y, z in co:
            for nm, lo, hi in boxes:
                if lo.x < x < hi.x and lo.y < y < hi.y and lo.z < z < hi.z: hit((f, nm, o.name[-12:]))
            for nm, px, py in poles:
                if z < FLOOR + 1.8 and (x - px) ** 2 + (y - py) ** 2 < 0.021 ** 2: hit((f, nm, o.name[-12:]))
            if -1.33 < x < EDGE and not (DOORY[0] + 0.03 < y < DOORY[1] - 0.03) and z < 2.8: hit((f, 'door jamb', o.name[-12:]))
            gz = FLOOR if x > EDGE else PLAT
            if z < gz - 0.012: hit((f, 'below ground', o.name[-12:]))
            if 'shoe' in o.name.lower(): lowest[f] = min(lowest.get(f, 9), z - gz)
        e.to_mesh_clear()
for kk in sorted(hits): print('TAP hit', kk, hits[kk])
print('TAP shoe sole height above ground per frame (m):', {f: round(v, 3) for f, v in sorted(lowest.items())})
for f in range(f0 + 2, END + 1, 6):
    SC.frame_set(f); print('TAP path', f, 'hips', tuple(round(v, 2) for v in head_w(hips)),
                           'L/R ankle', tuple(round(v, 2) for v in head_w('LeftFoot')), tuple(round(v, 2) for v in head_w('RightFoot')))

# ---------- תאורה, מצלמות (רחבה מהרציף אל הדלת, ותקריב 3/4 מהצד של היד, המשטח והמסך), Cycles
SC.render.engine = 'CYCLES'; SC.cycles.device = 'CPU'
SC.cycles.samples = int(os.environ.get('SAMPLES', '8' if PREVIEW else '16')); SC.cycles.use_denoising = True
SC.cycles.max_bounces = 6; SC.cycles.transparent_max_bounces = 32
try: SC.render.use_persistent_data = True
except Exception: pass
try:
    SC.view_settings.view_transform = 'AgX'; SC.view_settings.look = 'AgX - Medium High Contrast'
except TypeError: pass
w = bpy.data.worlds.new('W'); SC.world = w
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.75, 0.8, 0.9, 1); bg.inputs[1].default_value = 0.6
sun = OB.new('Sun', bpy.data.lights.new('Sun', 'SUN')); SC.collection.objects.link(sun); sun.data.energy = 4; sun.data.angle = math.radians(1.5); sun.rotation_euler = (math.radians(50), 0, math.radians(-60))
for k in range(5):
    l = OB.new(f'Ceil{k}', bpy.data.lights.new(f'C{k}', 'AREA')); SC.collection.objects.link(l)
    l.data.shape = 'RECTANGLE'; l.data.size = 0.25; l.data.size_y = 1.6; l.data.energy = 45; l.data.color = (1.0, 0.95, 0.88)
    l.location = (0, -4.3 + k * 2.1, 2.95); l.rotation_euler = (math.pi, 0, 0)
def mk_cam(name, pos, aim, lens):
    c = OB.new(name, bpy.data.cameras.new(name)); SC.collection.objects.link(c)
    c.data.lens = lens; c.data.clip_start = 0.05; c.location = pos; c.rotation_euler = (aim - pos).to_track_quat('-Z', 'Y').to_euler(); return c
V = lambda e, d: Vector(tuple(float(v) for v in os.environ.get(e, d).split(',')))
cam = mk_cam('Cam_wide', V('CAM', '-2.95,-6.25,2.05'), V('AIM', '-0.70,-4.85,1.35'), float(os.environ.get('LENS', '24')))
cam2 = mk_cam('Cam_close', V('CAM2', '-0.30,-4.05,2.15'), V('AIM2', '0.02,-4.68,1.86'), float(os.environ.get('LENS2', '24')))
CUT = RA - 4
SC.camera = cam
mk = SC.timeline_markers.new('wide', frame=1); mk.camera = cam
mk = SC.timeline_markers.new('close', frame=CUT); mk.camera = cam2
print('TAP cut to close-up at', CUT)
SC.render.resolution_x, SC.render.resolution_y = (640, 360) if PREVIEW else (1280, 720)
SC.render.resolution_percentage = 100
SC.render.image_settings.file_format = 'PNG'; SC.render.image_settings.color_mode = 'RGB'
OUT = 'out/tap' if VAR == 'ok' else f'out/tap_{VAR}'
SC.render.filepath = os.path.abspath(OUT + '/f_')
SC.frame_start = f0 + 1; SC.frame_end = END
SC.frame_step = int(os.environ.get('STEP', '2' if PREVIEW else '1'))
print('TAP render', VAR, SC.frame_start, SC.frame_end, 'step', SC.frame_step, 'setup', round(time.time() - T0), 's')
t1 = time.time()
bpy.ops.render.render(animation=True)
n = len(range(SC.frame_start, SC.frame_end + 1, SC.frame_step))
print('TAP RENDER done', n, 'frames', round(time.time() - t1), 's', round((time.time() - t1) / max(1, n), 1), 's/frame')
