/* =====================================================================
 *  아바타 엔진 (초롱이 · 준호 · 서연)
 *  - 캐릭터마다 부위별로 나뉜 SVG를 매 프레임 직접 변형해 표정/입모양/몸짓을 만든다.
 *  - 부위 id 는 모든 캐릭터가 똑같이 쓰고, 좌표 차이는 geom 에 따로 적어 둔다.
 *
 *  setCharacter(id)     : 캐릭터 교체
 *  setEmotion(감정)      : 표정 + 자세를 부드럽게 전환
 *  playGesture(몸짓)     : 끄덕임, 손짓 같은 일회성 동작
 *  setMouth(0~1)        : 실제 목소리 크기에 맞춰 입을 여닫음 (립싱크)
 * ===================================================================== */

/* ==================================================================
 *  1. 초롱이 (앵무새)
 * ================================================================== */

const BIRD = {
  body: '#5BC236', bodyLight: '#7BD956', bodyEdge: '#35871A',
  belly: '#8ADE63', wing: '#42A121', wingTip: '#2E86DE',
  pupil: '#2F3A33', brow: '#38901B',
  beakTop: '#FFC93C', beakLow: '#FF9A2E', beakEdge: '#E5891A',
  mouth: '#8E2540', tongue: '#F0788C',
  crestA: '#FF5C5C', crestB: '#FFC93C', crestC: '#FF8A3D',
  cheek: '#FF9DB5', tear: '#5AB9F5', foot: '#FFA22B', footEdge: '#E5891A',
};

