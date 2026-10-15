const { chromium } = require('playwright');
(async () => {
  const players = +process.argv[2] || 4; const maxMs = (+process.argv[3] || 90) * 1000; const tempo = process.argv[4] || 'instant';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.addInitScript((cfg) => { window.__VR_CONFIG = cfg; }, { players, heroes: 2, diff: 100, tempo });
  await p.goto('file:///home/claude/vojna_ruzi/valka_ruzi_stul.html');
  const t0 = Date.now(); let stuck = 0, lastPt = '', actions = 0, picks = 0, dialogs = 0, drags = 0, shots = 0; const kinds = {};
  const center = async (sel) => p.evaluate((sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  while (Date.now() - t0 < maxMs) {
    const st = await p.evaluate(() => ({
      aw: !!(window.__game && window.__game.__awaitingHumanAction),
      over: window.__gameOver === true,
      dlg: !document.getElementById('dialog').classList.contains('hidden'),
      pick: document.querySelectorAll('.pickable').length,
      err: window.__game && window.__game.__lastError ? String(window.__game.__lastError) : null,
    }));
    if (st.err) { errs.push('GAMEERR ' + st.err); break; }
    if (st.over) break;
    if (st.dlg) { const c = await center('#dialog .btn'); await p.mouse.click(c.x, c.y); dialogs++; continue; }
    if (st.pick) {
      const sels = await p.evaluate(() => { document.querySelectorAll('[data-pi]').forEach(x=>x.removeAttribute('data-pi')); return Array.from(document.querySelectorAll('.pickable')).map((n, i) => { n.setAttribute('data-pi', i); return i; }); });
      const i = sels[Math.floor(Math.random() * sels.length)];
      const c = await center(`[data-pi="${i}"]`);
      if (shots < 2 && st.pick > 1 && process.argv[5] === 'shots') { await p.screenshot({ path: `shots/pick_${shots++}.png` }); }
      const pt = await p.evaluate(()=>document.getElementById('prompt').textContent.slice(0,40)); kinds['P:'+pt]=(kinds['P:'+pt]||0)+1; stuck = (pt === lastPt) ? stuck + 1 : 0; lastPt = pt;
      if (stuck > 4) { const d = await p.evaluate(({x,y}) => { const t = document.elementFromPoint(x,y); const pk = document.querySelectorAll('.pickable'); return { tgt: t && (t.tagName+'.'+t.className+' in '+(t.parentElement&&t.parentElement.className)), n: pk.length, kinds: Array.from(pk).map(n=>n.className+'|'+(n.dataset.eid||n.dataset.pid||n.dataset.tid||n.dataset.cid)).slice(0,6) }; }, c); console.log('STUCK', JSON.stringify(d), c); await p.screenshot({ path: 'shots/stuck.png' }); break; }
      await p.mouse.click(c.x, c.y); picks++; await p.waitForTimeout(30); continue;
    }
    if (st.aw) {
      const info = await p.evaluate(() => {
        const g = window.__game; const me = g.players.find(x => x.isHuman);
        return { hand: me.hand.map(c => c.id), heroes: me.heroes.filter(x => !x.used).map(x => x.id), tokens: me.favorTokens };
      });
      const r = Math.random();
      if (info.hand.length === 0 && info.heroes.length === 0 || r < 0.06) {
        const c = await center('#btn-pass'); await p.mouse.click(c.x, c.y); await p.waitForTimeout(40);
        const c2 = await center('#btn-pass'); await p.mouse.click(c2.x, c2.y); kinds.pass = (kinds.pass || 0) + 1;
      } else {
        let selFrom, zone;
        if (info.heroes.length && r < 0.16) { selFrom = `.my-hero[data-hid="${info.heroes[0]}"]`; zone = '.zone-hero'; }
        else if (info.hand.length) {
          const id = info.hand[Math.floor(Math.random() * info.hand.length)]; selFrom = `.hand-card[data-cid="${id}"]`;
          const z = Math.random(); zone = z < 0.5 ? '#board' : z < 0.75 ? '.zone-bank' : '.zone-token';
        } else { const c = await center('#btn-pass'); await p.mouse.click(c.x, c.y); await p.waitForTimeout(40); await p.mouse.click(c.x, c.y); continue; }
        const a = await center(selFrom); if (!a) { await p.waitForTimeout(30); continue; }
        await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 20, a.y - 40, { steps: 3 });
        const zc = await center(zone); await p.mouse.move(zc.x, zc.y, { steps: 6 });
        if (actions === 5 && process.argv[5] === 'shots') await p.screenshot({ path: 'shots/drag.png' });
        await p.mouse.up(); drags++; kinds[zone] = (kinds[zone] || 0) + 1;
      }
      actions++; await p.waitForTimeout(20); continue;
    }
    await p.waitForTimeout(40);
  }
  const fin = await p.evaluate(() => ({ round: window.__game.round, phase: window.__game.phase, over: window.__gameOver === true, tiles: window.__game.players.map(x => Object.values(x.tilesPool).reduce((a, b) => a + b, 0)) }));
  console.log(JSON.stringify({ actions, drags, picks, dialogs, kinds, fin, ms: Date.now() - t0 }));
  console.log('errors:', errs);
  await p.screenshot({ path: 'shots/play_end.png' });
  await b.close();
})();
