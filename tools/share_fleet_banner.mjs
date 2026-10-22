// באנר שיתוף לצי הרכבים (1200×630) — רכב, חברה, דגם, עיר או מעבר, בצבעי החברה (שלמה 22.10).
// קלט: JSON של [{img, b}] (tools/fleet_share.py) · פלט: JPG לכל פריט בשם img
import fs from 'fs';
const [,, listFile, outDir, chromePath] = process.argv;
const _pw = await import(process.env.PW_IMPORT || 'playwright-core');
const chromium = _pw.chromium || _pw.default.chromium;
const items = JSON.parse(fs.readFileSync(listFile, 'utf8'));
const icon = fs.readFileSync('fleet/icon-512.png').toString('base64');
fs.mkdirSync(outDir, { recursive: true });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// כמו opBg ב-fleet/index.html: צבע אחד — רקע מלא; כמה צבעים — פסים משופעים
const bgOf = c => c.length < 2 ? c[0] : (() => { const st = c.length === 2 ? [0, 62] : [0, 56, 78];
  return `linear-gradient(250deg,${c.map((x, k) => `${x} ${st[k]}% ${k + 1 < c.length ? st[k + 1] + '%' : '100%'}`).join(',')})`; })();
// כמו isLight ב-fleet/index.html: רקע בהיר — טקסט כהה
const isLight = h => { const [r, g, b] = [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b > .3; };
const b = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
let n = 0;
for (const it of items) {
  const v = it.b;
  const bg = v.col2 ? `linear-gradient(250deg,${v.col2[0]} 0% 50%,${v.col2[1]} 50% 100%)` : bgOf(v.col);
  const main = v.col2 ? v.col2[0] : v.col[0], lt = isLight(main);
  const fg = lt ? '#1c1917' : '#fff', sub = lt ? 'rgba(28,25,23,.75)' : 'rgba(255,255,255,.85)';
  const fs1 = v.m.length > 22 ? 50 : v.m.length > 18 ? 58 : v.m.length > 12 ? 64 : 84;
  await p.setContent(`<body style="margin:0"><div dir="rtl" style="width:1200px;height:630px;display:flex;align-items:center;gap:60px;padding:0 90px;box-sizing:border-box;background:${bg};color:${fg};font-family:Arial,'DejaVu Sans',sans-serif;overflow:hidden">
    <div style="flex:1;min-width:0">
      ${v.k ? `<div style="font-size:34px;font-weight:700;color:${sub}">${esc(v.k)}</div>`
            : `<div style="display:inline-block;background:#fbbf24;color:#1c1917;border:5px solid #1c1917;border-radius:14px;font-size:62px;font-weight:900;padding:4px 24px;letter-spacing:2px;direction:ltr">${esc(v.p)}</div>`}
      <div style="font-size:${fs1}px;font-weight:900;line-height:1.1;margin-top:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(v.m)}</div>
      <div style="font-size:40px;font-weight:600;color:${sub};margin-top:14px">${esc(v.c)}</div>
    </div>
    <img src="data:image/png;base64,${icon}" style="width:300px;height:300px;border-radius:64px;box-shadow:0 18px 50px rgba(0,0,0,.35);flex-shrink:0">
  </div></body>`);
  await p.screenshot({ path: `${outDir}/${it.img}`, type: 'jpeg', quality: 84 });
  n++;
}
await b.close();
console.log('רונדרו', n, 'באנרים של צי הרכבים');
