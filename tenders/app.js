'use strict';
let documentReviews={};
let governmentItems=[],archiveItems=[],portalItems=[],feedExpanded=false,fieldCatalog={},structuredFields={},fieldsState='loading';
const busPdf='https://www.golan.org.il/uploads/n/bid_72.pdf';
const taxiPage='https://mr.gov.il/ilgstorefront/he/p/632739';
const taxiPdf='https://mr.gov.il/ilgstorefront/he/p/attachment/005056BF19AF1EDA95F0BDA1D1212121/%D7%9E%D7%A1%D7%9E%D7%9B%D7%99%20%D7%94%D7%9C%D7%99%D7%9A';
const tenders=[
{id:'golan',type:'bus',number:'30/2024',title:'שירותי אוטובוסים באשכול הגולן',publisher:'מועצה אזורית גולן',status:'ארכיון · מסמך 2024',area:'גולן, קצרין, טבריה, קריית שמונה',date:'נובמבר 2024',deadline:'טרם אומת',winner:'טרם אומת',source:busPdf,description:'מכרז קבלנות משנה של המועצה. לפי המסמך, כ־65% מהפעילות יימסרו לקבלן, לפי בחירת המועצה.',routes:[],routeNote:'רשימת הקווים נמצאת בעמודים 50–56 במסמך. חילוץ הרשימה המלאה ואימות החלופות עדיין לא הושלמו, ולכן לא מוצגים כאן מספרי קווים חלקיים כאילו הם הרשימה המלאה.',routePage:50,conditions:[['תאגיד רשום בישראל; לפחות 40 אוטובוסים בעלי 51 מושבים ומעלה.',8],['מפעיל תחבורה ציבורית מורשה, או ניסיון מתאים בהסעות מיוחדות בהתאם לסעיף 4.',8],['מחזור הסעות של לפחות 30 מיליון ₪ בשנת 2023 והון עצמי של לפחות 6 מיליון ₪.',8],['לפחות 40 נהגים מועסקים בעלי רישיון D ואזרחות ישראלית.',8],['ניקוד: 80% מחיר ו־20% איכות. סף איכות: 10 נקודות.',88]],events:[['נובמבר 2024','מסמך המכרז',busPdf],['1.9.2025','מועד תחילת השירות המאוחר שנקבע במסמך; ביצוע בפועל לא אומת.',busPdf+'#page=4']]},
{id:'taxi',type:'taxi',number:'06/2019',title:'מוניות שירות: תל אביב מזרח, רמת גן וגבעתיים',publisher:'משרד התחבורה',status:'סגור · ארכיון 2019',area:'תל אביב, רמת גן, גבעתיים',date:'8.4.2019',deadline:'2.5.2019 · 12:00',winner:'טרם אומת',source:taxiPdf,description:'הליך לקבלת רישיונות להפעלת ארבעה קווי מוניות שירות, בהמשך למיון המוקדם 08/2018.',routes:[],routeNote:'המסמך מציין ארבעה קווים, אך מפנה לנספחי קווים במדיה נפרדת. פירוט המסלולים לא אותר בקובץ הנגיש. זהו פער במידע, ולא אישור שאין קווים.',routePage:6,conditions:[['השתתפות בכפוף לזכאות במיון המוקדם ולהגבלות ההליך.',14],['אישורים והצהרות על המשך עמידה בתנאי המיון, מבנה הבעלות וניהול ספרים.',14],['ערבות הצעה: 50,000 ₪.',54],['ערבות ביצוע: 225,000 ₪.',56]],events:[['8.4.2019','פרסום מסמכי ההליך',taxiPage],['14.4.2019','מסמך נוסף מצורף בפורטל; תוכנו טרם אומת.',taxiPage],['5.5.2019','תאריך העדכון המוצג בפורטל',taxiPage]]}
];
tenders[0].routes=[["10", [54]], ["11", [53, 54, 56]], ["12", [53, 54, 56]], ["13", [53, 54, 56]], ["14", [53, 54, 56]], ["15", [53, 54, 56]], ["16", [53, 54, 56]], ["17", [53, 54, 56]], ["18", [54]], ["19", [53, 54, 56]], ["21", [54]], ["24", [53, 54, 56]], ["37", [53, 54, 56]], ["41", [53, 54, 56]], ["43", [53, 54, 56]], ["44", [53, 54, 56]], ["51", [53, 54, 56]], ["52", [53, 54, 56]], ["53", [53, 54, 56]], ["54", [53, 54, 56]], ["55", [54]], ["57", [53, 54, 56]], ["58", [53, 55, 56]], ["59", [53, 55, 56]], ["68", [52, 55]], ["69", [52, 53, 55, 56]], ["71", [52]], ["72", [52]], ["73", [52]], ["74", [52]], ["76", [52]], ["77", [52]], ["79", [52]], ["80", [52]], ["81", [52]], ["82", [52]], ["83", [52]], ["84", [52]], ["85", [52]], ["86", [52]], ["88", [52]], ["89", [52]], ["92", [52]], ["94", [52]], ["95", [52]], ["97", [52, 53, 55, 56]], ["103", [52]], ["111", [52, 55]], ["142", [52, 55]], ["143", [52, 53, 55, 56]], ["147", [52, 55]], ["151", [52, 53, 55, 56]], ["159", [52, 55]], ["258", [52, 53, 55, 56]], ["358", [52, 53, 55, 56]], ["558", [52, 53, 55, 56]]];
tenders[0].routeNote="חולצו 56 מספרי קווים מטבלאות הנספח. הכיוונים, החלופות וימי השירות מפורטים במקור. זו רשימת האשכול, ורק חלק מהפעילות מיועד לקבלן. פירוט המסלולים עדיין בבדיקה.";
let filter='all',selected='golan',tab='routes';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function matches(){const tokens=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);return tenders.filter(t=>(filter==='all'||t.type===filter)&&tokens.every(q=>[t.title,t.number,t.area,...t.routes.map(r=>r[0])].join(' ').toLowerCase().includes(q)));}
function render(){const list=matches();if(!list.some(t=>t.id===selected))selected=list[0]?.id; $('count').textContent=`${list.length} מכרזים · מידע שנבדק חלקית`;$('results').innerHTML=list.map(t=>`<button class="card ${selected===t.id?'selected':''}" data-id="${t.id}" aria-pressed="${selected===t.id}"><span class="tag">${t.type==='bus'?'אוטובוסים':'מוניות שירות'}</span><strong>${esc(t.title)}</strong><small>מכרז <bdi>${t.number}</bdi> · ${esc(t.status)}</small></button>`).join('')||'<p class="empty">לא נמצאו מכרזים מתאימים. אפשר לשנות את החיפוש או לנקות את הסינון.</p>';
 document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{selected=b.dataset.id;tab='routes';render()});document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));renderDetail();renderFeed();}
