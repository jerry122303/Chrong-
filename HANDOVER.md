# 초롱이 프로젝트 인계 문서

> 새 대화창에서 이어서 작업하기 위한 전체 정리본입니다.
> 작성 시점: 2026-09-02 / 작업 폴더: `D:\클코`

---

## 0. 이 문서를 읽는 AI에게 (요약)

시니어(어르신)를 대상으로 한 **실시간 음성 대화 아바타 챗봇 "초롱이"** 웹앱입니다.
Node.js + Express 서버가 OpenAI API를 중계하고, 브라우저에서 **SVG로 그린 캐릭터**가
GPT-4o의 감정 판단에 따라 표정·손짓을 바꾸며 목소리에 맞춰 입을 움직입니다.

**지금 가장 먼저 알아야 할 사실 3가지**

1. **로컬 작업본과 배포본이 다릅니다.** 배포된 Render 사이트에는 캐릭터 선택·준호/서연·손짓이
   **빠져 있습니다.** 초기 커밋(`9bad927`) 이후 작업이 전부 미커밋 상태입니다.
2. `.env`에 실제 OpenAI API 키가 들어 있습니다. **절대 커밋하지 마세요** (`.gitignore`에 등록됨).
3. `D:\클코` 폴더 안에 **`church-booking`이라는 무관한 다른 프로젝트**가 같이 있습니다.
   초롱이와 관계없으니 건드리지 말고, `.gitignore`로 이미 제외되어 있습니다.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
| --- | --- |
| 목적 | 어르신의 말동무가 되는 음성 대화 아바타 챗봇 |
| 대상 | 시니어 (경도인지장애·초기 인지저하 포함) |
| 작업 폴더 | `D:\클코` |
| 실행 | `cd D:\클코` → `npm start` → http://localhost:3000 |
| GitHub | https://github.com/jerry122303/Chrong- |
| 배포 | https://chrong.onrender.com (Render 무료 플랜) |

### 상위 과제와의 관계

이 웹앱은 더 큰 산학협력 과제(**시니어 전용 맞춤형 건강관리 챗봇**)의 **프런트엔드 아바타 파트**입니다.
다른 팀이 만드는 세 모듈과 합쳐질 예정입니다.

- **대화·안전 엔진** (Python/FastAPI, 포트 8001) — 의도 분류, 동기면담(MI) 전략, 4단계 안전 필터
- **외부기억 기반 사진 회상지원** — 사진에 날짜·인물·장소·감정을 붙여 저장 후 회상 대화
- **RAG 기반 인지운동 추천** — 검증된 인지 재활 운동 9종(COG-EX-001~009) 지식DB

역할 분담: 앞의 셋이 **"무엇을 말할지"**를 만들고, 이 웹앱이 **"어떻게 전달할지"**를 담당합니다.
현재 이 웹앱은 자체 Node 서버로 독립 동작하며, 아직 FastAPI 엔진과 연동되어 있지 않습니다.

---

## 2. 파일 구조

```
D:\클코\
├─ server.js              Express 서버 (380줄) — OpenAI 프록시, API 키 은닉
├─ package.json           의존성: express, dotenv, multer
├─ .env                   실제 API 키 (커밋 금지)
├─ .env.example           설정 예시
├─ .gitignore             node_modules, .env, church-booking, .claude 제외
├─ README.md              사용 설명서
├─ HANDOVER.md            (이 문서)
├─ church-booking/        ⚠ 무관한 다른 프로젝트 — 건드리지 말 것
└─ public/
   ├─ index.html          화면 구조 (149줄)
   ├─ styles.css          시니어 친화 디자인 (649줄)
   ├─ avatar.js           아바타 엔진 (971줄) ★ 핵심
   ├─ app.js              대화 흐름·음성·립싱크 (777줄) ★ 핵심
   └─ expressions.html    표정 확인용 페이지 (개발용)
```

---

## 3. 서버 (`server.js`)

### 엔드포인트

