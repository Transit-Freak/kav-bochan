'use strict';
let routeIndex={},routeFiles={};
fetch('route-index.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(r=>{routeIndex=r.tenders||{};renderFeed()}).catch(()=>{});
function renderRouteAnnexes(t){
 const meta=routeIndex[t.id];
 return meta?`<p><button data-annex-tender="${esc(t.id)}">עיון בקווים ובתחנות מהנספחים (${meta.versions} קובצי מקור)</button></p>`:'';
}
function showAnnexList(id){
 const versions=routeFiles[id];
 routeDialog.innerHTML=`<form method="dialog"><button>סגירה ✕</button></form><h2 id="route-title">קווים ותחנות בנספחי המכרז</h2><p>כל קובץ מוצג בנפרד. טרם הוכרעה התאמת הגרסאות וההבהרות, ולכן אין לראות באיחוד הקבצים את התכנון המחייב.</p>${versions.map((v,vi)=>`<details><summary>קובץ ${vi+1} · ${v.routes.length} רשומות כיוון וחלופה</summary><p><a href="${esc(v.url)}" target="_blank" rel="noopener">פתיחת נספח המקור ↗</a></p><div class="routechips">${v.routes.map((r,ri)=>`<button data-annex-id="${esc(id)}" data-annex-version="${vi}" data-annex-route="${ri}">קו ${esc(r.key[1])} · כיוון ${esc(r.key[2])} · חלופה ${esc(r.key[3])}<br>${esc(r.area)}: ${esc(r.origin)} ← ${esc(r.destination)}</button>`).join('')}</div></details>`).join('')}`;
 if(!routeDialog.open)routeDialog.showModal();
}
function stopPlot(stops){
 const located=stops.filter(s=>Number.isFinite(s[3])&&Number.isFinite(s[4]));
 if(!located.length)return '<p>לא נמצאו קואורדינטות תחנות תקינות בנספח הזה.</p>';
 const longitudeScale=Math.cos(located.reduce((sum,s)=>sum+s[4],0)/located.length*Math.PI/180);
 const xs=located.map(s=>s[3]*longitudeScale),ys=located.map(s=>s[4]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const scale=Math.min(520/Math.max(maxX-minX,0.00001),300/Math.max(maxY-minY,0.00001));
 return `<h3>מיקומי התחנות מהנספח</h3><p>מוצגות ${located.length} מתוך ${stops.length} תחנות. הנקודות אינן תוואי הנסיעה בכבישים.</p><svg viewBox="0 0 600 370" role="img" aria-label="מיקומי התחנות לפי הקואורדינטות בנספח" style="width:100%;background:#eef5f6;border-radius:12px"><text x="560" y="24" font-size="14">צפון ↑</text>${located.map((s,i)=>`<g><title>${esc(s[0])}. ${esc(s[2])}</title><circle cx="${40+(xs[i]-minX)*scale}" cy="${335-(ys[i]-minY)*scale}" r="5" fill="#126977"/><text x="${48+(xs[i]-minX)*scale}" y="${330-(ys[i]-minY)*scale}" font-size="10">${esc(s[0])}</text></g>`).join('')}</svg>`;
}
document.addEventListener('click',async event=>{
 const loadButton=event.target.closest('[data-annex-tender]');
 if(loadButton){
  const id=loadButton.dataset.annexTender;loadButton.disabled=true;
  try{
   if(!routeFiles[id]){const meta=routeIndex[id];routeFiles[id]=(await Promise.all((meta.files||[meta.file]).map(async file=>{const response=await fetch(file);if(!response.ok)throw new Error();return response.json();}))).flat();}
   showAnnexList(id);
  }catch{loadButton.textContent='הטעינה נכשלה. לחצו לניסיון חוזר';}
  finally{loadButton.disabled=false;}return;
 }
 const back=event.target.closest('[data-annex-back]');if(back){showAnnexList(back.dataset.annexBack);return;}
 const button=event.target.closest('[data-annex-route]');if(!button)return;
 const id=button.dataset.annexId,v=routeFiles[id]?.[Number(button.dataset.annexVersion)],r=v?.routes[Number(button.dataset.annexRoute)];if(!r)return;
 routeDialog.innerHTML=`<form method="dialog"><button>סגירה ✕</button></form><button data-annex-back="${esc(id)}">חזרה לקווים</button><h2 id="route-title">קו ${esc(r.key[1])} · כיוון ${esc(r.key[2])} · חלופה ${esc(r.key[3])}</h2><p>${esc(r.area)} · ${esc(r.origin)} ← ${esc(r.destinationArea)} · ${esc(r.destination)}</p><p>מק״ט ${esc(r.key[0])} · גיליון ${esc(r.sheet)}, שורה ${r.row}</p><p>${esc(v.scope)}</p><a href="${esc(v.url)}" target="_blank" rel="noopener">נספח המקור ↗</a>${stopPlot(r.stops)}<h3>תחנות לפי הסדר בנספח</h3><ul>${r.stops.map(s=>`<li>${esc(s[0])}. ${esc(s[2])} · מק״ט ${esc(s[1])}<small> · גיליון ${esc(s[6])}, שורה ${s[5]}</small></li>`).join('')||'<li>רשימת התחנות לא חולצה בקובץ הזה.</li>'}</ul>`;
});
