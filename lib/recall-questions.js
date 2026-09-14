/* =====================================================================
 *  기억 회상 지원 — 질문지와 마무리 인사
 *
 *  어르신이 떠오른 기억을 말씀하시면 초롱이가 공감만 하고 대화가 더 이어지지 않았다 (사용 피드백).
 *  그래서 팀이 만든 질문지(초롱이.pdf — 질문 영역 · 질문 후보 · 언제 사용하면 좋은지)에서
 *  지금 이야기와 사진에 맞는 질문을 무작위로 몇 개 골라, 그 가운데 하나로 이야기를 이어 간다.
 *  같은 사진 이야기에서 이미 한 질문은 다시 하지 않는다.
 *
 *  "그만할래", "이제 됐어" 처럼 그만하고 싶다고 하시면 정해진 마무리 인사로 대화를 끝낸다.
 *  바깥에 기대지 않는 함수만 둔다 (lib/recall-questions.test.mjs 에서 시험한다).
 * ===================================================================== */

import { RECALL_OPENING } from './reply-rules.js';

/** 그만하고 싶다고 하셨을 때의 마무리 인사 (피드백으로 받은 말 그대로) */
export const CLOSING_LINE =
  '네, 오늘은 여기까지 할게요. 함께 사진을 보며 이야기해주셔서 고마워요. 다음에 이야기하고 싶을 때 다시 만나요.';

/* ------------------------------------------------------------------ *
 * 질문지 — 초롱이.pdf 의 질문 서른다섯 개
 * fits(ctx) 는 '언제 사용하면 좋은지' 를 코드로 옮긴 것이다. 없으면 언제든 쓴다.
 *
 * "이날", "사진을 찍기 전 · 후", "이때 누구와" 처럼 어느 하루의 일을 묻는 질문은
 * 사람 · 활동 · 장소가 보이는 사진(eventy)에만 쓴다. 꽃병처럼 사물만 찍힌 사진에서
 * "사진을 찍고 나서는 무엇을 하셨어요?" 를 여쭈니 엉뚱하게 들렸다 (실제 대화).
 * ------------------------------------------------------------------ */
