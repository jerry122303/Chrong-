/* =====================================================================
 *  초롱이 - 앱 로직
 *  대화(GPT-4o) → 감정 분석 결과로 표정/몸짓 → 목소리 재생과 동시에 립싱크
 * ===================================================================== */

import { Avatar, CHARACTERS, CHARACTER_LIST, DEFAULT_CHARACTER } from './avatar.js';
import { readExifFromFile, formatTakenDate } from './exif.js';
import { openingLine } from './recall-opening.js';

const $ = (id) => document.getElementById(id);

/* 이 화면이 어느 챗봇인가. 회상치료(recall)와 건강관리(health)는 규칙도 화면도 다르다.
   같은 코드로 두 화면을 다루되, 없는 단추는 건드리지 않는다 (화면마다 단추가 다르다). */
const BOT = document.body.dataset.bot === 'recall' ? 'recall' : 'health';

const ui = {
  splash: $('splash'), start: $('btn-start'),
  avatar: $('avatar'), status: $('status'), statusText: $('status-text'),
  subtitle: $('subtitle'), replay: $('btn-replay'),
  log: $('log'), input: $('input'), send: $('btn-send'),
  mic: $('btn-mic'), micLabel: $('mic-label'), micLevel: $('mic-level'),
  font: $('btn-font'), fontLevel: $('font-level'),
  slow: $('btn-slow'), slowState: $('slow-state'),
  sound: $('btn-sound'), soundState: $('sound-state'),
  clear: $('btn-clear'), suggest: $('suggest'), toast: $('toast'),
  swap: $('btn-swap'), picker: $('picker'), cancel: $('btn-cancel'),
  startLabel: $('start-label'), brandName: document.querySelector('.brand-name'),
  // 머리말의 [친구 바꾸기] · 말동무 카드의 이름표 · 머리글 제목
  swapTop: $('btn-swap-top'), companionName: $('companion-name'), heroTitle: $('hero-title'),
  stage: document.querySelector('.stage'),
  recall: $('btn-recall'), recallLabel: $('recall-label'),
  memory: $('memory'), memoryPhoto: $('memory-photo'), memoryTitle: $('memory-title'),
  memoryMeta: $('memory-meta'),
  nextPhoto: $('btn-next-photo'), closePhoto: $('btn-close-photo'),
  keep: $('keep'), keepList: $('keep-list'),
  keepYes: $('btn-keep-yes'), keepNo: $('btn-keep-no'),
  brandMark: document.querySelector('.brand-mark'),
  attach: $('btn-attach'), filePhoto: $('file-photo'),
  composer: document.querySelector('.composer'),
  rate: $('rate'), rateMeta: $('rate-meta'),
  // 대화 종료 — 상시 단추와 마친 뒤 여쭙는 표정 셋 (전달 패키지 v2.4)
  end: $('btn-end'), feel: $('feel'), feelSkip: $('feel-skip'),
  care: $('care'), careQ: $('care-q'), careNote: $('care-note'),
  careActs: $('care-acts'), careLater: $('care-later'),
  mood: $('btn-mood'), activity: $('btn-activity'), report: $('btn-report'),
  // 프론트엔드 구성 가이드의 화면들 — 위기 배너 · 오늘 목표 · 약 알림 시간 ·
  // 최근 기분 변화 · 인지케어 모드
  crisis: $('crisis'), crisisClose: $('crisis-close'),
  goal: $('btn-goal'),
  medsBtn: $('btn-meds'), meds: $('meds'), medName: $('med-name'),
  medTimes: $('med-times'), medAdd: $('med-add'), medList: $('med-list'),
  medsClose: $('meds-close'),
  trendBtn: $('btn-trend'), trend14: $('trend14'), trendBars: $('trend14-bars'),
  trendSay: $('trend14-say'), trendClose: $('trend14-close'),
  cogMode: $('btn-cogmode'), cogModeState: $('cogmode-state'),
  // 옆 서랍 — 지난 대화
  drawer: $('drawer'), scrim: $('scrim'), drawerList: $('drawer-list'),
  drawerBtn: $('btn-drawer'), drawerClose: $('btn-drawer-close'), newChat: $('btn-new'),
  // 인지치료 — 오늘의 활동
  cognitive: $('btn-cognitive'), cog: $('cog'), cogSay: $('cog-say'),
  cogActs: $('cog-acts'), cogClose: $('cog-close'),
  // 다른 챗봇으로 건너가기 · 설정 (글자 크기 · 천천히 대화 · 캐릭터 바꾸기)
  other: $('btn-other'),
  settings: $('settings'), settingsBtn: $('btn-settings'), settingsClose: $('btn-settings-close'),
};

/** 이 화면에 없는 단추는 조용히 건너뛴다 */
const on = (el, event, fn) => { if (el) el.addEventListener(event, fn); };

/* 부르는 말 없이 인사한다. '어르신'이라 불리는 것이 불편하신 분도 계신다 */
const greetingFor = (id) => {
  const name = (CHARACTERS[id] || CHARACTERS[DEFAULT_CHARACTER]).name;
  return BOT === 'recall'
    ? `안녕하세요. 저는 ${name}입니다. 사진을 보며 옛이야기를 함께 나눠요.`
    : `안녕하세요. 저는 ${name}입니다. 오늘 하루는 어떠셨어요?`;
};

const state = {
  history: [],
  busy: false,
  listening: false,
  soundOn: true,
  slow: false,
  fontLevel: 2,
  character: DEFAULT_CHARACTER,
  lastReply: { text: '', emotion: 'happy' },
  // 회상 대화 한 회기는 오 분 정도로 본다. 서버가 이 값을 보고 마무리를 여쭙는다.
  sessionStart: 0,
  // 지금 함께 보고 있는 사진. 아이디만 서버에 보내고, 사실은 서버가 찾는다.
  memory: null,
  seenMemories: [],   // 이번 회기에 이미 본 사진 (같은 사진이 되풀이되지 않게)
  sessionId: null,    // 서버에 남기는 회기 기록
  pending: [],        // 아직 확인받지 못한, 오늘 새로 들은 이야기
  // 어느 기억에 대해 여쭙는 중인지. 사진을 내린 뒤에도 답을 기다려야 해서
  // state.memory 와 따로 붙들어 둔다.
  pendingMemoryId: null,
  waited: false,        // 이번 차례에 '천천히 생각하셔도 괜찮아요'를 이미 안내했는지
  // 오늘 돌봄 — 기분을 여쭈었는지, 약 드실 때가 되었는지, 고르실 낱말 (서버가 알려 준다)
  care: null,
  // 이 화면이 어느 챗봇인지. 서버가 규칙을 가를 때 쓴다
  bot: BOT,
  // 옆 서랍에 남는 지금 대화 (들어오면 늘 새 대화다)
  threadId: null,
  // 마치며 기분을 여쭙는 중인 회기 (아래 endingSessionId 와 짝이다)
  // 마치며 기분을 여쭙는 중인 회기. 사진이 접히면 sessionId 가 비므로 따로 붙든다
  endingSessionId: null,
};

/** 지금 고른 말동무의 이름 */
const charName = () => (CHARACTERS[state.character] || CHARACTERS[DEFAULT_CHARACTER]).name;

/**
 * 이름 뒤에 붙는 주격 조사를 받침에 맞춰 고른다.
 * 준호(받침 없음) → "준호가", 서연(받침 있음) → "서연이", 초롱이 → "초롱이가"
 */
/** 이름 뒤의 '와 · 과' (초롱이와 · 서연과) */
function withAnd(name) {
  const code = name.charCodeAt(name.length - 1) - 0xAC00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return name + (hasFinal ? '과' : '와');
}

function subject(name) {
  const code = name.charCodeAt(name.length - 1) - 0xAC00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return name + (hasFinal ? '이' : '가');
}

let avatar = null;
let audioCtx = null;
let currentSource = null;
let lipRAF = 0;
let idleTimer = 0;
let waitTimer = 0;
let closeTimer = 0;

/* ==================================================================
 *  기본 도구
 * ================================================================== */

function toast(message, ms = 3200) {
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { ui.toast.hidden = true; }, ms);
}

function setStatus(kind, text) {
  ui.status.className = 'status status-' + kind;
  ui.statusText.textContent = text;
}

function addMessage(who, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  if (who !== 'sys') {
    const name = document.createElement('b');
    name.className = 'msg-name';
    name.textContent = who === 'bot' ? charName() : '나';
    div.appendChild(name);
  }
  div.appendChild(document.createTextNode(text));
  ui.log.appendChild(div);
  ui.log.scrollTop = ui.log.scrollHeight;
  return div;
}

/**
 * 올리신 사진을 대화 기록에 남긴다.
 * 사진이 서버에 올라가기 전에도 화면에는 바로 보여 드린다. 기다리는 동안
 * 아무 일도 일어나지 않으면 잘못 누르신 줄 아신다.
 */
function addPhotoMessage(src) {
  const div = document.createElement('div');
  div.className = 'msg me has-photo';

  const name = document.createElement('b');
  name.className = 'msg-name';
  name.textContent = '나';
  div.appendChild(name);

  const img = document.createElement('img');
  img.className = 'msg-photo';
  img.alt = '올린 사진';
  img.src = src;
  div.appendChild(img);

  const note = document.createElement('span');
  note.className = 'msg-photo-note';
  note.textContent = '사진을 보여 드렸어요';
  div.appendChild(note);

  ui.log.appendChild(div);
  ui.log.scrollTop = ui.log.scrollHeight;
  return div;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'msg bot typing';
  div.innerHTML = '<i></i><i></i><i></i>';
  ui.log.appendChild(div);
  ui.log.scrollTop = ui.log.scrollHeight;
  return div;
}

function saveHistory() {
  try {
    localStorage.setItem('chorong-history', JSON.stringify(state.history.slice(-40)));
  } catch { /* 저장 공간이 없어도 대화는 계속됩니다 */ }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('chorong-history');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved) || !saved.length) return;
    state.history = saved;
    for (const m of saved) addMessage(m.role === 'user' ? 'me' : 'bot', m.content);
    addMessage('sys', '지난번 이야기를 이어서 나눌 수 있어요');
  } catch { /* 기록을 못 읽으면 새로 시작합니다 */ }
}

/* ==================================================================
 *  대화
 * ================================================================== */

/**
 * 초롱이의 대답 한 번을 처리한다 — 기록에 남기고, 표정을 바꾸고, 소리 내어 말한다.
 * 어르신 말씀에 대한 대답이든 사진을 보고 여는 말이든 하는 일이 같아 한 곳에 모았다.
 */
async function applyReply(data) {
  /* 마치는 차례라면(그만하자고 하셨다) 지금 기분을 여쭐 수 있게 회기 번호를 붙들어 둔다.
     말이 끝나면 사진이 접히면서 state.sessionId 가 비워진다 (closeSession). */
  if (data.photoAction === 'stop' && state.sessionId) state.endingSessionId = state.sessionId;
  state.history.push({ role: 'assistant', content: data.reply });
  saveHistory();
  noteThread('assistant', data.reply);   // 옆 서랍에 남긴다
  noteTurn({
    role: 'assistant',
    text: data.reply,
    response_mode: data.responseMode,
    asked_question: data.askQuestion,
    user_reported_emotion: data.userReportedEmotion,
  });

  /* 오 분이 지나 초롱이가 마무리를 여쭈었으면, 그 말이 끝난 뒤 사진을 접는다.
     여쭙기만 하고 그대로 두면 어르신이 답하실 때까지 사진이 계속 떠 있고
     오늘 들은 이야기도 확인받지 못한 채 남는다. */
  if (state.memory && data.shouldClose) {
    closingAfterSpeech = true;
  }
  /* 어르신이 다른 사진을 보자 · 그만 보자고 하셨으면, 이 말이 끝난 뒤 화면이 따른다.
     말로만 "다른 사진 볼게요" 하고 화면이 그대로면 어르신이 헷갈리신다. */
  if (state.memory && data.photoAction === 'next') nextAfterSpeech = true;
  if (state.memory && data.photoAction === 'stop') stopAfterSpeech = true;
  if (!state.memory && data.photoAction === 'stop' && BOT === 'recall') feelAfterSpeech = true;
  state.lastReply = { text: data.reply, emotion: data.emotion, mode: data.mode };

  addMessage('bot', data.reply);
  ui.subtitle.textContent = data.reply;

  /* 위기 안내를 드린 차례라면 번호를 화면에도 띄운다 (Safety Response).
     귀로 들은 번호는 흘러간다. 눌러서 바로 거실 수 있어야 한다. */
  if (data.responseMode === 'SAFETY_FLOW') showCrisis();

  avatar.setEmotion(data.emotion);
  avatar.playGesture(data.gesture);

  await speak(data.reply, data.emotion, data.mode);


  /* 말이 끝난 뒤에 돌봄 카드를 띄운다. 말하는 중에 띄우면 듣다 말고 누르신다 */
  afterCare(data);
}

