/* =====================================================================
 *  회상 대화 — 시스템 프롬프트와 대화 상태
 *
 *  대화 규칙은 팀에서 받은 통합 시스템 프롬프트 한 파일이 전부 가지고 있다
 *  (prompts/recall-system.txt — 회상 영역 · 질문 고르기 · 단서 · 종료까지).
 *  코드가 규칙을 따로 들고 있지 않는다. 두 곳에 두면 서로 어긋난다.
 *
 *  코드가 맡는 것은 두 가지뿐이다.
 *  1) 문서 26번 '내부 상태 관리' — 질문 횟수 · 연속 질문 · 사진이 바뀌었는지.
 *     모델이 스스로 센 숫자를 믿지 않고 대화 기록에서 다시 센다.
 *  2) 문서 28번 '최종 출력 점검' 가운데 코드로 지킬 수 있는 것 —
 *     두 문장 · 질문 하나 · 질문 횟수 · 내부 판단을 밖으로 내놓지 않기.
 * ===================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECALL_OPENING, limitQuestions, dropGuessedPeople,
} from './reply-rules.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROMPT_FILE = path.join(HERE, '..', 'prompts', 'recall-system.txt');

/** 사진 한 장에 관한 질문은 다섯 번까지 (문서 10번 · 24번) */
export const QUESTION_LIMIT = 5;
/** 두 번 잇달아 질문으로 끝냈으면 다음 차례에는 묻지 않는다 (문서 11번) */
export const CONSECUTIVE_LIMIT = 2;

/** 그만하겠다고 하시면 이 문장으로 마친다 (문서 19번 · 25번) */
export const STOP_RESPONSE = '네, 오늘 이야기는 여기서 마칠게요. 함께 이야기해 주셔서 감사합니다.';

/** 종료 의사로 보는 말씀 (문서 19번의 여덟 가지와 같은 뜻의 말) */
export const STOP_PATTERNS = [
  '그만할래', '그만할게', '그만 물어봐', '이제 끝내', '대화 끝내', '대화하고 싶지 않아',
  '사진 치워', '이제 됐어', '오늘은 여기까지', '그만 볼래', '그만하자', '그만해요',
  '쉬고 싶어', '끝낼래', '이만 할래', '다른 이야기 하고 싶어',
];

let cached = null;

/** 프롬프트 본문. 한 번 읽어 두고 다시 쓴다 */
export function recallSystemPrompt() {
  if (cached) return cached;
  const text = fs.readFileSync(PROMPT_FILE, 'utf8').trim();
  if (!text) throw new Error(`회상 시스템 프롬프트가 비어 있습니다: ${PROMPT_FILE}`);
  cached = text;
  return cached;
}

/** 시험에서 프롬프트를 바꿔 끼울 때 쓴다 */
export function setRecallSystemPrompt(text) { cached = text ? String(text) : null; }

