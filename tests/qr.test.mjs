import test from 'node:test';
import assert from 'node:assert/strict';
import { createQR, qrSVG, QR_MARGIN } from '../js/qr.js';
import { createSession, personalPayload } from '../js/round.js';
import { makeInvite, decodePayload } from '../js/links.js';
import { decodeMatrix } from './qr-helper.mjs';

for (const count of [3, 8]) for (const game of ['liar', 'spy', 'taboo']) {
  test(`${game}: independent decoder reads all ${count} private QR links exactly`, () => {
    const session = createSession(Array.from({ length: count }, (_, i) => `참가자${i + 1}`), game, 'daily', 180);
    const decoded = session.players.map((_, i) => {
      const url = makeInvite(personalPayload(session, i), 'https://neegiman.github.io/ggme/');
      const scanned = decodeMatrix(createQR(url));
      assert.equal(scanned, url);
      assert.deepEqual(decodePayload(new URL(scanned).hash), personalPayload(session, i));
      return scanned;
    });
    assert.equal(new Set(decoded).size, count);
  });
}

test('eight maximum-length Unicode names and seven taboo words fit and decode', () => {
  const session = createSession(Array.from({ length: 8 }, (_, i) => '😊'.repeat(11) + i), 'taboo', 'daily', 600);
  session.players.forEach((_, i) => {
    const url = makeInvite(personalPayload(session, i), 'https://neegiman.github.io/ggme/');
    assert.equal(decodeMatrix(createQR(url)), url);
  });
});

test('SVG keeps a four-module white quiet zone and escapes the accessible name', () => {
  const url = 'https://neegiman.github.io/ggme/card.html#private-test';
  const edge = createQR(url).length + QR_MARGIN * 2;
  const svg = qrSVG(url, '<img src=x onerror=alert(1)>');
  assert.equal(QR_MARGIN, 4);
  assert.ok(svg.includes(`viewBox="0 0 ${edge} ${edge}"`));
  assert.ok(svg.includes(`<rect width="${edge}" height="${edge}" fill="#fff"/>`));
  assert.ok(svg.includes('aria-label="&lt;img'));
  assert.ok(!svg.includes('<img'));
  assert.ok(!svg.includes(url));
});

test('bad input and capacity overflow fail instead of producing a fake QR', () => {
  for (const value of ['', null, 12, '한글', '\n', 'a'.repeat(2400)]) assert.throws(() => createQR(value));
});
