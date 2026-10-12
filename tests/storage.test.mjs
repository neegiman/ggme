import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStore, saveStore, validateStore, STORAGE_KEY } from '../js/storage.js';
import { createSession } from '../js/round.js';
import { scoreRound, commitResult } from '../js/core.js';

function memory() { const items = new Map(); return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) }; }
const state = () => ({ version: 2, archive: [], session: createSession(['가', '나', '다'], 'liar', 'daily', 180) });
test('round roles, invite identifiers, totals and paused/running timers survive a storage roundtrip', () => {
  const storage = memory(), value = state();
  value.session.round.timer = { running: true, deadline: Date.now() + 120000, remaining: 120000 };
  assert.equal(saveStore(storage, value), true);
  assert.deepEqual(loadStore(storage).value, value); assert.equal(loadStore(storage).error, null);
});

test('all counts and games restore complete scored sessions without changing roles or totals', () => {
  for (let count = 3; count <= 8; count++) for (const game of ['liar', 'spy', 'taboo']) {
    const storage = memory();
    const value = { version: 2, archive: [], session: createSession(Array.from({ length: count }, (_, i) => `이름${i}`), game, 'daily', 180) };
    const r = value.session.round;
    const decision = game === 'taboo' ? { violations: Array(count).fill(0) } : game === 'spy' ? { earlyGuess: true, guess: r.secret } : { votes: value.session.players.map((_, i) => i === r.special ? (i + 1) % count : r.special), guess: '오답' };
    value.session = commitResult(value.session, scoreRound(r, decision), decision);
    saveStore(storage, value);
    assert.equal(loadStore(storage).error, null);
    assert.deepEqual(loadStore(storage).value, value);
    const bad = structuredClone(value); bad.session.round.playerCount = count === 8 ? 7 : count + 1;
    assert.throws(() => validateStore(bad));
  }
});

test('legacy v0 sessions and completed history migrate without changing scores or raw storage', () => {
  for (const game of ['liar', 'spy', 'taboo']) {
    const value = state(); value.session = createSession(['가', '나', '다'], game, 'daily', 180);
    const r = value.session.round;
    const decision = game === 'taboo' ? { violations: [0, 1, 2] } : { votes: [1, 2, 0] };
    value.session = commitResult(value.session, scoreRound(r, decision), decision);
    value.version = 1; value.session.version = 1; value.session.rules = 'provisional-v0'; delete value.session.round.playerCount;
    value.session.history.forEach(h => { h.rules = 'provisional-v0'; delete h.playerCount; });
    value.archive = structuredClone(value.session.history);
    const raw = JSON.stringify(value), storage = memory(); storage.setItem(STORAGE_KEY, raw);
    const restored = loadStore(storage);
    assert.equal(restored.error, null); assert.equal(restored.value.version, 2);
    assert.equal(restored.value.session.round.playerCount, 3);
    assert.deepEqual(restored.value.session.totals, value.session.totals);
    assert.equal(restored.value.archive[0].rules, 'provisional-v0');
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
});
test('saved results are recomputed on restore and cannot be awarded a second time', () => {
  const storage = memory(), value = state();
  value.session.round = { ...value.session.round, game: 'taboo', words: ['진짜', '아니', '근데'] };
  const decision = { violations: [1, 2, 0] };
  value.session = commitResult(value.session, scoreRound(value.session.round, decision), decision);
  saveStore(storage, value);
  const restored = loadStore(storage).value;
  assert.deepEqual(restored.session.totals, [2, 1, 3]);
  assert.equal(commitResult(restored.session, restored.session.round.result, decision), restored.session);
  value.session.round.result.points = [99, 99, 99];
  assert.throws(() => validateStore(value));
});
test('missing, corrupt, unsupported or blocked storage recovers without crashing or overwriting raw data', () => {
  const storage = memory(); assert.equal(loadStore(storage).value.session, null);
  for (const raw of ['no json', '{}', '{"version":2}', '{"version":1,"archive":[],"session":{}}']) {
    storage.setItem(STORAGE_KEY, raw); assert.ok(loadStore(storage).error); assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.ok(loadStore(blocked).error); assert.equal(saveStore(blocked, state()), false);
});
test('invalid names, roles, private payloads, phases, drafts and timer data are rejected', () => {
  const mutations = [s => s.session.players[1] = s.session.players[0], s => s.session.round.special = 9, s => s.session.round.secret = '', s => s.session.round.phase = 'bad', s => s.session.round.timer.remaining = -1, s => s.session.round.draft.votes = [0, 0, 0], s => s.session.round.draft.guess = 'x'.repeat(81)];
  for (const change of mutations) { const value = state(); change(value); assert.throws(() => validateStore(value)); }
});
