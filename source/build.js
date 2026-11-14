// Assemble une page HTML autonome (Leaflet + appli intégrés)
const fs = require('fs');
const path = require('path');
const d = __dirname;
const rd = p => fs.readFileSync(path.join(d, p), 'utf8');
let html = rd('src/index.html');
const parts = {
  '/*LEAFLET_CSS*/': rd('leaflet/dist/leaflet.css').replace(/url\(images\/[^)]+\)/g, 'none'),
  '/*APP_CSS*/': rd('src/app.css'),
  '/*LEAFLET_JS*/': rd('leaflet/dist/leaflet.js').replace(/\/\/# sourceMappingURL=.*$/m, ''),
  '/*APP_JS*/': rd('src/fimsym.js') + '\n' + rd('src/fialex.js') + '\n' + rd('src/extrasym.js') + '\n' + rd('src/vt.js') + '\n' + rd('src/ign.js') + '\n' + fs.readdirSync(path.join(d, 'src', 'app')).filter(f => /\.js$/.test(f)).sort().map(f => rd('src/app/' + f)).join(''),
};
for (const [k, v] of Object.entries(parts)) {
  if (/<\/script/i.test(v) && k.includes('JS')) throw new Error('</script> trouvé dans ' + k);
  html = html.replace(k, () => v);
}
// étiquette de version (heure de Paris), visible en bas du menu ⋯ pour vérifier qu'on a le bon fichier
const now = new Date(), P = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: '2-digit', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now).reduce((o, x) => (o[x.type] = x.value, o), {});
const stamp = `${P.day}/${P.month} ${P.hour}h${P.minute}`;
const version = `v0.${P.year}${P.month}${P.day}.${P.hour}${P.minute}`;      // v0.AAMMJJ.HHMM (heure de Paris)
html = html.replace(/<!--BUILD_STAMP-->/g, stamp).replace(/<!--VERSION-->/g, version);
const out = path.join(d, 'dist', 'generateur-roadbook.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('OK', out, (html.length / 1024).toFixed(0) + ' Ko', stamp, version);
// version installable : dossier dist/pwa (index.html + sw.js + manifeste + icônes)
{
  const pd = path.join(d, 'dist', 'pwa'); fs.mkdirSync(pd, { recursive: true });
  fs.writeFileSync(path.join(pd, 'index.html'), html);
  fs.cpSync(path.join(d, 'src', 'manuel'), path.join(pd, 'manuel'), { recursive: true });
  fs.cpSync(path.join(d, 'src', 'manuel'), path.join(d, 'dist', 'manuel'), { recursive: true });
  const mf = ['./manuel/', './manuel/index.html', './manuel/en.html'].concat(fs.readdirSync(path.join(d, 'src', 'manuel', 'img')).map(f => './manuel/img/' + f));
  fs.writeFileSync(path.join(pd, 'sw.js'), fs.readFileSync(path.join(d, 'src', 'sw.js'), 'utf8').replace('__STAMP__', stamp.replace(/\W/g, '')).replace("'./icon-512.png']", "'./icon-512.png'].concat(" + JSON.stringify(mf) + ")"));
  for (const f of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join('/home/claude/out', f), path.join(pd, f));
}