| 메서드 | 경로 | 역할 |
| --- | --- | --- |
| POST | `/api/chat` | GPT-4o 대화 → `{reply, emotion, gesture, mode}` JSON |
| POST | `/api/tts` | 감정별 음성 합성 (mp3), 응답 헤더 `X-Voice-Pitch` |
| POST | `/api/stt` | 녹음 파일 → Whisper 받아쓰기 |
| GET | `/api/health` | `{ok, hasKey, chatModel}` |

### 환경변수 (`.env`)

```
OPENAI_API_KEY=sk-proj-...   # 실제 키 들어있음
PORT=3000
CHAT_MODEL=gpt-4o
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=nova
VOICE_PITCH=1.16
STT_MODEL=whisper-1
ACCESS_CODE=                 # 설정하면 Basic 인증 활성화 (현재 비어있음 = 인증 없음)
```

### 핵심 설계

**페르소나** — `buildSystemPrompt(characterId)`가 캐릭터별 시스템 프롬프트를 만듭니다.
공통 규칙(존댓말, 2~3문장, 쉬운 우리말, 이모지 금지)에 캐릭터별 성격을 얹습니다.

**옛날 이야기 모드** — "옛날 이야기 해 줘" 요청 시 '짧게 말하기' 규칙을 예외 처리하여
8~12문장 완결된 이야기를 **중간 질문 없이** 들려주고, 끝난 뒤에만 감상을 묻습니다.
이때 `mode: "story"`를 반환합니다. `max_tokens: 900`.

**안전 규칙** — 의학적 진단/약 조언 금지 → 가족·의료진 안내.
응급 표현(숨이 차다, 가슴이 아프다) 감지 시 즉시 119 안내. 금전·개인정보 요구 금지.

**목소리 — 음높이 트릭 (중요)**
OpenAI TTS에는 음높이 파라미터가 없습니다. 그래서:
1. 서버가 `speed = wanted / VOICE_PITCH`로 **느리게** 생성 요청
2. 응답 헤더 `X-Voice-Pitch: 1.16` 전달
3. 브라우저가 `source.playbackRate.value = 1.16`으로 **빠르게** 재생
→ 말 속도는 그대로, 음높이만 올라가 아이 목소리가 됩니다.

**감정별 말 속도** — `EMOTION_SPEED` 테이블. 신남 1.14배, 슬픔 0.82배 등.

---

## 4. 아바타 엔진 (`public/avatar.js`) ★ 가장 복잡한 부분

### 기본 개념

캐릭터는 **이미지·동영상이 아니라 부위별로 분리된 SVG**입니다.
`requestAnimationFrame` 루프가 매 프레임 각 부위의 `transform`/`opacity`를 다시 계산합니다.

### 클래스 API

```js
import { Avatar, CHARACTERS, CHARACTER_LIST, DEFAULT_CHARACTER } from './avatar.js';

const av = new Avatar(mountElement, 'junho');
av.setCharacter('seoyeon');   // 캐릭터 교체 (표정·동작 유지)
av.setEmotion('happy');       // 감정 전환 (부드럽게 보간)
av.playGesture('nod');        // 일회성 몸짓
av.setMouth(0.8);             // 립싱크 입력 0~1
av.setSpeaking(true);         // 말하는 중 (손짓 리듬 발생)
av.lookAt(x, y);              // 마우스 추적
av.destroy();                 // rAF 중지
```

### 캐릭터 3종

| id | 이름 | 설명 | 목소리 |
| --- | --- | --- | --- |
| `chorong` | 초롱이 | 다정한 앵무새 친구 | nova + 음높임 |
| `junho` | 준호 | 씩씩한 손주 같은 청년 | (남성 목소리) |
| `seoyeon` | 서연 | 상냥한 손녀 같은 청년 | (여성 목소리) |

각 캐릭터는 `{id, name, desc, svg, geom}` 구조. `geom`에 눈·눈썹·팔꿈치 등
**모든 회전축 좌표**가 들어 있어, 엔진 코드는 캐릭터에 무관하게 동작합니다.

### 중요: SVG id 네임스페이스

