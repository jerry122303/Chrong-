/* =====================================================================
 *  사진 살펴보기 — 추천 점수 ②~⑥ 에 쓸 단서를 모델이 한 번 뽑는다
 *
 *  사진을 올릴 때 한 번만 부른다. 대화할 때마다 부르지 않는다.
 *  결과는 기억(analysis)에 붙여 두고, 어느 사진부터 보여 드릴지 정하는 데만 쓴다.
 *  확인된 사실이 아니므로 대화 프롬프트에는 넣지 않는다.
 *
 *  사람 수를 세야 해서 대화 때(detail low)보다 자세히(high) 본다.
 *  한 장에 한 번이라 비용은 크지 않다.
 * ===================================================================== */

import { PLACE_TYPES, ACTIVITIES, ERAS, cleanAnalysis } from './records.js';

/** 모양을 못박는다. 빈 응답이나 모르는 낱말이 오지 않는다 */
export const ANALYSIS_SCHEMA = {
  name: 'photo_cues',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['people_count', 'objects', 'place_type', 'place_label',
      'activity', 'activity_label', 'era_estimate', 'is_reproduction'],
    properties: {
      people_count: {
        type: 'integer',
        description: '얼굴이나 몸이 분명히 보이는 사람 수. 사진 속 액자 · 포스터의 사람은 세지 않는다.',
      },
      objects: {
        type: 'array',
        items: { type: 'string' },
        description: '이야기의 실마리가 될 사물을 짧은 우리말 명사로. 사람은 넣지 않는다. 많아야 여덟 개.',
      },
      place_type: { type: 'string', enum: PLACE_TYPES },
      place_label: { type: 'string', description: '"바닷가", "한옥 마당" 처럼 짧게. 지명은 쓰지 않는다. 모르면 빈 문자열.' },
      activity: { type: 'string', enum: ACTIVITIES },
      activity_label: { type: 'string', description: '"가족 식사", "졸업식" 처럼 짧게. none 이면 빈 문자열.' },
      era_estimate: { type: 'string', enum: ERAS },
      is_reproduction: { type: 'boolean' },
    },
  },
};

const INSTRUCTIONS = `당신은 어르신과 나눌 회상 대화에 쓸 사진을 살펴, 어느 사진부터 보여 드릴지
정하는 데 필요한 단서만 적는 도우미입니다.

보이는 것만 적습니다. 짐작해 채우지 않습니다. 확실하지 않으면 비우거나 unknown 을 고릅니다.

- people_count: 얼굴이나 몸이 분명히 보이는 사람 수. 사진 안의 액자 · 그림 · 포스터 속 사람은 세지 않습니다.
- objects: 이야기의 실마리가 될 사물. 음식 · 상차림 · 탈것 · 동물 · 살림살이 · 눈에 띄는 옷차림 같은 것.
  하늘 · 벽 · 바닥처럼 어느 사진에나 있는 것과 사람은 넣지 않습니다. 같은 것은 한 번만, 많아야 여덟 개.
  "밥상", "자전거", "한복" 처럼 짧은 우리말 명사로 씁니다.
- place_type · place_label: 어디서 찍었는지. 단색 배경이나 사진관이면 studio, 알 수 없으면 unknown.
  place_label 은 "바닷가", "한옥 마당" 처럼 짧게. 도시 · 나라 같은 지명은 쓰지 않습니다.
- activity · activity_label: 무엇을 하는 장면인지. 그냥 서서 찍은 사진이면 none.
- era_estimate: 흑백 · 색감 · 옷차림 · 물건으로 보아 언제쯤 찍었는지 십 년 단위로. 확실하지 않으면 unknown.
- is_reproduction: 인화된 옛 사진을 휴대폰으로 다시 찍었거나 스캔한 것으로 보이면 true.
  (사진 테두리, 앨범 비닐, 종이 질감, 비스듬히 찍힌 모서리 같은 흔적)

사람이 누구인지, 나이, 서로 어떤 사이인지는 적지 않습니다.`;

/**
 * 사진 한 장을 살펴본다.
 * @returns {Promise<object>} lib/records.js cleanAnalysis 의 모양 (status: 'DONE')
 * @throws 요청이 실패하거나 모델이 거절하면
 */
export async function analyzePhoto({
  dataUrl, apiKey, base = 'https://api.openai.com/v1', model = 'gpt-4o',
  detail = 'high', fetchImpl = fetch, timeoutMs = 45000,
}) {
  if (!dataUrl) throw new Error('사진이 없습니다');
  if (!apiKey) throw new Error('API 키가 없습니다');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,       // 같은 사진이면 같은 결과가 나오게
        max_tokens: 400,
        response_format: { type: 'json_schema', json_schema: ANALYSIS_SCHEMA },
        messages: [
          { role: 'system', content: INSTRUCTIONS },
          {
            role: 'user',
            content: [
              { type: 'text', text: '이 사진을 살펴 주십시오.' },
              { type: 'image_url', image_url: { url: dataUrl, detail } },
            ],
          },
        ],
      }),
      signal: ctrl.signal,
    });

    if (!r.ok) {
      const detailText = (await r.text().catch(() => '')).slice(0, 200);
      throw new Error(`살펴보기 요청이 실패했습니다 (${r.status}) ${detailText}`);
    }
    const data = await r.json();
    const message = data.choices?.[0]?.message;
    if (message?.refusal) throw new Error('모델이 이 사진은 살펴보지 않겠다고 했습니다');

    const raw = JSON.parse(message?.content || '{}');
    return cleanAnalysis({ ...raw, status: 'DONE', analyzed_at: new Date().toISOString() });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('살펴보는 데 너무 오래 걸렸습니다');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
