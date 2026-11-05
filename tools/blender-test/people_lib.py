"""שורה 2: ארבעת הגברים שאהבת, חייל וחיילת, ובנות בלבוש מכוסה. תיקים/כיפות/משקפיים ממוקמים לפי הגוף הנראה (רשת מוערכת) והשלד."""
import bpy, bmesh, os, glob, importlib, math, random, traceback, json
from mathutils import Matrix, Vector
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
base = next(p for p in ('bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb') if importlib.util.find_spec(p))
HS = importlib.import_module(base + '.services.humanservice').HumanService
TS = importlib.import_module(base + '.services.targetservice').TargetService
ud = importlib.import_module(base + '.services.locationservice').LocationService.get_user_data()
def A(rel):
    r = glob.glob(f'{ud}/**/{rel}', recursive=True)
    if not r: raise FileNotFoundError(rel)
    return r[0]
SC = bpy.context.scene

def matc(name, rgb, rough=0.7, metal=0.0):
    m = bpy.data.materials.new(name); b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
def mesh_box(name, size, loc, mat, bev=0.02, rot=None):
    me = bpy.data.meshes.new(name); b = bmesh.new(); bmesh.ops.create_cube(b, size=1.0); b.to_mesh(me); b.free()
    ob = bpy.data.objects.new(name, me); SC.collection.objects.link(ob); ob.scale = size; ob.location = loc
    if rot: ob.rotation_euler = rot
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bev:
        m = ob.modifiers.new('bev', 'BEVEL'); m.width = bev; m.segments = 4; m.limit_method = 'NONE'
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(mat); return ob

def eval_verts(objs):
    dg = bpy.context.evaluated_depsgraph_get(); pts = []
    for o in objs:
        e = o.evaluated_get(dg); me = e.to_mesh()
        pts += [o.matrix_world @ v.co for v in me.vertices]; e.to_mesh_clear()
    return pts
def body_info(bm, rig, clothes=()):
    bpy.context.view_layer.update()
    pts = eval_verts([bm] + list(clothes))
    sh = max((rig.matrix_world @ pb.head).z for pb in rig.pose.bones if pb.name.startswith('upperarm01'))
    cx = rig.location.x
    band = [p for p in pts if abs(p.x - cx) < 0.11 and sh - 0.38 < p.z < sh - 0.08]
    if not band: band = [Vector((cx, 0.11, sh)), Vector((cx, -0.12, sh))]
    return dict(sh=sh, cx=cx, back=max(p.y for p in band), front=min(p.y for p in band), top=max(p.z for p in pts))

