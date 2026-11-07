"""טקסטורה לשלט התחנה (בלי סמלי מפעיל): פס כחול עם סמל אוטובוס ו"תחנה", ומספרי קווים."""
import os, sys
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1] if len(sys.argv) > 1 else 'tex'
os.makedirs(out, exist_ok=True)
W, H = 600, 840
# Pillow עם raqm מסדר עברית בעצמו; בלי raqm צריך להפוך
from PIL import features
RTL = (lambda t: t) if features.check('raqm') else (lambda t: t[::-1])
im = Image.new('RGB', (W, H), (245, 245, 242)); d = ImageDraw.Draw(im)
def font(sz):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()
# בסגנון השלט של משרד התחבורה: לוח צהוב עם סמל אוטובוס שחור, ומתחתיו לוח לבן עם מספרי הקווים
Y = (250, 200, 20); K = (20, 20, 20)
d.rectangle((0, 0, W, 360), fill=Y)
d.rounded_rectangle((150, 50, 450, 225), 30, fill=K)
d.rectangle((178, 78, 422, 145), fill=Y)
d.rectangle((178, 160, 230, 190), fill=Y); d.rectangle((370, 160, 422, 190), fill=Y)
for x in (205, 395): d.ellipse((x - 30, 200, x + 30, 260), fill=K); d.ellipse((x - 13, 217, x + 13, 243), fill=Y)
t = RTL('תחנה'); f = font(70); w = d.textlength(t, font=f); d.text(((W - w) / 2, 268), t, font=f, fill=K)
d.rectangle((0, 360, W, 372), fill=K)
f2 = font(80)
for i, n in enumerate(('18', '42', '5')):
    x0 = 40 + i * 185; d.rounded_rectangle((x0, 400, x0 + 150, 520), 18, outline=(20, 20, 20), width=6, fill=(255, 255, 255))
    w = d.textlength(n, font=f2); d.text((x0 + (150 - w) / 2, 410), n, font=f2, fill=(20, 20, 20))
f3 = font(44)
t = RTL('תחנה מרכזית'); w = d.textlength(t, font=f3); d.text(((W - w) / 2, 590), t, font=f3, fill=(30, 30, 30))
t = '21543'; w = d.textlength(t, font=f3); d.text(((W - w) / 2, 690), t, font=f3, fill=(90, 90, 90))
im.save(f'{out}/stop_sign.png'); print('tex ok')
