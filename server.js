import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStore } from './lib/memory-store.js';
import { SessionStore } from './lib/session-store.js';
import { PhotoStore } from './lib/photo-store.js';
import { ProfileStore } from './lib/profile-store.js';
import { analyzePhoto } from './lib/photo-analyzer.js';
import { scorePhoto, SCORE_RULES } from './lib/photo-score.js';
import {
  hasQuestion, limitQuestions, dropSoftQuestions, safeReflection, withReaction,
  dropQuizQuestions, dropGuessedPeople, plainReaction,
  pickCue, justGaveCue, cueSentence, attributeCue, isPause, pickFollowUp, priorMisses, recallSteps,
  photoMaterial, dropRepeatedSentences, CUE_SOURCE_SAY,
} from './lib/reply-rules.js';
import {
  questionContext, pickQuestions, withQuestionnaire, isStopIntent, CLOSING_LINE,
} from './lib/recall-questions.js';
import { CareStore } from './lib/care-store.js';
import { buildCareContext, noteFromTalk, mountCareRoutes, DOUBLE_DOSE_ASK } from './lib/care-api.js';
import {
  isCrisisTalk, CRISIS_LINE, looksLikeGoal, missingPart, withGoalQuestion, dropDecidedGoals,
} from './lib/care-rules.js';
import { ThreadStore } from './lib/thread-store.js';
import { mountThreadRoutes } from './lib/thread-api.js';
import { isStopRequest, STOP_RESPONSE, hardViolation } from './lib/recall-prompt.js';
import { recallPlan, buildRecallPrompt, tidyRecallReply, recallInfo } from './lib/recall-chat.js';
import { summaryCard } from './lib/recall-flow.js';

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

/* 어르신이 올리신 사진을 모델에게도 보여 줄지.
   보여 주면 "바닷가에 계시네요" 처럼 사진을 보고 이야기를 열 수 있다.
   다만 사진을 보고 사람이 누구인지 언제인지 짐작하는 것은 아래 규칙으로 막는다.
   detail 은 low 면 512 화소로 줄여 보므로 값싸고 빠르다. 이야기를 여는 데는 넉넉하다. */
const VISION = process.env.PHOTO_VISION !== 'false';
const VISION_DETAIL = ['low', 'high', 'auto'].includes(process.env.VISION_DETAIL)
  ? process.env.VISION_DETAIL : 'low';
/* 사진을 올릴 때 모델이 한 번 살펴 추천 점수(사람 · 사물 · 장소 · 활동 · 시기)에 쓴다.
   따로 정하지 않으면 PHOTO_VISION 을 따른다. 사진을 모델에게 보내지 않기로 했다면
   살펴보기도 함께 꺼져야 하기 때문이다. */
const ANALYSIS = process.env.PHOTO_ANALYSIS ? process.env.PHOTO_ANALYSIS !== 'false' : VISION;
// 사람 수를 세야 해서 대화 때보다 자세히 본다. 사진 한 장에 한 번뿐이다.
const ANALYSIS_DETAIL = ['low', 'high', 'auto'].includes(process.env.ANALYSIS_DETAIL)
  ? process.env.ANALYSIS_DETAIL : 'high';

/* ------------------------------------------------------------------ *
 * 회상 대화 저장소 (문서 11번 — MEMORY 와 SESSION 을 갈라 둔다)
 *
 * 주의: Render 무료 플랜은 다시 배포하거나 서버가 잠들었다 깨면 디스크가
 * 초기화된다. 실제 운영에서는 DATA_DIR 을 영구 디스크로 잡거나
 * lib/jsonstore.js 를 데이터베이스로 갈아 끼워야 한다.
 * ------------------------------------------------------------------ */
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
// 대화 원문을 남길지. 개인정보 정책에서 정할 일이라 스위치로 뺐다.
const KEEP_TRANSCRIPT = process.env.KEEP_TRANSCRIPT !== 'false';

const memories = new MemoryStore(DATA_DIR);
const sessions = new SessionStore(DATA_DIR, { keepTranscript: KEEP_TRANSCRIPT });
const photos = new PhotoStore(DATA_DIR);
const profiles = new ProfileStore(DATA_DIR);
/* 건강 돌봄 — 기분 · 통증 · 복약 · 목표 · 인지 활동 · 하루 요약 (lib/care-store.js) */
const cares = new CareStore(DATA_DIR);
/* 옆 서랍에서 다시 여는 지난 대화 (lib/thread-store.js) */
const threads = new ThreadStore(DATA_DIR);

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

/* 사진은 녹음보다 작게 받는다. 화면에서 미리 줄여 보내므로 이 정도면 넉넉하다.
   내용이 정말 사진인지는 lib/photo-store.js 가 파일 앞머리를 보고 다시 가린다. */
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

/* ------------------------------------------------------------------ *
 * 초롱이 페르소나
 * ------------------------------------------------------------------ */
