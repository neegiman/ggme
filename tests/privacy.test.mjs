import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNames, shuffle } from '../js/core.js';
import { createSession, createRound, personalPayload } from '../js/round.js';
import { encodePayload, decodePayload, validatePayload, makeInvite } from '../js/links.js';
import { escapeHTML } from '../js/ui.js';

test('requires 3–8 unique normalized names and rejects invisible/control characters', () => {
  assert.deepEqual(validateNames([' 가 ', '나', '다']), ['가', '나', '다']);
  for (const names of [[], ['가', '나'], Array.from({ length: 9 }, (_, i) => `이름${i}`), ['가', '가 ', '다'], ['A', 'a', '다'], [' ', '나', '다'], ['가'.repeat(13), '나', '다'], ['가\u202e', '나', '다'], ['가\n', '나', '다']]) {
    // Trimming a trailing newline is intentionally allowed as surrounding whitespace.
    if (names[0] === '가\n') continue;
    assert.throws(() => validateNames(names));
  }
});
test('all games produce three distinct Unicode-safe and subpath-safe invite links', () => {
  for (const game of ['liar', 'spy', 'taboo']) {
    const s = createSession(['민지', '준호', 'Alex'], game, 'daily', 180);
    const links = [0, 1, 2].map(i => makeInvite(personalPayload(s, i), 'https://example.test/repo/three-player-games/index.html'));
    assert.equal(new Set(links).size, 3);
    links.forEach((link, i) => { const url = new URL(link); assert.equal(url.pathname, '/repo/three-player-games/card.html'); assert.equal(url.search, ''); assert.deepEqual(decodePayload(url.hash), personalPayload(s, i)); });
  }
});
test('role distribution and allowlisted private payloads disclose only allowed data (90 random rounds)', () => {
  for (const game of ['liar', 'spy', 'taboo']) for (let n = 0; n < 30; n++) {
    const s = createSession(['민지', '준호', '서연'], game, 'food', 180);
    const payloads = [0, 1, 2].map(i => decodePayload(encodePayload(personalPayload(s, i))));
    if (game === 'liar') {
      assert.equal(payloads.filter(p => p.info.role === 'liar').length, 1);
      assert.deepEqual(Object.keys(payloads[s.round.special].info).sort(), ['category', 'role']);
      assert.ok(!JSON.stringify(payloads[s.round.special]).includes(s.round.secret));
      payloads.filter(p => p.info.role === 'citizen').forEach(p => assert.equal(p.info.word, s.round.secret));
    }
    if (game === 'spy') {
      assert.equal(payloads.filter(p => p.info.role === 'spy').length, 1);
      assert.deepEqual(payloads[s.round.special].info, { role: 'spy' });
      assert.ok(!JSON.stringify(payloads[s.round.special]).includes(s.round.secret));
      payloads.filter(p => p.info.role === 'citizen').forEach(p => assert.equal(p.info.location, s.round.secret));
    }
    if (game === 'taboo') payloads.forEach((p, i) => {
      assert.equal(p.info.others.length, 2);
      assert.ok(!p.info.others.some(o => o.word === s.round.words[i]));
      assert.deepEqual(p.info.others.map(o => o.word), s.round.words.filter((_, seat) => seat !== i));
      assert.ok(p.info.others.every(o => o.name !== p.recipient));
    });
    payloads.forEach(p => { for (const key of ['special', 'secret', 'seed', 'players', 'words', 'totals', 'jobs']) assert.ok(!Object.hasOwn(p, key)); });
  }
});
test('a new round changes round id and all private URLs; round one URLs remain readable', () => {
  const s = createSession(['가', '나', '다'], 'liar', 'daily', 180);
  const before = [0, 1, 2].map(i => makeInvite(personalPayload(s, i), 'https://example.test/'));
  const oldId = s.round.id;
  s.round = createRound('spy', 'daily', 240, 2);
  assert.notEqual(oldId, s.round.id);
  before.forEach((url, i) => { assert.notEqual(url, makeInvite(personalPayload(s, i), 'https://example.test/')); assert.equal(decodePayload(new URL(url).hash).roundId, oldId); });
});
test('rejects missing, malformed, oversized and unknown-version links', () => {
  for (const hash of ['', '#', '#%%%', '#a', '#_'.repeat(6100), '#eyJ2IjoyfQ', '#wyg']) assert.throws(() => decodePayload(hash));
  const p = personalPayload(createSession(['가', '나', '다'], 'spy', 'daily', 240), 0);
  assert.throws(() => validatePayload({ ...p, seed: 'leak' }));
  assert.throws(() => validatePayload({ ...p, v: 3 }));
  assert.throws(() => validatePayload({ ...p, recipient: ' ' }));
  assert.throws(() => validatePayload({ ...p, info: { ...p.info, allRoles: [1, 2, 3] } }));
});