const BIRD_SVG = `
<svg id="ch-svg" viewBox="0 -34 400 476" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="초롱이 앵무새 캐릭터">
  <defs>
    <radialGradient id="ch-grad" cx="36%" cy="26%" r="86%">
      <stop offset="0%" stop-color="${BIRD.bodyLight}"/>
      <stop offset="100%" stop-color="${BIRD.body}"/>
    </radialGradient>
    <linearGradient id="ch-lid-grad" x1="0" y1="46" x2="0" y2="382" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#76D652"/>
      <stop offset="100%" stop-color="#5BC236"/>
    </linearGradient>
    <clipPath id="ch-clip-eye-l"><ellipse cx="148" cy="170" rx="54" ry="60"/></clipPath>
    <clipPath id="ch-clip-eye-r"><ellipse cx="252" cy="170" rx="54" ry="60"/></clipPath>
  </defs>

  <g id="ch-root">
    <g id="ch-feet">
      <path d="M140 372 C 130 396, 138 414, 160 414 L 188 414 C 206 414, 208 396, 200 372 Z"
            fill="${BIRD.foot}"/>
      <path d="M162 396 L162 413 M182 396 L182 413" stroke="${BIRD.footEdge}"
            stroke-width="4" stroke-linecap="round"/>
      <path d="M200 372 C 192 396, 194 414, 212 414 L 240 414 C 262 414, 270 396, 260 372 Z"
            fill="${BIRD.foot}"/>
      <path d="M218 396 L218 413 M238 396 L238 413" stroke="${BIRD.footEdge}"
            stroke-width="4" stroke-linecap="round"/>
    </g>

    <g id="ch-char">
      <g id="ch-wing-l">
        <path d="M92 206 C 44 222, 30 282, 38 324 C 45 356, 80 364, 94 344 Z" fill="${BIRD.wing}"/>
        <path d="M40 302 C 37 328, 50 352, 72 357 C 83 344, 79 318, 68 302 Z" fill="${BIRD.wingTip}"/>
      </g>
      <g id="ch-wing-r">
        <path d="M308 206 C 356 222, 370 282, 362 324 C 355 356, 320 364, 306 344 Z" fill="${BIRD.wing}"/>
        <path d="M360 302 C 363 328, 350 352, 328 357 C 317 344, 321 318, 332 302 Z" fill="${BIRD.wingTip}"/>
      </g>

      <path id="ch-body"
            d="M66 202 C 66 96, 126 46, 200 46 C 274 46, 334 96, 334 202
               L334 314 C 334 360, 306 382, 262 382 L138 382
               C 94 382, 66 360, 66 314 Z"
            fill="url(#ch-grad)" stroke="${BIRD.bodyEdge}" stroke-width="5"/>
      <ellipse cx="200" cy="296" rx="76" ry="60" fill="${BIRD.belly}"/>

      <g id="ch-head">
        <g id="ch-crest">
          <path d="M164 74 C 140 36, 136 6, 148 -18 C 172 6, 184 44, 188 70 Z" fill="${BIRD.crestA}"/>
          <path d="M196 62 C 186 20, 194 -8, 212 -28 C 228 -2, 220 36, 214 62 Z" fill="${BIRD.crestB}"/>
          <path d="M220 70 C 246 38, 268 18, 288 8 C 282 44, 258 70, 238 84 Z" fill="${BIRD.crestC}"/>
        </g>

        <ellipse cx="148" cy="170" rx="54" ry="60" fill="#FFFFFF"/>
        <ellipse cx="252" cy="170" rx="54" ry="60" fill="#FFFFFF"/>

        <g id="ch-brow-l">
          <path d="M112 98 Q 148 78 184 94" fill="none" stroke="${BIRD.brow}"
                stroke-width="11" stroke-linecap="round"/>
        </g>
        <g id="ch-brow-r">
          <path d="M216 94 Q 252 78 288 98" fill="none" stroke="${BIRD.brow}"
                stroke-width="11" stroke-linecap="round"/>
        </g>

        <g id="ch-eye-l">
          <g clip-path="url(#ch-clip-eye-l)">
            <g id="ch-pupil-l">
              <ellipse cx="148" cy="176" rx="21" ry="27" fill="${BIRD.pupil}"/>
              <circle cx="157" cy="164" r="8" fill="#FFFFFF"/>
              <circle cx="139" cy="188" r="4.5" fill="#FFFFFF" opacity="0.85"/>
            </g>
            <path id="ch-heart-l"
                  d="M148 160 C 160 144, 180 154, 168 172 L148 196 L128 172 C 116 154, 136 144, 148 160 Z"
                  fill="#FF5C7A" opacity="0"/>
            <path id="ch-lid-l" d="M88 -46 H208 V94 Q148 120 88 94 Z" fill="url(#ch-lid-grad)"
                  stroke="${BIRD.bodyEdge}" stroke-width="3.5" stroke-linejoin="round"/>
          </g>
        </g>

        <g id="ch-eye-r">
          <g clip-path="url(#ch-clip-eye-r)">
            <g id="ch-pupil-r">
              <ellipse cx="252" cy="176" rx="21" ry="27" fill="${BIRD.pupil}"/>
              <circle cx="261" cy="164" r="8" fill="#FFFFFF"/>
              <circle cx="243" cy="188" r="4.5" fill="#FFFFFF" opacity="0.85"/>
            </g>
            <path id="ch-heart-r"
                  d="M252 160 C 264 144, 284 154, 272 172 L252 196 L232 172 C 220 154, 240 144, 252 160 Z"
                  fill="#FF5C7A" opacity="0"/>
            <path id="ch-lid-r" d="M192 -46 H312 V94 Q252 120 192 94 Z" fill="url(#ch-lid-grad)"
                  stroke="${BIRD.bodyEdge}" stroke-width="3.5" stroke-linejoin="round"/>
          </g>
        </g>

        <path id="ch-smile-l" d="M112 188 Q 148 146 184 188" fill="none" stroke="${BIRD.pupil}"
              stroke-width="13" stroke-linecap="round" opacity="0"/>
        <path id="ch-smile-r" d="M216 188 Q 252 146 288 188" fill="none" stroke="${BIRD.pupil}"
              stroke-width="13" stroke-linecap="round" opacity="0"/>

        <ellipse id="ch-cheek-l" cx="102" cy="232" rx="25" ry="13" fill="${BIRD.cheek}" opacity="0"/>
        <ellipse id="ch-cheek-r" cx="298" cy="232" rx="25" ry="13" fill="${BIRD.cheek}" opacity="0"/>

        <g id="ch-tears" opacity="0">
          <path d="M116 234 C 107 250, 105 264, 116 268 C 127 264, 125 250, 116 234 Z" fill="${BIRD.tear}"/>
          <path d="M284 234 C 275 250, 273 264, 284 268 C 295 264, 293 250, 284 234 Z" fill="${BIRD.tear}"/>
        </g>

        <g id="ch-beak">
          <g id="ch-mouth-open">
            <path d="M172 198 Q 200 190 228 198 L228 230 Q 200 272 172 230 Z" fill="${BIRD.mouth}"/>
            <ellipse cx="200" cy="240" rx="18" ry="10" fill="${BIRD.tongue}"/>
          </g>
          <g id="ch-beak-lower">
            <path d="M176 206 Q 200 222 224 206 Q 227 232 200 241 Q 173 232 176 206 Z"
                  fill="${BIRD.beakLow}" stroke="${BIRD.beakEdge}" stroke-width="3" stroke-linejoin="round"/>
          </g>
          <path d="M168 188 Q 200 175 232 188 Q 236 214 217 231 Q 206 242 200 244
                   Q 194 242 183 231 Q 164 214 168 188 Z"
                fill="${BIRD.beakTop}" stroke="${BIRD.beakEdge}" stroke-width="3" stroke-linejoin="round"/>
          <circle cx="188" cy="192" r="3.4" fill="${BIRD.beakEdge}"/>
          <circle cx="212" cy="192" r="3.4" fill="${BIRD.beakEdge}"/>
        </g>
      </g>
    </g>

    <g id="ch-fx"></g>
  </g>
</svg>`;

const BIRD_GEOM = {
  eyeL: [148, 170], eyeR: [252, 170],
  browPivotL: [148, 92], browPivotR: [252, 92],
  lidTravel: 134,
  bodyPivot: [200, 378], headPivot: [200, 300],
  wingPivotL: [96, 214], wingPivotR: [304, 214], wingScale: 1,
  crestPivot: [200, 72],
  jawPivot: [200, 208], jawTravel: 30, jawRot: 13,
  mouthOrigin: [200, 198], mouthSX: 0.16, mouthSY: 1.15,
  heartL: [148, 176], heartR: [252, 176],
  fx: { heartX: 110, heartY: 190, dropX: 120, dropY: 140, thinkX: 322, thinkY: 100, sparkX: 105, sparkY: 90 },
  thinkStroke: BIRD.bodyEdge,
};

