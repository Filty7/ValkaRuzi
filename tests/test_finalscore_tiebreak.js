// Regrese: shoda v CELKOVÉM finálním skóre (ne jen v součtu kola) musí řešit stejné pravidlo jako
// shoda součtu kola - vítězí hráč nejblíž po směru hodinových ručiček od aktuálního
// startingPlayerIdx. Před opravou finishGame() žádný tiebreak neměl a remíza se řešila (nezáměrně)
// pořadím v poli hráčů, což při startingPlayerIdx != 0 dávalo špatného vítěze.

let captured = null;
async function uiAnnounceGameEnd(game, scores) { captured = scores; }
function uiLog() {}
function uiRender() {}

function mkPlayer(seat, tiles, banked) {
  return {
    id: `p${seat}`, seat, name: `Hráč ${seat}`, isHuman: false, strategyType: 'balanced',
    tilesPool: { R: 0, G: 0, Y: 0, B: 0, S: 0, N: 0, ...tiles },
    bankedPool: { R: 0, G: 0, Y: 0, B: 0, S: 0, N: 0, ...banked },
    heroes: [], eliminated: false,
  };
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log(`FAIL: ${label}`); }
}

async function main() {
  // 4 hráči, všichni s finálním skóre přesně 3 (např. 3 pole té samé barvy, žádné bankování) - čistá
  // remíza mezi VŠEMI. startingPlayerIdx = 2 -> pořadí po směru hodin od seatu 2 je 2,3,0,1, takže
  // vítězem má být seat 2 (nejblíž sám sobě), ne seat 0 (což by vyšlo z pouhého .sort() bez tiebreaku).
  {
    const game = {
      players: [mkPlayer(0, { R: 3 }), mkPlayer(1, { R: 3 }), mkPlayer(2, { R: 3 }), mkPlayer(3, { R: 3 })],
      startingPlayerIdx: 2,
    };
    await finishGame(game);
    check('remíza mezi všemi 4 - vítězí seat nejblíž startingPlayerIdx=2 (tedy seat 2)', captured[0].player.seat === 2);
    check('pořadí zbytku navazuje po směru hodin (3,0,1)', captured[1].player.seat === 3 && captured[2].player.seat === 0 && captured[3].player.seat === 1);
  }

  // Remíza jen mezi 2 hráči (seat 1 a seat 3), seat 0 a 2 mají zjevně nižší skóre. startingPlayerIdx=3
  // -> mezi seat 1 a seat 3 je seat 3 blíž sám sobě (vzdálenost 0) než seat 1 (vzdálenost 2), takže
  // vítězem má být seat 3.
  {
    const game = {
      players: [mkPlayer(0, { R: 1 }), mkPlayer(1, { R: 5 }), mkPlayer(2, { R: 1 }), mkPlayer(3, { R: 5 })],
      startingPlayerIdx: 3,
    };
    await finishGame(game);
    check('remíza jen mezi seat 1 a 3, startingPlayerIdx=3 -> vítězí seat 3', captured[0].player.seat === 3);
    check('druhý v pořadí je ten druhý remízující (seat 1), ne někdo s nižším skóre', captured[1].player.seat === 1);
  }

  // Bez remízy: nejvyšší skóre prostě vyhrává bez ohledu na startingPlayerIdx.
  {
    const game = {
      players: [mkPlayer(0, { R: 1 }), mkPlayer(1, { R: 2 }), mkPlayer(2, { R: 5 }), mkPlayer(3, { R: 3 })],
      startingPlayerIdx: 0,
    };
    await finishGame(game);
    check('bez remízy vyhrává prostě nejvyšší skóre (seat 2)', captured[0].player.seat === 2);
  }

  console.log(`${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exitCode = 1;
}

main().catch(err => { console.error('FATAL', err); process.exitCode = 1; });
