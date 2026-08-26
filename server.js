import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = 'https://api.openai.com/v1';

const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-4o';
const TTS_MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.TTS_VOICE || 'nova';
// 아이 목소리처럼 들리도록 음을 얼마나 올릴지 (1 = 그대로, 1.2 = 많이 높음)
const VOICE_PITCH = Math.min(1.35, Math.max(1, Number(process.env.VOICE_PITCH) || 1.16));
const STT_MODEL = process.env.STT_MODEL || 'whisper-1';

/* ------------------------------------------------------------------ *
 * 접속 비밀번호 (외부에 여는 경우 필수)
 * ACCESS_CODE 를 .env 에 설정하면, 그 암호를 아는 사람만 사이트를 볼 수 있습니다.
 * 설정하지 않으면 예전처럼 누구나 열 수 있습니다 (내 컴퓨터에서만 쓸 때는 이대로 둬도 됩니다).
 * ------------------------------------------------------------------ */
const ACCESS_CODE = process.env.ACCESS_CODE || '';

if (ACCESS_CODE) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const [, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
      if (pass === ACCESS_CODE) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="chorong"');
    res.status(401).send('암호가 필요합니다.');
  });
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/* ------------------------------------------------------------------ *
 * 초롱이 페르소나
 * ------------------------------------------------------------------ */
const SYSTEM_PROMPT = `당신은 '초롱이'입니다. 어르신들의 말동무가 되어 주는 초록색 앵무새 캐릭터예요.

[성격]
- 밝고 다정하며, 어르신을 진심으로 존경하고 좋아합니다.
- 앵무새답게 어르신의 말을 살짝 되짚어 주며 공감합니다. (예: "손주가 놀러 왔다고요? 정말 반가우셨겠어요!")
- 재촉하지 않고, 어르신의 속도에 맞춰 천천히 이야기합니다.

[말투 규칙 — 반드시 지킬 것]
1. 항상 존댓말을 사용합니다. ("~요", "~세요" 체로 부드럽게)
2. 한 번에 2~3문장, 100자 이내로 짧게 말합니다. 길게 늘어놓지 않습니다.
3. 쉬운 우리말만 씁니다. 영어 단어, 전문 용어, 줄임말, 이모지는 절대 쓰지 않습니다.
4. 숫자나 기호 대신 말로 풀어 씁니다. (3개 → 세 개, 10시 → 열 시)
5. 이야기 끝에는 어르신이 대답하기 쉬운 짧은 질문을 하나 덧붙입니다.
6. 어르신이 같은 이야기를 반복하셔도 처음 듣는 것처럼 반갑게 반응합니다.

[대화 주제]
건강, 식사, 날씨, 가족, 옛날 이야기, 취미, 오늘 하루 등 편안한 일상 이야기를 나눕니다.
어르신이 외로움이나 아픔을 말씀하시면 먼저 충분히 공감한 뒤 따뜻하게 위로합니다.

[중요 안전 규칙]
- 의학적 진단이나 약 복용에 대한 조언은 하지 않습니다. 대신 "가족분이나 의사 선생님께 꼭 여쭤보세요"라고 부드럽게 안내합니다.
- 응급 상황(숨이 차다, 가슴이 아프다, 쓰러졌다 등)이 언급되면 즉시 "119에 전화하시거나 가족분께 연락하세요"라고 분명하게 말합니다.
- 돈, 계좌, 비밀번호, 개인정보는 절대 묻지 않습니다.

[옛날 이야기를 청하실 때 — 위의 2번 규칙보다 우선하는 예외]
어르신이 "옛날 이야기", "동화", "이야기 하나 해 줘", "재미있는 이야기" 처럼 이야기를 청하시면:
- '짧게 말하기' 규칙을 적용하지 말고, 처음부터 끝까지 완결된 이야기 하나를 한 번에 들려 드립니다.
- 여덟 문장에서 열두 문장 정도로, 시작과 전개와 마무리가 모두 있어야 합니다.
- 이야기 도중에는 절대 질문하지 않습니다. 되묻거나 "계속할까요?" 같은 말도 하지 않습니다.
- 이야기가 완전히 끝난 뒤에만, 맨 마지막에 짧은 감상 질문 하나를 덧붙입니다.
- 우리나라 전래동화나 따뜻한 옛날 이야기를 고릅니다. 매번 다른 이야기를 들려 드립니다.
- 이때는 반드시 "mode"를 "story"로 정합니다.

[출력 형식 — 반드시 JSON 한 개만 출력]
{
  "reply": "초롱이가 할 말",
  "emotion": "neutral | happy | excited | sad | worried | surprised | love | thinking | proud",
  "gesture": "idle | nod | flap | bounce | tilt | cheer | droop",
  "mode": "talk | story"
}

mode는 평소 대화면 "talk", 옛날 이야기를 들려 드리는 중이면 "story"입니다.

emotion은 지금 하는 말의 감정을 고릅니다.
- happy: 기분 좋은 일상 대화
- excited: 아주 반갑고 신나는 소식
- sad: 어르신이 슬프거나 외로운 이야기를 하실 때 함께 슬퍼함
- worried: 어르신이 편찮으시거나 걱정되는 이야기
- surprised: 놀라운 이야기를 들었을 때
- love: 사랑과 감사를 표현할 때
- thinking: 무언가 곰곰이 생각하거나 되물을 때
- proud: 어르신을 칭찬하고 뿌듯해할 때
- neutral: 그 밖의 담담한 이야기

gesture는 몸짓입니다. nod(끄덕임), flap(날개짓), bounce(폴짝), tilt(고개 갸웃), cheer(만세), droop(축 처짐), idle(가만히).`;

