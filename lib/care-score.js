/* =====================================================================
 *  돌봄 기록에서 뽑아내는 것들 — 기분 합치기 · 동기부여 지수 · 추이 · 신호
 *
 *  숫자를 어르신께 들이밀자는 것이 아니다. 두 가지에 쓴다.
 *  1) 초롱이가 오늘 어떻게 대할지 (지쳐 계시면 독려 대신 공감, 며칠째 같은 데가
 *     아프시면 병원을 권함)
 *  2) 보호자가 한눈에 살펴보는 화면
 *
 *  인수인계 문서(score_system · health_predictor)의 계산을 초롱이에 맞게 옮겼다.
 *  거기서는 운동 시간(분)이 기준이었지만, 초롱이에는 운동 기록이 없고 어르신이
 *  스스로 정하신 목표를 실천하셨는지가 있다. 그래서 '운동 달성' 자리에
 *  '목표 실천' 을 넣었다. 감정에 가장 큰 몫(사십 점)을 두는 것은 그대로다.
 *  논문의 결론이 "운동량보다 마음가짐" 이었기 때문이다.
 * ===================================================================== */

import { localDate, localTime, daysAgo, PAIN_SEE_DOCTOR } from './care-records.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 그 주의 월요일 */
export function weekStart(date = localDate()) {
  const [y, m, d] = String(date).split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = (new Date(t).getUTCDay() + 6) % 7;   // 월요일 0
  return new Date(t - dow * 86400000).toISOString().slice(0, 10);
}

/** 날짜 목록 (오래된 것부터) */
export function dateRange(days, today = localDate()) {
  return Array.from({ length: days }, (_, i) => daysAgo(days - 1 - i, today));
}

/* ------------------------------------------------------------------ *
 * 기분 합치기 (Fusion)
 *
 * 어르신이 버튼으로 고르신 기분과, 대화에서 말씀하신 낱말로 읽은 기분을 합친다.
 * 직접 고르신 쪽을 더 믿는다(1.0 대 0.7). 둘이 많이 어긋나면 — 웃으며 "좋아요"
 * 를 고르셨는데 이야기는 속상하다고 하시면 — 어르신 쪽을 따르되 표시해 두고,
 * 초롱이가 다그치지 않고 한 번 더 여쭙는다.
 * ------------------------------------------------------------------ */

export const MOOD_GAP = 0.6;

export function fuseMood(user, talk) {
  if (!user && !talk) return null;
  if (user && talk) {
    const gap = Math.abs(user.score - talk.score) > MOOD_GAP;
    const blended = (user.score * 1.0 + talk.score * 0.7) / 1.7;
    return {
      score: Number((gap ? user.score : blended).toFixed(2)),
      user_score: user.score,
      talk_score: talk.score,
      disagreement: gap,
      dominant: gap ? 'user' : 'both',
    };
  }
  const only = user || talk;
  return {
    score: only.score,
    user_score: user ? user.score : null,
    talk_score: talk ? talk.score : null,
    disagreement: false,
    dominant: user ? 'user' : 'talk',
  };
}

/**
 * 어긋났을 때 초롱이에게 건네는 안내.
 * 캐묻지 않고 자연스럽게 한 번 더 여쭙게 한다.
 */