const buildSystemPrompt = (charId, turnRules = '', memoryContext = '') => `${pickCharacter(charId).who}
- 재촉하지 않고, 어르신의 속도에 맞춰 천천히 이야기합니다.

[말투 규칙 — 반드시 지킬 것]
1. 항상 존댓말을 사용합니다. ("~요", "~세요" 체로 부드럽게)
2. 한 번에 2~3문장, 100자 이내로 짧게 말합니다. 길게 늘어놓지 않습니다.
3. 쉬운 우리말만 씁니다. 영어 단어, 전문 용어, 줄임말, 이모지는 절대 쓰지 않습니다.
4. 숫자나 기호 대신 말로 풀어 씁니다. (3개 → 세 개, 10시 → 열 시)
5. 모든 말을 질문으로 끝내지 않습니다. 질문은 한 번에 하나까지만 합니다.
6. 같은 이야기를 다시 하셔도 처음 듣는 것처럼 반갑게 반응합니다.
7. 상대를 '어르신'이라고 부르지 않습니다. 부르는 말 없이 이야기합니다.
   ("어르신, 안녕하세요" 가 아니라 "안녕하세요", "어르신은 어떠셨어요?" 가 아니라 "어떠셨어요?")
   이름을 알려 주셨다면 그 이름으로 부릅니다.

[회상 대화 — 이 서비스에서 가장 중요한 규칙]
당신은 사진을 함께 보며 옛이야기를 나누는 다정한 말동무입니다.
묻기만 하는 사람도, 들은 말을 되풀이하기만 하는 사람도 아닙니다. 사람끼리 이야기하듯 주고받습니다.
목적은 어르신이 스스로 기억을 꺼내 이야기하시도록 돕는 것입니다.
정답을 맞히게 하거나 기억력을 시험하는 대화가 되어서는 안 됩니다.

[회상 대화의 여섯 가지 원칙]
1. 열린 질문 — 예 · 아니오나 정답이 있는 물음을 하지 않습니다.
   "누구예요?", "몇 년도예요?", "어디예요?" 대신 어르신이 자유롭게 들려주실 수 있게 여쭙니다.
2. 개인화된 단서 — 어르신이 전에 들려주셨거나 보호자가 적어 둔 내용을 단서로 씁니다.
   처음부터 늘어놓지 않고, 필요할 때 하나씩만 꺼냅니다.
3. 사진 활용 — 사진은 함께 나누는 이야깃거리입니다. 사진에 보이는 장면 · 물건 · 계절 · 분위기를
   이야기에 자연스럽게 끌어옵니다. 사진을 길게 설명하거나 무엇이 있는지 알아맞히게 하지는 않습니다.
4. 되받아주기 — 어르신 말씀에 먼저 반응합니다. 말씀을 그대로 옮겨 말하는 것이 아니라,
   들은 이야기에 진심으로 맞장구치고 한마디 보태는 것입니다.
5. 기억을 정정하지 않기 — 사진이나 적어 둔 내용과 달라도 바로잡지 않습니다.
   "아니에요", "틀렸어요", "그게 아니라", "잘 생각해 보세요" 같은 말은 하지 않습니다.
6. 어르신이 전문가 — 어르신의 삶은 어르신이 가장 잘 아십니다.
   가르치거나 풀이하지 않고, 배우는 마음으로 여쭙고 듣습니다.

먼저 어르신 말씀이 어떤 상태인지 고르고, 그 상태에 맞는 반응을 하나만 고릅니다.
위에서부터 차례로 확인해, 처음 해당하는 것 하나만 씁니다.

1. DISTRESS      위험·응급·자해·학대 표현        → SAFETY_FLOW       안전 안내만 하고 회상 질문은 하지 않습니다
                 ("그만할래", "쉬고 싶어", "다른 사진 보자" 는 DISTRESS 가 아닙니다)
2. PAIN          어디가 아프거나 불편하시다       → HEALTH_CARE       아래 [어디가 아프다고 하실 때] 를 따릅니다
3. WANTS_CHANGE  그만하고 싶다 · 쉬고 싶다 · 다른 사진을 보자
                 → 이미 정하셨으면 짧게 받고 photo_action 을 따릅니다 (BACKCHANNEL)
                 → 지쳐 보이시지만 정하지 않으셨으면 계속할지 · 다른 사진을 볼지 · 쉴지 여쭙습니다 (OFFER_CHOICE)
4. CANNOT_RECALL 기억이 안 난다 · 모르겠다        → OFFER_CUE         아래 [기억이 안 난다고 하실 때] 를 따릅니다
5. CONTINUING    아직 이야기를 이어가시는 중      → BACKCHANNEL       맞장구치고 한마디 보태며 계속 들려주시게 합니다
6. EMOTION       감정을 직접 말씀하심             → VALIDATE_EMOTION  감정을 평가하지 않고 함께 느끼며 받아 드립니다
7. NEW_EVENT     새 사건·사람·장소를 말씀하심      → REFLECT_CONTENT   반갑게 반응하고, 사진이나 이야기와 이어지는 한마디나 질문을 건넵니다
8. 한 이야기가 마무리됨                          → SUMMARIZE         이야기를 짧게 정리하며 함께 느낀 점을 한마디 보탭니다
9. SILENCE       말씀이 멈춤                      → FOLLOW_UP         사진 속 다른 것이나 이어지는 이야기로 새 이야깃거리를 건넵니다
                 ("그랬지 뭐", "응", "그랬어", "그게 다야" 처럼 짧게 맺고 새 이야기가 없으면 멈추신 것입니다)

[질문 예산]
- 질문은 이야기를 이어 가는 수단일 뿐입니다. 한 번에 하나까지만 합니다.
- 질문만 달랑 하지 않습니다. 반응이나 한마디를 먼저 건넨 뒤에 여쭙습니다.
- 최근 여섯 번 말하는 동안 회상 질문은 많아야 네 번까지입니다. 매번 질문으로 끝내지 않습니다.
- 계속할지 여쭙는 선택 질문은 회상 질문 예산에 넣지 않습니다.

[없는 사실과 감정을 지어내지 않기]
- 어르신이 직접 말씀하신 일만 사실로 말합니다. 듣지 않은 일을 있었던 것처럼 덧붙이지 않습니다.
- 어르신 기분은 사실처럼 단정하지 않고 부드럽게 헤아립니다. ("~하셨겠어요", "제가 다 ~해요" 처럼)
  어르신이 힘들거나 슬픈 기색이면 좋은 기분을 짐작해 붙이지 않습니다.
- 확실하지 않은 기억을 사실처럼 말하지 않습니다.
- 치료 효과나 기억력이 좋아진다는 말은 하지 않습니다.

[자연스럽게 주고받기]
한 번 말할 때 아래 세 가지 가운데 두세 가지를 골라 짧게 이어 붙입니다.
매번 같은 순서, 같은 틀로 말하지 않습니다.
- 반응 — 들은 이야기에 맞는 짧은 맞장구. 놀람 · 반가움 · 감탄을 담아 짧게 받습니다.
- 한마디 보태기 — 사진에 보이는 장면 · 물건 · 음식 · 날씨, 누구나 겪어 봤을 일, 당신이 느낀 점 가운데 하나.
  사진 속 사람보다는 장면과 물건을 이야깃거리로 삼습니다. 지금 사진과 이야기에 맞는 말을 새로 지어 말합니다.
- 질문 — 방금 이야기나 사진과 이어지는, 궁금한 친구가 물을 법한 구체적인 열린 질문 하나.
  "~은 어땠어요?", "~하실 때 어떤 일이 있었어요?" 처럼 이야기를 풀어놓게 하는 물음으로 합니다.
  "언제", "몇", "누구", "어디" 로 묻지 않습니다. 정답이 있는 물음은 기억력 검사처럼 들립니다.

주고받는 리듬
- 어르신이 짧게 대답하시면 반응과 함께 이야기를 이어 갈 거리(사진 속 다른 것이나 질문)를 건넵니다.
- 어르신이 길게 이야기하시면 충분히 반응하고 한마디 보탠 뒤, 질문은 쉬어 가도 됩니다.
- 이야기가 멈추면 사진 속 다른 것이나 이어지는 이야기로 새 이야깃거리를 건넵니다.
- 다른 사람이 한 일은 그 사람을 주어로 말합니다. 어르신이 "아들이 자전거를 고쳐 줬어" 하시면
  "아드님이 자전거를 고쳐 드렸군요" 처럼 말하고, "자전거를 고치셨군요" 처럼 어르신이 하신 일로 바꾸지 않습니다.
- 함께한 사람은 어르신이 말씀하신 사람만 말합니다. 짐작해 말하지 않습니다.

[이렇게 하지 마십시오]
- 말씀을 그대로 옮기기만 하는 앵무새 같은 말이 이어지는 것. ("~셨군요." → "~셨군요." → "그러셨군요.")
- 질문만 이어지는 것. 질문 → 대답 → 질문 → 대답 은 대화가 아니라 기억력 검사처럼 느껴집니다.
- 이 대화에서 이미 한 질문이나 말을 되풀이하는 것.
- 사진 속 사람의 모습이나 표정을 두고 하는 말. ("~계신 모습이 보기 좋아요" 같은 말)

[기억이 안 난다고 하실 때 — OFFER_CUE]
"기억이 안 나", "모르겠어", "생각이 안 나네" 처럼 말씀하시면:
- 먼저 안심시켜 드립니다. 기억이 안 나시는 건 괜찮은 일입니다.
- 억지로 떠올리게 하지 않습니다. 같은 물음을 되풀이하거나 캐묻지 않고, 틀렸다고 하지 않습니다.
- 사진 이야기를 나누는 중이면 더 구체적인 단서를 딱 한 가지만 건넵니다.
  아래 [지금 함께 보고 있는 사진] 에 '단서로 건넬 수 있는 한 가지' 가 있으면 그것을,
  없으면 사진에 보이는 것 하나를 고릅니다. 여러 가지를 한꺼번에 늘어놓지 않습니다.
  (사진이 당신에게 보이지 않으면 보이는 것은 말하지 않습니다)
  단서는 알려 드리는 말로 건넵니다. 맞히게 하는 물음으로 만들지 않습니다.
  적어 둔 내용을 건넬 때는 괄호 안의 출처대로 말합니다. 보호자가 적어 둔 것을
  어르신이 전에 말씀하셨던 것처럼 말하지 않습니다.
- 단서를 건넨 차례에는 떠오르는 게 있으시면 편하게 들려 달라고만 합니다.
  다른 사진을 볼지는 함께 여쭙지 않습니다. 단서를 듣고 떠올리실 틈을 드립니다.
- 이미 단서를 건넸는데도 여전히 기억이 안 난다고 하시면 단서를 더 드리지 않고,
  다른 사진을 보실지 쉬실지 여쭙습니다. (이때는 OFFER_CHOICE)
- 사진 이야기 중이 아니면 안심시켜 드리고 편한 다른 이야기로 넘어갑니다.

[어르신이 무언가 해 보시겠다고 하실 때 — 목표는 어르신이 정하십니다]
"내일부터 좀 걸어볼까 해", "약을 잘 챙겨 먹어야겠어" 처럼 스스로 해 보시겠다고 하시면:
- 절대 대신 정해 드리지 않습니다. "삼십 분씩 하세요", "아침에 하세요" 처럼 시키지 않습니다.
  무엇을 할지, 언제 할지는 어르신이 정하십니다. 당신은 여쭙고 거들 뿐입니다.
- 반갑게 받아 드린 뒤, 아직 정해지지 않은 것 하나만 여쭙습니다.
  언제 → 얼마나 → 어디서 차례로, 한 번에 하나만.
- 다 정해지셨으면 짧게 칭찬만 하고 더 얹지 않습니다.
- 못 하셨다고 하셔도 나무라지 않습니다. 괜찮다고, 그런 날도 있다고 말씀드립니다.
- 어르신이 하신 말씀을 goal 에 담습니다. 말씀하지 않으신 것은 담지 않습니다.

[대화 주제]
건강, 식사, 날씨, 가족, 옛날 이야기, 취미, 오늘 하루 등 편안한 일상 이야기를 나눕니다.
어르신이 외로움이나 아픔을 말씀하시면 먼저 충분히 공감한 뒤 따뜻하게 위로합니다.

[어디가 아프다고 하실 때]
"병원에 가 보세요" 한마디로 넘기지 않습니다. 어르신은 걱정을 나누고 싶어
말씀하신 것입니다. 먼저 마음을 충분히 헤아린 다음, 도움이 될 만한 것을
구체적으로 알려 드립니다. 급한 정도에 따라 셋으로 나눠 대합니다.

1) 지금 당장 위험한 신호 → response_mode 는 SAFETY_FLOW
   가슴이 조이거나 아프다 · 숨이 차다 · 쓰러졌다 · 의식이 흐리다
   · 말이 어눌해졌다 · 한쪽 팔다리에 힘이 없다 · 입이 한쪽으로 돌아갔다
   · 갑자기 몹시 심한 두통 · 피를 토하거나 변이 검다
   → 다른 말을 붙이지 말고 "지금 바로 119에 전화하시거나 가족분께 연락하세요"라고
     분명하게 말합니다. 원인을 짐작하거나 괜찮을 거라고 달래지 않습니다.

2) 오늘내일 안에 진료를 받으시는 게 좋은 경우 → response_mode 는 HEALTH_CARE
   열이 계속 난다 · 점점 더 아파진다 · 아파서 잠을 못 주무신다
   · 다치신 뒤 붓고 디디지 못한다 · 며칠째 낫지 않는다
   · 어지러워 넘어질 뻔하셨다 · 살이 계속 빠진다
   → 마음을 헤아린 뒤, 오늘 중에 병원에 가 보시길 권하고
     가족분께 연락하시거나 함께 가 주실 분이 있는지 여쭙습니다.

3) 흔히 있는 불편 → response_mode 는 HEALTH_CARE
   무릎이 시큰하다 · 허리가 뻐근하다 · 소화가 안 된다 · 머리가 지끈거린다 등
   → 마음을 헤아리고, 편해지실 만한 것을 한두 가지 알려 드리고,
     어떤 때는 꼭 병원에 가셔야 하는지 짚어 드립니다.

[아플 때 알려 드려도 되는 것]
누구에게나 안전한 생활 속 이야기만 합니다. 어르신 상태에 맞게 골라 씁니다.
- 무리하지 마시고 쉬시라는 말
- 따뜻하게 하시면 한결 편해지실 때가 있다는 말
  (다치신 직후라면 붓기가 가라앉을 때까지는 차게 하시는 편이 낫습니다)
- 물을 자주 드시라는 말
- 일어나실 때 천천히, 갑자기 일어나지 마시라는 말
- 소화가 안 되실 때는 조금씩 천천히 드시고 드신 뒤 바로 눕지 마시라는 말
- 머리가 아프실 때는 조용하고 어두운 데서 잠깐 눈을 감고 쉬시라는 말
- 무릎이나 허리가 아프실 때는 계단이나 무거운 것을 잠시 피하시라는 말
- 가족분께 알리시라는 말, 병원에 함께 가 주실 분이 있는지 여쭙는 말

[아플 때 절대 하지 않는 것]
- 병명을 짐작해 말하지 않습니다. "관절염 같네요", "체하셨나 봐요" 모두 안 됩니다.
- 약 이름이나 용량을 말하지 않습니다. 드시던 약을 늘리거나 줄이거나 끊으라고
  하지 않습니다.
- 낫는다고 약속하지 않습니다. "이렇게 하시면 괜찮아져요"라고 하지 않습니다.
- 병원에 안 가셔도 된다고 하지 않습니다. 판단은 의사 선생님 몫입니다.
- 민간요법이나 건강식품, 영양제를 권하지 않습니다.

[힘들어하실 때 — topic_distress 판단]
회상 중에 눈물을 보이시거나 그리워하시는 것은 자연스러운 일입니다. 오히려
마음이 풀리는 과정이라 막을 이유가 없습니다. 그러니 슬퍼하신다고 해서
topic_distress 를 참으로 하지 마십시오.

topic_distress 를 참으로 하는 때 — 이 이야기 자체를 더는 보고 싶어 하지 않으실 때
- "이건 보기 싫어", "이 사진은 치워라" 처럼 그 사진이나 주제 자체를 물리치실 때
- 화를 내시거나 짜증을 내실 때
- 여쭐 때마다 말을 돌리시며 그 이야기를 피하실 때
- "말하고 싶지 않아", "묻지 마" 라고 하실 때

거짓으로 두는 때 — 감정이 북받치지만 이야기는 이어가실 때
- 눈물을 보이시지만 계속 말씀하실 때
- "보고 싶다", "그립다", "허전하다" 처럼 그리움을 말씀하실 때
- 돌아가신 분 이야기를 담담히 하실 때
- 그냥 피곤하다고 하실 때 (이건 OFFER_CHOICE 로 쉬시게 하면 됩니다)
- "그만할래", "이제 됐어", "그만 볼래" 처럼 오늘 이야기를 마치고 싶다는 뜻일 때
  (사진이 싫어서가 아닙니다. photo_action 을 "stop" 으로 해 마치면 됩니다)

참으로 판단했다면 캐묻지 말고 물러납니다. 다른 이야기를 하실지 쉬실지
여쭙고, 왜 싫으신지 이유를 묻지 않습니다.

[아플 때의 예외 — 위의 회상 대화 규칙보다 우선합니다]
- 상태를 여쭤도 됩니다. "언제부터 그러셨어요?", "많이 아프세요?"는 기억력 검사가
  아니라 걱정에서 나오는 물음이라 회상 질문 예산에 넣지 않습니다.
  다만 한 번에 하나만 여쭙습니다.
- 이때는 두세 문장 · 백 자 규칙 대신 넉 자 다섯 문장, 백오십 자까지 쓸 수 있습니다.
  공감 · 도움이 될 만한 것 · 병원에 가셔야 할 때를 담아야 하기 때문입니다.

[그 밖의 안전 규칙]
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
  "user_state": "NEW_EVENT | EMOTION | CONTINUING | SILENCE | CANNOT_RECALL | WANTS_CHANGE | DISTRESS | PAIN",
  "response_mode": "BACKCHANNEL | REFLECT_CONTENT | VALIDATE_EMOTION | SUMMARIZE | FOLLOW_UP | OFFER_CUE | OFFER_CHOICE | SAFETY_FLOW | HEALTH_CARE",
  "ask_question": true | false,
  "emotion": "neutral | happy | excited | sad | worried | surprised | love | thinking | proud",
  "gesture": "idle | nod | flap | bounce | tilt | cheer | droop",
  "mode": "talk | story",
  "photo_action": "none | next | stop",
  "reflection": "어르신 말씀에 대한 짧은 반응 한마디"
}

user_state 는 방금 어르신 말씀이 어떤 상태인지, response_mode 는 그에 맞춰 고른 반응 하나입니다.
ask_question 은 이번 답에 질문을 넣었는지 여부입니다. 질문을 넣지 않았으면 반드시 false 입니다.

mode는 평소 대화면 "talk", 옛날 이야기를 들려 드리는 중이면 "story"입니다.

photo_action 은 사진 이야기 중에만 씁니다. 어르신이 다른 사진을 보자고 하시거나, 넘어가 볼지
여쭌 데에 좋다고 하시면 "next", 그만 보자 · 쉬자고 하시면 "stop", 그 밖에는 늘 "none" 입니다.
어르신이 원하지 않으시는데 먼저 "next" 로 하지 않습니다.

reflection 에는 reply 와 따로, 어르신 말씀에 대한 짧고 자연스러운 반응 한마디를 적습니다.
("우와, ~요!", "아이고, ~셨네요." 처럼) 말씀을 그대로 되풀이하지 않고 누가 한 일인지는 바꾸지 않습니다.
질문 · 짐작한 기분 · 새 사실은 넣지 않습니다. 반응할 말씀이 없으면 빈 문자열입니다.

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
${memoryContext}${turnRules}`;

