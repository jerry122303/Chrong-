/* 건강 돌봄 — 위기 · 목표 · 기분 · 통증 · 복약 · 인지 활동 · 지수 · 저장을 시험한다.
   날짜는 고정해서 넣는다. 오늘이 바뀌어도 결과가 달라지지 않아야 한다. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  localDate, localTime, daysAgo, cleanTime, makeCare, makeGoal, MOODS, PAIN_LEVELS,
} from './care-records.js';
import {
  isCrisisTalk, isCognitiveWorry, CRISIS_LINE, looksLikeGoal, missingPart, withGoalQuestion,
  decidesForElder, dropDecidedGoals, repeatsEarlier, painMention, medicationTaken, medicationMissed,
  moodFromTalk, pickActivity, dateWords, GOAL_QUESTIONS,
} from './care-rules.js';
import {
  weekStart, fuseMood, moodGapRule, motivation, motivationRule, moodTrend, repeatedSymptom,
  medicationGap, dueMedications, burnout, burnoutRule, todayReport, factSummary, lastSummary,
  summaryRule, goalRule,
} from './care-score.js';
import { CareStore } from './care-store.js';

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}`);
};

const TODAY = '2026-09-16';          // 수요일
const user = (content) => ({ role: 'user', content });
const bot = (content) => ({ role: 'assistant', content });

/* ================================================================== */
console.log('[날짜 — 어르신이 계신 곳 기준]');
/* 서울 시각으로 아침이면, 세계 표준시로는 아직 어제다. '오늘 약을 드셨는지'가
   하루씩 밀리면 안 되므로 서울 기준으로 센다. */
t('표준시 밤이어도 서울은 다음 날', localDate(new Date('2026-09-15T23:30:00Z')), '2026-09-16');
t('시각도 서울 기준', localTime(new Date('2026-09-15T23:30:00Z')), '08:30');
t('며칠 전', daysAgo(3, TODAY), '2026-09-13');
t('달을 넘어가도', daysAgo(20, TODAY), '2026-08-27');
t('시각만 받는다', [cleanTime('8:00'), cleanTime('08:05'), cleanTime('25:00'), cleanTime('아침')],
  ['08:00', '08:05', null, null]);
t('그 주 월요일', weekStart(TODAY), '2026-09-14');
t('오늘 날짜를 우리말로', dateWords(TODAY), '9월 16일 수요일');

/* ================================================================== */
console.log('\n[위기 — 인지 저하 증상을 위기로 보지 않는다 (인수인계 문서의 실제 버그)]');
t('죽고 싶다고 하시면 위기', isCrisisTalk('요즘은 그냥 죽고 싶어'), true);
t('살기 싫다고 하셔도 위기', isCrisisTalk('이제 살기 싫어요'), true);
t('"머리가 멍해요" 는 위기가 아니다', isCrisisTalk('오늘이 며칠인지 가물가물하고 머리가 멍해요'), false);
t('"자꾸 깜빡해요" 도 위기가 아니다', isCrisisTalk('요즘 자꾸 깜빡깜빡해'), false);
t('지난 이야기는 위기로 보지 않는다', isCrisisTalk('옛날에는 죽고 싶었지 뭐'), false);
t('그냥 힘들다는 말씀은 위기가 아니다', isCrisisTalk('요즘 좀 힘들고 외로워요'), false);
t('인지 저하 걱정은 따로 알아본다', isCognitiveWorry('오늘이 며칠인지 가물가물해요'), true);
t('위기 말씀은 인지 저하로 보지 않는다', isCognitiveWorry('죽고 싶어요'), false);
t('위기 안내에는 상담 전화와 백십구가 모두 들어간다',
  [CRISIS_LINE.includes('일오칠칠에 영일구구'), CRISIS_LINE.includes('백십구')], [true, true]);

