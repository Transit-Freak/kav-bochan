"""ניסוי הנפשה: אדם מ-MPFB הולך, בתנועה מצולמת אמיתית (CMU Motion Capture, המרת BVH של Bruce Hahne — בלי הגבלות שימוש).
העברת התנועה: לכל עצם — הסיבוב בעולם של העצם המקביל ב-BVH, כפול ההפרש בין תנוחות המנוחה (retarget ידני)."""
import bpy, os, sys, glob, importlib, math
from mathutils import Matrix, Vector
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
SC = bpy.context.scene
base = next(p for p in ('bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb') if importlib.util.find_spec(p))
HS = importlib.import_module(base + '.services.humanservice').HumanService
TS = importlib.import_module(base + '.services.targetservice').TargetService
ud = importlib.import_module(base + '.services.locationservice').LocationService.get_user_data()
A = lambda rel: glob.glob(f'{ud}/**/{rel}', recursive=True)[0]
BVH = os.environ['BVH']; RIG = os.environ.get('RIG', 'cmu_mb')

md = TS.get_default_macro_info_dict(); md.update(gender=1.0, age=0.45, weight=0.55, height=0.55)
md['race'] = {'caucasian': 0.8, 'african': 0.12, 'asian': 0.08}
bm = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
HS.add_builtin_rig(bm, RIG, import_weights=True)
HS.set_character_skin(A('skins/middleage_caucasian_male/middleage_caucasian_male.mhmat'), bm)
for kind, rel in (('Eyes', 'eyes/high-poly/high-poly.mhclo'), ('Eyebrows', 'eyebrows/eyebrow006/eyebrow006.mhclo'),
                  ('Hair', 'hair/short04/short04.mhclo'), ('Clothes', 'clothes/male_casualsuit01/male_casualsuit01.mhclo'),
                  ('Clothes', 'clothes/shoes02/shoes02.mhclo')):
    ob = HS.add_mhclo_asset(A(rel), bm, asset_type=kind)
    if kind == 'Hair': hair = ob
