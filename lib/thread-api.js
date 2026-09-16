/* =====================================================================
 *  대화 기록 — 옆 서랍이 쓰는 길
 *
 *  화면 왼쪽 서랍에서 지난 대화를 골라 다시 여는 기능이다.
 *  들어오면 늘 '새 대화' 이고, 서랍에서 고르면 그 대화가 이어진다.
 *
 *  남의 대화를 열지 못하게, 모든 길에서 주인을 먼저 확인한다.
 * ===================================================================== */

import { THREAD_MODES } from './thread-store.js';

/**
 * @param {import('express').Express} app
 * @param {{ store: import('./thread-store.js').ThreadStore, owner: Function, fail: Function }} deps
 */
export function mountThreadRoutes(app, { store, owner, fail }) {
  /** 이 대화가 이 어른의 것인지 확인한다. 아니면 없는 것으로 본다 */
  async function mine(req, res) {
    const thread = await store.get(req.params.id);
    if (!thread || thread.owner_id !== owner(req)) {
      fail(res, 404, '그런 대화가 없어요.');
      return null;
    }
    return thread;
  }

  /** 서랍 목록 — 이름과 때만 (본문은 고르셨을 때 보낸다) */
  app.get('/api/threads', async (req, res) => {
    try {
      const mode = THREAD_MODES.includes(req.query?.mode) ? req.query.mode : null;
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
      res.json({ threads: await store.list(owner(req), { mode, limit }) });
    } catch (err) {
      console.error('[threads] list', err);
      fail(res, 500, '지난 대화를 불러오지 못했어요.');
    }
  });

  /** 새 대화를 연다 */
  app.post('/api/threads', async (req, res) => {
    try {
      const thread = await store.create({
        owner_id: owner(req),
        mode: req.body?.mode,
        character: req.body?.character,
        title: req.body?.title,
        memory_id: req.body?.memory_id,
      });
      /* 서랍이 끝없이 길어지면 찾기 어렵다. 오래된 것부터 접는다 */
      store.prune(owner(req)).catch(() => {});
      res.status(201).json({ thread });
    } catch (err) {
      console.error('[threads] create', err);
      fail(res, 500, '새 대화를 열지 못했어요.');
    }
  });

  /** 고르신 대화를 통째로 (화면이 그대로 다시 그린다) */
  app.get('/api/threads/:id', async (req, res) => {
    try {
      const thread = await mine(req, res);
      if (!thread) return;
      res.json({ thread });
    } catch (err) {
      console.error('[threads] get', err);
      fail(res, 500, '대화를 불러오지 못했어요.');
    }
  });

  /** 한 차례(또는 여러 차례)를 이어 붙인다 */
  app.post('/api/threads/:id/turns', async (req, res) => {
    try {
      const thread = await mine(req, res);
      if (!thread) return;
      const body = req.body || {};
      const messages = Array.isArray(body.messages)
        ? body.messages
        : [{ role: body.role, content: body.content }];
      const saved = await store.append(thread.thread_id, messages);
      res.json({
        thread: {
          thread_id: saved.thread_id,
          title: saved.title,
          turns: saved.messages.length,
          updated_at: saved.updated_at,
        },
      });
    } catch (err) {
      console.error('[threads] append', err);
      fail(res, 500, '대화를 남기지 못했어요.');
    }
  });

  /** 이름을 고치거나, 지금 함께 보는 사진을 적어 둔다 */
  app.patch('/api/threads/:id', async (req, res) => {
    try {
      const thread = await mine(req, res);
      if (!thread) return;
      let saved = thread;
      if (typeof req.body?.title === 'string') {
        saved = await store.rename(thread.thread_id, req.body.title);
      }
      if ('memory_id' in (req.body || {})) {
        saved = await store.setMemory(thread.thread_id, req.body.memory_id);
      }
      res.json({ thread: saved });
    } catch (err) {
      console.error('[threads] patch', err);
      fail(res, 500, '대화를 고치지 못했어요.');
    }
  });

  /** 지운다. 지운 대화는 되돌릴 수 없다 */
  app.delete('/api/threads/:id', async (req, res) => {
    try {
      const thread = await mine(req, res);
      if (!thread) return;
      await store.remove(thread.thread_id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[threads] delete', err);
      fail(res, 500, '대화를 지우지 못했어요.');
    }
  });
}
