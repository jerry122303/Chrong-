/* =====================================================================
 *  어르신 정보 — 지금은 태어나신 해 하나
 *
 *  사진을 찍었을 때 어르신이 몇 살이셨는지 알아야 추천 점수 ⑥(회상 절정기)을
 *  매길 수 있다. 열 살에서 서른 살 무렵의 기억이 가장 또렷하게 떠오른다.
 *
 *  모델에게는 보내지 않는다. 점수 계산에만 쓴다.
 * ===================================================================== */

import path from 'node:path';
import { JsonStore } from './jsonstore.js';
import { cleanYear } from './records.js';

export class ProfileStore {
  constructor(dataDir) {
    this.store = new JsonStore(path.join(dataDir, 'profiles'), 'owner_id');
  }

  /** 아직 적은 게 없어도 빈 모양을 돌려준다 */
  async get(ownerId = 'default') {
    const saved = await this.store.get(ownerId);
    return {
      owner_id: ownerId,
      birth_year: cleanYear(saved?.birth_year),
      updated_at: saved?.updated_at || null,
    };
  }

  async update(ownerId = 'default', patch = {}) {
    const cur = await this.get(ownerId);
    const next = { ...cur, updated_at: new Date().toISOString() };
    if ('birth_year' in patch) next.birth_year = cleanYear(patch.birth_year);
    return this.store.put(next);
  }
}
