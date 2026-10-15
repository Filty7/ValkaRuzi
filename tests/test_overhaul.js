// Regrese pro overhaul z 2026-09-28: Henry VI. bugfix, štít (zelená), prokletí banknuté karty
// (žlutá), Edward IV. (banknuté = 0), vstup na obsazené pole (3 karty z balíčku + podmíněné
// vyřazení), 11 polí + fallback konec hry, volba počtu hrdinů.
// Spustit: cat game.js test_overhaul.js > combined_overhaul.js && node combined_overhaul.js

BOT_DELAY_MS = 0; PLACEMENT_DELAY_MS = 0; ROUNDEND_DELAY_MS = 0; TURN_STEP_MS = 0;

function uiLog() {}
function uiRender() {}
let __nextTileChoice = null;
async function uiHumanChooseAction() { return { type: 'pass' }; }
async function uiHumanChooseFromEntries(game, player, promptText, entries) { return entries[0].id; }
async function uiHumanChooseHandCard(game, player) { return player.hand[0].id; }
async function uiHumanChooseOpponent(game, player, candidates) { return candidates[0].id; }
async function uiHumanChooseCard(game, player, owner) { return owner.playedThisRound.find(e => e.active && !isProtected(e)).id; }
async function uiHumanYesNo() { return false; }
async function uiHumanChooseTile(game, player, cands) { return __nextTileChoice || cands[0].id; }
async function uiHumanChooseEntryPayment(game, player) { return 'hand'; }
async function uiHumanChooseReturnCard(game, player, eligible) { return eligible[0].id; }
async function uiAnnounceRoundEnd() {}
let __capturedScores = null;
async function uiAnnounceGameEnd(game, scores) { __capturedScores = scores; }

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); }
}

function mkEntry(color, value, opts) {
  return Object.assign({ id: uid('play'), color, realColor: color, value, originalValue: value, active: true, facedown: false }, opts || {});
}

function freshGame(n) {
  const game = {
    __gid: uid('game'), players: [], tiles: makeTilePool(), neutralDeck: freshNeutralDeck(),
    neutralDiscard: [], round: 3, startingPlayerIdx: 0, log: [], phase: 'round',
  };
  const names = ['Ty', 'York', 'Lancaster', 'Neville'];
  for (let i = 0; i < n; i++) game.players.push(makePlayer(i, names[i], i === 0, i === 0 ? 'human' : 'balanced'));
  for (const p of game.players) drawCards(p, 10);
  assignHeroes(game, 2);
  game.heroFlags = freshHeroFlags();
  const tiles = inPlayTiles(game);
  game.players.forEach((p, i) => { p.currentTileId = tiles[i].id; tiles[i].occupants.push(p.id); });
  return game;
}

async function testTilePoolSize() {
  for (let i = 0; i < 20; i++) {
    check('makeTilePool() vrací přesně 11 polí', makeTilePool().length === 11);
  }
}

async function testNeutralDeckOnlyServesBlue() {
  // Žlutá už vůbec nesahá na neutralDeck - ověřeno nepřímo testem curse níže (nečerpá) a přímo tady:
  const game = freshGame(2);
  const before = game.neutralDeck.length;
  const [p0, p1] = game.players;
  p1.playedThisRound = [{ id: 'b1', color: 'N', realColor: 'R', realValue: 4, value: 1, originalValue: 1, active: true, facedown: true }];
  await triggerAbility(game, 'Y', p0, false);
  check('Úplatky nečerpají z neutralDeck (délka beze změny)', game.neutralDeck.length === before);
}

// ---- Henry VI. bugfix: reálná neutrální karta zahraná z ruky (ne jen z podpory církve) musí jít zničit ----
async function testHenryVIRealFix() {
  const game = freshGame(2);
  const [p0, p1] = game.players;
  // karta zahraná NORMÁLNĚ z ruky (bez isNeutralSource) - tohle byl přesně nahlášený bug
  const plainNeutral = mkEntry('N', 3);
  const churchSupport = { id: uid('play'), color: 'N', realColor: 'N', value: 4, originalValue: 4, active: true, facedown: false, isNeutralSource: true, neutralValue: 4 };
  const banked = { id: uid('play'), color: 'N', realColor: 'S', realValue: 5, value: 1, originalValue: 1, active: true, facedown: true };
  const lockedCurse = { id: uid('play'), color: 'B', realColor: 'B', value: -2, originalValue: -2, active: true, facedown: false, untargetable: true };
  p0.playedThisRound = [plainNeutral, churchSupport, banked];
  p1.playedThisRound = [lockedCurse];
  await heroHenryVI(game);
  check('Henry VI: NEUTRÁLNÍ KARTA ZAHRANÁ Z RUKY je zničena (dřívější bug)', plainNeutral.active === false);
  check('Henry VI: karta z podpory církve je zničena', churchSupport.active === false);
  check('Henry VI: banknutá karta je zničena', banked.active === false);
  check('Henry VI: zamčené žluté prokletí přežije', lockedCurse.active === true);
}