async function sendMessage(text) {
  const message = String(text || '').trim();
  if (!message || state.busy) return;

  stopSpeaking();
  clearTimeout(waitTimer);
  state.waited = false;
  if (!state.sessionStart) state.sessionStart = Date.now();
  /* 회기 기록이 아직 없으면 여기서 연다. 사진 없이 이야기만 나누셨어도
     마치며 고르신 표정이 남아야 한다 (종료 시나리오 명세서 4 — 세션 DB) */
  if (!state.sessionId) await startSession(state.memory ? state.memory.memory_id : null);
  ui.input.value = '';
  addMessage('me', message);
  state.history.push({ role: 'user', content: message });
  noteTurn({ role: 'user', text: message });
  noteThread('user', message);   // 옆 서랍에 남긴다

  state.busy = true;
  ui.send.disabled = true;
  setStatus('thinking', `${subject(charName())} 생각하고 있어요`);
  avatar.setEmotion('thinking');
  const typing = showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.history,
        character: state.character,
        sessionSeconds: Math.round((Date.now() - state.sessionStart) / 1000),
        // 아이디만 보낸다. 어떤 내용을 말해도 되는지는 서버가 정한다.
        memory_id: state.memory ? state.memory.memory_id : null,
        session_id: state.sessionId,
        // 회상치료와 건강관리는 프롬프트도 규칙도 다르다 (server.js 가 가른다)
        bot: state.bot,
      }),
    });

    typing.remove();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '대답을 받지 못했어요.');
    }

    await applyReply(await res.json());
  } catch (err) {
    typing.remove();
    const msg = err.message || '연결에 문제가 생겼어요.';
    addMessage('sys', '⚠ ' + msg);
    ui.subtitle.textContent = msg;
    toast(msg);
    avatar.setEmotion('worried');
    setStatus('idle', '다시 말씀해 주세요');
  } finally {
    state.busy = false;
    ui.send.disabled = false;
  }
}

/* ==================================================================
 *  목소리 재생 + 립싱크
 *  실제 오디오 파형의 크기를 읽어 부리를 여닫는다.
 * ================================================================== */

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function stopSpeaking() {
  cancelAnimationFrame(lipRAF);
  if (currentSource) {
    try { currentSource.onended = null; currentSource.stop(); } catch { /* 이미 끝남 */ }
    currentSource = null;
  }
  window.speechSynthesis?.cancel();
  avatar?.setSpeaking(false);
  avatar?.setMouth(0);
}

async function speak(text, emotion, mode) {
  stopSpeaking();
  ui.replay.hidden = false;

  if (!state.soundOn) {
    setStatus('idle', '말씀해 주세요');
    scheduleIdle();
    afterSpeaking();
    return;
  }

  setStatus('speaking', `${subject(charName())} 말하고 있어요`);

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, emotion, mode: mode || 'talk',
        character: state.character,
        speed: state.slow ? 0.8 : 0.95,
      }),
    });
    if (!res.ok) throw new Error('tts');

    // 서버가 알려 준 배속으로 재생하면 음이 높아져 아이 목소리처럼 들린다
    const pitch = Number(res.headers.get('X-Voice-Pitch')) || 1;
    const ctx = ensureAudio();
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());

    await new Promise((resolve) => {
      const source = ctx.createBufferSource();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.18;

      source.buffer = buffer;
      source.playbackRate.value = pitch;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      const data = new Uint8Array(analyser.fftSize);
      avatar.setSpeaking(true);

      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // 사람 목소리 구간을 0~1로 넓게 펴 주고, 작은 소리도 눈에 띄게 곡선을 태운다
        const raw = Math.min(1, Math.max(0, (rms - 0.008) * 9.5));
        avatar.setMouth(Math.pow(raw, 0.65));
        lipRAF = requestAnimationFrame(loop);
      };
      loop();

      source.onended = () => {
        cancelAnimationFrame(lipRAF);
        avatar.setSpeaking(false);
        avatar.setMouth(0);
        currentSource = null;
        resolve();
      };

      currentSource = source;
      source.start();
    });
  } catch {
    await speakFallback(text);
  }

  setStatus('idle', '말씀해 주세요');
  scheduleIdle();
  afterSpeaking();
}

/**
 * 초롱이가 말을 마친 뒤에 할 일.
 * 소리를 끄면 speak() 가 일찍 반환하므로, 두 갈래 모두에서 이걸 부른다.
 * 한쪽에만 두면 소리를 끈 어르신에게는 사진이 접히지 않는다.
 */
function afterSpeaking() {
  const stop = stopAfterSpeech;
  const close = closingAfterSpeech;
  const next = nextAfterSpeech;
  const feel = feelAfterSpeech;
  feelAfterSpeech = false;
  stopAfterSpeech = false;
  closingAfterSpeech = false;
  nextAfterSpeech = false;

  if (stop) { stopMemoryTalk(); return; }
  if (feel) { showFeel(); return; }
  if (close) { wrapUpMemoryTalk(); return; }   // 이미 여쭈었으므로 인사를 덧붙이지 않는다
  if (next) nextRecallPhoto().then((moved) => { if (!moved) sayNoMorePhotos(); });
}

/* 서버 목소리를 못 쓸 때는 브라우저 기본 음성으로 말한다 */
function speakFallback(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = state.slow ? 0.82 : 0.95;
    u.pitch = 1.7;

    const voices = speechSynthesis.getVoices();
    const ko = voices.find((v) => v.lang?.startsWith('ko'));
    if (ko) u.voice = ko;

    avatar.setSpeaking(true);
    let t = 0;
    const fake = () => {
      t += 0.06;
      // 실제 파형이 없으므로 말하는 리듬을 흉내 낸다
      const v = 0.55 + 0.45 * Math.sin(t * 11) * Math.sin(t * 2.7);
      avatar.setMouth(Math.max(0, Math.min(1, v)));
      lipRAF = requestAnimationFrame(fake);
    };
    fake();

    const done = () => {
      cancelAnimationFrame(lipRAF);
      avatar.setSpeaking(false);
      avatar.setMouth(0);
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!state.busy && !state.listening) avatar.setEmotion('happy');
  }, 6000);
  scheduleWaitHint();
}

/**
 * 기다림 안내.
 * 회상 대화에서 어르신은 기억을 떠올리는 데 시간이 걸린다. 침묵을 오류로 보고
 * 재촉하면 회상을 방해하므로, 열다섯 초가 지나면 소리 없이 화면으로만
 * 한 번 안내한다. (말로 하면 오히려 말을 끊게 된다)
 */
function scheduleWaitHint() {
  clearTimeout(waitTimer);
  if (state.waited) return;
  waitTimer = setTimeout(() => {
    if (state.busy || state.listening || state.waited) return;
    state.waited = true;
    setStatus('idle', '천천히 생각하셔도 괜찮아요');
  }, 15000);
}

/* ==================================================================
 *  음성 인식 (STT)
 *  마이크로 녹음한 뒤 서버(Whisper)가 받아쓴다.
 *  - 브라우저 내장 인식(Web Speech)은 크롬에서만 되고 자주 실패해서 쓰지 않는다.
 *  - 말이 끝나고 잠시 조용하면 저절로 멈춰서 보낸다 (버튼을 두 번 안 눌러도 된다).
 * ================================================================== */

const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

let recorder = null;
let micStream = null;
let micAnalyser = null;
let chunks = [];
let levelRAF = 0;
let hardStopTimer = 0;
let stopReason = '';

const SILENCE_LEVEL = 0.012;   // 이보다 조용하면 말이 멈춘 것으로 본다
const SILENCE_HOLD = 1500;     // 말이 끝난 뒤 이만큼 조용하면 자동 종료 (ms)
const NO_SPEECH_WAIT = 9000;   // 이 시간 동안 아무 말 없으면 종료 (ms)
const MAX_RECORD = 60000;      // 아무리 길어도 여기서 끊는다 (ms)

function setListening(on) {
  state.listening = on;
  ui.mic.classList.toggle('listening', on);
  ui.micLabel.textContent = on ? '다 말씀하셨으면 누르세요' : '눌러서 말하기';
  if (on) {
    setStatus('listening', '듣고 있어요');
    avatar.setEmotion('neutral');
    avatar.playGesture('tilt');
  } else {
    setStatus('idle', '말씀해 주세요');
    setMicLevel(0);
  }
}

/** 마이크에 들어오는 소리 크기를 버튼 안 막대로 보여 준다 */
function setMicLevel(v) {
  const bars = ui.micLevel ? ui.micLevel.children : [];
  for (let i = 0; i < bars.length; i++) {
    const threshold = (i + 1) / (bars.length + 1);
    const scale = 0.25 + Math.min(1, Math.max(0, (v - threshold * 0.35) * 2.2)) * 0.75;
    bars[i].style.transform = 'scaleY(' + scale.toFixed(2) + ')';
  }
}

