import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createRound, personalPayload } from '../js/round.js';
import { createResponse, encodeResponse, decodeResponse, importResponse, validateResponse } from '../js/responses.js';
import { validatePayload, makeInvite } from '../js/links.js';
import { validateStore, loadStore, saveStore } from '../js/storage.js';
import { scoreRound, commitResult } from '../js/core.js';
import { createQR } from '../js/qr.js';
import { decodeMatrix } from './qr-helper.mjs';
import jsQR from '../js/vendor/jsqr.mjs';

const session = (game = 'liar', n = 3) => {
  const s = createSession(Array.from({ length: n }, (_, i) => `참가자${i + 1}`), game, 'eraMixed', 180);
  s.round.phase = 'judge'; return s;
};
const vote = (s, seat, target = (seat + 1) % s.players.length) => createResponse(personalPayload(s, seat), 'vote', target + 1);
const guess = (s, value = s.round.secret) => createResponse(personalPayload(s, s.round.special), 'guess', value);
function rejectsUnchanged(s, response) {
  const before = structuredClone(s); assert.throws(() => importResponse(s, response)); assert.deepEqual(s, before);
}

test('3–8 players: v3 cards expose public names and only their own unique reply key', () => {
  for (let n = 3; n <= 8; n++) for (const game of ['liar', 'spy']) {
    const s = session(game, n); assert.equal(new Set(s.round.replyKeys).size, n);
    s.players.forEach((_, i) => {
      const card = personalPayload(s, i); assert.equal(card.v, 3); assert.deepEqual(card.roster, s.players);
      assert.equal(card.replyKey, s.round.replyKeys[i]);
      s.round.replyKeys.forEach((key, j) => { if (j !== i) assert.ok(!JSON.stringify(card).includes(key)); });
      const response = vote(s, i); assert.equal(response.seat, i + 1);
      assert.deepEqual(Object.keys(response).sort(), ['v', 'kind', 'roundId', 'game', 'seat', 'key', 'id', 'type', 'value'].sort());
      assert.ok(!JSON.stringify(response).includes(s.round.secret));
      assert.deepEqual(decodeResponse(encodeResponse(response)), response);
      assert.equal(importResponse(s, response).status, 'applied');
      assert.equal(s.round.draft.votes[i], (i + 1) % n);
    });
    assert.deepEqual(s.totals, Array(n).fill(0)); assert.equal(s.history.length, 0); assert.equal(s.round.result, null);
    validateStore({ version: 2, archive: [], session: s });
  }
});

test('v3 rejects malformed public rosters, mismatched recipients and private metadata', () => {
  const p = personalPayload(session(), 0);
  for (const change of [p => p.roster.pop(), p => p.roster[1] = p.roster[0], p => p.roster[0] = '다른이름', p => p.replyKey = 'bad', p => p.roster[1] = ' name ', p => p.allKeys = []]) {
    const bad = structuredClone(p); change(bad); assert.throws(() => validatePayload(bad));
  }
});

test('legacy rounds keep v2 cards and manual drafts; taboo has no response keys', () => {
  const s = session(); delete s.round.replyKeys; delete s.round.received;
  const p = personalPayload(s, 0); assert.equal(p.v, 2); assert.throws(() => createResponse(p, 'vote', 2));
  validateStore({ version: 2, session: s, archive: [] });
  const t = session('taboo'); assert.equal(personalPayload(t, 0).v, 2); assert.equal(t.round.replyKeys, undefined);
});

test('response codec rejects invitation URLs, malformed encodings and extra/private fields', () => {
  const s = session(), p = vote(s, 0);
  for (const code of ['', null, makeInvite(personalPayload(s, 0), 'https://example.test/ggme/'), 'GGME-REPLY:1:%%%', 'GGME-REPLY:1:wyg', 'GGME-REPLY:2:aaa', 'GGME-REPLY:1:' + 'a'.repeat(2100)]) assert.throws(() => decodeResponse(code));
  for (const change of [p => p.v = 2, p => p.game = 'taboo', p => p.seat = 9, p => p.value = 1, p => p.value = '2', p => p.id = 'bad', p => p.key = '', p => p.kind = 'other', p => p.secret = 'leak']) {
    const bad = structuredClone(p); change(bad); assert.throws(() => validateResponse(bad));
  }
  const card = personalPayload(s, s.round.special);
  for (const value of ['', '   ', 'x'.repeat(81), 'x\nY', 'x\u202eY']) assert.throws(() => createResponse(card, 'guess', value));
  assert.equal(createResponse(card, 'guess', '  <img src=x onerror=alert(1)>  ').value, '<img src=x onerror=alert(1)>');
});

test('wrong round, game, key, seat, self-vote, nonexistent target and non-judge imports do not mutate', () => {
  const s = session(), p = vote(s, 0);
  for (const bad of [{ ...p, roundId: '0'.repeat(24) }, { ...p, game: 'spy' }, { ...p, key: '0'.repeat(24) }, { ...p, seat: 8 }, { ...p, value: 1 }, { ...p, value: 8 }]) rejectsUnchanged(s, bad);
  for (const phase of ['invite', 'play', 'result']) { const other = structuredClone(s); other.round.phase = phase; rejectsUnchanged(other, p); }
});