const asText = (v) => String(v ?? '');
const bare = (v) => asText(v).replace(/[\s.!?,~…'"“”？]/g, '').toLowerCase();

/** 물음표 수 — 문서 10번은 한 응답에 물음표 하나까지만 허락한다 */
export const questionMarks = (v) => (asText(v).match(/[?？]/g) || []).length;

/** 그만하고 싶다는 말씀인가 (문서 19번) */
export function isStopRequest(v) {
  const t = bare(v);
  if (!t) return false;
  return STOP_PATTERNS.some((p) => t.includes(bare(p)));
}

/**
 * 속으로만 판단할 것을 밖으로 내놓았는가 (문서 2번 · 28번 12항).
 * 모델이 이따금 JSON 이나 "분석 결과:" 같은 제목을 붙여 내놓는다.
 */
export function hasInternalOutput(v) {
  const t = asText(v).trim();
  const bad = ['"question_count"', '"next_action"', '"detected_intents"',
    '분석 결과:', '아바타 응답:', '의도 분류', '다음 행동:', '```'];
  return t.startsWith('{') || bad.some((b) => t.includes(b));
}

/**
 * 지금 사진에 대한 대화 상태를 기록에서 다시 센다 (문서 26번).
 *
 * 첫 고정 질문(화면이 드린 "이 사진을 보니 어떤 기억이 떠오르시나요?")부터가
 * 이 사진의 대화다. 사진이 바뀌면 화면이 그 질문을 다시 드리므로 저절로 초기화된다.
 * 그 첫 질문도 이 사진의 첫 번째 질문으로 센다 (문서 5번).
 */
export function recallState(history = []) {
  const msgs = (Array.isArray(history) ? history : [])
    .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role));

  const openedAt = msgs
    .map((m) => m.role === 'assistant' && m.content.includes(RECALL_OPENING))
    .lastIndexOf(true);
  const after = openedAt >= 0 ? msgs.slice(openedAt) : msgs;
  const bot = after.filter((m) => m.role === 'assistant');

  const questionCount = bot.filter((m) => questionMarks(m.content) > 0).length;

  let consecutive = 0;
  for (let i = bot.length - 1; i >= 0; i -= 1) {
    if (questionMarks(bot[i].content) > 0) consecutive += 1;
    else break;
  }

  const finished = bot.some((m) => m.content.includes(STOP_RESPONSE));
  const limitReached = questionCount >= QUESTION_LIMIT;
  const remaining = Math.max(0, QUESTION_LIMIT - questionCount);

  return {
    questionCount,
    consecutive,
    finished,
    opened: openedAt >= 0,
    limitReached,
    remaining,
    /* 마쳤거나 · 다섯 번을 다 했거나 · 두 번 잇달아 물었으면 이번에는 묻지 않는다 */
    mayAsk: !finished && !limitReached && consecutive < CONSECUTIVE_LIMIT,
  };
}

/**
 * 프롬프트 끝에 붙이는 '지금 상태' (문서 26번).
 * 모델이 스스로 센 횟수를 믿지 않고 프로그램이 센 값을 사실로 쓰게 한다.
 */
export function recallRuntime(state, { hasPhoto = true, photoId = '', material = '' } = {}) {
  const lines = ['', '[프로그램이 알려 주는 지금 상태 — 이 값을 사실로 쓰십시오]'];
  lines.push(`- 현재 사진 존재 여부: ${hasPhoto ? '있음' : '없음'}`);
  if (photoId) lines.push(`- 현재 사진의 식별번호: ${photoId}`);
  if (material) lines.push(`- 사진에서 명확하게 관찰되는 것: ${material}`);
  lines.push(`- 해당 사진의 첫 질문 여부: ${state.opened ? '이미 했음' : '아직 안 했음'}`);
  lines.push(`- 전체 질문 횟수: ${state.questionCount}회 (최대 ${QUESTION_LIMIT}회)`);
  lines.push(`- 남은 질문 횟수: ${state.remaining}회`);
  lines.push(`- 연속으로 질문한 응답 횟수: ${state.consecutive}회 (두 번 연속이면 다음은 질문하지 않습니다)`);
  lines.push(`- 질문 제한 도달 여부: ${state.limitReached ? '도달' : '아직'}`);
  lines.push(`- 대화 종료 여부: ${state.finished ? '종료됨' : '진행 중'}`);

  if (state.opened) {
    lines.push(`- 첫 고정 질문("${RECALL_OPENING}")은 화면이 이미 드렸습니다. 다시 하지 마십시오.`);
  }
  if (state.limitReached) {
    lines.push('- 질문 횟수가 다 찼습니다. 문서 24번대로 하십시오 —');
    lines.push('  사용자가 직접 말한 내용을 한 문장으로 정리하고, 잠시 쉬기 · 다음 사진 · 오늘 마치기를');
    lines.push('  고를 수 있다고 안내하십시오. 질문 형태로 묻지 마십시오.');
  } else if (!state.mayAsk) {
    lines.push('- 두 번 잇달아 질문했습니다. 이번 차례에는 질문하지 말고 문서 11번의 구조 B');
    lines.push('  (반영 + 구체적인 이야기 초대)를 쓰십시오.');
  }

  /* 문서 2번은 JSON 을 출력하지 말라고 한다. 그 뜻은 속으로 판단한 것을 사용자에게
     보이지 말라는 것이다. 화면과 목소리를 움직이려면 프로그램은 정해진 칸이 필요하므로,
     말은 reply 한 칸에만 담게 하고 나머지는 화면이 쓰는 값이라고 밝힌다. */
  lines.push('- 출력 형식은 프로그램이 정한 칸(JSON 스키마)을 따릅니다.');
  lines.push('  사용자에게 들려 드릴 말은 reply 한 칸에만 담고, 그 안에 상태나 분석을 적지 마십시오.');
  lines.push('  나머지 칸은 화면과 목소리가 쓰는 값이며 사용자에게 보이지 않습니다.');
  return lines.join('\n');
}