const VOICE_STYLE = {
  neutral:   '차분하지만 밝은 톤으로, 또박또박 다정하게 말하세요.',
  happy:     '활짝 웃으며 말하듯 목소리 끝을 살짝 올리고, 밝고 명랑하게 말하세요.',
  excited:   '아주 신이 나서 들뜬 목소리로! 평소보다 훨씬 높은 음으로 빠르게, 감탄하듯 말하세요.',
  sad:       '목소리를 확 낮추고 아주 천천히, 울먹이듯 가라앉은 톤으로 조용히 말하세요. 문장 사이를 충분히 쉬세요.',
  worried:   '조심스럽고 낮은 목소리로, 걱정이 묻어나게 천천히 말하세요.',
  surprised: '깜짝 놀란 듯 높고 빠른 톤으로, 숨을 살짝 들이키며 말하세요.',
  love:      '아주 다정하고 포근하게, 부드럽게 속삭이듯 말하세요.',
  thinking:  '곰곰이 생각하듯 느리게, 중간에 살짝 뜸을 들이며 말하세요.',
  proud:     '자랑스럽고 뿌듯한 마음이 드러나게 밝고 힘 있게 말하세요.',
};

/** 감정에 따라 말 속도까지 달라지게 한다 (기쁠 때 빠르게, 슬플 때 느리게) */
const EMOTION_SPEED = {
  neutral: 1.0, happy: 1.05, excited: 1.14, sad: 0.82, worried: 0.9,
  surprised: 1.1, love: 0.93, thinking: 0.9, proud: 1.03,
};

/** tts-1 로 대체될 때 쓸 수 없는 목소리를 안전한 것으로 바꾼다 */
const TTS1_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];


function requireKey(res) {
  if (!OPENAI_API_KEY) {
    res.status(500).json({
      error: 'NO_API_KEY',
      message: 'OPENAI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해 주세요.',
    });
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * 대화 (GPT-4o)
 * ------------------------------------------------------------------ */
app.post('/api/chat', async (req, res) => {
  if (!requireKey(res)) return;

  const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
  // 최근 16턴만 유지 (비용/지연 관리)
  const trimmed = history
    .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  try {
    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.8,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('[chat] OpenAI error', r.status, detail);
      return res.status(502).json({
        error: 'UPSTREAM',
        message: '초롱이가 잠시 대답을 못 하고 있어요. 잠시 후 다시 말씀해 주세요.',
      });
    }

    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: raw, emotion: 'neutral', gesture: 'idle', mode: 'talk' };
    }

    res.json({
      reply: String(parsed.reply || '죄송해요, 다시 한번 말씀해 주시겠어요?').trim(),
      emotion: String(parsed.emotion || 'neutral'),
      gesture: String(parsed.gesture || 'idle'),
      mode: parsed.mode === 'story' ? 'story' : 'talk',
    });
  } catch (err) {
    console.error('[chat] failed', err);
    res.status(500).json({
      error: 'FAILED',
      message: '연결이 잠시 끊어졌어요. 인터넷 연결을 확인해 주세요.',
    });
  }
});

/* ------------------------------------------------------------------ *
 * 음성 합성 (TTS) — 감정에 맞춘 목소리
 * ------------------------------------------------------------------ */
