/* =====================================================================
 *  회상 대화의 흐름 — 2026-09-16 회의 피드백을 그대로 옮긴 것
 *
 *  피드백의 핵심은 두 갈래로 완전히 나누는 것이다.
 *
 *  A. 기억하신 경우 : 사람 → 장소 → 사건·행동 → 감각 → 감정 → 의미
 *     다만 순서를 기계처럼 지키지 않는다. "딸이랑 제주도 바다에 갔을 때야" 처럼
 *     이미 사람과 장소를 말씀하셨으면 그 둘은 건너뛰고 사건부터 여쭙는다.
 *
 *  B. 기억이 안 나시는 경우 : 사진 속 사람 → 장소 → 사물·행동 → 쉬운 선택형
 *     → 그래도 어려우면 사진을 바꾸거나 마친다.
 *     단서는 사진에서 실제로 보이는 것만 쓰고, 무엇인지 단정하지 않는다.
 *     ("여기는 설악산이네요" 가 아니라 "산과 정상 표지석이 보이네요")
 *
 *  질문이 고갈되면 바로 끊지 않고 고르시게 하고, 마칠 때는 정해진 꼴로 정리해 드린다.
 *  요약에는 실제로 말씀하신 것만 담고, 기억하지 못한 영역을 잘못이라 적지 않는다.
 *
 *  질문 문장은 이미 있는 질문지(lib/recall-questions.js)를 쓴다. 두 곳에 나눠 적으면
 *  어긋난다. 여기서는 '이번에 어느 영역을 여쭐지' 만 정한다.
 * ===================================================================== */

import { QUESTIONS } from './recall-questions.js';

/** 피드백의 여섯 단계 (순서대로) */
export const AREAS = ['person', 'place', 'event', 'sense', 'emotion', 'meaning'];

/** 요약 카드에 적을 이름 */
export const AREA_LABEL = {
  person: '함께한 사람',
  place: '그곳',
  event: '그날 있었던 일',
  sense: '그때의 풍경과 소리',
  emotion: '그때의 마음',
  meaning: '남아 있는 의미',
};

/** 질문지의 여덟 영역을 여섯 단계로 잇는다 */
const AREA_OF_QUESTION = {
  '사람 · 관계': 'person',
  장소: 'place',
  '사건 확장': 'event',
  행동: 'event',
  감각: 'sense',
  감정: 'emotion',
  '개인적 의미': 'meaning',
  '연결 회상': 'meaning',
};

/* 말씀에서 그 영역이 이미 나왔는지 알아보는 무늬.
   사용자가 하신 말씀만 본다 — 초롱이가 한 말은 나온 것이 아니다. */
const SAID = {
  person: /(딸|아들|따님|아드님|엄마|어머니|아버지|아빠|남편|아내|집사람|영감|친구|동생|형|누나|오빠|언니|손주|손자|손녀|며느리|사위|이웃|동료|가족|형제|자매|부모|선생님|사장님|이랑|랑 같이|와 함께|과 함께|하고 같이)/,
  place: /(바다|바닷가|해수욕장|산|계곡|강|천|집|고향|동네|마당|학교|교실|공원|시장|절|교회|성당|병원|식당|가게|회사|공장|논|밭|여관|호텔|온천|제주|부산|서울|강릉|속초|경주|대구|광주|인천|대전|울산|수원|전주|목포|여수|거기|저기|그곳)/,
  event: /(갔|왔|먹었|드셨|놀았|했|하고|찍었|올랐|걸었|타고|탔|구웠|잡았|심었|키웠|만들었|다녔|일했|살았|공부|결혼|잔치|생일|여행|소풍|등산|수영|낚시|산책|모임|졸업|입학)/,
  sense: /(날씨|덥|춥|시원|따뜻|바람|소리|냄새|향기|향이|맛|짜|달|맵|뜨겁|차갑|햇살|햇빛|비가|눈이|파도|풍경|경치)/,
  emotion: /(좋았|즐거|행복|기뻤|기쁘|신났|설레|설렜|슬펐|슬프|속상|서운|아쉬|그리|무서|힘들|편안|뿌듯|재밌|재미있|웃었|울었|고마웠)/,
  meaning: /(소중|특별|잊지|기억에 남|의미|평생|제일 좋아|가장 좋아|다시 가고|그리운|보고 싶)/,
};

const textsOf = (history) => (Array.isArray(history) ? history : [])
  .filter((m) => m && typeof m.content === 'string');
