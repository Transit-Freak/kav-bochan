"""Coverage audit for every known operating tender; counts never prove completeness."""
import datetime
from extract_documents import ROOT, read, write


def main():
    items = read(ROOT/'tenders-feed.json', {'items': []})['items'] + read(ROOT/'archive-feed.json', {'items': []})['items']
    reviews = read(ROOT/'document-reviews.json', {})
    extraction = read(ROOT/'extraction-state.json', {'tenders': {}})['tenders']
    packages = read(ROOT/'packages-state.json', {'tenders':{}})['tenders']
    automatic = read(ROOT/'automatic-summaries.json', {'tenders':{}})['tenders']
    semantic = read(ROOT/'semantic-reviews.json', {'tenders':{}})['tenders']
    route_index = read(ROOT/'route-index.json', {'tenders': {}})['tenders']
    result = {}
    for item in items:
        if item['classification'] != 'operating_tender':
            continue
        id = item['id']; review = reviews.get(id, {}); routes = review.get('routes', [])
        identities = [(r.get('area'), r.get('number'), r.get('description')) for r in routes]
        gaps = []
        annex = route_index.get(id, {})
        if not routes and not annex.get('rows'):
            gaps.append('עדיין אין רשימת קווים שנבדקה מול מסמכי המכרז.')
        if len(set(identities)) != len(identities):
            gaps.append('נמצאו שורות כפולות ברשימת הקווים; נדרשת בדיקה.')
        if any(not r.get('page') or not r.get('number') or not r.get('area') for r in routes):
            gaps.append('בחלק מהקווים חסרים אזור, מספר או עמוד מקור.')
        doc = review.get('document', {})
        latest = extraction.get(id, {}).get('document', {})
        if latest.get('sha256') and doc.get('sha256') != latest['sha256']:
            gaps.append('נקראה גרסת מסמך אחרת; יש לבדוק מחדש את התאמת רשימת הקווים.')
        manifest = review.get('routeTableCheck', {})
        table_checked = bool(routes and not gaps and manifest.get('sha256') == doc.get('sha256') and manifest.get('rows') == len(routes))
        if not table_checked:
            gaps.append('שלמות רשימת הקווים עדיין לא אומתה.')
        # No geometry is inferred from route numbers or today's GTFS.
        gaps.append('לא חוברו מפות מסלול מאומתות מנספחי המכרז. מספר קו ומוצא־יעד אינם מספיקים לשרטוט מפה.')
        extra=[]; maps=[]
        for collection in (automatic,semantic):
            for key,data in collection.get(id,{}).get('documents',{}).items():
                if packages.get(id,{}).get('documents',{}).get(key,{}).get('sha256')==data.get('sha256'):
                    extra.extend(data.get('routes',[]));maps.extend(data.get('maps',[]))
        if extra:
            gaps=[g for g in gaps if g!='עדיין אין רשימת קווים שנבדקה מול מסמכי המכרז.']
        if maps:
            gaps=[g for g in gaps if not g.startswith('לא חוברו מפות')]
            gaps.append('פורסמו צילומי מפות לחלק מהקווים; שלמות כיסוי המפות עדיין לא אומתה.')
        result[id] = {'listedRows': len(routes)+len(extra), 'publishedMaps':len(maps), 'annexRows':annex.get('rows',0), 'annexVersions':annex.get('versions',0), 'tableChecked': table_checked,
                      'routesComplete': False, 'mapsComplete': False, 'gaps': gaps}
    write(ROOT/'route-audit.json', {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'tenders': result})
    print('Route coverage checked for', len(result), 'tenders; verified tables:', sum(x['tableChecked'] for x in result.values()))


if __name__ == '__main__':
    main()
