// Cílené testy efektů všech 8 hrdinů, přímo na engine úrovni (bez DOM).
// Spustit: cat game.js test_heroes.js > combined_heroes_test.js && node combined_heroes_test.js

BOT_DELAY_MS = 0; PLACEMENT_DELAY_MS = 0; ROUNDEND_DELAY_MS = 0; TURN_STEP_MS = 0;

function uiLog() {}
function uiRender() {}

let __nextAction = null;
async function uiHumanChooseAction(game, player) { return __nextAction; }
async function uiHumanChooseFromEntries(game, player, promptText, entries) { return entries[0].id; }
async function uiHumanChooseHandCard(game, player, promptText) { return player.hand[0].id; }
async function uiHumanChooseOpponent(game, player, candidates) { return candidates[0].id; }
async function uiHumanChooseCard(game, player, owner) { return owner.playedThisRound.find(e => e.active && !e.untargetable).id; }
async function uiHumanYesNo() { return false; }
async function uiHumanChooseTile(game, player, cands) { return cands[0].id; }
async function uiHumanChooseEntryPayment(game, player) { return 'hand'; }
async function uiHumanChooseReturnCard(game, player, eligible) { return eligible[0].id; }
async function uiAnnounceRoundEnd() {}
async function uiAnnounceGameEnd() {}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
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
  const names = ['Ty', 'York', 'Lancaster', 'Neville'];
  for (let i = 0; i < n; i++) game.players.push(makePlayer(i, names[i], i === 0, i === 0 ? 'human' : 'balanced'));
  for (const p of game.players) drawCards(p, 10);
  assignHeroes(game);
  game.heroFlags = freshHeroFlags();
  const tiles = inPlayTiles(game);
  game.players.forEach((p, i) => { p.currentTileId = tiles[i].id; tiles[i].occupants.push(p.id); });
  return game;
}

function mkEntry(color, value, opts) {
  return Object.assign({ id: uid('play'), color, realColor: color, value, active: true, facedown: false }, opts || {});
}

async function testYork() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.playedThisRound = [mkEntry('R', 5), mkEntry('B', 2)];
  p1.playedThisRound = [mkEntry('G', 6), mkEntry('S', 3)];
  await heroDestroyAndBanRange(game, 4, 6, 'Richard z Yorku');
  check('York: zničena p0 karta hodnoty 5', p0.playedThisRound[0].active === false);
  check('York: p0 karta hodnoty 2 přežila', p0.playedThisRound[1].active === true);
  check('York: zničena p1 karta hodnoty 6', p1.playedThisRound[0].active === false);
  check('York: p1 karta hodnoty 3 přežila', p1.playedThisRound[1].active === true);
  check('York: rozsah 4-6 je zakázaný, 3 ne', heroValueBanned(game, 5) === true && heroValueBanned(game, 3) === false);

  p0.playedThisRound.push(mkEntry('N', 1, { facedown: true, realColor: 'B', realValue: 5 }));
  p0.playedThisRound.push(mkEntry('N', 5, { isNeutralSource: true, neutralValue: 5, untargetable: true }));
  await heroDestroyAndBanRange(game, 4, 6, 'York znovu');
  check('York: banknutá karta (zobrazená jako 1) není zasažena rozsahem 4-6', p0.playedThisRound[2].active === true);
  check('York: zamčený (untargetable) žlutý úplatek v rozsahu 4-6 přežije - chráněný proti všem efektům', p0.playedThisRound[3].active === true);

  // hráč nesmí zahrát zakázanou hodnotu lícem nahoru, ale bankovat ano
  p0.hand = [{ id: 'c1', color: 'R', value: 5 }];
  __nextAction = { type: 'play', cardId: 'c1' };
  const beforeLen = p0.playedThisRound.length;
  await takeTurn(game, p0, false);
  check('York: pokus zahrát zakázanou hodnotu je odmítnut (pass, karta zůstává v ruce)', p0.hand.length === 1 && p0.playedThisRound.length === beforeLen && p0.passedThisRound === true);
  p0.passedThisRound = false;
  __nextAction = { type: 'bank', cardId: 'c1' };
  await takeTurn(game, p0, false);
  check('York: stejnou kartu jde banknout', p0.hand.length === 0 && p0.playedThisRound.length === beforeLen + 1 && p0.playedThisRound[beforeLen].facedown === true);
}