function pickMimeType() {
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of list) {
    if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function extFor(mime) {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

function cleanupMic() {
  cancelAnimationFrame(levelRAF);
  clearTimeout(hardStopTimer);
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  micAnalyser = null;
}

async function startRecording() {
  if (!window.isSecureContext) {
    toast('이 주소에서는 마이크를 쓸 수 없어요. localhost 나 https 주소로 접속해 주세요.', 6000);
    return;
  }
  if (!canRecord) {
    toast('이 브라우저는 녹음을 지원하지 않아요. 크롬이나 엣지를 써 주세요.', 5000);
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      toast('마이크 사용이 막혀 있어요. 주소창 왼쪽 자물쇠를 눌러 마이크를 허용해 주세요.', 6000);
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      toast('마이크를 찾지 못했어요. 마이크가 연결되어 있는지 확인해 주세요.', 5000);
    } else {
      toast('마이크를 켤 수 없어요. 글로 써 주셔도 좋아요.', 5000);
    }
    return;
  }

  const mimeType = pickMimeType();
  chunks = [];
  stopReason = '';
  try {
    recorder = mimeType ? new MediaRecorder(micStream, { mimeType }) : new MediaRecorder(micStream);
  } catch {
    cleanupMic();
    toast('녹음을 시작할 수 없어요. 글로 써 주셔도 좋아요.', 5000);
    return;
  }

  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = handleRecordingDone;

  recorder.start();
  setListening(true);
  ui.input.value = '';

  // 소리 크기를 지켜보다가, 말이 끝나면 스스로 멈춘다
  const ctx = ensureAudio();
  const source = ctx.createMediaStreamSource(micStream);
  micAnalyser = ctx.createAnalyser();
  micAnalyser.fftSize = 512;
  source.connect(micAnalyser);   // 스피커에는 연결하지 않는다 (하울링 방지)

  const buf = new Uint8Array(micAnalyser.fftSize);
  const startedAt = performance.now();
  let heardSpeech = false;
  let quietSince = 0;

  const watch = () => {
    if (!micAnalyser || !recorder || recorder.state !== 'recording') return;
    micAnalyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const level = Math.sqrt(sum / buf.length);
    setMicLevel(Math.min(1, level * 6));

    const now = performance.now();
    if (level > SILENCE_LEVEL) {
      heardSpeech = true;
      quietSince = 0;
    } else if (heardSpeech) {
      if (!quietSince) quietSince = now;
      else if (now - quietSince > SILENCE_HOLD) { stopRecording(); return; }
    } else if (now - startedAt > NO_SPEECH_WAIT) {
      stopRecording('no-speech');
      return;
    }
    levelRAF = requestAnimationFrame(watch);
  };
  watch();

  hardStopTimer = setTimeout(() => stopRecording(), MAX_RECORD);
}

function stopRecording(reason) {
  stopReason = reason || '';
  cancelAnimationFrame(levelRAF);
  clearTimeout(hardStopTimer);
  if (recorder && recorder.state === 'recording') {
    try {
      recorder.stop();
    } catch {
      cleanupMic();
      setListening(false);
    }
  } else {
    cleanupMic();
    setListening(false);
  }
}

async function handleRecordingDone() {
  const mime = (recorder && recorder.mimeType) || 'audio/webm';
  cleanupMic();
  setListening(false);

  if (stopReason === 'no-speech' || !chunks.length) {
    toast('소리가 들리지 않았어요. 마이크를 확인하고 다시 말씀해 주세요.', 4500);
    return;
  }

  const blob = new Blob(chunks, { type: mime });
  chunks = [];

  // 너무 짧으면 대부분 잘못 누른 것이다
  if (blob.size < 2000) {
    toast('너무 짧아요. 버튼을 누르고 조금 더 말씀해 주세요.', 4000);
    return;
  }

  setStatus('thinking', '말씀을 옮기고 있어요');
  avatar.setEmotion('thinking');

  const form = new FormData();
  form.append('audio', blob, 'voice.' + extFor(mime));

  try {
    const res = await fetch('/api/stt', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.message || '받아쓰기에 실패했어요.');

    const text = String(data.text || '').trim();
    if (text) {
      sendMessage(text);
    } else {
      toast('말씀을 알아듣지 못했어요. 조금 더 또렷하게 다시 말씀해 주세요.', 4500);
      setStatus('idle', '말씀해 주세요');
      avatar.setEmotion('happy');
    }
  } catch (err) {
    toast(err.message || '말씀을 옮기지 못했어요.', 4500);
    setStatus('idle', '말씀해 주세요');
    avatar.setEmotion('worried');
  }
}

function toggleMic() {
  stopSpeaking();

  if (state.listening) { stopRecording(); return; }
  if (state.busy) { toast(`${subject(charName())} 대답을 준비하고 있어요. 잠시만요!`); return; }

  startRecording();
}

/* ==================================================================
 *  설정 버튼
 * ================================================================== */

const FONT_NAMES = ['보통', '크게', '아주 크게'];

function applyFont() {
  // 다른 클래스(has-keybar 등)를 지우지 않도록 글자 크기 클래스만 교체한다
  document.body.classList.remove('fs-1', 'fs-2', 'fs-3');
  document.body.classList.add('fs-' + state.fontLevel);
  ui.fontLevel.textContent = FONT_NAMES[state.fontLevel - 1];
  localStorage.setItem('chorong-font', String(state.fontLevel));
}

function bindControls() {
  ui.font.addEventListener('click', () => {
    state.fontLevel = (state.fontLevel % 3) + 1;
    applyFont();
    toast('글자 크기를 "' + FONT_NAMES[state.fontLevel - 1] + '"로 바꿨어요');
  });

  ui.slow.addEventListener('click', () => {
    state.slow = !state.slow;
    ui.slow.setAttribute('aria-pressed', String(state.slow));
    ui.slowState.textContent = state.slow ? '켜짐' : '꺼짐';
    toast(state.slow ? `${subject(charName())} 더 천천히 말할게요` : '보통 빠르기로 말할게요');
  });

  ui.sound.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    ui.sound.setAttribute('aria-pressed', String(state.soundOn));
    ui.soundState.textContent = state.soundOn ? '켜짐' : '꺼짐';
    if (!state.soundOn) stopSpeaking();
    toast(state.soundOn ? '소리를 켰어요' : '소리를 껐어요. 글자로 보실 수 있어요');
  });

  /* '대화 지우기' 는 곧 새 대화다. 지난 이야기는 옆 서랍에 그대로 남는다 */
  on(ui.clear, 'click', async () => {
    closeSession('USER');
    localStorage.removeItem('chorong-history');
    await newThread();
    toast('새 대화를 시작했어요');
  });

  ui.send.addEventListener('click', () => sendMessage(ui.input.value));
  ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage(ui.input.value);
  });

  ui.mic.addEventListener('click', toggleMic);

  /* 건강 돌봄 — 스스로 누르실 수 있는 것은 이 둘뿐이다 (건강관리 화면에만 있다) */
  on(ui.mood, 'click', () => askMood());
  on(ui.activity, 'click', () => startActivity());
  on(ui.careLater, 'click', () => hideCare());
  on(ui.report, 'click', () => showTodayReport());

  /* 옆 서랍 · 인지치료 · 처음으로 */
  on(ui.drawerBtn, 'click', () => showDrawer(!document.body.classList.contains('drawer-open')));
  on(ui.drawerClose, 'click', () => showDrawer(false));
  on(ui.scrim, 'click', () => showDrawer(false));
  on(ui.newChat, 'click', () => newThread());
  on(ui.cognitive, 'click', () => openCognitive());
  on(ui.cogClose, 'click', hideCog);
  /* 두 이야기를 오간다 — 건강관리에서는 회상치료로, 회상치료에서는 건강관리로 */
  on(ui.other, 'click', () => {
    stopSpeaking();
    window.location.href = BOT === 'recall' ? '/health.html' : '/recall.html';
  });

  /* 설정 — 자주 쓰지 않는 것들을 여기 모아 두어 화면을 단정하게 둔다 */
  const showSettings = (open) => { if (ui.settings) ui.settings.hidden = !open; };
  on(ui.settingsBtn, 'click', () => showSettings(true));
  on(ui.settingsClose, 'click', () => showSettings(false));
  on(ui.settings, 'click', (e) => { if (e.target === ui.settings) showSettings(false); });

  ui.replay.addEventListener('click', () => {
    avatar.setEmotion(state.lastReply.emotion);
    speak(state.lastReply.text, state.lastReply.emotion, state.lastReply.mode);
  });

  ui.suggest.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) sendMessage(chip.dataset.say);
  });

  // 초롱이가 마우스를 따라 본다
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('mousemove', (e) => avatar.lookAt(e.clientX, e.clientY));
    document.addEventListener('mouseleave', () => avatar.resetLook());
  }

  // 화면을 벗어나면 말을 멈춘다
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeaking();
  });
}

/* ==================================================================
 *  회상 대화 — 사진 보며 이야기하기
 *
 *  문서의 흐름을 따른다.
 *  1) 대화 의사 확인 : 사진을 보자고 먼저 여쭙는다. 싫다 하시면 바로 그만둔다.
 *  2) 사진 한 장 제시 : 여러 장을 늘어놓지 않는다. 지금 볼 것만 보여 드린다.
 *  3) 개방형 질문 하나 : 정답을 요구하지 않는 물음으로 문만 연다.
 * ================================================================== */

/**
 * 사진을 무대에 띄운다 (null 이면 접는다).
 *
 * preview — 사진을 등록하며 중요도를 고르시는 동안 잠깐 보여 드리는 것.
 *   회상 대화가 아니므로 지금 이야기하는 사진(state.memory)으로 두지 않고
 *   이번 회기에 본 사진으로도 세지 않는다. 세어 두면 방금 올린 사진이
 *   [기억 회상 지원] 에서 빠진다.
 */
function showMemory(memory, { preview = false } = {}) {
  if (!ui.memory) return;      // 사진 칸이 없는 화면(건강관리)에서는 할 일이 없다
  if (!preview) {
    state.memory = memory;
    if (memory && !state.seenMemories.includes(memory.memory_id)) {
      state.seenMemories.push(memory.memory_id);
    }
    // 회상 중에는 같은 버튼이 '회상 마치기' 가 된다
    ui.recall.setAttribute('aria-pressed', String(Boolean(memory)));
    ui.recallLabel.textContent = memory ? '회상 마치기' : '기억 회상 지원';
  }

  const on = Boolean(memory);
  ui.memory.hidden = !on;
  ui.stage.classList.toggle('with-memory', on);
  if (on) {
    const theme = memory.kind === 'THEME';
    ui.nextPhoto.textContent = theme ? '다른 이야기' : '다른 사진';
    ui.closePhoto.textContent = theme ? '그만하기' : '그만 보기';
  }

  if (on) {
    const hasPhoto = Boolean(memory.photo);
    ui.memoryPhoto.hidden = !hasPhoto;
    if (hasPhoto) {
      ui.memoryPhoto.src = '/api/memories/' + memory.memory_id + '/photo';
      ui.memoryPhoto.alt = memory.title || '기억 사진';
    }
    // 사진이 없는 이야깃거리는 빈 칸 대신 주제를 크게 보여 준다
    ui.memory.classList.toggle('no-photo', !hasPhoto);
    ui.memoryTitle.textContent = memory.title || '';

    /* 사진 파일에 남은 찍은 날 · 찍은 곳. 있는 것만, 믿을 만한 것만 보여 드린다 */
    const meta = memory.meta || {};
    paintFacts(ui.memoryMeta, photoFacts({
      takenAt: meta.taken_at, confidence: meta.date_confidence,
      place: meta.location_name, hasGps: meta.has_gps,
    }));
  }
}

/* --- 회기 기록 (문서 11번 SAVE_SESSION) -------------------------
   사진에 대한 오래 남는 정보(MEMORY)와 매번 생기는 대화 기록(SESSION)은
   성격이 달라 따로 저장한다. 기록이 실패해도 대화는 끊기지 않게 한다. */

async function startSession(memoryId) {
  try {
    const r = await fetch('/api/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory_id: memoryId, character: state.character }),
    });
    if (!r.ok) return;
    const out = await r.json();
    state.sessionId = out.session.session_id;
  } catch {
    // 기록을 못 남겨도 어르신과의 대화는 계속되어야 한다
  }
}

