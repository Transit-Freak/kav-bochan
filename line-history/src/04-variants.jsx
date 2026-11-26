/* הקו בזמן · 04-variants.jsx — החלופות של קו: תיאור החלופה (describeVariant), בוחר החלופות והשוואת חלופות.
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

/* ---------- עמוד קו ---------- */
/* ---------- Compact alternative selector ---------- */
// Base is the Ministry's #, never a locally invented regular-route default.
const variantPart = s => String(s.rd).split('-').slice(2).join('-');
const variantDirection = s => String(s.rd).split('-')[1] || '';
function variantSnapshot(lf, date, historical) {
  const vs = (lf?.versions || []).filter(v => v.stops?.length && !v.syn && v.k !== 'planned-dropped' && (!date || v.d <= date));
  const v = vs[vs.length - 1];
  return historical && date && v?.d !== date ? null : v;
}
function variantOrientation(a, b) {
  if (!a?.length || !b?.length) return 0;
  const positions = new Map(b.map((s,i)=>[String(s[0]),i]));
  const common = a.map(s=>positions.get(String(s[0]))).filter(i=>i!=null);
  if (common.length >= 2 && common[0] !== common[common.length-1]) return common[0] < common[common.length-1] ? 1 : -1;
  const dist=(p,q)=>Math.hypot((p[2]-q[2])*111320,(p[3]-q[3])*94000);
  const direct=dist(a[0],b[0])+dist(a[a.length-1],b[b.length-1]);
  const reverse=dist(a[0],b[b.length-1])+dist(a[a.length-1],b[0]);
  return Math.abs(direct-reverse)<100 ? 0 : direct<reverse ? 1 : -1;
}
// Actual departures over the same seven dates, respecting calendar validity.
function variantFrequency(patterns, date) {
  if (!Array.isArray(patterns) || !date) return null;
  const week=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  let total=0;
  for(let day=0;day<7;day++) {
    const dt=new Date(date+'T00:00:00Z');dt.setUTCDate(dt.getUTCDate()+day);
    const key=dt.toISOString().slice(0,10).replace(/-/g,'');
    for(const p of patterns) for(const s of p.services || []) {
      const c=s.calendar || {};
      let active=key>=String(c.start_date).replace(/-/g,'') && key<=String(c.end_date).replace(/-/g,'') && String(c[week[dt.getUTCDay()]])==='1';
      for(const ex of s.exceptions || []) if(String(ex.date).replace(/-/g,'')===key) active=String(ex.exception_type)==='1';
      if(active) total+=(s.departures || []).length;
    }
  }
  return total;
}
function variantBase(item, items, historical) {
  // החלופות עוד נטענות (הרשימה כבר מוצגת מהתיאורים המוכנים) — אין עדיין מול מה להשוות
  if(!Array.isArray(items)) return null;
  if(!historical) {
    const dir=items.filter(x=>variantDirection(x)===variantDirection(item));
    const hash=dir.find(x=>variantPart(x)==='#');
    if(hash) return hash;
    // בלי חלופה # (קו 241 ועוד ~7,000 חלופות): הראשית = הפעילה עם הכי הרבה נסיעות ביום;
    // אם לאף אחת אין נסיעות — הפעילה הראשונה; אם כולן בוטלו — האחרונה שפעלה (שלמה 26.09)
    const act=dir.filter(x=>x.lk!=='removed');
    const byTrips=act.filter(x=>(x.ntr||0)>0).sort((a,b)=>b.ntr-a.ntr||a.rd.localeCompare(b.rd))[0];
    if(byTrips) return byTrips;
    if(act.length) return act.slice().sort((a,b)=>a.rd.localeCompare(b.rd))[0];
    return dir.slice().sort((a,b)=>(b.ld||'').localeCompare(a.ld||'')||a.rd.localeCompare(b.rd))[0]||null;
  }
  const same=items.filter(x=>x.rd===item.rd || variantOrientation(item.snapshot?.stops,x.snapshot?.stops)===1);
  // A missing timetable must not silently make another alternative the main one.
  if(same.some(x=>x.frequency==null)) return null;
  return same.filter(x=>x.frequency>0).sort((a,b)=>b.frequency-a.frequency || a.rd.localeCompare(b.rd))[0] || null;
}
function variantRingContains(x,y,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function variantBoundaryDistance(x,y,poly) {
  const sx=111320*Math.cos(y*Math.PI/180),sy=111320;let best=Infinity;
  for(const ring of poly) for(let i=0;i<ring.length-1;i++) {
    const a=[(ring[i][0]-x)*sx,(ring[i][1]-y)*sy],b=[(ring[i+1][0]-x)*sx,(ring[i+1][1]-y)*sy];
    const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
    const t=den ? Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/den)) : 0;
    best=Math.min(best,Math.hypot(a[0]+t*dx,a[1]+t*dy));
  }
  return best;
}
function variantNeighborhood(stop, areas) {
  const x=+stop[3],y=+stop[2];if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  let best=null;
  for(const row of areas || []) {
    const b=row[3];if(x<b[0]||x>b[2]||y<b[1]||y>b[3])continue;
    for(const poly of row[4]) if(variantRingContains(x,y,poly[0]) && !poly.slice(1).some(r=>variantRingContains(x,y,r))) {
      const distance=variantBoundaryDistance(x,y,poly);
      if(!best||distance>best.distance)best={id:row[0],name:row[1],city:row[2],distance,interior:distance>50};
    }
  }
  return best;
}
function variantStreet(stop) {
  // קודם הכתובת של התחנה ב-GTFS (data/stop-streets.json, נבנה כל לילה), ורק בלעדיה — שם התחנה
  const addr=typeof STOP_STREETS!=='undefined'&&STOP_STREETS&&STOP_STREETS[String(stop?.[0])];
  if(addr)return addr;
  const parts=String(stop?.[1]||'').split('/').map(x=>x.trim()).filter(Boolean);
  const landmark=/^(ת\.|תחנה מרכזית|ת"מ|קניון|שער|קיבוץ|מושב|מוזיאון|מחצבת|בסיס|מחנה|חניון|כניסה|מתחם|תחנת|מכללת|מכללה|פארק|אוניברסיטת|בית חולים|בי"ח|ביה|בית |קניון|תחנת |ת\.רכבת|רכבת|מסוף|מרכז |מכון |קמפוס|הפקולטה|האוניברסיטה|מחלף|צומת|מרינה|מגרש|אזור תעשייה)/;
  const notStreet=/^(רציפים?|הורדה|הורדת נוסעים|עלי?יה|יציאה|כניסה|לצפון|לדרום|למזרח|למערב|בינעירוני|עירוני)$/;
  const candidate=parts.find(p=>!landmark.test(p)&&!notStreet.test(p));
  if(candidate&&/^[\d/]+$/.test(candidate))return 'כביש '+candidate;
  return candidate || '';
}
const VARIANT_RC=new Set(['שדות נגב','שער הנגב','נחל שורק','מטה בנימין','חבל מודיעין','מטה יהודה','עמק יזרעאל','גזר','דרום השרון','חוף הכרמל','מבואות החרמון','גליל עליון','הגליל העליון','הגליל התחתון','אשכול','מרחבים','בני שמעון','תמר','רמת נגב','הערבה התיכונה','אבו בסמה','לב השרון','עמק חפר','מנשה','מגידו','גלבוע','הגלבוע','עמק המעיינות','עמק הירדן','משגב','מרום הגליל','מטה אשר','זבולון','חבל יבנה','ברנר','באר טוביה','יואב','לכיש','שפיר','חוף אשקלון','גולן','שומרון','גוש עציון','הר חברון','מגילות ים המלח','ערבות הירדן','בקעת הירדן','חבל אילות','אל-קסום','אל קסום','נווה מדבר','מעלה יוסף']);
function describeVariant(item, base, areas) {
  const a=item.snapshot?.stops,b=base?.snapshot?.stops;
  if(!a?.length)return 'אין רצף תחנות להשוואה במועד הזה';
  if(!base)return 'לא נמצאה חלופה ראשית להשוואה במועד הזה';
  // בצילומי הארכיון אין חלופה ראשית במקור: זו רק החלופה שמולה מושווים האחרים
  if(item.rd===base.rd)return String(item.rd).startsWith('website') ? 'בסיס ההשוואה' : 'חלופה ראשית';
  if(!b?.length)return 'אין רצף תחנות לחלופה הראשית במועד הזה';
  const id=s=>String(s[0]);
  const stl=st=>(/^(שד|שד'|שדרות|דרך|כביש|כיכר|סמטת|מחלף|צומת|רחוב) /.test(st)?'':'רחוב ')+st;
  if(a.length===b.length&&a.every((s,i)=>id(s)===id(b[i])))return 'אותו רצף תחנות כמו הראשית';
  // מועצה אזורית אינה עיר: לא "דרך/לא עובר ב<מועצה>"; עיר לא ידועה — לא משווים (כללים 3, 6)
  const SC0=typeof STOP_CITIES!=='undefined'&&STOP_CITIES?STOP_CITIES:null;
  const RCX=typeof REGIONAL_COUNCILS!=='undefined'&&REGIONAL_COUNCILS?REGIONAL_COUNCILS:null;
  const isRC=c=>/^מועצה אזורית|^מ\.א\.? /.test(c)||VARIANT_RC.has(c)||!!(RCX&&RCX.has(c));
  const townOf=s=>{const c=SC0&&SC0[id(s)];return c&&!isRC(c)?c:null;};
  // כבישים: רק מספר בן 1–3 ספרות; לא יציאה/מחלף/מנהרה/רמפה (כלל 7)
  const badSt=t=>/(יציאה|מחלף|מנהר[הת]|רמפה)/.test(t||'')||/^כביש \d{4,}/.test(t||'');
  const vst=s=>{const t=variantStreet(s);return badSt(t)?'':t;};
  // ראשית מנוונת (פחות מ-5 תחנות) — לא משווים, מתארים את החלופה לבדה (כלל 9)
  if(b.length<5){const c0=townOf(a[0]),c1=townOf(a[a.length-1]);
    return c0&&c1&&c0!==c1 ? 'מ'+c0+' ל'+c1 : 'מ'+a[0][1]+' ל'+a[a.length-1][1];}
  // קו ישיר/מהיר: מעט תחנות לעומת הראשית — "ישיר מתל אביב יפו למעלה אפרים" (שלמה 26.09, קו 161 חלופה 5)
  if(a.length<=6 && a.length*3<b.length) {
    const SC=typeof STOP_CITIES!=='undefined'&&STOP_CITIES?STOP_CITIES:null;
    const c0=SC&&SC[id(a[0])],c1=SC&&SC[id(a[a.length-1])];
    return c0&&c1&&c0!==c1 ? 'ישיר מ'+c0+' ל'+c1 : 'ישיר: '+a[0][1]+' ← '+a[a.length-1][1];
  }
  const ids=new Set(b.map(id)),extra=a.filter(s=>!ids.has(id(s)));
  const pos=new Map(b.map((s,i)=>[id(s),i]));
  const matches=a.map(s=>pos.get(id(s))).filter(i=>i!=null);
  const ordered=matches.length>=2 && matches.every((v,i)=>!i||v>matches[i-1]);
  const local=new Map();
  const area=s=>{const k=[s[2],s[3]].join(',');if(!local.has(k))local.set(k,variantNeighborhood(s,areas));return local.get(k);};
  // קצה: שכונה, או רחוב מהמפה; בלי רחוב במפה — שם התחנה ("תחנת באר שבע-צפון"), לא "רחוב"
  const SSm=typeof STOP_STREETS!=='undefined'&&STOP_STREETS?STOP_STREETS:null;
  const mapSt=s=>{const t=SSm&&SSm[id(s)];return t&&!badSt(t)?t:'';};
  const place=s=>{const n=area(s);return n?.interior ? 'שכונת '+n.name : mapSt(s) ? stl(mapSt(s)) : 'תחנת '+s[1];};
  const labels=[];
  const firstCommon=a.findIndex(s=>pos.has(id(s))),lastCommon=a.findLastIndex(s=>pos.has(id(s)));
  const nearby=(p,q)=>Math.hypot((p[2]-q[2])*111320,(p[3]-q[3])*94000)<600;
  const shortStart0=ordered && firstCommon>=0 && pos.get(id(a[firstCommon]))>firstCommon && firstCommon<=2 && nearby(a[0],a[firstCommon]);
  const shortEnd0=ordered && lastCommon>=0 && b.length-1-pos.get(id(a[lastCommon]))>a.length-1-lastCommon && a.length-1-lastCommon<=2 && nearby(a[a.length-1],a[lastCommon]);
  // קצה במקום אחר לגמרי (לא ליד קצה הראשית) — גם הוא "מתחיל ב/מסתיים ב" (שלמה 26.09)
  const far=(p,q)=>!nearby(p,q);
  const otherStart0=!shortStart0 && !pos.has(id(a[0])) && far(a[0],b[0]);
  const otherEnd0=!shortEnd0 && !pos.has(id(a[a.length-1])) && far(a[a.length-1],b[b.length-1]);
  // כלל 2: כל קצה שונה ברצף מסודר (קיצור/הארכה בראש או בזנב) — "מתחיל ב/מסתיים ב", לא "לא עובר ב"
  const headDiff=ordered && firstCommon>=0 && id(a[0])!==id(b[0]) && (firstCommon>0 || pos.get(id(a[firstCommon]))>0) && (far(a[0],b[0]) || firstCommon>2 || pos.get(id(a[firstCommon]))>2);
  const tailDiff=ordered && lastCommon>=0 && id(a[a.length-1])!==id(b[b.length-1]) && (lastCommon<a.length-1 || pos.get(id(a[lastCommon]))<b.length-1) && (far(a[a.length-1],b[b.length-1]) || a.length-1-lastCommon>2 || b.length-1-pos.get(id(a[lastCommon]))>2);
  const shortStart=shortStart0||headDiff,shortEnd=shortEnd0||tailDiff;
  const otherStart=!shortStart&&otherStart0,otherEnd=!shortEnd&&otherEnd0;
  // כלל 1: קצה בעיר אחרת מקצה הראשית — "מתחיל ב<עיר> (לא מ<עיר>)", "מסתיים ב<עיר> (לא ב<עיר>)", "ממשיך ל<עיר>"
  const endLabel=(start)=>{
    const x=start?a[0]:a[a.length-1],y=start?b[0]:b[b.length-1],cx=townOf(x),cy=townOf(y);
    if(cx&&cy&&cx!==cy){
      if(start) return 'מתחיל ב'+cx+' (לא מ'+cy+')';
      const extends_=lastCommon>=0&&pos.get(id(a[lastCommon]))===b.length-1&&lastCommon<a.length-1;
      return extends_ ? 'ממשיך ל'+cx : 'מסתיים ב'+cx+' (לא ב'+cy+')';
    }
    return (start?'מתחיל ב':'מסתיים ב')+place(x);
  };
  if(shortStart||otherStart)labels.push(endLabel(true));
  if(shortEnd||otherEnd)labels.push(endLabel(false));
  // לפי השרטוט: תחנה חדשה שהשרטוט של הראשית עובר לידה (עד 30 מ') — הראשית נוסעת שם ולא עוצרת; זה "עוצר גם ב…", לא "דרך…" (שלמה 27.09, קו 18175)
  // שרטוט מ-shapes.txt; בלעדיו (80 חלופות) — קו שמחבר את נקודות התחנות מה-GTFS לפי הסדר
  const shpPts=x=>{const v=x?.snapshot?.shp;if(typeof v==='string'&&v){try{return decodeShape(v);}catch(e){}}
    const st=x?.snapshot?.stops;return st&&st.length>1?st.map(q=>[q[2],q[3]]):null;};
  const bPts=shpPts(base),aPts=shpPts(item);
  const nearLine=(s,pts)=>{if(!pts||pts.length<2)return false;const ky=111320,kx=94000,x=s[3]*kx,y=s[2]*ky;
    for(let i=1;i<pts.length;i++){const x1=pts[i-1][1]*kx,y1=pts[i-1][0]*ky,x2=pts[i][1]*kx,y2=pts[i][0]*ky;
      if(Math.abs(x-x1)>800&&Math.abs(x-x2)>800)continue;const dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy;
      const t=L?Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/L)):0;if(Math.hypot(x-(x1+t*dx),y-(y1+t*dy))<30)return true;}
    return false;};
  const extHead=firstCommon>3,extTail=a.length-1-lastCommon>3;
  const through0=extra.filter(s=>{const i=a.indexOf(s);return !(shortStart && !extHead && i<firstCommon) && !(shortEnd && !extTail && i>lastCommon) && !(otherStart && i===0) && !(otherEnd && i===a.length-1);});
  const passed=through0.filter(s=>nearLine(s,bPts));
  const through=through0.filter(s=>!passed.includes(s));
  if(passed.length){
    // רק רחוב מהמפה (STOP_STREETS); בלעדיו — שם התחנה ("בתחנת קרית חיים"), לא "רחוב"
    const SS=typeof STOP_STREETS!=='undefined'&&STOP_STREETS?STOP_STREETS:null;
    const nm=s=>{const t=SS&&SS[id(s)];return t&&!badSt(t)?stl(t):'תחנת '+s[1];};
    const st=[...new Set(passed.map(nm))].slice(0,2);
    labels.push('עוצר גם ב'+st.join(' וב'));}
  if(through.length) {
    const streets=[...new Set(through.map(variantStreet).filter(Boolean))];
    // One changed street takes precedence over a neighborhood label.
    if(streets.length===1 && through.every(s=>vst(s)===streets[0])) labels.push('דרך '+stl(streets[0]));
    else {
      const counts=new Map();for(const s of b){const n=area(s);if(n)counts.set(n.id,(counts.get(n.id)||0)+1);}
      const now=new Map();for(const s of a){const n=area(s);if(n)now.set(n.id,(now.get(n.id)||0)+1);}
      // רק ההבדלים הבולטים (הכי הרבה תחנות), לא תיאור של כל המסלול (שלמה 26.09)
      // רחוב מזוהה משני חלקי שם התחנה ("עיריית קרית מלאכי/ז'בוטינסקי" → ז'בוטינסקי);
      // רחוב שעליו 2 תחנות שונות ומעלה גובר על שם השכונה (שלמה 26.09)
      const parts=s=>{const a=typeof STOP_STREETS!=='undefined'&&STOP_STREETS&&STOP_STREETS[String(s[0])];
        return (a?[a]:String(s[1]||'').split('/').map(x=>x.trim().replace(/^שד(?:רות|'|׳)\s+/,''))).filter(x=>x&&!badSt(x));};
      const sc=new Map();for(const s of through)for(const x of new Set(parts(s)))sc.set(x,(sc.get(x)||0)+1);
      // רחוב שגם הראשית עוצרת בו אינו הבדל (קו 3 עובר גם הוא בשדרות ירושלים)
      const baseStreets=new Set(b.flatMap(parts));
      const tally=new Map(),first=new Map(),lblNb=new Map();
      const nbN=new Map(),nbSt=new Map();
      for(const s of through){const nn=area(s);if(!nn||parts(s).some(x=>baseStreets.has(x)))continue;nbN.set(nn.id,(nbN.get(nn.id)||0)+1);if(!nbSt.has(nn.id))nbSt.set(nn.id,new Set());nbSt.get(nn.id).add(vst(s)||s[1]);}
      through.forEach((s,i)=>{
        if(parts(s).some(x=>baseStreets.has(x)))return;
        // כמה תחנות חדשות באותה שכונה על כמה רחובות — זו השכונה, לא רשימת רחובות (שלמה 26.09, קו 38001)
        const nn=area(s);
        // הכלל של שלמה: יותר מתחנה אחת באותה שכונה ← "דרך שכונת"; רחוב רק לתחנה בודדת בשכונה
        if(nn&&nbN.get(nn.id)>=2){const text='דרך שכונת '+nn.name;tally.set(text,(tally.get(text)||0)+1);if(!first.has(text))first.set(text,i);return;}
        const st=parts(s).filter(x=>sc.get(x)>=2).sort((x,y)=>sc.get(y)-sc.get(x))[0];
        const n=area(s),street=vst(s);
        const text=st ? 'דרך '+stl(st) : n?.interior && (now.get(n.id)||0)>(counts.get(n.id)||0) ? 'דרך שכונת '+n.name : street ? 'דרך '+stl(street) : 'דרך תחנת '+s[1];
        tally.set(text,(tally.get(text)||0)+1);if(!first.has(text))first.set(text,i);
        if(!lblNb.has(text))lblNb.set(text,new Set());lblNb.get(text).add(n?n.name:'');
      });
      // שני רחובות ומעלה שכל התחנות שלהם באותה שכונה — זו השכונה (שלמה 26.09, קו 38001: חלוצי התעשייה/העמל/החרושת = אזור תעשייה)
      const byNb=new Map();
      for(const [t,set] of lblNb){if(!t.startsWith('דרך רחוב ')&&!t.startsWith('דרך שדרות'))continue;if(set.size!==1)continue;const nb=[...set][0];if(!nb)continue;if(!byNb.has(nb))byNb.set(nb,[]);byNb.get(nb).push(t);}
      for(const [nb,ts] of byNb){if(ts.length<2)continue;const text='דרך שכונת '+nb;let c=0,f=1e9;for(const t of ts){c+=tally.get(t);f=Math.min(f,first.get(t));tally.delete(t);}tally.set(text,(tally.get(text)||0)+c);first.set(text,Math.min(first.get(text)??1e9,f));}
      const top=[...tally].sort((x,y)=>y[1]-x[1]).slice(0,3).sort((x,y)=>first.get(x[0])-first.get(y[0])).map(x=>x[0]);
      if(through.length>a.length/2 && !otherStart && !otherEnd && !shortStart && !shortEnd)labels.push('מסלול אחר');
      for(const t of top)if(!labels.includes(t))labels.push(t);
    }
  }
  // היררכיה אחת לכל הקווים (שלמה 26.09): עיר ← כביש ← רחוב/שכונה. אם החלופה נבדלת בערים שהיא עוברת בהן —
  // זה כל הסיפור ("לא עובר בשדרות"); אחרת בכבישים ("לא נוסע בכביש 25"); ורק בקו שכל ההבדל בתוך העיר — רחובות ושכונות.
  {
    const SC=typeof STOP_CITIES!=='undefined'&&STOP_CITIES?STOP_CITIES:null;
    const cityOf=townOf;
    const roadsOf=s=>{const m=/^כביש ([\d/]+)$/.exec(vst(s)||'');return m?m[1].split('/').filter(x=>/^\d{1,3}$/.test(x)).map(x=>'כביש '+x):[];};
    const ids2=new Set(a.map(id));
    // תחנות הראשית שחסרות רק בגלל קצה מקוצר/מוארך — מוסברות כבר ב"מתחיל/מסתיים" (כללים 1, 2)
    const loB=firstCommon>=0&&(shortStart||otherStart)?pos.get(id(a[firstCommon])):-1;
    const hiB=lastCommon>=0&&(shortEnd||otherEnd)?pos.get(id(a[lastCommon])):b.length;
    const missing=b.filter((s,i)=>!ids2.has(id(s))&&i>loB&&i<hiB);
    // הבדל = לפחות 2 תחנות, והצד השני עוצר שם בפחות ממחצית (תחנה בודדת בצומת או באזור תעשייה אינה "עובר ב")
    const tally=(list,f)=>{const m=new Map();for(const s of list)for(const k of [].concat(f(s)||[]))if(k)m.set(k,(m.get(k)||0)+1);return m;};
    const diff=(f,city)=>{const A=tally(a,f),B=tally(b,f),T=tally(through,f),M=tally(missing,f);
      const plus=[...T].filter(([k,n])=>n>=2&&(city?(B.get(k)||0)*2<(A.get(k)||0):(B.get(k)||0)*2<(A.get(k)||0))).sort((x,y)=>y[1]-x[1]).slice(0,2).map(x=>x[0]);
      const minus=[...M].filter(([k,n])=>n>=2&&(city?!(A.get(k)||0):(A.get(k)||0)*2<(B.get(k)||0))).sort((x,y)=>y[1]-x[1]).slice(0,2).map(x=>x[0]);
      return [plus,minus];};
    const keep=labels.filter(t=>/^(מתחיל|מסתיים|ממשיך)/.test(t));
    const [cPlus,cMinus]=SC?diff(cityOf,true):[[],[]];
    const [rPlus,rMinus]=diff(roadsOf);
    const road=[...rPlus.map(r=>'דרך '+r),...rMinus.map(r=>'לא נוסע ב'+r)];
    if(cPlus.length||cMinus.length){labels.length=0;const city=[...cPlus.map(c=>'דרך '+c),...cMinus.map(c=>'לא עובר ב'+c)];labels.push(...keep,...city,...road.slice(0,Math.max(0,3-city.length)));}
    else if(road.length){labels.length=0;labels.push(...keep,...road);}
  }
  // חלופה שמדלגת על תחנות של הראשית (בלי תחנות משלה) — "מדלג על…" (שלמה 26.09, קו 1 בית שמש: סביון/חרוב)
  // כלל 5: כל רצף דילוג באמצע נבחן לבד — 1–2 תחנות בשמן, יותר מ-3 — תיאור הקטע (רחוב/שכונה/עיר)
  if(labels.every(t=>/^(מתחיל|מסתיים|ממשיך)/.test(t)) && firstCommon>=0) {
    const ids2=new Set(a.map(id)),lo=pos.get(id(a[firstCommon])),hi=pos.get(id(a[lastCommon]));
    // רצפים שביניהם עד 2 תחנות משותפות — קטע אחד
    const runs=[];let cur=null,gap=0;
    b.forEach((s,i)=>{if(i>lo&&i<hi&&!ids2.has(id(s))){if(!cur||gap>2)runs.push(cur=[]);cur.push(s);gap=0;}else gap++;});
    const hasEnd=labels.length>0;
    const aTowns=new Set(a.map(townOf).filter(Boolean));
    let anon=0;
    for(const run of runs.sort((x,y)=>y.length-x.length).slice(0,2)){
      if(hasEnd&&run.length<3)continue;
      if(run.length<=2){const on=run.every(s=>nearLine(s,aPts));labels.push((on?'לא עוצר ב':'מדלג על ')+(run.length===1?(on?'':'תחנת ')+run[0][1]:run.map(s=>s[1]).join(' ו')));continue;}
      const top=f=>{const c=new Map();for(const s of run){const k=f(s);if(k)c.set(k,(c.get(k)||0)+1);}return [...c].sort((x,y)=>y[1]-x[1])[0];};
      const st=top(vst),nb=top(s=>{const n=area(s);return n?.interior?n.name:null;}),tw=top(townOf);
      const half=x=>x&&x[1]*2>=run.length&&x[1]>=2;
      let t=null;
      if(run.length>=3){
        if(tw&&!aTowns.has(tw[0])&&half(tw))t='לא עובר ב'+tw[0];
        else if(half(st))t='לא עובר ב'+stl(st[0]);
        else if(half(nb))t='לא עובר בשכונת '+nb[0];
      }
      if(t&&run.every(s=>nearLine(s,aPts)))t=t.replace('לא עובר ב','לא עוצר ב');
      if(t){const lbl=t+' ('+run.length+' תחנות)';if(!labels.includes(lbl))labels.push(lbl);}else anon+=run.length;
    }
    if(anon)labels.push('מדלג על '+anon+' תחנות');
  }
  if(!labels.length) return 'מסלול שונה מהראשית · '+a.length+' תחנות';
  // "דרך רחוב א · דרך רחוב ב" ← "דרך רחובות א, ב" (וכך גם שכונות) — שלמה 26.09
  // כלל 8: לא לחזור ב"דרך…" על רחוב/שכונה שכבר נקראו ב"מתחיל/מסתיים"
  const ends=labels.filter(t=>/^(מתחיל|מסתיים|ממשיך)/.test(t)).join(' ');
  const stopsAlso=labels.filter(t=>t.startsWith('עוצר גם')).join(' ');
  const labels2=labels.filter(t=>{const m=/^דרך (?:רחוב |שכונת )?(.+)$/.exec(t);return !(m&&(ends.includes(m[1])||stopsAlso.includes(m[1])));});
  const merged=[];
  for(const t of labels2){
    const m=/^דרך (רחוב|שכונת) (.+)$/.exec(t),prev=merged[merged.length-1];
    if(m&&prev&&prev.kind===m[1])prev.items.push(m[2]);
    else merged.push(m?{kind:m[1],items:[m[2]]}:{text:t});
  }
  // גרש שנשמר בהתחלה במקום בסוף ("'רובע ב" ← "רובע ב'"), ו"דרך דרך רון נחמן" ← "דרך רון נחמן"
  const fixq=t=>t.replace(/(^|[\s,(])(''?|")([^\s,'"]+(?: [^\s,'"]+)*? [א-ת])(?=$|[,·)])/g,'$1$3$2');
  return merged.map(x=>x.text||(x.items.length===1?'דרך '+x.kind+' '+x.items[0]:'דרך '+(x.kind==='רחוב'?'רחובות':'שכונות')+' '+x.items.join(', ')))
    .map(t=>fixq(t).replace(/^דרך דרך /,'דרך ').replace(/ב?דרך דרך /g,'דרך ')).join(' · ');
}
// הארכיון הכבד (early-patterns / early-stops, כ-4.5GB) מתפרסם מריפו נפרד, kav-bochan-archive (שלמה 11.10),
// כדי שהאתר הראשי לא יעלה אותו מחדש בכל עדכון. מאז שהייבוא ההיסטורי הסתיים (11.2026) שתי התיקיות
// נמצאות רק שם — גם בהרצה מקומית (בדיקות) קוראים מהארכיון.
const ARCHIVE_BASE="https://transit-freak.github.io/kav-bochan-archive/";
function archFetch(url,opts){
  return fetch(/^data\/early-(patterns|stops)\//.test(url)?ARCHIVE_BASE+url.slice(5):url,opts);
}
async function variantRead(url, compressed=false) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try {
    const r=await archFetch(url,{signal:controller.signal});
    if(!r.ok)throw new Error('HTTP '+r.status);
    if(!compressed)return await r.json();
    if(!window.DecompressionStream)throw new Error('נדרש דפדפן מעודכן');
    return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
  } finally {clearTimeout(timer);}
}
let variantAreasPromise;
function loadVariantAreas() {
  if(!variantAreasPromise)variantAreasPromise=Promise.all(Array.from({length:8},(_,i)=>variantRead('data/neighborhoods/'+i+'.json.gz?v=20260923',true))).then(parts=>parts.flat()).catch(e=>{variantAreasPromise=null;throw e;});
  return variantAreasPromise;
}
// תיאורי החלופות מחושבים מראש אצלנו (tools/build_alt_desc.mjs, שבר לפי 2 ספרות ראשונות של המק"ט)
const altDescCache={};
function loadAltDesc(fam){
  const k=(fam.slice(0,2)||'0').padStart(2,'0');
  if(!altDescCache[k])altDescCache[k]=dfetch('data/alt-desc/'+k+'.json').then(r=>r.ok?r.json():{}).catch(()=>{delete altDescCache[k];return {};});
  return altDescCache[k].then(m=>m[fam]||null);
}
// שגיאה בבוחר החלופות לא מפילה את כל הדף (שלמה 18.10: לחיצה על "החלפת חלופה" השאירה דף ריק) —
// מוצגת שורה קצרה, ומעבר לקו או לגרסה אחרת מנסה שוב
class SafeBox extends React.Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(err){return {err};}
  componentDidCatch(err){console.error('AlternativeSelector:',err);}
  render(){return this.state.err ? <div className="sibdesc">רשימת החלופות לא נטענה. רעננו את הדף או בחרו גרסה אחרת.</div> : this.props.children;}
}
/* רכבת (שלמה 03.11): בבוחר החלופות רק במה הרכבת שונה בתחנות — בשמות התחנות, בלי רחובות
   וערים — וחלופות עם אותו הבדל באותו כיוון בשורה אחת, ומספרי החלופות מתחת */
function railList(xs, pre) {
  const ns = xs.map((x) => pre + x);
  if (ns.length > 3) return ns.slice(0, 2).join(", ") + " ועוד " + (ns.length - 2) + " תחנות";
  return ns.length > 1 ? ns.slice(0, -1).join(", ") + " ו" + ns[ns.length - 1] : ns[0];
}
// שמות תחנות הרכבת ב-GTFS קצרים ("השלום", "נת-בג") — לתצוגה עם העיר
const RAIL_NM = { "נת-בג": "נתב״ג", "נתבג": "נתב״ג", "השלום": "תל אביב השלום", "ההגנה": "תל אביב ההגנה", "אוניברסיטה": "תל אביב אוניברסיטה",
  "סבידור מרכז": "תל אביב סבידור מרכז", "מרכז": "תל אביב סבידור מרכז", "בת גלים": "חיפה בת גלים", "מרכז השמונה": "חיפה מרכז השמונה",
  "חוף הכרמל": "חיפה חוף הכרמל", "מרכזית המפרץ": "חיפה מרכזית המפרץ", "מרכזית המפרץ קו החוף": "חיפה מרכזית המפרץ", "מרכזית המפרץ - קו החוף": "חיפה מרכזית המפרץ" };
const railNm = (x) => { const n = String(x?.[1] || "").trim(); return RAIL_NM[n] || RAIL_NM[n.replace(/\s+-\s+/g, " ")] || n.replace(/\s+-\s+/g, " "); };
function railVariantText(item, base) {
  const a = item.snapshot?.stops, b = base?.snapshot?.stops;
  if (!a?.length || !b?.length) return null;
  if (item.rd === base.rd) return "המסלול הרגיל";
  const id = (x) => String(x[0]), nm = railNm;
  const A = new Set(a.map(id)), B = new Set(b.map(id));
  const fa = a.findIndex((x) => B.has(id(x))), la = a.length - 1 - [...a].reverse().findIndex((x) => B.has(id(x)));
  const fb = b.findIndex((x) => A.has(id(x))), lb = b.length - 1 - [...b].reverse().findIndex((x) => A.has(id(x)));
  if (fa < 0) return "מסלול אחר: מ" + nm(a[0]) + " ל" + nm(a[a.length - 1]);
  const add = a.filter((x, i) => i > fa && i < la && !B.has(id(x))).map(nm);
  const rem = b.filter((x, i) => i > fb && i < lb && !A.has(id(x))).map(nm);
  const parts = [];
  if (id(a[0]) !== id(b[0])) parts.push("מתחילה ב" + nm(a[0]));
  if (add.length) parts.push("עוצרת גם " + railList(add, "ב"));
  if (rem.length) parts.push("לא עוצרת " + railList(rem, "ב"));
  if (id(a[a.length - 1]) !== id(b[b.length - 1])) parts.push("מסתיימת ב" + nm(a[a.length - 1]));
  return parts.length ? parts.join(" · ") : "המסלול הרגיל";
}
// הראשית ברכבת — רק מבין החלופות שיש להן תחנות (שלמה 03.11: חלופה שבוטלה בלי תחנות נבחרה כראשית,
// וכל השאר הוצגו "בלי פירוט תחנות"). פעילה לפני שבוטלה, #, הכי הרבה נסיעות, הכי הרבה תחנות, האחרונה שפעלה
function railBase(item, items) {
  if (!Array.isArray(items)) return null;
  const dir = items.filter((x) => variantDirection(x) === variantDirection(item) && x.snapshot?.stops?.length);
  return dir.slice().sort((a, b) => (a.lk === "removed") - (b.lk === "removed") || (variantPart(b) === "#") - (variantPart(a) === "#")
    || (b.ntr || 0) - (a.ntr || 0) || b.snapshot.stops.length - a.snapshot.stops.length || (b.ld || "").localeCompare(a.ld || "") || a.rd.localeCompare(b.rd))[0] || null;
}
function railAltNums(g) {
  const ns = g.map(variantPart).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0) || String(a).localeCompare(String(b)));
  if (ns.length === 1) return "חלופה " + ns[0];
  if (ns.length > 4) return "חלופות " + ns.slice(0, 3).join(", ") + " ועוד " + (ns.length - 3);
  return "חלופות " + ns.slice(0, -1).join(", ") + " ו-" + ns[ns.length - 1];
}
function AlternativeSelector({sibs,rd,date,latest,onSwitch,altRd,setAltRd}) {
  const [open,setOpen]=useState(false),[items,setItems]=useState(null),[areas,setAreas]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const historical=sibs.some(s=>s.hgroup),key=sibs.map(s=>s.rd).join('|');
  // מצב עדכני (הגרסה האחרונה של הקו): התיאורים מוכנים מראש — נטענים מיד, בלי להוריד את קובצי
  // החלופות ואת גבולות השכונות בדפדפן (שלמה 26.09). גרסה ישנה או מסלולי 2012 — חישוב בעמוד כמו קודם.
  const [pre,setPre]=useState(null);
  useEffect(()=>{setPre(null);if(historical)return;let ok=true;loadAltDesc(rd.split('-')[0]).then(m=>{if(ok)setPre(m||{});});return()=>{ok=false;};},[key]);
  const railMode=!historical && sibs.length>1 && sibs.every(s=>s.tt==='rail');
  const usePre=!railMode && !historical && latest && pre && sibs.every(s=>s.rd in pre);
  // ברכבת החלופות נטענות מיד (גם כשהרשימה סגורה) — התיאור בכפתור תלוי בהן
  const loadKey=railMode || open;
  useEffect(()=>{setOpen(false);setError('');},[rd,date]);
  useEffect(()=>{setItems(null);},[key,date]);
  useEffect(()=>{
    if(!loadKey || usePre)return;
    let active=true;setItems(null);setError('');
    if(railMode) setAreas([]); else loadVariantAreas().then(x=>{if(active)setAreas(x);}).catch(()=>{if(active){setAreas([]);setError('גבולות השכונות לא נטענו; מוצגים שמות הרחובות.');}});
    const results=new Array(sibs.length);let next=0;
    async function worker(){
      while(active && next<sibs.length){const i=next++,s=sibs[i];
        try{
          const lf=materializeLf(await variantRead('data/lines/'+fsafe(s.rd)+'.json?v='+BUILD)),snapshot=variantSnapshot(lf,railMode?null:date,historical);  // ברכבת: המסלול המתועד של כל חלופה, גם אם פעלה בתקופה אחרת
          let frequency=null;
          if(historical && snapshot){
            try{const p=snapshot.earlyPatterns || (snapshot.earlyPatternsFile ? await variantRead('data/early-patterns/'+snapshot.earlyPatternsFile.slice(0,2)+'/'+snapshot.earlyPatternsFile+'.json.gz',true) : null);frequency=variantFrequency(p,date||snapshot.d);}catch(e){/* Do not invent a frequency. */}
          }
          results[i]={...s,snapshot,frequency};
        }catch(e){results[i]={...s,snapshot:null,frequency:null};}
      }
    }
    Promise.all(Array.from({length:Math.min(4,sibs.length)},worker)).then(()=>{if(active){setItems(results);if(results.some(s=>!s.snapshot || (historical && s.frequency==null)))setError('לחלק מהחלופות אין נתוני השוואה זמינים במועד הזה.');}});
    return()=>{active=false;};
  },[loadKey,key,date,retry,usePre]);
  const current=sibs.find(s=>s.rd===rd);
  // קו מצילומי הארכיון: "לכיוון רחובות" לפי התחנה האחרונה, במקום מספר כיוון של המקור
  const label=s=>historical ? 'מסלול '+(s.rd.match(/archive2012r(\d+)/)?.[1]||s.rd)+' · '+(s.hfrom||'')+' ← '+(s.hto||s.dest||'') : (String(s.rd).startsWith('website') ? (s.dest||'')+(variantPart(s) ? ' · חלופה '+variantPart(s) : '') : 'כיוון '+variantDirection(s)+' · '+(variantPart(s)==='#' ? 'חלופה # · ראשית' : 'חלופה '+(variantPart(s)||'ללא סימון')));
  // העיצוב הקודם של שורת החלופות (sibs/sib/sibcmp — כפתורי גלולה סגולים) — הלוגיקה של
  // בוחר החלופות נשארה כמו שהיא, רק התצוגה חזרה לעיצוב של האתר (שלמה 26.09)
  // תיאור לתצוגה: מהקובץ המוכן, או מהחישוב בעמוד. "לא נמצאה חלופה ראשית" (קו בלי חלופה # — רכבת,
  // מוניות, חלק מהקווים) לא מוצג: זה לא מידע על המסלול
  const NO_BASE='לא נמצאה חלופה ראשית להשוואה במועד הזה';
  // גרסה ישנה (שלמה 29.09: "טוען חלופות" במקום להציג ישר, ו"אין רצף תחנות" לא מובן): עד שהחישוב
  // בעמוד מסתיים מוצגים התיאורים המוכנים; ומה שאין לו תיאור במועד הזה מקבל ניסוח מובן
  const preAll=!railMode && !historical && pre && sibs.every(s=>s.rd in pre);
  const NO_SEQ='אין רצף תחנות להשוואה במועד הזה', NO_BSEQ='אין רצף תחנות לחלופה הראשית במועד הזה';
  const desc=(s)=>{
    if(railMode){const it=items && items.find(x=>x.rd===s.rd);return (it && railVariantText(it,railBase(it,items))) || '';}
    if(usePre || (!items && preAll)) { const t=pre[s.rd]; return t===NO_BASE?'':(t||''); }
    const it=items && items.find(x=>x.rd===s.rd);
    let t=areas && it ? describeVariant(it,variantBase(it,items,historical),areas) : null;
    // בלי "לא פעלה במועד הזה" (שלמה 03.11: להוריד) — בלי רצף תחנות לא מוצג תיאור, רק הכיוון והחלופה
    if(t===NO_SEQ) t='';
    else if(t===NO_BSEQ || t===NO_BASE) t=(pre && pre[s.rd] && pre[s.rd]!==NO_BASE) ? pre[s.rd] : '';
    return t||'';
  };
  const shown=usePre ? sibs : (items || (preAll ? sibs : null));
  return <div className="alt-selector">
    <div className="sibs">
      <span className="sibt" title={historical ? undefined : "חלופה היא מסלול אחר של אותו קו, באותו מספר"}>{historical ? "מסלולים:" : "חלופות וכיוונים:"}</span>
      <span className="sib on" title={current?.dest}>{(current && desc(current)) || (current ? label(current) : rd)}{current && lineGoneAt(current) && <span className="sibx">✖</span>}</span>
      <button type="button" className="sib" aria-expanded={open} aria-controls="alternative-options" onClick={()=>setOpen(!open)}>החלפת חלופה {open?'▴':'▾'}</button>
    </div>
    {/* הפוך מקודם (שלמה 26.09): בכפתור — דרך איפה הקו עובר; מתחת, בקטן — הכיוון והחלופה */}
    {current && desc(current) ? <div className="sibdesc">{label(current)}</div> : null}
    {open && <div id="alternative-options">
      {!usePre && !railMode && error && <div className="sibdesc">{error}</div>}
      {railMode && items ? <div className="siblist">{(()=>{
        // כיוון ← שורות; בכל כיוון: תיאור → החלופות שלו (הרגיל ראשון)
        const dirs=new Map(),NOST='בלי פירוט תחנות';
        for(const it of items){const t=desc(it)||NOST,d=variantDirection(it);
          if(!dirs.has(d))dirs.set(d,new Map());const m=dirs.get(d);if(!m.has(t))m.set(t,[]);m.get(t).push(it);}
        return [...dirs.entries()].map(([d,m])=>{
          const b=railBase([...m.values()].flat()[0],items),st=b?.snapshot?.stops;
          const nm=railNm;
          return <div key={d}>
            <div className="sibt" style={{fontWeight:700,margin:'8px 0 4px'}}>{st?.length ? nm(st[0])+' ← '+nm(st[st.length-1]) : 'כיוון '+d}</div>
            {[...m.entries()].sort((x,y)=>(y[0]==='המסלול הרגיל')-(x[0]==='המסלול הרגיל')||(x[0]===NOST)-(y[0]===NOST)).map(([t,g])=>{
              const selected=g.some(x=>x.rd===rd),r=g.find(x=>x.rd===rd)||g.find(x=>!lineGoneAt(x))||g[0];
              return <div key={t} className="sibitem"><div className="sibinfo">
                <span className="sibwrap">
                  <a className={"sib"+(selected?" on":"")} href={lineHref(r.rd)} aria-current={selected?'true':undefined}
                    onClick={e=>{if(!plainClick(e))return;e.preventDefault();setOpen(false);if(!selected)onSwitch(r.rd);}}>
                    {t}{g.every(x=>lineGoneAt(x)) && <span className="sibx">✖</span>}
                  </a>
                  {!selected && <button type="button" className="sibcmp" aria-label="השוואה" title="השוואת התחנות והמסלול" onClick={()=>setAltRd(altRd===r.rd?null:r.rd)}>{altRd===r.rd?'✕':'⇄'}</button>}
                </span>
                <span className="sibdesc">{railAltNums(g)}</span>
              </div></div>;})}
          </div>;});})()}</div> :
      !shown ? <div className="sibdesc">טוען חלופות{historical?' ומשווה את תדירות הנסיעות':''}…</div> : <div className="siblist">
        {shown.map(s=>{
          const base=usePre || !items ? null : variantBase(s,items,historical),selected=s.rd===rd;
          return <div key={s.rd} className="sibitem">
            <div className="sibinfo">
              <span className="sibwrap">
                <a className={"sib"+(selected?" on":"")} href={lineHref(s.rd)} title={s.dest} aria-current={selected?'true':undefined}
                  onClick={e=>{if(!plainClick(e))return;e.preventDefault();setOpen(false);if(!selected)onSwitch(s.rd);}}>
                  {desc(s) || label(s)}{lineGoneAt(s) && <span className="sibx">✖</span>}
                </a>
                {!selected && <button type="button" className="sibcmp" aria-label="השוואה" title="השוואת התחנות והמסלול" onClick={()=>setAltRd(altRd===s.rd?null:s.rd)}>{altRd===s.rd?'✕':'⇄'}</button>}
              </span>
              {desc(s) ? <span className="sibdesc">{label(s)}</span> : (!usePre && !areas ? <span className="sibdesc">טוען תיאור מסלול…</span> : null)}
              {s.merged > 1 && <span className="sibdesc">מאחדת {s.merged} חלופות עם אותן תחנות באותה תקופה</span>}
              {historical && <span className="sibdesc">{base?.rd===s.rd?'הראשית לפי התדירות · ':''}{s.frequency==null?'נתוני התדירות לא זמינים':s.frequency+' נסיעות בשבעה ימים מ־'+fmtD(date||s.snapshot?.d)}{s.snapshot?'':' · אין נתונים למועד הזה'}</span>}
            </div>
          </div>;
        })}
      </div>}
      {!railMode && <div className="sibt" style={{fontWeight:600,marginTop:6}}>⇄ משווה לחלופה הפתוחה · ✖ מסמן חלופה מבוטלת<br />התיאורים לפי {usePre ? 'המסלול האחרון של כל חלופה ו' : ''}שמות השכונות של היום.
        <details className="howcalc"><summary>מקורות</summary><p>גבולות שכונות: מפ״י / GovMap, באמצעות גרסאות לעם, ספטמבר 2026. שמות השכונות אינם שחזור היסטורי. תחנות עד 50 מטר מהגבול מתוארות לפי הרחוב.</p></details></div>}
    </div>}
  </div>;
}

/* ---------- השוואה בין חלופות ---------- */
// עד עכשיו אפשר היה להשוות גרסה של קו לגרסה קודמת שלו, אבל לא חלופה
// לחלופה: מי שרצה לדעת במה כיוון 1 שונה מכיוון 2, או ה"ראשית" מהחלופה,
// היה צריך לפתוח שני עמודים ולהחזיק את שתי הרשימות בראש.
function AltCompare({ rd, altRd, label, onClose }) {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  useEffect(() => {
    let ok = true;
    setA(null); setB(null);
    // אותה כתובת בדיוק כמו בעמוד הקו — אחרת אותו קובץ ירד פעמיים תחת
    // שתי חותמות שונות, ובמקרה גרוע חצי מסך הציג נתונים של אתמול
    const get = (r) => dfetch("data/lines/" + fsafe(r) + ".json")
      .then((x) => (x.ok ? x.json() : null)).then(materializeLf);
    get(rd).then((d) => ok && setA(d)).catch(() => ok && setA(false));
    get(altRd).then((d) => ok && setB(d)).catch(() => ok && setB(false));
    return () => { ok = false; };
  }, [rd, altRd]);
  if (a === null || b === null) return <div className="altcmp">טוען…</div>;
  if (!a || !b) return <div className="altcmp">אחת החלופות לא נטענה.</div>;
  // המצב הנוכחי של כל חלופה: הגרסה האחרונה שיש בה רצף תחנות
  const last = (lf) => {
    const vs = (lf.versions || []).filter((v) => (v.stops || []).length);
    return vs[vs.length - 1] || null;
  };
  const va = last(a), vb = last(b);
  if (!va || !vb) return <div className="altcmp">לאחת החלופות אין רצף תחנות מתועד.</div>;
  const ca = va.stops.map((x) => x[0]), cb = vb.stops.map((x) => x[0]);
  const sa = new Set(ca), sb = new Set(cb);
  const onlyA = va.stops.filter((x) => !sb.has(x[0]));
  const onlyB = vb.stops.filter((x) => !sa.has(x[0]));
  const both = ca.filter((x) => sb.has(x)).length;
  const same = ca.length === cb.length && ca.every((x, i) => x === cb[i]);
  return (
    <div className="altcmp">
      <div className="altcmphead">
        <b>השוואת חלופות</b> · {a.dest || rd} <span className="mut">מול</span> {label}
        <button className="cmpx" onClick={onClose}>✕ סיום</button>
      </div>
      <div className="altstat">
        <span>{both.toLocaleString()} תחנות משותפות</span>
        <span className="onlya">{onlyA.length.toLocaleString()} רק כאן</span>
        <span className="onlyb">{onlyB.length.toLocaleString()} רק בחלופה השנייה</span>
        <span className="mut">{fmtD(va.d)} מול {fmtD(vb.d)}</span>
      </div>
      {same && <div className="mut">רצף התחנות זהה בשתיהן — ההבדל הוא בכיוון הנסיעה בלבד.</div>}
      <DiffMap cur={decodeShape(va.shp || "")} prev={decodeShape(vb.shp || "")}
        approx={!va.shp} prevApprox={!vb.shp} curStops={va.stops} prevStops={vb.stops} />
      <div className="legend">
        <span><i style={{ borderColor: "#4c1d95" }} /> החלופה הפתוחה</span>
        <span><i style={{ borderColor: "#16a34a" }} /> החלופה להשוואה</span>
      </div>
      {(onlyA.length > 0 || onlyB.length > 0) && (
        <div className="cmplist">
          {onlyA.length > 0 && <div className="ad">רק כאן: {onlyA.map((x) => `${x[1]} (${x[0]})`).join(", ")}</div>}
          {onlyB.length > 0 && <div className="rm">רק בחלופה השנייה: {onlyB.map((x) => `${x[1]} (${x[0]})`).join(", ")}</div>}
        </div>
      )}
    </div>
  );
}