function renderDetail(){const t=tenders.find(t=>t.id===selected);if(!t){$('detail').innerHTML='<h2>אין תוצאות להצגה</h2><p>גרסת הניסיון כוללת שני מכרזים בלבד. רשימות הקווים טרם הושלמו.</p>';return;}
 let content='';if(tab==='routes')content=`<h3>הקווים במכרז</h3><p class="warning">${esc(t.routeNote)}</p><a class="external" target="_blank" rel="noopener" href="${t.source}#page=${t.routePage}">פתיחת המקור בעמוד ${t.routePage} ↗</a>`;
 if(tab==='routes'&&t.routes.length)content+=`<div class="routechips">${t.routes.map(([n,p])=>`<button class="routechip" data-route="${n}" aria-haspopup="dialog" aria-label="פתיחת פרטי קו ${n}">${n}</button>`).join('')}</div><p class="muted">לחיצה על מספר קו פותחת את פרטיו כאן באתר.</p>`;
 if(tab==='conditions')content=`<h3>תנאים עיקריים שנבדקו</h3><p class="muted">סיכום חלקי. יש לבדוק את מלוא התנאים ומסמכי ההבהרות לפני הסתמכות.</p><ul>${t.conditions.map(([s,p])=>`<li>${esc(s)} <a href="${t.source}#page=${p}" target="_blank" rel="noopener">עמ׳ ${p}</a></li>`).join('')}</ul>`;
 if(tab==='sources')content=`<h3>פרסומים ומסמכי מקור</h3>${t.events.map(([d,s,u])=>`<div class="sourceitem"><bdi>${d}</bdi><p>${esc(s)}</p><a href="${u}" target="_blank" rel="noopener">למקור הרשמי ↗</a></div>`).join('')}<p class="muted">סיכום זה נבדק חלקית ב־15.9.2026. זמן סריקת הפורטל האחרונה מופיע ברשימת הפרסומים; סריקה חדשה אינה מעידה שכל המסמכים והתנאים נבדקו מחדש.</p>`;
 $('detail').innerHTML=`<span class="tag">${esc(t.status)}</span><h2>${esc(t.title)}</h2><p class="muted">${esc(t.publisher)} · מכרז <bdi>${t.number}</bdi></p><p>${esc(t.description)}</p><div class="facts"><div><span>פרסום המסמך</span><bdi>${t.date}</bdi></div><div><span>מועד הגשה</span><bdi>${t.deadline}</bdi></div><div><span>זוכה</span><b>${t.winner}</b></div><div><span>שלמות הסיכום</span><b>חלקית · נספחי קווים בבדיקה</b></div></div><nav class="tabs" aria-label="פרטי המכרז">${[['routes','קווים'],['conditions','תנאים עיקריים'],['sources','עדכונים ומקורות']].map(([id,title])=>`<button data-tab="${id}" aria-pressed="${tab===id}">${title}</button>`).join('')}</nav>${content}`;document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderDetail()});}
