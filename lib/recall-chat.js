/* =====================================================================
 *  회상치료 챗봇의 한 차례 — 프롬프트를 짓고, 답을 다듬는다
 *
 *  건강관리 챗봇과 규칙이 완전히 다르므로 길을 갈라 둔다.
 *  회상 쪽은 팀에서 받은 시스템 프롬프트(prompts/recall-system.txt)를 본문으로 쓰고,
 *  여기서는 세 가지만 덧붙인다.
 *
 *  1) 지금 함께 보는 사진에 대해 아는 것 (확인된 것만 · server.js 가 만들어 준다)
 *  2) 이번에 여쭐 단계와 후보 질문, 또는 기억이 안 나실 때 건넬 단서 하나
 *  3) 프로그램이 센 질문 횟수와 연속 질문 횟수
 *
 *  답을 다듬는 것은 회상 대화에서 특히 중요하다. 프롬프트로만 부탁하면
 *  모델은 결국 두 가지를 어긴다 — 여러 문장을 늘어놓는 것과, 사진만 보고
 *  사람을 짐작하는 것. 둘 다 코드로 막는다.
 * ===================================================================== */

import {
  recallSystemPrompt, recallRuntime, recallState, QUESTION_LIMIT,
} from './recall-prompt.js';
import {
  nextArea, areaQuestions, nextCue, cueLadder, AREA_LABEL, retryLine,
  CUE_EXHAUSTED, QUESTIONS_EXHAUSTED,
} from './recall-flow.js';
import { questionContext } from './recall-questions.js';
import {
  photoMaterial, hasQuestion, limitQuestions, dropGuessedPeople,
  dropRepeatedSentences, attributeCue, withReaction,
} from './reply-rules.js';

const SENTENCES = /[^.!?。！？\n]+[.!?。！？]*\n?/g;

/**
 * 두 문장까지만 남긴다 (프롬프트 3번 — 한 번의 응답은 최대 두 문장).
 * 길어지면 첫 문장(되받기)과 마지막 문장(질문이나 이야기 초대)을 남긴다.
 * 가운데를 버리는 것은, 늘어놓은 설명이 거기 들어가기 때문이다.
 */
export function limitToTwo(text) {
  const parts = String(text).match(SENTENCES);
  if (!parts || parts.length <= 2) return String(text).trim();
  const first = parts[0].trim();
  const last = parts[parts.length - 1].trim();
  return `${first} ${last}`.trim();
}

/** 이번 차례에 어느 단계를 여쭐지 · 무엇을 건넬지 정한다 */
export function recallPlan({
  history = [], lastUserText = '', analysis = null, memory = null, facts = null,
  cannotRecall = false,
} = {}) {
  const state = recallState(history);
  const ctx = questionContext({
    history, lastUserText, analysis, importance: memory?.importance,
  });

  if (cannotRecall) {
    /* 사진에 남은 찍은 날부터 — 시스템이 이미 아는 사실이라 지어낸 말이 아니다.
       적어 두신 사람 · 장소가 있으면 그 칸에서 출처를 밝혀 건넨다 */
    const cue = nextCue(analysis, history, memory, facts);
    return { state, mode: cue ? 'cue' : 'cue_exhausted', cue, area: null, questions: [] };
  }

  const area = nextArea(history);
  const questions = area ? areaQuestions(area, ctx, history, { count: 3 }) : [];
  if (!area || questions.length === 0) {
    return { state, mode: 'questions_exhausted', cue: null, area, questions: [], again: '' };
  }

  /* 지난번에 잘 떠오르지 않았던 단계는 시험처럼 묻지 않고, 사진 속 단서로 다시 다가간다
     (대화 수정본 22번 — "지난번에 기억 못 하셨는데" 라고 하지 않는다) */
  const again = memory?.recall_status?.[area] === 'NOT_RECALLED' ? retryLine(area, analysis) : '';

  return { state, mode: 'ask', cue: null, area, questions, again };
}

