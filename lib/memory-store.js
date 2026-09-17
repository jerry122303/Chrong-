/* =====================================================================
 *  MEMORY 저장소 — 사진과 '확인된' 생애정보
 *
 *  두 가지가 이 파일의 핵심이다.
 *  1) 선택 순서 — 사진 추천 점수 (lib/photo-score.js)
 *     중요도 · 회상 단서 · 사람 · 활동 · 장소 · 시기 · 최근 사용을 더한 점수 순.
 *     이야기하고 싶지 않다 하셨거나 · 힘들어하셨거나 · 감췄거나 · 확인 전인 사진은 뺀다.
 *     어르신이 직접 고르신 것은 점수와 상관없이 가장 먼저다.
 *  2) 확인 후 저장 (문서 9번)
 *     모델이 뽑아낸 사실은 UNVERIFIED 로만 쌓이고, 사람이 확인해야 올라간다.
 *     값이 서로 어긋나도 지우지 않고 출처별로 남긴다.
 * ===================================================================== */

import path from 'node:path';
import { JsonStore } from './jsonstore.js';
import { THEMES, themeToMemory, inSeason } from './themes.js';
import { rankPhotos, isRepeated } from './photo-score.js';
import {
  makeMemory, makeClaim, verifiedFacts,
  MEMORY_FACT_FIELDS, VERIFICATION,
} from './records.js';
import { sameValue } from './reply-rules.js';

/** 주제 이름으로 그 이야기가 어울리는 달을 찾는다 */
const seasonMonths = (key) => {
  const t = THEMES.find((x) => x.key === key);
  return t && t.months ? t.months : [];
};

/** 이야깃거리 순서 — 아직 안 한 것 → 지금 계절 → 오래 쓰지 않은 것 */
function byTheme(a, b) {
  const usedA = a.last_used_at ? 1 : 0;
  const usedB = b.last_used_at ? 1 : 0;
  if (usedA !== usedB) return usedA - usedB;

  /* 김장철에 김장 이야기를 꺼내면 "올해도 해야 하는데" 하면서 말문이 잘 트인다 */
  const seasonA = inSeason({ months: seasonMonths(a.theme_key) });
  const seasonB = inSeason({ months: seasonMonths(b.theme_key) });
  if (seasonA !== seasonB) return seasonA ? -1 : 1;

  return String(a.last_used_at || '').localeCompare(String(b.last_used_at || ''));
}

export class MemoryStore {
  constructor(dataDir) {
    this.store = new JsonStore(path.join(dataDir, 'memories'), 'memory_id');
    this.locks = new Map();
  }

  /**
   * 같은 기억에 대한 쓰기를 차례로 줄 세운다.
   *
   * 고치기는 '읽고 → 바꿔 → 통째로 쓰기' 라서, 둘이 겹치면 먼저 쓴 쪽이 사라진다.
   * 사진을 올리면 모델이 뒤에서 사진을 살펴보는 동안 어르신이 중요도를 고르시므로
   * 실제로 겹친다. 살펴본 결과가 도착하는 순간 고르신 별점이 날아가면 안 된다.
   */
  _serial(id, work) {
    const prev = this.locks.get(id) || Promise.resolve();
    const run = prev.then(work);
    const tail = run.catch(() => {});
    this.locks.set(id, tail);
    tail.then(() => { if (this.locks.get(id) === tail) this.locks.delete(id); });
    return run;
  }

  update(id, patch) { return this._serial(id, () => this._update(id, patch)); }
  markUsed(id, at) { return this._serial(id, () => this._markUsed(id, at)); }
  addClaim(id, input) { return this._serial(id, () => this._addClaim(id, input)); }
  verifyClaim(id, claimId, status) { return this._serial(id, () => this._verifyClaim(id, claimId, status)); }

  get(id) { return this.store.get(id); }

  async create(input) {
    return this.store.put(makeMemory(input));
  }

  async _update(id, patch) {
    const cur = await this.store.get(id);
    if (!cur) return null;
    // 아이디와 만든 시각, 주장 기록은 덮어쓰지 못하게 막는다
    const { memory_id, created_at, claims, ...safe } = patch || {};
    return this.store.put(makeMemory({ ...cur, ...safe, memory_id: cur.memory_id, created_at: cur.created_at, claims: cur.claims }));
  }

