import { validateNames, majorityTarget, scoreRound, commitResult, remainingMs, formatTime } from './core.js';
import { GAMES, WORDS } from './data.js';
import { createSession, createRound, personalPayload } from './round.js';
import { makeInvite } from './links.js';
import { loadStore, saveStore, STORAGE_KEY } from './storage.js';
import { escapeHTML as e, icon, gameIcon, avatar } from './ui.js';

const main = document.querySelector('#main');
const modal = document.querySelector('#modal');
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('저장소를 사용할 수 없습니다.'); }, setItem() { throw new Error('저장소를 사용할 수 없습니다.'); } }; }
const loaded = loadStore(storage);
let store = loaded.value;
let setup = { game: 'liar', category: 'daily', seconds: 180, playerCount: 3, names: Array(8).fill('') };
let toastTimeout;
let storageDirty = false;

function toast(message) {
  const node = document.querySelector('#toast');
  clearTimeout(toastTimeout); node.textContent = message; node.hidden = false;
  toastTimeout = setTimeout(() => { node.hidden = true; }, 4000);
}
function persist() {
  storageDirty = !saveStore(storage, store);
  document.querySelector('#storage-warning').hidden = !storageDirty;
  document.querySelector('#history-count').textContent = String(store.archive.length + (store.session?.history.length || 0));
}
function showModal(title, html) {
  document.querySelector('#modal-title').textContent = title;
  document.querySelector('#modal-body').innerHTML = html;
  if (!modal.open) modal.showModal();
}
function closeModal() { modal.close(); }
function focusMain() { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
function ruleText(game) {
  if (game === 'liar') return '<li>시민들은 같은 단어를, 라이어 1명은 카테고리만 알아요.</li><li>자신을 제외한 한 사람에게 투표해요. 단독 최다 득표자를 지목해요. 최다 득표가 동률이면 라이어가 이겨요.</li><li>라이어가 지목되면 단어를 한 번 추측해요. 정답이면 라이어 승리, 오답이면 시민 승리예요.</li><li>라이어 승리 시 라이어 +3점. 시민 승리 시 시민 각각 +2점. 패자는 0점이에요.</li>';
  if (game === 'spy') return '<li>시민들은 같은 장소와 각자의 직업을, 스파이 1명은 자기 역할만 알아요.</li><li>스파이는 투표 전에 장소를 한 번 추측할 수 있어요. 정답이면 스파이, 오답이면 시민이 즉시 이겨요.</li><li>추측하지 않았다면 투표해요. 자신에게 투표할 수 없어요. 스파이가 단독 최다 득표면 시민 승리, 오지목·최다 득표 동률이면 스파이 승리예요.</li><li>스파이 승리 시 스파이 +3점. 시민 승리 시 시민 각각 +2점. 패자는 0점이에요.</li>';
  return '<li>서로 다른 금지어를 하나씩 받아요. 내 카드에는 다른 참가자들의 금지어만 보여요.</li><li>금지어와 정확히 같은 말을 하면 위반 1회예요. 조사나 어미가 붙은 표현도 포함하되, 의미가 다른 단어의 일부는 제외해요.</li><li>참가자들이 동의한 위반만 생성자가 기록해요. 실수로 중복 입력했다면 − 버튼으로 되돌려요.</li><li>각자 기본 3점에서 위반당 1점 차감해요. 최소 0점이며, 가장 높은 점수가 승리해요. 동점은 공동 승리예요.</li>';
}
function rules(game) {
  showModal(`${GAMES[game].name} 플레이 방법`, `<div class="rule-intro ${game}">${gameIcon(game)}<p>${e(GAMES[game].short)}</p></div><ol class="rules-list">${ruleText(game)}</ol><div class="notice"><strong>임시 규칙 v1</strong><p>요청된 설계서 원문을 확인하기 전의 플레이 규칙입니다. 원문 규칙과의 일치는 아직 검증되지 않았어요.</p></div>${game !== 'taboo' ? '<p class="subtle">단어·장소 정답은 공백과 영문 대소문자를 제외하고 정확히 비교해요. 동의어는 자동 인정하지 않아요.</p>' : ''}<button class="button primary full" data-action="close-modal">알겠어요</button>`);
}
function renderHome(moveFocus = false) {
  main.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">C:\\GGME&gt; START</span><span class="pill"><span class="tiny-dot"></span>3~8명이 모이면, 준비 끝</span><h1>우리 중,<br><span>누가 비밀을 숨길까?</span></h1><p>휴대폰에는 나만의 비밀을.<br>테이블 위에는 끝없는 의심을.</p><div class="hero-meta"><span>${icon('people')}3~8명 선택</span><span>${icon('clock')}한 판 2–10분</span><span>${icon('chat')}같은 자리에서</span></div></div><div class="terminal-output" aria-hidden="true"><div class="terminal-output-head">C:\\GGME\\SYSTEM &nbsp; [MANUAL MODE]</div><div class="terminal-output-body"><p>GGME [Version 0.2.0]</p><p class="terminal-muted">SOCIAL DEDUCTION / 3–8 PLAYERS</p><div class="terminal-divider"></div><div class="terminal-menu"><span>[01]</span><span>LIAR.EXE</span><span>라이어</span></div><div class="terminal-menu"><span>[02]</span><span>SPY.EXE</span><span>스파이</span></div><div class="terminal-menu"><span>[03]</span><span>TABOO.EXE</span><span>금지어</span></div><div class="terminal-divider"></div><p class="terminal-muted">비밀 카드는 각자의 화면에.</p><p class="terminal-muted">진행은 생성자가, 대화는 함께.</p><p class="terminal-prompt">C:\\GGME&gt;<span class="terminal-cursor"></span></p></div></div></section>
    <form id="create-form" novalidate>
      <section class="game-section"><div class="section-heading"><div><span class="step-number">01</span><h2>오늘은 어떤 게임?</h2></div><span class="section-caption">하나를 골라 주세요</span></div><div class="game-grid">${Object.entries(GAMES).map(([id, game], i) => `<label class="game-choice"><input type="radio" name="game" value="${id}" ${setup.game === id ? 'checked' : ''}><span class="game-card ${id}"><span class="game-card-top"><span class="game-symbol">${gameIcon(id)}</span><span class="choice-indicator">${icon('check')}</span></span><span class="eyebrow">0${i + 1} / ${game.en}</span><strong>${game.name}</strong><span class="game-description">${e(game.description).replace(/\n/g, '<br> ')}</span><span class="game-card-bottom"><span>${game.tag}</span><span>${game.time / 60} MIN ${icon('arrow')}</span></span></span></label>`).join('')}</div><button type="button" class="text-button rule-link" data-action="selected-rules">${icon('info')}선택한 게임의 규칙 보기</button></section>
      <section class="panel setup-panel"><div class="player-setup"><div class="section-heading"><div><span class="step-number">02</span><h2>함께할 사람들</h2></div></div><p class="section-description">생성자도 참가할 수 있어요. 서로 다른 이름을 입력해 주세요.</p><label class="select-label count-label" for="player-count">참가 인원<select id="player-count" name="playerCount">${Array.from({ length: 6 }, (_, i) => i + 3).map(n => `<option value="${n}" ${setup.playerCount === n ? 'selected' : ''}>${n}명</option>`).join('')}</select></label><div class="player-fields" id="player-fields">${Array.from({ length: setup.playerCount }, (_, i) => i).map(i => `<label><span class="input-label"><span class="seat-dot seat-${i}">${i + 1}</span>참가자 ${i + 1}</span><input id="player-${i}" name="player-${i}" type="text" autocomplete="off" maxlength="24" placeholder="이름 또는 닉네임" value="${e(setup.names[i])}" aria-describedby="name-help form-error" required></label>`).join('')}</div><p id="name-help" class="field-help">이름은 1~12자 · 같은 이름은 사용할 수 없어요</p><p id="form-error" class="form-error" role="alert" hidden></p></div><div class="game-settings"><div class="settings-heading">${icon('clock')}라운드 설정</div><label class="select-label" for="duration">대화 시간<select id="duration" name="duration">${durationOptions(setup.seconds)}</select></label><label class="select-label" id="category-label" for="category" ${setup.game === 'liar' ? '' : 'hidden'}>단어 카테고리<select id="category" name="category">${categoryOptions(setup.category)}</select></label><p class="field-help">시간이 끝나면 생성자가 직접 판정해요.</p></div></section>
      <div class="create-bar"><div>${icon('lock')}<p><strong>비밀은 각자의 링크에만</strong><span>게임을 만들면 참가자마다 개인 초대 링크가 생겨요.</span></p></div><button class="button primary create-button" type="submit">게임 만들기${icon('arrow')}</button></div>
    </form><div class="manual-banner">${icon('info')}<p><strong>같은 자리에서, 직접 대화하는 게임이에요.</strong> 링크 전달·시작·투표·판정은 생성자가 진행하며, 기기 간 자동 동기화는 제공하지 않아요.</p></div><p class="draft-note">설계서 확인 대기 · 승패와 점수는 임시 규칙 v1을 적용합니다.</p>`;
  if (moveFocus) focusMain();
}
function durationOptions(selected) { return [120, 180, 240, 300, 420, 600].map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s / 60}분${s === 180 ? ' · 가볍게 한 판' : ''}</option>`).join(''); }
function categoryOptions(selected) { return Object.entries(WORDS).map(([id, category]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${category.label}</option>`).join(''); }
function roundHeader() {
  const s = store.session, r = s.round, game = GAMES[r.game];
  const phases = ['invite', 'play', 'judge', 'result'];
  const current = phases.indexOf(r.phase);
  return `<div class="round-top"><div><span class="eyebrow">HOST’S TABLE · 생성자 화면</span><h1>${game.name}<span class="round-number">ROUND ${r.number.toString().padStart(2, '0')}</span></h1><p>라운드 코드 ${r.id.slice(0, 6).toUpperCase()} · ${r.seconds / 60}분${r.game === 'liar' ? ` · ${e(WORDS[r.category].label)}` : ''}</p></div><button class="button secondary small" data-action="new-group">새 게임</button></div><div class="score-strip">${s.players.map((name, i) => `<div>${avatar(name, i)}<span>${e(name)}</span><strong>${s.totals[i]}<small>점</small></strong></div>`).join('')}<span class="score-caption">통산 점수</span></div><ol class="phase-stepper" aria-label="게임 진행 단계">${['링크 전달', '대화하기', '투표·판정', '결과'].map((label, i) => `<li class="${i === current ? 'current' : i < current ? 'complete' : ''}" ${i === current ? 'aria-current="step"' : ''}><span>${i < current ? icon('check') : String(i + 1).padStart(2, '0')}</span>${label}</li>`).join('')}</ol>`;
}
function inviteScreen() {
  const s = store.session, r = s.round;
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  return `<section class="round-section"><div class="section-heading"><div><span class="step-number">01</span><h2>비밀을 한 사람씩 전달해요</h2></div></div><p class="section-description">이름을 확인하고, 해당 참가자에게만 개인 링크를 보내 주세요. 카드 확인 후 직접 알려 달라고 해 주세요.</p>${isLocal ? '<div class="notice"><strong>현재 주소는 이 컴퓨터에서만 열려요.</strong><p>휴대폰으로 플레이하려면 GitHub Pages 주소 또는 같은 Wi-Fi의 컴퓨터 IP 주소로 접속한 뒤 링크를 만들어 주세요.</p></div>' : ''}<div class="invite-grid">${s.players.map((name, i) => { const link = makeInvite(personalPayload(s, i), location.href); return `<article class="panel invite-card"><div class="invite-card-head">${avatar(name, i)}<div><h3>${e(name)}</h3><span>참가자 ${i + 1} · 개인 카드</span></div>${icon('lock')}</div><label class="sr-only" for="invite-${i}">${e(name)}님의 초대 링크</label><input class="link-field" id="invite-${i}" value="${e(link)}" readonly><div class="invite-actions"><button class="button secondary" data-action="copy" data-seat="${i}">${icon('copy')}링크 복사</button><button class="icon-button bordered" data-action="share" data-seat="${i}" aria-label="${e(name)}님 링크 공유">${icon('share')}</button></div><a class="text-button open-card" href="${e(link)}" target="_blank" rel="noopener noreferrer">이 기기에서 카드 열기 ↗</a><label class="delivered-check"><input type="checkbox" data-delivered="${i}" ${r.shared[i] ? 'checked' : ''}><span>링크 전달 및 카드 확인 완료</span></label></article>`; }).join('')}</div><p class="field-help">체크 표시는 생성자가 수동으로 기록해요. 참가자의 접속·카드 열람 여부를 자동으로 확인하지 않아요. 이 기기에서는 본인 카드만 열어 주세요.</p><div class="round-actions"><button class="text-button" data-action="rules">${icon('info')}플레이 방법</button><button class="button primary" data-action="start" ${r.shared.every(Boolean) ? '' : 'disabled'}>모두 확인했어요 · 대화 시작${icon('arrow')}</button></div></section>`;
}
function timerPanel() {
  const r = store.session.round;
  return `<section class="timer-panel"><span class="eyebrow">TIME TO TALK</span><div class="timer-value" id="timer-value" role="timer" aria-label="남은 대화 시간">${formatTime(remainingMs(r.timer))}</div><p id="timer-status">${r.timer.running ? '대화가 진행 중이에요' : '준비되면 타이머를 시작해 주세요'}</p><div class="timer-actions"><button class="button timer-toggle" data-action="toggle-timer">${icon(r.timer.running ? 'pause' : 'play')}<span>${r.timer.running ? '일시정지' : '타이머 시작'}</span></button><button class="icon-button" data-action="reset-timer" aria-label="타이머 초기화">${icon('reset')}</button></div><span class="timer-footnote">앱을 바꿔도 경과 시간은 반영돼요.</span></section>`;
}
function playScreen() {
  const r = store.session.round, game = GAMES[r.game];
  return `<section class="round-section play-layout">${timerPanel()}<div class="play-guidance"><span class="eyebrow">LET’S PLAY</span><h2>${r.game === 'taboo' ? '무심코 한마디,\n그게 금지어일지도.' : '자연스럽게 말하고,\n조심스럽게 의심해요.'}</h2><ol>${game.steps.map((step, i) => `<li><span>0${i + 1}</span>${e(step)}</li>`).join('')}</ol><button class="text-button" data-action="rules">${icon('info')}승패·점수 규칙 확인</button><div class="notice"><p>타이머 종료는 대화 시간 안내예요. 게임을 자동 종료하거나 승패를 판정하지 않아요.</p></div></div></section><div class="round-actions"><button class="button secondary" data-action="back-invite">${icon('copy')}초대 링크 다시 보기</button><button class="button primary" data-action="judge">${r.game === 'taboo' ? '금지어 위반 기록하기' : '투표·판정하기'}${icon('arrow')}</button></div>`;
}
function violationRows() {
  return store.session.players.map((name, i) => `<div class="violation-row">${avatar(name, i)}<strong>${e(name)}</strong><div class="counter"><button class="icon-button" data-action="count" data-seat="${i}" data-delta="-1" aria-label="${e(name)}님 위반 횟수 줄이기" ${store.session.round.draft.violations[i] === 0 ? 'disabled' : ''}>−</button><output id="violation-${i}" aria-label="${e(name)}님 위반 횟수">${store.session.round.draft.violations[i]}</output><button class="icon-button" data-action="count" data-seat="${i}" data-delta="1" aria-label="${e(name)}님 위반 횟수 늘리기" ${store.session.round.draft.violations[i] === 99 ? 'disabled' : ''}>+</button></div></div>`).join('');
}
function judgeScreen() {
  const s = store.session, r = s.round, d = r.draft;
  let body = '';
  if (r.game === 'taboo') body = `<h2>우리끼리 확인한 금지어 위반</h2><p class="section-description">동의한 위반 횟수만 기록해 주세요. 저장 전까지 수정할 수 있어요.</p><div class="violation-list">${violationRows()}</div><p class="field-help">기본 3점 − 위반 횟수 · 최소 0점 · 가장 높은 점수가 승리</p><button class="button primary full" data-action="settle">판정 및 점수 저장${icon('check')}</button>`;
  else if (r.votesLocked) {
    const target = majorityTarget(d.votes);
    body = `<span class="eyebrow">ONE LAST CHANCE</span><h2>${e(s.players[target])}님의 마지막 추측</h2><p class="section-description">지목된 참가자가 말한 단어를 그대로 입력해 주세요. 모르거나 포기하면 ‘모름’을 입력하세요.</p><div class="vote-summary">${s.players.map((name, i) => `<p><span>${e(name)}</span>${icon('arrow')}<strong>${e(s.players[d.votes[i]])}</strong></p>`).join('')}</div><label class="select-label" for="guess">마지막 단어 추측<input id="guess" data-draft="guess" maxlength="80" autocomplete="off" placeholder="참가자가 말한 단어" value="${e(d.guess)}"></label><p class="field-help">공백·영문 대소문자를 제외하고 정확히 비교해요. 동의어는 자동 인정하지 않아요.</p><button class="button primary full" data-action="settle">판정 및 점수 저장${icon('check')}</button><button class="text-button full" data-action="unlock-votes">투표 입력 수정하기</button>`;
  } else {
    const early = r.game === 'spy' && d.earlyGuess;
    body = `<h2>모두의 선택을 기록해요</h2><p class="section-description">먼저 동시에 지목한 뒤, 생성자가 입력해 주세요. 입력 내용은 상대 기기로 전송되지 않아요.</p>${r.game === 'spy' ? `<label class="early-guess"><input type="checkbox" data-draft="earlyGuess" ${early ? 'checked' : ''}><span>스파이가 투표 전에 장소를 추측했어요</span></label>` : ''}${early ? `<div class="notice"><p>스파이가 말한 장소를 입력해 주세요. 정답·오답에 따라 즉시 승패를 판정해요.</p></div><label class="select-label" for="guess">스파이의 장소 추측<input id="guess" data-draft="guess" maxlength="80" autocomplete="off" placeholder="스파이가 말한 장소" value="${e(d.guess)}"></label><p class="field-help">장소 추측은 한 번뿐이에요. 공백·영문 대소문자를 제외하고 정확히 비교해요.</p>` : `<div class="vote-fields">${s.players.map((name, i) => `<label class="vote-field" for="vote-${i}">${avatar(name, i)}<span><strong>${e(name)}</strong>님의 투표</span><select id="vote-${i}" data-vote="${i}"><option value="">누구를 지목했나요?</option>${s.players.map((target, j) => j === i ? '' : `<option value="${j}" ${d.votes[i] === j ? 'selected' : ''}>${e(target)}</option>`).join('')}</select></label>`).join('')}</div><p class="field-help">단독 최다 득표자 지목 · 최다 득표 동률이면 ${r.game === 'liar' ? '라이어' : '스파이'} 승리</p>`}<button class="button primary full" data-action="confirm-votes">${early ? '장소 추측 판정 및 점수 저장' : '투표 확정'}${icon('arrow')}</button>`;
  }
  return `<section class="judge-container"><div class="panel judge-panel">${body}<p id="judge-error" class="form-error" role="alert" hidden></p></div><div class="judge-aside">${icon('people')}<h3>마지막까지 공정하게</h3><p>판정을 저장하면 결과와 비밀 정보가 공개되고 통산 점수에 한 번만 반영돼요.</p><button class="text-button" data-action="rules">규칙 다시 보기${icon('arrow')}</button><span class="rules-tag">임시 규칙 v1 적용</span></div></section><div class="round-actions"><button class="button secondary" data-action="back-play">대화 화면으로 돌아가기</button></div>`;
}
function resultScreen() {
  const s = store.session, r = s.round, result = r.result;
  const winnerNames = result.winners.map(i => s.players[i]).join(', ');
  return `<section class="result-container"><div class="result-banner">${icon('trophy')}<span class="eyebrow">ROUND COMPLETE</span><h2>${e(winnerNames)}${result.winners.length > 1 ? ' 공동' : ''} 승리!</h2><p>${e(result.reason)}</p><span class="saved-label">${icon('check')}${storageDirty ? '현재 탭에 반영됨 · 브라우저 저장 실패' : '결과와 점수를 이 브라우저에 저장했어요'}</span></div><div class="result-scores">${s.players.map((name, i) => `<div class="panel result-player ${result.winners.includes(i) ? 'winner' : ''}">${avatar(name, i)}<h3>${e(name)}</h3><span>${r.game === 'liar' ? r.special === i ? '라이어' : '시민' : r.game === 'spy' ? r.special === i ? '스파이' : '시민' : `위반 ${r.decision.violations[i]}회`}</span><strong>+${result.points[i]}<small>점</small></strong><p>통산 ${s.totals[i]}점</p></div>`).join('')}</div><div class="reveal-bar">${icon('eye')}<span>${r.game === 'taboo' ? '우리의 금지어' : r.game === 'liar' ? '비밀 단어' : '비밀 장소'}</span><strong>${r.game === 'taboo' ? s.players.map((name, i) => `${e(name)}: ${e(r.words[i])}`).join(' · ') : e(r.secret)}</strong></div><section class="panel next-round"><div><h3>한 판 더, 이번엔 다른 비밀로.</h3><p>같은 참가자들의 점수는 이어져요. 매 라운드 역할과 링크를 새로 배정해요.</p></div><label class="sr-only" for="next-game">다음 라운드 게임</label><select id="next-game">${Object.entries(GAMES).map(([id, g]) => `<option value="${id}" ${r.game === id ? 'selected' : ''}>${g.name}</option>`).join('')}</select><button class="button primary" data-action="next-round">다음 라운드${icon('arrow')}</button></section><div class="round-actions"><button class="text-button" data-action="history">${icon('trophy')}플레이 기록 보기</button><button class="text-button" data-action="new-group">새 멤버로 시작하기</button></div></section>`;
}
function renderRound(moveFocus = false) {
  const phase = store.session.round.phase;
  main.innerHTML = `${roundHeader()}${({ invite: inviteScreen, play: playScreen, judge: judgeScreen, result: resultScreen }[phase])()}<div class="manual-banner">${icon('info')}<p>생성자 중심 수동 진행 · 개인 화면과 자동으로 동기화되지 않아요. 새 라운드에서는 새 링크를 전달해 주세요.</p></div>`;
  updateTimer(); if (moveFocus) focusMain();
}
function render(moveFocus = false) { store.session ? renderRound(moveFocus) : renderHome(moveFocus); }
function updateTimer() {
  const r = store.session?.round;
  if (!r) return;
  const remaining = remainingMs(r.timer);
  if (r.timer.running && remaining === 0) { r.timer.running = false; r.timer.remaining = 0; r.timer.deadline = null; persist(); toast('대화 시간이 끝났어요. 함께 마무리한 뒤 판정해 주세요.'); }
  const clock = document.querySelector('#timer-value');
  if (!clock) return;
  clock.textContent = formatTime(remaining);
  clock.classList.toggle('time-up', remaining === 0);
  document.querySelector('#timer-status').textContent = remaining === 0 ? '시간이 끝났어요 · 생성자가 직접 판정해 주세요' : r.timer.running ? '대화가 진행 중이에요' : remaining === r.seconds * 1000 ? '준비되면 타이머를 시작해 주세요' : '잠시 쉬어가는 중이에요';
  const toggle = document.querySelector('[data-action="toggle-timer"]');
  toggle.innerHTML = `${icon(r.timer.running ? 'pause' : 'play')}<span>${r.timer.running ? '일시정지' : remaining === 0 ? '시간 종료' : remaining < r.seconds * 1000 ? '계속하기' : '타이머 시작'}</span>`;
  toggle.disabled = remaining === 0;
}
function pauseTimer() {
  const r = store.session.round;
  r.timer.remaining = remainingMs(r.timer); r.timer.running = false; r.timer.deadline = null;
}
function phase(name) { store.session.round.phase = name; persist(); renderRound(true); }
function showError(message) {
  const node = document.querySelector('#judge-error') || document.querySelector('#form-error');
  if (node) { node.textContent = message; node.hidden = false; node.scrollIntoView({ block: 'nearest' }); } else toast(message);
}
function settle() {
  const r = store.session.round;
  if (r.result) return;
  if (r.votesLocked && !r.draft.guess.trim()) throw new Error('마지막 단어 추측을 입력해 주세요. 포기하면 ‘모름’을 입력하세요.');
  const result = scoreRound(r, r.draft);
  store.session = commitResult(store.session, result, structuredClone(r.draft));
  persist(); renderRound(true);
}
async function copyLink(seat) {
  const text = makeInvite(personalPayload(store.session, seat), location.href);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard');
    await navigator.clipboard.writeText(text);
  } catch {
    const field = document.querySelector(`#invite-${seat}`);
    if (field) { field.focus(); field.select(); field.setSelectionRange(0, field.value.length); }
    let copied = false; try { copied = !!field && document.execCommand('copy'); } catch { /* manual fallback below */ }
    if (!copied) { showModal('개인 링크 복사', `<p>아래 링크를 길게 눌러 전체를 복사한 뒤 해당 참가자에게 보내 주세요.</p><textarea class="manual-link" readonly aria-label="복사할 개인 링크">${e(text)}</textarea><button class="button primary full" data-action="close-modal">닫기</button>`); return; }
  }
  toast(`${store.session.players[seat]}님의 링크를 복사했어요. 개인 메시지로 보내 주세요.`);
}
function history() {
  const entries = [...(store.session?.history || []), ...store.archive].sort((a, b) => b.endedAt - a.endedAt);
  showModal('플레이 기록', `${entries.length ? `<p class="subtle">이 브라우저에 저장된 최근 ${entries.length}라운드예요. 새 멤버로 시작하면 통산 점수는 새로 계산해요.</p><div class="history-list">${entries.map(h => `<article><div><span class="eyebrow">ROUND ${h.number} · ${GAMES[h.game].name}</span><time>${new Date(h.endedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div><strong>${h.result.winners.map(i => e(h.players[i])).join(', ')} 승리</strong><p>${h.players.map((name, i) => `${e(name)} +${h.result.points[i]}`).join(' · ')}</p><span class="subtle">${e(h.result.reason)}</span></article>`).join('')}</div><button class="button secondary full" data-action="export-history">${icon('share')}완료된 결과 내보내기 (JSON)</button>` : `<div class="empty-state">${icon('trophy')}<h3>첫 번째 이야기를 기다리고 있어요</h3><p>라운드를 마치면 결과가 여기에 쌓여요.</p></div>`}<button class="text-button full" data-action="close-modal">닫기</button>`);
}
function newGroup() {
  showModal('새 멤버로 시작할까요?', `<p>${store.session.round.result ? '완료된 플레이 기록은 보관하고, 참가자와 통산 점수를 새로 설정해요.' : '진행 중인 라운드는 점수를 반영하지 않고 종료해요. 이미 보낸 링크는 계속 열 수 있으므로 참가자에게 종료를 알려 주세요. 완료된 기록은 보관해요.'}</p><div class="modal-actions"><button class="button secondary" data-action="close-modal">계속 플레이</button><button class="button primary" data-action="confirm-new-group">새로 시작</button></div>`);
}
const actions = {
  'close-modal': closeModal,
  'selected-rules': () => rules(setup.game),
  rules: () => rules(store.session.round.game),
  history,
  guide: () => showModal('우리의 게임 나이트', `<ol class="rules-list"><li>생성자가 게임을 고르고 참가자 3~8명의 이름을 등록해요.</li><li>각자에게 다른 개인 링크를 보내요. 생성자도 참가한다면 본인 링크만 열어요.</li><li>개인 카드를 확인하고 함께 대화해요. 생성자는 타이머를 진행해요.</li><li>투표·금지어 위반을 직접 확인한 뒤 생성자가 판정해요.</li><li>결과와 통산 점수는 생성자의 이 브라우저에 저장돼요.</li></ol><div class="notice"><strong>서버 없이, 직접 진행해요.</strong><p>참가자의 접속, 카드 확인, 타이머, 투표는 기기 간 자동 공유되지 않아요. 이전 링크를 만료시키거나 회수할 수 없어요.</p></div><p class="subtle">링크는 비밀번호나 암호화된 인증 수단이 아니에요. 카드 정보가 주소에 담겨 있으니 해당 참가자에게만 전달하세요. 생성자 브라우저에는 전체 배정 정보가 있어요.</p><p class="subtle">현재 승패·점수는 설계서 확인 전 임시 규칙 v1입니다.</p><button class="button primary full" data-action="close-modal">시작해 볼까요</button>`),
  copy: button => copyLink(Number(button.dataset.seat)),
  share: async button => {
    const seat = Number(button.dataset.seat);
    if (!navigator.share) return copyLink(seat);
    try { await navigator.share({ title: `${store.session.players[seat]}님의 비밀 카드`, text: `셋의 비밀 · 라운드 ${store.session.round.number} · 본인만 열어 주세요.`, url: makeInvite(personalPayload(store.session, seat), location.href) }); } catch (error) { if (error.name !== 'AbortError') await copyLink(seat); }
  },
  start: () => { if (store.session.round.shared.every(Boolean)) phase('play'); },
  'back-invite': () => phase('invite'),
  'back-play': () => phase('play'),
  judge: () => { pauseTimer(); phase('judge'); },
  'toggle-timer': () => {
    const r = store.session.round, t = r.timer;
    if (t.running) pauseTimer(); else if (t.remaining > 0) { t.running = true; t.deadline = Date.now() + t.remaining; }
    persist(); updateTimer();
  },
  'reset-timer': () => showModal('타이머를 초기화할까요?', `<p>남은 시간을 ${store.session.round.seconds / 60}분으로 되돌리고 일시정지해요.</p><div class="modal-actions"><button class="button secondary" data-action="close-modal">취소</button><button class="button primary" data-action="confirm-reset-timer">초기화</button></div>`),
  'confirm-reset-timer': () => { const r = store.session.round; r.timer = { running: false, remaining: r.seconds * 1000, deadline: null }; persist(); closeModal(); updateTimer(); },
  count: button => {
    const i = Number(button.dataset.seat), delta = Number(button.dataset.delta);
    const d = store.session.round.draft;
    d.violations[i] = Math.max(0, Math.min(99, d.violations[i] + delta));
    persist(); renderRound();
    document.querySelector(`[data-action="count"][data-seat="${i}"][data-delta="${delta}"]`)?.focus({ preventScroll: true });
  },
  'confirm-votes': () => {
    const r = store.session.round;
    if (r.game === 'spy' && r.draft.earlyGuess) return settle();
    const target = majorityTarget(r.draft.votes);
    if (r.game === 'liar' && target !== null) { r.votesLocked = true; persist(); renderRound(true); } else settle();
  },
  'unlock-votes': () => { store.session.round.votesLocked = false; persist(); renderRound(true); },
  settle,
  'next-round': () => {
    const s = store.session, r = s.round;
    if (!r.result) return;
    if (r.number >= 9999) throw new Error('새 멤버 게임을 시작해 주세요.');
    const game = document.querySelector('#next-game').value;
    s.round = createRound(game, r.category, game === r.game ? r.seconds : GAMES[game].time, r.number + 1, s.players.length);
    persist(); renderRound(true);
  },
  'new-group': newGroup,
  'confirm-new-group': () => {
    store.archive = [...store.session.history, ...store.archive].sort((a, b) => b.endedAt - a.endedAt).slice(0, 200);
    setup = { game: store.session.round.game, category: store.session.round.category, seconds: store.session.round.seconds, playerCount: store.session.players.length, names: Array(8).fill('') };
    store.session = null; persist(); closeModal(); renderHome(true);
  },
  'export-history': () => {
    const completed = [...(store.session?.history || []), ...store.archive];
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), rounds: completed }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'three-of-us-results.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('완료된 라운드 결과를 내보냈어요.');
  }
};
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  try { await actions[button.dataset.action]?.(button); } catch (error) { showError(error.message || '작업을 완료하지 못했어요. 다시 시도해 주세요.'); }
});
document.addEventListener('submit', event => {
  if (event.target.id !== 'create-form') return;
  event.preventDefault();
  const form = new FormData(event.target);
  setup.playerCount = Number(form.get('playerCount'));
  const activeNames = Array.from({ length: setup.playerCount }, (_, i) => String(form.get(`player-${i}`) || ''));
  try {
    const names = validateNames(activeNames);
    store.session = createSession(names, String(form.get('game')), String(form.get('category')), Number(form.get('duration')));
    persist(); renderRound(true);
  } catch (error) { showError(error.message); document.querySelector('#player-0').focus(); }
});
document.addEventListener('change', event => {
  const input = event.target;
  if (input.name === 'game') {
    setup.game = input.value; setup.seconds = GAMES[input.value].time;
    document.querySelector('#duration').value = String(setup.seconds);
    document.querySelector('#category-label').hidden = input.value !== 'liar';
  }
  if (input.name === 'playerCount') {
    setup.playerCount = Number(input.value);
    renderHome();
    document.querySelector('#player-count').focus({ preventScroll: true });
  }
  if (input.name === 'duration') setup.seconds = Number(input.value);
  if (input.name === 'category') setup.category = input.value;
  if (input.dataset.delivered !== undefined) { store.session.round.shared[Number(input.dataset.delivered)] = input.checked; persist(); document.querySelector('[data-action="start"]').disabled = !store.session.round.shared.every(Boolean); }
  if (input.dataset.vote !== undefined) { store.session.round.draft.votes[Number(input.dataset.vote)] = input.value === '' ? '' : Number(input.value); persist(); }
  if (input.dataset.draft === 'earlyGuess') { store.session.round.draft.earlyGuess = input.checked; persist(); renderRound(); }
});
document.addEventListener('input', event => {
  if (event.target.dataset.draft === 'guess') { store.session.round.draft.guess = event.target.value; persist(); }
  if (event.target.name?.startsWith('player-')) { setup.names[Number(event.target.name.slice(-1))] = event.target.value; const error = document.querySelector('#form-error'); if (error) error.hidden = true; }
});
document.addEventListener('visibilitychange', updateTimer);
window.addEventListener('pageshow', updateTimer);
// A second host tab must not independently award points from a stale round.
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  const fresh = loadStore(storage);
  if (fresh.error) return toast('다른 탭의 저장 내용을 읽지 못했어요. 생성자 탭 하나에서 진행해 주세요.');
  store = fresh.value; closeModal(); render(); toast('같은 브라우저의 다른 생성자 탭에서 변경한 내용을 반영했어요.');
});
render();
document.querySelector('#history-count').textContent = String(store.archive.length + (store.session?.history.length || 0));
if (loaded.error) { toast(`저장 내용을 복원하지 못했어요: ${loaded.error}`); document.querySelector('#storage-warning').hidden = false; }
setInterval(updateTimer, 500);
