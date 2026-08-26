/* =====================================================================
 *  초롱이 아바타 엔진
 *  - 부위별로 나뉜 SVG를 매 프레임 직접 변형해 표정 / 입모양 / 몸짓을 만든다.
 *  - setEmotion(감정)   : 표정 + 자세를 부드럽게 전환
 *  - playGesture(몸짓)  : 끄덕임, 날개짓 같은 일회성 동작
 *  - setMouth(0~1)      : 실제 목소리 크기에 맞춰 부리를 여닫음 (립싱크)
 * ===================================================================== */

const C = {
  body: '#5BC236',
  bodyLight: '#7BD956',
  bodyEdge: '#35871A',
  belly: '#8ADE63',
  wing: '#42A121',
  wingTip: '#2E86DE',

  eyeWhite: '#FFFFFF',
  pupil: '#2F3A33',
  brow: '#38901B',

  beakTop: '#FFC93C',
  beakLow: '#FF9A2E',
  beakEdge: '#E5891A',
  mouth: '#8E2540',
  tongue: '#F0788C',

  crestA: '#FF5C5C',
  crestB: '#FFC93C',
  crestC: '#FF8A3D',

  cheek: '#FF9DB5',
  tear: '#5AB9F5',
  foot: '#FFA22B',
  footEdge: '#E5891A',
};

