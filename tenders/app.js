'use strict';
let documentReviews={};
let packageState={},automaticSummaries={},semanticReviews={};
let governmentItems=[],archiveItems=[],portalItems=[],feedExpanded=false,fieldCatalog={},structuredFields={},fieldsState='loading';
let filter='all';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function matches(){const tokens=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);return portalItems.filter(t=>(filter==='all'||t.type===filter)&&tokens.every(q=>[t.title,t.number,t.id,...allPackageRoutes(t.id).flatMap(r=>[r.number,r.area,r.destination,r.description]),...(documentReviews[t.id]?.routes||[]).flatMap(r=>[r.number,r.area])].join(' ').toLowerCase().includes(q)));}
function render(){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));renderFeed();}
$('search').addEventListener('input',render);$('reset').onclick=()=>{$('search').value='';filter='all';render();$('search').focus()};document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});render();
if(document.modelContext?.registerTool){
 try{Promise.resolve(document.modelContext.registerTool({name:'search_tenders',description:'Filter the visible tender list by query and transport type. This changes the displayed search.',inputSchema:{type:'object',properties:{query:{type:'string'},type:{enum:['all','bus','taxi']}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||typeof input.query!=='string'||(input.type&&!['all','bus','taxi'].includes(input.type)))throw new Error('Invalid search');$('search').value=input.query;filter=input.type||'all';render();return matches().map(t=>({id:t.id,title:t.title,number:t.number,coverage:'partial'}));}})).catch(()=>{});}catch{}
}
fetch('access-check.json').then(r=>{if(!r.ok)throw new Error('audit unavailable');return r.json()}).then(r=>{$('audit-summary').textContent=`בדיקת חיפוש מוניות: ${r.uniqueRecords} רשומות ייחודיות מתוך ${r.pages[0].total} בתוצאות הפורטל. ${r.allPagesValidated&&r.matchesPortalTotal?'כל עמודי החיפוש נקראו.':'האיסוף חלקי; חלק מהבקשות נכשלו.'} החיפוש כולל גם תוצאות שאינן מכרזי קווי שירות.`}).catch(()=>{$('audit-summary').textContent='דוח הבדיקה אינו זמין כרגע.'});
// בטלפון כל כרטיס סגור ורק הכותרת נראית; לחיצה פותחת את הפרטים. במחשב הכרטיס פתוח (שלמה 16.09).
const wideScreen=()=>window.matchMedia('(min-width:761px)').matches;
// סיווג פרסום לפי הכותרת — אותם חוקים כמו ב-scripts/feed_rules.py (לפרסומים שנשמרו לפני שהסיווג נוסף)
const FEED_UNRELATED=/מיקרוסופט|microsoft|ichain|datapower|db2|\bwas\b|arcgis|\bgis\b|eternal|firewall|תוכנ|תחזוקת רישיונות|תחזוקה לרישיונות|חידוש רישיונות|רישיון נהיגה|רישיונות נהיגה|משיט|הדפסה|מגנוט|דיוור|תחנות צילום|בסיסי נתונים|ריהוט|ניקיון|מזגנים|כלי רכב לעובדי|רכבי ליסינג/i;
const FEED_TRANSPORT=/קווי שירות|קו שירות|אוטובוס|מוניות|תחבורה ציבורית|תח"צ|תחצ|סככות|תחנות|מסופ|רכבת|מטרו|נת"צ|נוסעים|מפעילי|קווי מתע"ן|מתען|רב[- ]קו|כרטוס|הסעות/;
function feedClass(t){if(t.classification==='operating_tender'||t.classification==='transport_related'||t.classification==='unrelated')return t.classification;const s=t.title||'';if(FEED_UNRELATED.test(s))return 'unrelated';return FEED_TRANSPORT.test(s)?'transport_related':'unrelated';}
const cardTab={};   // מכרז → הלשונית הפתוחה
function renderFeed(){const host=$('live-results');if(!host)return;const tokens=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);const every=matches();
 // רק מכרזים להפעלת קווי אוטובוס ומוניות שירות. קול קורא / בקשה למידע / מכרז לציוד — לא מופיעים (שלמה 16.09: "לא נראה לי זה קשור לאתר")
 const all=every.filter(t=>feedClass(t)==='operating_tender');const visible=feedExpanded?all:all.slice(0,6);host.innerHTML=visible.map(t=>{
 const lines=typeof renderLinesSection==='function'?renderLinesSection(t):'',cond=typeof renderConditionsSection==='function'?renderConditionsSection(t):'',pkg=renderPackage(t,!!lines);
 const plain=typeof renderPlainFacts==='function'?renderPlainFacts(t.id):'';
 // טבלת קווים שתועתקה בסריקה הקודמת (למשל צפון הנגב, שהקובץ שלו חסום להורדה) — לשונית "הקווים" משלה
 const review=!lines?renderDocumentReview(t):'';
 const files=`${pkg}${lines?renderDocumentReview(t):''}${!lines&&typeof renderRouteAnnexes==='function'?renderRouteAnnexes(t):''}`;
 const nLines=(typeof hasChangeSection==='function'&&hasChangeSection(t.id)&&mentionedCount(t.id))||(typeof todayData!=='undefined'&&todayData.tenders?.[t.id]?.counts?.inTender)||(typeof routeIndex!=='undefined'&&routeIndex[t.id]?.uniqueRoutes)||0;
 const nDocs=Object.keys(packageState[t.id]?.documents||{}).length;
 const nVerified=Object.values(combinedFields(t.id)).filter(isVerified).length;
 // לשוניות במקום שורות שנפתחות ונסגרות (שלמה 16.09: "ממש מסובך לסגור ולפתוח")
 const panes=[
  plain&&['plain','מה המכרז דורש',plain],
  lines&&['lines',`הקווים${nLines?` · ${nLines}`:''}`,lines],
  review&&['review',`הקווים · ${documentReviews[t.id].routes.length}`,review],
  cond&&['cond','כל הסעיפים',cond],
  files.trim()&&['files',`הקבצים${nDocs?` · ${nDocs}`:''}`,files],
  !plain&&['fields',`פרטים שנבדקו${nVerified?` · ${nVerified}`:''}`,`${t.discoveryNote?`<p class="muted">${esc(t.discoveryNote)}</p>`:''}${renderFields(t)}`],
 ].filter(Boolean);
 if(!panes.length)panes.push(['fields','פרטים',`${t.discoveryNote?`<p class="muted">${esc(t.discoveryNote)}</p>`:''}${renderFields(t)}`]);
 const active=panes.some(p=>p[0]===cardTab[t.id])?cardTab[t.id]:panes[0][0];
 // לשונית אחת בלבד — בלי שורת לשוניות (בטלפון הכותרת "פרטים שנבדקו" הופיעה פעמיים: בשורה המקופלת ובלשונית)
 const tabs=`${panes.length>1?`<div class="card-tabs" role="tablist">${panes.map(([k,l])=>`<button role="tab" data-card-tab="${k}" data-card-id="${esc(t.id)}" aria-selected="${k===active}" class="${k===active?'on':''}">${l}</button>`).join('')}</div>`:''}<div class="tabpanes">${panes.map(([k,,h])=>`<section class="tabpane" data-pane="${k}"${k===active?'':' hidden'}>${h}</section>`).join('')}</div>`;
 const parts=panes.map(p=>p[1].split(' · ')[0]);
 return `<div class="feedrow"><div><span class="tag">${t.classification==='operating_tender'?'מכרז להפעלת שירות':'פרסום בתחום התחבורה הציבורית · לא מכרז להפעלת קווים'}</span><h3><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)} ↗</a></h3><p class="muted">מספר המכרז: <bdi>${esc(t.number||'לא זוהה')}</bdi> · מצב באתר הממשלתי: ${esc(t.status||'לא זוהה')}</p><details class="cardbody" data-keep-open="card:${esc(t.id)}"${wideScreen()?' open':''}><summary>${parts.join(' · ')}</summary><div class="cardbody-in">${tabs}</div></details></div><div class="feeddate"><span>עודכן באתר הממשלתי</span><bdi>${esc(t.updated||'לא זוהה')}</bdi><small>הגשה: <bdi>${esc(t.deadline||'לא זוהה')}</bdi></small></div></div>`;}).join('')||'<p>אין מכרזים להפעלת קווים המתאימים לחיפוש במידע שנטען.</p>';
 // מה שאינו מכרז להפעלת קווי אוטובוס או מוניות שירות לא מופיע בכלל — גם לא מקופל (שלמה 16.09: "מה שלא קווי אוטובוס ומונית שירות — לא לרשום!")
 // הלשונית הפעילה של קווים/סעיפים נטענת (הן נבנות בעצלות)
 for(const pane of host.querySelectorAll('.tabpane:not([hidden])'))activatePane(pane);
 $('feed-more').hidden=all.length<=6;$('feed-more').textContent=feedExpanded?'הצגת פחות':`הצגת כל ${all.length} התוצאות`;}