async function noteTurn(turn) {
  if (!state.sessionId) return;
  try {
    await fetch(`/api/sessions/${state.sessionId}/turns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(turn),
    });
  } catch { /* 기록 실패는 조용히 넘어간다 */ }
}

async function closeSession(endedBy) {
  if (!state.sessionId) return;
  const id = state.sessionId;
  const topic = state.memory ? (state.memory.title || '사진 이야기') : '';
  state.sessionId = null;
  try {
    await fetch(`/api/sessions/${id}/close`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ended_by: endedBy || 'USER' }),
    });
  } catch { /* 무시 */ }
  /* 오늘 나눈 이야기를 한 줄로 남긴다. 다음에 만나면 초롱이가 이 한 줄로 말문을 연다 */
  careApi('/api/care/summary', { topics: topic ? [topic] : [] });
}

/* --- 기억으로 남길지 여쭙기 (문서 9번 VERIFY_NEW_INFORMATION) ----
   음성인식이 잘못 알아듣거나 모델이 잘못 새겨들은 내용이 사실로 굳으면
   다음 대화부터 초롱이가 그 틀린 이야기를 사실처럼 말하게 된다.
   그래서 저장 전에 어르신께 보여 드리고 여쭙는다. */

const FIELD_NAME = {
  title: '무슨 일', people: '함께한 사람', place: '장소',
  when_text: '언제쯤', description: '이야기',
};

function hideKeep() {
  state.pending = [];
  state.pendingMemoryId = null;
  if (!ui.keep) return;        // 건강관리 화면에는 이 칸이 없다
  ui.keep.hidden = true;
  ui.keepList.innerHTML = '';
}

/** 아직 확인 못 받은 이야기가 있으면 보여 준다. 있으면 true */
async function askToKeep(memoryId, sessionId) {
  if (!memoryId) return false;
  let claims = [];
  try {
    const q = sessionId ? '?session=' + encodeURIComponent(sessionId) : '';
    const r = await fetch(`/api/memories/${memoryId}/pending${q}`);
    if (!r.ok) return false;
    claims = (await r.json()).claims || [];
  } catch {
    return false;
  }
  if (claims.length === 0) return false;

  state.pending = claims;
  state.pendingMemoryId = memoryId;
  ui.keepList.innerHTML = '';
  for (const c of claims) {
    const li = document.createElement('li');
    const value = Array.isArray(c.value) ? c.value.join(', ') : c.value;
    li.textContent = `${FIELD_NAME[c.field] || c.field} — ${value}`;
    ui.keepList.appendChild(li);
  }
  ui.keep.hidden = false;
  return true;
}

/** 어르신의 뜻을 서버에 전한다. 남기지 않겠다 하셔도 지우지는 않는다. */
async function decideKeep(keep) {
  const memoryId = state.pendingMemoryId;
  const ids = state.pending.map((c) => c.claim_id);
  hideKeep();
  if (!memoryId) return;
  try {
    await fetch(`/api/memories/${memoryId}/pending/decide`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keep, claim_ids: ids }),
    });
  } catch { /* 무시 */ }
  toast(keep ? '기억으로 남겨 두었어요' : '남기지 않았어요');
}

on(ui.keepYes, 'click', () => decideKeep(true));
on(ui.keepNo, 'click', () => decideKeep(false));

/**
 * [기억 회상 지원] 에 띄울 사진 — 올리신 사진 중 추천 점수가 가장 높은 것.
 * 이번 회기에 이미 본 사진은 뺀다. 이야깃거리(사진 없는 주제)로는 넘어가지 않는다.
 * 남은 사진이 없으면 null, 서버에 못 물어보면 던진다.
 */
async function pickMemory() {
  const params = new URLSearchParams({ kind: 'PHOTO' });
  if (state.seenMemories.length) params.set('exclude', state.seenMemories.join(','));
  const r = await fetch('/api/memories/next?' + params.toString());
  if (!r.ok) throw new Error('next');
  const out = await r.json();
  return out.memory || null;
}

/* --- 한 회기가 길어지면 스스로 마무리한다 (문서 10번 CLOSE_SESSION) ---
   회상이 길어지면 피로하시고 같은 이야기가 되풀이된다. 문서는 한 회기를
   오 분쯤으로 본다.

   길이는 서버가 정한다. 여기서 따로 세어 두면 서버가 마무리를 여쭙는 시점과
   화면이 사진을 접는 시점이 어긋난다. 서버에 못 물어보면 오 분으로 본다. */
let sessionLimitMs = 5 * 60 * 1000;

fetch('/api/health')
  .then((r) => r.json())
  .then((h) => {
    if (h && Number(h.sessionLimitSeconds) > 0) {
      sessionLimitMs = Number(h.sessionLimitSeconds) * 1000;
    }
  })
  .catch(() => { /* 기본값을 그대로 쓴다 */ });

/** 지금 끼어들어도 되는 때인가. 말씀하시는 중에 끊지 않는다. */
const canInterrupt = () => !state.busy && !state.listening && !currentSource;

/**
 * 사진 이야기를 접는다.
 * 버튼을 눌러 접든 시간이 다 되어 접든 하는 일은 같으므로 한 곳에 모았다.
 * 두 갈래로 동시에 불릴 수 있어 한 번만 돌게 막아 둔다.
 */
let wrappingUp = false;
/* 초롱이가 마무리 인사를 하는 중이면, 말이 끝난 뒤에 접는다 */
let closingAfterSpeech = false;
/* 어르신이 말로 "다른 사진 보자" · "그만 보자" 하셨으면, 초롱이 말이 끝난 뒤 화면이 따른다 */
let nextAfterSpeech = false;
let stopAfterSpeech = false;
/* 사진 없이 이야기하다 마치셨을 때 — 말이 끝나면 표정 셋을 띄운다 */
let feelAfterSpeech = false;
async function wrapUpMemoryTalk({ farewell = '' } = {}) {
  if (wrappingUp || !state.memory) return;
  wrappingUp = true;
  clearTimeout(closeTimer);

  try {
    if (farewell) {
      ui.subtitle.textContent = farewell;
      addMessage('bot', farewell);
      state.history.push({ role: 'assistant', content: farewell });
      state.lastReply = { text: farewell, emotion: 'happy', mode: 'talk' };
      saveHistory();
      avatar.setEmotion('happy');
      avatar.playGesture('nod');
      await speak(farewell, 'happy', 'talk');
    }

    const memoryId = state.memory ? state.memory.memory_id : null;
    const asked = await askToKeep(memoryId, state.sessionId);
    await closeSession('TIMEOUT');
    if (!asked) hideKeep();
    showMemory(null);
    ui.memoryPhoto.removeAttribute('src');
  } finally {
    wrappingUp = false;
  }
}

/**
 * 오 분이 지났는지 이따금 살핀다.
 * 시간이 됐어도 말씀하시는 중이면 기다렸다가 다음 번에 다시 본다.
 */
function scheduleAutoClose() {
  clearTimeout(closeTimer);
  if (!state.memory) return;

  closeTimer = setTimeout(() => {
    if (!state.memory) return;
    const over = state.sessionStart && (Date.now() - state.sessionStart) >= sessionLimitMs;
    if (!over || !canInterrupt()) { scheduleAutoClose(); return; }
    wrapUpMemoryTalk({
      farewell: '오늘 이야기 잘 들었어요. 사진은 이만 접을게요.',
    });
  }, 15000);
}

/* ==================================================================
 *  사진 올려서 등록하기
 *
 *  대화 중에 사진 한 장을 올리면 초롱이 옆에 잠깐 띄우고 얼마나 소중한
 *  사진인지 여쭙는다. 등록은 거기서 끝난다. 사진을 보며 나누는 이야기는
 *  [기억 회상 지원] 을 누르시면 점수가 높은 사진부터 연다.
 * ================================================================== */

/**
 * 휴대폰 사진은 사천 화소가 넘어 그대로 올리면 느리다.
 * 화면에 보일 만한 크기(긴 변 1600)까지 줄여 보낸다.
 * 줄인 쪽이 더 크면 원본을 쓴다 (작은 png 등).
 */
async function shrinkPhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;   // 못 줄이면 원본을 보낸다. 크기는 서버가 다시 본다.
  }
}

/**
 * 고르신 사진 한 장을 올린다.
 *
 * 등록 순서 : 사진 올리기 → 파일 정보(찍은 날 · 위치) 저장 → 중요도 고르기 → 등록 끝.
 * 등록만 한다. 사진 이야기는 [기억 회상 지원] 을 누르시면 점수가 높은 사진부터 연다.
 */
async function attachPhoto(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    toast('사진 파일만 올릴 수 있어요.');
    return;
  }
  if (state.busy || state.listening) {
    toast('잠깐만요, 지금은 이야기하는 중이에요.');
    return;
  }

  stopSpeaking();
  clearTimeout(waitTimer);
  state.waited = false;
  state.busy = true;
  ui.attach.disabled = true;
  ui.send.disabled = true;
  setStatus('thinking', '사진을 받는 중이에요');

  // 올라가기를 기다리지 않고 화면에는 먼저 보여 드린다
  const localUrl = URL.createObjectURL(file);
  const bubble = addPhotoMessage(localUrl);
  let uploaded = null;

  try {
    /* 줄이면 캔버스를 거치며 찍은 날과 위치가 떨어져 나간다. 원본에서 먼저 읽는다. */
    const exif = await readExifFromFile(file);
    /* 찍은 곳 이름은 올리는 동안 함께 찾는다 (기다리는 시간을 늘리지 않게) */
    const placeP = placeFor(exif.gps);
    const small = await shrinkPhoto(file);

    /* 어떤 사진은 날짜가 나오고 어떤 사진은 안 나온다. 무엇을 읽었는지 남겨 둔다 */
    console.log('[사진] 파일에서 읽은 것 —', exif);

    const fd = new FormData();
    if (exif.takenAt) {
      fd.append('taken_at', exif.takenAt);
      /* 어느 자리에서 읽었는지도 함께 보낸다. 파일을 고친 때는 찍은 때가 아닐 수 있다 */
      if (exif.dateSource) fd.append('date_source', exif.dateSource);
      if (exif.dateConfidence) fd.append('date_confidence', exif.dateConfidence);
    }
    if (exif.gps) {
      fd.append('gps_lat', String(exif.gps.lat));
      fd.append('gps_lon', String(exif.gps.lon));
    }
    fd.append('photo', small, 'photo.jpg');

    const r = await fetch('/api/memories/upload', { method: 'POST', body: fd });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.memory) throw new Error(out.message || '사진을 올리지 못했어요.');

    // 보던 사진이 있으면 오늘 들은 이야기를 먼저 여쭙고 그 회기를 닫는다
    if (state.memory) {
      clearTimeout(closeTimer);
      await askToKeep(state.memory.memory_id, state.sessionId);
      await closeSession('USER');
      showMemory(null);
    }

    // 이제부터는 서버가 가진 사진을 본다 (임시 주소를 곧 버리기 때문)
    bubble.querySelector('.msg-photo').src = '/api/memories/' + out.memory.memory_id + '/photo';
    uploaded = { memory: out.memory, exif, place: await placeP };
  } catch (err) {
    bubble.remove();
    toast(err.message || '사진을 올리지 못했어요.');
    setStatus('idle', '말씀해 주세요');
  } finally {
    URL.revokeObjectURL(localUrl);
    state.busy = false;
    ui.attach.disabled = false;
    ui.send.disabled = false;
    ui.filePhoto.value = '';   // 같은 사진을 다시 골라도 열리게
  }

  if (uploaded) askImportance(uploaded.memory, uploaded.exif, uploaded.place);
}

/* --- 사진을 올리시면 얼마나 소중한 사진인지 여쭙는다 -----------------
   고르신 별점이 곧 순서가 되지는 않는다. 사진 속 단서 · 찍은 시기 ·
   최근에 나왔는지와 함께 더해 다음에 보여 드릴 사진을 고른다 (lib/photo-score.js). */

let rating = null;   // 중요도를 여쭙는 중인 사진
const STAR_WORD = { 1: '평범한', 2: '소중한', 3: '매우 소중한' };

/**
 * 사진 파일에서 읽은 것을 알려 드린다.
 *
 * 모든 사진에 촬영 정보가 남아 있지는 않다. 주고받은 사진이나 화면을 찍은 사진은
 * 날짜와 위치가 지워져 있다. 세 가지 경우를 나눠 알려 드리고, 없을 때는
 * 보호자 화면에서 적어 두실 수 있다고 안내한다 (지어내지 않는다).
 */
/**
 * 찍은 날 · 찍은 곳 두 줄.
 * 파일을 고친 때만 남은 날짜는 찍은 날로 여기지 않는다 (옛 사진을 다시 찍으면 오늘이 된다).
 * full — 올리실 때처럼 무엇을 읽었는지 다 보여 드릴지. 아니면 있는 것만 보여 드린다.
 */
function photoFacts({ takenAt = null, confidence = null, place = '', hasGps = false } = {}, { full = false } = {}) {
  const day = takenAt && confidence !== 'LOW' ? formatTakenDate(takenAt) : '';
  const rows = [];
  if (day) rows.push(['찍은 날', day]);
  else if (full) rows.push(['찍은 날', takenAt ? '정확하지 않아요 (파일을 고친 날만 남아 있어요)' : '정보가 없어요']);
  if (place) rows.push(['찍은 곳', place]);
  else if (full) rows.push(['찍은 곳', hasGps ? '위치는 남아 있지만 이름을 찾지 못했어요' : '정보가 없어요']);
  return { rows, any: Boolean(day || place) };
}

/** 두 줄을 칸에 그린다. 그릴 것이 없으면 칸을 감춘다 */
function paintFacts(el, facts, note = '') {
  if (!el) return;
  el.innerHTML = '';
  for (const [label, value] of facts.rows) {
    const row = document.createElement('span');
    row.className = 'fact';
    const b = document.createElement('b');
    b.textContent = label;
    row.append(b, document.createTextNode(value));
    el.appendChild(row);
  }
  if (note) {
    const n = document.createElement('span');
    n.className = 'fact-note';
    n.textContent = note;
    el.appendChild(n);
  }
  el.hidden = facts.rows.length === 0 && !note;
}

/** 좌표를 동네 이름으로 (서버가 찾는다. 못 찾으면 빈 이름) */
async function placeFor(gps) {
  if (!gps) return '';
  try {
    const r = await fetch('/api/place', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: gps.lat, lon: gps.lon }),
    });
    return r.ok ? ((await r.json()).name || '') : '';
  } catch {
    return '';
  }
}

function describeMeta(exif) {
  /* 파일을 고친 때만 남은 사진은 찍은 날로 여기지 않는다 */
  const day = exif?.takenAt && exif.dateConfidence !== 'LOW' ? formatTakenDate(exif.takenAt) : '';
  const hasGps = Boolean(exif?.gps);

  if (day && hasGps) return `찍은 날 ${day} · 찍은 곳 정보도 함께 남아 있어요`;
  if (day) return `찍은 날 ${day} · 찍은 곳 정보는 없어요`;
  if (hasGps) return '찍은 곳 정보는 남아 있는데 찍은 날은 없어요';
  return '이 사진에는 찍은 날과 곳 정보가 남아 있지 않아요. 보호자 화면에서 적어 두실 수 있어요.';
}

/* 좁은 화면에서는 입력칸이 화면 아래에 붙어 있어 마지막 선택지가 그 뒤에 가려진다.
   "이야기하고 싶지 않아요" 가 안 보이면 고를 수 없는 것과 같다.
   고르는 칸이 입력칸 위로 다 보이도록 한 번 내려 준다. (넓은 화면은 스크롤이 없어 그대로) */
function revealRate() {
  // 위치를 읽는 순간 브라우저가 배치를 마치므로 다음 화면을 기다리지 않는다.
  // (기다리게 두면 탭이 가려져 있는 동안에는 끝내 움직이지 않는다)
  const box = ui.rate.getBoundingClientRect();
  const footer = ui.composer.getBoundingClientRect();
  const visibleBottom = Math.min(window.innerHeight, footer.top) - 12;
  if (box.bottom > visibleBottom) {
    window.scrollBy({ top: box.bottom - visibleBottom, behavior: 'smooth' });
  }
}

function askImportance(memory, exif, place = '') {
  rating = memory;
  showMemory(memory, { preview: true });   // 무엇을 고르시는지 보이게 잠깐 크게 띄운다 (회상 대화는 아니다)
  ui.memory.classList.add('rating');
  ui.stage.classList.add('rating');
  /* 별점 위에 사진 파일에서 읽은 찍은 날 · 찍은 곳을 보여 드린다 */
  const facts = photoFacts({
    takenAt: exif?.takenAt, confidence: exif?.dateConfidence,
    place, hasGps: Boolean(exif?.gps),
  }, { full: true });
  paintFacts(ui.rateMeta, facts,
    facts.any ? '' : '보호자 화면에서 찍은 해와 장소를 적어 두실 수 있어요.');
  if (ui.memoryMeta) ui.memoryMeta.hidden = true;   // 고르시는 동안에는 한 곳에만
  ui.rate.hidden = false;
  revealRate();

  const line = '사진 잘 받았어요. 이 사진이 얼마나 소중한지 골라 주세요.';
  ui.subtitle.textContent = line;
  addMessage('bot', line);
  avatar.setEmotion('happy');
  avatar.playGesture('nod');
  speak(line, 'happy', 'talk');
}

function cancelRating() {
  rating = null;
  ui.rate.hidden = true;
  ui.memory.classList.remove('rating');
  ui.stage.classList.remove('rating');
}

async function chooseImportance(choice) {
  const memory = rating;
  if (!memory) return;
  cancelRating();
  stopSpeaking();

  // 고르신 것을 남긴다. 남기지 못해도 대화는 이어 간다.
  try {
    await fetch('/api/memories/' + memory.memory_id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(choice),
    });
  } catch { /* 무시 — 보호자 화면에서 다시 고를 수 있다 */ }

  // 등록은 여기서 끝난다. 사진은 접는다. "이야기하고 싶지 않아요" 면 추천에서도 빠진다.
  showMemory(null, { preview: true });
  ui.memoryPhoto.removeAttribute('src');

  const line = choice.avoid
    ? '알겠어요. 이 사진은 잘 넣어 둘게요. 이 사진 이야기는 꺼내지 않을게요.'
    : `${STAR_WORD[choice.importance] || '소중한'} 사진으로 잘 넣어 두었어요. 사진 보며 옛이야기 나누고 싶으실 때 기억 회상 지원을 눌러 주세요.`;
  ui.subtitle.textContent = line;
  addMessage('bot', line);
  avatar.setEmotion(choice.avoid ? 'neutral' : 'happy');
  avatar.playGesture('nod');
  await speak(line, choice.avoid ? 'neutral' : 'happy', 'talk');
}

on(ui.rate, 'click', (e) => {
  const btn = e.target.closest('.rate-btn');
  if (!btn) return;
  chooseImportance(btn.dataset.avoid
    ? { avoid: true, importance: null }
    : { avoid: false, importance: Number(btn.dataset.importance) });
});

on(ui.attach, 'click', () => ui.filePhoto.click());
on(ui.filePhoto, 'change', (e) => attachPhoto(e.target.files[0]));

/* 끌어다 놓기 — 컴퓨터에서 쓰실 때 편하다 */
['dragenter', 'dragover'].forEach((ev) =>
  ui.composer.addEventListener(ev, (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    ui.composer.classList.add('dropping');
  }));
['dragleave', 'drop'].forEach((ev) =>
  ui.composer.addEventListener(ev, () => ui.composer.classList.remove('dropping')));
ui.composer.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  attachPhoto(e.dataTransfer.files[0]);
});

/* 붙여넣기 — 사진을 복사해 오신 경우 */
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
  if (item) attachPhoto(item.getAsFile());
});

/* ==================================================================
 *  기억 회상 지원
 *
 *  ① 사진으로 회상 단서 제공 → ② 열린 질문 → ③ 경청 · 반영
 *  → ④ 필요할 때만 추가 질문이나 단서 → ⑤ 기억을 강요하거나 정정하지 않기
 *
 *  ①② 는 여기서 한다 — 점수가 가장 높은 사진을 띄우고 고정된 첫 물음으로 연다.
 *  ③~⑤ 는 서버의 대화 규칙이 맡는다 (server.js 회상 대화 알고리즘).
 * ================================================================== */

/**
 * 사진 한 장을 띄우고 고정된 첫 물음으로 회상을 연다.
 * fresh — [기억 회상 지원] 을 새로 누르신 것. '다른 사진' 으로 넘어갈 때는 false 라,
 *   방금 띄운 '기억으로 남길까요' 칸을 닫지 않는다.
 */
async function openRecall(memory, { fresh = false } = {}) {
  if (fresh) hideKeep();
  hideCare();   // 사진 이야기를 시작하면 돌봄 카드는 접는다 (한 번에 하나)
  showMemory(memory);
  if (!state.sessionStart) state.sessionStart = Date.now();
  // 사진 없이 이야기하던 회기가 열려 있으면 먼저 닫는다 (한 회기에 사진 하나)
  if (state.sessionId) await closeSession('USER');
  await startSession(memory.memory_id);

  /* 첫 말 — 사진에 보이는 것을 한두 가지 짚고, 어떤 사진이든 늘 같은 첫 물음으로 연다.
     (public/recall-opening.js — 모델에게 맡기지 않는다. 첫 말부터 짐작이 섞이면 바로잡기 어렵다) */
  const line = openingLine();
  ui.subtitle.textContent = line;
  addMessage('bot', line);
  state.history.push({ role: 'assistant', content: line });
  noteTurn({ role: 'assistant', text: line, response_mode: 'FOLLOW_UP', asked_question: true });
  state.lastReply = { text: line, emotion: 'happy', mode: 'talk' };
  saveHistory();

  avatar.setEmotion('happy');
  avatar.playGesture('nod');
  scheduleAutoClose();
  speak(line, 'happy', 'talk');
}

/** [기억 회상 지원] 을 누르셨을 때 */
async function startRecall() {
  ensureAudio();
  if (state.busy || state.listening) {
    toast('잠깐만요, 지금은 이야기하는 중이에요.');
    return;
  }
  cancelRating();

  /* 새로 시작하는 회상이다. 지난번에 본 사진도 다시 후보에 올린다
     (최근에 나온 사진은 추천 점수에서 이미 깎인다). 오 분도 여기서부터 잰다. */
  state.seenMemories = [];
  let memory;
  try {
    memory = await pickMemory();
  } catch {
    toast('사진을 불러오지 못했어요.');
    return;
  }

  if (!memory) {
    const line = '아직 함께 볼 사진이 없어요. 아래 더하기 모양 사진 버튼으로 사진을 올려 주시면, 그 사진을 보며 이야기 나눠요.';
    ui.subtitle.textContent = line;
    addMessage('bot', line);
    avatar.setEmotion('thinking');
    avatar.playGesture('tilt');
    speak(line, 'neutral', 'talk');
    return;
  }

  stopSpeaking();
  state.sessionStart = Date.now();
  await openRecall(memory, { fresh: true });
}

/**
 * 다른 사진으로 — 지금 사진에서 들은 이야기를 먼저 여쭙고 넘어간다.
 * 넘어갔으면 true, 더 볼 사진이 없으면 false.
 */
async function nextRecallPhoto() {
  let memory;
  try {
    memory = await pickMemory();
  } catch {
    toast('사진을 불러오지 못했어요.');
    return true;   // 까닭은 이미 알려 드렸다
  }
  if (!memory) return false;

  clearTimeout(closeTimer);
  await askToKeep(state.memory ? state.memory.memory_id : null, state.sessionId);
  await closeSession('USER');
  await openRecall(memory);
  return true;
}

/** 오늘 볼 사진을 다 보셨을 때. 사진은 그대로 두고 고르시게 한다 */
function sayNoMorePhotos() {
  const line = '오늘 함께 볼 사진은 다 봤어요. 이 사진 이야기를 조금 더 나누셔도 되고, 그만 보셔도 괜찮아요.';
  ui.subtitle.textContent = line;
  addMessage('bot', line);
  state.history.push({ role: 'assistant', content: line });
  state.lastReply = { text: line, emotion: 'happy', mode: 'talk' };
  saveHistory();
  avatar.setEmotion('happy');
  speak(line, 'happy', 'talk');
}

async function stopMemoryTalk() {
  clearTimeout(closeTimer);
  cancelRating();   // 중요도를 여쭙던 중이었으면 그만 여쭙는다 (고르지 않은 채로 남는다)
  if (wrappingUp) return;
  wrappingUp = true;
  try {
    const memoryId = state.memory ? state.memory.memory_id : null;
    const asked = await askToKeep(memoryId, state.sessionId);
    await closeSession('USER');
    if (!asked) hideKeep();
    showMemory(null);
    ui.memoryPhoto.removeAttribute('src');
    /* 오늘 이야기를 여기서 마치는 것이므로 지금 기분을 표정으로 여쭙는다
       (종료 명세서 — 말로 대답하시라 하지 않는다) */
    if (BOT === 'recall' && state.endingSessionId) showFeel();
  } finally {
    wrappingUp = false;
  }
}

on(ui.recall, 'click', () => {
  if (state.memory) stopMemoryTalk();
  else startRecall();
});

on(ui.closePhoto, 'click', stopMemoryTalk);

on(ui.nextPhoto, 'click', async () => {
  if (!(await nextRecallPhoto())) sayNoMorePhotos();
});

/* ==================================================================
 *  대화 종료 — 마치는 때를 정하시는 것은 어르신이다 (전달 패키지 v2.4)
 *
 *  초롱이가 질문 횟수를 세어 대화를 끊지 않는다. 화면에 늘 떠 있는
 *  [대화 종료] 를 누르시면 정해진 인사를 드리고, 지금 기분을 표정 셋
 *  가운데 하나로 여쭙는다. 점수로 묻지 않고, 말로 대답하시라 하지 않는다.
 * ================================================================== */

/** lib/termination.js 의 고정 발화. 서버가 돌려주지만, 못 받아도 같은 인사를 드린다 */
const END_LINE = '네, 오늘 이야기는 여기서 마칠게요. '
  + '저와 이야기 나누시니 지금 기분이 어떠신지 화면의 얼굴 표정을 하나 눌러주세요.';

let ending = false;

/** 초롱이가 한마디 하고 그 말을 기록에 남긴다 */
async function sayLine(line, emotion = 'happy') {
  if (!line) return;
  addMessage('bot', line);
  state.history.push({ role: 'assistant', content: line });
  saveHistory();
  noteThread('assistant', line);
  ui.subtitle.textContent = line;
  state.lastReply = { text: line, emotion, mode: 'talk' };
  avatar.setEmotion(emotion);
  await speak(line, emotion, 'talk');
}

/** [대화 종료] 를 누르셨을 때 */
async function endTalkByUser() {
  if (ending) return;
  ending = true;
  clearTimeout(closeTimer);
  cancelRating();
  stopSpeaking();
  try {
    const id = state.sessionId;
    if (id) state.endingSessionId = id;
    let line = END_LINE;
    if (id) {
      try {
        const r = await fetch(`/api/sessions/${id}/terminate`, { method: 'POST' });
        if (r.ok) line = (await r.json()).bot_response || line;
      } catch { /* 서버에 닿지 못해도 드리는 인사는 같다 */ }
    }
    await sayLine(line);
    showFeel();
  } finally {
    ending = false;
  }
}

/** 표정 셋을 띄운다 */
function showFeel() {
  if (!ui.feel) return;
  hideKeep();
  hideCare();
  ui.feel.hidden = false;
  setStatus('idle', '표정을 하나 눌러 주세요');
  /* 페이지가 길어 화면 밖에 뜨면 못 보신다. 보이는 자리로 데려온다 */
  ui.feel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideFeel() { if (ui.feel) ui.feel.hidden = true; }

/**
 * 표정을 고르셨을 때. 고르지 않고 넘어가셔도 된다 (rating 이 없다).
 * 고르신 것만 기록에 남는다 — 대화 중에 하신 말씀의 낱말로는 재지 않는다.
 */
async function pickFeel(rating) {
  hideFeel();
  const id = state.endingSessionId;
  state.endingSessionId = null;

  if (id && rating) {
    try {
      const r = await fetch(`/api/sessions/${id}/emotion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      if (r.ok) {
        const out = await r.json();
        if (out.reply) await sayLine(out.reply, rating === 'DISCOMFORT' ? 'neutral' : 'happy');
      }
    } catch { /* 기록을 못 남겨도 대화는 그대로 마친다 */ }
  }

  /* 사진을 보고 계셨으면 접고, 오늘 들은 이야기를 남길지 여쭙는다 */
  if (state.memory) await stopMemoryTalk();
  else await closeSession('USER');
  setStatus('idle', '말씀해 주세요');
}

