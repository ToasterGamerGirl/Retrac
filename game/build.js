// Baut GRIDFALL als einzelne, offline spielbare HTML-Datei.
// Aufruf: node game/build.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const src = path.join(dir, 'src');
const files = fs.readdirSync(src).filter(f => f.endsWith('.js')).sort();
const game = '(function(){\n"use strict";\n' + files.map(f => `// ---- ${f} ----\n` + fs.readFileSync(path.join(src, f), 'utf8')).join('\n') + '\n})();';
const three = fs.readFileSync(path.join(dir, 'vendor', 'three.min.js'), 'utf8');
let html = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
html = html.replace('/*__THREE__*/', () => safe(three)).replace('/*__GAME__*/', () => safe(game));
const out = path.join(dir, '..', 'GRIDFALL.html');
fs.writeFileSync(out, html);
console.log('OK ->', out, (html.length / 1024).toFixed(0) + ' KB');
