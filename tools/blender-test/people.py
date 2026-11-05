"""קטלוג אנשים לבחירה: ~42 דמויות בשש קטגוריות, ממוספרות. הפנים והגוף מ-MPFB (מודל סטטיסטי) + שינוי אקראי — לא פנים של אדם אמיתי."""
import os, sys
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else '.', 'people_lib.py')).read())
import random

OLIVE = (0.27, 0.26, 0.15)
DARK = (0.03, 0.03, 0.035)
MED = (0.80, 0.12, 0.08)      # מוצא ים-תיכוני
ETH = (0.15, 0.80, 0.05)      # יוצאי אתיופיה
def P(g, age, race, skin, hair, suits, shoe='shoes02', recol=None, w=0.55, **extra):
    return dict(g=g, age=age, race=race, skin=skin, hair=hair, suits=suits, shoe=shoe, recol=recol, w=w, extra=extra)
M, F = 1.0, 0.0
CATS = [
 ('חילונים', [
   P(M, .45, MED, 'middleage_caucasian_male', 'short04', ['male_casualsuit01'], bag=(.08, .10, .16)),
   P(M, .40, MED, 'young_caucasian_male', 'short03', ['male_casualsuit03'], 'shoes03', sun=1),
   P(M, .35, ETH, 'young_african_male', 'short02', ['male_casualsuit05'], 'shoes06'),
   P(M, .30, MED, 'young_caucasian_male2', 'short01', ['male_casualsuit06'], 'shoes04', beard=(.06, .045, .035), blen=.006),
   P(M, .28, MED, 'young_caucasian_male', 'afro01', ['male_casualsuit02'], 'shoes01', recol=(.55, .1, .1), bag=(.15, .15, .15)),
   P(M, .55, MED, 'middleage_caucasian_male', 'short02', ['male_casualsuit04'], 'shoes02', recol=(.2, .35, .25), w=.65),
   P(M, .22, MED, 'young_caucasian_male2', 'short04', ['male_worksuit01'], 'shoes05', recol=(.12, .14, .2), sun=1),
   P(M, .38, MED, 'middleage_caucasian_male', 'short03', ['male_casualsuit05'], 'shoes03', beard=(.05, .04, .03), blen=.01),
 ]),
 ('חילוניות', [
   P(F, .30, MED, 'young_caucasian_female', 'long01', ['male_casualsuit03'], 'shoes02', bag=(.35, .12, .1)),
   P(F, .25, MED, 'young_caucasian_female', 'bob02', ['male_casualsuit01'], 'shoes01', sun=1),
   P(F, .22, ETH, 'young_african_female', 'ponytail01', ['male_casualsuit05'], 'shoes06', bag=(.12, .12, .12)),
   P(F, .35, MED, 'middleage_caucasian_female', 'braid01', ['male_casualsuit06'], 'shoes03', skirt=(.12, .2, .35)),
   P(F, .20, MED, 'young_caucasian_female2', 'long01', ['male_casualsuit04'], 'shoes01', recol=(.5, .45, .35), bag=(.2, .3, .25)),
   P(F, .28, MED, 'young_caucasian_female', 'afro01', ['male_casualsuit02'], 'shoes06', recol=(.15, .2, .3), sun=1),
   P(F, .45, MED, 'middleage_caucasian_female', 'bob01', ['male_casualsuit01'], 'shoes02', recol=(.35, .1, .15)),
   P(F, .24, MED, 'young_caucasian_female2', 'ponytail01', ['male_worksuit01'], 'shoes05', recol=(.1, .1, .12), bag=(.4, .3, .1)),
 ]),
 ('דתיים ודתיות', [
   P(M, .35, MED, 'young_caucasian_male', 'short04', ['male_casualsuit03'], 'shoes04', kippa=(.15, .35, .6), beard=(.06, .04, .03), blen=.008, bag=(.2, .25, .15)),
   P(M, .45, MED, 'middleage_caucasian_male', 'short02', ['male_casualsuit01'], 'shoes02', recol=(.85, .85, .85), kippa=(.85, .85, .8), beard=(.05, .04, .03), blen=.015),
   P(M, .25, MED, 'young_caucasian_male2', 'short01', ['male_casualsuit06'], 'shoes01', kippa=(.6, .15, .1), bag=(.1, .2, .3)),
   P(M, .30, ETH, 'young_african_male', 'short02', ['male_casualsuit04'], 'shoes03', recol=(.75, .78, .85), kippa=(.1, .1, .1)),
   P(F, .30, MED, 'young_caucasian_female', 'bob01', ['male_casualsuit05'], 'shoes01', skirt=(.25, .35, .55), scarf=(.55, .25, .3)),
   P(F, .25, MED, 'young_caucasian_female2', 'long01', ['male_casualsuit01'], 'shoes02', skirt=(.3, .3, .35), bag=(.45, .3, .2)),
   P(F, .40, MED, 'middleage_caucasian_female', 'bob02', ['male_casualsuit03'], 'shoes03', skirt=(.1, .15, .25), scarf=(.2, .4, .45)),
   P(F, .22, MED, 'young_caucasian_female', 'ponytail01', ['male_casualsuit06'], 'shoes06', skirt=(.4, .35, .3), bag=(.15, .15, .2)),
 ]),
 ('חרדים וחרדיות', [
   P(M, .55, MED, 'middleage_caucasian_male', 'short02', ['male_elegantsuit01', 'fedora01'], 'shoes02', recol=DARK, beard=(.04, .03, .025), blen=.03),
   P(M, .35, MED, 'young_caucasian_male', 'short04', ['male_elegantsuit01', 'fedora01'], 'shoes02', recol=DARK, beard=(.05, .035, .025), blen=.02),
   P(M, .65, MED, 'old_caucasian_male', 'short03', ['male_elegantsuit01', 'fedora_cocked'], 'shoes02', recol=DARK, beard=(.75, .75, .72), blen=.035),
   P(F, .40, MED, 'middleage_caucasian_female', 'bob02', ['male_casualsuit01'], 'shoes02', recol=(.06, .07, .12), skirt=(.04, .05, .09), bag=(.05, .05, .06)),
   P(F, .30, MED, 'young_caucasian_female', 'bob01', ['male_casualsuit03'], 'shoes02', recol=(.2, .22, .3), skirt=(.06, .06, .08)),
   P(F, .55, MED, 'middleage_caucasian_female', 'short02', ['male_casualsuit05'], 'shoes03', recol=(.08, .08, .1), skirt=(.05, .05, .07), scarf=(.06, .06, .08)),
 ]),
 ('חיילים וחיילות', [
   P(M, .22, MED, 'young_caucasian_male', 'short01', ['male_casualsuit01'], 'shoes05', recol=OLIVE, bag=OLIVE, big=1, beret=(.15, .25, .1)),
   P(M, .21, ETH, 'young_african_male', 'short02', ['male_casualsuit01'], 'shoes05', recol=OLIVE, bag=OLIVE, big=1, beret=(.45, .1, .15)),
   P(M, .23, MED, 'young_caucasian_male2', 'short04', ['male_casualsuit03'], 'shoes05', recol=OLIVE, beret=(.1, .1, .1), sun=1),
   P(F, .20, MED, 'young_caucasian_female', 'ponytail01', ['female_casualsuit01'], 'shoes05', recol=OLIVE, bag=OLIVE, big=1),
   P(F, .20, MED, 'young_caucasian_female2', 'braid01', ['male_casualsuit01'], 'shoes05', recol=OLIVE, beret=(.15, .25, .1)),
   P(F, .21, ETH, 'young_african_female', 'ponytail01', ['male_casualsuit01'], 'shoes05', recol=OLIVE, bag=(.1, .1, .1)),
 ]),
 ('מבוגרים', [
   P(M, .80, MED, 'old_caucasian_male', 'short03', ['male_casualsuit01'], 'shoes02', recol=(.55, .5, .4), w=.62),
   P(M, .75, MED, 'old_caucasian_male', 'short02', ['male_elegantsuit01'], 'shoes02', kippa=(.1, .1, .1), w=.6),
   P(F, .78, MED, 'old_caucasian_female', 'bob01', ['male_casualsuit03'], 'shoes03', skirt=(.25, .25, .3), bag=(.3, .15, .1)),
   P(F, .72, MED, 'old_caucasian_female', 'bob02', ['male_casualsuit06'], 'shoes02', sun=1, skirt=(.15, .15, .2)),
   P(M, .70, ETH, 'old_african_male', 'short02', ['male_casualsuit05'], 'shoes03', w=.58),
   P(F, .75, ETH, 'old_african_female', 'short02', ['male_casualsuit01'], 'shoes02', recol=(.85, .82, .7), scarf=(.9, .88, .8), skirt=(.85, .82, .7)),
 ]),
]

