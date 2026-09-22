/* =====================================================================
 *  대화 종료와 정서 추세 — 회상치료 전달 패키지 (기억동행 v2.4)
 *
 *  회상 대화를 마치는 일은 어르신 몫이다. 초롱이가 질문 횟수를 세어
 *  대화를 끊지 않는다. 화면에 늘 떠 있는 [대화 종료] 버튼을 누르시면
 *  정해진 인사를 드리고, 지금 기분을 표정 셋 중 하나로 여쭙는다.
 *
 *  [대화 중 낱말로 기분을 재지 않는 까닭]
 *  "옛날에 물건을 잃어버려서 불안했지" 처럼 지난 일을 말씀하실 때 쓰신
 *  '불안 · 불편' 같은 낱말을 지금 기분으로 읽으면 크게 잘못 본다.
 *  그래서 대화 중 낱말로 재는 일은 하지 않고, 마치신 뒤 직접 고르신
 *  표정 하나만 기록한다. (전달 패키지 2-나 · FAQ Q3)
 * ===================================================================== */

/** 종료 버튼을 누르셨을 때 초롱이가 드리는 정해진 인사. 모델이 바꿔 말하지 않는다 */
export const TERMINATION_UTTERANCE = '네, 오늘 이야기는 여기서 마칠게요. '
  + '저와 이야기 나누시니 지금 기분이 어떠신지 화면의 얼굴 표정을 하나 눌러주세요.';

/** 이 인사 뒤에 화면이 할 일 — 표정 버튼 셋을 띄운다 */
export const TERMINATION_UI_ACTION = 'SHOW_3_EMOTION_BUTTONS';

/** 회기가 어떻게 끝났는지. 초롱이가 끊는 길은 없다 */
export const TERMINATION_TYPES = ['IN_PROGRESS', 'USER_CLICK_END_BUTTON'];

/** 마칠 때 여쭙는 세 가지. 화면 버튼과 DB 점수가 여기서 함께 나온다 */
export const EMOTION_CHOICES = Object.freeze([
  Object.freeze({ rating: 'COMFORTABLE', score: 3, emoji: '😊', label: '편안해요', sub: '좋아요' }),
  Object.freeze({ rating: 'NEUTRAL', score: 2, emoji: '😐', label: '보통이에요', sub: '괜찮아요' }),
  Object.freeze({ rating: 'DISCOMFORT', score: 1, emoji: '😞', label: '피곤해요', sub: '불편해요' }),
]);

export const EMOTION_RATINGS = EMOTION_CHOICES.map((c) => c.rating);
export const EMOTION_SCORES = Object.freeze(
  Object.fromEntries(EMOTION_CHOICES.map((c) => [c.rating, c.score])));

/** 초기 세션으로 볼 회차 수 (전달 패키지: 1~3회차) */
export const EARLY_SESSIONS = 3;

/** 고르신 표정의 점수. 모르는 값이면 null */
export function emotionScore(rating) {
  return Object.prototype.hasOwnProperty.call(EMOTION_SCORES, rating)
    ? EMOTION_SCORES[rating] : null;
}

/** 표정 하나의 꼴 (화면과 보호자 기록에서 같은 낱말을 쓰려고 한 곳에 둔다) */
export function emotionChoice(rating) {
  return EMOTION_CHOICES.find((c) => c.rating === rating) || null;
}

/** 마칠 때 드리는 짧은 대답. 좋아졌다 · 나아졌다 평가하지 않는다 */
export const THANKS = Object.freeze({
  COMFORTABLE: '편안하셨다니 다행이에요. 오늘 이야기 들려주셔서 고맙습니다.',
  NEUTRAL: '오늘 이야기 들려주셔서 고맙습니다. 다음에 또 함께 봐요.',
  DISCOMFORT: '오늘은 좀 피곤하셨군요. 이야기 들려주셔서 고맙습니다. 편히 쉬세요.',
});

const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const round2 = (n) => Number(n.toFixed(2));

/**
 * 정서적 안도감 추세 — 마치실 때 고르신 표정만으로 본다.
 *
 * 치료 효과를 재는 점수가 아니다. 가족과 돌보는 분이 "요즘 어떠신가" 를
 * 가늠하시도록 돕는 것이다. 그래서 고르지 않으신 회기는 세지 않는다.
 *
 * @param {Array<{started_at?: string, ended_at?: string, selected_emotion?: string, emotion_score?: number}>} sessions
 */
export function trendReport(sessions = []) {
  const rated = (Array.isArray(sessions) ? sessions : [])
    .filter((s) => s && EMOTION_RATINGS.includes(s.selected_emotion))
    .sort((a, b) => String(a.started_at || a.ended_at || '')
      .localeCompare(String(b.started_at || b.ended_at || '')));

  const total = rated.length;
  if (total === 0) {
    return {
      total_sessions: 0,
      comfortable_count: 0,
      comfortable_ratio_percent: null,
      early_session_avg_score: null,
      late_session_avg_score: null,
      score_improvement: null,
      executive_summary: '아직 대화를 마치며 기분을 골라 주신 기록이 없어요.',
      recent: [],
    };
  }

  const comfortable = rated.filter((s) => s.selected_emotion === 'COMFORTABLE').length;
  const ratio = (comfortable / total) * 100;
  const scores = rated.map((s) => Number(s.emotion_score) || emotionScore(s.selected_emotion));

  /* 초기 세션(1~3회차)과 그 뒤를 견준다. 회기가 하나뿐이면 견줄 것이 없으니 같은 값을 둔다 */
  const cut = total === 1 ? 1 : Math.min(EARLY_SESSIONS, Math.max(1, Math.floor(total / 2)));
  const early = scores.slice(0, cut);
  const late = total === 1 ? scores.slice(0) : scores.slice(cut);

  const avgEarly = round2(avg(early));
  const avgLate = round2(avg(late));
  const diff = round2(avgLate - avgEarly);

  /* 0.05점 안쪽의 움직임은 올랐다 내렸다 하지 않고 '비슷하다' 고 적는다 */
  const change = diff >= 0.05
    ? `${avgEarly.toFixed(2)}점에서 ${avgLate.toFixed(2)}점으로 올라, 마치실 때 마음이 한결 편해지신 편입니다.`
    : diff <= -0.05
      ? `${avgEarly.toFixed(2)}점에서 ${avgLate.toFixed(2)}점으로 내려갔습니다. 요즘 어떠신지 한번 살펴 주세요.`
      : `${avgEarly.toFixed(2)}점에서 ${avgLate.toFixed(2)}점으로 비슷하게 이어지고 있습니다.`;

  return {
    total_sessions: total,
    comfortable_count: comfortable,
    comfortable_ratio_percent: round2(ratio),
    early_session_avg_score: avgEarly,
    late_session_avg_score: avgLate,
    score_improvement: diff,
    executive_summary: `최근 ${total}회차 회상 대화 가운데 ${ratio.toFixed(1)}%에서 `
      + `'편안해요'를 고르셨습니다. 대화 초기 대비 후기 세션의 정서적 안정 점수가 ${change}`,
    /* 화면에 막대로 보여 드릴 최근 열 회 (오래된 것부터) */
    recent: rated.slice(-10).map((s) => ({
      at: s.ended_at || s.started_at || '',
      rating: s.selected_emotion,
      score: Number(s.emotion_score) || emotionScore(s.selected_emotion),
      emoji: (emotionChoice(s.selected_emotion) || {}).emoji || '',
    })),
  };
}
