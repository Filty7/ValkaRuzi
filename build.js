const fs = require('fs');
const rd = (f) => fs.readFileSync(f, 'utf8');
let t = rd('template.html');
const parts = { __CSS__: rd('style.css'), __GAME_JS__: rd('game.js'), __ART_JS__: rd('art.js'), __AUDIO_JS__: rd('audio.js'), __UI_JS__: rd('ui.js'), __TUTORIAL_JS__: rd('tutorial.js') };
for (const [k, v] of Object.entries(parts)) {
  if (/<\/script/i.test(v) && k !== '__CSS__') throw new Error('</script> in ' + k);
  t = t.split(k).join('\u0000' + k + '\u0000');
}
for (const [k, v] of Object.entries(parts)) t = t.split('\u0000' + k + '\u0000').join(v);
fs.writeFileSync('valka_ruzi_stul_fragment.html', t);
const full = '<!doctype html>\n<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;height:100%;background:#0e0905}</style></head><body>\n' + t.replace(/^<title>.*<\/title>\n/, '') + '\n</body></html>';
fs.writeFileSync('valka_ruzi_stul.html', full.replace('<head>', '<head><title>Válka růží</title>'));
console.log('fragment', t.length, 'full', full.length);
