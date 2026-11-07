"""כמה אנשים שונים מ-MPFB (נכסי MakeHuman CC0 בלבד): גברים ונשים, גילים, מבנה גוף, צבע עור, שיער ובגדים.

הקוד שבונה את האדם ומעביר אליו את ההליכה (tools/blender-test/anim.py בענף claude/blender-test) נשאר כמו שהוא.
הסקריפט הזה כותב ממנו עותק לכל אדם (anim_<n>.py), ומחליף רק את החלק שבוחר גוף, עור, שיער ובגדים.
לכל נכס יש כמה אפשרויות — לוקחים את הראשונה שקיימת בחבילת הנכסים.

הרצה: python3 person_variants.py <anim.py> <תיקיית פלט>   →  anim_0.py … anim_<N-1>.py, ומדפיס את N
"""
import json, os, sys

# גיל ב-MPFB: 0.5 = 25 שנים, 1.0 = 90 שנים (בין לבין — קו ישר); 0.1875 = 11 שנים
def age(y): return 0.1875 + (y - 11) / 14 * 0.3125 if y < 25 else 0.5 + (y - 25) / 65 * 0.5

def skin(kind):  # kind למשל 'middleage_caucasian_male'
    return [f'skins/{kind}/{kind}.mhmat', 'skins/default.mhmat']

C = lambda *names: [f'clothes/{n}/{n}.mhclo' for n in names]
H = lambda *names: [f'hair/{n}/{n}.mhclo' for n in names]

VARIANTS = [
    # 0 — הגבר הקודם (מכנסי ג'ינס וחולצה, שיער קצר כהה)
    dict(gender=1.0, age=age(40), weight=0.55, height=0.55, muscle=0.5,
         race={'caucasian': 0.8, 'african': 0.12, 'asian': 0.08}, skin=skin('middleage_caucasian_male'),
         hair=H('short04', 'short02'), hair_rgb=(0.03, 0.022, 0.016),
         clothes=[C('male_casualsuit01'), C('shoes02')], brows='eyebrow006'),
    # 1 — אישה צעירה, קוקו חום
    dict(gender=0.0, age=age(24), weight=0.45, height=0.5, muscle=0.45,
         race={'caucasian': 0.85, 'african': 0.05, 'asian': 0.1}, skin=skin('young_caucasian_female'),
         hair=H('ponytail01', 'long01', 'bob02'), hair_rgb=(0.16, 0.09, 0.045),
         clothes=[C('female_casualsuit01', 'female_casualsuit02'), C('shoes03', 'shoes01', 'shoes02')], brows='eyebrow010'),
    # 2 — גבר צעיר, עור כהה
    dict(gender=1.0, age=age(27), weight=0.5, height=0.62, muscle=0.6,
         race={'caucasian': 0.05, 'african': 0.9, 'asian': 0.05}, skin=skin('young_african_male'),
         hair=H('short02', 'short01', 'short04'), hair_rgb=(0.02, 0.016, 0.014),
         clothes=[C('male_casualsuit03', 'male_casualsuit02', 'male_casualsuit01'), C('shoes01', 'shoes02')], brows='eyebrow001'),
    # 3 — אישה מבוגרת, שיער אפור קצר, גוף מלא
    dict(gender=0.0, age=age(64), weight=0.72, height=0.42, muscle=0.4,
         race={'caucasian': 0.9, 'african': 0.03, 'asian': 0.07}, skin=skin('old_caucasian_female'),
         hair=H('bob02', 'bob01', 'short03'), hair_rgb=(0.42, 0.41, 0.4),
         clothes=[C('female_elegantsuit01', 'female_casualsuit02', 'female_casualsuit01'), C('shoes04', 'shoes03', 'shoes01')], brows='eyebrow012'),
    # 4 — גבר מבוגר, שיער אפור, חליפה
    dict(gender=1.0, age=age(70), weight=0.66, height=0.48, muscle=0.4,
         race={'caucasian': 0.85, 'african': 0.05, 'asian': 0.1}, skin=skin('old_caucasian_male'),
         hair=H('short01', 'short03', 'short04'), hair_rgb=(0.36, 0.35, 0.34),
         clothes=[C('male_elegantsuit01', 'male_worksuit01', 'male_casualsuit02'), C('shoes05', 'shoes02')], brows='eyebrow002'),
    # 5 — אישה, שיער ארוך שחור
    dict(gender=0.0, age=age(35), weight=0.5, height=0.45, muscle=0.45,
         race={'caucasian': 0.3, 'african': 0.0, 'asian': 0.7}, skin=skin('middleage_asian_female'),
         hair=H('long01', 'ponytail01', 'bob01'), hair_rgb=(0.018, 0.015, 0.013),
         clothes=[C('female_casualsuit02', 'female_casualsuit01'), C('shoes06', 'shoes01', 'shoes03')], brows='eyebrow009'),
    # 6 — נער (בערך 16)
    dict(gender=1.0, age=age(16), weight=0.42, height=0.5, muscle=0.5,
         race={'caucasian': 0.7, 'african': 0.15, 'asian': 0.15}, skin=skin('young_caucasian_male'),
         hair=H('short03', 'short02', 'short04'), hair_rgb=(0.1, 0.06, 0.03),
         clothes=[C('male_casualsuit02', 'male_casualsuit05', 'male_casualsuit06'), C('shoes01', 'shoes02')], brows='eyebrow004'),
    # 7 — אישה, עור כהה, שיער אפרו
    dict(gender=0.0, age=age(30), weight=0.58, height=0.55, muscle=0.5,
         race={'caucasian': 0.05, 'african': 0.9, 'asian': 0.05}, skin=skin('young_african_female'),
         hair=H('afro01', 'braid01', 'bob01'), hair_rgb=(0.025, 0.018, 0.014),
         clothes=[C('female_sportsuit01', 'female_casualsuit02'), C('shoes01', 'shoes03')], brows='eyebrow007'),
    # 8 — גבר בגיל העמידה, גוף מלא, שיער חום
    dict(gender=1.0, age=age(50), weight=0.78, height=0.45, muscle=0.45,
         race={'caucasian': 0.7, 'african': 0.1, 'asian': 0.2}, skin=skin('middleage_caucasian_male'),
         hair=H('short01', 'short02', 'short04'), hair_rgb=(0.12, 0.08, 0.05),
         clothes=[C('male_casualsuit04', 'male_casualsuit05', 'male_casualsuit02'), C('shoes02', 'shoes05')], brows='eyebrow003'),
]