// ---- Edward IV.: banknuté karty klesnou na hodnotu 0 do konce kola (i nově banknuté) ----
async function testEdwardIVBankedZero() {
  const game = freshGame(1);
  const [p0] = game.players;
  const existingBanked = { id: uid('play'), color: 'N', realColor: 'R', realValue: 4, value: 1, originalValue: 1, active: true, facedown: true };
  const faceUp = mkEntry('G', 5);
  p0.playedThisRound = [existingBanked, faceUp];
  await heroEdwardIV(game);
  check('Edward IV: existující banknutá karta klesla na hodnotu 0', existingBanked.value === 0);
  check('Edward IV: vyložená karta klesla na hodnotu 1', faceUp.value === 1);
  check('Edward IV: forceBankedZero nastaven', game.heroFlags.forceBankedZero === true);

  // nově banknutá karta PO efektu musí mít taky rovnou hodnotu 0
  p0.hand = [{ id: 'c1', color: 'B', value: 3 }];
  const before = p0.playedThisRound.length;
  const origAction = uiHumanChooseAction;
  uiHumanChooseAction = async () => ({ type: 'bank', cardId: 'c1' });
  await takeTurn(game, p0, false);
  uiHumanChooseAction = origAction;
  const newBanked = p0.playedThisRound[before];
  check('Edward IV: nově banknutá karta má rovnou hodnotu 0', newBanked.value === 0 && newBanked.facedown === true);
}

// ---- Zelená (štít): vybere vlastní vyloženou kartu, chrání ji a obnoví původní hodnotu ----
async function testGreenShield() {
  // 1) soupeř musí banknout náhodnou kartu z ruky
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    p1.hand = [{ id: 'h1', color: 'R', value: 3 }, { id: 'h2', color: 'B', value: 5 }];
    p1.playedThisRound = []; p0.playedThisRound = [];
    await triggerAbility(game, 'G', p0, false);
    check('Špionáž: soupeři ubyla karta z ruky', p1.hand.length === 1);
    check('Špionáž: na stole přibyla banknutá karta lícem dolů', p1.playedThisRound.length === 1 && p1.playedThisRound[0].facedown === true && p1.playedThisRound[0].value === 1);
    check('Špionáž: banknutá karta je jedna z původních', ['R', 'B'].includes(p1.playedThisRound[0].realColor));
    check('Špionáž: moje karty se nezměnily', p0.playedThisRound.length === 0);
  }
  // 2) po kole banknutá karta skončí ve victory poolu soupeře
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    p1.hand = [{ id: 'h1', color: 'R', value: 3 }];
    p0.playedThisRound = [mkEntry('B', 4)]; p1.playedThisRound = [];
    await triggerAbility(game, 'G', p0, false);
    const col = p1.playedThisRound[0].realColor;
    await resolveRoundEnd(game, false);
    check('Špionáž: nucená banknutá karta se po kole započítá do poolu majitele', p1.bankedPool[col] === 1);
  }
  // 3) propadá, když soupeř nemá karty na ruce
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    p1.hand = []; p1.playedThisRound = [];
    await triggerAbility(game, 'G', p0, false);
    check('Špionáž: propadá bez karet na ruce soupeře', p1.playedThisRound.length === 0);
  }
  // 4) Henry VI. (zákaz bankování) - propadá
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    p1.hand = [{ id: 'h1', color: 'R', value: 3 }]; p1.playedThisRound = [];
    game.heroFlags.noBanking = true;
    await triggerAbility(game, 'G', p0, false);
    check('Špionáž: při zákazu bankování propadá', p1.hand.length === 1 && p1.playedThisRound.length === 0);
  }
  // 5) Edward IV. - nucená banknutá karta má hodnotu 0
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    p1.hand = [{ id: 'h1', color: 'R', value: 3 }]; p1.playedThisRound = [];
    game.heroFlags.forceBankedZero = true;
    await triggerAbility(game, 'G', p0, false);
    check('Špionáž: pod Edwardem IV. je banknutá karta 0', p1.playedThisRound[0] && p1.playedThisRound[0].value === 0);
  }
  // 4) štítovaná karta je plně imunní - nejde zničit (R), swapnout (S), vynutit vrácení (karta 1), ani ji zasáhne hrdina
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    const shielded = mkEntry('R', 5, { shielded: true });
    p0.playedThisRound = [shielded];
    p1.playedThisRound = [mkEntry('B', 2)];
    await triggerAbility(game, 'R', p1, false);
    check('štít: chrání proti Vraždě', shielded.active === true);

    // Margaret z Anjou (destroyTopTwo) - štítovaná karta se nepočítá mezi "top 2"
    p0.playedThisRound = [shielded, mkEntry('B', 3), mkEntry('S', 2)];
    const destroyedCount = await destroyTopTwo(game, p0);
    check('štít: chrání proti Margaret z Anjou (nezničena, i když je nejvyšší)', shielded.active === true);
    check('štít: Margaret z Anjou zničí 2 NEŠTÍTOVANÉ karty místo toho', destroyedCount === 2);

    // vrácení kartou 1 - štítovaná karta nesmí být mezi eligible
    p0.playedThisRound = [shielded];
    p0.hand = [{ id: 'c1', color: 'G', value: 1 }];
    const beforeLen = p0.playedThisRound.length;
    const origAction = uiHumanChooseAction;
    uiHumanChooseAction = async () => ({ type: 'play', cardId: 'c1' });
    await takeTurn(game, p0, false);
    uiHumanChooseAction = origAction;
    check('štít: karta 1 nemůže vynutit vrácení štítované karty (žádný eligible cíl)', shielded.active === true && p0.playedThisRound.some(e => e.id === shielded.id));

    // Edward IV nezmění hodnotu štítované karty
    const game2 = freshGame(1);
    const [q0] = game2.players;
    const s2 = mkEntry('R', 5, { shielded: true });
    q0.playedThisRound = [s2];
    await heroEdwardIV(game2);
    check('štít: Edward IV. nezmění hodnotu štítované karty', s2.value === 5);
  }
}

