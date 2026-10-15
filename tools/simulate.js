// Velká simulace: N her pro 4 hráče a N her pro 3 hráče, VŠICHNI hráči (včetně "hráče 0") hrají
// přes stejnou bot-AI (botDecideAction/botChooseTile/...), aby šlo měřit vyváženost hry samotné,
// ne rozdíl mezi náhodným fuzz-hráčem a boty. Human-input kontrakt (uiHuman*) by tedy neměl být
// nikdy zavolán - pro jistotu ale má bezpečnostní fallback (náhodná platná volba + counter), aby
// běh 1000+1000 her nespadl kvůli nějaké přehlédnuté vlastnosti.
//
// Spuštění: cat game.js simulate.js > combined_sim.js && node combined_sim.js [N]

BOT_DELAY_MS = 0; PLACEMENT_DELAY_MS = 0; ROUNDEND_DELAY_MS = 0; TURN_STEP_MS = 0;
// I s TURN_STEP_MS=0 volá flashEntries/flashHero pořád setTimeout(0) - v Node.js má reálnou
// (byť malou) režii na časovač, která se u tisíců her ve stovkách volání za hru citelně nasčítá
// (real-time bylo o řád vyšší než user-CPU čas). Pro headless simulaci žádné skutečné čekání
// vůbec nepotřebujeme, takže sleep() přepisujeme na okamžitě vyřešený Promise (plain reassignment,
// ne global.sleep = ..., viz zkušenost z dřívějších testů s concatenovanými soubory).
sleep = function () { return Promise.resolve(); };

function uiLog() {}
function uiRender() {}
async function uiAnnounceRoundEnd() {}

let humanStubCalls = 0;
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
async function uiHumanChooseAction(game, player) {
  humanStubCalls++;
  return player.hand.length ? { type: 'play', cardId: pick(player.hand).id } : { type: 'pass' };
}
async function uiHumanChooseOpponent(game, player, candidates) { humanStubCalls++; return pick(candidates).id; }
async function uiHumanChooseCard(game, player, ownerPlayer) {
  humanStubCalls++;
  return pick(ownerPlayer.playedThisRound.filter(e => e.active && !isProtected(e))).id;
}
async function uiHumanChooseHandCard(game, player) { humanStubCalls++; return pick(player.hand).id; }
async function uiHumanYesNo() { humanStubCalls++; return Math.random() < 0.5; }
async function uiHumanChooseTile(game, player, tileCandidates) { humanStubCalls++; return pick(tileCandidates).id; }
async function uiHumanChooseEntryPayment(game, player) { humanStubCalls++; return pick(['hand', 'deck']); }
async function uiHumanChooseReturnCard(game, player, eligible) { humanStubCalls++; return pick(eligible).id; }
async function uiHumanChooseFromEntries(game, player, promptText, entries) { humanStubCalls++; return pick(entries).id; }

// ---- instrumentace: zachytáváme originály PŘED přepsáním, pak je z obálky voláme dál ----
let currentBucket = null;

const origPlayHero = playHero;
playHero = async function (game, player, heroId) {
  if (currentBucket) {
    currentBucket.heroPlayCount[heroId] = (currentBucket.heroPlayCount[heroId] || 0) + 1;
    (currentBucket.heroPlayRounds[heroId] = currentBucket.heroPlayRounds[heroId] || []).push(game.round);
  }
  return origPlayHero(game, player, heroId);
};

const origTriggerAbility = triggerAbility;
triggerAbility = async function (game, color, actingPlayer, fromFavorToken) {
  if (currentBucket && currentBucket.abilityTrigger[color]) {
    if (fromFavorToken) currentBucket.abilityTrigger[color].favor++;
    else currentBucket.abilityTrigger[color].free++;
  }
  return origTriggerAbility(game, color, actingPlayer, fromFavorToken);
};

const origPlaceOnTile = placeOnTile;
placeOnTile = async function (game, player, tileId, isInitialPlacement) {
  if (currentBucket) {
    const tile = findTile(game, tileId);
    if (tile) currentBucket.tileVisitCount[tile.color] = (currentBucket.tileVisitCount[tile.color] || 0) + 1;
  }
  return origPlaceOnTile(game, player, tileId, isInitialPlacement);
};

