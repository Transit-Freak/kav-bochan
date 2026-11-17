/* סרטון קידום ל"מצגת לשינוי בקו" — הקלטה בדפדפן (Playwright + CDP screencast) והרכבה ב-ffmpeg.
   סביבה: BASE (כתובת הכלי), CHANGE (מזהה השינוי לחימום המטמון), LINE (מספר הקו), OUT (תיקיית פלט), CHROME (דפדפן מקומי, אופציונלי) */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.BASE || 'https://kavbochan.app/line-changes/';
const CHANGE = process.env.CHANGE || '22029-20261117';
const LINE = process.env.LINE || '29';
const QUERY = process.env.QUERY || 'אשדוד';
const OUT = path.resolve(process.env.OUT || path.join(__dirname, 'out'));
const W = 540, H = 960, FPS = 30;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), ...a);

fs.mkdirSync(OUT, { recursive: true });

/* הקלטה: פריימים מה-screencast עם חותמת זמן, ואחר כך ffmpeg עם משך לכל פריים (קצב קבוע 30) */
async function recorder(page, name) {
  const dir = path.join(OUT, 'frames-' + name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let size = null, stopped = false;
  cdp.on('Page.screencastFrame', ev => {
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    if (stopped) return;
    const f = path.join(dir, String(frames.length).padStart(6, '0') + '.jpg');
    const buf = Buffer.from(ev.data, 'base64');
    fs.writeFileSync(f, buf);
    if (!size) size = ev.metadata.deviceWidth + 'x' + ev.metadata.deviceHeight + ' (jpeg ' + buf.length + ' bytes)';
    frames.push({ f, t: Date.now() / 1000 });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
  // מחכים לפריים הראשון
  for (let i = 0; i < 100 && !frames.length; i++) await sleep(20);
  const start = frames.length ? frames[0].t : Date.now() / 1000;
  return {
    start,
    now: () => Date.now() / 1000 - start,
    async stop(exact) {
      // מוודאים שיש פריים אחרון עדכני (דף סטטי לא שולח פריימים)
      const end = exact ? start + exact : Date.now() / 1000;
      while (Date.now() / 1000 < end) await sleep(10);
      stopped = true;
      await cdp.send('Page.stopScreencast').catch(() => {});
      const list = [];
      const fr = frames.filter(x => x.t < end);
      fr.forEach((x, i) => {
        const nx = i + 1 < fr.length ? fr[i + 1].t : end;
        list.push("file '" + x.f + "'", 'duration ' + Math.max(0.001, nx - x.t).toFixed(4));
      });
      list.push("file '" + fr[fr.length - 1].f + "'");
      const lf = path.join(dir, 'list.txt');
      fs.writeFileSync(lf, list.join('\n') + '\n');
      const mp4 = path.join(OUT, name + '.mp4');
      const dur = (end - start).toFixed(3);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lf,
        '-vf', `scale=${W * 2}:${H * 2}:flags=lanczos,fps=${FPS},format=yuv420p`, '-t', dur,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', String(FPS), '-an', mp4]);
      log(name, 'frames', fr.length, 'size', size, 'dur', dur);
      return mp4;
    }
  };
}

/* כלים בתוך הדף: כתובית, נגיעה, הודעה, גלילה רכה, זום של "מצלמה" */
const HELPERS = () => {
  if (window.__v) return;
  const st = document.createElement('style');
  st.textContent = `
  #kb-a11y-btn,#kb-ver,.kb-home{display:none!important}
  #vcap{position:fixed;right:22px;left:22px;bottom:150px;z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:14px;direction:rtl;
    background:rgba(19,32,27,.95);color:#fff;border-radius:24px;padding:20px 24px 22px;font:800 33px/1.28 Heebo,Assistant,sans-serif;text-align:center;
    box-shadow:0 10px 30px rgba(0,0,0,.25);border-bottom:6px solid #1f9152;opacity:0;transform:translateY(16px);transition:opacity .35s,transform .35s;pointer-events:none}
  #vcap.on{opacity:1;transform:none}
  #vcap.light{background:#fff;color:#13201b}
  #vcap .n{flex:none;width:52px;height:52px;border-radius:50%;background:#1f9152;color:#fff;display:flex;align-items:center;justify-content:center;font:900 30px Heebo,sans-serif}
  #vcap .n:empty{display:none}
  .vtap{position:fixed;z-index:2147483001;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(31,145,82,.35);border:3px solid #1f9152;pointer-events:none;transition:transform .18s,opacity .18s}
  .vtap.down{transform:scale(.7)}
  .vtap.go{animation:vring .55s ease-out forwards}
  @keyframes vring{to{transform:scale(2.1);opacity:0}}
  #vtoast{position:fixed;top:120px;left:50%;z-index:2147483001;transform:translate(-50%,-20px);opacity:0;transition:.35s;direction:rtl;
    background:#1f9152;color:#fff;font:800 28px Heebo,sans-serif;border-radius:999px;padding:12px 30px 14px;box-shadow:0 10px 30px rgba(0,0,0,.25);pointer-events:none}
  #vtoast.on{opacity:1;transform:translate(-50%,0)}
  body.vcam{transition:transform .85s cubic-bezier(.45,0,.2,1)}
  #vfinal{position:fixed;inset:0;z-index:2147482000;background:#13201b;opacity:0;transition:opacity .5s;overflow:hidden}
  #vfinal.on{opacity:1}
  #vfinal .deck{position:absolute;top:0;left:0;right:auto;width:1280px;height:720px;display:block;margin:0;padding:0;transform-origin:0 0;transition:transform 2.6s cubic-bezier(.45,0,.25,1)}
  #vfinal .sframe{width:1280px!important;height:720px!important;aspect-ratio:auto;border-radius:0;box-shadow:0 30px 80px rgba(0,0,0,.5);margin:0}
  #vfinal .slide{transform:none!important}
  `;
  document.head.appendChild(st);
  const root = document.documentElement;
  const cap = document.createElement('div'); cap.id = 'vcap'; cap.innerHTML = '<span class="n"></span><span class="t"></span>'; root.appendChild(cap);
  const toast = document.createElement('div'); toast.id = 'vtoast'; root.appendChild(toast);
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  window.__v = {
    async cap(t, n, light) {
      if (cap.classList.contains('on')) { cap.classList.remove('on'); await new Promise(r => setTimeout(r, 300)); }
      if (!t) return;
      cap.querySelector('.n').textContent = n || ''; cap.querySelector('.t').textContent = t;
      cap.classList.toggle('light', !!light); cap.classList.add('on');
    },
    tapAt(x, y, phase) {
      if (phase === 'down') {
        const d = document.createElement('div'); d.className = 'vtap'; d.style.left = x + 'px'; d.style.top = y + 'px';
        root.appendChild(d); window.__tap = d; requestAnimationFrame(() => d.classList.add('down'));
      } else { const d = window.__tap; if (d) { d.classList.remove('down'); d.classList.add('go'); setTimeout(() => d.remove(), 700); } }
    },
    toast(t) { toast.textContent = t; toast.classList.add('on'); },
    scrollTo(y, ms) {
      const y0 = scrollY, dy = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight)) - y0, t0 = performance.now();
      return new Promise(res => { (function f(now) { const k = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + dy * ease(k)); k < 1 ? requestAnimationFrame(f) : res(); })(t0); });
    },
    // גלילה כך שהאלמנט יהיה בגובה y בחלון
    scrollEl(sel, y, ms, i) { const el = document.querySelectorAll(sel)[i || 0]; const r = el.getBoundingClientRect(); return this.scrollTo(scrollY + r.top - y, ms); },
    zoom(sel, s, y) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel, r = el.getBoundingClientRect(), b = document.body.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      document.body.classList.add('vcam');
      document.body.style.transformOrigin = (cx - b.left) + 'px ' + (cy - b.top) + 'px';
      document.body.style.transform = `translate(${270 - cx}px,${y - cy}px) scale(${s})`;
    },
    unzoom() { document.body.style.transform = ''; },
    tilesReady() {
      const t = [...document.querySelectorAll('#deck .leaflet-tile')];
      return t.length > 0 && t.every(i => i.complete && i.naturalWidth > 0);
    },
    final(idx) {
      const deck = document.getElementById('deck'), fr = deck.querySelectorAll('.sframe')[idx];
      const ov = document.createElement('div'); ov.id = 'vfinal';
      const d = document.createElement('div'); d.className = 'deck'; d.setAttribute('data-look', deck.getAttribute('data-look') || 'kav');
      d.style.cssText = deck.style.cssText;
      const c = fr.cloneNode(true); c.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
      d.appendChild(c); ov.appendChild(d); root.appendChild(ov);
      // שקף ברוחב המסך, ואחר כך התקרבות איטית למפה (המפה: 760 הפיקסלים השמאליים של השקף)
      const k = 520 / 1280;
      d.style.transition = 'none';
      d.style.transform = `translate(10px,170px) scale(${k})`;
      toast.classList.remove('on');
      requestAnimationFrame(() => { ov.classList.add('on'); });
      return { k };
    },
    finalZoom(k2, tx, ty) { const d = document.querySelector('#vfinal .deck'); d.style.transition = ''; d.style.transform = `translate(${tx}px,${ty}px) scale(${k2})`; }
  };
};

