// Regrese pro opravy z 2026-09-28 (IV), na základě uživatelské zpětné vazby po Version 18:
// 1) karta hodnoty 1 se nemá chovat jako "nejlevnější" (má silnou schopnost vrátit kartu na ruku)
// 2) poslední karta v beznadějném kole se nemá zbytečně zahrávat (radši pass, banking je OK)
// 3) vytlačený hráč musí za přesun na nové pole zaplatit stejnou cenu jako při běžném vstupu
// 4) limit karet na ruce (10) se musí po dobrání vynutit dobrovolným odhozením přebytku
// Spustit: cat game.js test_fixes2.js > combined_fixes2.js && node combined_fixes2.js

BOT_DELAY_MS = 0; PLACEMENT_DELAY_MS = 0; ROUNDEND_DELAY_MS = 0; TURN_STEP_MS = 0;

function uiLog() {}
function uiRender() {}
async function uiHumanChooseAction() { return { type: 'pass' }; }
async function uiHumanChooseFromEntries(game, player, promptText, entries) { return entries[0].id; }
async function uiHumanChooseHandCard(game, player) { return player.hand[0].id; }
async function uiHumanChooseOpponent(game, player, candidates) { return candidates[0].id; }
async function uiHumanChooseCard(game, player, owner) { return owner.playedThisRound.find(e => e.active && !isProtected(e)).id; }
async function uiHumanYesNo() { return false; }
async function uiHumanChooseTile(game, player, cands) { return cands[0].id; }
let __nextEntryPayment = 'hand';
let __entryPaymentPrompted = false;
async function uiHumanChooseEntryPayment(game, player) { __entryPaymentPrompted = true; return __nextEntryPayment; }
async function uiHumanChooseReturnCard(game, player, eligible) { return eligible[0].id; }
async function uiAnnounceRoundEnd() {}
async function uiAnnounceGameEnd() {}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); }
}

function mkEntry(color, value, opts) {
  return Object.assign({ id: uid('play'), color, realColor: color, value, originalValue: value, active: true, facedown: false }, opts || {});
}

function withPinnedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
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

// --- 1a: proti hrozbě Vraždy/Svatby by bot NEMĚL automaticky zahrát jedničku jako "nejlevnější"
// bezpečnou kartu, když má po ruce i genuinně levnou kartu bez zvláštní schopnosti (2).
function testOneIsNotCheapFiller() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.heroes = []; p1.heroes = []; // izolovat rozhodování bez vlivu náhodně přiřazených hrdinů
  const tiles = inPlayTiles(game);
  // Barvy se přiřazují přímo (ne hledáním v náhodně vylosovaném 11-poli poolu, který nemusí
  // obsahovat každou barvu) - deterministické a spolehlivé pro test.
  tiles[0].color = 'B'; tiles[1].color = 'R';
  p1.currentTileId = tiles[1].id;
  p1.passedThisRound = false;
  p0.currentTileId = tiles[0].id;
  p0.tilesPool = { R: 0, G: 0, Y: 0, B: 0, S: 0 };
  p0.hand = [
    { id: 'one1', color: 'N', value: 1 },
    { id: 'two1', color: 'N', value: 2 },
  ];
  p0.playedThisRound = []; // žádná ohrožená karta na stole -> žádný důvod k záchranné jedničce
  p1.playedThisRound = [mkEntry('R', 3)];
  const action = withPinnedRandom(0.99, () => botDecideAction(game, p0, false));
  check('Bez záchranného důvodu hraje bot proti hrozbě spíš dvojku než jedničku',
    action.type === 'play' && action.cardId === 'two1');
}