/* ==================================================================
 *  2. 사람 캐릭터 (준호 · 서연) — 보내 준 캐릭터 그림을 SVG 로 옮긴 것
 *
 *  그림 좌표(가로 800 · 눈 높이 410)로 그린 뒤 한 번에 줄여 아바타 틀(400×500)에 얹는다.
 *  엔진이 움직이는 부위(눈 · 눈꺼풀 · 입 · 볼 · 눈물)도 이 그림 좌표 안에 있으므로
 *  ART_GEOM 의 해당 기준점도 그림 좌표로 적는다. (머리 · 몸 기준점만 틀 좌표)
 *
 *  입은 그림 속 '웃는 입' 을 그대로 두고, 말할 때는 아래턱만 내려간다.
 *  눈썹은 그림에 없어서 빈 자리만 둔다 (엔진이 찾는 부위라 지우지는 않는다).
 * ================================================================== */

const ART = { scale: 0.47, cx: 400, eyeY: 410 };
const ART_MATRIX =
  `matrix(${ART.scale} 0 0 ${ART.scale} ${200 - ART.cx * ART.scale} ${176 - ART.eyeY * ART.scale})`;

const SKIN = '#FAE1D6';
const SKIN_EDGE = '#EFB39A';

const ART_GEOM = {
  bodyPivot: [200, 476], headPivot: [200, 290],
  wingPivotL: [140, 350], wingPivotR: [260, 350], wingScale: 1,
  hasArms: false,
  crestPivot: [400, 150], crestScale: 0.3,
  browPivotL: [310, 340], browPivotR: [490, 340], browScale: 0.9,
  lidTravel: 84,
  jawPivot: [400, 526], jawTravel: 26, jawRot: 0,
  mouthOrigin: [400, 526], mouthSX: 0, mouthSY: 1,
  fx: { heartX: 108, heartY: 180, dropX: 100, dropY: 170, thinkX: 312, thinkY: 96, sparkX: 110, sparkY: 84 },
};

const artGeom = (P) => ({
  ...ART_GEOM,
  eyeL: [P.eyeX[0], 410], eyeR: [P.eyeX[1], 410],
  heartL: [P.eyeX[0], 410], heartR: [P.eyeX[1], 410],
  thinkStroke: P.hair,
});

/**
 * 눈 — 그림처럼 짙은 동그라미 (서연은 반짝이 하나).
 * 눈꺼풀은 살색 판이 위에서 내려와 덮는다. 쉬고 있을 때는 눈 위 살색과 구별되지 않는다.
 */
function artEye(P, side) {
  const cx = side === 'l' ? P.eyeX[0] : P.eyeX[1];
  return `
          <g id="ch-eye-${side}">
            <g id="ch-pupil-${side}">
              <ellipse cx="${cx}" cy="410" rx="${P.eyeRx}" ry="${P.eyeRy}" fill="${P.eye}"/>
              ${P.eyeShine ? `<circle cx="${cx + 8}" cy="398" r="8" fill="#FFFFFF"/>` : ''}
            </g>
            <path id="ch-heart-${side}"
                  d="M${cx} 396 C${cx + 14} 378, ${cx + 38} 392, ${cx + 22} 416 L${cx} 440 L${cx - 22} 416
                     C${cx - 38} 392, ${cx - 14} 378, ${cx} 396 Z" fill="#F2707F" opacity="0"/>
            <g clip-path="url(#ch-clip-eye-${side})">
              <g id="ch-lid-${side}">
                <rect x="${cx - 50}" y="270" width="100" height="100" fill="${SKIN}"/>
                <path d="M${cx - 26} 336 Q${cx} 350 ${cx + 26} 336" fill="none"
                      stroke="${P.eye}" stroke-width="9" stroke-linecap="round"/>
              </g>
            </g>
          </g>
          <path id="ch-smile-${side}" d="M${cx - 30} 424 Q${cx} 378 ${cx + 30} 424" fill="none"
                stroke="${P.eye}" stroke-width="11" stroke-linecap="round" opacity="0"/>`;
}

