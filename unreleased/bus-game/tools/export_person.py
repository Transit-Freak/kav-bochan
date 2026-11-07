"""ייצוא אדם של MPFB עם תנועת הליכה מצולמת (CMU) ל-GLB קל למשחק.

קלט: out/anim.blend שנבנה ב-tools/blender-test/anim.py (ענף claude/blender-test) עם BVH של הקליפ 16_15.
הרצה:  blender -b out/anim.blend -P export_person.py -- <out.glb>
או:    python export_person.py -- out/anim.blend <out.glb>   (bpy כמודול)

מה עושים:
- מוחקים את שלד ה-BVH, את עזרי ה-IK, את הגבות, העיניים וכיפת השיער (פרטים שלא רואים מרחוק).
- מחילים את המסכות (הגוף שמתחת לבגדים נמחק), מורידים subsurf ומקטינים ב-Decimate.
- "Walk": מחזור הליכה אחד שחוזר על עצמו (מחפשים את שני הפריימים הכי דומים), בלי התקדמות קדימה (in place).
- "Idle": עמידה — הפוזה מתוך ההליכה שבה הרגליים הכי קרובות זו לזו, עם נשימה קלה.
- טקסטורות עד 256 פיקסלים.
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if bpy.data.filepath == '' and len(argv) >= 2:
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(argv[0])); argv = argv[1:]
OUT = os.path.abspath(argv[0] if argv else 'out/person.glb')
RATIO = float(os.environ.get('PERSON_DECIMATE', '0.18'))
SC = bpy.context.scene

rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.endswith('.rig'))
walk_src = rig.animation_data.action
for o in list(bpy.data.objects):
    if o is rig: continue
    if o.type in ('ARMATURE', 'EMPTY', 'LIGHT', 'CAMERA') or (o.type == 'MESH' and (o.parent is not rig)):
        bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and any(k in o.name.lower() for k in ('eyebrow', 'high-poly', 'hair_cap', 'eyelash')):
        bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a is not walk_src: bpy.data.actions.remove(a)

def ctx(o):
    return bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o])

# רשתות: מסכות → החלה; subsurf/displace → הסרה; Decimate
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    if o.data.shape_keys:  # מפתחות הצורה של MPFB (גוף/מגדר) — מקבעים את הצורה הנוכחית
        with ctx(o): bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(o.modifiers):
        if m.type in ('SUBSURF', 'DISPLACE'): o.modifiers.remove(m)
    for m in list(o.modifiers):
        if m.type == 'MASK':
            with ctx(o): bpy.ops.object.modifier_apply(modifier=m.name)
    n0 = len(o.data.polygons)
    d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = RATIO if n0 > 1500 else min(1.0, RATIO * 2.5)
    with ctx(o):
        bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
        bpy.ops.object.modifier_apply(modifier='dec')
    print('MESH', o.name, n0, '->', len(o.data.polygons))

# ניתוח ההליכה: לכל פריים — מיקום כפות הרגליים והפוזה
f0, f1 = (int(round(x)) for x in walk_src.frame_range)
pbs = rig.pose.bones
legs = [b for b in ('LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm') if b in pbs]
poses, feet = {}, {}
for f in range(f0, f1 + 1):
    SC.frame_set(f)
    poses[f] = [pbs[b].matrix_basis.to_quaternion() for b in legs]
    lf, rf = pbs['LeftFoot'].head, pbs['RightFoot'].head
    feet[f] = (Vector((lf.x, lf.y)) - Vector((rf.x, rf.y))).length
def diff(a, b): return sum(1 - abs(qa.dot(qb)) for qa, qb in zip(poses[a], poses[b]))
best = None
for a in range(f0, f1 + 1):
    for b in range(a + 24, min(f1, a + 80) + 1):
        d = diff(a, b) + 0.002 * abs(b - a - 34)
        if best is None or d < best[0]: best = (d, a, b)
_, LA, LB = best
print('WALK loop', LA, LB, 'of', f0, f1, 'err', round(best[0], 4))

# מחזור הליכה: מעתיקים את הפריימים LA..LB לפעולה חדשה (Walk), הפריים האחרון = הראשון, בלי תנועה אופקית של האגן
walk = bpy.data.actions.new('Walk'); idle = bpy.data.actions.new('Idle')
SC.frame_set(LA); hips0 = pbs['Hips'].matrix_basis.translation.copy()
hips_w = [(pbs['Hips'].matrix_basis.translation.copy()) for _ in [0]]
frames = list(range(LA, LB + 1))
# כיוון ההתקדמות (במרחב המקומי של Hips): ההפרש בין הפריים האחרון לראשון
SC.frame_set(LB); drift = pbs['Hips'].matrix_basis.translation - hips0
rig.animation_data.action = walk_src
cache = {}
for f in frames:
    SC.frame_set(f)
    cache[f] = {b.name: (b.matrix_basis.translation.copy(), b.matrix_basis.to_quaternion()) for b in pbs}
rig.animation_data.action = walk
for b in pbs: b.rotation_mode = 'QUATERNION'
for i, f in enumerate(frames):
    src = cache[LA] if f == LB else cache[f]
    for b in pbs:
        t, q = src[b.name]
        if b.name == 'Hips':
            t = t - drift * (i / (len(frames) - 1)) if f != LB else src[b.name][0]
            t = t - (hips0 - hips0)  # האגן נשאר במקום (in place)
            # מבטלים את ההתקדמות לגמרי: רק תנודת הגובה נשארת
            t = t.copy(); dn = drift.normalized() if drift.length > 1e-6 else Vector((0, 0, 0))
            t = t - dn * (t - hips0).dot(dn)
        b.location = t; b.rotation_quaternion = q
        b.keyframe_insert('location', frame=i + 1); b.keyframe_insert('rotation_quaternion', frame=i + 1)
WALK_LEN = len(frames)

# Idle: הפריים שבו הרגליים הכי קרובות, ונשימה קלה בחזה
fi = min(range(LA, LB + 1), key=lambda f: feet[f])
rig.animation_data.action = idle
src = cache[fi]
for k, fr in enumerate((1, 30, 60)):
    for b in pbs:
        t, q = src[b.name]
        if b.name == 'Hips':
            t = t.copy(); dn = drift.normalized() if drift.length > 1e-6 else Vector((0, 0, 0)); t = t - dn * (t - hips0).dot(dn)
        b.location = t; b.rotation_quaternion = q
        if b.name == 'Spine1' and k == 1:
            from mathutils import Quaternion
            b.rotation_quaternion = q @ Quaternion((1, 0, 0), math.radians(1.5))
        b.keyframe_insert('location', frame=fr); b.keyframe_insert('rotation_quaternion', frame=fr)
print('IDLE frame', fi, 'feet', round(feet[fi], 3))

rig.animation_data.action = None
for a in (walk, idle):
    tr = rig.animation_data.nla_tracks.new(); tr.name = a.name
    st = tr.strips.new(a.name, 1, a); st.name = a.name
bpy.data.actions.remove(walk_src)
SC.frame_set(1)

for im in bpy.data.images:
    try:
        if im.size[0] > 256 or im.size[1] > 256:
            s = 256 / max(im.size); im.scale(max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s)))
    except Exception as ex:
        print('IMG', im.name, ex)

print('TRIS', sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=False, export_lights=False, export_cameras=False,
                          export_animation_mode='NLA_TRACKS', export_image_format='JPEG', export_jpeg_quality=80,
                          export_skins=True, export_morph=False, export_yup=True)
print('PERSON GLB', OUT, os.path.getsize(OUT), 'walk frames', WALK_LEN)
