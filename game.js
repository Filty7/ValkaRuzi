// ===================== VÁLKA RŮŽÍ — herní engine =====================

const COLORS = ['R', 'G', 'Y', 'B', 'S'];
const HAND_LIMIT = 10;
const COLOR_NAME = { R: 'Červená', G: 'Zelená', Y: 'Žlutá', B: 'Modrá', S: 'Šedá', N: 'Neutrální' };
const COLOR_ABILITY_NAME = { R: 'Vražda', G: 'Špionáž', Y: 'Úplatky', B: 'Podpora církve', S: 'Svatba' };
const COLOR_ABILITY_DESC = {
  R: 'Vyber soupeře a znič jednu jeho vyloženou (lícem nahoru) kartu.',
  G: 'Vyber soupeře: musí hned uschovat do truhly náhodnou kartu ze své ruky (vezmeš mu ji vslepo a položíš lícem dolů). Karta se mu sečte jako karta v truhle a na konci kola půjde do jeho panství.',
  Y: 'Vyber soupeřovu kartu v truhle, odhal ji a otoč na mínus - karta se navždy zamkne se zápornou hodnotou.',
  B: 'Lízni si vrchní kartu z neutrálního balíčku a přidej si její hodnotu do součtu kola.',
  S: 'Vyber soupeře a prohoďte si po jedné vyložené kartě (svatba).',
};

let uidCounter = 0;
function uid(prefix) { uidCounter += 1; return `${prefix}_${uidCounter}`; }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let BOT_DELAY_MS = 450;
let PLACEMENT_DELAY_MS = 220;
let ROUNDEND_DELAY_MS = 260;
let TURN_STEP_MS = 900; // tempo hry: jak dlouho "svítí" indikátor zahrané karty / schopnosti / vrácení
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// Na chvíli označí dané playedThisRound záznamy vizuálním příznakem (viz ui.js cardEl "flash" opt),
// překreslí a počká, pak příznak zase smaže. Používá se k tomu, aby šlo vidět "co se právě stalo"
// (zahraná karta, zásah schopností, vrácení karty na ruku...) v jasně oddělených krocích, ne
// všechno najednou. V headless testech je TURN_STEP_MS nastaven na 0, takže žádné reálné čekání.
async function flashEntries(game, entries, cls, ms) {
  const list = (entries || []).filter(Boolean);
  if (list.length === 0) return;
  for (const e of list) e.uiFlash = cls;
  uiRender(game);
  await sleep(ms == null ? TURN_STEP_MS : ms);
  for (const e of list) e.uiFlash = null;
}

// Stejný princip, ale pro hrdinu právě vyloženého do "play area" hráče (viz player.activeHeroThisRound).
async function flashHero(game, player, cls, ms) {
  if (!player.activeHeroThisRound) return;
  player.activeHeroThisRound.uiFlash = cls;
  uiRender(game);
  await sleep(ms == null ? TURN_STEP_MS : ms);
  player.activeHeroThisRound.uiFlash = null;
}

function freshDeck() {
  const deck = [];
  for (const c of COLORS) {
    for (let v = 1; v <= 5; v++) deck.push({ id: uid('card'), color: c, value: v });
  }
  for (let v = 0; v <= 6; v++) deck.push({ id: uid('card'), color: 'N', value: v });
  return shuffle(deck);
}

function makeTilePool() {
  const pool = [];
  for (const c of COLORS) {
    for (let i = 0; i < 3; i++) pool.push({ id: uid('tile'), color: c });
  }
  shuffle(pool);
  // 11 polí pro obě varianty (3 i 4 hráči) - pozor, tohle už matematicky NEGARANTUJE, že někdo
  // dosáhne vítězného počtu polí dřív, než se zásoba vyčerpá (4 hráči × 3 pole = 12 > 11, 3 hráči ×
  // 4 pole = 12 > 11) - viz fallback konec hry při vyčerpání zásoby v resolveRoundEnd().
  return pool.slice(0, 11).map(t => ({
    id: t.id, color: t.color, status: 'inplay', ownerId: null, occupants: []
  }));
}

function emptyColorMap() { return { R: 0, G: 0, Y: 0, B: 0, S: 0, N: 0 }; }

function freshNeutralDeck() {
  // 16 neutrálních karet, nový poměr: 7x3, 5x4, 4x5. Tenhle balíček teď slouží výhradně modré
  // schopnosti (Podpora církve) - žlutá (Úplatky) z něj po přepracování už vůbec nečerpá.
  const vals = [3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5];
  return shuffle(vals.map(v => ({ id: uid('neutral'), value: v })));
}

function drawNeutralCard(game) {
  if (game.neutralDeck.length === 0) {
    if (game.neutralDiscard.length === 0) return { id: uid('neutral'), value: 0 };
    game.neutralDeck = shuffle(game.neutralDiscard);
    game.neutralDiscard = [];
  }
  return game.neutralDeck.pop();
}

function makePlayer(seat, name, isHuman, strategyType, genome, difficulty) {
  return {
    id: uid('player'),
    seat,
    name,
    isHuman,
    strategyType: strategyType || 'balanced', // jen štítek pro UI/log/diagnostiku - rozhodovací logika čte player.genome, ne tohle
    genome: clampGenome(genome || GENOME_DEFAULT),
    difficulty: (difficulty == null) ? 100 : difficulty, // 0-100, viz withDifficulty výše
    hand: [],
    drawPile: freshDeck(),
    discardPile: [],
    playedThisRound: [],
    bankedPool: emptyColorMap(),
    tilesPool: emptyColorMap(),
    smart: !isHuman, // chytřejší vrstva rozhodování botů (viz smart* funkce); benchmarky ji přepínají ručně
    favorTokens: 3,
    currentTileId: null,
    passedThisRound: false,
    activeHeroThisRound: null, // hrdina vyložený tento hráčem toto kolo (viditelný v play area, viz ui.js)
  };
}

function drawCards(player, n) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (player.drawPile.length === 0) break;
    player.hand.push(player.drawPile.pop());
    drawn++;
  }
  return drawn;
}

// Limit karet na ruce je HAND_LIMIT (10). Pokud hráč po dobírání na začátku kola přesáhne limit
// (typicky když si předchozí kola šetřil a nehrál/nebankoval moc karet), musí dobrovolně odhodit
// přebytek, dokud není zpátky na limitu - jinak by ruka mohla neomezeně růst.
async function enforceHandLimit(game, player) {
  while (player.hand.length > HAND_LIMIT) {
    let discardId;
    if (player.isHuman) {
      discardId = await uiHumanChooseHandCard(game, player, `Máš víc než ${HAND_LIMIT} karet na ruce (limit je ${HAND_LIMIT}) — vyber kartu k odhození.`);
    } else {
      discardId = botLowestCardId(player.hand);
    }
    const idx = player.hand.findIndex(c => c.id === discardId);
    if (idx < 0) break; // pojistka proti nekonečné smyčce, kdyby vrácené id neexistovalo
    const [card] = player.hand.splice(idx, 1);
    player.discardPile.push(card);
    uiLog(`${player.name} má víc než ${HAND_LIMIT} karet na ruce a odhazuje.`, 'muted');
  }
}

function roundSum(player) {
  return player.playedThisRound
    .filter(e => e.active)
    .reduce((s, e) => s + e.value, 0);
}

function tilesTotal(player) {
  return COLORS.reduce((s, c) => s + player.tilesPool[c], 0);
}

function finalScore(player) {
  // Každé vlastněné pole je samo o sobě 1 bod, plus násobek karet v truhle té barvy:
  // pole × (1 + karty v truhle té barvy), sečteno přes všechny barvy.
  return COLORS.reduce((s, c) => s + player.tilesPool[c] * (1 + player.bankedPool[c]), 0);
}

function findTile(game, tileId) {
  return game.tiles.find(t => t.id === tileId);
}

function inPlayTiles(game) {
  return game.tiles.filter(t => t.status === 'inplay');
}

function otherActivePlayers(game, player) {
  return game.players.filter(p => p.id !== player.id && !p.eliminated);
}

// ===================== HERNÍ TAH — hlavní tok =====================
// UI vrstva musí poskytnout tyto globální async funkce (viz ui.js):
//   uiLog(text, cls)
//   uiRender(game)
//   uiHumanChooseAction(game, player) -> {type:'play'|'bank'|'pass', cardId}
//   uiHumanChooseOpponent(game, player, candidates, promptText) -> playerId
//   uiHumanChooseCard(game, player, ownerPlayer, promptText) -> cardEntryId (z playedThisRound)
//   uiHumanChooseFromEntries(game, player, promptText, entries) -> entryId (z předem dané nabídky)
//   uiHumanChooseHandCard(game, player, promptText) -> cardId (z ruky)
//   uiHumanYesNo(game, player, promptText) -> boolean
//   uiHumanChooseTile(game, player, tileCandidates, promptText) -> tileId
//   uiHumanChooseEntryPayment(game, player, promptText) -> 'hand' | 'deck'
//   uiAnnounceRoundEnd(game, ranked, winner)
//   uiAnnounceGameEnd(game, scores)

// Obecná stavba hry z libovolného seznamu sedadel ({name, isHuman, strategyType}) - umožňuje víc
// než jednoho lidského hráče najednou (viz online.js), zatímco initGame() níže zůstává beze změny
// chování pro dosavadní lokální režim (jeden člověk + boti).
async function initGameCustom(seatDefs, heroCount) {
  const numPlayers = seatDefs.length === 3 ? 3 : 4;
  heroCount = (heroCount === 0 || heroCount === 1) ? heroCount : 2;
  const players = seatDefs.map((s, i) => makePlayer(i, s.name, !!s.isHuman, s.strategyType || (s.isHuman ? 'human' : 'balanced'), s.genome, s.difficulty));
  const game = {
    __gid: uid('game'),
    players,
    tiles: makeTilePool(),
    neutralDeck: freshNeutralDeck(),
    neutralDiscard: [],
    round: 1,
    startingPlayerIdx: Math.floor(Math.random() * numPlayers),
    log: [],
    phase: 'placement',
    winTiles: numPlayers === 3 ? 5 : 4,
  };
  for (const p of game.players) drawCards(p, 10);
  assignHeroes(game, heroCount);
  game.heroFlags = freshHeroFlags();
  return game;
}

async function initGame(humanName, numPlayers, heroCount, botDifficulty) {
  // Varianta pro 3 hráče (ty + 2 boti, bez Nevilla): stejná pravidla, jen se hraje na 5 vítězných
  // polí místo 4 (viz resolveRoundEnd).
  numPlayers = numPlayers === 3 ? 3 : 4;
  // Boti tu VĖDOMĖ nedostávají genome z GENOME_PRESETS podle jména/štítku - všichni hrají s
  // GENOME_DEFAULT (= nejlepší dosud natrénovaný genom, viz claude/simulace-1000-her-balance.md),
  // jen s volitelně nižší obtížností (viz withDifficulty). Jména York/Lancaster/Neville a jejich
  // strategyType jsou čistě kosmetický štítek, žádné 3 odlišné "osobnosti" už neexistují.
  const diff = (botDifficulty == null) ? 100 : botDifficulty;
  const seatDefs = [
    { name: humanName || 'Ty', isHuman: true, strategyType: 'human' },
    { name: 'York', isHuman: false, strategyType: 'bot', difficulty: diff },
    { name: 'Lancaster', isHuman: false, strategyType: 'bot', difficulty: diff },
  ];
  if (numPlayers === 4) seatDefs.push({ name: 'Neville', isHuman: false, strategyType: 'bot', difficulty: diff });
  return initGameCustom(seatDefs, heroCount);
}

function seatOrderFrom(game, startSeat) {
  const n = game.players.length;
  const order = [];
  for (let i = 0; i < n; i++) order.push(game.players.find(p => p.seat === (startSeat + i) % n));
  return order.filter(p => !p.eliminated);
}

async function initialPlacementPhase(game) {
  uiLog(`Rozmístění: hráči si postupně vybírají startovní pole (začíná ${game.players[game.startingPlayerIdx].name}).`, 'info');
  const order = seatOrderFrom(game, game.startingPlayerIdx);
  for (const player of order) {
    const candidates = inPlayTiles(game);
    let tileId;
    if (player.isHuman) {
      tileId = await uiHumanChooseTile(game, player, candidates, 'Vyber startovní pole pro svou figurku.');
    } else {
      tileId = botChooseTile(game, player, candidates, true);
    }
    await placeOnTile(game, player, tileId, true);
    uiRender(game);
    await sleep(PLACEMENT_DELAY_MS);
  }
  game.phase = 'round';
}

