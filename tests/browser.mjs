// Optional QA dependency only: npm install --no-save playwright && npx playwright install chromium webkit
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scoreRound } from '../js/core.js';
import { decodePayload, encodePayload } from '../js/links.js';
import { decodeRaster } from './qr-helper.mjs';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = new URL('../test-artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
let server;
let base = process.env.TEST_BASE_URL;
if (!base) {
  server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    server.stdout.on('data', data => { const match = String(data).match(/http:\/\/[^\s]+/); if (match) resolve(match[0]); });
    server.on('error', reject); server.on('exit', code => reject(new Error(`Static server stopped: ${code}`)));
    server.stderr.on('data', data => reject(new Error(String(data))));
  });
}
const reports = [], errors = [], externalRequests = [];
base = new URL('ggme/', base).href;
const engines = (process.env.BROWSER_ENGINES || 'chromium,webkit').split(',');
const key = 'three-of-us:local:v1';
const read = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (new URL(request.url()).origin !== new URL(base).origin) externalRequests.push(request.url()); });
}
async function screenshot(page, name, fullPage = true) {
  // Playwright's WebKit screenshot helper injects "body {}" inline to synchronize
  // animations, which our CSP correctly blocks. Keep CSP enforced in every test;
  // use Chromium for pixel captures and WebKit for DOM/layout and full-flow QA.
  if (page.context().browser().browserType().name() === 'webkit') return;
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, artifacts)), fullPage, caret: 'initial' });
}
async function assertLayout(page, label) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const tooSmall = [];
    for (const el of document.querySelectorAll('button, a, input, select')) {
      if (el.closest('[hidden]') || el.closest('dialog:not([open])') || el.classList.contains('skip-link')) continue;
      let target = el;
      if (el.matches('input[type="checkbox"], input[type="radio"]')) target = el.closest('label') || el;
      const style = getComputedStyle(target), box = target.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width === 0 || box.height === 0) continue;
      if (box.width < 43.9 || box.height < 43.9) tooSmall.push({ tag: el.tagName, label: el.getAttribute('aria-label') || el.textContent.slice(0, 40), width: box.width, height: box.height });
    }
    return { width, scroll: document.documentElement.scrollWidth, tooSmall };
  });
  assert.ok(result.scroll <= result.width + 1, `${label}: horizontal overflow ${JSON.stringify(result)}`);
  assert.deepEqual(result.tooSmall, [], `${label}: touch targets below 44px`);
}
async function assertMobileLayouts(page, label) {
  const original = page.viewportSize();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await assertLayout(page, `${label} ${width}px`);
  }
  await page.setViewportSize(original);
}
async function create(page, game, count = 3) {
  await page.locator('.game-choice').nth(['liar', 'spy', 'taboo'].indexOf(game)).click();
  await page.locator('#player-count').selectOption(String(count));
  for (const [i, name] of ['민지', '준호', '서연', '지수', '도윤', '하린', '유진', '지호'].slice(0, count).entries()) await page.locator(`#player-${i}`).fill(name);
  await page.locator('#duration').selectOption('120');
  await page.getByRole('button', { name: '게임 만들기', exact: true }).click();
  await page.locator('#invite-0').waitFor();
}
async function begin(page) {
  const n = Number(await page.locator('[data-invite-count]').getAttribute('data-invite-count'));
  for (let i = 0; i < n; i++) {
    await showInvite(page, i);
    await page.locator(`[data-delivered="${i}"]`).check();
    assert.equal(await page.locator('#invite-progress').innerText(), `${i + 1} / ${n}명 카드 확인 완료`);
  }
  await page.locator('[data-action="start"]').click();
}
async function showInvite(page, seat) {
  let current = Number(await page.locator('.invite-card').getAttribute('data-seat'));
  while (current !== seat) {
    await page.locator(`[data-action="invite-${current < seat ? 'next' : 'prev'}"]`).click();
    current = Number(await page.locator('.invite-card').getAttribute('data-seat'));
  }
}
async function scanQR(page, selector = '.invite-card .invite-qr') {
  const raster = await page.locator(selector).evaluate(async svg => {
    const clone = svg.cloneNode(true);
    clone.removeAttribute('aria-label'); // Keep SVG ASCII for btoa; the visible label is tested separately.
    const image = new Image();
    const loaded = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    image.src = `data:image/svg+xml;base64,${btoa(clone.outerHTML)}`;
    await loaded;
    const width = Math.round(svg.getBoundingClientRect().width * window.devicePixelRatio);
    const edge = svg.viewBox.baseVal.width;
    if (width % edge !== 0) throw new Error(`QR modules do not align with screen pixels: ${width}/${edge}`);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = width;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, width);
    const rgba = ctx.getImageData(0, 0, width, width).data;
    const gray = new Uint8Array(width * width);
    for (let i = 0; i < gray.length; i++) gray[i] = rgba[i * 4];
    const chunks = [];
    for (let i = 0; i < gray.length; i += 8192) chunks.push(String.fromCharCode(...gray.subarray(i, i + 8192)));
    return { width, height: width, gray: btoa(chunks.join('')) };
  });
  return decodeRaster(raster);
}
async function collectInviteLinks(page, scan = false) {
  const count = Number(await page.locator('[data-invite-count]').getAttribute('data-invite-count'));
  const links = [];
  await showInvite(page, 0);
  assert.equal(await page.locator('[data-action="invite-prev"]').isDisabled(), true);
  for (let i = 0; i < count; i++) {
    await showInvite(page, i);
    assert.equal(await page.locator('.invite-card').count(), 1);
    assert.equal(await page.locator('.link-field').count(), 1);
    assert.equal(await page.locator('.invite-qr').count(), 1);
    const url = await page.locator(`#invite-${i}`).inputValue();
    const payload = decodePayload(new URL(url).hash);
    assert.equal(payload.seat, i + 1);
    assert.equal(await page.locator('#invite-name').innerText(), payload.recipient);
    assert.equal(await page.locator('.invite-position').innerText(), `참가자 ${i + 1} / ${count}`);
    if (scan) assert.equal(await scanQR(page), url, `Rendered QR for seat ${i + 1}`);
    links.push(url);
  }
  assert.equal(await page.locator('[data-action="invite-next"]').isDisabled(), true);
  await showInvite(page, 0);
  return links;
}
async function vote(page, target) {
  for (let i = 0, n = await page.locator('[data-vote]').count(); i < n; i++) await page.locator(`#vote-${i}`).selectOption(String(i === target ? (target + 1) % n : target));
  await page.locator('[data-action="confirm-votes"]').click();
}
try {
  for (const engine of engines) {
    console.log(`Browser: ${engine}`);
    const browser = await playwright[engine].launch({ headless: true });
    try {
      const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });
      const dpage = await desktop.newPage(); watch(dpage); await dpage.goto(base);
      await dpage.locator('#create-form').waitFor(); await screenshot(dpage, `${engine}-home-desktop`); await assertLayout(dpage, `${engine} desktop`);
      await desktop.close();
      for (const count of [3, 8]) for (const game of ['liar', 'spy', 'taboo']) {
        console.log(`  ${game} (${count} players): create → isolated cards → manual play → result → restore → next`);
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' });
        const page = await context.newPage(); watch(page); await page.clock.install(); await page.goto(base);
        if (engine === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        if (game === 'liar') {
          for (const width of [320, 360, 390, 430, 768]) { await page.setViewportSize({ width, height: 844 }); await assertLayout(page, `${engine} home ${width}`); }
          await page.setViewportSize({ width: 390, height: 844 }); await screenshot(page, `${engine}-home-mobile`);
          await page.locator('[data-action="guide"]').click(); await page.locator('dialog[open]').waitFor(); await assertLayout(page, `${engine} guide`); await page.locator('dialog [data-action="close-modal"]').last().click();
          await page.locator('.rule-link').click(); await page.locator('.rules-list').waitFor(); await page.locator('dialog [data-action="close-modal"]').last().click();
          await page.getByRole('button', { name: '게임 만들기', exact: true }).click(); assert.match(await page.locator('#form-error').innerText(), /이름/);
          for (const i of [0, 1, 2]) await page.locator(`#player-${i}`).fill('같은이름');
          await page.getByRole('button', { name: '게임 만들기', exact: true }).click(); assert.match(await page.locator('#form-error').innerText(), /서로 다른/);
        }
        await create(page, game, count);
        let state = await read(page);
        const firstId = state.session.round.id;
        const links = await collectInviteLinks(page, true);
        assert.equal(new Set(links).size, count); await assertMobileLayouts(page, `${engine} ${game} ${count} invites`);
        links.forEach(url => assert.equal(new URL(url).pathname, '/ggme/card.html'));
        assert.equal(await page.locator('[data-action="start"]').isDisabled(), true);
        await page.locator('[data-action="qr-large"]').click();
        assert.equal(await scanQR(page, 'dialog .invite-qr'), links[0]);
        await assertMobileLayouts(page, `${engine} enlarged QR`);
        if (game === 'taboo' && count === 8) await screenshot(page, `${engine}-qr-large-mobile`, false);
        await page.locator('dialog [data-action="close-modal"]').last().click();
        await showInvite(page, 1);
        assert.equal(await page.locator('.invite-qr').count(), 1);
        await showInvite(page, 0);
        assert.ok((await read(page)).session.round.shared.every(checked => !checked));
        await page.locator('[data-delivered="0"]').check();
        await showInvite(page, 1); await showInvite(page, 0);
        assert.equal(await page.locator('[data-delivered="0"]').isChecked(), true);
        await page.reload();
        assert.equal(await page.locator('[data-delivered="0"]').isChecked(), true);
        await page.locator('[data-delivered="0"]').uncheck();
        assert.equal(await page.locator('[data-action="start"]').isDisabled(), true);
        await page.locator('[data-action="copy"]').first().click();
        if (await page.locator('dialog[open]').count()) await page.locator('dialog [data-action="close-modal"]').last().click();
        if (engine === 'chromium') assert.equal(await page.evaluate(() => navigator.clipboard.readText()), links[0]);
        await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.testSharedData = data; } }); });
        await page.locator('[data-action="share"]').first().click();
        assert.equal(await page.evaluate(() => window.testSharedData.url), links[0]);
        await showInvite(page, count - 1);
        await page.locator('[data-action="share"]').click();
        assert.equal(await page.evaluate(() => window.testSharedData.url), links[count - 1]);
        await page.locator('[data-action="copy"]').click();
        if (await page.locator('dialog[open]').count()) await page.locator('dialog [data-action="close-modal"]').last().click();
        if (engine === 'chromium') assert.equal(await page.evaluate(() => navigator.clipboard.readText()), links[count - 1]);
        await showInvite(page, 0);
        if (game === 'liar') await screenshot(page, `${engine}-invites-mobile`);
        for (const [i, url] of links.entries()) {
          const p = decodePayload(new URL(url).hash);
          const participantContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ko-KR' });
          const card = await participantContext.newPage(); watch(card); await card.goto(url);
          assert.equal(await card.evaluate(() => localStorage.length), 0);
          assert.equal(await card.locator('#toggle-card').getAttribute('aria-expanded'), 'false');
          assert.equal(await card.locator('.secret-word').count(), 0);
          await assertMobileLayouts(card, `${engine} ${game} hidden card`);
          if (i === 0 && game === 'liar') await screenshot(card, `${engine}-card-hidden`);
          await card.locator('#toggle-card').click();
          assert.equal(await card.locator('#toggle-card').getAttribute('aria-expanded'), 'true');
          const content = await card.locator('.secret-card').innerText();
          if (game === 'liar' && p.info.role === 'citizen') assert.ok(content.includes(state.session.round.secret));
          if (game === 'liar' && p.info.role === 'liar') assert.ok(!content.includes(state.session.round.secret));
          if (game === 'spy' && p.info.role === 'spy') assert.ok(!content.includes(state.session.round.secret));
          if (game === 'spy' && p.info.role === 'citizen') assert.ok(content.includes(state.session.round.secret));
          if (game === 'taboo') {
            const shown = await card.locator('.taboo-secrets strong').allTextContents();
            assert.deepEqual(shown, state.session.round.words.filter((_, seat) => seat !== i));
            assert.ok(!shown.includes(state.session.round.words[i]));
          }
          await assertMobileLayouts(card, `${engine} ${game} revealed card`);
          if (i === 0) await screenshot(card, `${engine}-${game}-card-visible`);
          await card.evaluate(() => window.dispatchEvent(new Event('blur')));
          assert.equal(await card.locator('#toggle-card').getAttribute('aria-expanded'), 'false');
          await card.locator('#toggle-card').click(); await card.locator('#toggle-card').click();
          assert.equal(await card.locator('#toggle-card').getAttribute('aria-expanded'), 'false');
          await participantContext.close();
        }
        await page.reload(); assert.equal((await read(page)).session.round.id, firstId);
        await begin(page); await assertMobileLayouts(page, `${engine} ${game} timer`);
        await page.locator('[data-action="back-invite"]').click(); assert.equal((await read(page)).session.round.id, firstId); await page.locator('[data-action="start"]').click();
        await page.locator('[data-action="rules"]').click(); await page.locator('.rules-list').waitFor(); await page.locator('dialog [data-action="close-modal"]').last().click();
        await page.locator('[data-action="toggle-timer"]').click(); await page.clock.fastForward(61000);
        assert.equal(await page.locator('#timer-value').innerText(), '00:59');
        await page.locator('[data-action="toggle-timer"]').click(); await page.clock.fastForward(10000);
        assert.equal(await page.locator('#timer-value').innerText(), '00:59');
        await page.reload(); assert.equal(await page.locator('#timer-value').innerText(), '00:59');
        await page.locator('[data-action="toggle-timer"]').click(); await page.clock.fastForward(60000);
        assert.equal(await page.locator('#timer-value').innerText(), '00:00');
        assert.equal((await read(page)).session.round.phase, 'play');
        await page.locator('[data-action="reset-timer"]').click(); await page.locator('[data-action="confirm-reset-timer"]').click();
        assert.equal(await page.locator('#timer-value').innerText(), '02:00');
        if (game === 'liar') await screenshot(page, `${engine}-timer-mobile`);
        await page.locator('[data-action="judge"]').click(); await assertMobileLayouts(page, `${engine} ${game} judge`);
        await page.locator('[data-action="back-play"]').click(); await page.locator('[data-action="judge"]').click();
        if (game === 'taboo') {
          for (const seat of [1, 2, 2]) await page.locator(`[data-action="count"][data-seat="${seat}"][data-delta="1"]`).click();
          await page.locator('[data-action="settle"]').click();
        } else {
          await page.locator('[data-action="confirm-votes"]').click(); assert.match(await page.locator('#judge-error').innerText(), /투표/);
          await vote(page, state.session.round.special);
          if (game === 'liar') {
            await page.locator('[data-action="unlock-votes"]').click(); await page.locator('[data-action="confirm-votes"]').click();
            await page.locator('[data-action="settle"]').click(); assert.match(await page.locator('#judge-error').innerText(), /추측/);
            await page.locator('#guess').fill(state.session.round.secret); await page.locator('[data-action="settle"]').click();
          }
        }
        await page.locator('.result-banner').waitFor(); await assertMobileLayouts(page, `${engine} ${game} result`);
        const finished = await read(page);
        assert.deepEqual(finished.session.totals, scoreRound(finished.session.round, finished.session.round.decision).points);
        const totals = finished.session.totals;
        if (game === 'liar') { await page.clock.fastForward(4001); await screenshot(page, `${engine}-result-mobile`); }
        await page.reload(); assert.deepEqual((await read(page)).session.totals, totals); assert.equal((await read(page)).session.history.length, 1);
        await page.locator('.nav-button[data-action="history"]').click(); assert.equal(await page.locator('.history-list article').count(), 1);
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-history"]').click()]);
        const exported = JSON.parse(await readFile(await download.path(), 'utf8')); assert.equal(exported.rounds.length, 1); assert.equal(exported.rounds[0].roundId, firstId);
        await page.locator('dialog [data-action="close-modal"]').last().click();
        await page.locator('[data-action="next-round"]').click(); const next = await read(page);
        assert.notEqual(next.session.round.id, firstId); assert.equal(next.session.round.number, 2); assert.deepEqual(next.session.totals, totals);
        assert.equal(await page.locator('.invite-card').getAttribute('data-seat'), '0');
        assert.equal(await page.locator('#invite-progress').innerText(), `0 / ${count}명 카드 확인 완료`);
        const nextLinks = await collectInviteLinks(page);
        nextLinks.forEach((link, i) => assert.notEqual(link, links[i]));
        if (game === 'spy') {
          await begin(page); await page.locator('[data-action="judge"]').click(); await page.locator('[data-draft="earlyGuess"]').check();
          await page.locator('#guess').fill(next.session.round.secret); await page.locator('[data-action="confirm-votes"]').click();
          await page.locator('.result-banner').waitFor(); assert.equal((await read(page)).session.round.result.guessCorrect, true);
        }
        await page.locator('[data-action="new-group"]').first().click(); await page.locator('[data-action="confirm-new-group"]').click();
        await page.locator('#create-form').waitFor();
        assert.equal((await read(page)).session, null); assert.ok((await read(page)).archive.length >= 1);
        await context.close();
      }
      for (const count of [4, 5, 6, 7]) {
        console.log(`  ${count} players: form changes → all three host flows → new-group count`);
        const context = await browser.newContext({ viewport: { width: 320, height: 844 }, locale: 'ko-KR' });
        const page = await context.newPage(); watch(page); await page.goto(base);
        await page.locator('#player-0').fill('남겨둔이름');
        await page.locator('#player-count').selectOption('8');
        await page.locator('#player-7').fill('여덟번째');
        await page.locator('#player-count').selectOption('3');
        await page.locator('#player-count').selectOption('8');
        assert.equal(await page.locator('#player-0').inputValue(), '남겨둔이름');
        assert.equal(await page.locator('#player-7').inputValue(), '여덟번째');
        await page.locator('#player-count').selectOption(String(count));
        assert.equal(await page.locator('.player-fields input').count(), count);
        await assertLayout(page, `${engine} ${count} player form`);
        await create(page, 'liar', count);
        for (const game of ['liar', 'spy', 'taboo']) {
          const before = await read(page);
          assert.equal(before.session.round.playerCount, count);
          const links = await collectInviteLinks(page);
          assert.equal(new Set(links).size, count);
          links.forEach(url => assert.equal(decodePayload(new URL(url).hash).count, count));
          await begin(page); await page.locator('[data-action="judge"]').click();
          if (game === 'taboo') await page.locator('[data-action="settle"]').click();
          else {
            // A cycle gives every player one vote: a tied highest count.
            for (let i = 0; i < count; i++) await page.locator(`#vote-${i}`).selectOption(String((i + 1) % count));
            await page.locator('[data-action="confirm-votes"]').click();
          }
          await page.locator('.result-banner').waitFor();
          const after = await read(page);
          assert.deepEqual(after.session.round.result, scoreRound(after.session.round, after.session.round.decision));
          assert.equal(after.session.history.length, ['liar', 'spy', 'taboo'].indexOf(game) + 1);
          await assertLayout(page, `${engine} ${count} ${game} result`);
          if (game !== 'taboo') {
            await page.locator('#next-game').selectOption(game === 'liar' ? 'spy' : 'taboo');
            await page.locator('[data-action="next-round"]').click();
          }
        }
        await page.locator('[data-action="new-group"]').first().click(); await page.locator('[data-action="confirm-new-group"]').click();
        assert.equal(await page.locator('#player-count').inputValue(), String(count));
        await context.close();
      }
      // Malformed URLs, XSS-bearing names/payloads, and blocked localStorage.
      const edge = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 2, locale: 'ko-KR' });
      const bad = await edge.newPage(); watch(bad); await bad.goto(new URL('card.html#broken', base).href);
      await bad.getByRole('heading', { name: '카드를 열 수 없어요' }).waitFor(); await assertLayout(bad, `${engine} invalid card`);
      const payload = { v: 1, roundId: 'a'.repeat(24), round: 1, game: 'liar', recipient: '<b>X</b>', seat: 1, info: { role: 'citizen', category: '<svg onload=alert(1)>', word: '<img src=x onerror=alert(1)>' } };
      await bad.goto(new URL(`card.html#${encodePayload(payload)}`, base).href); await bad.locator('#toggle-card').click();
      assert.equal(await bad.locator('#main img, #main b, #main svg[onload]').count(), 0); await assertLayout(bad, `${engine} XSS text card`);
      await bad.goto(base); await bad.locator('#player-0').fill('<b>X</b>'); await bad.locator('#player-1').fill('나'); await bad.locator('#player-2').fill('다'); await bad.getByRole('button', { name: '게임 만들기', exact: true }).click();
      assert.equal(await bad.locator('.invite-card h3 b').count(), 0);
      await bad.locator('[data-action="new-group"]').click(); await bad.locator('[data-action="confirm-new-group"]').click();
      for (const [i, name] of ['가나다라마바사아자차카타', 'ABCDEFGHIJKL', '😊'.repeat(12)].entries()) await bad.locator(`#player-${i}`).fill(name);
      await bad.getByRole('button', { name: '게임 만들기', exact: true }).click(); await bad.locator('#invite-0').waitFor();
      await assertLayout(bad, `${engine} 320px maximum-length names`);
      await bad.locator('[data-action="new-group"]').click(); await bad.locator('[data-action="confirm-new-group"]').click();
      await bad.locator('.game-choice').nth(2).click();
      await bad.locator('#player-count').selectOption('8');
      for (let i = 0; i < 8; i++) await bad.locator(`#player-${i}`).fill('😊'.repeat(11) + i);
      await bad.getByRole('button', { name: '게임 만들기', exact: true }).click();
      const denseLinks = await collectInviteLinks(bad, true);
      await assertMobileLayouts(bad, `${engine} maximum-density QR`);
      await bad.locator('[data-action="qr-large"]').click();
      assert.equal(await scanQR(bad, 'dialog .invite-qr'), denseLinks[0]);
      await assertMobileLayouts(bad, `${engine} maximum-density enlarged QR`);
      await screenshot(bad, `${engine}-qr-dense-mobile`, false);
      await bad.keyboard.press('Escape');
      await bad.locator('dialog[open]').waitFor({ state: 'hidden' });
      await showInvite(bad, 1);
      assert.equal(await bad.locator('.invite-qr').count(), 1);
      await edge.close();
      const blocked = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
      await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }); });
      const blockedPage = await blocked.newPage(); watch(blockedPage); await blockedPage.goto(base); await create(blockedPage, 'taboo'); assert.equal(await blockedPage.locator('#storage-warning').isVisible(), true); await blocked.close();
      reports.push({ engine, status: 'passed', games: 3, playerCountsFullFlow: [3, 8], playerCountsHostFlow: [3, 4, 5, 6, 7, 8], mobileWidths: [320, 360, 390, 430, 768], desktopWidth: 1280, basePath: '/ggme/', qrDecodedFromRenderedSVG: true, singleInviteNavigation: true, maximumDensityQR: true });
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, [], 'browser console/page errors'); assert.deepEqual(externalRequests, [], 'unexpected external network requests');
  const report = { checkedAt: new Date().toISOString(), reports, errors, externalRequests, physicalDevicesTested: false };
  await writeFile(new URL('report.json', artifacts), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { server?.kill(); }
