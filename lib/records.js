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
  'SUMMARIZE', 'FOLLOW_UP', 'OFFER_CHOICE', 'SAFETY_FLOW',
];

/** 회기가 어떻게 끝났는지 */
export const ENDED_BY = ['USER', 'TIMEOUT', 'DISTRESS', 'ERROR'];

/** LLM 에 넘겨도 되는 사실 항목. 이 밖의 값은 프롬프트에 넣지 않는다 */
export const MEMORY_FACT_FIELDS = ['title', 'people', 'place', 'when_text', 'description'];

const nowISO = () => new Date().toISOString();
const asArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
const asText = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

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
