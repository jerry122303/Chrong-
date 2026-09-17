/* =====================================================================
 *  MEMORY 와 SESSION 의 구조 정의
 *
 *  회상 대화 알고리즘 문서 11번(SAVE_SESSION)에 따라 둘을 갈라 둔다.
 *  - MEMORY  : 사진과 '확인된' 생애정보. 오래 남는다.
 *  - SESSION : 한 회기의 대화 기록. 매번 새로 생긴다.
 *  섞어 두면 중복과 오류가 쌓이고 개인정보 관리가 어려워진다.
 *  SESSION 이 memory_id 로 MEMORY 를 가리킨다 (그 반대가 아니다).
 * ===================================================================== */

/** 검증 상태 — 모델이 지어낸 말이 사실로 굳지 않도록 구분한다 */
export const VERIFICATION = ['UNVERIFIED', 'CAREGIVER_VERIFIED', 'VERIFIED'];

/** 정보의 출처. 충돌해도 지우지 않고 출처별로 남긴다 */
export const SOURCE = ['USER', 'CAREGIVER', 'MODEL'];

/** 대화 관리자가 고르는 반응 (server.js 의 response_mode 와 같은 낱말) */
export const RESPONSE_MODES = [
  'BACKCHANNEL', 'REFLECT_CONTENT', 'VALIDATE_EMOTION',
  'SUMMARIZE', 'FOLLOW_UP', 'OFFER_CUE', 'OFFER_CHOICE', 'SAFETY_FLOW', 'HEALTH_CARE',
];

/** 회기가 어떻게 끝났는지 */
export const ENDED_BY = ['USER', 'TIMEOUT', 'DISTRESS', 'ERROR'];

/** LLM 에 넘겨도 되는 사실 항목. 이 밖의 값은 프롬프트에 넣지 않는다 */
export const MEMORY_FACT_FIELDS = ['title', 'people', 'place', 'when_text', 'description'];

/* ------------------------------------------------------------------ *
 * 사진 분석 — 추천 점수(lib/photo-score.js)의 ②~⑥ 에 쓴다
 *
 * 모델이 사진을 한 번 살펴본 결과다. 확인된 사실이 아니므로 대화 프롬프트에는
 * 넣지 않고 어느 사진부터 보여 드릴지 정하는 데만 쓴다.
 * 낱말 목록은 여기 한 곳에 두고 분석 스키마도 이것을 그대로 쓴다.
 * ------------------------------------------------------------------ */

export const ANALYSIS_STATUS = ['PENDING', 'DONE', 'FAILED', 'SKIPPED'];

/** 어디서 찍은 사진인지. studio(사진관 배경)와 unknown 은 장소 맥락이 없다고 본다 */
export const PLACE_TYPES = [
  'home', 'village', 'school', 'workplace', 'farm', 'market', 'religious',
  'restaurant', 'event_hall', 'travel', 'nature', 'park', 'street', 'studio', 'unknown',
];

/** 무엇을 하는 장면인지. none 은 그냥 서서 찍은 사진 */
export const ACTIVITIES = [
  'none', 'meal', 'celebration', 'wedding', 'graduation', 'holiday', 'travel',
  'work', 'sports', 'school_life', 'military', 'religious_event', 'family_daily',
  'leisure', 'other',
];

/** 언제쯤 찍은 사진으로 보이는지. 찍은 해를 모를 때만 쓴다 */
export const ERAS = [
  '1940s', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s', 'unknown',
];

const nowISO = () => new Date().toISOString();
const asArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
const asText = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

/* ------------------------------------------------------------------ *
 * 지난 회상에서 어느 단계가 떠올랐는지 (대화 수정본 21번)
 *
 * 시험 점수가 아니다. 다음에 같은 사진을 볼 때 어느 쪽을 천천히 다시 볼지
 * 정하는 데만 쓴다. 여쭙지 않은 단계(NOT_ASKED)를 기억하지 못한 것으로 보지 않는다.
 * ------------------------------------------------------------------ */