async function placeOnTile(game, player, tileId, isInitialPlacement) {
  const tile = findTile(game, tileId);
  const occupied = tile.occupants.length > 0;
  if (occupied) {
    const canPayHand = player.hand.length > 0;
    const canPayDeck = player.drawPile.length >= 3;
    let method = null;
    if (canPayHand && canPayDeck) {
      // Obě cesty jsou dostupné - hráč má skutečnou volbu mezi odhozením karty z ruky a odhozením
      // 3 karet z vrchu vlastního balíčku. Bot zatím vždy volí ruku (nemění se dosavadní chování
      // botů), člověku se ptáme skutečně.
      if (player.isHuman) {
        method = await uiHumanChooseEntryPayment(game, player, `Pole ${COLOR_NAME[tile.color]} už někdo obsazuje. Jak zaplatíš vstup?`);
      } else {
        method = 'hand';
      }
    } else if (canPayHand) {
      method = 'hand';
    } else if (canPayDeck) {
      method = 'deck';
    }
    if (method === 'hand') {
      let discardCardId;
      if (player.isHuman) {
        discardCardId = await uiHumanChooseHandCard(game, player, `Pole ${COLOR_NAME[tile.color]} už někdo obsazuje. Vyber kartu, kterou za vstup odhodíš.`);
      } else {
        discardCardId = botLowestCardId(player.hand);
      }
      const idx = player.hand.findIndex(c => c.id === discardCardId);
      if (idx >= 0) {
        const [card] = player.hand.splice(idx, 1);
        player.discardPile.push(card);
        uiLog(`${player.name} vstupuje na obsazené pole ${COLOR_NAME[tile.color]} a odhazuje kartu.`, 'muted');
      }
    } else if (method === 'deck') {
      const fromDraw = [];
      for (let i = 0; i < 3 && player.drawPile.length > 0; i++) fromDraw.push(player.drawPile.pop());
      player.discardPile.push(...fromDraw);
      uiLog(`${player.name} odhazuje 3 karty z vrchu balíčku za vstup na pole ${COLOR_NAME[tile.color]}.`, 'muted');
    } else {
      // ani ruka, ani balíček (aspoň 3 karty) nestačí: nejde zaplatit ani jednu z cen. Pokud ještě
      // existuje volné pole kdekoliv na stole, hráč se na něj zdarma přesměruje - vyřazen je jen
      // tehdy, když fakt není kam jinam jít.
      const freeTiles = inPlayTiles(game).filter(t => t.occupants.length === 0 && t.id !== tile.id);
      if (freeTiles.length > 0) {
        uiLog(`${player.name} nemá čím zaplatit vstup na obsazené pole ${COLOR_NAME[tile.color]} — přesouvá se zdarma na volné pole.`, 'muted');
        let freeTileId;
        if (player.isHuman) {
          freeTileId = await uiHumanChooseTile(game, player, freeTiles, 'Nemáš čím zaplatit vstup na obsazené pole — vyber si volné pole zdarma.');
        } else {
          freeTileId = botChooseTile(game, player, freeTiles, isInitialPlacement);
        }
        await placeOnTile(game, player, freeTileId, isInitialPlacement);
        return;
      }
      player.eliminated = true;
      player.currentTileId = null;
      uiLog(`${player.name} nemá čím zaplatit vstup na obsazené pole a nezbývá žádné volné pole — je vyřazen ze zbytku hry!`, 'eliminated');
      return;
    }
  } else {
    uiLog(`${player.name} se umisťuje na pole ${COLOR_NAME[tile.color]}.`, 'muted');
  }
  tile.occupants.push(player.id);
  player.currentTileId = tile.id;
}

// ===================== SCHOPNOSTI BAREV =====================

// Sjednocená kontrola "na tuhle kartu nejde žádným způsobem cílit": buď jde o napořád zamčený
// žlutý úplatek/prokletí (untargetable), nebo o kartu se štítem ze zelené schopnosti (shielded).
// Používá se všude, kde dřív stačilo kontrolovat jen untargetable (zničení, svatba, vrácení na
// ruku, změna hodnoty hrdinou).
function isProtected(e) {
  return !!(e.untargetable || e.shielded);
}

async function chooseOpponent(game, actingPlayer, candidates, promptText, botScoreFn) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;
  if (actingPlayer.isHuman) {
    return await uiHumanChooseOpponent(game, actingPlayer, candidates, promptText);
  }
  // bot: standardně cílí na hráče s nejvyšším součtem v tomto kole (aktuálně nejvíc ohrožující),
  // volitelně lze předat vlastní scoreFn (např. žlutá cílí spíš na majitele nejvíc polí)
  const scoreFn = botScoreFn || roundSum;
  let best = candidates[0];
  for (const c of candidates) if (scoreFn(c) > scoreFn(best)) best = c;
  return best.id;
}

async function triggerAbility(game, color, actingPlayer, fromFavorToken) {
  if (abilitiesDisabled(game)) {
    uiLog('Schopnost nelze spustit - do konce kola platí Příměří (Margaret Beaufort).', 'muted');
    return;
  }
  if (color === 'R') {
    const candidates = otherActivePlayers(game, actingPlayer).filter(p => p.playedThisRound.some(e => e.active && !isProtected(e)));
    if (candidates.length === 0) { uiLog('Vražda nemá cíl, schopnost propadá.', 'muted'); return; }
    const targetId = await chooseOpponent(game, actingPlayer, candidates, 'Vyber soupeře, kterému zničíš vyloženou kartu.');
    const target = game.players.find(p => p.id === targetId);
    const activeCards = target.playedThisRound.filter(e => e.active && !isProtected(e));
    let cardEntryId;
    if (actingPlayer.isHuman) {
      cardEntryId = await uiHumanChooseCard(game, actingPlayer, target, 'Vyber kartu, kterou zničíš.');
    } else {
      cardEntryId = activeCards.reduce((a, b) => (b.value > a.value ? b : a)).id;
    }
    const entry = target.playedThisRound.find(e => e.id === cardEntryId);
    entry.active = false;
    uiLog(`${actingPlayer.name} vraždí: ničí kartu hráče ${target.name}.`, 'ability-R');
    await flashEntries(game, [entry], 'hit');
  }

  else if (color === 'Y') {
    // Úplatky (přepracováno): vyber banknutou kartu soupeře, odhal ji a otoč na mínus - karta se
    // navždy zamkne (untargetable) se zápornou hodnotou stejně jako dřívější žlutý úplatek, jen
    // teď jde o SKUTEČNOU banknutou kartu soupeře místo nové karty z neutrálního balíčku (ten už
    // žlutá vůbec nepoužívá - slouží výhradně modré schopnosti).
    const candidates = otherActivePlayers(game, actingPlayer).filter(p => p.playedThisRound.some(e => e.active && e.facedown && !isProtected(e)));
    if (candidates.length === 0) { uiLog('Úplatky nemají koho podplatit - žádný soupeř tohle kolo nemá kartu v truhle, schopnost propadá.', 'muted'); return; }
    // bot cílí primárně na hráče s nejvíc kartami v truhle (nejvíc co ztratit), teprve pak na
    // nejvyšší součet kola - skutečnou hodnotu soupeřovy karty v truhle bot nezná (je tajná).
    const targetId = await chooseOpponent(game, actingPlayer, candidates, 'Vyber soupeře, kterému odhalíš a znehodnotíš kartu v truhle.',
      (p) => p.playedThisRound.filter(e => e.active && e.facedown && !isProtected(e)).length * 100 + roundSum(p));
    const target = game.players.find(p => p.id === targetId);
    const theirBanked = target.playedThisRound.filter(e => e.active && e.facedown && !isProtected(e));
    let entryId;
    if (actingPlayer.isHuman) {
      entryId = await uiHumanChooseFromEntries(game, actingPlayer, `Úplatky: vyber kartu v truhle hráče ${target.name}, kterou odhalíš a otočíš na mínus.`, theirBanked);
    } else {
      entryId = botChooseYellowTarget(game, actingPlayer, theirBanked);
    }
    const entry = theirBanked.find(e => e.id === entryId);
    entry.facedown = false;
    entry.color = entry.realColor;
    entry.value = -entry.realValue;
    entry.untargetable = true;
    entry.originalValue = entry.value; // od teď je tohle jeho "přirozená" hodnota, ne stará banknutá 1
    uiLog(`${actingPlayer.name} podplácí: odhaluje kartu v truhle hráče ${target.name} (${COLOR_NAME[entry.color]} ${entry.realValue}) a mění ji na trvale zamčené mínus ${entry.realValue}.`, 'ability-Y');
    await flashEntries(game, [entry], 'hit');
  }

  else if (color === 'G') {
    // Špionáž (přepracováno popáté - nucené uschovávání do truhly): vyber soupeře, který musí hned uschovat do truhly
    // NÁHODNOU kartu z ruky (vezmeš mu ji vslepo). Karta jde lícem dolů na jeho stůl jako běžná
    // karta v truhle (hodnota 1 do součtu, na konci kola do panství). Když mu padne barva,
    // kterou sbírá, pomůžeš mu; když jinou, o kartu přijde zbytečně. Nefunguje při zákazu uschovávání do truhly
    // (Henry VI.) a na soupeře bez karet na ruce.
    if (game.heroFlags && game.heroFlags.noBanking) { uiLog('Špionáž propadá - uschovávání do truhly je dočasně zakázané (Henry VI.).', 'muted'); return; }
    const candidates = otherActivePlayers(game, actingPlayer).filter(p => p.hand.length > 0);
    if (candidates.length === 0) { uiLog('Špionáž nemá koho přinutit - žádný soupeř nemá karty na ruce, schopnost propadá.', 'muted'); return; }
    const targetId = await chooseOpponent(game, actingPlayer, candidates, 'Špionáž: vyber soupeře, který musí uschovat do truhly náhodnou kartu z ruky.', botSpyTargetScore);
    const target = game.players.find(p => p.id === targetId);
    const idx = Math.floor(Math.random() * target.hand.length);
    const [card] = target.hand.splice(idx, 1);
    const forcedZero = !!(game.heroFlags && game.heroFlags.forceBankedZero); // Edward IV.
    const ph = forcedZero ? 0 : 1;
    const entry = { id: uid('play'), color: 'N', realColor: card.color, realValue: card.value, value: ph, originalValue: ph, active: true, facedown: true };
    target.playedThisRound.push(entry);
    uiLog(`${actingPlayer.name} špehuje: ${target.name} musí uschovat do truhly náhodnou kartu z ruky.`, 'ability-G');
    await flashEntries(game, [entry], 'play');
  }

  else if (color === 'B') {
    if (game.heroFlags && game.heroFlags.noNeutralCards) { uiLog('Podpora církve propadá - bezbarvé karty jsou dočasně zakázané (Henry VI.).', 'muted'); return; }
    const neutralCard = drawNeutralCard(game);
    const newEntry = {
      id: uid('play'), color: 'N', realColor: 'N', value: neutralCard.value, originalValue: neutralCard.value, active: true, facedown: false,
      isNeutralSource: true, neutralValue: neutralCard.value,
    };
    actingPlayer.playedThisRound.push(newEntry);
    uiLog(`${actingPlayer.name} čerpá podporu církve: +${neutralCard.value}.`, 'ability-B');
    await flashEntries(game, [newEntry], 'add');
  }

  else if (color === 'S') {
    if (!actingPlayer.playedThisRound.some(e => e.active && !isProtected(e))) { uiLog('Svatba nemá co prohodit na tvé straně, propadá.', 'muted'); return; }
    const candidates = otherActivePlayers(game, actingPlayer).filter(p => p.playedThisRound.some(e => e.active && !isProtected(e)));
    if (candidates.length === 0) { uiLog('Svatba nemá cíl, propadá.', 'muted'); return; }
    const targetId = await chooseOpponent(game, actingPlayer, candidates, 'Vyber soupeře pro svatbu (výměnu karet).');
    const target = game.players.find(p => p.id === targetId);
    let myEntryId, theirEntryId;
    if (actingPlayer.isHuman) {
      myEntryId = await uiHumanChooseCard(game, actingPlayer, actingPlayer, 'Vyber svou kartu, kterou nabídneš k výměně.');
      theirEntryId = await uiHumanChooseCard(game, actingPlayer, target, 'Vyber soupeřovu kartu, kterou chceš získat.');
    } else {
      myEntryId = botPickGreyGiveEntry(actingPlayer);
      theirEntryId = botPickGreyTakeEntry(actingPlayer, target);
    }
    const myIdx = actingPlayer.playedThisRound.findIndex(e => e.id === myEntryId);
    const theirIdx = target.playedThisRound.findIndex(e => e.id === theirEntryId);
    const [myEntry] = actingPlayer.playedThisRound.splice(myIdx, 1);
    const [theirEntry] = target.playedThisRound.splice(theirIdx, 1);
    actingPlayer.playedThisRound.push(theirEntry);
    target.playedThisRound.push(myEntry);
    uiLog(`${actingPlayer.name} a ${target.name} si prohodili vyložené karty (svatba).`, 'ability-S');
    await flashEntries(game, [theirEntry, myEntry], 'swap');
  }
}

// ===================== HRDINOVÉ =====================
// Každý hráč dostane na začátku hry 2 hrdiny (z 8 celkem - pro 4 hráče se tak rozdají všichni, pro
// 3 hráče se náhodně rozdá 6 z 8 a zbylí 2 hrdinové ve hře vůbec nefigurují) a
// může každého z nich kdykoliv v průběhu CELÉ hry zahrát jako svůj tah (jednorázově, jeden hrdina
// = jedno použití na celou hru). Kdo drží kterého hrdinu je tajné až do chvíle, kdy ho zahraje -
// soupeři vidí jen POČET nepoužitých hrdinů, ne jejich identitu.

