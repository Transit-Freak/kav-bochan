"""נוסע מתקף רב-קו: הולך כמה צעדים אל מכשיר התיקוף ליד הדלת האמצעית, נעצר, מרים את היד עם הכרטיס, מצמיד למשטח ומוריד.
ההליכה — תנועה מצולמת (CMU 16_34, "הליכה איטית ועצירה"), באותה העברת תנועה של anim.py (הקוד שלה רץ כאן כמו שהוא).
היד — IK אנליטי בשתי עצמות אל נקודה מול משטח ההנחה, והכרטיס צמוד לעצם כף היד.
מסך המכשיר מתחלף ממסך ההמתנה למסך התוצאה ברגע ההנחה. VARIANT: ok (נסיעה טובה) / err (תקלה בכרטיס) / nofunds (אין מספיק כסף).
מריצים: blender -b --online-mode out/bus.blend -P tap.py  (אחרי bus.py, screens.py ו-card_tex.py)."""
import bpy, bmesh, os, math, time
from mathutils import Matrix, Vector, Quaternion

T0 = time.time()
VAR = os.environ.get('VARIANT', 'ok')
PREVIEW = os.environ.get('TAP_PREVIEW', '0') == '1'
SC = bpy.context.scene
SC.render.fps = 30                       # לפני ייבוא ה-BVH: 120 פריימים בשנייה → 30
os.environ.setdefault('FRAMES', '2000')  # כל ההקלטה
for o in bpy.context.selected_objects: o.select_set(False)

# ---------- ההליכה: הקוד של anim.py עד שמירת הקובץ (בלי השורה שמוחקת את כל האובייקטים — כאן יש אוטובוס)
src_code = open(os.path.join(os.getcwd(), 'anim.py')).read()
cut = src_code.index('src.hide_render = True')
src_code = src_code[:cut].replace('for o in list(bpy.data.objects): bpy.data.objects.remove(o)\n', '', 1)
NS = {'__name__': 'anim_walk'}
exec(compile(src_code, 'anim.py', 'exec'), NS)
rig, src, hips, f0, f1, fwd = NS['rig'], NS['src'], NS['hips'], NS['f0'], NS['f1'], NS['fwd']
src.hide_render = True; src.hide_viewport = True
for o in bpy.data.objects:
    if o.type == 'EMPTY' and o.name.startswith(('ik_', 'pole_')): o.hide_render = True
print('TAP walk done', f0, f1, 'fwd', tuple(round(v, 2) for v in fwd), round(time.time() - T0), 's')

def upd(): bpy.context.view_layer.update()
def W(): return rig.matrix_world
def bone_w(n):
    """מטריצת העולם של עצם (4x4)"""
    return W() @ rig.pose.bones[n].matrix
def head_w(n): return W() @ rig.pose.bones[n].head
def key(pb):
    pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler')
def set_world_rot(n, R3):
    """מציב לעצם סיבוב בעולם, ומשאיר את המיקום שלה (כמו בתיקוני כף הרגל של anim.py)"""
    pb = rig.pose.bones[n]
    M = (W().to_3x3().inverted() @ R3).to_4x4(); M.translation = pb.matrix.translation
    pb.matrix = M; upd()
def smooth(a, b, x):
    if b == a: return 1.0 if x >= b else 0.0
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

