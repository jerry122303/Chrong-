/* 답 다듬기 규칙 — 실제 대화에서 나온 답으로 시험한다 */
import {
  hasQuestion, limitQuestions, stripQuestions, dropSoftQuestions, dropGuessedFeelings, safeReflection,
  pickCue, factSource, justGaveCue, cueSentence, attributeCue, isPause, pickFollowUp,
  priorMisses, recallSteps, withReaction, photoMaterial,
  dropQuizQuestions, dropGuessedPeople, plainReaction, canonicalWord, sameValue,
} from './reply-rules.js';
import { openingLine, RECALL_QUESTION } from '../public/recall-opening.js';

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}`);
};

console.log('[질문 예산]');
t('질문하면 안 되는 차례면 질문 문장을 뺀다',
  limitQuestions('딸과 바다에 가셨군요. 그날 뭐 하셨어요?', false), '딸과 바다에 가셨군요.');
t('하나까지면 마지막 질문만 남긴다',
  limitQuestions('그러셨군요? 좋네요. 그날 기억나는 일이 또 있으세요?', true), '좋네요. 그날 기억나는 일이 또 있으세요?');
t('다 빠지면 원문을 둔다', limitQuestions('어떠셨어요?', false), '어떠셨어요?');
t('물음표 알아보기', [hasQuestion('뭐예요?'), hasQuestion('그렇군요.')], [true, false]);

console.log('\n[같은 분을 다르게 부르실 때 — 기억을 두 번 쌓지 않는다]');
t('손자 · 손녀는 손주로 묶는다',
  [canonicalWord('손자'), canonicalWord('손녀'), canonicalWord('손주')], ['손주', '손주', '손주']);
t('따님과 딸은 같은 분', sameValue(['따님'], ['딸']), true);
t('적으신 차례가 달라도 같다', sameValue(['딸', '사위'], ['사위', '따님']), true);
t('띄어쓰기만 다른 것도 같다', sameValue('강릉 바닷가', '강릉바닷가'), true);
t('다른 분은 다르게 본다', sameValue(['딸'], ['며느리']), false);
t('모르는 낱말은 그대로 둔다', canonicalWord('영수'), '영수');

console.log('\n[물음표만 없는 질문]');
t('"궁금하네요" 는 걷어낸다 (실제 답)',
  dropSoftQuestions('부산 바닷가에 다녀오셨군요. 어떤 일이 있었는지 궁금하네요.'), '부산 바닷가에 다녀오셨군요.');
t('되받는 말만 있으면 그대로', dropSoftQuestions('딸과 함께 바다에 가셨던 기억이군요.'), '딸과 함께 바다에 가셨던 기억이군요.');
t('숨은 질문뿐이던 답은 대신할 말로',
  dropSoftQuestions('그 성이 어떤 모양이었는지 궁금하네요.', '그러셨군요.'), '그러셨군요.');

console.log('\n[말씀하지 않은 기분을 짐작해 붙이지 않는다 — 실제로 나온 답]');
const plain = '그러셨군요.';
const real = [
  ['딸과 바다에 가셨던 기억이 떠오르셨군요. 정말 즐거운 시간이셨겠어요.', '딸과 바다에 가셨던 기억이 떠오르셨군요.'],
  ['딸이 조개를 많이 주워오고, 어르신께서는 파라솔 밑에서 수박을 자르셨군요. 정말 행복한 한때셨겠어요.',
   '딸이 조개를 많이 주워오고, 어르신께서는 파라솔 밑에서 수박을 자르셨군요.'],
  ['그날의 즐거운 추억이 잘 떠오르시나 봐요. 함께한 시간이 정말 귀중했겠어요.', plain],
  ['딸과 함께 바다에 가셨던 기억이 떠오르시는군요. 그때 즐거운 시간을 보내셨겠어요.', '딸과 함께 바다에 가셨던 기억이 떠오르시는군요.'],
  ['따님과 바다에 가셨던 기억이 떠오르시는군요. 즐거운 시간이었겠어요.', '따님과 바다에 가셨던 기억이 떠오르시는군요.'],
  ['딸과 함께 바다에 간 기억이 떠오르셨군요. 정말 소중한 시간이셨겠어요.', '딸과 함께 바다에 간 기억이 떠오르셨군요.'],
  ['부산 바닷가에 다녀오셨군요. 바닷바람이 시원했겠어요.', '부산 바닷가에 다녀오셨군요.'],
  ['아, 딸과 함께 가셨던 곳이군요. 정말 특별한 시간이셨겠어요.', '아, 딸과 함께 가셨던 곳이군요.'],
  ['딸과 함께 바다에 가셨던 기억이군요. 정말 특별했을 것 같아요.', '딸과 함께 바다에 가셨던 기억이군요.'],
  ['딸이 조개를 한 바구니나 주웠군요. 수박도 정말 맛있었겠어요.', '딸이 조개를 한 바구니나 주웠군요.'],
];
real.forEach(([got, want], i) => t(`실제 답 ${i + 1}`, dropGuessedFeelings(got, '딸이랑 갔던 바다야', { fallback: plain }), want));
t('어르신이 먼저 그 기분을 말씀하셨으면 남긴다',
  dropGuessedFeelings('딸과 바다에 가셨군요. 정말 즐거우셨겠어요.', '그때 참 즐거웠지'), '딸과 바다에 가셨군요. 정말 즐거우셨겠어요.');
t('아픈 이야기를 헤아리는 말은 남긴다',
  dropGuessedFeelings('무릎이 아프셨군요. 많이 힘드셨겠어요.', '무릎이 아파'), '무릎이 아프셨군요. 많이 힘드셨겠어요.');
t('기분이 아닌 짐작은 건드리지 않는다',
  dropGuessedFeelings('바닷가에 가셨군요. 그날은 비가 올 것 같아요.', ''), '바닷가에 가셨군요. 그날은 비가 올 것 같아요.');
t('대신할 말을 주지 않으면 한 문장뿐인 짐작도 그대로 둔다 (말이 없어지면 안 된다)',
  dropGuessedFeelings('즐거우셨겠어요.', ''), '즐거우셨겠어요.');
t('짐작하지 않는 말은 건드리지 않는다',
  dropGuessedFeelings('네, 다른 사진을 가져올게요.', '다른 사진 보자'), '네, 다른 사진을 가져올게요.');

console.log('\n[짐작이 아니라 단정해도 걷어낸다 — 실제로 나온 답]');
t('"특별한 시간이셨네요" 는 걷어내고 질문은 남긴다 (실제 답)',
  dropGuessedFeelings('딸과 함께한 바닷가에서의 특별한 시간이셨네요. 그날 수박 맛이 어땠나요?', '딸이랑 갔던 바다야\n그랬지 뭐.'),
  '그날 수박 맛이 어땠나요?');
t('"즐거우셨군요" 도 말씀하지 않으셨으면 단정이다',
  dropGuessedFeelings('따님이 모래성을 만드셨군요. 즐거우셨군요.', '딸이 모래성을 만들었어'), '따님이 모래성을 만드셨군요.');
t('"즐거운 추억이 떠오르시나 봐요" 도 짐작이다',
  dropGuessedFeelings('바다에 가셨군요. 즐거운 추억이 떠오르시나 봐요.', '바다에 갔지'), '바다에 가셨군요.');
t('앞서 하신 말씀에 있던 기분이면 다른 꼴이어도 되받는 말이다',
  dropGuessedFeelings('참 재미있는 시간이셨군요.', '그때 참 재밌었지\n그랬지 뭐.'), '참 재미있는 시간이셨군요.');
t('기분 하나라도 말씀하지 않으셨으면 걷어낸다',
  dropGuessedFeelings('바다에 가셨군요. 즐겁고 행복한 시간이셨네요.', '참 즐거웠어'), '바다에 가셨군요.');
t('고마움을 전하는 말은 남긴다 (실제 답)',
  dropGuessedFeelings('소중한 이야기 들려주셔서 감사합니다. 편히 쉬세요.', '이제 그만할래'), '소중한 이야기 들려주셔서 감사합니다. 편히 쉬세요.');
t('기분을 여쭙는 질문은 남긴다', dropGuessedFeelings('그때 기분이 좋으셨어요?', ''), '그때 기분이 좋으셨어요?');
t('사진에 보이는 것은 남긴다',
  dropGuessedFeelings('괜찮아요. 아름다운 꽃들이 보이네요.', '잘 모르겠어요'), '괜찮아요. 아름다운 꽃들이 보이네요.');

console.log('\n[짐작뿐이던 답은 대신할 말로 — 이야기가 멈췄을 때 실제로 나온 답]');
const instead = '그러셨군요. 그날 기억나는 일이 또 있으세요?';
[
  ['즐거운 시간이셨겠어요. 조개들도 많이 모으고, 수박도 맛있게 드셨겠네요.', '그랬지 뭐.'],
  ['모래성을 만들며 즐거운 시간을 보내셨겠어요.', '그랬어.'],
  ['해변에서 가족과 함께하셨던 즐거운 시간이었겠어요.', '응.'],
].forEach(([got, user], i) => t(`짐작뿐인 답 ${i + 1}`, dropGuessedFeelings(got, user, { fallback: instead }), instead));
t('되받는 말이 남으면 대신할 말을 쓰지 않는다',
  dropGuessedFeelings('따님이 모래성을 만드셨군요. 즐거우셨겠어요.', '그랬어.', { fallback: instead }), '따님이 모래성을 만드셨군요.');

console.log('\n[모델이 따로 보낸 되받는 말 — 남는 말이 없을 때 대신 쓴다]');
t('되받는 한 문장은 쓴다',
  safeReflection('딸과 함께 바다에 가셨던 기억이 떠오르셨군요.', '딸이랑 갔던 바다야'), '딸과 함께 바다에 가셨던 기억이 떠오르셨군요.');
t('질문이 있으면 못 쓴다', safeReflection('바다에 가셨군요. 누구랑 가셨어요?', ''), '');
t('짐작한 기분이 있으면 못 쓴다', safeReflection('즐거운 시간이셨겠어요.', '딸이랑 갔던 바다야'), '');
t('숨은 질문이 있으면 못 쓴다', safeReflection('어떤 일이 있었는지 궁금하네요.', ''), '');
t('비었거나 너무 길면 못 쓴다', [safeReflection('', ''), safeReflection(`${'가'.repeat(81)}.`, '')], ['', '']);

console.log('\n[듣는 차례에는 질문하지 않는다]');
t('질문뿐이던 답은 대신할 말로 (실제 답)',
  stripQuestions('어떤 모양의 성이었나요?', '그러셨군요.'), '그러셨군요.');
t('되받는 말이 있으면 질문만 뺀다',
  stripQuestions('모래성을 만드셨군요. 어떤 모양이었어요?', '그러셨군요.'), '모래성을 만드셨군요.');
t('질문이 없으면 그대로', stripQuestions('따님이 모래성을 만드셨군요.', '그러셨군요.'), '따님이 모래성을 만드셨군요.');

console.log('\n[이야기가 멈추신 말 알아보기]');
const pauses = ['그랬지 뭐.', '그랬어.', '응.', '응', '응, 그랬지 뭐.', '그게 다야', '네.'];
t('짧게 맺으시는 말', pauses.map(isPause), pauses.map(() => true));
const going = ['딸이 모래성을 만들었어', '그랬지, 딸이 좋아했어', '기억이 안 나요', '응, 다른 사진 보자', '음...', ''];
t('이야기가 이어지거나, 떠올리시는 중이거나, 다른 뜻인 말은 아니다', going.map(isPause), going.map(() => false));

console.log('\n[멈췄을 때 여쭐 열린 질문 — 되풀이하지 않는다]');
const bot = (content) => ({ role: 'assistant', content });
t('첫 물음 다음에는 그날의 다른 기억',
  pickFollowUp([bot('이 사진을 보면 어떤 기억이 떠오르세요?')]), '그날 기억나는 일이 또 있으세요?');
t('이미 여쭌 것은 건너뛴다',
  pickFollowUp([bot('그날 기억나는 일이 또 있으세요?')]), '그때 기분은 어떠셨어요?');
t('말만 달리 여쭌 것도 여쭌 것으로 친다',
  pickFollowUp([bot('그날 바다에서 또 어떤 일이 있었어요?'), bot('그때 기분이 어떠셨어요?')]), '그다음에는 어떻게 되었어요?');
t('질문이 아닌 말에 나온 낱말은 여쭌 것이 아니다',
  pickFollowUp([bot('그날 기억나는 일이 또 있으세요?'), bot('따님이 기분 좋게 웃었다고 하셨군요.')]), '그때 기분은 어떠셨어요?');
t('다 여쭸으면 null',
  pickFollowUp([bot('또 기억나는 일이 있으세요?'), bot('기분은 어떠셨어요?'), bot('그 뒤에는 어떻게 됐어요?')]), null);

console.log('\n[단서는 한 가지씩, 누가 적었는지 그대로]');
const caregiverMemory = { verification_status: 'CAREGIVER_VERIFIED', claims: [] };
const facts = { title: '가족 여름휴가', people: ['딸', '사위'], place: '강릉 바닷가', when_text: '서른 해쯤 전' };
t('처음에는 함께한 사람', pickCue(caregiverMemory, facts, []),
  { field: 'people', value: '딸, 사위', source: 'CAREGIVER' });
t('어르신이 "딸" 을 말씀하셨으면 사람은 건너뛰고 장소',
  pickCue(caregiverMemory, facts, [{ role: 'user', content: '딸이랑 갔던 바다야' }]).field, 'place');
t('초롱이가 "따님" 으로 이미 건넸어도 사람은 건너뛴다',
  pickCue(caregiverMemory, facts, [bot('따님과 함께였대요.')]).field, 'place');
t('초롱이가 이미 건넨 장소도 건너뛴다',
  pickCue(caregiverMemory, facts, [
    { role: 'user', content: '딸이랑 갔던 바다야' },
    bot('보호자분이 강릉 바닷가라고 적어 두셨어요.'),
  ]).field, 'when_text');
t('다 나왔으면 null',
  pickCue(caregiverMemory, facts, [{ role: 'user', content: '딸 사위랑 강릉 바닷가, 서른 해쯤 전 가족 여름휴가' }]), null);
t('적어 둔 게 없으면 null', pickCue({ verification_status: 'VERIFIED' }, {}, []), null);
t('어르신이 확인해 주신 것은 어르신 이야기로',
  factSource({ verification_status: 'VERIFIED', claims: [{ field: 'place', status: 'VERIFIED', source: 'USER', decided_at: '2026-09-14T00:00:00Z' }] }, 'place'), 'USER');
t('보호자가 등록한 것은 보호자 기록으로', factSource(caregiverMemory, 'place'), 'CAREGIVER');
t('사진을 올리며 적은 제목은 그때 적은 것으로', factSource({ verification_status: 'VERIFIED', claims: [] }, 'title'), 'UPLOAD');

console.log('\n[단서를 건넸는데도 모르시면 또 건네지 않는다]');
const opening = bot(openingLine());
t('방금 초롱이가 "사위" 를 꺼냈으면 단서를 건넨 것',
  justGaveCue(facts, [opening, { role: 'user', content: '기억이 안 나요' },
    bot('괜찮아요. 보호자분이 따님과 사위분이 함께라고 적어 두셨어요.')]), true);
t('"따님" 으로 건넨 것도 건넨 것',
  justGaveCue(facts, [opening, { role: 'user', content: '기억이 안 나요' }, bot('괜찮아요. 따님과 함께 가신 곳이래요.')]), true);
t('어르신이 먼저 말씀하신 "딸" 을 되받은 것은 건넨 것이 아니다',
  justGaveCue(facts, [opening, { role: 'user', content: '딸이랑 갔던 바다야' }, bot('딸과 함께 바다에 가셨군요.')]), false);
t('첫 물음만 있으면 아직 건네지 않았다', justGaveCue(facts, [opening]), false);
t('초롱이 말이 없으면 false', justGaveCue(facts, []), false);

console.log('\n[적어 둔 내용을 건넬 때는 누가 적었는지 밝힌다 — 실제로 나온 답]');
const peopleCue = { field: 'people', value: '딸, 사위', source: 'CAREGIVER' };
t('단서 문장 — 보호자', cueSentence(peopleCue), "보호자분이 함께한 분을 '딸, 사위'라고 적어 두셨어요.");
t('단서 문장 — 받침이 있으면 이라고',
  cueSentence({ field: 'when_text', value: '서른 해쯤 전', source: 'CAREGIVER' }), "보호자분이 때를 '서른 해쯤 전'이라고 적어 두셨어요.");
t('단서 문장 — 어르신이 들려주신 것',
  cueSentence({ field: 'place', value: '강릉 바닷가', source: 'USER' }), "전에 장소를 '강릉 바닷가'라고 들려주셨어요.");
t('단서 문장 — 올리실 때 적은 것',
  cueSentence({ field: 'title', value: '가족 여름휴가', source: 'UPLOAD' }), "사진을 올리실 때 이 사진을 '가족 여름휴가'라고 적어 두셨어요.");
t('누가 적었는지 없이 건넨 단서는 밝히는 문장으로 (실제 답)',
  attributeCue('기억이 안 나셔도 괜찮아요. 이 사진에는 따님과 사위분이 함께 계셨대요. 혹시 떠오르는 게 있으시면 편하게 들려주세요.',
    peopleCue, '기억이 안 나요'),
  "기억이 안 나셔도 괜찮아요. 보호자분이 함께한 분을 '딸, 사위'라고 적어 두셨어요. 혹시 떠오르는 게 있으시면 편하게 들려주세요.");
t('보호자 기록을 어르신이 하신 말처럼 건넨 것도 (실제 답)',
  attributeCue('괜찮아요, 기억이 안 나셔도 됩니다. 이 사진은 딸과 사위와 함께 있는 모습이라고 하셨어요. 떠오르는 이야기 있으시면 편하게 들려주세요.',
    peopleCue, '기억이 안 나요'),
  "괜찮아요, 기억이 안 나셔도 됩니다. 보호자분이 함께한 분을 '딸, 사위'라고 적어 두셨어요. 떠오르는 이야기 있으시면 편하게 들려주세요.");
t('밝혔으면 그대로 (실제 답)',
  attributeCue('기억이 안 나셔도 괜찮아요. 보호자분이 적어주신 것에 따르면 따님과 사위분이 함께 하셨대요.', peopleCue, '기억이 안 나요'),
  '기억이 안 나셔도 괜찮아요. 보호자분이 적어주신 것에 따르면 따님과 사위분이 함께 하셨대요.');
t('어르신이 먼저 말씀하신 낱말을 되받은 것은 그대로',
  attributeCue('따님과 사위분이랑 가셨군요.', peopleCue, '딸이랑 사위랑 갔지'), '따님과 사위분이랑 가셨군요.');
t('단서를 꺼내지 않았으면 그대로',
  attributeCue('괜찮아요. 천천히 떠올리셔도 돼요.', peopleCue, '기억이 안 나요'), '괜찮아요. 천천히 떠올리셔도 돼요.');
t('건넬 단서가 없으면 그대로', attributeCue('따님과 가셨군요.', null, ''), '따님과 가셨군요.');
t('"들려주세요" 는 청하는 말이라 밝힌 것이 아니다',
  attributeCue('강릉 바닷가였대요. 편하게 들려주세요.', { field: 'place', value: '강릉 바닷가', source: 'USER' }, '기억이 안 나'),
  "전에 장소를 '강릉 바닷가'라고 들려주셨어요. 편하게 들려주세요.");

console.log('\n[기억이 안 난다고 하실 때는 두 걸음 — 실제로 나온 답]');
const miss1 = [opening, { role: 'user', content: '기억이 안 나요' }];
t('첫 물음 뒤 처음이면 0', priorMisses(miss1), 0);
const miss2 = [...miss1, bot("보호자분이 함께한 분을 '딸, 사위'라고 적어 두셨어요."), { role: 'user', content: '그래도 모르겠어' }];
t('단서 뒤 또 모르신다고 하시면 1', priorMisses(miss2), 1);
t('앞 사진에서 하신 말씀은 세지 않는다',
  priorMisses([...miss2, bot('네, 다른 사진을 가져올게요.'), opening, { role: 'user', content: '잘 모르겠네' }]), 0);
t('처음에는 단서만 — 넘어가자는 말은 빼고 떠올리실 틈을 (실제 답)',
  recallSteps("기억이 안 나셔도 괜찮아요. 보호자분이 함께한 분을 '딸, 사위'라고 적어 두셨어요. 다른 사진을 보실까요?", 0),
  "기억이 안 나셔도 괜찮아요. 보호자분이 함께한 분을 '딸, 사위'라고 적어 두셨어요. 떠오르는 게 있으시면 편하게 들려주세요.");
t('사진에 보이는 것을 단서로 건넨 답도 (실제 답)',
  recallSteps('괜찮습니다, 기억이 안 나셔도 됩니다. 사진에 꽃이 보이네요. 다른 사진을 보시겠어요?', 0),
  '괜찮습니다, 기억이 안 나셔도 됩니다. 사진에 꽃이 보이네요. 떠오르는 게 있으시면 편하게 들려주세요.');
t('단서와 청하는 말만 있으면 그대로 (실제 답)',
  recallSteps("보호자분이 함께한 분을 '딸, 사위'라고 적어 두셨어요. 생각나는 게 있으시면 편하게 들려주세요.", 0),
  "보호자분이 함께한 분을 '딸, 사위'라고 적어 두셨어요. 생각나는 게 있으시면 편하게 들려주세요.");
t('처음에 단서 없이 넘어갈지만 여쭌 답은 그대로', recallSteps('괜찮아요. 다른 사진을 보실까요?', 0), '괜찮아요. 다른 사진을 보실까요?');
t('그래도 모르시면 단서를 또 건네지 않는다 (실제 답)',
  recallSteps('괜찮으세요. 이 사진은 바닷가에서 찍은 것 같네요. 다른 사진으로 넘어가 보실까요?', 1),
  '괜찮으세요. 다른 사진으로 넘어가 보실까요?');
t('그래도 모르시는데 넘어갈지 여쭙지 않았으면 여쭙는다',
  recallSteps('괜찮아요. 천천히 생각하셔도 돼요.', 1), '괜찮아요. 천천히 생각하셔도 돼요. 다른 사진을 보실까요?');
t('단서뿐이던 답이면 안심시키는 말과 함께 여쭙는다',
  recallSteps("보호자분이 장소를 '강릉 바닷가'라고 적어 두셨어요.", 1), '괜찮아요. 다른 사진을 보실까요?');

console.log('\n[자연스럽게 주고받기 — 질문만 달랑 하지 않는다]');
t('질문뿐인 답에는 반응 한마디를 앞에',
  withReaction('그 모래성은 얼마나 컸어요?', '우와, 모래성을요!'), '우와, 모래성을요! 그 모래성은 얼마나 컸어요?');
t('반응이 있으면 그대로',
  withReaction('우와, 모래성을요! 얼마나 컸어요?', '좋네요.'), '우와, 모래성을요! 얼마나 컸어요?');
t('질문이 없으면 그대로', withReaction('사진 속 파라솔 색이 참 곱네요.', '우와.'), '사진 속 파라솔 색이 참 곱네요.');
t('반응 한마디가 없으면 그대로', withReaction('얼마나 컸어요?', ''), '얼마나 컸어요?');

console.log('\n[사진에서 살펴본 것을 이야깃거리로]');
const beach = { status: 'DONE', people_count: 3, objects: ['파라솔', '수박', '돗자리'], place_label: '바닷가', activity_label: '물놀이' };
t('장소 · 하는 일 · 보이는 것 · 사람',
  photoMaterial(beach, []), '장소 — 바닷가 · 하는 일 — 물놀이 · 보이는 것 — 파라솔, 수박, 돗자리 · 사람 — 세 명');
t('이미 대화에 나온 것(첫 말 포함)은 뺀다',
  photoMaterial(beach, [bot('바닷가에서 찍은 사진이네요. 파라솔이랑 수박도 보이네요.')]),
  '하는 일 — 물놀이 · 보이는 것 — 돗자리 · 사람 — 세 명');
t('아직 살펴보는 중이거나 결과가 없으면 빈 문자열',
  [photoMaterial({ status: 'PENDING' }, []), photoMaterial(null, [])], ['', '']);

console.log('\n[첫 말 — 통합 프롬프트 5번이 정한 문장 그대로]');
t('첫 말은 늘 같다', openingLine(), `사진이 잘 등록됐어요. ${RECALL_QUESTION}`);
t('사진을 보고 짚는 말을 붙이지 않는다 (문서 5번 — 첫 질문에서 추측 금지)',
  /바닷가|파라솔|수박|여러 분/.test(openingLine()), false);

console.log('\n[정답이 있는 물음은 하지 않는다 — 실제로 나온 답]');
t('"언제부터" 는 뺀다 (실제 답)',
  dropQuizQuestions('정성스럽게 키우신 꽃이군요. 꽃은 언제부터 키우기 시작하셨어요?', '그러셨군요.'), '정성스럽게 키우신 꽃이군요.');
t('누구 · 어디 · 몇 년도 뺀다',
  ['누구랑 가셨어요?', '거기가 어디였어요?', '그게 몇 년이었어요?'].map((q) => dropQuizQuestions(`좋네요. ${q}`, '그러셨군요.')),
  ['좋네요.', '좋네요.', '좋네요.']);
t('이야기를 풀어놓게 하는 물음은 그대로',
  dropQuizQuestions('꽃이 참 곱네요. 어떤 꽃을 제일 좋아하세요?', '그러셨군요.'), '꽃이 참 곱네요. 어떤 꽃을 제일 좋아하세요?');
t('물음이 아닌 말은 건드리지 않는다', dropQuizQuestions('언제 봐도 좋은 사진이네요.', ''), '언제 봐도 좋은 사진이네요.');

console.log('\n[함께한 사람을 짐작하지 않는다 — 실제로 나온 답]');
t('"친구분들과 함께 하셨나 봐요" 는 뺀다 (실제 답)',
  dropGuessedPeople('친구분들과 함께 하셨나 봐요.', '그때는 다들 젊었지', '아, 그러셨어요.'), '아, 그러셨어요.');
t('어르신이 말씀하신 사람이면 그대로 ("딸" → "따님")',
  dropGuessedPeople('따님이랑 신나게 노셨나 봐요.', '딸이랑 갔던 바다야', ''), '따님이랑 신나게 노셨나 봐요.');
t('짐작하는 말끝이 아니면 그대로', dropGuessedPeople('사위분이 고기를 구우셨군요.', '사위는 고기를 구웠지', ''), '사위분이 고기를 구우셨군요.');

console.log('\n[남는 말이 없을 때 맞장구 — 바로 앞과 겹치지 않게]');
t('차례대로 다른 말',
  [plainReaction([]), plainReaction([bot('그러셨군요.')]), plainReaction([bot('그러셨군요.'), bot('아, 그러셨어요.')])],
  ['그러셨군요.', '아, 그러셨어요.', '네, 그렇군요.']);

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
