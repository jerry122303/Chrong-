/* =====================================================================
 *  초롱이 - 앱 로직
 *  대화(GPT-4o) → 감정 분석 결과로 표정/몸짓 → 목소리 재생과 동시에 립싱크
 * ===================================================================== */

import { Avatar, CHARACTERS, CHARACTER_LIST, DEFAULT_CHARACTER } from './avatar.js';

const $ = (id) => document.getElementById(id);

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
  stage: document.querySelector('.stage'),
  photo: $('btn-photo'), photoState: $('photo-state'),
  memory: $('memory'), memoryPhoto: $('memory-photo'), memoryTitle: $('memory-title'),
  nextPhoto: $('btn-next-photo'), closePhoto: $('btn-close-photo'),
  keep: $('keep'), keepList: $('keep-list'),
  keepYes: $('btn-keep-yes'), keepNo: $('btn-keep-no'),
  brandMark: document.querySelector('.brand-mark'),
  attach: $('btn-attach'), filePhoto: $('file-photo'),
  composer: document.querySelector('.composer'),
};

const greetingFor = (id) =>
  `안녕하세요, 어르신! 저는 ${(CHARACTERS[id] || CHARACTERS[DEFAULT_CHARACTER]).name}입니다. 오늘 하루는 어떻게 보내셨어요?`;

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
};

/** 지금 고른 말동무의 이름 */
const charName = () => (CHARACTERS[state.character] || CHARACTERS[DEFAULT_CHARACTER]).name;

/**
 * 이름 뒤에 붙는 주격 조사를 받침에 맞춰 고른다.
 * 준호(받침 없음) → "준호가", 서연(받침 있음) → "서연이", 초롱이 → "초롱이가"
 */
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
  state.history.push({ role: 'assistant', content: data.reply });
  saveHistory();
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
  state.lastReply = { text: data.reply, emotion: data.emotion, mode: data.mode };

  addMessage('bot', data.reply);
  ui.subtitle.textContent = data.reply;

  avatar.setEmotion(data.emotion);
  avatar.playGesture(data.gesture);

  await speak(data.reply, data.emotion, data.mode);
}

async function sendMessage(text) {
  const message = String(text || '').trim();
  if (!message || state.busy) return;

  stopSpeaking();
  clearTimeout(waitTimer);
  state.waited = false;
  if (!state.sessionStart) state.sessionStart = Date.now();
  ui.input.value = '';
  addMessage('me', message);
  state.history.push({ role: 'user', content: message });
  noteTurn({ role: 'user', text: message });

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
  if (!closingAfterSpeech) return;
  closingAfterSpeech = false;
  wrapUpMemoryTalk();          // 이미 여쭈었으므로 인사를 덧붙이지 않는다
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

  ui.clear.addEventListener('click', () => {
    stopSpeaking();
    hideKeep();
    closeSession('USER');
    showMemory(null);
    ui.memoryPhoto.removeAttribute('src');
    state.history = [];
    state.sessionStart = 0;
    state.waited = false;
    state.seenMemories = [];
    localStorage.removeItem('chorong-history');
    ui.log.innerHTML = '';
    ui.subtitle.textContent = greetingFor(state.character);
    addMessage('sys', '새로 이야기를 시작해요');
    avatar.setEmotion('happy');
    avatar.playGesture('flap');
    toast('대화를 지웠어요');
  });

  ui.send.addEventListener('click', () => sendMessage(ui.input.value));
  ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage(ui.input.value);
  });

  ui.mic.addEventListener('click', toggleMic);

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

function showMemory(memory) {
  state.memory = memory;
  if (memory && !state.seenMemories.includes(memory.memory_id)) {
    state.seenMemories.push(memory.memory_id);
  }

  const on = Boolean(memory);
  ui.memory.hidden = !on;
  ui.stage.classList.toggle('with-memory', on);
  ui.photo.setAttribute('aria-pressed', String(on));
  ui.photoState.textContent = on ? '켜짐' : '꺼짐';
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
  state.sessionId = null;
  try {
    await fetch(`/api/sessions/${id}/close`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ended_by: endedBy || 'USER' }),
    });
  } catch { /* 무시 */ }
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
  ui.keep.hidden = true;
  ui.keepList.innerHTML = '';
  state.pending = [];
  state.pendingMemoryId = null;
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

ui.keepYes.addEventListener('click', () => decideKeep(true));
ui.keepNo.addEventListener('click', () => decideKeep(false));