$('search').addEventListener('input',render);$('reset').onclick=()=>{$('search').value='';filter='all';render();$('search').focus()};document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});render();
if(document.modelContext?.registerTool){
 try{Promise.resolve(document.modelContext.registerTool({name:'search_tenders',description:'Filter the visible tender list by query and transport type. This changes the displayed search.',inputSchema:{type:'object',properties:{query:{type:'string'},type:{enum:['all','bus','taxi']}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||typeof input.query!=='string'||(input.type&&!['all','bus','taxi'].includes(input.type)))throw new Error('Invalid search');$('search').value=input.query;filter=input.type||'all';render();return matches().map(t=>({id:t.id,title:t.title,number:t.number,coverage:'partial'}));}})).catch(()=>{});}catch{}
}
fetch('access-check.json').then(r=>{if(!r.ok)throw new Error('audit unavailable');return r.json()}).then(r=>{$('audit-summary').textContent=`בדיקת חיפוש מוניות: ${r.uniqueRecords} רשומות ייחודיות מתוך ${r.pages[0].total} בתוצאות הפורטל. ${r.allPagesValidated&&r.matchesPortalTotal?'כל עמודי החיפוש נקראו.':'האיסוף חלקי; חלק מהבקשות נכשלו.'} החיפוש כולל גם תוצאות שאינן מכרזי קווי שירות.`}).catch(()=>{$('audit-summary').textContent='דוח הבדיקה אינו זמין כרגע.'});
function renderFeed(){const host=$('live-results');if(!host)return;const tokens=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);const all=portalItems.filter(t=>(filter==='all'||t.type===filter)&&tokens.every(q=>[t.title,t.number,t.id].join(' ').toLowerCase().includes(q)));const visible=feedExpanded?all:all.slice(0,6);host.innerHTML=visible.map(t=>`<div class="feedrow"><div><span class="tag">${t.classification==='operating_tender'?'מכרז הפעלה · סיכום טרם הושלם':'פרסום קשור · דורש מיון'}</span><h3><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)} ↗</a></h3><p class="muted">מס׳ הליך: <bdi>${esc(t.number||'לא זוהה')}</bdi> · סטטוס במקור: ${esc(t.status||'לא זוהה')}</p>${t.discoveryNote?`<details class="discovery-note"><summary>מצב בדיקת המקור</summary><p>${esc(t.discoveryNote)}</p></details>`:''}${renderFields(t)}${renderDocumentReview(t)}</div><div class="feeddate"><span>עדכון במקור</span><bdi>${esc(t.updated||'לא זוהה')}</bdi><small>הגשה: <bdi>${esc(t.deadline||'לא זוהה')}</bdi></small></div></div>`).join('')||'<p>אין פרסומים המתאימים לחיפוש במידע שנטען.</p>';$('feed-more').hidden=all.length<=6;$('feed-more').textContent=feedExpanded?'הצגת פחות':`הצגת כל ${all.length} התוצאות`;}
$('feed-more').onclick=()=>{feedExpanded=!feedExpanded;renderFeed()};
fetch('tenders-feed.json').then(r=>{if(!r.ok)throw new Error('feed unavailable');return r.json()}).then(r=>{governmentItems=r.items;combineFeeds();$('feed-status').textContent=`${r.items.length} פרסומים שנאספו. בדיקה אחרונה: ${new Date(r.checkedAt).toLocaleString('he-IL')}. החיפוש מכסה את מפרסם משרד התחבורה ואת המונח ״קווי״; אין עדיין כיסוי מלא לכל ניסוח ומפרסם.`;renderFeed()}).catch(()=>{$('feed-status').textContent='לא ניתן לטעון את רשימת הפרסומים כרגע. סיכומי הדוגמה זמינים בהמשך.'});
fetch('automation-config.json').then(r=>r.json()).then(r=>{$('schedule-status').textContent=r.enabled?'הוגדרה בדיקה מדי שעה דרך המשימות המתוזמנות בחשבון. זמן הופעת העדכון תלוי גם בזמינות המקור ובהצלחת הפרסום.':'עדכון מתוזמן עדיין לא הופעל.'}).catch(()=>{$('schedule-status').textContent='סטטוס התזמון אינו זמין.'});
function isVerified(f){return ['verified','verified_conditional'].includes(f?.status);}
function renderSources(sources){
 return (sources||[]).filter(s=>/^https:\/\//.test(s.url||'')).map(s=>`<a target="_blank" rel="noopener" href="${esc(s.url)}">${esc(s.locator)}</a>`).join(' · ');
}
function renderVerifiedField(key,f){
 const value=f.status==='verified_conditional'?`<dl class="condition-list">${f.conditions.map(c=>`<div><dt>${esc(c.label)}</dt><dd>${c.comparison==='lt'?'פחות מ־':c.comparison==='lte'?'עד ':''}${formatFieldValue(c)}</dd></div>`).join('')}</dl>`:`<p class="field-value">${formatFieldValue(f)}</p>`;
 const sources=f.status==='verified_conditional'?f.conditions.flatMap(c=>c.sources||[]):f.sources||[];
 const unique=[...new Map(sources.map(source=>[source.url,source])).values()];
 return `<section class="verified-field" data-field="${esc(key)}"><h4>${esc(f.label||fieldCatalog[key].label)}</h4>${value}<details class="source-details"><summary>מקור והסבר</summary>${f.notes?`<p>${esc(f.notes)}</p>`:''}<p>${renderSources(unique)}</p></details></section>`;
}
function renderFields(t){
 if(fieldsState==='loading')return '<p class="muted" role="status">טוען פרטים…</p>';
 if(fieldsState==='error'||!Object.keys(fieldCatalog).length)return '<p role="status">טעינת התנאים נכשלה. <button data-retry-fields>ניסיון חוזר</button></p>';
 const fields=structuredFields[t.id]||{},all=Object.entries(fieldCatalog).map(([k,d])=>[k,fields[k]||d]);
 const verified=all.filter(([,f])=>isVerified(f)),pending=all.filter(([,f])=>!isVerified(f));
 const labels={unverified:'ממתין לבדיקה',source_missing:'חסר מקור',unrecognized_wording:'נדרש פענוח נוסף',conflict:'נמצאה סתירה',not_applicable:'לא חל'};
 return `<details class="fielddetails tender-conditions"><summary>${verified.length?`תנאים ופרטים · ${verified.length} אומתו`:'התנאים ממתינים לפענוח'}</summary>${verified.length?`<p class="muted">אומת מול גרסת המקור המקושרת. הבהרות ותוצאות זכייה עשויות להיות חסרות.</p><div class="verified-grid">${verified.map(([k,f])=>renderVerifiedField(k,f)).join('')}</div>`:''}<details class="pending-fields"><summary>מה עדיין חסר? ${pending.length} שדות</summary>${pending.map(([k,f])=>`<div class="pending-row"><strong>${esc(f.label||fieldCatalog[k].label)}</strong><span>${labels[f.status]||'ממתין לבדיקה'}</span>${f.reason?`<p>${esc(f.reason)}</p>`:''}</div>`).join('')}</details></details>`;
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
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-route]');if(!button)return;
 const tender=tenders.find(t=>t.id===selected),route=tender?.routes.find(([n])=>n===button.dataset.route);if(!route)return;
 const [number,pages]=route;
 routeDialog.innerHTML=`<form method="dialog"><button aria-label="סגירת פרטי הקו">סגירה ✕</button></form><h2 id="route-title">קו ${esc(number)}</h2><p>${esc(tender.title)} · מכרז ${esc(tender.number)}</p><p>מספר הקו מופיע בנספח המכרז בעמודים ${pages.join(', ')}.</p><p class="warning">נקודות המוצא והיעד, התחנות וחלופות המסלול עדיין לא פוענחו. מספר הקו לבדו אינו מזהה מסלול, ולכן עדיין לא מוצגת מפה.</p><h3>מסמך המקור</h3><p>${pages.map(page=>`<a href="${tender.source}#page=${page}" target="_blank" rel="noopener">עמוד ${page} ↗</a>`).join(' · ')}</p>`;
 routeDialog.showModal();
});

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
 archiveStatus.textContent=`ארכיון משרד התחבורה: ${r.items.length} פרסומים נוספים. ${r.lastRun?.ok?'עמוד הארכיון נקרא; סיווג המסמכים ופענוחם עדיין חלקיים.':'הסריקה הישירה לא הושלמה; הפרסומים שכבר אותרו נשמרו. ייתכנו מכרזים חסרים.'}`;
 combineFeeds();
}).catch(()=>{archiveStatus.textContent='לא ניתן לטעון את פרסומי הארכיון. רשימת הפורטל נשארת זמינה.';});

