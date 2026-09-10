/* =====================================================================
 *  회상 주제
 *
 *  사진이 없어도 회상 대화는 된다. 실제 회상 프로그램은 대부분 사진보다
 *  '주제'로 진행하고, 사진은 그 주제를 도와주는 단서로 쓴다. 보호자가 사진을
 *  올리기 전에도 첫날부터 이야기를 나눌 수 있어야 한다.
 *
 *  주제를 고른 기준
 *  1) 열 살에서 서른 살 무렵의 기억이 가장 또렷하고 풍부하게 떠오른다.
 *     그래서 학창 시절 · 첫 일 · 혼례 · 아이 키우던 때를 두텁게 넣었다.
 *  2) 지금 계절과 맞는 주제가 훨씬 잘 걸린다. 가을에 김장 이야기를 꺼내면
 *     "올해도 해야 하는데" 하면서 이야기가 이어진다.
 *  3) 정답이 없는 물음만 쓴다. 날짜나 이름을 맞히게 하면 기억력 검사가 된다.
 *
 *  주제는 사진 없는 기억(MEMORY)으로 저장한다. 그래야 고르는 순서 · 새로 들은
 *  이야기 확인 · 회기 기록이 사진과 똑같은 길을 탄다.
 * ===================================================================== */

/** 열 살~서른 살 무렵. 가장 또렷하게 떠오르는 시기라 넉넉히 둔다. */
const LIFE = [
  {
    key: 'childhood_play',
    title: '어릴 적 놀이',
    open: '어릴 때는 동무들이랑 주로 뭘 하고 노셨어요?',
  },
  {
    key: 'school',
    title: '학교 다니던 때',
    open: '학교 다니실 때 이야기 좀 들려주세요. 어떤 기억이 남으세요?',
  },
  {
    key: 'first_work',
    title: '처음 일하던 때',
    open: '처음 일 시작하셨을 때는 어떠셨어요?',
  },
  {
    key: 'first_pay',
    title: '첫 월급',
    open: '첫 월급 받으셨을 때 그 돈으로 뭘 하셨어요?',
  },
  {
    key: 'wedding',
    title: '혼례 치르던 날',
    open: '혼례 치르시던 날은 어떤 기억이 남으세요?',
  },
  {
    key: 'raising_kids',
    title: '아이들 키우던 때',
    open: '아이들 어릴 때 이야기 좀 들려주세요.',
  },
  {
    key: 'hometown',
    title: '살던 동네',
    open: '예전에 사시던 동네는 어떤 곳이었어요?',
  },
  {
    key: 'neighbors',
    title: '이웃들',
    open: '그때 이웃분들하고는 어떻게 지내셨어요?',
  },
  {
    key: 'mother_food',
    title: '어머니가 해 주시던 음식',
    open: '어머니가 해 주시던 음식 중에 지금도 생각나는 게 있으세요?',
  },
  {
    key: 'market',
    title: '장 보러 다니던 길',
    open: '예전에 장 보러 다니시던 이야기 좀 들려주세요.',
  },
  {
    key: 'proud',
    title: '가장 잘했다 싶은 일',
    open: '지나고 보니 참 잘했다 싶은 일이 있으세요?',
  },
];

/**
 * 계절·절기 주제.
 * 지금 계절과 맞으면 앞으로 당겨 제안한다. 몸으로 겪는 시기라 말문이 잘 트인다.
 * months 는 그 이야기가 어울리는 달.
 */
const SEASONAL = [
  {
    key: 'seollal',
    title: '설 명절',
    open: '설 쇠던 이야기 좀 들려주세요. 어떻게 지내셨어요?',
    months: [1, 2],
  },
  {
    key: 'spring_farm',
    title: '봄에 하던 일',
    open: '봄이 오면 어떤 일부터 하셨어요?',
    months: [3, 4, 5],
  },
  {
    key: 'summer_heat',
    title: '여름 나던 방법',
    open: '예전에는 더운 여름을 어떻게 나셨어요?',
    months: [6, 7, 8],
  },
  {
    key: 'chuseok',
    title: '추석 명절',
    open: '추석 쇠던 이야기 좀 들려주세요.',
    months: [9, 10],
  },
  {
    key: 'kimjang',
    title: '김장하던 날',
    open: '김장하시던 이야기 좀 들려주세요. 어떻게 하셨어요?',
    months: [11, 12],
  },
  {
    key: 'winter',
    title: '겨울 나던 이야기',
    open: '옛날 겨울은 어떻게 나셨어요?',
    months: [12, 1, 2],
  },
];

export const THEMES = [...LIFE, ...SEASONAL];

/** 지금 달에 어울리는 주제인가 */
export function inSeason(theme, month = new Date().getMonth() + 1) {
  return Array.isArray(theme.months) && theme.months.includes(month);
}

/**
 * 주제를 사진 없는 기억으로 만든다.
 * 제목은 초롱이가 말해도 되는 내용이라 확인된 것으로 둔다.
 * 다만 이건 어르신 개인의 사실이 아니라 이야깃거리일 뿐이므로 kind 로 갈라 둔다.
 */
export function themeToMemory(theme, ownerId = 'default') {
  return {
    owner_id: ownerId,
    title: theme.title,
    description: '',
    kind: 'THEME',
    theme_key: theme.key,
    open_prompt: theme.open,
    verification_status: 'CAREGIVER_VERIFIED',
    verified_fields: ['title'],
  };
}
