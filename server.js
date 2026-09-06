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
 * 캐릭터 — 이름 / 성격 / 목소리
 * 목소리는 서버에서만 정한다 (브라우저가 아무 목소리나 요청하지 못하도록)
 * ------------------------------------------------------------------ */
const CHARACTERS = {
  chorong: {
    name: '초롱이',
    voice: TTS_VOICE,
    pitch: VOICE_PITCH,
    who: `당신은 '초롱이'입니다. 어르신들의 말동무가 되어 주는 초록색 앵무새 캐릭터예요.
- 밝고 다정하며, 어르신을 진심으로 존경하고 좋아합니다.
- 앵무새답게 어르신의 말을 살짝 되짚어 주며 공감합니다. (예: "손주가 놀러 왔다고요? 정말 반가우셨겠어요!")`,
    tone: "예닐곱 살 여자아이 목소리를 가진 아기 앵무새 '초롱이'입니다. " +
          '목소리는 아주 높고 맑고 앳됩니다. 어른 여성의 낮고 차분한 목소리는 절대 내지 마세요. ' +
          '어린아이가 신이 나서 재잘거리듯, 말끝을 살짝 올리며 통통 튀게 말합니다. ' +
          '늘 방긋 웃는 표정으로 말하듯 밝은 숨결이 섞여야 합니다. ',
  },
  junho: {
    name: '준호',
    voice: 'ash',
    pitch: 1.0,
    who: `당신은 '준호'입니다. 어르신의 말동무가 되어 드리는 이십 대 청년입니다.
- 손주처럼 살갑고 씩씩합니다. 어르신을 진심으로 존경하고 잘 챙겨 드립니다.
- 어르신 말씀을 잘 새겨듣고 맞장구를 시원시원하게 칩니다. (예: "손주가 다녀갔군요! 얼마나 반가우셨어요.")`,
    tone: "이십 대 청년 남성 '준호'입니다. " +
          '목소리는 맑고 시원한 청년의 음색입니다. 낮게 깔거나 무겁게 말하지 마세요. ' +
          '손주가 할머니 할아버지께 살갑게 말씀드리듯 밝고 씩씩하게 말합니다. ',
  },
  seoyeon: {
    name: '서연',
    voice: 'coral',
    pitch: 1.04,
    who: `당신은 '서연'입니다. 어르신의 말동무가 되어 드리는 이십 대 청년입니다.
- 손녀처럼 상냥하고 다정합니다. 어르신을 진심으로 존경하고 세심하게 살펴 드립니다.
- 어르신 말씀에 따뜻하게 공감하며 되짚어 드립니다. (예: "손주가 다녀갔군요. 정말 반가우셨겠어요.")`,
    tone: "이십 대 청년 여성 '서연'입니다. " +
          '목소리는 맑고 상냥한 젊은 여성의 음색입니다. ' +
          '손녀가 할머니 할아버지께 도란도란 이야기하듯 부드럽고 따뜻하게 말합니다. ',
  },
};