function activatePane(pane){
 for(const d of pane.querySelectorAll(':scope > details.lines-section, :scope > details.cond-section')){if(!d.open)d.open=true;}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button[data-card-tab]');if(!b)return;
 const id=b.dataset.cardId,k=b.dataset.cardTab;cardTab[id]=k;
 const wrap=b.closest('.cardbody-in');if(!wrap)return;
 for(const x of wrap.querySelectorAll('.card-tabs button')){const on=x.dataset.cardTab===k;x.classList.toggle('on',on);x.setAttribute('aria-selected',on);}
 for(const p of wrap.querySelectorAll('.tabpane')){p.hidden=p.dataset.pane!==k;if(!p.hidden)activatePane(p);}
});
$('feed-more').onclick=()=>{feedExpanded=!feedExpanded;renderFeed()};
fetch('tenders-feed.json').then(r=>{if(!r.ok)throw new Error('feed unavailable');return r.json()}).then(r=>{governmentItems=r.items;combineFeeds();$('feed-status').textContent=`${r.items.filter(t=>feedClass(t)==='operating_tender').length} מכרזים להפעלת קווים מהפורטל הממשלתי. בדיקה אחרונה: ${new Date(r.checkedAt).toLocaleString('he-IL')}. פרסומים אחרים של משרד התחבורה (ציוד, בקרה, תוכנה) לא מוצגים.`;renderFeed()}).catch(()=>{$('feed-status').textContent='לא ניתן לטעון את רשימת הפרסומים כרגע. אפשר לנסות לרענן את הדף.'});
fetch('automation-config.json').then(r=>r.json()).then(r=>{$('schedule-status').textContent=r.enabled?(r.firstScheduledRunVerified?'העדכון היומי הופעל ונבדקה הרצה מתוזמנת.':'הוגדר עדכון יומי ל־08:30. הצלחת ההרצה המתוזמנת הראשונה עדיין לא אומתה.'):'עדכון מתוזמן עדיין לא הופעל.'}).catch(()=>{$('schedule-status').textContent='סטטוס התזמון אינו זמין.'});
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
 if(packageState[id])return '';
 const s=extractionState[id];if(!s)return '';
 const count=Object.values(combinedFields(id)).filter(isVerified).length;
 const message=s.status==='retry_pending'?'הורדת המסמך לא הצליחה בבדיקה האחרונה. המערכת תנסה שוב.':s.status==='source_missing'?'לא נמצא מסמך מכרז ראשי זמין.':s.status==='needs_review'?(s.reason||'המסמך דורש בדיקה נוספת.'):'חלק מהפרטים נקראו; יתר התנאים וההבהרות עדיין בבדיקה.';
 return `<p class="muted">${count?`${count} פרטים שנבדקו נשמרו. `:''}${esc(message)}</p>`;
}
function renderFields(t){
 if(fieldsState==='loading')return '<p class="muted" role="status">טוען פרטים…</p>';
 if(fieldsState==='error'||!Object.keys(fieldCatalog).length)return '<p role="status">טעינת התנאים נכשלה. <button data-retry-fields>ניסיון חוזר</button></p>';
 const fields=combinedFields(t.id),all=Object.entries(fieldCatalog).map(([k,d])=>[k,fields[k]||d]);
 const verified=all.filter(([,f])=>isVerified(f)),pending=all.filter(([,f])=>!isVerified(f));
 return `${extractionSummary(t.id)}<details class="fielddetails tender-conditions"><summary>${verified.length?`${verified.length} פרטים שנבדקו`:'עדיין לא בדקנו את התנאים'}</summary>${verified.length?`<p class="muted">הפרטים נבדקו במסמך המקושר. ייתכן שיש עדכונים מאוחרים יותר שעדיין לא בדקנו.</p><div class="verified-grid">${verified.map(([k,f])=>renderVerifiedField(k,f)).join('')}</div>`:''}${renderPendingFields(t.id)}</details>`;
}
const PENDING_LABELS={unverified:'עדיין לא בדקנו',source_missing:'לא מצאנו מסמך מתאים',unrecognized_wording:'הניסוח במסמך אינו ברור',conflict:'המקורות מציגים מידע שונה',not_applicable:'לא רלוונטי למכרז הזה',per_line:'נקבע לכל קו בנספח',not_found:'לא נמצא במסמך הראשי',later:'ייקבע אחרי ההגשה'};
// "מה לא מצאנו" — השדות שאין להם ערך, עם ההסבר למה (מוצג בסוף "מה המכרז דורש")
function renderPendingFields(id){
 if(fieldsState!=='ready'||!Object.keys(fieldCatalog).length)return '';
 const fields=combinedFields(id),pending=Object.entries(fieldCatalog).map(([k,d])=>[k,fields[k]||d]).filter(([,f])=>!isVerified(f));
 if(!pending.length)return '';
 return `<details class="pending-fields"><summary>מה לא מצאנו במסמך · ${pending.length}</summary>${pending.map(([k,f])=>`<div class="pending-row"><strong>${esc(fieldLabel(k,f))}</strong><span>${PENDING_LABELS[f.status]||'ממתין לבדיקה'}</span>${f.reason?`<p>${esc(f.reason)}</p>`:''}${f.sources?.length?`<p>${renderSources(f.sources)}</p>`:''}</div>`).join('')}</details>`;
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
 const oldOnes=r.items.filter(t=>feedClass(t)==='operating_tender').length;
 archiveStatus.textContent=oldOnes?`מארכיון משרד התחבורה נוספו ${oldOnes} מכרזים ישנים.`:'';
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
 const r=documentReviews[t.id];if(!r||!r.routes?.length)return '';
 // בלי פסקאות שנכתבו בידי מודל שפה (שלמה 16.09). נשארת רק טבלת הקווים שתועתקה
 // מעמודי המסמך, עם ציון העמוד — עד שהקריאה האוטומטית של המסמך תחליף אותה.
 return `<details class="fielddetails review-details" open><summary>קווים מתוך טבלת המסמך · ${r.routes.length} (תעתוק מעמודי המסמך, בבדיקה)</summary><p class="muted">הטבלה תועתקה מעמודי המסמך בסריקה הקודמת${r.routeTableCheck?.pages?.length?` (עמודים ${r.routeTableCheck.pages[0]}–${r.routeTableCheck.pages.at(-1)})`:''} ועדיין לא אומתה בקריאה אוטומטית${r.document?.url?`, כי <a href="${esc(r.document.url)}" target="_blank" rel="noopener">הקובץ באתר gov.il</a> חסום להורדה אוטומטית`:''}. לחיצה על קו מראה את השורה שלו ואת העמוד.</p><div class="routechips">${r.routes.map((route,i)=>`<button data-reviewed-tender="${esc(t.id)}" data-reviewed-route="${i}" aria-haspopup="dialog">${esc(route.number)} · ${esc(route.area)}</button>`).join('')}</div></details>`;
}
fetch('document-reviews.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Review unavailable');return r.json()}).then(r=>{documentReviews=r;renderFeed()}).catch(()=>{});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-reviewed-route]');if(!button)return;
 if(typeof routeDetailsReady!=='undefined')await routeDetailsReady;await packageDataReady;
 const review=documentReviews[button.dataset.reviewedTender],route=review?.routes[Number(button.dataset.reviewedRoute)];if(!route)return;
 routeDialog.innerHTML=`<form method="dialog"><button>סגירה ✕</button></form><h2 id="route-title">קו ${esc(route.number)} · ${esc(route.area)}</h2><p>${esc(route.description)}</p>${typeof renderRouteDetails==='function'?renderRouteDetails(button.dataset.reviewedTender,route):''}<p class="warning">תכנון לפי מסמך המכרז; אין לראות בו מסלול נוכחי.</p>${[route.page,...(route.alsoPages||[])].map(page=>reviewSource(review,page)).join(' · ')}`;
 routeDialog.showModal();
});