# ---------- מיקום בתוך האוטובוס: הנוסע הולך ב-+Y (לכיוון אחורי האוטובוס) במעבר, ונעצר מול מכשיר התיקוף M1
floor_ob = bpy.data.objects['SM_FloorIn']
FLOOR = max((floor_ob.matrix_world @ Vector(c)).z for c in floor_ob.bound_box)
pad_ob = bpy.data.objects['SM_ValNFCM1']; scr_ob = bpy.data.objects['SM_ValScrM1']
PAD = pad_ob.matrix_world.translation.copy()             # מרכז משטח ההנחה; פונה ל--Y
SCR = scr_ob.matrix_world.translation.copy()
NPAD = Vector((0, -1, 0))
SC.frame_set(f1); upd()
p_end = head_w(hips)
th = math.pi / 2 - math.atan2(fwd.y, fwd.x)
STAND = Vector((float(os.environ.get('STAND_X', '0.03')), float(os.environ.get('STAND_Y', '-1.12')), FLOOR))
Tm = Matrix.Translation(STAND) @ Matrix.Rotation(th, 4, 'Z') @ Matrix.Translation(Vector((-p_end.x, -p_end.y, 0)))
rig.matrix_world = Tm @ rig.matrix_world; upd()
print('TAP floor', round(FLOOR, 3), 'pad', tuple(round(v, 3) for v in PAD), 'screen', tuple(round(v, 3) for v in SCR))

# ---------- כף היד: כיווני האצבעות, כף היד והאגודל במערכת של העצם (מתנוחת המנוחה)
HB = rig.data.bones['LeftHand']
Mb = HB.matrix_local.to_3x3(); Mbi = Mb.inverted()
Yr = (HB.tail_local - HB.head_local).normalized()
th_b = rig.data.bones.get('LThumb')
tv = (th_b.tail_local - HB.head_local) if th_b else Vector((0, -1, 0))
tp = (tv - Yr * tv.dot(Yr)).normalized()
n_arm = Yr.cross(tp).normalized()                      # יד שמאל: כף היד = אצבעות × אגודל
inward = Vector((-HB.head_local.x, 0, 0)).normalized()
flip = n_arm.dot(inward) < -0.2 and n_arm.z > -0.2
if flip: n_arm = -n_arm
F_L = Vector((0, 1, 0)); N_L = Mbi @ n_arm; N_L = (N_L - F_L * N_L.dot(F_L)).normalized(); T_L = N_L.cross(F_L)
tips = [b for b in HB.children_recursive]
TIP = max([(b.tail_local - HB.head_local).dot(Yr) for b in tips] + [HB.length])
print('TAP palm n(rest)', tuple(round(v, 2) for v in n_arm), 'flip', flip, 'tip', round(TIP, 3), 'hand len', round(HB.length, 3))
CF = float(os.environ.get('CARD_F', str(round(0.62 * TIP, 3))))     # מרכז הכרטיס לאורך האצבעות
CN = float(os.environ.get('CARD_N', '0.024'))                          # מרחק מכף היד (צד כף היד)
OFF_L = F_L * CF + N_L * CN
# כיוון היד ברגע ההנחה (בעולם): כף היד אל המשטח (+Y), האצבעות למעלה ומעט החוצה (שמאלה = -X)
f_w = Vector((-0.22, 0.0, 1.0)).normalized(); n_w = -NPAD; t_w = n_w.cross(f_w)
Bw = Matrix((f_w, n_w, t_w)).transposed(); Bl = Matrix((F_L, N_L, T_L)).transposed()
RH = Bw @ Bl.transposed()                                               # סיבוב העולם של עצם היד בהנחה
CARD_AT = PAD + NPAD * 0.007                                            # מרכז הכרטיס 7 מ"מ מול המשטח
WR_C = CARD_AT - RH @ OFF_L                                             # מיקום פרק היד בהנחה

# ---------- מרחק ההושטה: מזיזים את נקודת העמידה קדימה/אחורה כך שהמרפק יהיה כפוף בנוחות
a_len = rig.data.bones['LeftArm'].length; b_len = rig.data.bones['LeftForeArm'].length
S = head_w('LeftArm'); dx, dz = WR_C.x - S.x, WR_C.z - S.z
want = float(os.environ.get('REACH', '0.84')) * (a_len + b_len)
dy = math.sqrt(max(0.0, want * want - dx * dx - dz * dz))
shift = (WR_C.y - S.y) - dy
shift = min(shift, (PAD.y - 0.30) - head_w(hips).y)                    # האגן לפחות 30 ס"מ מהמשטח
rig.matrix_world = Matrix.Translation(Vector((0, shift, 0))) @ rig.matrix_world; upd()
print('TAP reach: arm', round(a_len, 3), round(b_len, 3), 'shift', round(shift, 3), 'hips', tuple(round(v, 2) for v in head_w(hips)),
      'dist', round((WR_C - head_w('LeftArm')).length, 3))