const userSaid = (history) => textsOf(history).filter((m) => m.role === 'user');
const botSaid = (history) => textsOf(history).filter((m) => m.role === 'assistant');

/**
 * 이번 사진 이야기에서 사용자가 이미 말씀하신 영역.
 * 여기 든 영역은 다시 여쭙지 않는다 (피드백 — 이미 말한 정보는 다시 묻지 않음).
 */
export function coveredAreas(history = []) {
  const said = userSaid(history).map((m) => m.content).join('\n');
  return AREAS.filter((area) => SAID[area].test(said));
}

/** 초롱이가 이미 여쭌 영역 (요약에서 '여쭙지 않은 영역' 과 가르는 데 쓴다) */
export function askedAreas(history = []) {
  const asked = botSaid(history).filter((m) => /[?？]/.test(m.content)).map((m) => m.content).join('\n');
  return AREAS.filter((area) => {
    const list = QUESTIONS.filter((q) => AREA_OF_QUESTION[q.area] === area);
    return list.some((q) => asked.includes(q.text.replace(/[?？]$/, '').slice(0, 10)))
      || SAID[area].test(asked);
  });
}

/**
 * 이번에 여쭐 영역.
 * 아직 말씀하지 않으신 영역을 순서대로 본다. 다 나왔으면 null (더 여쭙지 않는다).
 */
export function nextArea(history = []) {
  const covered = new Set(coveredAreas(history));
  const asked = new Set(askedAreas(history));
  return AREAS.find((area) => !covered.has(area) && !asked.has(area))
    || AREAS.find((area) => !covered.has(area))
    || null;
}

/**
 * 그 영역에서 아직 여쭙지 않은 질문들.
 * 조건(질문지의 '언제 사용하면 좋은지')에 맞고, 이번 사진에서 한 번도 안 한 것만.
 */