function currentPackageDocuments(id, collection){
 return Object.entries(collection[id]?.documents||{}).filter(([key,d])=>packageState[id]?.documents?.[key]?.sha256===d.sha256).map(([,d])=>d);
}
function allPackageRoutes(id){
 // רק שורות שנקראו בקוד מטבלאות במסמכים; לא רשימות שנכתבו בידי מודל שפה
 const routes=currentPackageDocuments(id,automaticSummaries).flatMap(d=>d.routes||[]);
 return [...new Map(routes.map(r=>[JSON.stringify([r.number,r.area,r.destination,r.direction,r.variant,r.member,r.row,r.sha256||r.sources?.[0]?.sha256]),r])).values()];
}
function packageSource(r){
 return r.sources||[{url:r.url+(r.sheet||r.member?'':'#page='+r.page),locator:[r.member,r.sheet?`גיליון ${r.sheet}, שורה ${r.row}`:`עמוד PDF ${r.page}`].filter(Boolean).join(' · ')}];
}
function renderPackage(t,hasLines){
 const p=packageState[t.id];if(!p)return '';
 const docs=Object.values(p.documents||{}),downloaded=docs.filter(d=>d.sha256),failed=docs.filter(d=>d.status==='retry_pending');
 const total=downloaded.reduce((n,d)=>n+(d.units||0),0);
 const routes=allPackageRoutes(t.id);
 const kinds={not_found:'הקישור לא נמצא (404) — ייתכן שהמסמך הוחלף בפורטל',blocked:'אתר gov.il חוסם הורדה אוטומטית (403). אפשר להוריד ידנית ולשמור בתיקייה tenders/manual באותו שם קובץ, והמערכת תקרא אותו',timeout:'זמן קצוב — ייבדק שוב בלילה'};
 const kindOf=d=>d.errorKind||(/403/.test(d.error||'')?'blocked':/404/.test(d.error||'')?'not_found':/timed out|Timeout/i.test(d.error||'')?'timeout':'');
 // הפרטים שנקראו מהמסמכים מוצגים פעם אחת, ב"פרטים שנבדקו"; כאן רק רשימת המסמכים (שלמה 16.09)
 return `<details class="fielddetails package-summary"><summary>הקבצים המקוריים של המכרז להורדה · ${docs.length} קבצים${failed.length?` · ${failed.length} לא ירדו`:''}</summary><p class="muted">${downloaded.length} מסמכים נקראו לטקסט, ${total} עמודים או גיליונות.${failed.length?` הורדת ${failed.length} מסמכים נכשלה.`:''}${!p.listingOk?' לא ניתן היה לעדכן את רשימת המסמכים מהמקור בבדיקה האחרונה.':''}</p><ul>${docs.map(d=>`<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(decodeURIComponent(d.url.split('/').pop()))}</a> · ${d.status==='extracted'?`${d.units} עמודים או יחידות תוכן`:d.status==='retry_pending'?(kinds[kindOf(d)]||'הורדה לא הצליחה'):'ממתין להורדה'}${d.manualFile?' · מקובץ שהורד ידנית':''}</li>`).join('')}</ul>
 ${routes.length&&!hasLines?`<details class="fielddetails"><summary>קווים מתוך מסמכי המכרז · ${routes.length} רשומות</summary><p class="muted">הרשימה מבוססת על המסמכים המקושרים. השלמת כל הכיוונים, החלופות וההבהרות עדיין בבדיקה.</p><div class="routechips">${routes.map((r,i)=>`<button data-package-tender="${esc(t.id)}" data-package-route="${i}" aria-haspopup="dialog">${esc(r.number)} · ${esc(r.area)}</button>`).join('')}</div></details>`:''}</details>`;
}
const packageDataReady=Promise.all(['packages-state.json','automatic-summaries.json','semantic-reviews.json'].map(async name=>{const r=await fetch(name,{cache:'no-cache'});if(!r.ok)throw new Error(name);return r.json();})).then(([p,a,s])=>{packageState=p.tenders||{};automaticSummaries=a.tenders||{};semanticReviews=s.tenders||{};renderFeed();}).catch(()=>{});
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-package-route]');if(!b)return;
 if(typeof routeDetailsReady!=='undefined')await routeDetailsReady;
 const id=b.dataset.packageTender,r=allPackageRoutes(id)[Number(b.dataset.packageRoute)];if(!r)return;
 const maps=currentPackageDocuments(id,semanticReviews).flatMap(d=>d.maps||[]).filter(m=>String(m.number)===String(r.number)&&m.area===r.area&&(!r.variant||m.variant===r.variant)&&(!r.direction||m.direction===r.direction));
 routeDialog.innerHTML=`<form method="dialog"><button>סגירה ✕</button></form><h2 id="route-title">קו ${esc(r.number)} · ${esc(r.area)}</h2><p>${esc(r.description)}</p>${typeof renderRouteDetails==='function'?renderRouteDetails(id,r):''}<p class="muted">${r.catalogNumber?`מק״ט ${esc(r.catalogNumber)} · `:''}${r.direction?`כיוון ${esc(r.direction)} · `:''}${r.variant?`חלופה ${esc(r.variant)}`:''}</p><p>${r.originStop?`מוצא: ${esc(r.originStop)} · `:''}${r.destinationStop?`יעד: ${esc(r.destinationStop)}`:''}</p><p>${renderSources(packageSource(r))}</p>${maps.map(m=>`<figure>${/^maps\/[a-zA-Z0-9_-]+\.webp$/.test(m.image||'')?`<a href="${esc(m.image)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(m.image)}" alt="${esc(m.description)}"></a>`:''}<figcaption>${esc(m.description)} · ${renderSources(m.sources)}</figcaption></figure>`).join('')||'<p class="muted">עדיין לא פורסם צילום מפה מאומת לקו זה.</p>'}<p class="muted">לפי תכנון המכרז וגרסת המקור המקושרת.</p>`;
 routeDialog.showModal();
});