// --- 1b: má-li bot na stole nechráněnou kartu hodnoty 3+ a v ruce jedničku, zatímco soupeř hrozí
// Vraždou/Svatbou, vyplatí se zahrát jedničku a zachránit tu ohroženou kartu zpět na ruku.
function testOneRescuesThreatenedCard() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.heroes = []; p1.heroes = []; // izolovat rozhodování bez vlivu náhodně přiřazených hrdinů
  const tiles = inPlayTiles(game);
  tiles[0].color = 'B'; tiles[1].color = 'R';
  p1.currentTileId = tiles[1].id;
  p1.passedThisRound = false;
  p0.currentTileId = tiles[0].id;
  p0.tilesPool = { R: 0, G: 0, Y: 0, B: 0, S: 0 };
  p0.hand = [
    { id: 'one2', color: 'N', value: 1 },
    { id: 'two2', color: 'N', value: 2 },
  ];
  p0.playedThisRound = [mkEntry('N', 5)]; // ohrožená, nechráněná karta hodnoty 5
  p1.playedThisRound = [mkEntry('R', 3)];
  const action = withPinnedRandom(0.99, () => botDecideAction(game, p0, false));
  check('S ohroženou kartou 5 na stole bot radši zahraje jedničku a zachrání ji',
    action.type === 'play' && action.cardId === 'one2');
}

// --- 2a: poslední karta v beznadějně ztraceném kole, kterou NEJDE banknout ani ji nevyplatí zahrát
// kvůli schopnosti, se má radši nechat na ruce (pass) než ji bezcenně prohrát.
function testLastCardHopelessPasses() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.heroes = []; p1.heroes = []; // izolovat rozhodování bez vlivu náhodně přiřazených hrdinů
  const tiles = inPlayTiles(game);
  tiles[0].color = 'B';
  p0.currentTileId = tiles[0].id;
  p0.tilesPool = { R: 0, G: 0, Y: 0, B: 0, S: 0 }; // nic nevlastní -> nic není "vlastněná barva"
  p1.playedThisRound = []; // Špionáž/modrá by beztak nic zvláštního nezískala
  p0.playedThisRound = [];
  p0.hand = [{ id: 'lastcard', color: 'N', value: 4 }];
  p1.playedThisRound = [mkEntry('N', 20)]; // beznadějný náskok soupeře
  const action = withPinnedRandom(0.5, () => botDecideAction(game, p0, false));
  check('Poslední bezcenná karta v beznadějném kole se radši nechá na ruce (pass)', action.type === 'pass');
}

// --- 2b: pokud tu samou poslední kartu JDE banknout (jde do bodů), bot ji má banknout, ne passnout.
function testLastCardBankableBanks() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.heroes = []; p1.heroes = []; // izolovat rozhodování bez vlivu náhodně přiřazených hrdinů
  const tiles = inPlayTiles(game);
  tiles[0].color = 'R';
  p0.currentTileId = tiles[0].id;
  p0.tilesPool = { R: 1, G: 0, Y: 0, B: 0, S: 0 }; // R je vlastněná barva -> vždy bankovatelná
  p0.playedThisRound = [];
  p0.hand = [{ id: 'lastcard2', color: 'R', value: 4 }];
  p1.playedThisRound = [mkEntry('N', 20)]; // beznadějný náskok soupeře
  const action = withPinnedRandom(0.5, () => botDecideAction(game, p0, false));
  check('Poslední kartu jde-li banknout, bot ji bankne místo passu', action.type === 'bank' && action.cardId === 'lastcard2');
}

