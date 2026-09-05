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
 *  2. 사람 캐릭터 (준호 · 서연) — 플랫 아이콘 스타일
 *
 *  반쯤 사실적인 그림체는 불쾌한 골짜기에 빠지기 쉬워서 방향을 바꿨다.
 *  - 그라디언트 없음 · 윤곽선 없음 · 면(面) 하나에 색 하나
 *  - 코·콧방울·인중·손가락 마디처럼 "사람처럼 보이려는" 디테일을 전부 뺀다
 *  - 눈은 흰자 없이 짙은 색 덩어리, 볼은 납작한 분홍 타원
 *  덜 사람 같을수록 오히려 편안해 보인다.
 *
 *  세로 기준 (머리 위 54 ~ 턱 262):
 *    앞머리 끝 128 · 눈썹 154 · 눈 176 · 입 210 · 턱 262
 * ================================================================== */

const HUMAN_GEOM = {
  eyeL: [169, 176], eyeR: [231, 176],
  browPivotL: [169, 154], browPivotR: [231, 154],
  lidTravel: 34,
  bodyPivot: [200, 476], headPivot: [200, 290],
  wingPivotL: [140, 350], wingPivotR: [260, 350], wingScale: 1,
  hasArms: false,          // 참고 그림처럼 팔 없는 상반신
  crestPivot: [236, 74], crestScale: 0.3,
  browScale: 0.9,
  jawPivot: [200, 210], jawTravel: 12, jawRot: 0,
  mouthOrigin: [200, 210], mouthSX: 0.12, mouthSY: 1,
  heartL: [169, 176], heartR: [231, 176],
  fx: { heartX: 108, heartY: 180, dropX: 100, dropY: 170, thinkX: 312, thinkY: 96, sparkX: 110, sparkY: 84 },
};

/* 얼굴 — 모서리가 둥근 달걀형 */
const FACE_PATH =
  'M200 66 C148 66, 115 96, 115 152 C115 200, 145 262, 200 262 ' +
  'C255 262, 285 200, 285 152 C285 96, 252 66, 200 66 Z';

/**
 * 눈 — 흰자·홍채·속눈썹 없이 짙은 색 덩어리 하나.
 * 눈꺼풀은 살구색 판이 위에서 내려와 덮는 방식이라,
 * 쉬고 있을 때는 눈 위 살색과 구별되지 않아 보이지 않는다.
 * 감김선은 판보다 한참 위에 그려 두어, 다 감았을 때만 눈 한가운데로 온다.
 */
function eyeGroup(P, side) {
  const cx = side === 'l' ? 169 : 231;
  const id = (n) => `ch-${n}-${side}`;

  return `
        <g id="${id('eye')}">
          <g id="${id('pupil')}">
            <ellipse cx="${cx}" cy="176" rx="11.5" ry="14.5" fill="${P.eye}"/>
            <circle cx="${cx + 4}" cy="170" r="3.7" fill="#FFFFFF"/>
          </g>
          <path id="${id('heart')}"
                d="M${cx} 169 C${cx + 6} 161, ${cx + 15} 167, ${cx + 9} 176 L${cx} 187 L${cx - 9} 176
                   C${cx - 15} 167, ${cx - 6} 161, ${cx} 169 Z"
                fill="${P.heart}" opacity="0"/>
          <g clip-path="url(#ch-clip-eye-${side})">
            <g id="${id('lid')}">
              <rect x="${cx - 28}" y="112" width="56" height="47" fill="${P.skin}"/>
              <path d="M${cx - 12} 141 Q${cx} 147 ${cx + 12} 141" fill="none"
                    stroke="${P.eye}" stroke-width="4" stroke-linecap="round"/>
            </g>
          </g>
        </g>`;
}

/* 웃는 눈 — 플랫 스타일에서는 단순한 아치가 가장 자연스럽다 */
function smileEye(P, side) {
  const cx = side === 'l' ? 169 : 231;
  return `
        <path id="ch-smile-${side}" d="M${cx - 13} 182 Q${cx} 161 ${cx + 13} 182"
              fill="none" stroke="${P.eye}" stroke-width="5.5" stroke-linecap="round" opacity="0"/>`;
}