async function tap(page, sel, opts = {}) {
  const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
  const b = await el.boundingBox();
  if (!b) throw new Error('no box for ' + sel);
  const x = b.x + (opts.fx != null ? b.width * opts.fx : b.width / 2), y = b.y + (opts.fy != null ? b.height * opts.fy : b.height / 2);
  await page.mouse.move(x, y);
  await page.evaluate(([x, y]) => __v.tapAt(x, y, 'down'), [x, y]);
  await sleep(220);
  await page.mouse.click(x, y);
  await page.evaluate(() => __v.tapAt(0, 0, 'up'));
}

async function waitTiles(page, ms = 20000) {
  if (process.env.NOTILES) return false;
  const end = Date.now() + ms;
  await page.evaluate(() => window.LCApp && LCApp.ready()).catch(() => {});
  while (Date.now() < end) {
    if (await page.evaluate(() => __v.tilesReady()).catch(() => false)) return true;
    await sleep(150);
  }
  log('tiles: timeout');
  return false;
}

(async () => {
  const lo = { args: ['--force-device-scale-factor=2'] };   // בלי זה ה-screencast יוצא ב-540×960
  if (process.env.CHROME) lo.executablePath = process.env.CHROME;
  const browser = await chromium.launch(lo);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'he-IL', isMobile: false, hasTouch: false });
  const cardsUrl = 'file://' + path.join(__dirname, 'cards.html');

  /* ---- חימום: טוענים את המצגת פעם אחת, כדי שהמפות והגופנים יהיו במטמון ---- */
  {
    const p = await ctx.newPage();
    await p.goto(BASE + '?c=' + CHANGE, { waitUntil: 'load' });
    await p.evaluate(HELPERS);
    await p.waitForSelector('#deck .sframe', { timeout: 30000 });
    // כל המפות בתצוגה: גוללים עד הסוף כדי שכל האריחים ייטענו
    await p.evaluate(() => __v.scrollTo(document.documentElement.scrollHeight, 400));
    log('warm tiles', await waitTiles(p));
    await p.screenshot({ path: path.join(OUT, 'warm.png'), fullPage: true });
    await p.close();
  }
  /* הגופנים של הכרטיסים */
  {
    const p = await ctx.newPage();
    await p.goto(cardsUrl + '?scene=end'); await p.evaluate(() => document.fonts.ready); await p.close();
  }

  const clips = [];

  /* ---- 1. פתיחה: 0–12 ---- */
  {
    const p = await ctx.newPage();
    await p.goto(cardsUrl + '?scene=intro');
    await p.evaluate(() => document.fonts.ready); await sleep(600);
    const r = await recorder(p, 'a-intro');
    await p.evaluate(() => run());
    clips.push(await r.stop(12.0));
    await p.close();
  }

  /* ---- 2. באתר עצמו ---- */
  let finalMarks = {};
  {
    const p = await ctx.newPage();
    p.on('pageerror', e => log('pageerror', e.message));
    await p.goto(BASE, { waitUntil: 'load' });
    await p.evaluate(HELPERS);
    await p.waitForSelector('#results .res', { timeout: 30000 });
    await p.evaluate(() => document.fonts.ready);
    // הדפסה: בלי חלון — רק הודעה קטנה
    await p.evaluate(() => { window.print = () => setTimeout(() => __v.toast('PDF מוכן ✓'), 150); });
    await sleep(800);
    const r = await recorder(p, 'b-site');
    const mark = (k) => { finalMarks[k] = +(12 + r.now()).toFixed(2); log('mark', k, finalMarks[k]); };

    // שלב 1: חיפוש ובחירת קו
    mark('step1');
    await p.evaluate(() => __v.cap('בוחרים קו, או מחפשים עיר, רחוב או שכונה', '1'));
    await sleep(900);
    await tap(p, '#q');
    await sleep(250);
    await p.keyboard.type(QUERY, { delay: 165 });
    await sleep(900);
    await p.evaluate(() => __v.scrollEl('#reshead', 150, 900));
    await sleep(700);
    const row = p.locator('#results .res', { has: p.locator('.badge', { hasText: new RegExp('^' + LINE + '$') }) }).first();
    await tap(p, row);
    await sleep(1300);
    await tap(p, '#cards .ccard');
    // שלב 3: המצגת
    await sleep(500);
    mark('step2');
    await p.evaluate(() => __v.cap('המצגת מוכנה: מפה, תחנות שמבוטלות ותחנה קרובה ברגל', '2'));
    await p.waitForSelector('#deck .sframe');
    await sleep(700);
    await p.evaluate(() => __v.scrollEl('#deck .sframe', 120, 1300, 0));
    await waitTiles(p, 8000);
    await sleep(900);
    await p.evaluate(() => __v.scrollEl('#deck .sframe', 120, 1100, 1));
    await waitTiles(p, 8000);
    await sleep(1900);
    await p.evaluate(() => __v.scrollEl('#deck .sframe', 120, 1000, 2));
    await sleep(1500);

    // עריכה ועיצוב
    mark('step3');
    await p.evaluate(() => __v.cap('אפשר לשנות כל מילה ולבחור עיצוב', '3'));
    await tap(p, '#editbtn2');           // הכפתור גם גולל אל המצגת
    await sleep(900);
    await p.evaluate(() => __v.zoom('#deck .sframe h1', 2.1, 330));
    await sleep(950);
    const h1 = p.locator('#deck .sframe').first().locator('h1').first();
    await tap(p, h1, { fx: 0.5 });
    await p.keyboard.press('End');
    await sleep(200);
    await p.keyboard.type(' מהיום', { delay: 165 });
    await sleep(600);
    await p.evaluate(() => { document.activeElement && document.activeElement.blur(); __v.unzoom(); });
    await sleep(950);
    await p.evaluate(() => __v.scrollEl('#looks', 330, 750));
    await sleep(250);
    await tap(p, '#looks [data-look="light"]');
    await sleep(500);
    await p.evaluate(() => __v.scrollEl('#deck .sframe', 120, 850, 0));
    await sleep(1000);

    // PDF
    mark('step4');
    await p.evaluate(() => __v.cap('מורידים PDF, מדפיסים או שולחים', '4'));
    await sleep(700);
    await tap(p, '#dl2');
    await p.waitForSelector('#vtoast.on', { timeout: 20000 });
    await sleep(1500);

    // שקף מוכן על כל המסך
    mark('final');
    await waitTiles(p, 5000);
    await p.evaluate(() => __v.cap(''));
    const fm = await p.evaluate(() => __v.final(1));
    await sleep(450);
    await p.evaluate(() => __v.cap('kavbochan.app · לא פרסום רשמי, בדקו תמיד מול חברת האוטובוסים', '', true));
    await sleep(600);
    // התקרבות למפה (בצד שמאל של השקף)
    await p.evaluate(() => __v.finalZoom(0.715, -2, 120));
    await sleep(2700);
    clips.push(await r.stop());
    await p.screenshot({ path: path.join(OUT, 'site-end.png') });
    await p.close();
  }

  /* ---- 3. כרטיס סיום ---- */
  {
    const p = await ctx.newPage();
    await p.goto(cardsUrl + '?scene=end');
    await p.evaluate(() => document.fonts.ready); await sleep(500);
    const r = await recorder(p, 'c-end');
    await p.evaluate(() => run());
    clips.push(await r.stop(2.8));
    await p.close();
  }
  await browser.close();

  /* ---- חיבור ---- */
  const lf = path.join(OUT, 'clips.txt');
  fs.writeFileSync(lf, clips.map(c => "file '" + c + "'").join('\n') + '\n');
  const final = path.join(OUT, 'promo_silent.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lf,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', '-an', final]);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=width,height,r_frame_rate,nb_frames', '-of', 'default=nw=1', final]).toString();
  log('final', probe.replace(/\n/g, ' '));
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(finalMarks, null, 1));
  log('done');
})().catch(e => { console.error(e); process.exit(1); });
