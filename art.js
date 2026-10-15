// ===================== GRAFIKA — SVG ve stylu středověkých iluminací =====================
// Všechno se kreslí kódem (žádné externí obrázky), plochými barvami s tenkým inkoustovým obrysem,
// jako miniatury ve starých kronikách. Funkce vrací řetězce SVG, které UI vkládá přes innerHTML.

const Art = (function () {
  const INK = '#2a1a10';
  const PARCH = '#ecdcb0';
  const PARCH_D = '#d3bd86';
  const GOLD = '#c9a24a';
  const GOLD_D = '#8d6a22';
  const GOLD_L = '#e8cf86';

  const HOUSE = {
    R: { main: '#9b2a2a', light: '#d0645a', dark: '#5a1212', title: 'VRAŽDA', sub: 'zničí soupeřovu kartu' },
    G: { main: '#3c6e4c', light: '#78a878', dark: '#1d3f2a', title: 'ŠPIONÁŽ', sub: 'soupeř uschovává naslepo' },
    Y: { main: '#c8942a', light: '#ecc866', dark: '#7d5712', title: 'ÚPLATKY', sub: 'podplať kartu v truhle' },
    B: { main: '#2c4d8c', light: '#6c90cc', dark: '#142a58', title: 'PODPORA CÍRKVE', sub: 'lízni neutrální kartu' },
    S: { main: '#7d828a', light: '#b9bdc4', dark: '#43474f', title: 'SVATBA', sub: 'výměna vyložených karet' },
    N: { main: '#5a4636', light: '#9a7e62', dark: '#2f241c', title: 'BEZBARVÁ', sub: '' },
  };

  const svg = (vb, inner, cls) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="${cls || ''}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inner}</svg>`;

  // ---------- pomocné barvy ----------
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, f) { // f < 1 ztmaví, f > 1 zesvětlí
    const [r, g, b] = hexToRgb(hex);
    const m = (v) => Math.max(0, Math.min(255, Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1))));
    return '#' + [m(r), m(g), m(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // ---------- růže ----------
  function rose(cx, cy, r, outer, inner, center, stroke) {
    let s = '';
    const st = stroke == null ? INK : stroke;
    for (let i = 0; i < 5; i++) {
      const a = (-90 + i * 72) * Math.PI / 180;
      s += `<circle cx="${(cx + Math.cos(a) * r * 0.62).toFixed(2)}" cy="${(cy + Math.sin(a) * r * 0.62).toFixed(2)}" r="${(r * 0.46).toFixed(2)}" fill="${outer}" stroke="${st}" stroke-width="${(r * 0.07).toFixed(2)}"/>`;
    }
    if (inner) {
      for (let i = 0; i < 5; i++) {
        const a = (-54 + i * 72) * Math.PI / 180;
        s += `<circle cx="${(cx + Math.cos(a) * r * 0.34).toFixed(2)}" cy="${(cy + Math.sin(a) * r * 0.34).toFixed(2)}" r="${(r * 0.27).toFixed(2)}" fill="${inner}" stroke="${st}" stroke-width="${(r * 0.05).toFixed(2)}"/>`;
      }
    }
    s += `<circle cx="${cx}" cy="${cy}" r="${(r * 0.2).toFixed(2)}" fill="${center || GOLD}" stroke="${st}" stroke-width="${(r * 0.05).toFixed(2)}"/>`;
    return s;
  }

  // ---------- emblémy karet (souřadnice kolem středu 0,0, přibližně poloměr 28) ----------
  function emDagger() {
    return `
    <g stroke="${INK}" stroke-linejoin="round" stroke-width="1.1">
      <path d="M0 28 L-6.5 -3 L6.5 -3 Z" fill="#e7e9ee"/>
      <path d="M0 25 L0 -3" stroke="#9aa0aa" stroke-width="1.1" fill="none"/>
      <rect x="-15" y="-8.5" width="30" height="5.5" rx="2" fill="${GOLD}"/>
      <rect x="-2.8" y="-24" width="5.6" height="16" rx="1.5" fill="#4a2a16"/>
      <path d="M-2.8 -20 H2.8 M-2.8 -16 H2.8 M-2.8 -12 H2.8" stroke="${GOLD}" stroke-width=".9" fill="none"/>
      <circle cx="0" cy="-27.5" r="4" fill="${GOLD}"/>
    </g>
    <g fill="#c0302a" stroke="${INK}" stroke-width=".8">
      <path d="M-14 18 q-3.4 5.2 0 7.6 q3.4 -2.4 0 -7.6z"/>
      <path d="M13 9 q-2.6 4.2 0 6.4 q2.6 -2.2 0 -6.4z"/>
      <path d="M-9 28 q-1.8 3 0 4.4 q1.8 -1.4 0 -4.4z"/>
    </g>`;
  }
  function emEye() {
    let rays = '';
    for (let k = -3; k <= 3; k++) {
      const a = k * 17 * Math.PI / 180;
      const x1 = Math.sin(a) * 19, y1 = -Math.cos(a) * 15 - 3;
      const x2 = Math.sin(a) * 26, y2 = -Math.cos(a) * 24 - 3;
      rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }
    return `
    <g stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none">${rays}</g>
    <g stroke="${INK}" stroke-linejoin="round" stroke-width="1.3">
      <path d="M-27 2 Q0 -22 27 2 Q0 26 -27 2 Z" fill="${PARCH}"/>
      <circle cx="0" cy="2" r="11" fill="#2f6a47"/>
      <circle cx="0" cy="2" r="6.6" fill="#17321f"/>
      <circle cx="0" cy="0" r="3.3" fill="${INK}"/>
      <path d="M-1.8 2 H1.8 L3.2 9 H-3.2Z" fill="${INK}" stroke="none"/>
      <circle cx="-4" cy="-3" r="2" fill="#fff" stroke="none"/>
    </g>
    <g stroke="${INK}" stroke-width=".9" fill="#7fb07a" stroke-linejoin="round">
      <path d="M-27 24 q9 -10 20 -4 q-9 12 -20 4z"/>
      <path d="M27 24 q-9 -10 -20 -4 q9 12 20 4z"/>
    </g>`;
  }
  function emPurse() {
    return `
    <g stroke="${INK}" stroke-linejoin="round" stroke-width="1.2">
      <path d="M-15 8 Q-22 24 -11 29 H11 Q22 24 15 8 Q11 -1 7 -6 H-7 Q-11 -1 -15 8Z" fill="#8a5a2b"/>
      <path d="M-8 -6 Q-14 -17 -5 -15 Q0 -9 0 -6Z M8 -6 Q14 -17 5 -15 Q0 -9 0 -6Z" fill="#a8733a"/>
      <rect x="-9" y="-7.5" width="18" height="4.5" rx="2" fill="${GOLD}"/>
      <circle cx="0" cy="14" r="7.5" fill="${GOLD_L}"/>
      <circle cx="0" cy="14" r="4.6" fill="none" stroke="${GOLD_D}" stroke-width="1"/>
      <path d="M0 10.5 V17.5 M-3.5 14 H3.5" stroke="${GOLD_D}" stroke-width="1" fill="none"/>
    </g>
    <g stroke="${INK}" stroke-width="1" fill="${GOLD}">
      <ellipse cx="-24" cy="27" rx="7.5" ry="2.8"/><ellipse cx="-24" cy="23.4" rx="7.5" ry="2.8"/><ellipse cx="-24" cy="19.8" rx="7.5" ry="2.8" fill="${GOLD_L}"/>
      <ellipse cx="24" cy="27" rx="7.5" ry="2.8"/><ellipse cx="24" cy="23.4" rx="7.5" ry="2.8" fill="${GOLD_L}"/>
    </g>
    <g stroke="${INK}" stroke-width="1" fill="${GOLD_L}"><circle cx="-23" cy="-2" r="5.2"/><circle cx="23" cy="2" r="4.6"/></g>
    <g stroke="${GOLD_D}" stroke-width=".9" fill="none"><circle cx="-23" cy="-2" r="3"/><circle cx="23" cy="2" r="2.6"/></g>`;
  }
  function emChurch() {
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30 * Math.PI / 180;
      rays += `<line x1="${(Math.cos(a) * 20).toFixed(1)}" y1="${(Math.sin(a) * 20 - 2).toFixed(1)}" x2="${(Math.cos(a) * 31).toFixed(1)}" y2="${(Math.sin(a) * 31 - 2).toFixed(1)}"/>`;
    }
    return `
    <g stroke="${GOLD_L}" stroke-width="1.4" stroke-linecap="round" opacity=".85">${rays}</g>
    <g stroke="${INK}" stroke-linejoin="round" stroke-width="1.3">
      <path d="M-15 28 V0 Q-15 -14 0 -26 Q15 -14 15 0 V28Z" fill="#d6cdb4"/>
      <path d="M-9 28 V1 Q-9 -9 0 -18 Q9 -9 9 1 V28Z" fill="#3e66b0"/>
      <path d="M0 -18 V28 M-9 4 H9 M-7 -6 H7" stroke="${GOLD}" stroke-width="1.3" fill="none"/>
      <path d="M-2 -26 V-33 M-5 -30 H5" stroke="${GOLD_D}" stroke-width="2.2" fill="none"/>
      <rect x="-21" y="27" width="42" height="4" rx="1.5" fill="#9b937c"/>
    </g>`;
  }
  function emRings() {
    const ring = (cx, col) => `<circle cx="${cx}" cy="4" r="11.5" fill="none" stroke="${INK}" stroke-width="6.2"/><circle cx="${cx}" cy="4" r="11.5" fill="none" stroke="${col}" stroke-width="3.8"/>`;
    // protnutí kroužků: dokreslíme kus levého kroužku přes pravý
    const cxA = -7, cxB = 7, cy = 4, r = 11.5;
    const x0 = 0, y0 = cy - Math.sqrt(r * r - 49);
    const ang = Math.atan2(y0 - cy, x0 - cxA);
    const a1 = ang - 0.32, a2 = ang + 0.32;
    const p = (a) => `${(cxA + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    const weave = `<path d="M${p(a1)} A${r} ${r} 0 0 1 ${p(a2)}" fill="none" stroke="${INK}" stroke-width="6.2"/><path d="M${p(a1)} A${r} ${r} 0 0 1 ${p(a2)}" fill="none" stroke="${GOLD_L}" stroke-width="3.8"/>`;
    return `
    ${ring(cxA, GOLD_L)}${ring(cxB, GOLD)}${weave}
    <path d="M0 -26 L5 -20 L0 -14 L-5 -20Z" fill="#c8d4f0" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <g fill="#f4f1ea" stroke="${INK}" stroke-width=".9" stroke-linejoin="round">
      <path d="M-27 -12 q6 -7 12 -2 q-5 7 -12 2z"/><path d="M27 -12 q-6 -7 -12 -2 q5 7 12 2z"/>
    </g>
    <g stroke="${INK}" stroke-width="1" fill="#94a984">
      <path d="M-26 26 q8 -9 18 -3 q-8 11 -18 3z"/><path d="M26 26 q-8 -9 -18 -3 q8 11 18 3z"/>
    </g>`;
  }
  function emNeutral() {
    return `
    <g stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" fill="#efe6cc">
      <circle cx="0" cy="-12" r="11"/><circle cx="0" cy="12" r="11"/><circle cx="-12" cy="0" r="11"/><circle cx="12" cy="0" r="11"/>
    </g>
    <path d="M0 -9 L9 0 L0 9 L-9 0Z" fill="${shade('#a39679', 0.85)}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle r="3" fill="${GOLD}" stroke="${INK}" stroke-width=".9"/>`;
  }
  const EMBLEM = { R: emDagger, G: emEye, Y: emPurse, B: emChurch, S: emRings, N: emNeutral };

  function sparkle(x, y, s, col, op) {
    return `<path d="M${x} ${y - s} Q${x + s * 0.14} ${y - s * 0.14} ${x + s} ${y} Q${x + s * 0.14} ${y + s * 0.14} ${x} ${y + s} Q${x - s * 0.14} ${y + s * 0.14} ${x - s} ${y} Q${x - s * 0.14} ${y - s * 0.14} ${x} ${y - s}Z" fill="${col}" opacity="${op == null ? 0.7 : op}"/>`;
  }

  // ---------- stáří a ošoupanost (deterministické podle semínka, aby každá karta měla "svou" historii) ----------
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function lcg(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  // W×H = rozměr karty, amount 0..1 = jak moc je ohraná. Vrací SVG vrstvu přes celou kartu.
  function wear(seedStr, W, H, amount, rx) {
    const r = lcg(hashSeed(seedStr));
    const A = amount == null ? 1 : amount;
    rx = rx == null ? 6 : rx;
    let s = '';
    // špinavý okraj (několik průhledných obrysů simuluje rozmazaný stín)
    s += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${rx}" fill="none" stroke="#3b2410" stroke-width="9" opacity="${(0.07 * A).toFixed(3)}"/>`;
    s += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${rx}" fill="none" stroke="#3b2410" stroke-width="5" opacity="${(0.1 * A).toFixed(3)}"/>`;
    // skvrny od piva / mastnoty
    const blobs = 2 + Math.floor(r() * 3 * A);
    for (let i = 0; i < blobs; i++) {
      const cx = 8 + r() * (W - 16), cy = 8 + r() * (H - 16), rr = 6 + r() * 14;
      s += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rr.toFixed(1)}" ry="${(rr * (0.6 + r() * 0.5)).toFixed(1)}" fill="#6b4a1f" opacity="${((0.08 + r() * 0.1) * (0.6 + 0.4 * A)).toFixed(3)}" transform="rotate(${(r() * 180).toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
    }
    if (r() < 0.65 * A + 0.1) { // kruh od půllitru
      const cx = 14 + r() * (W - 28), cy = 14 + r() * (H - 28), rr = 9 + r() * 6;
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="none" stroke="#5a3a14" stroke-width="1.5" opacity=".17"/>`;
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(rr - 1.8).toFixed(1)}" fill="none" stroke="#5a3a14" stroke-width=".6" opacity=".12"/>`;
    }
    // záhyby (světlá + tmavá linka vedle sebe)
    const creases = 1 + Math.floor(r() * 2);
    for (let i = 0; i < creases; i++) {
      const horiz = r() < 0.5;
      const a = r() * (horiz ? H : W) * 0.8 + (horiz ? H : W) * 0.1;
      const x1 = horiz ? 0 : a, y1 = horiz ? a : 0, x2 = horiz ? W : a + (r() - 0.5) * 24, y2 = horiz ? a + (r() - 0.5) * 24 : H;
      s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#2a1a10" stroke-width=".7" opacity="${(0.2 * A + 0.06).toFixed(3)}"/>`;
      s += `<line x1="${(x1 + 0.9).toFixed(1)}" y1="${(y1 + 0.9).toFixed(1)}" x2="${(x2 + 0.9).toFixed(1)}" y2="${(y2 + 0.9).toFixed(1)}" stroke="#fff4d2" stroke-width=".8" opacity="${(0.32 * A + 0.08).toFixed(3)}"/>`;
    }
    // vybledlé záplaty, kde se pigment sedřel palci
    for (let i = 0; i < 3 * A; i++) {
      const cx = r() * W, cy = r() * H, rr = 5 + r() * 12;
      s += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rr.toFixed(1)}" ry="${(rr * (0.5 + r() * 0.6)).toFixed(1)}" fill="#efe0b4" opacity="${(0.08 + r() * 0.1).toFixed(3)}" transform="rotate(${(r() * 180).toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
    }
    // škrábance a odřeniny (světlé čáry, kde se barva sloupla)
    const scuffs = 5 + Math.floor(r() * 7 * A);
    for (let i = 0; i < scuffs; i++) {
      const x = r() * W, y = r() * H, l = 3 + r() * 11, a = r() * Math.PI;
      s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + Math.cos(a) * l).toFixed(1)}" y2="${(y + Math.sin(a) * l).toFixed(1)}" stroke="${r() < 0.7 ? '#f3e6c0' : '#2a1a10'}" stroke-width="${(0.5 + r() * 0.9).toFixed(2)}" opacity="${(0.25 + r() * 0.35).toFixed(2)}" stroke-linecap="round"/>`;
    }
    // sedřené rohy
    const corners = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]];
    corners.forEach(([cx, cy, sx, sy]) => {
      if (r() < 0.45 + 0.4 * A) {
        const a = 5 + r() * 8 * A, b = 4 + r() * 7 * A;
        s += `<path d="M${cx} ${cy + sy * b * 1.5} Q${cx + sx * a * 0.3} ${cy + sy * b * 0.4} ${cx + sx * a * 1.5} ${cy} L${cx} ${cy}Z" fill="#e6d6a8" opacity=".9"/>`;
        s += `<path d="M${cx} ${cy + sy * b * 1.5} Q${cx + sx * a * 0.3} ${cy + sy * b * 0.4} ${cx + sx * a * 1.5} ${cy}" fill="none" stroke="#5a3a14" stroke-width=".7" opacity=".5"/>`;
      }
    });
    // okousaný / odřený okraj: drobné světlé zářezy podél hran
    for (let i = 0; i < 8 * A; i++) {
      const side = Math.floor(r() * 4), t = 6 + r() * ((side % 2 ? H : W) - 12), d = 1 + r() * 2.4;
      const p = side === 0 ? [t, 0.6, t + 2.2, 0.6 + d] : side === 1 ? [W - 0.6, t, W - 0.6 - d, t + 2.2] : side === 2 ? [t, H - 0.6, t + 2.2, H - 0.6 - d] : [0.6, t, 0.6 + d, t + 2.2];
      s += `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${p[2].toFixed(1)}" y2="${p[3].toFixed(1)}" stroke="#e6d6a8" stroke-width="1.6" opacity=".85"/>`;
    }
    // ohnutý růžek
    if (r() < 0.35 * A + 0.05) {
      const k = 8 + r() * 6;
      s += `<path d="M${W} ${H - k} L${W - k} ${H} L${W} ${H}Z" fill="#cdb988" stroke="#2a1a10" stroke-width=".8"/><path d="M${W} ${H - k} L${W - k} ${H}" stroke="#fff4d2" stroke-width=".9" opacity=".6"/>`;
    }
    return s;
  }

  // ---------- líc karty ----------
  // Hlavní je ČÍSLO (velké, uprostřed na plaketě), druhá je BARVA (celé pole karty), ozdoby jsou až
  // po stranách (rohové indexy s emblémem, zrcadlově jako na hracích kartách). Karta je ohraná, zašlá.
  const AGED = { R: '#8a3a32', G: '#4a6e4d', Y: '#b88a35', B: '#3d5b8c', S: '#8a93a3', N: '#4a382d' };
  const faceCache = {};
  function cardFace(color, value, variant) {
    const v = variant || 0;
    const key = color + ':' + value + ':' + v;
    if (faceCache[key]) return faceCache[key];
    const h = HOUSE[color] || HOUSE.N;
    const field = AGED[color] || AGED.N;
    const neg = value < 0;
    const txt = String(value);
    const long = txt.length > 1;
    const numFill = neg ? '#6e1010' : '#24160c';
    const r = lcg(hashSeed(key));
    const tilt = ((r() - 0.5) * 3).toFixed(1);
    const corner = (flip) => `
      <g ${flip ? 'transform="rotate(180 50 70)"' : ''}>
        <text x="16.5" y="${long ? 25 : 26.5}" text-anchor="middle" font-size="${long ? 12.5 : 17}" font-weight="700" font-family="Cinzel, 'Cormorant Garamond', Georgia, serif" fill="${PARCH}" stroke="${INK}" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">${txt}</text>
        <g transform="translate(16.5 43) scale(.36)">${EMBLEM[color] ? EMBLEM[color]() : EMBLEM.N()}</g>
      </g>`;
    const inner = `
      <rect x="1" y="1" width="98" height="138" rx="6.5" fill="#e3d2a2" stroke="${INK}" stroke-width="2"/>
      <rect x="4.5" y="4.5" width="91" height="131" rx="3.5" fill="${field}"/>
      <defs>
        <clipPath id="cf-${color}"><rect x="4.5" y="4.5" width="91" height="131" rx="3.5"/></clipPath>
        <clipPath id="cp-${color}"><path d="M29 41 L35 34 H65 L71 41 V99 L65 106 H35 L29 99Z"/></clipPath>
      </defs>
      <g clip-path="url(#cf-${color})">
        <circle cx="50" cy="70" r="46" fill="${h.light}" opacity=".16"/>
        <circle cx="50" cy="70" r="33" fill="${h.light}" opacity=".12"/>
        <g stroke="${h.light}" stroke-width="1" opacity=".18">
          ${[-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `<line x1="${i * 14 - 40}" y1="0" x2="${i * 14 + 100}" y2="140"/>`).join('')}
        </g>
        <rect x="4.5" y="4.5" width="91" height="131" fill="${h.dark}" opacity=".18"/>
      </g>
      <rect x="4.5" y="4.5" width="91" height="131" rx="3.5" fill="none" stroke="${INK}" stroke-width="1.2"/>
      <rect x="7.5" y="7.5" width="85" height="125" rx="2" fill="none" stroke="${PARCH}" stroke-width=".9" opacity=".8"/>
      <line x1="16.5" y1="58" x2="16.5" y2="82" stroke="${PARCH}" stroke-width="1" opacity=".55" stroke-dasharray="1.5 2.5"/>
      <line x1="83.5" y1="58" x2="83.5" y2="82" stroke="${PARCH}" stroke-width="1" opacity=".55" stroke-dasharray="1.5 2.5"/>
      ${corner(false)}${corner(true)}
      <text x="50" y="19" text-anchor="middle" font-size="${h.title.length > 9 ? 5.3 : 6.8}" letter-spacing=".5" font-weight="700" font-family="Cinzel, Georgia, serif" fill="${PARCH}" opacity=".95" ${h.title.length > 9 ? 'textLength="40" lengthAdjust="spacingAndGlyphs"' : ''}>${h.title}</text>
      <g transform="rotate(180 50 70)"><text x="50" y="19" text-anchor="middle" font-size="${h.title.length > 9 ? 5.3 : 6.8}" letter-spacing=".5" font-weight="700" font-family="Cinzel, Georgia, serif" fill="${PARCH}" opacity=".95" ${h.title.length > 9 ? 'textLength="40" lengthAdjust="spacingAndGlyphs"' : ''}>${h.title}</text></g>
      <g transform="rotate(${tilt} 50 70)">
        <path d="M29 41 L35 34 H65 L71 41 V99 L65 106 H35 L29 99Z" fill="${PARCH}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
        <g clip-path="url(#cp-${color})">
          <rect x="29" y="34" width="42" height="72" fill="#c8b07a" opacity=".22"/>
          <ellipse cx="${(38 + r() * 24).toFixed(1)}" cy="${(48 + r() * 44).toFixed(1)}" rx="${(8 + r() * 8).toFixed(1)}" ry="${(6 + r() * 6).toFixed(1)}" fill="#7a5420" opacity=".13"/>
        </g>
        <path d="M31.8 42 L36.4 36.8 H63.6 L68.2 42 V98 L63.6 103.2 H36.4 L31.8 98Z" fill="none" stroke="${shade(h.main, 0.9)}" stroke-width="1" opacity=".9"/>
        <text x="50.8" y="${long ? 87.6 : 91.4}" text-anchor="middle" font-size="${long ? 36 : 54}" font-weight="700" font-family="Cinzel, 'Cormorant Garamond', Georgia, serif" fill="${h.main}" opacity=".35">${txt}</text>
        <text x="50" y="${long ? 86.4 : 90}" text-anchor="middle" font-size="${long ? 36 : 54}" font-weight="700" font-family="Cinzel, 'Cormorant Garamond', Georgia, serif" fill="${numFill}">${txt}</text>
      </g>
      ${wear(key, 100, 140, 1, 6.5)}`;
    return (faceCache[key] = svg('0 0 100 140', inner, 'art-card'));
  }

  // ---------- rub karty (lícem dolů) ----------
  const backCache = {};
  function cardBack(variant) {
    const v = variant || 0;
    if (backCache[v]) return backCache[v];
    let lat = '';
    for (let i = -8; i <= 8; i++) {
      lat += `<line x1="${i * 14}" y1="0" x2="${i * 14 + 140}" y2="140"/><line x1="${i * 14 + 140}" y1="0" x2="${i * 14}" y2="140"/>`;
    }
    const inner = `
      <rect x="1" y="1" width="98" height="138" rx="6.5" fill="#3a1414" stroke="${INK}" stroke-width="2"/>
      <defs><clipPath id="cb-in"><rect x="6" y="6" width="88" height="128" rx="3"/></clipPath></defs>
      <g clip-path="url(#cb-in)">
        <rect x="6" y="6" width="88" height="128" fill="#4d1c19"/>
        <g stroke="${GOLD}" stroke-width=".7" opacity=".45">${lat}</g>
      </g>
      <rect x="6" y="6" width="88" height="128" rx="3" fill="none" stroke="${GOLD}" stroke-width="1.3" opacity=".9"/>
      <rect x="9.5" y="9.5" width="81" height="121" rx="2" fill="none" stroke="${GOLD}" stroke-width=".6" opacity=".8"/>
      <circle cx="50" cy="70" r="26" fill="#3a1414" stroke="${GOLD}" stroke-width="1.6"/>
      <circle cx="50" cy="70" r="22.5" fill="none" stroke="${GOLD}" stroke-width=".6"/>
      ${rose(50, 70, 20, '#9a322c', '#e8dcc0', GOLD)}
      ${sparkle(18, 20, 4, GOLD_L, 0.8)}${sparkle(82, 20, 4, GOLD_L, 0.8)}${sparkle(18, 120, 4, GOLD_L, 0.8)}${sparkle(82, 120, 4, GOLD_L, 0.8)}
      ${wear('back' + v, 100, 140, 1, 6.5)}`;
    return (backCache[v] = svg('0 0 100 140', inner, 'art-card'));
  }

  // ---------- lokace (pole) ----------
  const SCENE = {};
  SCENE.R = () => `
    <rect x="8" y="8" width="84" height="80" fill="#6e1b1b"/>
    <rect x="8" y="40" width="84" height="48" fill="#a63b2a"/>
    <rect x="8" y="58" width="84" height="30" fill="#3d1010"/>
    <circle cx="72" cy="25" r="9" fill="#f2dca2"/><circle cx="76.5" cy="22" r="8" fill="#6e1b1b"/>
    ${sparkle(30, 20, 2.6, '#f2dca2', 0.8)}${sparkle(50, 13, 2, '#f2dca2', 0.7)}
    <path d="M8 66 Q30 52 52 64 T92 60 V88 H8Z" fill="#2b0d0d"/>
    <g fill="#1c0a0a" stroke="${INK}" stroke-width=".8">
      <rect x="15" y="34" width="22" height="54"/>
      <rect x="15" y="30" width="5" height="5"/><rect x="23" y="30" width="5" height="5"/><rect x="31" y="30" width="6" height="5"/>
      <rect x="37" y="50" width="14" height="38"/>
      <rect x="37" y="47" width="4" height="4"/><rect x="44" y="47" width="4" height="4"/>
    </g>
    <rect x="22" y="46" width="4.4" height="9" rx="2.2" fill="#f5c04a"/>
    <rect x="42" y="60" width="3.6" height="7" rx="1.8" fill="#f5c04a"/>
    <path d="M26 30 V19" stroke="${INK}" stroke-width="1"/><path d="M26 19 L36 22 L26 25Z" fill="#c0302a" stroke="${INK}" stroke-width=".7"/>
    <g stroke="${INK}" stroke-width="1" stroke-linejoin="round">
      <path d="M68 30 L63.4 62 L72.6 62Z" fill="#e7e9ee"/>
      <rect x="58" y="62" width="20" height="4" rx="1.6" fill="${GOLD}"/>
      <rect x="65.7" y="66" width="4.6" height="12" rx="1.2" fill="#4a2a16"/>
      <circle cx="68" cy="80" r="3" fill="${GOLD}"/>
    </g>
    <path d="M8 78 H92 V88 H8Z" fill="#1d0d0d"/>`;
  SCENE.G = () => {
    let trees = '';
    [14, 30, 46, 62, 78, 90].forEach((x, i) => {
      const hh = 30 + (i % 3) * 5;
      trees += `<path d="M${x - 9} 72 L${x} ${72 - hh} L${x + 9} 72Z M${x - 7} 62 L${x} ${62 - hh * 0.8} L${x + 7} 62Z" fill="${i % 2 ? '#1e4733' : '#235239'}"/>`;
    });
    return `
    <rect x="8" y="8" width="84" height="80" fill="#14302a"/>
    <rect x="8" y="46" width="84" height="26" fill="#2a5a43" opacity=".8"/>
    <circle cx="72" cy="22" r="7" fill="#dff0d4" opacity=".92"/><circle cx="75.5" cy="19.5" r="6" fill="#14302a"/>
    ${sparkle(24, 18, 2.4, '#dff0d4', 0.8)}${sparkle(44, 28, 1.8, '#dff0d4', 0.7)}
    ${trees}
    <path d="M8 74 Q34 66 60 74 T92 72 V88 H8Z" fill="#0d2118"/>
    <path d="M8 40 L18 8 H28 Z M92 38 L82 8 H70Z" fill="#0b1a13" opacity=".0"/>
    <g fill="#0b1a13"><path d="M6 88 V30 L14 8 L22 30 V88Z"/><path d="M94 88 V34 L86 12 L78 34 V88Z"/></g>
    <circle cx="62" cy="68" r="14" fill="#f6d46a" opacity=".22"/>
    <path d="M45 44 Q53 46 53 56 L60 82 H32 L38 56 Q38 46 45 44Z" fill="#0f251a" stroke="#4f8f6a" stroke-width=".9" stroke-linejoin="round"/>
    <circle cx="43" cy="53" r=".9" fill="#f0f0b0"/><circle cx="47" cy="53" r=".9" fill="#f0f0b0"/>
    <path d="M53 62 L59 66" stroke="#0f251a" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="58.4" y="65" width="5.2" height="6.6" rx="1" fill="#f6d46a" stroke="${INK}" stroke-width=".7"/>
    <g transform="translate(34 70) rotate(-8)"><rect width="7" height="4.6" rx=".8" fill="#efe6cc" stroke="${INK}" stroke-width=".6"/><circle cx="3.5" cy="2.3" r="1.2" fill="#a8302c"/></g>
    <path d="M8 84 H92 V88 H8Z" fill="#08130d"/>`;
  };
  SCENE.Y = () => {
    let coins = '';
    [[26, 0], [38, 1], [62, 2], [74, 0]].forEach(([x, k]) => {
      for (let i = 0; i < 3 + k; i++) {
        coins += `<ellipse cx="${x}" cy="${72 - i * 3.2}" rx="6" ry="2.4" fill="${i % 2 ? GOLD_L : GOLD}" stroke="${INK}" stroke-width=".8"/>`;
      }
    });
    return `
    <rect x="8" y="8" width="84" height="80" fill="#6f4d14"/>
    <rect x="8" y="8" width="84" height="26" fill="#94691e"/>
    <path d="M30 60 V26 Q30 14 40 14 H60 Q70 14 70 26 V60Z" fill="#e8c25a" opacity=".25"/>
    <g fill="#7d5712" stroke="${INK}" stroke-width=".9"><rect x="9" y="14" width="10" height="64"/><rect x="81" y="14" width="10" height="64"/></g>
    <g fill="#a67a28" stroke="${INK}" stroke-width=".8"><rect x="7" y="12" width="14" height="5"/><rect x="79" y="12" width="14" height="5"/></g>
    <path d="M50 8 V20" stroke="${INK}" stroke-width="1"/>
    <path d="M42 20 H58 L55 28 H45Z" fill="${GOLD}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M44.4 24 q-.5 -3 0 -5 M50 24 q0 -3 0 -5 M55.6 24 q.5 -3 0 -5" stroke="#f6d46a" stroke-width="1.6" fill="none"/>
    <rect x="8" y="76" width="84" height="12" fill="#3a2808"/>
    <rect x="16" y="72" width="68" height="7" rx="1.5" fill="#7a2c26" stroke="${INK}" stroke-width=".9"/>
    <rect x="16" y="78" width="68" height="9" fill="#5b1d1a" stroke="${INK}" stroke-width=".9"/>
    ${coins}
    <path d="M47 71 Q43 60 47 54 H53 Q57 60 53 71Z" fill="#8a5a2b" stroke="${INK}" stroke-width=".9"/>
    <rect x="46" y="51.6" width="8" height="3.6" rx="1.6" fill="${GOLD}" stroke="${INK}" stroke-width=".8"/>
    ${sparkle(30, 56, 2.6, '#fff3c0', 0.9)}${sparkle(68, 52, 2.2, '#fff3c0', 0.9)}${sparkle(50, 44, 2, '#fff3c0', 0.9)}`;
  };
  SCENE.B = () => `
    <rect x="8" y="8" width="84" height="80" fill="#2c4d8c"/>
    <rect x="8" y="40" width="84" height="48" fill="#6c90cc"/>
    <rect x="8" y="64" width="84" height="24" fill="#a9c1e6"/>
    <g stroke="#f1e3a8" stroke-width="1.5" opacity=".6" stroke-linecap="round">
      <line x1="50" y1="38" x2="50" y2="8"/><line x1="50" y1="38" x2="26" y2="10"/><line x1="50" y1="38" x2="74" y2="10"/><line x1="50" y1="38" x2="12" y2="30"/><line x1="50" y1="38" x2="88" y2="30"/>
    </g>
    <g stroke="${INK}" stroke-width="1" stroke-linejoin="round">
      <rect x="14" y="52" width="16" height="36" fill="#cfc6b0"/>
      <path d="M12 52 L22 36 L32 52Z" fill="#44547a"/>
      <rect x="70" y="52" width="16" height="36" fill="#cfc6b0"/>
      <path d="M68 52 L78 36 L88 52Z" fill="#44547a"/>
      <rect x="30" y="46" width="40" height="42" fill="#ddd5bf"/>
      <path d="M28 46 L50 22 L72 46Z" fill="#44547a"/>
      <circle cx="50" cy="55" r="8" fill="#e9e1ca"/>
      <circle cx="50" cy="55" r="5.6" fill="#a8302c"/>
      <circle cx="50" cy="55" r="2.4" fill="#f1e3a8"/>
      <path d="M43 88 V74 Q43 66 50 66 Q57 66 57 74 V88Z" fill="#2a2a52"/>
      <path d="M18 64 v-6 q2 -3 4 0 v6z M74 64 v-6 q2 -3 4 0 v6z" fill="#3e66b0"/>
    </g>
    <g stroke="#a8302c" stroke-width="1.2"><line x1="50" y1="55" x2="50" y2="49.6"/><line x1="50" y1="55" x2="50" y2="60.4"/><line x1="50" y1="55" x2="44.6" y2="55"/><line x1="50" y1="55" x2="55.4" y2="55"/></g>
    <path d="M50 22 V12 M46 16 H54" stroke="${GOLD}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M8 84 H92 V88 H8Z" fill="#5f7c52"/>`;
  SCENE.S = () => `
    <rect x="8" y="8" width="84" height="80" fill="#98a1b3"/>
    <rect x="8" y="46" width="84" height="42" fill="#c5cad3"/>
    <path d="M8 66 Q30 54 54 64 T92 60 V88 H8Z" fill="#8a9a7e"/>
    <g stroke="${INK}" stroke-width="1.1" stroke-linejoin="round">
      <path d="M22 88 V46 Q22 26 50 26 Q78 26 78 46 V88Z" fill="#6d727a"/>
      <path d="M30 88 V48 Q30 34 50 34 Q70 34 70 48 V88Z" fill="#d6dce4"/>
    </g>
    <path d="M30 70 Q50 58 70 70 V88 H30Z" fill="#9db08c"/>
    <path d="M36 88 V72 Q50 62 64 72 V88Z" fill="#7d9070" opacity=".7"/>
    <g stroke="${INK}" stroke-width=".7">
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const t = i / 8; const a = Math.PI * (1 - t);
        const x = 50 + Math.cos(a) * 28, y = 46 - Math.sin(a) * 20;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.8" fill="${i % 2 ? '#f3d6dc' : '#fbf7ee'}"/>`;
      }).join('')}
    </g>
    <g transform="translate(50 46) scale(.62)">${emRings()}</g>
    <path d="M14 30 q4 -5 8 -1 q-3 4 -8 1z M86 30 q-4 -5 -8 -1 q3 4 8 1z" fill="#fbf7ee" stroke="${INK}" stroke-width=".8"/>
    ${sparkle(20, 18, 2.4, '#ffffff', 0.9)}${sparkle(80, 16, 2, '#ffffff', 0.9)}
    <path d="M8 84 H92 V88 H8Z" fill="#59606a"/>`;
  SCENE.N = () => `
    <rect x="8" y="8" width="84" height="80" fill="#7c725b"/>
    <g transform="translate(50 48) scale(1.3)">${emNeutral()}</g>`;

  const tileCache = {};
  function tile(color) {
    if (tileCache[color]) return tileCache[color];
    const h = HOUSE[color] || HOUSE.N;
    const inner = `
      <rect x="1" y="1" width="98" height="130" rx="6" fill="${PARCH}" stroke="${INK}" stroke-width="2"/>
      <rect x="4.5" y="4.5" width="91" height="123" rx="3.5" fill="none" stroke="${GOLD_D}" stroke-width=".7"/>
      <defs><clipPath id="tw-${color}"><path d="M8 88 V44 Q8 8 50 8 Q92 8 92 44 V88 Z"/></clipPath></defs>
      <g clip-path="url(#tw-${color})">${(SCENE[color] || SCENE.N)()}</g>
      <path d="M8 88 V44 Q8 8 50 8 Q92 8 92 44 V88 Z" fill="none" stroke="${INK}" stroke-width="1.7"/>
      <path d="M11 86 V44 Q11 11 50 11 Q89 11 89 44 V86" fill="none" stroke="${GOLD}" stroke-width=".9"/>
      <rect x="8" y="92" width="84" height="32" rx="3" fill="${h.main}" stroke="${INK}" stroke-width="1.4"/>
      <rect x="10.5" y="94.5" width="79" height="27" rx="2" fill="none" stroke="${GOLD_L}" stroke-width=".6" opacity=".8"/>
      <text x="50" y="107.6" text-anchor="middle" font-size="${h.title.length > 9 ? 7.4 : 11}" letter-spacing="${h.title.length > 9 ? '.2' : '.7'}" font-weight="700" font-family="Cinzel, Georgia, serif" fill="${PARCH}" ${h.title.length > 9 ? 'textLength="72" lengthAdjust="spacingAndGlyphs"' : ''}>${h.title}</text>
      <text x="50" y="117.8" text-anchor="middle" font-size="5.6" font-style="italic" font-family="'EB Garamond', Georgia, serif" fill="${GOLD_L}">${h.sub}</text>
      ${wear('tile' + color, 100, 132, 0.8, 6)}`;
    return (tileCache[color] = svg('0 0 100 132', inner, 'art-tile'));
  }
  // rub dlaždice (skrytá pole v panství)
  function tileBack() {
    const inner = `
      <rect x="1" y="1" width="98" height="130" rx="6" fill="#2b2118" stroke="${INK}" stroke-width="2"/>
      <rect x="6" y="6" width="88" height="120" rx="3" fill="none" stroke="${GOLD}" stroke-width="1.2"/>
      <path d="M50 22 L78 66 L50 110 L22 66Z" fill="#3a1414" stroke="${GOLD}" stroke-width="1.2"/>
      ${rose(50, 66, 17, '#a8302c', '#f1e8d2', GOLD)}`;
    return svg('0 0 100 132', inner, 'art-tile');
  }

  // ---------- hrdinové (portréty) ----------
  const HEROES = {
    york:             { first: 'Richard', second: 'z Yorku', bg: '#2d3e68', skin: '#e3b98e', hair: '#5a3a22', hairStyle: 'short', beard: '#5a3a22', head: 'coronet', robe: '#3b3f7a', trim: GOLD, badge: 'whiteRose' },
    edmund:           { first: 'Edmund', second: 'Beaufort', bg: '#6b1d1d', skin: '#d9a97a', hair: '#2b1b12', hairStyle: 'short', beard: null, head: 'hood', robe: '#8e2a2a', trim: GOLD, badge: 'portcullis' },
    edwardIV:         { first: 'Edward', second: 'IV.', bg: '#b89a42', skin: '#efc8a0', hair: '#c9a25a', hairStyle: 'mid', beard: null, head: 'crown', robe: '#d4d6df', trim: '#26407a', badge: 'sun' },
    henryVI:          { first: 'Henry', second: 'VI.', bg: '#274a7a', skin: '#f0d2b0', hair: '#3a2a1c', hairStyle: 'mid', beard: null, head: 'crown', robe: '#2e5aa0', trim: GOLD, badge: 'fleur' },
    cecily:           { first: 'Cecily', second: 'Nevillová', bg: '#5b3a6b', skin: '#efd0b0', hair: '#5a3a22', hairStyle: 'none', beard: null, head: 'wimple', robe: '#7a2c4c', trim: GOLD, badge: 'whiteRose' },
    margaretAnjou:    { first: 'Margaret', second: 'z Anjou', bg: '#7b1a1a', skin: '#efc8a0', hair: '#1d1410', hairStyle: 'long', beard: null, head: 'circlet', robe: '#a02b2b', trim: GOLD, badge: 'daisy', fierce: true },
    neville:          { first: 'Richard', second: 'Neville', bg: '#5a1f1f', skin: '#d6a678', hair: '#4a3a2a', hairStyle: 'none', beard: '#5b4a38', head: 'coif', robe: '#a82a2a', trim: '#c9ccd2', badge: 'staff' },
    margaretBeaufort: { first: 'Margaret', second: 'Beaufort', bg: '#2f3a3a', skin: '#efd0b0', hair: '#5a3a22', hairStyle: 'none', beard: null, head: 'veil', robe: '#2a2a32', trim: '#8c8c96', badge: 'redRose' },
  };

  function badge(kind, cx, cy, r) {
    switch (kind) {
      case 'whiteRose': return rose(cx, cy, r, '#f6f1e4', null, GOLD);
      case 'redRose': return rose(cx, cy, r, '#b02a2a', null, GOLD);
      case 'daisy': {
        let s = '';
        for (let i = 0; i < 8; i++) {
          const a = i * 45;
          s += `<ellipse cx="${cx}" cy="${cy - r * 0.62}" rx="${r * 0.22}" ry="${r * 0.42}" transform="rotate(${a} ${cx} ${cy})" fill="#fbf7ee" stroke="${INK}" stroke-width=".5"/>`;
        }
        return s + `<circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="${GOLD}" stroke="${INK}" stroke-width=".5"/>`;
      }
      case 'sun': {
        let s = '';
        for (let i = 0; i < 16; i++) {
          const a = i * 22.5 * Math.PI / 180, l = i % 2 ? r * 0.85 : r * 1.15;
          s += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * l).toFixed(2)}" y2="${(cy + Math.sin(a) * l).toFixed(2)}" stroke="${GOLD_D}" stroke-width="1"/>`;
        }
        return s + `<circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="${GOLD_L}" stroke="${INK}" stroke-width=".7"/>`;
      }
      case 'fleur':
        return `<g fill="${GOLD}" stroke="${INK}" stroke-width=".6"><path d="M${cx} ${cy - r} Q${cx + r * 0.5} ${cy - r * 0.3} ${cx} ${cy + r * 0.5} Q${cx - r * 0.5} ${cy - r * 0.3} ${cx} ${cy - r}Z"/>
          <path d="M${cx - r * 0.2} ${cy} Q${cx - r} ${cy - r * 0.6} ${cx - r * 0.9} ${cy + r * 0.1} Q${cx - r * 0.7} ${cy + r * 0.5} ${cx - r * 0.1} ${cy + r * 0.5}Z"/>
          <path d="M${cx + r * 0.2} ${cy} Q${cx + r} ${cy - r * 0.6} ${cx + r * 0.9} ${cy + r * 0.1} Q${cx + r * 0.7} ${cy + r * 0.5} ${cx + r * 0.1} ${cy + r * 0.5}Z"/>
          <rect x="${cx - r * 0.6}" y="${cy + r * 0.45}" width="${r * 1.2}" height="${r * 0.28}" rx="1"/></g>`;
      case 'portcullis': {
        let g = '';
        for (let i = 0; i <= 4; i++) g += `<line x1="${cx - r * 0.8 + i * r * 0.4}" y1="${cy - r * 0.8}" x2="${cx - r * 0.8 + i * r * 0.4}" y2="${cy + r * 0.9}"/>`;
        for (let i = 0; i <= 3; i++) g += `<line x1="${cx - r * 0.8}" y1="${cy - r * 0.8 + i * r * 0.5}" x2="${cx + r * 0.8}" y2="${cy - r * 0.8 + i * r * 0.5}"/>`;
        return `<g stroke="${GOLD}" stroke-width="1.1" fill="none">${g}</g><rect x="${cx - r * 0.8}" y="${cy - r * 0.8}" width="${r * 1.6}" height="${r * 1.4}" fill="none" stroke="${GOLD}" stroke-width="1.4"/>`;
      }
      case 'staff':
        return `<g stroke="${INK}" stroke-width=".7" fill="#e7e9ee" stroke-linejoin="round">
          <path d="M${cx - r * 0.2} ${cy + r} L${cx - r * 0.2} ${cy - r} L${cx + r * 0.2} ${cy - r} L${cx + r * 0.2} ${cy + r}Z"/>
          <path d="M${cx + r * 0.2} ${cy - r * 0.5} L${cx + r * 0.8} ${cy - r * 0.8} L${cx + r * 0.7} ${cy - r * 0.3}Z M${cx - r * 0.2} ${cy + r * 0.1} L${cx - r * 0.8} ${cy - r * 0.2} L${cx - r * 0.7} ${cy + r * 0.4}Z M${cx + r * 0.2} ${cy + r * 0.5} L${cx + r * 0.8} ${cy + r * 0.3} L${cx + r * 0.7} ${cy + r * 0.8}Z"/></g>`;
      default: return '';
    }
  }

  function bust(o) {
    const sk = o.skin, skD = shade(sk, 0.72);
    const hairDark = shade(o.hair, 0.8);
    let back = '', front = '';
    // vzadu: dlouhé vlasy / mísy / šátek / kapuce
    if (o.hairStyle === 'long') back += `<path d="M33 46 Q31 28 50 26 Q69 28 67 46 L72 84 Q50 78 28 84Z" fill="${o.hair}" stroke="${INK}" stroke-width="1"/>`;
    if (o.head === 'coif') back += `<path d="M33 56 Q30 28 50 26 Q70 28 67 56 L66 74 Q50 82 34 74Z" fill="#9aa1ab" stroke="${INK}" stroke-width="1.1"/>`;
    if (o.head === 'wimple') back += `<path d="M31 62 Q29 28 50 25 Q71 28 69 62 L74 94 Q50 86 26 94Z" fill="#efe9dc" stroke="${INK}" stroke-width="1.1"/>`;
    if (o.head === 'veil') back += `<path d="M28 50 Q28 22 50 20 Q72 22 72 50 L78 96 Q50 88 22 96Z" fill="#23232b" stroke="${INK}" stroke-width="1.1"/><path d="M31 62 Q30 30 50 27 Q70 30 69 62 L72 90 Q50 84 28 90Z" fill="#efe9dc" stroke="${INK}" stroke-width="1"/>`;
    if (o.hairStyle === 'mid') back += `<path d="M34 50 Q32 28 50 27 Q68 28 66 50 L65 66 Q50 60 35 66Z" fill="${o.hair}" stroke="${INK}" stroke-width="1"/>`;
    // ramena + krk
    back += `<path d="M8 120 Q10 86 36 79 L64 79 Q90 86 92 120Z" fill="${o.robe}" stroke="${INK}" stroke-width="1.3"/>`;
    if (o.head === 'coif') back += `<path d="M26 100 Q30 82 38 79 L62 79 Q70 82 74 100 Q50 92 26 100Z" fill="#9aa1ab" stroke="${INK}" stroke-width="1"/>`;
    back += `<rect x="44" y="66" width="12" height="16" fill="${skD}" stroke="${INK}" stroke-width="1"/>`;
    if (o.head !== 'wimple' && o.head !== 'veil') {
      back += `<path d="M38 79 Q50 91 62 79 L66 82 Q50 99 34 82Z" fill="${o.trim}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>`;
    }
    // hlava
    front += `<circle cx="36.6" cy="53" r="2.5" fill="${sk}" stroke="${INK}" stroke-width="1"/><circle cx="63.4" cy="53" r="2.5" fill="${sk}" stroke="${INK}" stroke-width="1"/>`;
    front += `<ellipse cx="50" cy="52" rx="13.6" ry="16.6" fill="${sk}" stroke="${INK}" stroke-width="1.3"/>`;
    // vousy
    if (o.beard) front += `<path d="M36.8 54 Q37 74 50 76.5 Q63 74 63.2 54 Q60 65 50 66 Q40 65 36.8 54Z" fill="${o.beard}" stroke="${INK}" stroke-width="1"/>`;
    // vlasy nahoře
    if (o.hairStyle === 'short') front += `<path d="M36.4 49 Q34.6 31 50 30.6 Q65.4 31 63.6 49 Q60 40 50 40 Q40 40 36.4 49Z" fill="${o.hair}" stroke="${INK}" stroke-width="1"/>`;
    if (o.hairStyle === 'mid') front += `<path d="M36.2 50 Q34.4 31 50 30.6 Q65.6 31 63.8 50 Q60 41 50 40.6 Q40 41 36.2 50Z" fill="${o.hair}" stroke="${INK}" stroke-width="1"/>`;
    if (o.hairStyle === 'long') front += `<path d="M36.2 50 Q34 31 50 30 Q66 31 63.8 50 Q56 38 50 40 Q44 38 36.2 50Z" fill="${o.hair}" stroke="${INK}" stroke-width="1"/>`;
    // obličej
    const browCol = o.hairStyle === 'none' && !o.beard ? '#6a4a30' : hairDark;
    const brow = o.fierce
      ? `<path d="M40.4 46.4 L47.4 48.4 M59.6 46.4 L52.6 48.4" stroke="${browCol}" stroke-width="1.5" stroke-linecap="round" fill="none"/>`
      : `<path d="M40.8 47.6 Q44 45.8 47.2 47.4 M52.8 47.4 Q56 45.8 59.2 47.6" stroke="${browCol}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
    front += brow;
    front += `<ellipse cx="44.2" cy="51.4" rx="1.8" ry="1.15" fill="${INK}"/><ellipse cx="55.8" cy="51.4" rx="1.8" ry="1.15" fill="${INK}"/>`;
    front += `<path d="M50 51 Q48.2 57.5 50.6 59" stroke="${skD}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
    front += `<circle cx="41.6" cy="57" r="2.6" fill="#c8504a" opacity=".16"/><circle cx="58.4" cy="57" r="2.6" fill="#c8504a" opacity=".16"/>`;
    front += o.fierce || o.head === 'coif'
      ? `<path d="M46.4 63.2 Q50 63.8 53.6 63.2" stroke="#7a2e24" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
      : `<path d="M46.4 62.6 Q50 65 53.6 62.6" stroke="#8c3a2e" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    if (o.beard) front += `<path d="M44.6 61.2 Q50 59.6 55.4 61.2 Q50 62.6 44.6 61.2Z" fill="${o.beard}" stroke="${INK}" stroke-width=".6"/>`;
    // pokrývky hlavy (vpředu)
    switch (o.head) {
      case 'crown':
        front += `<path d="M36 42 L35 27 L42 34 L46 24 L50 33 L54 24 L58 34 L65 27 L64 42Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
          <rect x="36" y="38.4" width="28" height="5" fill="${GOLD_D}" stroke="${INK}" stroke-width=".8"/>
          <circle cx="46" cy="25.4" r="1.7" fill="#b02a2a"/><circle cx="54" cy="25.4" r="1.7" fill="#2a5ab0"/><circle cx="35.6" cy="28" r="1.5" fill="#3c8a4c"/><circle cx="64.4" cy="28" r="1.5" fill="#3c8a4c"/><circle cx="50" cy="41" r="1.6" fill="#b02a2a"/>`;
        break;
      case 'coronet':
        front += `<rect x="37" y="37.6" width="26" height="5" rx="1" fill="${GOLD}" stroke="${INK}" stroke-width="1"/>`;
        [40, 45, 50, 55, 60].forEach((x) => { front += `<circle cx="${x}" cy="35.8" r="2.7" fill="${GOLD}" stroke="${INK}" stroke-width=".9"/>`; });
        front += `<circle cx="50" cy="40" r="1.4" fill="#b02a2a"/>`;
        break;
      case 'circlet':
        front += `<path d="M36.6 43 Q50 38.6 63.4 43" stroke="${INK}" stroke-width="3.8" fill="none"/><path d="M36.6 43 Q50 38.6 63.4 43" stroke="${GOLD}" stroke-width="2.4" fill="none"/><circle cx="50" cy="40.6" r="2.3" fill="#b02a2a" stroke="${INK}" stroke-width=".8"/>`;
        break;
      case 'coif':
        front += `<path d="M35.6 47 Q35 30 50 29 Q65 30 64.4 47 Q62 38 50 36.6 Q38 38 35.6 47Z" fill="#9aa1ab" stroke="${INK}" stroke-width="1.1"/>`;
        for (let i = 0; i < 9; i++) front += `<circle cx="${38 + i * 3}" cy="${34 + (i % 2) * 2.6}" r=".7" fill="#5c626c"/>`;
        break;
      case 'hood':
        front += `<ellipse cx="50" cy="35.6" rx="17.4" ry="9.2" fill="${o.robe}" stroke="${INK}" stroke-width="1.2"/>
          <path d="M33 38 Q50 31 67 38 L66.4 44.4 Q50 37.4 33.6 44.4Z" fill="${shade(o.robe, 0.7)}" stroke="${INK}" stroke-width="1"/>
          <path d="M64 33 Q80 38 78 64 Q72 50 63 44Z" fill="${o.robe}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`;
        break;
      case 'wimple':
        front += `<path d="M36.4 47 Q50 35 63.6 47 L63.6 41 Q50 28 36.4 41Z" fill="#efe9dc" stroke="${INK}" stroke-width="1"/>
          <path d="M37 58 Q50 79 63 58 L67 72 Q50 90 33 72Z" fill="#efe9dc" stroke="${INK}" stroke-width="1"/>
          <path d="M36.4 44 Q50 38 63.6 44" stroke="${GOLD}" stroke-width="2" fill="none"/>`;
        break;
      case 'veil':
        front += `<path d="M36.4 47 Q50 35 63.6 47 L63.6 41 Q50 28 36.4 41Z" fill="#efe9dc" stroke="${INK}" stroke-width="1"/>
          <path d="M36 62 Q50 74 64 62 L67 74 Q50 88 33 74Z" fill="#efe9dc" stroke="${INK}" stroke-width="1"/>
          <path d="M30 46 Q30 24 50 22 Q70 24 70 46 Q64 32 50 31 Q36 32 30 46Z" fill="#23232b" stroke="${INK}" stroke-width="1"/>`;
        // růženec
        for (let i = 0; i < 9; i++) {
          const a = (200 + i * 17) * Math.PI / 180;
          front += `<circle cx="${(50 + Math.cos(a) * 15).toFixed(1)}" cy="${(88 + Math.sin(a) * 9).toFixed(1)}" r="1.5" fill="#7a4a24" stroke="${INK}" stroke-width=".5"/>`;
        }
        break;
    }
    // odznak na hrudi
    front += `<circle cx="50" cy="93" r="7.4" fill="${shade(o.robe, 0.62)}" stroke="${GOLD}" stroke-width="1"/>${badge(o.badge, 50, 93, 5.4)}`;
    return back + front;
  }

  function hero(id) {
    const d = HEROES[id];
    if (!d) return heroBack();
    const inner = `
      <rect x="1" y="1" width="98" height="138" rx="7" fill="#1d1812" stroke="${INK}" stroke-width="2"/>
      <rect x="4.5" y="4.5" width="91" height="131" rx="4.5" fill="none" stroke="${GOLD}" stroke-width="1.5"/>
      <defs><clipPath id="hw"><path d="M12 98 V42 Q12 11 50 11 Q88 11 88 42 V98 Z"/></clipPath></defs>
      <path d="M12 98 V42 Q12 11 50 11 Q88 11 88 42 V98 Z" fill="${d.bg}"/>
      <g clip-path="url(#hw)">
        <circle cx="50" cy="52" r="30" fill="#ffffff" opacity=".1"/>
        <circle cx="50" cy="52" r="42" fill="#ffffff" opacity=".07"/>
        ${bust(d)}
      </g>
      <path d="M12 98 V42 Q12 11 50 11 Q88 11 88 42 V98 Z" fill="none" stroke="${GOLD}" stroke-width="2.2"/>
      <path d="M12 98 V42 Q12 11 50 11 Q88 11 88 42 V98 Z" fill="none" stroke="${INK}" stroke-width=".7"/>
      ${sparkle(9, 10, 3.2, GOLD_L, 0.9)}${sparkle(91, 10, 3.2, GOLD_L, 0.9)}
      <path d="M8 103 H92 L88 111.5 L92 120 H8 L12 111.5Z" fill="${PARCH}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
      <text x="50" y="110.6" text-anchor="middle" font-size="7.2" letter-spacing=".5" font-weight="700" font-family="Cinzel, Georgia, serif" fill="${INK}">${d.first.toUpperCase()}</text>
      <text x="50" y="117.4" text-anchor="middle" font-size="5.6" font-style="italic" font-family="'EB Garamond', Georgia, serif" fill="${shade(d.bg, 0.9)}">${d.second}</text>
      <text x="50" y="131" text-anchor="middle" font-size="5" letter-spacing="1.4" font-family="Cinzel, Georgia, serif" fill="${GOLD}">HRDINA</text>
      ${wear('hero' + id, 100, 140, 0.7, 7)}`;
    return svg('0 0 100 140', inner, 'art-card');
  }
  function heroBack() {
    const inner = `
      <rect x="1" y="1" width="98" height="138" rx="7" fill="#15110c" stroke="${INK}" stroke-width="2"/>
      <rect x="5" y="5" width="90" height="130" rx="4" fill="none" stroke="${GOLD}" stroke-width="1.3"/>
      <circle cx="50" cy="66" r="28" fill="none" stroke="${GOLD}" stroke-width="1.2"/>
      <path d="M50 44 L56 60 L72 60 L59 70 L64 86 L50 76 L36 86 L41 70 L28 60 L44 60Z" fill="${GOLD}" stroke="${INK}" stroke-width="1" stroke-linejoin="round" opacity=".92"/>
      <text x="50" y="121" text-anchor="middle" font-size="7" letter-spacing="2" font-family="Cinzel, Georgia, serif" fill="${GOLD}">HRDINA</text>
      ${sparkle(16, 16, 3.4, GOLD_L, 0.9)}${sparkle(84, 16, 3.4, GOLD_L, 0.9)}`;
    return svg('0 0 100 140', inner, 'art-card');
  }

  // ---------- erby hráčů (štítky) ----------
  const SHIELD = 'M3 3 H37 V26 Q37 41 20 47 Q3 41 3 26Z';
  function shield(key) {
    let body = '';
    switch (key) {
      case 'York':
        body = `<path d="${SHIELD}" fill="#8a3a9c"/>${rose(20, 23, 12.5, '#f6f1e4', null, GOLD)}`; break;
      case 'Lancaster':
        body = `<path d="${SHIELD}" fill="#c23a32"/>${rose(20, 23, 12.5, '#f2c14e', null, '#7a1a14')}`; break;
      case 'Neville':
        body = `<path d="${SHIELD}" fill="#2f6fc0"/><path d="M5 6 L35 40 M35 6 L5 40" stroke="#f1ead6" stroke-width="5" clip-path="url(#sh-clip)"/>`; break;
      default: // hráč: Tudorovská růže
        body = `<path d="${SHIELD}" fill="#2f8a55"/>${rose(20, 23, 12.5, '#b02a2a', '#f6f1e4', GOLD)}`;
    }
    const inner = `<defs><clipPath id="sh-clip"><path d="${SHIELD}"/></clipPath></defs>
      ${body}
      <path d="${SHIELD}" fill="none" stroke="${GOLD}" stroke-width="2"/>
      <path d="${SHIELD}" fill="none" stroke="${INK}" stroke-width=".8"/>`;
    return svg('0 0 40 50', inner, 'art-shield');
  }
  function crownIcon() {
    return svg('0 0 40 30', `<path d="M4 26 L2 8 L11 15 L20 3 L29 15 L38 8 L36 26Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><rect x="4" y="22" width="32" height="4.6" fill="${GOLD_D}" stroke="${INK}" stroke-width="1.2"/><circle cx="20" cy="14" r="2.4" fill="#b02a2a" stroke="${INK}" stroke-width=".8"/>`, 'art-icon');
  }

  // ---------- ikony ----------
  const ICON = {
    coin: svg('0 0 24 24', `<circle cx="12" cy="12" r="10.4" fill="${GOLD}" stroke="${INK}" stroke-width="1.6"/><circle cx="12" cy="12" r="7.4" fill="${GOLD_L}" stroke="${GOLD_D}" stroke-width="1"/>${rose(12, 12, 5.4, '#b02a2a', null, GOLD, GOLD_D)}`, 'art-icon'),
    draw: svg('0 0 24 24', `<rect x="5" y="3" width="14" height="19" rx="2" fill="#511a1a" stroke="${GOLD}" stroke-width="1.5"/><rect x="7.4" y="5.4" width="9.2" height="14.2" rx="1" fill="none" stroke="${GOLD}" stroke-width=".8"/><circle cx="12" cy="12.5" r="3" fill="${GOLD}"/>`, 'art-icon'),
    discard: svg('0 0 24 24', `<rect x="4" y="5" width="13" height="17" rx="2" fill="#2b2118" stroke="${GOLD_D}" stroke-width="1.4" transform="rotate(-8 10 14)"/><rect x="8" y="3" width="13" height="17" rx="2" fill="#3a2d1f" stroke="${GOLD}" stroke-width="1.4" transform="rotate(6 14 12)"/>`, 'art-icon'),
    hand: svg('0 0 24 24', `<rect x="3" y="7" width="10" height="14" rx="1.6" fill="${PARCH}" stroke="${INK}" stroke-width="1.3" transform="rotate(-16 8 14)"/><rect x="8" y="5" width="10" height="14" rx="1.6" fill="${PARCH}" stroke="${INK}" stroke-width="1.3"/><rect x="12" y="7" width="10" height="14" rx="1.6" fill="${PARCH_D}" stroke="${INK}" stroke-width="1.3" transform="rotate(16 17 14)"/>`, 'art-icon'),
    pool: svg('0 0 24 24', `<path d="M12 3 L20 8 V16 L12 21 L4 16 V8Z" fill="#3a1414" stroke="${GOLD}" stroke-width="1.6" stroke-linejoin="round"/>${rose(12, 12, 5.4, '#a8302c', '#f1e8d2', GOLD, INK)}`, 'art-icon'),
    scroll: svg('0 0 24 24', `<path d="M6 4 H18 V19 Q18 21 16 21 H8 Q6 21 6 19Z" fill="${PARCH}" stroke="${INK}" stroke-width="1.4"/><circle cx="6" cy="5" r="2.4" fill="${PARCH_D}" stroke="${INK}" stroke-width="1.2"/><circle cx="18" cy="20" r="2.4" fill="${PARCH_D}" stroke="${INK}" stroke-width="1.2"/><path d="M9 9 H15 M9 12.5 H15 M9 16 H13" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>`, 'art-icon'),
    book: svg('0 0 24 24', `<path d="M4 5 Q8 3.5 12 5.5 Q16 3.5 20 5 V19 Q16 17.5 12 19.5 Q8 17.5 4 19Z" fill="${PARCH}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 5.5 V19.5" stroke="${INK}" stroke-width="1.2"/>`, 'art-icon'),
    sound: svg('0 0 24 24', `<path d="M4 9 H8 L13 5 V19 L8 15 H4Z" fill="currentColor" stroke="none"/><path d="M16 9 Q18.6 12 16 15 M18.6 6.6 Q23 12 18.6 17.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`, 'art-icon'),
    soundOff: svg('0 0 24 24', `<path d="M4 9 H8 L13 5 V19 L8 15 H4Z" fill="currentColor" stroke="none"/><path d="M17 9.5 L22 14.5 M22 9.5 L17 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`, 'art-icon'),
    music: svg('0 0 24 24', `<path d="M9 18 V6 L19 4 V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="7" cy="18" rx="3" ry="2.4" fill="currentColor"/><ellipse cx="17" cy="16" rx="3" ry="2.4" fill="currentColor"/>`, 'art-icon'),
    musicOff: svg('0 0 24 24', `<path d="M9 18 V6 L19 4 V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" opacity=".6"/><ellipse cx="7" cy="18" rx="3" ry="2.4" fill="currentColor" opacity=".6"/><ellipse cx="17" cy="16" rx="3" ry="2.4" fill="currentColor" opacity=".6"/><path d="M3 21 L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`, 'art-icon'),
    skull: svg('0 0 24 24', `<path d="M12 3 C6.6 3 4 6.6 4 10.4 C4 13 5.4 14.6 7 15.6 V19 H17 V15.6 C18.6 14.6 20 13 20 10.4 C20 6.6 17.4 3 12 3Z" fill="#d8d0bc" stroke="${INK}" stroke-width="1.4"/><circle cx="8.8" cy="11" r="2.2" fill="${INK}"/><circle cx="15.2" cy="11" r="2.2" fill="${INK}"/><path d="M12 13 L11 15.6 H13Z" fill="${INK}"/><path d="M9.8 19 V16.6 M12 19 V16.6 M14.2 19 V16.6" stroke="${INK}" stroke-width="1"/>`, 'art-icon'),
    lock: svg('0 0 24 24', `<rect x="5" y="10.5" width="14" height="10.5" rx="2" fill="${GOLD}" stroke="${INK}" stroke-width="1.5"/><path d="M8 10.5 V8 Q8 4 12 4 Q16 4 16 8 V10.5" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="12" cy="15.6" r="1.6" fill="${INK}"/>`, 'art-icon'),
    cross: svg('0 0 24 24', `<path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`, 'art-icon'),
    shieldMini: svg('0 0 24 24', `<path d="M12 2.6 L20 5.4 V12 Q20 18.4 12 21.6 Q4 18.4 4 12 V5.4Z" fill="#4a78c8" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 6 V17 M7.6 11 H16.4" stroke="#e9f0ff" stroke-width="1.6" stroke-linecap="round"/>`, 'art-icon'),
    chain: svg('0 0 24 24', `<rect x="3" y="8.5" width="10" height="7" rx="3.5" fill="none" stroke="#c9ccd2" stroke-width="2.2"/><rect x="11" y="8.5" width="10" height="7" rx="3.5" fill="none" stroke="#c9ccd2" stroke-width="2.2"/>`, 'art-icon'),
    eye: svg('0 0 24 24', `<path d="M2 12 Q12 3 22 12 Q12 21 2 12Z" fill="${PARCH}" stroke="${INK}" stroke-width="1.4"/><circle cx="12" cy="12" r="4" fill="#2f6a47" stroke="${INK}" stroke-width="1.2"/><circle cx="12" cy="12" r="1.8" fill="${INK}"/>`, 'art-icon'),
    fast: svg('0 0 24 24', `<path d="M4 6 L12 12 L4 18Z M12 6 L20 12 L12 18Z" fill="currentColor"/>`, 'art-icon'),
  };
  // ikony schopností (pro bannery)
  function abilityIcon(color) {
    const em = EMBLEM[color] || emNeutral;
    return svg('-34 -34 68 68', `<g>${em()}</g>`, 'art-ability');
  }

  // ---------- ozdobné prvky ----------
  const DIVIDER = svg('0 0 200 14', `<path d="M0 7 H78 M122 7 H200" stroke="${GOLD}" stroke-width="1" /><path d="M100 1 L107 7 L100 13 L93 7Z" fill="${GOLD}" stroke="${INK}" stroke-width=".8"/><circle cx="84" cy="7" r="2" fill="${GOLD}"/><circle cx="116" cy="7" r="2" fill="${GOLD}"/>`, 'art-divider');

  // ---------- textury (canvas → dataURL) ----------
  function rand(seed) { // jednoduchý deterministický generátor, ať jsou textury stejné pokaždé
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function makeTexture(kind) {
    try {
      const cv = document.createElement('canvas');
      const W = 256, H = 256;
      cv.width = W; cv.height = H;
      const c = cv.getContext('2d');
      const r = rand(kind === 'wood' ? 7 : kind === 'cloth' ? 11 : 3);
      if (kind === 'wood') {
        c.fillStyle = '#2a1d12'; c.fillRect(0, 0, W, H);
        for (let i = 0; i < 260; i++) {
          const y = r() * H, len = 40 + r() * 200, x = r() * W;
          c.strokeStyle = `rgba(${r() > 0.5 ? '10,6,3' : '70,48,28'},${0.05 + r() * 0.12})`;
          c.lineWidth = 0.5 + r() * 1.6;
          c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 5, x + len * 0.7, y + (r() - 0.5) * 5, x + len, y + (r() - 0.5) * 3); c.stroke();
        }
        for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, i * 64, W, 1.5); }
      } else if (kind === 'cloth') {
        c.fillStyle = '#16251c'; c.fillRect(0, 0, W, H);
        for (let i = 0; i < 5200; i++) {
          c.fillStyle = `rgba(${r() > 0.5 ? '0,0,0' : '70,110,80'},${0.04 + r() * 0.07})`;
          c.fillRect(r() * W, r() * H, 1 + r() * 1.4, 1 + r() * 1.4);
        }
      } else {
        c.fillStyle = '#e8d6a6'; c.fillRect(0, 0, W, H);
        for (let i = 0; i < 4200; i++) {
          c.fillStyle = `rgba(${r() > 0.5 ? '120,86,40' : '255,248,220'},${0.03 + r() * 0.08})`;
          c.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
        }
        for (let i = 0; i < 40; i++) {
          c.strokeStyle = `rgba(120,86,40,${0.04 + r() * 0.06})`; c.lineWidth = 0.6;
          const x = r() * W, y = r() * H;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); c.stroke();
        }
      }
      return cv.toDataURL('image/png');
    } catch (e) { return ''; }
  }

  return {
    INK, PARCH, GOLD, GOLD_D, GOLD_L, HOUSE, HEROES, svg, rose, shade,
    cardFace, cardBack, wear, tile, tileBack, hero, heroBack, shield, crownIcon, ICON, abilityIcon, DIVIDER, makeTexture,
  };
})();