// --- 3: vytlačený hráč (sdílel pole s vítězem kola) musí za přesun na nové (obsazené) pole
// zaplatit stejnou cenu jako při běžném vstupu - kartu z ruky, nebo 3 z balíčku.
async function testDisplacedPlayerPaysEntryCost() {
  const game = {
    __gid: uid('game'),
    players: [],
    tiles: [
      { id: 'tileA', color: 'R', status: 'inplay', ownerId: null, occupants: [] },
      { id: 'tileB', color: 'G', status: 'inplay', ownerId: null, occupants: [] },
    ],
    neutralDeck: freshNeutralDeck(),
    neutralDiscard: [],
    round: 3,
    startingPlayerIdx: 0,
    log: [],
    phase: 'round',
    winTiles: 99,
  };
  const winner = makePlayer(0, 'Winner', false, 'balanced');
  const displaced = makePlayer(1, 'Displaced', false, 'balanced');
  const occupantB = makePlayer(2, 'OccupantB', false, 'balanced');
  game.players = [winner, displaced, occupantB];
  game.heroFlags = freshHeroFlags();
  winner.currentTileId = 'tileA';
  displaced.currentTileId = 'tileA';
  occupantB.currentTileId = 'tileB';
  game.tiles[0].occupants = [winner.id, displaced.id];
  game.tiles[1].occupants = [occupantB.id];
  winner.playedThisRound = [mkEntry('N', 5)];
  displaced.playedThisRound = [mkEntry('N', 1)];
  occupantB.playedThisRound = [mkEntry('N', 1)];
  winner.hand = [];
  displaced.hand = [{ id: 'dcard', color: 'N', value: 4 }];
  occupantB.hand = [];

  await resolveRoundEnd(game, false);
  // Poznámka: resolveRoundEnd na konci ještě dobírá 2 karty všem přeživším hráčům, takže hand.length
  // samo o sobě není spolehlivý ukazatel zaplacení ceny (1 - 1 zaplacená + 2 dobrané = 2, stejně
  // jako kdyby cena vůbec nebyla zaplacena a jen dobral). Spolehlivé je sledovat konkrétní kartu
  // 'dcard' - ta musí zmizet z ruky a skončit v discard pilu, pokud byla použita jako platba za vstup.

  check('Vytlačený hráč skončil na jediném zbylém (obsazeném) poli', displaced.currentTileId === 'tileB');
  check('Vytlačený hráč zaplatil vstup svou (jedinou) kartou z ruky', !displaced.hand.some(c => c.id === 'dcard'));
  check('Zaplacená karta skončila v jeho discard pilu', displaced.discardPile.some(c => c.id === 'dcard'));
}

// --- 4: limit karet na ruce (10) se musí po dobrání na konci kola vynutit - přebytek se musí
// dobrovolně odhodit, dokud hráč není zpátky na limitu.
async function testHandLimitEnforced() {
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
    winTiles: 99,
  };
  const winner = makePlayer(0, 'Winner', false, 'balanced');
  const other = makePlayer(1, 'Other', false, 'balanced');
  game.players = [winner, other];
  game.heroFlags = freshHeroFlags();
  const tiles = inPlayTiles(game);
  winner.currentTileId = tiles[0].id;
  other.currentTileId = tiles[1].id;
  tiles[0].occupants.push(winner.id);
  tiles[1].occupants.push(other.id);
  winner.playedThisRound = [mkEntry('N', 5)];
  other.playedThisRound = [mkEntry('N', 1)];
  // "other" má už teď 9 karet na ruce - po dobrání 2 na konci kola bude mít 11, o 1 víc než limit.
  other.hand = [];
  for (let i = 0; i < 9; i++) other.hand.push({ id: uid('card'), color: 'N', value: 3 });
  // dost karet v balíčku, aby dobrání skutečně proběhlo
  other.drawPile = [];
  for (let i = 0; i < 5; i++) other.drawPile.push({ id: uid('card'), color: 'N', value: 3 });

  await resolveRoundEnd(game, false);

  check('Hráč nad limitem karet skončí přesně na limitu (10)', other.hand.length === HAND_LIMIT);
}

// --- 5: vstup na obsazené pole, když má hráč (člověk) k dispozici OBĚ platby (kartu z ruky i
// aspoň 3 karty v balíčku) - musí dostat na výběr (uiHumanChooseEntryPayment se zavolá), a podle
// jeho volby se zaplatí buď kartou z ruky, nebo 3 kartami z vrchu balíčku - ne automaticky jedno.
async function testEntryPaymentChoiceHand() {
  const game = {
    __gid: uid('game'), players: [], tiles: [
      { id: 'tA', color: 'R', status: 'inplay', ownerId: null, occupants: [] },
      { id: 'tB', color: 'G', status: 'inplay', ownerId: null, occupants: [] },
    ],
    neutralDeck: freshNeutralDeck(), neutralDiscard: [], round: 3, startingPlayerIdx: 0, log: [], phase: 'round',
  };
  const human = makePlayer(0, 'Human', true, 'human');
  const occ = makePlayer(1, 'Occ', false, 'balanced');
  game.players = [human, occ];
  game.heroFlags = freshHeroFlags();
  occ.currentTileId = 'tA';
  game.tiles[0].occupants = [occ.id];
  human.hand = [{ id: 'hcard', color: 'N', value: 3 }];
  human.drawPile = Array.from({ length: 5 }, (_, i) => ({ id: 'dk' + i, color: 'N', value: 2 }));

  __nextEntryPayment = 'hand';
  __entryPaymentPrompted = false;
  await placeOnTile(game, human, 'tA', false);
  check('Člověk s oběma možnostmi dostane skutečnou volbu (je dotázán)', __entryPaymentPrompted === true);
  check('Volba "hand": karta z ruky zmizela', human.hand.length === 0);
  check('Volba "hand": karta skončila v discardu', human.discardPile.some(c => c.id === 'hcard'));
  check('Volba "hand": balíček zůstal nedotčen', human.drawPile.length === 5);
}