# ---------- הכרטיס: מלבן מעוגל 85.6×54 מ"מ, עם ההדפסה בשני הצדדים, צמוד לעצם כף היד
def card_mesh():
    w, h, t, r = 0.0856, 0.054, 0.0009, 0.0035
    ring = []
    for cx, cy, a0 in ((w/2 - r, h/2 - r, 0), (-w/2 + r, h/2 - r, 90), (-w/2 + r, -h/2 + r, 180), (w/2 - r, -h/2 + r, 270)):
        for i in range(5):
            a = math.radians(a0 + i * 22.5); ring.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    me = bpy.data.meshes.new('RavKavCard'); b = bmesh.new()
    top = [b.verts.new((x, y, t/2)) for x, y in ring]; bot = [b.verts.new((x, y, -t/2)) for x, y in ring]
    ft = b.faces.new(top); fb = b.faces.new(list(reversed(bot)))
    sides = [b.faces.new((bot[i], bot[(i + 1) % len(ring)], top[(i + 1) % len(ring)], top[i])) for i in range(len(ring))]
    uv = b.loops.layers.uv.new()
    for f, mir in ((ft, False), (fb, True)):
        for lp in f.loops:
            u = (lp.vert.co.x + w/2) / w; v = (lp.vert.co.y + h/2) / h
            lp[uv].uv = (1 - u if mir else u, v)
    for f in sides:
        f.material_index = 1
        for lp in f.loops: lp[uv].uv = (0.5, 0.5)
    b.to_mesh(me); b.free()
    m = bpy.data.materials.new('M_RavKav'); nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(os.path.abspath('tex/ravkav_card.png'))
    nt.links.new(tx.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.32
    me.materials.append(m)
    e = bpy.data.materials.new('M_CardEdge'); e.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.85, 0.87, 0.9, 1)
    me.materials.append(e)
    ob = bpy.data.objects.new('RavKavCard', me); SC.collection.objects.link(ob); return ob
card = card_mesh()
card.parent = rig; card.parent_type = 'BONE'; card.parent_bone = 'LeftHand'
card.matrix_parent_inverse = Matrix.Identity(4)
CB = Matrix((T_L, F_L, -N_L)).transposed()                 # X של הכרטיס לרוחב כף היד, Y לאורך האצבעות
card.matrix_basis = Matrix.Translation(Vector((0, -HB.length, 0))) @ Matrix.Translation(OFF_L) @ CB.to_4x4()

# ---------- ציר הזמן (30 פריימים בשנייה)
RA = int(os.environ.get('REACH_START', str(f1 - 7)))       # תחילת ההושטה: ממש בסוף העצירה
C = RA + 20                                                  # הכרטיס על המשטח
HOLD = C + 9
PAUSE = VAR != 'ok'
if PAUSE:
    HOV, HOV_END, LE, END = HOLD + 8, HOLD + 38, HOLD + 60, HOLD + 78
else:
    HOV, HOV_END, LE, END = HOLD + 8, HOLD + 8, HOLD + 26, HOLD + 56
SWITCH = C + 2
print('TAP timeline', dict(RA=RA, C=C, HOLD=HOLD, HOV=HOV, HOV_END=HOV_END, LE=LE, END=END, SWITCH=SWITCH, var=VAR))

ARM_CHAIN = ('Spine1', 'Neck1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand')
base = {}                                                     # הפוזה המקורית (מההקלטה) בכל פריים בטווח
for f in range(RA - 8, END + 1):
    SC.frame_set(min(f, f1)); upd()
    base[f] = {n: rig.pose.bones[n].matrix_basis.copy() for n in ARM_CHAIN if n in rig.pose.bones}
