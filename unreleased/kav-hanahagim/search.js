(function(root) {
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\u0591-\u05c7]/g, '').replace(/["'׳״’]/g, '').replace(/[-־/<>#(),.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const compare = new Intl.Collator('he', {numeric:true,sensitivity:'base'}).compare;
  function search(routes, query, mode='line') {
    const tokens=normalize(query).split(' ').filter(t=>t && t!=='קו');
    const numbers=tokens.filter(t=>/^\d/.test(t));
    const words=tokens.filter(t=>!/^\d/.test(t));
    const rows=routes.filter(r=>{
      const fields=mode==='line' ? [normalize(r.shortName)] : [normalize(r.makat),normalize(r.id)];
      const place=normalize([r.longName,r.desc].filter(Boolean).join(' '));
      return numbers.every(n=>fields.some(f=>f.startsWith(n))) && words.every(w=>place.includes(w));
    });
    const rank=r=>{
      if(!numbers.length)return 0;
      const fields=mode==='line'?[normalize(r.shortName)]:[normalize(r.makat),normalize(r.id)];
      return numbers.every(n=>fields.includes(n))?0:1;
    };
    return rows.sort((a,b)=>rank(a)-rank(b) || compare(mode==='line'?a.shortName:a.makat,mode==='line'?b.shortName:b.makat) || compare(a.longName||a.desc||'',b.longName||b.desc||'') || compare(String(a.id),String(b.id)));
  }
  if(typeof module!=='undefined' && module.exports)module.exports={search};
  else root.RouteSearch={search};
})(typeof window==='undefined'?{}:window);
