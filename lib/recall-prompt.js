/* =====================================================================
 *  회상 대화의 시스템 프롬프트와 대화 상태
 *
 *  프롬프트 본문은 팀에서 받은 `prompts/recall-system.txt` 를 그대로 쓴다.
 *  코드 안에 옮겨 적지 않는다 — 옮겨 적으면 팀이 프롬프트를 고칠 때마다
 *  두 곳이 어긋난다. 파일 한 곳만 고치면 되게 둔다.
 *
 *  함께 받은 app.py 는 터미널용 프로토타입이라 대화 상태를 프로그램이 들고
 *  있었다 (질문 횟수 · 연속 질문 횟수 · 종료 여부). 초롱이 서버는 차례마다
 *  화면이 보내 주는 대화 기록으로만 돌아가므로, 그 상태를 기록에서 다시 센다.
 *  같은 규칙을 같은 숫자로 지킨다.
 *
 *  바깥에 기대는 것은 프롬프트 파일 하나뿐이다 (lib/recall.test.mjs 에서 시험한다).
 * ===================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECALL_OPENING } from './reply-rules.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROMPT_FILE = path.join(HERE, '..', 'prompts', 'recall-system.txt');
/* 나중에 받은 수정본. 앞의 규칙과 어긋나면 이쪽을 따른다 */
export const UPDATE_FILE = path.join(HERE, '..', 'prompts', 'recall-update.txt');

/**
 * 사진 한 장에 대한 질문 횟수에는 상한을 두지 않는다.
 *
 * 처음 받은 프롬프트는 다섯 번까지였는데, 수정본에서 "이어질 이야기가 있으면 계속
 * 이어 간다" 로 바뀌었다. 한 번 "모르겠어" 라고 하셨다고 대화가 끝나 버리는 것이
 * 가장 큰 문제였기 때문이다. 횟수는 이제 세어 두기만 하고 막지 않는다.
 */
export const QUESTION_LIMIT = null;
/** 잇달아 물어도 된다 (수정본). 다만 한 번에 하나만 묻는다 */
export const CONSECUTIVE_LIMIT = null;

/** 그만하겠다고 하시면 늘 이 말로 마친다 (수정본 17번) */
export const STOP_RESPONSE = '네, 오늘은 여기까지 이야기할게요. 오늘 들려주신 이야기를 추억으로 저장해둘까요?';

/* app.py 의 STOP_PATTERNS 를 그대로 가져오고, 실제 대화에서 나온 말을 보탰다 */
export const STOP_PATTERNS = [
  '그만할래', '그만할게', '그만 물어봐', '이제 끝내', '대화 끝내', '대화하고 싶지 않아',
  '사진 치워', '이제 됐어', '오늘은 여기까지', '그만 볼래', '그만하자', '그만해요',
  '쉬고 싶어', '끝낼래', '이만 할래',
];

let cached = null;

/**
 * 프롬프트 본문. 한 번 읽어 두고 다시 쓴다.
 * 파일이 없으면 회상 대화를 열 수 없으므로 소리 내어 알린다.
 */
export function recallSystemPrompt() {
  if (cached) return cached;
  const base = fs.readFileSync(PROMPT_FILE, 'utf8').trim();
  if (!base) throw new Error(`회상 시스템 프롬프트가 비어 있습니다: ${PROMPT_FILE}`);

  /* 수정본은 뒤에 붙인다. 뒤에 오는 것이 앞의 규칙을 덮어쓴다고 못박아 둔다 */
  let update = '';
  try {
    update = fs.readFileSync(UPDATE_FILE, 'utf8').trim();
  } catch {
    update = '';   // 수정본이 없어도 기본 규칙으로 돌아간다
  }

  cached = update ? `${base}\n\n${update}` : base;
  return cached;
}

/** 시험에서 프롬프트를 바꿔 끼울 때 쓴다 */
export function setRecallSystemPrompt(text) { cached = text ? String(text) : null; }