const SVG = `
<svg id="ch-svg" viewBox="0 -34 400 476" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="초롱이 앵무새 캐릭터">
  <defs>
    <radialGradient id="ch-grad" cx="36%" cy="26%" r="86%">
      <stop offset="0%" stop-color="${C.bodyLight}"/>
      <stop offset="100%" stop-color="${C.body}"/>
    </radialGradient>
    <linearGradient id="ch-lid-grad" x1="0" y1="46" x2="0" y2="382" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#76D652"/>
      <stop offset="100%" stop-color="#5BC236"/>
    </linearGradient>
    <clipPath id="ch-clip-eye-l"><ellipse cx="148" cy="170" rx="54" ry="60"/></clipPath>
    <clipPath id="ch-clip-eye-r"><ellipse cx="252" cy="170" rx="54" ry="60"/></clipPath>
  </defs>

  <g id="ch-root">

    <!-- ================= 발 ================= -->
    <g id="ch-feet">
      <path d="M140 372 C 130 396, 138 414, 160 414 L 188 414 C 206 414, 208 396, 200 372 Z"
            fill="${C.foot}"/>
      <path d="M162 396 L162 413 M182 396 L182 413" stroke="${C.footEdge}"
            stroke-width="4" stroke-linecap="round"/>
      <path d="M200 372 C 192 396, 194 414, 212 414 L 240 414 C 262 414, 270 396, 260 372 Z"
            fill="${C.foot}"/>
      <path d="M218 396 L218 413 M238 396 L238 413" stroke="${C.footEdge}"
            stroke-width="4" stroke-linecap="round"/>
    </g>

    <!-- ================= 몸 + 머리 (한 덩어리) ================= -->
    <g id="ch-char">

      <!-- 날개 -->
      <g id="ch-wing-l">
        <path d="M92 206 C 44 222, 30 282, 38 324 C 45 356, 80 364, 94 344 Z"
              fill="${C.wing}"/>
        <path d="M40 302 C 37 328, 50 352, 72 357 C 83 344, 79 318, 68 302 Z"
              fill="${C.wingTip}"/>
      </g>
      <g id="ch-wing-r">
        <path d="M308 206 C 356 222, 370 282, 362 324 C 355 356, 320 364, 306 344 Z"
              fill="${C.wing}"/>
        <path d="M360 302 C 363 328, 350 352, 328 357 C 317 344, 321 318, 332 302 Z"
              fill="${C.wingTip}"/>
      </g>

      <!-- 몸통 -->
      <path id="ch-body"
            d="M66 202 C 66 96, 126 46, 200 46 C 274 46, 334 96, 334 202
               L334 314 C 334 360, 306 382, 262 382 L138 382
               C 94 382, 66 360, 66 314 Z"
            fill="url(#ch-grad)" stroke="${C.bodyEdge}" stroke-width="5"/>
      <ellipse cx="200" cy="296" rx="76" ry="60" fill="${C.belly}"/>

      <!-- ================= 얼굴 ================= -->
      <g id="ch-head">

        <!-- 볏 -->
        <g id="ch-crest">
          <path d="M164 74 C 140 36, 136 6, 148 -18 C 172 6, 184 44, 188 70 Z"
                fill="${C.crestA}"/>
          <path d="M196 62 C 186 20, 194 -8, 212 -28 C 228 -2, 220 36, 214 62 Z"
                fill="${C.crestB}"/>
          <path d="M220 70 C 246 38, 268 18, 288 8 C 282 44, 258 70, 238 84 Z"
                fill="${C.crestC}"/>
        </g>

        <!-- 눈 주변 흰 무늬 (두 개가 가운데서 맞닿는다) -->
        <ellipse cx="148" cy="170" rx="54" ry="60" fill="${C.eyeWhite}"/>
        <ellipse cx="252" cy="170" rx="54" ry="60" fill="${C.eyeWhite}"/>

        <!-- 눈썹 -->
        <g id="ch-brow-l">
          <path d="M112 98 Q 148 78 184 94" fill="none" stroke="${C.brow}"
                stroke-width="11" stroke-linecap="round"/>
        </g>
        <g id="ch-brow-r">
          <path d="M216 94 Q 252 78 288 98" fill="none" stroke="${C.brow}"
                stroke-width="11" stroke-linecap="round"/>
        </g>

        <!-- 왼쪽 눈 -->
        <g id="ch-eye-l">
          <g clip-path="url(#ch-clip-eye-l)">
            <g id="ch-pupil-l">
              <ellipse cx="148" cy="176" rx="21" ry="27" fill="${C.pupil}"/>
              <circle cx="157" cy="164" r="8" fill="#FFFFFF"/>
              <circle cx="139" cy="188" r="4.5" fill="#FFFFFF" opacity="0.85"/>
            </g>
            <path id="ch-heart-l"
                  d="M148 160 C 160 144, 180 154, 168 172 L148 196 L128 172 C 116 154, 136 144, 148 160 Z"
                  fill="#FF5C7A" opacity="0"/>
            <path id="ch-lid-l" d="M88 -46 H208 V94 Q148 120 88 94 Z" fill="url(#ch-lid-grad)"
                  stroke="${C.bodyEdge}" stroke-width="3.5" stroke-linejoin="round"/>
          </g>
        </g>

        <!-- 오른쪽 눈 -->
        <g id="ch-eye-r">
          <g clip-path="url(#ch-clip-eye-r)">
            <g id="ch-pupil-r">
              <ellipse cx="252" cy="176" rx="21" ry="27" fill="${C.pupil}"/>
              <circle cx="261" cy="164" r="8" fill="#FFFFFF"/>
              <circle cx="243" cy="188" r="4.5" fill="#FFFFFF" opacity="0.85"/>
            </g>
            <path id="ch-heart-r"
                  d="M252 160 C 264 144, 284 154, 272 172 L252 196 L232 172 C 220 154, 240 144, 252 160 Z"
                  fill="#FF5C7A" opacity="0"/>
            <path id="ch-lid-r" d="M192 -46 H312 V94 Q252 120 192 94 Z" fill="url(#ch-lid-grad)"
                  stroke="${C.bodyEdge}" stroke-width="3.5" stroke-linejoin="round"/>
          </g>
        </g>

        <!-- 웃는 눈 (^^) -->
        <path id="ch-smile-l" d="M112 188 Q 148 146 184 188" fill="none" stroke="${C.pupil}"
              stroke-width="13" stroke-linecap="round" opacity="0"/>
        <path id="ch-smile-r" d="M216 188 Q 252 146 288 188" fill="none" stroke="${C.pupil}"
              stroke-width="13" stroke-linecap="round" opacity="0"/>

        <!-- 볼 -->
        <ellipse id="ch-cheek-l" cx="102" cy="232" rx="25" ry="13" fill="${C.cheek}" opacity="0"/>
        <ellipse id="ch-cheek-r" cx="298" cy="232" rx="25" ry="13" fill="${C.cheek}" opacity="0"/>

        <!-- 눈물 -->
        <g id="ch-tears" opacity="0">
          <path d="M116 234 C 107 250, 105 264, 116 268 C 127 264, 125 250, 116 234 Z"
                fill="${C.tear}"/>
          <path d="M284 234 C 275 250, 273 264, 284 268 C 295 264, 293 250, 284 234 Z"
                fill="${C.tear}"/>
        </g>

        <!-- 부리 -->
        <g id="ch-beak">
          <!-- 입 안쪽: 부리를 벌리면 드러난다 -->
          <g id="ch-mouth-open">
            <path d="M172 198 Q 200 190 228 198 L228 230 Q 200 272 172 230 Z" fill="${C.mouth}"/>
            <ellipse id="ch-tongue" cx="200" cy="240" rx="18" ry="10" fill="${C.tongue}"/>
          </g>

          <!-- 아래 부리: 평소엔 윗부리 뒤에 숨었다가 말할 때 내려온다 -->
          <g id="ch-beak-lower">
            <path d="M176 206 Q 200 222 224 206 Q 227 232 200 241 Q 173 232 176 206 Z"
                  fill="${C.beakLow}" stroke="${C.beakEdge}" stroke-width="3"
                  stroke-linejoin="round"/>
          </g>

          <!-- 윗부리: 앵무새다운 갈고리 -->
          <path id="ch-beak-upper"
                d="M168 188 Q 200 175 232 188 Q 236 214 217 231 Q 206 242 200 244
                   Q 194 242 183 231 Q 164 214 168 188 Z"
                fill="${C.beakTop}" stroke="${C.beakEdge}" stroke-width="3"
                stroke-linejoin="round"/>
          <circle cx="188" cy="192" r="3.4" fill="${C.beakEdge}"/>
          <circle cx="212" cy="192" r="3.4" fill="${C.beakEdge}"/>
        </g>
      </g>
    </g>

    <!-- 감정 효과 (하트, 반짝임 등) -->
    <g id="ch-fx"></g>
  </g>
</svg>`;

