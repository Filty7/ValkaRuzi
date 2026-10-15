// Headless "UI" stub layer implementing the human-input contract with randomized-but-valid
// choices, used for fast engine-only testing without a DOM. Treats the "human" player 0 the
// same as bots would decide, but through the human-input contract functions so those code
// paths get exercised too.

function uiLog(text, cls) { /* no-op in headless tests */ }

function uiRender(game) { /* no-op in headless tests */ }

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function uiHumanChooseAction(game, player) {
  // mirror botDecideAction's action shape but pick randomly among valid options to fuzz-test
  const hand = player.hand;
  const unusedHeroes = (player.heroes || []).filter(h => !h.used);
  if (unusedHeroes.length > 0 && Math.random() < 0.08) {
    return { type: 'hero', heroId: pick(unusedHeroes).id };
  }
  if (hand.length === 0) return { type: 'pass' };
  const r = Math.random();
  if (r < 0.45) {
    return { type: 'play', cardId: pick(hand).id };
  } else if (r < 0.8) {
    return { type: 'bank', cardId: pick(hand).id };
  }
  return { type: 'pass' };
}

async function uiHumanChooseOpponent(game, player, candidates, promptText) {
  return pick(candidates).id;
}

async function uiHumanChooseCard(game, player, ownerPlayer, promptText) {
  const candidates = ownerPlayer.playedThisRound.filter(e => e.active && !isProtected(e));
  return pick(candidates).id;
}

async function uiHumanChooseHandCard(game, player, promptText) {
  return pick(player.hand).id;
}

async function uiHumanYesNo(game, player, promptText) {
  return Math.random() < 0.5;
}

async function uiHumanChooseTile(game, player, tileCandidates, promptText) {
  return pick(tileCandidates).id;
}

async function uiHumanChooseEntryPayment(game, player, promptText) {
  return pick(['hand', 'deck']);
}

async function uiHumanChooseReturnCard(game, player, eligible, promptText) {
  return pick(eligible).id;
}

async function uiHumanChooseFromEntries(game, player, promptText, entries) {
  return pick(entries).id;
}

async function uiAnnounceRoundEnd(game, ranked, winner) { /* no-op */ }

async function uiAnnounceGameEnd(game, scores) { /* no-op, test harness reads game state directly */ }