/**
 * 이야기를 여는 말.
 *
 * 주제는 사진이 없으므로 '이 사진을 보면' 하고 말하면 안 된다. 있지도 않은
 * 사진을 찾으시게 된다. 주제에는 그 주제에 맞는 물음이 미리 붙어 있다.
 * 물음표는 하나만 쓴다. 둘을 이어 붙이면 무엇에 답해야 할지 헷갈리신다.
 */
function openingLineFor(memory, again = false) {
  if (memory.kind === 'THEME') {
    const q = memory.open_prompt || '어떤 기억이 떠오르세요?';
    return again ? `이번에는 ${memory.title} 이야기를 해 볼까 해요. ${q}` : q;
  }
  const what = memory.title ? `${memory.title} 사진` : '이 사진';
  return again
    ? `이번에는 ${what}을 볼게요. 어떤 기억이 떠오르세요?`
    : `${what}을 함께 볼게요. 어떤 일이 가장 먼저 떠오르세요?`;
}

/** 다음에 볼 사진을 서버에서 받아 온다 (선택 순서는 서버가 정한다) */
async function pickMemory() {
  const params = new URLSearchParams();
  if (state.seenMemories.length) params.set('exclude', state.seenMemories.join(','));
  const r = await fetch('/api/memories/next?' + params.toString());
  if (!r.ok) return null;
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
 *  사진 올려서 바로 이야기하기
 *
 *  보호자 화면에 미리 등록해 두지 않아도, 대화 중에 사진 한 장을 올리면
 *  그 자리에서 초롱이 옆에 뜨고 그 사진 이야기가 시작된다.
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

/** 사진을 보고 이야기의 문을 여는 말을 받아 온다 */
async function askAboutPhoto() {
  const typing = showTyping();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.history,
        character: state.character,
        sessionSeconds: Math.round((Date.now() - state.sessionStart) / 1000),
        memory_id: state.memory ? state.memory.memory_id : null,
        session_id: state.sessionId,
        // 사진을 방금 올리신 차례임을 알린다 (서버가 사진을 모델에게 보여 준다)
        photo_opening: true,
      }),
    });
    typing.remove();
    if (!res.ok) throw new Error('opening');
    await applyReply(await res.json());
  } catch {
    typing.remove();
    /* 대답을 못 받아도 사진은 이미 떠 있다. 아무 말 없이 두면 어르신이
       무슨 말을 하셔야 할지 모르시므로, 준비된 말로 문을 연다. */
    const line = state.memory ? openingLineFor(state.memory) : '사진을 함께 볼게요.';
    state.history.push({ role: 'assistant', content: line });
    saveHistory();
    state.lastReply = { text: line, emotion: 'happy', mode: 'talk' };
    addMessage('bot', line);
    ui.subtitle.textContent = line;
    avatar.setEmotion('happy');
    avatar.playGesture('nod');
    await speak(line, 'happy', 'talk');
  }
}

/** 고르신 사진 한 장을 올리고, 그 사진 이야기를 시작한다 */
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

  try {
    const small = await shrinkPhoto(file);
    const fd = new FormData();
    fd.append('photo', small, 'photo.jpg');

    const r = await fetch('/api/memories/upload', { method: 'POST', body: fd });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.memory) throw new Error(out.message || '사진을 올리지 못했어요.');

    // 보던 사진이 있으면 오늘 들은 이야기를 먼저 여쭙고 그 회기를 닫는다
    if (state.memory) {
      await askToKeep(state.memory.memory_id, state.sessionId);
      await closeSession('USER');
    }

    // 이제부터는 서버가 가진 사진을 본다 (임시 주소를 곧 버리기 때문)
    bubble.querySelector('.msg-photo').src =
      '/api/memories/' + out.memory.memory_id + '/photo';

    if (!state.sessionStart) state.sessionStart = Date.now();
    showMemory(out.memory);
    await startSession(out.memory.memory_id);
    scheduleAutoClose();

    /* 사진을 보여 드렸다는 사실을 대화 기록에도 남긴다.
       이 자리에 사진이 붙어 모델에게 전해진다. */
    const shown = '(사진을 한 장 보여 드렸어요)';
    state.history.push({ role: 'user', content: shown });
    saveHistory();
    noteTurn({ role: 'user', text: shown });

    setStatus('thinking', `${subject(charName())} 사진을 보고 있어요`);
    await askAboutPhoto();
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
}

ui.attach.addEventListener('click', () => ui.filePhoto.click());
ui.filePhoto.addEventListener('change', (e) => attachPhoto(e.target.files[0]));

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