const HERO_LIST = [
  { id: 'york', name: 'Richard z Yorku', desc: 'Zničí všechny vyložené karty s hodnotou 4-6 (u všech hráčů) a do konce kola zakáže hrát karty s touto hodnotou lícem nahoru (uschovávat do truhly je lze normálně dál).' },
  { id: 'edmund', name: 'Edmund Beaufort', desc: 'Zničí všechny vyložené karty s hodnotou 2-4 (u všech hráčů) a do konce kola zakáže hrát karty s touto hodnotou lícem nahoru (uschovávat do truhly je lze normálně dál).' },
  { id: 'edwardIV', name: 'Edward IV.', desc: 'Všechny vyložené karty (u všech hráčů), včetně nově zahraných, mají do konce kola hodnotu 1. Všechny karty v truhle (staré i nově uschované) mají do konce kola hodnotu 0.' },
  { id: 'henryVI', name: 'Henry VI.', desc: 'Zničí všechny bezbarvé karty na stole (ať zahrané z ruky, nebo z podpory církve) i všechny karty v truhle (u všech hráčů) - zamčené žluté úplatky přežijí. Do konce kola nelze hrát bezbarvé karty z ruky ani uschovávat do truhly.' },
  { id: 'cecily', name: 'Cecily Nevillová', desc: 'Každý hráč (včetně tebe) má už jen jeden další tah, poté musí passnout.' },
  { id: 'margaretAnjou', name: 'Margaret z Anjou', desc: 'Každý hráč (včetně tebe) zničí své dvě nejvyšší vyložené karty. Při shodě hodnot volí majitel, kterou zničí.' },
  { id: 'neville', name: 'Richard Neville — Kingmaker', desc: 'Toto kolo vyhrává hráč s nejnižším součtem místo nejvyšším.' },
  { id: 'margaretBeaufort', name: 'Margaret Beaufort — Příměří', desc: 'Do konce kola nelze spustit žádnou schopnost karet (ani zdarma podle pole, ani přes žeton přízně) a nelze vracet kartu na ruku podle pravidla karty s hodnotou 1. Do truhly lze uschovávat normálně dál.' },
];
function heroDef(id) { return HERO_LIST.find(h => h.id === id); }

function assignHeroes(game, heroCount) {
  // heroCount 2/1/0 karet hrdinů na hráče, vybraných náhodně z 8 celkem. Při heroCount 2 (výchozí)
  // pro 4 hráče se tak rozdají všichni, pro 3 hráče 6 z 8 (zbylí 2 ve hře vůbec nefigurují) - viz
  // komentář u HERO_LIST. Při 1 nebo 0 zbývá ještě víc nepoužitých hrdinů mimo hru.
  const n = heroCount == null ? 2 : heroCount;
  const ids = shuffle(HERO_LIST.map(h => h.id));
  for (const p of game.players) {
    const heroes = [];
    for (let i = 0; i < n; i++) heroes.push({ id: ids.pop(), used: false });
    p.heroes = heroes;
  }
}

function hasUnusedHero(player) {
  return (player.heroes || []).some(h => !h.used);
}

function freshHeroFlags() {
  return {
    banRanges: [],          // [[min,max], ...] - do konce kola nelze hrát (lícem nahoru) hodnoty v tomto rozsahu
    forceValueOne: false,   // Edward IV. - všechny vyložené karty (staré i nové) mají hodnotu 1
    forceBankedZero: false, // Edward IV. - všechny karty v truhle (staré i nově uschované) mají hodnotu 0 do konce kola
    noNeutralCards: false,  // Henry VI. - modrá schopnost propadá, nelze hrát bezbarvou kartu z ruky
    noBanking: false,       // Henry VI. - akce "bank" propadá
    noAbilities: false,     // Margaret Beaufort (Příměří) - žádná schopnost (ani žetonem) ani vrácení karty 1
    invertedWinner: false,  // Neville - kolo vyhrává nejnižší součet místo nejvyššího
    lastCallIds: null,      // Cecily - Set id hráčů, kterým po jejich příštím tahu skončí kolo
  };
}

function abilitiesDisabled(game) {
  return !!(game.heroFlags && game.heroFlags.noAbilities);
}

function heroValueBanned(game, value) {
  if (!game.heroFlags) return false;
  return game.heroFlags.banRanges.some(([lo, hi]) => value >= lo && value <= hi);
}

// Smí se tahle karta z ruky zahrát lícem nahoru? Bere v potaz jak zákaz podle hodnoty
// (Richard z Yorku / Edmund Beaufort), tak zákaz bezbarvých karet (Jindřich VI.) - uschovávání do truhly
// řeší samostatně příznak noBanking, tady jde jen o hraní "face up".
function cardPlayBanned(game, card) {
  if (heroValueBanned(game, card.value)) return true;
  if (game.heroFlags && game.heroFlags.noNeutralCards && card.color === 'N') return true;
  return false;
}

async function playHero(game, player, heroId) {
  const rec = (player.heroes || []).find(h => h.id === heroId && !h.used);
  if (!rec) return;
  rec.used = true;
  const def = heroDef(heroId);
  uiLog(`🎭 ${player.name} odhaluje a hraje hrdinu: ${def.name}!`, 'hero');
  // Hrdina se vyloží do "play area" před hráče - viditelně pro všechny, dokud kolo neskončí -
  // aby bylo jasné, čí schopnost je právě aktivní.
  player.activeHeroThisRound = { id: heroId, name: def.name };
  await flashHero(game, player, 'hero-appear');
  await resolveHero(game, player, heroId);
}

async function resolveHero(game, actingPlayer, heroId) {
  if (heroId === 'york') return heroDestroyAndBanRange(game, 4, 6, 'Richard z Yorku');
  if (heroId === 'edmund') return heroDestroyAndBanRange(game, 2, 4, 'Edmund Beaufort');
  if (heroId === 'edwardIV') return heroEdwardIV(game);
  if (heroId === 'henryVI') return heroHenryVI(game);
  if (heroId === 'cecily') return heroCecily(game, actingPlayer);
  if (heroId === 'margaretAnjou') return heroMargaretAnjou(game);
  if (heroId === 'neville') return heroNeville(game);
  if (heroId === 'margaretBeaufort') return heroMargaretBeaufort(game);
}

async function heroDestroyAndBanRange(game, lo, hi, label) {
  game.heroFlags.banRanges.push([lo, hi]);
  const destroyed = [];
  for (const p of game.players) {
    for (const e of p.playedThisRound) {
      if (e.active && !e.facedown && !isProtected(e) && e.value >= lo && e.value <= hi) {
        e.active = false;
        destroyed.push(e);
      }
    }
  }
  uiLog(`${label}: zničeny všechny vyložené karty s hodnotou ${lo}-${hi} (${destroyed.length}×) a do konce kola je nelze hrát lícem nahoru (do truhly lze uschovávat dál).`, 'hero');
  await flashEntries(game, destroyed, 'hit');
}

async function heroEdwardIV(game) {
  game.heroFlags.forceValueOne = true;
  game.heroFlags.forceBankedZero = true;
  const changed = [];
  for (const p of game.players) {
    for (const e of p.playedThisRound) {
      if (!e.active || isProtected(e)) continue;
      if (!e.facedown) {
        if (e.value !== 1) changed.push(e);
        e.value = 1; e.greenDelta = 0;
      } else {
        if (e.value !== 0) changed.push(e);
        e.value = 0;
      }
    }
  }
  uiLog('Edward IV.: všechny vyložené karty mají do konce kola hodnotu 1 a všechny karty v truhle hodnotu 0 (zamčený žlutý úplatek je vůči tomu chráněný).', 'hero');
  await flashEntries(game, changed, 'add');
}

async function heroHenryVI(game) {
  game.heroFlags.noNeutralCards = true;
  game.heroFlags.noBanking = true;
  const destroyed = [];
  for (const p of game.players) {
    for (const e of p.playedThisRound) {
      // Jakákoliv bezbarvá karta na stole jde zničit - ať šlo o neutrální kartu zahranou přímo
      // z ruky, o podporu církve (modrá), nebo o banknutou kartu (ta má barvu vždy 'N', ať byla
      // banknuta karta jakékoliv skutečné barvy). Banknuté karty MAJÍ vždy color:'N', takže je
      // tahle jediná podmínka (barva 'N') pokrývá zároveň s ostatními bezbarvými kartami - dřívější
      // verze omylem kontrolovala jen isNeutralSource, což vynechávalo neutrální karty zahrané
      // normálně z ruky. Zamčený žlutý úplatek i štítovaná karta (obojí isProtected) přežijí.
      if (e.active && !isProtected(e) && e.color === 'N') {
        e.active = false;
        destroyed.push(e);
      }
    }
  }
  uiLog(`Henry VI.: zničeny všechny bezbarvé karty na stole (ze hry i z podpory církve) i všechny karty v truhle (${destroyed.length}×). Zamčené žluté úplatky přežily. Do konce kola nelze hrát bezbarvé karty z ruky ani uschovávat do truhly.`, 'hero');
  await flashEntries(game, destroyed, 'hit');
}

async function heroCecily(game, actingPlayer) {
  // Včetně actingPlayer samotného - ten teď dohrává svůj BĚŽNÝ tah (jen se v něm rozhodl zahrát
  // hrdinu místo karty), ne ten "poslední" navíc. Playtoutce v playRound díky snapshotu před
  // taháhem pozná, že actingPlayer do setu přibyl až během TOHOTO tahu, a nedonutí ho passnout
  // hned teď - dostane ještě jeden regulérní tah navíc jako všichni ostatní, a passne až po něm.
  const ids = new Set(game.players.filter(p => !p.eliminated && !p.passedThisRound).map(p => p.id));
  game.heroFlags.lastCallIds = ids;
  uiLog(`Cecily Nevillová: každý hráč (${actingPlayer.name} včetně) má už jen jeden další tah, poté musí passnout.`, 'hero');
}

async function destroyTopTwo(game, player) {
  let needed = 2;
  const active = player.playedThisRound.filter(e => e.active && !isProtected(e));
  const byValue = {};
  for (const e of active) { (byValue[e.value] = byValue[e.value] || []).push(e); }
  const values = Object.keys(byValue).map(Number).sort((a, b) => b - a);
  const toDestroy = [];
  for (const v of values) {
    if (needed <= 0) break;
    const group = byValue[v];
    if (group.length <= needed) {
      toDestroy.push(...group);
      needed -= group.length;
    } else {
      let chosen;
      if (player.isHuman) {
        chosen = [];
        let pool = [...group];
        for (let i = 0; i < needed; i++) {
          const id = await uiHumanChooseFromEntries(game, player, `Margaret z Anjou: vyber, kterou ze svých karet (hodnota ${v}) zničíš.`, pool);
          const idx = pool.findIndex(e => e.id === id);
          chosen.push(pool[idx]);
          pool.splice(idx, 1);
        }
      } else {
        chosen = group.slice(0, needed);
      }
      toDestroy.push(...chosen);
      needed = 0;
    }
  }
  for (const e of toDestroy) e.active = false;
  await flashEntries(game, toDestroy, 'hit');
  return toDestroy.length;
}

async function heroMargaretAnjou(game) {
  let total = 0;
  for (const p of game.players) {
    if (p.eliminated) continue;
    total += await destroyTopTwo(game, p);
  }
  uiLog(`Margaret z Anjou: každý hráč zničil své dvě nejvyšší karty (celkem ${total}× zničeno).`, 'hero');
}

async function heroNeville(game) {
  game.heroFlags.invertedWinner = true;
  uiLog('Richard Neville (Kingmaker): toto kolo vyhrává hráč s nejnižším součtem místo nejvyšším.', 'hero');
}

async function heroMargaretBeaufort(game) {
  // Příměří: do konce kola nejde spustit žádná schopnost (ani zdarma podle pole, ani přes žeton
  // přízně) a neplatí ani pravidlo vracení karty s hodnotou 1 - viz abilitiesDisabled() a jeho
  // použití v triggerAbility/takeTurn. Uschovávání do truhly samotné (karta lícem dolů) zůstává povolené.
  game.heroFlags.noAbilities = true;
  uiLog('Margaret Beaufort (Příměří): do konce kola nelze spustit žádnou schopnost karet (ani přes žeton přízně) a nelze vracet kartu podle pravidla karty s hodnotou 1. Do truhly lze uschovávat normálně dál.', 'hero');
}

// ---- bot: vyhodnocení kdy hrdinu zahrát ----
// Cíl: co nejmíň ublížit sobě, co nejvíc soupeřům, ideálně si tím pomoct vyhrát kolo / získat body
// / zabránit soupeři v bodech (např. zničením jeho karet v truhle). Boti navíc hrdiny nezahrávají
// hned v 1. kole - i jen vědomí, že soupeř nějakého hrdinu má, je samo o sobě "strašidelné", a tahle
// nejistota by se zbytečně brzo rozplynula.

function evalHeroScore(game, player, heroId) {
  const others = otherActivePlayers(game, player);
  if (heroId === 'york' || heroId === 'edmund') {
    const [lo, hi] = heroId === 'york' ? [4, 6] : [2, 4];
    const tableVal = (p) => p.playedThisRound.filter(e => e.active && !e.facedown && e.value >= lo && e.value <= hi).reduce((s, e) => s + e.value, 0);
    const myHandPenalty = player.hand.filter(c => c.value >= lo && c.value <= hi).length * 0.4;
    let score = -tableVal(player) - myHandPenalty;
    for (const o of others) score += tableVal(o);
    return score;
  }
  if (heroId === 'edwardIV') {
    // Ztráta = (vyložené karty klesnou na 1) + (karty v truhle klesnou na 0, tj. ztratí svou
    // dosavadní placeholder hodnotu 1 v součtu kola - samotný bankovní multiplikátor na konci kola
    // tím není dotčen, jde jen o dočasný pokles příspěvku do součtu TOHOHLE kola).
    const netTableLoss = (p) => p.playedThisRound.filter(e => e.active && !isProtected(e))
      .reduce((s, e) => s + (e.facedown ? e.value : (e.value - 1)), 0);
    let score = -netTableLoss(player);
    for (const o of others) score += netTableLoss(o);
    return score;
  }
  if (heroId === 'henryVI') {
    const W = 3; // odhad hodnoty jedné karty v truhle (skutečnou hodnotu soupeřovy karty v truhle bot nezná)
    const netVal = (p) => p.playedThisRound.filter(e => e.active && e.color === 'N' && !e.facedown && !isProtected(e)).reduce((s, e) => s + Math.abs(e.value), 0)
      + p.playedThisRound.filter(e => e.active && e.facedown).length * W;
    let score = -netVal(player);
    for (const o of others) score += netVal(o);
    return score;
  }
  if (heroId === 'cecily') {
    const mySum = roundSum(player);
    const othersMax = others.length ? Math.max(...others.map(roundSum)) : 0;
    const stillPlayingBonus = others.filter(o => !o.passedThisRound).length * 0.5;
    return (mySum - othersMax) + stillPlayingBonus;
  }
  if (heroId === 'margaretAnjou') {
    const top2 = (p) => p.playedThisRound.filter(e => e.active).map(e => e.value).sort((a, b) => b - a).slice(0, 2).reduce((s, v) => s + v, 0);
    let score = -top2(player);
    for (const o of others) score += top2(o);
    return score;
  }
  if (heroId === 'neville') {
    const mySum = roundSum(player);
    const sums = others.map(roundSum);
    const minOther = sums.length ? Math.min(...sums) : Infinity;
    if (mySum > minOther) return -10; // nejsem nejnižší, nevyplatí se
    const lateness = others.filter(o => o.passedThisRound).length; // víc pasnutých = pozdější fáze kola
    return (minOther - mySum) + lateness;
  }
  if (heroId === 'margaretBeaufort') {
    // Příměří se vyplatí zamknout, když už vedeš v součtu kola (nikdo tě pak nemůže připravit o
    // vedení vraždou ani svatbou a ty se nemusíš bát, že tě někdo dožene komboem schopnosti), a
    // když máš v ruce dost jedniček, které chceš zahrát bez trestu vracení karty. Vlastní
    // nevyužité žetony přízně jsou naopak drobná cena - o možnost je ještě použít přijdeš taky.
    const mySum = roundSum(player);
    const othersMax = others.length ? Math.max(...others.map(roundSum)) : 0;
    const myOnes = player.hand.filter(c => c.value === 1).length;
    return (mySum - othersMax) + myOnes * 1.2 - player.favorTokens * 0.3;
  }
  return -Infinity;
}