SC.frame_set(RA); upd(); WR0 = head_w('LeftHand')
SC.frame_set(min(LE, f1)); upd(); WR_LE = head_w('LeftHand')
APP = WR_C + NPAD * 0.075 + Vector((0, 0, -0.02))           # נקודת התקרבות: 7.5 ס"מ מול המשטח
BACK = WR_C + NPAD * 0.06 + Vector((0, 0, -0.03))            # נסיגה קלה אחרי ההנחה (מסתכל על המסך)
keys = [(RA, WR0), (RA + 13, APP), (C, WR_C), (HOLD, WR_C)]
if PAUSE: keys += [(HOV, BACK), (HOV_END, BACK)]
keys += [(LE, WR_LE)]
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
w_hand = lambda f: smooth(RA + 3, C - 2, f) * (1 - smooth(HOV_END + 2, LE - 3, f))
w_lean = lambda f: smooth(RA, C, f) * (1 - smooth(HOV_END, LE + 4, f))
w_look = lambda f: smooth(RA - 8, RA + 10, f) * (1 - smooth(LE - 4, LE + 14, f))
HINT = Vector((-0.45, -0.3, -1.0)).normalized()             # המרפק: למטה, מעט החוצה ואחורה
hd = rig.data.bones['Head']; FACE_L = hd.matrix_local.to_3x3().inverted() @ Vector((0, -1, 0))   # MPFB פונה ל--Y במנוחה

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
    R = bone_w('LeftArm').to_3x3().normalized()
    set_world_rot('LeftArm', (E0 - S).rotation_difference(E - S).to_matrix() @ R)
    E1 = head_w('LeftForeArm'); W1 = head_w('LeftHand')
    R = bone_w('LeftForeArm').to_3x3().normalized()
    set_world_rot('LeftForeArm', (W1 - E1).rotation_difference(Wt - E1).to_matrix() @ R)
    return Wt

err_log = []
for f in range(RA - 8, END + 1):
    SC.frame_set(min(f, f1))
    for n, mb in base[f].items(): rig.pose.bones[n].matrix_basis = mb
    upd()
    # גו: הטיה קלה קדימה ושמאלה אל המכשיר
    wl = w_lean(f)
    if wl > 0:
        R = bone_w('Spine1').to_3x3().normalized()
        set_world_rot('Spine1', Matrix.Rotation(math.radians(7) * wl, 3, 'Z') @ Matrix.Rotation(math.radians(-5) * wl, 3, 'X') @ R)
    # ראש: מבט אל המסך
    wk = w_look(f)
    if wk > 0:
        Rh_ = bone_w('Head').to_3x3().normalized()
        face = (Rh_ @ FACE_L).normalized(); want_d = (SCR - head_w('Head')).normalized()
        q = Quaternion().slerp(face.rotation_difference(want_d), 0.7 * wk)
        set_world_rot('Head', q.to_matrix() @ Rh_)
    # יד: IK אל המשטח, ואחר כך כיוון כף היד (וחצי מהסיבוב סביב האמה עובר לאמה, כדי שפרק היד לא יתפתל)
    Wt = solve_arm(f)
    wh = w_hand(f)
    if wh > 0:
        Rf = bone_w('LeftForeArm').to_3x3().normalized(); Rcur = bone_w('LeftHand').to_3x3().normalized()
        Rgoal = Rcur.to_quaternion().slerp(RH.to_quaternion(), wh).to_matrix()
        q = (Rf.inverted() @ Rgoal).to_quaternion()
        tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize()
        ang = 2 * math.atan2(tw.y, tw.w); ang = (ang + math.pi) % (2 * math.pi) - math.pi
        set_world_rot('LeftForeArm', Rf @ Matrix.Rotation(0.5 * ang, 3, 'Y'))
        set_world_rot('LeftHand', Rgoal)
    for n in base[f]: rig.pose.bones[n].keyframe_insert('rotation_quaternion' if rig.pose.bones[n].rotation_mode == 'QUATERNION' else 'rotation_euler', frame=f)
    if f in (RA, RA + 13, C, HOLD, LE):
        cw = card.matrix_world.translation
        err_log.append((f, round((head_w('LeftHand') - Wt).length, 3), round((cw - CARD_AT).length, 3)))
