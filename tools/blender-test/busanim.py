"""אנימציות האוטובוס (בקשת שלמה: "האוטובוס נוסע, עוצר, מעלה נכים, הנהג פותח את המקום של הנכים, אנשים מחזיקים בידיות; הגלגלים").
מריצים: blender -b out/bus.blend -P busanim.py   עם SHOT=s1_drive|s2_wheelchair|s3_driver|s4_standing, PART/PARTS לחלוקת פריימים,
MODE=preview|final. הפריימים נכתבים ל-out/<shot>/f_####.png."""
import bpy, os, sys, math, random
from mathutils import Matrix, Vector, Quaternion, Euler
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import busanim_lib as BL
from busanim_lib import smooth, ease_keys, log, FLOOR, KNEEL, SIDES

SHOT = os.environ.get('SHOT', 's1_drive')
MODE = os.environ.get('MODE', 'preview')
PART, PARTS = int(os.environ.get('PART', '0')), int(os.environ.get('PARTS', '1'))
STEP = int(os.environ.get('STEP', '3' if MODE == 'preview' else '1'))
BVH = os.environ.get('BVH', '')
CHAIR_SRC = os.environ.get('CHAIR', '')
R = Matrix.Rotation
V = Vector
ANKLE = 0.0      # נקבע לכל דמות


# ---------------------------------------------------------------- דמויות
def make_driver():
    a = BL.make_human('Driver', gender=1.0, age=0.55, weight=0.6, height=0.55, muscle=0.5,
                      race={'caucasian': 0.75, 'african': 0.1, 'asian': 0.15},
                      skin=('skins/middleage_caucasian_male/middleage_caucasian_male.mhmat',),
                      hair=('hair/short02/short02.mhclo', 'hair/short04/short04.mhclo'),
                      clothes=(('clothes/male_casualsuit01/male_casualsuit01.mhclo',),),
                      shoes=('clothes/shoes02/shoes02.mhclo', 'clothes/shoes01/shoes01.mhclo'),
                      hair_rgb=(0.02, 0.018, 0.016),
                      cloth_colors=[((0.07, 0.11, 0.24), (0.035, 0.035, 0.04), "waist"), ((0.02, 0.02, 0.02),)])
    return a


def make_chair_user():
    return BL.make_human('Rider', gender=0.0, age=0.45, weight=0.5, height=0.45,
                         race={'caucasian': 0.7, 'african': 0.1, 'asian': 0.2},
                         skin=('skins/young_caucasian_female/young_caucasian_female.mhmat', 'skins/default.mhmat'),
                         hair=('hair/bob02/bob02.mhclo', 'hair/ponytail01/ponytail01.mhclo', 'hair/long01/long01.mhclo', 'hair/short02/short02.mhclo'),
                         clothes=(('clothes/female_casualsuit02/female_casualsuit02.mhclo', 'clothes/female_casualsuit01/female_casualsuit01.mhclo'),),
                         shoes=('clothes/shoes05/shoes05.mhclo', 'clothes/shoes03/shoes03.mhclo', 'clothes/shoes02/shoes02.mhclo'),
                         hair_rgb=(0.05, 0.03, 0.02),
                         cloth_colors=[((0.45, 0.12, 0.12), (0.06, 0.07, 0.12), 'waist'), None])


def make_passengers():
    p1 = BL.make_human('Pass1', gender=1.0, age=0.35, weight=0.5, height=0.6, race={'caucasian': 0.6, 'african': 0.2, 'asian': 0.2},
                       skin=('skins/young_caucasian_male/young_caucasian_male.mhmat', 'skins/default.mhmat'),
                       hair=('hair/short04/short04.mhclo',), clothes=(('clothes/male_casualsuit03/male_casualsuit03.mhclo', 'clothes/male_casualsuit01/male_casualsuit01.mhclo'),),
                       shoes=('clothes/shoes01/shoes01.mhclo', 'clothes/shoes02/shoes02.mhclo'),
                       cloth_colors=[((0.25, 0.3, 0.22), (0.12, 0.14, 0.2), 'waist'), None])
    p2 = BL.make_human('Pass2', gender=0.0, age=0.6, weight=0.55, height=0.4, race={'caucasian': 0.8, 'african': 0.05, 'asian': 0.15},
                       skin=('skins/middleage_caucasian_female/middleage_caucasian_female.mhmat', 'skins/young_caucasian_female/young_caucasian_female.mhmat'),
                       hair=('hair/bob01/bob01.mhclo', 'hair/bob02/bob02.mhclo', 'hair/short02/short02.mhclo'),
                       clothes=(('clothes/female_elegantsuit01/female_elegantsuit01.mhclo', 'clothes/female_casualsuit01/female_casualsuit01.mhclo'),),
                       shoes=('clothes/shoes03/shoes03.mhclo', 'clothes/shoes02/shoes02.mhclo'), hair_rgb=(0.12, 0.08, 0.05),
                       cloth_colors=[((0.18, 0.22, 0.35), (0.1, 0.1, 0.12), 'waist'), None])
    p3 = BL.make_human('Pass3', gender=1.0, age=0.25, weight=0.45, height=0.65, race={'caucasian': 0.4, 'african': 0.4, 'asian': 0.2},
                       skin=('skins/young_african_male/young_african_male.mhmat', 'skins/young_caucasian_male/young_caucasian_male.mhmat'),
                       hair=('hair/short02/short02.mhclo',), clothes=(('clothes/male_casualsuit04/male_casualsuit04.mhclo', 'clothes/male_casualsuit01/male_casualsuit01.mhclo'),),
                       shoes=('clothes/shoes06/shoes06.mhclo', 'clothes/shoes02/shoes02.mhclo'),
                       cloth_colors=[((0.55, 0.55, 0.52), (0.08, 0.09, 0.1), 'waist'), None])
    return [p1, p2, p3]


def prep(a, parent):
    a.attach(parent); a.build_poses(); a.setup_ik()
    hb = a.rig.data.bones
    a.grip_len = hb['LeftHand'].length + 0.5 * (hb['LeftFingerBase'].length if 'LeftFingerBase' in hb else 0.06)
    a.ank_h = a.ankle['L'].z - a.sole
    a.stand_h = a.h0.z - a.sole - 0.02          # גובה מפרק האגן מעל הרצפה בעמידה (ברך כפופה מעט)


# ---------------------------------------------------------------- עזרים לתנוחה
def hips_at(a, X, psi, bend=0.0, roll=0.0, extra=None):
    """מטריצת האגן: מפרק האגן בנקודה X, מסתכל לכיוון psi, כפיפה קדימה bend. extra: סיבוב נוסף במערכת ההורה"""
    Rr = a.hrest.to_3x3().to_4x4()
    M = R(psi, 4, 'Z') @ R(bend, 4, 'X') @ R(roll, 4, 'Y') @ Rr
    if extra is not None: M = extra @ M
    return Matrix.Translation(X) @ M


def fwd_of(psi):
    return V((math.sin(psi), -math.cos(psi), 0))


def right_of(psi):
    return V((-math.cos(psi), -math.sin(psi), 0))        # הצד הימני של הדמות (בקנוני: ‎-X)


def feet_state(a, P, feet, poles=None):
    """feet: {'L': (pos, yaw)}; P: מטריצת מיקום לחישוב הקטבים (מול הברך)"""
    out = {}
    for s, S, sg in SIDES:
        pos, yaw = feet[s]
        pole = poles[s] if poles else (P @ V((sg * 0.16, -1.0, 0.55 + 0)))
        out['foot' + s] = dict(w=1.0, pos=pos, rot=a.foot_rot_at(s, yaw), pole=pole, rw=1.0)
    return out


def hand_state(a, s, grip, fingers, palm, pole, w=1.0):
    f = V(fingers).normalized(); n = V(palm).normalized()
    wrist = V(grip) - f * a.grip_len * 0.75 - n * 0.025
    return dict(w=w, pos=wrist, rot=a.hand_rot(s, f, n), pole=pole, rw=w)


def stand_feet(a, p, psi, spread=0.0, dy=(0.0, 0.0)):
    return {s: (a.stand_ankle(s, p, psi, spread, dy[i]), psi) for i, (s, S, sg) in enumerate(SIDES)}


def stand_X(a, p, psi, dz=0.0, back=0.0):
    return V(p) + V((0, 0, a.stand_h + dz)) - fwd_of(psi) * back