// --- 6: stejná situace, ale hráč zvolí platbu z balíčku - v ruce mu karta zůstane, z balíčku
// zmizí přesně 3 vrchní karty do discardu.
async function testEntryPaymentChoiceDeck() {
  const game = {
    __gid: uid('game'), players: [], tiles: [
      { id: 'tA', color: 'R', status: 'inplay', ownerId: null, occupants: [] },
      { id: 'tB', color: 'G', status: 'inplay', ownerId: null, occupants: [] },
    ],
    neutralDeck: freshNeutralDeck(), neutralDiscard: [], round: 3, startingPlayerIdx: 0, log: [], phase: 'round',
  };
  const human = makePlayer(0, 'Human', true, 'human');
  const occ = makePlayer(1, 'Occ', false, 'balanced');
  game.players = [human, occ];
  game.heroFlags = freshHeroFlags();
  occ.currentTileId = 'tA';
  game.tiles[0].occupants = [occ.id];
  human.hand = [{ id: 'hcard2', color: 'N', value: 3 }];
  human.drawPile = Array.from({ length: 5 }, (_, i) => ({ id: 'dk2_' + i, color: 'N', value: 2 }));

  __nextEntryPayment = 'deck';
  __entryPaymentPrompted = false;
  await placeOnTile(game, human, 'tA', false);
  check('Volba "deck": karta v ruce zůstala', human.hand.some(c => c.id === 'hcard2'));
  check('Volba "deck": odhozeny přesně 3 karty z vrchu balíčku', human.discardPile.length === 3 && human.drawPile.length === 2);
}

// --- 7: bot s oběma možnostmi dostupnými se NEPTÁ (uiHumanChooseEntryPayment se nevolá) a defaultně
// platí kartou z ruky - beze změny dosavadního chování botů.
async function testEntryPaymentBotDefaultsToHand() {
  const game = {
    __gid: uid('game'), players: [], tiles: [
      { id: 'tA', color: 'R', status: 'inplay', ownerId: null, occupants: [] },
      { id: 'tB', color: 'G', status: 'inplay', ownerId: null, occupants: [] },
    ],
    neutralDeck: freshNeutralDeck(), neutralDiscard: [], round: 3, startingPlayerIdx: 0, log: [], phase: 'round',
  };
  const bot = makePlayer(0, 'Bot', false, 'balanced');
  const occ = makePlayer(1, 'Occ', false, 'balanced');
  game.players = [bot, occ];
  game.heroFlags = freshHeroFlags();
  occ.currentTileId = 'tA';
  game.tiles[0].occupants = [occ.id];
  bot.hand = [{ id: 'bcard', color: 'N', value: 3 }];
  bot.drawPile = Array.from({ length: 5 }, (_, i) => ({ id: 'bdk' + i, color: 'N', value: 2 }));

  __entryPaymentPrompted = false;
  await placeOnTile(game, bot, 'tA', false);
  check('Bot se neptá na volbu platby', __entryPaymentPrompted === false);
  check('Bot defaultně platí kartou z ruky', bot.hand.length === 0 && bot.drawPile.length === 5);
}

async function main() {
  testOneIsNotCheapFiller();
  testOneRescuesThreatenedCard();
  testLastCardHopelessPasses();
  testLastCardBankableBanks();
  await testDisplacedPlayerPaysEntryCost();
  await testHandLimitEnforced();
  await testEntryPaymentChoiceHand();
  await testEntryPaymentChoiceDeck();
  await testEntryPaymentBotDefaultsToHand();
  console.log(pass + ' PASS, ' + fail + ' FAIL');
  if (fail > 0) process.exit(1);
}

main();