def make(sp, x, y, num, seed):
    g, age, (c, af, asi) = sp['g'], sp['age'], sp['race']; extra = sp['extra']
    md = TS.get_default_macro_info_dict()
    md.update(gender=g, age=age, proportions=0.5 + 0.08*((seed % 3) - 1), muscle=0.5, weight=sp['w'], height=0.55 if g else 0.45)
    md['race'] = {'caucasian': c, 'african': af, 'asian': asi}
    bm = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
    rnd = random.Random(1000 + seed)
    root = os.path.dirname(importlib.import_module(base).__file__) + '/data/targets'
    cands = [q for g_ in ('nose', 'eyes', 'eyebrows', 'mouth', 'chin', 'cheek', 'head') for q in glob.glob(f'{root}/{g_}/*.target.gz')]
    for pth in rnd.sample(cands, min(12, len(cands))):
        try: TS.load_target(bm, pth, weight=rnd.uniform(0.15, 0.5))
        except Exception: pass
    HS.add_builtin_rig(bm, 'default', import_weights=True)
    try: HS.set_character_skin(A(f"skins/{sp['skin']}/{sp['skin']}.mhmat"), bm)
    except Exception as e: print('skin', e)
    objs = {}
    eb = (seed % 3) + 6
    for kind, rel in [('Eyes', 'eyes/high-poly/high-poly.mhclo'), ('Eyebrows', f'eyebrows/eyebrow00{eb}/eyebrow00{eb}.mhclo'),
                      ('Eyelashes', 'eyelashes/eyelashes01/eyelashes01.mhclo'), ('Hair', f"hair/{sp['hair']}/{sp['hair']}.mhclo")] + \
                     [('Clothes', f'clothes/{s}/{s}.mhclo') for s in sp['suits']] + [('Clothes', f"clothes/{sp['shoe']}/{sp['shoe']}.mhclo")]:
        if kind == 'Hair' and ('scarf' in extra) and sp['hair'] not in ('bob01', 'bob02', 'short02'): pass
        try: objs.setdefault(kind, []).append(HS.add_mhclo_asset(A(rel), bm, asset_type=kind))
        except Exception as e: print('asset fail', rel, e)
    rig = bm.parent
    for pb in rig.pose.bones:
        if pb.name.startswith('upperarm01'):
            h = pb.head.copy(); sgn = 1 if h.x > 0 else -1
            pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(sgn * math.radians(38 + rnd.uniform(-4, 6)), 4, 'Y') @ Matrix.Translation(-h) @ pb.matrix
            bpy.context.view_layer.update()
    rig.location = (x, y, 0); rig.rotation_euler = (0, 0, math.radians(rnd.uniform(-6, 6)))
    bpy.context.view_layer.update()
    clothes = objs.get('Clothes', [])
    hat = [o for o in clothes if 'fedora' in o.name]
    if sp['recol']: recolor([o for o in clothes[:-1] if o not in hat], sp['recol'])
    if hat: recolor(hat, (0.015, 0.015, 0.018), keep_shading=False)
    bi = body_info(bm, rig, [o for o in clothes if o not in hat])
    if 'bag' in extra: add_backpack(bi, extra['bag'], extra.get('big'), [o for o in clothes if o not in hat])
    if 'kippa' in extra: add_kippa(bm, (objs.get('Hair') or [None])[0], rig, extra['kippa'])
    if 'sun' in extra and objs.get('Eyes'): add_sunglasses(objs['Eyes'][0], rig)
    if 'beret' in extra: add_beret(bi, extra['beret'])
    if 'skirt' in extra: add_skirt(bm, rig, extra['skirt'], [o for o in clothes if o not in hat])
    if 'beard' in extra: add_beard(bm, rig, extra['beard'], extra.get('blen', 0.012))
    if 'scarf' in extra: add_scarf(bm, (objs.get('Hair') or [None])[0], rig, extra['scarf'])
    t = bpy.data.curves.new(f'N{num}', 'FONT'); t.body = str(num); t.size = 0.2; t.align_x = 'CENTER'
    to = bpy.data.objects.new(f'Num{num}', t); SC.collection.objects.link(to); to.location = (x, y - 0.45, 0.005)
    to.data.materials.append(matc('M_Num', (0.05, 0.05, 0.05), 0.6))
    print('PERSON', num, sp['suits'], sp['skin'], sp['hair'], sorted(extra))
    return bm