on(ui.end, 'click', endTalkByUser);
on(ui.feel, 'click', (e) => {
  const btn = e.target.closest('[data-feel]');
  if (btn) pickFeel(btn.dataset.feel);
});
on(ui.feelSkip, 'click', () => pickFeel(null));

/* ==================================================================
 *  건강 돌봄 — 오늘 기분 · 아픈 곳 · 약 · 오늘의 활동 · 목표
 *
 *  어르신 화면은 단정해야 한다. 버튼을 늘어놓으면 무엇을 눌러야 할지
 *  헤매신다. 그래서 한 번에 하나만 큰 카드로 여쭙고, 고르시면 바로 닫는다.
 *
 *  무엇을 여쭐지는 대부분 서버가 알려 준다 (careAsk) — 아프다고 하시면
 *  어디가 얼마나 아프신지, 약을 깜빡하셨다면 약을. 어르신이 먼저 누르실 수
 *  있는 것은 [오늘 기분] 과 [오늘의 활동] 둘뿐이다.
 * ================================================================== */

/* 서버가 알려 주기 전에 쓸 기본값 (lib/care-records.js 와 같은 낱말이다) */
const CARE_FALLBACK = {
  moods: [
    { key: 'great', label: '아주 좋아요', score: 1 },
    { key: 'good', label: '좋아요', score: 0.5 },
    { key: 'soso', label: '그저 그래요', score: 0 },
    { key: 'bad', label: '안 좋아요', score: -0.5 },
    { key: 'awful', label: '아주 안 좋아요', score: -1 },
  ],
  pain_parts: ['머리', '어깨', '허리', '무릎', '다리', '팔', '배', '가슴', '그 밖'],
  pain_levels: [
    { key: 'mild', label: '조금 아파요', score: 3 },
    { key: 'moderate', label: '많이 아파요', score: 6 },
    { key: 'severe', label: '아주 많이 아파요', score: 9 },
  ],
};

