/* 사진 추천 점수 · 고르기 · 사진 살펴보기 결과 · 사진 파일 정보(EXIF). 임시 폴더에서만 돈다 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeMemory, makeTurn, cleanAnalysis, cleanMeta } from './records.js';
import { scorePhoto, rankPhotos, WEIGHTS } from './photo-score.js';
import { analyzePhoto, ANALYSIS_SCHEMA } from './photo-analyzer.js';
import { MemoryStore } from './memory-store.js';
import { ProfileStore } from './profile-store.js';
import { readExif, formatTakenDate } from '../public/exif.js';

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}`);
};

/** 모델이 살펴본 결과. 넘긴 것만 채우고 나머지는 '보이지 않음' */
const seen = (over = {}) => ({
  status: 'DONE', people_count: 0, objects: [], place_type: 'unknown', place_label: '',
  activity: 'none', activity_label: '', era_estimate: 'unknown', is_reproduction: false, ...over,
});
let seq = 0;
const photo = (over = {}) => makeMemory({
  memory_id: `memory_p${++seq}`, kind: 'PHOTO', title: '사진',
  photo: { file: 'photo_x.jpg' }, verification_status: 'VERIFIED', ...over,
});
const pts = (m, key, ctx) => scorePhoto(m, ctx).parts.find((p) => p.key === key).points;

console.log('[① 어르신이 고르신 중요도]');
t('★ 평범한 사진 +10', pts(photo({ importance: 1 }), 'importance'), 10);
t('★★ 소중한 사진 +20', pts(photo({ importance: 2 }), 'importance'), 20);
t('★★★ 매우 소중한 사진 +30', pts(photo({ importance: 3 }), 'importance'), 30);
t('아직 안 고르셨으면 0', pts(photo(), 'importance'), 0);
t('옛 즐겨찾기는 ★★ 로 본다', pts(photo({ favorite: true }), 'importance'), 20);

console.log('\n[② 회상 단서 — 사람 · 사물 · 장소 · 활동이 많을수록 오른다]');
const ladder = [
  seen(),
  seen({ people_count: 1 }),
  seen({ people_count: 2 }),
  seen({ people_count: 3 }),
  seen({ people_count: 3, objects: ['밥상'] }),
  seen({ people_count: 3, objects: ['밥상', '수박'] }),
  seen({ people_count: 3, objects: ['밥상', '수박'], place_type: 'nature' }),
  seen({ people_count: 3, objects: ['밥상', '수박'], place_type: 'nature', activity: 'meal' }),
  seen({ people_count: 9, objects: ['밥상', '수박', '부채', '평상', '양산'], place_type: 'nature', activity: 'meal' }),
].map((a) => pts(photo({ analysis: a }), 'cues'));
t('단서 0 → 8개 점수', ladder, [0, 3, 7, 10, 13, 17, 20, 20, 20]);
t('많을수록 줄지 않는다', ladder.every((v, i) => i === 0 || v >= ladder[i - 1]), true);
t(`최대 +${WEIGHTS.cues} 에서 멈춘다`, Math.max(...ladder), WEIGHTS.cues);
t('표의 예시 (가족 + 음식 + 바다 + 테이블) 는 만점',
  pts(photo({ analysis: seen({ people_count: 3, objects: ['음식', '테이블'], place_type: 'nature' }) }), 'cues'), 20);
t('사람 열 명은 단서 셋으로 친다', pts(photo({ analysis: seen({ people_count: 10 }) }), 'cues'), 10);
t('같은 사물은 한 번만 센다',
  pts(photo({ analysis: seen({ objects: ['밥상', '밥상', '자전거'] }) }), 'cues'), 7);

console.log('\n[③ 사람 · ④ 활동 · ⑤ 장소]');
t('사람이 있으면 +15', pts(photo({ analysis: seen({ people_count: 2 }) }), 'people'), 15);
t('사람이 없으면 0', pts(photo({ analysis: seen() }), 'people'), 0);
t('식사 장면이면 +15', pts(photo({ analysis: seen({ activity: 'meal' }) }), 'activity'), 15);
t('그냥 서서 찍은 사진이면 0', pts(photo({ analysis: seen({ activity: 'none' }) }), 'activity'), 0);
t('집이면 +10', pts(photo({ analysis: seen({ place_type: 'home' }) }), 'place'), 10);
t('사진관 배경은 장소 맥락이 아니다', pts(photo({ analysis: seen({ place_type: 'studio' }) }), 'place'), 0);