// Kolik aktivních (nezničených) karet je právě rozehráno na stole napříč všemi hráči - hrubý
// ukazatel, jak "vyzrálé" už tohle kolo je. Používá se k tomu, aby hrdinové, jejichž síla roste
// s tím, co je na stole (ničí/přepisují vyložené karty), nebyli pálení zbytečně brzy na skoro
// prázdný stůl (typicky 1 osamocená karta) - lepší počkat na víc materiálu a mít pak větší dopad.
function totalActiveEntries(game) {
  let n = 0;
  for (const p of game.players) {
    if (p.eliminated) continue;
    n += p.playedThisRound.filter(e => e.active).length;
  }
  return n;
}

const TABLE_SCALING_HEROES = new Set(['york', 'edmund', 'edwardIV', 'henryVI', 'margaretAnjou']);

// ===================== GENOM BOTA (evolučně laditelné parametry) =====================
// Všechny číselné prahy/váhy/pravděpodobnosti, které řídí rozhodování bota, jsou soustředěné
// tady do jednoho "genomu" - ploché mapy název→číslo. Dřív byly částečně rozeseté přímo v kódu
// rozhodování jako `strategy === 'aggressive' ? X : strategy === 'hoarder' ? Y : Z` (3 pevné,
// jmenovité archetypy - viz historie v claude/simulace-1000-her-balance.md). Teď každý bot nese
// vlastní genom (player.genome, vždy kompletní objekt se VŠEMI klíči níže) a žádný kus
// rozhodovací logiky už se neptá "jaký je můj strategyType" - jen čte čísla ze svého genomu.
// `strategyType` zůstává jen ŠTÍTEK pro zobrazení/log/diagnostiku, nikdy se nečte uvnitř
// botConsiderHero/botDecideAction/botUseFavorToken/tileScoreForBot.
//
// GENOME_LEGACY_BALANCED je přesná kopie toho, co dřív dělal styl 'balanced' (= dosavadní výchozí
// bot před evolučním tréninkem) - uchováváno jako pevný historický bod pro srovnání/budoucí
// šampionáty, ne jako aktivní výchozí nastavení. GENOME_PRESETS (aggressive/balanced/hoarder) z
// něj vycházejí a existují JEN jako volitelné počáteční hodnoty pro rozsetí populace v evoluční
// trénovací smyčce (train_evolution.js) - samotná hra je nikdy nepoužije automaticky (viz initGame
// níže, ten bere čistý GENOME_DEFAULT).
const GENOME_LEGACY_BALANCED = {
  // --- hrdinové (botConsiderHero) ---
  heroFreeThreshold: 3.5, heroForcedThreshold: 1.2, heroMaturityGate: 1.0,
  heroMaturityBase: 0.6, heroMaturitySlope: 0.35, heroMaturityCap: 1.3,
  // --- odhad hodnoty schopnosti pole (estimateAbilityValue) ---
  redTopCoeff: 0.5, redCloseBonus: 1.5, blueCloseValue: 2.5, blueFarValue: 0.5,
  yellowTilesCoeff: 1.2, greenBestCoeff: 0.5, greenGapBonus: 1.0, greenGapThreshold: -2,
  greyBestTargetCoeff: 0.5, abilityWorthChasingThreshold: 2.5,
  // --- hraní/uschovávání do truhly/vzdávání kola (botDecideAction) ---
  bankChanceBase: 0.55, bankChanceAbilityLowBump: 0.25, bankChanceCap: 0.9,
  bankChanceAbilityHighDrop: 0.3, bankChanceFloor: 0.05, bankChanceYellowMult: 0.15,
  conserveChanceBase: 0.12, fatigueHandThreshold: 6, fatigueSlope: 0.12, fatigueCap: 0.5,
  firstRoundCaution: 0.12, riskChanceWhenThreatened: 0.08, aheadMargin: 3,
  hoardingTendency: 0, hoardingTileGate: 3,
  // --- žetony přízně (botUseFavorToken) ---
  redTokenMargin: 0, blueTokenMargin: 0, yellowTokenTileThreshold: 2, yellowTokenSumMargin: 2,
  shieldValueThreshold: 4, shieldMaxDeficit: 5, shieldMinLead: -1, greyTradeMargin: 1,
  // --- výběr pole (tileScoreForBot) ---
  tileSynergyTilesWeight: 3, tileSynergyBankedWeight: 2, tileOccupantPenalty: 2, tileRandomJitter: 0.5,
};

// GENOME_DEFAULT = vítěz evolučního tréninku self-play (2026-10-05, viz
// claude/simulace-1000-her-balance.md Update VII) - 3 nezávislé běhy (~25-40 tisíc her každý,
// populace 32-40 genomů, 137-175 generací), jejich nejlepší kandidáti pak proti sobě navzájem a
// proti historickým presetům v jednom velkém ověřovacím šampionátu (grand_championship.js,
// ~1750 her, úzké konfidenční intervaly ±3pp). Vyhrál s winrate 35.2 % oproti 24.0 % pro dřívější
// 'balanced' výchozí nastavení (GENOME_LEGACY_BALANCED výše) v tomtéž šampionátu - měřitelně a
// opakovaně silnější, ne jen šťastná náhoda jednoho běhu.
const GENOME_DEFAULT = {
  heroFreeThreshold: 2.2752, heroForcedThreshold: 3, heroMaturityGate: 0.6621,
  heroMaturityBase: 0.7448, heroMaturitySlope: 0.414, heroMaturityCap: 1.5147,
  redTopCoeff: 0.5714, redCloseBonus: 1.2952, blueCloseValue: 2.866, blueFarValue: 1.277,
  yellowTilesCoeff: 0.6835, greenBestCoeff: 0.7532, greenGapBonus: 0.3531, greenGapThreshold: 0,
  greyBestTargetCoeff: 0.3602, abilityWorthChasingThreshold: 2.2502,
  bankChanceBase: 0.9, bankChanceAbilityLowBump: 0.4, bankChanceCap: 0.8082,
  bankChanceAbilityHighDrop: 0.1925, bankChanceFloor: 0.119, bankChanceYellowMult: 0.0574,
  conserveChanceBase: 0.0708, fatigueHandThreshold: 3.6497, fatigueSlope: 0.05, fatigueCap: 0.5908,
  firstRoundCaution: 0.3, riskChanceWhenThreatened: 0.1144, aheadMargin: 3.6844,
  hoardingTendency: 0.5832, hoardingTileGate: 1,
  redTokenMargin: 2, blueTokenMargin: 0.2538, yellowTokenTileThreshold: 1, yellowTokenSumMargin: 0.4622,
  shieldValueThreshold: 3.5601, shieldMaxDeficit: 2, shieldMinLead: -2.0786, greyTradeMargin: 1.0733,
  tileSynergyTilesWeight: 4.2302, tileSynergyBankedWeight: 4.3395, tileOccupantPenalty: 2.1216, tileRandomJitter: 1.179,
};

// [min, max] rozsah pro každý klíč - používá se k ořezání (clampGenome) i k mutaci/randomizaci
// v train_evolution.js. Udržováno tady, ne v trénovacím skriptu, aby šel genom ověřit/ořezat i
// kdyby přišel z nedůvěryhodného zdroje.
const GENOME_RANGES = {
  heroFreeThreshold: [1, 6], heroForcedThreshold: [0, 3], heroMaturityGate: [0, 2],
  heroMaturityBase: [0.3, 1.0], heroMaturitySlope: [0.1, 0.6], heroMaturityCap: [1.0, 2.0],
  redTopCoeff: [0.2, 1.0], redCloseBonus: [0, 3], blueCloseValue: [1, 4], blueFarValue: [0, 2],
  yellowTilesCoeff: [0.5, 2], greenBestCoeff: [0.2, 1], greenGapBonus: [0, 2], greenGapThreshold: [-4, 0],
  greyBestTargetCoeff: [0.2, 1], abilityWorthChasingThreshold: [1, 4],
  bankChanceBase: [0.1, 0.9], bankChanceAbilityLowBump: [0, 0.4], bankChanceCap: [0.6, 1.0],
  bankChanceAbilityHighDrop: [0, 0.5], bankChanceFloor: [0, 0.3], bankChanceYellowMult: [0, 1],
  conserveChanceBase: [0, 0.3], fatigueHandThreshold: [3, 8], fatigueSlope: [0.05, 0.25], fatigueCap: [0.2, 0.7],
  firstRoundCaution: [0, 0.3], riskChanceWhenThreatened: [0, 0.3], aheadMargin: [1, 6],
  hoardingTendency: [0, 1], hoardingTileGate: [1, 5],
  redTokenMargin: [-1, 2], blueTokenMargin: [-2, 2], yellowTokenTileThreshold: [1, 4], yellowTokenSumMargin: [0, 5],
  shieldValueThreshold: [2, 6], shieldMaxDeficit: [2, 8], shieldMinLead: [-4, 2], greyTradeMargin: [0, 3],
  tileSynergyTilesWeight: [1, 6], tileSynergyBankedWeight: [0, 5], tileOccupantPenalty: [0, 5], tileRandomJitter: [0, 2],
};

const GENOME_PRESETS = {
  aggressive: Object.assign({}, GENOME_LEGACY_BALANCED, { bankChanceBase: 0.35, conserveChanceBase: 0.06, aheadMargin: 4, hoardingTendency: 0 }),
  balanced: Object.assign({}, GENOME_LEGACY_BALANCED),
  hoarder: Object.assign({}, GENOME_LEGACY_BALANCED, { bankChanceBase: 0.75, conserveChanceBase: 0.18, aheadMargin: 2, hoardingTendency: 1 }),
};

function clampGenome(g) {
  const out = {};
  for (const k of Object.keys(GENOME_DEFAULT)) {
    const v = (g && typeof g[k] === 'number' && !isNaN(g[k])) ? g[k] : GENOME_DEFAULT[k];
    const range = GENOME_RANGES[k];
    out[k] = range ? Math.min(range[1], Math.max(range[0], v)) : v;
  }
  return out;
}

// Postaví kompletní genom z volitelného jmenovaného presetu (jen pro úvodní rozsetí populace
// v tréninku, viz komentář výše) + volitelného přepsání konkrétními hodnotami.
function makeGenome(presetName, overrides) {
  const preset = GENOME_PRESETS[presetName] || {};
  return clampGenome(Object.assign({}, GENOME_DEFAULT, preset, overrides || {}));
}

// ===================== OBTÍŽNOST BOTA =====================
// player.difficulty (0-100, výchozí 100) určuje, jak často bot skutečně použije svůj genom (=
// nejlepší rozhodnutí, které umí) místo ÚPLNĚ NÁHODNÉ, ale vždy pravidly povolené alternativy.
// 100 = vždy podle genomu (využívá celý svůj potenciál), 50 = v průměru polovina rozhodnutí je
// čistě náhodná mezi legálními možnostmi - snazší soupeř, co ale nikdy nedělá nic nelegálního.
function withDifficulty(player, genomeChoiceFn, legalChoicesFn) {
  const difficulty = (player.difficulty == null) ? 100 : player.difficulty;
  if (difficulty >= 100 || Math.random() * 100 < difficulty) return genomeChoiceFn();
  const legal = legalChoicesFn();
  if (!legal || legal.length === 0) return genomeChoiceFn();
  return legal[Math.floor(Math.random() * legal.length)];
}

// Kompletní výčet legálních akcí pro daný tah (pro difficulty override) - vědomě ignoruje jen
// "měkké" preference bota (zralost stolu pro hrdiny škálující se stolem, counterplay, ...), ale
// nikdy nic, co by samotná PRAVIDLA hry zakazovala (hrdinové v 1. kole, zakázané hodnoty karet
// po Yorkovi/Edmundovi, uschovávání do truhly pod noBanking flagem).
function enumerateLegalActions(game, player) {
  const actions = [];
  const noBanking = !!(game.heroFlags && game.heroFlags.noBanking);
  for (const c of player.hand) {
    if (!cardPlayBanned(game, c)) actions.push({ type: 'play', cardId: c.id });
    if (!noBanking) actions.push({ type: 'bank', cardId: c.id });
  }
  if (game.round > 1) {
    for (const h of (player.heroes || [])) {
      if (!h.used) actions.push({ type: 'hero', heroId: h.id });
    }
  }
  actions.push({ type: 'pass' });
  return actions;
}

