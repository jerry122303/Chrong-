/* =====================================================================
 *  돌봄 대화에서 코드가 먼저 알아보는 것들
 *
 *  회상 대화와 같은 생각이다 — 프롬프트로만 부탁하면 모델이 버릇처럼 어긴다.
 *  특히 아래 둘은 모델에게 맡기면 안 된다.
 *
 *  1) 위기 신호. 인수인계 문서에 실제로 있던 버그다 — "머리가 멍해요",
 *     "오늘이 며칠인지 가물가물해요" 같은 인지 저하 증상을 모델이 위기로
 *     잘못 보아 상담 전화를 안내했다. 어르신은 놀라시고 신뢰를 잃는다.
 *     그래서 위기는 '죽고 싶다' 처럼 직접 말씀하셨을 때만으로 좁히고,
 *     인지 저하 증상은 위기가 아니라고 코드로 못박는다.
 *
 *  2) 목표. 모델은 어르신이 말씀하지도 않은 목표를 지어내 "그럼 매일 삼십 분씩
 *     걸으시죠" 하고 대신 정해 버린다. 동기면담에서 가장 하면 안 되는 일이다.
 *     그래서 어르신 말씀에 목표가 실제로 있었는지 코드가 한 번 더 본다.
 *
 *  바깥에 기대지 않는 함수만 둔다 (lib/care.test.mjs 에서 시험한다).
 * ===================================================================== */

import { PAIN_PARTS, MOODS } from './care-records.js';

const text = (v) => String(v ?? '');
const bare = (v) => text(v).replace(/\s+/g, '');

/* ------------------------------------------------------------------ *
 * 위기 — 스스로를 해치겠다는 말씀
 * ------------------------------------------------------------------ */

/** 스스로 목숨을 끊거나 다치게 하겠다는 직접적인 표현만 */
const CRISIS = /(죽고\s?싶|죽어\s?버리|죽어야겠|따라\s?죽|목숨을\s?끊|자살|사라지고\s?싶|없어지고\s?싶|그만\s?살고\s?싶|살기\s?싫|살고\s?싶지\s?않|해치고\s?싶|목\s?매)/;
/** 남의 이야기이거나 지난 이야기면 위기가 아니다 ("옛날에 죽고 싶었지") */
const NOT_NOW = /(옛날|예전|그때는|젊었을\s?때|드라마|영화|뉴스에|남편이|아내가|친구가)/;

/** 인지 저하 증상 — 절대 위기로 보지 않는다 */
const COGNITIVE = /(깜빡|가물가물|기억이\s?안|머리가\s?멍|멍하|정신이\s?없|며칠인지|무슨\s?요일|날짜를?\s?(모르|헷갈|잊)|헷갈려|자꾸\s?잊)/;

/**
 * 지금 이 말씀이 위기 신호인가.
 * 인지 저하 증상만 말씀하신 것은 위기가 아니다.
 */
export function isCrisisTalk(v) {
  const t = text(v);
  if (!CRISIS.test(t)) return false;
  if (NOT_NOW.test(t)) return false;
  return true;
}

/** 인지 저하를 걱정하시는 말씀인가 (위기가 아니라 안심시켜 드릴 자리다) */
export function isCognitiveWorry(v) {
  const t = text(v);
  return COGNITIVE.test(t) && !isCrisisTalk(t);
}

/**
 * 위기일 때 드리는 말. 모델에게 맡기지 않고 늘 같은 문장으로 드린다.
 * 번호를 모델이 지어내면 큰일이다.
 */
export const CRISIS_LINE =
  '많이 힘드셨겠어요. 혼자 견디지 마세요. '
  + '지금 마음이 많이 힘드시면 하루 스물네 시간 열려 있는 정신건강 상담전화 일오칠칠에 영일구구로 전화해 보세요. '
  + '가까운 가족분께도 꼭 알려 주세요. 위험하다고 느껴지시면 바로 백십구입니다.';

/** 인지 저하를 걱정하실 때 초롱이가 지켜야 할 것 (프롬프트에 넣는다) */
export const COGNITIVE_CARE_RULE = [
  '- 지금 어르신이 깜빡하시거나 날짜가 헷갈린다고 걱정하셨습니다.',
  '  이것은 위험한 일이 아닙니다. 상담 전화나 응급 안내를 하지 마십시오.',
  '- 먼저 안심시켜 드립니다. 나이가 들면 누구나 그렇다고, 괜찮다고 말씀드립니다.',
  '- 시험하듯 되묻지 않습니다. ("오늘이 며칠인지 아세요?" 같은 물음은 하지 않습니다)',
  '  날짜를 궁금해하시면 먼저 알려 드립니다.',
  '- 병이라고 단정하거나 진단하지 않습니다. 걱정이 크시면 가족분과 의논해 보시라고만 합니다.',
].join('\n');

