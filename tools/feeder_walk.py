#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""הקו המזין — זמן הליכה מכל תחנת רכבת לתחנות האוטובוס הסמוכות (שלמה 14.10: "שזה יבדוק את
התחנה הקרובה מבחינת דקות הליכה").

ההליכה מחושבת בשרת ניווט מקומי (OSRM, פרופיל הולך רגל, מפת ישראל של OpenStreetMap — כמו
compute-walk-times לתחנה הבאה): לכל תחנת רכבת בקשת table אחת, מהתחנה לכל תחנות האוטובוס
שעד 600 מ' ממנה (מקובץ היום האחרון ב-bus/data/feeder). נקודת המוצא היא מיקום התחנה ב-
rail/data/stations.json; OSRM מצמיד אותה לשביל ההליכה הקרוב.

פלט: bus/data/feeder/walk.json = {"d": תאריך, "w": {קוד תחנת רכבת: {מק"ט: [מטרים, שניות]}}}.
תחנה שלא חושבה בריצה הזו נשארת מהריצה הקודמת. מסלול ארוך פי 4 מהמרחק האווירי (ועוד 300 מ')
נחשב הצמדה שגויה (למשל לצד השני של המסילה בלי מעבר) ולא נשמר — הדף מעריך אז מהמרחק.

    python3 tools/feeder_walk.py [--osrm http://localhost:5000] [--data bus/data/feeder]
"""
import argparse
import datetime
import glob
import json
import os
import re
import urllib.request


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--osrm', default='http://localhost:5000')
    ap.add_argument('--data', default='bus/data/feeder')
    ap.add_argument('--stations', default='rail/data/stations.json')
    a = ap.parse_args()
    days = sorted(f for f in glob.glob(f'{a.data}/*.json') if re.search(r'/\d{4}-\d{2}-\d{2}\.json$', f))
    if not days:
        raise SystemExit('אין קובצי יום ב-' + a.data)
    feed = json.load(open(days[-1], encoding='utf-8'))
    stations = json.load(open(a.stations, encoding='utf-8'))
    out_path = f'{a.data}/walk.json'
    try:
        old = json.load(open(out_path, encoding='utf-8')).get('w', {})
    except (OSError, ValueError):
        old = {}
    w, ok, bad, fail = dict(old), 0, 0, 0
    for rc, lst in feed['st'].items():
        st = stations.get(rc)
        stops = [x for x in lst if len(x) >= 5]
        if not st or not stops:
            continue
        coords = f'{st[2]},{st[1]};' + ';'.join(f'{x[4]},{x[3]}' for x in stops)
        url = f'{a.osrm}/table/v1/foot/{coords}?sources=0&annotations=duration,distance'
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                j = json.load(r)
            dur, dis = j['durations'][0], j['distances'][0]
        except Exception as e:  # noqa: BLE001 — תחנה אחת שנכשלה לא עוצרת את השאר
            print(f'  {st[0]}: {e}')
            fail += 1
            continue
        row = {}
        for k, x in enumerate(stops, start=1):
            sec, m = dur[k], dis[k]
            if sec is None or m is None or m > 4 * x[2] + 300:
                bad += 1
                continue
            row[x[0]] = [round(m), round(sec)]
            ok += 1
        w[rc] = row
    json.dump({'d': datetime.date.today().isoformat(), 'src': 'OSRM foot · © OpenStreetMap contributors', 'w': w},
              open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'זמני הליכה: {ok:,} תחנות · {bad:,} מסלולים חשודים לא נשמרו · {fail} תחנות רכבת נכשלו · {len(w)} תחנות רכבת בקובץ')
    if ok == 0:
        raise SystemExit('לא חושב אף זמן הליכה')


if __name__ == '__main__':
    main()
