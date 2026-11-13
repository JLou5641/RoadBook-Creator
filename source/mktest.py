# Fabrique la version de TEST (dossier test/ du dépôt) à partir de dist/pwa
import shutil, re, json, os
src, dst = 'dist/pwa', 'dist/test'
shutil.rmtree(dst, ignore_errors=True); shutil.copytree(src, dst)
p = dst + '/index.html'; h = open(p, encoding='utf8').read()
h = re.sub(r'(class="ver">Version v[\d.]+)<', r'\1 · VERSION DE TEST<', h)
h = h.replace('<title>Générateur de Roadbook', '<title>TEST · Générateur de Roadbook', 1)
open(p, 'w', encoding='utf8').write(h)
m = dst + '/manifest.webmanifest'; j = json.load(open(m, encoding='utf8')); j['name'] = 'Roadbook TEST'; j['short_name'] = 'RB test'
json.dump(j, open(m, 'w', encoding='utf8'), ensure_ascii=False)
print('OK', dst)
