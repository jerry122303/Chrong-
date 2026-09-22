/* =====================================================================
 *  건강 돌봄 — 대화에 얹는 맥락과, 화면이 부르는 길
 *
 *  server.js 가 이미 천육백 줄이라 여기 모았다. 하는 일은 셋이다.
 *  1) 이번 차례에 초롱이가 알아야 할 것을 프롬프트 한 토막으로 만든다
 *     (오늘 날짜 · 어르신이 정하신 목표 · 요 며칠 기운 · 어제 이야기 · 약 드실 때)
 *  2) 어르신 말씀에서 코드가 알아본 것을 기록한다 (기분 · 약 · 아픈 곳)
 *  3) 화면이 쓰는 길(/api/care/...)을 연다
 *
 *  대화를 끊지 않는 것이 무엇보다 먼저다. 기록에 실패해도 대답은 그대로 나간다.
 * ===================================================================== */

import {
  isCognitiveWorry, COGNITIVE_CARE_RULE, repeatsEarlier, CONFUSION_CARE_RULE,
  painMention, medicationTaken, medicationMissed, moodFromTalk, pickActivity, dateWords,
} from './care-rules.js';
import {
  activeGoal, goalRule, motivation, motivationRule, burnout, burnoutRule,
  lastSummary, summaryRule, moodGapRule, dueMedications, todayReport, moodTrend, factSummary,
} from './care-score.js';
import {
  localDate, localTime, MOODS, MOOD_KEYS, PAIN_PARTS, PAIN_LEVELS, PAIN_SEE_DOCTOR,
  ACTIVITY_KINDS,
} from './care-records.js';

/* ------------------------------------------------------------------ *
 * 1) 프롬프트에 얹을 한 토막
 * ------------------------------------------------------------------ */

/**
 * 이번 차례에 초롱이가 알아야 할 것.
 *
 * 다 넣지 않는다. 늘 넣으면 프롬프트가 길어지고, 초롱이가 어르신 이야기 대신
 * 목표와 약 이야기만 하게 된다. 지금 해당하는 것만 골라 넣는다.
 */
