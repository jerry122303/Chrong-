/* 기억 회상 지원 — 질문지와 마무리 인사를 시험한다 */
import {
  QUESTIONS, CLOSING_LINE, questionContext, pickQuestions, withQuestionnaire, isStopIntent, sinceOpening,
} from './recall-questions.js';
import { dropQuizQuestions, dropRepeatedSentences } from './reply-rules.js';

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}`);
};

const OPEN = { role: 'assistant', content: '사진이 잘 등록됐어요. 이 사진을 보니 어떤 기억이 떠오르시나요?' };
const user = (content) => ({ role: 'user', content });
const bot = (content) => ({ role: 'assistant', content });
const seeded = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const beach = {
  status: 'DONE', people_count: 3, objects: ['수박', '양산', '테이블'],
  place_type: 'nature', place_label: '바닷가', activity: 'leisure', activity_label: '휴식',
};
const flower = {
  status: 'DONE', people_count: 0, objects: ['꽃병', '꽃'],
  place_type: 'unknown', place_label: '', activity: 'none', activity_label: '',
};
const eligible = (ctx) => QUESTIONS.filter((q) => !q.fits || q.fits(ctx)).map((q) => q.text);

console.log('[질문지 — 초롱이.pdf 의 질문 서른다섯 개]');
t('질문 수', QUESTIONS.length, 35);
t('영역 여덟 개', [...new Set(QUESTIONS.map((q) => q.area))],
  ['사건 확장', '행동', '사람 · 관계', '장소', '감각', '감정', '개인적 의미', '연결 회상']);
t('모두 물음표로 끝난다', QUESTIONS.every((q) => q.text.endsWith('?')), true);
t('같은 질문이 두 번 없다', new Set(QUESTIONS.map((q) => q.text)).size, QUESTIONS.length);

console.log('\n[언제 쓰면 좋은지 — 조건]');
const first = [OPEN, user('딸이랑 갔던 바다야')];
const ctx1 = questionContext({ history: first, lastUserText: '딸이랑 갔던 바다야', analysis: beach, importance: 3 });
t('딸을 말씀하셨으면 동행자가 나온 것', ctx1.companion, true);
t('동행자가 나왔으면 "누구와 함께" 는 묻지 않는다', eligible(ctx1).includes('이때 누구와 함께 계셨어요?'), false);
t('동행자를 말한 뒤에는 "함께 계셨던 분과"', eligible(ctx1).includes('함께 계셨던 분과 어떤 시간을 보내셨어요?'), true);
const ctxFlower = questionContext({ history: [OPEN, user('우리 집 꽃이야')], lastUserText: '우리 집 꽃이야', analysis: flower, importance: 1 });
const ctxPeople = questionContext({ history: [OPEN, user('옛날 사진이네')], lastUserText: '옛날 사진이네', analysis: beach });
t('동행자가 아직 안 나왔으면 "누구와 함께" 를 물을 수 있다', eligible(ctxPeople).includes('이때 누구와 함께 계셨어요?'), true);
t('꽃 사진이면 냄새 · 향', eligible(ctxFlower).includes('그곳에서 기억나는 냄새나 향이 있으세요?'), true);
t('사물만 찍힌 사진(꽃병)이면 "이날 · 사진 찍기 전후 · 누구와" 질문은 하지 않는다 (실제 대화)',
  ['이날 또 기억나는 일이 있으세요?', '사진을 찍고 나서는 무엇을 하셨어요?', '이때 무엇을 하고 계셨나요?', '이때 누구와 함께 계셨어요?']
    .map((q) => eligible(ctxFlower).includes(q)), [false, false, false, false]);
t('꽃 사진에서도 "가장 먼저 생각나는 사람"', eligible(ctxFlower).includes('이 사진을 보면 가장 먼저 생각나는 사람이 있으세요?'), true);
t('꽃을 키우셨다고 하시면 "이런 활동을 자주"',
  eligible(questionContext({ history: [OPEN, user('내가 키웠지')], lastUserText: '내가 키웠지', analysis: flower }))
    .includes('그 이후에도 이런 활동을 자주 하셨어요?'), true);
t('사물만 찍힌 사진에서도 첫 차례에 셋을 고를 수 있다', pickQuestions(ctxFlower, [OPEN], { random: seeded(5) }).length, 3);
t('살펴본 결과가 없으면 여느 사진처럼 본다', questionContext({ history: first, lastUserText: '딸이랑 갔던 바다야' }).eventy, true);
t('장소를 모르는 사진이면 날씨 · 장소 질문은 하지 않는다',
  ['그때 날씨는 어땠는지 기억나세요?', '이곳에 자주 가셨나요?'].map((q) => eligible(ctxFlower).includes(q)), [false, false]);
t('바닷가 사진이면 날씨 · 소리 · 장소',
  ['그때 날씨는 어땠는지 기억나세요?', '그때 들렸던 소리도 기억나세요?', '이곳에 자주 가셨나요?'].map((q) => eligible(ctx1).includes(q)),
  [true, true, true]);
t('중요도가 높은 사진이면 "특별하게 느껴지는 이유"', eligible(ctx1).includes('이 사진이 특별하게 느껴지는 이유가 있으세요?'), true);
t('대화 후반 질문은 처음에는 하지 않는다', eligible(ctx1).includes('이 기억에서 가장 기억에 남는 것은 무엇인가요?'), false);
const joy = questionContext({
  history: [OPEN, user('바다에서 놀았어'), bot('우와!'), user('응 재밌었어')], lastUserText: '응 재밌었어', analysis: beach,
});
t('즐거웠다고 하시면 "즐거웠던 다른 날"', eligible(joy).includes('이때처럼 즐거웠던 다른 날도 생각나세요?'), true);
t('날씨 · 바람을 말씀하시면 "공기나 바람"',
  eligible(questionContext({ history: [OPEN, user('바람이 시원했지')], lastUserText: '바람이 시원했지', analysis: beach }))
    .includes('그때 공기나 바람은 어땠는지 기억나세요?'), true);

console.log('\n[무작위로 고르되 같은 사진에서 되풀이하지 않는다]');
const picks = pickQuestions(ctx1, first, { count: 3, random: seeded(7) });
t('셋을 고른다', picks.length, 3);
t('셋 모두 조건에 맞는다', picks.every((q) => !q.fits || q.fits(ctx1)), true);
t('영역이 겹치지 않게', new Set(picks.map((q) => q.area)).size, 3);
t('씨앗이 다르면 고르는 것도 달라진다 (무작위)',
  new Set(Array.from({ length: 10 }, (_, i) => pickQuestions(ctx1, first, { random: seeded(i + 11) }).map((q) => q.text).join('|'))).size > 1, true);
const askedOne = [...first, bot(`우와, 바다에 가셨군요! ${picks[0].text}`), user('수박을 먹었지')];
const ctx2 = questionContext({ history: askedOne, lastUserText: '수박을 먹었지', analysis: beach });
t('이미 여쭌 질문은 다시 고르지 않는다',
  Array.from({ length: 20 }, (_, i) => pickQuestions(ctx2, askedOne, { random: seeded(i + 1) })).flat().some((q) => q.text === picks[0].text),
  false);
const nextPhoto = [...askedOne, bot('네, 다른 사진을 가져올게요.'), OPEN];
t('다른 사진으로 넘어가면 다시 쓸 수 있다',
  pickQuestions(ctx1, nextPhoto, { count: QUESTIONS.length, random: seeded(3) }).some((q) => q.text === picks[0].text), true);
t('지금 사진 이야기만 센다', sinceOpening(nextPhoto), []);

console.log('\n[답에 질문지 질문 하나 — 모델이 고르지 않았으면 붙인다]');
const food = QUESTIONS.find((q) => q.text.startsWith('그날 먹었던'));
const more = QUESTIONS.find((q) => q.text.startsWith('이날 또'));
const cands = [food, more];
t('후보를 그대로 여쭸으면 그대로',
  withQuestionnaire('우와, 수박을요! 그날 먹었던 음식 중 기억나는 게 있으세요?', cands, { random: () => 0 }),
  '우와, 수박을요! 그날 먹었던 음식 중 기억나는 게 있으세요?');
t('띄어쓰기만 달라도 여쭌 것으로',
  withQuestionnaire('우와! 그날 먹었던 음식중 기억나는게 있으세요?', cands, { random: () => 0 }),
  '우와! 그날 먹었던 음식중 기억나는게 있으세요?');
t('공감만 했으면 질문 하나를 붙인다 (피드백)',
  withQuestionnaire('따님이랑 바다에 가셨군요. 정말 즐거우셨겠어요.', cands, { random: () => 0 }),
  '따님이랑 바다에 가셨군요. 정말 즐거우셨겠어요. 그날 먹었던 음식 중 기억나는 게 있으세요?');
t('지어낸 질문은 빼고 질문지 질문으로',
  withQuestionnaire('모래성을 쌓으셨군요! 그때 날씨는 어땠나요?', cands, { random: () => 0.9 }),
  '모래성을 쌓으셨군요! 이날 또 기억나는 일이 있으세요?');
t('"궁금해요" 도 빼고',
  withQuestionnaire('꽃을 키우셨군요. 어떤 꽃인지 궁금해요.', cands, { random: () => 0 }),
  '꽃을 키우셨군요. 그날 먹었던 음식 중 기억나는 게 있으세요?');
t('남는 말이 없으면 맞장구와 함께',
  withQuestionnaire('그때 날씨는 어땠나요?', cands, { random: () => 0, fallback: '그러셨군요.' }),
  '그러셨군요. 그날 먹었던 음식 중 기억나는 게 있으세요?');
t('후보가 없으면 그대로', withQuestionnaire('그러셨군요.', []), '그러셨군요.');

console.log('\n[질문지에 있는 질문은 "누구" 가 들어가도 뺄 수 없다]');
t('질문지 질문은 남긴다',
  dropQuizQuestions('바다에 가셨군요. 이때 누구와 함께 계셨어요?', '그러셨군요.', ['이때 누구와 함께 계셨어요?']),
  '바다에 가셨군요. 이때 누구와 함께 계셨어요?');
t('지어낸 "누구" 질문은 뺀다',
  dropQuizQuestions('바다에 가셨군요. 누구랑 가셨어요?', '그러셨군요.', ['이때 누구와 함께 계셨어요?']), '바다에 가셨군요.');

console.log('\n[앞에서 한 말을 그대로 되풀이하지 않는다]');
t('되풀이한 문장은 빼고 질문은 남긴다 (실제 답)',
  dropRepeatedSentences('따님과 함께 가셨던 바다였군요. 이날 또 기억나는 일이 있으세요?',
    [OPEN, user('딸이랑 갔던 바다야'), bot('아, 따님과 함께 가셨던 바다였군요. 정말 즐거운 시간이셨겠어요.'), user('응')], '그러셨군요.'),
  '이날 또 기억나는 일이 있으세요?');
t('짧은 맞장구는 되풀이해도 둔다', dropRepeatedSentences('그러셨군요. 바다가 참 좋네요.', [bot('그러셨군요.')], ''), '그러셨군요. 바다가 참 좋네요.');
t('되풀이가 없으면 그대로', dropRepeatedSentences('수박을 드셨군요.', [bot('바다에 가셨군요.')], ''), '수박을 드셨군요.');
t('모두 되풀이였으면 대신할 말로',
  dropRepeatedSentences('따님과 함께 가셨던 바다였군요.', [bot('따님과 함께 가셨던 바다였군요.')], '그러셨군요.'), '그러셨군요.');

console.log('\n[그만하고 싶다고 하시면 — 마무리 인사]');
t('마무리 인사 (피드백 그대로)', CLOSING_LINE,
  '네, 오늘은 여기까지 할게요. 함께 사진을 보며 이야기해주셔서 고마워요. 다음에 이야기하고 싶을 때 다시 만나요.');
const stops = ['그만할래', '이제 됐어', '이제됐어.', '그만 볼래', '오늘은 여기까지 하자', '쉬고 싶어', '그만해', '이만할래', '그만하고 싶어', '그만.'];
t('그만하고 싶다는 말', stops.map(isStopIntent), stops.map(() => true));
const goes = ['딸이랑 갔던 바다야', '다른 사진 보자', '그만큼 좋았지', '됐어, 괜찮아', '이 사진은 보기 싫어. 그만해', ''];
t('그만하자는 뜻이 아니거나, 사진이 싫다는 말', goes.map(isStopIntent), goes.map(() => false));

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
