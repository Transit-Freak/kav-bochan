const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tracker,instruction,create}=require('../speech.js');
test('early and near announcements occur once, including a turn first seen at 100m',()=>{
 const t=tracker(),m={kind:'right',f:.5};
 assert.equal(t.next(m,0,1000),null);
 assert.match(t.next(m,.4,1000),/100 מטר.*ימינה/);
 for(let f=.401;f<.449;f+=.001) assert.equal(t.next(m,f,1000),null);
 assert.match(t.next(m,.46,1000),/40 מטר/);
 assert.match(t.next(m,.48,1000),/20 מטר/);
 assert.equal(t.next(m,.485,1000),null);
 assert.match(t.next(m,.501,1000),/פנו ימינה/);
 assert.equal(t.next(m,.502,1000),null);
 t.reset();assert.ok(t.next(m,.4,1000));
});
test('starting near skips the obsolete early stage and another turn is independent',()=>{
 const t=tracker();assert.ok(t.next({kind:'left',f:.5},.48,1000));
 assert.equal(t.next({kind:'left',f:.5},.4,1000),null);
 assert.ok(t.next({kind:'right',f:.52},.5,1000));
});
test('missing exit never invents a direction',()=>{
 assert.equal(instruction({kind:'roundabout'}),'כיכר בהמשך. מספר היציאה אינו זמין');
 assert.match(instruction({kind:'roundabout',exit:2}),/מספר 2/);
 assert.match(instruction({kind:'keep-left',then:'right'}),/היצמדו לשמאל, ואז פנו ימינה/);
});
test('speech chooses Hebrew, refuses overlap, cancels, and reports missing voice',()=>{
 let calls=[],cancelled=0,errors=[],voices=[{lang:'he-IL'}];
 const host={SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>voices,speak:u=>calls.push(u),cancel:()=>cancelled++}};
 let time=1000;const c=create(host,e=>errors.push(e),()=>time);
 assert.equal(c.speak('א'),true);assert.equal(calls[0].lang,'he-IL');
 assert.equal(c.speak('ב'),false);assert.equal(calls.length,1);c.cancel();assert.equal(cancelled,1);time+=301;
 voices=[];assert.equal(c.speak('ג'),false);assert.equal(errors.length,1);
 voices=[{lang:'he-IL'}];assert.equal(c.speak('ד'),true);
 calls.at(-1).onerror();assert.equal(errors.length,2);
 assert.equal(create({},()=>{}).supported,false);
});
test('final approach is announced once at 20m or when first seen at 15m',()=>{
 const m={kind:'left',f:.5},t=tracker();
 assert.match(t.next(m,.45,1000),/50 מטר/);
 assert.equal(t.next(m,.485,1000),null);
 assert.match(t.next(m,.49,1000),/פנו שמאלה/);
 assert.equal(t.next(m,.51,1000),null);
});
test('next station includes the platform and does not repeat or invent one',()=>{
 const {stopLabel}=require('../speech.js'),t=tracker();
 const stop={id:'1',seq:2,f:.5,name:'תחנה מרכזית',platform:'4'};
 assert.equal(t.nextStop(stop,.2),'התחנה הבאה: תחנה מרכזית · רציף 4');
 assert.equal(t.nextStop(stop,.3),null);
 assert.equal(stopLabel({name:'תחנה מרכזית/רציף 4',platform:'4'}),'תחנה מרכזית/רציף 4');
 assert.equal(stopLabel({name:'תחנה מרכזית',code:'12345'}),'תחנה מרכזית');
 assert.ok(t.nextStop({...stop,seq:8,f:.9},.6));
 t.reset();assert.ok(t.nextStop(stop,.2));assert.equal(t.nextStop(stop,.6),null);
});
test('arrival has its own announcement after the 20m warning and never repeats',()=>{
 const t=tracker(),m={kind:'right',f:.5};
 assert.match(t.next(m,.48,1000),/20 מטר/);
 assert.match(t.next(m,.495,1000),/^פנו ימינה$/);
 assert.equal(t.next(m,.5,1000),null);
 assert.equal(t.next(m,.503,1000),null);
});
test('GPS crossing announces only a previously approached turn within 10m',()=>{
 const m={kind:'left',f:.5},t=tracker();
 t.next(m,.475,1000);
 assert.equal(t.next(m,.504,1000),'פנו שמאלה');
 assert.equal(tracker().next(m,.504,1000),null);
 const late=tracker();late.next(m,.475,1000);assert.equal(late.next(m,.52,1000),null);
});
test('Hebrew boulevard abbreviations are expanded only as whole tokens',()=>{
 const {spokenText}=require('../speech.js');
 for(const word of ['שד','שד\u05f3',"שד'",'שד.','שד’']) assert.equal(spokenText('התחנה הבאה: '+word+' הרצל'),'התחנה הבאה: שדרות הרצל');
 assert.equal(spokenText('הרצל/שד׳ ירושלים'),'הרצל/שדרות ירושלים');
 assert.equal(spokenText('אשדוד שדה שדרות'),'אשדוד שדה שדרות');
 let utterance;
 const c=create({SpeechSynthesisUtterance:class{constructor(t){this.text=t;}},speechSynthesis:{getVoices:()=>[{lang:'he-IL'}],speak:u=>utterance=u,cancel(){}}},()=>{});
 c.speak('שד׳ הרצל');assert.equal(utterance.text,'שדרות הרצל');
});
test('short segment gets one advance cue plus arrival, without 50m or 20m repeats',()=>{
 const t=tracker(),m={kind:'right',f:.5};
 assert.match(t.next(m,.42,1000,80),/80 מטר/);
 assert.equal(t.next(m,.45,1000,80),null);
 assert.equal(t.next(m,.48,1000,80),null);
 assert.equal(t.next(m,.495,1000,80),'פנו ימינה');
 assert.equal(t.next(m,.5,1000,80),null);
 t.reset();assert.match(t.next(m,.42,1000,80),/80 מטר/);
});
test('long segment retains advance stages and starting at arrival speaks once',()=>{
 const t=tracker(),m={kind:'left',f:.5};
 assert.ok(t.next(m,.42,1000,200));assert.ok(t.next(m,.45,1000,200));assert.ok(t.next(m,.48,1000,200));
 const near=tracker();assert.equal(near.next(m,.495,1000,80),'פנו שמאלה');assert.equal(near.next(m,.499,1000,80),null);
});
test('engine speaking and pending block new speech even after end or cancellation',()=>{
 let time=1000;const calls=[];
 const synth={speaking:false,pending:false,getVoices:()=>[{lang:'he-IL'}],speak:u=>calls.push(u),cancel(){}};
 const host={speechSynthesis:synth,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}};
 const a=create(host,()=>{},()=>time),b=create(host,()=>{},()=>time);
 assert.equal(a.speak('בעוד 20 מטר פנו שמאלה'),true);
 assert.equal(a.speak('פנו שמאלה'),false);assert.equal(b.speak('תחנה'),false);
 calls[0].onend();assert.equal(a.speak('פנו שמאלה'),false);
 time+=201;synth.speaking=true;assert.equal(a.speak('פנו שמאלה'),false);
 synth.speaking=false;synth.pending=true;assert.equal(a.speak('פנו שמאלה'),false);
 synth.pending=false;assert.equal(a.speak('פנו שמאלה'),true);
 a.cancel();assert.equal(b.speak('תחנה'),false);time+=301;
 assert.equal(b.speak('תחנה'),true);assert.equal(calls.length,3);
});
test('busy approach is reconsidered at latest position instead of queueing stale distances',()=>{
 const t=tracker(),m={kind:'right',f:.5};
 t.next(m,.4,1000,200);
 // While speech is busy the screen does not call the tracker at 50m or 20m.
 assert.equal(t.next(m,.495,1000,200),'פנו ימינה');
 assert.equal(t.next(m,.499,1000,200),null);
 const passed=tracker();passed.next(m,.4,1000,200);
 assert.equal(passed.next(m,.52,1000,200),null);
});
test('replay Yavne line 1 toward East railway with slow speech and no overlapping calls',()=>{
 const route=require('./fixtures/yavne-line-1-east.json'),nav=require('../navigation.js');
 for(const speed of [15,30,50]) {
  let time=0,endAt=0,active=null,count=0;
  const synth={speaking:false,pending:false,getVoices:()=>[{lang:'he-IL'}],cancel(){throw Error('unexpected interruption');},speak(u){
    assert.equal(active,null,'previous announcement must finish first');
    active=u;synth.speaking=true;endAt=time+4500;count++;
  }};
  const c=create({speechSynthesis:synth,SpeechSynthesisUtterance:class{constructor(t){this.text=t;}}},m=>assert.fail(m),()=>time);
  const t=tracker(),rows=nav.prepare(route.maneuvers,route.totalMeters);
  for(let meters=0;meters<route.totalMeters;meters+=speed/3.6/4,time+=250){
    if(active && time>=endAt){const u=active;active=null;synth.speaking=false;u.onend();}
    if(c.busy())continue;
    const f=meters/route.totalMeters,m=nav.next(rows,f,route.totalMeters);
    const i=m?rows.findIndex(x=>x.f===m.f&&x.kind===m.kind):-1;
    const length=i>=0?(m.f-(i?rows[i-1].f:0))*route.totalMeters:undefined;
    const turn=t.next(m,f,route.totalMeters,length,{speedMps:speed/3.6,seconds:4.5,nowMs:time});
    const text=turn || ((!m||m.meters>100)?t.nextStop(route.stops.find(s=>s.f>f),f):null);
    if(text)assert.equal(c.speak(text),true);
  }
  assert(count>10,`expected route announcements at ${speed} km/h`);
 }
});
test('measure actual start-to-end speech time, excluding startup latency and cancellations',()=>{
 let time=1000,u;const measurements=[];
 const c=create({speechSynthesis:{getVoices:()=>[{lang:'he-IL'}],speak:v=>u=v,cancel(){}},SpeechSynthesisUtterance:class{}},()=>{},()=>time,t=>measurements.push(t));
 c.speak('פנו ימינה');time=1500;u.onstart();time=3700;u.onend();
 assert.equal(measurements[0].seconds,2.2);
 time=4000;c.speak('בדיקה');u.onstart();c.cancel();assert.equal(measurements.length,1);
});
test('adaptive scheduling leaves time to finish and skips a 20m preparation at 30km/h',()=>{
 const t=tracker(),m={kind:'left',f:.5};
 const timing={speedMps:30/3.6,seconds:3,nowMs:1000};
 assert.equal(t.next(m,.48,1000,200,timing),null);
 assert.equal(t.next(m,.495,1000,200,{...timing,nowMs:2200}),'פנו שמאלה');
});
test('adaptive scheduling uses speed, speech duration and minimum spacing',()=>{
 const m={kind:'right',f:.5},t=tracker();
 const timing={speedMps:5,seconds:2,nowMs:0};
 assert.ok(t.next(m,.43,1000,200,timing));
 assert.equal(t.next(m,.46,1000,200,{...timing,nowMs:6000}),null);
 assert.ok(t.next(m,.47,1000,200,{...timing,nowMs:8000}));
 assert.equal(tracker().next(m,.43,1000,200,{...timing,speedMps:20,seconds:4}),null);
 const short=tracker();assert.ok(short.next(m,.43,1000,80,timing));
 assert.equal(short.next(m,.47,1000,80,{...timing,nowMs:10000}),null);
});
test('select earliest supplied turn instead of announcing a later turn across it',()=>{
 const {nextTurn}=require('../speech.js');
 const rows=[{f:.56,kind:'right'},{f:.50,kind:'left'},{f:.52,kind:'roundabout',exit:2}];
 assert.equal(nextTurn(rows,.49,1000).kind,'left');
 assert.equal(nextTurn(rows,.511,1000).kind,'roundabout');
 assert.equal(nextTurn(rows,.54,1000).kind,'right');
});
test('urgent turn stops preparation but waits for native engine release before speaking',()=>{
 let time=0,cancels=0;const calls=[];
 const synth={speaking:false,pending:false,getVoices:()=>[{lang:'he-IL'}],speak:u=>{calls.push(u);synth.speaking=true;},cancel:()=>cancels++};
 const c=create({speechSynthesis:synth,SpeechSynthesisUtterance:class{}},()=>{},()=>time);
 c.speak('בעוד 100 מטר פנו שמאלה',1);
 c.interruptFor(2);assert.equal(cancels,1);
 assert.equal(c.speak('פנו שמאלה',2),false);
 time=400;assert.equal(c.speak('פנו שמאלה',2),false);
 synth.speaking=false;assert.equal(c.speak('פנו שמאלה',2),true);
 c.interruptFor(1);c.interruptFor(2);assert.equal(cancels,1);assert.equal(calls.length,2);
});
test('station reminders follow progress and approach, never idle repetition',()=>{
 const t=tracker(),s={id:'2',seq:2,f:1,name:'שד. הסנהדרין/שד. ירושלים'};
 assert.match(t.nextStop(s,0,2000,{nowMs:0}),/2.0 קילומטר/);
 assert.equal(t.nextStop(s,0,2000,{nowMs:60000}),null);
 assert.match(t.nextStop(s,.3,2000,{nowMs:60000}),/1.4 קילומטר/);
 assert.equal(t.nextStop(s,.31,2000,{nowMs:65000}),null);
 assert.match(t.nextStop(s,.905,2000,{nowMs:120000,continueRoute:true}),/המשיכו במסלול.*190 מטר/);
 assert.equal(t.nextStop(s,.91,2000,{nowMs:150000}),null);
});
test('arrival cue begins before the junction based on speed and voice duration',()=>{
 const {arrivalLead}=require('../speech.js'),lead=arrivalLead(30/3.6,1.2);
 assert.equal(lead,20);
 const t=tracker();assert.equal(t.next({f:.5,kind:'left'},.481,1000,300,{speedMps:30/3.6,seconds:3,arrivalMeters:lead,nowMs:0}),'פנו שמאלה');
 assert.equal(arrivalLead(0,2),10);assert.equal(arrivalLead(30,5),45);
});
test('stop arrival is independent of recent reminder cooldown and spoken once',()=>{
 const t=tracker(),s={id:'1',seq:1,name:'הסנהדרין/ירושלים',f:.5};
 assert.ok(t.nextStop(s,.31,1000,{nowMs:0}));
 assert.equal(t.nextStop(s,.48,1000,{nowMs:10000}),'עצרו בתחנה הסנהדרין/ירושלים');
 assert.equal(t.nextStop(s,.49,1000,{nowMs:12000}),null);
 assert.equal(t.nextStop(s,.51,1000,{nowMs:14000}),null);
 assert.equal(tracker().nextStop(s,.485,1000,{nowMs:0}),'עצרו בתחנה הסנהדרין/ירושלים');
});
test('station card depends on the 200m gap after station, not distance from vehicle',()=>{
 const {stationFirst}=require('../speech.js'),s={f:.4};
 assert.equal(stationFirst(s,.1,1000,{f:.6}),true);
 assert.equal(stationFirst(s,.1,1000,{f:.59}),false);
 assert.equal(stationFirst(s,.1,1000,{f:.3}),false);
 assert.equal(stationFirst(s,.1,1000,null),true);
 assert.equal(stationFirst(s,.5,1000,null),false);
});
