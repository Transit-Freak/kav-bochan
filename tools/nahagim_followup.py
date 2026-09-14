"""Repair only unresolved exits; preserve vertices and retain diagnostic evidence."""
import argparse
import bisect
import collections
import copy
import datetime
import gzip
import json
import math
import pathlib
from concurrent.futures import ThreadPoolExecutor
from nahagim_build import Polyline, classify, match_chunk
from nahagim_roundabouts import candidate


def clip(pl, target, radius):
    start, end = max(0, target-radius), min(pl.total, target+radius)
    # Require real geometry on both sides, but don't exclude an entry simply
    # because it is 30-100m from the start/end of a representative trip.
    if min(target-start, end-target) < 30:
        return None
    distances = {start, target, end}
    distances.update(d for d in pl.cum if start < d < end)
    # Keep original vertices instead of cutting across small roundabouts.
    anchors = sorted(distances)
    for a, b in zip(anchors, anchors[1:]):
        n = math.ceil((b-a)/15)
        for k in range(1, n):
            distances.add(a+(b-a)*k/n)
    distances = sorted(distances)
    if len(distances) > 1900:
        return None
    pts = []
    for d in distances:
        i = min(len(pl.pts)-1, max(1, bisect.bisect_left(pl.cum, d)))
        length = pl.cum[i]-pl.cum[i-1]
        t = (d-pl.cum[i-1])/length if length else 0
        pts.append(tuple(a+(b-a)*t for a,b in zip(pl.pts[i-1],pl.pts[i])))
    return pts, distances.index(target)


def explain(reply, pts, local, target):
    if reply.get('code') != 'Ok': return 'match_failed'
    if len(reply.get('matchings', [])) != 1: return 'split_match'
    m = reply['matchings'][0]
    if m.get('confidence', 0) < .8: return 'low_confidence'
    if not .9 <= m.get('distance', 0)/local.total <= 1.1: return 'length_mismatch'
    trace = reply.get('tracepoints', [])
    if len(trace) != len(pts) or any(p is None for p in trace): return 'trace_gap'
    for p, t in zip(pts, trace):
        lo, la = t['location']
        if math.hypot((la-p[0])*local.ky,(lo-p[1])*local.kx)>20: return 'snap_distance'
    nearby = []
    for leg in m.get('legs', []):
        for step in leg.get('steps', []):
            man = step.get('maneuver', {})
            if man.get('type') not in ('roundabout','rotary'): continue
            lo,la = man['location']
            f,error = local.locate(la,lo,max(0,(target-20)/local.total))
            offset = abs(f*local.total-target)
            if error<=10 and offset<=20: nearby.append((offset,man.get('exit')))
    if not nearby: return 'entry_not_found'
    if len(nearby)!=1: return 'ambiguous_entry'
    if nearby[0][0]>3: return 'entry_offset'
    if type(nearby[0][1]) is not int or nearby[0][1]<=0: return 'exit_missing'
    return 'accepted'


def repair_row(pl, row, osrm, request=match_chunk):
    attempts, accepted = [], []
    target = row['f']*pl.total
    signatures = set()
    for radius in (350,550,800,1100):
        c = clip(pl,target,radius)
        if c is None:
            attempts.append({'radius':radius,'reason':'insufficient_context'})
            continue
        pts,index = c
        signature = tuple(pts)
        if signature in signatures: continue
        signatures.add(signature)
        local = Polyline(pts)
        record = {'radius':radius,'points':pts,'target_index':index}
        try:
            reply = request(osrm,pts,25,False)
            record['reply'] = reply
            record['reason'] = explain(reply,pts,local,local.cum[index])
            step = candidate(reply,pts,local,local.cum[index])
            if step is not None:
                accepted.append(step)
        except (OSError, ValueError, KeyError, TypeError) as error:
            record['reason'] = 'request_error'
            record['error'] = str(error)
        attempts.append(record)
    exits = {step['maneuver']['exit'] for step in accepted}
    if len(exits)>1: return None, attempts, 'conflicting_exits'
    if len(accepted)<2: return None, attempts, 'fewer_than_two_verified_matches'
    locations = [step['maneuver']['location'] for step in accepted]
    if any(math.hypot((a[0]-b[0])*pl.kx,(a[1]-b[1])*pl.ky)>3 for a in locations for b in locations):
        return None, attempts, 'entry_disagreement'
    step=accepted[-1]
    result=copy.deepcopy(row)
    result.update(classify(step['maneuver'],step.get('name','')))
    result['exitSource']='osrm-preserved-vertices-consensus'
    return result, attempts, 'recovered'


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('feed',type=pathlib.Path)
    ap.add_argument('--osrm',required=True)
    ap.add_argument('--report',type=pathlib.Path,required=True)
    ap.add_argument('--workers',type=int,default=6)
    a=ap.parse_args();a.report.mkdir(parents=True,exist_ok=True)
    def process(path):
        doc=json.load(gzip.open(path));changed=0;cases=[]
        pending=[i for i,m in enumerate(doc.get('maneuvers',[])) if m['kind']=='roundabout' and not m.get('exit')]
        if not pending:return cases
        pl=Polyline(doc['geom'])
        for i in pending:
            row=doc['maneuvers'][i]
            # Never override contradictory already-known instructions at this entry.
            known={m.get('exit') for m in doc['maneuvers'] if m['kind']=='roundabout' and m['f']==row['f'] and m.get('exit')}
            if known:
                fixed,attempts,reason=None,[],'existing_entry_conflict'
            else:
                fixed,attempts,reason=repair_row(pl,row,a.osrm)
            evidence={'route':doc['id'],'f':row['f'],'reason':reason,'attempts':attempts}
            with gzip.open(a.report/f"{doc['id']}-{i}.json.gz",'wt',encoding='utf8') as f:json.dump(evidence,f,ensure_ascii=False)
            cases.append({'route':doc['id'],'line':doc['shortName'],'f':row['f'],'result':reason,'exit':fixed.get('exit') if fixed else None,'attempt_reasons':[x['reason'] for x in attempts]})
            if fixed:doc['maneuvers'][i]=fixed;changed+=1
        if changed:
            doc['nav']['followupRecovered']=changed
            with gzip.open(path,'wt',encoding='utf8') as f:json.dump(doc,f,ensure_ascii=False,separators=(',',':'))
        return cases
    cases=[]
    with ThreadPoolExecutor(max_workers=a.workers) as pool:
        for rows in pool.map(process,sorted(a.feed.joinpath('routes').glob('*.gz'))):
            cases.extend(rows)
    fixed=sum(c['result']=='recovered' for c in cases)
    summary={'before':len(cases),'recovered':fixed,'remaining':len(cases)-fixed,'reasons':dict(collections.Counter(c['result'] for c in cases)),'attempt_reasons':dict(collections.Counter(r for c in cases for r in c['attempt_reasons'])),'cases':cases}
    (a.report/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    stats=json.loads((a.feed/'stats.json').read_text())
    stats['roundabouts_followup_recovered']=stats.get('roundabouts_followup_recovered',0)+fixed
    stats['roundabouts_recovered']=stats.get('roundabouts_recovered',0)+fixed
    stats['roundabouts_remaining']=len(cases)-fixed
    stats['roundabouts_followup_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    (a.feed/'stats.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in summary.items() if k!='cases'},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