print('TAP wrist err / card-to-pad (m)', err_log)
SC.frame_set(C); upd()
cn = (card.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
print('TAP card at contact', tuple(round(v, 3) for v in card.matrix_world.translation), 'pad', tuple(round(v, 3) for v in CARD_AT),
      'card normal', tuple(round(v, 2) for v in cn), 'gap to pad plane', round(PAD.y - card.matrix_world.translation.y, 4))

# ---------- מסך המכשיר M1: חומר משלו, מעבר ממסך ההמתנה למסך התוצאה, ופסי התאורה בצבע התוצאה
def img(p): return bpy.data.images.load(os.path.abspath(p))
sm = bpy.data.materials.new('M_ValScreenTap'); nt = sm.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
t_idle = nt.nodes.new('ShaderNodeTexImage'); t_idle.image = img('tex/screen_idle.png')
t_res = nt.nodes.new('ShaderNodeTexImage'); t_res.image = img(f'tex/screen_{VAR}.png')
mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
fac = mix.inputs['Factor']; ia = next(s for s in mix.inputs if s.name == 'A' and s.type == 'RGBA'); ib = next(s for s in mix.inputs if s.name == 'B' and s.type == 'RGBA')
mo = next(s for s in mix.outputs if s.type == 'RGBA')
nt.links.new(t_idle.outputs['Color'], ia); nt.links.new(t_res.outputs['Color'], ib)
nt.links.new(mo, bs.inputs['Base Color']); nt.links.new(mo, bs.inputs['Emission Color'])
bs.inputs['Emission Strength'].default_value = 1.2; bs.inputs['Roughness'].default_value = 0.15
fac.default_value = 0.0; fac.keyframe_insert('default_value', frame=SWITCH - 1)
fac.default_value = 1.0; fac.keyframe_insert('default_value', frame=SWITCH)
scr_ob.data.materials.clear(); scr_ob.data.materials.append(sm)
LED = (0.1, 1.0, 0.25, 1) if VAR == 'ok' else (1.0, 0.08, 0.05, 1)
lm = bpy.data.materials.new('M_ValLedTap'); lb = next(n for n in lm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
lb.inputs['Emission Strength'].default_value = 6
ec = lb.inputs['Emission Color']
for fr, col in ((SWITCH - 1, (1, 0.98, 0.92, 1)), (SWITCH, LED), (SWITCH + 40, LED), (SWITCH + 41, (1, 0.98, 0.92, 1))):
    ec.default_value = col; ec.keyframe_insert('default_value', frame=fr)
for o in bpy.data.objects:
    if o.name.startswith('SM_ValLedM1'): o.data.materials.clear(); o.data.materials.append(lm)

# ---------- בדיקת חדירות: קודקודי הגוף והבגדים בתוך המכשיר, המושבים או המוטות
def under_rig(o):
    while o.parent is not None:
        if o.parent == rig: return True
        o = o.parent
    return False
body_objs = [o for o in bpy.data.objects if o.type == 'MESH' and under_rig(o) and o is not card] + [card]
obst = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(('SM_ValM1', 'SM_ValClampM1', 'SM_Seat', 'SM_FoldSeat', 'SM_ValL_'))]
def bbox(o):
    ps = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector((min(p.x for p in ps), min(p.y for p in ps), min(p.z for p in ps))), Vector((max(p.x for p in ps), max(p.y for p in ps), max(p.z for p in ps)))
boxes = [(o.name, *bbox(o)) for o in obst]
poles = []
for o in bpy.data.objects:
    if o.type == 'CURVE' and o.name.startswith('SM_Pole') and o.data.splines:
        p = o.matrix_world @ Vector(o.data.splines[0].points[0].co[:3]); poles.append((o.name, p.x, p.y))
hits = {}
for f in list(range(f0 + 2, END + 1, 4)) + [C]:
    SC.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
    for o in body_objs:
        e = o.evaluated_get(dg); me = e.to_mesh(); M = e.matrix_world
        for v in me.vertices[::3]:
            p = M @ v.co
            for nm, lo, hi in boxes:
                if lo.x < p.x < hi.x and lo.y < p.y < hi.y and lo.z < p.z < hi.z: hits[(f, nm)] = hits.get((f, nm), 0) + 1
            if p.z < FLOOR + 2.0:
                for nm, px, py in poles:
                    if (p.x - px) ** 2 + (p.y - py) ** 2 < 0.021 ** 2: hits[(f, nm)] = hits.get((f, nm), 0) + 1
            if p.z < FLOOR - 0.01: hits[(f, 'floor')] = hits.get((f, 'floor'), 0) + 1
        e.to_mesh_clear()
print('TAP penetration hits (frame, object): count', sorted(hits.items())[:60])

# ---------- תאורה ומצלמה (כמו interior.py), Cycles
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
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); SC.collection.objects.link(sun); sun.data.energy = 5; sun.data.angle = math.radians(1.5); sun.rotation_euler = (math.radians(55), 0, math.radians(-70))
for k in range(5):
    l = bpy.data.objects.new(f'Ceil{k}', bpy.data.lights.new(f'C{k}', 'AREA')); SC.collection.objects.link(l)
    l.data.shape = 'RECTANGLE'; l.data.size = 0.25; l.data.size_y = 1.6; l.data.energy = 45; l.data.color = (1.0, 0.95, 0.88)
    l.location = (0, -4.3 + k * 2.1, 2.95); l.rotation_euler = (math.pi, 0, 0)
