// ===================== ZVUK A HUDBA — vše syntetizované přes WebAudio =====================
// Žádné externí soubory. Zvukové efekty jsou krátké syntetické "foley" zvuky (papír na dřevě,
// kovové mince, dýka, zvon, buben), hudba je pomalá generativní smyčka v dórské/aiolské tónině:
// dlouhý dron, tiché rámové bubny a řídké drnkané tóny jako loutna, vše přes umělou kostelní
// dozvuk (convolver). Zapíná se až po prvním kliknutí (prohlížeče jinak zvuk blokují).

const Sound = (function () {
  let ctx = null, master = null, sfxBus = null, musicBus = null, revIn = null, noiseBuf = null;
  const prefs = { sfx: true, music: true };
  const mus = { running: false, timer: null, nextT: 0, beat: 0, bar: 0, nodes: [], intensity: 0, walk: 3, droneLP: null, droneGain: null };

  try {
    const saved = JSON.parse(localStorage.getItem('vr_sound') || 'null');
    if (saved && typeof saved === 'object') { prefs.sfx = saved.sfx !== false; prefs.music = saved.music !== false; }
  } catch (e) { /* bez uložených voleb */ }
  function savePrefs() { try { localStorage.setItem('vr_sound', JSON.stringify(prefs)); } catch (e) { /* ignoruj */ } }

  // ---------- graf ----------
  function makeIR(c, secs, decay) {
    const len = Math.floor(c.sampleRate * secs);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (t < 0.01 ? t / 0.01 : 1);
      }
    }
    return buf;
  }
  function build(c) {
    ctx = c;
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    // měkký zvuk: ostré výšky se useknou (dolní propust + mírný pokles výšek)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2300; lp.Q.value = 0.5;
    const sh = ctx.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 1400; sh.gain.value = -6;
    master.connect(sh); sh.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = prefs.sfx ? 1 : 0;
    const sfxLP = ctx.createBiquadFilter(); sfxLP.type = 'lowpass'; sfxLP.frequency.value = 1800; sfxLP.Q.value = 0.4; sfxBus.connect(sfxLP); sfxLP.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = prefs.music ? 0.5 : 0; musicBus.connect(master);
    const conv = ctx.createConvolver(); conv.buffer = makeIR(ctx, 2.8, 2.6);
    revIn = ctx.createGain(); revIn.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.5;
    revIn.connect(conv); conv.connect(revOut); revOut.connect(master);
    // sdílený šum
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  function init() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        build(new AC());
      }
      if (ctx.resume && ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) { return false; }
  }

  // ---------- stavební kameny ----------
  let curBoost = 1;
  const BOOST = { pick: 1.8, select: 1.6, returnCard: 1.5, slide: 1.4, shield: 1.3, swap: 1.3, card: 1.3 };
  function route(node, o) {
    const bus = (o && o.bus === 'music') ? musicBus : sfxBus;
    if (bus === sfxBus && curBoost !== 1) { const bg = ctx.createGain(); bg.gain.value = curBoost; node.connect(bg); bg.connect(bus); }
    else node.connect(bus);
    const rev = o && o.rev;
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(revIn); }
  }
  function envelope(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.002, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  // o: {type,f,f2,t,a,d,v,lp,hp,detune,rev,bus}
  function tone(o) {
    const t0 = ctx.currentTime + (o.t || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    const k = o.bus === 'music' ? 1 : 0.68; // efekty o dost níž, aby nepískaly
    osc.frequency.setValueAtTime(o.f * k, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2 * k, t0 + (o.a || 0.005) + (o.d || 0.2));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    envelope(g, t0, o.a || 0.005, o.d || 0.2, o.v == null ? 0.2 : o.v);
    let last = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7; last.connect(f); last = f; }
    if (o.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; last.connect(f); last = f; }
    last.connect(g);
    route(g, o);
    osc.start(t0); osc.stop(t0 + (o.a || 0.005) + (o.d || 0.2) + 0.1);
    return osc;
  }
  // o: {ft,f,f2,q,t,a,d,v,rev,bus}
  function noise(o) {
    const t0 = ctx.currentTime + (o.t || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.ft || 'bandpass';
    if (o.ft === 'highpass' && o.f > 700) o = Object.assign({}, o, { f: o.f * 0.55 });
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.a || 0.005) + (o.d || 0.2));
    f.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    envelope(g, t0, o.a || 0.005, o.d || 0.2, o.v == null ? 0.2 : o.v);
    src.connect(f); f.connect(g);
    route(g, o);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + (o.a || 0.005) + (o.d || 0.2) + 0.1);
  }
  // ---- "tavern u krbu": papír, dřevo, hluboké teplé tóny. Žádné ostré náběhy (min. ~8 ms), žádný
  // kovový zvonivý třpyt - vše měkké, matné a spíš nízké. (Frekvence v tone() se u efektů násobí 0,68.)
  const SOFT = 0.008;
  // šustnutí papíru: pomalu nabíhající šum v pásmu 600-2200 Hz
  function paper(t, v, f1, f2, d, q) {
    noise({ ft: 'bandpass', f: f1 || 1500, f2: f2 || 800, q: q || 0.6, a: SOFT + 0.004, d: d || 0.1, v: (v || 0.2) * 1.6, rev: 0.08, t });
  }
  // dřevěné "tok" o stůl: krátký sinus + matný šum
  function wood(t, f, v, d) {
    tone({ f: f || 190, f2: (f || 190) * 0.55, a: SOFT, d: d || 0.11, v: v || 0.3, lp: 700, t });
    noise({ ft: 'lowpass', f: 650, q: 0.5, a: SOFT, d: 0.05, v: (v || 0.3) * 0.5, t });
  }
  // měkké hliněné cinknutí mince (nízké, krátké, bez kovového zvonění)
  function clink(t, f) {
    f = f || 1180 * (0.9 + Math.random() * 0.22);
    tone({ f, a: SOFT, d: 0.16, v: 0.1, lp: 1500, rev: 0.2, t });
    tone({ f: f * 1.34, a: SOFT, d: 0.09, v: 0.04, lp: 1500, rev: 0.2, t });
    wood(t, 260, 0.1, 0.05);
  }
  // teplý zvonek: sinusové částečné tóny, nízké, měkký náběh
  function warmBell(base, v, dur, rev, t) {
    const ratios = [1, 2.0, 3.0], amps = [1, 0.28, 0.1], decs = [1, 0.6, 0.35];
    ratios.forEach((r, i) => tone({ f: base * r, a: 0.012, d: dur * decs[i], v: v * amps[i], lp: 1400, rev, t: t || 0 }));
  }

  // ---------- zvukové efekty ----------
  const SFX = {
    card() { // karta položená na dřevěný stůl
      paper(0, 0.26, 1400, 650, 0.1, 0.6);
      wood(0.01, 170, 0.26, 0.12);
    },
    slide() { paper(0, 0.3, 500, 1700, 0.22, 0.5); paper(0.07, 0.2, 700, 1500, 0.18, 0.5); },
    pick() { paper(0, 0.3, 1100, 1900, 0.09, 0.7); },
    bank() { // karta lícem dolů do banku
      paper(0, 0.18, 900, 500, 0.1, 0.5);
      wood(0.02, 120, 0.3, 0.16);
    },
    pass() { // dvojí zaklepání kloubem o stůl
      wood(0, 210, 0.3, 0.1); wood(0.15, 190, 0.26, 0.12);
    },
    coin() { clink(0); },
    coins() { for (let i = 0; i < 5; i++) clink(i * 0.06 + Math.random() * 0.04, 950 + Math.random() * 380); },
    favor() { clink(0, 980); clink(0.11, 1250); },
    dagger() { // nůž zabodnutý do dřeva
      paper(0, 0.2, 1000, 400, 0.12, 0.6);
      wood(0.03, 130, 0.36, 0.2);
      tone({ type: 'triangle', f: 240, f2: 120, a: 0.02, d: 0.22, v: 0.06, lp: 500, t: 0.02 });
    },
    whisper() {
      noise({ ft: 'bandpass', f: 1100, f2: 1900, q: 2.2, a: 0.3, d: 0.55, v: 0.4, rev: 0.5 });
      noise({ ft: 'bandpass', f: 650, f2: 1100, q: 2, a: 0.34, d: 0.55, v: 0.3, rev: 0.5, t: 0.06 });
      tone({ f: 200, a: 0.4, d: 0.5, v: 0.025, rev: 0.6, lp: 500 });
    },
    bribe() { SFX.coins(); tone({ f: 190, f2: 150, type: 'triangle', a: 0.02, d: 0.4, v: 0.08, lp: 500, t: 0.3 }); },
    bell() { warmBell(330, 0.2, 2.6, 0.5); },
    chime() { // měkká hrací skříňka
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone({ f, a: 0.012, d: 0.9, v: 0.08, lp: 1600, rev: 0.45, t: i * 0.1 });
        tone({ f: f * 2, a: 0.012, d: 0.3, v: 0.015, lp: 1600, rev: 0.45, t: i * 0.1 });
      });
    },
    shield() { wood(0, 300, 0.22, 0.12); tone({ f: 520, a: SOFT, d: 0.25, v: 0.07, lp: 1100, rev: 0.2 }); },
    destroy() { // roztržení karty + tupý úder
      noise({ ft: 'bandpass', f: 1000, f2: 320, q: 0.7, a: 0.012, d: 0.22, v: 0.3, rev: 0.1 });
      wood(0.04, 100, 0.34, 0.24);
    },
    swap() {
      paper(0, 0.24, 600, 1500, 0.2, 0.5); paper(0.1, 0.24, 1500, 600, 0.2, 0.5);
      tone({ type: 'triangle', f: 392, f2: 523, a: 0.03, d: 0.3, v: 0.05, lp: 1000, rev: 0.3 });
    },
    add() { // teplé stoupavé drnknutí
      [523.25, 659.25, 783.99].forEach((f, i) => tone({ f, a: 0.012, d: 0.5, v: 0.065, lp: 1500, rev: 0.4, t: i * 0.07 }));
    },
    returnCard() { paper(0, 0.3, 1700, 550, 0.24, 0.5); },
    hero() { // nízký roh a buben
      wood(0, 90, 0.42, 0.5);
      [[110, 0], [165, 0.02], [220, 0.03]].forEach(([f, dl]) => {
        const t0 = ctx.currentTime + 0.05 + dl;
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
        lp.frequency.setValueAtTime(220, t0); lp.frequency.exponentialRampToValueAtTime(800, t0 + 0.6); lp.frequency.exponentialRampToValueAtTime(380, t0 + 1.6);
        const g = ctx.createGain(); envelope(g, t0, 0.32, 1.3, 0.07);
        o.connect(lp); lp.connect(g); route(g, { rev: 0.5 });
        o.start(t0); o.stop(t0 + 1.8);
      });
    },
    win() { // krátká měkká fanfára
      [[293.66, 0], [349.23, 0.16], [440, 0.32], [587.33, 0.5]].forEach(([f, t]) => {
        tone({ type: 'triangle', f, a: 0.04, d: 0.6, v: 0.09, lp: 1200, rev: 0.45, t });
        tone({ type: 'sine', f: f / 2, a: 0.04, d: 0.6, v: 0.06, rev: 0.45, t });
      });
      wood(0.5, 90, 0.3, 0.4);
    },
    claim() { warmBell(165, 0.22, 3.0, 0.5); wood(0, 80, 0.28, 0.5); },
    eliminated() {
      tone({ f: 200, f2: 90, type: 'triangle', a: 0.03, d: 1.0, v: 0.14, lp: 500, rev: 0.4 });
      noise({ ft: 'lowpass', f: 400, a: 0.06, d: 0.6, v: 0.08 });
    },
    turn() { // jemný signál "jsi na tahu"
      tone({ type: 'sine', f: 392, a: 0.015, d: 0.5, v: 0.08, rev: 0.4, lp: 1400 });
      tone({ type: 'sine', f: 587.33, a: 0.015, d: 0.6, v: 0.06, rev: 0.4, lp: 1400, t: 0.11 });
    },
    select() { wood(0, 330, 0.16, 0.05); },
    error() { wood(0, 110, 0.3, 0.14); },
    round() { warmBell(196, 0.16, 2.6, 0.5); wood(0, 85, 0.3, 0.5); },
    victory() {
      [[293.66, 0], [440, 0.22], [587.33, 0.44], [698.46, 0.7], [880, 0.96]].forEach(([f, t]) => {
        tone({ type: 'triangle', f, a: 0.05, d: 1.0, v: 0.085, lp: 1300, rev: 0.5, t });
        tone({ type: 'sine', f: f / 2, a: 0.05, d: 1.0, v: 0.06, rev: 0.5, t });
      });
      wood(0.96, 80, 0.36, 0.7);
      warmBell(293.66, 0.12, 3.2, 0.55, 0.96);
    },
    defeat() {
      [[293.66, 0], [277.18, 0.38], [233.08, 0.76], [220, 1.15]].forEach(([f, t]) => {
        tone({ type: 'triangle', f, a: 0.05, d: 1.0, v: 0.1, lp: 700, rev: 0.5, t });
      });
      wood(1.15, 70, 0.3, 1.0);
    },
  };

  function sfx(name) {
    if (!prefs.sfx) return;
    try {
      if (!init()) return;
      const fn = SFX[name];
      curBoost = BOOST[name] || 1;
      if (fn) fn();
      curBoost = 1;
    } catch (e) { /* zvuk nikdy nesmí rozbít hru */ }
  }

  // ---------- hudba ----------
  const SCALE = [293.66, 329.63, 349.23, 392, 440, 466.16, 523.25, 587.33, 659.25]; // D aiolská (D4..E5)
  const BASS = [73.42, 58.27, 65.41, 73.42];  // D, B♭, C, D
  const CHORD = [[146.83, 174.61, 220], [116.54, 146.83, 174.61], [130.81, 164.81, 196], [146.83, 174.61, 220]];

  function pluck(f, t, v, rev) {
    const t0 = t;
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; o2.detune.value = 4;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(1500, t0); lp.frequency.exponentialRampToValueAtTime(420, t0 + 1.2);
    const g = ctx.createGain(); envelope(g, t0, 0.006, 1.7, v);
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
    route(g, { bus: 'music', rev: rev || 0.55 });
    o1.start(t0); o2.start(t0); o1.stop(t0 + 2); o2.stop(t0 + 2);
  }
  function drum(t, v, low) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(low ? 62 : 78, t); o.frequency.exponentialRampToValueAtTime(low ? 38 : 46, t + 0.25);
    const g = ctx.createGain(); envelope(g, t, 0.004, 0.32, v);
    o.connect(g); route(g, { bus: 'music', rev: 0.25 });
    o.start(t); o.stop(t + 0.5);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 340;
    const g2 = ctx.createGain(); envelope(g2, t, 0.002, 0.12, v * 0.55);
    src.connect(f); f.connect(g2); route(g2, { bus: 'music', rev: 0.2 });
    src.start(t, Math.random()); src.stop(t + 0.3);
  }
  // praskání ohně v krbu: tiché, řídké, matné lusknutí dřeva
  function crackle(t) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * BEAT;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 900; f.Q.value = 1.2;
      const g = ctx.createGain(); envelope(g, tt, 0.004, 0.015 + Math.random() * 0.04, 0.025 + Math.random() * 0.05);
      src.connect(f); f.connect(g); route(g, { bus: 'music', rev: 0.15 });
      src.start(tt, Math.random() * 1.5); src.stop(tt + 0.12);
    }
  }
  function startDrone() {
    const t = ctx.currentTime;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.1, t + 5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280; lp.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain(); lfoG.gain.value = 110;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    const oscs = [];
    [[73.42, 'sawtooth', 0, 0.5], [73.42, 'sawtooth', 8, 0.4], [110.0, 'sawtooth', -6, 0.22], [36.71, 'sine', 0, 0.7]].forEach(([f, ty, det, vol]) => {
      const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f; o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = vol;
      o.connect(g); g.connect(lp); o.start(); oscs.push(o);
    });
    lp.connect(gain); route(gain, { bus: 'music', rev: 0.3 });
    // tichý pad (akord d moll), pomalu se nafukuje
    const pad = ctx.createGain(); pad.gain.value = 0.0001;
    const padLP = ctx.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 900;
    [293.66, 349.23, 440].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = (i - 1) * 6;
      o.connect(padLP); o.start(); oscs.push(o);
    });
    padLP.connect(pad); route(pad, { bus: 'music', rev: 0.6 });
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.035;
    const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.012;
    const padBase = ctx.createConstantSource ? ctx.createConstantSource() : null;
    if (padBase) { padBase.offset.value = 0.016; padBase.connect(pad.gain); padBase.start(); oscs.push(padBase); }
    lfo2.connect(lfo2G); lfo2G.connect(pad.gain); lfo2.start();
    oscs.push(lfo, lfo2);
    mus.nodes = oscs.concat([gain, lp, pad]);
    mus.droneLP = lp; mus.droneGain = gain;
  }
  function stopDrone() {
    const t = ctx.currentTime;
    try { mus.droneGain.gain.cancelScheduledValues(t); mus.droneGain.gain.setTargetAtTime(0.0001, t, 0.5); } catch (e) { /* */ }
    const nodes = mus.nodes; mus.nodes = [];
    setTimeout(() => { nodes.forEach((n) => { try { if (n.stop) n.stop(); n.disconnect(); } catch (e) { /* */ } }); }, 2500);
  }
  const BEAT = 1.15;
  function scheduleBeat(t) {
    const b = mus.beat % 4, bar = mus.bar % 4;
    const inten = mus.intensity;
    if (Math.random() < 0.75) crackle(t);
    if (b === 0) {
      drum(t, 0.2 + inten * 0.15, true);
      // basový tón na začátku taktu
      tone({ type: 'sine', f: BASS[bar] * 2, a: 0.04, d: 3.6, v: 0.07, bus: 'music', rev: 0.3, t: t - ctx.currentTime });
    } else if (b === 2) {
      drum(t, 0.1 + inten * 0.12, false);
    } else if (inten > 0.35 && Math.random() < inten) {
      drum(t, 0.07 + inten * 0.08, false);
    }
    if (inten > 0.6 && (b === 1 || b === 3)) drum(t + BEAT * 0.5, 0.06 + inten * 0.05, true);
    // melodie: řídké drnkané tóny
    if (Math.random() < 0.5) {
      const r = Math.random();
      mus.walk += r < 0.18 ? -2 : r < 0.42 ? -1 : r < 0.55 ? 0 : r < 0.82 ? 1 : 2;
      if (b === 3 && Math.random() < 0.35) mus.walk = Math.random() < 0.5 ? 0 : 4; // kadence k D nebo A
      mus.walk = Math.max(0, Math.min(SCALE.length - 1, mus.walk));
      const off = Math.random() < 0.3 ? BEAT * 0.5 : 0;
      pluck(SCALE[mus.walk] * 0.5, t + off, 0.07 + Math.random() * 0.025, 0.55);
      if (Math.random() < 0.16) pluck(SCALE[Math.max(0, mus.walk - 2)] / 4, t + off, 0.04, 0.6);
    }
    mus.beat++;
    if (mus.beat % 4 === 0) mus.bar++;
    if (mus.droneLP) {
      try { mus.droneLP.frequency.setTargetAtTime(240 + inten * 520, ctx.currentTime, 2); } catch (e) { /* */ }
    }
  }
  function tick() {
    if (!ctx || !mus.running) return;
    while (mus.nextT < ctx.currentTime + 0.9) {
      scheduleBeat(Math.max(mus.nextT, ctx.currentTime + 0.02));
      mus.nextT += BEAT;
    }
  }
  function musicStart() {
    try {
      if (!prefs.music) return;
      if (!init()) return;
      if (mus.running) return;
      mus.running = true;
      musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 0.4);
      startDrone();
      mus.nextT = ctx.currentTime + 0.4;
      mus.timer = setInterval(tick, 220);
      tick();
    } catch (e) { mus.running = false; }
  }
  function musicStop() {
    try {
      if (!mus.running) return;
      mus.running = false;
      clearInterval(mus.timer); mus.timer = null;
      stopDrone();
    } catch (e) { /* */ }
  }
  function setIntensity(x) { mus.intensity = Math.max(0, Math.min(1, x || 0)); }

  function setSfx(on) { prefs.sfx = !!on; savePrefs(); if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05); }
  function setMusic(on) {
    prefs.music = !!on; savePrefs();
    if (on) { if (ctx) musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 0.3); musicStart(); }
    else { if (ctx) musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); musicStop(); }
  }

  document.addEventListener('visibilitychange', () => {
    try {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else ctx.resume();
    } catch (e) { /* */ }
  });

  return {
    init, sfx, musicStart, musicStop, setIntensity, setSfx, setMusic, prefs,
    // jen pro testy (offline render)
    _build: build, _SFX: SFX, _music: { startDrone, scheduleBeat, mus },
  };
})();