async function testEdmund() {
  const game = freshGame(1);
  const [p0] = game.players;
  p0.playedThisRound = [mkEntry('R', 3), mkEntry('B', 5)];
  await heroDestroyAndBanRange(game, 2, 4, 'Edmund Beaufort');
  check('Edmund: zničena karta hodnoty 3', p0.playedThisRound[0].active === false);
  check('Edmund: karta hodnoty 5 přežila (mimo rozsah 2-4)', p0.playedThisRound[1].active === true);
}

async function testEdwardIV() {
  const game = freshGame(1);
  const [p0] = game.players;
  p0.playedThisRound = [mkEntry('R', 5), mkEntry('N', -3, { isNeutralSource: true, neutralValue: 3, untargetable: true })];
  await heroEdwardIV(game);
  check('Edward IV: existující karta má nyní hodnotu 1', p0.playedThisRound[0].value === 1);
  check('Edward IV: zamčený žlutý úplatek si drží svou hodnotu (untargetable, immune)', p0.playedThisRound[1].value === -3);
  check('Edward IV: forceValueOne nastaven', game.heroFlags.forceValueOne === true);

  p0.hand = [{ id: 'c1', color: 'G', value: 4 }];
  __nextAction = { type: 'play', cardId: 'c1' };
  await takeTurn(game, p0, false);
  const newEntry = p0.playedThisRound[p0.playedThisRound.length - 1];
  check('Edward IV: nově zahraná karta (reálně 4) má vyloženou hodnotu 1', newEntry.value === 1);
}

async function testHenryVI() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  p0.playedThisRound = [mkEntry('N', 4, { isNeutralSource: true, neutralValue: 4 }), mkEntry('N', 1, { facedown: true, realColor: 'S', realValue: 6 })];
  p1.playedThisRound = [mkEntry('N', -3, { isNeutralSource: true, neutralValue: 3, untargetable: true })];
  await heroHenryVI(game);
  check('Henry VI: zničena neutrální bonus karta p0', p0.playedThisRound[0].active === false);
  check('Henry VI: zničena banknutá karta p0', p0.playedThisRound[1].active === false);
  check('Henry VI: zamčená (untargetable) žlutá debuff karta p1 přežije - žlutá je chráněná proti všem efektům', p1.playedThisRound[0].active === true);
  check('Henry VI: noNeutralCards i noBanking nastaveny', game.heroFlags.noNeutralCards === true && game.heroFlags.noBanking === true);

  // žlutá/modrá schopnost má propadnout (žádná nová neutrální karta), špionáž má propadnout taky
  const beforeY = p1.playedThisRound.length;
  await triggerAbility(game, 'Y', p0, false);
  check('Henry VI: žlutá schopnost propadá, nepřidá novou kartu', p1.playedThisRound.length === beforeY);
  const beforeB = p0.playedThisRound.length;
  await triggerAbility(game, 'B', p0, false);
  check('Henry VI: modrá schopnost propadá, nepřidá novou kartu', p0.playedThisRound.length === beforeB);
  const beforeHand = p0.hand.length;
  const beforePlayed = p0.playedThisRound.length;
  await triggerAbility(game, 'G', p0, false);
  check('Henry VI: špionáž propadá, nebankuje ani netáhne', p0.hand.length === beforeHand && p0.playedThisRound.length === beforePlayed);

  // pokus bankovat kartou je odmítnut
  p0.hand = [{ id: 'c1', color: 'R', value: 3 }];
  __nextAction = { type: 'bank', cardId: 'c1' };
  await takeTurn(game, p0, false);
  check('Henry VI: pokus bankovat je odmítnut (pass)', p0.hand.length === 1 && p0.passedThisRound === true);

  // regrese: pokus zahrát bezbarvou (N) kartu lícem nahoru je odmítnut, i když hodnota není v žádném banRanges
  p0.passedThisRound = false;
  p0.hand = [{ id: 'c2', color: 'N', value: 3 }];
  const beforePlayedN = p0.playedThisRound.length;
  __nextAction = { type: 'play', cardId: 'c2' };
  await takeTurn(game, p0, false);
  check('Henry VI: pokus zahrát bezbarvou kartu lícem nahoru je odmítnut (pass, karta zůstává v ruce)',
    p0.hand.length === 1 && p0.playedThisRound.length === beforePlayedN && p0.passedThisRound === true);
  check('Henry VI: cardPlayBanned označí bezbarvou kartu jako zakázanou', cardPlayBanned(game, { color: 'N', value: 3 }) === true);
  check('Henry VI: cardPlayBanned nechá barevnou kartu mimo banRanges hratelnou', cardPlayBanned(game, { color: 'R', value: 3 }) === false);
}

