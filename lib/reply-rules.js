/* =====================================================================
 *  초롱이의 답을 한 번 더 다듬는 규칙 — 모델이 버릇처럼 어기는 것을 코드로 막는다
 *
 *  프롬프트로만 부탁하면 모델은 결국
 *    · 질문을 덧붙이고, 되받아야 할 차례에 질문부터 하고
 *    · 물음표만 뺀 질문("어떤 일이 있었는지 궁금하네요")을 하고
 *    · 말씀하지 않으신 기분을 짐작하거나 단정해 붙이고
 *      ("즐거운 시간이셨겠어요", "특별한 시간이셨네요")
 *    · 이야기가 멈췄는데도 여쭙지 않고 짐작한 기분으로 넘어가고
 *    · 적어 둔 내용을 한꺼번에 늘어놓거나, 보호자가 적은 것을 어르신이 하신 말처럼 건넨다
 *      ("딸과 사위와 함께 있는 모습이라고 하셨어요")
 *  실제 대화로 여러 번 확인했다. 그래서 여기서 문장 단위로 걷어내거나 바꾸고,
 *  단서는 이번에 건넬 한 가지만 모델에게 보여 준다.
 *
 *  걷어내다 남는 말이 없으면 원문을 두거나, 부르는 쪽이 준 대신할 말을 쓴다.
 *  바깥에 기대지 않는 함수만 둔다 (lib/reply.test.mjs 에서 시험한다).
 * ===================================================================== */

export const hasQuestion = (t) => /[?？]/.test(String(t));

/** 문장 단위로 자른다 (마침표 · 물음표 · 느낌표 · 줄바꿈) */
const SENTENCES = /[^.!?。！？\n]+[.!?。！？]*\n?/g;

/** 조건에 맞는 문장만 남긴다. 다 빠지면 fallback, 없으면 원문 */
function keepSentences(text, keep, fallback) {
  const parts = String(text).match(SENTENCES);
  if (!parts) return text;
  const out = parts.filter((s, i) => keep(s, i, parts)).join('').trim();
  return out || fallback || text;
}

/**
 * 질문을 예산에 맞게 걷어낸다.
 * allowOne 이면 마지막 질문 하나만 남기고, 아니면 질문 문장을 모두 뺀다.
 */
export function limitQuestions(text, allowOne) {
  const parts = String(text).match(SENTENCES);
  if (!parts) return text;

  const qAt = [];
  parts.forEach((s, i) => { if (hasQuestion(s)) qAt.push(i); });
  if (qAt.length === 0) return text;
  if (allowOne && qAt.length === 1) return text;

  const keep = allowOne ? qAt[qAt.length - 1] : -1;
  return keepSentences(text, (_, i) => !qAt.includes(i) || i === keep);
}

/**
 * 듣는 차례(새 이야기 · 이어지는 이야기 · 감정)의 질문을 모두 뺀다.
 * 질문뿐이던 답이면 fallback 으로 바꾼다.
 */
export function stripQuestions(text, fallback) {
  return keepSentences(text, (s) => !hasQuestion(s), fallback);
}

/* 물음표만 없는 질문. 질문하면 안 되는 차례(방금 여쭌 뒤)에 이런 말이 붙으면
   어르신은 또 대답을 재촉받는다. */
const SOFT_QUESTION = /궁금(해요|하네요|합니다|하군요|해지네요|하던데요|하기도 해요)/;

export function dropSoftQuestions(text, fallback) {
  return keepSentences(text, (s) => !SOFT_QUESTION.test(s), fallback);
}

/* ------------------------------------------------------------------ *
 * 말씀하지 않으신 기분 — 짐작하지도, 단정하지도 않는다
 * ------------------------------------------------------------------ */

/* 기분 · 느낌 낱말. 같은 기분을 다른 꼴로 말씀하셔도 알아보도록 줄기를 묶어 둔다
   ("재밌었지" 하셨으면 "재미있으셨군요" 는 되받는 말이다). */