function formatFieldValue(f){
 const unitLabels={years:'שנים',months:'חודשים',days:'ימים',per_km:'לק״מ'};
 let value=Array.isArray(f.value)?f.value.join(', '):typeof f.value==='number'?f.value.toLocaleString('he-IL'):f.value;
 if(f.kind==='percent')value+=' %';
 if(f.kind==='points')value+=' נקודות';
 if(f.currency)value+=' '+(f.currency==='ILS'?'₪':f.currency);
 if(f.unit)value+=' · '+(unitLabels[f.unit]||f.unit);
 if(f.period)value+=' · '+f.period;
 if(f.vat)value+=' · מע״מ: '+f.vat;
 return esc(value);
}
function reviewSource(review,page){return `<a target="_blank" rel="noopener" href="${esc(review.document.url)}#page=${page}">עמוד PDF ${page} ↗</a>`;}
function renderDocumentReview(t){
 const r=documentReviews[t.id];if(!r)return '';
 return `<details class="fielddetails review-details"><summary>קווים ותיאור השירות</summary><p class="warning">${esc(r.coverage)}</p>${r.sections.filter(section=>!['הפעלה ותקופת בסיס','אפשרויות הארכה','גיל הרכב'].includes(section.title)).map(section=>`<h4>${esc(section.title)}</h4><p>${esc(section.text)}</p><p>${[section.page,...(section.alsoPages||[])].map(page=>reviewSource(r,page)).join(' · ')}</p>`).join('')}<h4>קווים בתכנון המכרז</h4><p class="muted">${esc(r.routesCoverage)}</p><div class="routechips">${r.routes.map((route,i)=>`<button data-reviewed-tender="${esc(t.id)}" data-reviewed-route="${i}" aria-haspopup="dialog">${esc(route.number)} · ${esc(route.area)}</button>`).join('')}</div><h4>פערים שנותרו</h4><ul>${r.gaps.map(gap=>`<li>${esc(gap)}</li>`).join('')}</ul></details>`;
}
fetch('document-reviews.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Review unavailable');return r.json()}).then(r=>{documentReviews=r;renderFeed()}).catch(()=>{});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-reviewed-route]');if(!button)return;
 const review=documentReviews[button.dataset.reviewedTender],route=review?.routes[Number(button.dataset.reviewedRoute)];if(!route)return;
 routeDialog.innerHTML=`<form method="dialog"><button>סגירה ✕</button></form><h2 id="route-title">קו ${esc(route.number)} · ${esc(route.area)}</h2><p>${esc(route.description)}</p><p class="warning">תכנון לפי מכרז 2014; אינו מסלול נוכחי. תחנות, כיוונים וחלופות טרם אומתו.</p>${reviewSource(review,route.page)}`;
 routeDialog.showModal();
});