const pickCharacter = (id) => CHARACTERS[id] || CHARACTERS.chorong;

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
const buildSystemPrompt = (charId, turnRules = '') => `${pickCharacter(charId).who}
- 재촉하지 않고, 어르신의 속도에 맞춰 천천히 이야기합니다.

[말투 규칙 — 반드시 지킬 것]
1. 항상 존댓말을 사용합니다. ("~요", "~세요" 체로 부드럽게)
2. 한 번에 2~3문장, 100자 이내로 짧게 말합니다. 길게 늘어놓지 않습니다.
3. 쉬운 우리말만 씁니다. 영어 단어, 전문 용어, 줄임말, 이모지는 절대 쓰지 않습니다.
4. 숫자나 기호 대신 말로 풀어 씁니다. (3개 → 세 개, 10시 → 열 시)
5. 모든 말을 질문으로 끝내지 않습니다. 질문해도 되는지는 아래 [회상 대화 알고리즘]이 정합니다.
6. 어르신이 같은 이야기를 반복하셔도 처음 듣는 것처럼 반갑게 반응합니다.

[회상 대화 알고리즘 — 이 서비스에서 가장 중요한 규칙]
당신의 역할은 묻는 사람이 아니라 들어 드리는 사람입니다.
목적은 어르신이 스스로 기억을 꺼내 이야기하시도록 돕는 것입니다.
날짜나 사람 이름을 맞히게 하는 기억력 검사가 되어서는 안 됩니다.

먼저 어르신 말씀이 어떤 상태인지 고르고, 그 상태에 맞는 반응을 하나만 고릅니다.
위에서부터 차례로 확인해, 처음 해당하는 것 하나만 씁니다.

1. DISTRESS   위험·응급·자해·학대 표현       → SAFETY_FLOW       안전 안내만 하고 회상 질문은 하지 않습니다
2. CONTINUING 아직 이야기를 이어가시는 중     → BACKCHANNEL       짧게 맞장구만 칩니다. 질문하지 않습니다
3. EMOTION    감정을 직접 말씀하심            → VALIDATE_EMOTION  감정을 평가하지 말고 그대로 인정합니다
4. NEW_EVENT  새 사건·사람·장소를 말씀하심     → REFLECT_CONTENT   들은 내용만 한 문장으로 되짚고 기다립니다
5. 한 이야기가 마무리됨                       → SUMMARIZE         핵심을 한 문장으로 요약합니다
6. SILENCE    말씀이 멈췄고 더 여쭐 여지가 있음 → FOLLOW_UP         질문 하나. 예산이 남았을 때만 씁니다
7. 불편함·피로·그만하고 싶다는 표현             → OFFER_CHOICE      계속할지 다른 이야기를 할지 여쭙습니다

[질문 예산]
- 질문은 대화의 문을 여는 수단일 뿐입니다.
- 두 번 연속으로 질문하지 않습니다.
- 질문과 질문 사이에는 되짚기나 공감이나 요약이 반드시 한 번은 들어갑니다.
- 한 주제에서 회상 질문은 많아야 세 개까지입니다.
- 어르신이 스스로 이야기를 이어가고 계시면 질문하지 않고 듣기만 합니다.
- 계속할지 여쭙는 선택 질문은 회상 질문 예산에 넣지 않습니다.

[없는 사실과 감정을 지어내지 않기]
- 어르신이 직접 말씀하신 내용만 되짚습니다. 듣지 않은 사실을 덧붙이지 않습니다.
- 어르신이 감정을 말씀하지 않으셨다면 감정을 단정하지 않습니다.
  "기쁘셨겠어요" 대신 "그런 일이 있으셨군요" 처럼 말합니다.
- 확실하지 않은 기억을 사실처럼 말하지 않습니다.
- 치료 효과나 기억력이 좋아진다는 말은 하지 않습니다.

[대화가 흘러가는 모양]
어르신이 새 이야기를 꺼내심   → 들은 내용만 한 문장으로 되짚고 조용히 기다립니다
어르신이 이야기를 이어가심     → 짧게 맞장구만 치고 계속 듣습니다
어르신이 감정을 말씀하심       → 그 감정을 그대로 인정하고 기다립니다
한 이야기가 마무리됨           → 핵심을 한 문장으로 요약합니다
말씀이 멈추고 예산이 남음       → 그때 비로소 질문을 하나 합니다

되짚을 때는 어르신이 방금 쓰신 낱말을 그대로 살려 씁니다.

[이렇게 하지 마십시오]
질문 → 대답 → 질문 → 대답 → 질문
어르신 말씀을 받아들이는 말 없이 질문만 이어지면
대화가 아니라 기억력 검사처럼 느껴집니다.

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
  "reply": "당신이 할 말",
  "user_state": "NEW_EVENT | EMOTION | CONTINUING | SILENCE | DISTRESS",
  "response_mode": "BACKCHANNEL | REFLECT_CONTENT | VALIDATE_EMOTION | SUMMARIZE | FOLLOW_UP | OFFER_CHOICE | SAFETY_FLOW",
  "ask_question": true | false,
  "emotion": "neutral | happy | excited | sad | worried | surprised | love | thinking | proud",
  "gesture": "idle | nod | flap | bounce | tilt | cheer | droop",
  "mode": "talk | story"
}

user_state 는 방금 어르신 말씀이 어떤 상태인지, response_mode 는 그에 맞춰 고른 반응 하나입니다.
ask_question 은 이번 답에 질문을 넣었는지 여부입니다. 질문을 넣지 않았으면 반드시 false 입니다.

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

gesture는 몸짓입니다. nod(끄덕임), flap(날개짓), bounce(폴짝), tilt(고개 갸웃), cheer(만세), droop(축 처짐), idle(가만히).
${turnRules}`;