const FEELINGS = /(즐거|즐겁|행복|소중|귀중|특별|좋으|좋은|좋았|기쁘|기뻤|아름다|뿌듯|신나|신났|반가|설레|그리우|그리웠|시원|따뜻|재미|정겨|평화|근사|멋지|멋졌|감동|맛있|맛났)/g;
const FEELING_STEMS = [
  ['즐거', '즐겁'], ['행복'], ['소중'], ['귀중'], ['특별'], ['좋'],
  ['기쁘', '기뻤', '기뻐', '기쁨'], ['아름다', '아름답'], ['뿌듯'], ['신나', '신났', '신이 나', '신이 났'],
  ['반가', '반갑'], ['설레', '설렜', '설렘'], ['그리우', '그리웠', '그립', '그리워'], ['시원'],
  ['따뜻', '따듯'], ['재미', '재밌'], ['정겨', '정겹'], ['평화'], ['근사'], ['멋'], ['감동'],
  ['맛있', '맛났', '맛나'],
];
const stemsOf = (word) => FEELING_STEMS.find((g) => g.some((stem) => word.startsWith(stem))) || [word.slice(0, 2)];

/* 짐작하는 말끝 — "~겠어요", "~을 것 같아요", "~나 봐요" (셋 다 실제로 나왔다) */
const GUESS = /(겠(어요|네요|습니다|군요|죠|지요)|것 같(아요|네요|습니다)|[나가] (봐요|보네요|봅니다))/;
/* 단정하는 말끝 + 겪으신 일이나 어르신의 기분을 가리키는 말 — "특별한 시간이셨네요" (실제 답).
   "날" 은 넣지 않았다. "따뜻한 날이네요" 처럼 사진에 보이는 날씨를 단서로 건네는 말까지 걷어낸다. */
const SETTLED = /(네요|군요|구나|죠|지요|이에요|예요|었어요|였어요|습니다)[.!。！\s]*$/;
const EXPERIENCE = /(시간|추억|기억|한때|순간|하루|여행|휴가|경험|나들이|시절)/;
const OWN_STATE = /셨(네요|군요|구나|죠|지요|어요|습니다)/;
/* 고마움을 전하는 말("소중한 이야기 들려주셔서 감사합니다")은 짐작이 아니다 */
const THANKS = /(감사|고맙|고마워)/;

/**
 * 말씀하지 않으신 기분을 짐작하거나 단정한 문장인가.
 * "힘드셨겠어요" · "놀라셨겠어요" 는 넣지 않았다. 아프거나 슬픈 이야기에서 헤아리는 말이라
 * 걷어내면 차갑게 들린다. 버릇처럼 붙는 것은 좋은 기분 쪽이다.
 * 질문("그때 기분은 어떠셨어요?")과 사진에 보이는 것("아름다운 꽃이 보이네요")은 건드리지 않는다.
 */
function guessesFeeling(sentence, said) {
  if (hasQuestion(sentence) || THANKS.test(sentence)) return false;
  const felt = [...sentence.matchAll(FEELINGS)].map((m) => m[1]);
  if (felt.length === 0) return false;
  const guessing = GUESS.test(sentence)
    || (SETTLED.test(sentence) && (EXPERIENCE.test(sentence) || OWN_STATE.test(sentence)));
  if (!guessing) return false;
  // 어르신이 먼저 그 기분을 말씀하셨으면 되받는 말이다
  return !felt.every((f) => stemsOf(f).some((stem) => said.includes(stem)));
}

/**
 * 말씀하지 않으신 기분을 짐작하거나 단정해 덧붙인 문장을 걷어낸다.
 * userSaid 는 이 대화에서 어르신이 하신 말씀 (앞서 하신 말씀을 되받는 것도 되받는 말이다).
 * 짐작뿐이던 답이면 fallback 으로 바꾼다 (없으면 원문을 둔다).
 */
