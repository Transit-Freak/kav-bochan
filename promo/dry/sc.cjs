const { chromium } = require("playwright");
(async()=>{
for (const [name, launch, ctxo] of [
  ['force', {args:['--force-device-scale-factor=2']}, {viewport:{width:540,height:960}, deviceScaleFactor:2}],
  ['force-nodsf', {args:['--force-device-scale-factor=2']}, {viewport:{width:540,height:960}}],
  ['oldheadless', {args:['--headless=old']}, {viewport:{width:540,height:960}, deviceScaleFactor:2}],
]) {
  try {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', ...launch });
  const c = await b.newContext(ctxo); const p = await c.newPage();
  await p.goto('http://localhost:8765/line-changes/');
  const cdp = await c.newCDPSession(p);
  let got=null;
  cdp.on('Page.screencastFrame', ev => { cdp.send('Page.screencastFrameAck',{sessionId:ev.sessionId}); if(!got){got=ev; require('fs').writeFileSync(name+'.jpg', Buffer.from(ev.data,'base64'));} });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:1080,maxHeight:1920});
  await p.evaluate(()=>scrollTo(0,200)); await p.waitForTimeout(800);
  console.log(name, got && got.metadata, await p.evaluate(()=>devicePixelRatio+' '+innerWidth));
  await b.close();
  } catch(e){console.log(name,'ERR',e.message.slice(0,200));}
}
})();