def arms_pose(a, w_arms=1.0, bend=0.0, fist=(0.3, 0.3), extra=()):
    lay = [('arms', w_arms), ('bend', bend)] + list(extra)
    q = a.mix(lay)
    fq = a.poses['fist']
    for s, S, sg in SIDES:
        w = fist[0 if s == 'L' else 1]
        for n, qq in fq.items():
            if n.startswith(S + 'Finger') or n.startswith(S + 'HandIndex') or n == ('LThumb' if s == 'L' else 'RThumb'):
                q[n] = Quaternion().slerp(qq, w)
    return q


def step_path(keys, f, lift=0.07):
    """רגל שזזה בין מיקומים: keys = [(frame, pos, yaw)]. בין שני מיקומים שונים — קשת הרמה"""
    if f <= keys[0][0]: return keys[0][1].copy(), keys[0][2]
    if f >= keys[-1][0]: return keys[-1][1].copy(), keys[-1][2]
    for (f0, p0, y0), (f1, p1, y1) in zip(keys, keys[1:]):
        if f0 <= f <= f1:
            t = (f - f0) / max(1e-6, f1 - f0); ts = smooth(t)
            p = p0.lerp(p1, ts)
            if (p1 - p0).length > 0.02: p.z += lift * math.sin(math.pi * t)
            return p, y0 + (y1 - y0) * ts


def breathe(f, amp=0.006, per=90, ph=0.0):
    return amp * math.sin(2 * math.pi * f / per + ph)


# ---------------------------------------------------------------- רמפה
def ramp_fall(phi0, w0, phi_end, nframes):
    """הרמפה נופלת מעבר לאנך עד שהיא נוחתת על הרציף, עם קפיצה קטנה"""
    g, Lr = 9.81, BL.RAMP_L; dt = 1 / 240.; out = []; phi, w = phi0, w0; landed = 0
    for i in range(nframes * 10):
        acc = -(3 * g / (2 * Lr)) * math.cos(phi) - 0.4 * w
        w += acc * dt; phi += w * dt
        if phi >= phi_end:
            phi = phi_end; w = -0.12 * abs(w) if abs(w) > 0.4 else 0.0; landed += 1
        if i % 10 == 9: out.append(phi)
    return out


def driver_flip(a, bus, f0, fx=0.14, y0=0.0, n_after=24, lead=0):
    """הנהג כורע ליד הקצה של הרמפה המקופלת, מרים אותה, דוחף אותה החוצה, והיא נוחתת על הרציף.
    מחזיר את מספר הפריימים ואת זוויות הרמפה."""
    psi = -math.pi / 2                                    # פונה ל--X
    p = V((fx, y0, FLOOR - KNEEL * 0))
    pr = a.placement(p, psi) if False else None
    feet = {s: (V((fx, y0 + (0.13 if s == 'R' else -0.13) * 1, FLOOR + a.ank_h)), psi) for s, S, sg in SIDES}
    # הצד השמאלי של דמות שפונה ל--X הוא ‎-Y
    feet = {'L': (V((fx + 0.04, y0 - 0.14, FLOOR + a.ank_h)), psi + 0.12), 'R': (V((fx - 0.02, y0 + 0.14, FLOOR + a.ank_h)), psi - 0.12)}
    phi_d = BL.ramp_deploy_angle()
    LIFT0, LIFT1, PUSH1 = 16, 36, 42
    phis = {}
    for d in range(0, PUSH1 + 1):
        if d <= LIFT0: phis[d] = 0.0
        elif d <= LIFT1: phis[d] = 0.95 * smooth((d - LIFT0) / (LIFT1 - LIFT0))
        else: phis[d] = 0.95 + 0.40 * ((d - LIFT1) / (PUSH1 - LIFT1)) ** 1.2
    fall = ramp_fall(phis[PUSH1], 0.40 / ((PUSH1 - LIFT1) / 24.0) * 1.3, phi_d, 40)
    for i, ph in enumerate(fall): phis[PUSH1 + 1 + i] = ph
    total = PUSH1 + n_after
    stand = a.stand_h
    hipsk = [(0, V((fx + 0.05, y0, FLOOR + stand))), (4, V((fx + 0.05, y0, FLOOR + stand))), (14, V((fx + 0.28, y0, FLOOR + 0.50))),
             (LIFT0, V((fx + 0.28, y0, FLOOR + 0.50))), (LIFT1, V((fx + 0.12, y0, FLOOR + stand - 0.08))), (PUSH1, V((fx + 0.02, y0, FLOOR + stand - 0.05))),
             (PUSH1 + 12, V((fx + 0.08, y0, FLOOR + stand))), (total, V((fx + 0.1, y0, FLOOR + stand)))]
    bendk = [(0, 0.0), (4, 0.0), (14, 0.62), (LIFT0, 0.62), (LIFT1, 0.3), (PUSH1, 0.28), (PUSH1 + 12, 0.04), (total, 0.0)]
    spk = [(0, 0.0), (4, 0.0), (14, 1.2), (LIFT0, 1.2), (LIFT1, 0.4), (PUSH1, 0.5), (PUSH1 + 12, 0.0), (total, 0.0)]
    hw = [(0, 0.0), (5, 0.0), (13, 1.0), (PUSH1, 1.0), (PUSH1 + 8, 0.0), (total, 0.0)]
    for d in range(0, total + 1):
        f = f0 + d
        phi = phis.get(d, phi_d)
        if d >= lead: BL.key_ramp(bus, f, phi)
        X = ease_keys(hipsk, d); bend = ease_keys(bendk, d); sp = ease_keys(spk, d); w = ease_keys(hw, d)
        hM = hips_at(a, X, psi, bend)
        q = arms_pose(a, 1.0, sp, fist=(0.2 + 0.6 * w, 0.2 + 0.6 * w))
        P = Matrix.Translation(V((X.x, X.y, FLOOR))) @ R(psi, 4, 'Z')
        limbs = feet_state(a, P, feet)
        A = V((math.cos(phi), 0, math.sin(phi))); N = V((-math.sin(phi), 0, math.cos(phi)))
        php = min(phi, phis[PUSH1])
        A2 = V((math.cos(php), 0, math.sin(php))); N2 = V((-math.sin(php), 0, math.cos(php)))
        for s, S, sg in SIDES:
            yy = y0 + (-0.11 if s == 'L' else 0.11)
            g = BL.ramp_point(php, BL.RAMP_L - 0.07, 0.045); g.y = yy
            pole = P @ V((sg * 0.55, 0.35, 0.55))
            limbs['hand' + s] = hand_state(a, s, g, -A2 * 0.6 - N2 * 0.4, -N2, pole, w)
        a.key(f, hM, q, limbs, look=BL.ramp_point(phi, BL.RAMP_L * 0.8) if phi < 2.5 else V((-2.5, y0, FLOOR)), look_w=0.6)
    return total, phis


# ---------------------------------------------------------------- סצנות
def scene_common(stop=True, interior_lights=True):
    bus = BL.setup_bus()
    BL.build_street(0.0)
    BL.world_and_sun()
    for l in bus['lights']: l.hide_render = not interior_lights
    return bus


def seated_driver(a, f, t_breathe=0.0, hands_on_wheel=1.0):
    """הנהג יושב, ידיים על ההגה (מערכת האוטובוס)"""
    X = V((0.62, -4.46, BL.FLZ + 0.52 + 0.10 + breathe(f, 0.003)))
    hM = hips_at(a, X, 0.0, -0.10)
    P = Matrix.Translation(V((0.62, -4.46, FLOOR))) @ R(0, 4, 'Z')
    feet = {'L': (V((0.73, -5.0, FLOOR + a.ank_h)), 0.08), 'R': (V((0.51, -5.02, FLOOR + a.ank_h)), -0.05)}
    limbs = feet_state(a, P, feet, poles={'L': V((0.75, -6.0, 1.5)), 'R': V((0.49, -6.0, 1.5))})
    C = V((0.62, -5.05, BL.FLZ + 0.86)); u = V((1, 0, 0)); v = V((0, -0.643, 0.766)); n = V((0, 0.766, 0.643))
    for s, S, sg in SIDES:
        rad = (u * (sg * math.sin(math.radians(60))) + v * math.cos(math.radians(60))).normalized()
        g = C + rad * 0.24 + n * 0.02
        limbs['hand' + s] = hand_state(a, s, g, -n * 0.8 + rad * 0.3, -rad * 0.5 - n * 0.8, V((0.62 + sg * 0.55, -4.4, 1.2)), hands_on_wheel)
    q = arms_pose(a, 1.0, 0.15, fist=(0.8, 0.8))
    return hM, q, limbs