function artSVG(P) {
  const [lx, rx] = P.eyeX;
  const drop = (x) => `<path d="M${x} 440 C${x - 14} 464, ${x - 16} 486, ${x} 492 C${x + 16} 486, ${x + 14} 464, ${x} 440 Z" fill="#5AB9F5"/>`;
  return `
<svg id="ch-svg" viewBox="0 -30 400 500" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="${P.label}">
  <defs>
    <clipPath id="ch-clip-eye-l"><rect x="${lx - 48}" y="364" width="96" height="92"/></clipPath>
    <clipPath id="ch-clip-eye-r"><rect x="${rx - 48}" y="364" width="96" height="92"/></clipPath>
  </defs>

  <g id="ch-root">
    <g id="ch-feet"></g>

    <g id="ch-char">
      <!-- 목 · 옷 -->
      <g transform="${ART_MATRIX}">${P.body}</g>

      <g id="ch-head">
        <g transform="${ART_MATRIX}">
          ${P.hairBack || ''}
          ${P.face}
          ${P.hairFront}
          <g id="ch-crest"></g>

          <ellipse id="ch-cheek-l" cx="${lx - 12}" cy="490" rx="36" ry="18" fill="#F4A09A" opacity="0"/>
          <ellipse id="ch-cheek-r" cx="${rx + 12}" cy="490" rx="36" ry="18" fill="#F4A09A" opacity="0"/>
          <g id="ch-tears" opacity="0">${drop(lx)}${drop(rx)}</g>

          ${artEye(P, 'l')}
          ${artEye(P, 'r')}
          <g id="ch-brow-l"></g>
          <g id="ch-brow-r"></g>

          <!-- 코 -->
          <path d="${P.nose}" fill="none" stroke="#141214" stroke-width="9" stroke-linecap="round"/>

          <!-- 입 : 벌어지는 틈 → 아래턱 → 윗니 (조각끼리 몇 칸씩 겹쳐 이음매를 감춘다) -->
          <g id="ch-beak"${P.mouthTilt ? ` transform="rotate(${P.mouthTilt} 400 520)"` : ''}>
            <g id="ch-mouth-open">
              <path d="M${P.mouthL} 522 H${P.mouthR} V556 H${P.mouthL} Z" fill="${P.mouth}"/>
            </g>
            <g id="ch-beak-lower">${P.mouthLower}</g>
            ${P.mouthUpper}
          </g>
        </g>
      </g>

      <!-- 엔진이 좌우 흔들림을 걸어 두는 자리 (상반신이라 팔이 없다) -->
      <g id="ch-wing-l"></g>
      <g id="ch-wing-r"></g>
    </g>

    <g id="ch-fx"></g>
  </g>
</svg>`;
}

/* --- 준호 : 갈색 삐죽 머리 + 짙은 갈색 맨투맨 --- */
const JUNHO = {
  label: '준호 캐릭터',
  hair: '#5C4234',
  eye: '#0D0B12', eyeX: [312, 488], eyeRx: 34, eyeRy: 34, eyeShine: false,
  nose: 'M382 470 Q396 450 410 468',
  mouth: '#2E2B2D', mouthL: 336, mouthR: 464, mouthTilt: -7,

  body: `
    <path d="M378 556 V660 H446 V556 Z" fill="${SKIN}"/>
    <path d="M378 556 V660 M446 556 V660" stroke="${SKIN_EDGE}" stroke-width="10"/>
    <path d="M356 630 C318 634 292 652 278 690 C264 740 256 830 250 1080 H560
             C554 830 548 740 534 690 C520 652 494 634 460 628 Z" fill="#33262A"/>
    <path d="M356 632 Q406 678 462 630" fill="none" stroke="#1C1417" stroke-width="12"/>
    <path d="M296 672 Q282 780 292 900 M516 672 Q530 780 520 900" fill="none"
          stroke="#1C1417" stroke-width="4"/>`,

  face: `
    <path d="M196 404 C150 390 114 404 114 446 C114 490 150 510 200 502 Z" fill="${SKIN_EDGE}"/>
    <path d="M192 420 C160 410 132 420 132 448 C132 476 158 490 194 486 Z" fill="${SKIN}"/>
    <path d="M150 436 Q176 450 184 472" fill="none" stroke="${SKIN_EDGE}" stroke-width="9" stroke-linecap="round"/>
    <path d="M604 404 C650 390 686 404 686 446 C686 490 650 510 600 502 Z" fill="${SKIN_EDGE}"/>
    <path d="M608 420 C640 410 668 420 668 448 C668 476 642 490 606 486 Z" fill="${SKIN}"/>
    <path d="M650 436 Q624 450 616 472" fill="none" stroke="${SKIN_EDGE}" stroke-width="9" stroke-linecap="round"/>
    <path d="M200 300 C192 424 212 522 262 566 C306 598 352 610 400 610
             C448 610 494 598 538 566 C588 522 608 424 600 300 Z" fill="${SKIN_EDGE}"/>
    <path d="M214 300 C206 420 226 510 272 552 C314 584 356 596 400 596
             C444 596 486 584 528 552 C574 510 594 420 586 300 Z" fill="${SKIN}"/>`,

  hairFront: `
    <path d="M175 218 C196 222 214 222 230 216 C250 176 316 142 396 136 C414 134 424 132 430 128
             C446 146 468 160 488 166 C504 160 520 154 532 150 C540 176 552 208 562 236
             C586 232 608 234 628 240 C614 250 606 262 604 272 C624 280 640 290 652 298
             C640 300 634 304 632 310 C650 380 642 460 594 526 C588 450 582 380 570 330
             C566 310 560 296 556 288 C490 330 430 352 356 362 C390 344 420 326 444 308
             C392 330 310 352 238 372 C226 420 220 470 216 516 C176 480 158 420 158 350
             C158 290 176 250 206 228 C196 226 186 222 175 218 Z" fill="#5C4234"/>`,

  mouthUpper: `
    <path d="M330 506 H470 C470 514 468 522 464 528 H336 C332 522 330 514 330 506 Z" fill="#2E2B2D"/>
    <path d="M346 508 H454 C450 516 444 520 436 522 H364 C356 520 350 516 346 508 Z" fill="#FFFFFF"/>`,

  mouthLower: `
    <path d="M336 523 H464 C456 560 432 576 400 576 C368 576 344 560 336 523 Z" fill="#2E2B2D"/>
    <path d="M358 558 C374 542 426 542 442 558 C430 570 416 576 400 576 C384 576 370 570 358 558 Z" fill="#E0667A"/>`,
};

