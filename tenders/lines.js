'use strict';
/* הקווים במכרז — מה כתוב בנספחים ובמסמכים, ומה רץ היום. בלי מודל שפה (שלמה 16.09).

   מקורות (כולם בקוד):
   - route-data/*.json  — טבלאות הקווים והתחנות מנספחי האקסל של המכרז (מק"ט, קו, כיוון, חלופה, תחנות).
   - today.json         — לכל מק"ט: האם רץ היום בלוח הזמנים הרשמי, אצל מי ובאיזה מספר (compare_today.py).
   - line-changes.json  — ציטוטים מילה במילה מהמסמכים על שינויים בקווים (line_changes.py). */
let todayData = { tenders: {} }, lineChanges = { tenders: {} };
const linesReady = Promise.all([
  fetch('today.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(r => { if (r) todayData = r; }).catch(() => {}),
  fetch('line-changes.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(r => { if (r) lineChanges = r; }).catch(() => {}),
]).then(() => renderFeed());

const TAG_COLORS = { 'קו חדש': '#166534', 'ביטול': '#991b1b', 'שינוי מסלול': '#92400e', 'שינוי תדירות': '#1d4ed8', 'הארכה': '#0f766e', 'קיצור': '#7c2d12', 'שינוי מספר': '#6d28d9', 'איחוד': '#334155', 'פיצול': '#334155', 'חלופה': '#475569', 'ללא שינוי': '#64748b' };
const normNum = n => String(n || '').replace(/\s+/g, '').replace(/^0+(?=\d)/, '');
const tagChip = t => `<span class="linetag" style="background:${TAG_COLORS[t] || '#475569'}">${esc(t)}</span>`;
const fdDate = s => s ? s.split('-').reverse().join('.') : '';

/* ציטוטים על קו: לפי המק"ט כשהמסמך מציין אותו (חד-משמעי), אחרת לפי מספר הקו */
function quotesFor(id, number, catalog) {
  const items = lineChanges.tenders?.[id] || [];
  const n = normNum(number), mk = catalog ? String(catalog) : null;
  return items.filter(q => (mk && (q.makats || []).includes(mk)) || ((q.makats || []).length === 0 && q.numbers.some(x => normNum(x) === n)));
}
const linesShowAll = {};   // מכרז → להראות גם קווים שהמכרז לא מזכיר
function mentionedCount(id) {
  const items = lineChanges.tenders?.[id] || [];
  return new Set(items.flatMap(q => (q.makats || []).length ? q.makats : q.numbers.map(normNum))).size;
}
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-lines-all]'); if (!b) return;
  const id = b.dataset.linesAll; linesShowAll[id] = b.dataset.mode === 'all';
  const d = document.querySelector(`details.lines-section[data-lines-tender="${id}"]`);
  if (d) { d.dataset.filled = ''; fillLines(d); }
});
function hasChangeSection(id) {
  return (lineChanges.sections?.[id] || []).length > 0 || (lineChanges.tenders?.[id] || []).length > 0;
}
const ROUTE_TAGS = new Set(['שינוי מסלול', 'קו חדש', 'הארכה', 'קיצור', 'חלופה', 'איחוד', 'פיצול']);
/* הערות הסעיף ("המכרז לא כולל קווים חדשים.") — לפי סעיף, בלי כפילויות */
function sectionNotes(id) {
  const notes = lineChanges.sections?.[id] || [], seen = new Set(), out = [];
  for (const n of notes) { const k = n.section + '|' + n.quote; if (seen.has(k)) continue; seen.add(k); out.push(n); }
  return out;
}

/* טבלת הקווים: איחוד שורות הנספח לפי מק"ט, גרסת המסמך העדכנית קודמת */
function linesOf(versions) {
  const byMk = new Map();
  const ordered = versions.slice().sort((a, b) => (b.sourceStatus === 'current_download') - (a.sourceStatus === 'current_download'));
  for (const v of ordered) for (const r of v.routes) {
    const mk = String(r.key[0]).trim();
    let e = byMk.get(mk);
    if (!e) { e = { mk, number: String(r.key[1]), area: r.area, rows: [], version: v }; byMk.set(mk, e); }
    if (e.version !== v) continue;   // גרסה אחרת של אותו מק"ט — לא מערבבים
    e.rows.push(r);
  }
  return [...byMk.values()].sort((a, b) => { const x = parseInt(a.number) || 9999, y = parseInt(b.number) || 9999; return x - y || a.number.localeCompare(b.number, 'he'); });
}