export function areaQuestions(area, ctx = {}, history = [], { count = 3 } = {}) {
  const asked = botSaid(history).map((m) => m.content).join('\n');
  const bare = (t) => String(t).replace(/[\s.?!,~…'"“”？]/g, '');
  const askedBare = bare(asked);
  return QUESTIONS
    .filter((q) => AREA_OF_QUESTION[q.area] === area)
    .filter((q) => !q.fits || q.fits(ctx))
    .filter((q) => !askedBare.includes(bare(q.text)))
    .slice(0, count);
}

/* ------------------------------------------------------------------ *
 * B. 기억이 안 나신다고 하실 때 — 단서 사다리
 *
 * 사진에서 실제로 보이는 것만 쓴다. 무엇인지는 단정하지 않는다.
 * 한 번에 하나씩, 이미 드린 단서는 다시 드리지 않는다.
 * ------------------------------------------------------------------ */

const COUNT_WORD = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

/** 사진을 살펴본 결과로 만드는 단서 사다리 (사람 → 장소 → 사물 → 선택형) */
export function cueLadder(analysis) {
  if (!analysis || analysis.status !== 'DONE') return [];
  const steps = [];
  const people = Math.max(0, Math.round(Number(analysis.people_count) || 0));
  const place = String(analysis.place_label || '').trim();
  const things = (Array.isArray(analysis.objects) ? analysis.objects : [])
    .map((o) => String(o).trim()).filter(Boolean);
  const doing = String(analysis.activity_label || '').trim();

  if (people >= 2) {
    steps.push({
      step: 'person',
      line: `사진에 ${COUNT_WORD[Math.min(people, 10)] || '여러'} 분이 함께 계시네요. 아는 분이 있으신가요?`,
    });
  } else if (people === 1) {
    steps.push({ step: 'person', line: '사진에 한 분이 보이네요. 이분이 누구인지 떠오르시나요?' });
  }
  if (place) {
    steps.push({ step: 'place', line: `사진에 ${place}처럼 보이는 곳이 있어요. 이곳에 갔던 기억이 나시나요?` });
  }
  if (things.length) {
    steps.push({
      step: 'object',
      line: `사진에 ${things.slice(0, 2).join('과 ')}이 보이네요. 이것을 보면 떠오르는 일이 있으신가요?`,
    });
  }
  if (doing) {
    steps.push({ step: 'object', line: `사진에는 ${doing} 모습처럼 보이는 장면이 있어요. 이런 일을 하셨던 기억이 나시나요?` });
  }
  /* 계속 모르겠다고 하시면 난이도를 한 번 더 낮춘다 (고르기만 하시면 된다).
     사진에서 확인되는 범위 안에서만 만든다 */
  if (people >= 2) {
    steps.push({ step: 'choice', line: '이곳에 혼자 가셨는지, 다른 분과 함께 가셨는지 기억나시나요?' });
  } else if (place) {
    steps.push({ step: 'choice', line: `${place}에서 걷거나 앉아 쉬었던 기억이 있으신가요?` });
  }
  return steps;
}

/** 아직 드리지 않은 단서 하나. 다 드렸으면 null */
export function nextCue(analysis, history = []) {
  const said = botSaid(history).map((m) => m.content).join('\n');
  const bare = (t) => String(t).replace(/[\s.?!,~…'"“”？]/g, '');
  const before = bare(said);
  return cueLadder(analysis).find((c) => !before.includes(bare(c.line))) || null;
}

/** 단서를 다 드렸는데도 기억이 안 나실 때 — 압박하지 않고 고르시게 한다 */
export const CUE_EXHAUSTED =
  '지금 바로 떠오르지 않아도 괜찮아요. 사진을 조금 더 보실지, 다른 사진을 보실지 골라 주세요.';

/** 질문이 고갈됐을 때 — 바로 끝내지 않고 고르시게 한다 (피드백) */
export const QUESTIONS_EXHAUSTED =
  '오늘 이 사진에 대한 이야기를 많이 나눴어요. 다른 사진의 추억도 함께 이야기해 볼까요?';

/* ------------------------------------------------------------------ *
 * 마칠 때 — 오늘 떠올린 기억 정리
 *
 * 형식을 고정한다. 점수를 매기거나 잘했다 못했다 평가하지 않고,
 * 실제로 말씀하신 것만 담는다. 여쭙지 않은 영역은 아예 적지 않는다.
 * ------------------------------------------------------------------ */

export const RECALLED = 'RECALLED';
export const NOT_RECALLED = 'NOT_RECALLED';
export const NOT_ASKED = 'NOT_ASKED';

/* 기억이 잘 안 나신다고 하신 말씀 */
const MISSED = /기억(이|은|도)? ?안 ?나|생각(이|은|도)? ?안 ?나|모르겠|몰라|기억 못|가물가물|글쎄/;

/** 이 물음이 어느 단계를 여쭌 것인가 */
function areaOfAsk(text) {
  const asked = String(text);
  const q = QUESTIONS.find((x) => asked.includes(x.text.replace(/[?？]$/, '').slice(0, 10)));
  if (q) return AREA_OF_QUESTION[q.area] || null;
  return AREAS.find((area) => SAID[area].test(asked)) || null;
}

/**
 * 여쭈었을 때 "기억이 안 난다" 고 하신 단계.
 *
 * 앞서 그 낱말을 한 번 스치듯 말씀하셨더라도, 정작 여쭈었을 때 떠오르지 않는다고
 * 하셨으면 떠올리신 것으로 적지 않는다. 회의 피드백의 요약 예시가 그렇다 —
 * "바다에 갔어" 라고 하셨어도 어디였는지는 끝내 떠오르지 않을 수 있다.
 */
/* 말씀 속에서 무엇이 안 떠오르는지 직접 밝히시는 낱말 —
   "어디였는지는 기억이 안 나" 처럼. 여쭌 물음과 다른 단계를 짚으실 때가 많다 */
const MISS_ABOUT = {
  person: /누구|누가|이름/,
  place: /어디|장소|곳인지/,
  event: /무엇을|뭘\s?했|무슨\s?일|뭐\s?했/,
  sense: /날씨|소리|냄새|맛/,
  emotion: /기분|마음/,
  meaning: /의미|왜/,
};

export function missedAreas(history = []) {
  const list = textsOf(history);
  const out = new Set();
  list.forEach((m, i) => {
    if (m.role !== 'user' || !MISSED.test(m.content)) return;

    /* 먼저 하신 말씀을 그대로 따른다 — "어디였는지는 기억이 안 나" 는 장소다 */
    for (const [area, re] of Object.entries(MISS_ABOUT)) {
      if (re.test(m.content)) out.add(area);
    }

    for (let j = i - 1; j >= 0; j -= 1) {
      if (list[j].role !== 'assistant') continue;
      if (!/[?？]/.test(list[j].content)) break;   // 물음이 아니었으면 어느 단계인지 알 수 없다
      const area = areaOfAsk(list[j].content);
      if (area) out.add(area);
      break;
    }
  });
  return AREAS.filter((a) => out.has(a));
}

/**
 * 그 단계에 대해 하신 말씀 한 조각 (지어내지 않고 그대로 옮긴다).
 * 이미 다른 칸에 옮긴 말씀은 되도록 다시 쓰지 않는다 — 같은 문장이 세 칸에
 * 되풀이되면 정리해 드린 것처럼 보이지 않는다 (실제 대화에서 그랬다).
 */
function saidFor(area, history, used = new Set()) {
  const lines = userSaid(history).map((m) => String(m.content).trim())
    .filter((line) => SAID[area].test(line));
  const hit = lines.find((line) => !used.has(line)) || lines[0];
  if (!hit) return '';
  used.add(hit);
  return hit.length > 40 ? `${hit.slice(0, 40)}…` : hit;
}

/** 받침이 있으면 '은', 없으면 '는' ("의미은" 이라고 적히지 않게) */
function topicParticle(word) {
  const last = String(word).trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? '은' : '는';
}

/**
 * 오늘 떠올린 기억 카드.
 * items 는 화면이 그대로 그린다. 여쭙지 않은 영역(NOT_ASKED)은 빠진다.
 */
export function summaryCard(history = []) {
  const covered = new Set(coveredAreas(history));
  const asked = new Set(askedAreas(history));
  const missed = new Set(missedAreas(history));
  const quoted = new Set();   // 같은 말씀을 여러 칸에 되풀이해 옮기지 않으려고

  const items = AREAS.map((area) => {
    /* 여쭈었을 때 안 떠오른다고 하신 단계가 가장 먼저다 (스치듯 나온 낱말보다 그 말씀을 따른다) */
    const status = missed.has(area) ? NOT_RECALLED
      : covered.has(area) ? RECALLED
        : (asked.has(area) ? NOT_RECALLED : NOT_ASKED);
    return {
      area,
      label: AREA_LABEL[area],
      status,
      said: status === RECALLED ? saidFor(area, history, quoted) : '',
    };
  }).filter((it) => it.status !== NOT_ASKED);

  const lines = items.filter((it) => it.status === RECALLED)
    .map((it) => `${it.label} — ${it.said ? `"${it.said}" 라고 이야기해 주셨어요.` : '이야기해 주셨어요.'}`);

  const later = items.filter((it) => it.status === NOT_RECALLED).map((it) => it.label);
  if (later.length) {
    const what = later.join(', ');
    lines.push(`${what}${topicParticle(what)} 이번에 잘 떠오르지 않았어요. 다음에 사진을 다시 보며 천천히 이야기해 봐요.`);
  }

  return {
    items,
    recalled: items.filter((it) => it.status === RECALLED).map((it) => it.area),
    notRecalled: items.filter((it) => it.status === NOT_RECALLED).map((it) => it.area),
    title: '오늘 떠올린 기억',
    lines,
    /* 저장은 사람이 정한다 — 화면이 [추억 저장하기] [저장하지 않기] 를 함께 보여 준다 */
    ask: '오늘 이야기를 추억으로 저장할까요?',
    note: '저장하면 다음 대화에서 오늘 이야기를 이어서 나눌 수 있어요.',
  };
}

/**
 * 지난번에 잘 떠오르지 않았던 영역을 오늘 다시 열 때 건네는 말.
 * "지난번에 기억 못 하셨는데" 처럼 시험하듯 말하지 않는다 (피드백).
 */
export function retryLine(area, analysis) {
  const place = String(analysis?.place_label || '').trim();
  const lines = {
    person: '사진 속 얼굴들을 천천히 한번 볼까요? 떠오르는 분이 있으신가요?',
    place: place
      ? `사진 속 ${place}를 천천히 한번 볼까요? 이곳이 어디였는지 떠오르는 게 있으세요?`
      : '사진 속 배경을 천천히 한번 볼까요? 이곳이 어디였는지 떠오르는 게 있으세요?',
    event: '사진을 다시 보시면, 그날 무엇을 하셨는지 떠오르는 게 있으세요?',
    sense: '그날의 날씨나 소리 가운데 떠오르는 게 있으세요?',
    emotion: '이 사진을 다시 보시니 어떤 마음이 드세요?',
    meaning: '이 사진이 특별하게 느껴지는 까닭이 있으세요?',
  };
  return lines[area] || '';
}
