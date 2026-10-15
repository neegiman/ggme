import { GAME_IDS, RULES_VERSION, validateNames, scoreRound } from './core.js';
import { personalPayload } from './round.js?v=replies-1';
import { WORDS } from './data.js?v=replies-1';
import { validatePayload } from './links.js?v=replies-1';

export const STORAGE_KEY = 'three-of-us:local:v1';
const isScores = (a, count) => Array.isArray(a) && a.length === count && a.every(n => Number.isInteger(n) && n >= 0 && n <= 1000000);
const isId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
function validHistory(h) {
  return h && isId(h.roundId) && Number.isInteger(h.number) && h.number > 0 && GAME_IDS.includes(h.game) && validateNames(h.players) && [RULES_VERSION, 'provisional-v0'].includes(h.rules) && (h.rules !== 'provisional-v0' || h.players.length === 3) && (h.playerCount === undefined || h.playerCount === h.players.length) && Number.isFinite(h.endedAt) && isScores(h.result?.points, h.players.length) && Array.isArray(h.result.winners) && h.result.winners.length > 0 && h.result.winners.every(i => Number.isInteger(i) && i >= 0 && i < h.players.length) && typeof h.result.reason === 'string' && h.result.reason.length < 200;
}
export function validateStore(value) {
  if (value?.version === 1) {
    value = JSON.parse(JSON.stringify(value));
    value.version = 2;
    if (value.session) {
      if (value.session.version !== 1 || value.session.rules !== 'provisional-v0' || value.session.players?.length !== 3 || !value.session.round) throw new Error('이전 게임 기록이 올바르지 않습니다.');
      value.session.version = 2;
      value.session.rules = RULES_VERSION;
      value.session.round.playerCount = 3;
    }
  }
  if (!value || value.version !== 2 || !Array.isArray(value.archive) || value.archive.length > 200 || !value.archive.every(validHistory)) throw new Error('저장된 플레이 기록을 읽을 수 없습니다.');
  const s = value.session;
  if (s !== null) {
    if (!s || s.version !== 2 || s.rules !== RULES_VERSION || !isId(s.id) || !Array.isArray(s.history) || s.history.length > 50 || !s.history.every(validHistory)) throw new Error('저장된 게임을 읽을 수 없습니다.');
    validateNames(s.players);
    const count = s.players.length;
    if (!isScores(s.totals, count)) throw new Error('저장된 점수가 올바르지 않습니다.');
    const r = s.round;
    if (!r || r.playerCount !== count || !isId(r.id) || !Number.isInteger(r.number) || r.number < 1 || r.number > 9999 || !GAME_IDS.includes(r.game) || !Object.hasOwn(WORDS, r.category) || ![120, 180, 240, 300, 420, 600].includes(r.seconds) || !['invite', 'play', 'judge', 'result'].includes(r.phase) || !Array.isArray(r.shared) || r.shared.length !== count || !r.shared.every(b => typeof b === 'boolean')) throw new Error('저장된 라운드를 읽을 수 없습니다.');
    if (r.replyKeys !== undefined || r.received !== undefined) {
      const received = r.received;
      if (r.game === 'taboo' || !Array.isArray(r.replyKeys) || r.replyKeys.length !== count || !r.replyKeys.every(isId) || new Set(r.replyKeys).size !== count || !received || !Array.isArray(received.seen) || received.seen.length > 500 || !received.seen.every(isId) || new Set(received.seen).size !== received.seen.length || !Array.isArray(received.votes) || received.votes.length !== count || ![...received.votes, received.guess].every(id => id === null || (isId(id) && received.seen.includes(id)))) throw new Error('저장된 응답 확인 정보가 올바르지 않습니다.');
    }
    const t = r.timer;
    if (!t || typeof t.running !== 'boolean' || !Number.isFinite(t.remaining) || t.remaining < 0 || t.remaining > r.seconds * 1000 || (t.running && !Number.isFinite(t.deadline))) throw new Error('저장된 타이머를 읽을 수 없습니다.');
    if (r.game !== 'taboo' && (!Number.isInteger(r.special) || r.special < 0 || r.special >= count || typeof r.secret !== 'string' || !r.secret)) throw new Error('저장된 역할이 올바르지 않습니다.');
    if (r.game === 'spy' && (!Array.isArray(r.jobs) || r.jobs.length !== count)) throw new Error('저장된 직업이 올바르지 않습니다.');
    if (r.game === 'taboo' && (!Array.isArray(r.words) || r.words.length !== count || new Set(r.words).size !== count)) throw new Error('저장된 금지어가 올바르지 않습니다.');
    s.players.forEach((_, i) => validatePayload(personalPayload(s, i)));
    const d = r.draft;
    if (!d || !Array.isArray(d.votes) || d.votes.length !== count || d.votes.some((v, i) => v !== '' && (!Number.isInteger(v) || v < 0 || v >= count || v === i)) || typeof d.guess !== 'string' || d.guess.length > 80 || typeof d.earlyGuess !== 'boolean' || !Array.isArray(d.violations) || d.violations.length !== count || d.violations.some(n => !Number.isInteger(n) || n < 0 || n > 99)) throw new Error('저장된 판정을 읽을 수 없습니다.');
    if (r.result) {
      const expected = scoreRound(r, r.decision);
      if (r.phase !== 'result' || JSON.stringify(expected) !== JSON.stringify(r.result)) throw new Error('저장된 결과가 올바르지 않습니다.');
    } else if (r.phase === 'result') throw new Error('저장된 결과가 없습니다.');
  }
  return value;
}
export function loadStore(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return { value: raw ? validateStore(JSON.parse(raw)) : { version: 2, session: null, archive: [] }, error: null };
  } catch (error) { return { value: { version: 2, session: null, archive: [] }, error: error.message }; }
}
export function saveStore(storage, value) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(value)); return true; } catch { return false; }
}
