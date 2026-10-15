// Regrese pro "AI smartness" úpravy z 2026-09-28 (III): časování hrdinů podle zralosti stolu,
// ability-value gating bankování/hraní, counterplay vůči soupeřům na Vraždě/Svatbě/Úplatcích,
// zpřísněný práh štítu (zelený žeton).
// Spustit: cat game.js test_ai_smartness.js > combined_ai_smartness.js && node combined_ai_smartness.js

BOT_DELAY_MS = 0; PLACEMENT_DELAY_MS = 0; ROUNDEND_DELAY_MS = 0; TURN_STEP_MS = 0;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); }
}

function mkEntry(color, value, opts) {
  return Object.assign({ id: uid('play'), color, realColor: color, value, originalValue: value, active: true, facedown: false }, opts || {});
}

function freshGame(n) {
  const game = {
    __gid: uid('game'),
    players: [],
    tiles: makeTilePool(),
    neutralDeck: freshNeutralDeck(),
    neutralDiscard: [],
    round: 3,
    startingPlayerIdx: 0,
    log: [],
    phase: 'round',
  };
  const names = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < n; i++) game.players.push(makePlayer(i, names[i], false, 'balanced'));
  for (const p of game.players) drawCards(p, 10);
  assignHeroes(game);
  game.heroFlags = freshHeroFlags();
  const tiles = inPlayTiles(game);
  game.players.forEach((p, i) => { p.currentTileId = tiles[i].id; tiles[i].occupants.push(p.id); });
  return game;
}

function withPinnedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
}

// --- A: hrdina se škálováním podle stolu se nesmí spustit na skoro prázdný stůl, i když je bot
// nucený (došly mu karty na ruce) - přímo cílí na nahlášený případ "Margaret z Anjou na 1 kartě".
function testHeroGateSparseTable() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.heroes = [{ id: 'margaretAnjou', used: false }];
  p1.heroes = [];
  // Skoro prázdný stůl: jen jedna osamocená karta u soupeře, nic u p0.
  p0.playedThisRound = [];
  p1.playedThisRound = [mkEntry('R', 5)];
  const action = withPinnedRandom(0.5, () => botConsiderHero(game, p0, true));
  check('Margaret z Anjou se nespustí na skoro prázdném stole i když je bot nucený', action === null);
}

// --- B: tentýž hrdina se má spustit, jakmile stůl "dozraje" (v průměru >=1 aktivní karta na
// hráče) a skóre je dost přesvědčivé.
function testHeroFiresOnMatureTable() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.heroes = [{ id: 'margaretAnjou', used: false }];
  p1.heroes = [];
  p0.playedThisRound = [mkEntry('B', 2)];
  p1.playedThisRound = [mkEntry('R', 6), mkEntry('G', 5)];
  const action = withPinnedRandom(0.5, () => botConsiderHero(game, p0, true));
  check('Margaret z Anjou se spustí na dostatečně zralém a výhodném stole', action && action.heroId === 'margaretAnjou');
}

// --- C: dangerousOpponentColors vrací jen barvy aktivních (nepassnutých) soupeřů.
function testDangerousOpponentColors() {
  const game = freshGame(3);
  const [p0, p1, p2] = game.players;
  const tiles = inPlayTiles(game);
  // Barvy nastavené přímo (ne hledáním v náhodně vylosovaném 11-poli poolu, který nemusí
  // obsahovat každou barvu) - deterministické a spolehlivé pro test.
  tiles[1].color = 'R'; tiles[2].color = 'Y';
  p1.currentTileId = tiles[1].id;
  p1.passedThisRound = false;
  p2.currentTileId = tiles[2].id;
  p2.passedThisRound = true; // passnul - jeho schopnost už tohle kolo nehrozí
  const danger = dangerousOpponentColors(game, p0);
  check('dangerousOpponentColors obsahuje barvu aktivního soupeře', danger.has('R'));
  check('dangerousOpponentColors nezahrnuje passnutého soupeře', !danger.has('Y'));
}

// --- D: botUseFavorToken pro zelenou (štít) - zpřísněný práh oproti předchozí verzi.
function testShieldTokenThreshold() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p1.tilesPool = { R: 1, G: 0, Y: 0, B: 0, S: 0 };
  p1.hand = [{ id: 'a', color: 'R', value: 3 }, { id: 'b', color: 'R', value: 2 }];
  check('Špionáž: žeton se nepoužije, když by soupeři jen pomohl (karty jeho barvy)', botUseFavorToken(game, p0, 'G') === false);
  p1.hand = [{ id: 'a', color: 'B', value: 3 }, { id: 'b', color: 'N', value: 2 }];
  check('Špionáž: žeton se použije, když soupeř drží samé karty bez investice', botUseFavorToken(game, p0, 'G') === true);
  p1.hand = [];
  check('Špionáž: žeton se nepoužije bez karet na ruce soupeře', botUseFavorToken(game, p0, 'G') === false);
}