const careOptions = () => ({ ...CARE_FALLBACK, ...(state.care || {}) });

/** 돌봄 길에 다녀온다. 실패해도 대화는 이어 가야 하므로 조용히 null 을 돌려준다 */
async function careApi(url, body) {
  try {
    const res = await fetch(url, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function hideCare() {
  ui.care.hidden = true;
  ui.careActs.innerHTML = '';
  ui.careNote.hidden = true;
}

/**
 * 카드 하나를 띄운다.
 * say 가 참이면 초롱이가 소리 내어 여쭙는다 (방금 다른 말을 했으면 겹치지 않게 거짓으로 둔다).
 */
function showCare({ question, note = '', acts = [], say = true }) {
  ui.careQ.textContent = question;
  ui.careNote.textContent = note;
  ui.careNote.hidden = !note;
  ui.careActs.innerHTML = '';

  for (const act of acts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'care-btn' + (act.primary ? ' care-primary' : '');
    btn.textContent = act.label;
    btn.addEventListener('click', act.onClick);
    ui.careActs.appendChild(btn);
  }
  ui.care.hidden = false;

  if (say) {
    ui.subtitle.textContent = question;
    addMessage('bot', question);
    speak(question, 'happy', 'talk');
  }
}

/** 카드를 닫은 뒤 초롱이가 한마디 한다. 대화 기록에도 남겨 다음 차례에 이어진다 */
async function careSay(line, emotion = 'happy') {
  ui.subtitle.textContent = line;
  addMessage('bot', line);
  state.history.push({ role: 'assistant', content: line });
  state.lastReply = { text: line, emotion, mode: 'talk' };
  saveHistory();
  avatar.setEmotion(emotion);
  avatar.playGesture('nod');
  await speak(line, emotion, 'talk');
}

/* --- 오늘 기분 -------------------------------------------------
   직접 고르신 기분은 대화에서 읽은 기분보다 더 믿는다. 둘이 많이 다르면
   초롱이가 다그치지 않고 한 번 더 여쭙는다 (lib/care-score.js fuseMood). */

function askMood({ say = true } = {}) {
  showCare({
    say,
    question: '오늘 기분이 어떠세요?',
    acts: careOptions().moods.map((m) => ({ label: m.label, onClick: () => chooseMood(m) })),
  });
}

async function chooseMood(mood) {
  hideCare();
  stopSpeaking();
  if (state.care) state.care.asked_mood = true;
  await careApi('/api/care/mood', { key: mood.key });

  const good = (mood.score ?? 0) > 0;
  await careSay(
    good
      ? '그러시다니 저도 참 좋아요. 오늘 어떤 일이 있으셨는지 들려주시겠어요?'
      : '그러셨군요. 오늘은 제가 더 곁에 있을게요. 무슨 일이 있으셨어요?',
    good ? 'happy' : 'worried');
}

/* --- 아픈 곳 ---------------------------------------------------
   1에서 10까지의 눈금은 어르신께 고르시기 어렵다. 세 마디로 여쭙고
   점수로 바꿔 둔다. 아주 아프다고 하시면 병원을 권해 드린다. */

function askPain(part) {
  const { pain_parts: parts, pain_levels: levels } = careOptions();
  if (!part) {
    showCare({
      question: '어디가 아프세요?',
      acts: parts.map((p) => ({ label: p, onClick: () => askPain(p) })),
    });
    return;
  }
  showCare({
    question: `${subject(part)} 얼마나 아프세요?`,
    acts: levels.map((l) => ({ label: l.label, onClick: () => recordPain(part, l) })),
  });
}

async function recordPain(part, level) {
  hideCare();
  stopSpeaking();
  const out = await careApi('/api/care/pain', { part, level: level.key });
  await careSay(
    out?.see_doctor
      ? `${subject(part)} 많이 아프시군요. 오늘 중으로 병원에 가 보시는 게 좋겠어요. 가족분께도 꼭 알려 주세요.`
      : `${subject(part)} 아프시다니 걱정이에요. 무리하지 마시고 좀 쉬세요. 제가 적어 둘게요.`,
    'worried');
}

/* --- 약 --------------------------------------------------------
   등록은 보호자가 하고, 어르신은 드셨다고 누르시기만 한다.
   조금 전에도 드신 기록이 있으면 나무라지 않고 한 번 여쭙는다. */

function askMedication({ name = '' } = {}) {
  showCare({
    question: name ? `${name} 드셨어요?` : '오늘 약은 드셨어요?',
    acts: [
      { label: '먹었어요', primary: true, onClick: () => takeMedication(name) },
      {
        label: '아직이요',
        onClick: async () => {
          hideCare();
          stopSpeaking();
          await careSay('네, 이따 드시고 알려 주세요. 제가 다시 여쭐게요.');
        },
      },
    ],
  });
}

async function takeMedication(name) {
  hideCare();
  stopSpeaking();
  const out = await careApi('/api/care/medications/taken', name ? { name } : {});
  await careSay(
    out?.again
      ? '약 잘 챙기셨어요. 그런데 혹시 아까도 드시지 않았을까요? 헷갈리시면 약통을 한번 봐 주세요.'
      : '약 잘 챙겨 드셨네요. 정말 잘하셨어요.',
    out?.again ? 'thinking' : 'proud');
}

/* --- 오늘의 활동 -----------------------------------------------
   회상 · 숫자 · 날짜 · 사진 네 가지 중 오늘 안 하신 것 하나.
   날짜는 맞히게 하지 않고 먼저 알려 드린 뒤 함께 말해 본다. */

async function startActivity() {
  const out = await careApi('/api/care/activity');
  const activity = out && out.activity;
  if (!activity) {
    await careSay('오늘 함께 할 활동은 다 하셨어요. 정말 잘하셨어요.', 'proud');
    return;
  }
  /* 사진 활동은 기억 회상 지원으로 이어진다 — 따로 만들 까닭이 없다 */
  if (activity.kind === 'photo') {
    careApi('/api/care/activity', { kind: 'photo', answered: true });
    startRecall();
    return;
  }
  showCare({
    question: activity.say,
    note: `오늘의 활동 — ${activity.name}`,
    acts: [
      { label: '했어요', primary: true, onClick: () => finishActivity(activity, true) },
      { label: '잘 모르겠어요', onClick: () => finishActivity(activity, false) },
    ],
  });
}

async function finishActivity(activity, answered) {
  hideCare();
  stopSpeaking();
  await careApi('/api/care/activity', { kind: activity.kind, answered });
  await careSay(
    answered
      ? '와, 잘하셨어요! 저랑 같이 하니까 더 좋네요.'
      : '괜찮아요. 안 떠오르는 날도 있어요. 같이 해 주셔서 고마워요.',
    answered ? 'proud' : 'happy');
}

/* --- 목표 ------------------------------------------------------
   목표는 대화에서 어르신이 스스로 정하신다. 화면은 정해진 목표를 보여 드리고
   오늘 하셨는지만 받는다 (초롱이가 대신 정하지 않는다). */

function showGoalCard(goal) {
  if (!goal || !goal.is_specific) return;
  showCare({
    say: false,
    question: '오늘 이대로 해 보시고, 하시면 알려 주세요.',
    note: goal.text,
    acts: [
      { label: '오늘 했어요', primary: true, onClick: markGoalDone },
      { label: '아직이요', onClick: () => hideCare() },
    ],
  });
}

async function markGoalDone() {
  hideCare();
  stopSpeaking();
  await careApi('/api/care/goal/achieved', {});
  await careSay('오늘도 하셨군요! 정말 대단하세요.', 'proud');
}

/* --- 오늘 기록 · 오늘 떠올린 기억 -------------------------------- */

/** 오늘 무엇을 하셨는지 한눈에 (건강관리 화면의 [오늘 기록]) */
async function showTodayReport() {
  const out = await careApi('/api/care/today');
  if (out) state.care = out;
  const r = out && out.report;

  const bits = [];
  if (r) {
    const mood = r.mood_user || r.mood_talk;
    bits.push(mood ? `오늘 기분 — ${mood.label}` : '오늘 기분 — 아직 안 여쭈었어요');
    bits.push(r.medications.length ? `약 — 오늘 ${r.medications.length}번 드셨어요` : '약 — 아직 기록이 없어요');
    bits.push(r.pains.length
      ? `아픈 곳 — ${r.pains[r.pains.length - 1].part}`
      : '아픈 곳 — 오늘은 말씀이 없으셨어요');
    if (r.goal) bits.push(`정하신 것 — ${r.goal.text} (이번 주 ${r.goal.achieved_this_week}일 하셨어요)`);
    bits.push(`오늘 나눈 이야기 — ${r.turns}번`);
  } else {
    bits.push('아직 오늘 기록이 없어요.');
  }

  showCare({
    say: false,
    question: `오늘 기록 (${(out && out.date_words) || '오늘'})`,
    note: bits.join('\n'),
    acts: [{ label: '닫기', primary: true, onClick: () => hideCare() }],
  });
}

/* --- 언제 띄울까 ------------------------------------------------ */

/** 초롱이가 대답한 뒤 — 아프다고 하셨으면 아픈 곳을, 목표를 정하셨으면 목표를 */
function afterCare(data) {
  if (state.memory) return;      // 사진 이야기 중에는 끼어들지 않는다
  const ask = data.careAsk;
  if (ask && ask.kind === 'pain') { askPain(ask.part || null); return; }
  if (ask && ask.kind === 'medication') { askMedication(); return; }
  if (data.goal) showGoalCard(data.goal);
}

/** 첫 화면에서 한 번 — 오늘 돌봄 상황을 받아 둔다 */
async function loadCare() {
  const out = await careApi('/api/care/today');
  if (out) state.care = out;
  return out;
}

/**
 * 인사를 마친 뒤 오늘 한 가지만 여쭙는다.
 * 약 드실 때가 지났으면 약을, 아니면 오늘 기분을. 둘 다 아니면 아무것도 하지 않는다.
 */
function openDailyCard() {
  if (!state.care || state.memory) return;
  const due = (state.care.report && state.care.report.due) || [];
  if (due.length) { askMedication({ name: due[0].name }); return; }
  if (!state.care.asked_mood) { askMood({ say: false }); return; }
  /* 인지케어 모드가 켜져 있으면 오늘 할 인지 활동을 하루 한 번만 먼저 권한다 */
  if (cogModeOn() && !cogOfferedToday()) {
    markCogOffered();
    openCognitive();
  }
}

/* ==================================================================
 *  프론트엔드 구성 가이드의 화면들
 *
 *  위기 배너 · 오늘 목표 · 약 알림 시간 · 최근 기분 변화 · 인지케어 모드.
 *  만들어 두고 어디서도 못 여는 화면이 없도록, 여는 자리까지 함께 붙인다.
 * ================================================================== */

/* --- 위기 신호 배너 (Safety Response) --------------------------- */

function showCrisis() { if (ui.crisis) ui.crisis.hidden = false; }
on(ui.crisisClose, 'click', () => { if (ui.crisis) ui.crisis.hidden = true; });

/* --- 오늘 목표 (Goal Setting) ------------------------------------
   대화 중에 목표를 말씀하실 때만 뜨던 카드를, 아무 때나 여실 수 있게 했다. */

async function openGoalCard() {
  const out = await careApi('/api/care/goal');
  const goal = out && out.goal;

  if (goal && goal.is_specific && out.achieved_today) {
    showCare({
      say: false,
      question: '오늘은 이미 하셨어요. 잘하셨어요.',
      note: goal.text,
      acts: [{ label: '닫기', primary: true, onClick: () => hideCare() }],
    });
    return;
  }
  if (goal && goal.is_specific) { showGoalCard(goal); return; }

  showCare({
    say: false,
    question: '아직 정하신 것이 없어요.',
    note: '오늘 하고 싶으신 일을 말씀해 주시면 함께 적어 둘게요.\n("아침에 동네 한 바퀴 걷기" 처럼 말씀해 주시면 돼요)',
    acts: [{ label: '닫기', primary: true, onClick: () => hideCare() }],
  });
}

on(ui.goal, 'click', openGoalCard);

/* --- 약 알림 시간 (Push Notifications) ---------------------------
   때를 적어 두시면, 드실 때가 지났는데 기록이 없을 때 초롱이가 대화 중에
   한 번만 가볍게 여쭙는다. 따로 소리를 울리지는 않는다. */

const TIME_WORDS = {
  '08:00': '아침 8시', '12:00': '점심 12시', '18:00': '저녁 6시', '21:00': '자기 전 9시',
};
const timeWords = (t) => TIME_WORDS[t] || t;
const medPicked = new Set();

function openMeds() {
  if (!ui.meds) return;
  if (ui.settings) ui.settings.hidden = true;
  ui.meds.hidden = false;
  loadMeds();
}

async function loadMeds() {
  if (!ui.medList) return;
  const out = await careApi('/api/care/medications');
  const list = (out && out.medications) || [];
  ui.medList.innerHTML = '';

  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'sheet-hint';
    empty.textContent = '아직 등록하신 약이 없어요.';
    ui.medList.appendChild(empty);
    return;
  }

  for (const med of list) {
    const row = document.createElement('div');
    row.className = 'sheet-item';
    const name = document.createElement('b');
    name.textContent = med.name;
    const when = document.createElement('span');
    when.textContent = (med.times || []).map(timeWords).join(' · ') || '드시는 때를 안 정했어요';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'sheet-del';
    del.textContent = '지우기';
    del.addEventListener('click', () => removeMed(med.med_id));
    row.append(name, when, del);
    ui.medList.appendChild(row);
  }
}

async function addMed() {
  const name = (ui.medName.value || '').trim();
  if (!name) { toast('약 이름을 적어 주세요.'); return; }

  const out = await careApi('/api/care/medications', { name, times: [...medPicked] });
  if (!out) { toast('등록하지 못했어요. 잠시 뒤 다시 해 주세요.'); return; }

  ui.medName.value = '';
  medPicked.clear();
  ui.medTimes.querySelectorAll('[data-time]')
    .forEach((b) => b.setAttribute('aria-pressed', 'false'));
  toast(`${name} 등록했어요.`);
  loadMeds();
}

async function removeMed(id) {
  try {
    await fetch('/api/care/medications/' + encodeURIComponent(id), { method: 'DELETE' });
  } catch { /* 이미 지워졌을 수 있다 */ }
  loadMeds();
}

on(ui.medsBtn, 'click', openMeds);
on(ui.medsClose, 'click', () => { if (ui.meds) ui.meds.hidden = true; });
on(ui.medAdd, 'click', addMed);
on(ui.medTimes, 'click', (e) => {
  const btn = e.target.closest('[data-time]');
  if (!btn) return;
  const time = btn.dataset.time;
  const on_ = btn.getAttribute('aria-pressed') === 'true';
  btn.setAttribute('aria-pressed', String(!on_));
  if (on_) medPicked.delete(time); else medPicked.add(time);
});

/* --- 최근 열나흘 기분 (Data Visualization) -----------------------
   보호자 화면에만 있던 것을 어르신도 보실 수 있게 했다.
   점수를 매기는 것이 아니라 어떤 날이 힘드셨는지 함께 보려는 것이다. */

async function openTrend() {
  if (!ui.trend14) return;
  if (ui.settings) ui.settings.hidden = true;
  ui.trend14.hidden = false;
  ui.trendBars.innerHTML = '';
  ui.trendSay.textContent = '불러오는 중이에요…';

  const out = await careApi('/api/care/report');
  const days = (out && out.trend) || [];

  for (const day of days) {
    const bar = document.createElement('i');
    if (typeof day.score !== 'number') {
      bar.className = 'none';
      bar.style.height = '6px';
      bar.title = `${day.date} 여쭤보지 않은 날`;
    } else {
      bar.className = day.score > 0 ? 'up' : (day.score < 0 ? 'down' : '');
      bar.style.height = `${Math.round(12 + ((day.score + 1) / 2) * 52)}px`;
      bar.title = day.date;
    }
    ui.trendBars.appendChild(bar);
  }

  const asked = days.filter((d) => typeof d.score === 'number').length;
  ui.trendSay.textContent = asked
    ? `열나흘 가운데 ${asked}날 기분을 여쭤봤어요.`
    : '아직 기분을 여쭤본 날이 없어요. 아래 [오늘 기분] 을 눌러 보세요.';
}

on(ui.trendBtn, 'click', openTrend);
on(ui.trendClose, 'click', () => { if (ui.trend14) ui.trend14.hidden = true; });

/* --- 인지케어 모드 (CareModeSelector) ----------------------------
   켜 두면 오늘 할 인지 활동을 하루 한 번 먼저 권한다.
   끄면 먼저 권하지 않는다. [인지치료] 단추는 그대로 두어 길을 막지 않는다. */

const COG_KEY = 'chorong-cogmode';
const COG_DAY = 'chorong-cogmode-day';
const todayKey = () => new Date().toISOString().slice(0, 10);

function cogModeOn() {
  try { return localStorage.getItem(COG_KEY) !== 'off'; } catch { return true; }
}
function cogOfferedToday() {
  try { return localStorage.getItem(COG_DAY) === todayKey(); } catch { return false; }
}
function markCogOffered() {
  try { localStorage.setItem(COG_DAY, todayKey()); } catch { /* 안 써도 그만이다 */ }
}

function paintCogMode() {
  if (!ui.cogMode) return;
  const on_ = cogModeOn();
  ui.cogMode.setAttribute('aria-pressed', String(on_));
  if (ui.cogModeState) ui.cogModeState.textContent = on_ ? '켜짐' : '꺼짐';
}

on(ui.cogMode, 'click', () => {
  try { localStorage.setItem(COG_KEY, cogModeOn() ? 'off' : 'on'); } catch { /* 무시 */ }
  paintCogMode();
  toast(cogModeOn()
    ? '인지케어 모드를 켰어요. 오늘 할 활동을 하루 한 번 권해 드려요.'
    : '인지케어 모드를 껐어요. 인지치료는 위 단추로 언제든 하실 수 있어요.');
});

paintCogMode();

/* ==================================================================
 *  옆 서랍 — 지난 이야기를 골라 다시 연다
 *
 *  들어오면 늘 새 대화다. 서랍을 열면 지난 대화가 최근 것부터 나오고,
 *  고르시면 그때 나눈 이야기가 화면에 그대로 다시 그려진다.
 *  회상치료와 건강관리는 서랍을 따로 쓴다 (섞이면 어느 이야기인지 알 수 없다).
 * ================================================================== */

async function threadApi(url, { method = 'GET', body = null } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;   // 서랍을 못 써도 대화는 이어져야 한다
  }
}

function showDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  if (open) loadThreads();
}

