const { chromium } = require("playwright");
(async()=>{
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:8765/line-changes/?c=22029-20261117', { waitUntil: 'load' });
await p.waitForTimeout(2500);
await p.click('#editbtn2'); await p.waitForTimeout(1200);
console.log(await p.$$eval('.sframe', fs => fs.map((f,i)=> i+': '+[...f.querySelectorAll('.edt')].map(e=>e.tagName+'.'+e.className+'='+e.textContent.trim().slice(0,70)).join('\n   '))).then(a=>a.join('\n')));
console.log(await p.evaluate(()=>[document.querySelector('.sframe').getBoundingClientRect().toJSON(), scrollY, document.querySelector('.dock').getBoundingClientRect().toJSON()]));
await p.screenshot({ path: 's6.png' });
await b.close();
})();
