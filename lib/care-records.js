/* =====================================================================
 *  건강 돌봄 기록의 구조 정의 — 목표 · 기분 · 통증 · 복약 · 인지 활동 · 하루 요약
 *
 *  회상 기억(MEMORY)과는 성격이 다르다. 기억은 사진 한 장에 하나씩 오래 남지만,
 *  돌봄 기록은 '어느 하루에 무엇이 있었는지' 라서 날짜로 묶는다.
 *  그래서 어르신 한 분에 파일 하나(lib/care-store.js)로 두고 날짜별로 쌓는다.
 *
 *  바깥 팀 인수인계(healthmax)의 goal_planner · user_input_memory ·
 *  medication_manager · session_memory 를 초롱이 구조로 옮긴 것이다.
 *  거기서는 모듈마다 파일이 따로였지만, 어르신 한 분의 하루를 한눈에 보려면
 *  (오늘 리포트 · 번아웃 신호) 한데 모여 있는 편이 낫다.
 * ===================================================================== */

/** 기분 다섯 단계. 점수는 -1(아주 나쁨) ~ +1(아주 좋음) */
export const MOODS = [
  { key: 'great', label: '아주 좋아요', score: 1 },
  { key: 'good', label: '좋아요', score: 0.5 },
  { key: 'soso', label: '그저 그래요', score: 0 },
  { key: 'bad', label: '안 좋아요', score: -0.5 },
  { key: 'awful', label: '아주 안 좋아요', score: -1 },
];
export const MOOD_KEYS = MOODS.map((m) => m.key);
export const moodOf = (key) => MOODS.find((m) => m.key === key) || null;

/** 어디가 아프신지. 어르신이 버튼으로 고르실 수 있게 몇 가지로 추렸다 */
export const PAIN_PARTS = ['머리', '어깨', '허리', '무릎', '다리', '팔', '배', '가슴', '그 밖'];

/** 얼마나 아프신지. 1~10 눈금은 어르신께 고르시기 어려워 세 단계로 여쭙고 점수로 바꿔 둔다 */
export const PAIN_LEVELS = [
  { key: 'mild', label: '조금 아파요', score: 3 },
  { key: 'moderate', label: '많이 아파요', score: 6 },
  { key: 'severe', label: '아주 많이 아파요', score: 9 },
];
export const painLevelOf = (key) => PAIN_LEVELS.find((p) => p.key === key) || null;
/** 이 점수부터는 병원에 가 보시길 권한다 (인수인계 문서: 8점 이상) */
export const PAIN_SEE_DOCTOR = 8;

/** 인지 활동 네 가지 (회상 · 숫자 · 날짜 · 사진) */
export const ACTIVITY_KINDS = ['recall', 'number', 'date', 'photo'];

/** 목표에서 아직 정해지지 않은 것 */
export const GOAL_PARTS = ['none', 'when', 'where', 'how', 'amount'];

/** 목표 상태 — drafting 은 아직 언제 · 어디서가 정해지지 않은 것 */
export const GOAL_STATUS = ['drafting', 'active', 'done'];

const nowISO = () => new Date().toISOString();
const asText = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const asScore = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/**
 * 오늘 날짜 (어르신이 계신 곳 기준).
 *
 * 서버는 세계 표준시로 도는데(Render), 우리나라 저녁 아홉 시가 표준시로는
 * 아직 낮이라 하루가 어긋난다. 어르신께는 '오늘 약을 드셨는지'가 중요하므로
 * 서울 시각으로 날짜를 만든다.
 */
export const TIME_ZONE = process.env.CARE_TIME_ZONE || 'Asia/Seoul';
export function localDate(at = new Date(), zone = TIME_ZONE) {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return localDate(new Date(), zone);
  // sv-SE 는 'YYYY-MM-DD' 꼴로 찍는다
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(d);
}

/** 지금 시각 '08:30' (복약 시간과 견주는 데 쓴다) */
export function localTime(at = new Date(), zone = TIME_ZONE) {
  const d = at instanceof Date ? at : new Date(at);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(Number.isNaN(d.getTime()) ? new Date() : d);
}

/** 며칠 전 날짜 */
export function daysAgo(n, from = localDate()) {
  const [y, m, d] = String(from).split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) - n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** '08:00' 같은 시각만 받는다 */
export function cleanTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