export const QUESTIONS = [
  // 사건 확장
  { area: '사건 확장', text: '이날 또 기억나는 일이 있으세요?', when: '첫 답변이 짧을 때', fits: (c) => c.eventy && c.lastLen <= 15 },
  { area: '사건 확장', text: '이날 가장 기억에 남는 순간은 무엇이었나요?', when: '전체 경험을 확장할 때', fits: (c) => c.eventy },
  { area: '사건 확장', text: '사진을 찍기 전에는 무엇을 하고 계셨어요?', when: '사진 전후 사건을 떠올릴 때', fits: (c) => c.eventy },
  { area: '사건 확장', text: '사진을 찍고 나서는 무엇을 하셨어요?', when: '사건의 흐름을 확장할 때', fits: (c) => c.eventy && c.userTurns >= 2 },
  { area: '사건 확장', text: '이날 있었던 일 중 이야기하고 싶은 게 있으세요?', when: '자유로운 이야기 유도', fits: (c) => c.eventy },

  // 행동
  { area: '행동', text: '이때 무엇을 하고 계셨나요?', when: '사진 속 행동이 명확하지 않을 때', fits: (c) => c.eventy && !c.activity },
  { area: '행동', text: '이날 무엇을 하셨던 게 가장 기억에 남으세요?', when: '활동 중심 사진', fits: (c) => Boolean(c.activity) },
  { area: '행동', text: '그때 특별히 재미있었던 일이 있으셨어요?', when: '사용자가 긍정적 경험을 언급했을 때', fits: (c) => c.positive },

  // 사람 · 관계
  { area: '사람 · 관계', text: '이때 누구와 함께 계셨어요?', when: '동행자가 아직 나오지 않았을 때', fits: (c) => c.eventy && !c.companion },
  { area: '사람 · 관계', text: '함께 계셨던 분과 어떤 시간을 보내셨어요?', when: '동행자를 말한 뒤', fits: (c) => c.companion },
  { area: '사람 · 관계', text: '그분과 함께했던 다른 기억도 떠오르세요?', when: '관계 중심으로 확장할 때', fits: (c) => c.companion && c.userTurns >= 2 },
  { area: '사람 · 관계', text: '그분과 이런 곳에 자주 가셨나요?', when: '반복 경험 탐색', fits: (c) => c.companion && c.place },

  // 장소
  { area: '장소', text: '이 장소에서 특별히 기억나는 것이 있으세요?', when: '장소 중심 사진', fits: (c) => c.place },
  { area: '장소', text: '이곳에 자주 가셨나요?', when: '익숙한 장소일 가능성이 있을 때', fits: (c) => c.place },
  { area: '장소', text: '이곳에서 좋아하셨던 것이 있으세요?', when: '장소에 대한 의미 탐색', fits: (c) => c.place },
  { area: '장소', text: '비슷한 장소에 갔던 다른 기억도 있으세요?', when: '연결 회상', fits: (c) => c.place && c.userTurns >= 2 },

  // 감각
  { area: '감각', text: '그때 주변 모습 중 기억나는 게 있으세요?', when: '시각적 기억 확장' },
  { area: '감각', text: '그때 들렸던 소리도 기억나세요?', when: '자연 · 축제 · 여행 등', fits: (c) => c.soundy },
  { area: '감각', text: '그날 먹었던 음식 중 기억나는 게 있으세요?', when: '식사 · 여행 · 행사', fits: (c) => c.foody },
  { area: '감각', text: '그때 날씨는 어땠는지 기억나세요?', when: '야외 사진', fits: (c) => c.outdoor },
  { area: '감각', text: '그때 공기나 바람은 어땠는지 기억나세요?', when: '사용자가 공기 · 날씨를 언급했을 때', fits: (c) => c.weather },
  { area: '감각', text: '그곳에서 기억나는 냄새나 향이 있으세요?', when: '음식 · 꽃 · 바다 등', fits: (c) => c.scenty },

  // 감정
  { area: '감정', text: '이때 기분은 어떠셨어요?', when: '사건 이야기가 어느 정도 나온 뒤', fits: (c) => c.userTurns >= 2 },
  { area: '감정', text: '이 순간에는 어떤 마음이 드셨나요?', when: '특정 장면을 이야기했을 때', fits: (c) => c.lastLen >= 8 },
  { area: '감정', text: '지금 이 사진을 다시 보니까 어떤 기분이 드세요?', when: '현재 감정으로 연결' },
  { area: '감정', text: '이 기억에서 가장 좋았던 점은 무엇이었나요?', when: '사용자가 긍정적 감정을 이미 표현했을 때', fits: (c) => c.positive },

  // 개인적 의미
  { area: '개인적 의미', text: '이 사진이 특별하게 느껴지는 이유가 있으세요?', when: '중요도가 높은 사진', fits: (c) => c.importance >= 3 },
  { area: '개인적 의미', text: '이 기억에서 가장 기억에 남는 것은 무엇인가요?', when: '대화 후반', fits: (c) => c.userTurns >= 4 },
  { area: '개인적 의미', text: '이때의 기억이 지금도 자주 떠오르세요?', when: '현재와 연결', fits: (c) => c.userTurns >= 2 },
  { area: '개인적 의미', text: '이 사진을 보면 가장 먼저 생각나는 사람이 있으세요?', when: '관계 회상 가능성이 있을 때', fits: (c) => !c.companion },

  // 연결 회상
  { area: '연결 회상', text: '이때와 비슷한 다른 기억도 떠오르세요?', when: '하나의 사건을 충분히 이야기한 뒤', fits: (c) => c.userTurns >= 3 },
  { area: '연결 회상', text: '그 이후에도 이런 활동을 자주 하셨어요?', when: '취미 · 여행 · 등산 등', fits: (c) => c.hobby },
  { area: '연결 회상', text: '예전에도 이곳에 와보신 적이 있으세요?', when: '장소 반복 경험', fits: (c) => c.place && c.userTurns >= 2 },
  { area: '연결 회상', text: '함께했던 분과 다른 곳에도 자주 가셨어요?', when: '사람과 활동 연결', fits: (c) => c.companion && Boolean(c.activity) },
  { area: '연결 회상', text: '이때처럼 즐거웠던 다른 날도 생각나세요?', when: '사용자가 즐거웠다고 직접 말했을 때', fits: (c) => c.saidJoy },
];