function renderLinesSection(t) {
  const meta = routeIndex[t.id], td = todayData.tenders?.[t.id];
  const quotes = lineChanges.tenders?.[t.id] || [];
  if (!meta && !quotes.length) return '';
  const c = td?.counts;
  const parts = [];
  if (meta) parts.push(hasChangeSection(t.id) && mentionedCount(t.id) ? `המכרז מזכיר ${mentionedCount(t.id)} קווים מתוך ${c ? c.inTender : meta.uniqueRoutes} בנספח` : `${c ? c.inTender : meta.uniqueRoutes} קווים בנספח`);
  if (c) { parts.push(`${c.runningToday} רצים היום`); if (c.notRunning) parts.push(`${c.notRunning} לא רצים היום`); }
  if (quotes.length) parts.push(`${quotes.length} ציטוטים על שינויים`);
  return `<details class="fielddetails lines-section" data-keep-open="lines:${esc(t.id)}" data-lines-tender="${esc(t.id)}"><summary>הקווים במכרז · ${parts.join(' · ')}</summary><div class="lines-body"><p class="muted">טוען את טבלת הקווים…</p></div></details>`;
}

async function fillLines(details) {
  const id = details.dataset.linesTender, body = details.querySelector('.lines-body');
  if (details.dataset.filled) return;
  details.dataset.filled = '1';
  await linesReady;
  if (!details.isConnected) return;   // הרשימה נבנתה מחדש בזמן הטעינה — האלמנט הזה כבר לא בדף
  const meta = routeIndex[id], td = todayData.tenders?.[id], quotes = lineChanges.tenders?.[id] || [];
  let versions = [];
  if (meta) {
    try {
      if (!routeFiles[id]) routeFiles[id] = (await Promise.all((meta.files || [meta.file]).map(async f => { const r = await fetch(f, { cache: 'no-cache' }); if (!r.ok) throw new Error(f); return r.json(); }))).flat();
      versions = routeFiles[id];
    } catch { body.innerHTML = '<p>טעינת טבלת הקווים נכשלה. אפשר לרענן ולנסות שוב.</p>'; details.dataset.filled = ''; return; }
  }
  const allLines = linesOf(versions);
  const used = new Set();
  // "בטוחים": במסמך יש סעיף שינויים לקווים (נמצאו בו פסקאות או ציטוטים) — אז קו שלא מוזכר בו ממשיך כמו היום
  const sure = hasChangeSection(id);
  // ברירת המחדל: רק קווים שהמכרז מזכיר (שלמה 16.09: "אם לא מזכיר — לא אמור להופיע"); כפתור אחד מראה גם את השאר
  const mentioned = allLines.filter(l => quotesFor(id, l.number, l.mk).length);
  const showAll = !sure || linesShowAll[id] || !mentioned.length;
  const lines = showAll ? allLines : mentioned;
  const rows = lines.map((l, i) => {
    const today = td?.lines?.[l.mk];
    const qs = quotesFor(id, l.number, l.mk); qs.forEach(q => used.add(q));
    const tags = [...new Set(qs.flatMap(q => q.tags))];
    const first = l.rows[0];
    const todayCell = today == null ? '<span class="muted">לא נבדק</span>' : today.today
      ? `<span class="today on">רץ</span> ${esc(today.operator || '')}${today.number && normNum(today.number) !== normNum(l.number) ? ` · מס׳ ${esc(today.number)}` : ''}`
      : '<span class="today off">לא רץ היום</span>';
    return `<tr class="lineRow" data-line-tender="${esc(id)}" data-line-index="${allLines.indexOf(l)}" tabindex="0"><td><b>${esc(l.number)}</b></td><td class="muted">${esc(l.mk)}</td><td>${esc(l.area || '')}${first ? `<br><small>${esc(first.origin)} ← ${esc(first.destination)}</small>` : ''}</td><td>${l.rows.length}</td><td>${todayCell}</td><td>${tags.map(tagChip).join(' ') || (qs.length ? '' : sure ? '<span class="muted" title="הקו לא מוזכר בסעיף השינויים של המסמך">ממשיך כמו היום</span>' : '<span class="muted">לא נבדק</span>')}${qs.length ? ` <small class="muted">${qs.length} ציטוט${qs.length > 1 ? 'ים' : ''}</small>` : ''}</td></tr>`;
  }).join('');
  const orphan = quotes.filter(q => !used.has(q));
  const notIn = td?.clusterExact && td.notInTender?.length ? `<details class="fielddetails"><summary>קווים שרצים היום באשכול ״${esc(td.clusterName)}״ ואינם בטבלת המכרז · ${td.notInTender.length}</summary><p class="muted">לפי קובץ ״אשכול לקו״ של משרד התחבורה ולוח הזמנים של ${fdDate(todayData.gtfsDate)}. זה לא אומר בהכרח שהקווים יבוטלו: ייתכן שהם בנספח אחר או במספר אחר.</p><ul>${td.notInTender.map(([mk, num, name, op]) => `<li><b>${esc(num)}</b> · ${esc(name)} · ${esc(op)} <small class="muted">מק״ט ${esc(mk)}</small></li>`).join('')}</ul></details>` : '';
  const notes = sectionNotes(id);
  const notesHtml = notes.length ? `<details class="fielddetails" open><summary>מה כתוב במכרז על השינויים בקווים · ${notes.length === 1 ? 'פסקה אחת' : `${notes.length} פסקאות`}</summary>${notes.slice(0, 12).map(n => `<blockquote class="linequote"><span class="linetag" style="background:#334155">${esc(n.section)}</span>${quoteBody(n)}<small><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.doc || 'המסמך')} · עמוד PDF ${n.page} ↗</a></small></blockquote>`).join('')}</details>` : '';
  body.innerHTML = `${notesHtml}${td ? `<p class="muted">״רץ היום״ — לפי לוח הזמנים הרשמי של ${fdDate(todayData.gtfsDate)}, לפי מספר הקטלוג (מק״ט) של הקו, שזהה במכרז ובלוח הזמנים. קו שלא רץ היום הוא בדרך כלל קו חדש או מספר חדש שהמכרז קובע.</p>` : ''}
    ${lines.length ? `<div class="tblwrap"><table class="linesTable"><thead><tr><th>קו</th><th>מק״ט</th><th>יישוב · מוצא ← יעד</th><th>כיוונים וחלופות</th><th>היום</th><th>מה כתוב במכרז</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted">לחיצה על קו: מה כתוב עליו במסמך ומה רץ היום.${sure && mentioned.length && allLines.length > mentioned.length ? (showAll ? ` <button class="linkbtn" data-lines-all="${esc(id)}" data-mode="mentioned">להראות רק את ${mentioned.length} הקווים שהמכרז מזכיר</button>` : ` מוצגים ${mentioned.length} הקווים שהמכרז מזכיר. <button class="linkbtn" data-lines-all="${esc(id)}" data-mode="all">להראות גם את ${allLines.length - mentioned.length} הקווים שממשיכים כמו היום</button>`) : ''}</p>` : `<p class="muted">${orphan.length ? 'למכרז הזה אין קובץ אקסל של הקווים. מה שכתוב למטה נלקח מתוך הטקסט של המכרז עצמו.' : 'למכרז הזה לא נמצאה טבלת קווים בנספחי האקסל.'}</p>`}
    ${orphan.length ? `<details class="fielddetails"${lines.length ? '' : ' open'}><summary>${lines.length ? 'ציטוטים על קווים שאינם בטבלת הנספח' : 'מה המכרז אומר על כל קו'} · ${orphan.length}</summary>${orphan.map(renderQuote).join('')}</details>` : ''}
    ${notIn}
    ${lines.length || meta ? `<p class="lines-tools">${lines.length ? `<button data-lines-csv="${esc(id)}">הורדת הרשימה (CSV)</button>` : ''}${meta ? ` <button data-annex-tender="${esc(id)}">הנספחים המקוריים לפי קובץ (${meta.versions})</button>` : ''}</p>` : ''}`;
}

/* הורדה כקובץ CSV שנפתח באקסל (עם סימון עברית) */
function downloadCSV(name, header, rows) {
  const cell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const text = '\uFEFF' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-lines-csv]'); if (!b) return;
  const id = b.dataset.linesCsv, td = todayData.tenders?.[id], lines = linesOf(routeFiles[id] || []);
  const rows = lines.map(l => {
    const today = td?.lines?.[l.mk], qs = quotesFor(id, l.number, l.mk), first = l.rows[0];
    return [l.number, l.mk, l.area || '', first?.origin || '', first?.destination || '', l.rows.length,
      today == null ? 'לא נבדק' : today.today ? 'רץ' : 'לא רץ היום', today?.operator || '', today?.number || '',
      [...new Set(qs.flatMap(q => q.tags))].join(' | '), qs.map(q => q.quote).join(' | ')];
  });
  downloadCSV(`kavim-mikhraz-${id}.csv`, ['קו', 'מק"ט', 'יישוב', 'מוצא', 'יעד', 'כיוונים וחלופות', 'היום', 'מפעיל היום', 'מספר היום', 'מה כתוב במכרז', 'ציטוטים'], rows);
});

// ציטוט: קודם השורה במילים פשוטות, והציטוט המלא של המשרד מתקפל מתחת כפי שהוא
function quoteBody(q) {
  const b = q.brief && q.brief.replace(/…$/, '') !== q.quote ? q.brief : '';
  // בלי פתיחה וסגירה: השורה הקצרה, ומתחתיה הציטוט המלא של המשרד באות קטנה יותר (שלמה 16.09)
  return b ? `<p class="brief">${esc(b)}</p><p class="fullquote"><span class="muted">הציטוט המלא: </span>${esc(q.quote)}</p>` : `<p>${esc(q.quote)}</p>`;
}
function renderQuote(q) {
  return `<blockquote class="linequote">${q.tags.map(tagChip).join(' ')} <span class="muted">קו${q.numbers.length > 1 ? 'וים' : ''} ${q.numbers.map(esc).join(', ')}</span>${quoteBody(q)}<small><a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.doc || 'המסמך')} · עמוד PDF ${q.page} ↗</a></small></blockquote>`;
}

/* Leaflet נטען רק כשפותחים קו */
let leafletReady = null;
function ensureLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((ok, bad) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = ok; s.onerror = bad; document.head.append(s);
  });
  return leafletReady;
}

const VARIANT_COLORS = ['#126977', '#b45309', '#7c3aed', '#be185d', '#15803d', '#1d4ed8', '#a16207', '#0f766e'];
async function showLine(id, index) {
  const lines = linesOf(routeFiles[id] || []), l = lines[index]; if (!l) return;
  const td = todayData.tenders?.[id], today = td?.lines?.[l.mk], qs = quotesFor(id, l.number, l.mk);
  const v = l.version;
  const routeChange = qs.some(q => (q.tags || []).some(t => ROUTE_TAGS.has(t)));
  const sure = hasChangeSection(id);
  const located = routeChange && l.rows.some(r => r.stops.some(s => Number.isFinite(s[3]) && Number.isFinite(s[4])));
  routeDialog.innerHTML = `<form method="dialog"><button>סגירה ✕</button></form>
    <h2 id="route-title">קו ${esc(l.number)} · ${esc(l.area || '')}</h2>
    <p class="muted">מק״ט ${esc(l.mk)} · לפי נספח המכרז (<a href="${esc(v.url)}" target="_blank" rel="noopener">המסמך ↗</a>)${v.sourceStatus === 'superseded' ? ' · גרסת מסמך קודמת' : ''}</p>
    ${today ? `<p class="todaybox">${today.today ? `<span class="today on">רץ היום</span> אצל <b>${esc(today.operator || '')}</b>${today.number ? ` כקו <b>${esc(today.number)}</b>` : ''}${today.name ? ` · ${esc(today.name)}` : ''} · ${today.directions?.length || 0} כיוונים/חלופות בלוח הזמנים` : '<span class="today off">לא רץ היום</span> · אין קו עם מק״ט זה בלוח הזמנים הרשמי'} <small class="muted">(${fdDate(todayData.gtfsDate)})</small></p>` : ''}
    ${qs.length ? `<h3>מה כתוב במסמכי המכרז על הקו</h3>${qs.map(renderQuote).join('')}` : sure ? `<p class="plainline">המכרז לא מזכיר שינוי בקו ${esc(l.number)}. לפי המסמך הוא ממשיך כמו היום.</p>` : '<p class="muted">במסמכים שנקראו אין סעיף שינויים לקווים, ולכן אי אפשר לומר מהמסמך אם הקו משתנה.</p>'}
    ${typeof mapsFor === 'function' && mapsFor(id, l.number).length ? `<h3>מפה מהמסמך</h3><div class="tmaps">${mapsFor(id, l.number).map(renderMap).join('')}</div>` : ''}
    ${located ? `<h3>התחנות לפי נספח המכרז</h3>
    <div id="line-map" style="height:340px;border-radius:12px;background:#eef5f6"></div>
    <p class="muted">על המפה מסומנות רק התחנות שרשומות בנספח, לפי הסדר. במסמכי המכרז אין שרטוט של הדרך בין התחנות, ולכן היא לא מצוירת.</p>` : routeChange ? '<h3>התחנות לפי נספח המכרז</h3><p class="muted">בנספח אין רשימת תחנות עם מיקומים לקו הזה, ולכן אין מפה. מה שכתוב במסמך על המסלול מופיע בציטוטים למעלה.</p>' : '<h3>התחנות לפי נספח המכרז</h3>'}
    ${l.rows.map((r, i) => `<details class="fielddetails" ${i === 0 && routeChange ? 'open' : ''}><summary><span class="vdot" style="background:${VARIANT_COLORS[i % VARIANT_COLORS.length]}"></span> כיוון ${esc(r.key[2])} · חלופה ${esc(r.key[3])} · ${esc(r.origin)} ← ${esc(r.destination)} · ${r.stops.length} תחנות</summary><ol class="stops">${r.stops.map(s => `<li>${esc(s[2])} <small class="muted">מק״ט תחנה ${esc(s[1])}</small></li>`).join('') || '<li class="muted">רשימת התחנות לא מופיעה בנספח הזה.</li>'}</ol><p class="muted">גיליון ${esc(r.sheet)}, שורה ${r.row}</p></details>`).join('')}`;
  if (!routeDialog.open) routeDialog.showModal();
  if (!located) return;
  try {
    await ensureLeaflet();
    const el = document.getElementById('line-map'); if (!el) return;
    const map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
    // רק נקודות התחנות מהנספח, ממוספרות לפי הסדר — בלי קווים מחברים, כדי לא לצייר דרך שהמסמך לא מתאר
    const all = [];
    l.rows.forEach((r, i) => {
      const color = VARIANT_COLORS[i % VARIANT_COLORS.length];
      r.stops.forEach(s => {
        if (!(Number.isFinite(s[3]) && Number.isFinite(s[4]))) return;
        const pt = [s[4], s[3]]; all.push(pt);
        L.marker(pt, { icon: L.divIcon({ className: 'stopnum', html: `<span style="border-color:${color}">${s[0]}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).bindTooltip(`${s[0]}. ${s[2]} · כיוון ${r.key[2]} חלופה ${r.key[3]}`).addTo(map);
      });
    });
    if (all.length) map.fitBounds(all, { padding: [20, 20] });
  } catch { const el = document.getElementById('line-map'); if (el) el.innerHTML = '<p class="muted" style="padding:20px">המפה לא נטענה.</p>'; }
}