let seq = 0;
export function newId(prefix) {
  seq = (seq + 1) % 1000;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------------------------------------------ *
 * 목표 — 어르신이 스스로 정하신 것
 *
 * 인수인계 문서(Bloom Goal Setting)의 핵심은 "AI 가 대신 정해 주지 않는다"이다.
 * 그래서 목표 글은 어르신이 하신 말씀에서만 나오고, 모자란 것(언제 · 어디서 ·
 * 어떻게 · 얼마나)은 되물어 어르신이 채우시게 한다.
 * ------------------------------------------------------------------ */
export function makeGoal(input = {}) {
  const at = input.created_at || nowISO();
  const specific = Boolean(input.is_specific);
  return {
    goal_id: input.goal_id || newId('goal'),
    text: asText(input.text, 120),
    is_specific: specific,
    missing_part: oneOf(input.missing_part, GOAL_PARTS, specific ? 'none' : 'when'),
    status: oneOf(input.status, GOAL_STATUS, specific ? 'active' : 'drafting'),
    achieved_dates: Array.isArray(input.achieved_dates)
      ? input.achieved_dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-90)
      : [],
    created_at: at,
    date: input.date || localDate(at),
    updated_at: input.updated_at || at,
  };
}

/** 복약 스케줄 — 약 이름과 드시는 시각 */
export function makeMedication(input = {}) {
  const times = (Array.isArray(input.times) ? input.times : [input.times])
    .map(cleanTime).filter(Boolean);
  return {
    med_id: input.med_id || newId('med'),
    name: asText(input.name, 40),
    times: [...new Set(times)].sort().slice(0, 6),
    active: input.active !== false,
    created_at: input.created_at || nowISO(),
  };
}

/** 하루치 기록 한 칸 */
export function makeDay(input = {}) {
  return {
    /* 어르신이 버튼으로 직접 고르신 기분 (가장 믿는다) */
    mood_user: input.mood_user || null,
    /* 대화에서 읽은 기분. 어르신이 직접 말씀하신 낱말에서만 나온다 */
    mood_talk: input.mood_talk || null,
    /* 둘을 합친 값과 어긋남 표시 */
    mood: input.mood || null,
    pains: Array.isArray(input.pains) ? input.pains.slice(-20) : [],
    medications: Array.isArray(input.medications) ? input.medications.slice(-20) : [],
    activities: Array.isArray(input.activities) ? input.activities.slice(-10) : [],
    /* 목표를 실천하셨다고 기록하신 날인지는 goals 쪽에 남는다. 여기에는 회수만 */
    goal_done: Number(input.goal_done) || 0,
    /* 어르신이 말씀하신 차례 수 (리포트에 쓴다) */
    turns: Number(input.turns) || 0,
  };
}

export function makeMoodEntry(input = {}) {
  const m = moodOf(input.key);
  return {
    key: m ? m.key : oneOf(input.key, MOOD_KEYS, 'soso'),
    label: m ? m.label : asText(input.label, 20),
    score: m ? m.score : (asScore(input.score, -1, 1) ?? 0),
    at: input.at || nowISO(),
  };
}

export function makePain(input = {}) {
  const level = painLevelOf(input.level);
  return {
    part: PAIN_PARTS.includes(input.part) ? input.part : asText(input.part, 20) || '그 밖',
    level: level ? level.key : 'mild',
    score: level ? level.score : (asScore(input.score, 1, 10) ?? 3),
    at: input.at || nowISO(),
  };
}

export function makeActivity(input = {}) {
  return {
    kind: oneOf(input.kind, ACTIVITY_KINDS, 'recall'),
    answered: input.answered !== false,   // '잘 모르겠어요' 여도 하신 것은 하신 것이다
    at: input.at || nowISO(),
  };
}

/**
 * 하루 대화 요약 (인수인계의 session_memory).
 * 다음에 만나면 "어제 그 이야기" 로 말문을 열 수 있게 짧게 남긴다.
 * 이름 · 주소 같은 개인정보는 담지 않는다.
 */
export function makeSummary(input = {}) {
  return {
    date: input.date || localDate(),
    line: asText(input.line, 200),          // 한 줄 요약 — 다음 인사에 쓴다
    mood: oneOf(input.mood, ['positive', 'neutral', 'negative'], 'neutral'),
    topics: (Array.isArray(input.topics) ? input.topics : [])
      .map((t) => asText(t, 30)).filter(Boolean).slice(0, 5),
    at: input.at || nowISO(),
  };
}

/** 어르신 한 분의 돌봄 기록 전체 */
export function makeCare(input = {}) {
  const days = {};
  for (const [date, day] of Object.entries(input.days || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) days[date] = makeDay(day);
  }
  const summaries = {};
  for (const [date, s] of Object.entries(input.summaries || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) summaries[date] = makeSummary({ ...s, date });
  }
  return {
    owner_id: asText(input.owner_id, 64) || 'default',
    goals: (Array.isArray(input.goals) ? input.goals : []).map(makeGoal).slice(-50),
    medications: (Array.isArray(input.medications) ? input.medications : [])
      .map(makeMedication).filter((m) => m.name).slice(0, 20),
    days,
    summaries,
    updated_at: input.updated_at || nowISO(),
  };
}