export function dropGuessedFeelings(text, userSaid = '', { fallback } = {}) {
  const said = String(userSaid);
  return keepSentences(text, (s) => !guessesFeeling(s, said), fallback);
}

/**
 * 모델이 따로 적어 보낸 되받는 말(reflection). 걷어내고 나니 남는 말이 없을 때 대신 쓴다.
 * "그러셨군요." 보다 어르신이 쓰신 낱말을 살린 이 말이 낫다.
 * 이것도 짧고, 질문 · 숨은 질문 · 짐작한 기분이 없어야 쓴다. 못 쓰면 ''.
 */
export function safeReflection(text, userSaid = '') {
  const s = String(text ?? '').trim();
  if (!s || s.length > 80 || hasQuestion(s) || SOFT_QUESTION.test(s)) return '';
  const parts = s.match(SENTENCES) || [];
  if (parts.length > 2) return '';
  const said = String(userSaid);
  return parts.some((p) => guessesFeeling(p, said)) ? '' : s;
}

/* ------------------------------------------------------------------ *
 * 이야기가 멈췄을 때 — 열린 질문 하나
 * ------------------------------------------------------------------ */

/* "그랬지 뭐", "응", "그랬어" 처럼 짧게 맺으시는 말.
   모델은 이런 말을 새 이야기로 보고 짐작한 기분만 붙인 채 넘어간다 (실제 대화에서 여러 번).
   "음..." 은 넣지 않았다. 떠올리시는 중이라 여쭈면 말을 끊는다. */
const PAUSE_WORDS = new Set([
  '응', '응응', '네', '예', '그래', '그래요', '맞아', '맞아요', '그렇지', '그렇죠', '그렇지 뭐',
  '그랬지', '그랬어', '그랬어요', '그랬죠', '그랬었지', '그랬지 뭐', '뭐 그랬지', '그냥 그랬어', '그랬던 거지',
  '그게 다야', '그게 다예요', '그게 전부야', '그 정도야', '그 정도예요', '별거 없었어', '별거 없었지',
]);

/**
 * 이야기가 멈추신 말인가. "응, 그랬지 뭐" 처럼 맞장구가 앞에 붙어도 알아본다.
 * 방금 여쭌 물음에 "응" 하신 것은 대답이다 — 그것은 부르는 쪽이 가린다.
 */
export function isPause(text) {
  const t = String(text ?? '').replace(/[.!~…,]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (PAUSE_WORDS.has(t)) return true;
  const rest = t.replace(/^(응|네|예|그래|맞아)\s+/, '');
  return rest !== t && PAUSE_WORDS.has(rest);
}

/* 이야기가 멈췄을 때 여쭐 열린 질문. asked 는 말만 달리 이미 여쭌 것을 알아보는 무늬 */
const FOLLOW_UPS = [
  { ask: '그날 기억나는 일이 또 있으세요?', asked: /또\s*(어떤|있|기억|무슨)|다른 (일|기억)/ },
  { ask: '그때 기분은 어떠셨어요?', asked: /기분|마음이 어떠/ },
  { ask: '그다음에는 어떻게 되었어요?', asked: /그다음|그 뒤|그 후/ },
];

/** 이 대화에서 아직 여쭙지 않은 열린 질문. 질문으로 한 말만 여쭌 것으로 친다. 다 여쭸으면 null */
export function pickFollowUp(history = []) {
  const asked = textsOf(history)
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => m.content.match(SENTENCES) || [])
    .filter(hasQuestion)
    .join('\n');
  return FOLLOW_UPS.find((f) => !f.asked.test(asked))?.ask || null;
}

/* ------------------------------------------------------------------ *
 * 개인화된 단서 — 한 번에 한 가지씩, 누가 적었는지 밝혀서
 * ------------------------------------------------------------------ */