const notYet = scorePhoto(photo({ analysis: { status: 'PENDING' } }));
t('살펴보는 중이면 ②~⑤ 는 아직 0',
  notYet.parts.filter((p) => ['cues', 'people', 'activity', 'place'].includes(p.key)).map((p) => p.points), [0, 0, 0, 0]);
t('왜 0인지 알려 준다', notYet.parts.find((p) => p.key === 'people').reason, '살펴보는 중입니다');
t('사진 없는 기억도 점수는 매긴다', scorePhoto(photo({ photo: null, importance: 3 })).total, 40);

console.log('\n[⑥ 열 살에서 서른 살 무렵의 사진]');
const b1950 = { birthYear: 1950 };
t('1972년 (22세) +10', pts(photo({ taken_year: 1972 }), 'bump', b1950), 10);
t('1990년 (40세) 0', pts(photo({ taken_year: 1990 }), 'bump', b1950), 0);
t('태어나신 해를 모르면 0', pts(photo({ taken_year: 1972 }), 'bump', {}), 0);
t('사진 파일의 날짜로도 계산 (1975년)',
  pts(photo({ meta: { taken_at: '1975-06-01T10:00:00' } }), 'bump', b1950), 10);
t('옛 사진을 다시 찍었으면 파일 날짜 대신 사진을 보고 짐작한 시기',
  pts(photo({
    meta: { taken_at: '2026-01-01T10:00:00' },
    analysis: seen({ is_reproduction: true, era_estimate: '1970s' }),
  }), 'bump', b1950), 10);
t('다시 찍은 사진이 아니면 파일 날짜를 믿는다 (2026년 → 76세)',
  pts(photo({
    meta: { taken_at: '2026-01-01T10:00:00' },
    analysis: seen({ is_reproduction: false, era_estimate: '1970s' }),
  }), 'bump', b1950), 0);
t('직접 적으신 해가 파일 날짜보다 먼저',
  pts(photo({ taken_year: 1990, meta: { taken_at: '1975-06-01T10:00:00' } }), 'bump', b1950), 0);
t('십 년 단위 짐작은 범위가 겹치면 (1980년대 → 30~39세)',
  pts(photo({ analysis: seen({ era_estimate: '1980s' }) }), 'bump', b1950), 10);
t('1990년대 (40~49세) 는 0', pts(photo({ analysis: seen({ era_estimate: '1990s' }) }), 'bump', b1950), 0);
t('태어나시기 전 사진이라고 알려 준다',
  scorePhoto(photo({ taken_year: 1945 }), b1950).parts.find((p) => p.key === 'bump').reason.includes('태어나시기 전'), true);

console.log('\n[⑦ 최근에 안 나온 사진 · ⑧ 최근에 되풀이된 사진]');
const a = photo({ memory_id: 'memory_a' });
t('한 번도 안 나왔으면 +10', pts(a, 'recent', { recent: [] }), 10);
t('최근 세 번 중 두 번이면 −20', pts(a, 'recent', { recent: ['memory_a', 'memory_b', 'memory_a'] }), -20);
t('최근 세 번 중 한 번이면 0', pts(a, 'recent', { recent: ['memory_b', 'memory_a', 'memory_c'] }), 0);
t('네 번째보다 앞은 세지 않는다',
  pts(a, 'recent', { recent: ['memory_b', 'memory_c', 'memory_d', 'memory_a', 'memory_a'] }), 10);

console.log('\n[⑨ 추천에서 뺀다]');
t('이 사진으로 이야기하고 싶지 않아요', scorePhoto(photo({ avoid: true, importance: 3 })).excluded, true);
t('대화하시다 힘들어하심', scorePhoto(photo({ distress_flag: true })).excluded, true);
t('보호자가 감춤', scorePhoto(photo({ hidden: true })).excluded, true);
t('확인 전인 기억', scorePhoto(photo({ verification_status: 'UNVERIFIED' })).excluded, true);
t('보통 사진은 빼지 않는다', scorePhoto(photo()).excluded, false);

console.log('\n[별점만으로 정하지 않는다]');
const rich = photo({
  title: '여름 평상', importance: 1,
  analysis: seen({ people_count: 3, objects: ['밥상', '수박', '부채'], place_type: 'home', activity: 'meal' }),
});
const plain = photo({ title: '증명사진', importance: 3, analysis: seen({ place_type: 'studio' }) });
t('단서가 풍부한 ★ 사진 = 80점', scorePhoto(rich).total, 80);
t('단서가 없는 ★★★ 사진 = 40점', scorePhoto(plain).total, 40);
t('추천 순서', rankPhotos([plain, rich]).map((r) => r.memory.title), ['여름 평상', '증명사진']);
t('뺀 사진은 점수가 높아도 맨 뒤',
  rankPhotos([photo({ title: '뺀 사진', avoid: true, importance: 3 }), plain]).map((r) => r.memory.title),
  ['증명사진', '뺀 사진']);
