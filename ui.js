// ===================== UI VRSTVA — STOLNÍ VZHLED =====================
// Pohled hráče u stolu. Engine (game.js) volá globální funkce uiLog/uiRender/uiHuman*; tady je
// implementujeme nad DOM ze template.html. Karty/pole/hrdinové jsou SVG z art.js, zvuk ze Sound (audio.js).

const $ = (id) => document.getElementById(id);
const UI = {
  game: null, tempo: 'normal', seatsFor: null,
  selected: null,       // { kind:'card'|'hero', id }
  drag: null,           // probíhající tažení
  actionResolve: null,  // resolve čekající uiHumanChooseAction
  pick: null,           // { kind, ids:Set, resolve }
  passArmed: false, passTimer: null,
  lastFlash: new Map(), seenRender: false,
  gestured: false,
};

// ---------- pomocné ----------
function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function setHTML(node, html) { if (node._h !== html) { node.innerHTML = html; node._h = html; } }
function remPx() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; }
function hashStr(s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; }
function variantOf(id) { return hashStr(String(id)) % 4; }
function stageRect() { return $('stage').getBoundingClientRect(); }
function relCenter(node) {
  const s = stageRect(), r = node.getBoundingClientRect();
  return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height };
}
function sfx(name) { try { Sound.sfx(name); } catch (e) { /* */ } }
function fastMode() { return TURN_STEP_MS === 0; }
function delay(ms) { return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve(); }
const shieldKey = (p) => (p.isHuman ? 'Ty' : p.name);
const humanOf = (game) => game.players.find((p) => p.isHuman);

function reconcile(container, items, keyOf, make, sigOf, update) {
  const existing = new Map();
  for (const ch of Array.from(container.children)) if (ch._key != null) existing.set(ch._key, ch);
  const used = new Set();
  let prev = null;
  for (const it of items) {
    const k = keyOf(it);
    let node = existing.get(k);
    const sig = sigOf(it);
    if (!node) { node = make(it); node._key = k; node._sig = sig; node._isNew = true; }
    else if (node._sig !== sig) { const old = node._sig; node._sig = sig; update(node, it, old); }
    used.add(k);
    const ref = prev ? prev.nextSibling : container.firstChild;
    if (node !== ref) container.insertBefore(node, ref);
    prev = node;
  }
  for (const [k, node] of existing) if (!used.has(k)) node.remove();
}

// ---------- tempo ----------
const TEMPOS = {
  slow:    { label: 'Pomalé',   bot: 900, place: 450, round: 900, step: 1300 },
  normal:  { label: 'Běžné',    bot: 650, place: 300, round: 600, step: 950 },
  fast:    { label: 'Rychlé',   bot: 260, place: 140, round: 260, step: 420 },
  instant: { label: 'Okamžité', bot: 0,   place: 0,   round: 0,   step: 0 },
};
function applyTempo(key) {
  const t = TEMPOS[key] || TEMPOS.normal;
  UI.tempo = TEMPOS[key] ? key : 'normal';
  BOT_DELAY_MS = t.bot; PLACEMENT_DELAY_MS = t.place; ROUNDEND_DELAY_MS = t.round; TURN_STEP_MS = t.step;
  const b = $('btn-speed'); if (b) b.setAttribute('data-tip', 'Tempo hry|Teď: ' + t.label + ' (klikni pro změnu)');
}

