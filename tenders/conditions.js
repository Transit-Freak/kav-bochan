'use strict';
/* התנאים במכרז — הסעיפים המקוריים לפי נושא, תוכן עניינים, ומפות שהועתקו מהמסמכים.
   בלי מודל שפה: מה שמוצג הוא הטקסט של הסעיף כפי שחולץ מה-PDF (tender_sections.py),
   והמפות הן צילומי עמודים מהמסמך (extract_maps.py). */
let sectionsIndex = { tenders: {} }, sectionFiles = {}, tenderMaps = { tenders: {} };
const conditionsReady = Promise.all([
  fetch('sections-index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(r => { if (r) sectionsIndex = r; }).catch(() => {}),
  fetch('maps.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(r => { if (r) tenderMaps = r; }).catch(() => {}),
]).then(() => renderFeed());

const normLine = n => String(n || '').replace(/\s+/g, '').replace(/^0+(?=\d)/, '');
function mapsFor(id, number) {
  const n = normLine(number);
  return (tenderMaps.tenders?.[id] || []).filter(m => (m.numbers || []).some(x => normLine(x) === n));
}
function renderMap(m) {
  return `<figure class="tmap"><a href="${esc(m.image)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(m.image)}" alt="${esc(m.caption || 'מפה מהמסמך')}"></a><figcaption>${esc(m.caption || 'עמוד מהמסמך')} · <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.doc || 'המסמך')} · עמוד PDF ${m.page} ↗</a></figcaption></figure>`;
}

function renderConditionsSection(t) {
  const meta = sectionsIndex.tenders?.[t.id], maps = tenderMaps.tenders?.[t.id] || [];
  if (!meta && !maps.length) return '';
  const parts = [];
  if (meta) parts.push(`${meta.sections.toLocaleString('he-IL')} סעיפים לפי נושא: שכר, תמורה, ערבויות, קנסות, צי ועוד`);
  if (maps.length) parts.push(`${maps.length} מפות מהמסמך`);
  return `<details class="fielddetails cond-section" data-keep-open="cond:${esc(t.id)}" data-cond-tender="${esc(t.id)}"><summary>מה המכרז דורש, בשפה פשוטה · ${parts.join(' · ')}</summary><div class="cond-body"><p class="muted">טוען את סעיפי המסמך…</p></div></details>`;
}

const condState = {};   // tid → {topic}
async function fillConditions(details) {
  const id = details.dataset.condTender, body = details.querySelector('.cond-body');
  if (details.dataset.filled) return;
  details.dataset.filled = '1';
  await conditionsReady;
  if (!details.isConnected) return;
  const meta = sectionsIndex.tenders?.[id];
  let doc = null;
  if (meta) {
    try {
      if (!sectionFiles[id]) { const r = await fetch(meta.file, { cache: 'no-cache' }); if (!r.ok) throw new Error(meta.file); sectionFiles[id] = await r.json(); }
      doc = sectionFiles[id];
    } catch { body.innerHTML = '<p>טעינת הסעיפים נכשלה. אפשר לרענן ולנסות שוב.</p>'; details.dataset.filled = ''; return; }
  }
  if (!details.isConnected) return;
  renderConditionsBody(id, body, doc);
}

function renderConditionsBody(id, body, doc) {
  const maps = tenderMaps.tenders?.[id] || [];
  const st = condState[id] = condState[id] || { topic: null, toc: false };
  let html = '';
  if (doc) {
    const topics = Object.entries(sectionsIndex.tenders[id].topics || {});
    if (!st.topic && topics.length) st.topic = topics[0][0];
    const q = (st.q || '').trim();
    const hit = s => !q || (s.t + ' ' + s.text).includes(q);
    // חיפוש חופשי עובר על כל המסמך; בלי חיפוש — לפי הנושא שנבחר
    const secs = doc.sections.filter(s => q ? hit(s) : (st.topic === '__all__' ? true : s.topics.includes(st.topic)));
    html += `<p class="muted">כל שורה היא סעיף אחד מהמכרז, במילים פשוטות (הניסוח המשפטי מוחלף במילים יומיומיות לפי רשימת חוקים קבועה, לא מודל שפה). לחיצה על השורה מראה את הציטוט המקורי של משרד התחבורה כפי שהוא, עם קישור לעמוד במסמך (${doc.pages} עמודים, ${doc.sections.length} סעיפים ממוספרים${(doc.docs || []).length > 1 ? `, מ-${doc.docs.length} מסמכים: ${doc.docs.map(d => `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a>`).join(' · ')}` : `: <a href="${esc(doc.doc)}" target="_blank" rel="noopener">המסמך המלא ↗</a>`}). השיוך לנושא לפי כותרת הסעיף.</p>
      <div class="filters cond-topics">${topics.map(([t, n]) => `<button class="tchip ${!q && st.topic === t ? 'on' : ''}" data-cond-topic="${esc(t)}" data-cond-id="${esc(id)}">${esc(t)} · ${n}</button>`).join('')}<button class="tchip ${!q && st.topic === '__all__' ? 'on' : ''}" data-cond-topic="__all__" data-cond-id="${esc(id)}">תוכן העניינים · ${doc.toc.length}</button></div>
      <label class="cond-topic-select">נושא <select data-cond-select="${esc(id)}" aria-label="בחירת נושא">${topics.map(([t, n]) => `<option value="${esc(t)}" ${!q && st.topic === t ? 'selected' : ''}>${esc(t)} · ${n}</option>`).join('')}<option value="__all__" ${!q && st.topic === '__all__' ? 'selected' : ''}>תוכן העניינים · ${doc.toc.length}</option></select></label>
      <p class="cond-search"><input type="search" data-cond-search="${esc(id)}" value="${esc(st.q || '')}" placeholder="חיפוש מילה בכל סעיפי המסמך, למשל: שכר, ערבות, מפרקי" aria-label="חיפוש בסעיפי המכרז">${q ? `<small class="muted">${secs.length} סעיפים עם "${esc(q)}"</small>` : ''}<button data-cond-csv="${esc(id)}" title="הסעיפים המוצגים כרגע, כקובץ לאקסל">הורדה (CSV)</button></p>`;
    if (!q && st.topic === '__all__') {
      html += `<ol class="toc">${doc.toc.map((e, i) => `<li><a href="${esc(e.u || doc.doc)}#page=${e.p}" target="_blank" rel="noopener"><b>${esc(e.n)}</b> ${esc(e.t)}</a> <small class="muted">${e.d ? esc(e.d) + ' · ' : ''}עמוד ${e.p}</small></li>`).join('')}</ol>`;
    } else {
      // כותרת קצרה = כותרת סעיף; שורה ארוכה = תחילת סעיף ממוספר, ואז הטקסט המלא כולל אותה
      const isHeading = s => s.t.length <= 48 && !/[,.]$/.test(s.t);
      const head = s => isHeading(s) ? esc(s.t) : esc(s.t.length > 80 ? s.t.slice(0, 80) + '…' : s.t);
      const full = s => isHeading(s) ? s.text : (s.t + ' ' + s.text).trim();
      const brief = s => s.brief ? `<span class="brief">${esc(s.brief)}</span>` : head(s);
      const title = s => isHeading(s) ? `<span class="ctitle">${esc(s.t)}</span> ` : '';
      html += secs.length ? secs.map(s => `<details class="csec"><summary><b>${esc(s.n)}</b> ${s.brief ? title(s) : ''}${brief(s)} <small class="muted">· ${s.d ? esc(s.d) + ' · ' : ''}עמוד PDF ${s.p}</small>${s.numbers.length ? `<span class="nums">${s.numbers.slice(0, 8).map(x => `<span class="numchip">${esc(x)}</span>`).join('')}</span>` : ''}</summary><blockquote class="linequote"><small class="muted">הציטוט המקורי מהמסמך:</small><p>${esc(full(s) || 'הסעיף ריק בטקסט שחולץ (ייתכן טבלה או תמונה).')}</p><small><a href="${esc(s.u || doc.doc)}#page=${s.p}" target="_blank" rel="noopener">לעמוד במסמך ↗</a></small></blockquote></details>`).join('') : '<p class="muted">אין סעיפים בנושא הזה.</p>';
    }
  }
  if (maps.length) {
    html += `<details class="fielddetails" ${doc ? '' : 'open'}><summary>מפות ותרשימים שהועתקו מהמסמכים · ${maps.length}</summary><p class="muted">צילום של העמוד במסמך, כפי שהוא. הכיתוב הוא שורה מהעמוד עצמו.</p><div class="tmaps">${maps.map(renderMap).join('')}</div></details>`;
  }
  body.innerHTML = html || '<p class="muted">אין נתונים.</p>';
}

document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.cond-section') && d.open) fillConditions(d); }, true);
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-cond-topic]'); if (!b) return;
  const id = b.dataset.condId; condState[id] = condState[id] || {}; condState[id].topic = b.dataset.condTopic; condState[id].q = '';
  const details = document.querySelector(`details.cond-section[data-cond-tender="${id}"]`);
  if (details) renderConditionsBody(id, details.querySelector('.cond-body'), sectionFiles[id] || null);
});
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-cond-csv]'); if (!b) return;
  const id = b.dataset.condCsv, doc = sectionFiles[id], st = condState[id] || {}; if (!doc) return;
  const q = (st.q || '').trim();
  const secs = doc.sections.filter(s => q ? (s.t + ' ' + s.text).includes(q) : (st.topic === '__all__' ? true : s.topics.includes(st.topic)));
  if (typeof downloadCSV !== 'function') return;
  downloadCSV(`tnaim-mikhraz-${id}${q ? '' : '-' + (st.topic === '__all__' ? 'kol' : st.topic)}.csv`, ['סעיף', 'כותרת', 'בקצרה', 'מספרים', 'נושאים', 'עמוד PDF', 'הטקסט במסמך'],
    secs.map(s => [s.n, s.t, s.brief || '', s.numbers.join(' | '), s.topics.join(' | '), s.p, s.text]));
});
document.addEventListener('change', e => {
  const sel = e.target; if (!sel.matches || !sel.matches('select[data-cond-select]')) return;
  const id = sel.dataset.condSelect; condState[id] = condState[id] || {}; condState[id].topic = sel.value; condState[id].q = '';
  const details = document.querySelector(`details.cond-section[data-cond-tender="${id}"]`);
  if (details) renderConditionsBody(id, details.querySelector('.cond-body'), sectionFiles[id] || null);
});
let condSearchTimer = 0;
document.addEventListener('input', e => {
  const inp = e.target; if (!inp.matches || !inp.matches('input[data-cond-search]')) return;
  const id = inp.dataset.condSearch; condState[id] = condState[id] || {}; condState[id].q = inp.value;
  clearTimeout(condSearchTimer);
  condSearchTimer = setTimeout(() => {
    const details = document.querySelector(`details.cond-section[data-cond-tender="${id}"]`);
    if (!details) return;
    renderConditionsBody(id, details.querySelector('.cond-body'), sectionFiles[id] || null);
    const again = details.querySelector('input[data-cond-search]');
    if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch {} }
  }, 250);
});
