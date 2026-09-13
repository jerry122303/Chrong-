/* =====================================================================
 *  사진 추천 점수 — 회상 대화를 열 때 어느 사진부터 보여 드릴지
 *
 *  별점 하나로 정하지 않는다. 소중한 사진이라도 이야기의 실마리가 없으면
 *  말문이 잘 트이지 않고, 같은 사진이 되풀이되면 금세 지루해지신다.
 *  그래서 아래 항목을 모두 더한다.
 *
 *    ① 어르신이 고르신 중요도          ★ +10 · ★★ +20 · ★★★ +30
 *    ② 회상 단서가 풍부한가             사람 · 사물 · 장소 · 활동이 많을수록 (최대 +20)
 *    ③ 사람이 있는가                    +15
 *    ④ 무엇을 하는 장면인가             +15
 *    ⑤ 어디인지 알 수 있는가            +10
 *    ⑥ 열 살에서 서른 살 무렵의 사진    +10   가장 또렷하게 떠오르는 시기
 *    ⑦ 최근 세 번 동안 안 나온 사진     +10
 *    ⑧ 최근 세 번 중 두 번 이상 나옴    −20
 *    ⑨ 이야기하고 싶지 않다 · 힘들어하심 · 감춤 → 추천에서 뺀다
 *
 *  ②~⑤ 는 사진을 올릴 때 모델이 한 번 살펴본 결과(analysis)로 매긴다.
 *  숫자는 이 파일 맨 위에만 둔다. 팀에서 조정할 때 여기만 고치면 된다.
 *  이 파일은 계산만 한다. 저장소나 네트워크에 기대지 않아 시험하기 쉽다.
 * ===================================================================== */

export const WEIGHTS = Object.freeze({
  importance: Object.freeze({ 1: 10, 2: 20, 3: 30 }),   // ①
  cues: 20,        // ② 최대
  people: 15,      // ③
  activity: 15,    // ④
  place: 10,       // ⑤
  bump: 10,        // ⑥
  fresh: 10,       // ⑦
  repeated: -20,   // ⑧
});

/** ② — 단서가 이만큼이면 만점. 표의 예시(가족 + 음식 + 바다 + 테이블)가 여기에 닿는다 */
export const CUE_FULL = 6;
/** ② — 한 종류가 단서를 독차지하지 않게. 사람 열 명이 단서 열 개는 아니다 */
export const CUE_CAP = Object.freeze({ people: 3, objects: 4 });
/** ⑦⑧ — 최근 몇 번의 회기를 볼지 */
export const RECENT_SESSIONS = 3;
/** ⑧ — 최근 회기 중 몇 번 나오면 되풀이로 볼지 */
export const REPEAT_AT = 2;
/** ⑥ — 회상 절정기 (나이) */
export const BUMP_AGE = Object.freeze([10, 30]);

const STAR_NAME = { 1: '평범한 사진', 2: '소중한 사진', 3: '매우 소중한 사진' };

const PLACE_NAME = {
  home: '집', village: '마을', school: '학교', workplace: '일터', farm: '논밭',
  market: '시장', religious: '절 · 교회', restaurant: '식당', event_hall: '잔치 자리',
  travel: '여행지', nature: '산 · 바다', park: '공원', street: '거리', studio: '사진관',
};
/** 장소 맥락이 없다고 보는 곳. 사진관 배경은 이야기의 실마리가 되지 않는다 */
const NO_PLACE = new Set(['studio', 'unknown']);

const ACTIVITY_NAME = {
  meal: '식사', celebration: '잔치', wedding: '결혼식', graduation: '졸업 · 입학',
  holiday: '명절', travel: '나들이', work: '일하는 모습', sports: '운동',
  school_life: '학교생활', military: '군 생활', religious_event: '예배 · 불공',
  family_daily: '가족 일상', leisure: '놀이 · 모임', other: '활동',
};

/** 옛 즐겨찾기(favorite)는 중요도를 고르기 전의 기록이라 ★★ 로 본다 */
export const importanceOf = (m) => m.importance ?? (m.favorite ? 2 : null);

/**
 * 찍은 해를 어디서 알았는지까지 함께 돌려준다.
 * 1) 사람이 직접 적은 해  2) 사진 파일의 날짜  3) 모델이 사진을 보고 짐작한 시기
 *
 * 인화된 옛 사진을 휴대폰으로 다시 찍으면 파일 날짜는 '오늘' 이 된다.
 * 모델이 다시 찍은 사진으로 보았다면 파일 날짜를 믿지 않는다.
 */
