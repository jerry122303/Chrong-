/* =====================================================================
 *  좌표를 사람이 아는 장소 이름으로 (Reverse Geocoding)
 *
 *  사진에 남은 GPS 는 숫자일 뿐이라 그대로 보여 드리면 아무 도움이 안 된다.
 *  "제주특별자치도 제주시" 처럼 바꿔야 회상 단서가 된다.
 *
 *  다만 좌표는 어르신이 어디 사시는지까지 드러나는 값이다. 그래서
 *  · 바깥으로는 소수 셋째 자리(약 110미터)까지만 보내고
 *  · 받은 것은 장소 이름만 남기며
 *  · 같은 자리는 다시 묻지 않게 기억해 둔다.
 *  · GEOCODE=false 로 아예 끌 수 있다 (끄면 좌표는 서버 밖으로 나가지 않는다).
 *
 *  못 찾아도 대화는 굴러가야 하므로, 실패하면 조용히 null 을 돌려준다.
 * ===================================================================== */

/** 바깥에 물어볼지 (끄면 좌표가 서버 밖으로 나가지 않는다) */
export const GEOCODE_ON = process.env.GEOCODE !== 'false';

/** 기본은 OpenStreetMap 의 무료 서비스. 다른 곳을 쓰려면 GEOCODE_URL 로 바꾼다 */
const ENDPOINT = process.env.GEOCODE_URL || 'https://nominatim.openstreetmap.org/reverse';

/* 이용 규칙상 어떤 프로그램이 부르는지 밝혀야 한다 */
const AGENT = process.env.GEOCODE_AGENT || 'chorong-recall/1.0 (senior reminiscence app)';

/** 바깥으로 내보내는 자리 수 — 약 110미터. 동네를 알기에는 넉넉하다 */
export const SEND_PRECISION = 3;

const cache = new Map();

export const roundTo = (v, digits) => {
  const p = 10 ** digits;
  return Math.round(Number(v) * p) / p;
};

/** 지구 위의 좌표인가. 0,0 은 위치를 못 잡은 기기가 넣는 값이라 받지 않는다 */
export function usableGps(gps) {
  const lat = Number(gps?.lat);
  const lon = Number(gps?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}

/**
 * 받아 온 주소에서 사람이 말하는 만큼만 고른다.
 * "대한민국 제주특별자치도 제주시 애월읍 ..." 을 다 읽어 드릴 필요는 없다.
 * 시 · 도와 시 · 군 · 구까지가 회상에 알맞다.
 */
export function shortAddress(address = {}) {
  const big = address.state || address.province || address.region || '';
  const mid = address.city || address.county || address.town || address.city_district || '';
  const small = address.suburb || address.village || address.borough || '';
  const parts = [big, mid || small].map((x) => String(x || '').trim()).filter(Boolean);
  /* 시 · 도가 곧 시인 곳(서울특별시 등)은 한 번만 적는다 */
  const seen = [];
  for (const p of parts) if (!seen.includes(p)) seen.push(p);
  return seen.join(' ');
}

/**
 * 좌표 → 장소 이름. 못 찾으면 null.
 * @param {{lat:number, lon:number}} gps
 * @param {{ fetchImpl?: Function, timeoutMs?: number }} opts 시험에서 바깥 호출을 바꿔 끼운다
 */
export async function placeName(gps, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  if (!GEOCODE_ON || !usableGps(gps)) return null;

  const lat = roundTo(gps.lat, SEND_PRECISION);
  const lon = roundTo(gps.lon, SEND_PRECISION);
  const key = `${lat},${lon}`;
  if (cache.has(key)) return cache.get(key);

  const url = `${ENDPOINT}?format=jsonv2&zoom=12&accept-language=ko&lat=${lat}&lon=${lon}`;
  const stop = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;

  try {
    const r = await fetchImpl(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, signal: stop });
    if (!r.ok) throw new Error(`${r.status}`);
    const data = await r.json();
    const name = shortAddress(data?.address || {}) || String(data?.name || '').trim();
    const out = name || null;
    cache.set(key, out);
    return out;
  } catch (err) {
    console.warn('[geocode] 장소 이름을 찾지 못했습니다', err.message);
    cache.set(key, null);     // 같은 자리를 되풀이해 묻지 않는다
    return null;
  }
}

/** 시험에서 기억해 둔 것을 지운다 */
export function clearGeocodeCache() { cache.clear(); }
