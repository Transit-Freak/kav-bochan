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

def add_backpack(bi, rgb, big=False):
    w, d, h = (0.36, 0.22, 0.58) if big else (0.30, 0.13, 0.42)
    top = bi['sh'] - 0.04; zc = top - h/2
    mat = matc('M_Bag', rgb, 0.8)
    mesh_box('Backpack', (w, d, h), (bi['cx'], bi['back'] + d/2 + 0.005, zc), mat, 0.045)
    mesh_box('BagPocket', (w*0.7, 0.05, h*0.35), (bi['cx'], bi['back'] + d + 0.02, zc - h*0.18), mat, 0.02)
    strap = matc('M_Strap', (0.04, 0.04, 0.045), 0.8)
    for sd in (1, -1):
        x = bi['cx'] + sd*0.085
        mesh_box('StrapFront', (0.045, 0.012, 0.30), (x, bi['front'] - 0.004, bi['sh'] - 0.2), strap, 0.005)
        mesh_box('StrapTop', (0.045, bi['back'] - bi['front'] + 0.03, 0.014), (x, (bi['back'] + bi['front'])/2, bi['sh'] + 0.012), strap, 0.005)

def add_kippa(bm, hair, rig, rgb):
    pts = eval_verts([bm] + ([hair] if hair else []))
    cx = rig.location.x; top = max(p.z for p in pts if abs(p.x - cx) < 0.05)
    ys = [p.y for p in pts if abs(p.x - cx) < 0.05 and p.z > top - 0.02]; yc = sum(ys)/len(ys)
    me = bpy.data.meshes.new('Kippa'); b = bmesh.new(); bmesh.ops.create_uvsphere(b, u_segments=32, v_segments=16, radius=0.07)
    bmesh.ops.delete(b, geom=[v for v in b.verts if v.co.z < 0.025], context='VERTS'); b.to_mesh(me); b.free()
    ob = bpy.data.objects.new('Kippa', me); SC.collection.objects.link(ob)
    ob.scale = (1, 1, 0.5); ob.location = (cx, yc + 0.04, top - 0.025); ob.rotation_euler = (math.radians(-18), 0, 0)
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
    """חצאית ארוכה: חרוט מהמותניים עד הקרסול, ברוחב הירכיים הנראות"""
    pts = eval_verts([bm] + list(clothes)); cx = rig.location.x
    H = max(p.z for p in eval_verts([bm])); zt = H * 0.585; zb = 0.13
    band = [p for p in pts if abs(p.z - zt) < 0.03 and abs(p.x - cx) < 0.3] or [Vector((cx + 0.17, 0, zt)), Vector((cx, 0.12, zt)), Vector((cx, -0.12, zt))]
    rx = max(abs(p.x - cx) for p in band) + 0.025; cy = sum(p.y for p in band)/len(band)
    ry = max(abs(p.y - cy) for p in band) + 0.03
    me = bpy.data.meshes.new('Skirt'); b = bmesh.new(); seg = 48; rings = []
    for k in range(7):
        t = k / 6; z = zt + (zb - zt) * t; f = 1 + 0.55 * t ** 1.3
        rings.append([b.verts.new((cx + rx*f*math.cos(2*math.pi*s/seg), cy + ry*f*math.sin(2*math.pi*s/seg), z)) for s in range(seg)])
    for a, c in zip(rings, rings[1:]):
        for s in range(seg): b.faces.new((a[s], a[(s+1) % seg], c[(s+1) % seg], c[s]))
    b.to_mesh(me); b.free()
    ob = bpy.data.objects.new('Skirt', me); SC.collection.objects.link(ob)
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.008; ob.modifiers.new('sub', 'SUBSURF').levels = 1
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(matc('M_Skirt', rgb, 0.85))

def add_beard(bm, rig, rgb, length=0.012):
    """זקן: מעטפת מעל הלסת והסנטר של הגוף הנראה (לא מוצמד לאף פנים אמיתיות)"""
    dg = bpy.context.evaluated_depsgraph_get(); e = bm.evaluated_get(dg); me = e.to_mesh()
    W = bm.matrix_world; cx = rig.location.x
    vs = [W @ v.co for v in me.vertices]; top = max(v.z for v in vs if abs(v.x - cx) < 0.05)
    head = [v for v in vs if v.z > top - 0.26]; yfront = min(v.y for v in head)
    def inside(p):
        dz = top - p.z
        return 0.165 < dz < 0.255 and abs(p.x - cx) < 0.075 and p.y < yfront + 0.07
    b = bmesh.new(); vmap = {}
    for f in me.polygons:
        pw = [vs[i] for i in f.vertices]
        if all(inside(p) for p in pw):
            nv = []
            for i in f.vertices:
                if i not in vmap: vmap[i] = b.verts.new(vs[i] + (W.to_3x3() @ me.vertices[i].normal).normalized() * 0.004)
                nv.append(vmap[i])
            try: b.faces.new(nv)
            except ValueError: pass
    e.to_mesh_clear()
    if not b.faces: b.free(); print('beard: no faces'); return
    bm2 = bpy.data.meshes.new('Beard'); b.to_mesh(bm2); b.free()
    ob = bpy.data.objects.new('Beard', bm2); SC.collection.objects.link(ob)
    s = ob.modifiers.new('sol', 'SOLIDIFY'); s.thickness = length; s.offset = 1
    ob.modifiers.new('sub', 'SUBSURF').levels = 1
    for f in bm2.polygons: f.use_smooth = True
    m = matc('M_Beard', rgb, 0.95); ob.data.materials.append(m)

def add_scarf(bm, hair, rig, rgb):
    """מטפחת: כיפה רכה שמכסה את השיער מאחור ומלמעלה"""
    pts = eval_verts([bm] + ([hair] if hair else [])); cx = rig.location.x
    top = max(p.z for p in pts if abs(p.x - cx) < 0.06)
    head = [p for p in pts if p.z > top - 0.2 and abs(p.x - cx) < 0.12]
    cy = (max(p.y for p in head) + min(p.y for p in head)) / 2
    me = bpy.data.meshes.new('Scarf'); b = bmesh.new(); bmesh.ops.create_uvsphere(b, u_segments=32, v_segments=18, radius=1.0)
    bmesh.ops.delete(b, geom=[v for v in b.verts if v.co.y < -0.35 and v.co.z < 0.6], context='VERTS')   # פתוח מלפנים לפנים
    b.to_mesh(me); b.free()
    ob = bpy.data.objects.new('Scarf', me); SC.collection.objects.link(ob)
    ob.scale = (0.105, 0.125, 0.12); ob.location = (cx, cy + 0.02, top - 0.1)
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.06
    ob.modifiers.new('sub', 'SUBSURF').levels = 1
    for f in me.polygons: f.use_smooth = True
    ob.data.materials.append(matc('M_Scarf', rgb, 0.85))

def add_beret(bi, rgb):
    mesh_box('Beret', (0.05, 0.11, 0.14), (bi['cx'] - 0.17, (bi['back'] + bi['front'])/2, bi['sh'] - 0.05), matc('M_Beret', rgb, 0.9), 0.02, rot=(0, math.radians(-15), 0))

