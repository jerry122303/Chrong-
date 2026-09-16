/* =====================================================================
 *  돌봄 기록 저장소 — 어르신 한 분에 파일 하나
 *
 *  기억(MEMORY)은 사진 한 장에 파일 하나지만, 돌봄 기록은 '어느 하루에 무엇이
 *  있었는지' 라 한 분 것이 한데 모여 있어야 오늘 리포트와 신호를 볼 수 있다.
 *  그래서 owner_id 로 파일 하나를 쓴다.
 *
 *  한 파일을 여러 곳에서 고치므로(대화가 기분을 적는 사이 어르신이 약 버튼을
 *  누르실 수 있다) 쓰기를 줄 세운다. 안 그러면 먼저 쓴 쪽이 사라진다.
 *  (lib/memory-store.js 와 같은 방식이다)
 * ===================================================================== */

import path from 'node:path';
import { JsonStore } from './jsonstore.js';
import {
  makeCare, makeDay, makeGoal, makeMedication, makeMoodEntry, makePain,
  makeActivity, makeSummary, localDate, localTime,
} from './care-records.js';
import { fuseMood, activeGoal } from './care-score.js';

/** 같은 약을 이 시간 안에 또 드셨다고 하시면 여쭈어 본다 (분) */
export const DOUBLE_DOSE_MINUTES = 60;

export class CareStore {
  constructor(dataDir) {
    this.store = new JsonStore(path.join(dataDir, 'care'), 'owner_id');
    this.locks = new Map();
  }

  /** 아직 아무 기록이 없어도 빈 모양을 돌려준다 */
  async get(ownerId = 'default') {
    const saved = await this.store.get(ownerId);
    return makeCare({ ...(saved || {}), owner_id: ownerId });
  }

  /** 같은 어르신에 대한 쓰기를 차례로 줄 세운다 */
  _serial(ownerId, work) {
    const prev = this.locks.get(ownerId) || Promise.resolve();
    const run = prev.then(work);
    const tail = run.catch(() => {});
    this.locks.set(ownerId, tail);
    tail.then(() => { if (this.locks.get(ownerId) === tail) this.locks.delete(ownerId); });
    return run;
  }

  /**
   * 읽고 → 고치고 → 쓴다. fn 이 돌려주는 값을 그대로 넘겨 준다.
   * fn 에는 (care, day, date) 를 준다. day 는 오늘 칸이며 없으면 만들어 둔다.
   */
  _edit(ownerId, fn, { date = localDate() } = {}) {
    return this._serial(ownerId, async () => {
      const care = await this.get(ownerId);
      if (!care.days[date]) care.days[date] = makeDay();
      const out = await fn(care, care.days[date], date);
      care.updated_at = new Date().toISOString();
      await this.store.put(care);
      return out;
    });
  }

  /* ---------------- 기분 ---------------- */

  /**
   * 기분을 남긴다.
   * source 가 'user' 면 어르신이 버튼으로 직접 고르신 것, 'talk' 면 대화에서 읽은 것.
   * 둘을 합친 값과 어긋남 표시까지 함께 갱신한다 (lib/care-score.js fuseMood).
   */
  setMood(ownerId, { key, source = 'user', at, date } = {}) {
    return this._edit(ownerId, (care, day) => {
      const entry = makeMoodEntry({ key, at });
      if (source === 'talk') day.mood_talk = entry;
      else day.mood_user = entry;
      day.mood = fuseMood(day.mood_user, day.mood_talk);
      return day.mood;
    }, { date });
  }

  /* ---------------- 통증 ---------------- */

  addPain(ownerId, { part, level, score, at, date } = {}) {
    return this._edit(ownerId, (care, day) => {
      const pain = makePain({ part, level, score, at });
      day.pains.push(pain);
      return pain;
    }, { date });
  }

  /* ---------------- 복약 ---------------- */

  /** 약과 드시는 시각을 등록한다 (보호자 화면) */
  addMedication(ownerId, { name, times } = {}) {
    return this._serial(ownerId, async () => {
      const care = await this.get(ownerId);
      const med = makeMedication({ name, times });
      if (!med.name) return null;
      const same = care.medications.find((m) => m.name === med.name);
      if (same) {
        same.times = med.times.length ? med.times : same.times;
        same.active = true;
      } else {
        care.medications.push(med);
      }
      care.updated_at = new Date().toISOString();
      await this.store.put(care);
      return same || med;
    });
  }

  removeMedication(ownerId, medId) {
    return this._serial(ownerId, async () => {
      const care = await this.get(ownerId);
      const before = care.medications.length;
      care.medications = care.medications.filter((m) => m.med_id !== medId);
      care.updated_at = new Date().toISOString();
      await this.store.put(care);
      return care.medications.length !== before;
    });
  }