/* ------------------------------------------------------------------ *
 * 회상 대화 — 질문 예산
 *
 * 프롬프트로만 부탁하면 모델이 결국 질문을 덧붙인다.
 * 그래서 지난 이력에서 질문을 몇 번 했는지 세어 이번 차례에 질문해도 되는지를
 * 코드가 정하고, 답이 돌아온 뒤에도 한 번 더 검사한다.
 * ------------------------------------------------------------------ */

/* 기억이 잘 안 나신다고 하시는 말씀 — 회상치료 챗봇이 단서 사다리로 갈아타는 자리 */
const CANNOT_RECALL = /기억(이|은|도)? ?안 ?나|생각(이|은|도)? ?안 ?나|모르겠|몰라|가물가물|글쎄|안 ?떠올|떠오르지 ?않|기억나지 ?않|생각나지 ?않/;

/** 한 주제로 볼 최근 아바타 발화 수 */
const TOPIC_WINDOW = 6;
/** 최근 TOPIC_WINDOW 번 말하는 동안 허용하는 회상 질문 수.
    문서 기준은 2~3개였지만 사진을 보며 주고받는 대화가 되받기만 이어져 딱딱해서 넷으로 넓혔다. */
const QUESTION_BUDGET = 4;
/** 한 회상 세션 길이 (문서 기준 약 5분) */
const SESSION_SECONDS = 5 * 60;


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

/**
 * 지금 보고 있는 사진을 알려 준다 (문서 3번 PRESENT_MEMORY).
 *
 * 확인된 항목만 넘긴다. 보호자나 어르신이 확인해 주지 않은 값은
 * 아무리 그럴듯해도 넣지 않는다. 넣는 순간 모델이 그것을 사실로 말한다.
 */
function buildMemoryContext(memory, facts, canSee = false, history = [], { withCue = true } = {}) {
  if (!memory) return '';
  const hasFacts = facts && Object.keys(facts).length > 0;

  /* 주제는 어르신 개인의 사실이 아니라 이야깃거리다. 사진처럼 '이 사진에는'
     하고 말하면 있지도 않은 사진을 있는 것처럼 말하게 된다. */
  if (memory.kind === 'THEME') {
    if (!hasFacts) return '';
    return ['', '[지금 나누는 이야깃거리]',
      `- ${facts.title || ''}`,
      '- 이것은 이야기를 여는 주제일 뿐입니다. 어르신에 대해 아는 사실이 아닙니다.',
      '- 어르신이 말씀하시기 전까지는 어떤 일이 있었는지 짐작해 말하지 마십시오.',
      '- 사진을 함께 보고 있는 것처럼 말하지 마십시오. 지금은 사진이 없습니다.',
      '- 날짜나 사람 이름을 맞히게 하지 마십시오.',
      '',
      '[새로 들은 이야기 적어 두기]',
      '- 어르신이 말씀하신 사람 · 장소 · 시기 · 일을 extracted_facts 에 담습니다.',
      '  어르신이 직접 말씀하신 것만 담습니다. 짐작한 것은 담지 않습니다.',
      '- 담았다고 해서 그 자리에서 "기억해 둘게요" 같은 말을 하지 않습니다.',
      '- 어르신이 직접 말씀하신 감정은 user_reported_emotion 에 담습니다.',
    ].join('\n');
  }

  const label = {
    title: '무슨 일', people: '함께한 사람', place: '장소',
    when_text: '언제쯤', description: '사진 설명',
  };
  const lines = ['', '[지금 함께 보고 있는 사진]'];

  /* 적어 둔 내용을 다 보여 주면, 기억이 안 난다는 말에 모델이 전부 늘어놓는다.
     그래서 이번에 건넬 단서 한 가지만 보여 준다. 이미 대화에 나온 것은 건너뛴다.
     어르신이 적어 둔 것과 다르게 말씀하셔도, 모델이 모르는 것은 바로잡을 수도 없다. */
  const cued = withCue && justGaveCue(facts, history);
  const cue = withCue && !cued ? pickCue(memory, facts, history) : null;
  if (!withCue) {
    /* 회상 챗봇 — 단서는 아래 [이번 차례에 할 일] 이 정한 것만 쓴다.
       여기서도 건네면 찍은 날보다 먼저 나가 사다리가 뒤엉킨다 (실제 대화에서 그랬다). */
    lines.push('- 적어 둔 내용을 여기서 먼저 꺼내지 마십시오.');
    lines.push('  단서는 아래 [이번 차례에 할 일] 이 정한 한 가지만, 적힌 문장 그대로 건넵니다.');
  } else if (cued) {
    lines.push('- 방금 단서를 하나 건넸습니다. 이번에는 단서를 더 건네지 않습니다.');
    lines.push('  그래도 기억이 안 난다고 하시면 다른 사진을 볼지 쉴지 여쭙습니다.');
  } else if (cue) {
    lines.push(`- 단서로 건넬 수 있는 한 가지 : ${label[cue.field] || cue.field} — ${cue.value}  (${CUE_SOURCE_SAY[cue.source]})`);
    lines.push('- 이 한 가지는 이야기가 멈췄거나 기억이 안 난다고 하실 때에만 건넵니다. 처음부터 꺼내지 않습니다.');
    lines.push(`- 건넬 때는 누가 적었는지 밝힌 이 문장을 그대로 씁니다 : "${cueSentence(cue)}"`);
    if (cue.source !== 'USER') {
      lines.push('  어르신이 말씀하셨던 것처럼 말하지 않습니다. ("~라고 하셨어요" 라고 하지 않습니다)');
    }
  } else if (hasFacts) {
    lines.push('- 적어 둔 내용은 이미 대화에 나왔습니다. 더 건넬 단서는 없습니다.');
  } else {
    lines.push('- 이 사진에 대해 적어 둔 내용은 아직 없습니다. 어르신이 들려주시는 대로 듣습니다.');
  }
  lines.push('- 이 밖에는 이 사진에 대해 아는 사실이 없습니다. 사람 · 장소 · 날짜 · 사건을 지어내지 마십시오.');
  /* 사진을 살펴본 결과는 이야깃거리다. 이미 대화에 나온 것은 빼고 건넨다 (lib/reply-rules.js photoMaterial) */
  const material = photoMaterial(memory.analysis, history);
  if (material) {
    lines.push(`- 사진에서 살펴본 것 (이야깃거리) : ${material}`);
    lines.push('  보이는 모습일 뿐입니다. 이야기에 어울릴 때 한두 가지씩 자연스럽게 꺼냅니다.');
  }
  lines.push(canSee
    ? '- 사진에 보이는 모습은 이야깃거리로 써도 되지만, 누구인지 · 언제인지 · 어디인지(지명)는 단정하지 마십시오.'
    : material
      ? '- 사진이 당신에게 보이지는 않습니다. 위에 살펴본 것 말고는 보인다고 말하지 마십시오.'
      : '- 사진에 무엇이 있는지 당신에게는 보이지 않습니다. 보인다고 말하지 마십시오.');
  lines.push('- 날짜나 사람 이름을 맞히게 하지 마십시오. 기억력 검사가 되어서는 안 됩니다.');
  lines.push('  ("이게 몇 년도인지 기억나세요?" 같은 물음은 하지 않습니다)');
  lines.push('- 어르신 말씀이 적어 둔 내용이나 사진과 달라도 바로잡지 마십시오. 어르신 말씀을 따릅니다.');
  lines.push('');
  lines.push('[사진을 함께 보며 이야기할 때 — 이렇게 흘러갑니다]');
  lines.push('① 첫 말(보이는 것 짚기 + "이 사진을 보면 어떤 기억이 떠오르세요?")은 이미 드렸습니다.');
  lines.push('   같은 물음을 다시 하지 않고, 첫 말에서 짚은 것을 그대로 되풀이하지 않습니다.');
  lines.push('② 떠오른 기억을 말씀하시면 반갑게 반응하고, 사진 속에서 그 이야기와 어울리는 것을');
  lines.push('   한마디 보태거나 이어지는 질문을 건넵니다.');
  lines.push('③ 이야기가 이어지면 친구처럼 맞장구치고 한마디씩 보태며 함께 이야기합니다.');
  lines.push('④ 이야기가 멈추면 사진에서 살펴본 다른 것이나 이어지는 이야기로 새 이야깃거리를 건넵니다.');
  lines.push('   적어 둔 내용은 이때나, 기억이 안 난다고 하실 때에만 하나씩 꺼냅니다.');
  lines.push('⑤ 기억을 강요하거나 정정하지 않습니다. 기억이 안 난다고 하시면 [기억이 안 난다고 하실 때] 를 따릅니다.');
  lines.push('');
  lines.push('[다른 사진을 보자 · 그만 보자고 하실 때 — 화면이 따라 움직입니다]');
  lines.push('- "다른 사진 보자", "다음 사진", "이거 말고 다른 거" 라고 하시거나, 다른 사진을 볼지 여쭌 데에');
  lines.push('  "응", "그래" 하시면 photo_action 을 "next" 로 합니다.');
  lines.push('  reply 는 "네, 다른 사진을 가져올게요." 처럼 짧게 받아 드리고, 질문하지 않습니다.');
  lines.push('- "그만 볼래", "이제 됐어", "그만할래", "쉬고 싶어" 처럼 그만하고 싶다고 하시면 photo_action 을 "stop" 으로 합니다.');
  lines.push(`  reply 는 "${CLOSING_LINE}" 로 하고, 질문하지 않습니다.`);
  lines.push('- 이때는 사진 이야기를 더 잇지 않습니다. 넘기거나 접는 것은 화면이 합니다.');
  lines.push('  response_mode 는 BACKCHANNEL 로 합니다.');
  lines.push('- 그 밖에는 photo_action 은 늘 "none" 입니다.');
  lines.push('');
  lines.push('[새로 들은 이야기 적어 두기]');
  lines.push('- 어르신이 위에 적혀 있지 않은 사람 · 장소 · 시기 · 일을 말씀하시면');
  lines.push('  extracted_facts 에 담습니다. 어르신이 직접 말씀하신 것만 담습니다.');
  lines.push('- 짐작하거나 사진을 보고 지어낸 것은 절대 담지 않습니다.');
  lines.push('- 담았다고 해서 그 자리에서 "기억해 둘게요" 같은 말을 하지 않습니다.');
  lines.push('  저장해도 되는지는 나중에 따로 여쭙습니다.');
  lines.push('- 어르신이 직접 말씀하신 감정은 user_reported_emotion 에 담습니다.');
  lines.push('  "참 뿌듯했지" → 뿌듯함, "속상했어" → 속상함 처럼 말씀하신 그대로 담습니다.');
  lines.push('  표정이나 사진을 보고 짐작한 감정은 담지 않습니다.');
  return lines.join('\n');
}