async function testCecily() {
  const game = freshGame(3);
  const [p0, p1, p2] = game.players;
  p2.passedThisRound = true; // p2 už dřív passnul, neměl by dostat "poslední tah"
  await heroCecily(game, p0);
  check('Cecily: lastCallIds obsahuje p0 i p1', game.heroFlags.lastCallIds.has(p0.id) && game.heroFlags.lastCallIds.has(p1.id));
  check('Cecily: lastCallIds neobsahuje už dřív passnutého p2', !game.heroFlags.lastCallIds.has(p2.id));
}

// Regrese: sesilatel Cecily musí dostat úplně stejný "jeden tah navíc" jako všichni ostatní -
// tedy AŽ po tom, co na "poslední tah" dojde na všechny ostatní - a ne být donucen passnout hned
// v tom samém tahu, kdy Cecily zahrál (to byla ta nahlášená chyba).
async function testCecilyCasterGetsExtraTurnLast() {
  const game = freshGame(4);
  const [p0, p1, p2, p3] = game.players;

  // Boti vždy jen zahrají první kartu z ruky - ať test nezávisí na AI rozhodování ani na tom,
  // jestli náhodou dostali vlastního hrdinu, kterého by sami chtěli zahrát.
  const origBotDecide = botDecideAction;
  botDecideAction = (g, player) => ({ type: 'play', cardId: player.hand[0].id });

  p0.heroes = [{ id: 'cecily', used: false }];
  const origChooseAction = uiHumanChooseAction;
  let p0Turns = 0;
  uiHumanChooseAction = async (g, player) => {
    p0Turns++;
    if (p0Turns === 1) return { type: 'hero', heroId: 'cecily' };
    return { type: 'play', cardId: player.hand[0].id };
  };

  const origTakeTurn = takeTurn;
  const order = [];
  takeTurn = async (g, player, isFirstRound) => {
    order.push(player.name);
    return origTakeTurn(g, player, isFirstRound);
  };

  try {
    await playRound(game);
  } finally {
    botDecideAction = origBotDecide;
    uiHumanChooseAction = origChooseAction;
    takeTurn = origTakeTurn;
  }

  check('Cecily: pořadí tahů je Ty, York, Lancaster, Neville, Ty (sesilatel naposled)',
    order.join(',') === 'Ty,York,Lancaster,Neville,Ty');
  check('Cecily: sesilatel (Ty) skutečně dostal dva tahy - zahrání hrdiny a pak jeden navíc', p0Turns === 2);
}