def recolor(objs, rgb, keep_shading=True):
    """צובע בגד בצבע אחיד (מסיר הדפסים) ושומר קפלים: בהירות הטקסטורה × הצבע."""
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.node_tree: continue
            nt = m.node_tree
            for b in [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED']:
                inp = b.inputs['Base Color']
                src = inp.links[0].from_socket if inp.is_linked else None
                col = nt.nodes.new('ShaderNodeRGB'); col.outputs[0].default_value = (*rgb, 1)
                if src is not None and keep_shading:
                    bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(src, bw.inputs[0])
                    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 1.9; mul.use_clamp = True
                    nt.links.new(bw.outputs[0], mul.inputs[0])
                    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
                    nt.links.new(col.outputs[0], mix.inputs['A']); nt.links.new(mul.outputs[0], mix.inputs['B'])
                    nt.links.new(mix.outputs['Result'], inp)
                else:
                    nt.links.new(col.outputs[0], inp)

def add_backpack(bi, rgb, big=False, clothes=()):
    w, d, h = (0.36, 0.22, 0.58) if big else (0.30, 0.13, 0.42)
    top = bi['sh'] - 0.04; zc = top - h/2
    mat = matc('M_Bag', rgb, 0.8)
    mesh_box('Backpack', (w, d, h), (bi['cx'], bi['back'] + d/2 + 0.005, zc), mat, 0.045)
    mesh_box('BagPocket', (w*0.7, 0.05, h*0.35), (bi['cx'], bi['back'] + d + 0.02, zc - h*0.18), mat, 0.02)
    strap = matc('M_Strap', (0.04, 0.04, 0.045), 0.8)
    pts = eval_verts(list(clothes)) if clothes else []
    for sd in (1, -1):
        x = bi['cx'] + sd*0.085
        for k in range(5):                                         # רצועה קדמית צמודה לבגד, בקטעים
            z = bi['sh'] - 0.04 - k*0.065
            near = [q.y for q in pts if abs(q.x - x) < 0.03 and abs(q.z - z) < 0.035]
            y = (min(near) if near else bi['front']) - 0.006
            mesh_box('Strap', (0.045, 0.012, 0.07), (x, y, z), strap, 0.004)
        mesh_box('StrapTop', (0.045, bi['back'] - bi['front'] + 0.02, 0.014), (x, (bi['back'] + bi['front'])/2, bi['sh'] + 0.004), strap, 0.005)

def add_kippa(bm, hair, rig, rgb):
    pts = eval_verts([bm] + ([hair] if hair else []))
    cx = rig.location.x; top = max(q.z for q in pts if abs(q.x - cx) < 0.05)
    ys = [q.y for q in pts if abs(q.x - cx) < 0.05 and q.z > top - 0.02]; yc = sum(ys)/len(ys)
    me = bpy.data.meshes.new('Kippa'); b = bmesh.new(); bmesh.ops.create_uvsphere(b, u_segments=40, v_segments=20, radius=0.075)
    bmesh.ops.delete(b, geom=[v for v in b.verts if v.co.z < 0.032], context='VERTS'); b.to_mesh(me); b.free()
    ob = bpy.data.objects.new('Kippa', me); SC.collection.objects.link(ob)
    ob.scale = (1, 1, 0.42); ob.location = (cx, yc + 0.03, top - 0.042); ob.rotation_euler = (math.radians(-20), 0, 0)
    sw = ob.modifiers.new('fit', 'SHRINKWRAP'); sw.target = hair or bm; sw.offset = 0.004; sw.wrap_mode = 'OUTSIDE_SURFACE'
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.003
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(matc('M_Kippa', rgb, 0.9))

def add_sunglasses(eyes, rig):
    pts = eval_verts([eyes]); cx = rig.location.x
    z = sum(p.z for p in pts)/len(pts); yf = min(p.y for p in pts) - 0.018
    lens = matc('M_Lens', (0.01, 0.01, 0.012), 0.05, 0.3); frame = matc('M_Frame', (0.02, 0.02, 0.02), 0.4)
    for sd in (1, -1):
        mesh_box('Lens', (0.052, 0.006, 0.038), (cx + sd*0.033, yf, z), lens, 0.012)
        mesh_box('Temple', (0.005, 0.11, 0.006), (cx + sd*0.07, yf + 0.055, z + 0.01), frame, 0)
    mesh_box('Bridge', (0.018, 0.005, 0.005), (cx, yf, z + 0.01), frame, 0)

def add_skirt(bm, rig, rgb, clothes=()):
    """חצאית ארוכה: מהירכיים (בלי הידיים) עד הקרסול, התרחבות מתונה"""
    cx = rig.location.x
    H = max(q.z for q in eval_verts([bm]))
    pts = eval_verts([bm] + list(clothes))
    zt = H * 0.56; zb = 0.12
    band = [q for q in pts if abs(q.z - zt) < 0.025 and abs(q.x - cx) < 0.17]
    if len(band) < 10: band = [Vector((cx + 0.16, 0, zt)), Vector((cx - 0.16, 0, zt)), Vector((cx, 0.1, zt)), Vector((cx, -0.1, zt))]
    xs = sorted(abs(q.x - cx) for q in band); rx = xs[int(len(xs) * 0.95) - 1] + 0.018
    cy = (max(q.y for q in band) + min(q.y for q in band)) / 2
    ys = sorted(abs(q.y - cy) for q in band); ry = ys[int(len(ys) * 0.95) - 1] + 0.02
    me = bpy.data.meshes.new('Skirt'); b = bmesh.new(); seg = 64; rings = []
    for k in range(9):
        t = k / 8; z = zt + (zb - zt) * t; f = 1 + 0.32 * t ** 1.2
        rings.append([b.verts.new((cx + rx*f*math.cos(2*math.pi*s/seg), cy + ry*f*math.sin(2*math.pi*s/seg) + 0.01*t, z)) for s in range(seg)])
    for a, c in zip(rings, rings[1:]):
        for s in range(seg): b.faces.new((a[s], a[(s+1) % seg], c[(s+1) % seg], c[s]))
    b.to_mesh(me); b.free()
    ob = bpy.data.objects.new('Skirt', me); SC.collection.objects.link(ob)
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.006; ob.modifiers.new('sub', 'SUBSURF').levels = 2
    d = ob.modifiers.new('folds', 'DISPLACE'); tx = bpy.data.textures.new('fold', 'CLOUDS'); tx.noise_scale = 0.08; d.texture = tx; d.strength = 0.012
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(matc('M_Skirt', rgb, 0.85))
    # חגורה דקה במותניים
    belt = bpy.data.meshes.new('Waist'); b = bmesh.new(); ring = []
    for s in range(seg): ring.append(b.verts.new((cx + (rx + 0.004)*math.cos(2*math.pi*s/seg), cy + (ry + 0.004)*math.sin(2*math.pi*s/seg), zt)))
    top = [b.verts.new((v.co.x, v.co.y, zt + 0.035)) for v in ring]
    for s in range(seg): b.faces.new((ring[s], ring[(s+1) % seg], top[(s+1) % seg], top[s]))
    b.to_mesh(belt); b.free()
    wb = bpy.data.objects.new('Waistband', belt); SC.collection.objects.link(wb); wb.data.materials.append(matc('M_Skirt2', tuple(c*0.8 for c in rgb), 0.8))

def stubble_mat(rgb, density=0.55):
    """שיער פנים: נקודות כהות על רקע שקוף (Noise), כדי שייראה כמו זיפים/זקן ולא כמו מסכה"""
    m = bpy.data.materials.new('M_Beard'); nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.inputs['Base Color'].default_value = (*rgb, 1); bsdf.inputs['Roughness'].default_value = 0.9
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mix = nt.nodes.new('ShaderNodeMixShader')
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 900; nz.inputs['Detail'].default_value = 2
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = 1 - density; ramp.color_ramp.elements[1].position = 1 - density + 0.08
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], mix.inputs['Fac']); nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(bsdf.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    try: m.blend_method = 'HASHED'
    except Exception: pass
    return m

def add_beard(bm, rig, rgb, length=0.012):
    """זקן/זיפים: שכבות דקות מעל הלסת והסנטר (בלי השפתיים), בחומר של נקודות שיער"""
    dg = bpy.context.evaluated_depsgraph_get(); e = bm.evaluated_get(dg); me = e.to_mesh()
    W = bm.matrix_world; R3 = W.to_3x3(); cx = rig.location.x
    vs = [W @ v.co for v in me.vertices]; top = max(v.z for v in vs if abs(v.x - cx) < 0.05)
    head = [v for v in vs if v.z > top - 0.27]; yfront = min(v.y for v in head)
    full = length >= 0.015
    def inside(q):
        dz = top - q.z; ax = abs(q.x - cx)
        if q.y > yfront + 0.085: return False
        if ax < 0.03: return 0.207 < dz < (0.30 if full else 0.262)          # סנטר, מתחת לשפה התחתונה
        if ax < 0.05: return 0.20 < dz < (0.29 if full else 0.255)
        return 0.15 < dz < (0.27 if full else 0.245) and ax < 0.078          # לסת ופאות
    b = bmesh.new(); vmap = {}
    for f in me.polygons:
        pw = [vs[i] for i in f.vertices]
        if all(inside(q) for q in pw):
            nv = []
            for i in f.vertices:
                if i not in vmap: vmap[i] = (vs[i], (R3 @ me.vertices[i].normal).normalized())
                nv.append(i)
            vmap.setdefault('faces', []).append(nv)
    e.to_mesh_clear()
    faces = vmap.pop('faces', [])
    if not faces: b.free(); print('beard: no faces'); return
    layers = 4 if full else 2
    for L in range(layers):                                    # כמה קליפות — נפח שיער
        off = 0.0015 + (length * L / max(1, layers - 1))
        idx = {}
        for i, (co, nrm) in vmap.items(): idx[i] = b.verts.new(co + nrm * off)
        for nv in faces:
            try: b.faces.new([idx[i] for i in nv])
            except ValueError: pass
    bm2 = bpy.data.meshes.new('Beard'); b.to_mesh(bm2); b.free()
    ob = bpy.data.objects.new('Beard', bm2); SC.collection.objects.link(ob)
    for f in bm2.polygons: f.use_smooth = True
    ob.data.materials.append(stubble_mat(rgb, 0.75 if full else 0.5))

def add_scarf(bm, hair, rig, rgb):
    """מטפחת: נצמדת לשיער/לראש (Shrinkwrap), פתוחה לפנים, עם קשר מאחור"""
    pts = eval_verts([bm] + ([hair] if hair else [])); cx = rig.location.x
    top = max(q.z for q in pts if abs(q.x - cx) < 0.06)
    head = [q for q in pts if q.z > top - 0.2 and abs(q.x - cx) < 0.12]
    cy = (max(q.y for q in head) + min(q.y for q in head)) / 2
    me = bpy.data.meshes.new('Scarf'); b = bmesh.new(); bmesh.ops.create_uvsphere(b, u_segments=48, v_segments=24, radius=1.0)
    bmesh.ops.delete(b, geom=[v for v in b.verts if (v.co.y < -0.25 and v.co.z < 0.55) or v.co.z < -0.55 or (v.co.y < 0.2 and v.co.z < -0.15)], context='VERTS')
    b.to_mesh(me); b.free()
    ob = bpy.data.objects.new('Scarf', me); SC.collection.objects.link(ob)
    ob.scale = (0.14, 0.15, 0.15); ob.location = (cx, cy + 0.01, top - 0.1)
    sw = ob.modifiers.new('fit', 'SHRINKWRAP'); sw.target = hair or bm; sw.offset = 0.008; sw.wrap_mode = 'OUTSIDE_SURFACE'; sw.wrap_method = 'NEAREST_SURFACEPOINT'
    ob.modifiers.new('sub', 'SUBSURF').levels = 1
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.004
    for f in me.polygons: f.use_smooth = True
    m = matc('M_Scarf', rgb, 0.85); ob.data.materials.append(m)
    # קשר מאחור + קצוות נופלים
    me2 = bpy.data.meshes.new('Knot'); b = bmesh.new(); bmesh.ops.create_uvsphere(b, u_segments=16, v_segments=10, radius=0.035); b.to_mesh(me2); b.free()
    k = bpy.data.objects.new('ScarfKnot', me2); SC.collection.objects.link(k)
    yb = max(q.y for q in head); k.location = (cx, yb + 0.01, top - 0.16); k.scale = (1.3, 0.8, 0.9); k.data.materials.append(m)
    for f in me2.polygons: f.use_smooth = True
    for sd in (1, -1):
        mesh_box('ScarfTail', (0.05, 0.012, 0.16), (cx + sd*0.02, yb + 0.012, top - 0.25), m, 0.008, rot=(0, math.radians(sd*8), 0))

def add_beret(bi, rgb):
    mesh_box('Beret', (0.05, 0.11, 0.14), (bi['cx'] - 0.17, (bi['back'] + bi['front'])/2, bi['sh'] - 0.05), matc('M_Beret', rgb, 0.9), 0.02, rot=(0, math.radians(-15), 0))