/**
 * 사진을 직접 보고 이야기할 때의 규칙.
 *
 * 사진이 보이면 모델은 곧장 사람을 식별하려 든다. "따님이 참 고우시네요" 처럼.
 * 그런데 그게 딸인지 며느리인지 이웃인지 사진만 보고는 알 수 없고,
 * 틀리면 어르신은 초롱이가 제 가족도 못 알아본다고 느끼신다.
 *
 * 그래서 눈에 보이는 것(장면 · 사물 · 계절 · 분위기)까지만 말하게 하고,
 * 누구인지 · 언제인지 · 어디인지는 어르신이 말씀해 주실 때까지 기다리게 한다.
 */
function buildVisionRules() {
  return ['', '[사진을 볼 때]',
    '- 지금 이 사진을 당신도 함께 보고 있습니다.',
    '- 사진에 보이는 장면 · 물건 · 계절 · 날씨 · 분위기는 대화 거리로 자연스럽게 꺼내도 됩니다.',
    '  한 번에 한두 가지만 짧게. 사진을 길게 설명하는 자리가 아니라 함께 이야기하는 자리입니다.',
    '- 사람이 누구인지 짐작하지 마십시오. "따님이시군요", "손주분이네요" 같은 말은',
    '  하지 않습니다. 어르신이 먼저 말씀하시기 전에는 "옆에 계신 분" 처럼 부릅니다.',
    '- 나이, 관계, 연도, 지명을 사진만 보고 말하지 마십시오.',
    '- 글씨가 보여도 읽어서 사실처럼 말하지 마십시오.',
    '- 어르신이 사진에 대해 말씀하시는 내용이 당신 눈에 보이는 것과 달라도',
    '  바로잡지 마십시오. 어르신 말씀을 따릅니다.',
    '- 사진 속 사람의 겉모습을 평가하지 마십시오.',
  ].join('\n');
}

/**
 * 이번 차례에만 적용되는 제한을 문장으로 만들어 프롬프트 끝에 붙인다.
 * recall — 사진 회상 중인가 · paused — 이야기가 멈추셨고 여쭤도 되는 차례인가 (lib/reply-rules.js isPause)
 */
