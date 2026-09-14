/* =====================================================================
 *  기억 회상 지원의 첫 말
 *
 *  어떤 사진이든 첫 물음은 늘 "이 사진을 보면 어떤 기억이 떠오르세요?" 다.
 *  다만 물음만 불쑥 건네면 사진을 함께 보는 말동무가 아니라 묻는 사람처럼 들린다.
 *  그래서 사진을 살펴본 결과(analysis)가 있으면 보이는 것 한두 가지를 먼저 짚는다.
 *
 *  보이는 모습만 말한다. 누구인지 · 언제인지 · 어디인지(지명)는 어르신이 말씀하실 몫이다.
 *  모델에게 맡기지 않고 정해진 틀로 만든다 — 첫 말부터 짐작이 섞이면 바로잡기 어렵다.
 *  화면(app.js)과 시험(lib/reply.test.mjs)이 함께 쓴다.
 * ===================================================================== */

export const RECALL_QUESTION = '이 사진을 보면 어떤 기억이 떠오르세요?';

/** 끝 글자에 받침이 있는가 (한글이 아니면 없는 것으로 본다) */
function hasBatchim(word) {
  const code = String(word).trim().slice(-1).charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0;
}
const withRang = (w) => `${w}${hasBatchim(w) ? '이랑' : '랑'}`;
const withSubject = (w) => `${w}${hasBatchim(w) ? '이' : '가'}`;

/** 사진에 보이는 것을 짚는 한두 문장. 살펴본 결과가 없으면 '' */
export function photoRemark(analysis) {
  if (!analysis || analysis.status !== 'DONE') return '';
  const place = String(analysis.place_label || '').trim();
  const things = (Array.isArray(analysis.objects) ? analysis.objects : [])
    .map((o) => String(o).trim()).filter(Boolean).slice(0, 2);

  const lines = [];
  if (place) lines.push(`${place}에서 찍은 사진이네요.`);
  if (things.length === 2) {
    lines.push(place
      ? `${withRang(things[0])} ${things[1]}도 보이네요.`
      : `사진에 ${withRang(things[0])} ${withSubject(things[1])} 보이네요.`);
  } else if (things.length === 1) {
    lines.push(place ? `${things[0]}도 보이네요.` : `사진에 ${withSubject(things[0])} 보이네요.`);
  }
  if (!lines.length && Number(analysis.people_count) >= 2) lines.push('여러 분이 함께 계신 사진이네요.');
  return lines.join(' ');
}

/** 첫 말 — 보이는 것을 짚고, 늘 같은 첫 물음으로 연다 */
export function openingLine(analysis) {
  const remark = photoRemark(analysis);
  return remark ? `${remark} ${RECALL_QUESTION}` : RECALL_QUESTION;
}
