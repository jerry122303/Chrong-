/* =====================================================================
 *  대화 기록 — 옆 서랍에서 지난 이야기를 골라 다시 불러온다
 *
 *  회기 기록(SESSION)과는 다른 것이다. SESSION 은 회상 한 회기가 어떻게
 *  흘러갔는지를 평가 지표로 남기는 것이고, 여기 THREAD 는 사람이 눈으로 보고
 *  "그저께 나눈 그 이야기" 를 다시 여는 목록이다.
 *
 *  건강관리 챗봇과 회상치료 챗봇은 서랍을 따로 쓴다 (mode).
 *  섞이면 어느 이야기의 이어짐인지 알 수 없다.
 * ===================================================================== */

import path from 'node:path';
import { JsonStore } from './jsonstore.js';

export const THREAD_MODES = ['health', 'recall'];
/** 한 대화에 남기는 차례 수. 오래된 것부터 지운다 */
export const MAX_TURNS = 200;
/** 서랍에 남기는 대화 수 */
export const MAX_THREADS = 100;

const nowISO = () => new Date().toISOString();
const asText = (v, max = 200) => String(v ?? '').trim().slice(0, max);

let seq = 0;
function newId() {
  seq = (seq + 1) % 1000;
  return `thread_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 목록에 보일 이름 — 처음 하신 말씀에서 따온다 */
export function titleFrom(messages = [], fallback = '새 대화') {
  const first = messages.find((m) => m && m.role === 'user' && String(m.content || '').trim());
  if (!first) return fallback;
  const line = String(first.content).replace(/\s+/g, ' ').trim();
  return line.length > 24 ? `${line.slice(0, 24)}…` : line;
}

export function makeMessage(input = {}) {
  return {
    role: input.role === 'assistant' ? 'assistant' : 'user',
    content: asText(input.content, 4000),
    at: input.at || nowISO(),
  };
}

export function makeThread(input = {}) {
  const at = input.created_at || nowISO();
  const messages = (Array.isArray(input.messages) ? input.messages : [])
    .map(makeMessage).filter((m) => m.content).slice(-MAX_TURNS);
  return {
    thread_id: input.thread_id || newId(),
    owner_id: asText(input.owner_id, 64) || 'default',
    mode: THREAD_MODES.includes(input.mode) ? input.mode : 'health',
    character: asText(input.character, 32) || 'chorong',
    title: asText(input.title, 60) || titleFrom(messages),
    // 회상 대화라면 마지막으로 함께 본 사진
    memory_id: input.memory_id ? asText(input.memory_id, 64) : null,
    messages,
    created_at: at,
    updated_at: input.updated_at || at,
  };
}

export class ThreadStore {
  constructor(dataDir) {
    this.store = new JsonStore(path.join(dataDir, 'threads'), 'thread_id');
    this.locks = new Map();
  }

  /** 같은 대화에 대한 쓰기를 줄 세운다 (말하는 사이에 이름이 바뀔 수 있다) */
  _serial(id, work) {
    const prev = this.locks.get(id) || Promise.resolve();
    const run = prev.then(work);
    const tail = run.catch(() => {});
    this.locks.set(id, tail);
    tail.then(() => { if (this.locks.get(id) === tail) this.locks.delete(id); });
    return run;
  }

  get(id) { return this.store.get(id); }

  async create(input = {}) {
    return this.store.put(makeThread(input));
  }

  /**
   * 서랍 목록 — 내용은 빼고 이름과 때만 (목록에 본문까지 실어 보내지 않는다).
   * 최근에 이야기한 것이 위로 온다.
   */
  async list(ownerId = 'default', { mode = null, limit = 50 } = {}) {
    const all = await this.store.all();
    return all
      .filter((t) => t.owner_id === ownerId)
      .filter((t) => (mode ? t.mode === mode : true))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .slice(0, limit)
      .map((t) => ({
        thread_id: t.thread_id,
        mode: t.mode,
        title: t.title,
        character: t.character,
        turns: (t.messages || []).length,
        updated_at: t.updated_at,
        created_at: t.created_at,
      }));
  }

  /** 한 차례(또는 여러 차례)를 이어 붙인다. 이름이 '새 대화' 면 첫 말씀으로 고친다 */
  append(id, messages = []) {
    return this._serial(id, async () => {
      const t = await this.store.get(id);
      if (!t) return null;
      const add = (Array.isArray(messages) ? messages : [messages])
        .map(makeMessage).filter((m) => m.content);
      if (add.length === 0) return t;

      t.messages = [...(t.messages || []), ...add].slice(-MAX_TURNS);
      if (!t.title || t.title === '새 대화') t.title = titleFrom(t.messages);
      t.updated_at = nowISO();
      return this.store.put(t);
    });
  }

  /** 지금 함께 보는 사진을 적어 둔다 (회상 대화) */
  setMemory(id, memoryId) {
    return this._serial(id, async () => {
      const t = await this.store.get(id);
      if (!t) return null;
      t.memory_id = memoryId ? asText(memoryId, 64) : null;
      t.updated_at = nowISO();
      return this.store.put(t);
    });
  }

  rename(id, title) {
    return this._serial(id, async () => {
      const t = await this.store.get(id);
      if (!t) return null;
      t.title = asText(title, 60) || t.title;
      t.updated_at = nowISO();
      return this.store.put(t);
    });
  }

  remove(id) { return this.store.remove(id); }

  /**
   * 오래된 대화를 정리한다. 서랍이 끝없이 길어지면 목록에서 찾기 어렵다.
   * 지운 개수를 돌려준다.
   */
  async prune(ownerId = 'default', keep = MAX_THREADS) {
    const all = (await this.store.all())
      .filter((t) => t.owner_id === ownerId)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    const old = all.slice(keep);
    for (const t of old) await this.store.remove(t.thread_id);
    return old.length;
  }
}