async function uiAnnounceGameEnd(game, scores) {
  const b = currentBucket;
  if (!b) return;
  b.games++;
  b.roundsList.push(game.round);

  const winnerEntry = scores[0];
  const winner = winnerEntry.player;
  const total = winnerEntry.total;
  b.winnerScoreList.push(total);

  const second = scores[1];
  if (second) {
    b.marginList.push(total - second.total);
    if (total === second.total) b.tiesCount++;
  }

  for (const e of winnerEntry.breakdown) {
    b.winnerColorPointsRaw[e.color] += e.points;
    if (total > 0) b.winnerColorPoints[e.color] += e.points / total;
  }

  for (const h of (winner.heroes || [])) {
    b.heroWinCount[h.id] = (b.heroWinCount[h.id] || 0) + 1;
  }
  const heldThisGame = new Set();
  for (const p of game.players) for (const h of (p.heroes || [])) heldThisGame.add(h.id);
  for (const id of heldThisGame) b.heroHeldCount[id] = (b.heroHeldCount[id] || 0) + 1;

  b.stratWinCount[winner.strategyType] = (b.stratWinCount[winner.strategyType] || 0) + 1;
  for (const p of game.players) b.stratGameCount[p.strategyType] = (b.stratGameCount[p.strategyType] || 0) + 1;

  b.seatWinCount[winner.seat] = (b.seatWinCount[winner.seat] || 0) + 1;
  b.eliminatedTotal += game.players.filter(p => p.eliminated).length;

  for (const p of game.players) {
    for (const c of COLORS) b.bankedColorTotalAtEnd[c] += p.bankedPool[c];
    b.favorTokensRemainingSum += p.favorTokens;
  }

  for (const e of scores) { b.allScoresSum += e.total; b.allScoresCount++; }
}

function newBucket(numPlayers) {
  const zeroColors = () => ({ R: 0, G: 0, Y: 0, B: 0, S: 0 });
  return {
    numPlayers,
    games: 0,
    timeouts: 0,
    roundsList: [],
    winnerScoreList: [],
    winnerColorPoints: zeroColors(),
    winnerColorPointsRaw: zeroColors(),
    heroHeldCount: {},
    heroWinCount: {},
    heroPlayCount: {},
    heroPlayRounds: {},
    stratWinCount: {},
    stratGameCount: {},
    seatWinCount: {},
    tileVisitCount: zeroColors(),
    abilityTrigger: { R: { free: 0, favor: 0 }, G: { free: 0, favor: 0 }, Y: { free: 0, favor: 0 }, B: { free: 0, favor: 0 }, S: { free: 0, favor: 0 } },
    bankedColorTotalAtEnd: zeroColors(),
    eliminatedTotal: 0,
    favorTokensRemainingSum: 0,
    marginList: [],
    tiesCount: 0,
    allScoresSum: 0,
    allScoresCount: 0,
  };
}

function mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

async function runBatch(numPlayers, N) {
  const bucket = newBucket(numPlayers);
  currentBucket = bucket;
  const baseStrategies = numPlayers === 4
    ? ['balanced', 'aggressive', 'balanced', 'hoarder']
    : ['balanced', 'aggressive', 'hoarder'];
  const MAX_ROUNDS = 60;
  for (let i = 0; i < N; i++) {
    const game = await initGame('Sim', numPlayers);
    // Styl bota se každou hru náhodně zamíchá mezi hráči (ne fixně podle seatu) - jinak by
    // "winrate podle startovní pozice" ve skutečnosti jen kopíroval "winrate podle stylu" (kdyby
    // seat 3 vždy hrál jako hoarder, nešlo by ty dva jevy od sebe rozlišit).
    const shuffledStrategies = shuffle([...baseStrategies]);
    for (let s = 0; s < game.players.length; s++) {
      game.players[s].isHuman = false;
      game.players[s].strategyType = shuffledStrategies[s] || 'balanced';
    }
    let rounds = 0;
    await initialPlacementPhase(game);
    while (game.phase === 'round' && rounds < MAX_ROUNDS) {
      await playRound(game);
      rounds++;
    }
    if (game.phase !== 'gameover') bucket.timeouts++;
  }
  return bucket;
}