// ---------- tooltip ----------
function showTip(target) {
  const raw = target.getAttribute('data-tip'); if (!raw) return;
  const tip = $('tooltip');
  const [title, ...rest] = raw.split('|');
  tip.innerHTML = '';
  const b = h('b'); b.textContent = title; tip.appendChild(b);
  if (rest.length) { const d = h('div', 'tt-sub'); d.textContent = rest.join('|'); tip.appendChild(d); }
  tip.classList.remove('hidden');
  const s = stageRect(), r = target.getBoundingClientRect(), tr = tip.getBoundingClientRect();
  let x = r.left - s.left + r.width / 2 - tr.width / 2;
  let y = r.top - s.top - tr.height - 8;
  if (y < 4) y = r.bottom - s.top + 8;
  x = Math.max(4, Math.min(s.width - tr.width - 4, x));
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { $('tooltip').classList.add('hidden'); }

// ---------- efekty ----------
function toast(text) {
  const t = h('div', 'toast'); t.textContent = text;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3300);
}
function burst(x, y, color, n, spread) {
  if (fastMode()) return;
  const layer = $('fx-layer'); const r = remPx();
  n = n || 14; spread = (spread || 3.2) * r;
  for (let i = 0; i < n; i++) {
    const d = h('div', 'particle');
    const sz = (0.25 + Math.random() * 0.4) * r;
    d.style.cssText = `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${color};box-shadow:0 0 ${sz}px ${color}`;
    layer.appendChild(d);
    const a = Math.random() * Math.PI * 2, dist = spread * (0.35 + Math.random() * 0.75);
    const an = d.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * dist - sz / 2}px,${Math.sin(a) * dist - sz / 2 + r}px) scale(.2)`, opacity: 0 },
    ], { duration: 550 + Math.random() * 550, easing: 'cubic-bezier(.15,.7,.3,1)' });
    an.onfinish = () => d.remove();
  }
}
function floatText(x, y, text) {
  if (fastMode()) return;
  const t = h('div', 'float-txt'); t.textContent = text; t.style.left = x + 'px'; t.style.top = y + 'px';
  $('fx-layer').appendChild(t); setTimeout(() => t.remove(), 1500);
}
function shakeStage() { if (fastMode()) return; const s = $('table'); s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); setTimeout(() => s.classList.remove('shake'), 400); }

async function showBanner(o) {
  if (fastMode()) return;
  const layer = $('banner-layer');
  const b = h('div', 'banner ' + (o.cls || ''));
  b.innerHTML = (o.html != null ? o.html : `${o.icon ? `<div class="b-ico">${o.icon}</div>` : ''}${o.kicker ? `<div class="b-kicker"></div>` : ''}<div class="b-title"></div>${o.sub ? '<div class="b-sub"></div>' : ''}${o.extra || ''}`);
  if (o.html == null) {
    const k = b.querySelector('.b-kicker'); if (k) k.textContent = o.kicker;
    b.querySelector('.b-title').textContent = o.title;
    const s = b.querySelector('.b-sub'); if (s) s.textContent = o.sub;
  }
  layer.appendChild(b);
  await delay(o.ms || Math.max(650, TURN_STEP_MS));
  b.classList.add('out');
  setTimeout(() => b.remove(), 420);
}

// ---------- log, kronika, zvuk dle typu události ----------
function uiLog(text, cls) {
  const list = $('log-list'); if (!list) return;
  const e = h('div', 'entry' + (cls ? ' ' + cls : '')); e.textContent = text;
  list.prepend(e);
  while (list.children.length > 400) list.lastChild.remove();
  if (cls !== 'muted' && cls !== 'round-header') $('ticker').textContent = text;
  switch (cls) {
    case 'favor': sfx('favor'); break;
    case 'claim': sfx('claim'); break;
    case 'eliminated': sfx('eliminated'); toast(text); break;
    case 'displaced': toast(text); break;
    case 'return-one': break;
    case 'hero': break;
    default: break;
  }
}

// ---------- textury a statická grafika ----------
function initChrome() {
  const st = $('stage').style;
  for (const k of ['wood', 'cloth', 'paper']) {
    const u = Art.makeTexture(k);
    if (u) st.setProperty('--tex-' + k, `url(${u})`);
  }
  document.documentElement.style.setProperty('--tex-paper', st.getPropertyValue('--tex-paper'));
  $('brand-rose').innerHTML = Art.svg('0 0 24 24', Art.rose(12, 12, 10.5, '#f6f1e4', null, Art.GOLD) , 'brand');
  $('btn-chronicle').innerHTML = Art.ICON.scroll;
  $('btn-rules').innerHTML = Art.ICON.book;
  $('btn-speed').innerHTML = Art.ICON.fast;
  updateSoundButtons();
  const zi = { play: Art.ICON.hand, bank: Art.ICON.pool, token: Art.ICON.coin, hero: Art.crownIcon() };
  document.querySelectorAll('.zone').forEach((z) => { z.querySelector('.zone-ico').innerHTML = zi[z.dataset.zone]; });
  setZoneTexts(null);

  $('btn-chronicle').onclick = () => { $('chronicle').classList.toggle('hidden'); sfx('select'); };
  $('chronicle-close').onclick = () => $('chronicle').classList.add('hidden');
  $('btn-rules').onclick = () => { renderRules(); $('rules').classList.remove('hidden'); sfx('select'); };
  $('btn-speed').onclick = () => {
    const keys = ['slow', 'normal', 'fast'];
    const i = keys.indexOf(UI.tempo);
    applyTempo(keys[(i + 1) % keys.length]); sfx('select'); toast('Tempo: ' + TEMPOS[UI.tempo].label);
  };
  $('btn-sfx').onclick = () => { Sound.setSfx(!Sound.prefs.sfx); updateSoundButtons(); if (Sound.prefs.sfx) sfx('select'); };
  $('btn-music').onclick = () => { Sound.setMusic(!Sound.prefs.music); updateSoundButtons(); };
  document.querySelectorAll('.overlay [data-close]').forEach((b) => { b.onclick = () => b.closest('.overlay').classList.add('hidden'); });
  document.querySelectorAll('#rules, #pool').forEach((o) => o.addEventListener('pointerdown', (e) => { if (e.target === o) o.classList.add('hidden'); }));
  $('my-pool').onclick = () => { renderPool(); $('pool').classList.remove('hidden'); sfx('select'); };

  document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) showTip(t); else hideTip(); });
  // dotyk: podržení prstu na vlastní kartě v truhle ji na chvíli odhalí (myš má hover)
  let peekTimer = null, peekEl = null;
  const peekEnd = () => { clearTimeout(peekTimer); peekTimer = null; if (peekEl) { peekEl.classList.remove('peeking'); peekEl = null; } };
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const c = e.target.closest && e.target.closest('.card.peekable');
    if (!c) return;
    peekEnd();
    peekTimer = setTimeout(() => { peekEl = c; c.classList.add('peeking'); showTip(c); try { navigator.vibrate && navigator.vibrate(12); } catch (err) { /* */ } }, 320);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => document.addEventListener(t, (e) => { if (e.pointerType !== 'mouse') { peekEnd(); hideTip(); } }));
  document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.card.peekable')) e.preventDefault(); });
  document.addEventListener('pointerdown', () => {
    if (UI.gestured) return; UI.gestured = true;
    try { Sound.init(); Sound.musicStart(); } catch (e) { /* */ }
  }, { capture: true });
  window.addEventListener('resize', () => { if (UI.game) uiRender(UI.game); });
  $('stage').addEventListener('click', onStageClick);
  $('btn-pass').onclick = onPassClick;
}
function updateSoundButtons() {
  $('btn-sfx').innerHTML = Sound.prefs.sfx ? Art.ICON.sound : Art.ICON.soundOff;
  $('btn-music').innerHTML = Sound.prefs.music ? Art.ICON.music : Art.ICON.musicOff;
  $('btn-sfx').classList.toggle('off', !Sound.prefs.sfx);
  $('btn-music').classList.toggle('off', !Sound.prefs.music);
  $('btn-sfx').setAttribute('data-tip', 'Zvukové efekty|' + (Sound.prefs.sfx ? 'zapnuto' : 'vypnuto'));
  $('btn-music').setAttribute('data-tip', 'Hudba|' + (Sound.prefs.music ? 'zapnuto' : 'vypnuto'));
}

// ---------- vykreslení ----------
function uiRender(game) {
  if (!game) return;
  UI.game = game;
  renderStatus(game);
  renderTiles(game);
  renderSeats(game);
  renderMine(game);
  renderHand(game);
  renderDock(game);
  renderControls(game);
  applyPick();
  try {
    const best = Math.max(0, ...game.players.map((p) => tilesTotal(p)));
    Sound.setIntensity(0.15 + 0.6 * (best / (game.winTiles || 4)) + Math.min(game.round, 12) / 12 * 0.25);
  } catch (e) { /* */ }
  UI.seenRender = true;
}

function renderStatus(game) {
  $('round-num').textContent = game.round;
  const st = game.players[game.startingPlayerIdx];
  $('starter-name').textContent = st ? (st.isHuman ? 'Ty' : st.name) : '—';
  $('goal-label').textContent = `Cíl: ${game.winTiles || 4} pole`;
  $('stage').classList.toggle('three', game.players.length === 3);
}

// --- pole ---
function tileTip(t) { return `${COLOR_NAME[t.color]} pole — ${COLOR_ABILITY_NAME[t.color]}|${COLOR_ABILITY_DESC[t.color]}`; }
function occHTML(game, t) {
  return t.occupants.map((pid) => {
    const p = game.players.find((x) => x.id === pid); if (!p) return '';
    return `<div class="tok${p.isHuman ? ' me' : ''}" data-tip="${p.isHuman ? 'Ty' : p.name}">${Art.shield(shieldKey(p))}</div>`;
  }).join('');
}
function renderTiles(game) {
  const tiles = inPlayTiles(game);
  const me = humanOf(game);
  reconcile($('tiles'), tiles, (t) => t.id,
    (t) => {
      const n = h('div', 'tile', `<div class="tile-art">${Art.tile(t.color)}<div class="cost">Stojí kartu</div></div><div class="occ"></div>`);
      n.dataset.tid = t.id; n.setAttribute('data-tip', tileTip(t));
      fillTile(n, game, t, me); return n;
    },
    (t) => t.occupants.join(',') + '|' + (me && me.currentTileId === t.id),
    (n, t) => fillTile(n, game, t, me));
  const claimed = game.tiles.length - tiles.length;
  UI.hintBase = `${claimed} / ${game.tiles.length} polí získáno · vítězství: ${game.winTiles || 4} pole`;
}
function fillTile(n, game, t, me) {
  setHTML(n.querySelector('.occ'), occHTML(game, t));
  n.classList.toggle('occupied', t.occupants.length > 0);
  n.classList.toggle('mine', !!(me && me.currentTileId === t.id));
}

// --- sedadla ---
function seatLayout(game) {
  const me = humanOf(game); const n = game.players.length;
  const arr = [];
  for (let i = 1; i < n; i++) arr.push(game.players[(me.seat + i) % n]);
  // pořadí po směru: vlevo, nahoře, vpravo (u 3 hráčů jen vlevo a vpravo)
  return n === 4 ? { left: arr[0], top: arr[1], right: arr[2] } : { left: arr[0], right: arr[1] };
}
function seatSkeleton(p) {
  const s = h('div', 'seat');
  s.dataset.pid = p.id;
  s.innerHTML = `
    <div class="seat-head">
      <div class="emblem"><span class="e-art"></span><span class="skull">${Art.ICON.skull}</span></div>
      <div class="who"><div class="name"></div><div class="state"></div></div>
    </div>
    <div class="seal" data-tip="Součet kola|Součet hodnot aktivních vyložených karet."><span class="lbl">Součet</span><span class="sum">0</span></div>
    <div class="seat-res"></div>
    <div class="seat-heroes"></div>
    <div class="seat-stand"></div>
    <div class="seat-played"></div>`;
  return s;
}
function ensureSeats(game) {
  if (UI.seatsFor === game.__gid) return;
  UI.seatsFor = game.__gid;
  for (const id of ['seat-left', 'seat-top', 'seat-right']) $(id).innerHTML = '';
  const lay = seatLayout(game);
  for (const pos of ['left', 'top', 'right']) {
    if (lay[pos]) $('seat-' + pos).appendChild(seatSkeleton(lay[pos]));
  }
}
function standChip(game, p) {
  const t = findTile(game, p.currentTileId);
  if (!t) return '<span class="dim">Stojí: —</span>';
  return `Stojí na: <span class="stand-chip house-${t.color}" data-tip="${COLOR_NAME[t.color]} — ${COLOR_ABILITY_NAME[t.color]}|${COLOR_ABILITY_DESC[t.color]}"><i></i>${COLOR_ABILITY_NAME[t.color]}</span>`;
}
function stateText(game, p) {
  if (p.eliminated) return 'Vyřazen ze hry';
  if (game.phase !== 'round') return 'Čeká na rozmístění';
  if (p.passedThisRound) return 'Passnul';
  if (game.__currentTurnPlayerId === p.id) return p.isHuman ? 'Tvůj tah' : 'Přemýšlí<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
  return 'Čeká na tah';
}
function coinsHTML(p) {
  let s = '';
  for (let i = 0; i < 3; i++) s += `<span class="${i < p.favorTokens ? '' : 'spent'}">${Art.ICON.coin}</span>`;
  return s;
}
const PCOL = { Ty: '#2f8a55', York: '#8a3a9c', Lancaster: '#c23a32', Neville: '#2f6fc0' };
function renderSeatCommon(root, game, p) {
  root.style.setProperty('--pc', PCOL[shieldKey(p)] || '#5a4222');
  root.classList.toggle('is-turn', game.phase === 'round' && game.__currentTurnPlayerId === p.id && !p.passedThisRound && !p.eliminated);
  root.classList.toggle('passed', !!p.passedThisRound && !p.eliminated);
  root.classList.toggle('eliminated', !!p.eliminated);
  setHTML(root.querySelector('.e-art'), Art.shield(shieldKey(p)));
  const starter = game.players[game.startingPlayerIdx] === p;
  setHTML(root.querySelector('.name'), (starter ? `<span class="rose-start" data-tip="Začíná kolo">${Art.svg('0 0 24 24', Art.rose(12, 12, 10.5, '#f6f1e4', null, Art.GOLD), 'rs')}</span>` : '') + (p.isHuman ? 'Ty' : p.name));
  setHTML(root.querySelector('.state'), stateText(game, p));
  const sum = root.querySelector('.sum');
  const total = String(game.phase === 'round' ? roundSum(p) : 0);
  if (sum.textContent !== total) { sum.textContent = total; const sl = root.querySelector('.seal'); sl.classList.remove('bump'); void sl.offsetWidth; sl.classList.add('bump'); }
  setHTML(root.querySelector('.seat-stand'), standChip(game, p));
}
function renderSeats(game) {
  ensureSeats(game);
  const lay = seatLayout(game);
  for (const pos of ['left', 'top', 'right']) {
    const p = lay[pos]; if (!p) continue;
    const root = $('seat-' + pos).firstElementChild; if (!root) continue;
    renderSeatCommon(root, game, p);
    // zdroje
    const fan = '<div class="fan">' + [0, 1, 2].map((i) => `<i style="left:${i * 0.45}rem;transform:rotate(${(i - 1) * 9}deg)"></i>`).join('') + '</div>';
    const tt = tilesTotal(p);
    const pieces = Array.from({ length: Math.min(tt, 6) }, (_, i) => `<span class="pt" style="--i:${i}">${Art.tileBack()}</span>`).join('');
    setHTML(root.querySelector('.seat-res'),
      `<div class="res" data-tip="Karty v ruce|Kolik karet drží.">${fan}<span class="n">${p.hand.length}</span></div>` +
      `<div class="res" data-tip="Dobírací balíček|Kolik karet jí/mu zbývá k dobrání.">${Art.ICON.draw}<span class="n">${p.drawPile.length}</span></div>` +
      `<div class="coins" data-tip="Žetony přízně|Zbývá ${p.favorTokens} ze 3.">${coinsHTML(p)}</div>` +
      `<div class="res pool-pill" data-tip="Panství|Skrytý — vidíš jen počet získaných polí. Barvy a karty v truhle zná jen majitel.">${tt ? `<div class="pool-stack">${pieces}</div>` : Art.ICON.lock}<span class="n">${tt}</span></div>`);
    setHTML(root.querySelector('.seat-heroes'), (p.heroes || []).map((hh) =>
      hh.used ? `<div class="hero-slot used" data-tip="${heroDef(hh.id).name}|${heroDef(hh.id).desc}">${Art.hero(hh.id)}</div>`
        : `<div class="hero-slot" data-tip="Skrytý hrdina|Identita se odhalí, až ho zahraje.">${Art.heroBack()}</div>`).join(''));
    renderPlayed(root.querySelector('.seat-played'), game, p);
  }
}

// --- vyložené karty ---
function entryTip(e, owner, game) {
  const bits = [];
  if (e.facedown) return owner.isHuman ? `Tvá karta v truhle|Vidíš ji jen ty: ${COLOR_NAME[e.realColor]} ${e.realValue}. Soupeři ji vidí lícem dolů.` : 'Karta v truhle|Lícem dolů — jde na konci kola do panství majitele.';
  if (!e.active) bits.push('zničená — nepočítá se');
    if (e.untargetable) bits.push('zamčená úplatkem');
  if (e.favorUsed) bits.push('použit žeton přízně');
  if (e.originalValue != null && e.value !== e.originalValue) bits.push(`původně ${e.originalValue}`);
  return `${COLOR_NAME[e.color]} ${e.value}|${bits.join(' · ') || 'Zahraná karta'}`;
}
function entryFace(e, owner) {
  const v = variantOf(e.id);
  if (e.facedown) {
    let s = Art.cardBack(v);
    if (owner.isHuman) s += `<div class="peek">${Art.cardFace(e.realColor, e.realValue, v)}</div>`;
    return s;
  }
  return Art.cardFace(e.color, e.value, v);
}
function entryClasses(e, owner) {
  return 'card entry' + (e.facedown ? ' facedown' : '') + (e.facedown && owner.isHuman ? ' peekable' : '') + (!e.active ? ' inactive' : '') +
    (e.shielded ? ' shielded' : '') + (e.untargetable ? ' locked' : '') + (e.uiFlash ? ' flash-' + e.uiFlash : '');
}
function entryInner(e, owner) {
  return `<div class="art">${entryFace(e, owner)}</div>` +
    (e.favorUsed ? `<div class="badge b-favor">${Art.ICON.coin}</div>` : '') +
    (e.shielded ? `<div class="badge b-shield">${Art.ICON.shieldMini}</div>` : '') +
    (e.untargetable ? `<div class="badge b-lock">${Art.ICON.lock}</div>` : '') +
    (!e.active ? `<div class="crack">${Art.ICON.cross}</div>` : '');
}
function entrySig(e, owner) {
  return [e.id, e.facedown ? 'f' : e.color, e.value, e.active, e.shielded, e.untargetable, e.favorUsed, e.uiFlash, e.realColor, owner.isHuman].join('|');
}
function onEntryFlash(node, e, rel) {
  const fl = e.uiFlash || null;
  if (node._flash === fl) return;
  node._flash = fl;
  if (!fl || !UI.seenRender) return;
  const c = relCenter(node);
  switch (fl) {
    case 'play': sfx(e.facedown ? 'bank' : 'card'); burst(c.x, c.y, '#e8cf86', 8, 2); break;
    case 'add': if (e.shielded) { sfx('shield'); burst(c.x, c.y, '#7aa8ff', 14, 3); } else { sfx('add'); burst(c.x, c.y, '#ffe9a0', 14, 3); floatText(c.x, c.y - 10, '+' + e.value); } break;
    case 'hit': sfx('destroy'); burst(c.x, c.y, '#d8503f', 16, 3.4); shakeStage();
      { const sl = h('div', 'fx-slash'); node.appendChild(sl); setTimeout(() => sl.remove(), 600); } break;
    case 'swap': sfx('swap'); burst(c.x, c.y, '#c9a2ff', 14, 3); break;
    case 'return': sfx('returnCard'); break;
    default: break;
  }
}
function layoutPlayed(box) {
  if (!box.classList.contains('my-played')) return;
  const n = box.children.length; const r = remPx();
  if (n < 2) { box.style.setProperty('--ov', (-0.3 * r) + 'px'); return; }
  const cw = box.firstElementChild.getBoundingClientRect().width / (box.firstElementChild.matches(':hover') ? 1.25 : 1) || 4.2 * r;
  const W = box.clientWidth - 6; const nat = -0.3 * r;
  const need = n * cw + (n - 1) * nat;
  box.style.setProperty('--ov', (need > W ? (W - n * cw) / (n - 1) : nat) + 'px');
}
function renderPlayed(box, game, p) {
  const items = [];
  if (p.activeHeroThisRound) items.push({ hero: p.activeHeroThisRound });
  for (const e of (p.playedThisRound || [])) items.push({ e });
  if (game.phase !== 'round') items.length = 0;
  reconcile(box, items,
    (it) => it.hero ? 'hero_' + it.hero.id : it.e.id,
    (it) => {
      let n;
      if (it.hero) {
        n = h('div', 'card hero-played', `<div class="art">${Art.hero(it.hero.id)}</div>`);
        n.setAttribute('data-tip', `${heroDef(it.hero.id).name}|${heroDef(it.hero.id).desc}`);
      } else {
        const e = it.e;
        n = h('div', entryClasses(e, p), entryInner(e, p));
        n.dataset.eid = e.id; n.setAttribute('data-tip', entryTip(e, p, game));
        onEntryFlash(n, e);
      }
      return n;
    },
    (it) => it.hero ? 'h' + (it.hero.uiFlash || '') : entrySig(it.e, p),
    (n, it) => {
      if (it.hero) { n.className = 'card hero-played' + (it.hero.uiFlash ? ' flash-' + (it.hero.uiFlash === 'hero-appear' ? 'add' : it.hero.uiFlash) : ''); return; }
      const e = it.e;
      n.className = entryClasses(e, p); n.innerHTML = entryInner(e, p);
      n.setAttribute('data-tip', entryTip(e, p, game));
      onEntryFlash(n, e);
    });
  layoutPlayed(box);
}

// --- moje oblast ---
function renderMine(game) {
  const me = humanOf(game); if (!me) return;
  const info = $('my-info');
  if (!info._built) {
    info.innerHTML = `
      <div class="seat-head">
        <div class="emblem"><span class="e-art"></span><span class="skull">${Art.ICON.skull}</span></div>
        <div class="who"><div class="name"></div><div class="state"></div></div>
      </div>
      <div class="seal" data-tip="Tvůj součet kola|Součet hodnot tvých aktivních vyložených karet."><span class="lbl">Součet</span><span class="sum">0</span></div>
      <div class="seat-stand"></div>`;
    info._built = true;
  }
  renderSeatCommon(info, game, me);
  $('my-strip').classList.toggle('is-turn', info.classList.contains('is-turn'));
  $('my-strip').classList.toggle('passed', !!me.passedThisRound);
  renderPlayed($('my-played'), game, me);
}

// --- ruka ---
function sortedHand(me) { return [...me.hand].sort((a, b) => (a.color === b.color ? a.value - b.value : a.color.localeCompare(b.color))); }
function renderHand(game) {
  const me = humanOf(game); const box = $('hand'); if (!me) return;
  const cards = me.eliminated ? [] : sortedHand(me);
  const n = cards.length;
  const r = remPx(); const cw = 5.6 * r; const W = box.clientWidth || 600;
  const step = n > 1 ? Math.min(cw * 0.8, (W - cw) / (n - 1)) : 0;
  const total = step * (n - 1) + cw; const x0 = Math.max(0, (W - total) / 2);
  const mid = (n - 1) / 2;
  reconcile(box, cards, (c) => c.id,
    (c) => {
      const node = h('div', 'card hand-card', `<div class="art">${Art.cardFace(c.color, c.value, variantOf(c.id))}</div>`);
      node.dataset.cid = c.id;
      node.classList.add('deal-in');
      setTimeout(() => node.classList.remove('deal-in'), 600);
      node.addEventListener('pointerdown', (ev) => onHandPointerDown(ev, 'card', c.id, node));
      node.setAttribute('data-tip', `${COLOR_NAME[c.color]} ${c.value}|${c.color === 'N' ? 'Bezbarvá karta — bez schopnosti pole.' : 'Při zahrání na pole stejné barvy spustí ' + COLOR_ABILITY_NAME[c.color] + '.'}`);
      return node;
    },
    (c) => c.id,
    () => {});
  Array.from(box.children).forEach((node, i) => {
    const off = i - mid;
    node.style.left = (x0 + i * step) + 'px';
    node.style.setProperty('--rot', (off * Math.min(3.2, 26 / Math.max(1, n))) + 'deg');
    node.style.setProperty('--lift', (off * off * 0.7).toFixed(1));
    node.style.setProperty('--z', String(i + 1));
    const c = cards[i];
    node.classList.toggle('selected', !!(UI.selected && UI.selected.kind === 'card' && UI.selected.id === c.id));
    node.classList.toggle('drag-origin', !!(UI.drag && UI.drag.kind === 'card' && UI.drag.id === c.id && UI.drag.moved));
    const banned = cardPlayBanned(game, c);
    node.classList.toggle('noplay', banned);
    node.classList.toggle('disabled-turn', !game.__awaitingHumanAction && !UI.pick);
  });
}

// --- dok: hrdinové, pool, žetony, balíčky ---
function renderDock(game) {
  const me = humanOf(game); if (!me) return;
  const heroBox = $('my-heroes');
  reconcile(heroBox, me.heroes || [], (hh) => hh.id,
    (hh) => {
      const def = heroDef(hh.id);
      const n = h('div', 'my-heroslot');
      n.innerHTML = `<div class="card my-hero" data-hid="${hh.id}"><div class="art">${Art.hero(hh.id)}</div></div>`;
      n.setAttribute('data-tip', `${def.name}|${def.desc} (přetáhni do okna „Vyložit hrdinu“)`);
      n.firstChild.addEventListener('pointerdown', (ev) => onHandPointerDown(ev, 'hero', hh.id, n.firstChild));
      return n;
    },
    (hh) => hh.used + '|' + (UI.selected && UI.selected.id === hh.id),
    () => {});
  Array.from(heroBox.children).forEach((n, i) => {
    const hh = me.heroes[i];
    n.firstChild.classList.toggle('used', !!hh.used);
    n.firstChild.classList.toggle('selected', !!(UI.selected && UI.selected.kind === 'hero' && UI.selected.id === hh.id));
    n.firstChild.classList.toggle('disabled-turn', !game.__awaitingHumanAction);
  });
  heroBox.classList.toggle('hidden', !(me.heroes && me.heroes.length));

  const tt = tilesTotal(me);
  const bankedN = Object.values(me.bankedPool).reduce((a, b) => a + b, 0);
  const pieces = Array.from({ length: Math.min(tt + (bankedN ? 1 : 0), 6) }, (_, i) => `<span class="pt" style="--i:${i}">${Art.tileBack()}</span>`).join('');
  setHTML($('my-pool'), `<div class="pool-stack">${pieces || Art.ICON.pool}</div><span class="lbl">Panství</span><span class="cnt">${tt} polí · ${bankedN} v truhle</span>`);

  setHTML($('my-tokens'), `<span class="t-lbl">Žetony přízně</span>` + [0, 1, 2].map((i) => `<span class="${i < me.favorTokens ? '' : 'spent'}">${Art.ICON.coin}</span>`).join(''));
  const pileHTML = (n, back) => {
    const k = Math.min(4, Math.ceil(n / 8));
    return `<div class="pile-art">${Array.from({ length: n ? Math.max(1, k) : 0 }, (_, i) => `<span class="pc" style="--i:${i}">${back}</span>`).join('') || '<span class="pc" style="opacity:.25">' + back + '</span>'}</div><span><b>${n}</b></span>`;
  };
  setHTML($('my-draw'), pileHTML(me.drawPile.length, Art.cardBack(0)));
  setHTML($('my-discard'), pileHTML(me.discardPile.length, Art.cardBack(2)));
}

// --- tlačítka, nápověda ---
function renderControls(game) {
  const me = humanOf(game); if (!me) return;
  const waiting = game.__awaitingHumanAction === true;
  const pass = $('btn-pass');
  pass.disabled = !waiting;
  if (!waiting) resetPass();
  let hint;
  if (UI.pick) hint = '';
  else if (waiting) hint = UI.selected ? 'Klepni na stůl = zahrát · nebo na okno vpravo dole (žeton / uschovat do truhly).' : 'Tvůj tah — přetáhni kartu na stůl (zahrát), do okna Uschovat do truhly, nebo Se žetonem. Nebo passni.';
  else if (me.eliminated) hint = 'Jsi vyřazen ze hry — sleduješ zbytek stolu.';
  else hint = UI.hintBase || '';
  $('board-hint').textContent = hint || UI.hintBase || '';
  if (!waiting) armZones(null);
}

// ---------- okna (zóny) ----------
const ZONE_DEFAULT = {
  play: 'Lícem nahoru na stůl',
  bank: 'Lícem dolů, tajně do panství',
  token: 'Zahraj a spusť schopnost pole',
  hero: 'Jednorázová schopnost hrdiny',
};
function setZoneTexts(info) {
  document.querySelectorAll('.zone').forEach((z) => {
    const k = z.dataset.zone; const sub = z.querySelector('.zone-sub');
    const i = info && info[k];
    sub.textContent = i ? i.text : ZONE_DEFAULT[k];
    sub.classList.toggle('good', !!(i && i.good && i.ok));
    sub.classList.toggle('bad', !!(i && !i.ok));
    z.classList.toggle('disabled', !!(i && !i.ok));
  });
}
function zoneInfoFor(game, me, item) {
  if (item.kind === 'hero') {
    const def = heroDef(item.id);
    return { hero: { ok: true, text: def.name, good: true } };
  }
  const c = me.hand.find((x) => x.id === item.id); if (!c) return null;
  const t = findTile(game, me.currentTileId);
  const tc = t ? t.color : null;
  const banned = cardPlayBanned(game, c);
  const dis = abilitiesDisabled(game);
  const info = {};
  if (banned) info.play = { ok: false, text: game.heroFlags.noNeutralCards && c.color === 'N' ? 'Bezbarvé karty jsou zakázané' : 'Tuhle hodnotu teď nelze zahrát' };
  else if (tc && c.color === tc && !dis) info.play = { ok: true, good: true, text: `Spustí schopnost: ${COLOR_ABILITY_NAME[tc]}` };
  else info.play = { ok: true, text: dis ? 'Příměří — schopnosti nefungují' : 'Bez schopnosti pole' };
  if (game.heroFlags && game.heroFlags.noBanking) info.bank = { ok: false, text: 'Uschovávání do truhly je teď zakázané' };
  else info.bank = { ok: true, text: c.value ? 'Tajně do panství' : 'Tajný blaf do panství' };
  if (!tc) info.token = { ok: false, text: 'Nestojíš na žádném poli' };
  else if (me.favorTokens <= 0) info.token = { ok: false, text: 'Nemáš žádný žeton přízně' };
  else if (dis) info.token = { ok: false, text: 'Příměří — schopnost propadne' };
  else if (banned) info.token = { ok: false, text: 'Tuhle kartu nelze zahrát' };
  else if (c.color === tc) info.token = { ok: false, text: 'Schopnost proběhne i zdarma' };
  else info.token = { ok: true, good: true, text: `Spustí ${COLOR_ABILITY_NAME[tc]} (žetonů: ${me.favorTokens})` };
  return info;
}
function armZones(item) {
  const zones = $('zones'); const game = UI.game;
  if (!game) return;
  const me = humanOf(game);
  const on = !!(item && game.__awaitingHumanAction);
  zones.classList.toggle('armed', on);
  if (!on) UI.dropInfo = null;
  zones.classList.toggle('hero-mode', on && item.kind === 'hero');
  zones.querySelectorAll('.zone').forEach((z) => z.classList.remove('over'));
  setZoneTexts(on ? zoneInfoFor(game, me, item) : null);
}

// ---------- vstup: výběr, tažení, pass ----------
function onHandPointerDown(ev, kind, id, node) {
  const game = UI.game;
  if (ev.button != null && ev.button !== 0) return;
  if (UI.pick && UI.pick.kind === 'hand' && kind === 'card') return; // klik řeší onStageClick
  if (!game || !game.__awaitingHumanAction) return;
  if (kind === 'hero') { const me = humanOf(game); const rec = me.heroes.find((x) => x.id === id); if (!rec || rec.used) return; }
  ev.preventDefault();
  const rect = node.getBoundingClientRect();
  UI.drag = { kind, id, node, startX: ev.clientX, startY: ev.clientY, offX: ev.clientX - rect.left, offY: ev.clientY - rect.top, moved: false, ghost: null, over: null, pid: ev.pointerId };
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragEnd);
  document.addEventListener('pointercancel', onDragCancel);
}
function onDragMove(ev) {
  const d = UI.drag; if (!d) return;
  const dx = ev.clientX - d.startX, dy = ev.clientY - d.startY;
  if (!d.moved && Math.hypot(dx, dy) > 7) {
    d.moved = true;
    const s = stageRect(); const r = d.node.getBoundingClientRect();
    const g = h('div', 'ghost card', d.node.querySelector('.art').outerHTML);
    g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
    g.style.filter = 'drop-shadow(0 .6rem .8rem rgba(0,0,0,.7))';
    $('drag-layer').appendChild(g); d.ghost = g;
    d.stageX = s.left; d.stageY = s.top;
    UI.selected = { kind: d.kind, id: d.id };
    armZones(UI.selected);
    UI.dropInfo = zoneInfoFor(UI.game, humanOf(UI.game), UI.selected);
    setDragHint(null);
    sfx('pick');
    d.node.classList.add('drag-origin');
  }
  if (d.moved) {
    d.ghost.style.left = (ev.clientX - d.offX - d.stageX) + 'px';
    d.ghost.style.top = (ev.clientY - d.offY - d.stageY) + 'px';
    d.ghost.style.transform = 'rotate(' + Math.max(-12, Math.min(12, dx / 14)) + 'deg) scale(1.08)';
    const z = dropTargetAt(ev.clientX, ev.clientY);
    if (z !== d.over) {
      d.over = z;
      document.querySelectorAll('.zone').forEach((n) => n.classList.toggle('over', n === z));
      const onBoard = z === $('board');
      $('board').classList.toggle('drop-hot', onBoard && !(UI.dropInfo && UI.dropInfo.play && !UI.dropInfo.play.ok));
      if (z && !z.classList.contains('disabled')) sfx('slide');
      setDragHint(z);
    }
  }
}
function setDragHint(z) {
  const info = UI.dropInfo; if (!info) return;
  const key = z ? (z === $('board') ? (UI.selected && UI.selected.kind === 'hero' ? 'hero' : 'play') : z.dataset.zone) : null;
  const i = key && info[key];
  const base = UI.selected && UI.selected.kind === 'hero' ? 'Pusť hrdinu kamkoliv na stůl.' : 'Pusť kamkoliv na stůl = zahrát · vpravo dole: žeton / uschovat do truhly.';
  $('board-hint').textContent = i ? ({ play: 'Zahrát: ', token: 'Se žetonem: ', bank: 'Uschovat do truhly: ', hero: 'Hrdina: ' }[key] + i.text) : base;
}
function dropTargetAt(x, y) {
  const z = zoneAt(x, y);
  if (z) return z;
  for (const id of ['board', 'my-played']) {
    const r = $(id).getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return $('board');
  }
  return null;
}
function zoneAt(x, y) {
  const pad = 6;
  for (const z of document.querySelectorAll('.zone')) {
    if (z.offsetParent === null) continue;
    const r = z.getBoundingClientRect();
    if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return z;
  }
  return null;
}
function endDragListeners() {
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);
  document.removeEventListener('pointercancel', onDragCancel);
}
function onDragEnd(ev) {
  const d = UI.drag; endDragListeners(); if (!d) return;
  UI.drag = null;
  if (d.ghost) d.ghost.remove();
  d.node.classList.remove('drag-origin');
  if (!d.moved) {
    // prosté klepnutí = výběr / zrušení výběru
    const same = UI.selected && UI.selected.kind === d.kind && UI.selected.id === d.id;
    UI.selected = same ? null : { kind: d.kind, id: d.id };
    sfx(same ? 'slide' : 'select');
    armZones(UI.selected);
    uiRender(UI.game);
    return;
  }
  $('board').classList.remove('drop-hot');
  const z = dropTargetAt(ev.clientX, ev.clientY);
  if (z) commitZone(z, true);
  else { UI.selected = null; armZones(null); uiRender(UI.game); }
}
function onDragCancel() {
  const d = UI.drag; endDragListeners(); if (!d) return;
  UI.drag = null; if (d.ghost) d.ghost.remove();
  UI.selected = null; armZones(null); uiRender(UI.game);
}
function commitZone(z, fromDrag) {
  const game = UI.game; const me = humanOf(game);
  const sel = UI.selected;
  if (!sel || !UI.actionResolve) return;
  const isBoard = z === $('board');
  const key = isBoard ? (sel.kind === 'hero' ? 'hero' : 'play') : z.dataset.zone;
  const info = zoneInfoFor(game, me, sel);
  const i = info && info[key];
  if (!i || !i.ok) {
    sfx('error');
    if (isBoard) { if (i) toast(i.text); }
    else { z.classList.remove('shake'); void z.offsetWidth; z.classList.add('shake'); setTimeout(() => z.classList.remove('shake'), 450); }
    if (fromDrag) { UI.selected = null; armZones(null); uiRender(game); }
    return;
  }
  let action;
  if (sel.kind === 'hero') action = { type: 'hero', heroId: sel.id };
  else if (key === 'bank') action = { type: 'bank', cardId: sel.id };
  else if (key === 'token') action = { type: 'play', cardId: sel.id, useToken: true };
  else action = { type: 'play', cardId: sel.id, useToken: false };
  if (!isBoard) { const c = relCenter(z); burst(c.x, c.y, key === 'bank' ? '#cfc6ac' : '#e8cf86', 12, 2.6); }
  finishAction(action);
}
function finishAction(action) {
  const game = UI.game; const res = UI.actionResolve;
  UI.actionResolve = null; UI.selected = null;
  game.__awaitingHumanAction = false;
  resetPass(); armZones(null);
  uiRender(game);
  if (res) res(action);
}
function onPassClick() {
  if (!UI.actionResolve) return;
  const b = $('btn-pass');
  if (!UI.passArmed) {
    UI.passArmed = true; b.classList.add('confirm'); b.querySelector('.seal-text').textContent = 'Jistě?';
    sfx('select');
    UI.passTimer = setTimeout(resetPass, 2600);
    return;
  }
  resetPass();
  finishAction({ type: 'pass' });
}
function resetPass() {
  clearTimeout(UI.passTimer); UI.passArmed = false;
  const b = $('btn-pass'); if (!b) return;
  b.classList.remove('confirm'); b.querySelector('.seal-text').textContent = 'Pass';
}
function onStageClick(ev) {
  // klepnutí na okno s vybranou kartou
  if (!UI.pick && UI.selected && UI.actionResolve && !UI.drag) {
    const z = ev.target.closest && ev.target.closest('.zone');
    if (z) { commitZone(z, false); return; }
    if (ev.target.closest && (ev.target.closest('#board') || ev.target.closest('#my-played'))) { commitZone($('board'), false); return; }
  }
  // výběr cíle na stole
  if (UI.pick) {
    const p = UI.pick;
    const sel = { player: '[data-pid]', entry: '[data-eid]', tile: '[data-tid]', hand: '[data-cid]' }[p.kind];
    const t = ev.target.closest && ev.target.closest(sel);
    if (!t) return;
    const key = { player: 'pid', entry: 'eid', tile: 'tid', hand: 'cid' }[p.kind];
    const id = t.dataset[key];
    if (!p.ids.has(id)) { sfx('error'); return; }
    sfx('pick');
    const c = relCenter(t); burst(c.x, c.y, '#ffe9a0', 10, 2.2);
    clearPick();
    p.resolve(id);
  }
}

// ---------- výběr cílů přímo na stole ----------
function startPick(kind, ids, promptText) {
  return new Promise((resolve) => {
    UI.pick = { kind, ids: new Set(ids), resolve };
    $('stage').classList.add('picking');
    const pr = $('prompt'); pr.textContent = promptText; pr.classList.remove('hidden');
    sfx('select');
    uiRender(UI.game);
  });
}
function clearPick() {
  UI.pick = null;
  $('stage').classList.remove('picking');
  $('prompt').classList.add('hidden');
  document.querySelectorAll('.pickable').forEach((n) => n.classList.remove('pickable'));
  if (UI.game) uiRender(UI.game);
}
function applyPick() {
  document.querySelectorAll('.pickable').forEach((n) => n.classList.remove('pickable'));
  const p = UI.pick; if (!p) return;
  const sel = { player: '[data-pid]', entry: '[data-eid]', tile: '[data-tid]', hand: '[data-cid]' }[p.kind];
  const key = { player: 'pid', entry: 'eid', tile: 'tid', hand: 'cid' }[p.kind];
  document.querySelectorAll(sel).forEach((n) => { if (p.ids.has(n.dataset[key])) n.classList.add('pickable'); });
}

// ---------- dialog (ano/ne, platba) ----------
function dialog(title, text, buttons) {
  return new Promise((resolve) => {
    const body = $('dialog-body');
    body.innerHTML = `<h2></h2><div class="divider">${Art.DIVIDER}</div><div class="dialog-text"></div><div class="btn-row"></div>`;
    body.querySelector('h2').textContent = title;
    body.querySelector('.dialog-text').textContent = text;
    const row = body.querySelector('.btn-row');
    for (const b of buttons) {
      const btn = h('button', 'btn' + (b.primary ? ' primary' : '')); btn.textContent = b.label;
      btn.onclick = () => { $('dialog').classList.add('hidden'); sfx('pick'); resolve(b.value); };
      row.appendChild(btn);
    }
    $('dialog').classList.remove('hidden');
    sfx('select');
  });
}

// ---------- rozhraní volané z game.js ----------
async function uiHumanChooseAction(game, player) {
  UI.selected = null;
  game.__awaitingHumanAction = true;
  game.__currentTurnPlayerId = player.id;
  sfx('turn');
  uiRender(game);
  return new Promise((resolve) => { UI.actionResolve = resolve; });
}
async function uiHumanChooseOpponent(game, player, candidates, promptText) {
  return startPick('player', candidates.map((c) => c.id), promptText);
}
async function uiHumanChooseCard(game, player, ownerPlayer, promptText) {
  const ids = ownerPlayer.playedThisRound.filter((e) => e.active && !isProtected(e)).map((e) => e.id);
  return startPick('entry', ids, promptText + (ownerPlayer.isHuman ? '' : ` (${ownerPlayer.name})`));
}
async function uiHumanChooseReturnCard(game, player, eligible, promptText) {
  return startPick('entry', eligible.map((e) => e.id), promptText);
}
async function uiHumanChooseFromEntries(game, player, promptText, entries) {
  return startPick('entry', entries.map((e) => e.id), promptText);
}
async function uiHumanChooseHandCard(game, player, promptText) {
  return startPick('hand', player.hand.map((c) => c.id), promptText);
}
async function uiHumanYesNo(game, player, promptText) {
  return dialog('Žeton přízně', promptText, [{ label: 'Ano', value: true, primary: true }, { label: 'Ne', value: false }]);
}
async function uiHumanChooseEntryPayment(game, player, promptText) {
  return dialog('Obsazené pole', promptText, [{ label: 'Odhodit kartu z ruky', value: 'hand', primary: true }, { label: 'Odhodit 3 karty z balíčku', value: 'deck' }]);
}
async function uiHumanChooseTile(game, player, tileCandidates, promptText) {
  return startPick('tile', tileCandidates.map((t) => t.id), promptText);
}
async function uiAnnounceRoundEnd() { /* řeší wrapper resolveRoundEnd */ }

// ---------- obálky engine funkcí (efekty, bannery) ----------
const ABILITY_SFX = { R: 'dagger', G: 'whisper', Y: 'bribe', B: 'chime', S: 'bell' };
(function wrapEngine() {
  const _trigger = triggerAbility;
  triggerAbility = async function (game, color, actingPlayer, fromFavorToken) {
    if (!abilitiesDisabled(game) && !fastMode()) {
      sfx(ABILITY_SFX[color]);
      await showBanner({
        cls: 'ab-' + color, icon: Art.abilityIcon(color), kicker: (fromFavorToken ? 'Žeton přízně · ' : 'Schopnost pole · ') + (actingPlayer.isHuman ? 'Ty' : actingPlayer.name),
        title: COLOR_ABILITY_NAME[color], sub: color === 'G' ? 'Soupeř musí uschovat do truhly náhodnou kartu z ruky' : COLOR_ABILITY_DESC[color].split('.')[0], ms: Math.max(600, TURN_STEP_MS * 0.85),
      });
    }
    return _trigger(game, color, actingPlayer, fromFavorToken);
  };

  const _playHero = playHero;
  playHero = async function (game, player, heroId) {
    const def = heroDef(heroId);
    if (def && !fastMode()) {
      sfx('hero');
      await showBanner({
        cls: 'hero-reveal', ms: Math.max(1500, TURN_STEP_MS * 2.1),
        html: `<div class="hr-card">${Art.hero(heroId)}</div><div class="hr-text"><div class="b-kicker">${player.isHuman ? 'Ty vykládáš hrdinu' : player.name + ' vykládá hrdinu'}</div><div class="b-title">${def.name}</div><div class="b-sub">${def.desc}</div></div>`,
      });
    }
    return _playHero(game, player, heroId);
  };

  const _playRound = playRound;
  playRound = async function (game) {
    game.__currentTurnPlayerId = null;
    if (!fastMode()) {
      const st = game.players[game.startingPlayerIdx];
      sfx('round');
      await showBanner({ cls: 'round', kicker: 'Kolo', title: String(game.round), sub: `Začíná ${st.isHuman ? 'Ty' : st.name}`, ms: Math.max(700, TURN_STEP_MS * 1.1) });
    }
    return _playRound(game);
  };

  const _takeTurn = takeTurn;
  takeTurn = async function (game, player, isFirstRound) {
    game.__currentTurnPlayerId = player.id;
    const wasPassed = player.passedThisRound;
    uiRender(game);
    await _takeTurn(game, player, isFirstRound);
    if (player.passedThisRound && !wasPassed) {
      sfx('pass');
      const seat = player.isHuman ? $('my-strip') : document.querySelector(`.seat[data-pid="${player.id}"]`);
      if (seat && !fastMode()) {
        const c = relCenter(seat);
        const st = h('div', 'pass-stamp'); st.textContent = 'PASS'; st.style.left = c.x + 'px'; st.style.top = c.y + 'px';
        $('fx-layer').appendChild(st); setTimeout(() => st.remove(), 1400);
      }
    }
    game.__currentTurnPlayerId = null;
  };

  const _resolveEnd = resolveRoundEnd;
  resolveRoundEnd = async function (game, isFirstRound) {
    game.__currentTurnPlayerId = null;
    uiRender(game);
    if (!fastMode()) {
      const ranked = rankPlayers(game);
      const w = ranked[0];
      if (w) {
        const sums = ranked.map((p) => `<div class="sm${p === w ? ' w' : ''}"><div class="emblem">${Art.shield(shieldKey(p))}</div><span>${p.isHuman ? 'Ty' : p.name}</span><b>${roundSum(p)}</b></div>`).join('');
        sfx(w.isHuman ? 'victory' : 'round');
        await showBanner({
          cls: 'win', kicker: 'Konec kola ' + game.round, title: (w.isHuman ? 'Kolo vyhrávaš ty' : 'Kolo vyhrává ' + w.name),
          sub: game.heroFlags && game.heroFlags.invertedWinner ? 'Kingmaker: vyhrává nejnižší součet' : '', extra: `<div class="sums">${sums}</div>`, ms: Math.max(1600, TURN_STEP_MS * 2.4),
        });
      }
    }
    return _resolveEnd(game, isFirstRound);
  };
})();

// ---------- pravidla a pool ----------
function renderRules() {
  const g = UI.game; const win = g ? g.winTiles : 4;
  let s = `<h2>Jak se hraje</h2><div class="divider">${Art.DIVIDER}</div>
  <p class="lead">Získej ${win} pole dřív než ostatní. Kolo vyhrává ten, kdo má na stole nejvyšší součet. Vítěz bere pole, na kterém stojí.</p>
  <div class="rules-grid">`;
  for (const c of COLORS) s += `<div class="rule-card"><div class="tile-art">${Art.tile(c)}</div><div>${COLOR_ABILITY_DESC[c]}</div></div>`;
  s += `</div><p class="lead">Kartu stejné barvy, jako je pole, na kterém stojíš, zahraješ se schopností zdarma. Jinou kartu můžeš zahrát <b>se žetonem přízně</b> (máš 3 na celou hru), <b>uschovat do truhly</b> lícem dolů (tajně se jí počítá hodnota 1 a po kole putuje do panství), nebo prostě <b>zahrát</b> bez schopnosti.</p>
  <h2>Hrdinové</h2><div class="divider">${Art.DIVIDER}</div><div class="hero-grid">`;
  for (const hd of HERO_LIST) s += `<div class="hero-row"><div class="hc">${Art.hero(hd.id)}</div><div><b>${hd.name}</b><br>${hd.desc}</div></div>`;
  s += '</div><div class="btn-row"><button class="btn btn-tutorial" id="btn-open-tut">Spustit tutoriál</button></div>';
  $('rules-body').innerHTML = s;
  const bt = $('btn-open-tut'); if (bt) bt.onclick = () => { sfx('pick'); Tutorial.open(); };
}
function renderPool() {
  const g = UI.game; const me = humanOf(g);
  let cols = '';
  for (const c of COLORS) {
    const n = me.tilesPool[c], b = me.bankedPool[c];
    const cards = Array.from({ length: Math.min(b, 8) }, (_, i) => `<div class="card">${Art.cardBack(i)}</div>`).join('');
    cols += `<div class="pool-col"><div class="pc-tile">${Art.tile(c)}<span class="cnt">${n}</span></div>
      <div class="pool-banked">${cards}</div><div class="mult">${n} × (1 + ${b})</div><div class="pts">${n * (1 + b)}</div></div>`;
  }
  $('pool-body').innerHTML = `<h2>Tvé panství</h2><div class="divider">${Art.DIVIDER}</div>
    <p class="lead">Získaná pole a karty v truhle vidíš jen ty. Skóre barvy = pole × (1 + karty v truhle té barvy).</p>
    <div class="pool-grid">${cols}</div><div class="pool-total">Celkem: ${finalScore(me)}</div>
    <div class="pool-note">Soupeři ti do panství nevidí — a ty jim také ne.</div>`;
}

// ---------- konec hry ----------
async function uiAnnounceGameEnd(game, scores) {
  const me = humanOf(game);
  const winner = scores[0].player;
  const iWon = winner === me;
  sfx(iWon ? 'victory' : 'defeat');
  if (iWon) { try { burstConfetti(); } catch (e) { /* */ } }
  let rows = '';
  scores.forEach((s, i) => {
    rows += `<tr class="${i === 0 ? 'win' : ''}"><td class="pn">${s.player.isHuman ? 'Ty' : s.player.name}</td>` +
      COLORS.map((c) => { const b = s.breakdown.find((x) => x.color === c); return `<td>${b.tiles}×(1+${b.banked})<br><b>${b.points}</b></td>`; }).join('') +
      `<td class="tot">${s.total}</td></tr>`;
  });
  $('gameover-body').innerHTML = `<div class="setup-rose">${Art.crownIcon()}</div>
    <h2 class="winner-title">${iWon ? 'Vítězíš — koruna je tvá!' : 'Vítězí ' + winner.name}</h2>
    <div class="divider">${Art.DIVIDER}</div>
    <p class="lead">Konečné skóre = pole (barva) × (1 + karty v truhle té barvy), sečteno přes všechny barvy.</p>
    <table class="score-table"><tr><th>Hráč</th>${COLORS.map((c) => `<th>${COLOR_NAME[c]}</th>`).join('')}<th>Celkem</th></tr>${rows}</table>
    <div class="btn-row"><button class="btn primary" id="btn-again">Nová hra</button></div>`;
  $('gameover').classList.remove('hidden');
  $('btn-again').onclick = () => location.reload();
  if (window.__VR_CONFIG) { window.__gameOver = true; return; }
  await new Promise(() => {}); // hra skončila
}
function burstConfetti() {
  const s = stageRect();
  for (let k = 0; k < 6; k++) setTimeout(() => burst(s.width * (0.15 + Math.random() * 0.7), s.height * 0.35, ['#e8cf86', '#b02a2a', '#f6f1e4'][k % 3], 30, 9), k * 240);
}

// ---------- úvodní nastavení ----------
function showSetup() {
  return new Promise((resolve) => {
    const cfg = { players: 4, heroes: 1, diff: 100, tempo: 'normal' };
    const body = $('setup-body');
    const seg = (key, title, opts) => `<div class="opt-group"><div class="opt-title">${title}</div><div class="seg" data-key="${key}">${
      opts.map((o) => `<button data-v="${o[0]}" class="${cfg[key] === o[0] ? 'on' : ''}">${o[1]}<small>${o[2] || ''}</small></button>`).join('')}</div></div>`;
    body.innerHTML = `
      <div class="setup-rose">${Art.svg('0 0 24 24', Art.rose(12, 12, 11, '#f6f1e4', '#b02a2a', Art.GOLD), 'big')}</div>
      <div class="setup-title"><div class="big">Válka růží</div><div class="sub">Anglie, 1455 — dva rody, jedna koruna</div></div>
      <div class="divider">${Art.DIVIDER}</div>
      ${seg('players', 'Počet hráčů', [[4, '4 hráči', 'ty + 3 soupeři · 4 pole'], [3, '3 hráči', 'ty + 2 soupeři · 5 polí']])}
      ${seg('heroes', 'Hrdinové na hráče', [[1, '1', 'výchozí'], [2, '2', ''], [0, 'Bez', '']])}
      ${seg('diff', 'Síla soupeřů', [[100, '100 %', 'plná'], [90, '90 %', ''], [80, '80 %', ''], [70, '70 %', ''], [60, '60 %', ''], [50, '50 %', '']])}
      ${seg('tempo', 'Tempo hry', [['slow', 'Pomalé', ''], ['normal', 'Běžné', ''], ['fast', 'Rychlé', '']])}
      <div class="btn-row"><button class="btn" id="btn-tutorial">Naučit se hrát (tutoriál)</button><button class="btn primary" id="btn-start">Usednout ke stolu</button></div>`;
    body.querySelectorAll('.seg').forEach((sg) => {
      sg.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const raw = b.dataset.v; const key = sg.dataset.key;
          cfg[key] = isNaN(Number(raw)) ? raw : Number(raw);
          sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          sfx('select');
        };
      });
    });
    $('setup').classList.remove('hidden');
    $('btn-tutorial').onclick = () => { sfx('pick'); Sound.init(); Tutorial.open(); };
    $('btn-start').onclick = () => { sfx('pick'); $('setup').classList.add('hidden'); resolve(cfg); };
  });
}

// ---------- start ----------
async function boot() {
  initChrome();
  const cfg = window.__VR_CONFIG || await showSetup();
  applyTempo(cfg.tempo);
  const game = await initGame('Ty', cfg.players, cfg.heroes, cfg.diff);
  window.__game = game; UI.game = game;
  uiRender(game);
  try {
    await runGame(game);
  } catch (err) {
    game.__lastError = err;
    uiLog('Chyba ve hře: ' + (err && err.message ? err.message : String(err)), 'eliminated');
    console.error(err);
  }
}
