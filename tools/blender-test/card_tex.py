"""כרטיס נסיעה כללי בסגנון רב-קו (בלי לוגו רשמי): רקע כחול-ירוק, גלים בהירים, "רב-קו" בלבן, סמל של תשלום בקרבה."""
import sys, math
from PIL import Image, ImageDraw, ImageFilter
from screens import font, rtl

def card(path, w=856, h=540):
    im = Image.new('RGB', (w, h)); px = im.load()
    for x in range(w):
        for y in range(h):
            t = (x / w) * 0.75 + (y / h) * 0.25
            px[x, y] = (int(10 + 10 * t), int(70 + 105 * t), int(170 - 55 * t))
    for k in range(5):                                  # גלים בהירים באלכסון (כל גל בשכבה משלו, בלי חפיפות שקופות)
        lay = Image.new('L', (w, h), 0); dl = ImageDraw.Draw(lay)
        pts = [(x, h * 0.62 + k * 34 + 38 * math.sin(x / w * 2 * math.pi + k * 0.5)) for x in range(0, w + 8, 4)]
        dl.line(pts, fill=46 - k * 6, width=14, joint='curve')
        im.paste((255, 255, 255), (0, 0), lay)
    d = ImageDraw.Draw(im, 'RGBA')
    d.rounded_rectangle((70, 200, 175, 280), 14, fill=(225, 190, 90, 255), outline=(150, 120, 50, 255), width=3)   # שבב
    for k in (1, 2, 3):                                 # סמל קרבה (קשתות)
        r = 22 * k
        d.arc((215 - r, 240 - r, 215 + r, 240 + r), -50, 50, fill=(255, 255, 255, 230), width=7)
    d.text((w - 60, 110), rtl('רב-קו'), font=font(118), fill='white', anchor='rm')
    d.text((w - 64, 470), '0000 0000 0000', font=font(34), fill=(255, 255, 255, 200), anchor='rm')
    im.save(path)

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    card(f'{out}/ravkav_card.png'); print('card ok')
