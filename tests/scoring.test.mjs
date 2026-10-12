import test from 'node:test';
import assert from 'node:assert/strict';
import { majorityTarget, scoreRound, isCorrectAnswer, commitResult, remainingMs, formatTime } from '../js/core.js';
import { createSession } from '../js/round.js';

const allVotes = [[1, 0, 0], [1, 0, 1], [1, 2, 0], [1, 2, 1], [2, 0, 0], [2, 0, 1], [2, 2, 0], [2, 2, 1]];

test('3–8 players: every role, tied vote, wrong target, guesses and taboo totals', () => {
  for (let playerCount = 3; playerCount <= 8; playerCount++) {
    const seats = Array.from({ length: playerCount }, (_, i) => i);
    const tied = seats.map(i => (i + 1) % playerCount);
    assert.equal(majorityTarget(tied, playerCount), null);
    for (const special of seats) for (const game of ['liar', 'spy']) {
      const round = { game, playerCount, special, secret: '공항' };
      const caught = seats.map(i => i === special ? (i + 1) % playerCount : special);
      const wrongTarget = (special + 1) % playerCount;
      const mistaken = seats.map(i => i === wrongTarget ? (i + 1) % playerCount : wrongTarget);
      assert.deepEqual(scoreRound(round, { votes: tied }).points, seats.map(i => i === special ? 3 : 0));
      assert.deepEqual(scoreRound(round, { votes: mistaken }).winners, [special]);
      assert.deepEqual(scoreRound(round, { votes: caught, guess: '오답' }).points, seats.map(i => i === special ? 0 : 2));
      if (game === 'liar') assert.deepEqual(scoreRound(round, { votes: caught, guess: '공항' }).winners, [special]);
      else for (const guess of ['공항', '오답']) assert.deepEqual(scoreRound(round, { earlyGuess: true, guess }).winners, guess === '공항' ? [special] : seats.filter(i => i !== special));
      assert.throws(() => scoreRound(round, { votes: caught.slice(1), guess: '공항' }));
      const self = [...caught]; self[special] = special;
      assert.throws(() => scoreRound(round, { votes: self, guess: '공항' }));
    }
    const taboo = scoreRound({ game: 'taboo', playerCount }, { violations: seats.map(i => i % 5) });
    assert.deepEqual(taboo.points, seats.map(i => Math.max(0, 3 - i % 5)));
    assert.deepEqual(taboo.winners, seats.filter(i => i % 5 === 0));
    assert.deepEqual(scoreRound({ game: 'taboo', playerCount }, { violations: seats.map(() => 99) }).winners, seats);
  }
});