// --- E: counterplay - když soupeř hrozí Vraždou/Svatbou a nevedu jasně, radši hraju nízkou kartu
// než vystavovat nejlepší kus jako terč (a né kartu odpovídající barvy pole, i kdyby byla po ruce).
function testCounterplayAgainstRedGrey() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.heroes = []; p1.heroes = []; // izolovat rozhodování bez vlivu náhodně přiřazených hrdinů
  const tiles = inPlayTiles(game);
  tiles[0].color = 'B'; tiles[1].color = 'R';
  p1.currentTileId = tiles[1].id;
  p1.passedThisRound = false;
  // p0 stojí na barvě, kterou v ruce vůbec nemá (matching prázdné), aby test izoloval jen
  // redOrGreyLive větev rozhodování.
  p0.currentTileId = tiles[0].id;
  p0.tilesPool = { R: 0, G: 0, Y: 0, B: 0, S: 0 };
  p0.hand = [
    { id: 'low1', color: 'N', value: 1 },
    { id: 'high1', color: 'N', value: 6 },
  ];
  p0.playedThisRound = [];
  p1.playedThisRound = [mkEntry('R', 3)];
  // p1 vede dost na to, aby confidence nebyla 'high', ale ne o tolik, aby to spustilo "vzdát kolo".
  const action = withPinnedRandom(0.99, () => botDecideAction(game, p0, false));
  check('Counterplay: proti hrozbě Vraždy/Svatby bot zahraje nízkou kartu, ne vysokou',
    action.type === 'play' && action.cardId === 'low1');
}

// --- F: ability-value gating - když je schopnost pole nízké hodnoty (soupeř bez vhodného terče
// pro Vraždu) a bot má co bankovat, bankChance je navýšený, takže banking převáží nad honěním
// "zadarmo" spuštěné, ale bezcenné schopnosti. Testováno staticky přes bankChance efekt na
// wantsBank (spíš než přes plný botDecideAction kvůli dalším náhodným větvím).
function testAbilityValueGatesBanking() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.heroes = []; p1.heroes = []; // izolovat rozhodování bez vlivu náhodně přiřazených hrdinů
  const tiles = inPlayTiles(game);
  tiles[0].color = 'R'; tiles[1].color = 'G'; // p1 na neutrální (netargetující) barvě, ať netlačí testovanou volbu
  p0.currentTileId = tiles[0].id;
  p1.currentTileId = tiles[1].id;
  p0.tilesPool = { R: 1, G: 0, Y: 0, B: 0, S: 0 }; // R je vlastněná barva -> vždy bezpečná investice
  p1.playedThisRound = []; // soupeř nemá nic vyloženého -> Vražda by neměla žádný cíl, abilityVal nízká
  p0.playedThisRound = [];
  p0.hand = [{ id: 'r1', color: 'R', value: 3 }];
  const abilityVal = estimateAbilityValue(game, p0, 'R');
  check('estimateAbilityValue je nízká, když soupeř nemá co Vraždou sundat', abilityVal === 0);
  // S nízkou hodnotou schopnosti a bankovatelnou kartou vlastní barvy by bot měl bankovat (ne
  // hrát), když náhoda vychází ve prospěch bankování (nízké číslo z Math.random).
  const action = withPinnedRandom(0.01, () => botDecideAction(game, p0, false));
  check('Nízká hodnota schopnosti + vlastněná barva -> bot banku upřednostní', action.type === 'bank');
}

// --- G: pokud soupeř hrozí Úplatky (stojí na žluté a nepassnul), bankChance je silně utlumený -
// ověřeno tak, že i při náhodě, která by jinak bankování spustila, bot radši hraje/passuje.
function testYellowThreatSuppressesBanking() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.heroes = []; p1.heroes = []; // izolovat rozhodování bez vlivu náhodně přiřazených hrdinů
  const tiles = inPlayTiles(game);
  tiles[0].color = 'R'; tiles[1].color = 'Y';
  p1.currentTileId = tiles[1].id;
  p1.passedThisRound = false;
  p0.currentTileId = tiles[0].id;
  p0.tilesPool = { R: 1, G: 0, Y: 0, B: 0, S: 0 };
  p0.hand = [{ id: 'r1', color: 'R', value: 3 }, { id: 'n1', color: 'N', value: 2 }];
  p0.playedThisRound = [];
  p1.playedThisRound = [mkEntry('N', 2)];
  // Náhoda 0.2 by při běžném bankChance (0.55-0.9 po navýšení) spustila bank, ale s Úplatky live
  // (bankChance *= 0.15) by měla zůstat pod prahem -> bot bankuje jen zřídka.
  let bankCount = 0;
  const trials = 50;
  for (let i = 0; i < trials; i++) {
    const action = withPinnedRandom(0.2, () => botDecideAction(game, p0, false));
    if (action.type === 'bank') bankCount++;
  }
  check('Hrozba Úplatků potlačuje bankování (0.2 pod prahem by jinak vždy banklo)', bankCount === 0);
}

async function main() {
  testHeroGateSparseTable();
  testHeroFiresOnMatureTable();
  testDangerousOpponentColors();
  testShieldTokenThreshold();
  testCounterplayAgainstRedGrey();
  testAbilityValueGatesBanking();
  testYellowThreatSuppressesBanking();
  console.log(pass + ' PASS, ' + fail + ' FAIL');
  if (fail > 0) process.exit(1);
}

main();
