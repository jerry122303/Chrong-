/* 좌표를 장소 이름으로 — 바깥 호출은 바꿔 끼워 시험한다 (인터넷 없이 돈다) */
import {
  shortAddress, usableGps, roundTo, placeName, clearGeocodeCache, SEND_PRECISION,
} from './geocode.js';

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}`);
};

console.log('[사람이 말하는 만큼만 고른다]');
t('시 · 도와 시를 합친다',
  shortAddress({ state: '제주특별자치도', city: '제주시', suburb: '애월읍' }), '제주특별자치도 제주시');
t('시가 없으면 군으로',
  shortAddress({ state: '강원특별자치도', county: '양양군' }), '강원특별자치도 양양군');
t('같은 이름은 한 번만', shortAddress({ state: '서울특별시', city: '서울특별시' }), '서울특별시');
t('시 · 도만 있으면 그것만', shortAddress({ state: '경상북도' }), '경상북도');
t('아무것도 없으면 빈 값', shortAddress({}), '');

console.log('\n[지구 위의 좌표만 받는다]');
t('제주 앞바다', usableGps({ lat: 33.4996, lon: 126.5312 }), true);
t('0,0 은 위치를 못 잡은 기기의 값', usableGps({ lat: 0, lon: 0 }), false);
t('지구 밖', usableGps({ lat: 95, lon: 0 }), false);
t('값이 없으면', usableGps(null), false);
t('자리 수 줄이기', [roundTo(33.49961234, 3), SEND_PRECISION], [33.5, 3]);

console.log('\n[좌표 → 장소 이름]');
let asked = '';
const fake = async (url) => {
  asked = url;
  return { ok: true, json: async () => ({ address: { state: '제주특별자치도', city: '제주시' } }) };
};
clearGeocodeCache();
t('장소 이름을 돌려준다',
  await placeName({ lat: 33.49961234, lon: 126.53127777 }, { fetchImpl: fake }), '제주특별자치도 제주시');
t('좌표는 소수 셋째 자리까지만 내보낸다',
  [asked.includes('lat=33.5'), asked.includes('lon=126.531'), asked.includes('33.49961')],
  [true, true, false]);
t('우리말로 달라고 한다', asked.includes('accept-language=ko'), true);

let calls = 0;
const counting = async () => {
  calls += 1;
  return { ok: true, json: async () => ({ address: { state: '부산광역시' } }) };
};
clearGeocodeCache();
await placeName({ lat: 35.1, lon: 129.1 }, { fetchImpl: counting });
await placeName({ lat: 35.1, lon: 129.1 }, { fetchImpl: counting });
t('같은 자리는 한 번만 묻는다', calls, 1);

clearGeocodeCache();
t('못 찾으면 조용히 빈 값',
  await placeName({ lat: 35.1, lon: 129.1 }, { fetchImpl: async () => { throw new Error('끊김'); } }), null);
clearGeocodeCache();
t('좌표가 없으면 묻지 않는다', await placeName(null, { fetchImpl: fake }), null);

console.log(fail ? `\n${fail}개 실패` : '\n모두 통과');
process.exit(fail ? 1 : 0);
