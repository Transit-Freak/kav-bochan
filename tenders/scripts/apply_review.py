"""Apply a semantic review only against exact downloaded document units.

Input: tenderId, documentKey, sha256, units [{index, disposition, note}],
sections [{title,text,unitIndices}], fields (typed), routes and maps.
Run after the scheduled reader actually reads each indicated unit. Extraction alone
never marks a unit reviewed. Maps need explicit route/variant labels and provenance.
"""
import argparse
import copy
import hashlib
import json
import pathlib
import re
from package_pipeline import ROOT, CACHE, STATE
from extract_documents import read, write
from tender_fields import validate


def prepare(payload,state):
    tid=payload['tenderId'];key=payload['documentKey'];digest=payload['sha256']
    doc=state['tenders'][tid]['documents'][key]
    if doc.get('sha256')!=digest:raise ValueError('Document changed; re-read before applying')
    source=CACHE/digest/'units.json'
    parsed=json.loads(source.read_text());units=parsed['units']
    checked={}
    for entry in payload['units']:
        n=entry['index']
        if type(n)!=int or not 0<=n<len(units) or n in checked:raise ValueError('Invalid or duplicate unit')
        if entry.get('disposition') not in {'summarized','no_relevant_terms','unreadable'} or not entry.get('note'):raise ValueError('Unit needs an explicit review outcome')
        checked[n]=entry
    def evidence(indices):
        if not indices or any(n not in checked or checked[n]['disposition']=='unreadable' for n in indices):raise ValueError('Evidence must belong to readable reviewed units')
        out=[]
        for n in indices:
            u=units[n];loc=('גיליון '+u['sheet'] if u.get('sheet') else 'פסקה '+str(u['block']) if u.get('block') else 'עמוד PDF '+str(u['page']))
            if u.get('imageMember'):loc='תמונה '+u['imageMember']
            if u.get('member'):loc=u['member']+', '+loc
            out.append({'url':doc['url']+('' if u.get('sheet') or u.get('block') or u.get('member') else '#page='+str(u['page'])), 'locator':loc,'sha256':digest,'unit':n})
        return out
    result={'sha256':digest,'url':doc['url'],'sections':[],'routes':[],'maps':[],'fields':{}}
    for section in payload.get('sections',[]):
        if not section.get('title') or not section.get('text'):raise ValueError('Empty summary')
        result['sections'].append({**section,'sources':evidence(section['unitIndices'])})
    for field,value in payload.get('fields',{}).items():
        value=copy.deepcopy(value)
        indices=value.pop('unitIndices',[])
        value['sources']=[{**s,'tenderId':tid,'fieldKey':field} for s in evidence(indices)]
        for condition in value.get('conditions',[]):
            condition['sources']=[{**s,'tenderId':tid,'fieldKey':field}
                                  for s in evidence(condition.pop('unitIndices',indices))]
        errors=validate(tid,{field:value})
        if errors:raise ValueError('; '.join(errors))
        result['fields'][field]=value
    for route in payload.get('routes',[]):
        if not re.fullmatch(r'\d{1,4}[א-ת]?',str(route.get('number',''))) or not route.get('area') or not route.get('description'):raise ValueError('Route identity and description required')
        result['routes'].append({**route,'sources':evidence(route['unitIndices'])})
    for m in payload.get('maps',[]):
        if not m.get('number') or not m.get('area') or not m.get('description') or not m.get('reuseBasis'):raise ValueError('Map requires route, description and reuse basis')
        refs=evidence([m['unitIndex']]);u=units[m['unitIndex']]
        if u.get('imageFile'):
            image_path=CACHE/digest/u['imageFile']
            if not image_path.is_file() or image_path.parent!=CACHE/digest:raise ValueError('Image unavailable')
            result['maps'].append({**m,'sources':refs,'_image':str(image_path)})
            continue
        if u.get('sheet') or u.get('block'):raise ValueError('Map must be a PDF page')
        path=CACHE/digest/'source.bin'
        if u.get('member'):
            path=path.with_name(hashlib.sha256(u['member'].encode()).hexdigest()[:20]+'.bin')
        if not path.exists() or not path.read_bytes().startswith(b'%PDF'):raise ValueError('Map PDF unavailable')
        result['maps'].append({**m,'sources':refs,'_pdf':str(path),'_page':u['page']})
    return tid,key,result,checked


def main():
    parser=argparse.ArgumentParser();parser.add_argument('review',type=pathlib.Path);args=parser.parse_args()
    payload=json.loads(args.review.read_text());state=read(STATE,{'tenders':{}})
    tid,key,result,checked=prepare(payload,state)
    import fitz
    for m in result['maps']:
        if '_image' in m:
            from PIL import Image
            filename=f"{payload['sha256'][:16]}-{key}-image-{m['unitIndex']}.webp"
            target=ROOT/'maps'/filename;target.parent.mkdir(exist_ok=True)
            with Image.open(m.pop('_image')) as image:image.convert('RGB').save(target,'WEBP',quality=88)
            m['image']='maps/'+filename
            continue
        pdf=m.pop('_pdf');page=m.pop('_page')
        filename=f"{payload['sha256'][:16]}-{key}-{page}.webp"
        target=ROOT/'maps'/filename;target.parent.mkdir(exist_ok=True)
        with fitz.open(pdf) as document:
            pix=document[page-1].get_pixmap(matrix=fitz.Matrix(1.7,1.7),alpha=False)
            pix.pil_save(str(target),format='WEBP',quality=88)
        m['image']='maps/'+filename
    out=read(ROOT/'semantic-reviews.json',{'tenders':{}})
    tender=out['tenders'].setdefault(tid,{'documents':{}})
    old=tender['documents'].get(key,{})
    if old.get('sha256')!=result['sha256']:old={}
    for part in ('sections','routes','maps'):
        combined=old.get(part,[])+result[part]
        result[part]=list({json.dumps(x,sort_keys=True,ensure_ascii=False):x for x in combined}.values())
    result['fields']={**old.get('fields',{}),**result['fields']}
    tender['documents'][key]=result
    doc=state['tenders'][tid]['documents'][key]
    doc['reviewedUnits']=sorted(set(doc.get('reviewedUnits',[]))|{n for n,e in checked.items() if e['disposition']!='unreadable'})
    doc['reviewNotes']={**doc.get('reviewNotes',{}),**{str(n):e for n,e in checked.items()}}
    write(ROOT/'semantic-reviews.json',out);write(STATE,state)
    print('Applied review',tid,key,len(checked),'units')


if __name__=='__main__':main()