  async listFor(ownerId = 'default') {
    const all = await this.store.all();
    return all.filter((m) => m.owner_id === ownerId);
  }

  /**
   * 이야깃거리를 처음 한 번 심어 둔다.
   * 사진이 한 장도 없어도 첫날부터 회상 대화를 할 수 있어야 한다.
   * 이미 심어 둔 주제는 건드리지 않는다 (보호자가 감췄을 수 있다).
   */
  async seedThemes(ownerId = 'default') {
    const mine = await this.listFor(ownerId);
    const have = new Set(mine.filter((m) => m.theme_key).map((m) => m.theme_key));

    let added = 0;
    for (const theme of THEMES) {
      if (have.has(theme.key)) continue;
      await this.create(themeToMemory(theme, ownerId));
      added += 1;
    }
    return added;
  }

  /**
   * 자동 선택에 쓸 수 있는 사진인가.
   * 문서 2번: verified=true, hidden=false, distress_flag=false 를 먼저 건다.
   */
  static selectable(m) {
    return m.verification_status !== 'UNVERIFIED' && !m.hidden && !m.distress_flag;
  }

  /**
   * 어르신 개인의 기억을 추천 순서로 줄 세운다 (보호자 화면에서 점수를 보여 줄 때).
   * @param {{ birthYear?: number, recent?: string[] }} ctx
   */
  async rank(ownerId = 'default', ctx = {}) {
    return rankPhotos(await this.listFor(ownerId), ctx);
  }

  /**
   * 다음에 이야기할 기억을 고른다.
   *
   * 1) 어르신이 직접 고르신 것 — 감춘 것만 아니면 그대로 따른다
   * 2) 추천 점수가 가장 높은 사진
   *    다만 최근에 되풀이된 사진(⑧)밖에 없으면, 같은 사진을 또 꺼내기보다
   *    이야깃거리로 한 번 쉬어 간다. 사진이 한 장뿐이면 점수를 깎아도 늘 그 사진이
   *    나오므로, 깎는 것만으로는 되풀이를 막지 못한다.
   * 3) 이야깃거리 — 사진이 없거나 이번 회기에 다 본 뒤에
   * 4) 이번 회기에 전부 보았으면, 없는 것보다는 다시 보는 편이 낫다
   *
   * @param {string} ownerId
   * @param {object} opts
   * @param {string}   [opts.pickedId]   어르신이 직접 고르신 기억
   * @param {string[]} [opts.excludeIds] 이번 회기에 이미 본 기억 (문서 10번)
   * @param {number}   [opts.birthYear]  추천 점수 ⑥
   * @param {string[]} [opts.recent]     최근 회기의 memory_id, 최신순 (추천 점수 ⑦⑧)
   * @param {boolean}  [opts.photosOnly] 기억 회상 지원 — 사진이 있는 기억 중에서만, 점수 순으로
   */
  async selectMemory(ownerId = 'default', opts = {}) {
    const mine = await this.listFor(ownerId);

    if (opts.pickedId) {
      const picked = mine.find((m) => m.memory_id === opts.pickedId);
      if (picked && !picked.hidden) return picked;
    }

    const skip = new Set(opts.excludeIds || []);
    const ranked = rankPhotos(mine, { birthYear: opts.birthYear, recent: opts.recent })
      .filter((r) => !r.score.excluded);
    const themes = mine
      .filter((m) => m.kind === 'THEME' && MemoryStore.selectable(m))
      .sort(byTheme);

    const unseen = ranked.filter((r) => !skip.has(r.memory.memory_id));
    const unseenThemes = themes.filter((m) => !skip.has(m.memory_id));

    /* 기억 회상 지원 — 올리신 사진 중 점수가 가장 높은 것.
       이야깃거리로 넘어가지 않고, 최근에 되풀이된 사진도 깎인 점수 그대로 줄에 선다.
       이번 회기에 이미 본 사진은 다시 꺼내지 않는다. 남은 게 없으면 null. */
    if (opts.photosOnly) {
      const best = unseen.find((r) => r.memory.photo?.file);
      return best ? best.memory : null;
    }

    const best = unseen.find((r) => !isRepeated(r.score));
    if (best) return best.memory;
    if (unseenThemes.length) return unseenThemes[0];
    if (unseen.length) return unseen[0].memory;

    if (ranked.length) return ranked[0].memory;
    return themes[0] || null;
  }