function humanSVG(P) {
  return `
<svg id="ch-svg" viewBox="0 -30 400 500" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="${P.label}">
  <defs>
    <clipPath id="ch-clip-eye-l"><rect x="144" y="160" width="50" height="35"/></clipPath>
    <clipPath id="ch-clip-eye-r"><rect x="206" y="160" width="50" height="35"/></clipPath>
  </defs>

  <g id="ch-root">
    <g id="ch-feet"></g>

    <g id="ch-char">

      <!-- 목 -->
      <path d="M179 232 H221 V300 H179 Z" fill="${P.skinDark}"/>

      <!-- 상의 -->
      <path d="M100 476 L100 396
               C100 348, 124 306, 164 296
               C178 288, 222 288, 236 296
               C276 306, 300 348, 300 396
               L300 476 Z" fill="${P.top}"/>
      ${P.collar}

      <g id="ch-head">

        <!-- 뒷머리 -->
        ${P.hairBack || ''}

        <!-- 귀 -->
        <ellipse cx="116" cy="170" rx="11" ry="14" fill="${P.skin}"/>
        <ellipse cx="284" cy="170" rx="11" ry="14" fill="${P.skin}"/>

        <!-- 얼굴 -->
        <path d="${FACE_PATH}" fill="${P.skin}"/>

        <!-- 앞머리 -->
        ${P.hairFront}
        <g id="ch-crest">${P.tuft || ''}</g>

        <!-- 볼 -->
        <ellipse id="ch-cheek-l" cx="145" cy="200" rx="17" ry="10.5" fill="${P.cheek}" opacity="0"/>
        <ellipse id="ch-cheek-r" cx="255" cy="200" rx="17" ry="10.5" fill="${P.cheek}" opacity="0"/>
        <ellipse cx="145" cy="200" rx="17" ry="10.5" fill="${P.cheek}" opacity="0.55"/>
        <ellipse cx="255" cy="200" rx="17" ry="10.5" fill="${P.cheek}" opacity="0.55"/>

        <!-- 눈물 -->
        <g id="ch-tears" opacity="0">
          <path d="M150 190 C143 202, 142 214, 150 218 C158 214, 157 202, 150 190 Z" fill="${P.tear}"/>
          <path d="M250 190 C243 202, 242 214, 250 218 C258 214, 257 202, 250 190 Z" fill="${P.tear}"/>
        </g>

        ${eyeGroup(P, 'l')}
        ${eyeGroup(P, 'r')}
        ${smileEye(P, 'l')}
        ${smileEye(P, 'r')}

        <!-- 눈썹 : 단순한 곡선 하나 -->
        <g id="ch-brow-l">
          <path d="M152 ${154 + P.browTilt} Q169 ${145 - P.browArch} 186 152"
                fill="none" stroke="${P.brow}" stroke-width="${P.browW}" stroke-linecap="round"/>
        </g>
        <g id="ch-brow-r">
          <path d="M248 ${154 + P.browTilt} Q231 ${145 - P.browArch} 214 152"
                fill="none" stroke="${P.brow}" stroke-width="${P.browW}" stroke-linecap="round"/>
        </g>

        <!-- 입 -->
        <g id="ch-beak">
          <g id="ch-mouth-open">
            <path d="M176 208 L224 208 C224 236, 212 246, 200 246
                     C188 246, 176 236, 176 208 Z" fill="${P.mouth}"/>
            <path d="M178 208 L222 208 L221 217 Q200 221 179 217 Z" fill="#FFFFFF"/>
            <ellipse cx="200" cy="240" rx="11" ry="6" fill="${P.tongue}"/>
          </g>
          <g id="ch-beak-lower">
            <path d="M182 207 Q200 226 218 207" fill="none" stroke="${P.mouth}"
                  stroke-width="5.5" stroke-linecap="round"/>
          </g>
        </g>
      </g>

      <!-- 엔진이 좌우 흔들림을 걸어 두는 자리 (플랫 상반신은 팔이 없다) -->
      <g id="ch-wing-l"></g>
      <g id="ch-wing-r"></g>
    </g>

    <g id="ch-fx"></g>
  </g>
</svg>`;
}