/* ================================================================== */
console.log('\n[목표 — 어르신이 스스로 정하시게]');
t('"내일부터 걸어볼까 해요" 는 목표', looksLikeGoal('내일부터 아침에 좀 걸어볼까 해요'), true);
t('"약 챙겨 먹어야겠어" 도 목표', looksLikeGoal('이제 약 좀 챙겨 먹어야겠어'), true);
t('날씨 이야기는 목표가 아니다', looksLikeGoal('오늘 날씨가 참 좋네요'), false);
t('옛이야기는 목표가 아니다', looksLikeGoal('그때 바다에 갔었지'), false);
t('언제가 없으면 언제를 여쭌다', missingPart('걷기', '내일부터 좀 걸어볼까 해요'), 'when');
t('언제가 정해지면 얼마나', missingPart('걷기', '아침 먹고 나서요'), 'amount');
t('얼마나까지 정해지면 어디서', missingPart('걷기', '아침 먹고 삼십 분 걸을래'), 'where');
t('다 정해지면 더 묻지 않는다', missingPart('걷기', '매일 아침 먹고 공원에서 삼십 분 걸을래'), 'none');
t('물음이 없으면 코드가 붙인다',
  withGoalQuestion('좋은 생각이세요.', 'when'), `좋은 생각이세요. ${GOAL_QUESTIONS.when}`);
t('이미 그 물음이 있으면 그대로',
  withGoalQuestion('좋아요. 하루 중 언제가 제일 편하실까요?', 'when'), '좋아요. 하루 중 언제가 제일 편하실까요?');
t('다른 물음이 이미 있으면 덧붙이지 않는다 (한 번에 하나)',
  withGoalQuestion('그럼 어떤 길로 다니세요?', 'when'), '그럼 어떤 길로 다니세요?');
t('다 정해졌으면 붙이지 않는다', withGoalQuestion('잘 정하셨어요.', 'none'), '잘 정하셨어요.');
t('대신 정해 주는 말을 알아본다', decidesForElder('그럼 매일 삼십 분씩 걸으세요.'), true);
t('여쭙는 말은 대신 정해 주는 것이 아니다', decidesForElder('하루 중 언제가 편하실까요?'), false);
t('대신 정해 주는 문장만 걷어낸다',
  dropDecidedGoals('좋은 생각이세요. 그럼 매일 삼십 분씩 걸으세요.', '그러셨군요.'), '좋은 생각이세요.');
t('걷어낼 것이 없으면 그대로', dropDecidedGoals('좋은 생각이세요.', '그러셨군요.'), '좋은 생각이세요.');
t('모두 걷어내면 대신할 말로', dropDecidedGoals('매일 삼십 분씩 걸으세요.', '그러셨군요.'), '그러셨군요.');

/* ================================================================== */
console.log('\n[같은 말씀을 되풀이하실 때]');
const confused = [
  user('오늘이 몇 월 며칠인지 자꾸 가물가물하고 머리가 멍해요'),
  bot('오늘은 구월 십육일 수요일이에요.'),
  user('오늘이 몇 월 며칠인지 자꾸 가물가물하고 머리가 멍해요'),
];
t('조금 전과 같은 말씀이면 알아본다',
  repeatsEarlier('오늘이 몇 월 며칠인지 자꾸 가물가물하고 머리가 멍해요', confused), true);
t('다른 이야기면 되풀이가 아니다',
  repeatsEarlier('무릎이 좀 아파요', confused), false);
t('짧은 맞장구는 되풀이로 보지 않는다', repeatsEarlier('응', [user('응'), user('응')]), false);

/* ================================================================== */
console.log('\n[아프다 · 약 · 기분]');
t('어디가 아프신지까지 알아본다', painMention('무릎이 좀 아파요'), { part: '무릎' });
t('부위를 안 말씀하시면 화면이 여쭙는다', painMention('여기저기 쑤셔'), { part: null });
t('뒷목은 어깨 쪽으로 본다', painMention('뒷목이 뻐근해'), { part: '어깨' });
t('아프다는 말씀이 없으면 null', painMention('오늘 기분이 좋아요'), null);
t('약을 드셨다는 말씀', medicationTaken('아 맞다, 방금 약 먹었어요'), true);
t('아직 안 드셨다는 말씀은 드신 것이 아니다', medicationTaken('약을 깜빡했어요'), false);
t('깜빡하셨다는 말씀', medicationMissed('약을 깜빡했어요'), true);
t('"속상해요" 는 안 좋은 기분', moodFromTalk('요즘 자꾸 깜빡해서 좀 속상해요').key, 'bad');
t('"너무 힘들어" 는 아주 안 좋은 기분', moodFromTalk('너무 힘들어요').key, 'awful');
t('"참 좋았어요" 는 좋은 기분', moodFromTalk('오늘 참 좋았어요').key, 'good');
t('기분 낱말이 없으면 null', moodFromTalk('사진을 보고 있었어'), null);
t('다섯 단계가 모두 점수를 가진다', MOODS.map((m) => m.score), [1, 0.5, 0, -0.5, -1]);
t('아픈 정도 세 단계', PAIN_LEVELS.map((p) => p.score), [3, 6, 9]);