test('plurality handles non-majority leaders and partial ties for larger groups', () => {
  assert.equal(majorityTarget([1, 0, 0, 2, 3, 4]), 0); // 2 votes of 6, uniquely highest.
  assert.equal(majorityTarget([1, 0, 0, 1, 2, 3]), null); // 2:2:1:1.
  for (const playerCount of [2, 9, 3.5, '3']) assert.throws(() => scoreRound({ game: 'taboo', playerCount }, { violations: [] }));
});
test('all eight legal voting combinations produce the correct majority or three-way tie', () => {
  for (const votes of allVotes) {
    const counts = [0, 1, 2].map(i => votes.filter(v => v === i).length);
    assert.equal(majorityTarget(votes), counts.some(n => n >= 2) ? counts.findIndex(n => n >= 2) : null);
  }
});
test('rejects missing votes, self votes, invalid seats and non-integers', () => {
  for (const votes of [[], [1, 0], [0, 0, 0], ['', 0, 0], [1, 0, 3], [1, 0, .5], null]) assert.throws(() => majorityTarget(votes));
});
test('liar scoring exhaustively covers every role, voting combination and final guess', () => {
  for (const special of [0, 1, 2]) for (const votes of allVotes) for (const guess of ['우산', '선풍기']) {
    const r = { game: 'liar', special, secret: '우산' };
    const result = scoreRound(r, { votes, guess });
    const wins = majorityTarget(votes) !== special || guess === r.secret;
    assert.deepEqual(result.winners, wins ? [special] : [0, 1, 2].filter(i => i !== special));
    assert.deepEqual(result.points, [0, 1, 2].map(i => wins ? i === special ? 3 : 0 : i === special ? 0 : 2));
    assert.equal(result.guessCorrect, majorityTarget(votes) === special ? guess === r.secret : null);
  }
});
test('caught liar must provide a guess; unexposed liar and ties need no guess', () => {
  assert.throws(() => scoreRound({ game: 'liar', special: 0, secret: '우산' }, { votes: [1, 0, 0] }));
  assert.deepEqual(scoreRound({ game: 'liar', special: 0, secret: '우산' }, { votes: [1, 2, 0] }).points, [3, 0, 0]);
});
test('spy scoring exhaustively covers all roles and legal votes', () => {
  for (const special of [0, 1, 2]) for (const votes of allVotes) {
    const wins = majorityTarget(votes) !== special;
    assert.deepEqual(scoreRound({ game: 'spy', special, secret: '공항' }, { votes }).points, [0, 1, 2].map(i => wins ? i === special ? 3 : 0 : i === special ? 0 : 2));
  }
});
test('spy early location guess settles the round without votes', () => {
  for (const special of [0, 1, 2]) for (const guess of ['공항', '병원']) {
    const wins = guess === '공항';
    const result = scoreRound({ game: 'spy', special, secret: '공항' }, { earlyGuess: true, guess });
    assert.deepEqual(result.points, [0, 1, 2].map(i => wins ? i === special ? 3 : 0 : i === special ? 0 : 2));
    assert.equal(result.target, null);
  }
  assert.throws(() => scoreRound({ game: 'spy', special: 0, secret: '공항' }, { earlyGuess: true, guess: ' ' }));
});
test('taboo scores, caps at zero, handles two-way/all-way ties and all-zero results', () => {
  for (const [violations, points, winners] of [
    [[0, 1, 2], [3, 2, 1], [0]], [[0, 0, 1], [3, 3, 2], [0, 1]],
    [[1, 0, 0], [2, 3, 3], [1, 2]], [[0, 0, 0], [3, 3, 3], [0, 1, 2]],
    [[3, 4, 99], [0, 0, 0], [0, 1, 2]], [[5, 2, 1], [0, 1, 2], [2]]
  ]) {
    const result = scoreRound({ game: 'taboo' }, { violations });
    assert.deepEqual(result.points, points); assert.deepEqual(result.winners, winners);
  }
  for (const violations of [[], [0, 1], [0, -1, 0], [0, .5, 0], [0, '1', 0], [100, 0, 0]]) assert.throws(() => scoreRound({ game: 'taboo' }, { violations }));
});
test('answers normalize Unicode, whitespace and letter case; do not accept synonyms or substrings', () => {
  assert.equal(isCorrectAnswer(' 우 주 정거장 ', '우주 정거장'), true);
  assert.equal(isCorrectAnswer('ＣＡＦＥ', 'cafe'), true);
  assert.equal(isCorrectAnswer('공항', '공항'), true);
  assert.equal(isCorrectAnswer('공항 터미널', '공항'), false);
  assert.equal(isCorrectAnswer(' ', '공항'), false);
  assert.equal(isCorrectAnswer('비행장', '공항'), false);
});
test('rejects invalid game and hidden-role inputs', () => {
  assert.throws(() => scoreRound({ game: 'unknown' }, {}));
  for (const special of [-1, 3, null, '0']) assert.throws(() => scoreRound({ game: 'spy', special }, { votes: [1, 0, 0] }));
});
test('saving awards points exactly once, preserves source and records capped history', () => {
  const s = createSession(['가', '나', '다'], 'taboo', 'daily', 120);
  s.history = Array.from({ length: 50 }, () => ({ roundId: 'old' }));
  const d = { violations: [0, 1, 2] }, result = scoreRound(s.round, d);
  const next = commitResult(s, result, d, 100);
  assert.deepEqual(s.totals, [0, 0, 0]); assert.equal(s.round.result, null);
  assert.deepEqual(next.totals, [3, 2, 1]); assert.equal(next.round.phase, 'result');
  assert.equal(next.history.length, 50); assert.equal(next.history[0].roundId, s.round.id);
  assert.equal(commitResult(next, result, d, 101), next);
});
test('timer uses the wall clock across suspension, pauses, never goes negative', () => {
  assert.equal(remainingMs({ running: true, deadline: 5000 }, 3000), 2000);
  assert.equal(remainingMs({ running: true, deadline: 5000 }, 9000), 0);
  assert.equal(remainingMs({ running: false, remaining: 1500 }, 9000), 1500);
  assert.equal(formatTime(180000), '03:00'); assert.equal(formatTime(1), '00:01'); assert.equal(formatTime(-1), '00:00');
});