/* --- 서연 : 가운데 가르마 긴 머리 + 연보라 후드 --- */
const SEOYEON = {
  label: '서연 캐릭터',
  hair: '#3E3430',
  eye: '#393347', eyeX: [320, 480], eyeRx: 25, eyeRy: 30, eyeShine: true,
  nose: 'M378 474 Q392 454 406 472',
  mouth: '#5E4637', mouthL: 350, mouthR: 450, mouthTilt: 0,

  body: `
    <path d="M376 556 V650 H428 V556 Z" fill="${SKIN}"/>
    <path d="M322 612 C288 628 262 660 252 702 C244 760 238 900 236 1080 H572
             C570 900 566 760 558 702 C548 660 522 628 486 612 Z" fill="#CDD0E8"/>
    <path d="M360 610 Q404 650 448 610 L438 604 Q404 632 370 604 Z" fill="#FFFFFF"/>
    <path d="M322 612 C352 640 382 664 404 706 C426 664 456 640 486 612" fill="none"
          stroke="#A7ACD4" stroke-width="5"/>
    <path d="M380 664 L374 772 M428 664 L434 800" fill="none" stroke="#A7ACD4"
          stroke-width="5" stroke-linecap="round"/>`,

  hairBack: `
    <path d="M392 70 C300 70 190 110 140 200 C104 280 104 400 116 480 C128 580 160 660 204 722
             C236 700 266 660 292 626 C300 612 310 600 322 594 H476 C490 604 506 620 520 640
             C540 670 566 700 590 708 C636 640 664 560 670 460 C676 360 664 250 626 170
             C586 100 490 70 392 70 Z" fill="#3E3430" stroke="#111111" stroke-width="7"
          stroke-linejoin="round"/>`,

  face: `
    <path d="M204 404 C182 398 170 420 174 440 C178 460 192 468 206 466 Z" fill="${SKIN}"
          stroke="${SKIN_EDGE}" stroke-width="6"/>
    <path d="M600 404 C622 398 634 420 630 440 C626 460 612 468 598 466 Z" fill="${SKIN}"
          stroke="${SKIN_EDGE}" stroke-width="6"/>
    <path d="M204 300 C198 430 222 526 270 566 C312 598 356 610 400 610
             C444 610 488 598 530 566 C578 526 602 430 596 300 Z" fill="${SKIN_EDGE}"/>
    <path d="M216 300 C210 424 234 514 280 552 C318 582 358 594 400 594
             C442 594 482 582 520 552 C566 514 590 424 584 300 Z" fill="${SKIN}"/>`,

  hairFront: `
    <path d="M392 72 C300 72 196 116 150 206 C120 270 116 350 132 420 C156 390 196 368 212 364
             C258 350 300 300 330 250 C352 210 372 160 388 110 C400 170 428 240 470 300
             C510 356 560 384 636 398 C640 330 632 250 604 190 C560 110 480 72 392 72 Z"
          fill="#3E3430" stroke="#111111" stroke-width="7" stroke-linejoin="round"/>
    <path d="M372 130 C340 210 300 280 240 330 M340 110 C290 170 220 220 176 300
             M420 130 C450 210 500 290 580 350 M460 110 C520 160 580 220 610 300
             M150 470 C160 560 180 640 204 700 M650 460 C640 560 620 640 590 700"
          fill="none" stroke="#1A1716" stroke-width="5" stroke-linecap="round"/>
    <path d="M300 150 C260 200 220 250 196 320 M500 150 C540 200 580 260 600 320"
          fill="none" stroke="#7A6D66" stroke-width="3" stroke-linecap="round"/>`,

  mouthUpper: `
    <path d="M346 506 H454 C454 514 452 522 450 528 H350 C348 522 346 514 346 506 Z" fill="#5E4637"/>`,

  mouthLower: `
    <path d="M350 523 H450 C444 552 424 566 400 566 C376 566 356 552 350 523 Z" fill="#5E4637"/>
    <path d="M368 552 C382 538 418 538 432 552 C422 562 412 566 400 566 C388 566 378 562 368 552 Z" fill="#D9968C"/>`,
};


export const CHARACTERS = {
  chorong: {
    id: 'chorong',
    name: '초롱이',
    svg: BIRD_SVG,
    geom: BIRD_GEOM,
  },
  junho: {
    id: 'junho',
    name: '준호',
    svg: artSVG(JUNHO),
    geom: artGeom(JUNHO),
  },
  seoyeon: {
    id: 'seoyeon',
    name: '서연',
    svg: artSVG(SEOYEON),
    geom: artGeom(SEOYEON),
  },
};

