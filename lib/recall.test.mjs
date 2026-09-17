/* 회상 대화 — 팀에서 받은 시스템 프롬프트와 질문 상태 관리를 시험한다.
   (prompts/recall-system.txt 의 10 · 11 · 19 · 24 · 26번 규칙과 app.py 의 상태 관리) */
import {
  recallSystemPrompt, setRecallSystemPrompt, QUESTION_LIMIT, CONSECUTIVE_LIMIT,
  STOP_RESPONSE, STOP_PATTERNS, isStopRequest, hasInternalOutput, questionMarks,
  recallState, recallRuntime, hardViolation, afterReply,
} from './recall-prompt.js';
import { RECALL_OPENING } from './reply-rules.js';
import {
  coveredAreas, nextArea, areaQuestions, cueLadder, nextCue, summaryCard, retryLine,
} from './recall-flow.js';
import { limitToTwo, recallPlan, planBlock, tidyRecallReply } from './recall-chat.js';

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}`);
};

const user = (content) => ({ role: 'user', content });
const bot = (content) => ({ role: 'assistant', content });
const OPEN = bot(`바닷가에서 찍은 사진이네요. 수박도 보이네요. ${RECALL_OPENING}`);

console.log('[프롬프트 — 파일 그대로 쓴다]');
const prompt = recallSystemPrompt();
t('팀에서 받은 프롬프트를 읽어 온다', prompt.includes('[1. 역할]'), true);
t('사진 없는 경우 · 질문 한도 규칙이 들어 있다',
  [prompt.includes('[4. 사진이 없는 경우]'), prompt.includes('[10. 후속 질문 규칙]')], [true, true]);
t('사용자를 어르신이라 부르지 않는다', prompt.includes('어르신,'), false);
t('수정본을 뒤에 붙여 읽는다', prompt.includes('[가장 중요한 규칙 — 대화를 잇습니다]'), true);
t('질문 횟수에 상한을 두지 않는다', [QUESTION_LIMIT, CONSECUTIVE_LIMIT], [null, null]);
t('마무리 인사는 정해진 문장',
  STOP_RESPONSE, '네, 오늘은 여기까지 이야기할게요. 오늘 들려주신 이야기를 추억으로 저장해둘까요?');

console.log('\n[그만하고 싶다고 하실 때]');
t('"그만할래요"', isStopRequest('이제 그만할래요'), true);
t('"이제 됐어"', isStopRequest('이제 됐어'), true);
t('"사진 치워 주세요"', isStopRequest('사진 치워 주세요'), true);
t('"오늘은 여기까지 할게요"', isStopRequest('오늘은 여기까지 할게요'), true);
t('더 보시겠다는 말은 종료가 아니다', isStopRequest('조금 더 볼래요'), false);
t('그냥 모르겠다는 말도 종료가 아니다', isStopRequest('잘 모르겠어요'), false);
t('app.py 의 표현을 모두 담았다', STOP_PATTERNS.length >= 9, true);

console.log('\n[속으로만 판단할 것을 내놓지 않는다]');
t('JSON 을 내놓으면 걸러낸다', hasInternalOutput('{"question_count": 2}'), true);
t('제목을 붙이면 걸러낸다', hasInternalOutput('분석 결과: 사용자가 장소를 말했습니다.'), true);
t('평범한 대화 문장은 그대로', hasInternalOutput('따님과 바다에 가셨군요. 그날 무엇을 하셨나요?'), false);
t('물음표를 센다', [questionMarks('그랬군요.'), questionMarks('어떠셨어요?'), questionMarks('누구? 언제?')], [0, 1, 2]);

console.log('\n[사진 한 장의 질문 상태를 대화 기록에서 다시 센다]');
const first = recallState([OPEN, user('딸이랑 갔던 바다야')]);
t('첫 고정 질문도 한 번으로 센다', [first.questionCount, first.remaining], [1, null]);
t('첫 질문 뒤에는 더 물어도 된다', first.mayAsk, true);

const twice = recallState([
  OPEN, user('딸이랑 갔던 바다야'),
  bot('따님과 함께 가셨군요. 그날 바닷가에서 무엇을 하셨나요?'), user('수영했지'),
]);
t('잇달아 물었어도 계속 물을 수 있다 (수정본)',
  [twice.questionCount, twice.consecutive, twice.mayAsk], [2, 2, true]);

const rested = recallState([
  OPEN, user('딸이랑 갔던 바다야'),
  bot('따님과 함께 가셨군요. 그날 바닷가에서 무엇을 하셨나요?'), user('수영했지'),
  bot('바다에서 수영하셨군요. 그날 기억나는 장면을 편하게 들려주세요.'), user('물이 참 시원했어'),
]);
t('질문 없이 한 차례 쉬면 연속 횟수가 0 이 된다', [rested.questionCount, rested.consecutive], [2, 0]);
t('쉬었으면 다시 물어도 된다', rested.mayAsk, true);

const fiveAsked = [
  OPEN, user('응'),
  bot('누구와 함께 계셨어요?'), user('딸이랑'),
  bot('그렇군요. 그곳이 어디였는지 기억나세요?'), user('강릉'),
  bot('강릉이었군요. 거기서 무엇을 하셨어요?'), user('수영'),
  bot('수영하셨군요. 그때 날씨는 어땠는지 기억나세요?'), user('더웠어'),
];
const full = recallState(fiveAsked);
t('다섯 번을 물어도 이어 갈 수 있다', [full.questionCount, full.remaining, full.mayAsk], [5, null, true]);

t('사진이 바뀌면(첫 질문을 다시 드리면) 처음부터 센다',
  recallState([
    OPEN, user('응'), bot('누구와 함께 계셨어요?'), user('딸이랑'),
    bot(`꽃이 보이는 사진이네요. ${RECALL_OPENING}`), user('우리 집 꽃이야'),
  ]).questionCount, 1);

t('마무리 인사를 드렸으면 끝난 대화',
  recallState([OPEN, user('그만할래'), bot(STOP_RESPONSE)]).finished, true);

console.log('\n[모델에게 알려 주는 지금 상태]');
const runtime = recallRuntime(first, { hasPhoto: true, material: '장소 — 바닷가 · 보이는 것 — 수박' });
t('되받기만 하고 끝내지 말라고 알려 준다',
  runtime.includes('되받기만 하고 질문 없이 끝내지 마십시오'), true);
t('첫 질문은 화면이 이미 드렸다고 알려 준다', runtime.includes('화면이 이미 드렸습니다'), true);
t('상한이 없다고 알려 준다', recallRuntime(full).includes('상한은 없습니다'), true);

console.log('\n[규칙을 어긴 답은 한 번 고쳐 받는다 (app.py _hard_violation)]');
t('물음표가 둘이면 고쳐 받는다',
  Boolean(hardViolation('누구와 가셨어요? 그곳은 어디였나요?', first)), true);
t('되받기만 하고 끝내면 고쳐 받는다 (가장 큰 문제였다)',
  Boolean(hardViolation('바다에 가셨군요. 좋으셨겠어요.', first)), true);
t('여러 번 물은 뒤에도 질문을 막지 않는다',
  hardViolation('그때 기분은 어떠셨어요?', full), null);
t('JSON 을 내놓아도 고쳐 받는다', Boolean(hardViolation('{"next_action":"ask"}', first)), true);
t('마친 뒤에는 질문이 없어도 괜찮다',
  hardViolation(STOP_RESPONSE, { ...first, finished: true }), null);

console.log('\n[답을 하고 난 뒤의 상태]');
t('질문했으면 한 번 늘고 연속도 는다',
  (({ questionCount, consecutive }) => [questionCount, consecutive])(afterReply(first, '그때 기분은 어떠셨어요?')),
  [2, 2]);
t('질문하지 않았으면 연속은 0',
  (({ questionCount, consecutive }) => [questionCount, consecutive])(afterReply(twice, '그러셨군요. 편하게 더 들려주세요.')),
  [2, 0]);
t('마무리 인사를 하면 끝난 것으로 본다', afterReply(first, STOP_RESPONSE).finished, true);

console.log('\n[회의 피드백 — 이미 말씀하신 단계는 건너뛴다]');
const beach = {
  status: 'DONE', people_count: 3, objects: ['수박', '양산'],
  place_type: 'nature', place_label: '바닷가', activity: 'leisure', activity_label: '휴식',
};
const told = [OPEN, user('딸이랑 제주도 바다에 갔을 때야')];
t('사람 · 장소 · 사건을 한 번에 말씀하시면 세 단계가 채워진다',
  coveredAreas(told), ['person', 'place', 'event']);
t('그다음은 감각 단계', nextArea(told), 'sense');
t('아무 말씀도 없으면 사람부터', nextArea([OPEN]), 'person');
t('사람 · 장소 · 사건 · 감정을 다 말씀하셨어도 감각은 아직 안 나왔다',
  nextArea([OPEN, user('딸이랑 바다 가서 수영했는데 참 즐거웠어')]), 'sense');
t('그 단계의 질문만 고른다',
  areaQuestions('sense',
    { weather: true, place: '바닷가', soundy: true, outdoor: true, userTurns: 2, lastLen: 10 },
    told).every((q) => q.area === '감각'), true);

console.log('\n[기억이 안 나실 때 — 단서 사다리 (찍은 날 → 사람 → 장소 → 사물 → 선택형)]');
const shot = {
  meta: { taken_at: '2026-09-16T10:00:00' },
  taken_year: null,
  verification_status: 'CAREGIVER_VERIFIED',   // 보호자가 적어 두신 사진
};
const ladder = cueLadder(beach, shot);
t('사다리 차례', ladder.map((c) => c.step),
  ['date', 'person', 'place', 'object', 'object', 'choice']);
t('첫 단서는 사진에 남은 찍은 날', ladder[0].line.includes('2026년 9월'), true);
t('첫 단서에는 안심하는 말이 함께 간다', ladder[0].line.includes('괜찮아요'), true);
t('건네기로 한 단서는 정해진 문장 그대로 나간다 (모델이 줄이거나 바꿔 말해도)',
  tidyRecallReply('사진은 1998년에 찍은 것으로 보입니다.', { cue: ladder[0].line }), ladder[0].line);
t('사람 단서는 몇 분인지만 말한다', ladder[1].line.includes('세 분'), true);
t('장소를 단정하지 않는다', ladder[2].line.includes('바닷가처럼 보이는'), true);
t('적어 둔 찍은 해만 있어도 첫 단서가 된다',
  cueLadder(null, { taken_year: 1975 })[0].line.includes('1975년'), true);
t('인화 사진을 다시 찍은 것이면 파일 날짜는 쓰지 않는다',
  cueLadder({ ...beach, is_reproduction: true }, shot).map((c) => c.step).includes('date'), false);
t('살펴본 것도 찍은 날도 없으면 단서가 없다', cueLadder(null, null), []);
const gaveOne = [OPEN, user('기억이 안 나'), bot(ladder[0].line), user('모르겠어')];
t('이미 드린 단서는 건너뛴다', nextCue(beach, gaveOne, shot).step, 'person');

/* 적어 두신 내용이 있으면 그 칸에서는 사진을 보고 짐작한 말 대신 그것을 쓴다.
   단서가 나가는 곳은 사다리 한 곳뿐이어야 한다 (두 곳에서 나가 순서가 뒤엉켰다) */
const toldFacts = { people: ['딸', '사위'], place: '강릉 바닷가' };
const withFacts = cueLadder(beach, shot, toldFacts);
t('사다리 차례는 그대로', withFacts.map((c) => c.step),
  ['date', 'person', 'place', 'object', 'object', 'choice']);
t('사람 칸은 적어 두신 분으로', withFacts[1].line.includes("'딸, 사위'라고"), true);
t('누가 적었는지 밝힌다', withFacts[1].line.includes('보호자분이'), true);
t('장소 칸도 적어 두신 곳으로', withFacts[2].line.includes("'강릉 바닷가'라고"), true);
const gaveTwo = [
  OPEN, user('기억이 안 나'), bot(withFacts[0].line), user('모르겠어'),
  bot(withFacts[1].line), user('그래도 모르겠어'),
];
t('찍은 날과 적어 두신 분까지 건넸으면 다음 칸으로',
  nextCue(beach, gaveTwo, shot, toldFacts).step, 'place');

console.log('\n[마칠 때 — 오늘 떠올린 기억]');
const card = summaryCard([
  OPEN, user('딸이랑 바다에 갔어'),
  bot('따님과 가셨군요. 그날 무엇을 하셨나요?'), user('수영하고 수박도 먹었지'),
  bot('그때 기분은 어떠셨어요?'), user('참 좋았어'),
  bot('그곳이 어디였는지 기억나세요?'), user('글쎄, 어디였는지는 기억이 안 나'),
]);
t('말씀하신 영역만 떠올린 것으로 적는다',
  card.items.filter((i) => i.status === 'RECALLED').map((i) => i.area), ['person', 'event', 'emotion']);
t('여쭈었지만 안 떠오른 영역은 다음으로 남긴다', card.notRecalled, ['place']);
t('여쭙지 않은 영역은 아예 적지 않는다',
  card.items.some((i) => i.area === 'meaning'), false);
t('실제로 하신 말씀만 옮긴다', card.lines[0].includes('딸이랑 바다에 갔어'), true);
t('저장할지 여쭙는다', card.ask, '오늘 이야기를 추억으로 저장할까요?');
t('잘했다 못했다 평가하지 않는다',
  /잘하셨|훌륭|점수|성공|실패/.test(card.lines.join(' ')), false);
t('다시 열 때 시험처럼 묻지 않는다',
  retryLine('place', beach).includes('지난번'), false);

console.log('\n[한 차례에 두 문장까지]');
t('길어지면 첫 문장과 마지막 문장만 남긴다',
  limitToTwo('따님과 가셨군요. 바다가 참 좋지요. 저도 가 보고 싶어요. 그날 무엇을 하셨나요?'),
  '따님과 가셨군요. 그날 무엇을 하셨나요?');
t('두 문장이면 그대로',
  limitToTwo('따님과 가셨군요. 그날 무엇을 하셨나요?'), '따님과 가셨군요. 그날 무엇을 하셨나요?');

console.log('\n[이번 차례에 할 일]');
t('기억이 안 난다고 하시면 단서 하나',
  recallPlan({ history: [OPEN, user('기억이 안 나')], analysis: beach, cannotRecall: true }).mode, 'cue');
t('잇달아 물었어도 계속 질문한다 (수정본)',
  recallPlan({ history: [OPEN, user('응'), bot('누구와 함께 계셨어요?'), user('딸')], analysis: beach }).mode,
  'ask');
t('다섯 번을 물어도 이어 간다 (수정본)',
  recallPlan({ history: fiveAsked, analysis: beach }).mode, 'ask');
t('할 일을 프롬프트 한 토막으로',
  planBlock(recallPlan({ history: told, analysis: beach })).includes('이번에 여쭐 단계'), true);
t('지난번에 안 떠오른 단계는 시험처럼 묻지 않고 다시 다가간다 (수정본 22번)',
  planBlock(recallPlan({
    history: [OPEN], analysis: beach, memory: { recall_status: { person: 'NOT_RECALLED' } },
  })).includes('사진 속 얼굴들을 천천히'), true);

console.log('\n[프롬프트를 바꿔 끼울 수 있다 (시험용)]');
setRecallSystemPrompt('시험용 프롬프트');
t('바꿔 끼운 값이 나온다', recallSystemPrompt(), '시험용 프롬프트');
setRecallSystemPrompt(null);
t('되돌리면 다시 파일에서 읽는다', recallSystemPrompt().includes('[1. 역할]'), true);

console.log(fail ? `\n${fail}개 실패` : '\n모두 통과');
process.exit(fail ? 1 : 0);