/* ================================================================== */
console.log('\n[인지 활동 — 날짜를 맞히게 하지 않고 먼저 알려 드린다]');
const first = pickActivity([], { date: TODAY, random: () => 0 });
t('오늘 안 하신 활동 중에서 고른다', first.kind, 'number');
t('이미 하신 것은 빼고 고른다', pickActivity(['number', 'date'], { date: TODAY, random: () => 0 }).kind, 'recall');
t('날짜 활동은 먼저 알려 드리고 따라 말하게 한다',
  pickActivity(['number'], { date: TODAY, random: () => 0 }).say.includes('오늘은 9월 16일 수요일이에요'), true);
t('날짜 활동은 맞히게 하지 않는다',
  /며칠인지 아세요|무슨 요일인지 아세요/.test(pickActivity(['number'], { date: TODAY, random: () => 0 }).say), false);
t('다 하셨으면 더 시키지 않는다', pickActivity(['number', 'date', 'recall', 'photo'], { date: TODAY }), null);

/* ================================================================== */
console.log('\n[기분 합치기 — 직접 고르신 쪽을 더 믿는다]');
const good = { key: 'good', label: '좋아요', score: 0.5 };
const bad = { key: 'bad', label: '안 좋아요', score: -0.5 };
t('직접 고르신 것만 있으면 그대로', fuseMood(good, null),
  { score: 0.5, user_score: 0.5, talk_score: null, disagreement: false, dominant: 'user' });
t('대화에서만 읽었으면 그것으로', fuseMood(null, bad).dominant, 'talk');
t('둘이 비슷하면 합친다', fuseMood(good, good), {
  score: 0.5, user_score: 0.5, talk_score: 0.5, disagreement: false, dominant: 'both',
});
const gap = fuseMood(good, bad);
t('많이 어긋나면 어르신이 고르신 쪽을 따르고 표시해 둔다',
  [gap.score, gap.disagreement, gap.dominant], [0.5, true, 'user']);
t('어긋났을 때만 한 번 더 여쭙는 안내가 붙는다',
  [moodGapRule(gap).includes('부드럽게 여쭙습니다'), moodGapRule(fuseMood(good, good))], [true, '']);

/* ================================================================== */
console.log('\n[동기부여 지수 — 변화 의지 30 · 기분 40 · 실천 30]');
const care = makeCare({
  owner_id: 'u1',
  goals: [makeGoal({
    text: '아침 먹고 공원 한 바퀴 걷기', is_specific: true, date: '2026-09-15',
    achieved_dates: ['2026-09-15', TODAY],
  })],
  medications: [{ name: '혈압약', times: ['08:00'] }],
  days: {
    '2026-09-15': { mood: { score: 0.5 }, pains: [{ part: '무릎', score: 6 }] },
    [TODAY]: {
      mood: { score: 1 }, mood_user: { key: 'great', label: '아주 좋아요', score: 1 },
      pains: [{ part: '무릎', score: 6 }], medications: [{ name: '혈압약', at: `${TODAY}T08:10:00.000Z` }],
      activities: [{ kind: 'number', answered: true }], turns: 7,
    },
  },
  summaries: { '2026-09-15': { line: '바다 사진 이야기를 나눴어요.', mood: 'positive', topics: ['바다'] } },
});
const mot = motivation(care, { today: TODAY });
t('이번 주 목표 하나 · 좋은 기분 둘 · 실천 이틀',
  [mot.breakdown.will, mot.breakdown.mood, mot.breakdown.action, mot.score, mot.level],
  [15, 40, 20, 75, '높음']);
t('기록이 없으면 0점', motivation(makeCare({ owner_id: 'u2' }), { today: TODAY }).score, 0);
t('지수는 어르신께 말하지 않는다 (참고용이라고 못박는다)',
  motivationRule(mot).includes('점수나 등급을 말하지 마십시오'), true);