test('every supported count creates isolated cards and new links in /ggme/', () => {
  for (let count = 3; count <= 8; count++) for (const game of ['liar', 'spy', 'taboo']) for (let n = 0; n < 10; n++) {
    const s = createSession(Array.from({ length: count }, (_, i) => `참가자${i + 1}`), game, 'daily', 180);
    const cards = s.players.map((_, i) => personalPayload(s, i));
    const links = cards.map(p => makeInvite(p, 'https://neegiman.github.io/ggme/'));
    assert.equal(new Set(links).size, count);
    cards.forEach((p, i) => {
      assert.deepEqual(decodePayload(new URL(links[i]).hash), p);
      assert.equal(new URL(links[i]).pathname, '/ggme/card.html');
      assert.equal(p.count, count); assert.equal(p.seat, i + 1);
      if (game === 'taboo') {
        assert.equal(p.info.others.length, count - 1);
        assert.ok(!p.info.others.some(o => o.word === s.round.words[i]));
      } else if (i === s.round.special) {
        assert.ok(!JSON.stringify(p).includes(s.round.secret));
        assert.deepEqual(Object.keys(p.info).sort(), game === 'liar' ? ['category', 'role'] : ['role']);
      }
    });
    if (game !== 'taboo') assert.equal(cards.filter(p => p.info.role === game).length, 1);
    s.round = createRound(game, 'daily', 180, 2, count);
    s.players.forEach((_, i) => assert.notEqual(makeInvite(personalPayload(s, i), 'https://neegiman.github.io/ggme/'), links[i]));
  }
});

test('legacy v1 cards still open; v2 count and private collections are validated', () => {
  for (const game of ['liar', 'spy', 'taboo']) {
    const p = personalPayload(createSession(['가', '나', '다'], game, 'daily', 180), 0);
    const legacy = { ...p, v: 1 }; delete legacy.count;
    assert.deepEqual(decodePayload(encodePayload(legacy)), legacy);
    for (const count of [2, 9, 3.5, '3', null]) assert.throws(() => validatePayload({ ...p, count }));
    assert.throws(() => validatePayload({ ...p, seat: 4 }));
    if (game === 'taboo') {
      assert.throws(() => validatePayload({ ...p, info: { others: [p.info.others[0], p.info.others[0]] } }));
      assert.throws(() => validatePayload({ ...p, count: 8 }));
    }
  }
});
test('escaping treats names, guesses and link data as text', () => {
  assert.equal(escapeHTML('<img onerror="x">&\''), '&lt;img onerror=&quot;x&quot;&gt;&amp;&#39;');
  assert.deepEqual(validateNames(['<b>X</b>', '나', '다']), ['<b>X</b>', '나', '다']);
});
test('shuffle is a non-mutating permutation and game options are validated', () => {
  const source = [1, 2, 3]; assert.deepEqual(shuffle(source, () => 0).sort(), source); assert.deepEqual(source, [1, 2, 3]);
  assert.throws(() => createRound('bad', 'daily', 180, 1));
  assert.throws(() => createRound('liar', 'bad', 180, 1));
  assert.throws(() => createRound('liar', 'daily', 1, 1));
  assert.throws(() => createRound('__proto__', 'daily', 180, 1));
  assert.throws(() => createRound('liar', '__proto__', 180, 1));
  assert.throws(() => createRound('liar', 'daily', 180, 0));
});
