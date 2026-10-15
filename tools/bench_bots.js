// A/B benchmark: 1 "smart" seat vs. (n-1) old bots, seat rotated. Usage: cat game.js bench_bots.js > /tmp/b.js && node /tmp/b.js [games] [players] [smartCount]
BOT_DELAY_MS = 0; PLACEMENT_DELAY_MS = 0; ROUNDEND_DELAY_MS = 0; TURN_STEP_MS = 0;
sleep = function () { return Promise.resolve(); };
function uiLog() {} function uiRender() {}
async function uiAnnounceRoundEnd() {} async function uiAnnounceGameEnd() {}
async function uiHumanChooseReturnCard(game, player, eligible) { return eligible[0].id; }
async function uiHumanChooseFromEntries(game, player, promptText, entries) { return entries[0].id; }
async function playOne(n, smartSeats) {
  const seatDefs = []; for (let i = 0; i < n; i++) seatDefs.push({ name: 'S' + i, isHuman: false, difficulty: 100 });
  const game = await initGameCustom(seatDefs, 1);
  game.players.forEach((p, i) => { p.smart = smartSeats.includes(i); if (p.smart && typeof SMART_P !== 'undefined' && SMART_P.genome) p.genome = clampGenome(Object.assign({}, p.genome, SMART_P.genome)); });
  let rounds = 0;
  await initialPlacementPhase(game);
  while (game.phase === 'round' && rounds < 60) { await playRound(game); rounds++; }
  const scores = game.players.map(p => finalScore(p));
  const n2 = game.players.length;
  const dist = (seat) => (seat - game.startingPlayerIdx + n2) % n2;
  let bi = 0;
  for (let i = 1; i < n2; i++) { if (scores[i] > scores[bi] || (scores[i] === scores[bi] && dist(game.players[i].seat) < dist(game.players[bi].seat))) bi = i; }
  return { winner: bi, rounds };
}
(async () => {
  const N = +process.argv[2] || 600, n = +process.argv[3] || 4, sc = +process.argv[4] || 1;
  let smartWins = 0, games = 0, rs = 0; const t0 = Date.now();
  for (let g = 0; g < N; g++) {
    const seats = []; const off = g % n; for (let k = 0; k < sc; k++) seats.push((off + k) % n);
    const r = await playOne(n, seats);
    games++; rs += r.rounds; if (seats.includes(r.winner)) smartWins++;
  }
  const p = smartWins / games, base = sc / n, se = Math.sqrt(p * (1 - p) / games);
  console.log(`players=${n} smartSeats=${sc} games=${games} smartWin=${(p * 100).toFixed(1)}% (baseline ${(base * 100).toFixed(1)}%, ±${(se * 196).toFixed(1)}pp) avgRounds=${(rs / games).toFixed(1)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
