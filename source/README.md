# Sources du générateur de roadbook

`node build.js` assemble `src/*.js`, `src/index.html`, `src/app.css` et Leaflet en `dist/generateur-roadbook.html` (+ `dist/pwa/`). Les tests Playwright sont dans `test/`.
Branche `refactor-modules` : découpage de `src/app.js` en fichiers par thème (le fichier final reste unique).
