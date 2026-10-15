import { cleanName, GAME_IDS, validatePlayerCount, validateNames } from './core.js';

function exactKeys(object, keys) {
  return object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(k => Object.hasOwn(object, k));
}
function shortText(value, max = 40) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
}
export function validatePayload(p) {
  const count = p?.v === 1 ? 3 : p?.count;
  validatePlayerCount(count);
  const keys = ['v', 'roundId', 'round', 'game', 'recipient', 'seat', 'info'];
  if ([2, 3].includes(p?.v)) keys.push('count');
  if (p?.v === 3) keys.push('roster', 'replyKey');
  if (!exactKeys(p, keys) || ![1, 2, 3].includes(p.v) || !/^[a-f0-9]{24}$/.test(p.roundId) || !Number.isInteger(p.round) || p.round < 1 || p.round > 9999 || !GAME_IDS.includes(p.game) || !Number.isInteger(p.seat) || p.seat < 1 || p.seat > count || cleanName(p.recipient) !== p.recipient) throw new Error('올바르지 않은 개인 카드 링크입니다.');
  if (p.v === 3 && (p.game === 'taboo' || !Array.isArray(p.roster) || p.roster.length !== count || validateNames(p.roster).some((name, i) => name !== p.roster[i]) || p.roster[p.seat - 1] !== p.recipient || typeof p.replyKey !== 'string' || !/^[a-f0-9]{24}$/.test(p.replyKey))) throw new Error('참가자 목록이나 응답 확인 코드가 올바르지 않습니다.');
  const i = p.info;
  let valid = false;
  if (p.game === 'liar') valid = i?.role === 'liar' ? exactKeys(i, ['role', 'category']) && shortText(i.category) : i?.role === 'citizen' && exactKeys(i, ['role', 'category', 'word']) && shortText(i.category) && shortText(i.word);
  if (p.game === 'spy') valid = i?.role === 'spy' ? exactKeys(i, ['role']) : i?.role === 'citizen' && exactKeys(i, ['role', 'location', 'job']) && shortText(i.location) && shortText(i.job);
  if (p.game === 'taboo') valid = exactKeys(i, ['others']) && Array.isArray(i.others) && i.others.length === count - 1 && i.others.every(o => exactKeys(o, ['name', 'word']) && cleanName(o.name) === o.name && o.name !== p.recipient && shortText(o.word)) && new Set(i.others.map(o => o.name.toLocaleLowerCase('ko'))).size === count - 1 && new Set(i.others.map(o => o.word)).size === count - 1;
  if (!valid) throw new Error('카드 정보가 손상되었거나 허용되지 않은 정보가 포함되어 있습니다.');
  return p;
}
export function encodePayload(payload) {
  validatePayload(payload);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export function decodePayload(hash) {
  const encoded = hash.replace(/^#/, '');
  if (!encoded || encoded.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('링크가 없거나 손상되었습니다. 생성자에게 개인 링크를 다시 받아 주세요.');
  try {
    const base = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base.padEnd(Math.ceil(base.length / 4) * 4, '=')), c => c.charCodeAt(0));
    return validatePayload(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch { throw new Error('카드를 읽을 수 없습니다. 개인 링크 전체를 다시 열어 주세요.'); }
}
export function makeInvite(payload, base) {
  const url = new URL('card.html', base);
  url.hash = encodePayload(payload);
  return url.href;
}