  /**
   * 약을 드셨다고 남긴다.
   * 조금 전에 같은 약을 드셨다는 기록이 있으면 알린다 — 두 번 드시면 위험하다.
   * 다만 어르신을 나무라지 않는다. 화면과 초롱이가 "혹시 아까 드신 건 아닐까요?" 하고 여쭙는다.
   */
  takeMedication(ownerId, { name, at, date } = {}) {
    return this._edit(ownerId, (care, day) => {
      const when = at || new Date().toISOString();
      const drug = String(name || (care.medications[0]?.name) || '약').trim().slice(0, 40);
      const last = [...day.medications].reverse().find((m) => m.name === drug);
      const minutes = last ? (Date.parse(when) - Date.parse(last.at)) / 60000 : Infinity;
      const again = Number.isFinite(minutes) && minutes < DOUBLE_DOSE_MINUTES;
      const record = { name: drug, at: when };
      day.medications.push(record);
      return { record, again, last: last || null };
    }, { date });
  }

  /* ---------------- 인지 활동 ---------------- */

  addActivity(ownerId, { kind, answered = true, at, date } = {}) {
    return this._edit(ownerId, (care, day) => {
      const act = makeActivity({ kind, answered, at });
      day.activities.push(act);
      return act;
    }, { date });
  }

  /* ---------------- 목표 ---------------- */

  /** 지금 진행 중인 목표 (lib/care-score.js 와 같은 판단을 쓴다) */
  activeGoal(care) { return activeGoal(care); }

  /**
   * 어르신이 말씀하신 목표를 남긴다.
   * 같은 목표를 다시 말씀하시면 새로 쌓지 않고 구체화된 내용만 갱신한다.
   * (말씀하실 때마다 쌓으면 목록이 같은 목표로 가득 찬다)
   */
  saveGoal(ownerId, { text, is_specific = false, missing_part = 'when', date } = {}) {
    return this._serial(ownerId, async () => {
      const care = await this.get(ownerId);
      const fresh = makeGoal({ text, is_specific, missing_part, date });
      if (!fresh.text) return null;

      const bare = (t) => String(t).replace(/\s+/g, '');
      const same = this.activeGoal(care);
      const merged = same && (bare(same.text).includes(bare(fresh.text))
        || bare(fresh.text).includes(bare(same.text)));

      let goal;
      if (merged) {
        same.text = fresh.text.length > same.text.length ? fresh.text : same.text;
        same.is_specific = same.is_specific || fresh.is_specific;
        same.missing_part = same.is_specific ? 'none' : fresh.missing_part;
        same.status = same.is_specific ? 'active' : 'drafting';
        same.updated_at = new Date().toISOString();
        goal = same;
      } else {
        care.goals.push(fresh);
        goal = fresh;
      }
      care.updated_at = new Date().toISOString();
      await this.store.put(care);
      return goal;
    });
  }

  /** 오늘 목표를 하셨다고 남긴다 */
  achieveGoal(ownerId, { goalId = null, date = localDate() } = {}) {
    return this._edit(ownerId, (care, day, today) => {
      const goal = goalId
        ? care.goals.find((g) => g.goal_id === goalId)
        : this.activeGoal(care);
      if (!goal) return null;
      if (!goal.achieved_dates.includes(today)) {
        goal.achieved_dates.push(today);
        day.goal_done += 1;
      }
      goal.updated_at = new Date().toISOString();
      return goal;
    }, { date });
  }

  /** 목표를 마치거나 지운다 */
  finishGoal(ownerId, goalId) {
    return this._serial(ownerId, async () => {
      const care = await this.get(ownerId);
      const goal = care.goals.find((g) => g.goal_id === goalId);
      if (!goal) return null;
      goal.status = 'done';
      goal.updated_at = new Date().toISOString();
      care.updated_at = goal.updated_at;
      await this.store.put(care);
      return goal;
    });
  }

  /* ---------------- 하루 요약 · 대화 차례 ---------------- */

  saveSummary(ownerId, { date = localDate(), line, mood, topics } = {}) {
    return this._serial(ownerId, async () => {
      const care = await this.get(ownerId);
      const summary = makeSummary({ date, line, mood, topics });
      if (!summary.line) return null;
      care.summaries[date] = summary;

      /* 서른 날이 넘은 것은 지운다. 오래된 기록을 쌓아 둘 까닭이 없다 */
      const keep = Object.keys(care.summaries).sort().slice(-30);
      care.summaries = Object.fromEntries(keep.map((d) => [d, care.summaries[d]]));
      const keepDays = Object.keys(care.days).sort().slice(-60);
      care.days = Object.fromEntries(keepDays.map((d) => [d, care.days[d]]));

      care.updated_at = new Date().toISOString();
      await this.store.put(care);
      return summary;
    });
  }

  /** 어르신이 한 마디 하셨다 (오늘 리포트의 '나눈 이야기' 수) */
  noteTurn(ownerId, { date } = {}) {
    return this._edit(ownerId, (care, day) => {
      day.turns += 1;
      return day.turns;
    }, { date });
  }

  /** 오늘 이미 하신 인지 활동 종류 */
  async doneActivities(ownerId, date = localDate()) {
    const care = await this.get(ownerId);
    return (care.days[date]?.activities || []).map((a) => a.kind);
  }

  /** 지금 시각 (시험에서 바꿔 끼울 수 있게 여기 둔다) */
  static now() { return { date: localDate(), time: localTime() }; }
}