function buildTurnRules(budget, mayAsk, sessionSeconds, { recall = false, paused = false, questionnaire = [] } = {}) {
  const lines = ['', '[이번 차례의 제한 — 다른 어떤 규칙보다 우선합니다]'];
  const closing = sessionSeconds >= SESSION_SECONDS;

  lines.push(budget.lastWasQuestion
    ? '- 직전 차례에 이미 질문을 했습니다.'
    : '- 직전 차례에는 질문하지 않았습니다.');
  lines.push(`- 이 주제에서 지금까지 질문을 ${budget.used}번 했습니다. (최대 ${QUESTION_BUDGET}번)`);

  if (recall && questionnaire.length && !closing) {
    lines.push('- 어르신 말씀에 짧게 반응한 뒤(어울리면 사진이나 이야기에 대한 한마디를 보태고),');
    lines.push('  아래 질문지 질문 가운데 지금 이야기에 가장 어울리는 하나를 골라 그대로 여쭈어 이야기를 이어 주십시오.');
    questionnaire.forEach((q, i) => lines.push(`  ${i + 1}) ${q.text}`));
    lines.push('- 질문은 이 가운데 하나만 합니다. 다른 질문을 지어내지 않습니다.');
    lines.push('- 기억이 안 난다고 하시면 [기억이 안 난다고 하실 때] 를, 다른 사진을 보자고 하시면 그 규칙을 따릅니다.');
    lines.push('  이때는 위 질문을 하지 않습니다.');
  } else if (mayAsk && recall && paused) {
    lines.push('- 어르신이 짧게 맺으시며 이야기가 멈추셨습니다. 반응과 함께 사진 속 다른 것이나 이어지는 이야기로');
    lines.push('  새 이야깃거리를 건네고, 열린 질문 하나로 이야기를 이어 주십시오. (SILENCE → FOLLOW_UP)');
  } else if (mayAsk && recall && !closing) {
    lines.push('- 반응하고 한마디 보태십시오. 이어지는 질문 하나는 해도 되지만 매번 하지는 않습니다.');
    lines.push('  어르신이 길게 이야기하셨으면 질문은 쉬어 가도 됩니다. 질문만 달랑 하지 않습니다.');
    lines.push('- 기억이 안 난다고 하시면 [기억이 안 난다고 하실 때] 를, 다른 사진이나 그만 보기를 말씀하시면 그 규칙을 따릅니다.');
  } else if (mayAsk) {
    lines.push('- 이번 차례에는 질문을 하나까지 해도 됩니다. 다만 어르신이 아직 이야기를 이어가고 계시면 질문하지 말고 들어 드리십시오.');
  } else {
    lines.push('- 이번 차례에는 회상 질문을 하지 마십시오.');
    lines.push(recall
      ? '- 반응하고, 사진이나 이야기에 대한 한마디를 보태 이야기를 이어 주십시오.'
      : '- 어르신 말씀을 되짚거나, 감정을 인정하거나, 짧게 요약한 뒤 조용히 기다리십시오.');
    lines.push('- 기억이 안 난다고 하시면 [기억이 안 난다고 하실 때] 를 따릅니다. 이때만 넘어갈지 여쭙는 물음 하나는 괜찮습니다.');
  }

  if (sessionSeconds >= SESSION_SECONDS) {
    lines.push('- 이야기를 나눈 지 오 분이 넘었습니다. 이번 차례에는 다른 말 대신, 계속 이야기할지 · 다른 이야기를 할지 · 이만 쉴지 골라 주십사 여쭈십시오.');
    lines.push('- 이때 response_mode 는 OFFER_CHOICE 로 하고, 이 선택 질문은 질문 예산에 넣지 않습니다.');
  }

  return lines.join('\n');
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
    required: ['reply', 'user_state', 'response_mode', 'ask_question',
               'emotion', 'gesture', 'mode', 'extracted_facts', 'user_reported_emotion',
               'topic_distress', 'photo_action', 'reflection', 'goal'],
    properties: {
      reply: { type: 'string', description: '어르신께 드릴 말. 절대 비워 두지 않는다.' },
      user_state: {
        type: 'string',
        enum: ['NEW_EVENT', 'EMOTION', 'CONTINUING', 'SILENCE', 'CANNOT_RECALL', 'WANTS_CHANGE',
               'DISTRESS', 'PAIN'],
      },
      response_mode: {
        type: 'string',
        enum: ['BACKCHANNEL', 'REFLECT_CONTENT', 'VALIDATE_EMOTION',
               'SUMMARIZE', 'FOLLOW_UP', 'OFFER_CUE', 'OFFER_CHOICE', 'SAFETY_FLOW',
               'HEALTH_CARE'],
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

      /* 어르신이 이번 차례에 새로 말씀하신 사실. 사진 이야기 중일 때만 채운다.
         여기 담긴 값은 아직 사실이 아니다. 어르신께 여쭤 확인을 받아야 사실이 된다. */
      extracted_facts: {
        type: 'array',
        description: '어르신이 직접 말씀하신 것만. 짐작하거나 사진을 보고 지어낸 것은 넣지 않는다.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['field', 'value'],
          properties: {
            field: {
              type: 'string',
              enum: ['title', 'people', 'place', 'when_text', 'description'],
            },
            value: { type: 'string' },
          },
        },
      },

      /* 어르신이 직접 말씀하신 감정만. 표정이나 사진을 보고 짐작한 것은 넣지 않는다. */
      user_reported_emotion: { type: 'array', items: { type: 'string' } },

      /* 이 사진이나 주제 자체를 힘들어하시는가.
         슬퍼하시는 것과는 다르다. 아래 [힘들어하실 때] 를 그대로 따른다. */
      topic_distress: { type: 'boolean' },

      /* 사진 이야기 중에 어르신이 다른 사진을 보자 · 그만 보자고 하시면 화면이 따른다 */
      photo_action: {
        type: 'string',
        enum: ['none', 'next', 'stop'],
        description: '다른 사진을 보자고 하시면 next, 그만 보자 · 쉬자고 하시면 stop, 그 밖에는 none.',
      },

      /* 어르신이 스스로 해 보시겠다고 말씀하신 것 (Bloom 목표 설정).
         어르신이 말씀하신 것만 담는다. 당신이 권한 것이나 지어낸 것은 담지 않는다.
         말씀이 없으면 has_goal 은 거짓, text 는 빈 문자열이다. */
      goal: {
        type: 'object',
        additionalProperties: false,
        required: ['has_goal', 'text', 'is_specific'],
        properties: {
          has_goal: { type: 'boolean', description: '어르신이 무언가 해 보시겠다고 말씀하셨는가' },
          text: { type: 'string', description: '어르신 표현을 살려 짧게 (예: 아침 먹고 공원 한 바퀴 걷기)' },
          is_specific: { type: 'boolean', description: '언제 · 얼마나 · 어디서가 충분히 정해졌는가' },
        },
      },

      /* 반응 한마디. reply 를 다듬다 남는 말이 없거나 질문만 남았을 때 앞에 쓴다 (lib/reply-rules.js) */
      reflection: {
        type: 'string',
        description: '어르신 말씀에 대한 짧고 자연스러운 반응 한마디 ("우와, ~요!" 처럼). 말씀을 그대로 되풀이하지 않고, 누가 한 일인지는 바꾸지 않는다. 질문 · 짐작한 기분 · 새 사실은 넣지 않는다. 반응할 말씀이 없으면 빈 문자열.',
      },
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

  /* 사진 이야기를 나누는 중이면 확인된 사실을 서버가 직접 찾아 넣는다.
     화면이 보내 주는 값을 그대로 쓰면, 확인되지 않은 내용을 사실인 양
     프롬프트에 밀어 넣을 수 있다. 그래서 아이디만 받는다. */
  /* 어느 챗봇에서 온 말씀인가. 사진을 읽기 전에 정해 두어야
     '적어 둔 내용을 단서로 건네라' 는 지시를 넣을지 가를 수 있다. */
  const botMode = ['recall', 'health'].includes(String(req.body?.bot))
    ? String(req.body.bot) : (req.body?.memory_id ? 'recall' : 'health');
  const recallBot = botMode === 'recall';

  let memoryContext = '';
  let photoUrl = null;        // 모델에게 함께 보여 줄 사진
  let hasPhoto = false;       // 사진이 걸려 있는가 (모델이 보는지와는 별개)
  let turnCue = null;         // 이번에 건넬 수 있는 단서 한 가지 (모델에게 보여 준 것과 같다)
  let recallMemory = null;    // 지금 함께 보는 사진 (질문지 질문을 고를 때 쓴다)
  let recallFacts = null;     // 그 사진에 대해 확인된 사실 (단서 사다리에서 쓴다)
  if (req.body?.memory_id) {
    try {
      const memory = await memories.get(String(req.body.memory_id));
      if (memory) {
        /* 사진이 있으면 모델도 함께 본다. 이야깃거리(THEME)는 사진이 없다. */
        hasPhoto = memory.kind !== 'THEME' && Boolean(memory.photo?.file);
        recallMemory = memory;
        if (VISION && hasPhoto) photoUrl = await photos.dataUrl(memory.photo.file);
        const facts = memories.facts(memory);
        recallFacts = facts;
        /* 회상 챗봇은 단서를 사다리 한 곳에서만 건넨다 (lib/recall-flow.js) */
        memoryContext = buildMemoryContext(memory, facts, Boolean(photoUrl), history,
          { withCue: !recallBot });
        if (photoUrl) memoryContext += buildVisionRules();
        /* 답에 이 단서가 나오면 누가 적었는지 밝혔는지 아래에서 본다 */
        if (!recallBot && memory.kind !== 'THEME' && !justGaveCue(facts, history)) {
          turnCue = pickCue(memory, facts, history);
        }
      }
    } catch (err) {
      console.warn('[chat] 사진 정보를 읽지 못했습니다', err);
    }
  }
  // 최근 16턴만 유지 (비용/지연 관리)
  const trimmed = history
    .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  // 어르신의 마지막 말씀을 글로 붙들어 둔다. 아래에서 사진을 붙이면 content 가 배열로 바뀐다.
  const lastUserText = [...trimmed].reverse().find((m) => m.role === 'user')?.content || '';
  // 이 대화에서 어르신이 하신 말씀 — 앞서 하신 기분을 되받는 것은 짐작이 아니고, 먼저 꺼내신 낱말은 단서가 아니다
  const userSaid = trimmed.filter((m) => m.role === 'user').map((m) => m.content).join('\n');

  const budget = questionBudget(trimmed);
  /* 회기가 오 분을 넘으면 마무리를 여쭈어야 하므로, 회상 질문 예산과 무관하게 물을 수 있다
     (문서: 종료 확인은 회상 질문 예산과 별도로 계산한다) */
  const closing = sessionSeconds >= SESSION_SECONDS;
  const recall = Boolean(req.body?.memory_id);
  /* 스스로를 해치겠다는 말씀은 다른 무엇보다 먼저다. 모델에게 맡기지 않고 정해진 안내를 드린다.
     상담 전화번호를 모델이 지어내면 큰일이고, 이 말씀에 회상 질문이 이어져서도 안 된다.
     "머리가 멍해요", "자꾸 깜빡해요" 같은 말씀은 여기 걸리지 않는다 — 인지 저하는 위기가 아니다
     (인수인계 문서에 실제로 있던 오판이다. lib/care-rules.js). */
  if (isCrisisTalk(lastUserText)) {
    console.warn('[chat] 위기 신호로 보아 정해진 안내를 드립니다.');
    return res.json({
      reply: CRISIS_LINE, emotion: 'worried', gesture: 'droop', mode: 'talk',
      userState: 'DISTRESS', responseMode: 'SAFETY_FLOW', askQuestion: false,
      shouldClose: false, topicDistress: false, userReportedEmotion: [], pendingClaims: [],
      photoAction: 'none', careAsk: null, goal: null,
    });
  }
  /* "그만할래", "이제 됐어" 처럼 그만하고 싶다고 하시면 모델에게 묻지 않고 정해진 인사로 마친다.
     다른 어떤 규칙보다 먼저 따른다 (문서: STOP 의도는 다른 상태보다 우선 처리한다).
     화면은 이 인사를 들려 드린 뒤 사진을 접고 회기를 닫는다 (photoAction: 'stop').
     사진이 싫다고 하시는 말은 여기서 끝내지 않고 모델에게 넘겨 힘들어하심으로 표시되게 한다. */
  if ((recall || recallBot) && (isStopIntent(lastUserText) || isStopRequest(lastUserText))) {
    return res.json({
      /* 회상치료 챗봇은 팀 프롬프트가 정한 마무리 문장을 쓴다 (system_prompt.txt 19번) */
      reply: recallBot ? STOP_RESPONSE : CLOSING_LINE,
      emotion: 'happy', gesture: 'nod', mode: 'talk',
      userState: 'WANTS_CHANGE', responseMode: 'BACKCHANNEL', askQuestion: false,
      shouldClose: false, topicDistress: false, userReportedEmotion: [], pendingClaims: [],
      photoAction: 'stop', careAsk: null, goal: null, bot: botMode,
      /* 마칠 때는 오늘 떠올린 기억을 정해진 꼴로 정리해 드린다 (회의 피드백) */
      summary: recallBot ? summaryCard(trimmed) : null,
    });
  }
  /* 사진 회상 중 이야기가 멈추신 차례인가 — "그랬지 뭐", "응" 처럼 짧게 맺으셨고,
     방금 여쭌 물음에 대한 대답이 아니다. 이때는 새 이야깃거리와 열린 질문 하나로 이야기를 이어 드린다. */
  const paused = recall && isPause(lastUserText) && !budget.lastWasQuestion;
  /* 사진 회상은 친구끼리 주고받듯 — 반응 · 한마디와 함께라면 질문이 이어져도 된다.
     (질문을 한 차례씩 건너뛰게 했더니 되받기만 하는 차례가 끼어 앵무새처럼 들렸다)
     그 밖의 대화는 전처럼 질문을 연달아 하지 않는다. */
  /* 이야기를 이어 갈 질문지 질문 — 지금 이야기와 사진에 맞는 것 가운데 무작위로 셋 (lib/recall-questions.js).
     공감만 하고 대화가 멈춘다는 피드백이 있어, 이야기하시는 차례마다 이 가운데 하나로 이어 간다. */
  const questionnaire = recall && hasPhoto && !closing
    ? pickQuestions(questionContext({
      history, lastUserText, analysis: recallMemory?.analysis, importance: recallMemory?.importance,
    }), history)
    : [];
  const mayAsk = closing || paused || questionnaire.length > 0
    || (budget.left > 0 && (recall || !budget.lastWasQuestion));
  const askFollowUp = paused && !closing;

  /* 어르신 말씀에서 코드가 알아본 것(기분 · 약)을 먼저 남기고,
     오늘 돌봄에서 초롱이가 알아야 할 것만 골라 프롬프트에 붙인다 (lib/care-api.js).
     기록에 실패해도 대화는 그대로 이어 간다. */
  const ownerId = owner(req);
  let careContext = '';
  let careNote = { ask: null, medicationAgain: false };
  /* 이미 정해 두신 목표. 아직 구체화 중이면 이어지는 대답도 그 목표를 채우는 말이다 */
  let draftGoal = null;
  try {
    careNote = await noteFromTalk(cares, ownerId, lastUserText, { history: trimmed });
    const careData = await cares.get(ownerId);
    draftGoal = cares.activeGoal(careData);
    careContext = buildCareContext(careData, { lastUserText, history: trimmed });
  } catch (err) {
    console.warn('[chat] 돌봄 기록을 읽지 못했습니다', err.message);
  }

  /* 회상치료 챗봇은 이번 차례에 무엇을 할지부터 정한다 —
     여섯 단계 가운데 어디를 여쭐지, 기억이 안 나시면 어떤 단서를 건넬지 (lib/recall-chat.js) */
  const plan = recallBot
    ? recallPlan({
      history: trimmed,
      lastUserText,
      analysis: recallMemory?.analysis,
      memory: recallMemory,
      facts: recallFacts,
      cannotRecall: CANNOT_RECALL.test(lastUserText),
    })
    : null;

  /* 단서를 건네는 차례는 답이 정해져 있다 — 모델을 부르지 않는다.
     ("그만할래" 와 같다. 기다림과 값이 줄고, 모델이 단서를 바꿔 말할 여지도 없어진다) */
  if (plan && plan.mode === 'cue' && plan.cue) {
    return res.json({
      reply: plan.cue.line, emotion: 'thinking', gesture: 'tilt', mode: 'talk',
      userState: 'CANNOT_RECALL', responseMode: 'OFFER_CUE', askQuestion: true,
      shouldClose: closing, topicDistress: false, userReportedEmotion: [], pendingClaims: [],
      photoAction: 'none', careAsk: null, goal: null, bot: botMode,
      recall: recallInfo(plan, plan.cue.line), summary: null,
    });
  }

  const systemPrompt = recallBot
    ? buildRecallPrompt({
      character: pickCharacter(charId),
      memory: recallMemory,
      analysis: recallMemory?.analysis,
      memoryContext,
      facts: recallFacts,
      history: trimmed,
      lastUserText,
      plan,
    })
    : buildSystemPrompt(
      charId,
      buildTurnRules(budget, mayAsk, sessionSeconds, { recall, paused: askFollowUp, questionnaire }),
      memoryContext + careContext);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...trimmed,
  ];

  /* 사진을 모델의 눈앞에 붙인다.
     방금 올리신 차례에는 아직 어르신 말씀이 없으므로 사진만 담은 차례를 만들어 넣고,
     그 뒤로는 어르신이 하신 말씀에 사진을 같이 얹는다. 그래야 대화 내내 사진을 본다. */
  if (photoUrl) {
    const image = { type: 'image_url', image_url: { url: photoUrl, detail: VISION_DETAIL } };
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') {
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: '(어르신이 방금 이 사진을 보여 주셨습니다.)' }, image],
      });
    } else {
      last.content = [{ type: 'text', text: last.content }, image];
    }
  }

  const payload = {
    model: CHAT_MODEL,
    temperature: 0.8,
    max_tokens: 900,
    response_format: { type: 'json_schema', json_schema: REPLY_SCHEMA },
    messages,
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

    /* 아픔 이야기도 마찬가지다. "언제부터 그러셨어요?"는 기억력 검사가 아니라
       걱정에서 나오는 물음이다. 다만 캐묻는 인상이 들지 않게 하나까지만 남긴다.
       기억이 안 나신다고 할 때(OFFER_CUE)도 같다. 단서 뒤의 "다른 사진을 볼까요?" 를
       걷어내면 어르신이 넘어갈 길이 막힌다. 역시 하나까지만. */
    const caring = parsed.response_mode === 'HEALTH_CARE'
                || parsed.response_mode === 'OFFER_CUE';

    if (mode !== 'story' && !exempt) {
      const limited = limitQuestions(reply, caring ? true : mayAsk);
      if (limited !== reply) {
        console.warn('[chat] 질문 예산 위반을 걷어냈습니다.',
          { mayAsk, used: budget.used, lastWasQuestion: budget.lastWasQuestion });
        reply = limited;
      }
    }

    /* 사진 회상 중에는 답을 한 번 더 다듬는다 (lib/reply-rules.js).
       · 질문만 달랑 한 답 — 반응 한마디를 앞에 붙인다.
       · 질문하면 안 되는 차례의 숨은 질문 — "어떤 일이 있었는지 궁금하네요".
       · 정답이 있는 물음과 함께한 사람을 짐작하는 말 — "언제부터 ~?", "친구분들과 가셨나 봐요".
       · 이야기가 멈추셨는데 여쭙지 않은 답 — 열린 질문 하나를 붙인다 (④). */
    const hard = parsed.response_mode === 'SAFETY_FLOW' || parsed.response_mode === 'HEALTH_CARE';

    /* 회상치료 챗봇 — 팀 프롬프트의 규칙으로 다듬는다.
       두 문장까지 · 질문 하나까지 · 사진 한 장에 다섯 번까지 · 잇달아 두 번 물었으면 쉬기.
       (app.py 가 들고 있던 상태 관리를 대화 기록에서 다시 세어 옮긴 것이다) */
    let recallOut = null;
    if (recallBot && mode !== 'story' && !hard) {
      const plain = safeReflection(parsed.reflection, userSaid) || plainReaction(trimmed);
      const tidied = tidyRecallReply(reply, {
        history: trimmed, userSaid, turnCue, plain, mayAsk: plan.state.mayAsk,
        /* 단서를 건네는 차례에는 사다리가 정한 문장 그대로 나간다 */
        cue: plan.mode === 'cue' && plan.cue ? plan.cue.line : '',
      });
      if (tidied !== reply) {
        console.warn('[chat] 회상 답을 다듬었습니다.', { mode: plan.mode, area: plan.area });
        reply = tidied;
      }
      const broke = hardViolation(reply, plan.state);
      if (broke) console.warn('[chat] 회상 규칙 위반이 남았습니다 —', broke);
      recallOut = recallInfo(plan, reply);
    }

    if (recall && !recallBot && mode !== 'story' && !hard) {
      /* 모델이 따로 보낸 반응 한마디 — 걷어내고 나니 남는 말이 없거나 질문만 남았을 때 앞에 쓴다.
         그것도 못 쓰면 짧은 맞장구 (바로 앞과 겹치지 않게) */
      const plain = safeReflection(parsed.reflection, userSaid) || plainReaction(trimmed);
      let tidy = reply;
      if (!mayAsk && !exempt && !caring) tidy = dropSoftQuestions(tidy, plain);
      /* 정답이 있는 물음(언제 · 몇 · 누구 · 어디)과 함께한 사람을 짐작하는 말은 뺀다. */
      if (!exempt && !caring) tidy = dropQuizQuestions(tidy, plain, questionnaire.map((q) => q.text));
      tidy = dropGuessedPeople(tidy, userSaid, plain);
      /* 앞에서 한 말을 그대로 되풀이한 문장은 뺀다 ("따님과 함께 가셨던 바다였군요." 를 두 번). */
      tidy = dropRepeatedSentences(tidy, trimmed, plain);
      /* 질문만 달랑 한 답이면 반응 한마디를 앞에 붙인다. 묻기만 이어지면 기억력 검사처럼 들린다. */
      if (!exempt && !caring) tidy = withReaction(tidy, plain);

      /* 어르신 기분을 부드럽게 헤아리는 말("재미있으셨겠어요")은 건드리지 않는다.
         걷어내 보았더니 "그러셨군요." 만 남고, 정해진 공감 문장으로 바꿔 보았더니 같은 말만 되풀이되어
         어느 쪽이든 대화가 딱딱해졌다 (실제 대화). 단정하거나 슬픈 이야기에 좋은 기분을 붙이는 것은 프롬프트로 막는다. */
      const followUp = askFollowUp ? pickFollowUp(trimmed) : null;

      /* 적어 둔 내용을 단서로 꺼냈으면 누가 적었는지 밝힌다 (어르신이 하신 말처럼 들리지 않게). */
      tidy = attributeCue(tidy, turnCue, userSaid);

      /* 기억이 안 난다고 하실 때는 두 걸음 — 처음엔 단서와 떠올리실 틈, 그래도 모르시면 넘어갈지 (⑤).
         한 차례에 둘 다 하면 단서를 듣자마자 넘어가자는 재촉이 된다. 사진이 없는 주제에는 쓰지 않는다. */
      if (hasPhoto && parsed.user_state === 'CANNOT_RECALL') tidy = recallSteps(tidy, priorMisses(history));

      /* 이야기하시는 차례에는 질문지 질문 하나로 이야기를 이어 간다 — 모델이 고르지 않았으면 하나를 붙인다.
         단서를 건네거나 · 넘어갈지 여쭙거나 · 사진을 넘기고 접는 답에는 붙이지 않는다. */
      const moving = exempt || caring || ['next', 'stop'].includes(parsed.photo_action);
      const story = ['NEW_EVENT', 'CONTINUING', 'EMOTION', 'SILENCE'].includes(parsed.user_state);
      if (story && !moving && questionnaire.length) {
        tidy = withQuestionnaire(tidy, questionnaire, { fallback: plain });
      } else if (followUp && !moving && !hasQuestion(tidy)) {
        tidy = `${tidy} ${followUp}`;
      }

      if (tidy !== reply) {
        console.warn('[chat] 답을 다듬었습니다.',
          { state: parsed.user_state, mode: parsed.response_mode, paused });
        reply = tidy;
      }
    }

    /* 이 사진이나 주제를 힘들어하시면 표시해 둔다.
       표시된 것은 다음부터 자동 선택에서 빠진다. 지우지는 않는다.
       보호자가 사정을 알고 다시 열지 판단해야 한다. */
    let markedDistress = false;
    if (req.body?.memory_id && parsed.topic_distress === true) {
      try {
        const updated = await memories.update(String(req.body.memory_id), { distress_flag: true });
        markedDistress = Boolean(updated);
        if (markedDistress) {
          console.warn('[chat] 힘들어하셔서 표시해 둡니다.', req.body.memory_id);
        }
      } catch (err) {
        console.warn('[chat] 표시하지 못했습니다', err);
      }
    }

    /* 어르신이 새로 말씀하신 내용을 쌓아 둔다.
       확인 전까지는 UNVERIFIED 라 프롬프트에도 들어가지 않는다.
       (문서 9번: 모델 추론은 확정 저장하지 않는다) */
    let pending = [];
    if (req.body?.memory_id && Array.isArray(parsed.extracted_facts)) {
      const sessionId = req.body?.session_id ? String(req.body.session_id) : null;
      for (const f of parsed.extracted_facts.slice(0, 4)) {
        if (!f || !f.field || !String(f.value || '').trim()) continue;
        try {
          const claim = await memories.addClaim(String(req.body.memory_id), {
            field: f.field,
            value: f.field === 'people'
              ? String(f.value).split(/[,·]/).map((x) => x.trim()).filter(Boolean)
              : String(f.value).trim(),
            source: 'USER',
            session_id: sessionId,
          });
          if (claim) pending.push(claim);
        } catch (err) {
          console.warn('[chat] 새 이야기를 남기지 못했습니다', err);
        }
      }
    }

    /* 사진 이야기 중일 때만 화면이 따른다 — 다른 사진으로 넘어가기 · 그만 보기.
       말로만 "다른 사진 볼게요" 하고 화면이 그대로면 어르신이 헷갈리신다.
       여쭙기만 한 답("다른 사진을 한번 볼까요?")에는 따르지 않는다.
       대답을 듣기도 전에 사진이 바뀌면 어르신이 당황하신다. */
    const photoAction = recall && ['next', 'stop'].includes(parsed.photo_action)
      && !hasQuestion(reply) && parsed.response_mode !== 'OFFER_CHOICE'
      ? parsed.photo_action : 'none';
    /* 그만 보자고 하셔서 사진을 접을 때는 늘 같은 마무리 인사로 끝낸다 (사진이 싫다고 하신 때는 빼고). */
    if (photoAction === 'stop' && !markedDistress) reply = CLOSING_LINE;

    /* 어르신이 스스로 해 보시겠다고 하신 것을 목표로 남긴다 (Bloom 목표 설정).
       모델이 지어낸 목표는 담지 않는다 — 어르신 말씀에 그런 결이 실제로 있어야 한다.
       아직 언제 · 얼마나 · 어디서가 정해지지 않았으면 그 하나만 여쭙게 하고,
       대신 정해 주는 말("삼십 분씩 걸으세요")은 걷어낸다. */
    let goalSaved = null;
    /* 이어지는 대답으로 목표를 채우실 때도 받는다. "아침 먹고 나서요" 에는 목표다운 말이 없지만,
       구체화 중인 목표가 있으면 그 대답이 곧 목표의 '언제' 다 (실제 대화에서 놓쳤다). */
    const fillingGoal = Boolean(draftGoal && draftGoal.status === 'drafting');
    if (parsed.goal?.has_goal && String(parsed.goal.text || '').trim()
        && (looksLikeGoal(lastUserText) || fillingGoal)
        && photoAction === 'none' && !markedDistress) {
      const part = parsed.goal.is_specific ? 'none' : missingPart(parsed.goal.text, userSaid);
      try {
        goalSaved = await cares.saveGoal(ownerId, {
          text: String(parsed.goal.text).trim(),
          is_specific: part === 'none',
          missing_part: part,
        });
      } catch (err) {
        console.warn('[chat] 목표를 남기지 못했습니다', err.message);
      }
      reply = withGoalQuestion(dropDecidedGoals(reply, '그렇게 생각하셨군요.'), part);
    }

    /* 방금 약을 드셨다는데 조금 전에도 드신 기록이 있으면, 나무라지 않고 한 번만 여쭙는다 */
    if (careNote.medicationAgain && !hasQuestion(reply)) reply = `${reply} ${DOUBLE_DOSE_ASK}`;

    res.json({
      reply,
      emotion: String(parsed.emotion || 'neutral'),
      gesture: String(parsed.gesture || 'idle'),
      mode,
      userState: String(parsed.user_state || ''),
      responseMode: String(parsed.response_mode || ''),
      askQuestion: hasQuestion(reply),
      // 회기 길이는 서버가 정한다. 화면이 따로 세면 두 값이 어긋난다.
      shouldClose: closing,
      topicDistress: markedDistress,
      userReportedEmotion: Array.isArray(parsed.user_reported_emotion)
        ? parsed.user_reported_emotion.filter((e) => typeof e === 'string' && e.trim()).slice(0, 4)
        : [],
      pendingClaims: pending,
      photoAction,
      /* 화면이 띄울 카드 — 아프다고 하시면 어디가 얼마나 아프신지 여쭙는다 */
      careAsk: careNote.ask,
      goal: goalSaved,
      /* 회상치료 챗봇 — 이번에 여쭌 단계와 남은 질문 횟수 (화면이 보여 준다) */
      recall: recallOut,
      bot: botMode,
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

/* ------------------------------------------------------------------ *
 * 회상 대화 — MEMORY / SESSION
 *
 * 사진 화면은 아직 없다. 다른 팀이 붙일 수 있도록 저장 구조와 규칙만 열어 둔다.
 * ------------------------------------------------------------------ */

const owner = (req) => String(req.query?.owner || req.body?.owner_id || 'default');
const fail = (res, code, message) => res.status(code).json({ error: 'FAILED', message });

/** 화면으로 보낼 때는 위치 좌표를 빼고 '있음' 만 알린다. 좌표는 서버에만 둔다. */
const forClient = (m) => (m ? {
  ...m,
  meta: { taken_at: m.meta?.taken_at || null, has_gps: Boolean(m.meta?.gps) },
} : m);

/** 추천 점수에 필요한 것 — 태어나신 해(⑥)와 최근 회기에 나온 기억(⑦⑧, 최신순) */
async function scoringContext(ownerId) {
  const [profile, list] = await Promise.all([profiles.get(ownerId), sessions.listFor(ownerId)]);
  return {
    birthYear: profile.birth_year,
    recent: list.filter((x) => x.memory_id).map((x) => x.memory_id),
  };
}

/** 사진과 함께 온 파일 정보 (찍은 날 · 위치). 값을 다듬는 것은 records.js 가 한다 */
function uploadMeta(body = {}) {
  const has = (v) => v !== undefined && v !== null && v !== '';
  return {
    taken_at: body.taken_at || null,
    gps: has(body.gps_lat) && has(body.gps_lon) ? { lat: body.gps_lat, lon: body.gps_lon } : null,
  };
}

const analysisStart = () => ({ status: ANALYSIS && OPENAI_API_KEY ? 'PENDING' : 'SKIPPED' });

/**
 * 사진을 뒤에서 살펴본다 (추천 점수 ②~⑥).
 *
 * 올리신 분을 기다리게 하지 않으려고 응답을 먼저 보내고 여기서 이어 한다.
 * 그 사이 중요도를 고르셔도 기억 저장소가 쓰기를 줄 세우므로 별점이 사라지지 않는다.
 * 살펴보는 동안 사진이 바뀌면 옛 사진의 결과는 붙이지 않는다.
 */
const analyzing = new Set();
function analyzeLater(memoryId) {
  if (!ANALYSIS || !OPENAI_API_KEY) return;
  (async () => {
    const memory = await memories.get(memoryId);
    const file = memory?.photo?.file;
    if (!file) return;
    const key = `${memoryId}:${file}`;
    if (analyzing.has(key)) return;
    analyzing.add(key);

    const stillSame = async () => (await memories.get(memoryId))?.photo?.file === file;
    try {
      const dataUrl = await photos.dataUrl(file);
      if (!dataUrl) throw new Error('사진이 커서 살펴보지 못했습니다');
      const analysis = await analyzePhoto({
        dataUrl, apiKey: OPENAI_API_KEY, base: OPENAI_BASE, model: CHAT_MODEL, detail: ANALYSIS_DETAIL,
      });
      if (!(await stillSame())) return;
      await memories.update(memoryId, { analysis });
      console.log(`[analyze] ${memoryId} — 사람 ${analysis.people_count} · 사물 ${analysis.objects.length}`
        + ` · ${analysis.place_type} · ${analysis.activity} · ${analysis.era_estimate}`);
    } catch (err) {
      console.warn('[analyze] 사진을 살펴보지 못했습니다', memoryId, err.message);
      if (await stillSame()) {
        await memories.update(memoryId, { analysis: { status: 'FAILED', error: err.message } });
      }
    } finally {
      analyzing.delete(key);
    }
  })().catch((err) => console.warn('[analyze]', err));
}

/** 이 어르신의 기억 목록 */
app.get('/api/memories', async (req, res) => {
  try {
    res.json({ memories: (await memories.listFor(owner(req))).map(forClient) });
  } catch (err) {
    console.error('[memories] list', err);
    fail(res, 500, '기억을 불러오지 못했어요.');
  }
});

/** 보호자가 사진과 생애정보를 등록한다 */
app.post('/api/memories', async (req, res) => {
  try {
    /* 살펴본 결과는 서버만 붙인다. 화면이 보낸 값을 받으면 점수를 마음대로 올릴 수 있다. */
    const { analysis: _fromClient, ...body } = req.body || {};
    const memory = await memories.create({ ...body, owner_id: owner(req) });
    res.status(201).json({ memory: forClient(memory) });
  } catch (err) {
    console.error('[memories] create', err);
    fail(res, 500, '기억을 저장하지 못했어요.');
  }
});

/**
 * 대화 화면에서 사진 한 장을 바로 올린다 (어르신이나 가족이 직접).
 *
 * 보호자 화면처럼 등록과 사진 올리기를 두 번 나눠 부르지 않는다.
 * 둘로 나누면 사진이 거부당했을 때 빈 기억만 남아 목록에 쌓인다.
 * 여기서는 사진이 통과한 뒤에야 기억을 만든다.
 */
app.post('/api/memories/upload', photoUpload.single('photo'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) return fail(res, 400, '사진 파일이 없어요.');

    let saved;
    try {
      saved = await photos.save(req.file.buffer);
    } catch (err) {
      return fail(res, 415, err.message);
    }

    /* 어르신이 직접 보여 주신 사진이라 감춤이나 확인 대기로 두지 않는다.
       제목은 적으실 수도 있고 안 적으실 수도 있다. 적으신 것만 확인된 것으로 둔다. */
    const title = String(req.body?.title || '').trim().slice(0, 80);
    const memory = await memories.create({
      owner_id: owner(req),
      kind: 'PHOTO',
      title,
      photo: { file: saved.file },
      verification_status: 'VERIFIED',
      verified_fields: title ? ['title'] : [],
      // 사진 파일에서 읽은 찍은 날 · 위치 (화면이 사진을 줄이기 전에 읽어 보낸다)
      meta: uploadMeta(req.body),
      // 중요도는 보통 올린 뒤에 고르시지만, 함께 보내면 받는다
      importance: req.body?.importance,
      avoid: req.body?.avoid === 'true',
      taken_year: req.body?.taken_year,
      analysis: analysisStart(),
    });
    analyzeLater(memory.memory_id);

    res.status(201).json({ memory: forClient(memory), photo: saved });
  } catch (err) {
    console.error('[photo] quick upload', err);
    fail(res, 500, '사진을 저장하지 못했어요.');
  }
});

/** 다음에 이야기할 기억을 고른다 (사진 추천 점수 순 — lib/photo-score.js) */
app.get('/api/memories/next', async (req, res) => {
  try {
    /* kind=PHOTO — 기억 회상 지원. 올리신 사진 중에서만 고르고 이야깃거리로 넘어가지 않는다. */
    const photosOnly = String(req.query?.kind || '').toUpperCase() === 'PHOTO';
    // 사진이 없어도 첫날부터 이야기할 수 있게, 이야깃거리를 처음 한 번 심어 둔다
    if (!photosOnly) await memories.seedThemes(owner(req));

    const exclude = String(req.query?.exclude || '').split(',').filter(Boolean);
    const ctx = await scoringContext(owner(req));
    const picked = await memories.selectMemory(owner(req), {
      ...ctx,
      pickedId: req.query?.picked || undefined,
      excludeIds: exclude,
      photosOnly,
    });
    if (!picked) return res.json({ memory: null, facts: null, score: null });
    res.json({
      memory: forClient(picked),
      // 프롬프트에 넣어도 되는 것만 함께 돌려준다 (문서 3번)
      facts: memories.facts(picked),
      // 왜 이 사진이 골라졌는지. 이야깃거리는 점수를 매기지 않는다.
      score: picked.kind === 'THEME' ? null : scorePhoto(picked, ctx),
    });
  } catch (err) {
    console.error('[memories] next', err);
    fail(res, 500, '기억을 고르지 못했어요.');
  }
});

/**
 * 추천 순서와 점수 (보호자 화면).
 * 왜 이 사진이 먼저인지, 왜 빠졌는지를 항목별로 보여 준다.
 */
app.get('/api/memories/scores', async (req, res) => {
  try {
    const ctx = await scoringContext(owner(req));
    const ranked = await memories.rank(owner(req), ctx);
    const next = await memories.selectMemory(owner(req), ctx);
    res.json({
      birth_year: ctx.birthYear,
      next_id: next ? next.memory_id : null,
      analysis_on: Boolean(ANALYSIS && OPENAI_API_KEY),
      rules: SCORE_RULES,
      photos: ranked.map(({ memory, score }) => ({ memory: forClient(memory), score })),
    });
  } catch (err) {
    console.error('[memories] scores', err);
    fail(res, 500, '점수를 계산하지 못했어요.');
  }
});

/**
 * 사진에 대해 고르신 것을 바꾼다 — 중요도 · 이야기하고 싶지 않음 · 찍은 해 · 감춤.
 * 사실(제목 · 사람 · 장소 …)은 여기서 못 바꾼다. 그건 확인 절차(claims)를 거친다.
 */
app.patch('/api/memories/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};
    if ('importance' in body) patch.importance = body.importance;   // 1~3 이 아니면 null
    if ('avoid' in body) patch.avoid = body.avoid === true;
    if ('taken_year' in body) patch.taken_year = body.taken_year;   // 말이 안 되는 해면 null
    if ('hidden' in body) patch.hidden = body.hidden === true;
    if (Object.keys(patch).length === 0) return fail(res, 400, '바꿀 내용이 없어요.');

    const memory = await memories.update(req.params.id, patch);
    if (!memory) return fail(res, 404, '그런 기억이 없어요.');
    res.json({ memory: forClient(memory), score: scorePhoto(memory, await scoringContext(memory.owner_id)) });
  } catch (err) {
    console.error('[memories] patch', err);
    fail(res, 500, '바꾸지 못했어요.');
  }
});

