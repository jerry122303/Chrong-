/* 회상 대화 — 통합 시스템 프롬프트와 대화 상태 관리를 시험한다.
   (prompts/recall-system.txt 의 5 · 10 · 11 · 19 · 24 · 25 · 26 · 28번) */
import {
  recallSystemPrompt, setRecallSystemPrompt, QUESTION_LIMIT, CONSECUTIVE_LIMIT,
  STOP_RESPONSE, STOP_PATTERNS, isStopRequest, hasInternalOutput, questionMarks,
  recallState, recallRuntime, hardViolation, afterReply, limitToTwo,
  tidyRecallReply, buildRecallPrompt,
} from './recall-prompt.js';
import { RECALL_OPENING } from './reply-rules.js';
import { openingLine, RECALL_QUESTION } from '../public/recall-opening.js';

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}`);
};

const user = (content) => ({ role: 'user', content });
const bot = (content) => ({ role: 'assistant', content });
const OPEN = bot(openingLine());

console.log('[프롬프트 — 통합 문서 한 파일을 그대로 쓴다]');
const prompt = recallSystemPrompt();
t('회상치료의 목적이 맨 앞에 있다', prompt.includes('[회상치료(Reminiscence Therapy)의 기본 정의 및 AI의 목적]'), true);
t('스물여덟 개 항이 들어 있다',
  [prompt.includes('[1. 역할]'), prompt.includes('[28. 최종 출력 점검]')], [true, true]);
t('종료와 표정 측정 명세도 한 파일에 있다',
  [prompt.includes('[대화 종료 시나리오 (User-Initiated Termination)]'),
    prompt.includes('[3단계 표정 이모티콘 감정 측정 UI 및 DB 매핑]')], [true, true]);
t('사용자를 어르신이라 부르지 않는다', prompt.includes('어르신,'), false);
t('수정본을 따로 덧붙이지 않는다', prompt.includes('회상대화 로직 수정본'), false);

console.log('\n[첫 말 — 문서 5번이 정한 문장 그대로]');
t('첫 물음', RECALL_QUESTION, '이 사진을 보니 어떤 기억이 떠오르시나요?');
t('첫 말', openingLine(), '사진이 잘 등록됐어요. 이 사진을 보니 어떤 기억이 떠오르시나요?');
t('상태를 세는 표와 같은 문장을 쓴다', openingLine().includes(RECALL_OPENING), true);
t('사진을 보고 짐작하는 말을 붙이지 않는다',
  /바다|제주|가족|산악회/.test(openingLine()), false);

console.log('\n[상태 — 문서 26번, 대화 기록에서 다시 센다]');
t('첫 고정 질문도 한 번으로 센다', recallState([OPEN]).questionCount, 1);
t('사진이 바뀌면 다시 센다 (첫 질문을 다시 드리므로)',
  recallState([OPEN, user('바다야'), bot('바다군요. 누구와 가셨어요?'), OPEN]).questionCount, 1);
t('잇달아 물은 횟수를 센다',
  recallState([OPEN, user('응'), bot('그러셨군요. 누구와 가셨어요?')]).consecutive, 2);
t('질문 없이 답하면 연속은 0이 된다',
  recallState([OPEN, user('응'), bot('그러셨군요. 그날 이야기를 편하게 들려주세요.')]).consecutive, 0);

const five = [OPEN,
  user('바다'), bot('바다군요. 누구와 가셨어요?'),
  user('딸'), bot('따님과 가셨군요. 그날 무엇을 하셨어요?'),
  user('수영'), bot('수영을 하셨군요. 물은 어땠나요?'),
  user('차가웠어'), bot('차가웠군요. 그때 기분은 어떠셨어요?')];
const atLimit = recallState(five);
t('사진 한 장에 다섯 번까지 (문서 10번)', [QUESTION_LIMIT, atLimit.questionCount], [5, 5]);
t('다 차면 더 묻지 않는다', [atLimit.limitReached, atLimit.mayAsk, atLimit.remaining], [true, false, 0]);

const twice = recallState([OPEN, user('응'), bot('그러셨군요. 누구와 가셨어요?')]);
t('두 번 잇달아 물었으면 이번엔 쉰다 (문서 11번)',
  [CONSECUTIVE_LIMIT, twice.consecutive, twice.mayAsk], [2, 2, false]);

console.log('\n[마칠 때 — 문서 19번 · 25번]');
t('그만하겠다는 말씀을 알아본다',
  ['그만할래요', '이제 됐어', '사진 치워 주세요', '다른 이야기 하고 싶어'].map(isStopRequest),
  [true, true, true, true]);
t('그냥 하는 말은 아니다',
  ['그만 먹을래', '바다에 갔어'].some(isStopRequest), false);
t('문서가 정한 마지막 문장', STOP_RESPONSE, '네, 오늘 이야기는 여기서 마칠게요. 함께 이야기해 주셔서 감사합니다.');
t('마치고 나면 더 묻지 않는다', recallState([OPEN, user('그만'), bot(STOP_RESPONSE)]).mayAsk, false);
t('문서 19번의 여덟 가지가 모두 들어 있다', STOP_PATTERNS.length >= 8, true);

console.log('\n[출력 점검 — 문서 28번 가운데 코드가 지키는 것]');
t('물음표를 센다', questionMarks('바다군요? 누구와 가셨어요?'), 2);
t('속으로 판단할 것을 내놓으면 잡아낸다',
  [hasInternalOutput('{"question_count": 2}'), hasInternalOutput('분석 결과: PERSON'),
    hasInternalOutput('바다군요.')], [true, true, false]);

const fresh = recallState([OPEN]);
t('물음표가 둘이면 다시 쓰게 한다',
  /하나만/.test(hardViolation('바다군요? 누구와 가셨어요?', fresh) || ''), true);
t('못 묻는 차례에 물으면 잡아낸다',
  /정리하고/.test(hardViolation('그러셨군요. 누구와 가셨어요?', atLimit) || ''), true);
t('두 번 잇달아 물은 뒤의 질문도 잡아낸다',
  /이야기 초대/.test(hardViolation('그러셨군요. 어디였어요?', twice) || ''), true);
t('규칙을 지킨 답은 그냥 둔다',
  hardViolation('바다에 가셨군요. 그날 이야기를 편하게 들려주세요.', fresh), null);

t('두 문장까지만 남긴다',
  limitToTwo('바다군요. 좋으셨겠어요. 파도가 높았나요. 그날 이야기를 들려주세요.'),
  '바다군요. 그날 이야기를 들려주세요.');
t('못 묻는 차례에는 질문을 걷어낸다',
  tidyRecallReply('따님과 가셨군요. 그때 기분은 어떠셨어요?', { state: atLimit, userSaid: '딸이랑 갔어' }),
  '따님과 가셨군요.');
t('말씀하지 않은 사람은 빼낸다',
  tidyRecallReply('가족분들과 함께 가셨나 봐요. 그날 이야기를 들려주세요.',
    { state: fresh, userSaid: '바다에 갔어', plain: '그러셨군요.' }).includes('가족'), false);

console.log('\n[한 차례의 상태 갱신]');
const next = afterReply(fresh, '바다군요. 누구와 가셨어요?');
t('물었으면 횟수가 오른다', [next.questionCount, next.consecutive, next.remaining], [2, 2, 3]);
t('남은 횟수가 숫자로 나온다 (NaN 이 아니다)', Number.isFinite(next.remaining), true);
t('마무리 문장을 쓰면 끝난 것으로 본다',
  afterReply(fresh, STOP_RESPONSE).finished, true);

console.log('\n[프롬프트 조립]');
const built = buildRecallPrompt({
  character: { who: '당신은 초롱이입니다.' },
  memory: { memory_id: 'memory_1', photo: { file: 'a.jpg' } },
  memoryContext: '[지금 함께 보고 있는 사진]\n- 제목: 딸의 결혼식',
  history: [OPEN],
  material: '사람 — 세 명',
});
t('말투 · 문서 · 사진 · 상태가 한 덩어리로 들어간다',
  [built.includes('초롱이'), built.includes('[12. 후속 질문 선택 방법]'),
    built.includes('딸의 결혼식'), built.includes('전체 질문 횟수: 1회')],
  [true, true, true, true]);
t('다 찼을 때는 문서 24번대로 하라고 알려 준다',
  recallRuntime(atLimit, { hasPhoto: true }).includes('문서 24번대로'), true);

setRecallSystemPrompt('시험용 프롬프트');
t('시험에서는 프롬프트를 바꿔 끼울 수 있다', recallSystemPrompt(), '시험용 프롬프트');
setRecallSystemPrompt(null);

console.log(fail === 0 ? '\n모두 통과' : `\n${fail}개 실패`);
process.exit(fail === 0 ? 0 : 1);