def bvh(name):
    """קובץ ההקלטה לפי שם (BVHS מה-workflow), למשל 16_15"""
    for c in os.environ.get('BVHS', '').split():
        if c.startswith(name + '='): return c.split('=', 1)[1]
    return BVH


def make_walker(name, gender, age, height, skin, hair, clothes, colors, clip, hair_rgb=(0.03, 0.022, 0.016), weight=0.5):
    a = BL.make_human(name, gender=gender, age=age, weight=weight, height=height,
                      race={'caucasian': 0.7, 'african': 0.1, 'asian': 0.2}, skin=skin, hair=hair, clothes=clothes,
                      shoes=('clothes/shoes02/shoes02.mhclo', 'clothes/shoes01/shoes01.mhclo'), cloth_colors=colors, hair_rgb=hair_rgb)
    p = bvh(clip)
    if p: BL.walk_clip(a, p)
    return a


def fk_ankles(a, hM, q):
    """מיקום הקרסוליים בתנוחת FK נתונה (בלי אילוצים)"""
    cons = [c for pb in a.rig.pose.bones for c in pb.constraints]
    old = [c.mute for c in cons]
    for c in cons: c.mute = True
    for pb in a.rig.pose.bones:
        if pb.name != 'Hips': pb.rotation_quaternion = q.get(pb.name, Quaternion())
    loc, rot, _ = (a.hrest.inverted() @ hM).decompose()
    pbh = a.rig.pose.bones['Hips']; pbh.location = loc; pbh.rotation_quaternion = rot
    BL.upd()
    out = {s: a.rig.pose.bones[f'{S}Foot'].head.copy() for s, S, sg in SIDES}
    for c, m in zip(cons, old): c.mute = m
    return out


def walk_path(a, f0, start, psi_of, ground_of, n=None, settle=14, hold_to=None, blend_in=0, idle_from=None):
    """הליכה מההקלטה לאורך מסלול: הכיוון משתנה לפי psi_of(i), הגובה לפי הקרקע מתחת לאגן (מדרגה לרציף/לאוטובוס).
    בסוף ההקלטה — עצירה: הרגליים ננעלות במקומן (IK), האגן מתיישב מעליהן והידיים יורדות"""
    clip = a.clip; n = min(n or len(clip), len(clip))
    P = V((start.x, start.y)); prev = clip[0][0].translation.copy(); last = None
    relax = a.mix([('fist', 0.25)])
    for i in range(n):
        Mh, q = clip[i]
        d = Mh.translation - prev; prev = Mh.translation.copy()
        psi = psi_of(i)
        P += V((d.x * math.cos(psi) - d.y * math.sin(psi), d.x * math.sin(psi) + d.y * math.cos(psi)))
        loc = Mh.copy(); loc.translation = V((0, 0, Mh.translation.z))
        z = ground_of(P)
        hM = Matrix.Translation(V((P.x, P.y, z))) @ R(psi, 4, 'Z') @ loc
        qq = dict(q); qq.update({k: v for k, v in relax.items() if 'Finger' in k or 'Thumb' in k or 'HandIndex' in k})
        if i < blend_in and idle_from is not None:
            t = smooth((i + 1) / (blend_in + 1)); h0, q0 = idle_from
            l0, r0, _ = h0.decompose(); l1, r1, _ = hM.decompose()
            hM = Matrix.Translation(l0.lerp(l1, t)) @ r0.slerp(r1, t).to_matrix().to_4x4()
            qq = {k: q0.get(k, Quaternion()).slerp(v, t) for k, v in qq.items()}
        a.key(f0 + i, hM, qq, None, look_w=0.0)
        last = (hM, qq, psi, P.copy(), z)
    if last is None: return f0
    hM, qq, psi, Pl, z = last
    ank = fk_ankles(a, hM, qq)
    gnd = {s: ground_of(V((ank[s].x, ank[s].y))) for s in ank}
    feet = {s: (V((ank[s].x, ank[s].y, gnd[s] + a.ank_h)), psi) for s in ank}
    mid = (feet['L'][0] + feet['R'][0]) / 2
    Xs = V((mid.x, mid.y, (gnd['L'] + gnd['R']) / 2 + a.stand_h))
    hS = hips_at(a, Xs, psi)
    qS = arms_pose(a, 1.0, 0.0, fist=(0.25, 0.25))
    l0, r0, _ = hM.decompose(); l1, r1, _ = hS.decompose()
    end = hold_to or (f0 + n + settle)
    for j in range(1, end - (f0 + n) + 2):
        f = f0 + n - 1 + j
        t = smooth(j / settle)
        h = Matrix.Translation(l0.lerp(l1, t) + V((0, 0, breathe(f, 0.003)))) @ r0.slerp(r1, t).to_matrix().to_4x4()
        q = {k: qq.get(k, Quaternion()).slerp(v, t) for k, v in qS.items()}
        w = smooth(j / 4)
        P_ = Matrix.Translation(V((Xs.x, Xs.y, 0))) @ R(psi, 4, 'Z')
        limbs = feet_state(a, P_, feet)
        for k_ in limbs: limbs[k_]['w'] = w; limbs[k_]['rw'] = w
        a.key(f, h, q, limbs, look=Xs + fwd_of(psi) * 3 + V((0, 0, 0.6)), look_w=0.3 * t)
    return f0 + n


def stand_idle(a, f_from, f_to, p, psi, look=None):
    hM = None
    for f in range(f_from, f_to + 1):
        X = stand_X(a, p, psi) + V((breathe(f, 0.004, 120), 0, breathe(f, 0.003, 85)))
        hM = hips_at(a, X, psi)
        q = arms_pose(a, 1.0, 0.0, fist=(0.25, 0.25))
        a.key(f, hM, q, feet_state(a, a.placement(p, psi), stand_feet(a, p, psi, 0.02)), look=look, look_w=0.4 if look else 0.0)
    return hM, q


def hide_until(a, f_show, f_hide=None):
    for o in a.meshes + [o for o in bpy.data.objects if o.parent in a.meshes]:
        for f, h in ((1, True), (f_show, False)) + (((f_hide, True),) if f_hide else ()):
            o.hide_render = h; o.keyframe_insert('hide_render', frame=f)