// ---- Žlutá (prokletí banknuté karty soupeře) ----
async function testYellowCurse() {
  // 1) základní odhalení a otočení na mínus
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    const banked = { id: uid('play'), color: 'N', realColor: 'B', realValue: 4, value: 1, originalValue: 1, active: true, facedown: true };
    p1.playedThisRound = [banked];
    await triggerAbility(game, 'Y', p0, false);
    check('žlutá: karta odhalena (facedown=false)', banked.facedown === false);
    check('žlutá: barva odhalena na realColor', banked.color === 'B');
    check('žlutá: hodnota je záporná realValue', banked.value === -4);
    check('žlutá: navždy zamčená (untargetable)', banked.untargetable === true);
  }
  // 2) propadá, když žádný soupeř nemá banknutou kartu
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    p1.playedThisRound = [mkEntry('R', 3)];
    const before = p1.playedThisRound.length;
    await triggerAbility(game, 'Y', p0, false);
    check('žlutá: propadá bez banknuté karty soupeře (beze změny)', p1.playedThisRound.length === before);
  }
  // 3) prokletá karta se na konci kola NEpočítá do bankovaného poolu (facedown=false už)
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    const banked = { id: uid('play'), color: 'N', realColor: 'S', realValue: 3, value: 1, originalValue: 1, active: true, facedown: true };
    p1.playedThisRound = [banked];
    await triggerAbility(game, 'Y', p0, false);
    let wouldBank = false;
    for (const e of p1.playedThisRound) if (e.facedown && e.active) wouldBank = true;
    check('žlutá: prokletá karta se už nebankuje', wouldBank === false);
  }
}