/** 단서를 건넬 때 누가 적었는지 밝히는 말 (모델에게 보여 주는 출처) */
export const CUE_SOURCE_SAY = {
  USER: '어르신이 전에 들려주신 것',
  CAREGIVER: '보호자분이 적어 두신 것',
  UPLOAD: '사진을 올리실 때 적어 두신 것',
};

/**
 * 적어 둔 내용이 어디서 왔는지.
 * 어르신이 들려주신 것을 보호자가 적은 것처럼, 보호자가 적은 것을 어르신이 하신 말처럼
 * 말하면 안 된다 (어르신이 자신의 경험에 대한 전문가다).
 */
export function factSource(memory, field) {
  const confirmed = (memory?.claims || [])
    .filter((c) => c.field === field && c.status !== 'UNVERIFIED')
    .sort((a, b) => String(b.decided_at || '').localeCompare(String(a.decided_at || '')))[0];
  if (confirmed) return confirmed.source === 'USER' ? 'USER' : 'CAREGIVER';
  return memory?.verification_status === 'CAREGIVER_VERIFIED' ? 'CAREGIVER' : 'UPLOAD';
}

/** 단서로 먼저 건넬 순서 — 누구와 · 어디서가 가장 잘 떠오른다 */
const CUE_ORDER = ['people', 'place', 'when_text', 'title', 'description'];

/* 적어 둔 사람을 어르신께 말씀드릴 때 높여 부르는 말 — "딸" 을 "따님" 으로 건네는 일이 많다 */
const ALIASES = { 딸: ['따님'], 아들: ['아드님'], 어머니: ['어머님'], 아버지: ['아버님'] };
const mentioned = (text, word) => [word, ...(ALIASES[word] || [])].some((n) => text.includes(n));

const wordsOf = (v) => (Array.isArray(v) ? v : [v]).map((w) => String(w ?? '').trim()).filter(Boolean);
function textsOf(history) {
  return (Array.isArray(history) ? history : []).filter((m) => m && typeof m.content === 'string');
}

/**
 * 이번에 건넬 단서 한 가지.
 * 이미 대화에 나온 것(어르신이 말씀하셨거나 초롱이가 건넨 것)은 건너뛴다.
 * 남은 것이 없으면 null.
 */
export function pickCue(memory, facts, history = []) {
  const said = textsOf(history).map((m) => m.content).join('\n');
  for (const field of CUE_ORDER) {
    const words = wordsOf(facts?.[field]);
    if (words.length === 0) continue;
    if (words.some((w) => mentioned(said, w))) continue;
    return { field, value: words.join(', '), source: factSource(memory, field) };
  }
  return null;
}

/**
 * 바로 앞 초롱이 말에서 적어 둔 내용을 단서로 건넸는가.
 * 어르신이 먼저 말씀하신 낱말을 되받은 것은 건넨 것으로 치지 않는다.
 *
 * 단서를 건넸는데도 기억이 안 난다고 하시면 단서를 더 드리지 않는다.
 * 하나 더, 또 하나 더 건네다 보면 결국 적어 둔 것을 모두 늘어놓게 된다.
 */
export function justGaveCue(facts, history = []) {
  const list = textsOf(history);
  const at = list.map((m) => m.role).lastIndexOf('assistant');
  if (at < 0) return false;
  const bot = list[at].content;
  const userSaid = list.slice(0, at).filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  const words = CUE_ORDER.flatMap((f) => wordsOf(facts?.[f]));
  return words.some((w) => mentioned(bot, w) && !mentioned(userSaid, w));
}

/* 단서를 건네는 문장의 틀 */
const CUE_OBJECT = {
  people: '함께한 분을', place: '장소를', when_text: '때를', title: '이 사진을', description: '사진 설명에',
};
const CUE_TELLER = {
  USER: ['전에', '들려주셨어요'],
  CAREGIVER: ['보호자분이', '적어 두셨어요'],
  UPLOAD: ['사진을 올리실 때', '적어 두셨어요'],
};
/* 누가 적었는지 밝힌 말인가. "편하게 들려주세요" 는 청하는 말이라 "들려주셨" 만 본다 */
const TELLER_MARK = {
  USER: /들려주셨|말씀하셨|말씀해 주셨/,
  CAREGIVER: /보호자/,
  UPLOAD: /올리실 때|올리시면서|올리시며/,
};

