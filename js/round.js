import { validateNames, validatePlayerCount, randomInt, randomId, shuffle, RULES_VERSION } from './core.js';
import { GAMES, WORDS, LOCATIONS, TABOO_WORDS } from './data.js?v=words-2';

export function createSession(names, game, category, seconds) {
  const players = validateNames(names);
  return { version: 2, rules: RULES_VERSION, id: randomId(), players, totals: players.map(() => 0), history: [], round: createRound(game, category, seconds, 1, players.length) };
}
export function createRound(game, category, seconds, number, playerCount = 3) {
  validatePlayerCount(playerCount);
  if (!Object.hasOwn(GAMES, game) || !Object.hasOwn(WORDS, category) || ![120, 180, 240, 300, 420, 600].includes(seconds) || !Number.isInteger(number) || number < 1 || number > 9999) throw new Error('게임 설정을 확인해 주세요.');
  const base = { id: randomId(), number, playerCount, game, category, seconds, phase: 'invite', shared: Array(playerCount).fill(false), special: null, secret: null, words: null, jobs: null, draft: { votes: Array(playerCount).fill(''), guess: '', earlyGuess: false, violations: Array(playerCount).fill(0) }, result: null, timer: { running: false, remaining: seconds * 1000, deadline: null } };
  if (game === 'liar') { base.special = randomInt(playerCount); const list = WORDS[category].items; base.secret = list[randomInt(list.length)]; }
  if (game === 'spy') { base.special = randomInt(playerCount); const place = LOCATIONS[randomInt(LOCATIONS.length)]; base.secret = place.name; base.jobs = shuffle(Array.from({ length: playerCount }, (_, i) => place.jobs[i % place.jobs.length])); }
  if (game === 'taboo') base.words = shuffle(WORDS[category].kind === 'era' ? WORDS[category].items : TABOO_WORDS).slice(0, playerCount);
  return base;
}

// Explicit allowlists: never encode the host session, random seed, or all roles.
export function personalPayload(session, index) {
  if (!Number.isInteger(index) || index < 0 || index >= session.players.length) throw new Error('잘못된 참가자입니다.');
  const r = session.round;
  const payload = { v: 2, count: session.players.length, roundId: r.id, round: r.number, game: r.game, recipient: session.players[index], seat: index + 1, info: {} };
  if (r.game === 'liar') payload.info = r.special === index ? { role: 'liar', category: WORDS[r.category].label } : { role: 'citizen', category: WORDS[r.category].label, word: r.secret };
  if (r.game === 'spy') payload.info = r.special === index ? { role: 'spy' } : { role: 'citizen', location: r.secret, job: r.jobs[index] };
  if (r.game === 'taboo') payload.info = { others: session.players.flatMap((name, i) => i === index ? [] : [{ name, word: r.words[i] }]) };
  return payload;
}