def shot1():
    """האוטובוס מגיע, בולם ועוצר בתחנה ליד העמוד, כורע ופותח דלת; נוסעת יורדת ונוסע עולה; הדלתות נסגרות"""
    bus = scene_common(interior_lights=True)
    N = 252
    v0 = 7.0; tb, ts = 0.6, 4.6
    def wshape(t):
        if t < tb or t > ts: return 0.0
        if t < tb + 0.4: return smooth((t - tb) / 0.4)
        if t > ts - 0.7: return 1.0 - 0.75 * smooth((t - (ts - 0.7)) / 0.7)
        return 1.0
    dt = 1 / 480.; ints = sum(wshape(i * dt) * dt for i in range(int(7 / dt)))
    A = v0 / ints
    s = 0.0; v = v0; th = 0.0; thd = 0.0; samples = {}
    om = 2 * math.pi * 0.9; ze = 0.35; kp = math.radians(0.6)
    for i in range(int((N / 24 + 0.1) / dt)):
        t = i * dt; a_ = A * wshape(t) if v > 0 else 0.0
        v = max(0.0, v - a_ * dt); s += v * dt
        thdd = -om * om * (th - kp * a_) - 2 * ze * om * thd; thd += thdd * dt; th += thd * dt
        fr = t * 24 + 1
        if abs(fr - round(fr)) < dt * 12 and round(fr) not in samples: samples[round(fr)] = (s, th, v)
    D = max(x[0] for x in samples.values())
    bus['y0'] = D
    F_STOP = int(ts * 24) + 1; F_OPEN = F_STOP + 6
    for f in range(1, N + 1):
        s_, th_, v_ = samples.get(f, samples[max(samples)])
        kneel = KNEEL * smooth((f - F_STOP - 2) / 18)
        BL.drive(bus, f, D - s_, pitch=th_, kneel=kneel, bounce=0.004 * math.sin(f * 1.7) * min(1, v_ / 3))
        BL.key_ramp(bus, f, 0.0); BL.key_pan(bus, f, 0.0)
    log('shot1 distance', round(D, 2), 'decel', round(A, 2), 'stop frame', F_STOP)
    drv = make_driver(); prep(drv, bus['body'])
    for f in range(1, N + 1):
        hM, q, limbs = seated_driver(drv, f, hands_on_wheel=1.0 if f < F_STOP + 4 else 0.0 if f > F_STOP + 14 else 1 - (f - F_STOP - 4) / 10)
        drv.key(f, hM, q, limbs, look=V((0.3, -12, 1.8)) if f < F_STOP + 10 else V((-1.6, -2.5, 1.5)), look_w=0.45)
    chair = make_chair(); rider = make_chair_user(); prep(rider, chair['root'])
    chair['root'].location = (-3.4, 0.55, BL.PLAT_Z); chair['root'].rotation_euler = (0, 0, math.pi / 2)
    for f in range(1, N + 1):
        hM, q, limbs = rider_pose(rider, f, None, None, lap=1.0)
        rider.key(f, hM, q, limbs, look=V((0.0, -0.3, 1.15)) if f > F_STOP - 30 else V((0.0, 20, 1.2)), look_w=0.5)
    fl = FLOOR - KNEEL
    def ground(P):
        t = smooth((P.x - (-1.55)) / 0.5)            # מהרציף (‎-X) לרצפת האוטובוס
        return BL.PLAT_Z + (fl - BL.PLAT_Z) * t
    # נוסעת יורדת
    wa = make_walker('Exit', 0.0, 0.35, 0.45, ('skins/young_caucasian_female/young_caucasian_female.mhmat',),
                     ('hair/ponytail01/ponytail01.mhclo', 'hair/bob02/bob02.mhclo'),
                     (('clothes/female_casualsuit01/female_casualsuit01.mhclo',),), [((0.12, 0.3, 0.45), (0.15, 0.15, 0.2), 'waist'), None], '16_15', hair_rgb=(0.12, 0.07, 0.03))
    prep(wa, None)
    fA = F_OPEN + 10
    pA = V((-0.35, -0.1, fl)); psiA0 = -math.pi / 2
    hide_until(wa, fA - 8)
    stand_idle(wa, 1, fA, pA, psiA0)
    def psiA(i): return psiA0 + (math.pi / 2 - 0.42) * smooth((i - 26) / 26)
    endA = walk_path(wa, fA + 1, pA, psiA, ground, hold_to=N, blend_in=6, idle_from=None)
    # נוסע עולה
    wb = make_walker('Board', 1.0, 0.45, 0.6, ('skins/middleage_caucasian_male/middleage_caucasian_male.mhmat',),
                     ('hair/short04/short04.mhclo',), (('clothes/male_casualsuit03/male_casualsuit03.mhclo', 'clothes/male_casualsuit01/male_casualsuit01.mhclo'),),
                     [((0.55, 0.5, 0.42), (0.1, 0.12, 0.18), 'waist'), None], '35_01')
    prep(wb, None)
    pB = V((-2.6, 1.2, BL.PLAT_Z)); psiB0 = math.atan2(0.62, 0.78)
    fB = fA + 30
    idle = stand_idle(wb, 1, fB, pB, psiB0, look=V((-1.3, 0.0, 1.5)))
    def psiB(i): return psiB0 + (math.pi / 2 - psiB0) * smooth((i - 6) / 16) - (math.pi / 2) * smooth((i - 40) / 20)
    endB = walk_path(wb, fB + 1, pB, psiB, ground, hold_to=N, blend_in=6, idle_from=idle)
    F_CLOSE = fB + 52
    for f in range(1, N + 1):
        t = smooth((f - F_OPEN) / 16) * (1 - smooth((f - F_CLOSE) / 16))
        BL.door_open(bus, f, t)
    log('shot1 open', F_OPEN, 'A', fA, endA, 'B', fB, endB, 'close', F_CLOSE)
    cam = BL.camera('Cam1', (-6.2, -9.6, 1.7), (0, 10, 1.5), lens=30)
    for f in range(1, N + 1, 2):
        yb = D - samples.get(f, samples[max(samples)])[0]
        k = smooth((f - (F_STOP - 30)) / 40)
        tgt = V((-0.4, yb - 1.5, 1.4)).lerp(V((-1.4, -1.2, 1.25)), k)
        BL.aim_cam(cam, f, (-6.2, -9.6, 1.7), tgt)
    BL.render_setup(blur=True)
    return N, lambda f: cam


# ---------------------------------------------------------------- כיסא גלגלים ורוכבת
def make_chair():
    if CHAIR_SRC:
        try:
            import busanim_chair
            c = busanim_chair.load_chair(CHAIR_SRC)
            if c: log('chair: using imported model'); return c
        except Exception as e:
            import traceback; traceback.print_exc(); log('chair import failed', e)
    log('chair: using built model')
    return BL.make_wheelchair()


def rider_pose(a, f, hands, lean, lap=0.0):
    """הרוכבת יושבת (מערכת הכיסא). hands: {'L': (grip, w)} על טבעות ההנעה; lap: ידיים על הברכיים"""
    X = V((0, -0.06, 0.60 + breathe(f, 0.003)))
    bend = 0.06 + (lean or 0.0)
    hM = hips_at(a, X, 0.0, bend)
    P = Matrix.Translation(V((0, -0.06, 0))) @ R(0, 4, 'Z')
    feet = {'L': (V((0.1, -0.56, 0.125 + a.ank_h)), 0.05), 'R': (V((-0.1, -0.56, 0.125 + a.ank_h)), -0.05)}
    limbs = feet_state(a, P, feet, poles={'L': V((0.16, -1.4, 0.9)), 'R': V((-0.16, -1.4, 0.9))})
    q = arms_pose(a, 1.0, 0.2 + (lean or 0) * 1.5, fist=(0.5, 0.5))
    for s, S, sg in SIDES:
        if hands and hands.get(s):
            g, w = hands[s]
            limbs['hand' + s] = hand_state(a, s, g, (sg * 0.35, -0.45, -0.8), (sg * 0.9, 0.0, -0.45), V((sg * 0.65, 0.45, 0.75)), w)
        if lap:
            g = V((sg * 0.12, -0.36, 0.73))
            limbs['hand' + s] = hand_state(a, s, g, (sg * -0.15, -1.0, -0.25), (0, 0, -1), V((sg * 0.6, 0.2, 0.6)), lap)
    return hM, q, limbs


def ground_s2(x):
    fl = FLOOR - KNEEL
    phi = BL.ramp_deploy_angle(); xe = BL.HINGE_X + BL.RAMP_L * math.cos(phi)
    ze = fl + 0.006 + BL.RAMP_L * math.sin(phi)
    if x >= BL.HINGE_X: return fl
    if x >= xe: return fl + 0.006 + (ze - fl - 0.006) * (BL.HINGE_X - x) / (BL.HINGE_X - xe)
    return BL.PLAT_Z


def chair_path(f0):
    """מסלול הכיסא: ישר במעלה הרמפה, קשת ימינה, עצירה ונסיעה לאחור אל המקום. מחזיר רשימת מצבים לפי פריים"""
    segs = []
    x0, x1 = -3.35, 0.42
    def vbase(x):
        if x < -2.33: return 0.55
        if x < BL.HINGE_X: return 0.36
        return 0.62
    states = []; s_tot = 0.0; t = 0.0; ph = 0.0; T = 0.95; dt = 1 / 240.
    pos = V((x0, 0.0)); head = 0.0     # head: זווית הכיוון (0 = ‎+X)
    seg = 0; arc_a = 0.0; rev = 0.0; pause = 0
    rc, cc = 0.3, V((0.42, -0.3))
    while True:
        pulse = max(0.0, math.sin(2 * math.pi * ph)) ** 1.5
        if seg == 0:
            v = vbase(pos.x) * (0.72 + 0.6 * pulse); pos.x += v * dt
            if pos.x >= x1: seg = 1; pos.x = x1
        elif seg == 1:
            v = 0.5 * (0.72 + 0.6 * pulse); arc_a += v * dt / rc
            if arc_a >= math.pi / 2: arc_a = math.pi / 2; seg = 2; pause = 0
            pos = cc + V((rc * math.sin(arc_a), rc * math.cos(arc_a))); head = -arc_a
        elif seg == 2:
            v = 0.0; pause += 1
            if pause > 240 * 0.45: seg = 3
        elif seg == 3:
            v = -0.32 * (0.72 + 0.6 * pulse); rev += -v * dt; pos = V((0.72, -0.3 + rev))
            if rev >= 0.42: seg = 4; pause = 0
        else:
            v = 0.0; pause += 1
            if pause > 240 * 0.5: break
        if seg != 2 and seg != 4: ph += dt / T
        t += dt
        states.append((pos.copy(), head, v, seg, ph))
    out = {}
    for i, st in enumerate(states[::10]):
        out[f0 + i] = st
    return out


