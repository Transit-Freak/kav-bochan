"""כיסא גלגלים מוכן (OpenGameArt, אם הרישיון CC0/CC-BY): ייבוא, זיהוי הגלגלים הגדולים, קנה מידה וכיוון,
והפרדת הגלגלים כך שיסתובבו. אם משהו לא מסתדר — מחזיר None, ומשתמשים בדגם שלנו."""
import bpy, bmesh, math, os, glob
from mathutils import Vector, Matrix
import busanim_lib as BL


def _import(path):
    before = set(bpy.data.objects)
    ext = os.path.splitext(path)[1].lower()
    if ext == '.obj': bpy.ops.wm.obj_import(filepath=path)
    elif ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=path)
    elif ext == '.stl': bpy.ops.wm.stl_import(filepath=path)
    elif ext == '.ply': bpy.ops.wm.ply_import(filepath=path)
    elif ext == '.blend':
        with bpy.data.libraries.load(path) as (src, dst): dst.objects = [n for n in src.objects]
        for o in dst.objects:
            if o is not None and o.type == 'MESH': BL.SC.collection.objects.link(o)
    else:
        BL.log('chair: unknown format', ext); return []
    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']


def find_file(root):
    for ext in ('glb', 'gltf', 'obj', 'blend', 'fbx', 'stl', 'ply'):
        r = sorted(glob.glob(f'{root}/**/*.{ext}', recursive=True))
        if r: return r[0]
    return None