t('이야깃거리는 사진 순위에 끼지 않는다',
  rankPhotos([makeMemory({ kind: 'THEME', title: '추석' }), plain]).length, 1);

console.log('\n[고르기 — 점수가 가장 높은 사진부터]');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chorong-score-'));
const mem = new MemoryStore(dir);
const R = await mem.create({ ...rich, memory_id: 'memory_rich' });
const P = await mem.create({ ...plain, memory_id: 'memory_plain' });
const T = await mem.create({
  kind: 'THEME', title: '추석 명절', theme_key: 'chuseok',
  verification_status: 'CAREGIVER_VERIFIED', verified_fields: ['title'],
});
t('점수가 가장 높은 사진', (await mem.selectMemory('default')).title, '여름 평상');
t('최근에 되풀이된 사진은 건너뛰고 다음 사진',
  (await mem.selectMemory('default', { recent: [R.memory_id, T.memory_id, R.memory_id] })).title, '증명사진');
t('이번 회기에 본 사진은 빼고', (await mem.selectMemory('default', { excludeIds: [R.memory_id] })).title, '증명사진');
t('사진을 다 보았으면 이야깃거리',
  (await mem.selectMemory('default', { excludeIds: [R.memory_id, P.memory_id] })).title, '추석 명절');
t('전부 보았으면 다시 점수 순',
  (await mem.selectMemory('default', { excludeIds: [R.memory_id, P.memory_id, T.memory_id] })).title, '여름 평상');

const solo = new MemoryStore(await fs.mkdtemp(path.join(os.tmpdir(), 'chorong-solo-')));
const S = await solo.create({ ...rich, memory_id: 'memory_solo' });
await solo.create({
  kind: 'THEME', title: '김장', theme_key: 'kimjang',
  verification_status: 'CAREGIVER_VERIFIED', verified_fields: ['title'],
});
t('사진이 한 장뿐인데 되풀이됐으면 이야깃거리로 쉬어 간다',
  (await solo.selectMemory('default', { recent: [S.memory_id, 'memory_x', S.memory_id] })).title, '김장');
t('한 번만 나왔으면 그 사진을 다시',
  (await solo.selectMemory('default', { recent: [S.memory_id, 'memory_x', 'memory_y'] })).title, '여름 평상');

console.log('\n[같은 기억을 동시에 고쳐도 잃지 않는다]');
await Promise.all([
  mem.update(P.memory_id, { importance: 2 }),
  mem.update(P.memory_id, { analysis: seen({ people_count: 4 }) }),
  mem.update(P.memory_id, { taken_year: 1972 }),
]);
const merged = await mem.get(P.memory_id);
t('세 가지가 모두 남음', [merged.importance, merged.analysis.people_count, merged.taken_year], [2, 4, 1972]);
await Promise.all(Array.from({ length: 12 }, (_, i) =>
  mem.addClaim(R.memory_id, { field: 'description', value: `이야기 ${i}`, source: 'USER' })));
t('동시에 쌓은 이야기 열두 개가 모두 남음', (await mem.get(R.memory_id)).claims.length, 12);

console.log('\n[어르신 정보 — 태어나신 해]');
const profiles = new ProfileStore(dir);
t('아직 없으면 null', (await profiles.get('default')).birth_year, null);
await profiles.update('default', { birth_year: '1950' });
t('적으면 남는다', (await profiles.get('default')).birth_year, 1950);
await profiles.update('default', { birth_year: 3000 });
t('말이 안 되는 해는 받지 않는다', (await profiles.get('default')).birth_year, null);

console.log('\n[모델이 살펴본 결과를 다듬는다]');
t('사람 수가 음수면 0', cleanAnalysis(seen({ people_count: -3 })).people_count, 0);
t('소수는 반올림', cleanAnalysis(seen({ people_count: 2.6 })).people_count, 3);
t('숫자가 아니면 0', cleanAnalysis(seen({ people_count: '많음' })).people_count, 0);
t('모르는 장소는 unknown', cleanAnalysis(seen({ place_type: 'moon' })).place_type, 'unknown');
t('사물은 여덟 개까지', cleanAnalysis(seen({ objects: Array.from({ length: 12 }, (_, i) => `물건${i}`) })).objects.length, 8);
t('모르는 상태면 버린다', cleanAnalysis({ status: 'WHAT' }), null);
t('실패하면 까닭을 남긴다', cleanAnalysis({ status: 'FAILED', error: '시간 초과' }).error, '시간 초과');