export function buildCareContext(care, {
  lastUserText = '', history = [], today = localDate(), now = localTime(),
} = {}) {
  const lines = [];

  /* 날짜는 늘 알려 드릴 수 있게 둔다. 어르신이 여쭈시면 시험하지 말고 바로 말씀드려야 한다 */
  lines.push(`- 오늘은 ${dateWords(today)}입니다. 날짜나 요일을 여쭈시면 바로 알려 드립니다.`);

  const goal = goalRule(activeGoal(care), { today });
  if (goal) lines.push(goal);

  const worn = burnoutRule(burnout(care, { today }));
  if (worn) lines.push(worn);
  else {
    const mot = motivationRule(motivation(care, { today }));
    if (mot) lines.push(mot);
  }

  const back = summaryRule(lastSummary(care, { today }));
  if (back) lines.push(back);

  const gap = moodGapRule(care?.days?.[today]?.mood);
  if (gap) lines.push(gap);

  const due = dueMedications(care, { today, now });
  if (due.length) {
    lines.push(`- ${due.map((m) => m.name).join(', ')} 드실 때가 지났는데 아직 기록이 없습니다.`);
    lines.push('- 이야기 흐름에 맞을 때 한 번만 가볍게 여쭙습니다. ("약은 드셨어요?" 처럼)');
    lines.push('  재촉하거나 나무라지 않습니다. 드셨다고 하시면 반갑게 받아 드리면 됩니다.');
  }

  if (isCognitiveWorry(lastUserText)) lines.push(COGNITIVE_CARE_RULE);
  if (repeatsEarlier(lastUserText, history)) lines.push(CONFUSION_CARE_RULE);

  return `\n\n[오늘 돌봄에서 참고할 것 — 사용자에게 그대로 읽어 드리는 내용이 아닙니다]\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------------ *
 * 2) 어르신 말씀에서 알아본 것 남기기
 * ------------------------------------------------------------------ */

/**
 * 말씀에서 기분과 약을 알아보고 남긴다.
 * 아픈 곳은 여기서 남기지 않는다. 어디가 얼마나 아프신지는 화면이 여쭙고 나서 남긴다.
 * 돌려주는 값은 화면에 띄울 카드와, 두 번 드셨을지 모른다는 알림이다.
 */
export async function noteFromTalk(store, ownerId, lastUserText,
  { history = [], keywords = true } = {}) {
  const out = { ask: null, medicationAgain: false, mood: null, pain: null };
  if (!lastUserText) return out;

  try {
    /* 회상 대화에서는 낱말로 오늘 상태를 읽지 않는다 (keywords: false).
       "옛날에 물건을 잃어버려서 불안했지", "그때는 다리가 아팠어" 처럼 지난 일을
       말씀하신 것이 오늘 기분이나 통증으로 남으면 크게 잘못 본다.
       회상 대화의 기분은 마치실 때 고르신 표정으로만 받는다
       (전달 패키지 v2.4 — FAQ Q3 · lib/termination.js). */
    if (!keywords) {
      await store.noteTurn(ownerId);
      return out;
    }

    const mood = moodFromTalk(lastUserText);
    if (mood) {
      out.mood = await store.setMood(ownerId, { key: mood.key, source: 'talk' });
    }

    if (medicationTaken(lastUserText)) {
      const took = await store.takeMedication(ownerId, {});
      out.medicationAgain = Boolean(took?.again);
    } else if (medicationMissed(lastUserText)) {
      out.ask = { kind: 'medication' };
    }

    const pain = painMention(lastUserText);
    if (pain) {
      out.pain = pain;
      // 아픈 이야기가 약 이야기보다 먼저다. 어디가 아프신지 알아봤으면 화면이 바로 정도만 여쭙는다
      out.ask = { kind: 'pain', part: pain.part };
    }

    await store.noteTurn(ownerId);
  } catch (err) {
    console.warn('[care] 기록하지 못했습니다', err.message);
  }
  return out;
}

/** 두 번 드셨을지 모를 때 덧붙이는 말 (나무라지 않고 여쭙는다) */
export const DOUBLE_DOSE_ASK = '그런데 혹시 아까도 약을 드시지 않았을까요? 헷갈리시면 약통을 한번 봐 주세요.';

/* ------------------------------------------------------------------ *
 * 3) 화면이 부르는 길
 * ------------------------------------------------------------------ */

/**
 * @param {import('express').Express} app
 * @param {{ store: import('./care-store.js').CareStore, owner: Function, fail: Function }} deps
 */
export function mountCareRoutes(app, { store, owner, fail }) {
  const when = () => ({ today: localDate(), now: localTime() });

  /** 어르신 화면이 첫 화면에서 한 번 부른다 — 오늘 무엇을 여쭈어야 하는지 */
  app.get('/api/care/today', async (req, res) => {
    try {
      const care = await store.get(owner(req));
      const { today, now } = when();
      const report = todayReport(care, { today, now });
      res.json({
        date: today,
        date_words: dateWords(today),
        report,
        /* 화면이 낱말을 따로 적어 두지 않게 고르실 것도 함께 보낸다 */
        moods: MOODS,
        pain_parts: PAIN_PARTS,
        pain_levels: PAIN_LEVELS,
        asked_mood: Boolean(care.days[today]?.mood_user),
      });
    } catch (err) {
      console.error('[care] today', err);
      fail(res, 500, '오늘 기록을 불러오지 못했어요.');
    }
  });

  /** 보호자 화면 — 열나흘 추이와 신호까지 */
  app.get('/api/care/report', async (req, res) => {
    try {
      const care = await store.get(owner(req));
      const { today, now } = when();
      const days = Math.min(60, Math.max(7, Number(req.query?.days) || 14));
      res.json({
        date: today,
        report: todayReport(care, { today, now }),
        trend: moodTrend(care, { days, today }),
        goals: care.goals,
        medications: care.medications,
        summaries: Object.values(care.summaries).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14),
      });
    } catch (err) {
      console.error('[care] report', err);
      fail(res, 500, '돌봄 기록을 불러오지 못했어요.');
    }
  });

  /** 어르신이 버튼으로 오늘 기분을 고르셨다 */
  app.post('/api/care/mood', async (req, res) => {
    try {
      const key = String(req.body?.key || '');
      if (!MOOD_KEYS.includes(key)) return fail(res, 400, '고르신 기분을 알 수 없어요.');
      const mood = await store.setMood(owner(req), { key, source: 'user' });
      res.json({ mood });
    } catch (err) {
      console.error('[care] mood', err);
      fail(res, 500, '기분을 남기지 못했어요.');
    }
  });

  /** 어디가 얼마나 아프신지 */
  app.post('/api/care/pain', async (req, res) => {
    try {
      const pain = await store.addPain(owner(req), {
        part: String(req.body?.part || ''),
        level: String(req.body?.level || 'mild'),
      });
      res.json({ pain, see_doctor: pain.score >= PAIN_SEE_DOCTOR });
    } catch (err) {
      console.error('[care] pain', err);
      fail(res, 500, '아픈 곳을 남기지 못했어요.');
    }
  });

  /** 약 — 보호자가 등록하고, 어르신은 드셨다고만 누르신다 */
  app.get('/api/care/medications', async (req, res) => {
    try {
      const care = await store.get(owner(req));
      const { today, now } = when();
      res.json({ medications: care.medications, due: dueMedications(care, { today, now }) });
    } catch (err) {
      console.error('[care] medications', err);
      fail(res, 500, '약을 불러오지 못했어요.');
    }
  });

  app.post('/api/care/medications', async (req, res) => {
    try {
      const med = await store.addMedication(owner(req), {
        name: req.body?.name, times: req.body?.times,
      });
      if (!med) return fail(res, 400, '약 이름을 적어 주세요.');
      res.status(201).json({ medication: med });
    } catch (err) {
      console.error('[care] add medication', err);
      fail(res, 500, '약을 등록하지 못했어요.');
    }
  });

  app.delete('/api/care/medications/:id', async (req, res) => {
    try {
      const gone = await store.removeMedication(owner(req), req.params.id);
      if (!gone) return fail(res, 404, '그런 약이 없어요.');
      res.json({ ok: true });
    } catch (err) {
      console.error('[care] remove medication', err);
      fail(res, 500, '약을 지우지 못했어요.');
    }
  });

  app.post('/api/care/medications/taken', async (req, res) => {
    try {
      const took = await store.takeMedication(owner(req), { name: req.body?.name });
      res.json({ record: took.record, again: took.again });
    } catch (err) {
      console.error('[care] taken', err);
      fail(res, 500, '복약을 남기지 못했어요.');
    }
  });

  /** 목표 — 대화에서 정해지고, 여기서는 보고 기록만 한다 */
  app.get('/api/care/goal', async (req, res) => {
    try {
      const care = await store.get(owner(req));
      const { today } = when();
      const goal = activeGoal(care);
      res.json({
        goal,
        achieved_today: goal ? (goal.achieved_dates || []).includes(today) : false,
        report: goal ? todayReport(care, { today }).goal : null,
      });
    } catch (err) {
      console.error('[care] goal', err);
      fail(res, 500, '목표를 불러오지 못했어요.');
    }
  });

  app.post('/api/care/goal/achieved', async (req, res) => {
    try {
      const goal = await store.achieveGoal(owner(req), { goalId: req.body?.goal_id || null });
      if (!goal) return fail(res, 404, '아직 정하신 목표가 없어요.');
      res.json({ goal });
    } catch (err) {
      console.error('[care] goal achieved', err);
      fail(res, 500, '기록하지 못했어요.');
    }
  });

  app.post('/api/care/goal/:id/finish', async (req, res) => {
    try {
      const goal = await store.finishGoal(owner(req), req.params.id);
      if (!goal) return fail(res, 404, '그런 목표가 없어요.');
      res.json({ goal });
    } catch (err) {
      console.error('[care] goal finish', err);
      fail(res, 500, '목표를 마치지 못했어요.');
    }
  });

  /** 오늘의 활동 — 오늘 안 하신 것 중에서 하나 */
  app.get('/api/care/activity', async (req, res) => {
    try {
      const { today } = when();
      const done = await store.doneActivities(owner(req), today);
      res.json({ activity: pickActivity(done, { date: today }), done });
    } catch (err) {
      console.error('[care] activity', err);
      fail(res, 500, '오늘의 활동을 준비하지 못했어요.');
    }
  });

  app.post('/api/care/activity', async (req, res) => {
    try {
      const kind = String(req.body?.kind || '');
      if (!ACTIVITY_KINDS.includes(kind)) return fail(res, 400, '어떤 활동인지 알 수 없어요.');
      const act = await store.addActivity(owner(req), { kind, answered: req.body?.answered !== false });
      res.status(201).json({ activity: act });
    } catch (err) {
      console.error('[care] activity done', err);
      fail(res, 500, '활동을 남기지 못했어요.');
    }
  });

  /**
   * 하루를 한 줄로 남긴다 (회기를 마칠 때 화면이 부른다).
   * 다음에 만나면 이 한 줄로 말문을 연다.
   */
  app.post('/api/care/summary', async (req, res) => {
    try {
      const ownerId = owner(req);
      const care = await store.get(ownerId);
      const { today } = when();
      const topics = (Array.isArray(req.body?.topics) ? req.body.topics : [])
        .map((t) => String(t || '').trim()).filter(Boolean).slice(0, 5);
      const made = factSummary(care, { today, topics });
      if (!made) return res.json({ summary: null });
      const summary = await store.saveSummary(ownerId, made);
      res.json({ summary });
    } catch (err) {
      console.error('[care] summary', err);
      fail(res, 500, '오늘 이야기를 요약하지 못했어요.');
    }
  });
}