cam = bpy.data.objects.new('Cam_tap', bpy.data.cameras.new('C')); SC.collection.objects.link(cam); SC.camera = cam
CAM = Vector(tuple(float(v) for v in os.environ.get('CAM', '-0.30,-4.30,2.50').split(',')))
AIM = Vector(tuple(float(v) for v in os.environ.get('AIM', '-0.17,-1.0,1.62').split(',')))
cam.data.lens = float(os.environ.get('LENS', '26')); cam.data.clip_start = 0.05
cam.location = CAM; cam.rotation_euler = (AIM - CAM).to_track_quat('-Z', 'Y').to_euler()
SC.render.resolution_x, SC.render.resolution_y = (640, 360) if PREVIEW else (1280, 720)
SC.render.resolution_percentage = 100
SC.render.image_settings.file_format = 'PNG'; SC.render.image_settings.color_mode = 'RGB'
OUT = {'ok': 'out/tap', 'err': 'out/tap_err', 'nofunds': 'out/tap_nofunds'}[VAR]
SC.render.filepath = os.path.abspath(OUT + '/f_')
# הגרסאות (שגיאה / אין כסף) זהות לגרסה הרגילה עד רגע ההנחה, אז מרנדרים רק מקצת לפני ההנחה; את ההתחלה לוקחים מ-out/tap
SC.frame_start = (f0 + 2) if VAR == 'ok' else C - 4
SC.frame_end = END
SC.frame_step = int(os.environ.get('STEP', '2' if PREVIEW else '1'))
print('TAP render', VAR, SC.frame_start, SC.frame_end, 'step', SC.frame_step, 'setup', round(time.time() - T0), 's')
t1 = time.time()
bpy.ops.render.render(animation=True)
n = len(range(SC.frame_start, SC.frame_end + 1, SC.frame_step))
print('TAP RENDER done', n, 'frames', round(time.time() - t1), 's', round((time.time() - t1) / max(1, n), 1), 's/frame')