export const RECALL_AREAS = ['person', 'place', 'event', 'sense', 'emotion', 'meaning'];
export const RECALL_MARKS = ['RECALLED', 'NOT_RECALLED', 'NOT_ASKED'];

export function cleanRecallStatus(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const area of RECALL_AREAS) {
    if (RECALL_MARKS.includes(v[area])) out[area] = v[area];
  }
  return out;
}

/** 1900년부터 올해까지의 해만 받는다 */
export function cleanYear(v) {
  if (v === null || v === undefined || v === '') return null;
  const y = Number(v);
  return Number.isInteger(y) && y >= 1900 && y <= new Date().getFullYear() ? y : null;
}

/**
 * 사진 파일에서 읽은 찍은 날과 위치.
 *
 * 화면이 보내 준 값이라 그대로 믿지 않는다. 날짜는 1900년부터 올해까지만,
 * 위치는 지구 위의 좌표만 받는다. 0,0 은 위치를 못 잡은 기기가 넣는 값이다.
 *
 * 좌표는 소수 넷째 자리(약 11미터)까지만 남긴다. 회상에는 동네를 알면
 * 충분하고, 어르신 댁 위치가 그대로 쌓이지 않게 한다.
 */
/** 찍은 날이 어디서 나왔는가. 파일을 고친 때는 찍은 때가 아닐 수 있다 */
export const DATE_SOURCES = [
  'EXIF_DATETIME_ORIGINAL', 'EXIF_CREATE_DATE', 'EXIF_MODIFY_DATE', 'USER_INPUT',
];
export const DATE_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'];
/** 장소 이름이 어디서 나왔는가 */
export const PLACE_SOURCES = ['EXIF_GPS', 'USER_INPUT'];

/**
 * 이 날짜를 회상 단서로 써도 되는가.
 * 카카오톡으로 받은 사진이나 편집한 사진은 '파일을 고친 때' 가 오늘로 찍혀 있어,
 * 그대로 쓰면 "이 사진은 오늘 찍은 사진이에요" 라고 말하게 된다.
 */
export const trustedDate = (meta) => Boolean(meta?.taken_at) && meta.date_confidence !== 'LOW';