console.log('\n[사진 파일 정보를 다듬는다]');
t('올해보다 뒤의 날짜는 받지 않는다', cleanMeta({ taken_at: '2099-01-01T00:00:00' }).taken_at, null);
t('1900년보다 앞도 받지 않는다', cleanMeta({ taken_at: '1899-12-31T00:00:00' }).taken_at, null);
t('0,0 위치는 받지 않는다', cleanMeta({ gps: { lat: 0, lon: 0 } }).gps, null);
t('지구 밖 좌표는 받지 않는다', cleanMeta({ gps: { lat: 91, lon: 10 } }).gps, null);
t('좌표는 약 11미터 단위로 줄인다', cleanMeta({ gps: { lat: 37.566543, lon: 126.977812 } }).gps, { lat: 37.5665, lon: 126.9778 });

console.log('\n[사진 파일에서 찍은 날과 위치 읽기 (EXIF)]');
/** 찍은 날과 GPS 가 든 아주 작은 JPEG 을 직접 짠다 */
function exifJpeg({ little = true, date = '1978:05:03 14:20:00',
  lat = [37, 33, 59.4], latRef = 'N', lon = [126, 58, 40.2], lonRef = 'E' } = {}) {
  const buf = new ArrayBuffer(178);
  const dv = new DataView(buf);
  const w16 = (o, v) => dv.setUint16(o, v, little);
  const w32 = (o, v) => dv.setUint32(o, v, little);
  const entry = (o, tag, type, count, value) => { w16(o, tag); w16(o + 2, type); w32(o + 4, count); w32(o + 8, value); };
  const inlineAscii = (o, tag, ch) => { w16(o, tag); w16(o + 2, 2); w32(o + 4, 2); dv.setUint8(o + 8, ch.charCodeAt(0)); };

  dv.setUint16(0, little ? 0x4949 : 0x4D4D);
  w16(2, 42);
  w32(4, 8);
  // IFD0 (8) → EXIF IFD (38) → GPS IFD (56) → 날짜 (110) → 위도 (130) → 경도 (154)
  w16(8, 2);
  entry(10, 0x8769, 4, 1, 38);
  entry(22, 0x8825, 4, 1, 56);
  w16(38, 1);
  entry(40, 0x9003, 2, 20, 110);
  w16(56, 4);
  inlineAscii(58, 1, latRef);
  entry(70, 2, 5, 3, 130);
  inlineAscii(82, 3, lonRef);
  entry(94, 4, 5, 3, 154);
  for (let i = 0; i < 19; i++) dv.setUint8(110 + i, date.charCodeAt(i));
  lat.forEach((v, i) => { w32(130 + i * 8, Math.round(v * 100)); w32(134 + i * 8, 100); });
  lon.forEach((v, i) => { w32(154 + i * 8, Math.round(v * 100)); w32(158 + i * 8, 100); });

  const tiff = new Uint8Array(buf);
  const len = 2 + 6 + tiff.length;
  return Uint8Array.from([
    0xFF, 0xD8, 0xFF, 0xE1, len >> 8, len & 0xFF, 0x45, 0x78, 0x69, 0x66, 0, 0,
    ...tiff, 0xFF, 0xD9,
  ]);
}
const near = (x, y) => Math.abs(x - y) < 1e-6;

