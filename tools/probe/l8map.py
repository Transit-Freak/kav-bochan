import json, math, io, sys, urllib.request
from PIL import Image, ImageDraw, ImageFont
def dec(s, p=1e5):
    i=lat=lng=0; out=[]
    while i<len(s):
        for k in (0,1):
            sh=r=0
            while True:
                b=ord(s[i])-63; i+=1; r|=(b&31)<<sh; sh+=5
                if b<32: break
            v=~(r>>1) if r&1 else r>>1
            if k==0: lat+=v
            else: lng+=v
        out.append((lat/p,lng/p))
    return out
d=json.load(open(sys.argv[1])); old=dec(d['old']); new=dec(d['new'])
print(len(old),len(new),old[0],new[-1])
if len(sys.argv)<3: sys.exit()
Z=17; T=256
def px(la,lo): 
    n=2**Z; x=(lo+180)/360*n; y=(1-math.log(math.tan(math.radians(la))+1/math.cos(math.radians(la)))/math.pi)/2*n; return x*T,y*T
pts=[px(*p) for p in old+new]; xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
# focus: last 600 px of new route end region
x0,x1,y0,y1=min(xs)-80,max(xs)+80,min(ys)-80,max(ys)+80
tx0,tx1,ty0,ty1=int(x0//T),int(x1//T),int(y0//T),int(y1//T)
W,H=(tx1-tx0+1)*T,(ty1-ty0+1)*T; im=Image.new('RGB',(W,H),'white')
for tx in range(tx0,tx1+1):
    for ty in range(ty0,ty1+1):
        u=f'https://tile.openstreetmap.org/{Z}/{tx}/{ty}.png'
        req=urllib.request.Request(u,headers={'User-Agent':'kav-bochan/1.0 (+https://github.com/Transit-Freak/kav-bochan)'})
        im.paste(Image.open(io.BytesIO(urllib.request.urlopen(req,timeout=30).read())).convert('RGB'),((tx-tx0)*T,(ty-ty0)*T))
dr=ImageDraw.Draw(im)
L=lambda pl:[(px(*p)[0]-tx0*T,px(*p)[1]-ty0*T) for p in pl]
dr.line(L(old),fill=(200,40,30),width=9); dr.line(L(new),fill=(20,150,70),width=4)
for la,lo,nm in d['stops']:
    x,y=px(la,lo); x-=tx0*T; y-=ty0*T; dr.ellipse((x-6,y-6,x+6,y+6),fill='white',outline='black',width=2)
im=im.crop((int(x0-tx0*T),int(y0-ty0*T),int(x1-tx0*T),int(y1-ty0*T)))
im.save(sys.argv[2]); print('saved',im.size)