test('duplicate and older response IDs never overwrite a changed vote, including after refresh', () => {
  const s = session(), first = vote(s, 0, 1), second = vote(s, 0, 2);
  importResponse(s, first); importResponse(s, second);
  assert.equal(importResponse(s, first).status, 'duplicate'); assert.equal(s.round.draft.votes[0], 2);
  s.round.draft.votes[0] = 1; s.round.received.votes[0] = null;
  const items = new Map(), storage = { setItem: (k, v) => items.set(k, v), getItem: k => items.get(k) };
  saveStore(storage, { version: 2, archive: [], session: s }); const restored = loadStore(storage).value.session;
  assert.equal(importResponse(restored, second).status, 'duplicate'); assert.equal(restored.round.draft.votes[0], 1);
  assert.deepEqual(restored.round.received.seen, [first.id, second.id]);
});

test('liar guess is accepted only from the actual liar after host locks votes that identify them', () => {
  const s = session(), r = s.round, p = guess(s);
  rejectsUnchanged(s, p);
  const citizen = (r.special + 1) % 3;
  assert.throws(() => createResponse(personalPayload(s, citizen), 'guess', r.secret));
  const forged = { ...p, seat: citizen + 1, key: r.replyKeys[citizen] }; rejectsUnchanged(s, forged);
  r.draft.votes = s.players.map((_, i) => i === r.special ? citizen : r.special); r.votesLocked = true;
  assert.equal(importResponse(s, p).status, 'applied'); assert.equal(r.draft.guess, r.secret);
  rejectsUnchanged(s, vote(s, citizen)); assert.equal(r.result, null); assert.deepEqual(s.totals, [0, 0, 0]);
  const decision = { votes: r.draft.votes, guess: r.draft.guess };
  const complete = commitResult(s, scoreRound(r, decision), decision);
  assert.equal(complete.totals[r.special], 3); assert.equal(complete.history.length, 1);
  rejectsUnchanged(complete, guess(complete, '다른 추측'));
});

test('liar wrong-target guess is rejected even with forged lock state', () => {
  const s = session(), wrong = (s.round.special + 1) % 3;
  s.round.draft.votes = s.players.map((_, i) => i === wrong ? (i + 1) % 3 : wrong); s.round.votesLocked = true;
  rejectsUnchanged(s, guess(s));
});

test('spy guess imports an early-guess draft, blocks votes and still needs host scoring', () => {
  for (const correct of [true, false]) {
    const s = session('spy', 8), p = guess(s, correct ? s.round.secret : '모름');
    importResponse(s, p); assert.equal(s.round.draft.earlyGuess, true); assert.equal(s.round.result, null);
    rejectsUnchanged(s, vote(s, 0));
    const decision = { earlyGuess: true, guess: s.round.draft.guess };
    const completed = commitResult(s, scoreRound(s.round, decision), decision);
    assert.deepEqual(completed.totals, s.players.map((_, i) => i === s.round.special ? (correct ? 3 : 0) : (correct ? 0 : 2)));
  }
});

test('new rounds rotate all response keys and reject old replies', () => {
  const s = session(), old = vote(s, 0), keys = s.round.replyKeys;
  s.round = createRound('liar', 'eraMixed', 180, 2, 3); s.round.phase = 'judge';
  keys.forEach(k => assert.ok(!s.round.replyKeys.includes(k))); rejectsUnchanged(s, old);
  assert.deepEqual(s.round.received, { seen: [], votes: [null, null, null], guess: null });
});

test('stored response receipts validate length, uniqueness, keys and referenced IDs', () => {
  const value = { version: 2, archive: [], session: session() }; importResponse(value.session, vote(value.session, 0));
  for (const mutate of [r => r.replyKeys.pop(), r => r.replyKeys[1] = r.replyKeys[0], r => r.received.seen.push(r.received.seen[0]), r => r.received.votes[0] = 'a'.repeat(24), r => r.received.guess = 'bad']) {
    const bad = structuredClone(value); mutate(bad.session.round); assert.throws(() => validateStore(bad));
  }
});

test('local runtime decoder and independent test decoder read votes, long guesses and dense v3 invites', () => {
  const s = session('spy', 8); s.players = s.players.map((_, i) => '😊'.repeat(11) + i);
  const codes = [encodeResponse(vote(s, 0)), encodeResponse(guess(s, '😊'.repeat(40))), ...s.players.map((_, i) => makeInvite(personalPayload(s, i), 'https://neegiman.github.io/ggme/'))];
  for (const code of codes) {
    const matrix = createQR(code); assert.equal(decodeMatrix(matrix), code);
    const margin = 4, scale = 4, edge = (matrix.length + margin * 2) * scale;
    const pixels = new Uint8ClampedArray(edge * edge * 4).fill(255);
    matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const at = (((y + margin) * scale + dy) * edge + (x + margin) * scale + dx) * 4; pixels[at] = pixels[at + 1] = pixels[at + 2] = 0; } }));
    assert.equal(jsQR(pixels, edge, edge)?.data, code);
  }
});
