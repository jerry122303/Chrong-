/* =====================================================================
 *  SESSION 저장소 — 한 회기의 대화 기록
 *
 *  MEMORY 와 성격이 다르다. 매 회기마다 새로 생기고, 원문에는 개인 이야기가
 *  그대로 담긴다. 그래서 따로 둔다 (문서 11번).
 *
 *  원문 보존 여부는 개인정보 정책에서 정할 일이라 스위치로 뺐다.
 *  원문을 끄더라도 문서의 '초기 평가 지표'는 그대로 뽑을 수 있게,
 *  누가 · 어떤 반응 · 질문이었는지 · 몇 자였는지는 늘 남긴다.
 * ===================================================================== */

import path from 'node:path';
import { JsonStore } from './jsonstore.js';
import { makeSession, makeTurn, ENDED_BY, RESPONSE_MODES } from './records.js';

export class SessionStore {
  /**
   * @param {string} dataDir
   * @param {{ keepTranscript?: boolean }} opts 원문을 남길지
   */
  constructor(dataDir, opts = {}) {
    this.store = new JsonStore(path.join(dataDir, 'sessions'), 'session_id');
    this.keepTranscript = opts.keepTranscript !== false;
  }

  get(id) { return this.store.get(id); }

  async start(input) {
    return this.store.put(makeSession(input));
  }

  /** 한 차례의 말을 붙이고, 알고리즘이 보는 값들을 갱신한다 */
  async appendTurn(id, turn) {
    const s = await this.store.get(id);
    if (!s) return null;

    const rec = makeTurn(turn, this.keepTranscript);
    s.turns.push(rec);

    if (rec.role === 'assistant') {
      if (rec.response_mode) s.last_response_mode = rec.response_mode;
      if (rec.response_mode === 'FOLLOW_UP') s.follow_up_count += 1;
      // 질문 원문은 원문 보존을 꺼도 남긴다. 같은 질문을 되풀이하지 않으려면 필요하다.
      if (rec.asked_question && turn.text) s.asked_questions.push(String(turn.text).slice(0, 200));
    }
    if (Array.isArray(turn.user_reported_emotion)) {
      for (const e of turn.user_reported_emotion) {
        if (e && !s.user_reported_emotion.includes(e)) s.user_reported_emotion.push(e);
      }
    }

    s.elapsed_seconds = Math.max(
      0, Math.round((Date.parse(rec.at) - Date.parse(s.started_at)) / 1000));
    s.updated_at = rec.at;
    await this.store.put(s);
    return s;
  }

  async close(id, { endedBy = 'USER', summary = '' } = {}) {
    const s = await this.store.get(id);
    if (!s) return null;
    const at = new Date().toISOString();
    s.ended_at = at;
    s.ended_by = ENDED_BY.includes(endedBy) ? endedBy : 'USER';
    s.summary = String(summary || '').slice(0, 1000);
    s.elapsed_seconds = Math.max(0, Math.round((Date.parse(at) - Date.parse(s.started_at)) / 1000));
    s.updated_at = at;
    return this.store.put(s);
  }

  async noteError(id, message) {
    const s = await this.store.get(id);
    if (!s) return null;
    s.errors.push({ message: String(message).slice(0, 300), at: new Date().toISOString() });
    return this.store.put(s);
  }

  async listFor(ownerId = 'default') {
    const all = await this.store.all();
    return all
      .filter((s) => s.owner_id === ownerId)
      .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  }

  /**
   * 문서 '초기 평가 지표'를 뽑는다.
   * 질문 대비 반영 비율, 연속 질문 횟수, 자발 발화량, 완료율, 중도 종료 등.
   */
  async metrics(ownerId = 'default') {
    const list = await this.listFor(ownerId);
    const m = {
      sessions: list.length,
      completed: 0,          // 어르신이 스스로 마무리한 회기
      endedByDistress: 0,
      questions: 0,
      reflections: 0,        // 되짚기 · 공감 · 요약
      backToBackQuestions: 0,
      userTurns: 0,
      userChars: 0,
      avgElapsedSeconds: 0,
    };

    let elapsed = 0;
    for (const s of list) {
      if (s.ended_by === 'USER') m.completed += 1;
      if (s.ended_by === 'DISTRESS') m.endedByDistress += 1;
      elapsed += s.elapsed_seconds || 0;

      let prevWasQuestion = false;
      for (const t of s.turns) {
        if (t.role === 'user') {
          m.userTurns += 1;
          m.userChars += t.chars || 0;
          continue;
        }
        if (t.asked_question) {
          m.questions += 1;
          if (prevWasQuestion) m.backToBackQuestions += 1;
        }
        if (['REFLECT_CONTENT', 'VALIDATE_EMOTION', 'SUMMARIZE', 'BACKCHANNEL']
          .includes(t.response_mode)) m.reflections += 1;
        prevWasQuestion = Boolean(t.asked_question);
      }
    }

    m.avgElapsedSeconds = list.length ? Math.round(elapsed / list.length) : 0;
    // 질문 하나당 되짚기가 몇 번인지. 문서가 첫 번째로 보라고 한 지표다.
    m.reflectionPerQuestion = m.questions ? Number((m.reflections / m.questions).toFixed(2)) : null;
    return m;
  }
}

export { RESPONSE_MODES };
