// Optional Playwright QA; no browser dependency is shipped with the game.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodePayload, encodePayload } from '../js/links.js';
import { decodeResponse, encodeResponse, createResponse } from '../js/responses.js';
import { scoreRound } from '../js/core.js';
import { decodeRaster } from './qr-helper.mjs';

const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = new URL('../test-artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
let server, origin = process.env.TEST_BASE_URL;
if (!origin) {
  server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  origin = await new Promise((resolve, reject) => {
    server.stdout.on('data', data => { const match = String(data).match(/http:\/\/[^\s]+/); if (match) resolve(match[0]); });
    server.on('error', reject); server.on('exit', code => reject(new Error(`Server stopped: ${code}`)));
    server.stderr.on('data', data => reject(new Error(String(data))));
  });
}
const base = new URL('ggme/', origin).href;
const key = 'three-of-us:local:v1';
const read = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
const errors = [], externalRequests = [], reports = [];
function watch(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { const url = new URL(r.url()); if (['https:', 'http:'].includes(url.protocol) && url.origin !== new URL(base).origin) externalRequests.push(r.url()); });
}
async function layouts(page, label) {
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const result = await page.evaluate(() => {
      const small = [];
      for (const el of document.querySelectorAll('button, input, select, textarea, a')) {
        if (el.closest('[hidden], dialog:not([open])') || el.classList.contains('skip-link')) continue;
        const target = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label') || el : el;
        const box = target.getBoundingClientRect();
        if (box.width && box.height && (box.width < 43.9 || box.height < 43.9)) small.push([el.id || el.textContent.slice(0, 25), box.width, box.height]);
      }
      return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, small };
    });
    assert.ok(result.scroll <= result.width + 1, `${label} overflow: ${JSON.stringify(result)}`);
    assert.deepEqual(result.small, [], `${label} touch targets`);
  }
}
async function capture(page, name, engine) {
  if (engine === 'chromium') await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, artifacts)), fullPage: true, caret: 'initial' });
}
async function create(page, game, count) {
  await page.goto(base);
  await page.locator('.game-choice').nth(['liar', 'spy', 'taboo'].indexOf(game)).click();
  await page.locator('#player-count').selectOption(String(count));
  for (let i = 0; i < count; i++) await page.locator(`#player-${i}`).fill(i === 0 ? '<b>X</b>' : `참가자${i + 1}`);
  await page.getByRole('button', { name: '게임 만들기', exact: true }).click();
  const links = [];
  for (let i = 0; i < count; i++) {
    if (i) await page.locator('[data-action="invite-next"]').click();
    links.push(await page.locator(`#invite-${i}`).inputValue());
    await page.locator(`[data-delivered="${i}"]`).check();
  }
  await page.locator('[data-action="start"]').click();
  await page.locator('[data-action="judge"]').click();
  return links;
}
async function qrImage(page) {
  return page.locator('#response-private .invite-qr').evaluate(async svg => {
    const clone = svg.cloneNode(true); clone.removeAttribute('aria-label');
    const image = new Image(); const loaded = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    image.src = `data:image/svg+xml;base64,${btoa(clone.outerHTML)}`; await loaded;
    const width = Math.round(svg.getBoundingClientRect().width * devicePixelRatio), edge = svg.viewBox.baseVal.width;
    if (width % edge) throw new Error('Response QR modules not aligned to screen pixels');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = width;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, width, width);
    const pixels = ctx.getImageData(0, 0, width, width).data, gray = new Uint8Array(width * width);
    for (let i = 0; i < gray.length; i++) gray[i] = pixels[i * 4];
    const chunks = []; for (let i = 0; i < gray.length; i += 8192) chunks.push(String.fromCharCode(...gray.subarray(i, i + 8192)));
    return { png: canvas.toDataURL('image/png'), width, height: width, gray: btoa(chunks.join('')) };
  });
}
async function voteOnPhone(phone, url, target, engine, verify = false) {
  await phone.goto(url);
  const p = decodePayload(new URL(url).hash);
  assert.equal(await phone.locator('.is-revealed').count(), 0);
  assert.equal(await phone.locator('#open-guess').count(), 0);
  await phone.locator('#open-vote').click();
  assert.equal(await phone.locator('#response-vote option').count(), p.count);
  assert.equal(await phone.locator(`#response-vote option[value="${p.seat}"]`).count(), 0);
  if (verify) {
    await phone.locator('#response-form button[type="submit"]').click();
    assert.equal(await phone.locator('#response-error').isVisible(), true);
    assert.equal(await phone.locator('.response-panel b').count(), 0);
  }
  await phone.locator('#response-vote').selectOption(String(target + 1));
  await phone.locator('#response-form button[type="submit"]').click();
  let code = await phone.locator('#response-code').inputValue();
  assert.equal(decodeResponse(code).value, target + 1);
  let raster = await qrImage(phone); assert.equal(decodeRaster(raster), code);
  assert.equal(await phone.locator('.is-revealed').count(), 0);
  assert.equal(await phone.evaluate(() => localStorage.length), 0);
  if (verify) {
    await phone.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedReply = value; } } }); });
    await phone.locator('#copy-response').click(); assert.equal(await phone.evaluate(() => window.copiedReply), code);
    const previousId = decodeResponse(code).id;
    await phone.locator('#edit-response').click(); assert.equal(await phone.locator('#response-vote').inputValue(), String(target + 1));
    await phone.locator('#response-form button[type="submit"]').click();
    assert.notEqual(decodeResponse(await phone.locator('#response-code').inputValue()).id, previousId);
    await phone.locator('#close-response').click(); assert.equal(await phone.locator('#response-code').count(), 0);
    await phone.locator('#open-vote').click(); await phone.locator('#response-form button[type="submit"]').click();
    code = await phone.locator('#response-code').inputValue(); raster = await qrImage(phone);
    assert.equal(decodeRaster(raster), code);
    await layouts(phone, 'participant response QR'); await capture(phone, `${engine}-response-qr`, engine);
    await phone.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await phone.locator('#response-private').isVisible(), false);
    await phone.locator('#toggle-response').click();
    await phone.locator('#toggle-card').click();
    assert.equal(await phone.locator('#response-private').isVisible(), false);
    await phone.locator('#toggle-card').click();
    await phone.locator('#toggle-response').click();
  }
  return { code, png: Buffer.from(raster.png.split(',')[1], 'base64'), dataURL: raster.png };
}
const openReader = host => host.locator('[data-action="read-responses"]').click();
const closeReader = async host => { await host.keyboard.press('Escape'); await host.locator('dialog[open]').waitFor({ state: 'hidden' }); };
async function importText(host, code, expected) {
  await host.locator('#scan-text').fill(code); await host.locator('#scan-import').click();
  await host.locator('#scan-status').filter({ hasText: expected }).waitFor();
}
async function guessOnPhone(phone, url, value) {
  await phone.goto(url); await phone.locator('#toggle-card').click(); await phone.locator('#open-guess').click();
  assert.equal(await phone.locator('.is-revealed').count(), 0);
  await phone.locator('#response-guess').fill(value);
  await phone.locator('#response-form button[type="submit"]').click();
  const code = await phone.locator('#response-code').inputValue(); assert.equal(decodeRaster(await qrImage(phone)), code); return code;
}