/** 이번 차례에 할 일을 프롬프트 한 토막으로 (회의 피드백의 두 갈래) */
export function planBlock(plan) {
  const lines = ['', '[이번 차례에 할 일 — 다른 어떤 규칙보다 먼저 따릅니다]'];

  if (plan.mode === 'cue') {
    lines.push('- 기억이 바로 떠오르지 않으신다고 하셨습니다. 먼저 괜찮다고 안심시켜 드립니다.');
    lines.push('- 그리고 아래 단서 하나만 그대로 건네십시오. 두 가지를 한꺼번에 건네지 마십시오.');
    lines.push(`  "${plan.cue.line}"`);
    lines.push('- 사진에 보이는 것 말고 다른 것을 지어내거나, 무엇인지 단정하지 마십시오.');
    return lines.join('\n');
  }

  if (plan.mode === 'cue_exhausted') {
    lines.push('- 단서를 이미 건넸는데도 떠오르지 않으십니다. 더 캐묻지 마십시오.');
    lines.push(`- 이렇게 말하고 고르시게 하십시오 : "${CUE_EXHAUSTED}"`);
    return lines.join('\n');
  }

  if (plan.mode === 'questions_exhausted') {
    lines.push('- 이 사진에서 안전하게 여쭐 것이 더 없습니다. 억지로 질문을 지어내지 마십시오.');
    lines.push(`- 이렇게 말하고 고르시게 하십시오 : "${QUESTIONS_EXHAUSTED}"`);
    return lines.join('\n');
  }

  /* ask — 회의 피드백의 여섯 단계. 이미 말씀하신 단계는 건너뛰고 다음 단계를 여쭙는다 */
  lines.push(`- 이번에 여쭐 단계 : ${AREA_LABEL[plan.area] || plan.area}`);

  if (plan.again) {
    lines.push('- 지난번에 이 단계가 잘 떠오르지 않았습니다. 지난 일을 들추지 말고,');
    lines.push(`  사진을 함께 보며 이렇게 다시 다가가십시오 : "${plan.again}"`);
    lines.push('- "지난번에 기억 못 하셨는데" 처럼 시험하듯 말하지 마십시오.');
    return lines.join('\n');
  }

  lines.push('- 방금 하신 말씀을 한 문장으로 되받은 뒤, 아래 질문 가운데 지금 이야기에 가장 어울리는');
  lines.push('  하나를 골라 그대로 여쭈십시오. 질문은 하나만 합니다.');
  plan.questions.forEach((q, i) => lines.push(`  ${i + 1}) ${q.text}`));
  lines.push('- 이미 말씀하신 사람 · 장소 · 일 · 감정은 다시 여쭙지 마십시오.');
  return lines.join('\n');
}

/**
 * 회상 대화 한 차례의 시스템 프롬프트.
 * character 는 목소리와 이름을 위한 한 줄이다 (초롱이 · 준호 · 서연).
 */
export function buildRecallPrompt({
  character = null, memory = null, analysis = null, memoryContext = '', facts = null,
  history = [], lastUserText = '', cannotRecall = false, plan = null,
} = {}) {
  const made = plan || recallPlan({ history, lastUserText, analysis, memory, facts, cannotRecall });
  const material = photoMaterial(analysis, history);

  const who = character?.who
    ? `${character.who}\n- 아래 규칙이 말투보다 먼저입니다. 규칙과 어긋나면 규칙을 따릅니다.`
    : '';

  return [
    who,
    recallSystemPrompt(),
    memoryContext,
    planBlock(made),
    recallRuntime(made.state, {
      hasPhoto: Boolean(memory?.photo?.file),
      photoId: memory?.memory_id || '',
      material,
    }),
  ].filter(Boolean).join('\n\n');
}

/**
 * 답을 다듬는다.
 * 프롬프트가 아무리 길어도 모델은 문장을 늘어놓고 사람을 짐작한다. 코드로 막는다.
 */
export function tidyRecallReply(reply, {
  history = [], userSaid = '', turnCue = null, plain = '그러셨군요.', mayAsk = true, cue = '',
} = {}) {
  /* 건네기로 한 단서는 정해진 문장 그대로 나간다.
     모델에게 맡겨 보았더니 문장을 줄이다 단서를 통째로 빠뜨리거나
     ("바로 떠오르지 않아도 괜찮아요. 그때 있었던 일이 떠오르시나요?" — 단서가 없다)
     "사진은 1998년에 찍은 것으로 보입니다" 처럼 바꿔 말했다 (실제 대화). */
  if (cue) return String(cue).trim();

  let out = String(reply || '').trim();
  if (!out) return plain;

  out = limitQuestions(out, mayAsk);          // 질문은 하나까지 (못 물을 차례면 모두 뺀다)
  out = dropGuessedPeople(out, userSaid, plain);
  out = dropRepeatedSentences(out, history, plain);
  out = attributeCue(out, turnCue, userSaid);  // 적어 둔 내용을 건넸으면 누가 적었는지 밝힌다
  out = withReaction(out, plain);              // 질문만 달랑 하지 않는다
  out = limitToTwo(out);                       // 최대 두 문장
  return out.trim() || plain;
}

/** 화면이 쓰기 좋게, 이번 차례의 상태를 요약해 돌려준다 */
export function recallInfo(plan, reply) {
  return {
    area: plan.area,
    areaLabel: plan.area ? AREA_LABEL[plan.area] : '',
    mode: plan.mode,
    questionCount: plan.state.questionCount + (hasQuestion(reply) ? 1 : 0),
    cueSteps: plan.cue ? cueLadder(null).length : 0,
  };
}