def chair_pose_frames(chair, rider, path, f_from, f_to):
    """מניע את הכיסא לאורך המסלול: גובה ונטייה לפי הקרקע מתחת לגלגלים, סיבוב כל גלגל לפי המרחק שלו,
    וידיים על טבעות ההנעה בשלב הדחיפה"""
    root = chair['root']; ang = {1: 0.0, -1: 0.0}; prev = None
    grab = {1: None, -1: None}; hand_prev = {1: None, -1: None}
    keys = sorted(k for k in path if f_from <= k <= f_to)
    last_f = keys[-1]
    for f in range(f_from, f_to + 1):
        pos, head, v, seg, ph = path[min(f, last_f)]
        psi = head + math.pi / 2           # מהכיוון ‎+X (head=0) ל-psi של הכיסא (החזית ל--Y המקומי)
        fw = V((math.cos(head), math.sin(head), 0)); left = V((-math.sin(head), math.cos(head), 0))
        rear = V((pos.x, pos.y, 0)); front = rear + fw * 0.48
        gr, gf = ground_s2(rear.x), ground_s2(front.x)
        pitch = math.atan2(gf - gr, 0.48)
        root.location = (pos.x, pos.y, gr); root.rotation_euler = (-pitch, 0, psi)
        root.keyframe_insert('location', frame=f); root.keyframe_insert('rotation_euler', frame=f)
        # הגלגלים: X המקומי של הכיסא הוא שמאל הרוכבת (‎+X = ‎-right)
        for sd in (1, -1):
            wp = rear + (-right_of(psi)) * (sd * BL.CH_TRACK)
            if prev is not None:
                dd = (wp - prev[sd]).dot(fw)
                ang[sd] += dd / BL.CH_R
            chair['wheels'][sd].rotation_euler = (ang[sd], 0, 0); chair['wheels'][sd].keyframe_insert('rotation_euler', frame=f)
        for sd, cw in chair.get('casters', {}).items():
            cw.rotation_euler = ((ang[1] + ang[-1]) / 2 * BL.CH_R / 0.065, 0, 0); cw.keyframe_insert('rotation_euler', frame=f)
        prev = {sd: rear + (-right_of(psi)) * (sd * BL.CH_TRACK) for sd in (1, -1)}
        # ידיים: שלב דחיפה (0..0.45 במחזור) — היד נעולה על הטבעת; שלב חזרה — קשת באוויר אל נקודת האחיזה הבאה
        phase = ph % 1.0; pushing = phase < 0.45 and seg in (0, 1, 3)
        hands = {}
        for sd, s in ((1, 'L'), (-1, 'R')):
            if pushing:
                if grab[sd] is None or grab[sd][2] != int(ph):
                    th_g = math.radians(108 if v >= 0 else 58)
                    grab[sd] = (th_g, ang[sd], int(ph))
                th = grab[sd][0] - (ang[sd] - grab[sd][1])
                g = BL.rim_point(0, sd, th); hand_prev[sd] = (g, f)
                hands[s] = (g, 1.0)
            else:
                grab[sd] = None
                th_next = math.radians(108 if seg in (0, 1) else 58)
                nxt = BL.rim_point(0, sd, th_next)
                if hand_prev[sd] is None: hand_prev[sd] = (nxt, f)
                t = min(1.0, (phase - 0.45) / 0.5) if seg in (0, 1, 3) else 1.0
                g = hand_prev[sd][0].lerp(nxt, smooth(t)) + V((sd * 0.05, 0.0, 0.07)) * math.sin(math.pi * t)
                hands[s] = (g, 1.0 if seg in (0, 1, 3) else 0.6)
        lean = 0.10 * math.sin(math.pi * min(1, phase / 0.45)) if pushing else 0.02
        if seg in (2, 4): lean = 0.0
        hM, q, limbs = rider_pose(rider, f, hands, lean)
        rider.key(f, hM, q, limbs, look=V((0, -2.5, 1.0)), look_w=0.5)


def shot2():
    """עלייה של כיסא גלגלים: הדלת נפתחת, הנהג מוציא את הרמפה, הכיסא עולה ונכנס למקום, הרמפה מתקפלת והדלתות נסגרות"""
    bus = scene_common()
    phi_d = BL.ramp_deploy_angle()
    drv = make_driver(); prep(drv, bus['body'])
    chair = make_chair(); rider = make_chair_user(); prep(rider, chair['root'])
    FA0 = 1
    # A: דלתות נפתחות והנהג מוציא את הרמפה
    for f in range(1, 400):
        BL.drive(bus, f, 0.0, kneel=KNEEL); BL.key_pan(bus, f, math.pi / 2)
        BL.door_open(bus, f, smooth((f - 1) / 16))
    nA, phis = driver_flip(drv, bus, 8, fx=0.12)
    for f in range(1, 8): BL.key_ramp(bus, f, 0.0)
    for f in range(1, 8):
        X = stand_X(drv, V((0.17, 0, FLOOR)), -math.pi / 2)
        drv.key(f, hips_at(drv, X, -math.pi / 2), arms_pose(drv), feet_state(drv, drv.placement(V((0.12, 0, FLOOR)), -math.pi / 2),
                {'L': (V((0.16, -0.14, FLOOR + drv.ank_h)), -math.pi / 2 + 0.12), 'R': (V((0.10, 0.14, FLOOR + drv.ank_h)), -math.pi / 2 - 0.12)}))
    fB = 8 + nA + 1
    for f in range(fB, 400): BL.key_ramp(bus, f, phi_d)
    # B/C: הנהג עומד בצד, יד על המוט; הכיסא עולה
    path = chair_path(fB)
    f_end_path = max(path)
    # נקודת החיתוך B→C: כשהכיסא עובר את הסף
    fC = next(f for f in sorted(path) if path[f][0].x > BL.HINGE_X + 0.15)
    psi_d = -math.pi / 2 + 0.5
    pd = V((-0.02, 1.0, FLOOR))
    fD = f_end_path + 1
    for f in range(fB, fD):
        X = stand_X(drv, pd, psi_d) + V((breathe(f, 0.006, 110), 0, breathe(f, 0.004, 80)))
        q = arms_pose(drv, 1.0, 0.05, fist=(0.8, 0.3))
        limbs = feet_state(drv, drv.placement(pd, psi_d), stand_feet(drv, pd, psi_d, 0.02))
        polep = V((-0.5, 0.7, FLOOR + 1.12)); sh = stand_X(drv, pd, psi_d)
        n_ = V((polep.x - sh.x, polep.y - sh.y, 0)).normalized()
        limbs['handL'] = hand_state(drv, 'L', polep - n_ * 0.035, -n_.cross(V((0, 0, 1))), n_, drv.placement(pd, psi_d) @ V((0.55, 0.2, 0.6)))
        ch = path.get(f)
        look = V((ch[0].x, ch[0].y, FLOOR + 0.6)) if ch else V((-2.5, 0, 0.8))
        drv.key(f, hips_at(drv, X, psi_d), q, limbs, look=look, look_w=0.7)
    for f in range(1, fB):        # הכיסא מחכה ברציף
        st = path[fB]
        chair['root'].location = (st[0].x, st[0].y, BL.PLAT_Z); chair['root'].rotation_euler = (0, 0, math.pi / 2)
        chair['root'].keyframe_insert('location', frame=f); chair['root'].keyframe_insert('rotation_euler', frame=f)
        hM, q, limbs = rider_pose(rider, f, None, None, lap=1.0)
        rider.key(f, hM, q, limbs, look=V((0.3, -0.5, 1.1)), look_w=0.5)
    chair_pose_frames(chair, rider, path, fB, fD + 120)
    # D: הנהג מקפל את הרמפה חזרה עם הרצועה, והדלתות נסגרות
    nD = fold_back(drv, bus, fD)
    N = fD + nD
    for f in range(fD + nD - 18, N + 1): BL.door_open(bus, f, 1 - smooth((f - (fD + nD - 18)) / 16))
    ext = BL.camera('CamA', (-2.9, -4.7, 1.55), (-1.35, 0.2, 1.0), lens=24)
    side = BL.camera('CamB', (-2.3, -3.7, 1.2), (-2.0, 0.0, 0.85), lens=24)
    inn = BL.camera('CamC', (0.0, -1.75, 2.0), (0.15, 0.25, 0.75), lens=20, parent=bus['body'])
    strap_pass(drv, bus)
    log('shot2 cuts', 'B', fB, 'C', fC, 'D', fD, 'N', N)
    BL.render_setup()
    def cam_for(f):
        if f < fB: return ext
        if f < fC: return side
        if f < fD: return inn
        return ext
    return N, cam_for


