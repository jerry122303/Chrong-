/* 대화 종료 · 표정 측정 · 정서 추세를 시험한다.
   전달 패키지의 QA 문항(reminiscence_termination_and_analytics_test.json)을 그대로 옮겼다.
   - TC_TERM_01                    종료 버튼 → 고정 발화와 표정 버튼
   - TC_NO_KEYWORD_FALSE_POSITIVE  대화 중 낱말로 기분을 재지 않는다
   - TC_EMOTION_MAPPING_01         표정 셋과 DB 점수 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  TERMINATION_UTTERANCE, TERMINATION_UI_ACTION, TERMINATION_TYPES,
  EMOTION_CHOICES, EMOTION_RATINGS, emotionScore, emotionChoice, trendReport, THANKS,
} from './termination.js';
import { noteFromTalk } from './care-api.js';
import { SessionStore } from './session-store.js';

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}`);
};

console.log('[TC_TERM_01 — 종료 버튼을 누르셨을 때]');
t('고정 발화가 명세서 문장 그대로',
  TERMINATION_UTTERANCE,
  '네, 오늘 이야기는 여기서 마칠게요. 저와 이야기 나누시니 지금 기분이 어떠신지 화면의 얼굴 표정을 하나 눌러주세요.');
t('이 인사 뒤에 화면이 할 일', TERMINATION_UI_ACTION, 'SHOW_3_EMOTION_BUTTONS');
t('고정 발화에 점수를 묻는 말이 없음', /몇 점|점수|얼마나 좋아/.test(TERMINATION_UTTERANCE), false);
t('초롱이가 끊는 종료 유형은 없음', TERMINATION_TYPES, ['IN_PROGRESS', 'USER_CLICK_END_BUTTON']);

console.log('\n[TC_EMOTION_MAPPING_01 — 표정 셋과 DB 점수]');
t('세 가지만 여쭙는다', EMOTION_CHOICES.length, 3);
t('😊 편안해요 → 3점', [emotionChoice('COMFORTABLE').emoji, emotionScore('COMFORTABLE')], ['😊', 3]);
t('😐 보통이에요 → 2점', [emotionChoice('NEUTRAL').emoji, emotionScore('NEUTRAL')], ['😐', 2]);
t('😞 피곤해요 → 1점', [emotionChoice('DISCOMFORT').emoji, emotionScore('DISCOMFORT')], ['😞', 1]);
t('버튼 글씨도 명세서대로',
  EMOTION_CHOICES.map((c) => `${c.label} / ${c.sub}`),
  ['편안해요 / 좋아요', '보통이에요 / 괜찮아요', '피곤해요 / 불편해요']);
t('모르는 값은 점수가 없다', emotionScore('HAPPY'), null);
t('마칠 때 드리는 말에 평가가 없음',
  Object.values(THANKS).some((line) => /좋아지|나아지|효과/.test(line)), false);

console.log('\n[TC_NO_KEYWORD_FALSE_POSITIVE_01 — 대화 중 낱말로 재지 않는다]');
const PAST = '옛날에 소풍 가서 길을 잃어서 되게 무섭고 불안했던 기억이 있어.';
const stub = () => ({
  calls: [],
  async setMood(_owner, mood) { this.calls.push(`mood:${mood.key}`); return mood; },
  async takeMedication() { this.calls.push('med'); return {}; },
  async noteTurn() { this.calls.push('turn'); },
});

const recallStore = stub();
const recallNote = await noteFromTalk(recallStore, 'user_01', PAST, { keywords: false });
t('회상 대화에서는 기분을 적지 않는다', recallNote.mood, null);
t('기분을 재는 호출 자체가 없다', recallStore.calls, ['turn']);

const healthStore = stub();
const healthNote = await noteFromTalk(healthStore, 'user_01', '오늘은 좀 우울하네', {});
t('건강관리 이야기에서는 오늘 기분을 적는다', Boolean(healthNote.mood), true);

console.log('\n[세션 기록 — 마치신 뒤 고르신 표정만 남는다]');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chorong-term-'));
const sessions = new SessionStore(dir);

const s1 = await sessions.start({ owner_id: 'user_01', memory_id: 'memory_1' });
t('새 회기는 진행 중', [s1.termination_type, s1.turns_used, s1.selected_emotion],
  ['IN_PROGRESS', 0, null]);

await sessions.appendTurn(s1.session_id, { role: 'user', text: PAST });
await sessions.appendTurn(s1.session_id, { role: 'assistant', text: '그러셨군요.' });
await sessions.appendTurn(s1.session_id, { role: 'user', text: '친구들이랑 갔었지.' });
const talked = await sessions.get(s1.session_id);
t('나눈 차례를 센다 (어르신 말씀 기준)', talked.turns_used, 2);
t('대화 중에는 기분이 비어 있다', talked.selected_emotion, null);

const ended = await sessions.terminate(s1.session_id);
t('종료 버튼을 누르시면 종료 유형이 바뀐다', ended.termination_type, 'USER_CLICK_END_BUTTON');
t('표정을 고르시기 전에는 아직 안 닫힌다', ended.ended_at, null);

const rated = await sessions.recordEmotion(s1.session_id, 'COMFORTABLE');
t('고르신 표정과 점수가 남는다',
  [rated.selected_emotion, rated.emotion_score], ['COMFORTABLE', 3]);
t('마치신 분은 어르신이다', rated.ended_by, 'USER');
t('닫힌 시각이 남는다', typeof rated.ended_at === 'string', true);
t('모르는 표정은 받지 않는다', await sessions.recordEmotion(s1.session_id, 'GREAT'), null);

console.log('\n[추세 — 고르신 회기만 센다]');
t('아직 고르신 적이 없으면', trendReport([]).total_sessions, 0);
t('그때의 요약 문구', /아직/.test(trendReport([]).executive_summary), true);

const at = (n) => `2026-09-${String(n).padStart(2, '0')}T09:00:00.000Z`;
const ses = (n, rating) => ({
  started_at: at(n), selected_emotion: rating, emotion_score: emotionScore(rating),
});
const some = [
  ses(1, 'NEUTRAL'), ses(2, 'DISCOMFORT'), ses(3, 'NEUTRAL'),
  ses(4, 'COMFORTABLE'), ses(5, 'COMFORTABLE'), ses(6, 'COMFORTABLE'),
  { started_at: at(7), selected_emotion: null },   // 고르지 않고 마치신 회기
];
const report = trendReport(some);
t('고르지 않으신 회기는 세지 않는다', report.total_sessions, 6);
t("'편안해요' 비율", report.comfortable_ratio_percent, 50);
t('초기 세션(1~3회차) 평균', report.early_session_avg_score, 1.67);
t('그 뒤 회기 평균', report.late_session_avg_score, 3);
t('변화량', report.score_improvement, 1.33);
t('요약에 회차와 비율이 들어간다',
  /최근 6회차/.test(report.executive_summary) && /50\.0%/.test(report.executive_summary), true);
t('올랐을 때의 말', /올라/.test(report.executive_summary), true);
t('최근 회기를 오래된 것부터 돌려준다',
  report.recent.map((r) => r.score), [2, 1, 2, 3, 3, 3]);

const flat = trendReport([ses(1, 'NEUTRAL'), ses(2, 'NEUTRAL')]);
t('비슷하면 올랐다 하지 않는다', /비슷하게/.test(flat.executive_summary), true);
const down = trendReport([ses(1, 'COMFORTABLE'), ses(2, 'DISCOMFORT')]);
t('내려갔으면 살펴보시라 한다', /살펴/.test(down.executive_summary), true);
t('한 회기만 있어도 셈이 깨지지 않는다',
  trendReport([ses(1, 'COMFORTABLE')]).score_improvement, 0);

console.log('\n[저장소 추세]');
t('저장소에서도 같은 값', (await sessions.trend('user_01')).total_sessions, 1);
t('아직 안 고르신 어르신', (await sessions.trend('user_99')).total_sessions, 0);

await fs.rm(dir, { recursive: true, force: true });
console.log(fail === 0 ? '\n모두 통과' : `\n${fail}개 실패`);
process.exit(fail === 0 ? 0 : 1);
