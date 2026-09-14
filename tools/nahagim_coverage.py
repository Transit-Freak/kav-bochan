"""Read-only coverage assessment: suppress uncertain guidance, never repair geometry."""
import math

def merge_ranges(rows):
    result = []
    for row in sorted(rows, key=lambda x: x['from']):
        if result and row['from'] <= result[-1]['to']:
            result[-1]['to'] = max(result[-1]['to'], row['to'])
        else:
            result.append(dict(row))
    return result

def assess(pl, reply, start, end, source_fractions=None):
    """Compare every 10 m of source segments with matched roads, not just vertices.
    A mismatch does not establish which source is wrong. Confidence is only a
    screening gate and never presented as a probability of route correctness.
    """
    start, end = max(0, start), min(1, end)
    if end <= start:
        return []
    def whole(reason):
        return [{'from': start, 'to': end, 'reason': reason}]
    if not reply or reply.get('code') != 'Ok' or not reply.get('matchings'):
        return whole('matching-unavailable')
    matches = reply['matchings']
    if len(matches) != 1 or min(m.get('confidence', 0) for m in matches) < .8:
        return whole('matching-uncertain')
    # Missing tracepoints mean the matcher discarded part of the source.
    trace = reply.get('tracepoints')
    if not trace:
        return whole('source-points-unmatched')
    dropped = []
    if any(p is None for p in trace):
        # A discarded sample invalidates its local neighbourhood, not the
        # entire matching chunk. Keep geometry verification below for all
        # remaining source segments; never certify a gap from confidence alone.
        fs = source_fractions
        if (fs is None or len(fs) != len(trace) or
            any(not math.isfinite(f) for f in fs) or
            any(a > b for a,b in zip(fs, fs[1:]))):
            return whole('source-points-unmatched')
        for i,p in enumerate(trace):
            if p is not None:
                continue
            left = i-1
            while left >= 0 and trace[left] is None: left -= 1
            right = i+1
            while right < len(trace) and trace[right] is None: right += 1
            lo = fs[left] if left >= 0 else start
            hi = fs[right] if right < len(trace) else end
            lo,hi = max(start,lo-30/pl.total),min(end,hi+30/pl.total)
            if hi > lo:
                dropped.append({'from':lo,'to':hi,'reason':'source-points-unmatched'})
    coords = matches[0].get('geometry', {}).get('coordinates', [])
    if len(coords) < 2:
        return whole('matched-geometry-unavailable')
    xy = [(p[0]*pl.kx, p[1]*pl.ky) for p in coords]
    cells = {}
    limit, cell = 20.0, 100.0
    for a,b in zip(xy,xy[1:]):
        for ix in range(math.floor((min(a[0],b[0])-limit)/cell), math.floor((max(a[0],b[0])+limit)/cell)+1):
            for iy in range(math.floor((min(a[1],b[1])-limit)/cell), math.floor((max(a[1],b[1])+limit)/cell)+1):
                cells.setdefault((ix,iy), []).append((a,b))
    def near(p):
        for a,b in cells.get((math.floor(p[0]/cell), math.floor(p[1]/cell)), []):
            dx,dy=b[0]-a[0],b[1]-a[1]
            t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy or 1)))
            if math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy) <= limit:
                return True
        return False
    bad=list(dropped)
    for i,(a,b) in enumerate(zip(pl.xy,pl.xy[1:])):
        lo,hi=max(start*pl.total,pl.cum[i]),min(end*pl.total,pl.cum[i+1])
        if hi<=lo:continue
        n=max(1,math.ceil((hi-lo)/10))
        for k in range(n+1):
            position=lo+(hi-lo)*k/n
            t=(position-pl.cum[i])/(pl.cum[i+1]-pl.cum[i] or 1)
            if not near((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]))):
                bad.append({'from':max(start,(position-30)/pl.total),'to':min(end,(position+30)/pl.total),'reason':'shape-road-mismatch'})
    return merge_ranges(bad)
