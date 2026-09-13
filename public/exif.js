/* =====================================================================
 *  사진 파일에 들어 있는 촬영 정보(EXIF) 읽기 — 찍은 날과 위치
 *
 *  화면에서 사진을 줄여 올리면 캔버스를 거치며 EXIF 가 모두 떨어진다.
 *  그래서 줄이기 전에 원본 파일 앞머리에서 필요한 것만 먼저 읽는다.
 *  (위치가 박힌 채로 사진 파일이 저장되지 않는다는 점은 오히려 좋다)
 *
 *  라이브러리를 들이지 않는다. 필요한 태그는 여섯 개뿐이다.
 *  브라우저와 Node 양쪽에서 돌도록 화면(DOM)에 기대지 않는다.
 *  깨진 파일이어도 던지지 않고 빈 값을 돌려준다.
 * ===================================================================== */

/** 값 형식마다 한 칸의 바이트 수 */
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 13: 4 };

const TAG = {
  EXIF_IFD: 0x8769,
  GPS_IFD: 0x8825,
  DATE_ORIGINAL: 0x9003,     // 찍은 때
  DATE_DIGITIZED: 0x9004,    // 디지털로 옮긴 때 (찍은 때가 없을 때만)
  GPS_LAT_REF: 0x0001,
  GPS_LAT: 0x0002,
  GPS_LON_REF: 0x0003,
  GPS_LON: 0x0004,
};

/** 'YYYY:MM:DD HH:MM:SS' → 'YYYY-MM-DDTHH:MM:SS' (기기의 현지 시각 그대로) */
export function parseExifDate(text) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(text || '').trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  // 날짜를 못 잡은 기기는 0000:00:00 을 넣는다
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

function toGps(latRef, lat, lonRef, lon) {
  if (!lat || !lon) return null;
  let la = lat[0] + lat[1] / 60 + lat[2] / 3600;
  let lo = lon[0] + lon[1] / 60 + lon[2] / 3600;
  if (/^S/i.test(latRef)) la = -la;
  if (/^W/i.test(lonRef)) lo = -lo;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  if (la === 0 && lo === 0) return null;     // 위치를 못 잡은 기기가 넣는 값
  return { lat: la, lon: lo };
}

/** TIFF 구조(EXIF 의 본체)를 읽는다. start~end 는 파일 안에서의 위치 */
function parseTiff(u8, start, end) {
  const size = end - start;
  if (size < 8) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset + start, size);

  const order = dv.getUint16(0);
  const little = order === 0x4949;               // 'II' 인텔 · 'MM' 모토로라
  if (!little && order !== 0x4D4D) return null;
  if (dv.getUint16(2, little) !== 42) return null;

  const u16 = (o) => dv.getUint16(o, little);
  const u32 = (o) => dv.getUint32(o, little);
  const inside = (o, n) => Number.isInteger(o) && o >= 0 && n >= 0 && o + n <= size;

  /** 태그 목록 하나를 읽는다. 범위를 벗어난 항목은 버린다 */
  function readIfd(offset) {
    const tags = new Map();
    if (!inside(offset, 2)) return tags;
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      if (!inside(e, 12)) break;
      const type = u16(e + 2);
      const unit = TYPE_SIZE[type];
      if (!unit) continue;
      const n = u32(e + 4);
      const bytes = unit * n;
      // 네 바이트에 들어가면 값이 그 자리에 있고, 넘으면 값이 있는 위치가 적혀 있다
      const at = bytes <= 4 ? e + 8 : u32(e + 8);
      if (!inside(at, bytes)) continue;
      tags.set(u16(e), { type, n, at });
    }
    return tags;
  }

  const ascii = (t) => {
    if (!t || t.type !== 2) return '';
    let s = '';
    for (let i = 0; i < t.n; i++) {
      const c = dv.getUint8(t.at + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rational3 = (t) => {
    if (!t || t.type !== 5 || t.n < 3) return null;
    const out = [];
    for (let i = 0; i < 3; i++) {
      const den = u32(t.at + i * 8 + 4);
      if (!den) return null;
      out.push(u32(t.at + i * 8) / den);
    }
    return out;
  };
  const pointer = (t) => (t && (t.type === 4 || t.type === 13) && t.n === 1 ? u32(t.at) : -1);

  const ifd0 = readIfd(u32(4));
  const exif = readIfd(pointer(ifd0.get(TAG.EXIF_IFD)));
  const gps = readIfd(pointer(ifd0.get(TAG.GPS_IFD)));

  return {
    takenAt: parseExifDate(ascii(exif.get(TAG.DATE_ORIGINAL)))
      || parseExifDate(ascii(exif.get(TAG.DATE_DIGITIZED))),
    gps: toGps(
      ascii(gps.get(TAG.GPS_LAT_REF)), rational3(gps.get(TAG.GPS_LAT)),
      ascii(gps.get(TAG.GPS_LON_REF)), rational3(gps.get(TAG.GPS_LON))),
  };
}

/**
 * JPEG 앞머리에서 찍은 날과 위치를 읽는다.
 * @param {ArrayBuffer|Uint8Array} input 파일 앞부분이면 충분하다
 * @returns {{ takenAt: string|null, gps: {lat:number, lon:number}|null }}
 */
export function readExif(input) {
  const empty = { takenAt: null, gps: null };
  let u8;
  try {
    u8 = input instanceof Uint8Array ? input
      : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);
  } catch {
    return empty;
  }
  if (u8.length < 4 || u8[0] !== 0xFF || u8[1] !== 0xD8) return empty;   // JPEG 만 본다

  try {
    let off = 2;
    while (off + 4 <= u8.length) {
      if (u8[off] !== 0xFF) return empty;
      while (off + 1 < u8.length && u8[off + 1] === 0xFF) off += 1;   // 채움 바이트
      const marker = u8[off + 1];
      if (marker === 0xDA || marker === 0xD9) return empty;   // 그림 데이터가 시작되면 더는 없다
      const len = (u8[off + 2] << 8) | u8[off + 3];
      if (len < 2) return empty;

      const exifHeader = marker === 0xE1
        && u8[off + 4] === 0x45 && u8[off + 5] === 0x78 && u8[off + 6] === 0x69
        && u8[off + 7] === 0x66 && u8[off + 8] === 0 && u8[off + 9] === 0;   // 'Exif\0\0'
      if (exifHeader) {
        return parseTiff(u8, off + 10, Math.min(u8.length, off + 2 + len)) || empty;
      }
      off += 2 + len;
    }
  } catch {
    // 깨진 파일은 정보가 없는 셈 친다
  }
  return empty;
}

/** 브라우저의 File 에서 읽는다. EXIF 는 파일 앞쪽에 있어서 앞 256KB 만 본다 */
export async function readExifFromFile(file) {
  try {
    return readExif(await file.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    return { takenAt: null, gps: null };
  }
}

/** '2019-05-03T14:20:00' → '2019년 5월 3일' */
export function formatTakenDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일` : '';
}