let ruleFields={};
fetch('fields-rules.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(r=>{ruleFields=r.tenders||{};renderFeed()}).catch(()=>{});
function combinedFields(id){
 const fields={...(structuredFields[id]||{})};
 const docs=[{fields:automaticSummaries[id]?.metadataFields||{}},...currentPackageDocuments(id,automaticSummaries),...currentPackageDocuments(id,semanticReviews)];
 for(const d of docs){for(const [key,f] of Object.entries(d.fields||{})){
  if(!isVerified(f))continue;
  const old=fields[key];
  if(!isVerified(old)){if(old?.status!=='conflict')fields[key]=f;continue;}
  if(JSON.stringify(old.value)!==JSON.stringify(f.value)&&old.status==='verified'&&f.status==='verified'){
   fields[key]={...old,status:'conflict',value:null,reason:'בגרסאות המסמכים מופיעים ערכים שונים. יש לבדוק את ההבהרות ואת תחולת השינוי.',sources:[...(old.sources||[]),...(f.sources||[])]};
  }
 }}
 // חוקים מסעיפי המסמך (fill_fields.py): רק לשדות שלא אומתו במסמך עצמו
 for(const [key,f] of Object.entries(ruleFields[id]||{})){if(!isVerified(fields[key])&&fields[key]?.status!=='conflict')fields[key]=f;}
 return fields;
}
