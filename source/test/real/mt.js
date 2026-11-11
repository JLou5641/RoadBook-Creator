const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const c=await b.newContext({viewport:{width:1200,height:800}});const p=await c.newPage();
await p.goto('http://localhost:8123/');await p.click('#bMore');
const [n]=await Promise.all([c.waitForEvent('page'),p.click('[data-act=manual]')]);
await n.waitForLoadState('load');await n.waitForTimeout(800);
console.log(n.url(),await n.title(),await n.$$eval('img',a=>a.length),await n.$$eval('img',a=>a.filter(i=>i.complete&&i.naturalWidth>0).length));
await n.screenshot({path:'/tmp/man_page.png'});await b.close()})()