/* 공통 살색 · 이목구비 색 (두 캐릭터가 같은 톤을 쓴다) */
const FLAT_BASE = {
  skin: '#F8C9A4', skinDark: '#F1B993',
  eye: '#3C2F2C', cheek: '#F2938E',
  mouth: '#7C3B44', tongue: '#E8798A',
  tear: '#5AB9F5', heart: '#F2707F',
};

/* --- 준호 : 짧은 검은 머리 + 파란 상의 --- */
const JUNHO = {
  ...FLAT_BASE,
  label: '준호 캐릭터',
  hair: '#332B29',
  brow: '#332B29', browW: 5.5, browArch: 2, browTilt: 0,
  top: '#4E8FD6',

  hairFront: `
    <path d="M200 52 C146 52, 109 88, 109 152
             C109 165, 113 174, 120 178
             C118 147, 124 124, 139 114
             C161 131, 215 133, 248 116
             C262 127, 268 149, 266 178
             C275 174, 291 165, 291 152
             C291 88, 254 52, 200 52 Z" fill="#332B29"/>`,

  tuft: '',

  collar: `
    <path d="M181 300 L200 326 L219 300" fill="none" stroke="#3F79BB"
          stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
};

/* --- 서연 : 갈색 단발 + 보라 상의 --- */
const SEOYEON = {
  ...FLAT_BASE,
  label: '서연 캐릭터',
  hair: '#7B4A2E',
  brow: '#7B4A2E', browW: 4.5, browArch: 3, browTilt: 1,
  top: '#B983D9',

  hairBack: `
    <path d="M200 50 C254 50, 296 90, 296 154
             C302 204, 308 258, 306 288
             C302 304, 276 306, 266 292
             C248 280, 234 276, 224 272
             C246 246, 256 212, 252 174
             C248 132, 234 108, 200 108
             C166 108, 152 132, 148 174
             C144 212, 154 246, 176 272
             C166 276, 152 280, 134 292
             C124 306, 98 304, 94 288
             C92 258, 98 204, 104 154
             C104 90, 146 50, 200 50 Z" fill="#7B4A2E"/>`,

  hairFront: `
    <path d="M200 48 C146 48, 107 88, 107 154
             C109 128, 117 110, 132 102
             C157 124, 213 128, 248 108
             C264 118, 291 132, 293 154
             C293 88, 254 48, 200 48 Z" fill="#7B4A2E"/>`,

  collar: `
    <path d="M177 294 C185 310, 194 318, 200 320
             C191 330, 174 328, 168 316 C163 306, 169 295, 177 294 Z" fill="#FFFFFF"/>
    <path d="M223 294 C215 310, 206 318, 200 320
             C209 330, 226 328, 232 316 C237 306, 231 295, 223 294 Z" fill="#FFFFFF"/>`,
};


export const CHARACTERS = {
  chorong: {
    id: 'chorong',
    name: '초롱이',
    tagline: '다정한 앵무새 친구',
    svg: BIRD_SVG,
    geom: BIRD_GEOM,
  },
  junho: {
    id: 'junho',
    name: '준호',
    tagline: '씩씩한 손주 같은 청년',
    svg: humanSVG(JUNHO),
    geom: { ...HUMAN_GEOM, thinkStroke: JUNHO.hair },
  },
  seoyeon: {
    id: 'seoyeon',
    name: '서연',
    tagline: '상냥한 손녀 같은 청년',
    svg: humanSVG(SEOYEON),
    geom: { ...HUMAN_GEOM, thinkStroke: SEOYEON.hair },
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