SP = 0.85
rows = []; num = 0
for ci, (cat, people) in enumerate(CATS):
    y = ci * 30.0; xs = []
    for k, sp in enumerate(people):
        num += 1; x = (k - (len(people) - 1)/2) * SP
        try: make(sp, x, y, num, num)
        except Exception: traceback.print_exc()
        xs.append((num, x))
    rows.append((cat, y, xs))
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/people.blend'))

SC.render.engine = 'CYCLES'; SC.cycles.device = 'CPU'; SC.cycles.samples = int(os.environ.get('SAMPLES', '80')); SC.cycles.use_denoising = True
try: SC.view_settings.view_transform = 'AgX'
except TypeError: pass
w = bpy.data.worlds.new('W'); SC.world = w
bg = next(nd for nd in w.node_tree.nodes if nd.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.82, 0.84, 0.87, 1); bg.inputs[1].default_value = 0.7
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); SC.collection.objects.link(sun)
sun.data.energy = 3.2; sun.rotation_euler = (math.radians(42), 0, math.radians(-22))
me = bpy.data.meshes.new('floor'); fl = bpy.data.objects.new('floor', me); SC.collection.objects.link(fl)
b = bmesh.new(); bmesh.ops.create_grid(b, x_segments=1, y_segments=1, size=200); b.to_mesh(me); b.free()
fl.data.materials.append(matc('M_Floor', (0.62, 0.62, 0.6), 0.9))
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('C')); SC.collection.objects.link(cam)
for ci, (cat, y, xs) in enumerate(rows):
    n = len(xs); width = n * SP + 0.6
    SC.render.resolution_x, SC.render.resolution_y = 2400, int(2400 * 2.2 / width)
    cam.data.lens = 50; dist = width * 50 / 36 + 0.3
    cam.location = (0, y - dist, 1.0); cam.rotation_euler = (math.radians(89), 0, 0); SC.camera = cam
    SC.render.filepath = os.path.abspath(f'out/cat{ci + 1}.png'); bpy.ops.render.render(write_still=True); print('RENDER', ci + 1, cat)
    cam.location = (0, y + dist, 1.0); cam.rotation_euler = (math.radians(89), 0, math.radians(180))
    SC.render.filepath = os.path.abspath(f'out/cat{ci + 1}_back.png'); bpy.ops.render.render(write_still=True)
# תקריבי פנים לכל מי שיש לו זקן/כיפה/מטפחת
SC.render.resolution_x, SC.render.resolution_y = 700, 700; cam.data.lens = 85
for ci, (cat, y, xs) in enumerate(rows):
    for (nm, x), sp in zip(xs, CATS[ci][1]):
        if not ({'beard', 'kippa', 'scarf', 'sun'} & set(sp['extra'])): continue
        rig = next((o for o in bpy.data.objects if o.type == 'ARMATURE' and abs(o.location.x - x) < 0.01 and abs(o.location.y - y) < 0.01), None)
        hz = (rig.matrix_world @ rig.pose.bones['head'].head).z + 0.08 if rig and 'head' in rig.pose.bones else (1.6 if sp['g'] else 1.5)
        cam.location = (x + 0.3, y - 1.45, hz + 0.02)
        cam.rotation_euler = (Vector((x, y, hz)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        SC.render.filepath = os.path.abspath(f'out/face{nm:02d}.png'); bpy.ops.render.render(write_still=True)
print('RENDER faces done')