한 화면에 아바타가 여러 개(선택 화면에 3개) 뜨면 `url(#gradient)` 참조가 엉킵니다.
그래서 `_mountCharacter()`에서 `ch-` 접두사를 `ch1-`, `ch2-`처럼 인스턴스마다 다르게 치환합니다.
**SVG 안의 모든 id는 반드시 `ch-`로 시작해야 합니다.**

### 필수 SVG 요소 id (캐릭터를 새로 만들 때 반드시 포함)

```
ch-svg, ch-root, ch-char, ch-head, ch-crest, ch-fx, ch-feet
ch-wing-l / ch-wing-r          (새=날개, 사람=위팔. 어깨에서 회전)
ch-forearm-l / ch-forearm-r    (사람만. 팔꿈치에서 회전)
ch-hand-l / ch-hand-r          (사람만)
ch-brow-l / ch-brow-r
ch-eye-l / ch-eye-r, ch-pupil-l / ch-pupil-r, ch-lid-l / ch-lid-r
ch-smile-l / ch-smile-r        (웃는 눈 ^^)
ch-heart-l / ch-heart-r        (하트 눈)
ch-cheek-l / ch-cheek-r, ch-tears
ch-mouth-open (입 안), ch-beak-lower (아래턱/아랫입술)
```

### 감정 9종 (`EMOTIONS` 객체)

`neutral, happy, excited, sad, worried, surprised, love, thinking, proud`

각 감정은 수치 묶음입니다:
```js
{ brow, browAngle, lid, pupilY, cheek, smile, crest, tilt, headY, eyeScale,
  tear, heart, breath, fx,
  armLS, armLE, armRS, armRE }   // ← 손짓 (좌/우 어깨·팔꿈치 각도)
```
현재 값(`cur`)이 목표 값(`tgt`)으로 매 프레임 선형보간되어 부드럽게 전환됩니다.

### 손짓 시스템 (사람 캐릭터 전용)

- `armLS`/`armRS` = 어깨를 몸에서 **바깥으로 벌리는 각도**
- `armLE`/`armRE` = 팔꿈치를 **굽혀 손을 올리는 각도**
- 아래팔은 "팔꿈치에서 수직으로 내린 자세"를 기준으로 그려두고 회전만으로 자세를 만듭니다.
- 좌우 부호가 다릅니다: 왼팔은 `rotate(+aLS)` / `rotate(-aLE)`, 오른팔은 `rotate(-aRS)` / `rotate(+aRE)`
- 말하는 중에는 좌우 위상차를 준 사인파로 손이 흔들립니다 (`c.mouth`에 비례).
- 초롱이(새)는 `geom.hasArms`가 없어 **기존 좌우대칭 날개짓 경로**를 씁니다.

현재 각도 값:
```
neutral   (6, 86, 6, 86)      두 손을 앞에 모음
happy     (8, 88, 18, 112)    오른손을 살짝 듦
excited   (26, 158, 26, 158)  두 손 번쩍
sad       (0, 70, 0, 70)      팔을 늘어뜨림
worried   (7, 90, 13, 120)    한 손을 가슴께로
surprised (20, 142, 20, 142)  두 손 들어 올림
love      (12, 116, 12, 116)  두 손을 가슴 앞에 모음
thinking  (5, 82, 22, 152)    오른손을 얼굴 쪽으로
proud     (8, 88, 15, 122)    손을 가슴에 얹음
```

### 눈 표현 주의사항 (과거 버그)

웃는 눈(^^)과 보통 눈을 **투명도로 교차시키면 뒤쪽 눈동자가 비쳐 보입니다.**
그래서 `smileMode = c.smile > 0.5`로 **한쪽만 확정 표시**하고, 웃는 눈일 때는 깜빡이지 않습니다.
눈꺼풀은 아래 가장자리가 곧 윗속눈썹 선이라 감으면 함께 내려옵니다.

### 사람 캐릭터 디자인 (참고 이미지 기반)