def fold_back(a, bus, f0):
    """קיפול הרמפה חזרה: הנהג בפתח, תופס את הרצועה, מושך עד שהרמפה עוברת את האנך, נסוג אחורה ומוריד אותה לרצפה"""
    psi = -math.pi / 2; phi_d = BL.ramp_deploy_angle(); Ls = 0.75
    anc = lambda phi: BL.ramp_point(phi, 0.85, -0.006)
    fx0, fx1 = -0.92, 0.22
    # צעדים לאחור (פונה ל--X, הולך ל-‎+X)
    fl = FLOOR
    def ft(x, s): return V((x, (-0.14 if s == 'L' else 0.14), fl + a.ank_h))
    stepsL = [(0, ft(fx0, 'L'), psi), (40, ft(fx0, 'L'), psi), (48, ft(-0.55, 'L'), psi), (54, ft(-0.55, 'L'), psi), (62, ft(-0.05, 'L'), psi), (66, ft(-0.05, 'L'), psi), (74, ft(fx1, 'L'), psi)]
    stepsR = [(0, ft(fx0 + 0.06, 'R'), psi), (44, ft(fx0 + 0.06, 'R'), psi), (52, ft(-0.3, 'R'), psi), (58, ft(-0.3, 'R'), psi), (66, ft(0.15, 'R'), psi), (70, ft(0.15, 'R'), psi), (78, ft(fx1 + 0.04, 'R'), psi)]
    nT = 96
    st = a.stand_h
    hipk = [(0, V((fx0 + 0.05, 0, fl + st))), (8, V((fx0 + 0.28, 0, fl + 0.55))), (14, V((fx0 + 0.28, 0, fl + 0.55))), (30, V((fx0 + 0.12, 0, fl + st - 0.04))),
            (40, V((fx0 + 0.16, 0, fl + st - 0.02))), (52, V((-0.42, 0, fl + st - 0.06))), (64, V((-0.05, 0, fl + st - 0.1))), (76, V((0.22, 0, fl + st - 0.12))),
            (86, V((0.24, 0, fl + st))), (nT, V((0.24, 0, fl + st)))]
    bendk = [(0, 0.0), (8, 0.7), (14, 0.7), (30, 0.1), (40, 0.0), (64, 0.25), (76, 0.45), (86, 0.05), (nT, 0.0)]
    # היד: מהרצועה המונחת על הרמפה (r=0.1), למעלה ולאחור
    rest = lambda phi: BL.ramp_point(phi, 0.85 - Ls, -0.012)
    handk = [(0, rest(phi_d)), (12, rest(phi_d)), (30, V((-0.80, 0.0, fl + 1.05))), (40, V((-0.62, 0.0, fl + 1.32)))]
    phi_lower = [(40, None), (78, 0.40)]
    phis = {}; hands = {}
    for d in range(0, nT + 1):
        if d <= 40:
            H = ease_keys(handk, d)
            # זווית הרמפה כך שהרצועה מתוחה (או רפויה כשהיד קרובה)
            phi = phi_d
            if (anc(phi_d) - H).length > Ls:
                lo, hi = math.radians(85), phi_d
                for _ in range(40):
                    m = (lo + hi) / 2
                    if (anc(m) - H).length > Ls: hi = m
                    else: lo = m
                phi = lo
            phis[d] = phi; hands[d] = H
        elif d <= 78:
            p0 = phis[40]; t = (d - 40) / 38
            phi = p0 + (0.40 - p0) * (t ** 1.1 * (3 - 2 * t) if t < 1 else 1)
            phis[d] = phi
            X = ease_keys(hipk, d)
            chest = X + V((0, 0, 0.42))
            u = (chest - anc(phi)); u = u.normalized()
            hands[d] = anc(phi) + u * Ls
        else:
            # שחרור: הרמפה נופלת את הסנטימטרים האחרונים לרצפה
            prev = phis[d - 1]; phis[d] = max(0.0, prev - 0.06 * (d - 78))
            hands[d] = hands[78]
    hw = [(0, 0.0), (6, 0.0), (12, 1.0), (78, 1.0), (84, 0.0), (nT, 0.0)]
    for d in range(0, nT + 1):
        f = f0 + d
        BL.key_ramp(bus, f, phis[d])
        X = ease_keys(hipk, d); bend = ease_keys(bendk, d); w = ease_keys(hw, d)
        hM = hips_at(a, X, psi, bend)
        q = arms_pose(a, 1.0, bend * 1.4, fist=(0.3, 0.3 + 0.6 * w))
        feet = {'L': step_path(stepsL, d), 'R': step_path(stepsR, d)}
        P = Matrix.Translation(V((X.x, X.y, fl))) @ R(psi, 4, 'Z')
        limbs = feet_state(a, P, feet)
        H = hands[d]; dirn = (BL.ramp_point(phis[d], 0.85, -0.006) - H)
        fdir = dirn.normalized() if dirn.length > 0.05 else V((-1, 0, 0))
        limbs['handR'] = hand_state(a, 'R', H, fdir, V((0, 0, 1)) - fdir * fdir.z, P @ V((-0.55, 0.3, 0.6)), w)
        a.key(f, hM, q, limbs, look=BL.ramp_point(phis[d], 0.7), look_w=0.6)
    # הרצועה: מהעוגן ברמפה אל כף היד (או מונחת על הרמפה)
    strap_m = BL.mat('M_RampStrap', (0.02, 0.02, 0.025), 0.8)
    strap = BL.box('RampStrap', (0.035, 1.0, 0.004), (0, 0.5, 0), strap_m, bus['body']); strap.rotation_mode = 'QUATERNION'
    a._strap = (strap, f0, nT, hw)
    return nT


def strap_pass(a, bus):
    """מעבר שני: אחרי שכל המפתחות קיימים, הרצועה נמתחת מהעוגן אל כף היד בפועל (כולל ה-IK)"""
    strap, f0, nT, hw = a._strap
    Binv = bus['body'].matrix_world.inverted()
    for f in list(range(1, f0)) + list(range(f0, f0 + nT + 1)):
        BL.SC.frame_set(f); BL.upd()
        piv = bus['ramp']['pivot']
        Mp = Binv @ piv.matrix_world
        A = Mp @ V((0.85, 0, -0.006))
        Rst = Mp @ V((0.85 - 0.75, 0, -0.012))
        w = ease_keys(hw, f - f0) if f >= f0 else 0.0
        Hh = Binv @ a.bone_world('RightHand', 1.0)
        E = Rst.lerp(Hh, w)
        d = E - A; ln = max(0.02, d.length)
        strap.location = A; strap.rotation_quaternion = V((0, 1, 0)).rotation_difference(d.normalized())
        strap.scale = (1, ln, 1)
        strap.keyframe_insert('location', frame=f); strap.keyframe_insert('rotation_quaternion', frame=f); strap.keyframe_insert('scale', frame=f)