function botConsiderHero(game, player, forced) {
  const unused = (player.heroes || []).filter(h => !h.used);
  if (unused.length === 0) return null;
  // V 1. kole boti hrdiny nezahrávají vůbec, ani když jim došly karty na ruce (radši passnou) -
  // nejistota, kdo co drží, má vydržet přinejmenším přes celé první kolo.
  if (game.round <= 1) return null;
  const G = player.genome;
  const activePlayers = game.players.filter(p => !p.eliminated).length;
  const maturity = totalActiveEntries(game) / Math.max(1, activePlayers);
  let best = null, bestScore = -Infinity;
  for (const h of unused) {
    // Hrdinové, kteří ničí/přepisují vyložené karty, ať vydrží aspoň do chvíle, kdy je stůl
    // dostatečně zralý (G.heroMaturityGate) - jinak jde o plýtvání (typicky "zničit 2 nejvyšší
    // karty", když je na stole jen jedna osamocená karta). Dokud stůl takhle nedozraje, tyhle
    // hrdiny vůbec neuvažujeme.
    if (TABLE_SCALING_HEROES.has(h.id) && maturity < G.heroMaturityGate) continue;
    let score = evalHeroScore(game, player, h.id);
    if (TABLE_SCALING_HEROES.has(h.id)) {
      // I nad rámec minimálního prahu výše: čím zralejší stůl, tím větší "wow moment" dopad -
      // odměň vyčkávání násobkem rostoucím se zralostí stolu (stropováno, ať se nevyplatí čekat
      // donekonečna a propásnout okno úplně).
      score *= Math.min(G.heroMaturityCap, G.heroMaturityBase + maturity * G.heroMaturitySlope);
    }
    if (score > bestScore) { bestScore = score; best = h.id; }
  }
  const threshold = forced ? G.heroForcedThreshold : G.heroFreeThreshold;
  if (best != null && bestScore >= threshold) return { type: 'hero', heroId: best };
  return null;
}

async function maybeReturnOne(game, player) {
  // untargetable (žlutý odpočet) nejde vrátit na ruku ani jinak - v praxi na to už chrání i to,
  // že jeho hodnota je vždy záporná (nikdy nesplní value >= 2), ale kontrola je tu explicitně,
  // aby to platilo i kdyby se pravidlo/hodnoty někdy změnily. Štítovaná karta (shielded) je chráněná
  // stejně.
  const eligible = player.playedThisRound.filter(e => e.active && e.value >= 2 && !e.facedown && !isProtected(e));
  if (eligible.length === 0) return;
  let chosenId;
  if (eligible.length === 1) {
    chosenId = eligible[0].id;
  } else if (player.isHuman) {
    chosenId = await uiHumanChooseReturnCard(game, player, eligible, 'Karta s hodnotou 1 tě nutí vrátit si jednu vyloženou kartu (2+) zpět na ruku. Vyber kterou.');
  } else {
    chosenId = botChooseReturnCard(game, player, eligible);
  }
  const idx = player.playedThisRound.findIndex(e => e.id === chosenId);
  const entry = player.playedThisRound[idx];
  // Karta se nejdřív na chvíli zvýrazní (jinak než při zahrání/schopnosti), pak teprve zmizí ze
  // stolu a vrátí se na ruku.
  await flashEntries(game, [entry], 'return');
  player.playedThisRound.splice(idx, 1);
  player.hand.push({ id: uid('card'), color: entry.color, value: entry.value - (entry.greenDelta || 0) });
  uiLog(`${player.name} musí vrátit kartu ${COLOR_NAME[entry.color]} ${entry.value} zpět na ruku (karta 1).`, 'return-one');
}

// ===================== KOLO =====================

async function playRound(game) {
  const isFirstRound = game.round === 1;
  for (const p of game.players) { p.playedThisRound = []; p.passedThisRound = false; p.activeHeroThisRound = null; }
  game.heroFlags = freshHeroFlags();
  uiLog(`— Kolo ${game.round} — začíná ${game.players[game.startingPlayerIdx].name} —`, 'round-header');
  uiRender(game);

  let queue = seatOrderFrom(game, game.startingPlayerIdx);
  let __turnGuard = 0;
  while (queue.length > 0) {
    __turnGuard++;
    if (__turnGuard > 400) {
      // pojistka proti nekonečné smyčce - vynutí konec kola
      for (const p of queue) p.passedThisRound = true;
      uiLog('Kolo bylo nouzově ukončeno (pojistka proti zacyklení).', 'muted');
      break;
    }
    const player = queue.shift();
    if (player.passedThisRound) continue;
    // Snapshot PŘED tahem - kdyby hráč právě během tohoto tahu zahrál Cecily, přibude do
    // lastCallIds až uvnitř takeTurn (viz heroCecily) a tenhle snapshot ho ještě nezachytí.
    // Díky tomu dostane i samotný sesílatel Cecily ještě jeden regulérní tah navíc (přesně jako
    // všichni ostatní) a je donucen passnout až po něm - ne hned po tahu, kdy Cecily zahrál.
    const wasLastCall = !!(game.heroFlags.lastCallIds && game.heroFlags.lastCallIds.has(player.id));
    await takeTurn(game, player, isFirstRound);
    uiRender(game);
    // Cecily Nevillová: kdo byl "na řadě" už v okamžiku zahrání (viz snapshot výše), dostal přesně
    // tenhle jeden tah navíc, a hned poté je donucen passnout, i kdyby jinak chtěl pokračovat.
    if (wasLastCall) {
      if (game.heroFlags.lastCallIds) game.heroFlags.lastCallIds.delete(player.id);
      player.passedThisRound = true;
    }
    if (!player.passedThisRound) queue.push(player);
  }

  await resolveRoundEnd(game, isFirstRound);
}

function rankPlayers(game) {
  const n = game.players.length;
  const dist = (seat) => (seat - game.startingPlayerIdx + n) % n;
  const inverted = !!(game.heroFlags && game.heroFlags.invertedWinner);
  return [...game.players].filter(p => !p.eliminated).sort((a, b) => {
    const sa = roundSum(a), sb = roundSum(b);
    const cmp = inverted ? (sa - sb) : (sb - sa);
    if (cmp !== 0) return cmp;
    return dist(a.seat) - dist(b.seat);
  });
}

async function resolveRoundEnd(game, isFirstRound) {
  const ranked = rankPlayers(game);
  const winner = ranked[0];
  uiLog(`Kolo vyhrává ${winner.name} (součet ${roundSum(winner)}).`, 'winner');

  // bankované karty jdou natrvalo do panství majitele (pouze pokud přežily kolo - zničená
  // karta v truhle se počítá jako běžné zničení a jde na discard, ne do panství)
  for (const p of game.players) {
    for (const e of p.playedThisRound) {
      if (e.facedown && e.active) {
        p.bankedPool[e.realColor] += 1;
      }
    }
  }

  // vítěz bere pole, na kterém stál
  let claimedTileId = null;
  const winnerTile = winner.currentTileId ? findTile(game, winner.currentTileId) : null;
  if (winnerTile) {
    claimedTileId = winnerTile.id;
    winnerTile.status = 'claimed';
    winnerTile.ownerId = winner.id;
    winner.tilesPool[winnerTile.color] += 1;
    winner.currentTileId = null;
    uiLog(`${winner.name} získává pole ${COLOR_NAME[winnerTile.color]} do svého panství.`, 'claim');
  }

  // vyklizení - vyhozené karty pryč, playedThisRound se vyprázdní
  for (const p of game.players) {
    for (const e of p.playedThisRound) {
      if (e.facedown && e.active) continue; // přežilo kolo, už odešlo do panství výše
      if (e.isNeutralSource) {
        game.neutralDiscard.push({ id: e.id, value: e.neutralValue });
      } else {
        // zahrnuje: normální zahrané karty (zničené i přeživší) i zničené karty v truhle
        p.discardPile.push({ id: e.id, color: e.facedown ? e.realColor : e.color, value: e.value - (e.greenDelta || 0) });
      }
    }
    p.playedThisRound = [];
  }

  uiRender(game);
  await sleep(ROUNDEND_DELAY_MS);

  if (tilesTotal(winner) >= (game.winTiles || 4)) {
    game.phase = 'gameover';
    await finishGame(game);
    return;
  }

  // Zásoba polí došla dřív, než kdokoliv dosáhl vítězného počtu polí (s 11 poli to už není
  // matematicky garantované jako dřív s 13) - hra končí a rozhoduje se stejně jako běžná výhra,
  // podle celkového skóre.
  if (inPlayTiles(game).length === 0) {
    uiLog('Všechna pole už byla obsazena, aniž by kdokoliv dosáhl vítězného počtu — hra končí, rozhoduje se skóre!', 'game-end');
    game.phase = 'gameover';
    await finishGame(game);
    return;
  }

  // vítěz se přesouvá na nové pole
  const freeCandidates = inPlayTiles(game);
  if (freeCandidates.length > 0) {
    let tileId;
    if (winner.isHuman) {
      tileId = await uiHumanChooseTile(game, winner, freeCandidates, 'Vybral jsi kolo! Vyber pole, na které se nyní přesuneš.');
    } else {
      tileId = botChooseTile(game, winner, freeCandidates, false);
    }
    await placeOnTile(game, winner, tileId, false);
  }

  // hráči, kterým bylo právě odebráno pole (sdíleli ho s vítězem), se musí přesunout jinam - za
  // STEJNÝCH podmínek jako kterýkoliv jiný vstup na pole (karta z ruky, nebo 3 z balíčku, pokud je
  // cílové pole obsazené) - vytlačení nikoho neosvobozuje od běžné ceny vstupu, viz placeOnTile.
  if (claimedTileId) {
    const displaced = ranked.filter(p => p.id !== winner.id && p.currentTileId === claimedTileId);
    for (const p of displaced) {
      p.currentTileId = null;
    }
    for (const p of displaced) {
      const cands = inPlayTiles(game);
      if (cands.length === 0) continue;
      let tileId;
      if (p.isHuman) {
        tileId = await uiHumanChooseTile(game, p, cands, 'Přišel jsi o pole — vyber si nové pole.');
      } else {
        tileId = botChooseTile(game, p, cands, false);
      }
      uiLog(`${p.name} byl vytlačen ze svého pole a musí se přesunout.`, 'displaced');
      await placeOnTile(game, p, tileId, false);
    }
  }

  // dobírání
  for (const p of game.players) if (!p.eliminated) drawCards(p, 2);
  // limit karet na ruce - kdo si přes šetření/passování nahromadil víc než HAND_LIMIT, musí přebytek
  // dobrovolně odhodit hned po dobrání, ještě než začne další kolo.
  for (const p of game.players) if (!p.eliminated) await enforceHandLimit(game, p);

  game.startingPlayerIdx = winner.seat;
  game.round += 1;
  uiRender(game);
}

async function finishGame(game) {
  // Při shodě celkového skóre platí stejné pravidlo jako při shodě součtu na konci kola (viz
  // rankPlayers) - rozhoduje pořadí po směru hodinových ručiček od AKTUÁLNÍHO začínajícího hráče,
  // ne ledajaké pořadí v poli hráčů. Bez tohohle by .sort() nechal remízy na svém (stabilním, ale
  // pravidly neopodstatněném) pořadí - a remíza v celkovém skóre není vzácná (v simulacích vychází
  // na cca 1 z 12-15 her), takže by šlo o reálně špatně určeného vítěze, ne jen teoretickou hranu.
  const n = game.players.length;
  const dist = (seat) => (seat - game.startingPlayerIdx + n) % n;
  const scores = game.players.map(p => ({
    player: p,
    breakdown: COLORS.map(c => ({ color: c, tiles: p.tilesPool[c], banked: p.bankedPool[c], points: p.tilesPool[c] * (1 + p.bankedPool[c]) })),
    total: finalScore(p),
  })).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return dist(a.player.seat) - dist(b.player.seat);
  });
  uiLog('Hra končí — sečítáme skóre!', 'game-end');
  await uiAnnounceGameEnd(game, scores);
}

// ===================== AI BOTŮ =====================

// Karta hodnoty 1 má schopnost vrátit si vlastní vyloženou kartu (2+) zpět na ruku - to je reálně
// silnější nástroj než karta hodnoty 2 (viz maybeReturnOne), takže se nemá chovat jako "nejlevnější
// možná" karta na bezmyšlenkovité odhození/zahození. Používá se všude, kde bot vybírá kartu jen
// podle toho, že je "nejlevnější" (platba za vstup na obsazené pole, odhození nad limit ruky,
// bezpečné zahrání proti hrozbě) - všude jinde než v přímém rozhodování hrát/uschovat do truhly, kde je
// hodnota schopnosti zvažována explicitně.
function discardRank(card) {
  return card.value === 1 ? 2.5 : card.value;
}

function botLowestCardId(hand) {
  return hand.reduce((a, b) => (discardRank(b) < discardRank(a) ? b : a)).id;
}

function botChooseReturnCard(game, player, eligible) {
  return withDifficulty(player,
    () => botChooseReturnCardByGenome(game, player, eligible),
    () => eligible.map(e => e.id));
}