/** 따옴표로 묶고, 끝 글자에 받침이 있으면 '이라고' 없으면 '라고' */
function quoted(value) {
  const code = String(value).trim().slice(-1).charCodeAt(0) - 0xac00;
  const batchim = code >= 0 && code < 11172 && code % 28 !== 0;
  return `'${value}'${batchim ? '이라고' : '라고'}`;
}

/** 단서 한 가지를 누가 적었는지 밝혀 건네는 문장 — "보호자분이 장소를 '강릉 바닷가'라고 적어 두셨어요." */
export function cueSentence(cue) {
  const [who, verb] = CUE_TELLER[cue.source] || CUE_TELLER.UPLOAD;
  return `${who} ${CUE_OBJECT[cue.field] || '이 사진을'} ${quoted(cue.value)} ${verb}.`;
}

/**
 * 적어 둔 내용을 단서로 꺼냈는데 누가 적었는지 밝히지 않았으면, 그 문장을 밝히는 문장으로 바꾼다.
 * "이 사진은 딸과 사위와 함께 있는 모습이라고 하셨어요" — 보호자가 적은 것을 어르신이 하신 말처럼
 * 들리게 한 답이 실제로 나왔다. 어르신이 먼저 말씀하신 낱말은 단서가 아니라 되받는 말이다.
 */
export function attributeCue(text, cue, userSaid = '') {
  if (!cue) return text;
  const said = String(userSaid);
  const words = String(cue.value).split(', ').filter((w) => w && !mentioned(said, w));
  const parts = String(text).match(SENTENCES);
  if (!parts || words.length === 0) return text;
  const hasCue = (s) => words.some((w) => mentioned(s, w));
  if (!parts.some(hasCue)) return text;
  if ((TELLER_MARK[cue.source] || TELLER_MARK.UPLOAD).test(text)) return text;

  let placed = false;
  return parts.map((s) => {
    if (!hasCue(s)) return s;
    if (placed) return '';
    placed = true;
    return `${/^\s/.test(s) ? ' ' : ''}${cueSentence(cue)}${/\n$/.test(s) ? '\n' : ''}`;
  }).join('').trim();
}

/* ------------------------------------------------------------------ *
 * 기억이 안 난다고 하실 때 — 두 걸음
 * ------------------------------------------------------------------ */

/** 화면이 고정해서 드리는 첫 물음. 이 물음 뒤부터가 지금 사진의 이야기다 */
export const RECALL_OPENING = '이 사진을 보면 어떤 기억이 떠오르세요?';

const MISS = /기억(이|은|도)? ?안 ?나|생각(이|은|도)? ?안 ?나|모르겠|몰라|기억 못|기억이 없/;
const REASSURE = /괜찮|무리하지|천천히|걱정 마|안 나셔도|모르셔도|몰라도/;
const MOVE_ON = /(다른|다음) 사진|넘어가|쉬실까|쉬어 갈까|쉴까|그만 볼까|그만할까/;
const INVITE = /(들려|말씀해|이야기해) ?주세요|편하게 말씀/;
export const CUE_INVITE = '떠오르는 게 있으시면 편하게 들려주세요.';
export const MOVE_ON_ASK = '다른 사진을 보실까요?';

/**
 * 지금 사진에서, 이번 말씀 전에 기억이 안 난다고 하신 횟수.
 * 첫 물음 뒤부터 센다 — 앞 사진에서 하신 말씀까지 세면 새 사진에서 단서를 건너뛴다.
 * history 의 마지막은 이번 말씀이다.
 */