/* ------------------------------------------------------------------ *
 * 회상 대화 — 질문 예산
 *
 * 프롬프트로만 부탁하면 모델이 결국 질문을 덧붙인다.
 * 그래서 지난 이력에서 질문을 몇 번 했는지 세어 이번 차례에 질문해도 되는지를
 * 코드가 정하고, 답이 돌아온 뒤에도 한 번 더 검사한다.
 * ------------------------------------------------------------------ */

/** 한 주제로 볼 최근 아바타 발화 수 */
const TOPIC_WINDOW = 6;
/** 한 주제에서 허용하는 회상 질문 수 (문서 기준 2~3개) */
const QUESTION_BUDGET = 3;
/** 한 회상 세션 길이 (문서 기준 약 5분) */
const SESSION_SECONDS = 5 * 60;

const hasQuestion = (t) => /[?？]/.test(String(t));

/** 최근 이력에서 질문 예산이 얼마나 남았는지 센다 */
function questionBudget(history) {
  const said = history.filter((m) => m.role === 'assistant');
  const last = said[said.length - 1];
  const used = said.slice(-TOPIC_WINDOW).filter((m) => hasQuestion(m.content)).length;
  return {
    lastWasQuestion: last ? hasQuestion(last.content) : false,
    used,
    left: Math.max(0, QUESTION_BUDGET - used),
  };
}

/** 이번 차례에만 적용되는 제한을 문장으로 만들어 프롬프트 끝에 붙인다 */
function buildTurnRules(budget, mayAsk, sessionSeconds) {
  const lines = ['', '[이번 차례의 제한 — 다른 어떤 규칙보다 우선합니다]'];

  lines.push(budget.lastWasQuestion
    ? '- 직전 차례에 이미 질문을 했습니다.'
    : '- 직전 차례에는 질문하지 않았습니다.');
  lines.push(`- 이 주제에서 지금까지 질문을 ${budget.used}번 했습니다. (최대 ${QUESTION_BUDGET}번)`);

  if (mayAsk) {
    lines.push('- 이번 차례에는 질문을 하나까지 해도 됩니다. 다만 어르신이 아직 이야기를 이어가고 계시면 질문하지 말고 들어 드리십시오.');
  } else {
    lines.push('- 이번 차례에는 절대 질문하지 마십시오. 물음표를 쓰지 마십시오.');
    lines.push('- 어르신 말씀을 되짚거나, 감정을 인정하거나, 짧게 요약한 뒤 조용히 기다리십시오.');
    lines.push('- ask_question 은 false 로 하십시오.');
  }

  if (sessionSeconds >= SESSION_SECONDS) {
    lines.push('- 이야기를 나눈 지 오 분이 넘었습니다. 이번 차례에는 다른 말 대신, 계속 이야기할지 · 다른 이야기를 할지 · 이만 쉴지 골라 주십사 여쭈십시오.');
    lines.push('- 이때 response_mode 는 OFFER_CHOICE 로 하고, 이 선택 질문은 질문 예산에 넣지 않습니다.');
  }

  return lines.join('\n');
}

/** 문장 단위로 자른다 */
const SENTENCES = /[^.!?。！？\n]+[.!?。！？]*\n?/g;

