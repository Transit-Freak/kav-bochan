#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""זמני: שליפת קוד המקור של ערכי תחנות מוויקיפדיה — מחקר פורמט
לכיוון הזיהוי בוויקי-בודק. מדפיס טבלאות ושורות עם תבניות קו."""
import json
import urllib.parse
import urllib.request

TITLES = ['מסוף ארלוזורוב', 'התחנה המרכזית של באר שבע',
          'התחנה המרכזית החדשה', 'התחנה המרכזית של טבריה', 'מסוף רדינג']

for t in TITLES:
    print(f'===== ARTICLE: {t} =====', flush=True)
    url = ('https://he.wikipedia.org/w/api.php?action=query&prop=revisions'
           '&rvprop=content&rvslots=main&redirects=1&format=json&titles='
           + urllib.parse.quote(t))
    req = urllib.request.Request(url, headers={'User-Agent': 'kav-bochan-wiki-probe/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)
    pg = list(d['query']['pages'].values())[0]
    if 'revisions' not in pg:
        print('MISSING', flush=True)
        continue
    wt = pg['revisions'][0]['slots']['main']['*']
    print('TITLE:', pg['title'], 'LEN:', len(wt), flush=True)
    in_t = 0
    for ln in wt.split('\n'):
        s = ln.strip()
        if s.startswith('{|'):
            in_t += 1
        if in_t:
            print('T|', ln[:220], flush=True)
        elif 'קו' in ln and ('{{' in ln or '[[' in ln):
            print('L|', ln[:220], flush=True)
        if s.startswith('|}') and in_t:
            in_t -= 1
