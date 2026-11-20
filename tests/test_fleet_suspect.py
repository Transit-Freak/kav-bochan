# -*- coding: utf-8 -*-
"""בדיקות ל-tools/fleet_suspect.py (נתונים חשודים בצי הרכבים) — קלטים קטנים בזיכרון."""
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
import fleet_suspect as fs  # noqa: E402

TODAY = dt.date(2026, 11, 19)


def veh(plate, first='2024-01-01', last='2026-11-18', year=2020, model='M'):
    return [plate, first, last, 5.0, year, model, None, 'צבורי עירוני']


def fleet(*vs, name='אגד'):
    return {'updated': '2026-11-19', 'operators': [{'ref': 3, 'name': name, 'vehicles': list(vs)}]}


def off(km=100000, seats=40, size='אוטובוס'):
    return [km, seats, 'סין', 'דיזל', 'עירוני', size, 'x']


def gov(**kw):
    g = {'sug_rechev_nm': 'אוטובוס צבורי עירוני', 'shnat_yitzur': '2020', 'degem_nm': 'D1', 'tozeret_nm': 'T',
         'bitul_cd': '0', 'bitul_nm': 'לא מבוטל', 'bitul_dt': '', 'tokef_dt': '2027-01-01', 'mispar_mekomot': '40'}
    g.update(kw)
    return g


def run(fl, of, gv):
    out = fs.build(fl, {'of': of}, gv, TODAY)
    return {c['id']: c for c in out['checks']}


def plates(c):
    rows = c['rows'] if 'rows' in c else [r for g in c['groups'] for r in g['rows']]
    return sorted(r['plate'] for r in rows)


def test_seats_mismatch():
    c = run(fleet(veh('1'), veh('2')), {'1': off(seats=40), '2': off(seats=41)}, {'1': gov(), '2': gov()})
    assert plates(c['seats']) == ['2']
    r = c['seats']['rows'][0]
    assert (r['seats_off'], r['seats_reg'], r['op']) == (41, 40, 'אגד')


def test_size_vs_seats():
    of = {'1': off(seats=35, size='מיניבוס'), '2': off(seats=14, size='אוטובוס'),
          '3': off(seats=25, size='מפרקי 4 דלתות'), '4': off(seats=19, size='מיניבוס'), '5': off(seats=45, size='מפרקי 3 דלתות')}
    c = run(fleet(*[veh(p) for p in of]), of, {p: gov() for p in of})
    assert plates(c['size']) == ['1', '2', '3']


def test_model_in_several_sizes():
    of = {str(i): off(size='מיניבוס') for i in range(1, 6)}
    of['6'] = off(size='אוטובוס')
    # הבדל בין מפרקי 3 / 4 דלתות לא נחשב
    of['7'] = off(size='מפרקי 3 דלתות')
    of['8'] = off(size='מפרקי 4 דלתות')
    of['9'] = off(size='מפרקי 4 דלתות')
    gv = {p: gov(degem_nm='SPRINTER' if int(p) <= 6 else 'ART') for p in of}
    c = run(fleet(*[veh(p) for p in of]), of, gv)
    assert plates(c['model-size']) == ['6']
    r = c['model-size']['rows'][0]
    assert r['usual'] == 'מיניבוס' and r['n_usual'] == 5


def test_odd_seat_count():
    gv = {'1': gov(mispar_mekomot='98'), '2': gov(), '3': gov(), '4': gov(mispar_mekomot='5'),
          '5': gov(mispar_mekomot='4', sug_rechev_nm='טיולית')}
    c = run(fleet(*[veh(p) for p in gv]), {}, gv)
    assert plates(c['seats-odd']) == ['1', '4']
    r = [x for x in c['seats-odd']['rows'] if x['plate'] == '1'][0]
    assert r['usual'] == 40