t('기운이 없으신 주에는 재촉하지 않게 한다',
  motivationRule({ score: 20, level: '낮음', breakdown: {} }).includes('재촉하지 말고'), true);
t('기록이 없으면 아무 말도 붙이지 않는다', motivationRule({ score: 0 }), '');

console.log('\n[추이와 신호]');
t('기분 추이는 열나흘', moodTrend(care, { days: 14, today: TODAY }).length, 14);
t('마지막 칸이 오늘', moodTrend(care, { days: 3, today: TODAY }).map((d) => d.date),
  ['2026-09-14', '2026-09-15', TODAY]);
t('이틀만 아프시면 아직 알리지 않는다', repeatedSymptom(care, { today: TODAY }), null);

const sore = makeCare({
  owner_id: 'u3',
  days: {
    '2026-09-14': { pains: [{ part: '무릎', score: 6 }] },
    '2026-09-15': { pains: [{ part: '무릎', score: 6 }] },
    [TODAY]: { pains: [{ part: '무릎', score: 9 }] },
  },
});
t('사흘째 같은 데가 아프시면 알린다', repeatedSymptom(sore, { today: TODAY }),
  { part: '무릎', days: 3, worst: 9, severe: true });
t('약 스케줄이 없으면 누락을 따지지 않는다', medicationGap(sore, { today: TODAY }), null);
t('이레 중 엿새는 기록이 없다', medicationGap(care, { today: TODAY }),
  { days: 7, taken: 1, missed: 6, rate: 86 });
t('오늘 이미 드셨으면 알리지 않는다', dueMedications(care, { today: TODAY, now: '09:00' }), []);
t('드실 때가 지났는데 기록이 없으면 알린다',
  dueMedications(makeCare({ owner_id: 'u4', medications: [{ name: '혈압약', times: ['08:00'] }] }),
    { today: TODAY, now: '09:00' }),
  [{ name: '혈압약', times: ['08:00'] }]);
t('아직 드실 때가 아니면 알리지 않는다',
  dueMedications(makeCare({ owner_id: 'u4', medications: [{ name: '혈압약', times: ['08:00'] }] }),
    { today: TODAY, now: '07:00' }), []);

const tired = makeCare({
  owner_id: 'u5',
  days: {
    '2026-09-13': { mood: { score: -0.5 } },
    '2026-09-14': { mood: { score: -0.5 } },
    '2026-09-15': { mood: { score: -1 } },
    [TODAY]: { mood: { score: -0.5 } },
  },
});
const worn = burnout(tired, { today: TODAY });
t('나흘째 기분이 좋지 않으시면 신호', [worn.level, worn.signals.length >= 1], ['medium', true]);
t('지쳐 계실 때는 목표를 먼저 꺼내지 않는다',
  burnoutRule(burnout(makeCare({
    owner_id: 'u6',
    days: Object.fromEntries(['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', TODAY]
      .map((d) => [d, { mood: { score: -1 }, pains: [{ part: '허리', score: 9 }] }])),
  }), { today: TODAY })).includes('목표나 실천을 먼저 꺼내지 마십시오'), true);
t('신호가 없으면 아무 말도 붙이지 않는다', burnoutRule(burnout(makeCare({ owner_id: 'u7' }), { today: TODAY })), '');

console.log('\n[오늘 하루]');
const report = todayReport(care, { today: TODAY, now: '20:00' });
t('오늘 리포트에 담기는 것',
  [report.date, report.mood.score, report.medications.length, report.pains.length,
    report.goal.achieved_today, report.goal.achieved_this_week],
  [TODAY, 1, 1, 1, true, 2]);
t('오늘 리포트의 나눈 차례', report.turns, 7);
t('아주 아픈 날은 병원을 권한다', todayReport(sore, { today: TODAY }).see_doctor, true);
t('하루를 한 줄로 남긴다',
  factSummary(care, { today: TODAY, topics: ['바다 사진'] }).line.includes('기분은'), true);
t('기록이 없으면 요약하지 않는다', factSummary(makeCare({ owner_id: 'u8' }), { today: TODAY }), null);
t('어제 요약을 찾아온다', lastSummary(care, { today: TODAY }).days_ago, 1);
t('어제 이야기는 한 번만 자연스럽게',
  summaryRule(lastSummary(care, { today: TODAY })).includes('취조하듯 확인하지 않습니다'), true);
