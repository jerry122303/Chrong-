/* MEMORY / SESSION 저장 구조 검증. 임시 폴더에서만 돌린다 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from './memory-store.js';
import { SessionStore } from './session-store.js';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chorong-store-'));
const mem = new MemoryStore(dir);
const ses = new SessionStore(dir);

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}`);
};

console.log('[MEMORY — 기본]');
const wedding = await mem.create({
  owner_id: 'user_01', title: '딸의 결혼식', people: ['딸', '사위'], place: '서울',
  description: '결혼식 후 가족사진',
  verification_status: 'VERIFIED', verified_fields: ['title', 'people', 'place'],
});
t('만들면 기본값이 채워짐', [wedding.use_count, wedding.hidden, wedding.distress_flag], [0, false, false]);
t('읽어 오면 같은 값', (await mem.get(wedding.memory_id)).title, '딸의 결혼식');

console.log('\n[MEMORY — 프롬프트에 넘길 사실은 검증된 것만]');
t('검증 안 된 description 은 빠짐',
  Object.keys(mem.facts(wedding)).sort(), ['people', 'place', 'title']);

console.log('\n[MEMORY — 선택 순서 (문서 2번)]');
await mem.create({ owner_id: 'user_01', title: '감춘 사진', verification_status: 'VERIFIED', hidden: true });
await mem.create({ owner_id: 'user_01', title: '불편한 사진', verification_status: 'VERIFIED', distress_flag: true });
await mem.create({ owner_id: 'user_01', title: '미검증 사진' });
const old = await mem.create({
  owner_id: 'user_01', title: '오래 전에 본 사진', verification_status: 'VERIFIED',
  last_used_at: '2020-01-01T00:00:00.000Z',
});
const fav = await mem.create({
  owner_id: 'user_01', title: '좋아하시는 사진', verification_status: 'VERIFIED',
  favorite: true, last_used_at: '2024-01-01T00:00:00.000Z',
});

t('아직 대화 안 한 검증 사진이 먼저',
  (await mem.selectMemory('user_01')).title, '딸의 결혼식');

await mem.markUsed(wedding.memory_id);
t('그 다음은 좋아하시는 사진',
  (await mem.selectMemory('user_01')).title, '좋아하시는 사진');

await mem.markUsed(fav.memory_id, '2026-01-01T00:00:00.000Z');
// 문서 순서상 '선호 사진'이 '오래 사용하지 않은 사진'보다 앞이므로 그대로 유지된다
t('선호 사진이 오래된 사진보다 앞',
  (await mem.selectMemory('user_01')).title, '좋아하시는 사진');
t('이번 회기에서 이미 본 사진은 빼고 고름',
  (await mem.selectMemory('user_01', { excludeIds: [fav.memory_id, wedding.memory_id] })).title,
  '오래 전에 본 사진');

t('어르신이 직접 고르시면 순서를 무시',
  (await mem.selectMemory('user_01', { pickedId: fav.memory_id })).title, '좋아하시는 사진');

const picked = await mem.selectMemory('user_01', { pickedId: (await mem.listFor('user_01')).find(m => m.hidden).memory_id });
t('감춘 사진은 직접 골라도 안 나옴', picked.title !== '감춘 사진', true);

const names = (await mem.listFor('user_01')).map(m => m.title);
t('미검증·감춤·불편 사진은 자동 선택 후보에서 제외',
  names.filter(n => ['미검증 사진', '감춘 사진', '불편한 사진'].includes(n)).length, 3);

console.log('\n[MEMORY — 확인해야 사실이 된다 (문서 9번)]');
const claim = await mem.addClaim(old.memory_id, {
  field: 'place', value: '부산', source: 'MODEL', session_id: 'session_x',
});
t('모델이 뽑은 값은 UNVERIFIED 로 쌓임', claim.status, 'UNVERIFIED');
t('확인 전에는 프롬프트에 안 나감',
  Object.keys(mem.facts(await mem.get(old.memory_id))).includes('place'), false);

await mem.verifyClaim(old.memory_id, claim.claim_id, 'VERIFIED');
const afterVerify = await mem.get(old.memory_id);
t('확인하면 본문으로 올라감', afterVerify.place, '부산');
t('확인하면 프롬프트에도 나감',
  Object.keys(mem.facts(afterVerify)).includes('place'), true);

console.log('\n[MEMORY — 충돌은 지우지 않고 출처별로 남긴다]');
const other = await mem.addClaim(old.memory_id, {
  field: 'place', value: '대구', source: 'CAREGIVER',
});
await mem.verifyClaim(old.memory_id, other.claim_id, 'CAREGIVER_VERIFIED');
const conf = await mem.conflicts(old.memory_id);
t('어긋난 두 주장이 모두 남아 있음', conf.place.length, 2);
t('출처가 구분됨', conf.place.map(c => c.source).sort(), ['CAREGIVER', 'MODEL']);
t('나중에 확인한 값이 본문', (await mem.get(old.memory_id)).place, '대구');

console.log('\n[SESSION — MEMORY 를 가리킨다]');
const s1 = await ses.start({ owner_id: 'user_01', memory_id: wedding.memory_id, character: 'chorong' });
t('session 이 memory_id 를 가짐', s1.memory_id, wedding.memory_id);
t('memory 는 session 을 모름', 'session_id' in (await mem.get(wedding.memory_id)), false);

console.log('\n[SESSION — 차례를 쌓으면 알고리즘 값이 갱신된다]');
await ses.appendTurn(s1.session_id, { role: 'assistant', text: '어떤 기억이 떠오르세요?', response_mode: 'FOLLOW_UP', asked_question: true });
await ses.appendTurn(s1.session_id, { role: 'user', text: '딸 결혼식이지.' });
await ses.appendTurn(s1.session_id, { role: 'assistant', text: '따님 결혼식이셨군요.', response_mode: 'REFLECT_CONTENT' });
const s1b = await ses.appendTurn(s1.session_id, { role: 'user', text: '참 기뻤어.', user_reported_emotion: ['기쁨'] });
t('follow_up_count 증가', s1b.follow_up_count, 1);
t('last_response_mode 갱신', s1b.last_response_mode, 'REFLECT_CONTENT');
t('했던 질문을 기억', s1b.asked_questions, ['어떤 기억이 떠오르세요?']);
t('어르신이 말씀하신 감정만 모음', s1b.user_reported_emotion, ['기쁨']);

const closed = await ses.close(s1.session_id, { endedBy: 'USER', summary: '가족 이야기' });
t('종료 기록', [closed.ended_by, closed.summary], ['USER', '가족 이야기']);

console.log('\n[SESSION — 원문을 끄면 내용은 안 남고 지표는 남는다]');
const priv = new SessionStore(dir, { keepTranscript: false });
const s2 = await priv.start({ owner_id: 'user_02' });
const s2b = await priv.appendTurn(s2.session_id, { role: 'user', text: '아들 이야기를 했어.' });
t('원문은 비움', s2b.turns[0].text, '');
t('길이는 남김 (지표용)', s2b.turns[0].chars, 11);

console.log('\n[평가 지표]');
const met = await ses.metrics('user_01');
t('질문 수', met.questions, 1);
t('되짚기 수', met.reflections, 1);
t('연속 질문 없음', met.backToBackQuestions, 0);
t('어르신 발화 횟수', met.userTurns, 2);
t('질문당 되짚기 비율', met.reflectionPerQuestion, 1);
t('완료한 회기', met.completed, 1);

await fs.rm(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
