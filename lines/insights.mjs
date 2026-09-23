// Display calculations only. The legacy scoring functions remain authoritative.
export function passengerStats(rows) {
  const count=rows.reduce((n,r)=>n+r[5],0);
  return {count,avg:count?rows.reduce((n,r)=>n+r[3]*r[5],0)/count:null,peak:count?rows.reduce((n,r)=>n+r[4]*r[5],0)/count:null};
}
export function hourProfile(rows) {
  const hours=new Map();
  for(const r of rows){if(!/^\d{1,2}:\d{2}$/.test(r[1]))continue;const h=Number(r[1].split(':')[0]);if(h>26||r[5]<=0)continue;const x=hours.get(h)||{hour:h,count:0,riders:0,peak:0};x.count+=r[5];x.riders+=r[3]*r[5];x.peak+=r[4]*r[5];hours.set(h,x);}
  return [...hours.values()].sort((a,b)=>a.hour-b.hour).map(x=>({...x,avg:x.riders/x.count,peak:x.peak/x.count}));
}
export function annualExcess(g) {
  return g.avgCost>0&&g.costBenchmark>0&&g.avgCost>g.costBenchmark
    ?Math.round((g.avgCost-g.costBenchmark)*g.avgRiders*g.totalTrips*52):0;
}
export function routeName(s) {return String(s||'').replace(/-\d[\d#א-ת]?$/,'').replace(/<->/g,' ← ');}
export function scopeText(g) {return g.makats?.length>1?'המדד הזה משותף לקבוצת קווים: '+g.makats.join(', ')+'. הוא לא חושב בנפרד לקו שנבחר.':'';}
