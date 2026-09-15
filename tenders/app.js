'use strict';
let documentReviews={};
let governmentItems=[],archiveItems=[],portalItems=[],feedExpanded=false,fieldCatalog={},structuredFields={},fieldsState='loading';
let filter='all';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function matches(){const tokens=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);return portalItems.filter(t=>(filter==='all'||t.type===filter)&&tokens.every(q=>[t.title,t.number,t.id,...(documentReviews[t.id]?.routes||[]).flatMap(r=>[r.number,r.area])].join(' ').toLowerCase().includes(q)));}
function render(){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));renderFeed();}
$('search').addEventListener('input',render);$('reset').onclick=()=>{$('search').value='';filter='all';render();$('search').focus()};document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});render();
if(document.modelContext?.registerTool){
 try{Promise.resolve(document.modelContext.registerTool({name:'search_tenders',description:'Filter the visible tender list by query and transport type. This changes the displayed search.',inputSchema:{type:'object',properties:{query:{type:'string'},type:{enum:['all','bus','taxi']}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||typeof input.query!=='string'||(input.type&&!['all','bus','taxi'].includes(input.type)))throw new Error('Invalid search');$('search').value=input.query;filter=input.type||'all';render();return matches().map(t=>({id:t.id,title:t.title,number:t.number,coverage:'partial'}));}})).catch(()=>{});}catch{}
}
fetch('access-check.json').then(r=>{if(!r.ok)throw new Error('audit unavailable');return r.json()}).then(r=>{$('audit-summary').textContent=`בדיקת חיפוש מוניות: ${r.uniqueRecords} רשומות ייחודיות מתוך ${r.pages[0].total} בתוצאות הפורטל. ${r.allPagesValidated&&r.matchesPortalTotal?'כל עמודי החיפוש נקראו.':'האיסוף חלקי; חלק מהבקשות נכשלו.'} החיפוש כולל גם תוצאות שאינן מכרזי קווי שירות.`}).catch(()=>{$('audit-summary').textContent='דוח הבדיקה אינו זמין כרגע.'});
function renderFeed(){const host=$('live-results');if(!host)return;const tokens=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);const all=matches();const visible=feedExpanded?all:all.slice(0,6);host.innerHTML=visible.map(t=>`<div class="feedrow"><div><span class="tag">${t.classification==='operating_tender'?'מכרז להפעלת שירות':'פרסום נוסף · עדיין בבדיקה'}</span><h3><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)} ↗</a></h3><p class="muted">מספר המכרז: <bdi>${esc(t.number||'לא זוהה')}</bdi> · מצב באתר הממשלתי: ${esc(t.status||'לא זוהה')}</p>${t.discoveryNote?`<details class="discovery-note"><summary>מה בדקנו עד עכשיו?</summary><p>${esc(t.discoveryNote)}</p></details>`:''}${renderFields(t)}${renderDocumentReview(t)}${typeof renderRouteAnnexes==='function'?renderRouteAnnexes(t):''}</div><div class="feeddate"><span>עודכן באתר הממשלתי</span><bdi>${esc(t.updated||'לא זוהה')}</bdi><small>הגשה: <bdi>${esc(t.deadline||'לא זוהה')}</bdi></small></div></div>`).join('')||'<p>אין פרסומים המתאימים לחיפוש במידע שנטען.</p>';$('feed-more').hidden=all.length<=6;$('feed-more').textContent=feedExpanded?'הצגת פחות':`הצגת כל ${all.length} התוצאות`;}
$('feed-more').onclick=()=>{feedExpanded=!feedExpanded;renderFeed()};
fetch('tenders-feed.json').then(r=>{if(!r.ok)throw new Error('feed unavailable');return r.json()}).then(r=>{governmentItems=r.items;combineFeeds();$('feed-status').textContent=`${r.items.length} פרסומים שנאספו. בדיקה אחרונה: ${new Date(r.checkedAt).toLocaleString('he-IL')}. הרשימה עדיין חלקית: החיפוש בפורטל מוגבל למשרד התחבורה ולמילה ״קווי״.`;renderFeed()}).catch(()=>{$('feed-status').textContent='לא ניתן לטעון את רשימת הפרסומים כרגע. אפשר לנסות לרענן את הדף.'});
fetch('automation-config.json').then(r=>r.json()).then(r=>{$('schedule-status').textContent=r.enabled?'המערכת מחפשת פרסומים חדשים ושינויים פעם ביום. תנאים שעדיין לא נבדקו יישארו מסומנים כך עד להשלמת הבדיקה.':'עדכון מתוזמן עדיין לא הופעל.'}).catch(()=>{$('schedule-status').textContent='סטטוס התזמון אינו זמין.'});
function isVerified(f){return ['verified','verified_conditional'].includes(f?.status);}
function renderSources(sources){
 return (sources||[]).filter(s=>/^https:\/\//.test(s.url||'')).map(s=>`<a target="_blank" rel="noopener" href="${esc(s.url)}">${esc(s.locator)}</a>`).join(' · ');
}
function renderVerifiedField(key,f){
 const value=f.status==='verified_conditional'?`<dl class="condition-list">${f.conditions.map(c=>`<div><dt>${esc(c.label)}</dt><dd>${c.comparison==='lt'?'פחות מ־':c.comparison==='lte'?'עד ':c.comparison==='gte'?'לפחות ':''}${formatFieldValue(c)}</dd></div>`).join('')}</dl>`:`<p class="field-value">${formatFieldValue(f)}</p>`;
 const sources=f.status==='verified_conditional'?f.conditions.flatMap(c=>c.sources||[]):f.sources||[];
 const unique=[...new Map(sources.map(source=>[source.url,source])).values()];
 return `<section class="verified-field" data-field="${esc(key)}"><h4>${esc(fieldLabel(key,f))}</h4>${value}<details class="source-details"><summary>הסבר ומסמך המקור</summary>${f.notes?`<p>${esc(f.notes)}</p>`:''}<p>${renderSources(unique)}</p></details></section>`;
}
let extractionState={};
fetch('extraction-state.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(r=>{extractionState=r.tenders||{};renderFeed()}).catch(()=>{});
function extractionSummary(id){
 const s=extractionState[id];if(!s)return '';
 const count=Object.values(structuredFields[id]||{}).filter(isVerified).length;
 const message=s.status==='retry_pending'?'הורדת המסמך לא הצליחה בבדיקה האחרונה. המערכת תנסה שוב.':s.status==='source_missing'?'לא נמצא מסמך מכרז ראשי זמין.':s.status==='needs_review'?(s.reason||'המסמך דורש בדיקה נוספת.'):'חלק מהפרטים נקראו; יתר התנאים וההבהרות עדיין בבדיקה.';
 return `<p class="muted">${count?`${count} פרטים שנבדקו נשמרו. `:''}${esc(message)}</p>`;
}
function renderFields(t){
 if(fieldsState==='loading')return '<p class="muted" role="status">טוען פרטים…</p>';
 if(fieldsState==='error'||!Object.keys(fieldCatalog).length)return '<p role="status">טעינת התנאים נכשלה. <button data-retry-fields>ניסיון חוזר</button></p>';
 const fields=structuredFields[t.id]||{},all=Object.entries(fieldCatalog).map(([k,d])=>[k,fields[k]||d]);
 const verified=all.filter(([,f])=>isVerified(f)),pending=all.filter(([,f])=>!isVerified(f));
 const labels={unverified:'עדיין לא בדקנו',source_missing:'לא מצאנו מסמך מתאים',unrecognized_wording:'הניסוח במסמך אינו ברור',conflict:'המקורות מציגים מידע שונה',not_applicable:'לא רלוונטי למכרז הזה'};
 return `${extractionSummary(t.id)}<details class="fielddetails tender-conditions"><summary>${verified.length?`${verified.length} פרטים שנבדקו`:'עדיין לא בדקנו את התנאים'}</summary>${verified.length?`<p class="muted">הפרטים נבדקו במסמך המקושר. ייתכן שיש עדכונים מאוחרים יותר שעדיין לא בדקנו.</p><div class="verified-grid">${verified.map(([k,f])=>renderVerifiedField(k,f)).join('')}</div>`:''}<details class="pending-fields"><summary>מה עדיין חסר? ${pending.length} פרטים</summary>${pending.map(([k,f])=>`<div class="pending-row"><strong>${esc(fieldLabel(k,f))}</strong><span>${labels[f.status]||'ממתין לבדיקה'}</span>${f.reason?`<p>${esc(f.reason)}</p>`:''}${f.sources?.length?`<p>${renderSources(f.sources)}</p>`:''}</div>`).join('')}</details></details>`;
}
async function loadFields(){
 fieldsState='loading';renderFeed();
 try{
  const responses=await Promise.all(['field-catalog.json','structured-tenders.json'].map(url=>fetch(url,{cache:'no-cache'})));
  if(responses.some(r=>!r.ok))throw new Error('Fields unavailable');
  const [catalog,values]=await Promise.all(responses.map(r=>r.json()));
  if(!catalog.fields||Array.isArray(catalog.fields)||!Object.keys(catalog.fields).length||!values||typeof values!=='object'||Array.isArray(values))throw new Error('Invalid fields');
  fieldCatalog=catalog.fields;structuredFields=values;fieldsState='ready';
 }catch{fieldsState='error';}
 renderFeed();
}
document.addEventListener('click',event=>{if(event.target.closest('[data-retry-fields]'))loadFields();});
loadFields();
const routeDialog=document.createElement('dialog');
routeDialog.className='route-dialog';routeDialog.setAttribute('aria-labelledby','route-title');document.body.append(routeDialog);

function combineFeeds(){
 const urls=new Set(governmentItems.map(t=>t.url));
 portalItems=[...archiveItems.filter(t=>!urls.has(t.url)),...governmentItems];
 renderFeed();
}
const archiveStatus=document.createElement('p');
archiveStatus.id='archive-status';archiveStatus.className='muted';
$('feed-status').after(archiveStatus);
fetch('archive-feed.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Archive unavailable');return r.json()}).then(r=>{
 if(!Array.isArray(r.items))throw new Error('Invalid archive');
 archiveItems=r.items;
 archiveStatus.textContent=`ארכיון משרד התחבורה: ${r.items.length} פרסומים נוספים. ${r.lastRun?.ok?'נמצאו מסמכים בארכיון; חלקם עדיין לא נבדקו.':'לא הצלחנו לקרוא את כל הארכיון. מוצגים הפרסומים שכבר נמצאו, וייתכן שיש נוספים.'}`;
 combineFeeds();
}).catch(()=>{archiveStatus.textContent='לא ניתן לטעון את פרסומי הארכיון. רשימת הפורטל נשארת זמינה.';});

