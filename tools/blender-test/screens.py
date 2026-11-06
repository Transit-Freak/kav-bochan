"""מסכי מכשיר התיקוף החדש (לפי תמונות): כותרת כחולה עם הקו והיעד, QR לתיקוף בישומון, כמות נוסעים,
כרטיס צהוב "עד 15 ק"מ · 6.0 ₪", "נא להניח את הכרטיס". ומסך אישור ירוק. עברית נכתבת הפוך (PIL בלי bidi)."""
import random, sys
from PIL import Image, ImageDraw, ImageFont
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(s): return ImageFont.truetype(F, s)
from PIL import features
RAQM = features.check_feature('raqm')
def rtl(t):  # עם raqm — PIL מסדר עברית לבד; בלעדיו — היפוך פשוט, מספרים נשארים בכיוונם
    if RAQM: return t
    import re
    parts = re.split(r'(\d+(?:\.\d+)?)', t)
    return ''.join(p if re.fullmatch(r'\d+(?:\.\d+)?', p) else p[::-1] for p in reversed(parts))
W, H = 480, 720          # לאורך (המכשיר החדש על המוט)
LW, LH = 800, 480        # לרוחב (המכשיר האפור עם המסך המוטה)
def idle(path, line='18', dest='תחנה מרכזית', plate='123-45-678', clock='08:15:42', date='06.11.2026'):
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    # כותרת כמו במכשיר: שורה עליונה קטנה — מספר רכב, שעה, תאריך; באמצע — מספר הקו; מתחת — תחנת היעד
    d.rectangle((0, 0, W, 140), fill=(20, 70, 200))
    d.text((18, 12), plate, font=font(18), fill='white', anchor='la')
    d.text((W // 2, 12), clock, font=font(18), fill='white', anchor='ma')
    d.text((W - 18, 12), date, font=font(18), fill='white', anchor='ra')
    d.text((W // 2, 62), rtl(f'קו: {line}'), font=font(38), fill='white', anchor='mm')
    d.text((W // 2, 112), rtl(f'תחנת יעד: {dest}'), font=font(26), fill='white', anchor='mm')
    rnd = random.Random(7); x0, y0, c = 40, 162, 9                       # QR מדומה
    for i in range(21):
        for j in range(21):
            if rnd.random() < 0.5 or (i < 7 and j < 7) or (i < 7 and j > 13) or (i > 13 and j < 7):
                d.rectangle((x0 + j*c, y0 + i*c, x0 + j*c + c - 1, y0 + i*c + c - 1), fill='black')
    d.text((W - 30, 195), rtl('לתיקוף'), font=font(28), fill='black', anchor='ra')
    d.text((W - 30, 235), rtl('בישומון'), font=font(28), fill='black', anchor='ra')
    d.polygon(((250, 255), (290, 235), (290, 275)), fill='black')                     # חץ אל ה-QR
    d.rounded_rectangle((30, 355, W - 30, 610), 16, fill=(25, 35, 70))
    d.rounded_rectangle((70, 368, W - 70, 420), 26, fill='white')
    d.text((W // 2, 380), rtl('כמות נוסעים'), font=font(14), fill='grey', anchor='mm')
    d.text((W // 2, 403), '1', font=font(28), fill='black', anchor='mm')
    d.rounded_rectangle((W - 140, 368, W - 70, 420), 26, fill=(20, 70, 200)); d.text((W - 105, 394), '+', font=font(36), fill='white', anchor='mm')
    d.text((100, 394), '–', font=font(32), fill='grey', anchor='mm')
    d.rounded_rectangle((50, 435, W - 50, 535), 12, fill=(250, 210, 30))              # כרטיס עם חריצים
    for x in (50, W - 50): d.ellipse((x - 14, 471, x + 14, 499), fill=(25, 35, 70))
    d.line((80, 505, W - 80, 505), fill=(200, 160, 20), width=2)
    d.text((W // 2, 462), rtl('צהוב עד 15 ק"מ'), font=font(32), fill='black', anchor='mm')
    d.text((W // 2, 515), '8.0 ₪', font=font(34), fill='black', anchor='mm')
    d.rounded_rectangle((95, 552, W - 95, 595), 22, fill='white', outline=(20, 70, 200), width=4)
    d.text((W // 2, 573), rtl('מרחקים נוספים'), font=font(24), fill=(20, 70, 200), anchor='mm')
    # שורה תחתונה: שפה, נגישות, סמל הנחה + "נא להניח את הכרטיס" + חץ
    d.rounded_rectangle((25, 640, 95, 690), 8, fill=(20, 70, 200))
    d.ellipse((45, 650, 75, 680), outline='white', width=3); d.line((60, 650, 60, 680), fill='white', width=2); d.line((45, 665, 75, 665), fill='white', width=2)
    d.rounded_rectangle((110, 640, 180, 690), 8, fill=(20, 70, 200))
    d.text((145, 665), '♿', font=ImageFont.truetype(F.replace('-Bold', ''), 40), fill='white', anchor='mm')
    d.ellipse((200, 645, 250, 685), outline='grey', width=3)
    for r in (8, 14): d.arc((225 - r, 665 - r, 225 + r, 665 + r), -50, 50, fill='grey', width=3)
    d.rounded_rectangle((245, 650, 285, 680), 5, fill=(230, 190, 60))
    d.text((W - 60, 652), rtl('נא להניח'), font=font(18), fill='black', anchor='ra')
    d.text((W - 60, 676), rtl('את הכרטיס'), font=font(18), fill='black', anchor='ra')
    d.polygon(((W - 50, 650), (W - 30, 650), (W - 30, 668), (W - 22, 668), (W - 40, 690), (W - 58, 668), (W - 50, 668)), fill='black')
    im.save(path)
def ok(path):
    im = Image.new('RGB', (W, H), (30, 160, 70)); d = ImageDraw.Draw(im)
    d.line((140, 330, 215, 410, 350, 250), fill='white', width=28, joint='curve')
    d.text((W // 2, 500), rtl('נסיעה טובה'), font=font(44), fill='white', anchor='mm')
    d.text((W // 2, 570), '8.0 ₪', font=font(36), fill='white', anchor='mm')
    im.save(path)
def fail(path, line1, line2):
    im = Image.new('RGB', (W, H), (200, 35, 35)); d = ImageDraw.Draw(im)
    d.line((150, 230, 330, 410), fill='white', width=30); d.line((330, 230, 150, 410), fill='white', width=30)
    d.text((W // 2, 500), rtl(line1), font=font(40), fill='white', anchor='mm')
    d.text((W // 2, 565), rtl(line2), font=font(30), fill='white', anchor='mm')
    im.save(path)
def idle_land(path, line='18', dest='תחנה מרכזית', plate='123-45-678', clock='08:15:42', date='06.11.2026'):
    """לפי תמונה של המכשיר האפור: כותרת כחולה (קו מימין, רכב/שעה/תאריך באמצע, יעד), ושלוש עמודות:
    מימין — כפתור נגישות ו-QR לתיקוף בישומון; באמצע — כמות נוסעים וכרטיס צהוב-כתום 8.00 ₪; משמאל — שפה, סמל הנחה וחץ."""
    im = Image.new('RGB', (LW, LH), 'white'); d = ImageDraw.Draw(im)
    BL = (25, 55, 200)
    d.rectangle((0, 0, LW, 96), fill=BL)
    d.text((LW // 2, 10), f'{plate}   {clock}   {date}', font=font(16), fill='white', anchor='ma')
    d.text((LW - 20, 30), rtl(f'קו: {line}'), font=font(30), fill='white', anchor='ra')
    d.text((LW // 2 + 40, 62), rtl(f'יעד: {dest}'), font=font(30), fill='white', anchor='mm')
    # עמודה ימנית
    d.rounded_rectangle((LW - 150, 115, LW - 40, 190), 8, fill=BL)
    d.text((LW - 95, 152), '♿', font=ImageFont.truetype(F.replace('-Bold', ''), 58), fill='white', anchor='mm')
    d.text((LW - 95, 215), rtl('לתיקוף בישומון'), font=font(16), fill='black', anchor='mm')
    rnd = random.Random(7); x0, y0, c = LW - 160, 235, 6
    for a in range(21):
        for b in range(21):
            if rnd.random() < 0.5 or (a < 7 and b < 7) or (a < 7 and b > 13) or (a > 13 and b < 7):
                d.rectangle((x0 + b*c, y0 + a*c, x0 + b*c + c - 1, y0 + a*c + c - 1), fill='black')
    # עמודה אמצעית
    d.rounded_rectangle((250, 110, LW - 190, 430), 12, fill=BL)
    d.rounded_rectangle((270, 125, LW - 210, 185), 30, fill='white')
    d.text(((270 + LW - 210) // 2, 140), rtl('כמות נוסעים'), font=font(14), fill='grey', anchor='mm')
    d.text(((270 + LW - 210) // 2, 165), '1', font=font(30), fill='black', anchor='mm')
    d.ellipse((LW - 262, 128, LW - 212, 182), fill=BL, outline='white', width=3); d.text((LW - 237, 155), '+', font=font(34), fill='white', anchor='mm')
    d.text((298, 155), '–', font=font(30), fill=BL, anchor='mm')
    d.rounded_rectangle((268, 205, LW - 208, 380), 14, fill=(250, 180, 20))
    cx = (268 + LW - 208) // 2
    d.text((cx, 240), rtl('צהוב'), font=font(28), fill=(60, 40, 0), anchor='mm')
    d.text((cx, 285), rtl('עד 15 ק"מ'), font=font(28), fill=(60, 40, 0), anchor='mm')
    d.text((cx, 340), '8.00 ₪', font=font(38), fill=(60, 40, 0), anchor='mm')
    # עמודה שמאלית
    d.rounded_rectangle((40, 115, 190, 190), 8, fill=BL)
    d.ellipse((90, 127, 140, 177), outline='white', width=4); d.line((90, 152, 140, 152), fill='white', width=3); d.line((115, 127, 115, 177), fill='white', width=3)
    d.ellipse((50, 225, 120, 275), outline='grey', width=3)
    for r in (10, 18): d.arc((85 - r, 250 - r, 85 + r, 250 + r), -50, 50, fill='grey', width=3)
    d.rounded_rectangle((120, 225, 185, 265), 6, fill=(230, 190, 60))
    d.text((115, 320), rtl('נא להניח'), font=font(24), fill='black', anchor='mm')
    d.text((115, 352), rtl('את הכרטיס'), font=font(24), fill='black', anchor='mm')
    d.polygon(((95, 385), (135, 385), (135, 405), (150, 405), (115, 440), (80, 405), (95, 405)), fill=(90, 90, 140))
    im.save(path)
def pad_land(path):
    """משטח ההנחה של המכשיר האפור: QR ביד, גלי NFC, כרטיס"""
    im = Image.new('RGB', (600, 300), (75, 78, 82)); d = ImageDraw.Draw(im); g = (205, 205, 205)
    d.rounded_rectangle((40, 60, 200, 200), 14, outline=g, width=5)
    rnd = random.Random(3)
    for a in range(8):
        for b in range(8):
            if rnd.random() < 0.5: d.rectangle((70 + b*12, 85 + a*12, 80 + b*12, 95 + a*12), fill=g)
    for r in (30, 52, 74): d.arc((300 - r, 150 - r, 300 + r, 150 + r), -55, 55, fill=g, width=8)
    d.rounded_rectangle((420, 70, 570, 170), 12, outline=g, width=5)
    d.rectangle((440, 90, 470, 115), fill=g)
    d.ellipse((190, 30, 420, 270), outline=g, width=4)
    im.save(path)
def status_land(path, color, sign, line1, line2):
    im = Image.new('RGB', (LW, LH), color); d = ImageDraw.Draw(im)
    if sign == 'ok': d.line((300, 200, 370, 270, 500, 120), fill='white', width=26, joint='curve')
    else: d.line((320, 110, 480, 270), fill='white', width=28); d.line((480, 110, 320, 270), fill='white', width=28)
    d.text((LW // 2, 340), rtl(line1), font=font(42), fill='white', anchor='mm')
    d.text((LW // 2, 405), rtl(line2), font=font(30), fill='white', anchor='mm')
    im.save(path)
def nfc(path):
    im = Image.new('RGB', (380, 200), (12, 12, 14)); d = ImageDraw.Draw(im)
    d.ellipse((40, 30, 340, 170), outline=(200, 200, 200), width=6)
    for k, r in enumerate((22, 40, 58)):
        d.arc((120 - r, 100 - r, 120 + r, 100 + r), -50, 50, fill=(200, 200, 200), width=6)
    d.rounded_rectangle((200, 70, 280, 125), 8, outline=(200, 200, 200), width=6)
    im.save(path)
def lcd(path):
    """מסך המידע הפנימי (לפי צילום): שעה, מפת קו כחולה עם תחנות, 'התחנה הבאה', שמות התחנות הבאות, ושורת פניות"""
    w, h = 1200, 360
    im = Image.new('RGB', (w, h), (232, 240, 248)); d = ImageDraw.Draw(im)
    d.text((30, 20), '8:45', font=font(54), fill=(30, 30, 40), anchor='la')
    d.text((w - 30, 30), rtl('קו 18 · תחנה מרכזית'), font=font(30), fill=(20, 70, 160), anchor='ra')
    d.line((40, 135, w - 40, 135), fill=(20, 60, 130), width=12)
    d.line((40, 135, 330, 135), fill=(80, 170, 230), width=12)
    names = ['ת. מרכזית', 'שדרות צה"ל', 'מרכז מסחרי', 'תחנת הרכבת', 'הנשיא']
    for k, x in enumerate((210, 470, 730, 990)):
        d.ellipse((x - 18, 117, x + 18, 153), fill='white', outline=(20, 60, 130), width=6)
    d.text((210, 185), rtl('התחנה הבאה'), font=font(26), fill=(20, 60, 130), anchor='mm')
    d.text((700, 85), rtl('תחנת הרכבת'), font=font(36), fill=(30, 30, 40), anchor='mm')
    for k, (x, nm) in enumerate(zip((990, 730, 470, 210), names[1:])):
        d.text((x, 235), rtl(nm), font=font(26), fill=(30, 30, 40), anchor='mm')
        d.text((x, 275), f'{3 + k * 3} ' + rtl("ד'"), font=font(22), fill=(80, 80, 90), anchor='mm')
    d.rectangle((0, 315, w, h), fill=(210, 222, 236))
    d.text((w // 2, 338), rtl('פניות ציבור: *3553 · pniot@example.co.il'), font=font(20), fill=(50, 50, 60), anchor='mm')
    im.save(path)
def fabric_tex(path):
    """בד המושבים (לפי צילום): כחול עם ריבועים קטנים בהירים מפוזרים"""
    im = Image.new('RGB', (512, 512), (35, 75, 160)); d = ImageDraw.Draw(im); rnd = random.Random(5)
    for _ in range(9000):
        x, y = rnd.randrange(512), rnd.randrange(512); c = rnd.choice(((30, 65, 145), (45, 90, 175)))
        d.point((x, y), fill=c)
    for _ in range(260):
        x, y = rnd.randrange(0, 500), rnd.randrange(0, 500); sz = rnd.choice((7, 9, 11))
        d.rectangle((x, y, x + sz, y + sz), outline=(150, 180, 230), width=2)
    im.save(path)
def sign_wheel(path):
    """שלט 'מקום זה שמור לאדם בכסא גלגלים' עם סמלי כסא גלגלים ועגלה"""
    im = Image.new('RGB', (420, 420), (240, 242, 244)); d = ImageDraw.Draw(im); BL = (30, 120, 200)
    d.rectangle((60, 10, 360, 150), fill=BL)
    d.text((210, 45), rtl('מקום זה שמור לאדם'), font=font(26), fill='white', anchor='mm')
    d.text((210, 82), rtl('בכסא גלגלים'), font=font(26), fill='white', anchor='mm')
    d.text((210, 120), 'Reserved for a person in a wheelchair', font=font(13), fill='white', anchor='mm')
    for cx, g in ((130, '♿'), (290, '🚼')):
        d.ellipse((cx - 70, 190, cx + 70, 330), fill=BL)
    d.text((290, 260), '♿', font=ImageFont.truetype(F.replace('-Bold', ''), 90), fill='white', anchor='mm')
    d.ellipse((95, 215, 165, 270), outline='white', width=6); d.line((95, 242, 75, 225), fill='white', width=6)
    for cx in (105, 155): d.ellipse((cx - 12, 280, cx + 12, 304), outline='white', width=5)
    im.save(path)
def ceiling_tex(path):
    im = Image.new('RGB', (256, 256), (232, 233, 230)); d = ImageDraw.Draw(im)
    for y in range(0, 256, 16):
        for x in range(8 * ((y // 16) % 2), 256, 16): d.ellipse((x + 6, y + 6, x + 10, y + 10), fill=(150, 150, 148))
    im.save(path)
def qr_sticker(path):
    im = Image.new('RGB', (600, 260), (40, 42, 46)); d = ImageDraw.Draw(im)
    d.polygon(((0, 0), (300, 0), (180, 260), (0, 260)), fill=(70, 140, 210))
    d.rounded_rectangle((200, 30, 400, 230), 10, fill='white'); rnd = random.Random(9)
    for a in range(17):
        for b in range(17):
            if rnd.random() < 0.5 or (a < 5 and b < 5) or (a < 5 and b > 11) or (a > 11 and b < 5):
                d.rectangle((214 + b*10, 44 + a*10, 222 + b*10, 52 + a*10), fill='black')
    d.text((100, 110), rtl('לתיקוף'), font=font(26), fill='white', anchor='mm'); d.text((100, 145), rtl('בישומון'), font=font(26), fill='white', anchor='mm')
    im.save(path)
if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    idle(f'{out}/screen_idle.png'); ok(f'{out}/screen_ok.png')
    fail(f'{out}/screen_err.png', 'תקלה בכרטיס', 'נא לנסות שוב')
    fail(f'{out}/screen_nofunds.png', 'אין מספיק כסף', 'נא לטעון את הכרטיס')
    idle_land(f'{out}/land_idle.png'); pad_land(f'{out}/pad_land.png')
    lcd(f'{out}/lcd.png'); fabric_tex(f'{out}/fabric.png'); sign_wheel(f'{out}/sign_wheel.png'); ceiling_tex(f'{out}/ceiling.png'); qr_sticker(f'{out}/qr_sticker.png')
    status_land(f'{out}/land_ok.png', (30, 160, 70), 'ok', 'נסיעה טובה', '8.00 ₪')
    status_land(f'{out}/land_err.png', (200, 35, 35), 'x', 'תקלה בכרטיס', 'נא לנסות שוב')
    status_land(f'{out}/land_nofunds.png', (200, 35, 35), 'x', 'אין מספיק כסף', 'נא לטעון את הכרטיס')
    nfc(f'{out}/nfc.png'); print('screens ok')