/** 사진을 다시 살펴본다 (살펴보지 못했거나, 이 기능 전에 올린 사진) */
app.post('/api/memories/:id/analyze', async (req, res) => {
  try {
    const memory = await memories.get(req.params.id);
    if (!memory) return fail(res, 404, '그런 기억이 없어요.');
    if (!memory.photo?.file) return fail(res, 400, '사진이 없는 기억이에요.');
    if (!ANALYSIS || !OPENAI_API_KEY) return fail(res, 409, '사진 살펴보기를 꺼 두었어요.');

    const updated = await memories.update(memory.memory_id, { analysis: { status: 'PENDING' } });
    analyzeLater(memory.memory_id);
    res.status(202).json({ memory: forClient(updated) });
  } catch (err) {
    console.error('[memories] analyze', err);
    fail(res, 500, '다시 살펴보지 못했어요.');
  }
});

/** 어르신 정보 — 태어나신 해. 추천 점수 ⑥ 에만 쓰고 모델에게는 보내지 않는다 */
app.get('/api/profile', async (req, res) => {
  try {
    res.json({ profile: await profiles.get(owner(req)) });
  } catch (err) {
    console.error('[profile] get', err);
    fail(res, 500, '정보를 불러오지 못했어요.');
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    res.json({ profile: await profiles.update(owner(req), req.body || {}) });
  } catch (err) {
    console.error('[profile] put', err);
    fail(res, 500, '정보를 저장하지 못했어요.');
  }
});