async function testMargaretAnjou() {
  const game = freshGame(1);
  const [p0] = game.players;
  // 4 karty: 6,5,5,3 -> nejvyšší dvě je jednoznačně 6 a 5, ale 5 je mezi dvěma kartami stejné
  // hodnoty -> majitel (human) volí, kterou z nich (stub vždy vybere první z nabídky).
  const c6 = mkEntry('R', 6);
  const c5a = mkEntry('B', 5);
  const c5b = mkEntry('S', 5);
  const c3 = mkEntry('G', 3);
  p0.playedThisRound = [c6, c5a, c5b, c3];
  const destroyed = await destroyTopTwo(game, p0);
  check('Margaret z Anjou: zničeny přesně 2 karty', destroyed === 2);
  check('Margaret z Anjou: nejvyšší karta (6) zničena', c6.active === false);
  check('Margaret z Anjou: karta hodnoty 3 přežila', c3.active === true);
  const fiveActive = [c5a, c5b].filter(e => e.active).length;
  check('Margaret z Anjou: přesně jedna z dvojice pětek přežila (výběr majitele)', fiveActive === 1);

  // hráč s méně než 2 kartami: zničí, co má
  const game2 = freshGame(1);
  const [q0] = game2.players;
  q0.playedThisRound = [mkEntry('R', 4)];
  const destroyed2 = await destroyTopTwo(game2, q0);
  check('Margaret z Anjou: s jedinou kartou zničí jen tu jednu', destroyed2 === 1 && q0.playedThisRound[0].active === false);
}

async function testNeville() {
  const game = freshGame(3);
  const [p0, p1, p2] = game.players;
  p0.playedThisRound = [mkEntry('R', 2)];
  p1.playedThisRound = [mkEntry('R', 8)];
  p2.playedThisRound = [mkEntry('R', 5)];
  let ranked = rankPlayers(game);
  check('Neville: bez efektu vyhrává nejvyšší součet (p1)', ranked[0].id === p1.id);
  await heroNeville(game);
  ranked = rankPlayers(game);
  check('Neville: po efektu vyhrává nejnižší součet (p0)', ranked[0].id === p0.id);
  check('Neville: pořadí zbytku je taky obrácené (p2 před p1)', ranked[1].id === p2.id && ranked[2].id === p1.id);
}

async function testMargaretBeaufort() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  const myTile = findTile(game, p0.currentTileId);
  myTile.color = 'R';

  await heroMargaretBeaufort(game);
  check('Příměří: noAbilities je nastaveno', game.heroFlags.noAbilities === true);

  // schopnost propadá i mimo žeton, i když by jinak měla platný cíl
  p1.playedThisRound = [mkEntry('R', 4)];
  await triggerAbility(game, 'R', p0, false);
  check('Příměří: vražda propadá, cíl přežije', p1.playedThisRound[0].active === true);

  // pravidlo vracení karty s hodnotou 1 je taky zrušené
  p0.hand = [{ id: 'c1', color: 'R', value: 1 }];
  p0.playedThisRound = [mkEntry('R', 5)];
  __nextAction = { type: 'play', cardId: 'c1' };
  await takeTurn(game, p0, false);
  check('Příměří: karta 1 nevrací žádnou kartu na ruku',
    p0.hand.length === 0 && p0.playedThisRound.length === 2 && p0.playedThisRound.every(e => e.active));

  // žeton přízně se ani nemá nabízet, i kdyby ho hráč chtěl použít
  const origYesNo = uiHumanYesNo;
  uiHumanYesNo = async () => true;
  p0.hand = [{ id: 'c2', color: 'B', value: 3 }];
  const favorBefore = p0.favorTokens;
  __nextAction = { type: 'play', cardId: 'c2' };
  await takeTurn(game, p0, false);
  check('Příměří: žeton přízně se nespotřebuje, ani když by ho hráč chtěl použít', p0.favorTokens === favorBefore);
  uiHumanYesNo = origYesNo;

  // samotné bankování zůstává povolené
  p0.hand = [{ id: 'c3', color: 'G', value: 4 }];
  const playedBefore = p0.playedThisRound.length;
  __nextAction = { type: 'bank', cardId: 'c3' };
  await takeTurn(game, p0, false);
  check('Příměří: bankování zůstává povolené',
    p0.playedThisRound.length === playedBefore + 1 && p0.playedThisRound[p0.playedThisRound.length - 1].facedown === true);
}

async function main() {
  await testYork();
  await testEdmund();
  await testEdwardIV();
  await testHenryVI();
  await testCecily();
  await testCecilyCasterGetsExtraTurnLast();
  await testMargaretAnjou();
  await testNeville();
  await testMargaretBeaufort();
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch(err => { console.error('FATAL', err); process.exitCode = 1; });