function botChooseReturnCardByGenome(game, player, eligible) {
  const tile = findTile(game, player.currentTileId);
  const currentColor = tile ? tile.color : null;
  // Preferuje vrátit kartu barvy pole, na kterém právě stojí - tu totiž může znovu zahrát a
  // spustit tak schopnost pole ještě jednou (kombo). Jinak vezme zpět nejcennější kartu - buď
  // aby ji zahrál pořádně později, nebo aby s ní vybaitil soupeře do zbytečně vysoké výhry kola.
  const comboCandidates = eligible.filter(e => e.color === currentColor);
  if (comboCandidates.length > 0) {
    return comboCandidates.reduce((a, b) => (b.value > a.value ? b : a)).id;
  }
  return eligible.reduce((a, b) => (b.value > a.value ? b : a)).id;
}

function colorSupply(game, color) {
  return inPlayTiles(game).filter(t => t.color === color).length;
}

// Které barvy polí právě "hrozí" - aktivní (nepassnutí) soupeři na nich stojí, takže jejich
// schopnost může tohle kolo ještě zdarma zasáhnout. Veřejná informace (pozice na poli je vidět),
// žádné hádání - používá se pro counterplay (nehrát/neuschovávat do truhly naslepo do hrozby).
function dangerousOpponentColors(game, player) {
  const colors = new Set();
  for (const p of otherActivePlayers(game, player)) {
    if (p.passedThisRound) continue;
    const t = findTile(game, p.currentTileId);
    if (t) colors.add(t.color);
  }
  return colors;
}

// Odhad, jak moc by se PRÁVĚ TEĎ vyplatilo spustit schopnost daného pole - používá se k tomu, aby
// bot neprioritizoval hraní karty jen proto, že "je zadarmo", ale jen když z toho reálně něco má.
// Vyšší číslo = větší cena za nevyužití. Škála je hrubá (řádově 0-5), srovnatelná napříč barvami.
function estimateAbilityValue(game, player, color) {
  const others = otherActivePlayers(game, player);
  if (others.length === 0) return 0;
  const G = player.genome;
  const mySum = roundSum(player);
  const leaderSum = Math.max(...others.map(roundSum));

  if (color === 'R') {
    // Vražda - hodnota roste s tím, kolik bych soupeři sundal a jak blízko jsem mu v součtu.
    const leader = others.reduce((a, b) => (roundSum(b) > roundSum(a) ? b : a));
    const theirActive = leader.playedThisRound.filter(e => e.active && !isProtected(e));
    if (theirActive.length === 0) return 0;
    const theirTop = theirActive.reduce((a, b) => (b.value > a.value ? b : a));
    return Math.min(5, theirTop.value * G.redTopCoeff + (mySum <= leaderSum ? G.redCloseBonus : 0));
  }
  if (color === 'B') {
    // Špionáž - hodnota podle toho, jestli právě dotahuju na vedoucího.
    return mySum <= leaderSum ? G.blueCloseValue : G.blueFarValue;
  }
  if (color === 'Y') {
    const candidates = others.filter(p => p.playedThisRound.some(e => e.active && e.facedown && !isProtected(e)));
    if (candidates.length === 0) return 0;
    const threat = candidates.reduce((a, b) => (tilesTotal(b) > tilesTotal(a) ? b : a));
    return Math.min(5, tilesTotal(threat) * G.yellowTilesCoeff);
  }
  if (color === 'G') {
    if (game.heroFlags && game.heroFlags.noBanking) return 0;
    const cands = others.filter(p => p.hand.length > 0);
    if (cands.length === 0) return 0;
    const bestWaste = Math.max(...cands.map(spyWasteFraction));
    return Math.min(5, 0.8 + bestWaste * 3 + (mySum <= leaderSum + 2 ? G.greenGapBonus : 0));
  }
  if (color === 'S') {
    let bestTargetValue = 0;
    for (const p of others) {
      const theirs = p.playedThisRound.filter(e => e.active && !isProtected(e) && !e.facedown);
      if (theirs.length === 0) continue;
      const top = theirs.reduce((a, b) => (b.value > a.value ? b : a));
      if (top.value > bestTargetValue) bestTargetValue = top.value;
    }
    return Math.min(5, bestTargetValue * G.greyBestTargetCoeff);
  }
  return 0;
}

function roundWinConfidence(game, player) {
  // hrubý odhad, jak jistá je výhra tohoto kola: 'high' | 'medium' | 'low'
  const mySum = roundSum(player);
  const others = otherActivePlayers(game, player);
  if (others.length === 0) return 'high';
  const leaderSum = Math.max(...others.map(roundSum));
  const stillActive = others.filter(p => !p.passedThisRound).length;
  if (mySum > leaderSum) {
    if (stillActive === 0) return 'high'; // všichni ostatní už passli, součet je zamčený v můj prospěch
    return (mySum - leaderSum >= 3) ? 'high' : 'medium';
  }
  return 'low';
}

function botPickGreyGiveEntry(player) {
  const mine = player.playedThisRound.filter(e => e.active && !isProtected(e));
  return withDifficulty(player,
    () => botPickGreyGiveEntryByGenome(player, mine),
    () => mine.map(e => e.id));
}

function botPickGreyGiveEntryByGenome(player, mine) {
  // Nejradši dá pryč banknutou kartu, která je stejně k ničemu (bezbarvý bluff, nebo barva, do
  // které vůbec neinvestuje) - nezničí tím žádnou reálnou šanci na body.
  const uselessBanked = mine.filter(e => e.facedown && (e.realColor === 'N' || player.tilesPool[e.realColor] === 0));
  if (uselessBanked.length > 0) return uselessBanked[0].id;
  // Jinak dá pryč nejnižší AKTIVNÍ (nebanknutou) kartu - nikdy neobětuje reálnou banknutou investici.
  const nonFacedown = mine.filter(e => !e.facedown);
  if (nonFacedown.length > 0) return nonFacedown.reduce((a, b) => (b.value < a.value ? b : a)).id;
  // Jako poslední možnost (samé karty v truhle) vezme tu s nejnižší skutečnou hodnotou.
  return mine.reduce((a, b) => ((a.realValue ?? a.value) <= (b.realValue ?? b.value) ? a : b)).id;
}

function botPickGreyTakeEntry(actingPlayer, target) {
  const theirs = target.playedThisRound.filter(e => e.active && !isProtected(e));
  return withDifficulty(actingPlayer,
    () => theirs.reduce((a, b) => (b.value > a.value ? b : a)).id,
    () => theirs.map(e => e.id));
}

// Kolik z karet na ruce soupeře by mu nucené uschovávání do truhly "zmařilo": bezbarvé a barvy, do kterých
// zatím neinvestuje (nemá pole té barvy) - ty uschováním nic nezískají.
function spyWasteFraction(p) {
  if (p.hand.length === 0) return 0;
  const waste = p.hand.filter(c => c.color === 'N' || p.tilesPool[c.color] === 0).length;
  return waste / p.hand.length;
}
function botSpyTargetScore(p) {
  return spyWasteFraction(p) * 10 + tilesTotal(p) * 0.5 + Math.min(p.hand.length, 6) * 0.1;
}

