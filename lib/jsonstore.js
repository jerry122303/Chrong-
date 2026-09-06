/* =====================================================================
 *  아주 작은 파일 저장소
 *
 *  한 건을 파일 하나로 둔다. 어르신 한 분이 사진 수십 장을 쓰는 규모라
 *  데이터베이스를 들이지 않았다. 나중에 바꿔야 하면 이 파일만 갈아 끼운다.
 *
 *  쓰다가 서버가 죽으면 파일이 반만 남아 못 읽게 된다. 그래서 임시 파일에
 *  먼저 쓰고 이름을 바꾼다 (rename 은 한 번에 일어난다).
 * ===================================================================== */

import fs from 'node:fs/promises';
import path from 'node:path';

export class JsonStore {
  /** @param {string} dir 이 모음이 쓸 폴더 @param {string} idField 아이디 필드 이름 */
  constructor(dir, idField) {
    this.dir = dir;
    this.idField = idField;
    this.ready = null;
  }

  async _dir() {
    if (!this.ready) this.ready = fs.mkdir(this.dir, { recursive: true });
    await this.ready;
    return this.dir;
  }

  /** 아이디에 경로 문자가 섞여 폴더 밖으로 나가지 못하게 한다 */
  _file(id) {
    const safe = String(id).replace(/[^A-Za-z0-9_-]/g, '');
    if (!safe) throw new Error('빈 아이디');
    return path.join(this.dir, `${safe}.json`);
  }

  async get(id) {
    await this._dir();
    try {
      return JSON.parse(await fs.readFile(this._file(id), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async put(record) {
    await this._dir();
    const id = record[this.idField];
    const file = this._file(id);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(record, null, 2), 'utf8');
    await fs.rename(tmp, file);      // 여기서 한 번에 바뀐다
    return record;
  }

  async remove(id) {
    await this._dir();
    try {
      await fs.unlink(this._file(id));
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  /** 전부 읽어 온다. 건수가 적을 때만 쓸 수 있는 방법이다. */
  async all() {
    await this._dir();
    const names = (await fs.readdir(this.dir)).filter((n) => n.endsWith('.json'));
    const out = [];
    for (const n of names) {
      try {
        out.push(JSON.parse(await fs.readFile(path.join(this.dir, n), 'utf8')));
      } catch {
        // 한 건이 깨져도 나머지는 살린다
        console.warn('[store] 읽지 못한 파일을 건너뜁니다:', n);
      }
    }
    return out;
  }
}