  /** 이 사진으로 대화를 시작했다고 표시한다 */
  async _markUsed(id, at = new Date().toISOString()) {
    const m = await this.store.get(id);
    if (!m) return null;
    m.last_used_at = at;
    m.use_count = (m.use_count || 0) + 1;
    m.updated_at = at;
    return this.store.put(m);
  }

  /**
   * 새로 들은 이야기를 '아직 확인되지 않은 주장'으로 쌓는다.
   * 모델이 뽑아낸 것이든 어르신이 말씀하신 것이든 여기서는 사실이 아니다.
   */
  async _addClaim(id, input) {
    const m = await this.store.get(id);
    if (!m) return null;
    const claim = makeClaim({ ...input, status: 'UNVERIFIED' });

    /* 모델이 지난 차례에 말씀하신 것을 또 뽑아 오는 일이 잦다.
       같은 항목에 같은 값이 이미 기다리고 있으면 새로 쌓지 않는다.
       (확인이 끝난 주장은 건드리지 않는다. 충돌 기록은 남겨야 한다)

       다만 회기를 어느 쪽에 매어 둘지는 새 것을 따른다. 지난 회기에 답을
       못 받은 이야기를 이번에 다시 말씀하셨다면, 여쭐 대상은 이번 회기다.
       옛 회기에 매어 두면 이번 목록에서 빠져 영영 여쭙지 못하게 된다. */
    const same = m.claims.find((c) =>
      c.status === 'UNVERIFIED' &&
      c.field === claim.field &&
      /* 부르는 말만 다른 것은 같은 내용으로 본다 — "손자" 와 "손주" 를 따로 쌓으면
         남길지 여쭐 때 같은 항목이 두 줄로 나온다 (lib/reply-rules.js sameValue) */
      sameValue(c.value, claim.value));
    if (same) {
      if (claim.session_id && same.session_id !== claim.session_id) {
        same.session_id = claim.session_id;
        m.updated_at = new Date().toISOString();
        await this.store.put(m);
      }
      return same;
    }

    m.claims.push(claim);
    m.updated_at = new Date().toISOString();
    await this.store.put(m);
    return claim;
  }

  /**
   * 사람이 확인해 주면 그때 사실이 된다 (문서 9번).
   * 같은 항목에 다른 값이 이미 있어도 지우지 않는다. 옛 주장은 그대로 남기고
   * 확정된 값만 위로 올린다. 어느 쪽이 맞는지는 사람이 다시 정할 수 있어야 한다.
   *
   * @param {'VERIFIED'|'CAREGIVER_VERIFIED'} status 누가 확인했는지
   */
  async _verifyClaim(id, claimId, status = 'VERIFIED') {
    if (!['VERIFIED', 'CAREGIVER_VERIFIED'].includes(status)) {
      throw new Error('확인 상태가 올바르지 않습니다');
    }
    const m = await this.store.get(id);
    if (!m) return null;

    const claim = m.claims.find((c) => c.claim_id === claimId);
    if (!claim) return null;

    claim.status = status;
    claim.decided_at = new Date().toISOString();

    // 확정된 값을 본문으로 올린다
    if (MEMORY_FACT_FIELDS.includes(claim.field)) {
      m[claim.field] = claim.value;
      if (!m.verified_fields.includes(claim.field)) m.verified_fields.push(claim.field);
    }

    // 사진 전체의 상태는 가장 낮은 확인 수준을 따른다
    const levels = m.verified_fields.length ? [status, m.verification_status] : [status];
    m.verification_status = levels
      .sort((a, b) => VERIFICATION.indexOf(a) - VERIFICATION.indexOf(b))
      .find((v) => v !== 'UNVERIFIED') || status;

    m.updated_at = claim.decided_at;
    await this.store.put(m);
    return m;
  }

  /** 한 항목에 대해 서로 어긋나는 주장들을 출처별로 보여 준다 */
  async conflicts(id) {
    const m = await this.store.get(id);
    if (!m) return null;
    const byField = {};
    for (const c of m.claims) {
      const key = JSON.stringify(c.value);
      (byField[c.field] ||= new Map()).set(key, c);
    }
    const out = {};
    for (const [field, map] of Object.entries(byField)) {
      if (map.size > 1) out[field] = [...map.values()];
    }
    return out;
  }

  /** 프롬프트에 넣어도 되는 내용만 (문서 3번) */
  facts(memory) { return verifiedFacts(memory); }
}
