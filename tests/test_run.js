// Batch-runs N headless games, validates the 128-card global invariant, and reports stats.
// Run with: cat test_stubs.js game.js test_run.js > combined_test.js && node combined_test.js

BOT_DELAY_MS = 0;
PLACEMENT_DELAY_MS = 0;
ROUNDEND_DELAY_MS = 0;
TURN_STEP_MS = 0;

function globalCardTotal(game) {
  let total = 0;
  for (const p of game.players) {
    total += p.hand.length + p.drawPile.length + p.discardPile.length + p.playedThisRound.length;
    total += Object.values(p.bankedPool).reduce((s, v) => s + v, 0);
  }
  total += game.neutralDeck.length + game.neutralDiscard.length;
  // neutral pool cards are NOT part of the 128 personal-deck total; they're a separate shared
  // pool. So we only assert on personal-deck-derived total below (excluding neutral pool itself,
  // except when a neutral card gets "adopted" into a personal deck via blue+card-1 interaction,
  // in which case it leaves the neutral count and joins a personal pile - that's fine, we just
  // track personal total separately).
  return total;
}

function personalCardTotal(game) {
  let total = 0;
  for (const p of game.players) {
    total += p.hand.length + p.drawPile.length + p.discardPile.length;
    for (const e of p.playedThisRound) {
      if (!e.isNeutralSource) total += 1;
    }
    total += Object.values(p.bankedPool).reduce((s, v) => s + v, 0);
  }
  return total;
}

async function runOne(i) {
  // Střídej 4 a 3 hráče, ať fuzz test pokryje obě varianty stejnou měrou.
  const numPlayers = i % 2 === 0 ? 4 : 3;
  const game = await initGame('Ty', numPlayers);
  let rounds = 0;
  const MAX_ROUNDS = 60;
  await initialPlacementPhase(game);
  while (game.phase === 'round' && rounds < MAX_ROUNDS) {
    await playRound(game);
    rounds++;
  }
  const total = personalCardTotal(game);
  // Každý hráč má svých vlastních 32 karet (25 barevných + 7 neutrálních) - floor škáluje s
  // počtem hráčů (dřív natvrdo 128 = přesně pro 4 hráče). Total může mírně driftovat NAD floor
  // přes známou, pravidly posvěcenou interakci, kdy modrou schopností vytažená neutrální karta je
  // později "adoptována" díky povinnému vrácení karty s hodnotou 1 zpět na ruku a natrvalo se
  // stane součástí hráčova osobního součtu. Cokoliv POD floor, nebo nepřiměřeně velký přebytek,
  // značí skutečnou chybu v počtu karet.
  const floor = 32 * game.players.length;
  const ok = total >= floor && total <= floor + 10;
  if (!ok) {
    console.log(`Game ${i}: MISMATCH total=${total} floor=${floor} rounds=${rounds} phase=${game.phase} numPlayers=${numPlayers}`);
  }
  if (game.phase === 'round' && rounds >= MAX_ROUNDS) {
    // won't happen in practice (pigeonhole bounds this well under 60), kept as a safety report only
  }
  // Zdravotní kontrola vítězného prahu: hra může legitimně skončit i BEZ toho, aby kdokoliv dosáhl
  // winTiles - a to když dojde zásoba polí (11 polí už to na rozdíl od dřívějších 13 matematicky
  // negarantuje, viz resolveRoundEnd fallback). Skutečná chyba je jen tehdy, když hra skončila,
  // nikdo winTiles nedosáhl, A ZÁROVEŇ ještě zbývalo volné pole (tj. fallback neměl vůbec naskočit).
  if (game.phase === 'gameover') {
    const maxTiles = Math.max(...game.players.map(p => COLORS.reduce((s, c) => s + p.tilesPool[c], 0)));
    const poolExhausted = inPlayTiles(game).length === 0;
    if (maxTiles < game.winTiles && !poolExhausted) {
      console.log(`Game ${i}: MISMATCH nikdo nedosáhl winTiles=${game.winTiles} (max=${maxTiles}) numPlayers=${numPlayers}, ale pole ještě nebyla vyčerpána`);
      return { ok: false, rounds, total, phase: game.phase, timedOut: false };
    }
  }
  return { ok, rounds, total, phase: game.phase, timedOut: rounds >= MAX_ROUNDS && game.phase === 'round' };
}

async function main() {
  const N = parseInt(process.argv[2] || '80', 10);
  let mismatches = 0;
  let timeouts = 0;
  let roundsSum = 0;
  let maxRounds = 0;
  for (let i = 0; i < N; i++) {
    const r = await runOne(i);
    if (!r.ok) mismatches++;
    if (r.timedOut) timeouts++;
    roundsSum += r.rounds;
    if (r.rounds > maxRounds) maxRounds = r.rounds;
  }
  console.log(`Ran ${N} games.`);
  console.log(`Card-count mismatches: ${mismatches}`);
  console.log(`Timeouts (>60 rounds, no winner): ${timeouts}`);
  console.log(`Avg rounds: ${(roundsSum / N).toFixed(2)}, max rounds: ${maxRounds}`);
  if (mismatches > 0) process.exitCode = 1;
}

main().catch(err => { console.error('FATAL', err); process.exitCode = 1; });