사용자가 제공한 따뜻한 일러스트 참고 이미지에 맞춰 그렸습니다.
- 검은 선 대신 **따뜻한 갈색 윤곽선**
- 준호: 베이지 니트(세로 골 무늬) + 파란 줄무늬 셔츠 깃
- 서연: 연보라 블라우스 + 흰 라운드 카라
- 기본 자세: **앞에 두 손을 모음**
- 얼굴: 아몬드 눈 + 홍채 그라디언트 + 쌍꺼풀, 광대·이마 하이라이트, 인중, 입술 하이라이트

**중요한 함정**: 소매가 상의와 같은 색이면 몸통에 묻혀 팔이 안 보입니다.
반드시 윤곽선(넓은 stroke)을 먼저 그리고 그 위에 채움 stroke를 얹으세요.

---

## 5. 앱 로직 (`public/app.js`)

### 대화 흐름

```
sendMessage(text)
  → POST /api/chat
  → { reply, emotion, gesture, mode }
  → avatar.setEmotion(emotion) + avatar.playGesture(gesture)
  → speak(reply, emotion, mode)
```

### 립싱크 (`speak`)

미리 만든 애니메이션이 아니라 **실제 재생 중인 음성 파형**을 읽습니다.
```js
analyser.getByteTimeDomainData(data);      // Web Audio API AnalyserNode
const rms = Math.sqrt(sum / data.length);  // 소리 크기
const raw = clamp((rms - 0.008) * 9.5);
avatar.setMouth(Math.pow(raw, 0.65));      // 작은 소리도 잘 보이게 곡선 적용
```

### 음성 인식 (STT)

**브라우저 내장 인식(Web Speech API)은 쓰지 않습니다.** 크롬 전용이고 자주 실패해서 제거했습니다.
현재는 **MediaRecorder로 녹음 → 서버 Whisper**로 통일했습니다.

- 말이 끝나고 **1.5초 조용하면 자동 종료** (버튼 두 번 안 눌러도 됨)
- 마이크 볼륨을 버튼 안 막대(`#mic-level`)로 표시
- 9초간 무음이면 종료, 최대 60초 제한, 2KB 미만이면 잘못 누른 것으로 처리
- `window.isSecureContext` 확인 → **localhost 또는 https에서만 마이크 동작**

### 캐릭터 선택

- 시작 화면이 곧 선택 화면입니다 (카드 3장, 각 카드에 살아있는 미니 아바타)
- 선택은 `localStorage['chorong-character']`에 저장
- 상단 "친구 바꾸기" 버튼으로 언제든 다시 선택 가능
- 대화 이력은 `localStorage['chorong-history']`에 최근 40턴

---

## 6. UI 설계 (`public/styles.css`)

시니어 대상이지만 **차분하고 단정한** 방향입니다 (초기엔 어린이용처럼 보여서 전면 개편함).

- 얇은 테두리(1px), 절제된 색(짙은 초록 `#2C6E49` 하나만 강조색), 넉넉한 여백
- 선으로 그린 아이콘 (이모지 사용 안 함)
- 글자 크기 3단계: `body.fs-1/2/3` → `--base: 19px/23px/28px`
- 무대(`.stage`)는 **flex**라서 글자가 커지면 아바타가 대신 작아집니다 (겹침 방지)
- 자막(`.subtitle`)은 `flex: 0 0 auto`로 **절대 줄어들지 않습니다**
- 모바일: 1000px 이하에서 세로 배치, 하단 입력창 sticky

**과거 버그**: `.btn-replay`에 `display: inline-flex`를 주면 `hidden` 속성이 무시됩니다.
`.btn-replay[hidden] { display: none; }`을 반드시 유지하세요.

---

## 7. 현재 상태 — 완료 / 미완료

### ✅ 완료