/**
 * 한 차례를 서랍에 남긴다.
 *
 * 서랍 자리는 첫마디가 오갈 때 만든다. 화면에 들어오기만 하고 이야기하지 않으신
 * 빈 대화가 목록에 쌓이면, 정작 찾으시려는 지난 이야기가 묻힌다.
 */
async function noteThread(role, content) {
  if (!content) return;
  if (!state.threadId) {
    const made = await threadApi('/api/threads', {
      method: 'POST', body: { mode: state.bot, character: state.character },
    });
    state.threadId = (made && made.thread && made.thread.thread_id) || null;
    if (!state.threadId) return;   // 서랍을 못 써도 대화는 이어진다

    /* 자리를 막 만들었으면 지금까지 오간 말을 한꺼번에 담는다 (첫인사도 이때 들어간다) */
    const soFar = state.history.map((m) => ({ role: m.role, content: m.content }));
    if (soFar.length) {
      threadApi(`/api/threads/${state.threadId}/turns`, { method: 'POST', body: { messages: soFar } });
      return;
    }
  }
  threadApi(`/api/threads/${state.threadId}/turns`, { method: 'POST', body: { role, content } });
}

/** 지금 화면을 비우고 새 대화를 연다 */
async function newThread({ greet = true } = {}) {
  /* 서랍 자리는 첫마디가 오갈 때 만든다 (noteThread). 여기서는 자리를 비우기만 한다 */
  state.threadId = null;

  stopSpeaking();
  hideCare();
  hideCog();
  hideKeep();
  if (state.memory) {
    showMemory(null);
    if (ui.memoryPhoto) ui.memoryPhoto.removeAttribute('src');
  }
  state.history = [];
  state.sessionStart = 0;
  state.waited = false;
  state.seenMemories = [];
  saveHistory();
  ui.log.innerHTML = '';
  showDrawer(false);

  if (greet) {
    const line = greetingFor(state.character);
    ui.subtitle.textContent = line;
    addMessage('bot', line);
    state.history.push({ role: 'assistant', content: line });
    state.lastReply = { text: line, emotion: 'happy', mode: 'talk' };
    saveHistory();
    /* 첫인사는 아직 서랍에 남기지 않는다. 들어오기만 하고 이야기하지 않으신 날까지
       목록에 쌓이면 지난 이야기를 찾기 어렵다. 첫마디를 주고받을 때 함께 담긴다 */
    avatar.setEmotion('happy');
    avatar.playGesture('nod');
    speak(line, 'excited', 'talk');
  }
}

