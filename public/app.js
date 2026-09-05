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
  brandMark: document.querySelector('.brand-mark'),
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

async function sendMessage(text) {
  const message = String(text || '').trim();
  if (!message || state.busy) return;

  stopSpeaking();
  ui.input.value = '';
  addMessage('me', message);
  state.history.push({ role: 'user', content: message });

  state.busy = true;
  ui.send.disabled = true;
  setStatus('thinking', `${subject(charName())} 생각하고 있어요`);
  avatar.setEmotion('thinking');
  const typing = showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.history, character: state.character }),
    });

    typing.remove();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '대답을 받지 못했어요.');
    }

    const data = await res.json();
    state.history.push({ role: 'assistant', content: data.reply });
    saveHistory();
    state.lastReply = { text: data.reply, emotion: data.emotion, mode: data.mode };

    addMessage('bot', data.reply);
    ui.subtitle.textContent = data.reply;

    avatar.setEmotion(data.emotion);
    avatar.playGesture(data.gesture);

    await speak(data.reply, data.emotion, data.mode);
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
    state.history = [];
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
        '<span class="pick-desc"></span>' +
      '</span>';
    card.querySelector('.pick-name').textContent = def.name;
    card.querySelector('.pick-desc').textContent = def.tagline;
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