export function capturedYears(m) {
  if (m.taken_year) return { from: m.taken_year, to: m.taken_year, source: 'USER' };

  const a = m.analysis?.status === 'DONE' ? m.analysis : null;
  const fileYear = Number(String(m.meta?.taken_at || '').slice(0, 4)) || null;
  if (fileYear && !a?.is_reproduction) return { from: fileYear, to: fileYear, source: 'EXIF' };

  const era = a && /^(\d{4})s$/.exec(a.era_estimate || '');
  if (era) return { from: Number(era[1]), to: Number(era[1]) + 9, source: 'MODEL' };
  return null;
}

/** 최근 사용 기록에서 보는 몫. recent 는 최근 회기의 memory_id 를 최신순으로 */
function recentUses(m, recent) {
  const window = Array.isArray(recent) ? recent.slice(0, RECENT_SESSIONS) : [];
  return { window: window.length, uses: window.filter((id) => id === m.memory_id).length };
}

/**
 * 사진 한 장의 점수.
 *
 * @param {object} m      기억 (lib/records.js makeMemory 의 모양)
 * @param {object} ctx
 * @param {number} [ctx.birthYear]  어르신이 태어나신 해 (⑥)
 * @param {string[]} [ctx.recent]   최근 회기의 memory_id, 최신순 (⑦⑧)
 * @returns {{ total:number, excluded:boolean, excludeReason:string,
 *             parts: {key:string, no:string, label:string, points:number, reason:string}[] }}
 */
export function scorePhoto(m, ctx = {}) {
  const parts = [];
  const add = (key, no, label, points, reason) => parts.push({ key, no, label, points, reason });

  /* ⑨ 추천 제외 — 점수를 깎는 게 아니라 아예 뺀다. 지우지는 않는다. */
  const excludeReason =
    m.avoid ? '이 사진으로는 이야기하고 싶지 않다고 하셨습니다'
      : m.distress_flag ? '대화하시다 힘들어하셨습니다'
        : m.hidden ? '보호자가 감춰 두었습니다'
          : m.verification_status === 'UNVERIFIED' ? '아직 확인되지 않은 기억입니다'
            : '';

  /* ① 중요도 */
  const stars = importanceOf(m);
  add('importance', '①', '중요도', stars ? WEIGHTS.importance[stars] : 0,
    stars ? `${'★'.repeat(stars)} ${STAR_NAME[stars]}` : '아직 고르지 않으셨습니다');

  /* ②~⑤ 모델이 살펴본 결과 */
  const a = m.analysis;
  const waiting = !m.photo?.file ? '사진이 없습니다'
    : !a ? '아직 살펴보지 않았습니다'
      : a.status === 'PENDING' ? '살펴보는 중입니다'
        : a.status === 'FAILED' ? '살펴보지 못했습니다'
          : a.status === 'SKIPPED' ? '사진 살펴보기를 꺼 두었습니다'
            : '';

  if (waiting) {
    add('cues', '②', '회상 단서', 0, waiting);
    add('people', '③', '사람', 0, waiting);
    add('activity', '④', '사건 · 활동', 0, waiting);
    add('place', '⑤', '장소', 0, waiting);
  } else {
    const hasPlace = !NO_PLACE.has(a.place_type);
    const hasActivity = a.activity !== 'none';
    const people = Math.min(a.people_count, CUE_CAP.people);
    const objects = Math.min(a.objects.length, CUE_CAP.objects);
    const cues = people + objects + (hasPlace ? 1 : 0) + (hasActivity ? 1 : 0);

    // 많을수록 오르되 CUE_FULL 에서 멈춘다
    const cuePoints = Math.round(WEIGHTS.cues * Math.min(cues, CUE_FULL) / CUE_FULL);
    const seen = [
      a.people_count ? `사람 ${a.people_count}` : '',
      ...a.objects.slice(0, CUE_CAP.objects),
    ].filter(Boolean);
    add('cues', '②', '회상 단서', cuePoints,
      cues ? `단서 ${cues}개 (${seen.join(', ') || '장소 · 활동'})` : '이야기의 실마리가 보이지 않습니다');

    add('people', '③', '사람', a.people_count > 0 ? WEIGHTS.people : 0,
      a.people_count > 0 ? `${a.people_count}명` : '사람이 없습니다');

    add('activity', '④', '사건 · 활동', hasActivity ? WEIGHTS.activity : 0,
      hasActivity ? (a.activity_label || ACTIVITY_NAME[a.activity]) : '특별한 활동이 보이지 않습니다');

    add('place', '⑤', '장소', hasPlace ? WEIGHTS.place : 0,
      hasPlace ? (a.place_label || PLACE_NAME[a.place_type]) : '어디인지 알기 어렵습니다');
  }

  /* ⑥ 회상 절정기 */
  const years = capturedYears(m);
  const birth = Number(ctx.birthYear) || null;
  if (!years) {
    add('bump', '⑥', '회상 절정기', 0, '찍은 때를 알 수 없습니다');
  } else {
    const from = { USER: '직접 적으신 해', EXIF: '사진 파일의 날짜', MODEL: '사진을 보고 짐작' }[years.source];
    const when = years.from === years.to ? `${years.from}년` : `${years.from}년대`;
    if (!birth) {
      add('bump', '⑥', '회상 절정기', 0, `${when} · 태어나신 해를 알면 계산합니다`);
    } else {
      const lo = years.from - birth;
      const hi = years.to - birth;
      const age = lo === hi ? `${lo}세` : `${lo}~${hi}세`;
      // 시기가 십 년 단위로만 짐작될 때는 그 범위가 절정기와 겹치면 된다
      const inBump = hi >= BUMP_AGE[0] && lo <= BUMP_AGE[1];
      add('bump', '⑥', '회상 절정기', inBump ? WEIGHTS.bump : 0,
        hi < 0 ? `${when} · 태어나시기 전 사진 (${from})` : `${when} · ${age} 무렵 (${from})`);
    }
  }

  /* ⑦⑧ 최근 사용 */
  const { window, uses } = recentUses(m, ctx.recent);
  if (uses >= REPEAT_AT) {
    add('recent', '⑧', '최근 사용', WEIGHTS.repeated, `최근 ${window}번 중 ${uses}번 나왔습니다`);
  } else if (uses === 0) {
    add('recent', '⑦', '최근 사용', WEIGHTS.fresh,
      window ? `최근 ${window}번 동안 나오지 않았습니다` : '아직 이야기에 쓰지 않았습니다');
  } else {
    add('recent', '⑦', '최근 사용', 0, `최근 ${window}번 중 한 번 나왔습니다`);
  }

  const total = parts.reduce((sum, p) => sum + p.points, 0);
  return { total, excluded: Boolean(excludeReason), excludeReason, parts };
}