def test_km_zero_new_and_old():
    vs = [veh('1'), veh('2'), veh('3', last='2026-09-01'), veh('4')]
    of = {'1': off(km=0), '2': off(km=0), '3': off(km=0), '4': off(km=5)}
    gv = {'1': gov(shnat_yitzur='2026'), '2': gov(shnat_yitzur='2019'), '3': gov(), '4': gov()}
    c = run(fleet(*vs), of, gv)['km0']
    old, new = c['groups']
    assert [r['plate'] for r in old['rows']] == ['2']
    assert [r['plate'] for r in new['rows']] == ['1']
    assert c['count'] == 2


def test_km_unlikely():
    of = {'1': off(km=9_040_441), '2': off(km=1_500_000), '3': off(km=1_000_000), '4': off(km=3_100_000)}
    gv = {'1': gov(shnat_yitzur='2019'), '2': gov(shnat_yitzur='2024'), '3': gov(shnat_yitzur='2024'),
          '4': gov(shnat_yitzur='2000')}
    c = run(fleet(*[veh(p) for p in of]), of, gv)
    # 2024: עד 3 שנים × 200 אלף = 600 אלף; 2000: מעל 3 מיליון
    assert plates(c['km-odd']) == ['1', '2', '3', '4']
    assert c['km-odd']['rows'][0]['plate'] == '1'
    of['3'] = off(km=500_000)
    assert plates(run(fleet(*[veh(p) for p in of]), of, gv)['km-odd']) == ['1', '2', '4']


def test_after_bitul():
    gv = {'1': gov(bitul_cd='3', bitul_nm='פרוק', bitul_dt='2026-08-20'),
          '2': gov(bitul_cd='3', bitul_nm='פרוק', bitul_dt='2026-11-18'),
          '3': gov(bitul_cd='0', bitul_dt='2026-01-01')}
    vs = [veh('1', last='2026-11-11'), veh('2', last='2026-11-18'), veh('3')]
    c = run(fleet(*vs), {}, gv)
    assert plates(c['after-bitul']) == ['1']
    assert c['after-bitul']['rows'][0]['status'] == 'פרוק'


def test_expired_licence():
    gv = {'1': gov(tokef_dt='2026-10-01'), '2': gov(tokef_dt='2026-11-10'),
          '3': gov(tokef_dt='2026-10-01'), '4': gov(tokef_dt='2026-10-01', bitul_cd='C')}
    vs = [veh('1'), veh('2'), veh('3', last='2026-11-01'), veh('4')]
    c = run(fleet(*vs), {}, gv)
    assert plates(c['expired']) == ['1']


def test_seen_before_production_year():
    gv = {'1': gov(shnat_yitzur='2024'), '2': gov(shnat_yitzur='2023')}
    vs = [veh('1', first='2023-12-04'), veh('2', first='2023-01-02')]
    c = run(fleet(*vs), {}, gv)
    assert plates(c['before-year']) == ['1']


def test_plate_merged_across_operators():
    fl = {'updated': '2026-11-19', 'operators': [
        {'ref': 3, 'name': 'אגד', 'vehicles': [veh('1', first='2022-05-01', last='2024-01-01')]},
        {'ref': 5, 'name': 'דן', 'vehicles': [veh('1', first='2024-02-01', last='2026-11-18')]}]}
    c = run(fl, {}, {'1': gov(shnat_yitzur='2023')})
    r = c['before-year']['rows'][0]
    assert (r['op'], r['first']) == ('דן', '2022-05-01')


def test_main_writes_file_and_skips_without_inputs(tmp_path):
    assert fs.main(str(tmp_path)) == 0
    assert not (tmp_path / 'fleet-suspect.json').exists()
    (tmp_path / 'fleet.json').write_text(json.dumps(fleet(veh('1'))), encoding='utf-8')
    (tmp_path / 'fleet-official.json').write_text(json.dumps({'of': {'1': off(seats=30)}}), encoding='utf-8')
    (tmp_path / 'gov-details-1.json').write_text(json.dumps({'1': gov()}), encoding='utf-8')
    assert fs.main(str(tmp_path)) == 0
    d = json.loads((tmp_path / 'fleet-suspect.json').read_text(encoding='utf-8'))
    assert {c['id']: c['count'] for c in d['checks']}['seats'] == 1