function botChooseYellowTarget(game, player, candidates) {
  // Bot nevidí skutečnou hodnotu soupeřovy karty v truhle (je tajná až do odhalení), takže nemá
  // podle čeho preferovat jednu před druhou - vybírá čistě náhodně.
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

function botDecideAction(game, player, isFirstRound) {
  return withDifficulty(player,
    () => botDecideActionByGenome(game, player, isFirstRound),
    () => enumerateLegalActions(game, player));
}

function botDecideActionByGenome(game, player, isFirstRound) {
  const G = player.genome;
  const hand = player.hand;
  if (hand.length === 0) {
    // bez karet zbývá jen hrdina (pokud má co zahrát a alespoň trochu se to vyplatí) nebo pass
    const forcedHero = botConsiderHero(game, player, true);
    return forcedHero || { type: 'pass' };
  }
  const heroAction = botConsiderHero(game, player, false);
  if (heroAction) return heroAction;
  const tile = findTile(game, player.currentTileId);
  const currentColor = tile ? tile.color : null;
  const mySum = roundSum(player);
  const others = otherActivePlayers(game, player);
  const activeOthers = (player.smart && sf('canact')) ? others.filter(p => !p.passedThisRound && (p.hand.length > 0 || (game.round > 1 && hasUnusedHero(p)))) : others.filter(p => !p.passedThisRound);
  const leaderSum = others.length ? Math.max(...others.map(roundSum)) : 0;
  // Karty, jejichž hodnota je dočasně zakázaná pro hraní lícem nahoru (York/Edmund), bot z
  // nabídky "zahrát" úplně vyřazuje - uschovat do truhly je pořád může (viz bankCandidates níže).
  const playableHand = hand.filter(c => !cardPlayBanned(game, c));
  const matching = playableHand.filter(c => c.color === currentColor).sort((a, b) => b.value - a.value);
  const highest = playableHand.length ? playableHand.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  // "Bezpečná" nejlevnější karta pro obranné/výplňové zahrání - karta hodnoty 1 se do tohohle
  // výběru počítá až za hodnotu 2 (viz discardRank), protože její schopnost vrátit vlastní vyloženou
  // kartu zpět na ruku je reálně silnější než jen hodnota 2 - není to "levná" karta na zahození.
  const lowest = playableHand.length ? playableHand.reduce((a, b) => (discardRank(b) < discardRank(a) ? b : a)) : null;
  const ones = playableHand.filter(c => c.value === 1);
  const confidence = roundWinConfidence(game, player);
  const gapToLeader = leaderSum - mySum;
  const stakes = (player.smart && sf('stakes')) ? smartStakes(game, player) : null;
  const worthChasing = confidence !== 'low' || gapToLeader <= 2 || !!stakes;

  // Counterplay: na jakých barvách polí právě stojí aktivní (nepassnutí) soupeři - to jsou
  // schopnosti, které je ještě tohle kolo mohou zdarma zasáhnout. Veřejná informace (pozice na
  // poli je vidět), žádné hádání.
  const danger = dangerousOpponentColors(game, player);
  const redOrGreyLive = danger.has('R') || danger.has('S'); // Vražda/Svatba můžou zasáhnout vyloženou kartu
  const yellowLive = danger.has('Y'); // Úplatky můžou zasáhnout banknutou kartu

  // Jak moc by se PRÁVĚ TEĎ vyplatilo spustit schopnost pole, na kterém stojím - rozhoduje, jestli
  // je vůbec vhodné prioritizovat zahrání odpovídající barvy, nebo je lepší uschovávat do truhly/hrát bezpečně
  // a schopnost nechat na chvíli, kdy bude mít reálný dopad (bod je víc než "zadarmo" spuštěná
  // schopnost bez efektu).
  const abilityVal = currentColor ? estimateAbilityValue(game, player, currentColor) : 0;
  const abilityWorthChasing = abilityVal >= G.abilityWorthChasingThreshold;

  // Uschovávání do truhly: barvy, které už vlastní jako pole, jsou vždy bezpečná investice. Barvu pole, na
  // kterém právě stojí, uschovává do truhly jen když je buď dost jistý, že tohle kolo vyhraje (a pole tedy
  // získá), nebo když je té barvy v panství ještě dost na to, aby měl rozumnou šanci ji získat i
  // příště - jinak by šlo o zbytečně riskantní sázku na barvu, kterou možná nikdy nezíská.
  const noBanking = !!(game.heroFlags && game.heroFlags.noBanking);
  const ownedColors = COLORS.filter(c => player.tilesPool[c] > 0);
  const investColors = new Set(ownedColors);
  const speculativeOk = currentColor && (confidence === 'high' || colorSupply(game, currentColor) >= 2);
  if (speculativeOk) investColors.add(currentColor);
  const bankCandidates = noBanking ? [] : hand.filter(c => investColors.has(c.color)).sort((a, b) => a.value - b.value);
  if (player.smart && sf('bankorder') && bankCandidates.length > 1) {
    // uschovat do truhly nejdřív kartu barvy, kde mám nejvíc polí (každá karta v truhle násobí všechna ta pole), pak nejlevnější
    const w = (c) => player.tilesPool[c.color] * 10 - c.value + (c.color === currentColor && player.tilesPool[c.color] === 0 ? 3 : 0);
    bankCandidates.sort((a, b) => w(b) - w(a));
  }
  function tryBank() {
    if (bankCandidates.length === 0) return null;
    return { type: 'bank', cardId: bankCandidates[0].id };
  }

  if (player.smart && sf('finisher') && activeOthers.length === 0 && others.length > 0) {
    const mc = (typeof SMART_P !== 'undefined' && SMART_P.finCost != null) ? SMART_P.finCost : 7;
    const fin = smartFinisher(game, player, others, investColors, noBanking, mc);
    if (fin) return fin;
  }
  if (player.smart && sf('hopeless') && others.length > 0) {
    // Beznadějné kolo: i kdybych vyložil svoje 3 nejvyšší karty, na vedoucího nedosáhnu -> neplýtvat.
    const gapH = sumNeededToLead(game, player, others) - mySum;
    const hopeN = (typeof SMART_P !== 'undefined' && SMART_P.hopeN) || 1;
    const SP = (typeof SMART_P !== 'undefined') ? SMART_P : {};
    const hopeSlack = activeOthers.length > 0 ? (SP.slackA != null ? SP.slackA : 2) : (SP.slackL != null ? SP.slackL : 0);
    const top3 = playableHand.map(c => c.value).sort((a, b) => b - a).slice(0, hopeN).reduce((a, b) => a + b, 0) + hopeSlack;
    if (gapH > top3) {
      const b = yellowLive ? null : tryBank(); if (b) return b;
      return { type: 'pass' };
    }
  }
  // Poslední karta v beznadějném kole: zahrát ji naplno (bez užitku) je zbytečná ztráta - karta by
  // jen propadla, zatímco na ruce by přežila do příštího kola. Uschovávání do truhly je v pořádku (jde do
  // bodů), stejně jako zahrání, pokud by schopnost pole reálně ještě k něčemu byla (viz
  // abilityWorthChasing níže - třeba oslabit vedoucího i bez naděje na výhru kola samotného).
  // Vyhodnoceno TEĎ, deterministicky - ne přes náhodnou "vzdát kolo" šanci níže, protože u úplně
  // poslední karty už není co "postupně" zvažovat přes další tahy.
  if (hand.length === 1 && !worthChasing) {
    const b = tryBank(); if (b) return b;
    if (!(matching.length > 0 && abilityWorthChasing)) return { type: 'pass' };
  }

  // šance, že bot preferuje uschovávání do truhly před hraním "naslepo" na vysoký součet - boti mají
  // primárně sbírat body (pole × karty v truhle), ne za každou cenu vyhrávat každé kolo. Když
  // schopnost pole zrovna nestojí za honění, banking se stává ještě lákavější (proč riskovat
  // vysokou kartu na abilitu, co teď nic nepřinese); naopak když abilita reálně pomůže, banking
  // ustupuje. A pokud soupeř stojí na Úplatcích a ještě nepassnul, uschovávání do truhly téměř úplně utlumíme -
  // karta v truhle je jeho volný terč, dokud nepasne.
  let bankChance = G.bankChanceBase;
  if (matching.length > 0 && !abilityWorthChasing) bankChance = Math.min(G.bankChanceCap, bankChance + G.bankChanceAbilityLowBump);
  if (matching.length > 0 && abilityWorthChasing) bankChance = Math.max(G.bankChanceFloor, bankChance - G.bankChanceAbilityHighDrop);
  if (yellowLive) bankChance *= G.bankChanceYellowMult;
  const wantsBank = bankCandidates.length > 0 && Math.random() < bankChance && !(stakes && confidence !== 'high');

  // Vzdát kolo: pokud honba za výhrou nevypadá slibně, bot raději šetří karty do dalšího kola
  // místo aby je zbytečně utrácel - vytváří to napětí a nutí soupeře hádat, jestli ještě hraje,
  // nebo už dávno "spí". Míra ochoty vzdát se je jiná pro každý styl (hoarder nejvíc, aggressive
  // nejmíň). Tohle je vyhodnoceno na KAŽDÉM tahu (ne jen jednou za kolo) - protože únava ruky se
  // musí umět zhoršovat, jak se ruka postupně tenčí v průběhu kola. Aby to ale nekolabovalo do
  // téměř jistého passu po pár tazích (jako dřív), používáme malé šance NA TAH, ne na kolo -
  // teprve jejich kumulace v čase (a únava rostoucí s tenčí rukou) dělá pozdější tahy v kole
  // čím dál opatrnější, ne jeden umělý "hod kostkou" hned na začátku.
  //
  // Nezávisle na "nevyplatí se to honit" platí i "únava ruky": čím míň karet bot drží (zejména
  // 5 a méně), tím větší šanci má na pas i v kole, které by jinak ještě klidně honil - jinak se
  // v prvních kolech vykartuje a v dalších už nemá co hrát. Neplatí, pokud kolo aktuálně jasně
  // vede (confidence 'high') - tam se vyplatí to dohrát a pole opravdu získat, ne ho zahodit
  // kvůli únavě. V 1. kole navíc přidáváme malou vrozenou opatrnost - ještě nevím, co soupeři
  // drží ani co bankují, takže není důvod pálit karty na kolo, které nemá žádnou zvláštní hodnotu
  // navíc oproti kterémukoliv jinému.
  const baseConserveChance = G.conserveChanceBase;
  const fatigueChance = confidence === 'high' ? 0 : Math.min(G.fatigueCap, Math.max(0, (G.fatigueHandThreshold - hand.length) * G.fatigueSlope));
  const firstRoundCaution = isFirstRound ? G.firstRoundCaution : 0;
  // Riskovat vysokou kartu do honby, když soupeř stojí na Vraždě/Svatbě a nevedu jasně, je
  // zbytečné vystavování terče - o něco raději šetřím a nechám soupeře, ať se poperou mezi sebou.
  const riskChance = (redOrGreyLive && confidence !== 'high') ? G.riskChanceWhenThreatened : 0;
  const conserveChance = Math.max(baseConserveChance, fatigueChance, firstRoundCaution, riskChance);
  if (!stakes && (!worthChasing || fatigueChance > 0 || firstRoundCaution > 0 || riskChance > 0)) {
    if (Math.random() < conserveChance) {
      // Když se kolo vzdává a soupeř zrovna hrozí Úplatky, banking teď nemá cenu (jen bych
      // vystavil čerstvě banknutou kartu jeho schopnosti) - radši rovnou pass.
      if (!yellowLive) {
        const b = tryBank(); if (b) return b;
      }
      return { type: 'pass' };
    }
  }

  // Komfortně vede - zamkne si výhru a nezvyšuje součet zbytečně (práh dle genomu).
  const aheadMargin = player.smart ? (typeof SMART_P !== 'undefined' && SMART_P.ahead != null ? SMART_P.ahead : G.aheadMargin) : G.aheadMargin;
  const needLead = player.smart ? sumNeededToLead(game, player, others) : null;
  if (mySum > leaderSum + aheadMargin || (activeOthers.length === 0 && ((player.smart && sf('tie')) ? mySum >= needLead : mySum >= leaderSum))) {
    const b = tryBank(); if (b) return b;
    return { type: 'pass' };
  }

  if (wantsBank) { const b = tryBank(); if (b) return b; }

  if (!highest) {
    // vůbec nic se nedá zahrát lícem nahoru (York/Edmund zabrali celou ruku) - zbývá uschovat do truhly,
    // nebo passnout.
    const b = tryBank(); if (b) return b;
    return { type: 'pass' };
  }

  // Má-li bot na stole ohroženou nechráněnou kartu hodnoty 3+ a v ruce jedničku, zatímco aktivní
  // soupeř hrozí Vraždou/Svatbou a kolo jasně nevede, je zahrání jedničky chytrý tah - schopností
  // "vrátit kartu" si tu ohroženou kartu vezme zpátky na ruku dřív, než o ni přijde zadarmo.
  // Počítáno zvlášť nahoře, ať to neschová jiná podmínka (např. abilityWorthChasing).
  const oneRescueTarget = redOrGreyLive && confidence !== 'high' && ones.length > 0 &&
    player.playedThisRound.some(e => e.active && e.value >= 3 && !e.facedown && !isProtected(e));

  // "Hoardovací" preference (dřív pevně svázaná se stylem 'hoarder'): mimo endgame ještě šetřit a
  // hrát levné výplňové karty, dokud to jde. Teď kontinuální - G.hoardingTendency (0-1) je šance,
  // že se tahle preference na daném tahu vůbec zvažuje, G.hoardingTileGate nahrazuje dřívější
  // pevnou mez "< 3 pole".
  const hoardingNow = G.hoardingTendency > 0 && Math.random() < G.hoardingTendency && tilesTotal(player) < G.hoardingTileGate;

  let card;
  if (oneRescueTarget) {
    card = ones[0];
  } else if (hoardingNow) {
    // Hodnota 1 se do "levných" nepočítá vůbec (i mezi neutrálními kartami - neutrální balíček v
    // ruce obsahuje hodnoty 0-6, takže i neutrální jednička je pořád jednička), je to tahově silná
    // karta, ne fodder.
    const filler = playableHand.filter(c => c.value !== 1 && (c.color === 'N' || c.value <= 2));
    card = filler.length ? filler.reduce((a, b) => (b.value < a.value ? b : a)) : playableHand.reduce((a, b) => (discardRank(b) < discardRank(a) ? b : a));
  } else if (matching.length > 0 && (abilityWorthChasing || matching[0].value !== 1)) {
    // Schopnost pole buď teď reálně pomůže (viz estimateAbilityValue), nebo zahrání téhle karty
    // stejně nic nestojí navíc, protože to není jednička - žádný důvod ji schovávat.
    card = matching[0];
  } else if (redOrGreyLive && confidence !== 'high' && lowest) {
    // Soupeř stojí na Vraždě/Svatbě a nevedu jasně - nevystavuju zbytečně svou nejlepší kartu
    // jako terč, radši hraju bezpečně nízkou (ale ne jedničku jen tak - viz discardRank) a lepší
    // karty schovávám na později/uschovávání do truhly.
    card = lowest;
  } else if (matching.length > 0) {
    // Zbývá případ: jediná odpovídající karta JE jednička a schopnost teď nestojí za honění -
    // neplýtvat jí na bezcenné spuštění, zahrát radši normálně nejvyšší kartou a jedničku si
    // nechat na později (na skutečnou záchranu, kombo, nebo bezpečný pozdější tah).
    card = highest.value !== 1 ? highest : matching[0];
  } else {
    card = highest;
  }
  if (player.smart && sf('mincard') && !redOrGreyLive) { const sc = smartPickCard(game, player, card, playableHand, matching, currentColor, mySum, leaderSum, others); if (sc) card = sc; }
  return { type: 'play', cardId: card.id };
}

function botUseFavorToken(game, player, currentColor) {
  return withDifficulty(player,
    () => botUseFavorTokenByGenome(game, player, currentColor),
    () => [true, false]);
}

function botUseFavorTokenByGenome(game, player, currentColor) {
  const G = player.genome;
  const mySum = roundSum(player);
  const others = otherActivePlayers(game, player);
  if (others.length === 0) return false;
  if (game.heroFlags && game.heroFlags.noNeutralCards && currentColor === 'B') return false;
  const leaderSum = Math.max(...others.map(roundSum));

  if (currentColor === 'R') {
    // Vraždu použije jen když by zabití soupeřovy nejlepší karty skutečně zvrátilo kolo v jeho
    // prospěch - ne naslepo. Cílem je přirozeně aktuální lídr kola.
    const leader = others.reduce((a, b) => (roundSum(b) > roundSum(a) ? b : a));
    const theirActive = leader.playedThisRound.filter(e => e.active && !isProtected(e));
    if (theirActive.length === 0) return false;
    const theirTop = theirActive.reduce((a, b) => (b.value > a.value ? b : a));
    const leaderSumWithoutTop = roundSum(leader) - theirTop.value;
    return mySum <= leaderSum && mySum > leaderSumWithoutTop - G.redTokenMargin;
  }

  if (currentColor === 'B') {
    // Podporu církve použije jen když ještě nevede - honit součet, když už vyhrává, je zbytečné.
    return mySum <= leaderSum + G.blueTokenMargin;
  }

  if (currentColor === 'Y') {
    // Úplatky (odhalení a znehodnocení soupeřovy karty v truhle) - cílí na hráče, který má tohle
    // kolo nejvíc karet v truhle (nejvíc co ztratit); pokud nikdo nic banknutého nemá, propadá.
    const candidates = others.filter(p => p.playedThisRound.some(e => e.active && e.facedown && !isProtected(e)));
    if (candidates.length === 0) return false;
    const threat = candidates.reduce((a, b) => (tilesTotal(b) > tilesTotal(a) ? b : a));
    return tilesTotal(threat) >= G.yellowTokenTileThreshold || roundSum(threat) > mySum + G.yellowTokenSumMargin;
  }

  if (currentColor === 'G') {
    // Nucené uschovávání do truhly se vyplatí, jen když je dost pravděpodobné, že soupeři zmaří kartu
    // (barva, kterou nesbírá) - jinak mu spíš pomůžu.
    if (game.heroFlags && game.heroFlags.noBanking) return false;
    const cands = others.filter(p => p.hand.length > 0);
    if (cands.length === 0) return false;
    return Math.max(...cands.map(spyWasteFraction)) >= 0.5;
  }

  if (currentColor === 'S') {
    // Svatbu použije jen když má skutečně co nevýhodně dát (nejlépe bezcennou banknutou kartu)
    // a soupeř má co nabídnout lepšího - jinak škoda žetonu.
    if (!player.playedThisRound.some(e => e.active && !isProtected(e))) return false;
    const giveId = botPickGreyGiveEntry(player);
    const giveEntry = player.playedThisRound.find(e => e.id === giveId);
    const giveValue = giveEntry.facedown ? -1 : giveEntry.value; // bezcenný bluff bank = "levné" dát pryč
    let bestTargetValue = -Infinity;
    for (const p of others) {
      const theirs = p.playedThisRound.filter(e => e.active && !isProtected(e) && !e.facedown);
      if (theirs.length === 0) continue;
      const top = theirs.reduce((a, b) => (b.value > a.value ? b : a));
      if (top.value > bestTargetValue) bestTargetValue = top.value;
    }
    if (bestTargetValue === -Infinity) return false;
    return bestTargetValue > giveValue + G.greyTradeMargin;
  }

  return false;
}

function tileScoreForBot(player, tile, occupantPenalty) {
  const G = player.genome;
  const handMatch = player.hand.filter(c => c.color === tile.color).reduce((s, c) => s + c.value, 0);
  const synergy = player.tilesPool[tile.color] * G.tileSynergyTilesWeight + player.bankedPool[tile.color] * G.tileSynergyBankedWeight;
  const penalty = occupantPenalty ? tile.occupants.length * G.tileOccupantPenalty : 0;
  return handMatch + synergy - penalty;
}

function botChooseTile(game, player, candidates, isInitial) {
  return withDifficulty(player,
    () => botChooseTileByGenome(game, player, candidates, isInitial),
    () => candidates.map(t => t.id));
}

function botChooseTileByGenome(game, player, candidates, isInitial) {
  if (player.smart && sf('tile')) return smartChooseTile(game, player, candidates, isInitial);
  const G = player.genome;
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const t of candidates) {
    const score = tileScoreForBot(player, t, true) + Math.random() * G.tileRandomJitter;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best.id;
}

// ===================== CHYTŘEJŠÍ BOT (player.smart) =====================
// Vrstva nad genomem: explicitní počítání hodnoty polí, sázek kola a kapacity soupeřů.

// Kolik karet barvy c ještě můžu získat (ruka + dobírací balíček) - svůj balíček znám.
function cardsLeftOfColor(player, c) {
  return player.hand.filter(x => x.color === c).length + player.drawPile.filter(x => x.color === c).length;
}

function smartTileValue(game, player, c) {
  const have = player.tilesPool[c], bk = player.bankedPool[c];
  const left = cardsLeftOfColor(player, c);
  // okamžitý zisk z pole + očekávané budoucí uschovávání do truhly karet téhle barvy (každá násobí všechna moje pole c)
  const futureBanks = Math.min(left, 3) * 0.6;
  return (1 + bk) + futureBanks * (have + 1) + have * 0.4;
}

function smartChooseTile(game, player, candidates, isInitial) {
  const G = player.genome;
  let best = candidates[0], bestScore = -Infinity;
  for (const t of candidates) {
    const handMatch = player.hand.filter(c => c.color === t.color).reduce((s, c) => s + c.value, 0);
    let score = smartTileValue(game, player, t.color) * 2.2 + handMatch * 0.5;
    score -= t.occupants.length * G.tileOccupantPenalty;
    score += Math.random() * 0.3;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best.id;
}

// Přepínače chytrých funkcí (pro A/B měření: SMART_P.off = ['tie','bankorder',...]; výchozí vše zapnuto kromě 'stakes')
function sf(name) {
  const P = (typeof SMART_P !== 'undefined') ? SMART_P : null;
  if (name === 'stakes') return !!(P && P.on && P.on.includes('stakes'));
  return !(P && P.off && P.off.includes(name));
}

// Skóre hráče, kdyby kolo vyhrál a získal pole, na kterém stojí.
function scoreIfWinsRound(game, p) {
  const t = p.currentTileId ? findTile(game, p.currentTileId) : null;
  const base = finalScore(p);
  if (!t) return base;
  return base + (1 + p.bankedPool[t.color]) + 0; // nové pole barvy c přidá (1 + banknuté c)
}

// Konec hry v tomhle kole: 'win' = moje výhra kola ukončí hru a vyhraju ji, 'block' = soupeřova
// výhra kola ukončí hru jeho vítězstvím (musím mu ve výhře zabránit), jinak null.
function smartStakes(game, player) {
  const need = game.winTiles || 4;
  const n = game.players.length;
  const dist = (seat) => (seat - game.startingPlayerIdx + n) % n;
  const live = game.players.filter(p => !p.eliminated);
  const scoreNow = new Map(live.map(p => [p.id, finalScore(p)]));
  let threat = null;
  for (const q of live) {
    if (tilesTotal(q) + 1 < need) continue;
    const sq = scoreIfWinsRound(game, q);
    const beaten = live.some(o => o.id !== q.id && (scoreNow.get(o.id) > sq || (scoreNow.get(o.id) === sq && dist(o.seat) < dist(q.seat))));
    if (!beaten) { if (q.id === player.id) return 'win'; threat = q; }
  }
  return threat ? 'block' : null;
}

// "Dorážka": všichni ostatní už passli (nebo nemají co hrát) a já zaostávám - výsledek je tedy
// deterministický. Najde nejlevnější sadu akcí (zahrát kartu = hodnota karty, uschovat do truhly = +1), která mě
// dostane do vedení, a vrátí první akci plánu (nebo null, když to nejde / je to moc drahé).
function smartFinisher(game, player, others, investColors, noBanking, maxCost) {
  const need = sumNeededToLead(game, player, others);
  const gap = need - roundSum(player);
  if (gap <= 0) return null;
  const items = [];
  for (const c of player.hand) {
    if (!cardPlayBanned(game, c)) items.push({ c, type: 'play', gain: c.value, cost: c.value * 0.55 + (c.value === 1 ? 0.4 : 0) });
    if (!noBanking && investColors.has(c.color)) items.push({ c, type: 'bank', gain: (game.heroFlags && game.heroFlags.forceBankedZero) ? 0 : 1, cost: 0.2 + c.value * 0.12 });
  }
  const n = items.length; if (n === 0 || n > 20) return null;
  let best = null, bestCost = Infinity;
  const lim = 1 << Math.min(n, 16);
  for (let m = 1; m < lim; m++) {
    let g = 0, cost = 0; const used = new Set(); let ok = true;
    for (let i = 0; i < n; i++) if (m & (1 << i)) { if (used.has(items[i].c.id)) { ok = false; break; } used.add(items[i].c.id); g += items[i].gain; cost += items[i].cost; }
    if (ok && g >= gap && cost < bestCost) { bestCost = cost; best = m; }
  }
  if (best == null || bestCost > maxCost) return null;
  const plan = []; for (let i = 0; i < n; i++) if (best & (1 << i)) plan.push(items[i]);
  plan.sort((a, b) => b.gain - a.gain);
  const first = plan[0];
  return { type: first.type, cardId: first.c.id };
}

// Kolik musím mít v součtu, abych kolo (právě teď) vedl - respektuje rozhodování remíz (kdo je
// po směru od začínajícího blíž, vyhrává shodu).
function sumNeededToLead(game, player, others) {
  const n = game.players.length;
  const dist = (seat) => (seat - game.startingPlayerIdx + n) % n;
  let need = -Infinity;
  for (const o of others) {
    const req = roundSum(o) + (dist(player.seat) < dist(o.seat) ? 0 : 1);
    if (req > need) need = req;
  }
  return need === -Infinity ? 0 : need;
}

// Z karet, které se hodí zahrát, vybere nejlevnější takovou, která mě vynese do vedení (ne vždy
// nejvyšší kartu) - přebytek je jen zbytečně spálená hodnota. Odpovídající barvu pole upřednostní
// (zdarma schopnost), pokud přeplatek není příliš velký.
function smartPickCard(game, player, defaultCard, playableHand, matching, currentColor, mySum, leaderSum, others) {
  if (others.length === 0) return null;
  const need = sumNeededToLead(game, player, others);
  const gap = need - mySum;
  if (gap <= 0) return null;
  const sufficient = playableHand.filter(c => c.value >= gap);
  if (sufficient.length === 0) return null;
  sufficient.sort((a, b) => (discardRank(a) - discardRank(b)));
  const cheapest = sufficient[0];
  const matchSuff = sufficient.filter(c => c.color === currentColor);
  if (matchSuff.length > 0 && matchSuff[0].value <= cheapest.value + 1) return matchSuff[0];
  return cheapest;
}

// ===================== HLAVNÍ SMYČKA =====================

async function runGame(game) {
  await initialPlacementPhase(game);
  while (game.phase === 'round') {
    await playRound(game);
  }
}

function __auditTotal(game) {
  let total = 0;
  for (const p of game.players) {
    const bankedTotal = Object.values(p.bankedPool).reduce((s, v) => s + v, 0);
    total += p.hand.length + p.drawPile.length + p.discardPile.length + p.playedThisRound.length + bankedTotal;
  }
  return total;
}

async function takeTurn(game, player, isFirstRound) {
  if (player.hand.length === 0 && !hasUnusedHero(player)) {
    player.passedThisRound = true;
    uiLog(`${player.name} nemá karty na ruce ani hrdiny a musí passnout.`, 'muted');
    return;
  }
  let action;
  if (player.isHuman) {
    action = await uiHumanChooseAction(game, player);
  } else {
    await sleep(BOT_DELAY_MS);
    action = botDecideAction(game, player, isFirstRound);
  }

  if (action.type === 'pass') {
    player.passedThisRound = true;
    uiLog(`${player.name} passuje.`, 'pass');
    return;
  }

  if (action.type === 'hero') {
    await playHero(game, player, action.heroId);
    return;
  }

  const idx = player.hand.findIndex(c => c.id === action.cardId);
  const card = player.hand[idx];
  if (!card) { player.passedThisRound = true; return; }

  if (action.type === 'bank' && game.heroFlags && game.heroFlags.noBanking) {
    // ochranná pojistka - bot/UI by tuhle volbu neměly nabízet, dokud platí Henry VI.
    uiLog(`${player.name} nemůže uschovávat do truhly - uschovávání do truhly je dočasně zakázané (Henry VI.). Passuje.`, 'muted');
    player.passedThisRound = true;
    return;
  }
  if (action.type === 'play' && cardPlayBanned(game, card)) {
    // ochranná pojistka - hodnota je dočasně zakázaná pro hraní lícem nahoru (York/Edmund),
    // nebo jde o bezbarvou kartu a bezbarvé karty jsou dočasně zakázané (Jindřich VI.).
    const reason = card.color === 'N' && game.heroFlags && game.heroFlags.noNeutralCards
      ? 'bezbarvé karty jsou dočasně zakázané'
      : 'tuhle hodnotu nelze zahrát lícem nahoru';
    uiLog(`${player.name} nemůže zahrát tuto kartu - ${reason}. Passuje.`, 'muted');
    player.passedThisRound = true;
    return;
  }

  player.hand.splice(idx, 1);
  const tile = findTile(game, player.currentTileId);
  const currentColor = tile ? tile.color : null;

  if (action.type === 'bank') {
    // libovolná barva (i bezbarvá) se dá uschovat do truhly - bezbarvá karta nikdy neskóruje (žádné pole
    // není bezbarvé), ale právě proto je to legitimní blaf: soupeři nevidí, co jsi banknul.
    const bankedForcedZero = !!(game.heroFlags && game.heroFlags.forceBankedZero); // Edward IV.
    const placeholderValue = bankedForcedZero ? 0 : 1;
    const entry = { id: uid('play'), color: 'N', realColor: card.color, realValue: card.value, value: placeholderValue, originalValue: placeholderValue, active: true, facedown: true };
    player.playedThisRound.push(entry);
    uiLog(`${player.name} uschovává do truhly kartu lícem dolů (hodnota ${placeholderValue}).`, 'bank');
    await flashEntries(game, [entry], 'play');
    return;
  }

  // action.type === 'play'
  const entry = { id: uid('play'), color: card.color, realColor: card.color, value: card.value, originalValue: card.value, active: true, facedown: false };
  if (game.heroFlags && game.heroFlags.forceValueOne) entry.value = 1; // Edward IV.
  player.playedThisRound.push(entry);
  uiLog(`${player.name} hraje ${COLOR_NAME[card.color]} ${card.value}.`, 'play');
  // Krok 1: zahraná karta se na chvíli zvýrazní, ať je vidět, že přibyla na stůl, než se stane
  // cokoliv dalšího (schopnost, vrácení karty na ruku...).
  await flashEntries(game, [entry], 'play');

  // Krok 2: pokud karta spustí schopnost pole zdarma (barva karty odpovídá poli, na kterém stojím),
  // ta se vyhodnotí hned (a zasažené karty se zvýrazní samy).
  if (currentColor && card.color === currentColor) {
    await triggerAbility(game, currentColor, player, false);
  }
  // Krok 3: žeton přízně jde použít jen když právě zahraná karta NENÍ barvy pole, na kterém stojím -
  // pokud by byla, schopnost už proběhla zdarma výše a žeton by ji spustil podruhé. Pod Příměřím
  // se žeton nabízet vůbec nemá, protože schopnost by stejně jen propadla. Tohle musí proběhnout
  // PŘED krokem s kartou hodnoty 1 (viz krok 4) - žeton (např. svatba/prohození karet) se má
  // stihnout vyhodnotit dřív, než se hráč rozhoduje, kterou svou kartu vrátí zpět na ruku.
  if (!abilitiesDisabled(game) && player.favorTokens > 0 && currentColor && card.color !== currentColor) {
    // Stolní UI (drag and drop) si volbu "zahrát se žetonem" vybere už při položení karty do
    // příslušného okna - action.useToken je pak true/false a zbytečně se neptáme podruhé. Starší UI
    // a testy action.useToken nenastavují (undefined) a dostanou dosavadní dotaz Ano/Ne.
    const use = player.isHuman
      ? ((action.useToken === true || action.useToken === false)
          ? action.useToken
          : await uiHumanYesNo(game, player, `Chceš použít žeton přízně a spustit schopnost pole (${COLOR_ABILITY_NAME[currentColor]})? Zbývá ti ${player.favorTokens}.`))
      : botUseFavorToken(game, player, currentColor);
    if (use) {
      player.favorTokens -= 1;
      // Trvalý vizuální otisk na kartě, která žeton spustila - zůstává vidět až do konce kola.
      entry.favorUsed = true;
      uiLog(`${player.name} používá žeton přízně (${COLOR_ABILITY_NAME[currentColor]}).`, 'favor');
      await triggerAbility(game, currentColor, player, true);
    }
  }
  // Krok 4: karta s hodnotou 1 nutí vrátit jinou vyloženou kartu zpět na ruku (zvýrazní se sama) -
  // až úplně naposled, po vyhodnocení schopnosti (ať už zdarma podle pole, nebo přes žeton), aby
  // hráč věděl přesně, jak stůl vypadá (např. po prohození kartou svatby), než si vybírá, kterou
  // vlastní kartu vrátí. Pokud platí Příměří (Margaret Beaufort), tohle pravidlo do konce kola padá.
  if (card.value === 1) {
    if (abilitiesDisabled(game)) {
      uiLog(`${player.name} zahrál kartu s hodnotou 1, ale vracení karty je díky Příměří zrušené.`, 'muted');
    } else {
      await maybeReturnOne(game, player);
    }
  }
}
