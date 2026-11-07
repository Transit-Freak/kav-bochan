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

def phone_screen(path, ok=False, w=430, h=884):
    """מסך טלפון: תשלום רב-קו בקרבה (כחול), או אישור ירוק "נסיעה טובה". מסגרת שחורה דקה ומצלמה קדמית."""
    im = Image.new('RGB', (w, h), (8, 8, 10)); d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = 14, 14, w - 14, h - 14
    if ok:
        d.rounded_rectangle((x0, y0, x1, y1), 44, fill=(30, 160, 70))
        d.line((130, 380, 195, 450, 310, 320), fill='white', width=26, joint='curve')
        d.text((w // 2, 560), rtl('נסיעה טובה'), font=font(46), fill='white', anchor='mm')
        d.text((w // 2, 625), '8.0 ₪', font=font(34), fill='white', anchor='mm')
    else:
        for y in range(y0, y1):
            t = (y - y0) / (y1 - y0); d.line((x0, y, x1, y), fill=(int(15 + 10 * t), int(80 + 60 * t), int(190 - 40 * t)))
        m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((x0, y0, x1, y1), 44, fill=255)
        bg = Image.new('RGB', (w, h), (8, 8, 10)); im = Image.composite(im, bg, m); d = ImageDraw.Draw(im)
        d.text((w // 2, 190), rtl('רב-קו'), font=font(84), fill='white', anchor='mm')
        d.rounded_rectangle((70, 300, w - 70, 470), 22, fill=(255, 255, 255))
        d.text((w // 2, 360), rtl('תשלום בקרבה'), font=font(34), fill=(20, 80, 170), anchor='mm')
        d.text((w // 2, 420), '8.0 ₪', font=font(34), fill=(20, 80, 170), anchor='mm')
        for k in (1, 2, 3):
            r = 34 * k; d.arc((w // 2 - r, 640 - r, w // 2 + r, 640 + r), -60 - 90, 60 - 90, fill='white', width=9)
        d.text((w // 2, 760), rtl('קרבו את הטלפון לקורא'), font=font(28), fill='white', anchor='mm')
    d.ellipse((w // 2 - 9, 30, w // 2 + 9, 48), fill=(25, 25, 30))
    im.save(path)

def screen_ok_full(path):
    """מסך האישור המלא של המכשיר: הכותרת של מסך ההמתנה (מספר הרכב, השעה והתאריך, הקו והיעד) ומתחתיה אישור ירוק."""
    import screens, os
    tmp = path + '.idle.png'; screens.idle(tmp); im = Image.open(tmp).convert('RGB'); os.remove(tmp)
    W_, H_ = im.size; d = ImageDraw.Draw(im)
    d.rectangle((0, 142, W_, H_), fill=(30, 160, 70))
    d.line((150, 300, 215, 370, 335, 230), fill='white', width=26, joint='curve')
    d.text((W_ // 2, 470), rtl('נסיעה טובה'), font=font(52), fill='white', anchor='mm')
    d.rounded_rectangle((110, 530, W_ - 110, 610), 18, fill=(255, 255, 255))
    d.text((W_ // 2, 570), '8.0 ₪', font=font(40), fill=(20, 110, 50), anchor='mm')
    im.save(path)

if __name__ == '__main__':
    screen_ok_full(f"{sys.argv[1] if len(sys.argv) > 1 else '.'}/screen_ok_full.png")
    phone_screen(f"{sys.argv[1] if len(sys.argv) > 1 else '.'}/phone_pay.png"); phone_screen(f"{sys.argv[1] if len(sys.argv) > 1 else '.'}/phone_ok.png", ok=True)
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    card(f'{out}/ravkav_card.png'); print('card ok')
