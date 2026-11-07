/* דף הבית של הקו הבוחן (שלמה 06.11): העין הבוחנת במרכז וכל הכלים סביבה.
   קובץ משותף אחד לדף הסטטי ב-index.html (שנבנה ממנו ב-tools/build_kavpach.mjs) ול-ChoiceScreen ב-KavPach.jsx:
   - KBH.ICON  — הסמלים של כל הכלים (גם הסמל הגדול בכותרת של קו פח והקו המוזהב)
   - KBH.GROUPS / KBH.PARKS — רשימת הכלים בדף הבית: שם, תיאור, קישור ומפתח הגרסה ב-versions.json.
     כלי חדש בדף הבית = שורה חדשה כאן (ו-tools/og_cards.mjs קורא את הרשימה מכאן).
   - KBH.html(versions) — כל דף הבית כ-HTML (הסמלים ממולאים ב-mount)
   - KBH.mount(node, {onPick}) — הסמלים, העין שמסתכלת על הכלים ומצמצת, "קצת עליי", הגרסאות */
(function () {
'use strict';
var W = typeof window !== 'undefined' ? window : globalThis;
if (W.KBH) return;

/* ===== העין הבוחנת ===== */
function eye(id,stat){const E='M14 60 Q60 20 106 60 Q60 100 14 60 Z',HL='<circle cx="66" cy="54" r="3.5" fill="#fff"/>';
  const defs=`<defs><linearGradient id="kb-eye-bg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient><radialGradient id="kb-eye-ir-${id}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#7dd3fc"/><stop offset=".6" stop-color="#0ea5e9"/><stop offset="1" stop-color="#0369a1"/></radialGradient><clipPath id="kb-eye-clip-${id}"><path d="${E}"/></clipPath></defs>`;
  const tile=`<rect width="120" height="120" rx="26" fill="url(#kb-eye-bg-${id})"/><rect x=".75" y=".75" width="118.5" height="118.5" rx="25.25" fill="none" stroke="#bae6fd" stroke-width="1.5"/>`;
  const lidG=`<g class="${stat?'':'kb-eye-lid'}"><path d="${E}" fill="#fff"/><path d="${E}" stroke="#0ea5e9" stroke-width="6" fill="none" stroke-linejoin="round"/><g clip-path="url(#kb-eye-clip-${id})"><g class="${stat?'kb-iris-js':'kb-eye-iris'}"><circle cx="60" cy="60" r="20" fill="url(#kb-eye-ir-${id})"/><circle class="kb-pupil" cx="60" cy="60" r="9.5" fill="#0f172a"/>${stat?'':HL}</g>${stat?HL:''}</g></g>`;
  const dash=`<path d="M22 60 H34 M86 60 H98" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 7"/>`;
  /* העין הגדולה: הריבוע בשכבה אחת, והעין עצמה בשכבה נפרדת — המצמוץ מכווץ רק את השכבה הזו (בלי לצייר מחדש את ה-SVG, בלי לאג) */
  if(stat)return `<svg viewBox="0 0 120 120" aria-hidden="true">${defs}${tile}</svg><div class="eye-layer"><svg viewBox="0 0 120 120" aria-hidden="true">${lidG}${dash}</svg></div>`;
  return `<svg viewBox="0 0 120 120" aria-hidden="true">${defs}${tile}${lidG}${dash}</svg>`}

/* ===== חלקים משותפים לסמלים ===== */
const f=n=>+n.toFixed(2);
function tile(k,c1,c2,inner){
  return `<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><linearGradient id="bg-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient><clipPath id="cl-${k}"><rect width="120" height="120" rx="28"/></clipPath></defs><g clip-path="url(#cl-${k})"><rect width="120" height="120" fill="url(#bg-${k})"/><circle cx="22" cy="10" r="62" fill="#fff" opacity=".07"/><rect width="120" height="64" fill="url(#kb-sheen)"/>${inner}</g><rect x=".75" y=".75" width="118.5" height="118.5" rx="27.25" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.5"/></svg>`;
}
function wheel(cx,cy,rim){return `<circle cx="${cx}" cy="${cy}" r="7.6" fill="url(#kb-tire)"/><circle cx="${cx}" cy="${cy}" r="4.4" fill="${rim||'url(#kb-rim)'}"/><circle cx="${cx}" cy="${cy}" r="4.4" fill="none" stroke="#1f2937" stroke-opacity=".4" stroke-width=".7"/><circle cx="${cx}" cy="${cy}" r="1.5" fill="#475569"/>`}
/* אוטובוס עירוני מהצד — 84×49, חזית מימין */
function busSide(p,o={}){
  const b1=o.b1||'#ffffff',b2=o.b2||'#d8dfe9',edge=o.edge||'#8391a7',st=o.stripe||'#0ea5e9',sk=o.skirt||'#c5cedb',gl=o.glass||'url(#kb-glass)';
  return `<defs><linearGradient id="${p}B" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></linearGradient><clipPath id="${p}C"><rect x="0" y="4" width="84" height="38" rx="8"/></clipPath></defs>
  ${o.noShadow?'':'<ellipse cx="42" cy="49.5" rx="42" ry="3.2" fill="#000" opacity=".38" filter="url(#kb-blur)"/>'}
  <rect x="22" y=".6" width="26" height="5.6" rx="2.2" fill="${b2}" stroke="${edge}" stroke-width=".8"/>
  <rect x="25.5" y="2.3" width="8.5" height="1.3" rx=".65" fill="${edge}" opacity=".55"/><rect x="36" y="2.3" width="8.5" height="1.3" rx=".65" fill="${edge}" opacity=".55"/>
  <rect x="0" y="4" width="84" height="38" rx="8" fill="url(#${p}B)"/>
  <g clip-path="url(#${p}C)">
    <rect x="0" y="27.6" width="84" height="4" fill="${st}"/>
    <rect x="0" y="35" width="84" height="8" fill="${sk}"/><rect x="0" y="35" width="84" height=".8" fill="#fff" opacity=".55"/>
    <circle cx="17" cy="41.5" r="9.8" fill="#1b2433"/><circle cx="51" cy="41.5" r="9.8" fill="#1b2433"/>
  </g>
  <rect x=".5" y="4.5" width="83" height="37" rx="7.5" fill="none" stroke="${edge}" stroke-width="1"/>
  <rect x="5" y="6.1" width="54" height="1.3" rx=".65" fill="#fff" opacity=".85"/>
  <rect x="4" y="10" width="54" height="15" rx="3" fill="${gl}"/>
  <rect x="16.5" y="10" width="2" height="15" fill="${b1}"/><rect x="29" y="10" width="2" height="15" fill="${b1}"/><rect x="41.5" y="10" width="2" height="15" fill="${b1}"/>
  <path d="M6 25 L13 10 h4.5 L10.5 25z M32 25 L39 10 h2.4 L34.4 25z" fill="#fff" opacity=".2"/>
  <rect x="61" y="10" width="10.5" height="27" rx="2" fill="${gl}"/><path d="M66.25 10.5v26" stroke="${b1}" stroke-width="1.2"/>
  <rect x="62.6" y="20" width="2" height="6" rx="1" fill="#fff" opacity=".35"/>
  <path d="M74 10 h4 a4 4 0 0 1 4 4 v13 h-8z" fill="${gl}"/><path d="M75 26.5 L79 11 h1.6 L76.6 26.5z" fill="#fff" opacity=".22"/>
  <rect x="61" y="5.3" width="21" height="3.7" rx="1.2" fill="#0f172a"/><rect x="63" y="6.45" width="7.5" height="1.4" rx=".7" fill="#fbbf24"/><rect x="72" y="6.45" width="8" height="1.4" rx=".7" fill="#fbbf24" opacity=".7"/>
  <rect x="80" y="32.4" width="3.6" height="3.4" rx="1.2" fill="#fef9c3"/><circle cx="83" cy="34.1" r="4.2" fill="#fef08a" opacity=".22"/>
  <rect x=".4" y="29.3" width="2.4" height="6.2" rx="1" fill="#ef4444"/>
  <path d="M83 13 q4 0 4 4 v2.5" stroke="#334155" stroke-width="1.3" fill="none" stroke-linecap="round"/><rect x="85.5" y="18.5" width="2.8" height="5.6" rx="1.1" fill="#1f2937"/>
  ${wheel(17,41.5,o.rim)}${wheel(51,41.5,o.rim)}`;
}
/* אוטובוס מלפנים — 56×68 */
function busFront(p,o={}){
  const b1=o.b1||'#ffffff',b2=o.b2||'#dfe5ee',edge=o.edge||'#94a3b8',st=o.stripe||'#7c3aed';
  return `<defs><linearGradient id="${p}F" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></linearGradient></defs>
  <ellipse cx="28" cy="69" rx="31" ry="3" fill="#000" opacity=".35" filter="url(#kb-blur)"/>
  <path d="M2 13 q-6 0 -6 6 v4" stroke="#334155" stroke-width="1.7" fill="none" stroke-linecap="round"/><rect x="-8.5" y="21" width="5" height="10" rx="2" fill="#1f2937"/>
  <path d="M54 13 q6 0 6 6 v4" stroke="#334155" stroke-width="1.7" fill="none" stroke-linecap="round"/><rect x="59.5" y="21" width="5" height="10" rx="2" fill="#1f2937"/>
  <rect x="5" y="57" width="11" height="11" rx="3" fill="#0f172a"/><rect x="40" y="57" width="11" height="11" rx="3" fill="#0f172a"/>
  <rect x="0" y="0" width="56" height="62" rx="12" fill="url(#${p}F)" stroke="${edge}" stroke-width="1"/>
  <rect x="9" y="1.6" width="38" height="1.4" rx=".7" fill="#fff"/>
  <rect x="8" y="4.5" width="40" height="8" rx="3" fill="#0f172a"/><rect x="12" y="7.3" width="6" height="2.4" rx="1" fill="#fbbf24"/><rect x="21" y="7.3" width="23" height="2.4" rx="1" fill="#fbbf24" opacity=".75"/>
  <rect x="3.5" y="15.5" width="49" height="25" rx="4" fill="url(#kb-glass)"/>
  <path d="M7 40.5 L21 16 h7 L14 40.5z" fill="#fff" opacity=".17"/><path d="M31 40.5 L41 16 h2.6 L33.6 40.5z" fill="#fff" opacity=".12"/>
  <path d="M15 40 l11 -8 M39 40 l11 -8" stroke="#0b1220" stroke-width="1.3" stroke-linecap="round"/>
  <rect x=".5" y="43.5" width="55" height="3" fill="${st}"/>
  <rect x="4.5" y="48" width="11" height="5.4" rx="2.7" fill="#fff7d6" stroke="#b6c0cd" stroke-width=".8"/><rect x="40.5" y="48" width="11" height="5.4" rx="2.7" fill="#fff7d6" stroke="#b6c0cd" stroke-width=".8"/>
  <rect x="19" y="48" width="18" height="6" rx="2" fill="#cbd5e1"/><path d="M21 50.2 H35 M21 52.2 H35" stroke="#8a97ab" stroke-width=".8"/>
  <rect x="2" y="55" width="52" height="7" rx="3.5" fill="#334155"/><rect x="21" y="56.6" width="14" height="4" rx="1" fill="#facc15"/>`;
}
function star4(x,y,s,c,op=1){return `<path d="M${x} ${y-s} Q${x} ${y} ${x+s} ${y} Q${x} ${y} ${x} ${y+s} Q${x} ${y} ${x-s} ${y} Q${x} ${y} ${x} ${y-s}Z" fill="${c}" opacity="${op}"/>`}
function pt(cx,cy,r,a){const t=a*Math.PI/180;return [f(cx+r*Math.cos(t)),f(cy+r*Math.sin(t))]}
function arc(cx,cy,r,a0,a1){const [x0,y0]=pt(cx,cy,r,a0),[x1,y1]=pt(cx,cy,r,a1);return `M${x0} ${y0} A${r} ${r} 0 ${a1-a0>180?1:0} 1 ${x1} ${y1}`}
function ticks(cx,cy,r0,r1,a0,a1,n,attr){let s='';for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n,[x0,y0]=pt(cx,cy,r0,a),[x1,y1]=pt(cx,cy,r1,a);s+=`<path d="M${x0} ${y0} L${x1} ${y1}" ${attr}/>`}return s}
const FONT=`font-family="Rubik,sans-serif"`;

/* ===== 16 הסמלים ===== */
const ICON={
/* קו פח — אוטובוס לבן מאחורי פח אשפה אפור */
'kavpach':()=>tile('kavpach','#4b5a70','#0b1220',`
  <circle cx="60" cy="62" r="46" fill="#fff" opacity=".04"/>
  <g transform="translate(15 14) rotate(-9 42 24)">${busSide('kp',{stripe:'#94a3b8',b2:'#d0d7e1'})}
    <path d="M77 13.5 l2.6 3.4 -1.8 2.8 2.6 3.6 M79.6 16.9 l2 -.6" stroke="#fff" stroke-width=".8" fill="none" opacity=".85" stroke-linecap="round"/></g>
  <defs><linearGradient id="kpBin" x1="0" x2="1"><stop offset="0" stop-color="#2f3946"/><stop offset=".28" stop-color="#a3abb7"/><stop offset=".5" stop-color="#6b7584"/><stop offset="1" stop-color="#1c232e"/></linearGradient><linearGradient id="kpLid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7dce3"/><stop offset="1" stop-color="#4b5563"/></linearGradient></defs>
  <ellipse cx="60" cy="113" rx="30" ry="3.4" fill="#000" opacity=".5" filter="url(#kb-blur)"/>
  <g filter="url(#kb-drop)">
    <path d="M35 62 H85 L80.6 105.5 Q80 110.5 75 110.5 H45 Q40 110.5 39.4 105.5 Z" fill="url(#kpBin)"/>
    <path d="M36.3 74 H83.7" stroke="#11161e" stroke-opacity=".35" stroke-width="1.4"/>
    <path d="M47.5 78 L49.3 103 M60 78 V103 M72.5 78 L70.7 103" stroke="#151b24" stroke-opacity=".55" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M48.9 78 L50.6 103 M61.3 78 V103 M73.8 78 L72 103" stroke="#e5e7eb" stroke-opacity=".45" stroke-width=".9" stroke-linecap="round"/>
    <rect x="29.5" y="54" width="61" height="10" rx="4" fill="url(#kpLid)"/><rect x="32.5" y="55.2" width="55" height="1.4" rx=".7" fill="#fff" opacity=".7"/>
    <rect x="29.5" y="61.8" width="61" height="2.2" rx="1.1" fill="#111827" opacity=".35"/>
    <rect x="51" y="47.6" width="18" height="8" rx="3.5" fill="#4b5563"/><rect x="55" y="50.2" width="10" height="3" rx="1.5" fill="#0b1220"/><rect x="52.5" y="48.4" width="15" height="1" rx=".5" fill="#9ca3af"/>
    <circle cx="45" cy="110.2" r="3.6" fill="#0b1220"/><circle cx="45" cy="110.2" r="1.4" fill="#9ca3af"/><circle cx="75" cy="110.2" r="3.6" fill="#0b1220"/><circle cx="75" cy="110.2" r="1.4" fill="#9ca3af"/>
  </g>
  <path d="M86 56 q5 -12 13 -9" stroke="#fff" stroke-opacity=".45" stroke-width="1" stroke-dasharray="1.2 2.4" fill="none" stroke-linecap="round"/>
  <g><ellipse cx="99.5" cy="44.6" rx="2.6" ry="1.5" fill="#fff" opacity=".75" transform="rotate(-25 99.5 44.6)"/><ellipse cx="102" cy="45.6" rx="2.4" ry="1.4" fill="#fff" opacity=".6" transform="rotate(20 102 45.6)"/><circle cx="100.6" cy="47" r="1.6" fill="#0b1220"/></g>
  <g><ellipse cx="91.5" cy="36" rx="2" ry="1.2" fill="#fff" opacity=".7" transform="rotate(-25 91.5 36)"/><ellipse cx="93.6" cy="36.8" rx="1.9" ry="1.1" fill="#fff" opacity=".55" transform="rotate(20 93.6 36.8)"/><circle cx="92.5" cy="38" r="1.3" fill="#0b1220"/></g>`),

/* הקו המוזהב — אוטובוס זהב */
'golden':()=>{let rays='';for(let i=0;i<12;i++){const a=i*30,[x1,y1]=pt(60,60,80,a-5),[x2,y2]=pt(60,60,80,a+5);rays+=`<path d="M60 60 L${x1} ${y1} L${x2} ${y2}Z"/>`}
  return tile('golden','#a1520c','#1a0f04',`
  <defs><radialGradient id="gdGlow"><stop offset="0" stop-color="#fcd34d" stop-opacity=".7"/><stop offset="1" stop-color="#fcd34d" stop-opacity="0"/></radialGradient><linearGradient id="gdGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a1c"/><stop offset="1" stop-color="#3a2106"/></linearGradient><radialGradient id="gdRim" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff7d1"/><stop offset=".55" stop-color="#f6b71c"/><stop offset="1" stop-color="#8a4b08"/></radialGradient><linearGradient id="gdMed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b3"/><stop offset=".5" stop-color="#f5b40f"/><stop offset="1" stop-color="#a15c05"/></linearGradient></defs>
  <g fill="#fde68a" opacity=".1">${rays}</g>
  <circle cx="58" cy="62" r="42" fill="url(#gdGlow)"/>
  <g transform="translate(16 38)">${busSide('gd',{b1:'#fff4c4',b2:'#e39a0f',edge:'#8a4b08',stripe:'#9a520a',skirt:'#c27a0e',glass:'url(#gdGlass)',rim:'url(#gdRim)'})}<circle cx="9" cy="14" r="2.6" fill="#fff" opacity=".9"/></g>
  <g filter="url(#kb-drop)">
    <path d="M84 24 L79 44 L84.5 41 L87.5 46.5 L91 28z" fill="#dc2626"/><path d="M98 24 L103 44 L97.5 41 L94.5 46.5 L91 28z" fill="#b91c1c"/>
    <circle cx="91" cy="22" r="11" fill="url(#gdMed)"/><circle cx="91" cy="22" r="8" fill="none" stroke="#a15c05" stroke-width="1" opacity=".7"/>
    <path d="M91 16.2 l1.75 3.6 3.95 .55 -2.85 2.75 .7 3.9 -3.55 -1.85 -3.55 1.85 .7 -3.9 -2.85 -2.75 3.95 -.55z" fill="#fff8db"/>
  </g>
  ${star4(22,26,6.5,'#fff7d6')}${star4(33,16,3,'#fde68a',.9)}${star4(104,96,4.5,'#fff7d6',.9)}${star4(16,96,3.5,'#fde68a',.8)}${star4(62,24,2.6,'#fff',.8)}`)},

/* קו באג — זיגזג כתום מעל קו ירוק */
'kavbug':()=>tile('kavbug','#5b52f0','#1a1745',`
  <g fill="#fff" opacity=".06"><rect x="8" y="10" width="26" height="22" rx="3"/><rect x="42" y="10" width="30" height="14" rx="3"/><rect x="80" y="8" width="32" height="22" rx="3"/><rect x="8" y="94" width="40" height="18" rx="3"/><rect x="56" y="96" width="22" height="16" rx="3"/><rect x="86" y="92" width="26" height="20" rx="3"/></g>
  <path d="M0 89 H120 M38 0 V120 M78 0 V120" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>
  <g filter="url(#kb-drop)">
    <path d="M18 80 H102" stroke="#052e16" stroke-width="13.5" stroke-linecap="round"/><path d="M18 80 H102" stroke="#22c55e" stroke-width="9" stroke-linecap="round"/><path d="M20 78.4 H100" stroke="#bbf7d0" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>
    <polyline points="18,80 39,38 60,80 81,38 102,80" fill="none" stroke="#431407" stroke-width="14.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="18,80 39,38 60,80 81,38 102,80" fill="none" stroke="#f97316" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="18,78.5 39,36.5 60,78.5 81,36.5 102,78.5" fill="none" stroke="#fed7aa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
    <circle cx="18" cy="80" r="8.2" fill="#fff" stroke="#1e1b4b" stroke-width="3"/><circle cx="18" cy="80" r="2.8" fill="#1e1b4b"/>
    <circle cx="102" cy="80" r="8.2" fill="#fff" stroke="#1e1b4b" stroke-width="3"/><circle cx="102" cy="80" r="2.8" fill="#1e1b4b"/>
  </g>
  <g transform="translate(81 27) rotate(18)" filter="url(#kb-drop)">
    <path d="M-6 -3 l-4 -2 M-6 1 l-4.5 0 M-6 5 l-4 2 M6 -3 l4 -2 M6 1 l4.5 0 M6 5 l4 2 M-2 -9 l-2 -4 M2 -9 l2 -4" stroke="#1e1b4b" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="0" cy="-7.5" r="3.4" fill="#1e1b4b"/>
    <ellipse cx="0" cy="1.5" rx="7" ry="8" fill="#ef4444"/><path d="M0 -6.5 V9.5" stroke="#1e1b4b" stroke-width="1.2"/>
    <circle cx="-3.4" cy="-1" r="1.5" fill="#1e1b4b"/><circle cx="3.4" cy="-1" r="1.5" fill="#1e1b4b"/><circle cx="-3.6" cy="4.6" r="1.3" fill="#1e1b4b"/><circle cx="3.6" cy="4.6" r="1.3" fill="#1e1b4b"/>
    <ellipse cx="-3" cy="-3.2" rx="2" ry="1.2" fill="#fff" opacity=".5"/>
  </g>`),

/* התחנה הבאה — שלט תחנה עם לוח זמנים */
'next-station':()=>tile('next','#3b82f6','#0a2147',`
  <defs><linearGradient id="nsPole" x1="0" x2="1"><stop offset="0" stop-color="#5b6678"/><stop offset=".45" stop-color="#f1f5f9"/><stop offset="1" stop-color="#3f4a5c"/></linearGradient><linearGradient id="nsHead" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
  <ellipse cx="60" cy="111" rx="22" ry="3" fill="#000" opacity=".45" filter="url(#kb-blur)"/>
  <rect x="56.5" y="42" width="7" height="66" rx="2" fill="url(#nsPole)"/>
  <rect x="47" y="104" width="26" height="7" rx="3.5" fill="#1e293b"/><rect x="49.5" y="104.6" width="21" height="1.4" rx=".7" fill="#94a3b8"/>
  <g filter="url(#kb-drop)">
    <circle cx="60" cy="27" r="19.5" fill="#fff"/><circle cx="60" cy="27" r="19.5" fill="none" stroke="#cbd5e1" stroke-width="1"/>
    <circle cx="60" cy="27" r="15.8" fill="url(#nsHead)"/>
    <path d="M45 24 A15.8 15.8 0 0 1 75 24 Q60 19 45 24Z" fill="#fff" opacity=".18"/>
    <rect x="52" y="17.5" width="16" height="18" rx="3.6" fill="#fff"/><rect x="54.6" y="19.3" width="10.8" height="1.8" rx=".9" fill="#1e40af"/>
    <rect x="54" y="22.5" width="12" height="6.6" rx="1.5" fill="#1e40af"/><circle cx="55.6" cy="32" r="1.2" fill="#1e40af"/><circle cx="64.4" cy="32" r="1.2" fill="#1e40af"/>
    <rect x="53.3" y="35" width="3" height="3.4" rx="1" fill="#fff"/><rect x="63.7" y="35" width="3" height="3.4" rx="1" fill="#fff"/>
  </g>
  <rect x="54" y="48.5" width="12" height="3.4" rx="1" fill="#475569"/><rect x="54" y="88" width="12" height="3.4" rx="1" fill="#475569"/>
  <g filter="url(#kb-drop)">
    <rect x="33" y="51" width="54" height="39" rx="6" fill="#fff"/>
    <path d="M33 57 a6 6 0 0 1 6 -6 h42 a6 6 0 0 1 6 6 v3.6 H33z" fill="#1e3a8a"/>
    <rect x="56" y="54.4" width="25" height="2.6" rx="1.3" fill="#fff"/><rect x="39" y="54.4" width="12" height="2.6" rx="1.3" fill="#93c5fd"/>
    <rect x="38" y="64" width="13" height="8.4" rx="2.2" fill="#ef4444"/><text x="44.5" y="70.6" font-size="6.4" font-weight="800" fill="#fff" text-anchor="middle" ${FONT}>5</text>
    <rect x="53.5" y="64" width="13" height="8.4" rx="2.2" fill="#16a34a"/><text x="60" y="70.6" font-size="6.4" font-weight="800" fill="#fff" text-anchor="middle" ${FONT}>18</text>
    <rect x="69" y="64" width="13.5" height="8.4" rx="2.2" fill="#f59e0b"/><text x="75.75" y="70.6" font-size="6.4" font-weight="800" fill="#fff" text-anchor="middle" ${FONT}>480</text>
    <rect x="38" y="76" width="22" height="2.2" rx="1.1" fill="#cbd5e1"/><rect x="72" y="76" width="10.5" height="2.2" rx="1.1" fill="#64748b"/>
    <rect x="38" y="80.6" width="17" height="2.2" rx="1.1" fill="#cbd5e1"/><rect x="72" y="80.6" width="10.5" height="2.2" rx="1.1" fill="#64748b"/>
    <rect x="38" y="85.2" width="20" height="2.2" rx="1.1" fill="#e2e8f0"/><rect x="72" y="85.2" width="10.5" height="2.2" rx="1.1" fill="#94a3b8"/>
  </g>`),

/* הקו המדלג — אוטובוס קופץ מעל תחנה */
'skip-stops':()=>tile('skip','#f59e0b','#7a2a0e',`
  <circle cx="100" cy="22" r="10" fill="#fff7d6" opacity=".25"/><circle cx="100" cy="22" r="6" fill="#fff7d6" opacity=".45"/>
  <rect x="-2" y="86" width="124" height="15" fill="#3d1607" opacity=".45"/>
  <path d="M0 93.5 H120" stroke="#fde68a" stroke-width="1.6" stroke-dasharray="5 4" opacity=".55"/>
  <ellipse cx="60" cy="100" rx="16" ry="2" fill="#000" opacity=".3" filter="url(#kb-blur)"/>
  <path d="M18 88 Q60 4 102 88" stroke="#fff" stroke-width="2.6" stroke-dasharray=".5 5.5" stroke-linecap="round" fill="none" opacity=".95"/>
  <polyline points="95,80.5 100.4,87.6 103.2,79.2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="58.9" y="70" width="2.2" height="20" rx="1" fill="#fde68a"/>
  <circle cx="60" cy="68" r="5.2" fill="#fff"/><circle cx="60" cy="68" r="3.4" fill="#ef4444"/><rect x="57.8" y="67.3" width="4.4" height="1.4" rx=".7" fill="#fff"/>
  <g fill="#fff"><circle cx="70" cy="78.6" r="2.5"/><path d="M67.6 82.2 h4.8 a1 1 0 0 1 1 1 v6.4 h-6.8 v-6.4 a1 1 0 0 1 1 -1z"/></g>
  <path d="M72.5 83 L77 76.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
  <g filter="url(#kb-drop)">
    <circle cx="18" cy="93.5" r="6.6" fill="#fff" stroke="#7c2d12" stroke-width="2.6"/><circle cx="102" cy="93.5" r="6.6" fill="#fff" stroke="#7c2d12" stroke-width="2.6"/>
    <circle cx="60" cy="93.5" r="6.6" fill="#7c2d12" stroke="#fff" stroke-width="2.6"/>
  </g>
  <g stroke="#fff" stroke-linecap="round" opacity=".75"><path d="M14 30 h9" stroke-width="2.2"/><path d="M10 37.5 h12" stroke-width="2.2"/><path d="M16 45 h6" stroke-width="2.2"/></g>
  <g transform="translate(34 22) scale(.62) rotate(-6 42 24)">${busSide('sk',{stripe:'#ea580c',noShadow:true})}</g>`),

/* הקו בזמן — שעון שולחני עתיק */
'line-history':()=>{let tk='';for(let i=0;i<12;i++){const a=i*30*Math.PI/180,q=i%3==0,r0=q?11.6:12.8,r1=14.4;tk+=`<path d="M${f(60+r0*Math.sin(a))} ${f(65-r0*Math.cos(a))} L${f(60+r1*Math.sin(a))} ${f(65-r1*Math.cos(a))}" stroke="#3b2410" stroke-width="${q?1.6:.9}" stroke-linecap="round"/>`}
  const hand=(a,L)=>{const t=a*Math.PI/180;return `${f(60+L*Math.sin(t))} ${f(65-L*Math.cos(t))}`};
  return tile('hist','#8b5cf6','#2a0e5e',`
  <defs><linearGradient id="lhWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c2410c"/><stop offset=".5" stop-color="#7c2d12"/><stop offset="1" stop-color="#3b1408"/></linearGradient><linearGradient id="lhPl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a3412"/><stop offset="1" stop-color="#3b1408"/></linearGradient><linearGradient id="lhGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#f5b316"/><stop offset="1" stop-color="#8a4b08"/></linearGradient><radialGradient id="lhDial" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#efdcb4"/></radialGradient></defs>
  <ellipse cx="60" cy="109" rx="44" ry="3.4" fill="#000" opacity=".45" filter="url(#kb-blur)"/>
  <g filter="url(#kb-drop)">
    <ellipse cx="25" cy="104.5" rx="6" ry="3.2" fill="#5a1f0b"/><ellipse cx="95" cy="104.5" rx="6" ry="3.2" fill="#5a1f0b"/>
    <path d="M19 93 C19 74 31 70 37 60 C41 40 49 31 60 31 C71 31 79 40 83 60 C89 70 101 74 101 93 Z" fill="url(#lhWood)"/>
    <path d="M25.5 91 C25.5 77 35.5 73 41.5 63 C45.5 45 51.5 37.5 60 37.5 C68.5 37.5 74.5 45 78.5 63 C84.5 73 94.5 77 94.5 91" stroke="#fbbf24" stroke-width="1.1" fill="none" opacity=".75"/>
    <path d="M28.5 87 C29 77 36.5 72.5 42 63.5 C45 49 50 41 57 38.8" stroke="#fff" stroke-opacity=".28" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <rect x="13" y="91.5" width="94" height="11" rx="3.5" fill="url(#lhPl)"/><rect x="15" y="92.5" width="90" height="1.3" rx=".65" fill="#fdba74" opacity=".55"/>
    <rect x="46" y="94.5" width="28" height="6.4" rx="1.6" fill="url(#lhGold)"/><text x="60" y="99.6" font-size="5.2" font-weight="800" fill="#4a2508" text-anchor="middle" ${FONT}>2003</text>
    <rect x="58.4" y="24" width="3.2" height="8.5" rx="1" fill="url(#lhGold)"/><circle cx="60" cy="22.5" r="4.2" fill="url(#lhGold)"/><circle cx="58.8" cy="21.2" r="1.2" fill="#fff" opacity=".8"/>
    <circle cx="60" cy="65" r="20.5" fill="url(#lhGold)"/><circle cx="60" cy="65" r="17.4" fill="#6b2a0e"/><circle cx="60" cy="65" r="16" fill="url(#lhDial)"/>
    ${tk}
    <path d="M60 65 L${hand(305,8)}" stroke="#1f2937" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M60 65 L${hand(60,12.2)}" stroke="#1f2937" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M${hand(200,-3.5)} L${hand(200,13)}" stroke="#dc2626" stroke-width=".8" stroke-linecap="round"/>
    <circle cx="60" cy="65" r="2" fill="#1f2937"/><circle cx="60" cy="65" r=".8" fill="#fbbf24"/>
    <path d="M47.5 58 A14.5 14.5 0 0 1 61 50.6" stroke="#fff" stroke-opacity=".7" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </g>`)},

/* המחירון — כרטיס נסיעה */
'fares':()=>{let bc='',x=23;[1.2,.6,.6,1.6,.6,1,.6,1.8,.6,.6,1.2,.6,1.6,.6,1,.6,.6,1.4,.6,1].forEach((w,i)=>{if(i%2==0)bc+=`<rect x="${f(x)}" y="77" width="${w}" height="5.5" fill="#1f2937"/>`;x+=w+.9});
  return tile('fares','#10b981','#022c22',`
  <defs><linearGradient id="faPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3f5ec"/></linearGradient><linearGradient id="faStub" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#047857"/></linearGradient><linearGradient id="faChip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".5" stop-color="#f4b521"/><stop offset="1" stop-color="#b26b07"/></linearGradient>
  <mask id="faM"><rect width="120" height="120" fill="#fff"/><circle cx="78" cy="40" r="5" fill="#000"/><circle cx="78" cy="86" r="5" fill="#000"/></mask></defs>
  <g transform="rotate(11 60 60)"><rect x="22" y="32" width="82" height="46" rx="8" fill="#a7f3d0" opacity=".28"/><rect x="22" y="32" width="82" height="46" rx="8" fill="none" stroke="#fff" stroke-opacity=".3"/></g>
  <ellipse cx="60" cy="100" rx="42" ry="3" fill="#000" opacity=".35" filter="url(#kb-blur)"/>
  <g transform="rotate(-9 60 63)">
    <g filter="url(#kb-drop)"><g mask="url(#faM)">
      <rect x="16" y="40" width="90" height="46" rx="7" fill="url(#faPaper)"/>
      <path d="M78 40 h21 a7 7 0 0 1 7 7 v32 a7 7 0 0 1 -7 7 h-21z" fill="url(#faStub)"/>
      <rect x="16" y="40" width="90" height="2.2" fill="#fff" opacity=".9"/>
    </g></g>
    <path d="M78 46.5 V79.5" stroke="#065f46" stroke-width="1.4" stroke-dasharray="2 2.4"/>
    <text x="92.5" y="70.5" font-size="21" font-weight="800" fill="#fff" text-anchor="middle" ${FONT}>₪</text>
    <circle cx="92.5" cy="50" r="1.4" fill="#d1fae5"/><circle cx="88" cy="50" r="1.4" fill="#d1fae5" opacity=".6"/><circle cx="97" cy="50" r="1.4" fill="#d1fae5" opacity=".6"/>
    <rect x="23" y="48.5" width="15" height="12" rx="2.5" fill="url(#faChip)"/><path d="M23 54.5 h15 M30.5 48.5 v12 M23 51.5 h4.5 M33.5 51.5 h4.5 M23 57.5 h4.5 M33.5 57.5 h4.5" stroke="#8a4b08" stroke-width=".7" opacity=".7"/>
    <rect x="43" y="49.5" width="28" height="3.6" rx="1.8" fill="#064e3b"/><rect x="43" y="56" width="19" height="2.6" rx="1.3" fill="#94a3b8"/>
    <circle cx="25.5" cy="68.5" r="2.4" fill="#10b981"/><path d="M28.5 68.5 H52.5" stroke="#10b981" stroke-width="1.6" stroke-dasharray="2.5 2"/><circle cx="55.5" cy="68.5" r="2.4" fill="none" stroke="#10b981" stroke-width="1.6"/>
    <rect x="62" y="66.4" width="10" height="4.2" rx="2.1" fill="#d1fae5"/>
    ${bc}
  </g>
  <defs><linearGradient id="faCoin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#f2b01e"/><stop offset="1" stop-color="#9a5a06"/></linearGradient></defs>
  <g filter="url(#kb-drop)"><circle cx="96" cy="96" r="12" fill="url(#faCoin)"/><circle cx="96" cy="96" r="9" fill="none" stroke="#9a5a06" stroke-width="1.1" opacity=".7"/><text x="96" y="100.4" font-size="11" font-weight="800" fill="#7a4505" text-anchor="middle" ${FONT}>₪</text><path d="M88 90 A10 10 0 0 1 96 86" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/></g>`)},

/* רציף כפול — שני אוטובוסים ברציף אחד ושעון */
'ratzif':()=>{const top=(x,p)=>`<g filter="url(#kb-drop)">
    <rect x="${x-2.6}" y="40" width="2.6" height="4.4" rx="1" fill="#1f2937"/><rect x="${x+24}" y="40" width="2.6" height="4.4" rx="1" fill="#1f2937"/>
    <rect x="${x}" y="36" width="24" height="72" rx="6" fill="url(#rzRoof)"/>
    <rect x="${x+2.5}" y="38" width="19" height="7.5" rx="3" fill="url(#kb-glass)"/><path d="M${x+5} 45.5 L${x+9} 38 h3 L${x+8} 45.5z" fill="#fff" opacity=".22"/>
    <rect x="${x}" y="49" width="1.6" height="52" fill="#0891b2"/><rect x="${x+22.4}" y="49" width="1.6" height="52" fill="#0891b2"/>
    <rect x="${x+5}" y="52" width="14" height="15" rx="2.5" fill="#a7b3c4"/><path d="M${x+7} 55.5 h10 M${x+7} 58.5 h10 M${x+7} 61.5 h10 M${x+7} 64.5 h10" stroke="#7b8799" stroke-width=".9"/>
    <rect x="${x+5}" y="73" width="14" height="10" rx="2" fill="#bcc6d3"/><circle cx="${x+12}" cy="78" r="3" fill="#94a3b8"/>
    <rect x="${x+8}" y="89" width="8" height="6" rx="1" fill="none" stroke="#94a3b8" stroke-width="1"/>
    <rect x="${x+4}" y="102.5" width="16" height="3" rx="1.5" fill="url(#kb-glass)"/>
  </g>`;
  return tile('ratzif','#06b6d4','#062a37',`
  <defs><linearGradient id="rzRoof" x1="0" x2="1"><stop offset="0" stop-color="#b8c3d1"/><stop offset=".35" stop-color="#ffffff"/><stop offset=".7" stop-color="#e6ebf2"/><stop offset="1" stop-color="#94a3b8"/></linearGradient><linearGradient id="rzCan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0fdff"/><stop offset="1" stop-color="#a5f3fc"/></linearGradient><linearGradient id="rzClock" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".5" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs>
  <rect x="16" y="30" width="88" height="92" fill="#04161d" opacity=".3"/>
  <path d="M23 36 V118 M97 36 V118" stroke="#e0f2fe" stroke-width="2" stroke-dasharray="5 4" opacity=".7"/>
  ${top(31,'a')}${top(65,'b')}
  <rect x="59" y="29" width="2" height="20" fill="#e0f2fe"/>
  <circle cx="60" cy="60" r="21" fill="none" stroke="#fca5a5" stroke-width="1.4" opacity=".35"/><circle cx="60" cy="60" r="16" fill="none" stroke="#f87171" stroke-width="1.6" opacity=".75"/>
  <g filter="url(#kb-drop)">
    <circle cx="60" cy="60" r="11.5" fill="url(#rzClock)" stroke="#78350f" stroke-width="1.5"/><circle cx="60" cy="60" r="8.4" fill="#fffbeb"/>
    ${ticks(60,60,6.4,7.8,-90,240,11,'stroke="#78350f" stroke-width=".9" stroke-linecap="round"')}
    <path d="M60 60 V54.2 M60 60 L64.2 62" stroke="#78350f" stroke-width="1.7" stroke-linecap="round"/><circle cx="60" cy="60" r="1.3" fill="#78350f"/>
  </g>
  <g filter="url(#kb-drop)">
    <rect x="10" y="9" width="100" height="21" rx="6" fill="url(#rzCan)"/><rect x="13" y="10.2" width="94" height="1.4" rx=".7" fill="#fff"/>
    <rect x="37" y="12.6" width="46" height="14" rx="4" fill="#083344"/><text x="60" y="22.8" font-size="9" font-weight="800" fill="#fff" text-anchor="middle" direction="rtl" ${FONT}>רציף 1</text>
    <circle cx="17" cy="19.5" r="2.2" fill="#0e7490"/><circle cx="103" cy="19.5" r="2.2" fill="#0e7490"/>
  </g>`)},

/* צי הרכבים — תיקייה כחולה עם אוטובוס */
'fleet':()=>tile('fleet','#64748b','#0a1120',`
  <defs><linearGradient id="flFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs>
  <ellipse cx="60" cy="108" rx="46" ry="3.4" fill="#000" opacity=".45" filter="url(#kb-blur)"/>
  <g filter="url(#kb-drop)">
    <path d="M19 26 h22.5 a4 4 0 0 1 3.2 1.6 l5 6.4 H102 a5 5 0 0 1 5 5 V99 a5 5 0 0 1 -5 5 H18 a5 5 0 0 1 -5 -5 V31 a5 5 0 0 1 5 -5z" fill="#1e40af"/>
    <rect x="19" y="27.2" width="22" height="1.2" rx=".6" fill="#93c5fd" opacity=".6"/>
  </g>
  <g transform="rotate(-5 60 60)"><rect x="23" y="33" width="68" height="48" rx="3" fill="#dbe3ee"/></g>
  <g transform="rotate(3.5 60 60)"><rect x="28" y="34" width="66" height="46" rx="3" fill="#fff"/><rect x="34" y="40" width="30" height="2.8" rx="1.4" fill="#64748b"/><rect x="34" y="45.5" width="46" height="2" rx="1" fill="#cbd5e1"/><rect x="34" y="49.5" width="38" height="2" rx="1" fill="#cbd5e1"/><rect x="80" y="38.5" width="8" height="8" rx="1.5" fill="#bfdbfe"/></g>
  <g filter="url(#kb-drop)">
    <path d="M13 51 a5 5 0 0 1 5 -5 H102 a5 5 0 0 1 5 5 V99 a5 5 0 0 1 -5 5 H18 a5 5 0 0 1 -5 -5z" fill="url(#flFront)"/>
    <rect x="16" y="47.3" width="88" height="1.4" rx=".7" fill="#dbeafe" opacity=".9"/>
  </g>
  <g transform="translate(32 54) scale(.66)">${busSide('fl',{stripe:'#2563eb'})}</g>
  <g filter="url(#kb-drop)"><rect x="43" y="91" width="34" height="8" rx="1.8" fill="#facc15" stroke="#1f2937" stroke-width=".8"/><rect x="43.4" y="91.4" width="3.6" height="7.2" rx="1.2" fill="#1d4ed8"/><text x="61.5" y="97" font-size="4.6" font-weight="700" fill="#111827" text-anchor="middle" direction="ltr" font-family="IBM Plex Mono,monospace">12-345-67</text></g>`),

/* מדד אמינות הרכבת — חזית רכבת בין-עירונית */
'rail':()=>{let sl='';[[77,1.4],[82,1.8],[89,2.4],[98,3],[110,3.8]].forEach(([y,h])=>{const hw=f(9+(y-74)*1.1);sl+=`<rect x="${f(60-hw)}" y="${y}" width="${f(hw*2)}" height="${h}" rx=".8" fill="#5b4636" opacity=".85"/>`});
  return tile('rail','#0ea5e9','#0b1324',`
  <defs><linearGradient id="raBody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d6dee9"/><stop offset=".4" stop-color="#ffffff"/><stop offset="1" stop-color="#c3cdda"/></linearGradient><linearGradient id="raLow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4b63"/><stop offset="1" stop-color="#151e2e"/></linearGradient><linearGradient id="raRail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#94a3b8"/><stop offset="1" stop-color="#e2e8f0"/></linearGradient><radialGradient id="raLamp"><stop offset="0" stop-color="#fffbe6"/><stop offset="1" stop-color="#fffbe6" stop-opacity="0"/></radialGradient></defs>
  <path d="M50 74 H70 L114 120 H6 Z" fill="#0b1220" opacity=".45"/>
  ${sl}
  <path d="M55 74 L28 120 M65 74 L92 120" stroke="url(#raRail)" stroke-width="2.4"/>
  <ellipse cx="60" cy="104" rx="34" ry="3" fill="#000" opacity=".5" filter="url(#kb-blur)"/>
  <g filter="url(#kb-drop)">
    <path d="M27 99 V46 C27 25 41 15 60 15 C79 15 93 25 93 46 V99 Z" fill="url(#raBody)"/>
    <path d="M27 70 H93 V99 H27Z" fill="url(#raLow)"/>
    <rect x="27" y="63.5" width="66" height="5" fill="#dc2626"/><rect x="27" y="68.5" width="66" height="1.4" fill="#fff" opacity=".9"/>
    <path d="M34.5 50 C34.5 32 45 24 60 24 C75 24 85.5 32 85.5 50 V56.5 H34.5Z" fill="url(#kb-glass)"/>
    <path d="M38.5 55.5 L52 27.5 h8 L46.5 55.5z" fill="#fff" opacity=".17"/><path d="M62 55.5 L72 29 h3 L65 55.5z" fill="#fff" opacity=".1"/>
    <path d="M47 56 l13 -10" stroke="#0b1220" stroke-width="1.3" stroke-linecap="round"/>
    <rect x="44" y="58.6" width="32" height="4" rx="1.2" fill="#0b1220"/><rect x="46.5" y="59.8" width="9" height="1.6" rx=".8" fill="#fbbf24"/><rect x="57.5" y="59.8" width="16" height="1.6" rx=".8" fill="#fbbf24" opacity=".7"/>
    <circle cx="38" cy="77" r="8" fill="url(#raLamp)" opacity=".7"/><circle cx="82" cy="77" r="8" fill="url(#raLamp)" opacity=".7"/>
    <rect x="32" y="74" width="12" height="6" rx="3" fill="#fffbe6"/><rect x="76" y="74" width="12" height="6" rx="3" fill="#fffbe6"/>
    <circle cx="35" cy="86" r="1.9" fill="#f87171"/><circle cx="85" cy="86" r="1.9" fill="#f87171"/>
    <rect x="52" y="84" width="16" height="10" rx="2" fill="#64748b"/><rect x="56" y="86.6" width="8" height="4.6" rx="1" fill="#1f2937"/>
    <path d="M28 99 H92 L87 105 H33Z" fill="#0b1220"/>
    <path d="M28.6 96 V46 C28.6 28 40 18.5 55 16.8" stroke="#fff" stroke-opacity=".85" stroke-width="1.2" fill="none"/>
  </g>`)},

/* קליטה ברכבת — פסי קליטה, אנטנה ורכבת שנכנסת למנהרה */
'reception':()=>{const bars=[[50,14],[63,26],[76,38],[89,50]].map(([x,h],i)=>i<3?`<rect x="${x}" y="${80-h}" width="10" height="${h}" rx="3" fill="url(#reBar)"/><rect x="${x+1.5}" y="${81.5-h}" width="1.6" height="${h-3}" rx=".8" fill="#fff" opacity=".8"/>`:`<rect x="${x}" y="${80-h}" width="10" height="${h}" rx="3" fill="#fff" opacity=".14"/><rect x="${x+.6}" y="${80.6-h}" width="8.8" height="${h-1.2}" rx="2.6" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 2"/>`).join('');
  return tile('recep','#7c3aed','#0d0a24',`
  <defs><linearGradient id="reBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient><clipPath id="reTr"><rect x="0" y="0" width="84" height="120"/></clipPath></defs>
  <g stroke="#ede9fe" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 84 L25 34 L33 84"/><path d="M20.4 68 H29.6 M22.3 56 H27.7 M23.6 45.5 H26.4"/><path d="M20.4 68 L27.7 56 L22.3 56 L26.4 45.5"/></g>
  <circle cx="25" cy="31" r="3.2" fill="#fff"/>
  <g stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"><path d="M18.5 25 A9 9 0 0 0 18.5 37" opacity=".85"/><path d="M31.5 25 A9 9 0 0 1 31.5 37" opacity=".85"/><path d="M14 20.5 A15 15 0 0 0 14 41.5" opacity=".45"/><path d="M36 20.5 A15 15 0 0 1 36 41.5" opacity=".45"/></g>
  <g filter="url(#kb-drop)">${bars}</g>
  <g filter="url(#kb-drop)"><rect x="84" y="15" width="22" height="12" rx="6" fill="#fff"/><text x="95" y="23.8" font-size="7.6" font-weight="800" fill="#6d28d9" text-anchor="middle" direction="ltr" ${FONT}>5G</text></g>
  <path d="M68 112 Q70 84 96 82 Q118 82 124 94 V112Z" fill="#3b1a85"/>
  <path d="M80 112 V101 a12 12 0 0 1 24 0 V112z" fill="#06040f"/>
  <path d="M80 112 V101 a12 12 0 0 1 24 0 V112" stroke="#c4b5fd" stroke-width="2.6" fill="none" stroke-dasharray="4 1.6"/>
  <rect x="0" y="108" width="120" height="2.4" fill="#ddd6fe" opacity=".85"/>
  <g clip-path="url(#reTr)"><g filter="url(#kb-drop)">
    <path d="M4 91 H82 a12 12 0 0 1 12 12 V106 H4z" fill="#fff"/>
    <rect x="4" y="94" width="66" height="6" rx="1.5" fill="url(#kb-glass)"/><path d="M15 94 v6 M26 94 v6 M37 94 v6 M48 94 v6 M59 94 v6" stroke="#fff" stroke-width="1.4"/>
    <rect x="4" y="101.6" width="90" height="1.8" fill="#dc2626"/>
    <circle cx="14" cy="107" r="2.4" fill="#1f2937"/><circle cx="22" cy="107" r="2.4" fill="#1f2937"/><circle cx="62" cy="107" r="2.4" fill="#1f2937"/><circle cx="70" cy="107" r="2.4" fill="#1f2937"/>
  </g></g>`)},

/* הקו המודיע — אוטובוס עם בועת דיבור ובה סימן קריאה */
'alerts':()=>tile('alerts','#8b5cf6','#ec4899',`
  <defs><linearGradient id="alRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#be123c"/></linearGradient></defs>
  <path d="M-4 104 C30 98 50 112 124 100" stroke="#fff" stroke-opacity=".18" stroke-width="10" fill="none"/>
  <path d="M-4 104 C30 98 50 112 124 100" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-dasharray="4 4" fill="none"/>
  <g transform="translate(15 45)">${busFront('al',{stripe:'#7c3aed'})}</g>
  <g filter="url(#kb-drop)">
    <path d="M66 9 h38 a10 10 0 0 1 10 10 v21 a10 10 0 0 1 -10 10 h-22 l-12.5 11 v-11 h-3.5 a10 10 0 0 1 -10 -10 v-21 a10 10 0 0 1 10 -10z" fill="#fff"/>
  </g>
  <path d="M60 12 h40" stroke="#ede9fe" stroke-width="1.2" stroke-linecap="round"/>
  <rect x="81.5" y="15" width="7.4" height="19" rx="3.7" fill="url(#alRed)"/><rect x="83" y="16.5" width="1.8" height="10" rx=".9" fill="#fff" opacity=".55"/>
  <circle cx="85.2" cy="41.5" r="4.2" fill="#e11d48"/>
  <g stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".85"><path d="M106 60 l6 3.5"/><path d="M101 66 l3.6 5.6"/></g>`),

/* איפה האוטובוס נתקע — מד מהירות */
'bus-speed':()=>{const cx=60,cy=64;const [nx,ny]=pt(cx,cy,28,170),[bx1,by1]=pt(cx,cy,2.6,260),[bx2,by2]=pt(cx,cy,2.6,80),[tx,ty]=pt(cx,cy,7,350);
  return tile('speed','#ef4444','#6b1212',`
  <defs><linearGradient id="bsBez" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset=".5" stop-color="#8a94a6"/><stop offset="1" stop-color="#2b3340"/></linearGradient><radialGradient id="bsFace" cx=".5" cy=".4" r=".65"><stop offset="0" stop-color="#3a4352"/><stop offset="1" stop-color="#0a0e16"/></radialGradient></defs>
  <ellipse cx="60" cy="110" rx="36" ry="3" fill="#000" opacity=".45" filter="url(#kb-blur)"/>
  <g filter="url(#kb-drop)"><circle cx="${cx}" cy="${cy}" r="44" fill="url(#bsBez)"/><circle cx="${cx}" cy="${cy}" r="40.5" fill="#0b0f17"/><circle cx="${cx}" cy="${cy}" r="39" fill="url(#bsFace)"/></g>
  <path d="${arc(cx,cy,31,150,390)}" stroke="#fff" stroke-opacity=".08" stroke-width="7" fill="none"/>
  <path d="${arc(cx,cy,31,150,208)}" stroke="#ef4444" stroke-width="7" fill="none"/>
  <path d="${arc(cx,cy,31,211,288)}" stroke="#f59e0b" stroke-width="7" fill="none"/>
  <path d="${arc(cx,cy,31,291,390)}" stroke="#22c55e" stroke-width="7" fill="none"/>
  ${ticks(cx,cy,23.5,26.5,150,390,8,'stroke="#fff" stroke-width="1.6" stroke-linecap="round"')}
  ${ticks(cx,cy,24.8,26.5,165,375,7,'stroke="#fff" stroke-opacity=".5" stroke-width="1" stroke-linecap="round"')}
  <text x="${pt(cx,cy,17.5,150)[0]}" y="${pt(cx,cy,17.5,150)[1]+1.5}" font-size="5.5" font-weight="700" fill="#cbd5e1" text-anchor="middle" ${FONT}>0</text>
  <text x="${pt(cx,cy,17.5,390)[0]}" y="${pt(cx,cy,17.5,390)[1]+1.5}" font-size="5.5" font-weight="700" fill="#cbd5e1" text-anchor="middle" ${FONT}>80</text>
  <rect x="48" y="80" width="24" height="12" rx="3" fill="#06080d" stroke="#ef4444" stroke-opacity=".7" stroke-width=".8"/>
  <text x="60" y="89.2" font-size="8.6" font-weight="600" fill="#fca5a5" text-anchor="middle" font-family="IBM Plex Mono,monospace">12</text>
  <text x="60" y="98.6" font-size="4.6" font-weight="700" fill="#94a3b8" text-anchor="middle" ${FONT}>קמ״ש</text>
  <g filter="url(#kb-drop)"><path d="M${nx} ${ny} L${bx1} ${by1} L${tx} ${ty} L${bx2} ${by2}Z" fill="#fde047"/><circle cx="${cx}" cy="${cy}" r="6" fill="url(#kb-rim)"/><circle cx="${cx}" cy="${cy}" r="2.2" fill="#1f2937"/></g>
  <path d="M27 56 A34 34 0 0 1 93 56 Q60 45 27 56Z" fill="#fff" opacity=".07"/>
  <circle cx="60" cy="64" r="43" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".8" stroke-dasharray="0 0"/>`)},

/* הקו המזין — רכבת שהקרון האחרון שלה הוא אוטובוס */
'feeder':()=>{let sl='';for(let x=2;x<120;x+=9)sl+=`<rect x="${x}" y="98" width="5" height="4.5" rx="1" fill="#052e16" opacity=".55"/>`;
  return tile('feeder','#22c55e','#0f3d21',`
  <defs><linearGradient id="fdBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d7e3dc"/></linearGradient><clipPath id="fdC"><path d="M6 89 V66 C6 52 16 44 32 44 H62 V89 Z"/></clipPath></defs>
  <path d="M0 34 H66" stroke="#fff" stroke-opacity=".45" stroke-width="1"/>
  ${sl}<rect x="0" y="95" width="120" height="3" fill="#dcfce7"/>
  <ellipse cx="60" cy="96" rx="58" ry="2" fill="#000" opacity=".3" filter="url(#kb-blur)"/>
  <path d="M28 44 L36 34.5 L44 44 M27 34.5 H45" stroke="#e2e8f0" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  <g filter="url(#kb-drop)">
    <path d="M6 89 V66 C6 52 16 44 32 44 H62 V89 Z" fill="url(#fdBody)"/>
    <g clip-path="url(#fdC)"><rect x="0" y="68" width="62" height="3.4" fill="#16a34a"/><rect x="0" y="80" width="62" height="9" fill="#c2d0c8"/><rect x="0" y="80" width="62" height=".8" fill="#fff"/></g>
    <path d="M10.5 63 C12 55.5 18 51 26.5 51 V63Z" fill="url(#kb-glass)"/><path d="M13 62 L20 52.5 h3 L16 62z" fill="#fff" opacity=".22"/>
    <rect x="31" y="51" width="7.5" height="10" rx="1.6" fill="url(#kb-glass)"/><rect x="41" y="51" width="7.5" height="10" rx="1.6" fill="url(#kb-glass)"/><rect x="51" y="51" width="7.5" height="10" rx="1.6" fill="url(#kb-glass)"/>
    <rect x="6.5" y="74" width="4.4" height="3.2" rx="1" fill="#fef9c3"/>
    <path d="M10 46.5 C16 45 22 44.6 32 44.6 H60" stroke="#fff" stroke-width="1.2" fill="none"/>
    <rect x="62" y="80" width="7" height="3.6" rx="1" fill="#334155"/>
    ${[16,25,43,52].map(x=>`<circle cx="${x}" cy="90.5" r="4.6" fill="url(#kb-tire)"/><circle cx="${x}" cy="90.5" r="2.3" fill="url(#kb-rim)"/>`).join('')}
  </g>
  <g transform="translate(68 67) scale(.56)">${busSide('fd',{stripe:'#16a34a'})}</g>
  <g filter="url(#kb-drop)"><rect x="99.2" y="34" width="1.6" height="16" fill="#dcfce7"/><circle cx="100" cy="26" r="9" fill="#fff"/><circle cx="100" cy="26" r="7" fill="none" stroke="#16a34a" stroke-width="1.4"/><path d="M100 26 V21.5 M100 26 L103.4 27.6" stroke="#14532d" stroke-width="1.5" stroke-linecap="round"/></g>`)},

/* מדד דיוק האוטובוסים — אוטובוס עירוני ושעון עצר */
'bus':()=>tile('bus','#10b981','#063b2c',`
  <path d="M12 108.5 H108" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>
  ${[18,44,70].map(x=>`<circle cx="${x}" cy="108.5" r="4.4" fill="#4ade80" stroke="#fff" stroke-width="2"/>`).join('')}<circle cx="96" cy="108.5" r="4.4" fill="#fbbf24" stroke="#fff" stroke-width="2"/>
  <g transform="translate(13 51)">${busSide('bu',{stripe:'#059669'})}</g>
  <g filter="url(#kb-drop)">
    <rect x="88.6" y="10.5" width="7" height="5" rx="1.5" fill="#e2e8f0"/><rect x="90.6" y="14.5" width="3" height="4" fill="#cbd5e1"/>
    <rect x="103.5" y="15.5" width="5.4" height="4" rx="1.2" transform="rotate(45 106.2 17.5)" fill="#e2e8f0"/>
    <circle cx="92" cy="33" r="15.5" fill="#fff"/>
    <circle cx="92" cy="33" r="12" fill="#ecfdf5"/>
    <path d="${arc(92,33,12,-90,220)}" stroke="#10b981" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M86 33.5 l4 4 l8 -8.6" stroke="#047857" stroke-width="3.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`),

/* נגישות אזורי תעשייה — הסמל המקורי של אתר השותפים, על אריח לבן */
'parks':()=>`<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><clipPath id="cl-parks"><rect width="120" height="120" rx="28"/></clipPath></defs><g clip-path="url(#cl-parks)"><rect width="120" height="120" fill="#fff"/><image href="parks/icon-180.png" x="0" y="0" width="120" height="120"/></g><rect x=".75" y=".75" width="118.5" height="118.5" rx="27.25" fill="none" stroke="#0f172a" stroke-opacity=".1" stroke-width="1.5"/></svg>`
};

const DEFS = `<svg class="kb-defs" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"> <defs> <linearGradient id="kb-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient> <linearGradient id="kb-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46669a"/><stop offset="1" stop-color="#121d36"/></linearGradient> <radialGradient id="kb-rim" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#b8c2d1"/><stop offset="1" stop-color="#5b6678"/></radialGradient> <radialGradient id="kb-tire" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#3b4352"/><stop offset="1" stop-color="#0a0e16"/></radialGradient> <filter id="kb-blur" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="1.8"/></filter> <filter id="kb-drop" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="2.4" stdDeviation="2.2" flood-color="#000" flood-opacity=".32"/></filter> </defs> </svg>`;
function ensureDefs() { if (typeof document === 'undefined' || document.getElementById('kb-sheen')) return; document.body.insertAdjacentHTML('afterbegin', DEFS); }

/* ===== הכלים בדף הבית — שם, תיאור, קישור, מפתח ב-versions.json, צבע ===== */
const GROUPS = [
 {id:'g-lines',name:'קווים ותחנות',tools:[
  {k:'kavpach',n:'קו פח',d:'קווים ריקים ובזבזניים — מועמדים לביטול או צמצום',h:'#פח',pick:'kavpach',vk:'kavpach',a:'#64748b',wide:1},
  {k:'golden',n:'הקו המוזהב',d:'הקווים המצטיינים — הסטנדרט שאליו כדאי לשאוף',h:'#מוזהב',pick:'golden',vk:'kavpach',a:'#d97706',wide:1},
  {k:'kavbug',n:'קו באג',d:'תקלות גאומטריות במסלולי הקווים — עיקופים ובליטות מיותרים',h:'https://transit-freak.github.io/kav-bug/',ext:1,vk:'kavbug',a:'#6366f1'},
  {k:'next-station',n:'התחנה הבאה',d:'תחנות ששמן אינו תואם לרחוב שבכתובת',h:'next-station/',vk:'next-station',a:'#2563eb'},
  {k:'skip-stops',n:'הקו המדלג',d:'קווים שחולפים ליד תחנה פעילה — בלי לעצור בה',h:'skip-stops/',vk:'skip-stops',a:'#ea580c'},
  {k:'line-history',n:'הקו בזמן',d:'היסטוריית קווים מ-2003 ועד היום — מסלול, שרטוט, תחנות, שמות ולוחות זמנים',h:'line-history/',vk:'line-history',a:'#7c3aed'}]},
 {id:'g-live',name:'ביצועים בשטח',tools:[
  {k:'bus',n:'מדד דיוק האוטובוסים',d:'כל אוטובוס בארץ מול הלו"ז, תחנה אחרי תחנה: כמה הגיעו בזמן, מי יצא מוקדם ומי איחר ואיפה לאורך הקו — לפי קו, מפעיל, עיר ושעה, יום אחרי יום, מנתוני דאטאבוס',h:'bus/',vk:'bus',a:'#059669'},
  {k:'bus-speed',n:'איפה האוטובוס נתקע',d:'המהירות של האוטובוסים בכל רחוב ובכל שעה, לפי המיקום שהם משדרים: איפה נתקעים, מתי, ואיזה יישוב הכי עמוס',h:'bus-speed/',vk:'bus-speed',a:'#dc2626'},
  {k:'alerts',n:'הקו המודיע',d:'עבודות, אירועים, הפגנות וחסימות: כל השינויים הזמניים בקווים, עם המסלול העוקף על המפה, התחנות שבוטלו זמנית והתחנות החלופיות',h:'alerts/',vk:'alerts',a:'#c026d3'},
  {k:'fleet',n:'צי הרכבים',d:'כל האוטובוסים שנצפו בשידורי האיכון — לאיזו חברה כל רכב שייך, מאיזו שנה, מתי נצפה ומה פרטיו במאגר הרישוי',h:'fleet/',vk:'fleet',a:'#2563eb'}]},
 {id:'g-rail',name:'רכבת',tools:[
  {k:'rail',n:'מדד אמינות הרכבת',d:'כל רכבת שבלו"ז מול המיקום ששידרה בפועל: כמה רכבות הגיעו בזמן, איחור לפי קו, תחנה ושעה, וכל נסיעה על המפה — יום אחרי יום, מנתוני דאטאבוס',h:'rail/',vk:'rail',a:'#0284c7'},
  {k:'reception',n:'קליטה ברכבת',d:'איפה יש קליטה סלולרית ברכבת ואיפה לא: כל 100 מטר מסילה לפי האנטנות של כל חברה, המנהרות, מהירות הנסיעה בפועל וסוג הקרון — פלאפון, סלקום, פרטנר והוט, דור 4 ודור 5',h:'rail/reception/',vk:'reception',a:'#7c3aed'},
  {k:'feeder',n:'הקו המזין',d:'כלי למתכננים: האם האוטובוסים ליד תחנות הרכבת מגיעים בזמן לרכבת ויוצאים אחריה, עם המלצה כמה דקות להזיז',h:'feeder/',vk:'feeder',a:'#16a34a'}]},
 {id:'g-plan',name:'מחירים ומסופים',tools:[
  {k:'fares',n:'המחירון',d:'כמה עולה הנסיעה — בודדת, יומי וחודשי, לכל קו או בין שתי תחנות',h:'fares/',vk:'fares',a:'#059669'},
  {k:'ratzif',n:'רציף כפול',d:'שני אוטובוסים או יותר שאמורים לצאת מאותו רציף מוצא באותה דקה — לפי לוח הרישוי הרשמי',h:'ratzif/',vk:'ratzif',a:'#0891b2'}]}
];
const PARKS = {k:'parks',n:'נגישות אזורי תעשייה',d:'ציון נגישות לתחבורה ציבורית ל-414 אזורי תעשייה ותעסוקה: תדירות בשעות השיא והליכה מהמפעל הרחוק לתחנה, מפה, דירוג ודו"ח · בשיתוף מחלקת קידום תחבורה ציבורית בהסתדרות',h:'parks/'};
const COUNT = 'חמישה-עשר';
const ALL = GROUPS.flatMap(g => g.tools).concat([PARKS]);

/* ===== HTML ===== */
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const arrow = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const caret = '<svg class="car" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GH = '<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
const GH_URL = 'https://github.com/Transit-Freak/kav-bochan';
function fmtD(d) { const p = String(d || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; }
function verOf(V, vk) { const T = V && V[vk], c = T && T.versions && T.versions[0]; return c ? { v: 'גרסה ' + c.v, d: 'עודכן ' + fmtD(c.d) } : { v: '', d: '' }; }
const linkAttrs = t => `href="${esc(t.h)}"` + (t.ext ? ' target="_blank" rel="noopener"' : '') + (t.pick ? ` data-pick="${t.pick}" data-boot-tool` : '');
function card(t, V) {
  const v = verOf(V, t.vk);
  return `<a class="card${t.wide ? ' wide' : ''} rv" data-k="${t.k}" ${linkAttrs(t)} style="--acc:${t.a}"><span class="ver" data-ver="${t.vk}">${v.v}</span><div class="ico" data-icon="${t.k}"></div><h2>${esc(t.n)}</h2><p>${esc(t.d)}</p><div class="card-foot"><span class="upd" data-upd="${t.vk}">${v.d}</span><span class="go"><span data-cta>כניסה</span>${arrow}</span></div></a>`;
}
const RAD = 40.5; // מרחק מרכז הסמל ממרכז העין, באחוזים מרוחב הבמה
function orb(t, i) {
  const th = -90 + i * 360 / ALL.length, c = Math.cos(th * Math.PI / 180), sn = Math.sin(th * Math.PI / 180);
  const cls = 'orb' + (c < -.45 ? ' lb-l' : '') + (c > .45 ? ' lb-r' : '');
  return `<a class="${cls}" ${linkAttrs(t)} data-k="${t.k}" data-th="${f(th)}" aria-label="${esc(t.n)}" style="left:calc(${(50 + RAD * c).toFixed(3)}% - var(--s) / 2);top:calc(${(50 + RAD * sn).toFixed(3)}% - var(--s) / 2)"><span data-icon="${t.k}"></span><b>${esc(t.n)}</b></a>`;
}
function html(V) {
  const hv = verOf(V, 'home').v;
  return `<div class="kbh" dir="rtl">
<div class="aurora" aria-hidden="true"></div>
<header class="top"><div class="wrap">
<a class="brand" href="./" data-top>הקו הבוחן</a>
<nav class="nav" aria-label="ניווט ראשי"><a href="#tools">הכלים</a><a href="#g-lines">קווים ותחנות</a><a href="#g-rail">רכבת</a><a href="#partners">שיתופי פעולה</a><a href="#about" data-about>קצת עליי</a></nav>
<button class="chip-ver" type="button" data-ver-chip title="מה השתנה בגרסה הזו">${hv}</button>
<a class="gh" href="${GH_URL}" target="_blank" rel="noopener" aria-label="קוד המקור של האתר ב-GitHub" title="קוד המקור ב-GitHub">${GH}</a>
</div></header>
<main>
<section class="hero"><div class="wrap"><div>
<div class="brandline"><h1 class="nm">הקו הבוחן</h1></div>
<p class="h1">${COUNT} כלים לניתוח התחבורה הציבורית — במה לבחור?</p>
<div class="ctas"><a class="btn btn-p" href="#tools">לכל הכלים ${arrow}</a><button class="btn btn-s" type="button" data-about-btn aria-expanded="false" aria-controls="about">קצת עליי ${caret}</button></div>
</div>
<nav class="stage" aria-label="כל הכלים סביב העין הבוחנת"><div class="halo"></div><div class="oring"></div><div class="oring r2"></div><div class="beam"></div><div class="eye">${eye('stage', 1)}</div>${ALL.map(orb).join('')}</nav>
</div></section>
<div class="wrap"><div class="about" id="about" role="region" aria-label="קצת עליי"><div class="about-card">
<figure class="about-photo"><img src="media/shlomi.jpg" width="640" height="965" alt="שלומי ליד שלט תחנה אישי שקיבל ליום הולדתו" loading="lazy" decoding="async"><figcaption>התחנה הפרטית שלי 🚏 מתנת יום הולדת 20 מההורים הכי נפלאים בעולם: מספר התחנה הוא תאריך הלידה שלי, והקווים על השלט — קווים ששיניתי.</figcaption></figure>
<div>
<p>שלום, שמי שלמה (שלומי) הרטמן, בן 20 מקריית מלאכי. תחבורה ציבורית זורמת אצלי בדם מגיל קטן.</p>
<p>בין 2023 ל־2025 ערכתי המון בוויקיפדיה תחת השם <a href="https://he.wikipedia.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:%D7%A4%D7%A8%D7%99%D7%A7_%D7%94%D7%AA%D7%97%D7%A6" target="_blank" rel="noopener">פריק התחצ</a>. ב־2026, כשנמאס לי מהתשובות הקבועות של משרד התחבורה — "אין תקציב" — חשבתי לעצמי: למה שלא אבנה אתר שמראה את כל הבזבוז? כך נולד קו פח.</p>
<p>בהתחלה הוא היה האתר היחיד, אבל לאט לאט הגיעו עוד רעיונות: קו באג, התחנה הבאה והקו המוזהב. כשנכנסה התחנה הבאה אמרתי לעצמי — למה לא אתר אחד שמרכז את כולם? וכך נוצר הקו הבוחן.</p>
<p>והדבר שהכי מדהים אותי: את כל האתרים האלה אני בונה יחד עם בינה מלאכותית (קלוד) — אני מביא את הרעיונות, הידע וההנחיות, והיא את הקוד. ככה קם כלי אחרי כלי בתוך ימים, בזמן שלמשרד התחבורה לוקח שנים להקים אתר אחד.</p>
<p>יש לכם רעיון לאתר? אשמח לשמוע — <a href="mailto:shlomihartman@gmail.com">כתבו לי</a>. לך תדעו, אולי דווקא הרעיון שלכם יצא לפועל.</p>
</div></div></div></div>
<section class="tools" id="tools"><div class="wrap">
<div class="sec-head"><h2>הכלים</h2><nav class="jump" aria-label="תחומים">${GROUPS.map(g => `<a href="#${g.id}">${g.name}</a>`).join('')}</nav></div>
${GROUPS.map(g => { const w = g.tools.filter(t => t.wide), n = g.tools.filter(t => !t.wide);
  return `<div class="group" id="${g.id}"><div class="g-head"><h3>${g.name}</h3><span class="rule"></span></div>${w.length ? `<div class="grid wides">${w.map(t => card(t, V)).join('')}</div>` : ''}<div class="grid" style="--cols:${Math.min(4, n.length)}">${n.map(t => card(t, V)).join('')}</div></div>`; }).join('\n')}
</div></section>
<section class="partners" id="partners"><div class="wrap">
<div class="sec-head"><h2>שיתופי פעולה</h2></div>
<a class="p-card rv" href="${PARKS.h}" data-k="parks"><div class="ico" data-icon="parks"></div><div><h3>${esc(PARKS.n)}</h3><p>${esc(PARKS.d)}</p><div class="partner-badges"><img class="plogo" src="parks/histadrut-logo-96.webp" width="285" height="96" alt="תחום קידום תחבורה ציבורית — ההסתדרות"><img class="plogo" src="parks/rahokim-logo-96.webp" width="84" height="96" alt="רחוקים אבל שווים"></div></div><span class="p-go">כניסה ${arrow}</span></a>
</div></section>
</main>
<footer id="footer"><div class="wrap">
<div class="f-brand">הקו הבוחן</div>
<div class="f-copy" data-copyright>© 2026 שלמה הרטמן · נבנה בעזרת בינה מלאכותית לפי הנחיותיו · מותר לצטט ולקשר בציון המקור</div>
<div class="f-links"><a href="${GH_URL}" target="_blank" rel="noopener">קוד מקור</a><span class="sep">·</span><a href="links.html">קישורים</a><span class="sep">·</span><a href="terms.html#copyright">זכויות יוצרים ותנאי שימוש</a><span class="sep">·</span><a href="accessibility.html">הצהרת נגישות</a><span class="sep">·</span><a href="mailto:shlomihartman@gmail.com" dir="ltr">shlomihartman@gmail.com</a></div>
<div class="f-ver" data-ver-slot></div>
</div></footer>
</div>`;
}

/* ===== התנהגות ===== */
const RM = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/* כל סמל נכנס לדף כתמונה (img של SVG) ולא כ-SVG חי: הדפדפן מצייר אותו פעם אחת ושומר, ואז ההגדלה והזוהר של הסמל
   שהעין מסתכלת עליו לא מציירים מחדש את כל הצללים והשיפועים בכל פריים (זה מה שגרם ללאג בסיבוב הראשון, שלמה 07.11) */
const DEFS_INNER = DEFS.replace(/^[\s\S]*?<defs>/, '').replace(/<\/defs>[\s\S]*$/, '');
const ICON_URI = {};
function iconImg(k) {
  if (!ICON_URI[k]) {
    const svg = ICON[k]().replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/, '$1<defs>' + DEFS_INNER + '</defs>');
    ICON_URI[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  return '<img alt="" decoding="async" draggable="false" src="' + ICON_URI[k] + '">';
}
function fillIcons(root) { root.querySelectorAll('[data-icon]').forEach(el => { if (!el.firstElementChild && ICON[el.dataset.icon]) el.innerHTML = iconImg(el.dataset.icon); }); }
function applyVersions(root, V) {
  root.querySelectorAll('[data-ver]').forEach(el => { el.textContent = verOf(V, el.dataset.ver).v; });
  root.querySelectorAll('[data-upd]').forEach(el => { el.textContent = verOf(V, el.dataset.upd).d; });
  const c = root.querySelector('[data-ver-chip]'); if (c) c.textContent = verOf(V, 'home').v;
}
let VP = null;
const loadVersions = () => VP || (VP = fetch('versions.json?v=' + Math.floor(Date.now() / 36e5)).then(r => r.ok ? r.json() : null).catch(() => null));
/* "מה חדש" (version.js) מוסיף #kb-ver בסוף הדף; בדף הבית הוא עובר לתחתית, ובחזרה לגוף הדף כשנכנסים לכלי */
function adoptVer(root) {
  const v = document.getElementById('kb-ver'), slot = root.querySelector('[data-ver-slot]');
  if (v && slot && root.isConnected && v.parentNode !== slot) slot.appendChild(v);
}
function unmount(root) { const v = root.querySelector('#kb-ver'); if (v) document.body.appendChild(v); }

function mount(root, opts) {
  if (!root) return;
  ensureDefs();
  root.__kbhOpts = opts || {};
  root.querySelectorAll('[data-cta]').forEach(el => { el.textContent = 'כניסה'; });
  adoptVer(root);
  if (root.__kbh) return;
  root.__kbh = 1;
  fillIcons(root);
  loadVersions().then(V => { if (V) applyVersions(root, V); });
  new MutationObserver(() => adoptVer(root)).observe(document.body, { childList: true });

  /* העין מסתכלת על הסמלים לפי הסדר */
  const stage = root.querySelector('.stage'), beam = stage.querySelector('.beam');
  const iris = stage.querySelector('.kb-iris-js'), lid = stage.querySelector('.eye-layer');
  const orbs = [].slice.call(stage.querySelectorAll('.orb'));
  let beamDeg = 0;
  function gaze(th) {
    const r = th * Math.PI / 180;
    iris.style.transform = `translate(${(11 * Math.cos(r)).toFixed(2)}px,${(7 * Math.sin(r)).toFixed(2)}px)`;
    let d = th; while (d - beamDeg > 180) d -= 360; while (d - beamDeg < -180) d += 360; beamDeg = d;
    beam.style.transform = `rotate(${d}deg)`; beam.style.opacity = 1;
  }
  const mark = k => orbs.forEach(o => o.classList.toggle('look', o.dataset.k === k));
  const lookAtOrb = o => { gaze(+o.dataset.th); mark(o.dataset.k); };
  function lookAtEl(el) {
    const e = stage.querySelector('.eye').getBoundingClientRect(), b = el.getBoundingClientRect();
    gaze(Math.atan2(b.top + b.height / 2 - (e.top + e.height / 2), b.left + b.width / 2 - (e.left + e.width / 2)) * 180 / Math.PI); mark(el.dataset.k);
  }
  const live = () => root.isConnected && !document.hidden;
  /* מצמוץ עדין כל 5–9 שניות — על שכבה נפרדת (eye-layer), בלי לצייר מחדש את ה-SVG */
  const blink = () => lid.animate([{ transform: 'scaleY(1)', easing: 'ease-in' }, { transform: 'scaleY(.08)', offset: .42 }, { transform: 'scaleY(.08)', offset: .5, easing: 'ease-out' }, { transform: 'scaleY(1)' }], { duration: 480 });
  const blinkLoop = () => setTimeout(() => { if (live() && lid.animate) blink(); blinkLoop(); }, 5000 + Math.random() * 4000);
  let idx = 0, hold = false;
  const step = () => { if (!hold && live()) { lookAtOrb(orbs[idx]); idx = (idx + 1) % orbs.length; } };
  if (!RM()) {
    beam.style.opacity = 0;
    /* מתחילים להסתכל רק אחרי שהדף נטען (תמונות, גופנים) — כך גם הסיבוב הראשון חלק */
    const start = () => { setTimeout(step, 300); setInterval(step, 1800); blinkLoop(); };
    if (document.readyState === 'complete') start(); else W.addEventListener('load', start, { once: true });
    const on = fn => () => { hold = true; fn(); }, off = () => { hold = false; };
    orbs.forEach(o => {
      o.addEventListener('mouseenter', on(() => lookAtOrb(o))); o.addEventListener('focus', on(() => lookAtOrb(o)));
      o.addEventListener('mouseleave', () => { off(); idx = (orbs.indexOf(o) + 1) % orbs.length; }); o.addEventListener('blur', off);
    });
    root.querySelectorAll('.card[data-k],.p-card[data-k]').forEach(c => {
      c.addEventListener('mouseenter', on(() => lookAtEl(c))); c.addEventListener('focus', on(() => lookAtEl(c)));
      c.addEventListener('mouseleave', off); c.addEventListener('blur', off);
    });
  } else beam.style.display = 'none';

  /* קצת עליי */
  const ab = root.querySelector('.about'), abtn = root.querySelector('[data-about-btn]');
  function toggleAbout(force) {
    const o = force != null ? force : !ab.classList.contains('open');
    ab.classList.toggle('open', o); abtn.setAttribute('aria-expanded', o);
    if (o) ab.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'nearest' });
  }
  abtn.addEventListener('click', () => toggleAbout());

  root.addEventListener('click', e => {
    if (e.target.closest('[data-ver-chip]')) { const b = document.querySelector('#kb-ver button'); if (b) b.click(); else root.querySelector('#footer').scrollIntoView(); return; }
    const a = e.target.closest('a'); if (!a || !root.contains(a)) return;
    if (a.dataset.pick) {
      const pick = root.__kbhOpts.onPick;
      if (pick) { if (pick(a.dataset.pick, e)) e.preventDefault(); }
      else if (!W.__kavpachReady) { const c = a.querySelector('[data-cta]'); if (c) c.textContent = '⏳ טוען את הכלי…'; }
      return;
    }
    const h = a.getAttribute('href') || '';
    if (a.hasAttribute('data-top')) { if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); W.scrollTo({ top: 0, behavior: RM() ? 'auto' : 'smooth' }); } return; }
    if (h.charAt(0) === '#' && h.length > 1) {
      const t = document.getElementById(h.slice(1)); if (!t || !root.contains(t)) return;
      e.preventDefault();
      if (a.hasAttribute('data-about')) toggleAbout(true); else t.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'start' });
    }
  });

  /* הופעה בגלילה */
  const rv = root.querySelectorAll('.rv');
  if ('IntersectionObserver' in W && !RM()) {
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -40px 0px' });
    rv.forEach(el => io.observe(el));
  } else rv.forEach(el => el.classList.add('in'));
}

W.KBH = { ICON, eye, GROUPS, PARKS, COUNT, ALL, html, mount, unmount, fillIcons, ensureDefs };
})();