/* ------------------------------------------------------------------ *
 * 목표 — 어르신이 스스로 정하시게
 * ------------------------------------------------------------------ */

/* 무언가 해 보겠다는 말씀. 어르신 말씀에 이런 결이 있을 때만 목표로 본다 */
/* '~야겠어' 는 '해야겠 · 먹어야겠 · 가야겠 · 챙겨야겠' 처럼 앞말이 바뀐다. 줄기만 적으면 놓친다 */
const GOAL_WILL = /(볼까\s?해|볼까요|해\s?볼|야겠|하려고|할까\s?봐|할래|할게|하겠|시작해|해\s?보고\s?싶|하고\s?싶|다녀올|챙겨\s?먹|끊어야|줄여야)/;
/* 몸을 움직이거나 챙기는 일 — 건강 목표로 볼 만한 것 */
/* '걷다' 는 '걸어볼까', '걸을게' 처럼 모양이 바뀐다. 줄기만 적으면 놓친다 */
const GOAL_WHAT = /(걷|걸어|걸을|걸으|산책|운동|체조|스트레칭|등산|자전거|수영|물\s?마시|약|병원|검진|잠|일찍\s?자|담배|술|식사|밥|채소|과일|청소|정리|모임|교회|복지관|노래|글씨|일기)/;

/** 어르신 말씀에 목표가 될 만한 것이 실제로 있었는가 (모델이 지어낸 목표를 거르는 데 쓴다) */
export function looksLikeGoal(v) {
  const t = text(v);
  return GOAL_WILL.test(t) && GOAL_WHAT.test(t);
}

/* 언제 · 어디서 · 얼마나가 이미 나왔는가 */
const HAS_WHEN = /(아침|점심|저녁|새벽|오전|오후|밤|자기\s?전|일어나서|식사\s?후|밥\s?먹고|먹고\s?나서|매일|날마다|주\s?\d|일주일에|한\s?번씩|시에|시쯤|시부터|월요일|화요일|수요일|목요일|금요일|토요일|일요일)/;
const HAS_WHERE = /(집|방|거실|마당|공원|동네|단지|복지관|경로당|병원|학교|산|강|천변|둘레길|헬스|체육관|마트|시장)/;
const HAS_AMOUNT = /(\d+\s?(분|시간|바퀴|번|개|잔|쪽|계단)|한\s?바퀴|두\s?바퀴|조금씩|잠깐|삼십\s?분|십\s?분|이십\s?분|한\s?시간)/;

/**
 * 목표에서 아직 정해지지 않은 것 하나.
 * 언제 → 얼마나 → 어디서 차례로 본다. 한 번에 하나만 여쭈어야 하기 때문이다.
 * 다 정해졌으면 'none'.
 */
export function missingPart(goalText, saidText = '') {
  const t = `${text(goalText)} ${text(saidText)}`;
  if (!HAS_WHEN.test(t)) return 'when';
  if (!HAS_AMOUNT.test(t)) return 'amount';
  if (!HAS_WHERE.test(t)) return 'where';
  return 'none';
}

/** 모자란 것을 여쭙는 말. 초롱이가 대신 정해 주지 않고 어르신이 고르시게 한다 */
export const GOAL_QUESTIONS = {
  when: '하루 중 언제가 제일 편하실까요?',
  where: '어디서 하시면 좋으실까요?',
  how: '어떻게 해 보시면 좋을까요?',
  amount: '얼마나 하시면 딱 좋으실까요?',
};

/** 목표가 다 정해졌을 때 드리는 한마디 (칭찬만 하고 더 시키지 않는다) */
export const GOAL_SETTLED = '그렇게 정해 두시면 잊지 않고 하시기 좋겠어요.';

/**
 * 목표를 구체화하는 물음이 답에 들어 있게 한다.
 *
 * 모델은 "좋은 생각이세요!" 하고 끝내거나, 반대로 "그럼 아침 일곱 시에
 * 삼십 분씩 걸으세요" 하고 대신 정해 버린다. 둘 다 어르신이 스스로 정하시는
 * 과정을 건너뛴다. 그래서 물음이 없으면 코드가 붙인다.
 */
export function withGoalQuestion(reply, part) {
  const ask = GOAL_QUESTIONS[part];
  const t = text(reply).trim();
  if (!ask) return t;
  if (bare(t).includes(bare(ask))) return t;
  // 이미 다른 물음이 있으면 그대로 둔다 (한 번에 하나만 여쭙는다)
  if (/[?？]/.test(t)) return t;
  return t ? `${t} ${ask}` : ask;
}