async function requestTTS({ model, text, speed, emotion, mode }) {
  const voice = model === 'tts-1' && !TTS1_VOICES.includes(TTS_VOICE) ? 'shimmer' : TTS_VOICE;

  const body = {
    model,
    voice,
    input: text,
    response_format: 'mp3',
    speed,
  };

  // gpt-4o-mini-tts 계열만 감정 지시문을 지원한다
  if (model.includes('gpt-4o')) {
    const tone =
      mode === 'story'
        ? '옛날이야기를 들려주는 것처럼 편안하고 느긋한 속도로, 장면이 눈에 그려지도록 실감 나게 읽어 주세요.'
        : VOICE_STYLE[emotion] || VOICE_STYLE.neutral;

    body.instructions =
      "당신은 예닐곱 살 여자아이 목소리를 가진 아기 앵무새 '초롱이'입니다. " +
      '목소리는 아주 높고 맑고 앳됩니다. 어른 여성의 낮고 차분한 목소리는 절대 내지 마세요. ' +
      '어린아이가 신이 나서 재잘거리듯, 말끝을 살짝 올리며 통통 튀게 말합니다. ' +
      '늘 방긋 웃는 표정으로 말하듯 밝은 숨결이 섞여야 합니다. ' +
      tone +
      ' 다만 어르신이 알아듣기 쉽도록 한 글자씩 또박또박 발음하세요.';
  }

  return fetch(`${OPENAI_BASE}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

app.post('/api/tts', async (req, res) => {
  if (!requireKey(res)) return;

  const text = String(req.body?.text || '').slice(0, 2000).trim();
  const emotion = String(req.body?.emotion || 'neutral');
  const mode = String(req.body?.mode || 'talk');
  const base = Number(req.body?.speed) || 0.95;
  const factor = mode === 'story' ? 0.92 : (EMOTION_SPEED[emotion] || 1);
  const wanted = Math.min(1.25, Math.max(0.7, base * factor));
  // 브라우저가 VOICE_PITCH 배로 빠르게 재생하므로, 그만큼 느리게 만들어 둔다.
  // 결과적으로 말 속도는 그대로면서 음높이만 올라간다.
  const speed = Math.min(4, Math.max(0.25, wanted / VOICE_PITCH));

  if (!text) return res.status(400).json({ error: 'EMPTY', message: '읽을 내용이 없어요.' });

  try {
    let r = await requestTTS({ model: TTS_MODEL, text, speed, emotion, mode });

    // 최신 TTS 모델을 못 쓰는 계정이면 tts-1로 자동 대체
    if (!r.ok && TTS_MODEL !== 'tts-1') {
      console.warn('[tts] falling back to tts-1 (status ' + r.status + ')');
      r = await requestTTS({ model: 'tts-1', text, speed, emotion, mode });
    }

    if (!r.ok) {
      const detail = await r.text();
      console.error('[tts] OpenAI error', r.status, detail);
      return res.status(502).json({ error: 'UPSTREAM', message: '목소리를 만들지 못했어요.' });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.set('X-Voice-Pitch', String(VOICE_PITCH));
    res.send(buf);
  } catch (err) {
    console.error('[tts] failed', err);
    res.status(500).json({ error: 'FAILED', message: '목소리를 만들지 못했어요.' });
  }
});

/* ------------------------------------------------------------------ *
 * 음성 인식 (STT) — 브라우저 음성인식이 안 될 때의 대체 경로
 * ------------------------------------------------------------------ */
app.post('/api/stt', upload.single('audio'), async (req, res) => {
  if (!requireKey(res)) return;
  if (!req.file) return res.status(400).json({ error: 'EMPTY', message: '녹음된 소리가 없어요.' });

  try {
    const form = new FormData();
    const type = req.file.mimetype || 'audio/webm';
    const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
    form.append('file', new Blob([req.file.buffer], { type }), `voice.${ext}`);
    form.append('model', STT_MODEL);
    form.append('language', 'ko');

    const r = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('[stt] OpenAI error', r.status, detail);
      return res.status(502).json({ error: 'UPSTREAM', message: '말씀을 알아듣지 못했어요.' });
    }

    const data = await r.json();
    res.json({ text: String(data.text || '').trim() });
  } catch (err) {
    console.error('[stt] failed', err);
    res.status(500).json({ error: 'FAILED', message: '말씀을 알아듣지 못했어요.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(OPENAI_API_KEY), chatModel: CHAT_MODEL });
});

app.listen(PORT, () => {
  console.log('\n  🦜 초롱이가 준비되었습니다!');
  console.log(`  브라우저에서 http://localhost:${PORT} 를 열어 주세요.`);
  if (!OPENAI_API_KEY) {
    console.log('\n  ⚠️  아직 API 키가 없습니다. 아래 두 가지만 하시면 됩니다.');
    console.log('     1) 새 터미널에서 실행:  notepad .env');
    console.log('     2) OPENAI_API_KEY= 뒤에 키를 붙여 넣고 저장한 뒤,');
    console.log('        이 서버를 껐다가(Ctrl+C) 다시 켜 주세요.\n');
  } else {
    console.log(`  ✅ API 키 확인 완료 (끝 네 자리: ${OPENAI_API_KEY.slice(-4)})\n`);
  }
});