/** ⑧ 에 걸린 사진인가 */
export const isRepeated = (score) =>
  score.parts.some((p) => p.key === 'recent' && p.points < 0);

function byRecommendation(a, b) {
  if (a.score.excluded !== b.score.excluded) return a.score.excluded ? 1 : -1;
  if (a.score.total !== b.score.total) return b.score.total - a.score.total;
  // 점수가 같으면 오래 쓰지 않은 것부터 (한 번도 안 쓴 것이 맨 앞)
  const ua = String(a.memory.last_used_at || '');
  const ub = String(b.memory.last_used_at || '');
  if (ua !== ub) return ua.localeCompare(ub);
  // 그래도 같으면 새로 올리신 것부터
  return String(b.memory.created_at || '').localeCompare(String(a.memory.created_at || ''));
}

/**
 * 어르신 개인의 기억(이야깃거리 THEME 제외)을 추천 순서로 줄 세운다.
 * 추천에서 뺀 것도 맨 뒤에 함께 돌려준다. 보호자가 왜 빠졌는지 볼 수 있어야 한다.
 */
export function rankPhotos(memories, ctx = {}) {
  return memories
    .filter((m) => m.kind !== 'THEME')
    .map((memory) => ({ memory, score: scorePhoto(memory, ctx) }))
    .sort(byRecommendation);
}

/** 보호자 화면에 보여 줄 점수표. 숫자는 위의 WEIGHTS 에서 그대로 가져와 어긋나지 않는다 */
export const SCORE_RULES = Object.freeze([
  ['①', '어르신이 고르신 중요도',
    `★ +${WEIGHTS.importance[1]} · ★★ +${WEIGHTS.importance[2]} · ★★★ +${WEIGHTS.importance[3]}`],
  ['②', '회상 단서 — 사람 · 사물 · 장소 · 활동이 많을수록', `최대 +${WEIGHTS.cues}`],
  ['③', '사람이 있는 사진', `+${WEIGHTS.people}`],
  ['④', '무엇을 하는 장면인지 보이는 사진', `+${WEIGHTS.activity}`],
  ['⑤', '어디인지 알 수 있는 사진', `+${WEIGHTS.place}`],
  ['⑥', `${BUMP_AGE[0]}~${BUMP_AGE[1]}세 무렵에 찍은 사진`, `+${WEIGHTS.bump}`],
  ['⑦', `최근 ${RECENT_SESSIONS}번 동안 나오지 않은 사진`, `+${WEIGHTS.fresh}`],
  ['⑧', `최근 ${RECENT_SESSIONS}번 중 ${REPEAT_AT}번 이상 나온 사진`, `${WEIGHTS.repeated}`],
  ['⑨', '이야기하고 싶지 않다 · 힘들어하심 · 감춤', '추천 제외'],
]);
