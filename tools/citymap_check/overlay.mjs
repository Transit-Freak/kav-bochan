// צילומי בדיקה למפות הרשת (Playwright).
// שימוש: node overlay.mjs <תיקיית הפלט של compare.py> <עיר> <רמה> <תיקיית צילומים> <קידומת> <מצב>...
//   מצבים: full (המפה כולה) | phone (הדף ברוחב 390) | מספר קו (הלבשת המסלול האמיתי על הקו)
// בהלבשה: צבע הקו = מה שהמפה מציירת; שחור מקווקו = המסלול האמיתי מ-shapes.txt;
// אדום מנוקד = הכיוון הנגדי; נקודה ירוקה/אדומה = תחנה שנמצאת/לא נמצאת על הקו המצויר בסדר הנכון.
import {createRequire} from 'module';import fs from 'fs';import {execSync} from 'child_process';
const {chromium}=createRequire(execSync('npm root -g').toString().trim()+'/')('playwright');
const [dir,city,tier,shots,pre,...modes]=process.argv.slice(2);
const url='file://'+dir+'/'+encodeURIComponent(city)+'.'+tier+'.html';
const ov=JSON.parse(fs.readFileSync(dir+'/'+city+'.'+tier+'.overlay.json'));
const b=await chromium.launch();
for(const m of modes){
  if(m==='phone'){
    const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true});
    await p.goto(url); await p.screenshot({path:`${shots}/${pre}-phone.png`}); await p.close(); continue;
  }
  const p=await b.newPage({viewport:{width:2000,height:1000},deviceScaleFactor:m==='full'?1:2});
  await p.goto(url);
  const grp=m==='full'?null:Object.keys(ov).find(k=>ov[k].num===m);
  if(m!=='full'&&!grp){console.log('אין קו',m);await p.close();continue}
  const bb=await p.evaluate(([grp,o])=>{
    if(grp) document.querySelector('.chip[data-l="'+grp+'"]').click();
    const s=document.querySelector('.main svg');document.body.appendChild(s);document.querySelector('.wrap').remove();
    s.style.margin='0';document.body.style.direction='ltr';document.body.style.background='#fff';
    if(!grp) return null;
    const NS='http://www.w3.org/2000/svg';
    const pl=(pts,st)=>{if(!pts.length)return;const e=document.createElementNS(NS,'polyline');e.setAttribute('points',pts.map(q=>q.join(',')).join(' '));e.setAttribute('fill','none');e.setAttribute('style',st);s.appendChild(e)};
    pl(o.opp,'stroke:#e11d48;stroke-width:1.4;stroke-dasharray:2 3;opacity:.9');
    pl(o.real,'stroke:#000;stroke-width:1.6;stroke-dasharray:6 3');
    o.stops.forEach(([x,y,ok],i)=>{const c=document.createElementNS(NS,'circle');c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',i==0?4:2.4);c.setAttribute('fill',ok?'#16a34a':'#dc2626');c.setAttribute('stroke','#fff');c.setAttribute('stroke-width',.6);s.appendChild(c)});
    const all=o.real.concat(o.opp),xs=all.map(q=>q[0]),ys=all.map(q=>q[1]);
    let x0=Math.min(...xs),y0=Math.min(...ys),x1=Math.max(...xs),y1=Math.max(...ys);
    document.querySelectorAll('.ln-'+CSS.escape(grp)).forEach(e=>{const r=e.getBBox();x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.width);y1=Math.max(y1,r.y+r.height)});
    return [x0-30,y0-30,x1+30,y1+30];
  },[grp,grp?ov[grp]:null]);
  const sv=await p.locator('svg').first().boundingBox();
  if(!bb) await p.locator('svg').first().screenshot({path:`${shots}/${pre}-full.png`});
  else{const x=Math.max(0,bb[0]),y=Math.max(0,bb[1]);
    await p.screenshot({path:`${shots}/${pre}-line-${m}.png`,fullPage:true,clip:{x,y,width:Math.min(sv.width,bb[2])-x,height:Math.min(sv.height,bb[3])-y}});}
  await p.close();
}
await b.close();