try {
  for (const engine of (process.env.BROWSER_ENGINES || 'chromium,webkit').split(',')) {
    console.log(`Response QR: ${engine}`);
    const browser = await playwright[engine].launch({ headless: true });
    try {
      for (const count of [3, 8]) for (const game of ['liar', 'spy']) {
        const hc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
        const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
        const host = await hc.newPage(), phone = await pc.newPage(); watch(host); watch(phone);
        const links = await create(host, game, count), start = (await read(host)).session;
        const votes = start.players.map((_, i) => i === start.round.special ? (i + 1) % count : start.round.special);
        let first;
        for (let i = 0; i < count; i++) {
          const response = await voteOnPhone(phone, links[i], votes[i], engine, i === 0);
          if (!i) first = response;
          await openReader(host);
          if (i === 0) {
            await host.evaluate(() => {
              if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
              Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw new DOMException('Denied', 'NotAllowedError'); } });
            });
            await host.locator('#scan-start').click(); await host.locator('#scan-status').filter({ hasText: '권한이 허용되지' }).waitFor();
            assert.equal(await host.locator('#scan-start').isEnabled(), true);
            await host.locator('#scan-file').setInputFiles({ name: 'reply.png', mimeType: 'image/png', buffer: response.png });
            await host.locator('#scan-status').filter({ hasText: '가져왔어요' }).waitFor();
            await layouts(host, 'QR reader fallback'); await capture(host, `${engine}-response-reader`, engine);
            await importText(host, response.code, '이미 읽은');
            await importText(host, links[i], '초대 QR이 아닌');
            const bad = { ...decodeResponse(response.code), roundId: '0'.repeat(24) };
            await importText(host, encodeResponse(bad), '다른 라운드');
          } else await importText(host, response.code, '가져왔어요');
          await closeReader(host);
          assert.equal(await host.locator(`#vote-${i}`).inputValue(), String(votes[i]));
          assert.equal((await read(host)).session.history.length, 0);
        }
        assert.equal(await host.locator('.vote-field .qr-input-tag').count(), count);
        await host.reload(); assert.deepEqual((await read(host)).session.round.draft.votes, votes);
        await openReader(host); await importText(host, first.code, '이미 읽은'); await closeReader(host);
        if (game === 'liar') {
          const earlyCode = await guessOnPhone(phone, links[start.round.special], '모름');
          await openReader(host); await importText(host, earlyCode, '라이어가 지목된 뒤'); await closeReader(host);
          await host.locator('[data-action="confirm-votes"]').click();
          assert.equal((await read(host)).session.round.votesLocked, true);
          await openReader(host); await importText(host, earlyCode, '가져왔어요'); await closeReader(host);
          assert.equal(await host.locator('#guess').inputValue(), '모름');
          await host.locator('[data-action="settle"]').click();
        } else {
          const code = await guessOnPhone(phone, links[start.round.special], start.round.secret);
          await openReader(host); await importText(host, code, '가져왔어요'); await closeReader(host);
          assert.equal((await read(host)).session.round.draft.earlyGuess, true);
          assert.equal((await read(host)).session.history.length, 0);
          await host.locator('[data-action="confirm-votes"]').click();
        }
        const complete = (await read(host)).session;
        assert.equal(complete.round.phase, 'result'); assert.deepEqual(complete.totals, scoreRound(complete.round, complete.round.decision).points);
        await host.reload(); assert.deepEqual((await read(host)).session.totals, complete.totals);
        await host.locator('[data-action="next-round"]').click();
        assert.notEqual((await read(host)).session.round.id, start.round.id);
        await hc.close(); await pc.close();
      }

      // Camera scans an actual moving media stream; stopping/closing never leaves it running.
      const hc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
      const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
      const host = await hc.newPage(), phone = await pc.newPage(); watch(host); watch(phone);
      const links = await create(host, 'liar', 3), s = (await read(host)).session;
      const response = await voteOnPhone(phone, links[0], 1, engine);
      await openReader(host);
      if (engine === 'chromium') {
        await host.evaluate(async dataURL => {
          const image = new Image(); await new Promise(resolve => { image.onload = resolve; image.src = dataURL; });
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 720;
          canvas.getContext('2d').drawImage(image, 0, 0, 720, 720);
          window.testStream = canvas.captureStream(10); window.testCanvas = canvas;
          Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async options => { window.cameraOptions = options; return window.testStream; } });
        }, response.dataURL);
        await host.locator('#scan-start').click();
        await host.waitForFunction(k => JSON.parse(localStorage.getItem(k)).session.round.received.seen.length === 1, key);
        assert.equal(await host.evaluate(() => window.cameraOptions.audio), false);
        await closeReader(host);
        assert.equal(await host.evaluate(() => window.testStream.getTracks().every(t => t.readyState === 'ended')), true);
        // Explicit stop, backgrounding, and page exit stop every acquired track.
        for (const reason of ['button', 'background', 'pagehide']) {
          await openReader(host);
          await host.evaluate(() => {
            Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
              window.lifecycleStream = window.testCanvas.captureStream(10); return window.lifecycleStream;
            } });
          });
          await host.locator('#scan-start').click(); await host.locator('#scan-video').waitFor({ state: 'visible' });
          if (reason === 'button') await host.locator('#scan-stop').click();
          else if (reason === 'background') await host.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange')); delete document.hidden;
          });
          else await host.evaluate(() => window.dispatchEvent(new Event('pagehide')));
          assert.equal(await host.evaluate(() => window.lifecycleStream.getTracks().every(t => t.readyState === 'ended')), true);
          await closeReader(host);
        }
        await openReader(host);
        await host.evaluate(() => {
          Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: () => new Promise(resolve => { window.lateCamera = resolve; }) });
        });
        await host.locator('#scan-start').click(); await closeReader(host);
        await host.evaluate(() => { window.lateStream = window.testCanvas.captureStream(10); window.lateCamera(window.lateStream); });
        await host.waitForFunction(() => window.lateStream.getTracks().every(t => t.readyState === 'ended'));
      } else await closeReader(host);

      // A changed vote replaces the current value; old QR replay cannot undo it or a manual edit.
      const changed = createResponse(decodePayload(new URL(links[0]).hash), 'vote', 3);
      await openReader(host); await importText(host, encodeResponse(changed), '가져왔어요');
      await importText(host, response.code, engine === 'chromium' ? '이미 읽은' : '가져왔어요');
      if (engine !== 'chromium') await importText(host, encodeResponse(createResponse(decodePayload(new URL(links[0]).hash), 'vote', 3)), '가져왔어요');
      await closeReader(host);
      assert.equal(await host.locator('#vote-0').inputValue(), '2');
      await host.locator('#vote-0').selectOption('1');
      await openReader(host); await importText(host, encodeResponse(changed), '이미 읽은'); await closeReader(host);
      assert.equal(await host.locator('#vote-0').inputValue(), '1');
      // Unique innocent target settles immediately without offering them a secret-word guess.
      const wrong = (s.round.special + 1) % 3;
      for (let i = 0; i < 3; i++) await host.locator(`#vote-${i}`).selectOption(String(i === wrong ? (i + 1) % 3 : wrong));
      await host.locator('[data-action="confirm-votes"]').click();
      assert.equal((await read(host)).session.round.phase, 'result'); assert.equal((await read(host)).session.totals[s.round.special], 3);
      await hc.close(); await pc.close();

      // Actual old card URLs still open and do not pretend to support responses.
      const legacy = await browser.newContext({ viewport: { width: 320, height: 700 }, locale: 'ko-KR' });
      const old = await legacy.newPage(); watch(old);
      const p = decodePayload(new URL(links[0]).hash); p.v = 2; delete p.roster; delete p.replyKey;
      await old.goto(new URL(`card.html#${encodePayload(p)}`, base).href);
      assert.equal(await old.locator('#open-vote').count(), 0); await old.locator('#toggle-card').click();
      assert.equal(await old.locator('.is-revealed').count(), 1); await legacy.close();
      reports.push({ engine, status: 'passed', counts: [3, 8], games: ['liar', 'spy'], imageAndTextImport: true, deniedCameraFallback: true, mediaStreamCameraTest: engine === 'chromium', physicalCameraTest: false, manualFinalConfirmation: true, replayProtection: true, legacyCard: true, mobileWidths: [320, 390, 430] });
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, [], 'browser errors'); assert.deepEqual(externalRequests, [], 'external requests');
  const report = { checkedAt: new Date().toISOString(), reports, errors, externalRequests };
  await writeFile(new URL('responses-report.json', artifacts), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { server?.kill(); }