/* ------------------------------------------------------------------ *
 * 지금 이야기와 사진 — 조건을 따지는 데 쓰는 값
 * ------------------------------------------------------------------ */
const PEOPLE_WORDS = /(딸|아들|따님|아드님|며느리|사위|손주|손자|손녀|남편|아내|부인|영감|엄마|아빠|어머니|아버지|어머님|아버님|오빠|언니|누나|동생|친구|이웃|가족|식구|선생|동료|같이|함께)/;
const POSITIVE = /(좋았|좋더|즐거|즐겁|재밌|재미있|신났|신나|행복|기뻤|기쁘|웃었|뿌듯|최고)/;
const JOY = /(즐거|즐겁|재밌|재미있|신났|신나)/;
const WEATHER = /(날씨|바람|공기|더웠|덥더|추웠|춥더|햇볕|햇살|비가|눈이|시원)/;
const OUTDOOR_PLACES = new Set(['village', 'farm', 'market', 'travel', 'nature', 'park', 'street']);
const OUTDOOR_WORDS = /(바닷가|바다|산|강가|공원|들판|마당|시장|거리|계곡|숲|논|밭)/;
const SOUND_PLACES = new Set(['nature', 'park', 'travel', 'market']);
const SOUND_ACTS = new Set(['celebration', 'wedding', 'holiday', 'travel', 'religious_event', 'leisure', 'sports']);
const SOUND_WORDS = /(바다|바닷가|축제|잔치|여행|공원|계곡|숲)/;
const FOOD_ACTS = new Set(['meal', 'celebration', 'wedding', 'holiday', 'travel', 'family_daily']);
const FOOD_WORDS = /(밥|음식|상차림|떡|과일|수박|고기|국수|김밥|케이크|술|커피|반찬|잔치|도시락|과자|빵)/;
const SCENT_WORDS = /(음식|꽃|바다|바닷가|고기|과일|수박|커피|빵|숲|떡)/;
const HOBBY_ACTS = new Set(['travel', 'sports', 'leisure', 'holiday']);
const HOBBY_WORDS = /(여행|등산|낚시|산책|운동|놀러|키우|키웠|가꾸|가꿨|기르|길렀)/;

const textsOf = (history) => (Array.isArray(history) ? history : []).filter((m) => m && typeof m.content === 'string');

/** 지금 사진 이야기 — 첫 물음 뒤부터의 대화. 앞 사진에서 한 이야기는 넣지 않는다 */
export function sinceOpening(history = []) {
  const list = textsOf(history);
  const start = list.map((m) => m.role === 'assistant' && m.content.includes(RECALL_OPENING)).lastIndexOf(true);
  return list.slice(start + 1);
}

/** 질문을 고를 때 따지는 값 */
export function questionContext({ history = [], lastUserText = '', analysis = null, importance = 0 } = {}) {
  const users = sinceOpening(history).filter((m) => m.role === 'user').map((m) => m.content);
  const said = users.join('\n');
  const a = analysis && analysis.status === 'DONE' ? analysis : null;
  const photoText = a ? [a.place_label, a.activity_label, ...(a.objects || [])].filter(Boolean).join(' ') : '';
  const activity = a && a.activity && a.activity !== 'none' ? a.activity : '';
  const place = Boolean(a && (a.place_label || !['unknown', 'studio', undefined].includes(a.place_type)));

  return {
    userTurns: users.length,
    lastLen: String(lastUserText).replace(/\s+/g, '').length,
    companion: PEOPLE_WORDS.test(said),
    positive: POSITIVE.test(said),
    saidJoy: JOY.test(said),
    weather: WEATHER.test(said),
    place,
    activity,
    /* 어느 하루의 장면인가 — 사람 · 활동 · 장소 가운데 하나라도 보이면. 살펴본 결과가 없으면 여느 사진처럼 본다 */
    eventy: a ? Boolean(a.people_count > 0 || activity || place) : true,
    outdoor: Boolean(a && OUTDOOR_PLACES.has(a.place_type)) || OUTDOOR_WORDS.test(photoText),
    soundy: Boolean(a && (SOUND_PLACES.has(a.place_type) || SOUND_ACTS.has(activity))) || SOUND_WORDS.test(photoText),
    foody: FOOD_ACTS.has(activity) || FOOD_WORDS.test(photoText) || FOOD_WORDS.test(said),
    scenty: SCENT_WORDS.test(photoText) || SCENT_WORDS.test(said),
    hobby: HOBBY_ACTS.has(activity) || HOBBY_WORDS.test(`${said} ${photoText}`),
    importance: Number(importance) || 0,
  };
}

