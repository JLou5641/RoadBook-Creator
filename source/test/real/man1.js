const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1300,height:900}});
await p.goto('file://'+path.join(__dirname,'..','..','dist','generateur-roadbook.html'));await p.waitForTimeout(500);
await p.evaluate(t=>window.__rb.loadText(t,'t.gpx'),fs.readFileSync('/home/claude/scan/seg.gpx','utf8'));await p.waitForTimeout(500);
await p.click('#bGen');await p.waitForTimeout(300);await p.selectOption('#gsT','ign');await p.selectOption('#gsN','ign');await p.click('#modal .mbtn.primary');
await p.waitForSelector('#modal h2:has-text("rapport")',{timeout:200000});await p.click('#modal .mbtn.primary');await p.waitForTimeout(500);
const r=await p.evaluate(async()=>{const R=window.__rb,S=R.S,T=R.T;
 const sp=S.notes.filter(n=>n.span&&n.span[1]-n.span[0]>60);
 const res={nSpan:sp.length,tests:[]};
 for(const n of sp.slice(0,3)){
  const sm=(n.span[0]+n.span[1])/2, far=Math.abs(sm-n.s)>10; if(!far) continue;
  const q=R.pointAt(sm), ll=R.inv(q[0],q[1]);
  const before=S.notes.length;
  await R.addManualNote({lat:ll[0],lng:ll[1]});
  const nn=S.notes.reduce((a,c)=>c.id>a.id?c:a);
  res.tests.push({span:n.span.map(Math.round),s:n.s,newS:nn.s,sameTulip:JSON.stringify(nn.tulip)===JSON.stringify(n.tulip),added:S.notes.length-before});
  document.querySelector('#modal .mbtn:not(.primary)')?.click();
 }
 return res;});
console.log(r);await b.close();})();