def load_chair(root, name='Chair'):
    path = find_file(root) if root and os.path.isdir(root) else root
    if not path or not os.path.exists(path): BL.log('chair: no file in', root); return None
    obs = _import(path)
    BL.log('chair import', path, [(o.name, tuple(round(d, 2) for d in o.dimensions)) for o in obs])
    if not obs: return None
    # מאחדים לרשת אחת בעולם, ומפרקים לחלקים מנותקים
    for o in obs:
        o.data = o.data.copy()
        o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4); o.parent = None
    bm = bmesh.new()
    mats = []
    for o in obs:
        for m in o.data.materials:
            if m not in mats: mats.append(m)
    me = bpy.data.meshes.new(name + '_all')
    for o in obs:
        remap = [mats.index(m) if m in mats else 0 for m in o.data.materials] or [0]
        tmp = bmesh.new(); tmp.from_mesh(o.data)
        for f in tmp.faces: f.material_index = remap[min(f.material_index, len(remap) - 1)]
        m2 = bpy.data.meshes.new('t'); tmp.to_mesh(m2); tmp.free(); bm.from_mesh(m2); bpy.data.meshes.remove(m2)
    for o in obs: bpy.data.objects.remove(o)
    # חלקים מנותקים
    bm.verts.ensure_lookup_table()
    seen = set(); parts = []
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; comp = []; seen.add(v.index)
        while stack:
            x = stack.pop(); comp.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: seen.add(y.index); stack.append(y)
        parts.append(comp)
    info = []
    for comp in parts:
        cs = [v.co for v in comp]
        mn = Vector([min(c[i] for c in cs) for i in range(3)]); mx = Vector([max(c[i] for c in cs) for i in range(3)])
        info.append(dict(verts=comp, mn=mn, mx=mx, c=(mn + mx) / 2, d=mx - mn))
    BL.log('chair parts', len(info))
    # צמיגים: חלק דמוי דיסקה — שני ממדים כמעט שווים, השלישי דק
    discs = []
    for i, p in enumerate(info):
        d = sorted(range(3), key=lambda k: p['d'][k])
        a, b, c = (p['d'][k] for k in d)
        if c > 1e-6 and b / c > 0.85 and a < 0.35 * b:
            discs.append((c, i, d[0]))
    discs.sort(reverse=True)
    if len(discs) < 2: BL.log('chair: no wheels found', [tuple(round(x, 3) for x in p['d']) for p in info][:30]); return None
    (r1, i1, ax1), (r2, i2, ax2) = discs[0], discs[1]
    if ax1 != ax2 or abs(r1 - r2) > 0.1 * r1: BL.log('chair: wheel mismatch', discs[:4]); return None
    c1, c2 = info[i1]['c'], info[i2]['c']
    axle = (c2 - c1).normalized(); mid = (c1 + c2) / 2; R = r1 / 2
    s = 0.30 / R                                                    # גלגל אחורי בקוטר 60 ס"מ
    allv = [v.co for v in bm.verts]
    centroid = sum(allv, Vector()) / len(allv)
    up_guess = Vector((0, 0, 1)) if abs(axle.z) < 0.7 else Vector((0, 1, 0))
    fwd = centroid - mid; fwd -= fwd.dot(axle) * axle; fwd -= fwd.dot(up_guess) * up_guess
    fwd = fwd.normalized() if fwd.length > 1e-6 else up_guess.cross(axle)
    up = axle.cross(fwd).normalized()
    if up.dot(up_guess) < 0: up = -up
    side = fwd.cross(up).normalized()        # ‎+X של הכיסא כשהחזית ל--Y: ימין = fwd×up? מחשבים כך ש-‎-Y=fwd
    # מערכת הכיסא: X = side', Y = -fwd, Z = up
    X = (-fwd).cross(up).normalized()
    Rm = Matrix((X, -fwd, up))                                    # שורות: הטלה לצירים החדשים
    def tf(co): return Rm @ ((co - mid) * s) + Vector((0, 0, BL.CH_R))
    for v in bm.verts: v.co = tf(v.co)
    # רוחב: אם יותר מ-0.75 מ', מצמצמים בציר X בלבד (שומרים על הגלגלים)
    xs = [v.co.x for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    BL.log('chair scaled: width', round(max(xs) - min(xs), 3), 'height', round(max(zs) - min(zs), 3), 'scale', round(s, 4))
    root = BL.empty(name, size=0.3); root.rotation_mode = 'XYZ'
    wheels = {}
    wheel_idx = {}
    for i_w, cw in ((i1, tf(c1)), (i2, tf(c2))):
        sd = 1 if cw.x > 0 else -1
        wheels[sd] = BL.empty(f'{name}_W{sd}', (cw.x, 0, BL.CH_R), root, size=0.1); wheels[sd].rotation_mode = 'XYZ'
        wheel_idx[sd] = cw
    # חלקים ששייכים לגלגל: כל החלק בתוך כדור הגלגל וקרוב למישור שלו
    groups = {1: [], -1: [], 0: []}
    for p in info:
        cs = [v.co for v in p['verts']]
        mn = Vector([min(c[i] for c in cs) for i in range(3)]); mx = Vector([max(c[i] for c in cs) for i in range(3)])
        cc = (mn + mx) / 2; assigned = 0
        for sd, cw in wheel_idx.items():
            rr = max(((c - cw) * Vector((0, 1, 1))).length for c in cs)
            if abs(cc.x - cw.x) < 0.07 and rr < BL.CH_R * 1.05 and (mx.x - mn.x) < 0.12:
                # רק חלקים סימטריים סביב הציר (צמיג, חישוק, חישורים, טבעת) — לא מוטות שלדה שעוברים ליד
                if ((cc - cw) * Vector((0, 1, 1))).length < 0.06 or rr > 0.6 * BL.CH_R: assigned = sd
        groups[assigned].append(p)
    BL.log('chair groups', {k: len(v) for k, v in groups.items()})
    for key, ps in groups.items():
        if not ps: continue
        b2 = bmesh.new(); vmap = {}
        o_ = Vector((wheels[key].location.x, 0, BL.CH_R)) if key != 0 else Vector()
        for p in ps:
            for v in p['verts']: vmap[v] = b2.verts.new(v.co - o_)
        for f in bm.faces:
            if all(v in vmap for v in f.verts):
                try:
                    nf = b2.faces.new([vmap[v] for v in f.verts]); nf.material_index = f.material_index; nf.smooth = f.smooth
                except ValueError: pass
        me2 = bpy.data.meshes.new(f'{name}_{key}'); b2.to_mesh(me2); b2.free()
        for m in mats: me2.materials.append(m)
        ob = BL.link(bpy.data.objects.new(f'{name}_part{key}', me2), root if key == 0 else wheels[key])
    bm.free()
    # חומר ברירת מחדל אם אין
    for o in root.children_recursive:
        if o.type == 'MESH' and not o.data.materials:
            o.data.materials.append(BL.mat('M_ChairImp', (0.1, 0.1, 0.12), 0.4, 0.6))
    return dict(root=root, wheels=wheels, casters={}, forks={}, imported=True)
