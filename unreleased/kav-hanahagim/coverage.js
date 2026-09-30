/* Uncertain route intervals are barriers: never announce a turn beyond one
   while approaching it, and never infer straight travel through one. */
(function(root){
 function intervals(segments,metrics,geom,stops){
  const rows=(Array.isArray(segments)?segments:[]).filter(s=>Number.isFinite(s.from)&&Number.isFinite(s.to)&&s.from>=0&&s.to<=1&&s.to>=s.from).map(s=>({...s}));
  // Reviewed raw GTFS shortcut, 2026-09-14. Match the actual source points,
  // not a line number, so an updated/corrected shape does not inherit the flag.
  const signature=[[31.24136,34.79669],[31.2417,34.79728],[31.24173,34.79731]];
  if(stops?.some(s=>String(s.code)==='15657')){
   const i=geom.findIndex((p,i)=>signature.every((q,j)=>geom[i+j]&&Math.abs(geom[i+j][0]-q[0])<.000001&&Math.abs(geom[i+j][1]-q[1])<.000001));
   if(i>=0)rows.push({from:Math.max(0,(metrics.cum[i]-30)/metrics.total),to:1,reason:'reviewed-gtfs-shortcut'});
  }
  rows.sort((a,b)=>a.from-b.from);
  const merged=[];
  for(const row of rows){const last=merged.at(-1);if(last&&row.from<=last.to){last.to=Math.max(last.to,row.to);}else merged.push(row);}
  return merged.map(s=>({...s,id:`${s.from}:${s.to}`}));
 }
 function state(segments,f,total,speed=0){
  const gap=segments.find(s=>s.to>=f);
  if(!gap)return {gap:null,blocked:false,active:false,segments};
  const active=f>=gap.from;
  return {gap,active,segments,blocked:active||(gap.from-f)*total<=Math.max(100,Math.max(0,speed)*10)+.01};
 }
 function visible(rows,coverage){
  if(coverage.blocked)return [];
  const valid=rows.filter(m=>!(coverage.segments||[]).some(s=>m.f>=s.from&&m.f<=s.to));
  return coverage.gap?valid.filter(m=>m.f<coverage.gap.from):valid;
 }
 function warning(coverage){return coverage.active?'במקטע הזה אין הוראות פנייה מאומתות':'במקטע הבא אין הוראות פנייה מאומתות';}
 const api={intervals,state,visible,warning};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RouteCoverage=api;
})(typeof window==='undefined'?{}:window);
