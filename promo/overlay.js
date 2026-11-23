// page-side helpers for the promo: caption overlay, tap ripple, camera lerp
(()=>{
const css=`
#pcap{position:fixed;left:50%;transform:translateX(-50%);z-index:100;pointer-events:none;width:470px;text-align:center;direction:rtl;font-family:Heebo,sans-serif;opacity:0}
#pcap .b{display:inline-block;background:rgba(15,23,42,.78);color:#fff;font-weight:700;font-size:27px;line-height:1.3;padding:12px 20px;border-radius:18px;box-shadow:0 6px 24px rgba(0,0,0,.25)}
#ptitle{position:fixed;inset:0;z-index:100;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;direction:rtl;font-family:Heebo,sans-serif;text-align:center;padding:0 34px}
#ptitle .t1{font-weight:800;font-size:52px;color:#fff;background:rgba(15,23,42,.8);padding:8px 26px 12px;border-radius:22px;opacity:0}
#ptitle .t2{font-weight:700;font-size:27px;line-height:1.35;color:#fff;background:rgba(15,23,42,.74);padding:12px 20px;border-radius:18px;opacity:0;max-width:470px}
#pend{position:fixed;inset:0;z-index:99;pointer-events:none;opacity:0;backdrop-filter:blur(7px);background:rgba(15,23,42,.62);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;direction:rtl;font-family:Heebo,sans-serif;color:#fff;text-align:center;padding:0 30px}
#pend .e1{font-weight:800;font-size:56px}
#pend .e2{font-weight:700;font-size:36px;line-height:1.35}
#pend .e3{font-weight:500;font-size:24px;opacity:.85;margin-top:30px}
.ptap{position:fixed;z-index:101;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #fff;background:rgba(255,255,255,.35);box-shadow:0 0 0 2px rgba(15,23,42,.35)}
`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
const mk=(id,html)=>{const d=document.createElement('div');d.id=id;d.innerHTML=html;document.body.appendChild(d);return d;};
const cap=mk('pcap','<span class="b"></span>');
const P=window.P={taps:[],
 cap(text,top,op){cap.querySelector('.b').textContent=text;cap.style.top=top+'px';cap.style.opacity=op;},
 hideCap(){cap.style.opacity=0;},
 title(t1,t2,o1,o2){let d=document.getElementById('ptitle')||mk('ptitle','<div class="t1"></div><div class="t2"></div>');d.style.display='flex';d.querySelector('.t1').textContent=t1;d.querySelector('.t2').textContent=t2;d.querySelector('.t1').style.opacity=o1;d.querySelector('.t2').style.opacity=o2;},
 hideTitle(){const d=document.getElementById('ptitle');if(d)d.style.display='none';},
 end(e1,e2,e3,o,o2){let d=document.getElementById('pend')||mk('pend','<div class="e1"></div><div class="e2"></div><div class="e3"></div>');d.querySelector('.e1').textContent=e1;d.querySelector('.e2').textContent=e2;d.querySelector('.e3').textContent=e3;d.style.opacity=o;d.querySelector('.e2').style.opacity=o2;d.querySelector('.e3').style.opacity=o2;},
 // tap ripple at x,y; age in frames
 tap(x,y){const d=document.createElement('div');d.className='ptap';d.style.left=x+'px';d.style.top=y+'px';document.body.appendChild(d);P.taps.push({d,age:0});},
 tickTaps(){for(const t of P.taps){t.age++;const k=t.age/14;t.d.style.transform=`scale(${0.6+0.7*Math.min(1,k)})`;t.d.style.opacity=Math.max(0,1-Math.max(0,k-0.3)/0.7);}
   P.taps=P.taps.filter(t=>{if(t.age>16){t.d.remove();return false;}return true;});},
 fit(pts,u,pitch,box){const G=window.__game,V=G.camera.position.constructor,c=G.camera.clone();c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix();
  const t=new V(0,0,0);pts.forEach(p=>t.add(new V(p[0],0,p[1])));t.multiplyScalar(1/pts.length);let dist=1500;const U=new V(u[0],0,u[1]).normalize();
  const place=()=>{c.position.copy(t).addScaledVector(U,dist*Math.cos(pitch)).setY(dist*Math.sin(pitch));c.lookAt(t);c.updateMatrixWorld();};
  const ground=(x,y)=>{const v=new V(x/innerWidth*2-1,1-y/innerHeight*2,0.5).unproject(c).sub(c.position).normalize();const k=-c.position.y/v.y;return c.position.clone().addScaledVector(v,k);};
  for(let it=0;it<40;it++){place();let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const p of pts){const v=new V(p[0],9,p[1]).project(c);const x=(v.x+1)/2*innerWidth,y=(1-v.y)/2*innerHeight;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
   const g1=ground((x0+x1)/2,(y0+y1)/2),g2=ground((box[0]+box[2])/2,(box[1]+box[3])/2);t.add(g1.sub(g2).setY(0).multiplyScalar(0.7));
   const sc=Math.max((x1-x0)/(box[2]-box[0]),(y1-y0)/(box[3]-box[1]));dist*=Math.min(1.3,Math.max(0.77,Math.pow(sc,0.6)));}
  place();return {p:c.position.toArray(),t:t.toArray(),dist};},
 cam(p,t){const G=window.__game;G.camera.position.set(p[0],p[1],p[2]);G.controls.target.set(t[0],t[1],t[2]);},
};
})();