document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.lines-section') && d.open) fillLines(d); }, true);

/* קישור ישיר: tenders/#q=4000589849 פותח את החיפוש הזה ואת טבלת הקווים של התוצאה הראשונה;
   החיפוש שמקלידים נשמר בכתובת כדי שאפשר יהיה לשתף אותה */
(function () {
  let autoOpened = false;
  const hashQuery = () => { try { return new URLSearchParams(location.hash.slice(1)).get('q') || ''; } catch { return ''; } };
  const q = hashQuery();
  const initialQ = q;   // פתיחה אוטומטית של טבלת הקווים רק כשמגיעים עם קישור ישיר, לא בכל הקלדה בחיפוש
  if (q) { $('search').value = q; render(); }
  $('search').addEventListener('input', () => { const v = $('search').value.trim(); history.replaceState(null, '', v ? '#q=' + encodeURIComponent(v) : location.pathname + location.search); });
  const original = renderFeed;
  renderFeed = function () {
    // הרינדור בונה את הרשימה מחדש ומאבד את "פתוח/סגור" — שומרים מה היה פתוח (קווים, תנאים) ומחזירים
    const openKeys = [...document.querySelectorAll('details[data-keep-open][open]')].map(d => d.dataset.keepOpen);
    original();
    for (const k of openKeys) { const d = document.querySelector(`details[data-keep-open="${k.replace(/"/g, '')}"]`); if (d) d.open = true; }
    if (autoOpened || !initialQ) return;
    const btn = document.querySelector('button[data-card-tab="lines"]');
    if (btn) { autoOpened = true; const card = btn.closest('details.cardbody'); if (card) card.open = true; btn.click(); }
  };
})();
document.addEventListener('click', e => { const row = e.target.closest('tr.lineRow'); if (row) showLine(row.dataset.lineTender, Number(row.dataset.lineIndex)); });
document.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const row = e.target.closest && e.target.closest('tr.lineRow'); if (row) showLine(row.dataset.lineTender, Number(row.dataset.lineIndex)); });
