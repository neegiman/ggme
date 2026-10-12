// All game decisions are pure functions. Reconcile provisional rules with the design when available.
export const RULES_VERSION = 'provisional-v1';
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const GAME_IDS = ['liar', 'spy', 'taboo'];
export function validatePlayerCount(count) {
  if (!Number.isInteger(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) throw new Error(`참가자는 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 해요.`);
  return count;
}
const forbiddenControls = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u;
export function cleanName(value) {
  if (typeof value !== 'string') throw new Error('이름을 입력해 주세요.');
  const name = value.normalize('NFC').trim();
  if (!name || [...name].length > 12 || forbiddenControls.test(name)) throw new Error('이름은 공백만 제외한 1~12자로 입력해 주세요.');
  return name;
}
export function validateNames(values) {
  if (!Array.isArray(values)) throw new Error('참가자 이름을 입력해 주세요.');
  validatePlayerCount(values.length);
  const names = values.map(cleanName);
  if (new Set(names.map(v => v.toLocaleLowerCase('ko'))).size !== names.length) throw new Error('서로 다른 이름을 입력해 주세요.');
  return names;
}
export function randomInt(max) {
  if (!Number.isInteger(max) || max < 1 || max > 0x100000000) throw new Error('잘못된 무작위 범위입니다.');
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % max;
}
export function randomId() {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2, '0')).join('');
}
export function shuffle(items, rand = randomInt) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = rand(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
// The existing export name is retained; selection uses a unique plurality.
export function majorityTarget(votes, playerCount = votes?.length) {
  validatePlayerCount(playerCount);
  if (!Array.isArray(votes) || votes.length !== playerCount || votes.some((v, i) => !Number.isInteger(v) || v < 0 || v >= playerCount || v === i)) throw new Error('모든 참가자의 투표를 입력해 주세요. 자신에게 투표할 수 없어요.');
  const counts = Array(playerCount).fill(0);
  votes.forEach(v => counts[v]++);
  const highest = Math.max(...counts);
  const leaders = counts.flatMap((count, i) => count === highest ? [i] : []);
  return leaders.length === 1 ? leaders[0] : null;
}
export function normalizeAnswer(text) {
  return typeof text === 'string' ? text.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('ko') : '';
}
export function isCorrectAnswer(answer, secret) {
  return !!normalizeAnswer(answer) && normalizeAnswer(answer) === normalizeAnswer(secret);
}
export function scoreRound(round, decision) {
  if (!round || !GAME_IDS.includes(round.game)) throw new Error('올바르지 않은 게임입니다.');
  if (!decision || typeof decision !== 'object') throw new Error('판정이 필요합니다.');
  const playerCount = validatePlayerCount(round.playerCount ?? 3);
  const seats = Array.from({ length: playerCount }, (_, i) => i);
  if (round.game === 'taboo') {
    const counts = decision.violations;
    if (!Array.isArray(counts) || counts.length !== playerCount || counts.some(n => !Number.isInteger(n) || n < 0 || n > 99)) throw new Error('모든 참가자의 위반 횟수를 0~99의 정수로 입력해 주세요.');
    const points = counts.map(n => Math.max(0, 3 - n));
    const best = Math.max(...points);
    return { points, winners: points.map((p, i) => p === best ? i : -1).filter(i => i !== -1), reason: '금지어 위반 1회당 1점 차감 · 기본 3점 · 최소 0점', target: null, guessCorrect: null };
  }
  const special = round.special;
  if (!Number.isInteger(special) || special < 0 || special >= playerCount) throw new Error('역할 배정이 올바르지 않습니다.');
  let target = null;
  let specialWins = false;
  let reason = '';
  let guessCorrect = null;
  if (round.game === 'spy' && decision.earlyGuess === true) {
    if (typeof decision.guess !== 'string' || !decision.guess.trim() || decision.guess.length > 80) throw new Error('스파이의 장소 추측을 입력해 주세요.');
    guessCorrect = isCorrectAnswer(decision.guess, round.secret);
    specialWins = guessCorrect;
    reason = guessCorrect ? '스파이가 투표 전 장소를 맞혔어요.' : '스파이의 장소 추측이 틀렸어요.';
  } else {
    target = majorityTarget(decision.votes, playerCount);
    specialWins = target !== special;
    if (specialWins) reason = target === null ? playerCount === 3 ? '투표가 1:1:1로 나뉘어 정체를 찾지 못했어요.' : '최다 득표가 동률이라 정체를 찾지 못했어요.' : '다른 참가자가 지목되어 정체를 숨겼어요.';
    else if (round.game === 'liar') {
      if (typeof decision.guess !== 'string' || !decision.guess.trim() || decision.guess.length > 80) throw new Error('지목된 참가자의 마지막 단어 추측을 입력해 주세요.');
      guessCorrect = isCorrectAnswer(decision.guess, round.secret);
      specialWins = guessCorrect;
      reason = guessCorrect ? '라이어가 마지막 기회에 비밀 단어를 맞혔어요.' : '라이어를 찾았고, 마지막 단어 추측도 틀렸어요.';
    } else reason = '투표로 스파이를 찾았어요.';
  }
  const winners = specialWins ? [special] : seats.filter(i => i !== special);
  return { points: seats.map(i => winners.includes(i) ? specialWins ? 3 : 2 : 0), winners, reason, target, guessCorrect };
}
export function remainingMs(timer, now = Date.now()) {
  return Math.max(0, timer.running ? timer.deadline - now : timer.remaining);
}
export function formatTime(ms) {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
}
export function commitResult(session, result, decision, now = Date.now()) {
  if (!session.round || session.round.result) return session;
  return { ...session, totals: session.totals.map((n, i) => n + result.points[i]), round: { ...session.round, phase: 'result', result, decision, timer: { ...session.round.timer, running: false, remaining: remainingMs(session.round.timer, now) } }, history: [{ roundId: session.round.id, number: session.round.number, game: session.round.game, playerCount: session.players.length, players: [...session.players], result, decision, secret: session.round.secret, special: session.round.special, words: session.round.words, endedAt: now, rules: RULES_VERSION }, ...session.history].slice(0, 50) };
}
