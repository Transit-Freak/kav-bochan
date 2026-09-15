'use strict';
let reviewedRouteDetails={};
const routeDetailsReady=fetch('route-details.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(r=>{reviewedRouteDetails=r.tenders||{};renderFeed();}).catch(()=>{});
function routeTargetMatches(target,route){
 const number=String(route.number??route.key?.[1]??'');
 if(String(target.number)!==number)return false;
 const catalog=String(route.catalogNumber??route.key?.[0]??'');
 if(target.catalogNumber){if(String(target.catalogNumber)!==catalog)return false;}
 else if(target.area!==route.area)return false;
 if(target.direction&&String(target.direction)!==String(route.direction??route.key?.[2]??''))return false;
 if(target.variant&&String(target.variant)!==String(route.variant??route.key?.[3]??''))return false;
 return true;
}
function notesForRoute(id,route){
 const seed=reviewedRouteDetails[id];
 const initial=seed&&seed.baseDocumentSha256===documentReviews[id]?.document?.sha256?seed.notes||[]:[];
 const notes=[...initial,...currentPackageDocuments(id,semanticReviews).flatMap(d=>d.routeNotes||[])];
 return [...new Map(notes.filter(n=>n.targets.some(t=>routeTargetMatches(t,route))).map(n=>[JSON.stringify([n.text,n.sources]),n])).values()];
}
function renderRouteDetails(id,route){
 const notes=notesForRoute(id,route);
 if(!notes.length)return '<p class="muted">פירוט השינויים והאזכורים הנוספים של הקו במסמכים עדיין בבדיקה.</p>';
 return `<section class="route-details"><h3>פירוט המסלול והשינויים במסמכים</h3>${notes.map(n=>`<p><strong>${esc(n.title||'פרטי השירות')}:</strong> ${esc(n.text)}</p><p>${renderSources(n.sources)}</p>`).join('')}<p class="muted">לפי גרסאות המקור המקושרות. פירוט זה אינו מוכיח שכל האזכורים וההבהרות כבר נבדקו.</p></section>`;
}