/* ------------------------------------------------------------------ *
 * 고르기 · 이어 가기
 * ------------------------------------------------------------------ */

/** 띄어쓰기 · 문장부호를 뺀 모양 — 말투를 조금 달리 해도 같은 질문으로 알아본다 */
const bare = (t) => String(t).replace(/[\s.?!,~…'"“”？]/g, '');

function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 지금 여쭐 만한 질문을 무작위로 count 개 고른다.
 * 조건에 맞고, 이 사진 이야기에서 아직 여쭙지 않은 것 가운데서 고르며, 영역이 겹치지 않게 먼저 고른다.
 */
export function pickQuestions(ctx, history = [], { count = 3, random = Math.random } = {}) {
  const asked = sinceOpening(history).filter((m) => m.role === 'assistant').map((m) => bare(m.content)).join('|');
  const pool = shuffle(QUESTIONS.filter((q) => !asked.includes(bare(q.text)) && (!q.fits || q.fits(ctx))), random);
  const picked = [];
  const areas = new Set();
  for (const q of pool) {
    if (picked.length >= count) break;
    if (!areas.has(q.area)) { picked.push(q); areas.add(q.area); }
  }
  for (const q of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(q)) picked.push(q);
  }
  return picked;
}

const SENT = /[^.!?。！？\n]+[.!?。！？]*\n?/g;
const SOFT_QUESTION = /궁금(해요|하네요|합니다|하군요|해지네요|하던데요|하기도 해요)/;

/**
 * 답에 질문지 질문이 하나 들어가게 한다.
 * 모델이 후보 가운데 하나를 여쭸으면 그대로 두고, 아니면 모델이 지어낸 질문(과 "~궁금해요")은 빼고
 * 후보 하나를 붙인다. 공감만 하고 멈추는 답이 나오지 않게 한다.
 */
export function withQuestionnaire(reply, candidates = [], { random = Math.random, fallback = '' } = {}) {
  if (!candidates.length) return reply;
  if (candidates.some((q) => bare(reply).includes(bare(q.text)))) return reply;
  const statements = (String(reply).match(SENT) || [])
    .filter((s) => !/[?？]/.test(s) && !SOFT_QUESTION.test(s))
    .join('').trim();
  const q = candidates[Math.floor(random() * candidates.length)];
  return `${statements || fallback} ${q.text}`.trim();
}

/* ------------------------------------------------------------------ *
 * 그만하고 싶다는 말
 * ------------------------------------------------------------------ */
const STOP = /(그만\s?(할래|하자|해요|할게|하고\s?싶|볼래|보자|볼게|이야기)|그만해|이제\s?됐|이만\s?(할래|하자|해|할게)|오늘은\s?여기까지|여기까지\s?(할래|하자|해|할게)|쉬고\s?싶|끝낼래|끝내자|^그만$)/;
/* 사진이 싫다는 말은 그만하자는 뜻과 다르다 — 모델에게 넘겨 힘들어하심으로 표시되게 한다 */
const REJECT = /(싫|치워|치우)/;

export function isStopIntent(text) {
  const t = String(text ?? '').replace(/[.!~…,]+$/g, '').trim();
  return STOP.test(t) && !REJECT.test(t);
}