rig = bm.parent
# הקרקפת בצבצה דרך הרווחים השקופים של השיער (שלמה 06.11): כיפה אטומה בצבע השיער, קצת מתחת לשיער
try:
    hair = hair if isinstance(hair, bpy.types.Object) else next(o for o in bpy.data.objects if o.type == 'MESH' and 'short04' in o.name.lower())
    cap = hair.copy(); cap.data = hair.data.copy(); cap.name = 'hair_cap'; SC.collection.objects.link(cap)
    m = bpy.data.materials.new('hair_cap'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.025, 0.02, 0.016, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.7
    cap.data.materials.clear(); cap.data.materials.append(m)
    # הכתמים נשארו גם עם צבע אחיד: זה העור של הקרקפת שעובר דרך השיער. מרחיקים את השיער 6 מ"מ מהראש, והכיפה מתחתיו
    d = cap.modifiers.new('in', 'DISPLACE'); d.strength = 0.003
    cap.modifiers.move(len(cap.modifiers) - 1, 0)
    dh = hair.modifiers.new('out', 'DISPLACE'); dh.strength = 0.006
    hair.modifiers.move(len(hair.modifiers) - 1, 0)
    print('DBG hair cap', hair.name, [md.type for md in cap.modifiers])
except Exception as e:
    print('DBG hair cap failed', e)
SC.cycles.transparent_max_bounces = 32
# הכתמים הכתומים בשיער (שלמה 06.11) נשארו גם עם הכיפה — הם מגיעים מהטקסטורה של השיער עצמה.
# צובעים את השיער בצבע כהה אחיד, ומשאירים רק את השקיפות של הטקסטורה
try:
    for ms in hair.material_slots:
        nt = ms.material.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        for l in list(pr.inputs['Base Color'].links): nt.links.remove(l)
        pr.inputs['Base Color'].default_value = (0.03, 0.022, 0.016, 1)
        pr.inputs['Roughness'].default_value = 0.55
        print('DBG hair recolor', ms.material.name, [i.name for i in pr.inputs if i.is_linked])
except Exception as e:
    print('DBG hair recolor failed', e)
print('RIG BONES', [b.name for b in rig.data.bones][:40])

bpy.ops.import_anim.bvh(filepath=BVH, axis_forward='-Z', axis_up='Y', use_fps_scale=True, rotate_mode='NATIVE')
src = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o is not rig)
print('BVH BONES', [b.name for b in src.data.bones][:40])
act = src.animation_data.action
f0, f1 = (int(x) for x in act.frame_range)
f1 = min(f1, f0 + int(os.environ.get('FRAMES', '160')))
SC.frame_start, SC.frame_end = f0, f1
names = [b.name for b in rig.data.bones if b.name in src.data.bones]
print('MATCHED', len(names), names[:20])
# תנוחת ייחוס: מסובבים את עצמות MPFB כך שכיוון כל עצם יתאים לכיוון שלה במנוחת ה-BVH (תנוחת T).
# בלי זה, הפרש בין תנוחת A של MPFB לתנוחת T של CMU מכניס את הידיים לתוך הגוף.
def wrot(ob, M): return (ob.matrix_world.to_3x3() @ M.to_3x3()).normalized()
for pb in rig.pose.bones: pb.matrix_basis.identity()
bpy.context.view_layer.update()
# מיישרים רק את הגפיים הארוכות (ידיים ורגליים) לתנוחת T. כפות רגליים, בהונות, מפרקי אגן וידיים נשארים בתנוחת המנוחה
# של MPFB — יישור שלהם (בלי סיבוב סביב הציר) הוא מה שגרם להליכה "על קצות האצבעות" כמו בבלט
ALIGN = ('UpLeg', 'Leg', 'Arm', 'ForeArm', 'Shoulder')
order0 = [b.name for b in rig.data.bones if b.name in names and any(b.name.endswith(a) for a in ALIGN) and 'Hand' not in b.name]
for n in order0:
    sb = src.data.bones[n]
    t_dir = (src.matrix_world @ sb.tail_local) - (src.matrix_world @ sb.head_local)
    pb = rig.pose.bones[n]
    c_dir = (rig.matrix_world @ pb.tail) - (rig.matrix_world @ pb.head)
    if t_dir.length < 1e-6 or c_dir.length < 1e-6: continue
    q = c_dir.normalized().rotation_difference(t_dir.normalized())
    Rw = q.to_matrix() @ (rig.matrix_world.to_3x3() @ pb.matrix.to_3x3())
    M = (rig.matrix_world.to_3x3().inverted() @ Rw).to_4x4(); M.translation = pb.matrix.translation
    pb.matrix = M; bpy.context.view_layer.update()
off = {n: wrot(src, src.data.bones[n].matrix_local).inverted() @ wrot(rig, rig.pose.bones[n].matrix) for n in names}
hips = next((n for n in names if n.lower() in ('hips', 'pelvis', 'root')), names[0])
SC.frame_set(f0); bpy.context.view_layer.update()
h_src = (src.matrix_world @ src.pose.bones[hips].head).z          # גובה האגן בתנוחה (במנוחה הוא 0)
h_dst = (rig.matrix_world @ rig.data.bones[hips].head_local).z
k = h_dst / h_src if h_src else 1.0
order = [b.name for b in rig.data.bones if b.name in off]           # מההורה לילד
SC.frame_set(f0); bpy.context.view_layer.update()
p0_src = src.matrix_world @ src.pose.bones[hips].head
p0_dst = rig.matrix_world @ rig.pose.bones[hips].head
# היד נכנסה לירך ולישבן בתנופה לאחור (שלמה 06.11): מרחיקים כל זרוע מהגוף בכמה מעלות, סביב כיוון ההליכה
SC.frame_set(f1); fwd = (src.matrix_world @ src.pose.bones[hips].head) - p0_src; fwd.z = 0
fwd = fwd.normalized() if fwd.length > 1e-3 else Vector((0, -1, 0)); SC.frame_set(f0)
ANG = math.radians(float(os.environ.get('ARM_OUT', '8')))
ABD = {}
for side, sg in (('Left', 1), ('Right', -1)):
    if side + 'Arm' not in rig.data.bones: continue
    root = rig.data.bones[side + 'Arm']
    for b in [root] + list(root.children_recursive):
        if b.name in names: ABD[b.name] = Matrix.Rotation(sg * ANG, 3, fwd)