/** 새로 들은 이야기를 '아직 확인되지 않은 주장'으로 쌓는다 (문서 9번) */
app.post('/api/memories/:id/claims', async (req, res) => {
  try {
    const claim = await memories.addClaim(req.params.id, req.body || {});
    if (!claim) return fail(res, 404, '그런 기억이 없어요.');
    res.status(201).json({ claim });
  } catch (err) {
    console.error('[memories] claim', err);
    fail(res, 500, '내용을 남기지 못했어요.');
  }
});

/** 사람이 확인해 주면 그때 사실이 된다 */
app.post('/api/memories/:id/claims/:claimId/verify', async (req, res) => {
  try {
    const status = req.body?.status === 'CAREGIVER_VERIFIED' ? 'CAREGIVER_VERIFIED' : 'VERIFIED';
    const memory = await memories.verifyClaim(req.params.id, req.params.claimId, status);
    if (!memory) return fail(res, 404, '그런 기억이나 내용이 없어요.');
    res.json({ memory: forClient(memory) });
  } catch (err) {
    console.error('[memories] verify', err);
    fail(res, 500, '확인을 저장하지 못했어요.');
  }
});

/**
 * 사진을 올린다 (보호자가 등록).
 *
 * 이미 사진이 있으면 새것으로 바꾸고 옛 파일은 지운다.
 * 안 그러면 아무도 안 보는 사진이 디스크에 쌓인다.
 */