const EMOTIONS = {
  neutral:   { brow: 0,   browAngle: 0,   lid: 0.04, pupilY: 0,  cheek: 0,     smile: 0,    crest: 0,   tilt: 0,   headY: 0,  eyeScale: 1,    tear: 0, heart: 0, breath: 1,   fx: null },
  happy:     { brow: -6,  browAngle: -6,  lid: 0,    pupilY: 0,  cheek: 1,    smile: 0.92, crest: -8,  tilt: -3,  headY: -2, eyeScale: 1,    tear: 0, heart: 0, breath: 1.2, fx: 'sparkle' },
  excited:   { brow: -12, browAngle: -9,  lid: 0,    pupilY: -2, cheek: 1,    smile: 1,    crest: -18, tilt: 0,   headY: -5, eyeScale: 1,    tear: 0, heart: 0, breath: 1.9, fx: 'sparkle' },
  sad:       { brow: 10,  browAngle: 17,  lid: 0.34, pupilY: 6,  cheek: 0,    smile: 0,    crest: 24,  tilt: 5,   headY: 9,  eyeScale: 1,    tear: 1, heart: 0, breath: 0.6, fx: 'drop' },
  worried:   { brow: 7,   browAngle: 13,  lid: 0.17, pupilY: 3,  cheek: 0,    smile: 0,    crest: 14,  tilt: -6,  headY: 4,  eyeScale: 1,    tear: 0, heart: 0, breath: 0.8, fx: 'sweat' },
  surprised: { brow: -17, browAngle: 0,   lid: -0.1, pupilY: 0,  cheek: 0,    smile: 0,    crest: -22, tilt: 0,   headY: -6, eyeScale: 1.13, tear: 0, heart: 0, breath: 1,   fx: 'spark2' },
  love:      { brow: -6,  browAngle: -4,  lid: 0,    pupilY: 0,  cheek: 1,    smile: 0,    crest: -6,  tilt: -6,  headY: -2, eyeScale: 1.05, tear: 0, heart: 1, breath: 1.2, fx: 'heart' },
  thinking:  { brow: -3,  browAngle: 8,   lid: 0.15,  pupilY: -9, cheek: 0,    smile: 0,    crest: 8,   tilt: -12, headY: 0,  eyeScale: 1,    tear: 0, heart: 0, breath: 0.7, fx: 'think' },
  proud:     { brow: -8,  browAngle: -10, lid: 0,    pupilY: 2,  cheek: 0.8,  smile: 0.88, crest: -12, tilt: 0,   headY: -7, eyeScale: 1,    tear: 0, heart: 0, breath: 1.1, fx: 'sparkle' },
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class ChorongAvatar {
  constructor(mount) {
    mount.innerHTML = SVG;
    this.svg = mount.querySelector('#ch-svg');
    const $ = (id) => this.svg.querySelector('#' + id);
    this.el = {
      root: $('ch-root'), char: $('ch-char'), head: $('ch-head'), crest: $('ch-crest'),
      wingL: $('ch-wing-l'), wingR: $('ch-wing-r'), feet: $('ch-feet'),
      browL: $('ch-brow-l'), browR: $('ch-brow-r'),
      eyeL: $('ch-eye-l'), eyeR: $('ch-eye-r'),
      pupilL: $('ch-pupil-l'), pupilR: $('ch-pupil-r'),
      lidL: $('ch-lid-l'), lidR: $('ch-lid-r'),
      smileL: $('ch-smile-l'), smileR: $('ch-smile-r'),
      heartL: $('ch-heart-l'), heartR: $('ch-heart-r'),
      cheekL: $('ch-cheek-l'), cheekR: $('ch-cheek-r'),
      tears: $('ch-tears'), beakLower: $('ch-beak-lower'), mouthOpen: $('ch-mouth-open'),
      fx: $('ch-fx'),
    };

    this.cur = { ...EMOTIONS.neutral, mouth: 0 };
    this.tgt = { ...EMOTIONS.neutral, mouth: 0 };
    this.emotion = 'neutral';

    this.t = 0;
    this.blinkAt = 2 + Math.random() * 3;
    this.blink = 0;
    this.speaking = false;

    this.gesture = null;
    this.gestureT = 0;

    this.look = { x: 0, y: 0 };

    this.particles = [];
    this.fxTimer = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  /* ---------------- 외부에서 쓰는 기능 ---------------- */

  setEmotion(name) {
    const preset = EMOTIONS[name] || EMOTIONS.neutral;
    this.emotion = EMOTIONS[name] ? name : 'neutral';
    Object.assign(this.tgt, preset);
  }

  playGesture(name, duration) {
    const table = { nod: 1.1, flap: 1.0, bounce: 0.9, tilt: 1.4, cheer: 1.3, droop: 1.6, idle: 0 };
    if (!name || name === 'idle' || !(name in table)) return;
    this.gesture = name;
    this.gestureT = 0;
    this.gestureDur = duration || table[name];
  }

  /** 목소리 크기(0~1)로 부리를 움직인다. */
  setMouth(v) {
    this.tgt.mouth = clamp(v, 0, 1);
  }

  setSpeaking(on) {
    this.speaking = on;
    if (!on) this.tgt.mouth = 0;
  }

  /** 화면 좌표를 바라보게 한다. */
  lookAt(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    this.look.x = clamp(((clientX - (r.left + r.width / 2)) / (r.width / 2)) * 9, -10, 10);
    this.look.y = clamp(((clientY - (r.top + r.height * 0.38)) / (r.height / 2)) * 7, -8, 8);
  }

  resetLook() { this.look.x = 0; this.look.y = 0; }

  destroy() { cancelAnimationFrame(this.raf); }

  /* ---------------- 애니메이션 루프 ---------------- */

  _tick = (now) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this._update(dt);
    this.raf = requestAnimationFrame(this._tick);
  };

  _update(dt) {
    const c = this.cur, g = this.tgt;
    const k = 1 - Math.pow(0.001, dt);         // 표정 전환 속도
    const km = 1 - Math.pow(0.0000002, dt);    // 입은 훨씬 빠르게 반응

    for (const key of Object.keys(g)) {
      if (key === 'fx' || key === 'mouth') continue;
      c[key] = lerp(c[key], g[key], k);
    }
    c.mouth = lerp(c.mouth, g.mouth, km);

    const t = this.t;
    const slow = this.reduced ? 0.25 : 1;

    /* --- 눈 깜빡임 --- */
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) {
      this.blink = 1;
      this.blinkAt = 2.2 + Math.random() * 3.6;
    }
    this.blink = Math.max(0, this.blink - dt * 6.2);
    const blinkAmt = Math.sin(Math.min(1, this.blink) * Math.PI) * (this.blink > 0 ? 1 : 0);

    /* --- 몸짓 --- */
    let gNodY = 0, gBodyY = 0, gWing = 0, gTilt = 0, gScale = 0;
    if (this.gesture) {
      this.gestureT += dt;
      const p = Math.min(1, this.gestureT / this.gestureDur);
      const ease = Math.sin(p * Math.PI);
      switch (this.gesture) {
        case 'nod':    gNodY = Math.sin(p * Math.PI * 2.4) * 13 * ease; break;
        case 'flap':   gWing = Math.sin(p * Math.PI * 7) * 36 * ease; break;
        case 'bounce': gBodyY = -Math.abs(Math.sin(p * Math.PI * 2.2)) * 26 * ease;
                       gWing = Math.sin(p * Math.PI * 5) * 22 * ease; break;
        case 'tilt':   gTilt = Math.sin(p * Math.PI) * -16; break;
        case 'cheer':  gWing = -48 * ease; gBodyY = -Math.abs(Math.sin(p * Math.PI * 2)) * 30 * ease;
                       gScale = ease * 0.05; break;
        case 'droop':  gNodY = ease * 14; gTilt = ease * 7; break;
      }
      if (p >= 1) this.gesture = null;
    }

    /* --- 숨쉬기 / 둥실 --- */
    const br = c.breath * slow;
    const breathe = Math.sin(t * 1.9 * br) * 0.016 * br;
    const floatY = Math.sin(t * 1.15 * slow) * 3.2 * slow;
    const swayX = Math.sin(t * 0.72 * slow) * 3 * slow;

    /* --- 말할 때의 미세한 움직임 --- */
    const talkBob = this.speaking ? Math.sin(t * 9) * 1.8 * c.mouth + c.mouth * 2 : 0;
    const talkTilt = this.speaking ? Math.sin(t * 3.1) * 2.2 : 0;

    /* --- 적용 --- */
    const E = this.el;
    E.root.setAttribute('transform', `translate(${swayX}, ${floatY + gBodyY})`);

    // 몸 전체가 발을 축으로 기울고, 숨쉬며 살짝 눌린다
    const bodyTilt = (c.tilt + gTilt + talkTilt) * 0.55;
    const sy = 1 + breathe + gScale;
    const sx = 1 - breathe * 0.5 + gScale;
    E.char.setAttribute(
      'transform',
      `rotate(${bodyTilt.toFixed(2)} 200 378) ` +
      `translate(200 378) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(-200 -378)`
    );

    // 얼굴은 조금 더 기운다 (고개를 갸웃하는 느낌)
    const headTilt = (c.tilt + gTilt + talkTilt) * 0.45;
    const headY = c.headY + gNodY + talkBob;
    E.head.setAttribute(
      'transform',
      `rotate(${headTilt.toFixed(2)} 200 300) translate(0 ${headY.toFixed(2)})`
    );

    const crestWave = Math.sin(t * 2.6 * slow) * 2.5 * slow;
    E.crest.setAttribute('transform', `rotate(${(c.crest + crestWave).toFixed(2)} 200 72)`);

    const idleWing = Math.sin(t * 2.1 * slow) * 3 * slow + (this.speaking ? Math.sin(t * 6) * 4 : 0);
    const excite = this.emotion === 'excited' ? Math.sin(t * 11) * 16 : 0;
    E.wingL.setAttribute('transform', `rotate(${(idleWing + gWing + excite).toFixed(2)} 96 214)`);
    E.wingR.setAttribute('transform', `rotate(${(-idleWing - gWing - excite).toFixed(2)} 304 214)`);

    // 눈썹
    E.browL.setAttribute('transform',
      `translate(0 ${c.brow.toFixed(2)}) rotate(${(-c.browAngle).toFixed(2)} 148 92)`);
    E.browR.setAttribute('transform',
      `translate(0 ${c.brow.toFixed(2)}) rotate(${c.browAngle.toFixed(2)} 252 92)`);

    /* 눈 표현 모드 — 반투명하게 겹치면 뒤쪽 눈이 비쳐 보이므로 한쪽만 확실히 보여 준다 */
    const smileMode = c.smile > 0.5;   // 웃는 눈(^^)
    const heartMode = c.heart > 0.5;   // 하트 눈

    // 웃는 눈일 때는 깜빡이지 않는다 (깜빡이면 표정이 튀어 어색하다)
    const lid = smileMode ? 0 : clamp(Math.max(c.lid, blinkAmt), -0.2, 1);
    E.lidL.setAttribute('transform', `translate(0 ${(lid * 134).toFixed(2)})`);
    E.lidR.setAttribute('transform', `translate(0 ${(lid * 134).toFixed(2)})`);

    // 눈 크기 (놀람)
    const es = c.eyeScale;
    E.eyeL.setAttribute('transform', `translate(148 170) scale(${es.toFixed(3)}) translate(-148 -170)`);
    E.eyeR.setAttribute('transform', `translate(252 170) scale(${es.toFixed(3)}) translate(-252 -170)`);

    // 눈동자
    const wander = this.emotion === 'thinking' ? Math.sin(t * 0.9) * 5 : Math.sin(t * 0.55) * 1.8;
    const px = this.look.x + wander;
    const py = c.pupilY + this.look.y;
    E.pupilL.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`);
    E.pupilR.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`);

    // 웃는 눈 / 하트 눈 — 켜지거나 꺼지거나, 중간 투명도는 쓰지 않는다
    const smileOn = smileMode ? '1' : '0';
    const eyeOn = smileMode ? '0' : '1';
    E.smileL.setAttribute('opacity', smileOn);
    E.smileR.setAttribute('opacity', smileOn);
    E.eyeL.setAttribute('opacity', eyeOn);
    E.eyeR.setAttribute('opacity', eyeOn);

    const heartPulse = 0.88 + Math.sin(t * 5.2) * 0.12;
    E.heartL.setAttribute('opacity', heartMode ? '1' : '0');
    E.heartR.setAttribute('opacity', heartMode ? '1' : '0');
    E.pupilL.setAttribute('opacity', heartMode ? '0' : '1');
    E.pupilR.setAttribute('opacity', heartMode ? '0' : '1');
    if (heartMode) {
      E.heartL.setAttribute('transform', `translate(148 176) scale(${heartPulse.toFixed(3)}) translate(-148 -176)`);
      E.heartR.setAttribute('transform', `translate(252 176) scale(${heartPulse.toFixed(3)}) translate(-252 -176)`);
    }

    // 볼 / 눈물
    E.cheekL.setAttribute('opacity', c.cheek.toFixed(3));
    E.cheekR.setAttribute('opacity', c.cheek.toFixed(3));
    if (c.tear > 0.01) {
      const drip = ((t * 26) % 42);
      E.tears.setAttribute('transform', `translate(0 ${drip.toFixed(1)})`);
      E.tears.setAttribute('opacity', (c.tear * (1 - drip / 42)).toFixed(3));
    } else {
      E.tears.setAttribute('opacity', '0');
    }

    // 부리 (립싱크) — 크고 또렷하게 벌어지도록
    const m = c.mouth;
    E.beakLower.setAttribute('transform',
      `translate(0 ${(m * 30).toFixed(2)}) rotate(${(m * 13).toFixed(2)} 200 208)`);
    E.mouthOpen.setAttribute('transform',
      `translate(200 198) scale(${(1 + m * 0.16).toFixed(3)} ${Math.max(0.02, m * 1.15).toFixed(3)}) translate(-200 -198)`);

    this._updateFx(dt);
  }

  /* ---------------- 감정 효과 입자 ---------------- */

  _updateFx(dt) {
    const kind = (EMOTIONS[this.emotion] || {}).fx;
    this.fxTimer -= dt;

    if (kind && !this.reduced && this.fxTimer <= 0 && this.particles.length < 14) {
      this.fxTimer = { heart: 0.5, sparkle: 0.55, spark2: 0.35, drop: 0.9, sweat: 1.4, think: 1.1 }[kind] || 1;
      this._spawn(kind);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { p.el.remove(); this.particles.splice(i, 1); continue; }
      const x = p.x + Math.sin(p.life * p.wob) * p.amp;
      const y = p.y + p.vy * p.life;
      const s = p.grow ? 0.5 + k * 0.9 : 1 - k * 0.3;
      p.el.setAttribute('transform',
        `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)}) rotate(${(p.rot * k).toFixed(1)})`);
      p.el.setAttribute('opacity', (Math.sin(k * Math.PI) * 1.1).toFixed(3));
    }
  }

  _spawn(kind) {
    const NS = 'http://www.w3.org/2000/svg';
    const side = Math.random() < 0.5 ? -1 : 1;
    let el, cfg;

    if (kind === 'heart') {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', 'M0 -6 C 8 -18, 26 -8, 12 8 L0 22 L-12 8 C -26 -8, -8 -18, 0 -6 Z');
      el.setAttribute('fill', '#FF5C7A');
      cfg = { x: 200 + side * (110 + Math.random() * 50), y: 190, vy: -46, max: 2.4, grow: true };
    } else if (kind === 'drop' || kind === 'sweat') {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', 'M0 -12 C -9 2, -10 14, 0 18 C 10 14, 9 2, 0 -12 Z');
      el.setAttribute('fill', kind === 'drop' ? '#5AB9F5' : '#9FD8F7');
      cfg = { x: 200 + side * (120 + Math.random() * 26), y: 140, vy: 74, max: 1.5, grow: false };
    } else if (kind === 'think') {
      el = document.createElementNS(NS, 'circle');
      el.setAttribute('r', 9 + Math.random() * 7);
      el.setAttribute('fill', '#FFFFFF');
      el.setAttribute('stroke', C.bodyEdge);
      el.setAttribute('stroke-width', '4');
      cfg = { x: 322, y: 100, vy: -34, max: 2.6, grow: true };
    } else {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', 'M0 -16 L4.5 -4.5 L16 0 L4.5 4.5 L0 16 L-4.5 4.5 L-16 0 L-4.5 -4.5 Z');
      el.setAttribute('fill', kind === 'spark2' ? '#FFD84D' : '#FFE07A');
      cfg = { x: 200 + side * (105 + Math.random() * 55), y: 90 + Math.random() * 110, vy: -34, max: 1.5, grow: false };
    }

    el.setAttribute('opacity', '0');
    this.el.fx.appendChild(el);
    this.particles.push({
      el, life: 0, wob: 2 + Math.random() * 2.5, amp: 6 + Math.random() * 10,
      rot: (Math.random() - 0.5) * 60, ...cfg,
    });
  }
}

export const EMOTION_LIST = Object.keys(EMOTIONS);