t('요약이 없으면 아무 말도 붙이지 않음', summaryRule(lastSummary(makeCare({ owner_id: 'u9' }), { today: TODAY })), '');
t('목표를 대신 정하지 않는다고 못박는다',
  goalRule(care.goals[0], { today: TODAY }).includes('대신 정하지 않습니다'), true);
t('아직 구체화 중이면 하나만 여쭙게 한다',
  goalRule(makeGoal({ text: '걷기', is_specific: false }), { today: TODAY }).includes('하나만 여쭙습니다'), true);

/* ================================================================== */
console.log('\n[저장 — 어르신 한 분에 파일 하나]');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chorong-care-'));
const store = new CareStore(dir);

const mood1 = await store.setMood('u1', { key: 'good', date: TODAY });
t('직접 고르신 기분', [mood1.score, mood1.dominant], [0.5, 'user']);
const mood2 = await store.setMood('u1', { key: 'bad', source: 'talk', date: TODAY });
t('대화에서 읽은 기분과 어긋나면 표시', [mood2.score, mood2.disagreement], [0.5, true]);

const pain = await store.addPain('u1', { part: '무릎', level: 'moderate', date: TODAY });
t('아픈 곳을 남긴다', [pain.part, pain.score], ['무릎', 6]);

await store.addMedication('u1', { name: '혈압약', times: ['08:00', '20:00'] });
const took = await store.takeMedication('u1', { name: '혈압약', at: `${TODAY}T08:10:00.000Z`, date: TODAY });
t('약을 드셨다고 남긴다', [took.record.name, took.again], ['혈압약', false]);
const again = await store.takeMedication('u1', { name: '혈압약', at: `${TODAY}T08:40:00.000Z`, date: TODAY });
t('한 시간 안에 또 드시면 여쭙게 표시한다', again.again, true);
const later = await store.takeMedication('u1', { name: '혈압약', at: `${TODAY}T20:05:00.000Z`, date: TODAY });
t('저녁에 드시는 것은 두 번 드신 것이 아니다', later.again, false);

await store.addActivity('u1', { kind: 'number', date: TODAY });
t('오늘 하신 활동', await store.doneActivities('u1', TODAY), ['number']);

const g1 = await store.saveGoal('u1', { text: '걷기', is_specific: false, missing_part: 'when', date: TODAY });
t('처음 말씀하신 목표는 아직 정해지는 중', [g1.status, g1.missing_part], ['drafting', 'when']);
const g2 = await store.saveGoal('u1', { text: '아침 먹고 걷기', is_specific: true, date: TODAY });
t('같은 목표를 더 자세히 말씀하시면 갱신한다', [g2.text, g2.status], ['아침 먹고 걷기', 'active']);
t('목표가 두 개로 늘지 않는다', (await store.get('u1')).goals.length, 1);

await store.achieveGoal('u1', { date: TODAY });
await store.achieveGoal('u1', { date: TODAY });
t('같은 날 두 번 눌러도 하루로 센다',
  (await store.get('u1')).goals[0].achieved_dates, [TODAY]);

await store.noteTurn('u1', { date: TODAY });
await store.noteTurn('u1', { date: TODAY });
const saved = await store.get('u1');
t('나눈 차례를 센다', saved.days[TODAY].turns, 2);
t('오늘 기록이 한 파일에 모인다',
  [saved.days[TODAY].pains.length, saved.days[TODAY].medications.length, saved.medications.length],
  [1, 3, 1]);

await store.saveSummary('u1', { date: TODAY, line: '무릎 이야기를 나눴어요.', mood: 'neutral', topics: ['무릎'] });
t('하루 요약을 남긴다', (await store.get('u1')).summaries[TODAY].line, '무릎 이야기를 나눴어요.');
t('다시 읽어도 같은 값', (await new CareStore(dir).get('u1')).goals[0].text, '아침 먹고 걷기');

await fs.rm(dir, { recursive: true, force: true });

console.log(fail ? `\n${fail}개 실패` : '\n모두 통과');
process.exit(fail ? 1 : 0);
