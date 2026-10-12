import { decodePayload } from './links.js';
import { escapeHTML as e, icon, gameIcon } from './ui.js';

const names = { liar: '라이어 게임', spy: '스파이 게임', taboo: '금지어 게임' };
const main = document.querySelector('#main');
let card;
let visible = false;
function render() {
  let content = '';
  if (visible) {
    const i = card.info;
    if (card.game === 'liar') content = i.role === 'liar' ? `<span class="eyebrow">YOUR SECRET ROLE</span><h2>당신은 라이어</h2><p class="secret-lead">단어를 아는 척, 자연스럽게.</p><div class="secret-info"><span>카테고리</span><strong>${e(i.category)}</strong></div><p>다른 사람의 설명을 듣고 단어를 추리하세요.<br>지목되면 마지막으로 단어를 맞힐 기회가 있어요.</p>` : `<span class="eyebrow">YOUR SECRET WORD</span><h2>당신은 시민</h2><div class="secret-word">${e(i.word)}</div><p class="secret-category">${e(i.category)}</p><p>단어를 직접 말하지 않고 설명하세요.<br>단어를 모르는 라이어를 찾아보세요.</p>`;
    if (card.game === 'spy') content = i.role === 'spy' ? `<span class="eyebrow">YOUR SECRET ROLE</span><h2>당신은 스파이</h2><p class="secret-lead">지금, 여기는 어디일까요?</p><div class="secret-info"><span>장소 정보</span><strong>알 수 없음</strong></div><p>대화 속 단서를 모아 장소를 추리하세요.<br>투표 전에 장소를 한 번 추측할 수 있어요.</p>` : `<span class="eyebrow">YOUR SECRET LOCATION</span><h2>당신은 시민</h2><div class="secret-word">${e(i.location)}</div><p class="secret-category">나의 직업 · ${e(i.job)}</p><p>이 장소에 있는 사람처럼 대답하세요.<br>장소를 모르는 스파이를 찾아보세요.</p>`;
    if (card.game === 'taboo') content = `<span class="eyebrow">THEIR FORBIDDEN WORDS</span><h2>말하게 만들어요</h2><div class="taboo-secrets">${i.others.map(o => `<div><span>${e(o.name)}님의 금지어</span><strong>${e(o.word)}</strong></div>`).join('')}</div><p>내 금지어는 다른 ${(card.count ?? 3) - 1}명만 알고 있어요.<br>상대가 금지어를 말하면 함께 확인해 주세요.</p>`;
  } else content = `${icon('lock', 'sealed-icon')}<span class="eyebrow">FOR YOUR EYES ONLY</span><h2>당신만의 비밀이<br>도착했어요.</h2><p>주변에 화면이 보이지 않는지 확인한 뒤<br>카드를 열어 주세요.</p>`;
  main.innerHTML = `<div class="personal-intro"><span class="game-badge ${card.game}">${gameIcon(card.game)}${names[card.game]}</span><p class="eyebrow">ROUND ${card.round.toString().padStart(2, '0')} · ${card.roundId.slice(0, 6).toUpperCase()}</p><h1>${e(card.recipient)}님의 비밀 카드</h1><p>본인 이름과 이번 라운드 번호를 확인해 주세요.</p></div><section class="secret-card ${visible ? 'is-revealed' : ''}" aria-live="polite">${content}</section><button class="button primary full" id="toggle-card" aria-expanded="${visible}">${icon(visible ? 'lock' : 'eye')}${visible ? '비밀 카드 숨기기' : '비밀 카드 확인하기'}</button><p class="personal-note">${icon('info')}화면을 떠나거나 앱을 바꾸면 카드가 자동으로 숨겨져요.</p><div class="manual-note"><strong>진행은 함께, 직접.</strong><p>이 화면은 생성자와 자동으로 동기화되지 않아요. 확인했다면 직접 알려 주세요. 새 라운드는 새 링크로 열어 주세요. 이전 링크는 계속 열 수 있어요.</p></div>`;
  document.querySelector('#toggle-card').addEventListener('click', () => { visible = !visible; render(); document.querySelector('#toggle-card').focus({ preventScroll: true }); });
}
function hide() { if (visible) { visible = false; render(); } }
function initialize() {
  visible = false;
  try { card = decodePayload(location.hash); render(); }
  catch (error) { main.innerHTML = `<section class="empty-state">${icon('lock')}<p class="eyebrow">LINK CHECK</p><h1>카드를 열 수 없어요</h1><p>${e(error.message)}</p><p>메신저에서 링크가 잘렸다면 링크 전체를 다시 받아 주세요.</p><a class="button primary" href="./">생성자 홈으로</a></section>`; }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
window.addEventListener('blur', hide);
window.addEventListener('pagehide', hide);
window.addEventListener('pageshow', hide);
window.addEventListener('hashchange', initialize);
initialize();
