import { decodePayload } from './links.js?v=replies-1';
import { escapeHTML as e, icon, gameIcon } from './ui.js';
import { createResponse, encodeResponse } from './responses.js?v=replies-1';
import { qrSVG, fitQR } from './qr.js?v=replies-1';

const names = { liar: '라이어 게임', spy: '스파이 게임', taboo: '금지어 게임' };
const main = document.querySelector('#main');
let card;
let visible = false;
let replyMode = null, replyCode = null, replyVisible = false;
let voteDraft = '', guessDraft = '';
function responsePanel() {
  if (card.v !== 3) return card.game === 'taboo' ? '' : '<p class="personal-note">이전 카드는 생성자에게 직접 투표·추측을 알려 주세요. 새 라운드 링크부터 응답 QR을 사용할 수 있어요.</p>';
  if (!replyMode) return '<section class="panel response-panel"><h2>내 투표 전달하기</h2><p>생성자가 투표를 안내하면 입력하고 응답 QR을 보여 주세요.</p><button class="button secondary full" id="open-vote">투표 입력</button></section>';
  const title = replyMode === 'vote' ? '투표' : '정답 추측';
  if (replyCode) return `<section class="panel response-panel"><h2>${title} 응답 QR</h2><p>ROUND ${card.round} · ${e(card.recipient)}님의 응답</p><div id="response-private" ${replyVisible ? '' : 'hidden'}><div class="qr-frame">${qrSVG(replyCode, `${card.recipient}님의 ${title} 응답 QR`)}</div><p class="field-help">생성자 판정 화면의 ‘응답 QR 읽기’로 읽어 주세요. 자동으로 전송되거나 접수 확인이 오지 않아요.</p><label class="select-label" for="response-code">카메라 대신 전달할 응답 코드<textarea class="manual-link" id="response-code" readonly rows="3">${e(replyCode)}</textarea></label><button class="button secondary full" id="copy-response">응답 코드 복사</button></div><div class="response-actions"><button class="button secondary" id="toggle-response">${replyVisible ? '응답 QR 숨기기' : '응답 QR 다시 보기'}</button><button class="button secondary" id="edit-response">입력 수정</button></div><p id="response-status" class="field-help" role="status"></p><button class="text-button full" id="close-response">응답 창 닫기</button></section>`;
  return `<section class="panel response-panel"><h2>${title} 입력</h2><p>생성자의 안내에 따라 입력해 주세요. QR을 읽어야 생성자에게 전달돼요.</p><form id="response-form" novalidate>${replyMode === 'vote' ? `<label class="select-label" for="response-vote">누구에게 투표하나요?<select id="response-vote"><option value="">참가자 선택</option>${card.roster.map((name, i) => i + 1 === card.seat ? '' : `<option value="${i + 1}" ${voteDraft === String(i + 1) ? 'selected' : ''}>${e(name)}</option>`).join('')}</select></label>` : `<label class="select-label" for="response-guess">입력한 추측<input id="response-guess" maxlength="80" autocomplete="off" placeholder="추측한 단어 · 포기하면 모름" value="${e(guessDraft)}"></label>`}<p class="form-error" id="response-error" role="alert" hidden></p><button class="button primary full" type="submit">응답 QR 만들기</button></form><p id="response-status" class="field-help" role="status"></p><button class="text-button full" id="close-response">응답 창 닫기</button></section>`;
}
function openResponse(mode) { replyMode = mode; replyCode = null; replyVisible = false; visible = false; render(); document.querySelector('.response-panel h2')?.scrollIntoView({ block: 'start' }); }
function responseStatus(message) { const node = document.querySelector('#response-status'); if (node) node.textContent = message; }
async function copyResponse() {
  try { if (!navigator.clipboard?.writeText) throw new Error('clipboard'); await navigator.clipboard.writeText(replyCode); responseStatus('응답 코드를 복사했어요. 생성자의 코드 입력칸에 붙여 넣을 수 있어요.'); }
  catch {
    const field = document.querySelector('#response-code');
    if (field) { field.focus(); field.select(); field.setSelectionRange(0, field.value.length); }
    let copied = false; try { copied = !!field && document.execCommand('copy'); } catch { /* select for manual copy */ }
    responseStatus(copied ? '응답 코드를 복사했어요.' : '응답 QR을 표시한 뒤 아래 코드를 길게 눌러 복사해 주세요.');
  }
}
function render() {
  let content = '';
  if (visible) {
    const i = card.info;
    if (card.game === 'liar') content = i.role === 'liar' ? `<span class="eyebrow">YOUR SECRET ROLE</span><h2>당신은 라이어</h2><p class="secret-lead">단어를 아는 척, 자연스럽게.</p><div class="secret-info"><span>카테고리</span><strong>${e(i.category)}</strong></div><p>다른 사람의 설명을 듣고 단어를 추리하세요.<br>지목되면 마지막으로 단어를 맞힐 기회가 있어요.</p>` : `<span class="eyebrow">YOUR SECRET WORD</span><h2>당신은 시민</h2><div class="secret-word">${e(i.word)}</div><p class="secret-category">${e(i.category)}</p><p>단어를 직접 말하지 않고 설명하세요.<br>단어를 모르는 라이어를 찾아보세요.</p>`;
    if (card.game === 'spy') content = i.role === 'spy' ? `<span class="eyebrow">YOUR SECRET ROLE</span><h2>당신은 스파이</h2><p class="secret-lead">지금, 여기는 어디일까요?</p><div class="secret-info"><span>장소 정보</span><strong>알 수 없음</strong></div><p>대화 속 단서를 모아 장소를 추리하세요.<br>투표 전에 장소를 한 번 추측할 수 있어요.</p>` : `<span class="eyebrow">YOUR SECRET LOCATION</span><h2>당신은 시민</h2><div class="secret-word">${e(i.location)}</div><p class="secret-category">나의 직업 · ${e(i.job)}</p><p>이 장소에 있는 사람처럼 대답하세요.<br>장소를 모르는 스파이를 찾아보세요.</p>`;
    if (card.game === 'taboo') content = `<span class="eyebrow">THEIR FORBIDDEN WORDS</span><h2>말하게 만들어요</h2><div class="taboo-secrets">${i.others.map(o => `<div><span>${e(o.name)}님의 금지어</span><strong>${e(o.word)}</strong></div>`).join('')}</div><p>내 금지어는 다른 ${(card.count ?? 3) - 1}명만 알고 있어요.<br>상대가 금지어를 말하면 함께 확인해 주세요.</p>`;
  } else content = `${icon('lock', 'sealed-icon')}<span class="eyebrow">FOR YOUR EYES ONLY</span><h2>당신만의 비밀이<br>도착했어요.</h2><p>주변에 화면이 보이지 않는지 확인한 뒤<br>카드를 열어 주세요.</p>`;
  const guessButton = visible && card.v === 3 && ['liar', 'spy'].includes(card.info.role) ? '<button class="button secondary full" id="open-guess">생성자 안내에 따라 정답 추측 입력</button>' : '';
  main.innerHTML = `<div class="personal-intro"><span class="game-badge ${card.game}">${gameIcon(card.game)}${names[card.game]}</span><p class="eyebrow">ROUND ${card.round.toString().padStart(2, '0')} · ${card.roundId.slice(0, 6).toUpperCase()}</p><h1>${e(card.recipient)}님의 비밀 카드</h1><p>본인 이름과 이번 라운드 번호를 확인해 주세요.</p></div><section class="secret-card ${visible ? 'is-revealed' : ''}" aria-live="polite">${content}${guessButton}</section><button class="button primary full" id="toggle-card" aria-expanded="${visible}">${icon(visible ? 'lock' : 'eye')}${visible ? '비밀 카드 숨기기' : '비밀 카드 확인하기'}</button><p class="personal-note">${icon('info')}화면을 떠나거나 앱을 바꾸면 비밀 카드와 응답 QR이 숨겨져요.</p>${responsePanel()}<div class="manual-note"><strong>진행은 함께, 직접.</strong><p>이 화면은 생성자와 자동으로 동기화되지 않아요. 확인했다면 직접 알려 주세요. 새 라운드는 새 링크로 열어 주세요. 이전 링크는 계속 열 수 있어요.</p></div>`;
  document.querySelector('#toggle-card').addEventListener('click', () => { visible = !visible; replyVisible = false; render(); document.querySelector('#toggle-card').focus({ preventScroll: true }); });
  document.querySelector('#open-vote')?.addEventListener('click', () => openResponse('vote'));
  document.querySelector('#open-guess')?.addEventListener('click', () => openResponse('guess'));
  document.querySelector('#edit-response')?.addEventListener('click', () => openResponse(replyMode));
  document.querySelector('#toggle-response')?.addEventListener('click', () => { replyVisible = !replyVisible; visible = false; render(); });
  document.querySelector('#close-response')?.addEventListener('click', () => { replyMode = null; replyCode = null; replyVisible = false; render(); });
  document.querySelector('#copy-response')?.addEventListener('click', copyResponse);
  fitQR();
}
function hide() { if (visible || replyVisible) { visible = false; replyVisible = false; render(); } }
function initialize() {
  visible = false;
  replyMode = null; replyCode = null; replyVisible = false; voteDraft = ''; guessDraft = '';
  try { card = decodePayload(location.hash); render(); }
  catch (error) { main.innerHTML = `<section class="empty-state">${icon('lock')}<p class="eyebrow">LINK CHECK</p><h1>카드를 열 수 없어요</h1><p>${e(error.message)}</p><p>메신저에서 링크가 잘렸다면 링크 전체를 다시 받아 주세요.</p><a class="button primary" href="./">생성자 홈으로</a></section>`; }
}
document.addEventListener('input', event => { if (event.target.id === 'response-guess') guessDraft = event.target.value; });
document.addEventListener('change', event => { if (event.target.id === 'response-vote') voteDraft = event.target.value; });
document.addEventListener('submit', event => {
  if (event.target.id !== 'response-form') return;
  event.preventDefault();
  try { replyCode = encodeResponse(createResponse(card, replyMode, replyMode === 'vote' ? Number(voteDraft) : guessDraft)); visible = false; replyVisible = true; render(); document.querySelector('.response-panel').scrollIntoView({ block: 'start' }); }
  catch (error) { const node = document.querySelector('#response-error'); node.textContent = error.message; node.hidden = false; }
});
window.addEventListener('resize', () => fitQR());
document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
window.addEventListener('blur', hide);
window.addEventListener('pagehide', hide);
window.addEventListener('pageshow', hide);
window.addEventListener('hashchange', initialize);
initialize();
