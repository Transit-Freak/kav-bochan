"""Conservative recovery using complete, centered bus-profile map matches.

Never infer an exit from the angle of a GTFS shape. Two different context
windows must supply the same exit at the original roundabout entry.
"""
import bisect
import math


def window(pl, target, radius, spacing=15):
    start, end = max(0, target-radius), min(pl.total, target+radius)
    if target-start < 100 or end-target < 100:
        return None
    count = math.ceil((end-start)/spacing)
    pts = []
    distances = sorted(set([start+(end-start)*k/count for k in range(count+1)] + [target]))
    for distance in distances:
        i = min(len(pl.pts)-1, max(1, bisect.bisect_left(pl.cum, distance)))
        length = pl.cum[i]-pl.cum[i-1]
        t = (distance-pl.cum[i-1])/length if length else 0
        pts.append(tuple(a+(b-a)*t for a, b in zip(pl.pts[i-1], pl.pts[i])))
    return pts, distances.index(target)


def candidate(reply, pts, local, target):
    if reply.get('code') != 'Ok' or len(reply.get('matchings', [])) != 1:
        return None
    match = reply['matchings'][0]
    if match.get('confidence', 0) < .8:
        return None
    if not .90 <= match.get('distance', 0)/local.total <= 1.10:
        return None
    trace = reply.get('tracepoints', [])
    if len(trace) != len(pts) or any(p is None for p in trace):
        return None
    for original, snapped in zip(pts, trace):
        lon, lat = snapped['location']
        if math.hypot((lat-original[0])*local.ky, (lon-original[1])*local.kx) > 20:
            return None
    nearby = []
    for leg in match.get('legs', []):
        for step in leg.get('steps', []):
            man = step.get('maneuver', {})
            if man.get('type') not in ('roundabout', 'rotary'):
                continue
            lon, lat = man['location']
            f, error = local.locate(lat, lon, max(0, (target-20)/local.total))
            if error <= 10 and abs(f*local.total-target) <= 20:
                nearby.append((step, abs(f*local.total-target)))
    if len(nearby) != 1:
        return None
    step, offset = nearby[0]
    ex = step['maneuver'].get('exit')
    if offset > 3 or type(ex) is not int or ex <= 0:
        return None
    return step


def recover(osrm, pl, rows, match_chunk, classify):
    rows = [dict(row) for row in rows]
    missing = lambda row: row['kind'] == 'roundabout' and not row.get('exit')
    stats = {'before': sum(map(missing, rows)), 'duplicates': 0, 'recovered': 0, 'requests': 0}
    known = {}
    for row in rows:
        ex = row.get('exit')
        if row['kind'] == 'roundabout' and type(ex) is int and ex > 0:
            known.setdefault(row['f'], set()).add(ex)
    cleaned = []
    for row in rows:
        if missing(row) and len(known.get(row['f'], set())) == 1:
            stats['duplicates'] += 1
        else:
            cleaned.append(row)
    for row in cleaned:
        if not missing(row) or known.get(row['f']):
            continue
        candidates = []
        for radius in (350, 550):
            clip = window(pl, row['f']*pl.total, radius)
            if clip is None:
                break
            pts, target_index = clip
            local = type(pl)(pts)
            target = local.cum[target_index]
            try:
                stats['requests'] += 1
                reply = match_chunk(osrm, pts, 25, False)
                found = candidate(reply, pts, local, target)
            except (OSError, ValueError, KeyError, TypeError):
                found = None
            if found is None:
                break
            candidates.append(found)
        if len(candidates) != 2 or candidates[0]['maneuver']['exit'] != candidates[1]['maneuver']['exit']:
            continue
        a, b = (step['maneuver']['location'] for step in candidates)
        if math.hypot((a[0]-b[0])*pl.kx, (a[1]-b[1])*pl.ky) > 3:
            continue
        step = candidates[-1]
        row.update(classify(step['maneuver'], step.get('name', '')))
        row['exitSource'] = 'osrm-centered-consensus'
        stats['recovered'] += 1
    stats['remaining'] = sum(map(missing, cleaned))
    return cleaned, stats