export const CHARACTER_LIST = ['chorong', 'junho', 'seoyeon'];
export const DEFAULT_CHARACTER = 'chorong';

/* ==================================================================
 *  4. 감정 프리셋 (모든 캐릭터가 함께 쓴다)
 * ================================================================== */

const EMOTIONS = {
  neutral:   { brow: 0,   browAngle: 0,   lid: 0.04, pupilY: 0,  cheek: 0,   smile: 0,    crest: 0,   tilt: 0,   headY: 0,  eyeScale: 1,    tear: 0, heart: 0, breath: 1,   fx: null , armLS: 6, armLE: 86, armRS: 6, armRE: 86 },
  happy:     { brow: -6,  browAngle: -6,  lid: 0,    pupilY: 0,  cheek: 1,   smile: 0.92, crest: -8,  tilt: -3,  headY: -2, eyeScale: 1,    tear: 0, heart: 0, breath: 1.2, fx: 'sparkle' , armLS: 8, armLE: 88, armRS: 18, armRE: 112 },
  excited:   { brow: -12, browAngle: -9,  lid: 0,    pupilY: -2, cheek: 1,   smile: 1,    crest: -18, tilt: 0,   headY: -5, eyeScale: 1,    tear: 0, heart: 0, breath: 1.9, fx: 'sparkle' , armLS: 26, armLE: 158, armRS: 26, armRE: 158 },
  sad:       { brow: 10,  browAngle: 17,  lid: 0.34, pupilY: 6,  cheek: 0,   smile: 0,    crest: 24,  tilt: 5,   headY: 9,  eyeScale: 1,    tear: 1, heart: 0, breath: 0.6, fx: 'drop' , armLS: 0, armLE: 70, armRS: 0, armRE: 70 },
  worried:   { brow: 7,   browAngle: 13,  lid: 0.17, pupilY: 3,  cheek: 0,   smile: 0,    crest: 14,  tilt: -6,  headY: 4,  eyeScale: 1,    tear: 0, heart: 0, breath: 0.8, fx: 'sweat' , armLS: 7, armLE: 90, armRS: 13, armRE: 120 },
  surprised: { brow: -17, browAngle: 0,   lid: -0.1, pupilY: 0,  cheek: 0,   smile: 0,    crest: -22, tilt: 0,   headY: -6, eyeScale: 1.13, tear: 0, heart: 0, breath: 1,   fx: 'spark2' , armLS: 20, armLE: 142, armRS: 20, armRE: 142 },
  love:      { brow: -6,  browAngle: -4,  lid: 0,    pupilY: 0,  cheek: 1,   smile: 0,    crest: -6,  tilt: -6,  headY: -2, eyeScale: 1.05, tear: 0, heart: 1, breath: 1.2, fx: 'heart' , armLS: 12, armLE: 116, armRS: 12, armRE: 116 },
  thinking:  { brow: -3,  browAngle: 8,   lid: 0.15, pupilY: -9, cheek: 0,   smile: 0,    crest: 8,   tilt: -12, headY: 0,  eyeScale: 1,    tear: 0, heart: 0, breath: 0.7, fx: 'think' , armLS: 5, armLE: 82, armRS: 22, armRE: 152 },
  proud:     { brow: -8,  browAngle: -10, lid: 0,    pupilY: 2,  cheek: 0.8, smile: 0.88, crest: -12, tilt: 0,   headY: -7, eyeScale: 1,    tear: 0, heart: 0, breath: 1.1, fx: 'sparkle' , armLS: 8, armLE: 88, armRS: 15, armRE: 122 },
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ==================================================================
 *  5. 아바타 엔진
 * ================================================================== */

export class Avatar {
  constructor(mount, characterId = DEFAULT_CHARACTER) {
    this.mount = mount;

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

    this._mountCharacter(characterId);

    this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  /* ---------------- 캐릭터 ---------------- */

  _mountCharacter(id) {
    const def = CHARACTERS[id] || CHARACTERS[DEFAULT_CHARACTER];
    this.characterId = def.id;
    this.geom = def.geom;

    /* 한 화면에 아바타가 여러 개 있으면 SVG id 가 겹쳐서
       url(#...) 참조가 엉뚱한(먼저 나온) 그라디언트나 클립을 가리킨다.
       그래서 인스턴스마다 id 앞부분을 다르게 붙여 준다. */
    const ns = 'ch' + (Avatar._seq = (Avatar._seq || 0) + 1) + '-';
    this.ns = ns;

    this.mount.innerHTML = def.svg.split('ch-').join(ns);
    this.svg = this.mount.querySelector('#' + ns + 'svg');

    const $ = (name) => this.svg.querySelector('#' + ns + name);
    this.el = {
      root: $('root'), char: $('char'), head: $('head'), crest: $('crest'),
      wingL: $('wing-l'), wingR: $('wing-r'),
      forearmL: $('forearm-l'), forearmR: $('forearm-r'),
      browL: $('brow-l'), browR: $('brow-r'),
      eyeL: $('eye-l'), eyeR: $('eye-r'),
      pupilL: $('pupil-l'), pupilR: $('pupil-r'),
      lidL: $('lid-l'), lidR: $('lid-r'),
      smileL: $('smile-l'), smileR: $('smile-r'),
      heartL: $('heart-l'), heartR: $('heart-r'),
      cheekL: $('cheek-l'), cheekR: $('cheek-r'),
      tears: $('tears'), beakLower: $('beak-lower'), mouthOpen: $('mouth-open'),
      fx: $('fx'),
    };

    // 이전 캐릭터에 붙어 있던 효과 입자는 사라졌으므로 목록을 비운다
    this.particles = [];
  }

  /** 캐릭터를 바꾼다. 표정과 진행 중인 동작은 그대로 이어진다. */
  setCharacter(id) {
    if (id === this.characterId) return;
    this._mountCharacter(id);
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

  /** 목소리 크기(0~1)로 입을 움직인다. */
  setMouth(v) { this.tgt.mouth = clamp(v, 0, 1); }

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
    const c = this.cur, g = this.tgt, G = this.geom;
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

    const [bpx, bpy] = G.bodyPivot;
    const bodyTilt = (c.tilt + gTilt + talkTilt) * 0.55;
    const sy = 1 + breathe + gScale;
    const sx = 1 - breathe * 0.5 + gScale;
    E.char.setAttribute(
      'transform',
      `rotate(${bodyTilt.toFixed(2)} ${bpx} ${bpy}) ` +
      `translate(${bpx} ${bpy}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-bpx} ${-bpy})`
    );

    const [hpx, hpy] = G.headPivot;
    const headTilt = (c.tilt + gTilt + talkTilt) * 0.45;
    const headY = c.headY + gNodY + talkBob;
    E.head.setAttribute(
      'transform',
      `rotate(${headTilt.toFixed(2)} ${hpx} ${hpy}) translate(0 ${headY.toFixed(2)})`
    );

    const [cpx, cpy] = G.crestPivot;
    const crestWave = Math.sin(t * 2.6 * slow) * 2.5 * slow;
    if (E.crest) E.crest.setAttribute('transform',
      `rotate(${((c.crest + crestWave) * (G.crestScale ?? 1)).toFixed(2)} ${cpx} ${cpy})`);

    const ws = G.wingScale ?? 1;
    const idleWing = Math.sin(t * 2.1 * slow) * 3 * slow + (this.speaking ? Math.sin(t * 6) * 4 : 0);
    const excite = this.emotion === 'excited' ? Math.sin(t * 11) * 16 : 0;
    const [wlx, wly] = G.wingPivotL;
    const [wrx, wry] = G.wingPivotR;

    if (G.hasArms && E.forearmL && E.forearmR) {
      /* 사람 — 좌우 팔이 따로 움직인다.
         말하는 동안에는 손짓이 자연스럽게 흔들리도록 리듬을 얹는다. */
      const talkA = this.speaking ? Math.sin(t * 2.5) * 5 * (0.35 + c.mouth * 0.8) : 0;
      const talkB = this.speaking ? Math.sin(t * 2.5 + 1.1) * 5 * (0.35 + c.mouth * 0.8) : 0;
      const sway = Math.sin(t * 1.05 * slow) * 1.6 * slow;

      const aLS = c.armLS + sway + (gWing + excite) * 0.55;
      const aRS = c.armRS + sway + (gWing + excite) * 0.55;
      const aLE = Math.max(0, c.armLE + talkA);
      const aRE = Math.max(0, c.armRE + talkB);

      E.wingL.setAttribute('transform', `rotate(${aLS.toFixed(2)} ${wlx} ${wly})`);
      E.wingR.setAttribute('transform', `rotate(${(-aRS).toFixed(2)} ${wrx} ${wry})`);

      const [elx, ely] = G.elbowPivotL;
      const [erx, ery] = G.elbowPivotR;
      E.forearmL.setAttribute('transform', `rotate(${(-aLE).toFixed(2)} ${elx} ${ely})`);
      E.forearmR.setAttribute('transform', `rotate(${aRE.toFixed(2)} ${erx} ${ery})`);
    } else {
      const wingAngle = (idleWing + gWing + excite) * ws;
      E.wingL.setAttribute('transform', `rotate(${wingAngle.toFixed(2)} ${wlx} ${wly})`);
      E.wingR.setAttribute('transform', `rotate(${(-wingAngle).toFixed(2)} ${wrx} ${wry})`);
    }

    // 눈썹 — 사람 얼굴은 이마가 좁아 움직임 폭을 줄인다 (앞머리에 가리지 않도록)
    const bs = G.browScale ?? 1;
    const browY = (c.brow * bs).toFixed(2);
    const browA = c.browAngle * bs;
    const [blx, bly] = G.browPivotL;
    const [brx, bry] = G.browPivotR;
    E.browL.setAttribute('transform',
      `translate(0 ${browY}) rotate(${(-browA).toFixed(2)} ${blx} ${bly})`);
    E.browR.setAttribute('transform',
      `translate(0 ${browY}) rotate(${browA.toFixed(2)} ${brx} ${bry})`);

    /* 눈 표현 모드 — 반투명하게 겹치면 뒤쪽 눈이 비쳐 보이므로 한쪽만 확실히 보여 준다 */
    const smileMode = c.smile > 0.5;
    const heartMode = c.heart > 0.5;

    // 웃는 눈일 때는 깜빡이지 않는다 (깜빡이면 표정이 튀어 어색하다)
    const lid = smileMode ? 0 : clamp(Math.max(c.lid, blinkAmt), -0.2, 1);
    const lidY = (lid * G.lidTravel).toFixed(2);
    E.lidL.setAttribute('transform', `translate(0 ${lidY})`);
    E.lidR.setAttribute('transform', `translate(0 ${lidY})`);

    // 눈 크기 (놀람)
    const es = c.eyeScale;
    const [elx, ely] = G.eyeL;
    const [erx, ery] = G.eyeR;
    E.eyeL.setAttribute('transform', `translate(${elx} ${ely}) scale(${es.toFixed(3)}) translate(${-elx} ${-ely})`);
    E.eyeR.setAttribute('transform', `translate(${erx} ${ery}) scale(${es.toFixed(3)}) translate(${-erx} ${-ery})`);

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

    E.heartL.setAttribute('opacity', heartMode ? '1' : '0');
    E.heartR.setAttribute('opacity', heartMode ? '1' : '0');
    E.pupilL.setAttribute('opacity', heartMode ? '0' : '1');
    E.pupilR.setAttribute('opacity', heartMode ? '0' : '1');
    if (heartMode) {
      const pulse = (0.88 + Math.sin(t * 5.2) * 0.12).toFixed(3);
      const [hlx, hly] = G.heartL;
      const [hrx, hry] = G.heartR;
      E.heartL.setAttribute('transform', `translate(${hlx} ${hly}) scale(${pulse}) translate(${-hlx} ${-hly})`);
      E.heartR.setAttribute('transform', `translate(${hrx} ${hry}) scale(${pulse}) translate(${-hrx} ${-hry})`);
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

    // 입 (립싱크)
    const m = c.mouth;
    const [jx, jy] = G.jawPivot;
    E.beakLower.setAttribute('transform',
      `translate(0 ${(m * G.jawTravel).toFixed(2)}) rotate(${(m * G.jawRot).toFixed(2)} ${jx} ${jy})`);
    /* 사람 캐릭터는 '다문 입'과 '벌린 입'이 서로 다른 그림이라 겹치면 안 된다.
       입이 조금이라도 벌어지면 다문 입 선을 걷어낸다.
       (초롱이는 이 값이 없다 — 아래턱이 실제 부리라 늘 보여야 한다) */
    if (G.mouthFade) {
      E.beakLower.setAttribute('opacity', clamp(1 - m / G.mouthFade, 0, 1).toFixed(3));
    }
    const [mox, moy] = G.mouthOrigin;
    E.mouthOpen.setAttribute('transform',
      `translate(${mox} ${moy}) scale(${(1 + m * G.mouthSX).toFixed(3)} ${Math.max(0.02, m * G.mouthSY).toFixed(3)}) translate(${-mox} ${-moy})`);

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
    const F = this.geom.fx;
    const side = Math.random() < 0.5 ? -1 : 1;
    let el, cfg;

    if (kind === 'heart') {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', 'M0 -6 C 8 -18, 26 -8, 12 8 L0 22 L-12 8 C -26 -8, -8 -18, 0 -6 Z');
      el.setAttribute('fill', '#FF5C7A');
      cfg = { x: 200 + side * (F.heartX + Math.random() * 50), y: F.heartY, vy: -46, max: 2.4, grow: true };
    } else if (kind === 'drop' || kind === 'sweat') {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', 'M0 -12 C -9 2, -10 14, 0 18 C 10 14, 9 2, 0 -12 Z');
      el.setAttribute('fill', kind === 'drop' ? '#5AB9F5' : '#9FD8F7');
      cfg = { x: 200 + side * (F.dropX + Math.random() * 26), y: F.dropY, vy: 74, max: 1.5, grow: false };
    } else if (kind === 'think') {
      el = document.createElementNS(NS, 'circle');
      el.setAttribute('r', 9 + Math.random() * 7);
      el.setAttribute('fill', '#FFFFFF');
      el.setAttribute('stroke', this.geom.thinkStroke || '#8B948F');
      el.setAttribute('stroke-width', '4');
      cfg = { x: F.thinkX, y: F.thinkY, vy: -34, max: 2.6, grow: true };
    } else {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', 'M0 -16 L4.5 -4.5 L16 0 L4.5 4.5 L0 16 L-4.5 4.5 L-16 0 L-4.5 -4.5 Z');
      el.setAttribute('fill', kind === 'spark2' ? '#FFD84D' : '#FFE07A');
      cfg = { x: 200 + side * (F.sparkX + Math.random() * 55), y: F.sparkY + Math.random() * 110, vy: -34, max: 1.5, grow: false };
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
