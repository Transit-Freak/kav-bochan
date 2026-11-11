"""פרקי אצבעות לשלד cmu_mb (שלב 1, ניסיון): בשלד של ההליכה יש לכל יד רק FingerBase, HandFinger1 ו-Thumb.
בונים אדם זהה עם שלד אחר של MPFB שיש בו 3 פרקים לכל אצבע (game_engine), מעתיקים ממנו את 15 עצמות האצבעות של
כל יד ואת המשקלים שלהן, ומוחקים אותו. שאר השלד (גוף, רגליים, זרועות) לא משתנה, אז ההליכה והקוד של המשחק נשארים.
העצמות החדשות: <Left|Right>Hand<Thumb|Index|Middle|Ring|Pinky><1-3>. ארבע האצבעות הן ילדות של HandFinger1 והאגודל
של Thumb — סיבוב של העצמות הישנות עדיין מזיז את האצבעות כמו קודם."""
import bpy, os, re
DONOR = os.environ.get('FINGER_RIG', 'game_engine')
PAT = re.compile(r'^(thumb|index|middle|ring|pinky)_0?(\d)_([lr])$')


def add(bm, rig, HS, md):
    bm2 = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
    HS.add_builtin_rig(bm2, DONOR, import_weights=True)
    rig2 = bm2.parent
    assert len(bm2.data.vertices) == len(bm.data.vertices), 'donor mesh differs'
    new = {}
    for b in rig2.data.bones:
        m = PAT.match(b.name)
        if m: new[b.name] = ('Left' if m[3] == 'l' else 'Right') + 'Hand' + m[1].capitalize() + m[2]
    print('FINGERS donor', DONOR, len(rig2.data.bones), 'bones, fingers', len(new), sorted(new.values())[:15])
    assert len(new) == 30, new
    inv = rig.matrix_world.inverted()
    info = []
    for b in rig2.data.bones:            # מההורה לילד
        if b.name not in new: continue
        side = new[b.name][:4] if new[b.name].startswith('Left') else new[b.name][:5]
        par = new.get(b.parent.name) if b.parent else None
        if par is None:
            par = (('LThumb' if side == 'Left' else 'RThumb') if 'Thumb' in new[b.name] else side + 'HandFinger1')
        info.append((new[b.name], inv @ rig2.matrix_world @ b.matrix_local, b.length * rig2.matrix_world.to_scale().x / rig.matrix_world.to_scale().x, par))
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    for name, M, L, par in info:
        e = eb.new(name); e.head = (0, 0, 0); e.tail = (0, L, 0); e.matrix = M; e.length = L
        e.parent = eb[par]; e.use_connect = False; e.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    for name, *_ in info:
        rig.pose.bones[name].rotation_mode = 'QUATERNION'
    # משקלים: בכל קודקוד, המשקל של HandFinger1 ושל Thumb מתחלק בין עצמות האצבעות לפי היחס שלהן בשלד התורם
    g2 = {g.index: new[g.name] for g in bm2.vertex_groups if g.name in new}
    vg = {n: (bm.vertex_groups.get(n) or bm.vertex_groups.new(name=n)) for n in new.values()}
    moved = kept = 0
    hands = bm.vertex_groups.new(name='pv_hands')
    hand_names = {'LeftHand', 'RightHand', 'LeftFingerBase', 'RightFingerBase', 'LeftHandFinger1', 'RightHandFinger1', 'LThumb', 'RThumb'}
    hand_idx = {g.index for g in bm.vertex_groups if g.name in hand_names}
    for side, th in (('Left', 'LThumb'), ('Right', 'RThumb')):
        old = [bm.vertex_groups.get(side + 'HandFinger1'), bm.vertex_groups.get(th)]
        assert all(old), ('missing group', side, [g.name for g in bm.vertex_groups][:60])
        oi = {g.index for g in old}
        for v in bm.data.vertices:
            W = sum(g.weight for g in v.groups if g.group in oi)
            if W <= 1e-5: continue
            D = {g2[g.group]: g.weight for g in bm2.data.vertices[v.index].groups if g.group in g2 and g2[g.group].startswith(side) and g.weight > 1e-4}
            s = sum(D.values())
            if s < 1e-3: kept += 1; continue
            for g in old: g.remove([v.index])
            for n, w in D.items(): vg[n].add([v.index], W * w / s, 'REPLACE')
            moved += 1
    hv = [v.index for v in bm.data.vertices if sum(g.weight for g in v.groups if g.group in hand_idx or bm.vertex_groups[g.group].name in vg) > 0.5]
    hands.add(hv, 1.0, 'REPLACE')
    print('FINGERS weights moved', moved, 'kept on old bones', kept, 'hand verts', len(hv), 'rig bones', len(rig.data.bones))
    for o in (bm2, rig2): bpy.data.objects.remove(o, do_unlink=True)