def shot3():
    """הנהג קם, הולך לאזור כיסא הגלגלים, מקפל את המושב המתקפל, מוציא את הרמפה וחוזר"""
    bus = scene_common()
    drv = make_driver()
    if bvh('16_15'): BL.walk_clip(drv, bvh('16_15'))
    prep(drv, bus['body'])
    C1, C2, C3, C4 = 1, 55, 103, 159
    for f in range(1, 330):
        BL.drive(bus, f, 0.0, kneel=KNEEL)
        BL.door_open(bus, f, smooth((f - C3 - 4) / 18))
    # C1: קם מהמושב
    seatX = V((0.62, -4.46, BL.FLZ + 0.62)); psiE = -math.pi / 2 + 0.15
    feet0 = {'L': (V((0.73, -5.0, FLOOR + drv.ank_h)), 0.08), 'R': (V((0.51, -5.02, FLOOR + drv.ank_h)), -0.05)}
    footL = [(0, feet0['L'][0], 0.08), (24, feet0['L'][0], 0.08), (32, V((0.40, -4.40, FLOOR + drv.ank_h)), psiE), (54, V((0.40, -4.40, FLOOR + drv.ank_h)), psiE)]
    footR = [(0, feet0['R'][0], -0.05), (16, feet0['R'][0], -0.05), (25, V((0.30, -4.70, FLOOR + drv.ank_h)), psiE - 0.1), (54, V((0.30, -4.70, FLOOR + drv.ank_h)), psiE - 0.1)]
    psik = [(0, 0.0), (16, 0.0), (32, psiE), (54, psiE)]
    hipk = [(0, seatX), (16, seatX), (30, V((0.52, -4.52, BL.FLZ + 0.62))), (36, V((0.46, -4.55, BL.FLZ + 0.63))), (48, V((0.33, -4.55, FLOOR + drv.stand_h))), (54, V((0.33, -4.55, FLOOR + drv.stand_h)))]
    bendk = [(0, -0.1), (16, -0.05), (30, 0.1), (38, 0.55), (48, 0.05), (54, 0.0)]
    for d in range(0, 54):
        f = C1 + d
        hM0, q0, limbs0 = seated_driver(drv, f)
        hw = ease_keys([(0, 1.0), (10, 1.0), (20, 0.0)], d)
        psi = ease_keys(psik, d); X = ease_keys(hipk, d); bend = ease_keys(bendk, d)
        hM = hips_at(drv, X, psi, bend)
        q = arms_pose(drv, 1.0, max(0.0, bend) * 0.8, fist=(0.3 + 0.5 * hw, 0.3 + 0.5 * hw))
        feet = {'L': step_path(footL, d), 'R': step_path(footR, d)}
        P = Matrix.Translation(V((X.x, X.y, FLOOR))) @ R(psi, 4, 'Z')
        sitting = 1 - smooth((d - 34) / 12)
        poles = {s: (P @ V((sg * 0.16, -1.0, 0.55))) for s, S, sg in SIDES}
        limbs = feet_state(drv, P, feet, poles)
        for s in ('L', 'R'):
            h = dict(limbs0['hand' + s]); h['w'] = hw; h['rw'] = hw; limbs['hand' + s] = h
        drv.key(f, hM, q, limbs, look=V((0.0, -2.0, 1.9)) if d > 20 else V((0.3, -12, 1.8)), look_w=0.5)
    # C2: הליכה במעבר אל הדלת האמצעית (תנועה מצולמת)
    walk(drv, C2, C3 - C2, V((0.0, -3.75, FLOOR)), math.pi)
    # C3: מקפל את המושב המתקפל
    nC3 = fold_seat(drv, bus, C3)
    assert C3 + nC3 < C4 + 1
    for f in range(1, C3): BL.key_pan(bus, f, 0.0)
    for f in range(C3 + nC3, 330): BL.key_pan(bus, f, math.pi / 2)
    # C4: הרמפה
    for f in range(1, C4): BL.key_ramp(bus, f, 0.0)
    nC4, phis = driver_flip(drv, bus, C4, fx=0.12, n_after=20)
    C5 = C4 + nC4 + 1
    for f in range(C5, 330): BL.key_ramp(bus, f, BL.ramp_deploy_angle())
    # C5: חוזר לתא הנהג
    n5 = 44
    walk(drv, C5, n5, V((0.02, -0.55, FLOOR)), 0.0)
    N = C5 + n5 - 1
    cams = [(C1, BL.camera('Cam31', (-0.35, -5.6, 2.35), (0.55, -4.5, 1.35), lens=22, parent=bus['body'])),
            (C2, BL.camera('Cam32', (0.12, 1.2, 1.75), (0.0, -3.0, 1.4), lens=30, parent=bus['body'])),
            (C3, BL.camera('Cam33', (-0.9, -0.3, 1.75), (0.85, -0.1, 0.8), lens=20, parent=bus['body'])),
            (C4, BL.camera('Cam34', (0.95, 1.55, 1.8), (-0.75, -0.1, 1.0), lens=22, parent=bus['body'])),
            (C5, BL.camera('Cam35', (0.25, -3.95, 1.72), (0.0, -0.5, 1.35), lens=26, parent=bus['body']))]
    log('shot3 cuts', [c for c, _ in cams], 'N', N)
    BL.render_setup()
    def cam_for(f):
        c = cams[0][1]
        for f0, cm in cams:
            if f >= f0: c = cm
        return c
    return N, cam_for


def walk(a, f0, n, start, psi, u0=0):
    if not a.clip:
        log('no walk clip — sliding');
        for i in range(n):
            p = start + fwd_of(psi) * (i * 0.045)
            a.key(f0 + i, hips_at(a, stand_X(a, p, psi), psi), arms_pose(a), feet_state(a, a.placement(p, psi), stand_feet(a, p, psi)))
        return
    T = Matrix.Translation(start) @ R(psi, 4, 'Z')
    for i in range(n):
        Mh, q = a.clip[min(u0 + i, len(a.clip) - 1)]
        a.key(f0 + i, T @ Mh, q, None, look_w=0.0)


def fold_seat(a, bus, f0):
    """הנהג מתכופף, מרים את המושב המתקפל מהשפה הקדמית, דוחף אותו לאנך ומזדקף"""
    p = V((0.44, -0.46, FLOOR)); tgt = BL.pan_edge(0.0)
    dirv = (V((tgt.x, tgt.y, 0)) - V((p.x, p.y, 0))).normalized()
    psi = math.atan2(dirv.x, -dirv.y)
    n = 54
    feet = stand_feet(a, p, psi, 0.03, (0.04, -0.04))
    st = a.stand_h
    fw = fwd_of(psi)
    hipk = [(0, p + V((0, 0, st))), (6, p + V((0, 0, st))), (16, p + V((0, 0, st - 0.2)) - fw * 0.12), (20, p + V((0, 0, st - 0.2)) - fw * 0.12),
            (32, p + V((0, 0, st - 0.08)) - fw * 0.04), (38, p + V((0, 0, st - 0.04)) + fw * 0.04), (48, p + V((0, 0, st))), (n, p + V((0, 0, st)))]
    bendk = [(0, 0.0), (6, 0.0), (16, 0.75), (20, 0.75), (32, 0.4), (38, 0.25), (48, 0.0), (n, 0.0)]
    phik = [(0, 0.0), (20, 0.0), (32, 1.05), (38, 1.45), (40, math.pi / 2), (n, math.pi / 2)]
    hw = [(0, 0.0), (8, 0.0), (16, 1.0), (38, 1.0), (46, 0.0), (n, 0.0)]
    for d in range(0, n + 1):
        f = f0 + d
        phi = ease_keys(phik, d); BL.key_pan(bus, f, phi)
        X = ease_keys(hipk, d); bend = ease_keys(bendk, d); w = ease_keys(hw, d)
        hM = hips_at(a, X, psi, bend)
        q = arms_pose(a, 1.0, bend * 1.3, fist=(0.3, 0.3 + 0.5 * w))
        P = Matrix.Translation(V((X.x, X.y, FLOOR))) @ R(psi, 4, 'Z')
        limbs = feet_state(a, P, feet)
        php = min(phi, 1.45)
        A = V((0, -math.cos(php), math.sin(php))); N = V((0, math.sin(php), math.cos(php)))
        g = BL.pan_edge(php)
        limbs['handR'] = hand_state(a, 'R', g, -A * 0.3 - N * 0.7 if php < 0.6 else -A * 0.2 + N * 0.6, -A, P @ V((-0.55, 0.25, 0.5)), w)
        a.key(f, hM, q, limbs, look=BL.pan_edge(phi) + V((0, 0, -0.1)), look_w=0.6)
    return n