export function priorMisses(history = []) {
  const list = textsOf(history);
  const start = list.map((m) => m.role === 'assistant' && m.content.includes(RECALL_OPENING)).lastIndexOf(true);
  return list.slice(start + 1).filter((m) => m.role === 'user').slice(0, -1)
    .filter((m) => MISS.test(m.content)).length;
}

/**
 * 기억이 안 난다고 하실 때는 두 걸음이다.
 * 처음에는 단서 한 가지를 건네고 떠올리실 틈을 드린다. 넘어가자는 말을 함께 하면 단서를 듣자마자
 * 재촉하는 말이 된다 (실제로 나왔다). 단서 없이 넘어갈지만 여쭌 답은 그대로 둔다 — 그것도 어르신이 고르실 길이다.
 * 그래도 모르신다고 하시면 단서를 더 건네지 않고 넘어갈지 여쭙는다
 * ("이 사진은 바닷가에서 찍은 것 같네요" 처럼 단서를 또 건넨 답이 실제로 나왔다).
 */
export function recallSteps(text, misses) {
  const parts = String(text).match(SENTENCES);
  if (!parts) return text;
  const kind = (s) => (MOVE_ON.test(s) ? 'move' : INVITE.test(s) ? 'invite' : REASSURE.test(s) ? 'reassure' : 'cue');
  const kinds = parts.map(kind);

  if (misses === 0) {
    if (!kinds.includes('cue')) return text;
    const out = parts.filter((_, i) => kinds[i] !== 'move').join('').trim();
    return kinds.includes('invite') ? out : `${out} ${CUE_INVITE}`;
  }
  const out = parts.filter((_, i) => kinds[i] !== 'cue').join('').trim();
  if (kinds.includes('move')) return out;
  return `${out || '괜찮아요.'} ${MOVE_ON_ASK}`;
}

/* ------------------------------------------------------------------ *
 * 자연스럽게 주고받기
 *
 * 되받기만 하고 기다리게 했더니 "~셨군요" 가 이어져 앵무새처럼 들렸다.
 * 이제는 반응 · 한마디 보태기 · 질문을 섞어 주고받는다. 코드는 두 가지를 돕는다.
 *   · 질문만 달랑 한 답에는 반응 한마디를 앞에 붙인다
 *   · 사진을 살펴본 결과를 이야깃거리로 건넨다 (이미 나온 것은 빼고)
 * ------------------------------------------------------------------ */

/** 질문만 달랑 한 답이면 반응 한마디를 앞에 붙인다. 묻기만 이어지면 기억력 검사처럼 들린다 */
export function withReaction(text, reaction) {
  const parts = String(text).match(SENTENCES);
  const lead = String(reaction ?? '').trim();
  if (!parts || !lead || !parts.every(hasQuestion)) return text;
  return `${lead} ${String(text).trim()}`;
}

const COUNT_WORD = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

/**
 * 사진을 살펴본 결과(analysis)를 이야깃거리로 건넬 한 줄.
 * 이미 대화에 나온 것(첫 말에서 짚은 것 포함)은 뺀다 — 같은 것을 자꾸 꺼내면 되묻는 것처럼 들린다.
 * 보이는 모습만 담는다. 찍은 때(연대)는 넣지 않는다 — 날짜 맞히기로 번지기 쉽다.
 */
