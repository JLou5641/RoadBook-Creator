const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1300,height:900}});
await p.goto('file://'+path.join(__dirname,'..','..','dist','generateur-roadbook.html'));await p.waitForTimeout(500);
await p.evaluate(t=>window.__rb.loadText(t,'t.gpx'),fs.readFileSync('/home/claude/scan/seg.gpx','utf8'));await p.waitForTimeout(800);
await p.mouse.click(300,450,{button:'right'});await p.waitForTimeout(400);
console.log(await p.evaluate(()=>{const a=document.querySelector('.svlnk');return a&&a.href}));
await p.screenshot({path:'/tmp/sv.png'});
// clic droit sur la trace
const pos=await p.evaluate(()=>{const R=window.__rb,q=R.pointAt(1500),ll=R.inv(q[0],q[1]);R.map.setView(ll,16);const c=R.map.latLngToContainerPoint(ll),r=document.querySelector('#map').getBoundingClientRect();return [r.x+c.x,r.y+c.y]});await p.waitForTimeout(600);
await p.mouse.click(pos[0],pos[1],{button:'right'});await p.waitForTimeout(400);
console.log('trace',await p.evaluate(()=>document.querySelectorAll('.svlnk').length), await p.evaluate(()=>window.__rb.S.notes.length));
await b.close();})();