def shot4():
    """נוסעים עומדים באוטובוס נוסע, מחזיקים ברצועות ובמוט, ומתנדנדים עם התאוטה וההאצה"""
    bus = scene_common()
    body = bus['body']; N = 120
    # דינמיקה: שיוט, בלימה, האצה
    def acc(t):
        if t < 0.8: return 0.0
        if t < 2.5: return -1.7 * smooth((t - 0.8) / 0.3) * (1 - smooth((t - 2.2) / 0.3))
        if t < 2.9: return 0.0
        return 1.1 * smooth((t - 2.9) / 0.4)
    dt = 1 / 240.; v = 8.0; y = 34.0; lam = 0.0; lamd = 0.0; gam = 0.0; gamd = 0.0; th = 0.0; thd = 0.0
    S = {}; rnd = random.Random(3); lat = 0.0; latd = 0.0
    for i in range(int((N / 24 + 0.2) / dt)):
        t = i * dt; a_ = acc(t); v += a_ * dt; y -= v * dt
        arel = -a_
        om = 2 * math.pi * 0.8; lamdd = -om * om * (lam - 0.035 * arel) - 2 * 0.55 * om * lamd; lamd += lamdd * dt; lam += lamd * dt
        g = 9.81; l = 0.2; w0 = math.sqrt(g / l)
        gdd = -w0 * w0 * gam - 2 * 0.12 * w0 * gamd + arel / l; gamd += gdd * dt; gam += gamd * dt
        om2 = 2 * math.pi * 0.9; thdd = -om2 * om2 * (th - math.radians(0.5) * (-a_)) - 2 * 0.35 * om2 * thd; thd += thdd * dt; th += thd * dt
        latdd = -40 * lat - 6 * latd + rnd.uniform(-1, 1) * 6; latd += latdd * dt; lat += latd * dt
        fr = round(t * 24 + 1)
        if fr not in S: S[fr] = (y, lam, gam, th, lat, v)
    bus['y0'] = S[1][0]
    for f in range(1, N + 1):
        y_, lam, gam, th, lat, v_ = S[f]
        BL.drive(bus, f, y_, pitch=th, bounce=0.006 * math.sin(f * 1.3) * math.sin(f * 0.37), roll=lat * 0.15)
        BL.key_ramp(bus, f, 0.0); BL.key_pan(bus, f, 0.0); BL.door_open(bus, f, 0.0)
    # רצועות: כל רצועה על ציר בתקרה, מתנדנדת עם התאוטה
    straps = {}
    for sd in (1, -1):
        for k in range(14):
            st = bpy.data.objects.get(f'SM_Strap{sd}{k}'); rg = bpy.data.objects.get(f'SM_StrapRing{sd}{k}')
            if not st or not rg: continue
            yv = BL.YF + 2.2 + k * 0.62
            piv = BL.empty(f'StrapPiv{sd}{k}', (sd * 0.5, yv, BL.ZT - 0.03), body, size=0.03); piv.rotation_mode = 'XYZ'
            BL.upd()
            for o in (st, rg):
                o.parent = piv; o.matrix_parent_inverse = Matrix.Translation(-piv.location)
            straps[(sd, k)] = piv
    held = {(-1, 9): 'Pass1', (-1, 13): 'Pass3'}
    ppl = make_passengers()
    for a in ppl: prep(a, body)
    P1, P2, P3 = ppl
    specs = {
        'Pass1': dict(p=V((-0.12, 2.0, FLOOR)), psi=0.0),
        'Pass2': dict(p=V((0.05, 3.28, FLOOR)), psi=math.pi / 2),
        'Pass3': dict(p=V((-0.1, 4.12, FLOOR)), psi=-math.pi / 2),
    }
    for f in range(1, N + 1):
        y_, lam, gam, th, lat, v_ = S[f]
        for (sd, k), piv in straps.items():
            if (sd, k) in held:
                ang = 0.35 * lam; rz = math.pi / 2 if held[(sd, k)] == 'Pass3' else 0.0
            else:
                ang = gam; rz = 0.0
            piv.rotation_euler = (-ang, 0, rz); piv.keyframe_insert('rotation_euler', frame=f)
    BL.upd()
    for idx, a in enumerate(ppl):
        sp = specs[a.name]; p, psi = sp['p'], sp['psi']
        feet = stand_feet(a, p, psi, 0.02, (0.03 * (idx - 1), -0.05))
        for f in range(1, N + 1):
            y_, lam, gam, th, lat, v_ = S[max(1, f - idx)]
            d = V((lat * 0.6 + breathe(f, 0.004, 100 + 13 * idx, idx), -lam * 0.85, breathe(f, 0.003, 85 + 7 * idx)))
            tilt = R(lam * 0.55, 4, 'X') @ R(-lat * 0.4, 4, 'Y')
            X = stand_X(a, p, psi) + d
            hM = Matrix.Translation(X) @ tilt @ R(psi, 4, 'Z') @ a.hrest.to_3x3().to_4x4()
            P = a.placement(p, psi)
            limbs = feet_state(a, P, feet)
            fw = fwd_of(psi)
            q = arms_pose(a, 1.0, 0.0, fist=(0.3, 0.3), extra=[('clav_up', 0.0)])
            if a.name in ('Pass1', 'Pass3'):
                k = 9 if a.name == 'Pass1' else 13
                s = 'R'
                piv = straps[(-1, k)]
                ang = piv.rotation_euler.x
                # תחתית הטבעת אחרי סיבוב הרצועה
                Mp = Matrix.Translation(piv.location) @ Euler((-0.35 * lam, 0, piv.rotation_euler.z)).to_matrix().to_4x4()
                Gp = Mp @ V((0, 0, -(0.225 + 0.034 - 0.03)))
                q = arms_pose(a, 1.0, 0.0, fist=(0.3, 0.9), extra=[])
                cl = a.poses['clav_up']['RightShoulder']
                q['RightShoulder'] = q.get('RightShoulder', Quaternion()) @ cl
                limbs['handR'] = hand_state(a, 'R', Gp + V((0, 0, 0.012)), (0, 0, 1), V((fw.x, fw.y, 0)), P @ V((-0.5, -0.05, 0.6)))
            else:
                pole_pt = V((0.5, 3.56, FLOOR + 1.2))
                sh = stand_X(a, p, psi) + V((0, 0, 0.5))
                n_ = V((pole_pt.x - sh.x, pole_pt.y - sh.y, 0)).normalized()
                g = pole_pt - n_ * 0.035
                q = arms_pose(a, 1.0, 0.0, fist=(0.9, 0.3))
                limbs['handL'] = hand_state(a, 'L', g, n_.cross(V((0, 0, 1))) * -1, n_, P @ V((0.55, 0.1, 0.6)))
            look = stand_X(a, p, psi) + fw * 3.0 + V((0, 0, 0.6)) + V((0.6 * math.sin(f / 40 + idx), 0, 0))
            a.key(f, hM, q, limbs, look=look, look_w=0.45)
    c1 = BL.camera('Cam41', (0.3, -0.3, 2.0), (0.0, 3.0, 1.45), lens=26, parent=body)
    c2 = BL.camera('Cam42', (-0.45, 5.45, 1.95), (0.15, 2.3, 1.45), lens=24, parent=body)
    BL.render_setup()
    return N, (lambda f: c1 if f <= 64 else c2)


# ---------------------------------------------------------------- main
try:
    N, cam_for = {'s1_drive': shot1, 's2_wheelchair': shot2, 's3_driver': shot3, 's4_standing': shot4}[SHOT]()
except Exception:
    import traceback; traceback.print_exc(); raise
for o in list(bpy.data.objects):
    if o.type == 'EMPTY': o.hide_render = True
frames = list(range(1, N + 1, STEP))
n = len(frames); per = (n + PARTS - 1) // PARTS
mine = frames[PART * per:(PART + 1) * per]
if MODE == 'preview':
    BL.SC.render.resolution_x, BL.SC.render.resolution_y = 640, 360; BL.SC.cycles.samples = 10
BL.qa(list(range(1, N + 1, 6)))
log('SHOT', SHOT, 'N', N, 'frames', mine[:1], '...', mine[-1:], 'count', len(mine))
if os.environ.get('SAVE_BLEND') and PART == 0:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(f'out/{SHOT}.blend'), copy=True)
BL.render_frames(SHOT, mine, cam_for)
