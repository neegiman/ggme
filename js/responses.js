import { randomId, majorityTarget } from './core.js';
import { validatePayload } from './links.js?v=replies-1';

export const RESPONSE_PREFIX = 'GGME-REPLY:1:';
const isId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const keys = ['v', 'kind', 'roundId', 'game', 'seat', 'key', 'id', 'type', 'value'];
export function validateResponse(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length !== keys.length || !keys.every(k => Object.hasOwn(p, k)) || p.v !== 1 || p.kind !== 'ggme-reply' || !isId(p.roundId) || !isId(p.key) || !isId(p.id) || !['liar', 'spy'].includes(p.game) || !Number.isInteger(p.seat) || p.seat < 1 || p.seat > 8) throw new Error('올바른 참가자 응답 QR이 아닙니다.');
  const vote = p.type === 'vote' && Number.isInteger(p.value) && p.value >= 1 && p.value <= 8 && p.value !== p.seat;
  const guess = p.type === 'guess' && typeof p.value === 'string' && p.value.trim().length > 0 && p.value.length <= 80 && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(p.value);
  if (!vote && !guess) throw new Error('투표 또는 추측 입력을 확인해 주세요.');
  return p;
}
export function createResponse(card, type, value) {
  validatePayload(card);
  if (card.v !== 3) throw new Error('이전 카드는 응답 QR을 지원하지 않아요. 생성자에게 새 라운드 링크를 받아 주세요.');
  if (type === 'guess' && !['liar', 'spy'].includes(card.info.role)) throw new Error('이 카드에서는 정답 추측을 만들 수 없어요.');
  if (type === 'vote' && (!Number.isInteger(value) || value > card.count)) throw new Error('투표할 참가자를 선택해 주세요.');
  return validateResponse({ v: 1, kind: 'ggme-reply', roundId: card.roundId, game: card.game, seat: card.seat, key: card.replyKey, id: randomId(), type, value: typeof value === 'string' ? value.trim() : value });
}
export function encodeResponse(p) {
  validateResponse(p);
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  return RESPONSE_PREFIX + btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export function decodeResponse(code) {
  if (typeof code !== 'string') throw new Error('참가자의 응답 QR이나 응답 코드를 사용해 주세요.');
  code = code.trim();
  if (!code.startsWith(RESPONSE_PREFIX) || code.length > 2000) throw new Error('초대 QR이 아닌 참가자의 응답 QR을 읽어 주세요.');
  try {
    const encoded = code.slice(RESPONSE_PREFIX.length);
    if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('encoding');
    const base = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base.padEnd(Math.ceil(base.length / 4) * 4, '=')), c => c.charCodeAt(0));
    return validateResponse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch { throw new Error('응답 코드를 읽을 수 없어요. 참가자에게 QR을 다시 만들어 달라고 해 주세요.'); }
}
// Import edits only the draft. Scanning never settles a round or awards points.
export function importResponse(session, response) {
  const p = validateResponse(response), r = session?.round;
  if (!r || r.phase !== 'judge' || r.result) throw new Error('생성자의 투표·판정 화면에서 응답을 읽어 주세요.');
  if (!r.replyKeys || !r.received) throw new Error('기존 라운드는 직접 입력해 주세요. 다음 라운드부터 응답 QR을 사용할 수 있어요.');
  if (p.roundId !== r.id || p.game !== r.game) throw new Error('다른 라운드의 응답입니다. 이번 라운드 카드에서 다시 만들어 주세요.');
  const seat = p.seat - 1;
  if (seat >= session.players.length || p.key !== r.replyKeys[seat]) throw new Error('이 참가자의 응답 확인 코드가 일치하지 않습니다.');
  if (r.received.seen.includes(p.id)) return { status: 'duplicate', seat, type: p.type };
  if (p.type === 'vote') {
    if (r.votesLocked || r.draft.earlyGuess) throw new Error('투표 수정 화면으로 돌아간 뒤 투표 QR을 읽어 주세요.');
    if (p.value > session.players.length) throw new Error('이 라운드에 없는 참가자에게 투표한 응답입니다.');
  } else {
    if (seat !== r.special) throw new Error('추측 권한이 없는 참가자의 응답입니다.');
    if (r.game === 'liar' && (!r.votesLocked || majorityTarget(r.draft.votes) !== r.special)) throw new Error('라이어가 지목된 뒤 마지막 추측 QR을 읽어 주세요.');
  }
  if (r.received.seen.length >= 500) throw new Error('이 라운드에서 응답을 너무 많이 읽었어요. 나머지는 직접 입력해 주세요.');
  const previous = p.type === 'vote' ? r.draft.votes[seat] : r.draft.guess;
  if (p.type === 'vote') { r.draft.votes[seat] = p.value - 1; r.received.votes[seat] = p.id; }
  else { r.draft.guess = p.value; r.received.guess = p.id; if (r.game === 'spy') r.draft.earlyGuess = true; }
  r.received.seen.push(p.id);
  return { status: 'applied', seat, type: p.type, previous, value: p.value };
}
