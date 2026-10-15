// ===================== TUTORIAL — krok za krokem na ukázkách ze skutečných karet =====================
// Samostatná vrstva (overlay #tutorial) bez vazby na herní engine: každý krok má vlastní malou scénu
// postavenou ze stejných karet/polí/erbů jako hra. Kroky s "úkolem" se dají splnit přetažením karty
// (nebo klikem na kartu a potom na okno) a odemknou tlačítko Další.
const Tutorial = (function () {
  let root = null, idx = 0, onClose = null, doneSet = new Set();
  const PC = { Ty: '#3f9a58', York: '#7a4cc0', Lancaster: '#c23a3a', Neville: '#3b6fd0' };

  // ---------- stavební prvky ----------
  function cardEl(color, value, o) {
    o = o || {};
    const n = h('div', 'card t-card' + (o.cls ? ' ' + o.cls : ''), `<div class="art">${o.back ? Art.cardBack(o.v || 0) : Art.cardFace(color, value, o.v || 0)}</div>`);
    if (o.cw) n.style.setProperty('--cw', o.cw);
    n.dataset.color = color; n.dataset.value = value;
    return n;
  }
  function tileEl(color, tokens, o) {
    o = o || {};
    const n = h('div', 'tile t-tile' + (o.mine ? ' mine' : ''), `<div class="tile-art">${Art.tile(color)}</div><div class="occ">${(tokens || []).map((k) => `<div class="tok${k === 'Ty' ? ' me' : ''}">${Art.shield(k)}</div>`).join('')}</div>`);
    n.style.setProperty('--tw', o.tw || '6rem');
    n.style.animation = 'none';
    return n;
  }
  function sumPlate(v, cls) { return h('div', 't-sum' + (cls ? ' ' + cls : ''), `<span class="lbl">Součet</span><b>${v}</b>`); }
  function setSum(plate, v) { const b = plate.querySelector('b'); if (b.textContent !== String(v)) { b.textContent = v; plate.classList.remove('bump'); void plate.offsetWidth; plate.classList.add('bump'); } }
  function seatBox(name, key, cards, sum, o) {
    o = o || {};
    const box = h('div', 't-seat' + (o.cls ? ' ' + o.cls : ''));
    const head = h('div', 't-seat-head', `<span class="emb" style="--pc:${PC[key] || '#888'}">${Art.shield(key)}</span><span class="nm">${name}</span>`);
    const row = h('div', 't-cards');
    cards.forEach((c) => row.appendChild(c));
    const plate = sumPlate(sum);
    box.append(head, row, plate);
    box._row = row; box._plate = plate;
    return box;
  }
  function note(text, cls) { return h('div', 't-note' + (cls ? ' ' + cls : ''), text); }
  function zone(title, sub, cls) { return h('div', 't-zone' + (cls ? ' ' + cls : ''), `<div class="zt">${title}</div><div class="zs">${sub || ''}</div>`); }

  // ---------- přetahování karty do oken ----------
  // zonesFn() -> pole elementů; onDrop(zoneEl, cardEl) vrací true, když se karta přijala.
  function enableDrag(card, zonesFn, onDrop) {
    let ghost = null, sx = 0, sy = 0, moved = false, over = null;
    const clearOver = () => { zonesFn().forEach((z) => z.classList.remove('hot')); over = null; };
    const hit = (x, y) => zonesFn().find((z) => { const r = z.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) || null;
    card.addEventListener('pointerdown', (e) => {
      if (card.classList.contains('locked-card')) return;
      e.preventDefault();
      sx = e.clientX; sy = e.clientY; moved = false;
      const r = card.getBoundingClientRect();
      const offx = e.clientX - r.left, offy = e.clientY - r.top;
      const mv = (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        if (!moved) {
          moved = true; sfx('pick');
          ghost = card.cloneNode(true); ghost.classList.add('t-ghost'); ghost.style.width = r.width + 'px'; ghost.style.setProperty('--cw', r.width + 'px');
          document.body.appendChild(ghost); card.classList.add('drag-origin');
          zonesFn().forEach((z) => z.classList.add('armed'));
        }
        ghost.style.left = (ev.clientX - offx) + 'px'; ghost.style.top = (ev.clientY - offy) + 'px';
        const z = hit(ev.clientX, ev.clientY);
        if (z !== over) { if (over) over.classList.remove('hot'); over = z; if (z) z.classList.add('hot'); }
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        if (!moved) { selectCard(card, zonesFn, onDrop); return; }
        const z = hit(ev.clientX, ev.clientY);
        if (ghost) { ghost.remove(); ghost = null; }
        card.classList.remove('drag-origin'); zonesFn().forEach((q) => q.classList.remove('armed', 'hot'));
        if (z) onDrop(z, card);
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
  }
  // klik na kartu = označit, klik na okno = zahrát tam
  let selected = null, selZones = null, selDrop = null;
  function selectCard(card, zonesFn, onDrop) {
    if (selected) selected.classList.remove('selected');
    if (selected === card) { selected = null; zonesFn().forEach((z) => z.classList.remove('armed')); return; }
    selected = card; card.classList.add('selected'); sfx('select');
    selZones = zonesFn; selDrop = onDrop;
    zonesFn().forEach((z) => z.classList.add('armed'));
  }
  function bindZoneClicks(zones) {
    zones.forEach((z) => {
      z.addEventListener('click', () => {
        if (!selected || !selZones || !selZones().includes(z)) return;
        const c = selected; selected.classList.remove('selected'); selected = null;
        selZones().forEach((q) => q.classList.remove('armed'));
        selDrop(z, c);
      });
    });
  }
  function resetSelection() { selected = null; selZones = null; selDrop = null; }

  // ---------- obecné pomůcky kroků ----------
  function ctxFor(step, sceneEl) {
    return {
      scene: sceneEl,
      say(msg, kind) { const fb = root.querySelector('.tut-fb'); fb.className = 'tut-fb ' + (kind || ''); fb.innerHTML = msg; },
      done() { doneSet.add(idx); refreshNav(); const fb = root.querySelector('.tut-fb'); fb.classList.add('ok'); sfx('claim'); },
    };
  }
  function pick(entries, cls, cb) { // režim výběru: klik na jednu z karet
    entries.forEach((e) => { e.classList.add('t-pickable'); e.onclick = () => { entries.forEach((x) => { x.classList.remove('t-pickable'); x.onclick = null; }); cb(e); }; });
  }

  // ---------- kroky ----------
  const STEPS = [
    { // 1
      title: 'Cíl hry',
      text: () => `<p>Dva rody bojují o korunu. Hra se hraje na <b>kola</b>. Kdo kolo vyhraje, získá <b>pole</b>, na kterém stojí.</p>
        <p>Jakmile někdo nasbírá <b>4 pole</b> (ve třech hráčích <b>5 polí</b>), hra končí a sečtou se body. Pole mají barvu a <b>barva znamená schopnost</b>.</p>
        <p class="tut-tip">Je to hra o odhadu soupeřů: kdy zabrat, kdy ustoupit a kdy schovat karty na lepší chvíli.</p>`,
      build(c) {
        const row = h('div', 't-row t-center');
        COLORS.forEach((col) => {
          const w = h('div', 't-col');
          w.append(tileEl(col, [], { tw: '6.4rem' }), h('div', 't-cap', `<b>${COLOR_ABILITY_NAME[col]}</b>`));
          row.appendChild(w);
        });
        c.scene.append(note('Pět barev polí = pět schopností', 'top'), row);
      },
    },
    { // 2
      title: 'Tvůj první tah',
      gate: true,
      text: () => `<p>V kole se střídáte po směru hodinových ručiček. Ve svém tahu <b>zahraješ kartu</b>: její číslo se přičte k tvému <b>součtu</b>.</p>
        <p>Kolo vyhraje ten, kdo má nakonec <b>nejvyšší součet</b>.</p>
        <p class="tut-task">Úkol: přetáhni jednu kartu z ruky na svůj stůl (nebo na ni klikni a pak klikni na stůl).</p>`,
      build(c) {
        const opp = seatBox('York', 'York', [cardEl('B', 4, { cw: '3.7rem' })], 4, { cls: 'opp' });
        const opp2 = seatBox('Lancaster', 'Lancaster', [cardEl('Y', 3, { cw: '3.7rem' }), cardEl('N', 2, { cw: '3.7rem' })], 5, { cls: 'opp' });
        const my = seatBox('Ty', 'Ty', [], 0, { cls: 'me' });
        const drop = zone('Tvůj stůl', 'sem přetáhni kartu', 'table'); my._row.appendChild(drop);
        const hand = h('div', 't-hand');
        const cards = [cardEl('R', 3, { cw: '5rem' }), cardEl('B', 2, { cw: '5rem', v: 1 }), cardEl('N', 5, { cw: '5rem', v: 2 })];
        cards.forEach((cd) => hand.appendChild(cd));
        const top = h('div', 't-row t-between'); top.append(opp, opp2);
        c.scene.append(top, my, hand);
        let played = false;
        const zones = () => [drop];
        cards.forEach((cd) => enableDrag(cd, zones, (z, card) => {
          if (played) return;
          played = true; sfx('card');
          drop.style.display = 'none';
          const placed = cardEl(card.dataset.color, +card.dataset.value, { cw: '4.4rem' });
          my._row.appendChild(placed); card.style.visibility = 'hidden';
          setSum(my._plate, +card.dataset.value);
          c.say(`Zahrána karta: ${COLOR_NAME[card.dataset.color]} ${card.dataset.value}. Tvůj součet je teď <b>${card.dataset.value}</b>.`, 'ok');
          c.done();
        }));
        bindZoneClicks([drop]);
      },
    },
    { // 3
      title: 'Pass a výhra kola',
      gate: true,
      text: () => `<p>Kdykoli můžeš <b>passnout</b>: pro zbytek kola už nehraješ a tvůj součet zůstane, jak je. Kdo passnul, už se nevrací.</p>
        <p>Soupeři York i Lancaster už passnuli. Ty zaostáváš. Přidej karty tak, aby ses dostal do <b>vedení</b>, a pak passni.</p>
        <p class="tut-tip">Při shodě součtu vyhrává ten, kdo je po směru blíž hráči, který kolo začal. Karty nehraj zbytečně: co nepoložíš, zůstane ti na příště.</p>
        <p class="tut-task">Úkol: vyhraj toto kolo.</p>`,
      build(c) {
        const mk = (name, key, cards, sum) => { const s = seatBox(name, key, cards, sum, { cls: 'opp' }); s.append(h('div', 't-passed', 'passnul')); return s; };
        const a = mk('York', 'York', [cardEl('R', 5, { cw: '3.7rem' }), cardEl('B', 3, { cw: '3.7rem' })], 8);
        const b = mk('Lancaster', 'Lancaster', [cardEl('Y', 4, { cw: '3.7rem' }), cardEl('N', 3, { cw: '3.7rem' })], 7);
        const my = seatBox('Ty', 'Ty', [cardEl('G', 4, { cw: '4.4rem' })], 4, { cls: 'me' });
        const drop = zone('Tvůj stůl', 'sem přetáhni kartu', 'table'); my._row.appendChild(drop);
        const hand = h('div', 't-hand');
        const cards = [cardEl('R', 4, { cw: '5rem' }), cardEl('B', 2, { cw: '5rem', v: 1 }), cardEl('N', 3, { cw: '5rem', v: 2 })];
        cards.forEach((cd) => hand.appendChild(cd));
        const pass = h('button', 't-pass', '<span>Pass</span>');
        const top = h('div', 't-row t-between'); top.append(a, b);
        const bottom = h('div', 't-bottom'); bottom.append(hand, pass);
        c.scene.append(top, my, bottom);
        let sum = 4, finished = false;
        const zones = () => [drop];
        cards.forEach((cd) => enableDrag(cd, zones, (z, card) => {
          if (finished) return;
          sfx('card'); const v = +card.dataset.value; sum += v;
          const placed = cardEl(card.dataset.color, v, { cw: '4.4rem' });
          my._row.insertBefore(placed, drop); card.style.visibility = 'hidden'; card.classList.add('locked-card');
          setSum(my._plate, sum);
          c.say(`Tvůj součet je <b>${sum}</b>. Soupeři mají 8 a 7.`, sum > 8 ? 'ok' : '');
        }));
        bindZoneClicks([drop]);
        pass.onclick = () => {
          if (finished) return;
          if (sum > 8) {
            finished = true; sfx('pass'); pass.disabled = true; my.classList.add('winner');
            c.say(`Passuješ se součtem <b>${sum}</b>. Soupeři už nemají jak reagovat, <b>kolo je tvoje</b> a bereš pole, na kterém stojíš.`, 'ok');
            c.done();
          } else {
            sfx('error'); c.say(`Se součtem ${sum} by kolo <b>skončilo prohrou</b> (York má 8). Přidej další kartu a zkus to znovu.`, 'bad');
          }
        };
      },
    },
    { // 3b remíza
      title: 'Remíza',
      gate: true,
      text: () => `<p>Co když mají dva hráči <b>stejný součet</b>? Rozhoduje <b>pořadí u stolu</b>: vyhrává ten, kdo sedí <b>blíž po směru hodinových ručiček za hráčem, který kolo začal</b>. Začínající hráč má v remíze nejlepší pozici.</p>
        <p>Stejné pravidlo platí i při <b>shodě bodů na konci hry</b>.</p>
        <p class="tut-tip">Proto se vyplatí o jeden bod víc, když sedíš „dál“ od začínajícího. A kdo je blízko začínajícímu, může při remíze klidně passnout.</p>
        <p class="tut-task">Úkol: kolo začal Lancaster. Ty a York máte po 9. Klikni na vítěze.</p>`,
      build(c) {
        const mk = (name, key, cards, sum, order, start) => {
          const b = seatBox(name, key, cards, sum, { cls: 'opp' });
          b.append(h('div', 't-order' + (start ? ' start' : ''), start ? `${order}. začíná kolo` : `${order}. v pořadí`));
          return b;
        };
        const lan = mk('Lancaster', 'Lancaster', [cardEl('Y', 4, { cw: '3.7rem' }), cardEl('N', 3, { cw: '3.7rem' })], 7, 1, true);
        const me = mk('Ty', 'Ty', [cardEl('G', 4, { cw: '3.7rem' }), cardEl('R', 5, { cw: '3.7rem' })], 9, 2, false);
        const york = mk('York', 'York', [cardEl('B', 5, { cw: '3.7rem' }), cardEl('S', 4, { cw: '3.7rem' })], 9, 3, false);
        const row = h('div', 't-row t-center t-gap'); row.append(lan, me, york);
        const arrow = h('div', 't-note', 'Pořadí po směru hodinových ručiček od hráče, který kolo začal →');
        c.scene.append(arrow, row);
        let done = false;
        const choose = (box, name) => () => {
          if (done) return;
          if (box === me) {
            done = true; sfx('claim'); me.classList.add('winner');
            c.say('Správně! Oba máte 9, ale <b>Ty sedíš po Lancasterovi dřív</b> než York, takže kolo bereš ty.', 'ok'); c.done();
          } else if (box === york) {
            sfx('error'); c.say('York má sice 9, jenže v pořadí od začínajícího přichází až <b>po tobě</b>. Zkus to znovu.', 'bad');
          } else {
            sfx('error'); c.say('Lancaster má jen 7. Remíza je mezi Tebou a Yorkem.', 'bad');
          }
        };
        [[lan, 'Lancaster'], [me, 'Ty'], [york, 'York']].forEach(([b, n]) => { b.style.cursor = 'pointer'; b.onclick = choose(b, n); });
      },
    },
    { // 4
      title: 'Pole, na kterém stojíš',
      text: () => `<p>Každý hráč <b>stojí na jednom poli</b>. Vítěz kola si pole <b>vezme do svého panství</b> a vybere si nové.</p>
        <p>Na <b>obsazené pole</b> se dá vstoupit, ale stojí to <b>kartu</b> z ruky (nebo 3 karty z vrchu balíčku). Kdo přišel o pole, protože ho vyhrál soupeř, musí se přesunout stejným způsobem.</p>
        <p class="tut-tip">Barva pole, na kterém stojíš, určuje, jakou schopnost můžeš v kole použít. Vybírej pole podle karet na ruce.</p>`,
      build(c) {
        const row = h('div', 't-row t-center');
        const t1 = tileEl('R', ['Ty'], { mine: true, tw: '6.6rem' });
        const t2 = tileEl('B', ['York', 'Lancaster'], { tw: '6.6rem' });
        const t3 = tileEl('G', [], { tw: '6.6rem' });
        [[t1, 'Stojíš tu ty'], [t2, 'Obsazeno — vstup stojí kartu'], [t3, 'Volné pole']].forEach(([t, cap]) => { const w = h('div', 't-col'); w.append(t, h('div', 't-cap', cap)); row.appendChild(w); });
        c.scene.append(note('Kdo vyhraje kolo, bere své pole', 'top'), row);
      },
    },
    { // 5
      title: 'Schopnost zdarma',
      gate: true,
      text: () => `<p>Když zahraješ kartu <b>stejné barvy, jako je pole, na kterém stojíš</b>, spustí se schopnost pole <b>zdarma</b>.</p>
        <p>Stojíš na <b>červeném poli</b>: Vražda zničí jednu soupeřovu vyloženou kartu.</p>
        <p class="tut-task">Úkol: zahraj červenou kartu a znič Yorkovu modrou 5.</p>`,
      build(c) {
        const bl = cardEl('B', 5, { cw: '3.9rem' }), gr = cardEl('G', 2, { cw: '3.9rem' });
        const york = seatBox('York', 'York', [bl, gr], 7, { cls: 'opp' });
        const lan = seatBox('Lancaster', 'Lancaster', [cardEl('Y', 3, { cw: '3.9rem' })], 3, { cls: 'opp' });
        const my = seatBox('Ty', 'Ty', [], 0, { cls: 'me' });
        const drop = zone('Tvůj stůl', 'sem přetáhni kartu', 'table'); my._row.appendChild(drop);
        const standing = h('div', 't-standing'); standing.append(tileEl('R', ['Ty'], { mine: true, tw: '3.6rem' }), h('div', 't-cap', 'Stojíš na červeném<br>Vražda'));
        const hand = h('div', 't-hand');
        const cards = [cardEl('R', 3, { cw: '5rem' }), cardEl('B', 2, { cw: '5rem', v: 1 }), cardEl('N', 4, { cw: '5rem', v: 2 })];
        cards.forEach((cd) => hand.appendChild(cd));
        const top = h('div', 't-row t-between'); top.append(york, lan);
        const mid = h('div', 't-row t-between t-mid'); mid.append(standing, my);
        c.scene.append(top, mid, hand);
        let used = false;
        const zones = () => [drop];
        cards.forEach((cd) => enableDrag(cd, zones, (z, card) => {
          if (used) return;
          const col = card.dataset.color, v = +card.dataset.value;
          if (col !== 'R') { sfx('error'); c.say('Tahle karta barvě pole <b>neodpovídá</b>, schopnost se nespustí. Zkus červenou.', 'bad'); return; }
          used = true; sfx('card');
          const placed = cardEl('R', v, { cw: '4.4rem' }); my._row.insertBefore(placed, drop); drop.style.display = 'none'; card.style.visibility = 'hidden';
          setSum(my._plate, v);
          c.say('Barva sedí, <b>Vražda se spouští zdarma</b>. Klikni na soupeřovu kartu, kterou chceš zničit.', 'ok');
          sfx('dagger');
          pick([bl, gr], '', (e) => {
            sfx('destroy'); e.classList.add('inactive'); setSum(york._plate, e === bl ? 2 : 5);
            c.say(e === bl ? 'Modrá 5 je zničená, York spadl ze 7 na <b>2</b>. Ideální cíl!' : 'Zničená, ale modrá 5 byla větší sousto. Příště cílit na nejvyšší kartu.', 'ok');
            c.done();
          });
        }));
        bindZoneClicks([drop]);
      },
    },
    { // 6
      title: 'Pět schopností',
      text: () => `<p>Každá barva má jinou schopnost. Hned je přečti, nebudeš je muset hádat:</p>`,
      build(c) {
        const grid = h('div', 't-abil');
        COLORS.forEach((col) => {
          const w = h('div', 't-ab', `<div class="tile-art">${Art.tile(col)}</div><div class="ab-t"><b>${COLOR_ABILITY_NAME[col]}</b><br>${COLOR_ABILITY_DESC[col]}</div>`);
          grid.appendChild(w);
        });
        c.scene.append(grid);
        c.scene.classList.add('scroll');
      },
    },
    { // 7
      title: 'Žeton přízně',
      gate: true,
      text: () => `<p>Co když nemáš kartu barvy pole? Máš <b>3 žetony přízně na celou hru</b>. Se žetonem zahraješ <b>libovolnou kartu</b> a schopnost pole se spustí stejně.</p>
        <p>Žetony jsou vzácné, chraň je na rozhodující okamžik.</p>
        <p class="tut-task">Úkol: přetáhni kartu (třeba modrou) do okna <b>Se žetonem</b> a znič Yorkovu červenou 4.</p>`,
      build(c) {
        const tg = cardEl('R', 4, { cw: '3.9rem' });
        const york = seatBox('York', 'York', [tg, cardEl('G', 1, { cw: '3.9rem' })], 5, { cls: 'opp' });
        const my = seatBox('Ty', 'Ty', [], 0, { cls: 'me' });
        const drop = zone('Tvůj stůl', 'zahrát bez schopnosti', 'table'); my._row.appendChild(drop);
        const tokZone = zone('Se žetonem', 'spustí schopnost pole', 'token');
        const tokens = h('div', 't-tokens', `<span class="coin">${Art.ICON.coin}</span><span class="coin">${Art.ICON.coin}</span><span class="coin">${Art.ICON.coin}</span>`);
        const standing = h('div', 't-standing'); standing.append(tileEl('R', ['Ty'], { mine: true, tw: '3.6rem' }), h('div', 't-cap', 'Stojíš na červeném<br>Vražda'));
        const hand = h('div', 't-hand');
        const cards = [cardEl('B', 4, { cw: '5rem', v: 1 }), cardEl('N', 2, { cw: '5rem', v: 2 })];
        cards.forEach((cd) => hand.appendChild(cd));
        const mid = h('div', 't-row t-between t-mid'); mid.append(standing, my, h('div', 't-col', ''));
        mid.lastChild.append(tokZone, tokens);
        c.scene.append(york, mid, hand);
        let used = false;
        const zones = () => [drop, tokZone];
        cards.forEach((cd) => enableDrag(cd, zones, (z, card) => {
          if (used) return;
          const v = +card.dataset.value, col = card.dataset.color;
          used = true; sfx('card');
          const placed = cardEl(col, v, { cw: '4.4rem' }); my._row.insertBefore(placed, drop); drop.style.display = 'none'; card.style.visibility = 'hidden'; setSum(my._plate, v);
          if (z === tokZone) {
            tokens.lastElementChild.classList.add('spent'); sfx('favor'); sfx('dagger');
            c.say('Žeton spotřebován, <b>Vražda se spustila</b>. Klikni na kartu, kterou zničíš.', 'ok');
            pick([tg], '', (e) => { sfx('destroy'); e.classList.add('inactive'); setSum(york._plate, 1); c.say('Hotovo. Zbývají ti 2 žetony.', 'ok'); c.done(); });
          } else {
            used = false; placed.remove(); drop.style.display = ''; card.style.visibility = ''; setSum(my._plate, 0);
            sfx('error'); c.say('Bez žetonu se schopnost nespustí, protože karta není červená. Přetáhni ji do okna <b>Se žetonem</b>.', 'bad');
          }
        }));
        bindZoneClicks([drop, tokZone]);
      },
    },
    { // 8
      title: 'Uschování karty',
      gate: true,
      text: () => `<p>Kartu nemusíš hrát na stůl. Můžeš ji <b>uschovat do truhly</b>: položíš ji <b>lícem dolů</b>. Soupeři nevidí, co to je, a do součtu kola se počítá jako <b>1</b>.</p>
        <p>Když kolo skončí, karta v truhle putuje <b>natrvalo do tvého panství</b> a na konci hry <b>násobí body</b> své barvy.</p>
        <p class="tut-task">Úkol: přetáhni červenou kartu do okna <b>Uschovat do truhly</b>.</p>`,
      build(c) {
        const my = seatBox('Ty', 'Ty', [], 0, { cls: 'me' });
        const drop = zone('Tvůj stůl', 'zahrát lícem nahoru', 'table'); my._row.appendChild(drop);
        const bank = zone('Uschovat do truhly', 'lícem dolů do panství', 'bank');
        const hand = h('div', 't-hand');
        const cards = [cardEl('R', 3, { cw: '5rem' }), cardEl('B', 5, { cw: '5rem', v: 1 })];
        cards.forEach((cd) => hand.appendChild(cd));
        const pool = h('div', 't-pool', `<div class="pc-tile">${Art.tile('R')}<span class="cnt">0</span></div><div class="t-cap">Tvé panství: červená</div>`);
        const mid = h('div', 't-row t-between t-mid'); mid.append(my, bank);
        const bottom = h('div', 't-bottom'); bottom.append(hand, pool);
        c.scene.append(mid, bottom);
        let used = false;
        const zones = () => [drop, bank];
        cards.forEach((cd) => enableDrag(cd, zones, (z, card) => {
          if (used) return;
          if (z !== bank) { sfx('error'); c.say('Takhle se karta jen <b>zahraje lícem nahoru</b>. Zkus okno <b>Uschovat do truhly</b>.', 'bad'); return; }
          used = true; sfx('bank');
          const back = cardEl('N', 1, { cw: '4.4rem', back: true, cls: 'facedown' }); back.classList.add('peekable'); back.insertAdjacentHTML('beforeend', `<div class="peek">${Art.cardFace(card.dataset.color, +card.dataset.value || 0, 0)}</div>`); my._row.insertBefore(back, drop); drop.style.display = 'none'; card.style.visibility = 'hidden';
          setSum(my._plate, 1);
          const isRed = card.dataset.color === 'R';
          c.say(`Karta leží lícem dolů a počítá se jako <b>1</b>. Na konci kola skončí ve tvém panství${isRed ? ' jako <b>červená</b>' : ' jako ' + COLOR_NAME[card.dataset.color].toLowerCase()}. Najedeš-li na ni myší (na dotyku ji podrž prstem), <b>na okamžik uvidíš, co to je</b> (jen ty, soupeři ne).`, 'ok');
          const cnt = pool.querySelector('.cnt'); cnt.textContent = '1';
          if (!isRed) pool.querySelector('.t-cap').textContent = 'Tvé panství: ' + COLOR_NAME[card.dataset.color].toLowerCase();
          c.done();
        }));
        bindZoneClicks([drop, bank]);
      },
    },
    { // 9
      title: 'Jak se počítají body',
      text: () => `<p>Na konci hry platí pro každou barvu: <b>pole × (1 + karty v truhle té barvy)</b>. Body všech barev se sečtou.</p>
        <p>Proto se vyplácí sbírat <b>pole jedné barvy</b> a do truhly k nim uschovávat karty téže barvy. Zkus to:</p>
        <p class="tut-tip">Kdo první získá potřebný počet polí, hru ukončí. Vyhrává ale ten, kdo má <b>nejvíc bodů</b>, a tím nemusí být ten, kdo hru ukončil.</p>`,
      build(c) {
        const cols = [{ col: 'R', tiles: 2, bank: 1 }, { col: 'B', tiles: 1, bank: 0 }];
        const total = h('div', 't-total'); const rows = h('div', 't-row t-center t-gap');
        const upd = () => {
          let sum = 0;
          cols.forEach((o) => { o._pts.textContent = `${o.tiles} × (1 + ${o.bank}) = ${o.tiles * (1 + o.bank)}`; o._stack.innerHTML = Array.from({ length: Math.min(o.bank, 8) }, (_, i) => `<div class="card t-card sm facedown">${Art.cardBack(i)}</div>`).join(''); sum += o.tiles * (1 + o.bank); });
          total.innerHTML = `Celkem: <b>${sum}</b> bodů`;
        };
        cols.forEach((o) => {
          const w = h('div', 't-col t-score');
          const tl = tileEl(o.col, [], { tw: '5.4rem' });
          const cnt = h('div', 't-cnt', `<span>${o.tiles}</span> ${o.tiles === 1 ? 'pole' : 'pole'}`);
          o._stack = h('div', 't-bstack'); o._pts = h('div', 't-pts');
          const btn = h('button', 'btn t-mini', '+ karta v truhle'); btn.onclick = () => { o.bank = Math.min(8, o.bank + 1); sfx('bank'); upd(); };
          const btn2 = h('button', 'btn t-mini', '+ pole'); btn2.onclick = () => { o.tiles = Math.min(4, o.tiles + 1); cnt.firstChild.textContent = o.tiles; sfx('claim'); upd(); };
          w.append(tl, cnt, o._stack, o._pts, btn, btn2);
          rows.appendChild(w);
        });
        c.scene.append(note('Zkus přidávat pole a karty v truhle', 'top'), rows, total); upd();
      },
    },
    { // 10
      title: 'Karta s hodnotou 1',
      gate: true,
      text: () => `<p>Jednička je zvláštní: když ji zahraješ, musíš si <b>jednu svou vyloženou kartu (2 a víc) vzít zpět na ruku</b>.</p>
        <p>Je to záchranná brzda. Ohrožená vysoká karta na stole ti nezůstane pro soupeře jako terč a příště ji zahraješ jinam.</p>
        <p class="tut-task">Úkol: zahraj jedničku a vrať si modrou 5.</p>`,
      build(c) {
        const a = cardEl('R', 3, { cw: '4.4rem' }), b = cardEl('B', 5, { cw: '4.4rem' });
        const my = seatBox('Ty', 'Ty', [a, b], 8, { cls: 'me' });
        const drop = zone('Tvůj stůl', 'sem přetáhni jedničku', 'table'); my._row.appendChild(drop);
        const hand = h('div', 't-hand');
        const one = cardEl('N', 1, { cw: '5rem', v: 2 }); hand.appendChild(one);
        c.scene.append(note('York hrozí zničit tvé karty. Co s tím?', 'top'), my, hand);
        let used = false;
        const zones = () => [drop];
        enableDrag(one, zones, (z, card) => {
          if (used) return; used = true; sfx('card');
          const placed = cardEl('N', 1, { cw: '4.4rem' }); my._row.insertBefore(placed, drop); drop.style.display = 'none'; card.style.visibility = 'hidden'; setSum(my._plate, 9);
          c.say('Jednička je na stole. Teď si <b>vyber kartu (2+), kterou vezmeš zpět na ruku</b>.', 'ok');
          pick([a, b], '', (e) => {
            sfx('returnCard'); e.classList.add('flyback');
            setTimeout(() => { e.remove(); setSum(my._plate, 9 - +e.dataset.value); }, 380);
            const back = cardEl(e.dataset.color, +e.dataset.value, { cw: '5rem' }); back.classList.add('deal-in'); hand.appendChild(back);
            c.say(`${COLOR_NAME[e.dataset.color]} ${e.dataset.value} je zpátky na ruce.`, 'ok'); c.done();
          });
        });
        bindZoneClicks([drop]);
      },
    },
    { // 11
      title: 'Hrdinové',
      text: () => `<p>Na začátku hry dostaneš <b>tajného hrdinu</b>. Soupeři vidí jen to, že nějakého mají. Hrdinu můžeš <b>jednou za hru</b> vyložit jako svůj tah (od 2. kola, přetažením do okna <b>Vyložit hrdinu</b>).</p>
        <p>Jejich účinky jsou silné a otáčejí celý stůl. Čas na ně je, když je stůl plný karet.</p>`,
      build(c) {
        const grid = h('div', 't-heroes');
        HERO_LIST.forEach((hd) => grid.appendChild(h('div', 't-hero', `<div class="hc">${Art.hero(hd.id)}</div><div class="ht"><b>${hd.name}</b><br>${hd.desc}</div>`)));
        c.scene.append(grid); c.scene.classList.add('scroll');
      },
    },
    { // 12
      title: 'Konec kola a konec hry',
      text: () => `<p>Když všichni passnou, kolo se vyhodnotí. Pak se hra ukončí buď tím, že někdo získá cílový počet polí, nebo když dojdou pole.</p>
        <p>Potom se sečtou body (<b>pole × (1 + karty v truhle)</b>) a vyhrává ten, kdo jich má nejvíc.</p>`,
      build(c) {
        const list = h('div', 't-steps');
        [['1', 'Vítěz kola bere pole, na kterém stál.'], ['2', 'Karty v truhle všech jdou do jejich panství.'], ['3', 'Vítěz si vybere nové pole; vytlačení hráči se přesunou.'], ['4', 'Všichni dobírají 2 karty (max. 10 na ruce).'], ['5', 'Vítěz začíná další kolo.']].forEach(([n, t]) => list.appendChild(h('div', 't-st', `<span class="n">${n}</span><span>${t}</span>`)));
        c.scene.append(note('Jedno kolo od začátku do konce', 'top'), list);
      },
    },
    { // 13
      title: 'Hotovo!',
      last: true,
      text: () => `<p>Teď už znáš všechna pravidla. Poslední rady:</p>
        <ul><li>Nehoň každé kolo za každou cenu. <b>Passni včas</b> a ušetři karty.</li>
        <li>Karty barev, které <b>sbíráš</b>, raději <b>uschovej do truhly</b>.</li>
        <li>Sleduj, kolik karet mají soupeři a kdo už passnul.</li></ul>
        <p class="tut-tip">Kdykoli si můžeš pravidla připomenout v horní liště (ikona knihy).</p>`,
      build(c) {
        const row = h('div', 't-row t-center');
        const w = h('div', 't-col');
        w.append(h('div', 't-crown', Art.crownIcon()), h('div', 't-cap big', 'Hodně štěstí u stolu'));
        row.appendChild(w); c.scene.append(row);
      },
    },
  ];

  // ---------- vykreslení ----------
  function refreshNav() {
    const st = STEPS[idx];
    const next = root.querySelector('.t-next'), prev = root.querySelector('.t-prev');
    prev.disabled = idx === 0;
    const locked = st.gate && !doneSet.has(idx);
    next.disabled = locked;
    next.textContent = st.last ? 'Zahrát si' : 'Další';
    root.querySelector('.t-skip-step').style.display = locked ? '' : 'none';
    root.querySelectorAll('.t-dot').forEach((d, i) => { d.classList.toggle('on', i === idx); d.classList.toggle('done', i < idx || doneSet.has(i)); });
  }
  function show(i) {
    resetSelection();
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    const st = STEPS[idx];
    root.querySelector('.tut-title').textContent = st.title;
    root.querySelector('.tut-n').textContent = `Krok ${idx + 1} / ${STEPS.length}`;
    root.querySelector('.tut-body').innerHTML = st.text();
    const fb = root.querySelector('.tut-fb'); fb.className = 'tut-fb'; fb.innerHTML = '';
    const scene = root.querySelector('.tut-scene'); scene.innerHTML = ''; scene.className = 'tut-scene';
    st.build(ctxFor(st, scene));
    scene.scrollTop = 0;
    refreshNav();
  }
  function close(finished) {
    root.classList.add('hidden'); resetSelection();
    const cb = onClose; onClose = null;
    try { localStorage.setItem('vr_tutorial_done', '1'); } catch (e) { /* */ }
    if (cb) cb(!!finished);
  }
  function open(cb, startAt) {
    root = $('tutorial'); onClose = cb || null; doneSet = new Set();
    if (!root._built) {
      root._built = true;
      root.innerHTML = `<div class="tut">
        <div class="tut-text">
          <button class="x t-close" aria-label="Zavřít">×</button>
          <div class="tut-n"></div>
          <h2 class="tut-title"></h2>
          <div class="divider">${Art.DIVIDER}</div>
          <div class="tut-body"></div>
          <div class="tut-fb"></div>
          <div class="tut-nav">
            <button class="btn t-prev">Zpět</button>
            <button class="btn primary t-next">Další</button>
          </div>
          <button class="t-skip-step" style="display:none">Přeskočit tento úkol</button>
          <div class="tut-dots">${STEPS.map((_, i) => `<span class="t-dot" data-i="${i}"></span>`).join('')}</div>
        </div>
        <div class="tut-scene"></div>
      </div>`;
      root.querySelector('.t-close').onclick = () => { sfx('select'); close(false); };
      root.querySelector('.t-prev').onclick = () => { sfx('pick'); show(idx - 1); };
      root.querySelector('.t-next').onclick = () => { sfx('pick'); if (STEPS[idx].last) close(true); else show(idx + 1); };
      root.querySelector('.t-skip-step').onclick = () => { doneSet.add(idx); sfx('pick'); show(idx + 1); };
      root.querySelectorAll('.t-dot').forEach((d) => { d.onclick = () => { const i = +d.dataset.i; if (i <= idx || doneSet.has(i - 1) || !STEPS.slice(0, i).some((s, k) => s.gate && !doneSet.has(k))) show(i); }; });
    }
    root.classList.remove('hidden');
    show(startAt || 0);
  }
  return { open, STEPS };
})();
