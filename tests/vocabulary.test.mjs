import test from 'node:test';
import assert from 'node:assert/strict';
import { ERA_PACKS, ERA_WORDS, WORD_SOURCES, DEFAULT_WORD_PACK, wordDetail } from '../js/vocabulary.js';
import { WORDS, TABOO_WORDS, LOCATIONS } from '../js/data.js';
import { createSession, createRound, personalPayload } from '../js/round.js';
import { encodePayload, decodePayload, makeInvite } from '../js/links.js';
import { scoreRound, commitResult } from '../js/core.js';
import { loadStore, saveStore } from '../js/storage.js';
import { createQR } from '../js/qr.js';
import { decodeMatrix } from './qr-helper.mjs';

test('all seven eras provide at least thirty distinct words, with meanings and traceable sources', () => {
  assert.deepEqual(Object.keys(ERA_PACKS), ['era60', 'era70', 'era80', 'era90', 'era00', 'era10', 'era20']);
  for (const [category, pack] of Object.entries(ERA_PACKS)) {
    const words = pack.entries.map(e => e.word);
    assert.ok(words.length >= 30); assert.equal(new Set(words).size, words.length);
    assert.deepEqual(WORDS[category].items, words);
    for (const entry of pack.entries) {
      assert.ok(entry.meaning.trim()); assert.ok(entry.sources.length);
      for (const id of entry.sources) {
        const source = WORD_SOURCES[id]; assert.ok(source?.title);
        const url = new URL(source.url); assert.equal(url.protocol, 'https:');
        assert.ok(['www.korean.go.kr', 'www.much.go.kr', 'encykorea.aks.ac.kr', 'opendict.korean.go.kr'].includes(url.hostname));
      }
      if (entry.reference) {
        const url = new URL(entry.reference);
        assert.equal(url.origin, 'https://opendict.korean.go.kr');
        assert.match(url.searchParams.get('sense_no'), /^\d+$/);
      }
      assert.equal(wordDetail(category, entry.word), entry);
    }
  }
  assert.equal(DEFAULT_WORD_PACK, 'eraMixed');
  assert.deepEqual(new Set(ERA_WORDS.eraMixed.items), new Set(Object.values(ERA_PACKS).flatMap(p => p.entries.map(e => e.word))));
  assert.equal(wordDetail('daily', '우산'), null);
  assert.equal(wordDetail('era90', '하이루'), null);
});

test('era labels and descriptions disclose no answer candidates; modern words link to individual definitions', () => {
  const words = ERA_WORDS.eraMixed.items;
  assert.ok(words.length >= 210);
  for (const pack of Object.values(ERA_WORDS)) for (const word of words) {
    assert.ok(!pack.label.includes(word), `label contains an answer: ${word}`);
    assert.ok(!pack.summary.includes(word), `description contains an answer: ${word}`);
  }
  for (const category of ['era10', 'era20']) for (const entry of ERA_PACKS[category].entries) assert.ok(entry.reference);
});

test('selected era controls liar and taboo assignments for every player count; cards keep private allowlists', () => {
  for (const category of Object.keys(ERA_WORDS)) for (let count = 3; count <= 8; count++) for (const game of ['liar', 'taboo']) for (let n = 0; n < 5; n++) {
    const s = createSession(Array.from({ length: count }, (_, i) => `참가자${i}`), game, category, 180);
    const pool = WORDS[category].items;
    if (game === 'liar') assert.ok(pool.includes(s.round.secret));
    else { assert.equal(new Set(s.round.words).size, count); s.round.words.forEach(w => assert.ok(pool.includes(w))); }
    for (let seat = 0; seat < count; seat++) {
      const p = decodePayload(encodePayload(personalPayload(s, seat)));
      if (game === 'liar') {
        assert.equal(p.info.category, WORDS[category].label);
        assert.deepEqual(Object.keys(p.info).sort(), seat === s.round.special ? ['category', 'role'] : ['category', 'role', 'word']);
        if (seat === s.round.special) assert.ok(!JSON.stringify(p).includes(s.round.secret));
        else assert.equal(p.info.word, s.round.secret);
      } else {
        assert.deepEqual(Object.keys(p.info), ['others']);
        assert.deepEqual(p.info.others.map(e => e.word), s.round.words.filter((_, i) => i !== seat));
        assert.ok(!p.info.others.some(e => e.word === s.round.words[seat]));
      }
      assert.ok(!JSON.stringify(p).includes('meaning')); assert.ok(!JSON.stringify(p).includes('sources'));
    }
  }
});

test('era sessions and scored rounds survive reload; switching era issues fresh links and preserves totals', () => {
  for (const category of Object.keys(ERA_WORDS)) for (const game of ['liar', 'taboo']) {
    let s = createSession(['가', '나', '다'], game, category, 180);
    const previous = makeInvite(personalPayload(s, 0), 'https://example.test/ggme/');
    const r = s.round;
    const decision = game === 'taboo' ? { violations: [0, 1, 2] } : { votes: [1, 2, 0] };
    s = commitResult(s, scoreRound(r, decision), decision);
    let raw;
    const storage = { setItem(_key, value) { raw = value; }, getItem() { return raw; } };
    const store = { version: 2, session: s, archive: [] };
    assert.equal(saveStore(storage, store), true);
    assert.deepEqual(loadStore(storage), { value: store, error: null });
    const totals = [...s.totals];
    s.round = createRound(game, category === 'era90' ? 'era00' : 'era90', 180, 2);
    assert.notEqual(makeInvite(personalPayload(s, 0), 'https://example.test/ggme/'), previous);
    assert.deepEqual(s.totals, totals);
    saveStore(storage, store); assert.equal(loadStore(storage).error, null);
  }
});

test('legacy categories keep their old pools; spy always selects a real location', () => {
  for (const category of ['daily', 'food', 'leisure']) {
    assert.ok(WORDS[category].items.includes(createRound('liar', category, 180, 1).secret));
    createRound('taboo', category, 180, 1, 8).words.forEach(word => assert.ok(TABOO_WORDS.includes(word)));
  }
  for (const category of Object.keys(ERA_WORDS)) {
    const round = createRound('spy', category, 180, 1);
    assert.ok(LOCATIONS.some(p => p.name === round.secret));
  }
});

test('longest era terms fit private QR links even with eight maximum-length Unicode names', () => {
  const words = [...ERA_WORDS.eraMixed.items].sort((a, b) => b.length - a.length).slice(0, 8);
  const s = createSession(Array.from({ length: 8 }, (_, i) => '😊'.repeat(11) + i), 'taboo', 'eraMixed', 180);
  s.round.words = words;
  const url = makeInvite(personalPayload(s, 7), 'https://neegiman.github.io/ggme/');
  assert.equal(decodeMatrix(createQR(url)), url);
});