/**
 * 사진 이야기를 시작한다.
 * 문서 4번대로 처음 한 번만 개방형 질문을 던지고, 그 뒤로는 평소 규칙을 따른다.
 */
async function startMemoryTalk() {
  ensureAudio();
  let memory;
  try {
    memory = await pickMemory();
  } catch {
    toast('사진을 불러오지 못했어요.');
    return;
  }

  if (!memory) {
    toast('아직 등록된 사진이 없어요.');
    return;
  }

  hideKeep();
  showMemory(memory);
  if (!state.sessionStart) state.sessionStart = Date.now();
  await startSession(memory.memory_id);

  const opening = openingLineFor(memory);

  ui.subtitle.textContent = opening;
  addMessage('bot', opening);
  state.history.push({ role: 'assistant', content: opening });
  state.lastReply = { text: opening, emotion: 'happy', mode: 'talk' };
  saveHistory();

  avatar.setEmotion('happy');
  avatar.playGesture('nod');
  speak(opening, 'happy', 'talk');
  scheduleAutoClose();
}

async function stopMemoryTalk() {
  clearTimeout(closeTimer);
  if (wrappingUp) return;
  wrappingUp = true;
  try {
    const memoryId = state.memory ? state.memory.memory_id : null;
    const asked = await askToKeep(memoryId, state.sessionId);
    await closeSession('USER');
    if (!asked) hideKeep();
    showMemory(null);
    ui.memoryPhoto.removeAttribute('src');
  } finally {
    wrappingUp = false;
  }
}

ui.photo.addEventListener('click', () => {
  if (state.memory) stopMemoryTalk();
  else startMemoryTalk();
});

ui.closePhoto.addEventListener('click', stopMemoryTalk);

ui.nextPhoto.addEventListener('click', async () => {
  const memory = await pickMemory();
  if (!memory) { toast('더 볼 사진이 없어요.'); return; }

  // 지금 사진에서 들은 이야기를 먼저 여쭙고 넘어간다
  await askToKeep(state.memory ? state.memory.memory_id : null, state.sessionId);
  await closeSession('USER');
  await startSession(memory.memory_id);
  showMemory(memory);
  scheduleAutoClose();

  const line = openingLineFor(memory, true);
  ui.subtitle.textContent = line;
  addMessage('bot', line);
  state.history.push({ role: 'assistant', content: line });
  state.lastReply = { text: line, emotion: 'happy', mode: 'talk' };
  saveHistory();
  speak(line, 'happy', 'talk');
});

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
  if (ui.brandName) ui.brandName.textContent = def.name;
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

  // 고른 친구가 이따금 인사하듯 움직인다
  pickerHop = setInterval(() => {
    const i = CHARACTER_LIST.indexOf(pending);
    pickerAvatars[i]?.playGesture('bounce');
  }, 2600);

  selectPending(pending);
}

function selectPending(id) {
  pending = id;
  for (const card of ui.picker.querySelectorAll('.pick')) {
    const on = card.dataset.char === id;
    card.setAttribute('aria-checked', String(on));
    const i = CHARACTER_LIST.indexOf(card.dataset.char);
    pickerAvatars[i]?.setEmotion(on ? 'excited' : 'neutral');
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
  loadHistory();
  checkApiKey();
  buildPicker();

  ui.swap.addEventListener('click', openChooser);
  ui.cancel.addEventListener('click', closeChooser);

  ui.start.addEventListener('click', async () => {
    const changing = !ui.cancel.hidden;      // 대화 중에 친구를 바꾸는 경우
    const switched = pending !== state.character;

    applyCharacter(pending);
    closeChooser();
    ensureAudio();

    if (changing && !switched) return;       // 같은 친구면 인사를 다시 하지 않는다

    const def = CHARACTERS[state.character];
    const text = changing
      ? `안녕하세요, 어르신! 이제부터 제가 말동무가 되어 드릴게요. 저는 ${def.name}입니다.`
      : (state.history.length === 0
          ? greetingFor(state.character)
          : '어르신, 다시 뵈어서 정말 반가워요! 그동안 잘 지내셨어요?');

    ui.subtitle.textContent = text;
    addMessage('bot', text);
    state.history.push({ role: 'assistant', content: text });
    state.lastReply = { text, emotion: 'excited', mode: 'talk' };
    saveHistory();

    avatar.setEmotion('excited');
    avatar.playGesture('cheer');
    await speak(text, 'excited');
  });
}

init();
