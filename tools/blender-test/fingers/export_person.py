"""ייצוא אדם של MPFB עם תנועת הליכה מצולמת (CMU) ל-GLB קל למשחק.

קלט: out/anim.blend שנבנה ב-tools/blender-test/anim.py (ענף claude/blender-test) עם BVH של הקליפ 16_15.
הרצה:  blender -b out/anim.blend -P export_person.py -- <out.glb>
או:    python export_person.py -- out/anim.blend <out.glb>   (bpy כמודול)

מה עושים:
- מוחקים את שלד ה-BVH, את עזרי ה-IK ואת הריסים. העיניים (low-poly), הגבות וכיפת השיער נשארים — בלעדיהם הפנים נראות ריקות.
- מחילים את המסכות (הגוף שמתחת לבגדים נמחק) ואת ההרחקה של השיער מהראש (Displace), מורידים subsurf ומקטינים ב-Decimate
  (בגדים — פחות מהגוף, כדי שהשוליים לא ייקרעו; שיער וגבות — עוד פחות, כי הם כרטיסים שקופים).
- צנוע (שלמה 07.11): מוחקים מהגוף את משטחי חומר הפטמה (נשארו מתחת לחולצה צמודה, שאין לה מסכה על החזה).
- חומרים ב-GLB: גוף ובגדים אטומים (OPAQUE), שיער וגבות עם שקיפות חתוכה (MASK). קודם הכל יצא BLEND,
  ובכל צופה שמכבד את זה העור והבגדים נראו זה דרך זה (חורים בחצאית, "כתמים" בשיער).
- בגד עם pv_tint (person_variants.py) נצבע: גווני האפור של הטקסטורה כפול הצבע.
- "Walk": מחזור הליכה אחד שחוזר על עצמו (מחפשים את שני הפריימים הכי דומים), בלי התקדמות קדימה (in place).
- "Idle": עמידה — הממוצע של כל עצם לאורך מחזור ההליכה (ידיים לצד הגוף), עם נשימה קלה.
- טקסטורות עד PERSON_TEX פיקסלים (ברירת מחדל 512), בפורמט WEBP. טקסטורת השיער — בגווני אפור,
  והצבע בא מצבע החומר (כך כל אדם מקבל צבע שיער משלו בלי כתמים מהטקסטורה).
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if bpy.data.filepath == '' and len(argv) >= 2:
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(argv[0])); argv = argv[1:]
OUT = os.path.abspath(argv[0] if argv else 'out/person.glb')
RATIO = float(os.environ.get('PERSON_DECIMATE', '0.22'))
CLOTH_TRIS = int(os.environ.get('PERSON_CLOTH_TRIS', '2600'))   # בגד קטן מזה לא מוקטן בכלל (שוליים וצווארון בלי קרעים)
TEX = int(os.environ.get('PERSON_TEX', '512'))
SC = bpy.context.scene

rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.endswith('.rig'))
walk_src = rig.animation_data.action
for o in list(bpy.data.objects):
    if o is rig: continue
    if o.type in ('ARMATURE', 'EMPTY', 'LIGHT', 'CAMERA') or (o.type == 'MESH' and (o.parent is not rig)):
        bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and any(k in o.name.lower() for k in ('high-poly', 'eyelash')):
        bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a is not walk_src: bpy.data.actions.remove(a)

HAIRS = ('hair', 'short0', 'long0', 'bob0', 'ponytail', 'braid', 'afro')
def kind(o):
    try:
        import importlib
        base = next(p for p in ('bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb') if importlib.util.find_spec(p))
        t = importlib.import_module(base + '.services.objectservice').ObjectService.get_object_type(o)
        if t: return str(t).lower()
    except Exception:
        pass
    n = o.name.lower()
    return 'hair' if any(h in n for h in HAIRS) else 'eyebrows' if 'brow' in n else ''

def ctx(o):
    return bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o])

# כיפת שיער חדשה (11.11, שלמה: "משולש בצבע עור בתוך השיער" ו"קו שיער חתוך ברקה"). הכיפה הישנה הייתה עותק אטום של
# רשת השיער, חתוך מעל האוזניים: השוליים המצולעים שלה בלטו ברקה, ומתחת לקו הזה כל חור בשיער הראה את הקרקפת.
# עכשיו הכיפה היא הקרקפת עצמה: משטחי הגוף שהשיער באמת מכסה (קרן מכל קודקוד החוצה, ובודקים את השקיפות של טקסטורת
# השיער בנקודת הפגיעה), בצבע השיער, 1.5 מ"מ מעל העור. כך היא עוקבת אחרי קו השיער האמיתי ולא בולטת ממנו.
def scalp_cap():
    import numpy as np
    from mathutils.bvhtree import BVHTree
    from mathutils.interpolate import poly_3d_calc
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    body = next((o for o in meshes if 'pv_hands' in o.vertex_groups or kind(o) == 'basemesh'), None)
    hairs = [o for o in meshes if kind(o) == 'hair' and o.name != 'hair_cap']
    oldc = bpy.data.objects.get('hair_cap')
    if not body or not hairs or 'Head' not in rig.data.bones: print('MESH hair_cap skipped', bool(body), len(hairs)); return
    mat = oldc.data.materials[0] if oldc and oldc.data.materials else None
    if oldc: bpy.data.objects.remove(oldc, do_unlink=True)
    if mat is None:
        mat = bpy.data.materials.new('hair_cap'); mat.use_nodes = True
    rig.data.pose_position = 'REST'; bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    verts, tris, meta, alph = [], [], [], {}
    for h in hairs:
        for i, ms in enumerate(h.material_slots):
            im = next((n.image for n in ms.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and not any(x in n.image.name.lower() for x in ('normal', 'bump', 'spec'))), None) if ms.material and ms.material.node_tree else None
            if im and im.size[0]: alph[(h.name, i)] = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], -1)[:, :, -1]
        e = h.evaluated_get(dg); me = e.to_mesh(); me.calc_loop_triangles(); M = e.matrix_world; b0 = len(verts)
        verts += [M @ v.co for v in me.vertices]; uvl = me.uv_layers.active.data if me.uv_layers.active else None
        for lt in me.loop_triangles:
            tris.append(tuple(b0 + i for i in lt.vertices)); meta.append(([uvl[l].uv.copy() for l in lt.loops] if uvl else None, (h.name, lt.material_index)))
        e.to_mesh_clear()
    bvh = BVHTree.FromPolygons(verts, tris)
    def covered(p, n):
        o = p + n * 0.0005; left = 0.035
        for _ in range(10):
            loc, _n, idx, dist = bvh.ray_cast(o, n, left)
            if loc is None: return False
            uvs, key = meta[idx]; A = alph.get(key)
            if A is None or uvs is None: return True
            w = poly_3d_calc([verts[i] for i in tris[idx]], loc); u = sum(uvs[i].x * w[i] for i in range(3)) % 1.0; v = sum(uvs[i].y * w[i] for i in range(3)) % 1.0
            if A[min(A.shape[0] - 1, int(v * A.shape[0])), min(A.shape[1] - 1, int(u * A.shape[1]))] > 0.5: return True
            o = loc + n * 0.0003; left -= dist + 0.0003
            if left <= 0: return False
        return False
    cap = body.copy(); cap.data = body.data.copy(); cap.name = 'hair_cap'; SC.collection.objects.link(cap)
    if cap.data.shape_keys:
        with ctx(cap): bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(cap.modifiers):
        if m.type == 'MASK':
            with ctx(cap): bpy.ops.object.modifier_apply(modifier=m.name)
        elif m.type != 'ARMATURE': cap.modifiers.remove(m)
    if 'pv_hands' in cap.vertex_groups: cap.vertex_groups.remove(cap.vertex_groups['pv_hands'])
    W = cap.matrix_world; W3 = W.to_3x3(); sc = W.to_scale().x or 1.0
    zmin = (rig.matrix_world @ rig.data.bones['Head'].head_local).z - 0.02
    cov = set()
    for v in cap.data.vertices:
        p = W @ v.co
        if p.z > zmin and covered(p, (W3 @ v.normal).normalized()): cov.add(v.index)
    b_ = bmesh.new(); b_.from_mesh(cap.data); n_all = len(b_.faces)
    bmesh.ops.delete(b_, geom=[f for f in b_.faces if not all(v.index in cov for v in f.verts)], context='FACES')
    for v in b_.verts: v.co += v.normal * (0.0015 / sc)
    n_cap = len(b_.faces); b_.to_mesh(cap.data); b_.free()
    cap.data.materials.clear(); cap.data.materials.append(mat)
    for p in cap.data.polygons: p.material_index = 0
    cap.data.update(); rig.data.pose_position = 'POSE'; bpy.context.view_layer.update()
    print('MESH hair_cap scalp faces', n_cap, 'of', n_all, 'hair', [h.name for h in hairs], 'alpha maps', len(alph))
    if not n_cap: bpy.data.objects.remove(cap, do_unlink=True)
import bmesh
if os.environ.get('SCALP_CAP', '1') == '1': scalp_cap()

# רשתות: displace (השיער מורחק מהראש, הכיפה מתחתיו) ומסכות → החלה, לפי הסדר; subsurf → הסרה; Decimate
import bmesh
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    if o.data.shape_keys:  # מפתחות הצורה של MPFB (גוף/מגדר) — מקבעים את הצורה הנוכחית
        with ctx(o): bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(o.modifiers):
        if m.type == 'SUBSURF': o.modifiers.remove(m)
    for m in list(o.modifiers):
        if m.type in ('DISPLACE', 'MASK'):
            with ctx(o): bpy.ops.object.modifier_apply(modifier=m.name)
    bad = [i for i, ms in enumerate(o.material_slots) if ms.material and 'nipple' in ms.material.name.lower()]
    if bad:
        b_ = bmesh.new(); b_.from_mesh(o.data)
        fs = [f for f in b_.faces if f.material_index in bad]
        bmesh.ops.delete(b_, geom=fs, context='FACES'); b_.to_mesh(o.data); b_.free(); o.data.update()
        print('MESH', o.name, 'removed nipple faces', len(fs))
    n0 = len(o.data.polygons); k = kind(o)
    if n0 < 400: print('MESH', o.name, k, n0); continue
    cloth = k.startswith('cloth') and 'shoe' not in o.name.lower()
    r = 0.55 if (k in ('hair', 'eyebrows') or o.name == 'hair_cap') else min(1.0, CLOTH_TRIS / n0) if cloth else RATIO if n0 > 1500 else min(1.0, RATIO * 2.5)
    if r >= 0.999: print('MESH', o.name, k, n0, 'kept'); continue
    # אצבעות: כפות הידיים (קבוצת pv_hands מ-fingers_rig.py) מוקטנות פחות משאר הגוף, כדי שהפרקים יתכופפו חלק.
    # בשני שלבים, כי Decimate עם קבוצת קודקודים מקטין קודם כל את מה שבקבוצה: קודם רק הגוף, ואז רק הידיים (PERSON_HANDS = היחס לידיים)
    HR = float(os.environ.get('PERSON_HANDS', '0.3') or 0); JR = float(os.environ.get('PERSON_JOINTS', '0.6') or 0)
    has_h = HR > 0 and 'pv_hands' in o.vertex_groups
    # מרפקים ופרקי ידיים (12.11): גם שם ההקטנה חלשה יותר (PERSON_JOINTS), בגוף ובשרוולים — עם מעט קודקודים המרפק המכופף יוצא פינה חדה
    jv = []
    if JR > 0 and (k == 'basemesh' or cloth or has_h):
        W_, Wr = o.matrix_world, rig.matrix_world
        js = [(Wr @ rig.data.bones[n].head_local, rad) for n, rad in (('LeftForeArm', 0.075), ('RightForeArm', 0.075), ('LeftHand', 0.05), ('RightHand', 0.05)) if n in rig.data.bones]
        gh = o.vertex_groups['pv_hands'].index if has_h else -1
        for v in o.data.vertices:
            if gh >= 0 and any(g.group == gh and g.weight > 0.5 for g in v.groups): continue
            pw = W_ @ v.co
            if any((pw - c).length < rad for c, rad in js): jv.append(v.index)
        if len(jv) < 12: jv = []
    if has_h or jv:
        if jv: o.vertex_groups.new(name='pv_joints').add(jv, 1.0, 'REPLACE')
        hv = [v.index for v in o.data.vertices if any(g.group == o.vertex_groups['pv_hands'].index and g.weight > 0.5 for g in v.groups)] if has_h else []
        o.vertex_groups.new(name='pv_keep').add(jv + hv, 1.0, 'REPLACE')
        def grp_tris(name):
            gi = o.vertex_groups[name].index
            hs = {v.index for v in o.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}
            return sum(len(p.vertices) - 2 for p in o.data.polygons if all(i in hs for i in p.vertices)), sum(len(p.vertices) - 2 for p in o.data.polygons)
        def dec(name, inv_, ratio):
            d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = min(1.0, ratio); d.vertex_group = name; d.invert_vertex_group = inv_; d.vertex_group_factor = 10
            with ctx(o):
                bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
                bpy.ops.object.modifier_apply(modifier='dec')
        # בשלבים, כי Decimate עם קבוצת קודקודים מקטין קודם כל את מה שבקבוצה: קודם רק הגוף, אחר כך רק הידיים, ואז רק המפרקים
        n0_ = grp_tris('pv_keep'); dec('pv_keep', True, (n0_[0] + r * (n0_[1] - n0_[0])) / n0_[1])
        if has_h: nh, nt = grp_tris('pv_hands'); dec('pv_hands', False, ((nt - nh) + HR * nh) / nt)
        if jv and JR < 0.999: nj, nt = grp_tris('pv_joints'); dec('pv_joints', False, ((nt - nj) + JR * nj) / nt)
        print('MESH', o.name, k, 'keep', n0_, '-> hands', grp_tris('pv_hands') if has_h else None, 'joints', grp_tris('pv_joints') if jv else None)
        continue
    d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = r
    with ctx(o):
        bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
        bpy.ops.object.modifier_apply(modifier='dec')
    print('MESH', o.name, k, n0, '->', len(o.data.polygons))

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

# Idle: עמידה רגועה — הממוצע של כל עצם לאורך מחזור ההליכה (הידיים נחות לצד הגוף, הרגליים זו ליד זו),
# הברכיים מיושרות עוד קצת לכיוון המנוחה, ונשימה קלה בחזה. (קודם: פריים אחד מתוך ההליכה — וכולם נראו צועדים במקום)
from mathutils import Quaternion
fi = min(range(LA, LB + 1), key=lambda f: feet[f])
loopf = frames[:-1]
avg = {}
for b in pbs:
    q0 = cache[loopf[0]][b.name][1]; acc = [0.0, 0.0, 0.0, 0.0]; tacc = Vector((0, 0, 0))
    for f in loopf:
        t, q = cache[f][b.name]
        if q.dot(q0) < 0: q = -q
        for i in range(4): acc[i] += q[i]
        tacc += t
    qa = Quaternion(acc); qa.normalize(); ta = tacc / len(loopf)
    if b.name.endswith('Leg') and not b.name.endswith('UpLeg'):
        qa = Quaternion().slerp(qa, 0.45)
    # בהליכה הגב נוטה קדימה והראש מסתכל למטה — בעמידה מיישרים חלק מזה
    if any(k in b.name for k in ('Spine', 'LowerBack', 'Neck', 'Head')):
        qa = Quaternion().slerp(qa, 0.35)
    avg[b.name] = (ta, qa)
rig.animation_data.action = idle
src = avg if os.environ.get('IDLE_FRAME') != '1' else cache[fi]
for k, fr in enumerate((1, 30, 60)):
    for b in pbs:
        t, q = src[b.name]
        if b.name == 'Hips':
            t = t.copy(); dn = drift.normalized() if drift.length > 1e-6 else Vector((0, 0, 0)); t = t - dn * (t - hips0).dot(dn)
        b.location = t; b.rotation_quaternion = q
        if b.name == 'Spine1' and k == 1:
            b.rotation_quaternion = q @ Quaternion((1, 0, 0), math.radians(1.5))
        b.keyframe_insert('location', frame=fr); b.keyframe_insert('rotation_quaternion', frame=fr)
print('IDLE frame', fi, 'feet', round(feet[fi], 3))

rig.animation_data.action = None
for a in (walk, idle):
    tr = rig.animation_data.nla_tracks.new(); tr.name = a.name
    st = tr.strips.new(a.name, 1, a); st.name = a.name
bpy.data.actions.remove(walk_src)
SC.frame_set(1)

hair_imgs = set(); tint_imgs = {}
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    for ms in o.material_slots:
        if not (ms.material and ms.material.node_tree): continue
        ims = {n.image for n in ms.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}
        if kind(o) == 'hair': hair_imgs |= ims
        if 'pv_tint' in o:
            for im in ims:
                if not any(x in im.name.lower() for x in ('normal', '_ao', 'bump')): tint_imgs[im] = tuple(o['pv_tint'])
for im in bpy.data.images:
    try:
        if im.size[0] > TEX or im.size[1] > TEX:
            s = TEX / max(im.size); im.scale(max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s)))
        if im in hair_imgs and 'normal' not in im.name.lower():
            # השיער: גווני אפור מנורמלים (הבהיר = 1), הצבע מגיע מצבע החומר
            import numpy as np
            px = np.array(im.pixels[:], dtype=np.float32).reshape(-1, 4)
            lum = px[:, :3] @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
            op = px[:, 3] > 0.5
            ref = float(np.percentile(lum[op], 90)) if op.any() else 1.0
            lum = np.clip(lum / max(ref, 1e-3), 0, 1)
            px[:, 0] = px[:, 1] = px[:, 2] = lum
            im.pixels[:] = px.ravel(); im.update()
            print('HAIR IMG', im.name, 'ref', round(ref, 3))
        if im in tint_imgs:
            # בגד בצבע אחר: הבהירות של הטקסטורה (ביחס לחציון) כפול הצבע — הקפלים והתפרים נשארים
            import numpy as np
            px = np.array(im.pixels[:], dtype=np.float32).reshape(-1, 4)
            lum = px[:, :3] @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
            ref = float(np.median(lum)) or 1.0
            px[:, :3] = np.clip((lum / ref)[:, None] * np.array(tint_imgs[im], dtype=np.float32)[None, :], 0, 1)
            im.pixels[:] = px.ravel(); im.update()
            print('TINT IMG', im.name, tint_imgs[im], 'ref', round(ref, 3))
        print('IMG', im.name, tuple(im.size))
    except Exception as ex:
        print('IMG', im.name, ex)

for o in bpy.data.objects:
    if o.type == 'MESH' and 'pv_hands' in o.vertex_groups:
        gi = o.vertex_groups['pv_hands'].index
        hs = {v.index for v in o.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}
        print('TRIS hands', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons if all(i in hs for i in p.vertices)), 'of', sum(len(p.vertices) - 2 for p in o.data.polygons))
print('TRIS', sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
opts = dict(filepath=OUT, export_format='GLB', export_apply=False, export_lights=False, export_cameras=False,
            export_animation_mode='NLA_TRACKS', export_image_format=os.environ.get('PERSON_IMG', 'WEBP'),
            export_skins=True, export_morph=False, export_yup=True)
for q in ({'export_image_quality': 80}, {'export_jpeg_quality': 80}, {}):
    try:
        bpy.ops.export_scene.gltf(**opts, **q); break
    except TypeError as ex:
        print('EXPORT option', q, ex)

# מצב השקיפות בכל חומר: Blender מייצא BLEND לכל חומר שיש לו ערוץ שקיפות, גם לעור ולבגדים.
# מתקנים ישירות ב-JSON של ה-GLB: עור, בגדים, נעליים וכיפת השיער אטומים; שיער וגבות — חיתוך (MASK); העיניים — חיתוך נמוך
import json, struct
def fix_alpha(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n]); rest = b[20 + n:]
    out = []
    for m in j.get('materials', []):
        nm = m.get('name', '').lower()
        hair = any(h in nm for h in HAIRS + ('brow', 'lash')) and nm != 'hair_cap'
        eye = 'low-poly' in nm or 'high-poly' in nm or 'eye' in nm and not hair
        skin = any(x in nm for x in ('body', 'lips', 'nail', 'ears', 'teeth', 'tongue'))
        m.pop('alphaCutoff', None)
        if hair: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5; m['doubleSided'] = True
        elif eye: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.35; m['doubleSided'] = False
        else:
            m['alphaMode'] = 'OPAQUE'; m['doubleSided'] = not skin
        out.append((m.get('name'), m['alphaMode']))
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    body = struct.pack('<I', len(js)) + b'JSON' + js + rest
    open(path, 'wb').write(b[:8] + struct.pack('<I', 12 + len(body)) + body)
    print('EXPORT alpha', out)
fix_alpha(OUT)
print('PERSON GLB', OUT, os.path.getsize(OUT), 'walk frames', WALK_LEN)