export function photoMaterial(analysis, history = []) {
  if (!analysis || analysis.status !== 'DONE') return '';
  const said = textsOf(history).map((m) => m.content).join('\n');
  const fresh = (w) => Boolean(w) && !said.includes(w);
  const place = String(analysis.place_label || '').trim();
  const activity = String(analysis.activity_label || '').trim();
  const things = (Array.isArray(analysis.objects) ? analysis.objects : [])
    .map((o) => String(o).trim()).filter(fresh).slice(0, 5);
  const n = Math.max(0, Math.round(Number(analysis.people_count) || 0));

  const parts = [];
  if (fresh(place)) parts.push(`장소 — ${place}`);
  if (fresh(activity)) parts.push(`하는 일 — ${activity}`);
  if (things.length) parts.push(`보이는 것 — ${things.join(', ')}`);
  if (n > 0) parts.push(`사람 — ${n < COUNT_WORD.length ? `${COUNT_WORD[n]} 명` : '여러 명'}`);
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ *
 * 대화가 기억력 검사나 짐작으로 흐르지 않게
 * ------------------------------------------------------------------ */

/* 정답이 있는 물음 — 언제 · 몇 년 · 누구 · 어디. 기억력 검사처럼 들린다.
   ("꽃은 언제부터 키우기 시작하셨어요?" 가 실제로 나왔다) */
const QUIZ = /(언제|몇\s?(년|살|시|월|일|명|번째|개)|누구|어디)/;

/* allow — 질문지에 있는 질문은 "누구" 가 들어가도 빼지 않는다 ("이때 누구와 함께 계셨어요?") */
export function dropQuizQuestions(text, fallback, allow = []) {
  const bare = (t) => String(t).replace(/[\s.?!,~…'"“”？]/g, '');
  const allowed = allow.map(bare).filter(Boolean);
  return keepSentences(text,
    (s) => !(hasQuestion(s) && QUIZ.test(s)) || allowed.some((a) => bare(s).includes(a)), fallback);
}

/* 함께한 사람을 짐작하는 말 — "친구분들과 함께 하셨나 봐요" (실제 답). 어르신이 말씀하신 사람만 말한다.
   값은 어르신이 같은 사람을 부르실 법한 다른 말 ("따님" ↔ "딸") */
const PEOPLE = {
  친구: [], 가족: [], 이웃: [], 동료: [], 친척: [], 형제: [], 자매: [], 부모님: [],
  손주: ['손자', '손녀'], 손자: ['손주'], 손녀: ['손주'],
  따님: ['딸'], 아드님: ['아들'], 며느리: [], 사위: [],
  남편: ['영감', '신랑', '바깥양반'], 부인: ['아내', '집사람', '마누라'], 아내: ['부인', '집사람', '마누라'],
  어머님: ['어머니', '엄마'], 아버님: ['아버지', '아빠'],
};
const PEOPLE_RE = new RegExp(`(${Object.keys(PEOPLE).join('|')})`, 'g');

export function dropGuessedPeople(text, userSaid = '', fallback) {
  const said = String(userSaid);
  return keepSentences(text, (s) => {
    if (hasQuestion(s) || !GUESS.test(s)) return true;
    const who = [...s.matchAll(PEOPLE_RE)].map((m) => m[1]);
    return who.every((w) => [w, ...PEOPLE[w]].some((n) => said.includes(n)));
  }, fallback);
}

/* 남는 말이 없을 때 쓰는 짧은 맞장구 — 바로 앞에서 한 말과 겹치지 않게 고른다 */
const PLAIN = ['그러셨군요.', '아, 그러셨어요.', '네, 그렇군요.'];

/* 앞에서 한 말을 그대로 되풀이한 문장 — "따님과 함께 가셨던 바다였군요." 를 두 차례 잇달아 (실제 답).
   짧은 맞장구("그러셨군요.")는 되풀이해도 어색하지 않아 둔다. */
export function dropRepeatedSentences(text, history = [], fallback) {
  const bare = (t) => String(t).replace(/[\s.?!,~…'"“”？]/g, '');
  const before = textsOf(history).filter((m) => m.role === 'assistant').map((m) => bare(m.content)).join('|');
  return keepSentences(text, (s) => bare(s).length < 8 || !before.includes(bare(s)), fallback);
}

export function plainReaction(history = []) {
  const recent = textsOf(history).filter((m) => m.role === 'assistant').slice(-2).map((m) => m.content).join('\n');
  return PLAIN.find((p) => !recent.includes(p)) || PLAIN[0];
}
