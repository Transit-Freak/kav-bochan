"""אוטובוס עירוני, לפי blender-hardsurface-modeling: blockout בקנה מידה אמיתי, חיתוכי Boolean, ואז מחסנית Bevel+Weighted Normal."""
import bpy, bmesh, math, sys, os
from mathutils import Vector
S = os.environ['SK']
for d in ('blender-hardsurface-modeling', 'blender-pbr-materials'):
    sys.path.insert(0, f'{S}/{d}/scripts')
import apply_stack, build_pbr_material as pbr

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
col = bpy.context.scene.collection
cut = bpy.data.collections.new('Cutters'); col.children.link(cut)

def box(name, size, loc, c=col):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); c.objects.link(ob)
    ob.scale = size; ob.location = loc
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ob

def cyl(name, r, depth, loc, seg=32, axis='X', c=col):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); c.objects.link(ob)
    if axis == 'X': ob.rotation_euler = (0, math.pi/2, 0)
    ob.location = loc
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob

def mat(name, base, rough, metal=0.0, emit=None, alpha=None, trans=0.0):
    m = bpy.data.materials.new(name)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 4
    if trans: b.inputs['Transmission Weight'].default_value = trans; b.inputs['IOR'].default_value = 1.5
    return m

def setm(ob, m): ob.data.materials.clear(); ob.data.materials.append(m)

L, W, H, Z0 = 12.0, 2.55, 2.75, 0.32          # מטרים — אוטובוס עירוני מפרקי לא, 12 מ' רגיל
paint = mat('M_Paint', (0.86, 0.87, 0.86), 0.32)
stripe = mat('M_Stripe', (0.05, 0.45, 0.33), 0.35)
glass = mat('M_Glass', (0.02, 0.03, 0.035), 0.05, metal=0.0)
glass_b = next(n for n in glass.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); glass_b.inputs['Specular IOR Level'].default_value = 1.0
black = mat('M_Trim', (0.03, 0.03, 0.03), 0.6)
rubber = mat('M_Rubber', (0.02, 0.02, 0.02), 0.85)
alu = mat('M_Rim', (0.75, 0.76, 0.77), 0.3, metal=1.0)
led = mat('M_Led', (1, 0.55, 0.1), 0.4, emit=(1, 0.5, 0.05))
head = mat('M_Head', (1, 1, 1), 0.1, emit=(1, 0.97, 0.9))

body = box('SM_Bus_Body', (W, L, H), (0, 0, Z0 + H/2))
# חלונות צד: שקע של 3 ס"מ לכל אורך, מלבד מקום הדלתות (צד ימין +X)
cutters = []
def cutter(name, size, loc):
    c = box(name, size, loc, cut); c.display_type = 'WIRE'; c.hide_render = True; cutters.append(c.name); return c
win_z = Z0 + 1.15 + 0.6; win_h = 1.15
for side in (1, -1):
    cutter(f'Cut_Win{side}', (0.08, L - 2.2, win_h), (side*(W/2), -0.2, win_z))
cutter('Cut_Front', (W - 0.25, 0.08, 1.75), (0, -L/2, Z0 + 1.45))         # שמשה קדמית
cutter('Cut_Rear', (W - 0.5, 0.08, 0.9), (0, L/2, Z0 + 1.95))
for i, y in enumerate((-4.6, -0.3)):                                        # שתי דלתות כפולות בצד ימין
    cutter(f'Cut_Door{i}', (0.08, 1.25, 2.35), (W/2, y, Z0 + 0.05 + 1.175))
for i, y in enumerate((-3.25, 2.9)):                                        # קשתות גלגלים
    for side in (1, -1):
        c = cyl(f'Cut_Arch{i}{side}', 0.6, 0.5, (side*W/2, y, 0.52), seg=48, c=cut); c.display_type = 'WIRE'; c.hide_render = True; cutters.append(c.name)
setm(body, paint)
print(apply_stack.run(objects=[body.name], preset='render', cutters=cutters, width=0.05, segments=4, solver='EXACT'))

# זכוכית בתוך השקעים
for side in (1, -1):
    g = box(f'SM_Glass{side}', (0.03, L - 2.25, win_h - 0.05), (side*(W/2 - 0.02), -0.2, win_z)); setm(g, glass)
    # עמודים בין החלונות
    for k in range(7):
        y = -L/2 + 1.3 + k*1.55
        if side == 1 and any(abs(y - d) < 0.8 for d in (-4.6, -0.3)): continue
        p = box(f'SM_Post{side}{k}', (0.05, 0.09, win_h), (side*(W/2 - 0.005), y, win_z)); setm(p, black)