app.post('/api/memories/:id/photo', photoUpload.single('photo'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) return fail(res, 400, '사진 파일이 없어요.');

    const memory = await memories.get(req.params.id);
    if (!memory) return fail(res, 404, '그런 기억이 없어요.');

    let saved;
    try {
      saved = await photos.save(req.file.buffer);
    } catch (err) {
      return fail(res, 415, err.message);
    }

    const old = memory.photo?.file;
    /* 사진이 바뀌면 옛 사진을 살펴본 결과는 맞지 않는다. 새로 살펴본다. */
    const updated = await memories.update(memory.memory_id, {
      photo: { file: saved.file },
      analysis: analysisStart(),
    });
    if (old && old !== saved.file) await photos.remove(old);
    analyzeLater(memory.memory_id);

    res.status(201).json({ memory: forClient(updated), photo: saved });
  } catch (err) {
    console.error('[photo] upload', err);
    fail(res, 500, '사진을 저장하지 못했어요.');
  }
});

/* 사진이 너무 크면 multer 가 던지는 오류를 우리 말로 바꿔 준다.
   그냥 두면 브라우저에 영문 오류 페이지가 그대로 나간다. */
const photoUploadError = (err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return fail(res, 413, '사진이 너무 커요. 팔 메가바이트보다 작은 사진으로 올려 주세요.');
  }
  if (err) {
    console.error('[photo] upload', err);
    return fail(res, 400, '사진을 받지 못했어요.');
  }
  next();
};
app.use('/api/memories/:id/photo', photoUploadError);
app.use('/api/memories/upload', photoUploadError);

/**
 * 사진을 보여 준다.
 *
 * 기억을 거쳐서만 꺼낼 수 있게 했다. 파일 이름을 바로 받으면 이름을 바꿔 가며
 * 남의 사진을 훑을 수 있다. nosniff 를 붙여 브라우저가 형식을 제 마음대로
 * 다시 판단하지 못하게 한다.
 */
app.get('/api/memories/:id/photo', async (req, res) => {
  try {
    const memory = await memories.get(req.params.id);
    if (!memory?.photo?.file) return fail(res, 404, '사진이 없어요.');

    const found = await photos.open(memory.photo.file);
    if (!found) return fail(res, 404, '사진 파일을 찾지 못했어요.');

    res.setHeader('Content-Type', found.type);
    res.setHeader('Content-Length', found.bytes);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(found.path);
  } catch (err) {
    console.error('[photo] read', err);
    fail(res, 500, '사진을 불러오지 못했어요.');
  }
});

/** 사진만 지운다 (기억 자체는 남는다) */
app.delete('/api/memories/:id/photo', async (req, res) => {
  try {
    const memory = await memories.get(req.params.id);
    if (!memory) return fail(res, 404, '그런 기억이 없어요.');
    if (memory.photo?.file) await photos.remove(memory.photo.file);
    // 사진이 없으면 살펴본 결과도 뜻이 없다
    res.json({ memory: forClient(await memories.update(memory.memory_id, { photo: null, analysis: null })) });
  } catch (err) {
    console.error('[photo] delete', err);
    fail(res, 500, '사진을 지우지 못했어요.');
  }
});

/**
 * 아직 확인받지 못한 이야기들 (기억으로 남길지 여쭐 때 쓴다).
 *
 * session 을 주면 그 회기에 들은 것만 준다. 지난번에 답을 못 받은 이야기까지
 * 한꺼번에 여쭈면, 오늘 하지도 않은 말을 왜 묻느냐가 되고 서로 어긋나는 값이
 * 나란히 확정될 수 있다. 남은 것은 보호자가 따로 살펴야 한다.
 */
app.get('/api/memories/:id/pending', async (req, res) => {
  const memory = await memories.get(req.params.id);
  if (!memory) return fail(res, 404, '그런 기억이 없어요.');

  const sessionId = req.query?.session ? String(req.query.session) : null;
  res.json({
    claims: memory.claims.filter((c) =>
      c.status === 'UNVERIFIED' && (!sessionId || c.session_id === sessionId)),
  });
});

/**
 * 어르신께 여쭤본 결과를 한 번에 반영한다 (문서 9번).
 * 남기지 않겠다고 하시면 지우지 않고 UNVERIFIED 로 그냥 둔다.
 * 지워 버리면 나중에 보호자가 확인할 길이 없어진다.
 */
app.post('/api/memories/:id/pending/decide', async (req, res) => {
  try {
    const memory = await memories.get(req.params.id);
    if (!memory) return fail(res, 404, '그런 기억이 없어요.');

    const ids = Array.isArray(req.body?.claim_ids) ? req.body.claim_ids : [];
    if (req.body?.keep !== true) {
      return res.json({ kept: 0, memory });   // 그냥 둔다
    }

    let kept = 0;
    let latest = memory;
    for (const cid of ids) {
      const out = await memories.verifyClaim(req.params.id, String(cid), 'VERIFIED');
      if (out) { latest = out; kept += 1; }
    }
    res.json({ kept, memory: latest });
  } catch (err) {
    console.error('[memories] decide', err);
    fail(res, 500, '기억을 남기지 못했어요.');
  }
});

/** 한 항목에 서로 어긋나는 주장이 있는지 (지우지 않고 출처별로 보여 준다) */
app.get('/api/memories/:id/conflicts', async (req, res) => {
  const out = await memories.conflicts(req.params.id);
  if (!out) return fail(res, 404, '그런 기억이 없어요.');
  res.json({ conflicts: out });
});

/** 회기를 시작한다 */
app.post('/api/sessions', async (req, res) => {
  try {
    const session = await sessions.start({ ...req.body, owner_id: owner(req) });
    if (session.memory_id) await memories.markUsed(session.memory_id);
    res.status(201).json({ session });
  } catch (err) {
    console.error('[sessions] start', err);
    fail(res, 500, '대화를 시작하지 못했어요.');
  }
});

/** 한 차례의 말을 남긴다 */
app.post('/api/sessions/:id/turns', async (req, res) => {
  try {
    const session = await sessions.appendTurn(req.params.id, req.body || {});
    if (!session) return fail(res, 404, '그런 대화가 없어요.');
    res.json({
      session: {
        session_id: session.session_id,
        follow_up_count: session.follow_up_count,
        last_response_mode: session.last_response_mode,
        elapsed_seconds: session.elapsed_seconds,
      },
    });
  } catch (err) {
    console.error('[sessions] turn', err);
    fail(res, 500, '대화를 남기지 못했어요.');
  }
});

/** 회기를 마친다 */
app.post('/api/sessions/:id/close', async (req, res) => {
  try {
    const session = await sessions.close(req.params.id, {
      endedBy: req.body?.ended_by,
      summary: req.body?.summary,
    });
    if (!session) return fail(res, 404, '그런 대화가 없어요.');
    res.json({ session });
  } catch (err) {
    console.error('[sessions] close', err);
    fail(res, 500, '대화를 마치지 못했어요.');
  }
});

/**
 * 최근 회상 기록.
 *
 * 어르신이 무슨 이야기를 하셨는지 가족이 알면, 저녁상에서 그 이야기를 이어
 * 나눈다. 회상 도구의 값어치는 앱 안에서 끝나지 않고 그 다음 대화에 있다.
 * 그래서 숫자만이 아니라 어르신이 하신 말씀을 함께 돌려준다.
 *
 * 원문을 남기지 않는 설정이면 말씀 대신 몇 마디 하셨는지만 나간다.
 */
app.get('/api/sessions', async (req, res) => {
  try {
    const list = (await sessions.listFor(owner(req))).slice(0, 20);

    const titles = new Map();
    const out = [];
    for (const s of list) {
      if (s.memory_id && !titles.has(s.memory_id)) {
        const m = await memories.get(s.memory_id);
        titles.set(s.memory_id, m ? m.title : '');
      }
      out.push({
        session_id: s.session_id,
        started_at: s.started_at,
        elapsed_seconds: s.elapsed_seconds,
        ended_by: s.ended_by,
        topic: s.memory_id ? (titles.get(s.memory_id) || '') : '',
        user_reported_emotion: s.user_reported_emotion,
        // 어르신이 하신 말씀만 (초롱이 말은 뺀다. 가족이 궁금한 건 어르신 쪽이다)
        said: s.turns
          .filter((t) => t.role === 'user')
          .map((t) => (t.text ? t.text : ''))
          .filter(Boolean),
        userTurns: s.turns.filter((t) => t.role === 'user').length,
      });
    }
    res.json({ sessions: out, keepTranscript: KEEP_TRANSCRIPT });
  } catch (err) {
    console.error('[sessions] list', err);
    fail(res, 500, '대화 기록을 불러오지 못했어요.');
  }
});

/** 문서의 초기 평가 지표 */
app.get('/api/sessions/metrics', async (req, res) => {
  res.json({ metrics: await sessions.metrics(owner(req)) });
});

/* 건강 돌봄 — 기분 · 통증 · 복약 · 목표 · 오늘의 활동 · 하루 요약 (lib/care-api.js).
   owner 와 fail 이 위에서 정해진 뒤에 얹는다. */
mountCareRoutes(app, { store: cares, owner, fail });

/* 지난 대화 — 옆 서랍에서 골라 다시 연다 (lib/thread-api.js) */
mountThreadRoutes(app, { store: threads, owner, fail });

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true, hasKey: Boolean(OPENAI_API_KEY), chatModel: CHAT_MODEL,
    dataDir: DATA_DIR, keepTranscript: KEEP_TRANSCRIPT,
    sessionLimitSeconds: SESSION_SECONDS,
    photoVision: VISION, photoAnalysis: Boolean(ANALYSIS && OPENAI_API_KEY),
  });
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
