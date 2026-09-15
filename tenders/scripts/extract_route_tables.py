"""Read explicitly labelled route/stop columns from official XLSX annexes.

Standard library only. Keep documents separate; a spreadsheet in a tender listing
does not by itself establish whether it describes existing or planned service.
"""
import collections
import datetime
import io
import json
import math
import pathlib
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from extract_documents import ROOT, read, write

NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def sheets(data):
    z=zipfile.ZipFile(io.BytesIO(data))
    if 'xl/workbook.xml' not in z.namelist():return
    if sum(i.file_size for i in z.infolist())>150000000:raise ValueError('Workbook exceeds expanded size limit')
    strings=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        strings=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    rels={r.get('Id'):posixpath.normpath(posixpath.join('xl',r.get('Target').lstrip('/'))) for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    for sh in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS):
        target=rels[sh.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
        if target.startswith('xl/xl/'):target=target[3:]
        rows=[]
        for row in ET.fromstring(z.read(target)).findall('s:sheetData/s:row',NS):
            cells={}
            for c in row:
                address=c.get('r','');letters=re.sub(r'\d','',address);col=0
                for letter in letters:col=col*26+ord(letter)-64
                v=c.find('s:v',NS);value=v.text if v is not None else ''
                if c.get('t')=='s':value=strings[int(value)] if value else ''
                elif c.get('t')=='inlineStr':value=''.join(c.find('s:is',NS).itertext())
                cells[col-1]=str(value or '').strip()
            rows.append((int(row.get('r')),cells))
        yield sh.get('name'),rows


def parse(data):
    routes=[];stops=collections.defaultdict(list)
    for sheet,rows in sheets(data) or []:
        if not rows:continue
        columns=rows[0][1];header={v:k for k,v in columns.items() if v}
        if not {'מקט','קו','כיוון','חלופה'}<=set(header):continue
        route_table={'שם תחנת מוצא','שם תחנת יעד'}<=set(header)
        stop_table={'סידורי תחנה','שם תחנה','מקט תחנה'}<=set(header)
        if not route_table and not stop_table:continue
        for rownum,cells in rows[1:]:
            def value(name):return cells.get(header.get(name,-1),'')
            key=tuple(value(k) for k in ('מקט','קו','כיוון','חלופה'))
            if not key[1] or not key[2] or not key[3]:continue
            if route_table:
                if not value('שם תחנת מוצא') or not value('שם תחנת יעד'):continue
                routes.append({'key':list(key),'origin':value('שם תחנת מוצא'),'destination':value('שם תחנת יעד'),
                               'area':value('שם יישוב מוצא'),'destinationArea':value('שם יישוב יעד'),
                               'sheet':sheet,'row':rownum})
            else:
                try:order=int(value('סידורי תחנה'))
                except ValueError:continue
                lon=lat=None
                try:
                    x=float(value('Long'));y=float(value('Lat'))
                    if math.isfinite(x) and math.isfinite(y) and 34<=x<=36.6 and 29<=y<=34:lon=x;lat=y
                except ValueError:pass
                stops[key].append([order,value('מקט תחנה'),value('שם תחנה'),lon,lat,rownum,sheet])
    for route in routes:
        route['stops']=sorted(stops.get(tuple(route['key']),[]),key=lambda s:s[0])
    # Preserve duplicate keys as separate source rows; never silently combine them.
    return routes


def main():
    state=read(ROOT/'annex-state.json',{'tenders':{}})
    index=read(ROOT/'route-index.json',{'tenders':{}})
    prior={'tenders':{id:[v for file in meta.get('files',[meta.get('file')]) for v in read(ROOT/file,[])] for id,meta in index['tenders'].items()}}
    cache=ROOT.parent.parent/'annex-cache'
    for id,tender in state['tenders'].items():
        versions={v['sha256']:v for v in prior['tenders'].get(id,[])}
        for url,doc in tender.get('documents',{}).items():
            digest=doc.get('sha256');path=cache/(str(digest)+'.zip')
            if not digest or not path.exists():continue
            try:routes=parse(path.read_bytes())
            except (ValueError,KeyError,ET.ParseError,zipfile.BadZipFile):continue
            if routes:
                versions[digest]={'sha256':digest,'url':url,'routes':routes,
                                 'scope':'קווים כפי שמופיעים בנספח המקושר. טרם הוכרע אם זו הגרסה הקובעת ואם כל השורות מתארות שירות מתוכנן.'}
        if versions:prior['tenders'][id]=list(versions.values())
    (ROOT/'route-data').mkdir(exist_ok=True)
    index={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tenders':{}}
    for id,versions in prior['tenders'].items():
        filename='route-data/'+id+'.json'
        encoded=json.dumps(versions,ensure_ascii=False,separators=(',',':'))+'\n'
        parts=[]
        if len(encoded.encode())>450000 and len(versions)>1:
            for n,version in enumerate(versions,1):
                part=f'route-data/{id}-{n}.json';(ROOT/part).write_text(json.dumps([version],ensure_ascii=False,separators=(',',':'))+'\n');parts.append(part)
        else:(ROOT/filename).write_text(encoded)
        index['tenders'][id]={'file':filename,'versions':len(versions),'rows':sum(len(v['routes']) for v in versions),
                              'uniqueRoutes':len({tuple(r['key']) for v in versions for r in v['routes']})}
        if parts:index['tenders'][id].pop('file');index['tenders'][id]['files']=parts
    write(ROOT/'route-index.json',index)
    print({k:sum(len(v['routes']) for v in vals) for k,vals in prior['tenders'].items()})


if __name__=='__main__':main()