const ii = readExif(exifJpeg({ little: true }));
t('인텔 순서 — 찍은 날', ii.takenAt, '1978-05-03T14:20:00');
t('인텔 순서 — 위치', near(ii.gps.lat, 37 + 33 / 60 + 59.4 / 3600) && near(ii.gps.lon, 126 + 58 / 60 + 40.2 / 3600), true);
const mm = readExif(exifJpeg({ little: false }));
t('모토로라 순서도 같게', [mm.takenAt, near(mm.gps.lat, ii.gps.lat), near(mm.gps.lon, ii.gps.lon)], ['1978-05-03T14:20:00', true, true]);
const sw = readExif(exifJpeg({ latRef: 'S', lonRef: 'W' }));
t('남위 · 서경은 음수', [sw.gps.lat < 0, sw.gps.lon < 0], [true, true]);
t('날짜를 못 잡은 기기 (0000:00:00)', readExif(exifJpeg({ date: '0000:00:00 00:00:00' })).takenAt, null);
t('JPEG 이 아니면 빈 값', readExif(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 1, 2, 3, 4])), { takenAt: null, gps: null });
t('잘린 파일도 던지지 않는다', readExif(exifJpeg().slice(0, 30)), { takenAt: null, gps: null });
t('쓰레기 바이트도 던지지 않는다', readExif(Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 0xFF)), { takenAt: null, gps: null });
t('정보가 없는 JPEG', readExif(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xDA, 0, 2, 0xFF, 0xD9])), { takenAt: null, gps: null });
t('날짜를 읽기 쉽게', formatTakenDate('1978-05-03T14:20:00'), '1978년 5월 3일');

console.log('\n[사진 살펴보기 요청]');
let sent = null;
const fakeFetch = (reply) => async (_url, init) => {
  sent = JSON.parse(init.body);
  return { ok: true, json: async () => ({ choices: [{ message: reply }] }) };
};
const got = await analyzePhoto({
  dataUrl: 'data:image/jpeg;base64,AAAA', apiKey: 'test',
  fetchImpl: fakeFetch({
    content: JSON.stringify(seen({ people_count: 3, objects: ['밥상', '밥상'], place_type: 'home', activity: 'meal' })),
  }),
});
t('모양을 못박아 보낸다', [sent.response_format.type, sent.response_format.json_schema.strict], ['json_schema', true]);
t('사람을 세야 해서 자세히 본다', sent.messages[1].content[1].image_url.detail, 'high');
t('스키마의 필수 칸이 빠짐없음', ANALYSIS_SCHEMA.schema.required.length, Object.keys(ANALYSIS_SCHEMA.schema.properties).length);
t('받은 결과를 다듬어 돌려준다', [got.status, got.people_count, got.objects], ['DONE', 3, ['밥상']]);
let refused = false;
try {
  await analyzePhoto({ dataUrl: 'data:image/jpeg;base64,AAAA', apiKey: 'test', fetchImpl: fakeFetch({ refusal: '거절' }) });
} catch { refused = true; }
t('모델이 거절하면 실패로 알린다', refused, true);

console.log('\n[기억 회상 지원 — 올리신 사진 중 점수가 가장 높은 것만]');
const recall = new MemoryStore(await fs.mkdtemp(path.join(os.tmpdir(), 'chorong-recall-')));
const hi = await recall.create({ ...rich, memory_id: 'memory_hi' });
const lo = await recall.create({ ...plain, memory_id: 'memory_lo' });
await recall.create({ ...photo({ title: '사진 없는 기억', importance: 3 }), memory_id: 'memory_nofile', photo: null });
await recall.create({
  kind: 'THEME', title: '추석 명절', theme_key: 'chuseok',
  verification_status: 'CAREGIVER_VERIFIED', verified_fields: ['title'],
});
t('점수가 가장 높은 사진', (await recall.selectMemory('default', { photosOnly: true })).title, '여름 평상');
t('이번 회기에 본 사진은 빼고 다음 점수', (await recall.selectMemory('default', { photosOnly: true, excludeIds: [hi.memory_id] })).title, '증명사진');
t('사진을 다 보았으면 이야깃거리로 넘어가지 않고 null',
  await recall.selectMemory('default', { photosOnly: true, excludeIds: [hi.memory_id, lo.memory_id] }), null);
t('되풀이된 사진이라도 사진이면 그 사진 (이야깃거리로 쉬어 가지 않음)',
  (await solo.selectMemory('default', { photosOnly: true, recent: [S.memory_id, 'memory_x', S.memory_id] })).title, '여름 평상');
await recall.update(hi.memory_id, { avoid: true });
t('이야기하고 싶지 않다 하신 사진은 빼고', (await recall.selectMemory('default', { photosOnly: true })).title, '증명사진');

console.log('\n[회기 기록 — 새 반응도 남는다]');
t('기억이 안 나실 때 (OFFER_CUE)', makeTurn({ role: 'assistant', response_mode: 'OFFER_CUE' }).response_mode, 'OFFER_CUE');
t('아프다고 하실 때 (HEALTH_CARE)', makeTurn({ role: 'assistant', response_mode: 'HEALTH_CARE' }).response_mode, 'HEALTH_CARE');

await fs.rm(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