const asText = (v) => String(v ?? '');
const bare = (v) => asText(v).replace(/[\s.!?,~…'"“”？]/g, '').toLowerCase();

/** 물음표 수 — 질문을 몇 개 했는지 센다 */
export const questionMarks = (v) => (asText(v).match(/[?？]/g) || []).length;

/** 그만하고 싶다는 말씀인가 (app.py is_explicit_stop) */
export function isStopRequest(v) {
  const t = bare(v);
  if (!t) return false;
  return STOP_PATTERNS.some((p) => t.includes(bare(p)));
}

/**
 * 속으로만 판단할 것을 밖으로 내놓았는가 (app.py has_internal_output).
 * 모델이 이따금 JSON 이나 "분석 결과:" 같은 제목을 붙여 내놓는다.
 */
export function hasInternalOutput(v) {
  const t = asText(v).trim();
  const bad = ['"question_count"', '"next_action"', '"detected_intents"',
    '분석 결과:', '아바타 응답:', '의도 분류', '다음 행동:', '```'];
  return t.startsWith('{') || bad.some((b) => t.includes(b));
}

/**
 * 지금까지의 대화에서 이 사진의 상태를 다시 센다.
 *
 * 첫 고정 질문(화면이 드린 "이 사진을 보면 어떤 기억이 떠오르세요?") 부터가
 * 이 사진의 대화다. 사진이 바뀌면 화면이 그 질문을 다시 드리므로 저절로 초기화된다
 * (system_prompt.txt 26번 — 사진이 바뀌면 질문 횟수와 연속 질문 횟수를 초기화한다).
 */
export function recallState(history = []) {
  const msgs = (Array.isArray(history) ? history : [])
    .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role));

  const openedAt = msgs
    .map((m) => m.role === 'assistant' && m.content.includes(RECALL_OPENING))
    .lastIndexOf(true);
  const after = openedAt >= 0 ? msgs.slice(openedAt) : msgs;
  const bot = after.filter((m) => m.role === 'assistant');

  // 첫 고정 질문도 이 사진의 첫 번째 질문으로 센다 (system_prompt.txt 5번)
  const questionCount = bot.filter((m) => questionMarks(m.content) > 0).length;

  let consecutive = 0;
  for (let i = bot.length - 1; i >= 0; i -= 1) {
    if (questionMarks(bot[i].content) > 0) consecutive += 1;
    else break;
  }

  const finished = bot.some((m) => m.content.includes(STOP_RESPONSE));
  return {
    questionCount,
    consecutive,
    finished,
    opened: openedAt >= 0,
    /* 상한이 없으므로 남은 횟수도 없다. 세어 둔 값은 요약과 기록에만 쓴다 */
    remaining: null,
    /* 그만하겠다고 하신 뒤가 아니면 언제든 여쭐 수 있다 (수정본 — 반영만 하고 끝내지 않는다) */
    mayAsk: !finished,
  };
}

/**
 * 프롬프트 끝에 붙이는 '지금 상태'.
 * app.py 의 runtime_instructions 를 옮긴 것이다. 모델이 스스로 센 횟수를 믿지 않고
 * 프로그램이 센 값을 사실로 쓰게 한다.
 */
export function recallRuntime(state, { hasPhoto = true, photoId = '', material = '' } = {}) {
  const lines = ['', '[프로그램이 알려 주는 지금 상태 — 이 값을 사실로 쓰십시오]'];
  lines.push(`- 지금 함께 보는 사진: ${hasPhoto ? '있음' : '없음'}`);
  if (photoId) lines.push(`- 사진 번호: ${photoId}`);
  if (material) lines.push(`- 사진에서 실제로 보이는 것: ${material}`);
  lines.push(`- 이 사진에 대해 지금까지 한 질문: ${state.questionCount}번 (상한은 없습니다)`);
  lines.push(`- 잇달아 질문으로 끝낸 차례: ${state.consecutive}번 (잇달아 물어도 됩니다)`);
  lines.push('- 그만하겠다고 하지 않으셨다면, 짧게 되받은 뒤 이어지는 질문 하나로 대화를 이어 가십시오.');
  lines.push('  되받기만 하고 질문 없이 끝내지 마십시오.');

  if (state.opened) {
    lines.push(`- 첫 고정 질문("${RECALL_OPENING}")은 화면이 이미 드렸습니다. 다시 하지 마십시오.`);
  }

  /* 프롬프트 2번은 "JSON 을 출력하지 말라" 고 한다. 그 뜻은 속으로 판단한 것을
     사용자에게 보이지 말라는 것이다. 화면과 목소리를 움직이려면 프로그램은 정해진
     칸이 필요하므로, 말은 reply 한 칸에만 담게 하고 나머지는 화면이 쓰는 값이라고 밝힌다. */
  lines.push('- 출력 형식은 프로그램이 정한 칸(JSON 스키마)을 따릅니다.');
  lines.push('  사용자에게 들려 드릴 말은 reply 한 칸에만 담고, 그 안에 상태나 분석을 적지 마십시오.');
  lines.push('  나머지 칸은 화면과 목소리가 쓰는 값이며 사용자에게 보이지 않습니다.');
  return lines.join('\n');
}

/**
 * 규칙을 대놓고 어긴 답인가. 어겼으면 고쳐 달라고 할 지시문을 돌려준다
 * (app.py _hard_violation). 어기지 않았으면 null.
 */
export function hardViolation(text, state) {
  const marks = questionMarks(text);
  if (hasInternalOutput(text)) {
    return 'JSON · 상태 · 분석 · 제목을 출력하지 말고, 아바타가 실제로 할 한국어 대화 문장만 쓰십시오.';
  }
  if (marks > 1) {
    return '질문과 물음표는 하나만 쓰도록 답 전체를 다시 쓰십시오.';
  }
  /* 질문 횟수와 연속 질문에는 상한을 두지 않는다 (수정본).
     되받기만 하고 끝나는 것이 더 큰 문제였다 */
  if (marks === 0 && !state.finished) {
    return '되받기만 하고 끝내지 말고, 방금 하신 말씀과 이어지는 질문 하나를 붙여 다시 쓰십시오.';
  }
  return null;
}

/** 이번 답을 보태고 난 뒤의 상태 (시험과 화면 표시에 쓴다) */
export function afterReply(state, reply) {
  const asked = questionMarks(reply) > 0;
  const questionCount = state.questionCount + (asked ? 1 : 0);
  return {
    ...state,
    questionCount,
    consecutive: asked ? state.consecutive + 1 : 0,
    remaining: Math.max(0, QUESTION_LIMIT - questionCount),
    finished: state.finished || String(reply).includes(STOP_RESPONSE),
  };
}
