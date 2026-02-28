const test = require('node:test');
const assert = require('node:assert/strict');
const { SkullGame, PHASES } = require('../game');

test('basic placement then bid transitions to bidding', () => {
  const g = new SkullGame('r1');
  g.addPlayer('a', 'A');
  g.addPlayer('b', 'B');

  g.placeCard('a', 'flower');
  g.placeCard('b', 'flower');
  assert.equal(g.phase, PHASES.PLACING);

  g.startBid('a', 1);
  assert.equal(g.phase, PHASES.BIDDING);
  assert.equal(g.currentBid, 1);
});

test('pass leads to challenge when only challenger remains', () => {
  const g = new SkullGame('r1');
  g.addPlayer('a', 'A');
  g.addPlayer('b', 'B');

  g.placeCard('a', 'flower');
  g.placeCard('b', 'flower');
  g.startBid('a', 1);
  g.passBid('b');

  assert.equal(g.phase, PHASES.CHALLENGE);
  assert.equal(g.highBidderId, 'a');
});