# בדיקת כיוון: היד השמאלית צריכה להתרחק מהאגן, לא להתקרב
for f in range(f0, f1 + 1):
    SC.frame_set(f)
    for n in order:
        pb = rig.pose.bones[n]
        R = (src.matrix_world.to_3x3() @ src.pose.bones[n].matrix.to_3x3()).normalized() @ off[n]
        if n in ABD: R = ABD[n] @ R
        Rarm = rig.matrix_world.to_3x3().inverted() @ R
        M = Rarm.to_4x4(); M.translation = pb.matrix.translation
        if n == hips:
            d = (src.matrix_world @ src.pose.bones[hips].head) - p0_src
            M.translation = rig.matrix_world.inverted() @ (p0_dst + d * k)
        pb.matrix = M
        bpy.context.view_layer.update()
        pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=f)
        if n == hips: pb.keyframe_insert('location', frame=f)
    if f % 10 == 1:
        hw = rig.matrix_world @ rig.pose.bones[hips].head
        sw = src.matrix_world @ src.pose.bones[hips].head
        print('DBG', f, 'dst hips', tuple(round(v, 2) for v in hw), 'src hips', tuple(round(v, 2) for v in sw), 'k', round(k, 4), 'rigscale', tuple(round(v, 3) for v in rig.scale), 'mode', rig.pose.bones[hips].rotation_mode)
# רצפה: בכל פריים לפחות רגל אחת על הקרקע, אז הנקודה הנמוכה של כל פריים היא הרצפה. לוקחים אחוזון 20
# (ולא את המינימום הכללי, שנקבע בפריים אחד שבו הבוהן ירדה מתחת — וזה גרם לרגל העומדת לרחף)
def low_pts():
    pts = []
    for n in ('LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'):
        if n in rig.pose.bones:
            pb = rig.pose.bones[n]; pts += [(rig.matrix_world @ pb.head).z, (rig.matrix_world @ pb.tail).z]
    return min(pts)
mins = []
for f in range(f0, f1 + 1):
    SC.frame_set(f); mins.append(low_pts())
