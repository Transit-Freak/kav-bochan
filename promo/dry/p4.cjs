const { chromium } = require("playwright");
(async()=>{
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 540, height: 960 } });
await p.goto('http://localhost:8765/line-changes/'); await p.waitForTimeout(1200);
await p.fill('#q','אשדוד'); await p.waitForTimeout(800);
console.log(await p.evaluate(()=>{const r=document.getElementById('results');const cs=getComputedStyle(r);return {sh:document.documentElement.scrollHeight, rh:r.scrollHeight, ch:r.clientHeight, mh:cs.maxHeight, ov:cs.overflowY, top:r.getBoundingClientRect().top, bodyov:getComputedStyle(document.body).overflow, htmlov:getComputedStyle(document.documentElement).overflowY}}));
await b.close();})();