/**
 * 회상 대화 한 차례의 시스템 프롬프트.
 *
 * 통합 프롬프트 본문 + 지금 사진에 대해 확인된 사실 + 프로그램이 센 상태.
 * 이번 차례에 무엇을 여쭐지는 문서가 정한다 (12번 후속 질문 선택 방법).
 */
export function buildRecallPrompt({
  character = null, memory = null, memoryContext = '', history = [], material = '', state = null,
} = {}) {
  const now = state || recallState(history);
  const who = character?.who
    ? `${character.who}\n- 아래 규칙이 말투보다 먼저입니다. 규칙과 어긋나면 규칙을 따릅니다.`
    : '';

  return [
    who,
    recallSystemPrompt(),
    memoryContext,
    recallRuntime(now, {
      hasPhoto: Boolean(memory?.photo?.file),
      photoId: memory?.memory_id || '',
      material,
    }),
  ].filter(Boolean).join('\n\n');
}

const SENTENCES = /[^.!?。！？\n]+[.!?。！？]*\n?/g;

/** 두 문장까지만 남긴다 (문서 3번 8항 · 28번 2항) */
export function limitToTwo(text) {
  const parts = String(text).match(SENTENCES);
  if (!parts || parts.length <= 2) return String(text).trim();
  const first = parts[0].trim();
  const last = parts[parts.length - 1].trim();
  return `${first} ${last}`.trim();
}

/**
 * 문서 28번의 점검 가운데 코드로 지킬 수 있는 것만 지킨다.
 * 나머지(반영의 내용 · 이야기 초대 · 단서 고르기)는 문서가 맡는다.
 */
export function tidyRecallReply(reply, { state = null, userSaid = '', plain = '그러셨군요.' } = {}) {
  const now = state || recallState([]);
  let out = String(reply || '').trim();
  if (!out) return plain;

  out = limitQuestions(out, now.mayAsk);        // 질문은 하나까지, 못 물을 차례면 모두 뺀다
  out = dropGuessedPeople(out, userSaid, plain); // 말씀하지 않은 사람을 지어내지 않는다 (문서 7번)
  out = limitToTwo(out);                         // 최대 두 문장
  return out.trim() || plain;
}

/**
 * 규칙을 대놓고 어긴 답인가. 어겼으면 고쳐 달라고 할 지시문을 돌려준다.
 * 어기지 않았으면 null.
 */
export function hardViolation(text, state) {
  const marks = questionMarks(text);
  if (hasInternalOutput(text)) {
    return 'JSON · 상태 · 분석 · 제목을 출력하지 말고, 아바타가 실제로 할 한국어 대화 문장만 쓰십시오.';
  }
  if (marks > 1) {
    return '질문과 물음표는 하나만 쓰도록 답 전체를 다시 쓰십시오.';
  }
  if (marks > 0 && !state.mayAsk) {
    return state.limitReached
      ? '질문 횟수가 다 찼습니다. 질문 없이 정리하고 쉬기 · 다음 사진 · 마치기를 고르시게 하십시오.'
      : '두 번 잇달아 질문했으므로 이번에는 질문하지 말고 구체적인 이야기 초대로 마무리하십시오.';
  }
  return null;
}

/** 이번 답을 보태고 난 뒤의 상태 (시험과 화면 표시에 쓴다) */
export function afterReply(state, reply) {
  const asked = questionMarks(reply) > 0;
  const questionCount = state.questionCount + (asked ? 1 : 0);
  const consecutive = asked ? state.consecutive + 1 : 0;
  const finished = state.finished || String(reply).includes(STOP_RESPONSE);
  const limitReached = questionCount >= QUESTION_LIMIT;
  return {
    ...state,
    questionCount,
    consecutive,
    finished,
    limitReached,
    remaining: Math.max(0, QUESTION_LIMIT - questionCount),
    mayAsk: !finished && !limitReached && consecutive < CONSECUTIVE_LIMIT,
  };
}
