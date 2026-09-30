(function(root) {
  function tracker(metrics) {
    let last = null;
    const rad = Math.PI/180, scaleY=6371000*rad;
    const scaleX=scaleY*Math.cos((metrics.pts[0]?.[0] || 0)*rad);
    const xy=metrics.pts.map(p=>[p[1]*scaleX,p[0]*scaleY]);
    return {next(position, now=Date.now()) {
      const c=position.coords, stamp=position.timestamp;
      if(!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) ||
         !Number.isFinite(c.accuracy) || c.accuracy<0 || c.accuracy>50) return {status:'inaccurate'};
      if(!Number.isFinite(stamp) || now-stamp>15000 || stamp>now+5000 || (last && stamp<=last.stamp)) return {status:'stale'};
      const px=c.longitude*scaleX,py=c.latitude*scaleY,candidates=[];
      const dt=last ? Math.max(0,(stamp-last.stamp)/1000) : 0;
      for(let i=1;i<xy.length;i++) {
        const a=xy[i-1],b=xy[i],dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy;
        if(!len2) continue;
        const t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/len2));
        const distance=Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy);
        if(distance>60) continue;
        const along=metrics.cum[i-1]+t*(metrics.cum[i]-metrics.cum[i-1]);
        if(last && (along<last.along-25 || along>last.along+Math.min(600,40*dt+50))) continue;
        if(Number.isFinite(c.heading) && c.speed>2) {
          const bearing=(Math.atan2(dx,dy)/rad+360)%360;
          if(Math.abs((bearing-c.heading+540)%360-180)>75) continue;
        }
        candidates.push({along,distance});
      }
      candidates.sort((a,b)=>a.distance-b.distance);
      const best=candidates[0];
      if(!best) return {status:'offroute'};
      if(candidates.some(v=>Math.abs(v.along-best.along)>80 && v.distance<=best.distance+15)) return {status:'ambiguous'};
      const along=last ? Math.max(last.along,best.along) : best.along;
      last={along,stamp};
      return {status:'active',f:Math.min(1,along/metrics.total),accuracy:Math.round(c.accuracy)};
    }};
  }
  if(typeof module!=='undefined' && module.exports) module.exports={tracker};
  else root.RouteGPS={tracker};
})(typeof window==='undefined'?{}:window);
