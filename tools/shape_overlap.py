"""Estimate directed shared GTFS geometry; this does not establish a passenger alternative."""
import math
STEP=20.0
TOLERANCE=20.0
MIN_RUN=100.0
COS_HEADING=math.cos(math.radians(30))
CELL=100.0
R=6371000.0
RAD=math.pi/180
class Shape:
    def __init__(self, points):
        self.segments=[];self.samples=[];self.grid={};self.total=0
        def xy(p):return p[1]*RAD*R*math.cos(31.5*RAD),p[0]*RAD*R
        for p,q in zip(points,points[1:]):
            a,b=xy(p),xy(q);dx,dy=b[0]-a[0],b[1]-a[1];proj=math.hypot(dx,dy)
            length=R*math.hypot((q[1]-p[1])*RAD*math.cos((p[0]+q[0])*RAD/2),(q[0]-p[0])*RAD)
            if length<.01:continue
            idx=len(self.segments);self.segments.append((a,dx,dy,proj,length,self.total))
            for ix in range(math.floor((min(a[0],b[0])-TOLERANCE)/CELL),math.floor((max(a[0],b[0])+TOLERANCE)/CELL)+1):
                for iy in range(math.floor((min(a[1],b[1])-TOLERANCE)/CELL),math.floor((max(a[1],b[1])+TOLERANCE)/CELL)+1):
                    self.grid.setdefault((ix,iy),[]).append(idx)
            n=max(1,math.ceil(length/STEP))
            for k in range(n):
                t=(k+.5)/n;self.samples.append((a[0]+t*dx,a[1]+t*dy,dx/proj,dy/proj,length/n))
            self.total+=length
    def match(self,p):
        x,y,ux,uy,weight=p;best=None
        for i in self.grid.get((math.floor(x/CELL),math.floor(y/CELL)),[]):
            a,dx,dy,proj,length,start=self.segments[i]
            if (ux*dx+uy*dy)/proj<COS_HEADING:continue
            t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(proj*proj)))
            d=math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)
            if d<=TOLERANCE and (best is None or d<best[0]):best=(d,start+t*length)
        return best

def directed(source,target):
    total=longest=run=0.0;previous=None;used=set();pending=[]
    def finish():
        nonlocal total,longest,run,pending
        if run>=MIN_RUN:
            total+=run;longest=max(longest,run);used.update(pending)
        run=0;pending=[]
    for sample in source.samples:
        found=target.match(sample);position=found[1] if found else None
        bucket=int(position/STEP) if position is not None else None
        if position is None or bucket in used or (previous is not None and (position<previous-2 or position-previous>STEP+2*TOLERANCE)):
            finish();previous=None
            if position is None or bucket in used:continue
        run+=sample[4];pending.append(bucket);previous=position
    finish();return total,longest

def compare(a,b):
    if a.total<MIN_RUN or b.total<MIN_RUN:return None
    ab,ar=directed(a,b);ba,br=directed(b,a);shared=min(ab,ba,a.total,b.total)
    return {'status':'estimated','sharedKm':round(shared/1000,2),
            'selfPct':round(100*shared/a.total,1),'otherPct':round(100*shared/b.total,1),
            'selfKm':round(a.total/1000,2),'otherKm':round(b.total/1000,2),
            'longestKm':round(min(ar,br,shared)/1000,2)}