/* 초롱이가 어르신 대신 정해 주는 말투 — "~하세요", "~하시면 됩니다" 로 시키는 것 */
const TELLING = /(으세요|하세요|하시면\s?됩니다|하십시오|정해\s?드릴|정해\s?드렸|이렇게\s?하시|제가\s?정|해\s?보시죠|하시죠)/;

/** 목표를 대신 정해 주는 문장인가 */
export function decidesForElder(v) {
  const t = text(v);
  return TELLING.test(t) && GOAL_WHAT.test(t);
}

/** 문장 단위로 자른다 (lib/reply-rules.js 와 같은 방식) */
const SENTENCES = /[^.!?。！？\n]+[.!?。！？]*\n?/g;

/**
 * 어르신 대신 정해 주는 문장을 걷어낸다.
 * "좋은 생각이세요. 그럼 매일 삼십 분씩 걸으세요." → 앞 문장만 남는다.
 * 다 걷어내면 대신할 말(fallback)을 쓴다.
 */
export function dropDecidedGoals(text, fallback = '') {
  const parts = String(text).match(SENTENCES);
  if (!parts) return text;
  const out = parts.filter((s) => !decidesForElder(s)).join('').trim();
  return out || fallback || String(text).trim();
}

/* ------------------------------------------------------------------ *
 * 같은 말씀을 되풀이하실 때 — 혼란
 * ------------------------------------------------------------------ */