export function cleanMeta(v) {
  const out = {
    taken_at: null, date_source: null, date_confidence: null,
    gps: null, location_name: '', location_source: null,
  };
  if (!v || typeof v !== 'object') return out;

  const d = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(String(v.taken_at || ''));
  if (d) {
    const [y, mo, day, h, mi, se] = d.slice(1).map(Number);
    const ok = y >= 1900 && y <= new Date().getFullYear()
      && mo >= 1 && mo <= 12 && day >= 1 && day <= 31 && h <= 23 && mi <= 59 && se <= 59;
    if (ok) out.taken_at = d[0];
  }

  if (v.gps && typeof v.gps === 'object') {
    const lat = Number(v.gps.lat);
    const lon = Number(v.gps.lon);
    const ok = Number.isFinite(lat) && Number.isFinite(lon)
      && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
    if (ok) out.gps = { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
  }

  /* 날짜가 어디서 나왔는지. 적어 두지 않은 옛 기억은 찍은 때로 본다 (그때는 그것만 읽었다) */
  if (out.taken_at) {
    out.date_source = DATE_SOURCES.includes(v.date_source) ? v.date_source : 'EXIF_DATETIME_ORIGINAL';
    out.date_confidence = DATE_CONFIDENCE.includes(v.date_confidence)
      ? v.date_confidence
      : (out.date_source === 'EXIF_MODIFY_DATE' ? 'LOW' : 'HIGH');
  }

  /* 좌표를 사람이 아는 이름으로 바꾼 것 (lib/geocode.js). 숫자는 보여 드리지 않는다 */
  out.location_name = String(v.location_name ?? '').trim().slice(0, 60);
  if (out.location_name) {
    out.location_source = PLACE_SOURCES.includes(v.location_source)
      ? v.location_source
      : (out.gps ? 'EXIF_GPS' : 'USER_INPUT');
  }
  return out;
}

/**
 * 모델이 사진을 살펴본 결과를 다듬는다.
 * 스키마로 모양은 못박았지만, 수는 음수나 터무니없는 값이 올 수 있고
 * 같은 사물이 두 번 올 수도 있다. 같은 사물이 두 번이면 단서가 늘어난 게 아니다.
 */
export function cleanAnalysis(v) {
  if (!v || typeof v !== 'object') return null;
  const status = ANALYSIS_STATUS.includes(v.status) ? v.status : null;
  if (!status) return null;

  const out = {
    status,
    analyzed_at: typeof v.analyzed_at === 'string' ? v.analyzed_at.slice(0, 40) : null,
    error: status === 'FAILED' ? String(v.error ?? '').trim().slice(0, 200) : '',
  };
  if (status !== 'DONE') return out;

  const n = Math.round(Number(v.people_count));
  out.people_count = Number.isFinite(n) ? Math.min(50, Math.max(0, n)) : 0;

  const seen = new Set();
  out.objects = (Array.isArray(v.objects) ? v.objects : [])
    .map((x) => String(x ?? '').trim().slice(0, 20))
    .filter((x) => x && !seen.has(x) && seen.add(x))
    .slice(0, 8);

  out.place_type = PLACE_TYPES.includes(v.place_type) ? v.place_type : 'unknown';
  out.place_label = String(v.place_label ?? '').trim().slice(0, 30);
  out.activity = ACTIVITIES.includes(v.activity) ? v.activity : 'none';
  out.activity_label = String(v.activity_label ?? '').trim().slice(0, 30);
  out.era_estimate = ERAS.includes(v.era_estimate) ? v.era_estimate : 'unknown';
  out.is_reproduction = v.is_reproduction === true;
  return out;
}

let seq = 0;
/** 사람이 읽을 수 있으면서 겹치지 않는 아이디 */
export function newId(prefix) {
  seq = (seq + 1) % 1000;
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${stamp}${seq.toString(36)}${rand}`;
}

/* ------------------------------------------------------------------ *
 * MEMORY
 * ------------------------------------------------------------------ */

/**
 * 한 건의 주장(claim).
 * 어르신이 말씀하신 것, 보호자가 등록한 것, 모델이 추론한 것을 모두 여기 쌓는다.
 * 값이 서로 어긋나도 지우지 않는다. 어느 쪽이 맞는지는 사람이 정한다.
 */
export function makeClaim(input = {}) {
  return {
    claim_id: input.claim_id || newId('claim'),
    field: oneOf(input.field, MEMORY_FACT_FIELDS, 'description'),
    value: Array.isArray(input.value) ? asArray(input.value) : asText(input.value),
    source: oneOf(input.source, SOURCE, 'MODEL'),
    status: oneOf(input.status, VERIFICATION, 'UNVERIFIED'),
    session_id: input.session_id || null,   // 어느 회기에서 나온 말인지
    created_at: input.created_at || nowISO(),
    decided_at: input.decided_at || null,
  };
}

export function makeMemory(input = {}) {
  const at = nowISO();
  return {
    memory_id: input.memory_id || newId('memory'),
    owner_id: asText(input.owner_id, 64) || 'default',

    /* PHOTO 는 어르신의 실제 사진, THEME 은 사진 없이 나누는 이야깃거리.
       주제는 어르신 개인의 사실이 아니므로 갈라 둔다. 고를 때도 사진을 먼저 본다. */
    kind: input.kind === 'THEME' ? 'THEME' : 'PHOTO',
    theme_key: asText(input.theme_key, 40),
    open_prompt: asText(input.open_prompt, 200),

    // 확인된 내용만 담는 자리. 프롬프트에는 여기서만 꺼내 쓴다.
    title: asText(input.title, 80),
    people: asArray(input.people),
    place: asText(input.place, 80),
    when_text: asText(input.when_text, 80),   // '스무 해쯤 전' 처럼 두루뭉술해도 된다
    description: asText(input.description, 300),

    photo: input.photo ? { file: asText(input.photo.file, 200) } : null,

    verification_status: oneOf(input.verification_status, VERIFICATION, 'UNVERIFIED'),
    // 검증된 항목만 적어 둔다. 프롬프트에 넣을지 여부를 이걸로 가른다.
    verified_fields: (input.verified_fields || []).filter((f) => MEMORY_FACT_FIELDS.includes(f)),

    distress_flag: Boolean(input.distress_flag),   // 불편해하신 사진
    hidden: Boolean(input.hidden),                 // 보호자가 감춘 사진
    favorite: Boolean(input.favorite),

    /* ── 사진 추천 점수에 쓰는 값들 (lib/photo-score.js) ── */
    // 사진을 올릴 때 고르신 중요도. 1 평범한 · 2 소중한 · 3 매우 소중한 · null 아직 안 고름
    importance: [1, 2, 3].includes(Number(input.importance)) ? Number(input.importance) : null,
    // "이 사진으로 이야기하고 싶지 않아요" — 추천에서 뺀다. 지우지는 않는다.
    avoid: Boolean(input.avoid),
    // 보호자나 어르신이 직접 적은 찍은 해. 사진 파일의 날짜보다 믿을 만하다.
    taken_year: cleanYear(input.taken_year),
    // 사진 파일에서 자동으로 읽은 정보 (찍은 날 · 위치)
    meta: cleanMeta(input.meta),
    // 모델이 사진을 살펴본 결과 (사람 수 · 사물 · 장소 · 활동 · 시기)
    analysis: cleanAnalysis(input.analysis),
    /* 지난 회상에서 떠오른 단계와 떠오르지 않은 단계. 다음에 어느 쪽을 다시 볼지에만 쓴다 */
    recall_status: cleanRecallStatus(input.recall_status),

    last_used_at: input.last_used_at || null,
    use_count: Number(input.use_count) || 0,

    claims: Array.isArray(input.claims) ? input.claims.map(makeClaim) : [],

    created_at: input.created_at || at,
    updated_at: at,
  };
}

/**
 * 프롬프트에 넣어도 되는 내용만 추린다.
 * 문서 3번: verified_fields 만 LLM 에 전달한다. 불확실한 값은 확정적으로 말하지 않는다.
 */
export function verifiedFacts(memory) {
  const out = {};
  for (const f of memory.verified_fields) {
    const v = memory[f];
    if (Array.isArray(v) ? v.length : v) out[f] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * SESSION
 * ------------------------------------------------------------------ */

/**
 * 한 차례의 말.
 * 원문 보관 여부는 개인정보 정책에서 정하므로(문서 11번) 끌 수 있게 해 둔다.
 * 원문을 끄더라도 평가 지표에 필요한 것(누가, 어떤 반응, 얼마나 길게)은 남는다.
 */
export function makeTurn(input = {}, keepText = true) {
  return {
    role: input.role === 'user' ? 'user' : 'assistant',
    text: keepText ? asText(input.text, 2000) : '',
    chars: asText(input.text, 2000).length,
    response_mode: input.role === 'user'
      ? null
      : oneOf(input.response_mode, RESPONSE_MODES, null),
    asked_question: Boolean(input.asked_question),
    at: input.at || nowISO(),
  };
}

export function makeSession(input = {}) {
  const at = nowISO();
  return {
    session_id: input.session_id || newId('session'),
    owner_id: asText(input.owner_id, 64) || 'default',
    memory_id: input.memory_id || null,      // 사진 없이 그냥 나눈 대화면 null
    character: asText(input.character, 32) || 'chorong',

    started_at: input.started_at || at,
    ended_at: null,
    elapsed_seconds: 0,

    // 알고리즘이 다음 차례를 정할 때 보는 값들
    asked_questions: asArray(input.asked_questions),
    follow_up_count: Number(input.follow_up_count) || 0,
    last_response_mode: oneOf(input.last_response_mode, RESPONSE_MODES, null),
    user_reported_emotion: asArray(input.user_reported_emotion),

    turns: [],
    summary: '',
    ended_by: null,
    errors: [],

    created_at: at,
    updated_at: at,
  };
}