function report(bucket) {
  const n = bucket.numPlayers;
  console.log(`\n===== ${n} HRÁČI — ${bucket.games} her (timeouty: ${bucket.timeouts}) =====`);
  console.log(`Průměrné kolo konce hry: ${mean(bucket.roundsList).toFixed(2)} (stddev ${stddev(bucket.roundsList).toFixed(2)})`);
  console.log(`Průměrné skóre vítěze: ${mean(bucket.winnerScoreList).toFixed(2)} (stddev ${stddev(bucket.winnerScoreList).toFixed(2)})`);
  console.log(`Průměrné skóre všech hráčů: ${(bucket.allScoresSum / bucket.allScoresCount).toFixed(2)}`);
  console.log(`Průměrný náskok vítěze nad 2. místem: ${mean(bucket.marginList).toFixed(2)} bodů (remíz na 1.-2. místě: ${bucket.tiesCount})`);
  console.log(`Průměrný počet vyřazených hráčů za hru: ${(bucket.eliminatedTotal / bucket.games).toFixed(3)}`);
  console.log(`Průměrně nevyužitých žetonů přízně na hráče na konci hry: ${(bucket.favorTokensRemainingSum / (bucket.games * n)).toFixed(2)} z 3`);

  console.log('\n-- Skladba bodů vítěze podle barvy (průměr přes všechny hry) --');
  for (const c of COLORS) {
    const pct = (bucket.winnerColorPoints[c] / bucket.games) * 100;
    const raw = bucket.winnerColorPointsRaw[c] / bucket.games;
    console.log(`  ${COLOR_NAME[c].padEnd(10)}: ${pct.toFixed(1)}% bodů (průměrně ${raw.toFixed(2)} bodu)`);
  }

  console.log('\n-- Návštěvnost polí podle barvy (všechna umístění/přesuny) --');
  const totalVisits = COLORS.reduce((s, c) => s + bucket.tileVisitCount[c], 0);
  for (const c of COLORS) {
    const v = bucket.tileVisitCount[c];
    console.log(`  ${COLOR_NAME[c].padEnd(10)}: ${v} (${((v / totalVisits) * 100).toFixed(1)}%)`);
  }

  console.log('\n-- Spouštění schopností podle barvy (zdarma vs. žetonem přízně) --');
  const totalTriggers = COLORS.reduce((s, c) => s + bucket.abilityTrigger[c].free + bucket.abilityTrigger[c].favor, 0);
  for (const c of COLORS) {
    const t = bucket.abilityTrigger[c];
    const sum = t.free + t.favor;
    console.log(`  ${COLOR_ABILITY_NAME[c].padEnd(16)}: ${sum} spuštění (${((sum / totalTriggers) * 100).toFixed(1)}%) — zdarma ${t.free}, žetonem ${t.favor} (${sum ? ((t.favor / sum) * 100).toFixed(1) : '0.0'}% žetonem)`);
  }

  console.log('\n-- Banknuté karty přežívající do konce hry, podle barvy (součet přes všechny hráče/hry) --');
  for (const c of COLORS) {
    console.log(`  ${COLOR_NAME[c].padEnd(10)}: průměrně ${(bucket.bankedColorTotalAtEnd[c] / bucket.games).toFixed(2)} na hru`);
  }

  console.log('\n-- Winrate podle herního stylu bota --');
  for (const strat of Object.keys(bucket.stratGameCount)) {
    const wins = bucket.stratWinCount[strat] || 0;
    const games = bucket.stratGameCount[strat];
    console.log(`  ${strat.padEnd(10)}: ${wins}/${games} = ${((wins / games) * 100).toFixed(1)}%`);
  }

  console.log('\n-- Winrate podle startovní pozice (seat) --');
  for (let s = 0; s < n; s++) {
    const wins = bucket.seatWinCount[s] || 0;
    console.log(`  seat ${s}: ${wins}/${bucket.games} = ${((wins / bucket.games) * 100).toFixed(1)}%`);
  }

  console.log('\n-- Hrdinové: podíl her kde byl k dispozici / winrate držitele / míra využití / průměrné kolo zahrání --');
  for (const h of HERO_LIST) {
    const held = bucket.heroHeldCount[h.id] || 0;
    const wins = bucket.heroWinCount[h.id] || 0;
    const plays = bucket.heroPlayCount[h.id] || 0;
    const roundsArr = bucket.heroPlayRounds[h.id] || [];
    const availPct = (held / bucket.games) * 100;
    const winPct = held ? (wins / held) * 100 : NaN;
    const usePct = held ? (plays / held) * 100 : NaN;
    const avgRound = roundsArr.length ? mean(roundsArr) : NaN;
    console.log(`  ${h.name.padEnd(24)} k dispozici ${availPct.toFixed(1)}%  |  winrate držitele ${isNaN(winPct) ? 'n/a' : winPct.toFixed(1) + '%'}  |  využito ${isNaN(usePct) ? 'n/a' : usePct.toFixed(1) + '%'}  |  prům. kolo zahrání ${isNaN(avgRound) ? 'n/a' : avgRound.toFixed(2)}`);
  }
}

async function main() {
  const N = parseInt(process.argv[2] || '1000', 10);
  console.log(`Spouštím simulaci: ${N}x 4 hráči, ${N}x 3 hráči...`);
  const t0 = Date.now();
  const b4 = await runBatch(4, N);
  const b3 = await runBatch(3, N);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  report(b4);
  report(b3);
  console.log(`\nCelkový čas: ${dt}s. Volání human-stub fallbacku (mělo by být 0): ${humanStubCalls}`);

  const fs = require('fs');
  fs.writeFileSync('/tmp/sim_results.json', JSON.stringify({ b4, b3, humanStubCalls }, null, 2));
  console.log('Syrová data uložena do /tmp/sim_results.json');
}

main().catch(err => { console.error('FATAL', err); process.exitCode = 1; });