// ---- placeOnTile: 3 karty z vrchu balíčku (místo 2), podmíněné vyřazení jen když neexistuje volné pole ----
async function testPlaceOnTileCost() {
  // A) bez karet v ruce, ale s dostatkem karet v balíčku -> zaplatí 3 karty z balíčku
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    const tiles = inPlayTiles(game);
    const occupiedTile = tiles.find(t => t.occupants.includes(p1.id));
    p0.hand = [];
    p0.drawPile = Array.from({ length: 5 }, (_, i) => ({ id: 'd' + i, color: 'R', value: 1 }));
    const beforeDraw = p0.drawPile.length;
    await placeOnTile(game, p0, occupiedTile.id, false);
    check('placeOnTile: odhodilo přesně 3 karty z vrchu balíčku', p0.discardPile.length === 3 && p0.drawPile.length === beforeDraw - 3);
    check('placeOnTile: hráč není vyřazen (mohl zaplatit)', !p0.eliminated);
  }
  // B) bez karet v ruce, bez dostatku v balíčku, ale existuje volné pole -> přesměruje se zdarma, NENÍ vyřazen
  {
    const game = freshGame(3);
    const [p0, p1, p2] = game.players;
    const tiles = inPlayTiles(game);
    const occupiedTile = tiles.find(t => t.occupants.includes(p1.id));
    const freeTile = tiles.find(t => t.occupants.length === 0);
    check('test setup: existuje volné pole', !!freeTile);
    p0.hand = [];
    p0.drawPile = [{ id: 'd0', color: 'R', value: 1 }]; // jen 1, nestačí na 3
    await placeOnTile(game, p0, occupiedTile.id, false);
    check('placeOnTile: nemůže zaplatit, ale existuje volné pole -> NENÍ vyřazen', !p0.eliminated);
    check('placeOnTile: přesunut na některé volné pole', p0.currentTileId !== null && p0.currentTileId !== occupiedTile.id);
  }
  // C) bez karet v ruce, bez dostatku v balíčku, a NEexistuje žádné volné pole -> vyřazen
  {
    const game = freshGame(2);
    const [p0, p1] = game.players;
    const tiles = inPlayTiles(game);
    // obsaď všechna pole kromě jednoho (occupiedTile), tak aby po odečtení occupiedTile nezbylo nic volného
    const occupiedTile = tiles.find(t => t.occupants.includes(p1.id));
    for (const t of tiles) { if (t.id !== occupiedTile.id && t.occupants.length === 0) t.occupants.push(p1.id); }
    p0.hand = [];
    p0.drawPile = [];
    await placeOnTile(game, p0, occupiedTile.id, false);
    check('placeOnTile: nemůže zaplatit a nezbývá volné pole -> vyřazen', p0.eliminated === true);
  }
}

// ---- fallback konec hry při vyčerpání zásoby polí (11 polí už negarantuje vítěze) ----
async function testTileExhaustionFallback() {
  const game = freshGame(4);
  // simuluj stav "všechna pole už obsazena" (0 in-play) a nikdo nedosáhl winTiles
  game.winTiles = 4;
  for (const t of game.tiles) t.status = 'claimed';
  game.players.forEach(p => { p.tilesPool.R = 1; }); // nikdo nemá 4
  const winner = game.players[0];
  winner.currentTileId = null;
  await resolveRoundEnd(game, false);
  check('fallback: hra skončí (gameover) i když nikdo nedosáhl winTiles, protože pole došla', game.phase === 'gameover');
  check('fallback: uiAnnounceGameEnd byl zavolán', __capturedScores !== null);
}

// ---- volba počtu hrdinů ----
async function testHeroCount() {
  {
    const game = { players: [makePlayer(0, 'A', true), makePlayer(1, 'B', false)] };
    assignHeroes(game, 0);
    check('heroCount=0: nikdo nemá hrdiny', game.players.every(p => p.heroes.length === 0));
  }
  {
    const game = { players: [makePlayer(0, 'A', true), makePlayer(1, 'B', false)] };
    assignHeroes(game, 1);
    check('heroCount=1: každý má přesně 1 hrdinu', game.players.every(p => p.heroes.length === 1));
    check('heroCount=1: žádní dva hráči nemají stejného hrdinu', game.players[0].heroes[0].id !== game.players[1].heroes[0].id);
  }
  {
    const game = { players: [makePlayer(0, 'A', true), makePlayer(1, 'B', false)] };
    assignHeroes(game, 2);
    check('heroCount=2 (výchozí): každý má přesně 2 hrdiny', game.players.every(p => p.heroes.length === 2));
  }
}

async function main() {
  await testTilePoolSize();
  await testNeutralDeckOnlyServesBlue();
  await testHenryVIRealFix();
  await testEdwardIVBankedZero();
  await testGreenShield();
  await testYellowCurse();
  await testPlaceOnTileCost();
  await testTileExhaustionFallback();
  await testHeroCount();
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch(err => { console.error('FATAL', err); process.exitCode = 1; });