- 초롱이(앵무새) 캐릭터 + 표정 9종 + 몸짓 6종
- 준호·서연 사람 캐릭터 (참고 이미지 스타일) + 감정별 손짓
- 캐릭터 선택 화면 + 변경 기능 + localStorage 저장
- GPT-4o 대화 (감정·몸짓·모드를 JSON으로 함께 반환)
- 감정별 목소리 톤/속도 + 음높이 트릭
- 실시간 파형 기반 립싱크
- Whisper 음성 입력 (자동 종료, 마이크 레벨 표시)
- 옛날 이야기 모드 (중간에 안 끊김)
- 시니어 친화 UI (글자 크기, 자막, 천천히 말하기, 소리 끄기, 다시 듣기)
- Render 배포 (단, 구버전)

### ⚠ 미완료 / 주의

1. **배포본이 구버전입니다.** 로컬 변경사항을 커밋·푸시해야 Render에 반영됩니다.
   ```bash
   cd D:\클코
   git add -A
   git commit -m "캐릭터 선택 · 준호/서연 · 감정별 손짓 추가"
   git push
   ```
   푸시하면 Render가 자동 재배포합니다.

2. **인증이 없습니다.** 링크를 아는 사람은 누구나 쓰고, 그만큼 OpenAI 요금이 나갑니다.
   막으려면 Render 환경변수에 `ACCESS_CODE=원하는암호` 추가 (코드는 이미 준비됨).

3. **Render 무료 플랜**은 15분 미사용 시 잠들고, 다시 깨어나는 데 30~50초 걸립니다.

4. **FastAPI 대화 엔진과 미연동** — 현재는 자체 Node 서버로만 동작합니다.

5. 사람 캐릭터 미세 조정 여지: 팔이 참고 그림보다 짧고 손이 작음, 준호 앞머리 끝이 살짝 솟음.

---

## 8. 개발 팁 (이 프로젝트에서 통한 방법)

### 표정 한눈에 확인
```
http://localhost:3000/expressions.html
```

### 헤드리스 크롬으로 화면 검증
LibreOffice/pdftoppm은 없지만 **크롬은 있습니다.**
```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --force-device-scale-factor=1 --hide-scrollbars --window-size=1400,1000 \
  --virtual-time-budget=6000 --screenshot="out.png" "http://localhost:3000/..."
```
⚠ 크롬이 창 최소 너비(~500px)를 강제하므로 375px 모바일은 **iframe으로 감싸서** 확인해야 합니다.

### JS 값 확인 (가상시간이 안 통하는 경우)
`--remote-debugging-port=9222`로 띄우고 `document.title`에 결과를 넣은 뒤
`curl http://localhost:9222/json`으로 읽습니다. 실제 마이크 테스트는
`--use-file-for-fake-audio-capture=파일.wav`로 가짜 마이크를 물릴 수 있습니다.

### Bash heredoc 주의
Git Bash에서 `<<'PY'` 안의 **백슬래시가 사라집니다.** 정규식이나 `\n`이 들어가는
파이썬 스크립트는 **파일로 저장한 뒤 실행**하세요.

### 한글 경로 주의
Python이 한글 경로 파일을 못 여는 경우가 있습니다. ASCII 경로로 복사 후 처리하세요.
출력 깨짐은 `PYTHONIOENCODING=utf-8`로 해결됩니다.

---

## 9. 관련 산출물 (다른 폴더)

`C:\Users\정재열\OneDrive\바탕 화면\헬스캐어\중간보고서\` 에 산학협력 중간보고서가 있습니다.

- `산학협력_중간결과보고서_초롱이_양식적용.docx` — 원본 HWP 양식 구조를 재현한 완성본
- `산학협력_중간결과보고서_초롱이_빈양식.docx` — 내용만 비우고 박스 크기는 유지한 버전
- 원본 참고자료: `초롱이 팀 협업.pdf`, `중간보고서 조사.pdf`, `chorongie_cognitive_rag_handover_report-v2.docx`

기술 설계 문서(아티팩트): https://claude.ai/code/artifact/7f84a97e-9aa0-4007-98a2-c3e5cd1e765b

---

## 10. 새 대화에서 시작할 때 추천 첫 메시지

```
D:\클코 에 있는 초롱이 프로젝트를 이어서 작업할 거야.
HANDOVER.md 를 먼저 읽고 현재 상태를 파악해줘.
```
