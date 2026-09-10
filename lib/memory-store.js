/* =====================================================================
 *  MEMORY 저장소 — 사진과 '확인된' 생애정보
 *
 *  두 가지가 이 파일의 핵심이다.
 *  1) 선택 순서 (문서 2번)
 *     어르신이 고른 것 → 아직 대화하지 않은 것 → 좋아하시는 것 → 오래된 것.
 *     검증되지 않았거나 감췄거나 불편해하신 사진은 자동 선택에서 뺀다.
 *  2) 확인 후 저장 (문서 9번)
 *     모델이 뽑아낸 사실은 UNVERIFIED 로만 쌓이고, 사람이 확인해야 올라간다.
 *     값이 서로 어긋나도 지우지 않고 출처별로 남긴다.
 * ===================================================================== */

import path from 'node:path';
import { JsonStore } from './jsonstore.js';
import { THEMES, themeToMemory, inSeason } from './themes.js';
import {
  makeMemory, makeClaim, verifiedFacts,
  MEMORY_FACT_FIELDS, VERIFICATION,
} from './records.js';

/** 주제 이름으로 그 이야기가 어울리는 달을 찾는다 */
const seasonMonths = (key) => {
  const t = THEMES.find((x) => x.key === key);
  return t && t.months ? t.months : [];
};

export class MemoryStore {
  constructor(dataDir) {
    this.store = new JsonStore(path.join(dataDir, 'memories'), 'memory_id');
  }

  get(id) { return this.store.get(id); }

  async create(input) {
    return this.store.put(makeMemory(input));
  }

  async update(id, patch) {
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
   * 다음에 이야기할 사진을 고른다.
   *
   * 문서의 순서에서 '선호 사진'이 '오래 사용하지 않은 사진'보다 앞이라,
   * 즐겨찾기가 하나라도 있으면 그 사진만 계속 나온다. 한 회기에서 사진을
   * 한두 장 보고 넘어가야 하므로(문서 10번), 이미 본 사진은 excludeIds 로
   * 빼 달라고 부르는 쪽에서 알려 준다. 순서 자체는 문서 그대로 둔다.
   *
   * @param {string} ownerId
   * @param {{ pickedId?: string, excludeIds?: string[] }} opts
   *        pickedId  — 어르신이 직접 고르셨다면 그게 가장 우선한다
   *        excludeIds — 이번 회기에서 이미 본 사진
   */
  async selectMemory(ownerId = 'default', opts = {}) {
    const mine = await this.listFor(ownerId);

    // 1순위 — 어르신이 직접 고르신 사진 (감춘 사진만 아니면 그대로 따른다)
    if (opts.pickedId) {
      const picked = mine.find((m) => m.memory_id === opts.pickedId);
      if (picked && !picked.hidden) return picked;
    }

    const skip = new Set(opts.excludeIds || []);
    let pool = mine.filter((m) => MemoryStore.selectable(m) && !skip.has(m.memory_id));
    // 뺄 것을 빼고 나니 남는 게 없으면, 없는 것보다는 다시 보는 편이 낫다
    if (pool.length === 0) pool = mine.filter(MemoryStore.selectable);
    if (pool.length === 0) return null;

    /* 어르신 개인의 사진이 늘 먼저다. 주제는 사진이 없거나 다 본 뒤에 쓴다.
       남의 이야기보다 내 사진이 훨씬 잘 떠오르기 때문이다. */
    const rank = (m) => {
      const base = m.kind === 'THEME' ? 10 : 0;
      if (!m.last_used_at) return base + 0;   // 아직 이야기하지 않은 것
      if (m.favorite) return base + 1;        // 좋아하시는 것
      return base + 2;                        // 오래 쓰지 않은 것
    };

    pool.sort((a, b) => {
      const d = rank(a) - rank(b);
      if (d !== 0) return d;

      /* 지금 계절과 맞는 이야깃거리를 앞으로 당긴다. 김장철에 김장 이야기를
         꺼내면 "올해도 해야 하는데" 하면서 말문이 잘 트인다. */
      const seasonA = a.theme_key ? inSeason({ months: seasonMonths(a.theme_key) }) : false;
      const seasonB = b.theme_key ? inSeason({ months: seasonMonths(b.theme_key) }) : false;
      if (seasonA !== seasonB) return seasonA ? -1 : 1;

      // 같은 순위 안에서는 오래 쓰지 않은 것부터
      return String(a.last_used_at || '').localeCompare(String(b.last_used_at || ''));
    });
    return pool[0];
  }

  /** 이 사진으로 대화를 시작했다고 표시한다 */
  async markUsed(id, at = new Date().toISOString()) {
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
  async addClaim(id, input) {
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
      JSON.stringify(c.value) === JSON.stringify(claim.value));
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
  async verifyClaim(id, claimId, status = 'VERIFIED') {
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