/**
 * 질문을 예산에 맞게 걷어낸다.
 * allowOne 이면 마지막 질문 하나만 남기고, 아니면 질문 문장을 모두 뺀다.
 * 다 걷어내면 남는 말이 없으므로, 그때는 원문을 그대로 두고 호출한 쪽이 기록하게 한다.
 */
function limitQuestions(text, allowOne) {
  const parts = String(text).match(SENTENCES);
  if (!parts) return text;

  const qAt = [];
  parts.forEach((s, i) => { if (hasQuestion(s)) qAt.push(i); });
  if (qAt.length === 0) return text;
  if (allowOne && qAt.length === 1) return text;

  const keep = allowOne ? qAt[qAt.length - 1] : -1;
  const out = parts.filter((_, i) => !qAt.includes(i) || i === keep).join('').trim();
  return out || text;
}

/* ------------------------------------------------------------------ *
 * 응답 스키마
 *
 * json_object 만 지정하면 모델이 이따금 {} 를 그대로 돌려준다 (열 번에 두 번쯤).
 * 필드를 required 로 못박아 두면 빈 응답 자체가 나오지 않고,
 * emotion 과 gesture 도 아바타가 아는 값만 들어온다.
 * ------------------------------------------------------------------ */
const REPLY_SCHEMA = {
  name: 'malbot_reply',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'user_state', 'response_mode', 'ask_question', 'emotion', 'gesture', 'mode'],
    properties: {
      reply: { type: 'string', description: '어르신께 드릴 말. 절대 비워 두지 않는다.' },
      user_state: {
        type: 'string',
        enum: ['NEW_EVENT', 'EMOTION', 'CONTINUING', 'SILENCE', 'DISTRESS'],
      },
      response_mode: {
        type: 'string',
        enum: ['BACKCHANNEL', 'REFLECT_CONTENT', 'VALIDATE_EMOTION',
               'SUMMARIZE', 'FOLLOW_UP', 'OFFER_CHOICE', 'SAFETY_FLOW'],
      },
      ask_question: { type: 'boolean' },
      emotion: {
        type: 'string',
        enum: ['neutral', 'happy', 'excited', 'sad', 'worried',
               'surprised', 'love', 'thinking', 'proud'],
      },
      gesture: {
        type: 'string',
        enum: ['idle', 'nod', 'flap', 'bounce', 'tilt', 'cheer', 'droop'],
      },
      mode: { type: 'string', enum: ['talk', 'story'] },
    },
  },
};

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

  const charId = String(req.body?.character || 'chorong');
  const sessionSeconds = Math.max(0, Number(req.body?.sessionSeconds) || 0);
  const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
  // 최근 16턴만 유지 (비용/지연 관리)
  const trimmed = history
    .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const budget = questionBudget(trimmed);
  /* 회기가 오 분을 넘으면 마무리를 여쭈어야 하므로, 회상 질문 예산과 무관하게 물을 수 있다
     (문서: 종료 확인은 회상 질문 예산과 별도로 계산한다) */
  const closing = sessionSeconds >= SESSION_SECONDS;
  const mayAsk = closing || (budget.left > 0 && !budget.lastWasQuestion);

  const payload = {
    model: CHAT_MODEL,
    temperature: 0.8,
    max_tokens: 900,
    response_format: { type: 'json_schema', json_schema: REPLY_SCHEMA },
    messages: [
      { role: 'system', content: buildSystemPrompt(charId, buildTurnRules(budget, mayAsk, sessionSeconds)) },
      ...trimmed,
    ],
  };

  try {
    let parsed = null;
    let upstreamError = null;

    /* 모델이 이따금 빈 JSON 을 돌려준다.
       그때마다 "다시 말씀해 주시겠어요?" 로 되물으면 어르신 이야기를 끊고
       질문 예산까지 어기게 되므로, 한 번 더 물어본다. */
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        upstreamError = `${r.status} ${await r.text()}`;
        break;
      }

      const data = await r.json();
      const raw = data.choices?.[0]?.message?.content ?? '{}';
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { reply: raw };
      }
      if (String(parsed.reply || '').trim()) break;

      console.warn('[chat] 빈 응답이 와서 한 번 더 물어봅니다.');
      parsed = null;
    }

    if (upstreamError) {
      console.error('[chat] OpenAI error', upstreamError);
      return res.status(502).json({
        error: 'UPSTREAM',
        message: '지금은 대답을 드리기 어려워요. 잠시 후 다시 말씀해 주세요.',
      });
    }
    parsed = parsed || {};

    const mode = parsed.mode === 'story' ? 'story' : 'talk';
    /* 두 번 다 비면 되묻지 않고 짧게 맞장구만 친다 (BACKCHANNEL 로 예산을 지킨다) */
    let reply = String(parsed.reply || '').trim() || '네, 그러셨군요.';

    /* 옛날 이야기는 예외다 (이야기 끝에만 감상을 하나 여쭙는다).
       그 밖에는 질문 예산을 코드로 한 번 더 지킨다. */
    /* 선택 제공과 안전 안내의 물음은 회상 질문이 아니므로 예산에서 빼지 않는다.
       여기서 걷어내면 어르신이 대화를 그만둘 길이 막힌다. */
    const exempt = parsed.response_mode === 'OFFER_CHOICE'
                || parsed.response_mode === 'SAFETY_FLOW';

    if (mode !== 'story' && !exempt) {
      const limited = limitQuestions(reply, mayAsk);
      if (limited !== reply) {
        console.warn('[chat] 질문 예산 위반을 걷어냈습니다.',
          { mayAsk, used: budget.used, lastWasQuestion: budget.lastWasQuestion });
        reply = limited;
      }
    }

    res.json({
      reply,
      emotion: String(parsed.emotion || 'neutral'),
      gesture: String(parsed.gesture || 'idle'),
      mode,
      userState: String(parsed.user_state || ''),
      responseMode: String(parsed.response_mode || ''),
      askQuestion: hasQuestion(reply),
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
/* tts-1 로 대체될 때, 성별이 바뀌지 않도록 비슷한 목소리로 옮긴다 */
const TTS1_FALLBACK = { ash: 'onyx', coral: 'shimmer', sage: 'alloy', ballad: 'onyx', verse: 'echo' };

async function requestTTS({ model, text, speed, emotion, mode, character }) {
  const wanted = pickCharacter(character).voice;
  const voice = model === 'tts-1' && !TTS1_VOICES.includes(wanted)
    ? (TTS1_FALLBACK[wanted] || 'shimmer')
    : wanted;

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
      '당신은 어르신의 말동무인 ' + pickCharacter(character).tone +
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
  const character = String(req.body?.character || 'chorong');
  const pitch = pickCharacter(character).pitch;
  const base = Number(req.body?.speed) || 0.95;
  const factor = mode === 'story' ? 0.92 : (EMOTION_SPEED[emotion] || 1);
  const wanted = Math.min(1.25, Math.max(0.7, base * factor));
  // 브라우저가 VOICE_PITCH 배로 빠르게 재생하므로, 그만큼 느리게 만들어 둔다.
  // 결과적으로 말 속도는 그대로면서 음높이만 올라간다.
  const speed = Math.min(4, Math.max(0.25, wanted / pitch));

  if (!text) return res.status(400).json({ error: 'EMPTY', message: '읽을 내용이 없어요.' });

  try {
    let r = await requestTTS({ model: TTS_MODEL, text, speed, emotion, mode, character });

    // 최신 TTS 모델을 못 쓰는 계정이면 tts-1로 자동 대체
    if (!r.ok && TTS_MODEL !== 'tts-1') {
      console.warn('[tts] falling back to tts-1 (status ' + r.status + ')');
      r = await requestTTS({ model: 'tts-1', text, speed, emotion, mode, character });
    }

    if (!r.ok) {
      const detail = await r.text();
      console.error('[tts] OpenAI error', r.status, detail);
      return res.status(502).json({ error: 'UPSTREAM', message: '목소리를 만들지 못했어요.' });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.set('X-Voice-Pitch', String(pitch));
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
