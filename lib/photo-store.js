/* =====================================================================
 *  사진 저장소
 *
 *  어르신의 얼굴과 가족이 담긴 사진이다. public/ 에 두면 주소만 알면
 *  누구나 열 수 있으므로 data/ 안에 두고 엔드포인트로만 내보낸다.
 *
 *  파일 이름은 새로 짓는다. 올라온 이름을 그대로 쓰면 폴더 밖으로 나가는
 *  경로가 섞여 들어올 수 있고, 파일명 자체에도 개인정보가 담겨 있다.
 *
 *  형식은 브라우저가 보내는 mimetype 을 믿지 않고 파일 앞머리를 직접 본다.
 *  그 값은 얼마든지 꾸며 낼 수 있어서, 스크립트가 든 SVG 를 사진인 척
 *  올려 두고 나중에 열게 만들 수 있다.
 * ===================================================================== */

import fs from 'node:fs/promises';
import path from 'node:path';
import { newId } from './records.js';

/** 받아들이는 형식과 파일 앞머리 (매직 넘버) */
const KINDS = [
  { type: 'image/jpeg', ext: 'jpg',  head: [0xFF, 0xD8, 0xFF] },
  { type: 'image/png',  ext: 'png',  head: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { type: 'image/gif',  ext: 'gif',  head: [0x47, 0x49, 0x46, 0x38] },
];

/** 앞머리를 보고 무슨 형식인지 알아낸다. 모르는 것이면 null */
export function sniff(buf) {
  if (!buf || buf.length < 12) return null;

  for (const k of KINDS) {
    if (k.head.every((b, i) => buf[i] === b)) return k;
  }
  // WebP 는 'RIFF....WEBP' 라 앞머리가 떨어져 있다
  if (buf.slice(0, 4).toString('latin1') === 'RIFF'
   && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    return { type: 'image/webp', ext: 'webp' };
  }
  return null;
}

export class PhotoStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'photos');
    this.ready = null;
  }

  async _dir() {
    if (!this.ready) this.ready = fs.mkdir(this.dir, { recursive: true });
    await this.ready;
    return this.dir;
  }

  /** 저장된 이름만 받아 실제 경로를 만든다 (폴더 밖으로 못 나가게) */
  _file(name) {
    const safe = String(name).replace(/[^A-Za-z0-9_.-]/g, '');
    if (!safe || safe.includes('..')) throw new Error('사진 이름이 올바르지 않습니다');
    return path.join(this.dir, safe);
  }

  /**
   * 사진을 저장한다.
   * @returns {{ file: string, type: string, bytes: number }}
   * @throws 형식을 알아볼 수 없으면
   */
  async save(buffer) {
    const kind = sniff(buffer);
    if (!kind) {
      throw new Error('사진 파일만 올릴 수 있어요. (jpg, png, gif, webp)');
    }
    await this._dir();
    const file = `${newId('photo')}.${kind.ext}`;
    await fs.writeFile(path.join(this.dir, file), buffer);
    return { file, type: kind.type, bytes: buffer.length };
  }

  /** 읽어서 내보낼 수 있게 경로와 형식을 돌려준다 */
  async open(name) {
    await this._dir();
    const full = this._file(name);
    try {
      const stat = await fs.stat(full);
      const ext = path.extname(full).slice(1).toLowerCase();
      const kind = KINDS.find((k) => k.ext === ext);
      return {
        path: full,
        bytes: stat.size,
        type: kind ? kind.type : (ext === 'webp' ? 'image/webp' : 'application/octet-stream'),
      };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async remove(name) {
    if (!name) return false;
    await this._dir();
    try {
      await fs.unlink(this._file(name));
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }
}
