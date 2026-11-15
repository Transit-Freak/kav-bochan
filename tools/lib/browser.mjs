// קוד עזר משותף לבדיקות הדפדפן (tools/check_*_ui.mjs):
// טעינת playwright-core, שרת סטטי מקומי ופתיחת כרום. כל בדיקה מחליטה בעצמה מה היא בודקת —
// כאן רק מה שהיה מועתק בין הקבצים.
//
// דורש: npm i --no-save playwright-core (או PW_MODULES שמצביע על תיקייה שבה הוא מותקן),
// ודפדפן כרום — CHROMIUM_PATH (ב-CI: which google-chrome), ברירת מחדל /opt/pw-browsers/chromium.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

export const ROOT = process.cwd();

export const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.jsx': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

// playwright-core מהתיקייה של הריפו (או PW_MODULES)
export function loadChromium() {
  const req = createRequire(path.join(process.env.PW_MODULES || ROOT, 'noop.js'));
  return req('playwright-core').chromium;
}

// שרת סטטי על פורט פנוי. resolve(rel) מחזיר נתיב קובץ לכתובת יחסית (בלי / בהתחלה;
// כתובת ריקה או שמסתיימת ב-/ מקבלת index.html). stripSri: מסיר integrity/crossorigin
// מ-index.html, כדי שאפשר יהיה להגיש את ספריות ה-CDN מ-vendor/ בלי רשת.
export async function serveStatic(resolve = (rel) => path.join(ROOT, rel), { stripSri = false, mime = {} } = {}) {
  const types = { ...MIME, ...mime };
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    try {
      const p = resolve(rel);
      let body = fs.readFileSync(p);
      if (stripSri && p.endsWith('index.html')) body = Buffer.from(body.toString().replace(/\s(integrity|crossorigin)="[^"]*"/g, ''));
      res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return { srv, port: srv.address().port };
}

// כרום ללא-ראש. executablePath: ברירת המחדל CHROMIUM_PATH ואז /opt/pw-browsers/chromium
export function launchChromium({ chromium = loadChromium(), executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } = {}) {
  return chromium.launch({ executablePath, args: ['--no-sandbox'] });
}