export function moodGapRule(mood) {
  if (!mood || !mood.disagreement) return '';
  const chose = mood.user_score > mood.talk_score ? '좋다고' : '안 좋다고';
  const talk = mood.user_score > mood.talk_score ? '힘드신 이야기' : '밝은 이야기';
  return [
    `- 어르신은 오늘 기분을 ${chose} 고르셨는데, 말씀은 ${talk}처럼 들립니다.`,
    '- 다그치지 말고 이야기 흐름에 맞을 때 한 번만 부드럽게 여쭙습니다.',
    '  ("아까 기분이 괜찮다고 하셨는데, 지금은 어떠세요?" 처럼)',
    '- 어느 쪽이 맞다고 따지지 않습니다. 어르신 말씀을 그대로 받아 드립니다.',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * 동기부여 지수 — 변화 의지 30 · 기분 40 · 실천 30
 * ------------------------------------------------------------------ */

export function motivation(care, { today = localDate() } = {}) {
  const from = weekStart(today);
  const days = Object.entries(care?.days || {}).filter(([d]) => d >= from && d <= today);

  /* 변화 의지 — 이번 주에 스스로 정하신 목표 (하나당 열다섯 점, 서른 점까지) */
  const newGoals = (care?.goals || []).filter((g) => g.date >= from && g.date <= today).length;
  const will = Math.min(30, newGoals * 15);

  /* 기분 — 이번 주 기록 가운데 좋다고 하신 비율 */
  const scores = days.map(([, day]) => day.mood?.score).filter((s) => typeof s === 'number');
  const positive = scores.filter((s) => s > 0).length;
  const mood = scores.length ? Math.round((positive / scores.length) * 40) : 0;

  /* 실천 — 목표를 하셨다고 기록하신 날 (하루당 열 점, 서른 점까지) */
  const doneDays = new Set();
  for (const g of care?.goals || []) {
    for (const d of g.achieved_dates || []) if (d >= from && d <= today) doneDays.add(d);
  }
  const action = Math.min(30, doneDays.size * 10);

  const score = will + mood + action;
  const level = score >= 70 ? '높음' : score >= 40 ? '보통' : '낮음';
  return {
    score,
    level,
    breakdown: { will, mood, action },
    week_start: from,
    goals_this_week: newGoals,
    done_days: doneDays.size,
  };
}

/** 동기부여 지수를 대화에 건넬 때 — 숫자를 어르신께 말하지 않는다 */
export function motivationRule(m) {
  if (!m || m.score <= 0) return '';
  return [
    `- 이번 주 사용자의 기운은 '${m.level}' 쪽입니다. (참고용 — 점수나 등급을 말하지 마십시오)`,
    m.level === '낮음'
      ? '- 이번 주가 힘드셨습니다. 목표를 재촉하지 말고 공감과 응원만 해 주십시오.'
      : '- 잘 지내고 계십니다. 하고 계신 것을 구체적으로 짚어 칭찬해 주십시오.',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * 기분 추이 — 보호자 화면의 막대
 * ------------------------------------------------------------------ */

export function moodTrend(care, { days = 14, today = localDate() } = {}) {
  return dateRange(days, today).map((date) => {
    const day = care?.days?.[date];
    const score = typeof day?.mood?.score === 'number' ? day.mood.score : null;
    return { date, score, disagreement: Boolean(day?.mood?.disagreement) };
  });
}

/* ------------------------------------------------------------------ *
 * 살펴야 할 신호들
 * ------------------------------------------------------------------ */

/**
 * 같은 데가 며칠째 아프신가 (사흘 연속이면 병원을 권한다).
 * 아주 아프다고 하신 날이 있으면 그것도 함께 알린다.
 */
export function repeatedSymptom(care, { today = localDate(), need = 3 } = {}) {
  const counts = new Map();
  for (const date of dateRange(need, today)) {
    const parts = new Set((care?.days?.[date]?.pains || []).map((p) => p.part));
    for (const part of parts) counts.set(part, (counts.get(part) || 0) + 1);
  }
  for (const [part, n] of counts) {
    if (n >= need) {
      const worst = Math.max(0, ...dateRange(need, today)
        .flatMap((d) => (care?.days?.[d]?.pains || []).filter((p) => p.part === part).map((p) => p.score)));
      return { part, days: n, worst, severe: worst >= PAIN_SEE_DOCTOR };
    }
  }
  return null;
}

/** 최근 이레 동안 약을 얼마나 거르셨는가 (스케줄을 등록하셨을 때만) */
export function medicationGap(care, { today = localDate(), days = 7 } = {}) {
  const active = (care?.medications || []).filter((m) => m.active);
  if (active.length === 0) return null;
  const dates = dateRange(days, today);
  let taken = 0;
  for (const date of dates) {
    const names = new Set((care?.days?.[date]?.medications || []).map((m) => m.name));
    if (active.every((m) => names.has(m.name))) taken += 1;
  }
  const missed = dates.length - taken;
  return { days: dates.length, taken, missed, rate: Math.round((missed / dates.length) * 100) };
}

/** 지금 드실 때가 된 약 (아직 오늘 기록이 없는 것) */
export function dueMedications(care, { today = localDate(), now = localTime() } = {}) {
  const takenNames = new Set((care?.days?.[today]?.medications || []).map((m) => m.name));
  return (care?.medications || [])
    .filter((m) => m.active && !takenNames.has(m.name))
    .filter((m) => m.times.some((t) => t <= now))
    .map((m) => ({ name: m.name, times: m.times }));
}

/**
 * 지치셨는지 살핀다 (인수인계의 번아웃 예측).
 * 높으면 오늘은 목표 이야기를 꺼내지 않고 공감만 한다.
 */
export function burnout(care, { today = localDate() } = {}) {
  const signals = [];
  let score = 0;

  const week = dateRange(7, today).map((d) => care?.days?.[d]?.mood?.score)
    .filter((s) => typeof s === 'number');
  const low = week.filter((s) => s < 0).length;
  if (low >= 4) { signals.push('요 며칠 기분이 계속 좋지 않으셨어요'); score += 35; }
  else if (low >= 2) { signals.push('기분이 안 좋다고 하신 날이 늘었어요'); score += 15; }

  const goalDays = (from, to) => {
    const set = new Set();
    for (const g of care?.goals || []) {
      for (const d of g.achieved_dates || []) if (d >= from && d <= to) set.add(d);
    }
    return set.size;
  };
  const thisWeek = goalDays(daysAgo(6, today), today);
  const lastWeek = goalDays(daysAgo(13, today), daysAgo(7, today));
  if (lastWeek > 0 && thisWeek === 0) { signals.push('하시던 것을 이번 주에는 못 하셨어요'); score += 25; }
  else if (lastWeek >= 2 && thisWeek * 2 <= lastWeek) { signals.push('실천이 지난주보다 줄었어요'); score += 15; }

  const symptom = repeatedSymptom(care, { today });
  /* 며칠째 아프신 데다 아주 아프다고 하셨으면 더 무겁게 본다 */
  if (symptom) {
    signals.push(`${symptom.part}가 사흘째 아프시다고 하셨어요`);
    score += symptom.severe ? 30 : 25;
  }

  const gap = medicationGap(care, { today });
  if (gap && gap.rate >= 30) { signals.push(`최근 이레 중 ${gap.missed}일은 약 기록이 없어요`); score += 15; }

  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { level, score, signals, symptom, medication: gap };
}

/** 지쳐 계실 때 초롱이가 지킬 것 */
export function burnoutRule(b) {
  if (!b || b.level === 'low') return '';
  const lines = ['- 요즘 기운이 없으신 편입니다. (이 사실을 사용자에게 말하지 마십시오)'];
  if (b.level === 'high') {
    lines.push('- 오늘은 목표나 실천을 먼저 꺼내지 마십시오. 공감하고 곁에 있어 드리는 말만 합니다.');
  } else {
    lines.push('- 오늘은 부드럽게, 재촉하지 말고 이야기를 들어 드립니다.');
  }
  if (b.symptom) {
    lines.push(`- ${b.symptom.part}가 며칠째 아프시다고 하셨습니다. 이야기 흐름에 맞을 때 한 번만,`);
    lines.push('  걱정하는 마음으로 병원에 가 보시길 권합니다. 병명은 말하지 않습니다.');
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * 오늘 하루 (보호자 화면 · 마무리 인사)
 * ------------------------------------------------------------------ */

export function todayReport(care, { today = localDate(), now = localTime() } = {}) {
  const day = care?.days?.[today] || null;
  const goals = (care?.goals || []).filter((g) => g.status !== 'done');
  const goal = goals[goals.length - 1] || null;
  const pains = day?.pains || [];
  const worst = pains.length ? Math.max(...pains.map((p) => p.score)) : null;

  return {
    date: today,
    mood: day?.mood || null,
    mood_user: day?.mood_user || null,
    mood_talk: day?.mood_talk || null,
    pains,
    worst_pain: worst,
    see_doctor: typeof worst === 'number' && worst >= PAIN_SEE_DOCTOR,
    medications: day?.medications || [],
    due: dueMedications(care, { today, now }),
    activities: day?.activities || [],
    turns: day?.turns || 0,
    goal: goal
      ? {
        ...goal,
        achieved_today: (goal.achieved_dates || []).includes(today),
        achieved_this_week: (goal.achieved_dates || [])
          .filter((d) => d >= weekStart(today) && d <= today).length,
      }
      : null,
    motivation: motivation(care, { today }),
    burnout: burnout(care, { today }),
  };
}

/**
 * 하루를 한 줄로 남긴다 (모델을 쓰지 못할 때의 대비).
 * 다음에 만났을 때 "어제는 ~하셨죠" 로 말문을 열기 위한 것이라
 * 어르신이 실제로 하신 것만 담는다.
 */
export function factSummary(care, { today = localDate(), topics = [] } = {}) {
  const day = care?.days?.[today];
  if (!day) return null;
  const bits = [];
  if (day.mood_user || day.mood_talk) {
    bits.push(`기분은 '${(day.mood_user || day.mood_talk).label}'라고 하셨어요`);
  }
  if (topics.length) bits.push(`${topics.slice(0, 2).join(', ')} 이야기를 나눴어요`);
  if (day.medications?.length) bits.push('약도 챙겨 드셨어요');
  if (day.pains?.length) bits.push(`${day.pains[day.pains.length - 1].part}가 아프다고 하셨어요`);
  if (day.activities?.length) bits.push('함께 활동도 하셨어요');
  if (bits.length === 0) return null;

  const score = day.mood?.score;
  return {
    date: today,
    line: `${bits.join('. ')}.`,
    mood: typeof score === 'number' ? (score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral') : 'neutral',
    topics: topics.slice(0, 5),
  };
}

/** 어제(또는 가장 가까운 지난날) 요약을 대화에 건넨다 */
export function lastSummary(care, { today = localDate(), within = 7 } = {}) {
  for (let i = 1; i <= within; i++) {
    const date = daysAgo(i, today);
    const s = care?.summaries?.[date];
    if (s && s.line) return { ...s, days_ago: i };
  }
  return null;
}

export function summaryRule(s) {
  if (!s) return '';
  const when = s.days_ago === 1 ? '어제' : `${s.days_ago}일 전`;
  return [
    `- ${when} 어르신과 나눈 이야기 : ${s.line}`,
    '- 이야기 흐름에 맞을 때 한 번만 자연스럽게 떠올려 드립니다. 취조하듯 확인하지 않습니다.',
    '  ("어제 그 이야기 참 좋았어요" 처럼 반갑게)',
  ].join('\n');
}

/** 지금 진행 중인 목표 (아직 구체화 중인 것도 진행 중으로 본다) */
export function activeGoal(care) {
  const list = (care?.goals || []).filter((g) => g.status === 'active' || g.status === 'drafting');
  return list[list.length - 1] || null;
}

/** 어르신이 스스로 정하신 목표를 대화에 건넨다 */
export function goalRule(goal, { today = localDate() } = {}) {
  if (!goal) return '';
  const lines = [`- 사용자가 스스로 정하신 목표 : ${goal.text}`];
  if (goal.status === 'drafting') {
    lines.push('- 아직 언제 · 얼마나 하실지 정하지 않으셨습니다. 이야기 흐름에 맞을 때 하나만 여쭙습니다.');
  } else if ((goal.achieved_dates || []).includes(today)) {
    lines.push('- 오늘은 이미 하셨습니다. 짧게 칭찬해 주십시오. 더 하시라고 하지 않습니다.');
  } else {
    const week = (goal.achieved_dates || []).filter((d) => d >= weekStart(today)).length;
    lines.push(week
      ? `- 이번 주에 ${week}일 하셨습니다. 재촉하지 말고 가볍게만 이야기합니다.`
      : '- 아직 실천 기록이 없습니다. 재촉하지 말고 응원만 해 주십시오.');
  }
  lines.push('- 이 목표는 어르신이 직접 정하신 것입니다. 초롱이가 바꾸거나 대신 정하지 않습니다.');
  return lines.join('\n');
}
