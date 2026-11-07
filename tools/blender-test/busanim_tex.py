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
d.rectangle((0, 0, W, 330), fill=(20, 70, 150))
# סמל אוטובוס
d.rounded_rectangle((150, 60, 450, 230), 30, fill=(255, 255, 255))
d.rectangle((175, 85, 425, 150), fill=(20, 70, 150))
for x in (205, 395): d.ellipse((x - 28, 205, x + 28, 261), fill=(255, 255, 255)); d.ellipse((x - 14, 219, x + 14, 247), fill=(20, 70, 150))
t = RTL('תחנה'); f = font(64); w = d.textlength(t, font=f); d.text(((W - w) / 2, 255), t, font=f, fill=(255, 255, 255))
f2 = font(80)
for i, n in enumerate(('18', '42', '5')):
    x0 = 40 + i * 185; d.rounded_rectangle((x0, 400, x0 + 150, 520), 18, fill=(250, 200, 30))
    w = d.textlength(n, font=f2); d.text((x0 + (150 - w) / 2, 410), n, font=f2, fill=(20, 20, 20))
f3 = font(44)
t = RTL('תחנה מרכזית'); w = d.textlength(t, font=f3); d.text(((W - w) / 2, 590), t, font=f3, fill=(30, 30, 30))
t = '21543'; w = d.textlength(t, font=f3); d.text(((W - w) / 2, 690), t, font=f3, fill=(90, 90, 90))
im.save(f'{out}/stop_sign.png'); print('tex ok')