g = box('SM_Windshield', (W - 0.3, 0.03, 1.7), (0, -L/2 + 0.02, Z0 + 1.45)); setm(g, glass)
g = box('SM_RearGlass', (W - 0.55, 0.03, 0.85), (0, L/2 - 0.02, Z0 + 1.95)); setm(g, glass)
for i, y in enumerate((-4.6, -0.3)):
    for k in (-1, 1):
        d = box(f'SM_DoorLeaf{i}{k}', (0.04, 0.6, 2.3), (W/2 - 0.03, y + k*0.31, Z0 + 1.2)); setm(d, glass)
        f = box(f'SM_DoorFrame{i}{k}', (0.05, 0.6, 2.3), (W/2 - 0.02, y + k*0.31, Z0 + 1.2)); setm(f, black)
        f.modifiers.new('wf', 'WIREFRAME').thickness = 0.05
# פס צבע
for side in (1, -1):
    s = box(f'SM_Stripe{side}', (0.012, L - 0.3, 0.22), (side*(W/2 + 0.003), 0, Z0 + 0.95)); setm(s, stripe)
# שלט מסלול קדמי
sign = box('SM_Sign', (W - 0.6, 0.03, 0.26), (0, -L/2 - 0.005, Z0 + 2.48)); setm(sign, mat('M_SignBg', (0.01, 0.01, 0.01), 0.5))
txt = bpy.data.curves.new('T_Sign', 'FONT'); txt.body = '18  Central Station'; txt.align_x = 'CENTER'; txt.size = 0.17
t = bpy.data.objects.new('SM_SignText', txt); col.objects.link(t); t.rotation_euler = (math.pi/2, 0, 0); t.location = (0, -L/2 - 0.025, Z0 + 2.42); setm(t, led)
# פנסים ופגושים
for side in (1, -1):
    hl = box(f'SM_Head{side}', (0.35, 0.03, 0.14), (side*(W/2 - 0.35), -L/2 - 0.005, Z0 + 0.48)); setm(hl, head)
    tl = box(f'SM_Tail{side}', (0.2, 0.03, 0.4), (side*(W/2 - 0.2), L/2 + 0.005, Z0 + 0.8)); setm(tl, mat('M_Tail', (0.6, 0, 0), 0.3, emit=(0.8, 0, 0)))
    m = box(f'SM_Mirror{side}', (0.08, 0.15, 0.42), (side*(W/2 + 0.32), -L/2 + 0.25, Z0 + 2.05)); setm(m, black)
    a = box(f'SM_MirrorArm{side}', (0.32, 0.04, 0.04), (side*(W/2 + 0.16), -L/2 + 0.25, Z0 + 2.3)); setm(a, black)
for y, nm in ((-L/2 - 0.04, 'Front'), (L/2 + 0.04, 'Rear')):
    b = box(f'SM_Bumper{nm}', (W - 0.02, 0.12, 0.3), (0, y, Z0 + 0.15)); setm(b, black)
ac = box('SM_RoofAC', (1.9, 3.2, 0.28), (0, 1.0, Z0 + H + 0.14)); setm(ac, paint)
print(apply_stack.run(objects=[ac.name, 'SM_BumperFront', 'SM_BumperRear'], preset='render', width=0.04, segments=3))
# גלגלים: צמיג (32 קטעים, גוף גדול) + חישוק
for i, y in enumerate((-3.25, 2.9)):
    for side in (1, -1):
        tire = cyl(f'SM_Tire{i}{side}', 0.5, 0.3, (side*(W/2 - 0.2), y, 0.5), seg=48); setm(tire, rubber)
        print(apply_stack.run(objects=[tire.name], preset='render', width=0.06, segments=4))
        rim = cyl(f'SM_Rim{i}{side}', 0.3, 0.02, (side*(W/2 - 0.04), y, 0.5), seg=32); setm(rim, alu)
        hub = cyl(f'SM_Hub{i}{side}', 0.1, 0.06, (side*(W/2 - 0.02), y, 0.5), seg=16); setm(hub, alu)
for o in bpy.data.objects:
    if o.type == 'MESH' and o.users_collection[0] != cut:
        for p in o.data.polygons: p.use_smooth = True
# כביש ומדרכה
road = box('ENV_Road', (30, 40, 0.02), (0, 0, -0.01)); setm(road, mat('M_Asphalt', (0.06, 0.06, 0.065), 0.85))
curb = box('ENV_Sidewalk', (6, 40, 0.15), (W/2 + 0.6 + 3, 0, 0.075)); setm(curb, mat('M_Pave', (0.42, 0.41, 0.39), 0.8))
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/bus.blend'))
print('BUS', body.dimensions[:], len(bpy.data.objects))