function fieldLabel(key,f){
 const labels={'term.base':'משך ההתקשרות הראשונית','term.extension':'אפשרויות להארכת ההתקשרות','fleet.max_age':'מגבלות גיל הרכב','scoring.price_weight':'משקל המחיר בציון','scoring.quality_weight':'משקל האיכות בציון','eligibility.turnover':'מחזור הכנסות נדרש להשתתפות','eligibility.equity':'הון עצמי נדרש להשתתפות','service.variants':'אפשרויות המסלול','price.ceiling_per_km':'מחיר מרבי לקילומטר','award.awarded_price':'המחיר בהצעה הזוכה'};
 return labels[key]||f.label||fieldCatalog[key].label;
}
function formatFieldValue(f){
 const unitLabels={years:'שנים',months:'חודשים',days:'ימים',per_km:'לק״מ',total:'סכום כולל',percent:'',points:'',km:'ק״מ',per_year:'לשנה',per_month:'לחודש'};
 const vatLabels={not_applicable:'לא חל',included:'כלול',excluded:'לא כלול',unknown:'לא צוין',unspecified:'לא צוין'};
 let value=Array.isArray(f.value)?f.value.join(', '):typeof f.value==='number'?f.value.toLocaleString('he-IL'):f.value;
 if(f.kind==='percent')value+=' %';
 if(f.kind==='points')value+=' נקודות';
 if(f.currency)value+=' '+(f.currency==='ILS'?'₪':f.currency);
 if(f.unit&&unitLabels[f.unit])value+=(['years','months','days'].includes(f.unit)?' ':' · ')+unitLabels[f.unit];
 if(f.period)value+=' · '+f.period;
 if(f.vat)value+=' · מע״מ: '+(vatLabels[f.vat]||(/[א-ת]/.test(f.vat)?f.vat:'לא צוין'));
 return esc(value);
}
function reviewSource(review,page){return `<a target="_blank" rel="noopener" href="${esc(review.document.url)}#page=${page}">עמוד PDF ${page} ↗</a>`;}
let routeAudit={};
fetch('route-audit.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(r=>{routeAudit=r.tenders||{};renderFeed()}).catch(()=>{});
function routeGaps(id){return (routeAudit[id]?.gaps||[]).map(g=>`<li>${esc(g)}</li>`).join('');}
function renderDocumentReview(t){
 const r=documentReviews[t.id];if(!r)return t.classification==='operating_tender'?`<details class="fielddetails"><summary>קווים ומסלולים · בדיקת שלמות</summary><ul>${routeGaps(t.id)||'<li>רשימת הקווים והמפות עדיין לא נבדקו מול נספחי המכרז.</li>'}</ul></details>`:'';
 return `<details class="fielddetails review-details"><summary>קווים ותיאור השירות</summary><p class="warning">${esc(r.coverage)}</p>${r.sections.filter(section=>!['הפעלה ותקופת בסיס','אפשרויות הארכה','גיל הרכב'].includes(section.title)).map(section=>`<h4>${esc(section.title)}</h4><p>${esc(section.text)}</p><p>${[section.page,...(section.alsoPages||[])].map(page=>reviewSource(r,page)).join(' · ')}</p>`).join('')}<h4>קווים בתכנון המכרז</h4><p class="muted">${esc(r.routesCoverage)}</p><div class="routechips">${r.routes.map((route,i)=>`<button data-reviewed-tender="${esc(t.id)}" data-reviewed-route="${i}" aria-haspopup="dialog">${esc(route.number)} · ${esc(route.area)}</button>`).join('')}</div><h4>מה עדיין לא ידוע?</h4><ul>${r.gaps.map(gap=>`<li>${esc(gap)}</li>`).join('')}${routeGaps(t.id)}</ul></details>`;
}
fetch('document-reviews.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Review unavailable');return r.json()}).then(r=>{documentReviews=r;renderFeed()}).catch(()=>{});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-reviewed-route]');if(!button)return;
 const review=documentReviews[button.dataset.reviewedTender],route=review?.routes[Number(button.dataset.reviewedRoute)];if(!route)return;
 routeDialog.innerHTML=`<form method="dialog"><button>סגירה ✕</button></form><h2 id="route-title">קו ${esc(route.number)} · ${esc(route.area)}</h2><p>${esc(route.description)}</p><p class="warning">תכנון לפי מסמך המכרז; אין לראות בו מסלול נוכחי. תחנות, כיוונים וחלופות עדיין לא נבדקו.</p>${[route.page,...(route.alsoPages||[])].map(page=>reviewSource(review,page)).join(' · ')}`;
 routeDialog.showModal();
});