fl_z = sorted(mins)[len(mins) // 5]
rig.location.z -= fl_z; bpy.context.view_layer.update()
print('DBG floor', round(fl_z, 3), 'min', round(min(mins), 3), 'max', round(max(mins), 3))
# הנעל עלתה גבוה מדי בצעד (שלמה 06.11): IK על השוק, והמטרה היא הקרסול עם גובה מכווץ מעל הגובה שלו בעמידה
# 07.11: הכיווץ של גובה הצעד (IK) כופף את הברכיים פנימה והרגליים הצטלבו — כבוי. מה שנראה כמו "נעל שעולה גבוה"
# היה בעצם כף הרגל שנטתה כמעט אנכית למטה, ואת זה מגבילים בנפרד (FOOT_PMIN). LIFT<1 מחזיר את ה-IK
LIFT = float(os.environ.get('LIFT', '1'))
iks = []
# הנעל נראתה מקופלת לאחור (שלמה 06.11): ה-IK משנה את כיוון השוק, וכף הרגל, שהסיבוב שלה יחסי לשוק, מסתובבת איתה.
# שומרים את הכיוון בעולם של כף הרגל והבוהן מלפני ה-IK, ומחזירים אותו אחרי האפייה
FEET = [n for s_ in ('Left', 'Right') for n in (s_ + 'Foot', s_ + 'ToeBase') if n in rig.pose.bones]
footR = {}
for f in range(f0, f1 + 1):
    SC.frame_set(f)
    footR[f] = {n: (rig.matrix_world.to_3x3() @ rig.pose.bones[n].matrix.to_3x3()).copy() for n in FEET}
for side in (('Left', 'Right') if LIFT < 0.999 else ()):
    leg, foot = side + 'Leg', side + 'Foot'
    if leg not in rig.pose.bones or foot not in rig.pose.bones: continue
    pos, knee = [], []
    for f in range(f0, f1 + 1):
        SC.frame_set(f)
        pos.append((rig.matrix_world @ rig.pose.bones[foot].head).copy())
        knee.append((rig.matrix_world @ rig.pose.bones[leg].head).copy())
    stand = sorted(p.z for p in pos)[len(pos) // 10]
    tg = bpy.data.objects.new('ik_' + side, None); SC.collection.objects.link(tg)
    pole = bpy.data.objects.new('pole_' + side, None); SC.collection.objects.link(pole)
    mx = 0.0
    for i, f in enumerate(range(f0, f1 + 1)):
        q = pos[i].copy(); up = q.z - stand; mx = max(mx, up)
        if up > 0: q.z = stand + up * LIFT
        tg.location = q; tg.keyframe_insert('location', frame=f)
        # הקוטב: מול הברך, כדי שהברך תמשיך להתכופף קדימה
        fwd = (pos[min(i + 1, len(pos) - 1)] - pos[max(i - 1, 0)]); fwd.z = 0
        fwd = fwd.normalized() if fwd.length > 1e-4 else Vector((0, -1, 0))
        pole.location = knee[i] + fwd * 0.6; pole.keyframe_insert('location', frame=f)
    print('DBG lift', side, 'stand', round(stand, 3), 'max up', round(mx, 3), '->', round(mx * LIFT, 3))
    c = rig.pose.bones[leg].constraints.new('IK'); c.target = tg; c.pole_target = pole; c.chain_count = 2
    c.pole_angle = math.radians(-90); iks.append(leg)
    # כף הרגל שומרת על הכיוון שלה בעולם (אחרת היא מסתובבת עם השוק החדשה)
if True:
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    if iks: bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=True, visual_keying=True, clear_constraints=True, use_current_action=True, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    W3i = rig.matrix_world.to_3x3().inverted()
    for f in range(f0, f1 + 1):
        SC.frame_set(f)
        for n in FEET:                       # מההורה לילד: קודם כף הרגל, אחר כך הבוהן
            pb = rig.pose.bones[n]
            M = (W3i @ footR[f][n]).to_4x4(); M.translation = pb.matrix.translation
            pb.matrix = M; bpy.context.view_layer.update()
            pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=f)
    # בצעד, כף הרגל שמאחור נטתה למטה כמעט אנכית ונראתה מסובבת (שלמה 06.11). מגבילים את הנטייה למטה ל-PMIN מעלות
    PMIN = float(os.environ.get('FOOT_PMIN', '-32'))
    lo = {}
    for f in range(f0, f1 + 1):
        SC.frame_set(f)
        for s_ in ('Left', 'Right'):
            n = s_ + 'Foot'
            if n not in rig.pose.bones: continue
            pb = rig.pose.bones[n]; W = rig.matrix_world
            v = (W @ pb.tail) - (W @ pb.head); hz = (v.x ** 2 + v.y ** 2) ** .5
            ang = math.degrees(math.atan2(v.z, hz)); lo[s_] = min(lo.get(s_, 99), ang)
            if ang < PMIN and hz > 1e-6:
                ax = v.cross(Vector((0, 0, 1))).normalized()
                Rw = Matrix.Rotation(math.radians(PMIN - ang), 3, ax) @ (W.to_3x3() @ pb.matrix.to_3x3())
                M = (W.to_3x3().inverted() @ Rw).to_4x4(); M.translation = pb.matrix.translation
                pb.matrix = M; bpy.context.view_layer.update()
                pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=f)
    print('DBG foot pitch min before clamp', {k: round(v, 1) for k, v in lo.items()}, 'clamp', PMIN)
    # בדיקה: זווית הבוהן ביחס לרצפה (חיובי = הבוהן למעלה) — בצעד אמיתי כמעט לא עולה מעל 25 מעלות
    mxp = {}
    for f in range(f0, f1 + 1, 2):
        SC.frame_set(f)
        for s_ in ('Left', 'Right'):
            n = s_ + 'Foot'
            if n in rig.pose.bones:
                pb = rig.pose.bones[n]; v = (rig.matrix_world @ pb.tail) - (rig.matrix_world @ pb.head)
                ang = math.degrees(math.atan2(v.z, (v.x ** 2 + v.y ** 2) ** .5)); mxp[s_] = max(mxp.get(s_, -99), ang)
    print('DBG foot pitch max', {k: round(v, 1) for k, v in mxp.items()})
    SC.frame_set((f0 + f1) // 2)
    for side in ('Left', 'Right'):
        if side + 'Leg' in rig.pose.bones:
            print('DBG knee', side, tuple(round(v, 2) for v in rig.matrix_world @ rig.pose.bones[side + 'Leg'].head))
src.hide_render = True; src.hide_viewport = True
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/anim.blend'))

# תצוגה: Workbench מהיר לסרטון, ו-Cycles לשלוש תמונות
me = bpy.data.meshes.new('floor'); fl = bpy.data.objects.new('floor', me); SC.collection.objects.link(fl)
import bmesh; b = bmesh.new(); bmesh.ops.create_grid(b, x_segments=20, y_segments=20, size=15); b.to_mesh(me); b.free()
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('C')); SC.collection.objects.link(cam); SC.camera = cam
cam.data.lens = 35
SC.frame_set(f0); a = rig.matrix_world @ rig.pose.bones[hips].head; SC.frame_set(f1); b = rig.matrix_world @ rig.pose.bones[hips].head
mid = (a + b) / 2; mid.z = 0.9
side = Vector((-(b - a).y, (b - a).x, 0)).normalized() if (b - a).length > 0.1 else Vector((1, 0, 0))
cam.location = mid + side * max(4.5, (b - a).length * 1.3) + Vector((0, 0, 0.3))
cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); SC.collection.objects.link(sun); sun.data.energy = 3; sun.rotation_euler = (math.radians(45), 0, math.radians(-30))
w = bpy.data.worlds.new('W'); SC.world = w; bgn = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bgn.inputs[0].default_value = (0.8, 0.83, 0.87, 1)
SC.render.resolution_x, SC.render.resolution_y = 960, 540
SC.render.engine = 'CYCLES'; SC.cycles.device = 'CPU'; SC.cycles.samples = 20; SC.cycles.use_denoising = True
SC.frame_start = f0 + 5   # בלי הפריימים של תנוחת ה-T בתחילת ההקלטה
SC.render.fps = 30
try:
    SC.render.image_settings.file_format = 'FFMPEG'; SC.render.ffmpeg.format = 'MPEG4'; SC.render.ffmpeg.codec = 'H264'
    SC.render.ffmpeg.constant_rate_factor = 'HIGH'; SC.render.filepath = os.path.abspath('out/walk.mp4')
except Exception as e:
    print('ffmpeg', e); SC.render.image_settings.file_format = 'PNG'; SC.render.filepath = os.path.abspath('out/walk/f_')
bpy.ops.render.render(animation=True); print('RENDER walk frames', f0, f1)
SC.render.engine = 'CYCLES'; SC.cycles.device = 'CPU'; SC.cycles.samples = 64; SC.cycles.use_denoising = True
SC.render.image_settings.file_format = 'PNG'
for i, f in enumerate(((f0 + f1)//2,)):
    SC.frame_set(f); SC.render.filepath = os.path.abspath(f'out/walk_hq{i}.png'); bpy.ops.render.render(write_still=True)
print('RENDER hq')