/** 낱말로 쪼갠다 (조사까지 붙은 채라 앞 두 글자만 본다) */
function keywords(v) {
  return text(v)
    .replace(/[^가-힣0-9a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.slice(0, 2));
}

/**
 * 조금 전에 하신 말씀을 그대로 되풀이하고 계신가.
 * 인수인계 문서 기준 그대로 — 최근 네 마디와 낱말이 일흔 해 이상 겹치면 되풀이로 본다.
 * 되풀이라고 해서 "아까 말씀하셨잖아요" 라고 하면 절대 안 된다. 더 짧고 천천히 다시 안내한다.
 */
export function repeatsEarlier(v, history = [], { window = 4, ratio = 0.7 } = {}) {
  const now = keywords(v);
  if (now.length < 2) return false;
  const said = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
    .slice(-1 - window, -1)          // 마지막은 이번 말씀이라 뺀다
    .slice(-window);
  return said.some((m) => {
    const before = new Set(keywords(m.content));
    if (before.size < 2) return false;
    const same = now.filter((w) => before.has(w)).length;
    return same / now.length >= ratio;
  });
}

/** 되풀이하실 때 지킬 것 */
export const CONFUSION_CARE_RULE = [
  '- 어르신이 조금 전과 같은 말씀을 다시 하셨습니다. 처음 듣는 것처럼 반갑게 받아 드립니다.',
  '- "아까 말씀하셨어요", "방금 여쭤봤는데" 같은 말은 절대 하지 않습니다.',
  '- 앞서 드린 이야기를 더 짧고 천천히, 쉬운 말로 한 번 더 말씀드립니다. 두 문장을 넘기지 않습니다.',
].join('\n');

/* ------------------------------------------------------------------ *
 * 아프다고 하실 때 · 약 이야기 · 기분 이야기
 * ------------------------------------------------------------------ */

/* 아프다는 말씀 */
/* '쑤시다 → 쑤셔', '결리다 → 결려' 처럼 모양이 바뀐다. 어르신은 활용된 말로 하신다 */
const PAIN_WORD = /(아파|아프|아픈|아팠|쑤시|쑤셔|쑤신|결리|결려|저리|저려|시큰|뻐근|욱신|당기|당겨|따갑|쓰리|쓰려|아리|통증)/;
/* 부위를 부르시는 다른 말 */
const PART_ALIAS = {
  머리: ['머리', '두통', '정수리'],
  어깨: ['어깨', '견갑', '목', '뒷목'],
  허리: ['허리', '요통', '골반'],
  무릎: ['무릎', '관절'],
  다리: ['다리', '종아리', '발', '발목', '허벅지'],
  팔: ['팔', '손', '손목', '팔꿈치'],
  배: ['배', '속', '위', '소화'],
  가슴: ['가슴', '심장'],
};

/**
 * 아프다고 하셨는가. 어디가 아프신지까지 알아보면 함께 돌려준다.
 * 부위를 모르면 part 는 null 이고, 화면이 여쭙는다.
 */
export function painMention(v) {
  const t = text(v);
  if (!PAIN_WORD.test(t)) return null;
  for (const part of PAIN_PARTS) {
    const names = PART_ALIAS[part] || [part];
    if (names.some((n) => t.includes(n))) return { part };
  }
  return { part: null };
}

/* 약을 드셨다는 말씀 · 아직 안 드셨다는 말씀 */
const MED_TOOK = /(약(을|은|도)?\s?(먹었|드셨|복용|챙겨\s?먹|먹고)|약\s?먹었|약은\s?먹)/;
const MED_NOT = /(안\s?먹었|못\s?먹었|깜빡했|안\s?챙|잊어버렸)/;

/** 약을 드셨다는 말씀인가 */
export function medicationTaken(v) {
  const t = text(v);
  return MED_TOOK.test(t) && !MED_NOT.test(t);
}

/** 약을 아직 안 드셨다는 말씀인가 */
export function medicationMissed(v) {
  const t = text(v);
  return /약/.test(t) && MED_NOT.test(t);
}

/* 어르신이 기분을 말씀하신 낱말 → 다섯 단계 가운데 하나.
   표정이나 사진으로 짐작하지 않는다. 말씀하신 낱말만 본다. */
const MOOD_WORDS = [
  { key: 'great', re: /(너무\s?좋|아주\s?좋|정말\s?좋|행복|신나|기뻐|기쁘|최고|날아갈)/ },
  { key: 'bad', re: /(속상|서운|외로|쓸쓸|우울|슬프|슬퍼|허전|답답|걱정|불안|힘들|지쳐|피곤|귀찮)/ },
  { key: 'awful', re: /(너무\s?힘들|죽겠|못\s?견디|괴로|비참|아무것도\s?하기\s?싫)/ },
  { key: 'good', re: /(좋아|좋았|좋네|즐거|재미|반가|뿌듯|편안|시원|개운)/ },
  { key: 'soso', re: /(그저\s?그래|그냥\s?그래|그럭저럭|보통이|늘\s?같)/ },
];

/**
 * 어르신 말씀에서 읽은 기분. 없으면 null.
 * 버튼으로 직접 고르신 기분과 견주어 크게 다르면 한 번 더 여쭙는다 (lib/care-score.js).
 */
export function moodFromTalk(v) {
  const t = text(v);
  // 아주 힘든 쪽을 먼저 본다 ("너무 힘들어" 가 "힘들" 로만 잡히지 않게)
  for (const key of ['awful', 'great', 'bad', 'good', 'soso']) {
    const rule = MOOD_WORDS.find((m) => m.key === key);
    if (rule && rule.re.test(t)) {
      const m = MOODS.find((x) => x.key === key);
      return { key, label: m.label, score: m.score };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 인지 활동 네 가지
 *
 * 인수인계의 cognitive_care 를 초롱이 원칙에 맞게 고쳤다.
 * 날짜 활동은 맞히게 하지 않는다. 먼저 알려 드리고 함께 말해 보는 것이다.
 * 기억력 검사가 되면 어르신이 초롱이를 피하게 된다.
 * ------------------------------------------------------------------ */

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 오늘 날짜를 우리말로 — '구월 십육일 수요일' 처럼 읽어 드리기 좋게 */
export function dateWords(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  if (!y || !m || !d) return '';
  const day = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 ${day}요일`;
}

/**
 * 오늘 드릴 인지 활동 하나.
 * 오늘 이미 하신 활동은 빼고 고른다. 다 하셨으면 null (더 시키지 않는다).
 */
export function pickActivity(doneKinds = [], { date = '', random = Math.random } = {}) {
  const done = new Set(doneKinds);
  const all = [
    {
      kind: 'number',
      name: '숫자 세기',
      say: '저와 함께 하나부터 다섯까지 소리 내어 세어 볼까요? 제가 먼저 할게요. 하나, 둘, 셋, 넷, 다섯.',
    },
    {
      kind: 'date',
      name: '오늘 날짜',
      say: date
        ? `오늘은 ${dateWords(date)}이에요. 저를 따라 한 번 말해 보실래요?`
        : '오늘 날짜를 저와 함께 말해 볼까요?',
    },
    {
      kind: 'recall',
      name: '옛 기억 떠올리기',
      say: '제일 좋아하셨던 음식이 무엇이었는지 들려주시겠어요?',
    },
    {
      kind: 'photo',
      name: '사진 보며 이야기',
      say: '사진 한 장 함께 보면서 이야기 나눠 볼까요?',
    },
  ];
  const left = all.filter((a) => !done.has(a.kind));
  if (left.length === 0) return null;
  return left[Math.floor(random() * left.length) % left.length];
}