BLOCK = '''
import json as _json
PV = _json.loads(%r)
def A2(cands):
    for rel in cands:
        g = sorted(glob.glob(f'{ud}/**/{rel}', recursive=True))
        if g: return g[0]
    print('VARIANT missing', cands); return None
if PV.get('list'):
    for ext in ('mhclo', 'mhmat'):
        print('ASSETS', ext, sorted(os.path.relpath(p, ud) for p in glob.glob(f'{ud}/**/*.' + ext, recursive=True)))
md = TS.get_default_macro_info_dict()
for k_ in ('gender', 'age', 'weight', 'height', 'muscle'):
    if k_ in PV: md[k_] = PV[k_]
md['race'] = PV['race']
bm = HS.create_human(feet_on_ground=True, macro_detail_dict=md)
HS.add_builtin_rig(bm, RIG, import_weights=True)
p_ = A2(PV['skin'])
if p_: HS.set_character_skin(p_, bm)
hair = None
items_ = [('Eyes', ['eyes/low-poly/low-poly.mhclo', 'eyes/high-poly/high-poly.mhclo']),
          ('Eyebrows', ['eyebrows/%%s/%%s.mhclo' %% (PV['brows'], PV['brows']), 'eyebrows/eyebrow006/eyebrow006.mhclo']),
          ('Hair', PV['hair'])] + [('Clothes', c) for c in PV['clothes']]
for kind, cands in items_:
    p_ = A2(cands)
    if not p_: continue
    try:
        ob = HS.add_mhclo_asset(p_, bm, asset_type=kind)
    except Exception as e_:
        print('VARIANT failed', kind, p_, e_); continue
    print('VARIANT', kind, os.path.relpath(p_, ud))
    if kind == 'Hair': hair = ob
rig = bm.parent
'''


def main(src, outdir):
    s = open(src).read()
    a = s.index('md = TS.get_default_macro_info_dict()')
    b = s.index('rig = bm.parent', a) + len('rig = bm.parent')
    os.makedirs(outdir, exist_ok=True)
    for n, v in enumerate(VARIANTS):
        v = dict(v, list=(n == 0))
        t = s[:a] + BLOCK.strip('\n') % json.dumps(v) + s[b:]
        rgb = '(%.3f, %.3f, %.3f, 1)' % tuple(v['hair_rgb'])
        for old in ('(0.025, 0.02, 0.016, 1)', '(0.03, 0.022, 0.016, 1)'):
            assert old in t, old
            t = t.replace(old, rgb)
        old = "filepath=os.path.abspath('out/anim.blend')"
        assert old in t
        t = t.replace(old, f"filepath=os.path.abspath('out/anim_{n}.blend')")
        # בלי הרינדורים שאחרי השמירה
        k = t.index(f"out/anim_{n}.blend')))")
        t = t[:t.index('\n', k)] + '\n'
        open(os.path.join(outdir, f'anim_{n}.py'), 'w').write(t)
    print(len(VARIANTS))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '.')