/** 서랍 목록을 그린다 */
async function loadThreads() {
  if (!ui.drawerList) return;
  const out = await threadApi(`/api/threads?mode=${state.bot}`);
  const list = (out && out.threads) || [];
  ui.drawerList.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'drawer-empty';
    empty.textContent = '아직 지난 이야기가 없어요.';
    ui.drawerList.appendChild(empty);
    return;
  }

  for (const t of list) {
    const row = document.createElement('div');
    row.className = 'drawer-row';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'drawer-item' + (t.thread_id === state.threadId ? ' on' : '');
    const name = document.createElement('span');
    name.textContent = t.title || '새 대화';
    const when = document.createElement('span');
    when.className = 'drawer-when';
    when.textContent = whenWords(t.updated_at);
    open.append(name, when);
    open.addEventListener('click', () => openThread(t.thread_id));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'drawer-del';
    del.textContent = '지우기';
    del.setAttribute('aria-label', `${t.title || '대화'} 지우기`);
    del.addEventListener('click', () => removeThread(t.thread_id));

    row.append(open, del);
    ui.drawerList.appendChild(row);
  }
}

/** 언제 나눈 이야기인지 짧게 */
function whenWords(at) {
  const t = Date.parse(at);
  if (!t) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  const d = new Date(t);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 지난 대화를 화면에 그대로 다시 그린다 */
async function openThread(id) {
  const out = await threadApi(`/api/threads/${id}`);
  const thread = out && out.thread;
  if (!thread) { toast('그 대화를 불러오지 못했어요.'); return; }

  stopSpeaking();
  hideCare();
  hideCog();
  hideKeep();
  if (state.memory) {
    showMemory(null);
    if (ui.memoryPhoto) ui.memoryPhoto.removeAttribute('src');
  }

  state.threadId = thread.thread_id;
  state.history = (thread.messages || []).map((m) => ({ role: m.role, content: m.content }));
  state.sessionStart = 0;
  state.seenMemories = [];
  saveHistory();

  ui.log.innerHTML = '';
  for (const m of state.history) addMessage(m.role === 'user' ? 'me' : 'bot', m.content);
  addMessage('sys', '지난 이야기를 이어서 나눌 수 있어요');

  const last = [...state.history].reverse().find((m) => m.role === 'assistant');
  if (last) {
    ui.subtitle.textContent = last.content;
    state.lastReply = { text: last.content, emotion: 'happy', mode: 'talk' };
  }
  if (thread.character && CHARACTERS[thread.character]) applyCharacter(thread.character);
  showDrawer(false);
}

async function removeThread(id) {
  await threadApi(`/api/threads/${id}`, { method: 'DELETE' });
  if (id === state.threadId) await newThread({ greet: false });
  loadThreads();
}

/* ==================================================================
 *  인지치료 — 오늘의 활동 한 가지
 *
 *  두 챗봇 어디서나 [인지치료] 를 누르면 열린다. 회상 · 숫자 · 날짜 · 사진
 *  네 가지 가운데 오늘 아직 안 하신 것을 하나만 드린다. 다 하셨으면 더 시키지 않는다.
 * ================================================================== */

function hideCog() { if (ui.cog) ui.cog.hidden = true; }

async function openCognitive() {
  if (!ui.cog) return;
  hideCare();
  const out = await careApi('/api/care/activity');
  const activity = out && out.activity;

  ui.cogActs.innerHTML = '';
  const add = (label, primary, fn) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'care-btn' + (primary ? ' care-primary' : '');
    btn.textContent = label;
    btn.addEventListener('click', fn);
    ui.cogActs.appendChild(btn);
  };

  if (!activity) {
    ui.cogSay.textContent = '오늘 함께 할 활동은 다 하셨어요. 정말 잘하셨어요.';
    add('대화로 돌아가기', true, hideCog);
    ui.cog.hidden = false;
    return;
  }

  ui.cogSay.textContent = activity.say;
  if (activity.kind === 'photo') {
    /* 사진 활동은 회상치료 화면이 훨씬 잘한다. 그리로 모신다 */
    add('사진 보러 가기', true, () => {
      careApi('/api/care/activity', { kind: 'photo', answered: true });
      if (BOT === 'recall') { hideCog(); startRecall(); }
      else window.location.href = '/recall.html';
    });
  } else {
    add('했어요', true, () => finishActivity(activity, true));
    add('잘 모르겠어요', false, () => finishActivity(activity, false));
  }
  add('다른 활동', false, () => openCognitive());

  ui.cog.hidden = false;
  stopSpeaking();
  speak(activity.say, 'happy', 'talk');
}

/* ==================================================================
 *  말동무 고르기
 * ================================================================== */

let pickerAvatars = [];   // 카드 안에서 살아 움직이는 작은 아바타들
let pickerHop = 0;
let pending = DEFAULT_CHARACTER;   // 고르는 중인 캐릭터 (아직 확정 전)

/** 고른 캐릭터를 화면 곳곳에 반영한다 */
function applyCharacter(id) {
  state.character = CHARACTERS[id] ? id : DEFAULT_CHARACTER;
  localStorage.setItem('chorong-character', state.character);

  const def = CHARACTERS[state.character];
  avatar.setCharacter(state.character);
  /* 머리말의 이름은 서비스 이름(초롱이)이라 그대로 두고,
     말동무 이름은 카드와 머리글에 보여 드린다 (온봄 화면의 짜임) */
  if (ui.companionName) ui.companionName.textContent = def.name;
  if (ui.heroTitle) {
    ui.heroTitle.textContent = BOT === 'recall'
      ? `${withAnd(def.name)} 사진 이야기`
      : `${withAnd(def.name)} 이야기 나누기`;
  }
  document.title = def.name + ' - 말동무 친구';
}

/** 카드 3장을 만들고 각각 안에 작은 아바타를 띄운다 */
function buildPicker() {
  ui.picker.innerHTML = '';
  destroyPickerAvatars();

  for (const id of CHARACTER_LIST) {
    const def = CHARACTERS[id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pick';
    card.setAttribute('role', 'radio');
    card.dataset.char = id;
    card.innerHTML =
      '<span class="pick-art"></span>' +
      '<span class="pick-text">' +
        '<span class="pick-name"></span>' +
      '</span>';
    card.querySelector('.pick-name').textContent = def.name;
    ui.picker.appendChild(card);

    const mini = new Avatar(card.querySelector('.pick-art'), id);
    mini.setEmotion('happy');
    pickerAvatars.push(mini);

    card.addEventListener('click', () => selectPending(id));
  }

  // 고른 친구가 이따금 인사하듯 고개를 끄덕인다 (통통 튀면 떨리는 것처럼 보여 끄덕이기만)
  pickerHop = setInterval(() => {
    const i = CHARACTER_LIST.indexOf(pending);
    pickerAvatars[i]?.playGesture('nod');
  }, 4000);

  selectPending(pending);
}

function selectPending(id) {
  pending = id;
  for (const card of ui.picker.querySelectorAll('.pick')) {
    const on = card.dataset.char === id;
    card.setAttribute('aria-checked', String(on));
    const i = CHARACTER_LIST.indexOf(card.dataset.char);
    pickerAvatars[i]?.setEmotion(on ? 'happy' : 'neutral');
  }
}

function destroyPickerAvatars() {
  clearInterval(pickerHop);
  pickerAvatars.forEach((a) => a.destroy());
  pickerAvatars = [];
}

/** 대화 중에 다시 고르고 싶을 때 */
function openChooser() {
  stopSpeaking();
  if (ui.settings) ui.settings.hidden = true;   // 설정 창을 닫고 고르는 화면을 연다
  pending = state.character;
  ui.splash.hidden = false;
  ui.splash.classList.remove('hide');
  ui.cancel.hidden = false;
  ui.startLabel.textContent = '이 친구로 바꾸기';
  buildPicker();
}

function closeChooser() {
  ui.splash.classList.add('hide');
  setTimeout(() => {
    ui.splash.hidden = true;
    destroyPickerAvatars();
  }, 480);
}

/* ==================================================================
 *  시작
 * ================================================================== */

/** 키가 없으면 화면 위쪽에 크게 알려 준다 (원인 모른 채 헤매지 않도록) */
async function checkApiKey() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.hasKey) return;
  } catch {
    return; // 서버가 답이 없으면 굳이 겁주지 않는다
  }

  const bar = document.createElement('div');
  bar.className = 'keybar';
  bar.innerHTML =
    '<b>아직 API 키가 없어요.</b> 프로젝트 폴더에서 <code>notepad .env</code> 를 실행한 뒤, ' +
    '<code>OPENAI_API_KEY=</code> 뒤에 키를 붙여 넣고 저장하고, 서버를 껐다 켜 주세요.';
  document.body.prepend(bar);
  document.body.classList.add('has-keybar');
}

function init() {
  const savedChar = localStorage.getItem('chorong-character');
  if (CHARACTERS[savedChar]) state.character = savedChar;
  pending = state.character;

  avatar = new Avatar(ui.avatar, state.character);
  avatar.setEmotion('happy');
  applyCharacter(state.character);

  const savedFont = Number(localStorage.getItem('chorong-font'));
  if (savedFont >= 1 && savedFont <= 3) state.fontLevel = savedFont;
  applyFont();

  // 음성 합성 목록을 미리 불러 둔다 (대체 음성이 필요할 때를 대비)
  window.speechSynthesis?.getVoices();

  bindControls();
  checkApiKey();
  /* 오늘 돌봄은 건강관리 화면에서만 쓴다 (회상 화면은 사진 이야기에 집중한다) */
  if (BOT === 'health') loadCare();
  buildPicker();

  on(ui.swap, 'click', openChooser);
  on(ui.swapTop, 'click', openChooser);
  on(ui.cancel, 'click', closeChooser);

  /* 말동무 고르는 화면은 [친구 바꾸기] 를 누르실 때만 열린다.
     처음 들어오실 때는 고르시게 하지 않는다 — 바로 이야기를 시작한다. */
  on(ui.start, 'click', async () => {
    const switched = pending !== state.character;
    applyCharacter(pending);
    closeChooser();
    ensureAudio();
    if (!switched) return;                   // 같은 친구면 인사를 다시 하지 않는다

    const text = `안녕하세요. 이제부터 제가 말동무가 되어 드릴게요. 저는 ${CHARACTERS[state.character].name}입니다.`;
    ui.subtitle.textContent = text;
    addMessage('bot', text);
    state.history.push({ role: 'assistant', content: text });
    state.lastReply = { text, emotion: 'excited', mode: 'talk' };
    saveHistory();
    noteThread('assistant', text);

    /* 만세 · 신남 표정은 몸이 들썩여 떨리는 것처럼 보인다. 웃으며 끄덕이기만 한다 */
    avatar.setEmotion('happy');
    avatar.playGesture('nod');
    await speak(text, 'excited');
  });

  /* 들어오면 늘 새 대화다 (옆 서랍에서 고르시면 그때 이야기가 이어진다).
     인사를 마친 뒤, 건강관리 화면에서는 오늘 한 가지만 여쭙는다. */
  newThread().then(() => { if (BOT === 'health') openDailyCard(); });
}

init();
