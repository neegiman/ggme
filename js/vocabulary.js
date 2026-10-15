// Manually curated, offline data. Era labels describe use/cultural context,
// not birth cohorts, first attestations, or exclusive knowledge by an age group.
export const WORD_SOURCES = {
  history: { title: '국립국어원 · 광복 70주년 학술 자료집 (2015)', url: 'https://www.korean.go.kr/common/download.do?c_file_name=195dbae9-4a90-4466-a7fa-4b1109162d97_0.pdf&file_path=reportData&o_file_name=2015.pdf', detail: '「핵심어로 본 시대상의 변화」 37~40·48쪽. 신문 어휘의 사용 추이를 참고했습니다.' },
  chat1999: { title: '국립국어연구원 · 컴퓨터 대화방의 언어 (1999)', url: 'https://www.korean.go.kr/nkview/nknews/199909/14_5.htm', detail: '당시 통신어의 표기와 뜻을 확인했습니다. 현재 국립국어원의 전신 기관 자료입니다.' },
  online2005: { title: '국립국어원 · 우리말 다듬기 사이트의 운영 내용 및 성과 (2005)', url: 'https://www.korean.go.kr/nkview/nklife/2005_1/2005_0103.pdf#page=14', detail: '『새국어생활』 15권 1호, 박용찬, 50쪽의 신세대 언어와 주석을 참고했습니다.' },
  dictionary2016: { title: '국립국어원 · 개방형 한국어 통합사전 홍보 결과보고서 (2016)', url: 'https://www.korean.go.kr/common/download.do?c_file_name=0343472f-40ff-4078-8b90-0a76d3f1f2a2_0.pdf&file_path=reportData&o_file_name=2016.pdf', detail: '부록의 우리말샘 소개 기사에 나온 1970~80년대 미팅 관련 표현을 참고했습니다.' },
  culture: { title: '대한민국역사박물관 · 한국 대중문화의 역사', url: 'https://www.much.go.kr/webzine/vol47/sub/sub2.html', detail: '통기타·장발·청바지·미니스커트의 청년문화와 1980년대 오빠 부대의 배경을 보완했습니다.' },
  bellBottoms: { title: '한국학중앙연구원 · 나팔바지', url: 'https://encykorea.aks.ac.kr/Article/E0079873', detail: '나팔바지의 형태와 1970년대 유행 시기를 확인했습니다.' },
  vogue: { title: '한국학중앙연구원 · 유행어', url: 'https://encykorea.aks.ac.kr/Article/E0041982', detail: '1960년대 사회적 표현의 사용 맥락을 보완했습니다.' },
  survey: { title: '국립국어원 20년사 · 신어 조사', url: 'https://www.korean.go.kr/niklintro2/20years05_03_02.jsp', detail: '1994년 신어 조사 시작과 조사어가 곧 최초 발생 연도를 뜻하지 않는다는 점을 확인했습니다.' }
};

function pack(label, summary, source, rows) {
  return { label, summary, entries: rows.map(([word, meaning, sources = [source]]) => ({ word, meaning, sources })) };
}
export const ERA_PACKS = {
  era60: pack('60년대 · 시대어', '학교·방송·생활의 옛말과 당시 사회적 표현', 'history', [
    ['국민학교', '초등학교의 이전 이름.'],
    ['방송극', '라디오나 텔레비전으로 방송하는 극.'],
    ['합승', '다른 손님과 함께 차를 타는 일. 여기서는 당시 합승 택시의 맥락.'],
    ['기성회비', '학교 운영을 돕는 기성회에 내던 돈.'],
    ['학부형', '학생의 부모나 보호자를 이르던 말.'],
    ['양회', '시멘트를 이르던 말.'],
    ['통닭', '닭을 통째로 익힌 음식. 치킨보다 먼저 쓰이던 이름.'],
    ['라디오', '전파로 전달된 소리를 듣는 기기 또는 방송.'],
    ['저자세', '상대에게 자신을 낮추며 대하는 태도.', ['vogue']],
    ['고자세', '상대를 아래로 보며 거만하게 대하는 태도.', ['vogue']],
    ['자의반 타의반', '자기 뜻과 남의 뜻이 반씩 섞여 일을 하게 됨.', ['vogue']],
    ['시행착오', '직접 해 보고 잘못을 고치며 방법을 찾는 과정.', ['vogue']]
  ]),
  era70: pack('70년대 · 청년문화', '미팅·음악·패션과 생활의 추억말', 'culture', [
    ['고고팅', '고고장에서 춤을 추며 하는 미팅.', ['dictionary2016']],
    ['등산팅', '함께 등산하며 하는 미팅.', ['dictionary2016']],
    ['소개팅', '소개를 통해 이성과 만나는 자리.', ['dictionary2016']],
    ['고고장', '고고 음악에 맞춰 춤을 추던 장소.', ['dictionary2016']],
    ['통기타', '전기 증폭 없이 울림통으로 소리를 내는 기타.'],
    ['포크송', '민요의 영향을 받은 대중음악. 통기타 문화의 대표 장르.'],
    ['장발', '길게 기른 머리.'],
    ['청바지', '데님으로 만든 바지. 당시 청년문화의 상징 중 하나.'],
    ['미니스커트', '무릎 위로 올라오는 짧은 치마.'],
    ['나팔바지', '무릎 아래부터 밑단이 넓게 퍼지는 바지.', ['bellBottoms']],
    ['정부미', '정부가 수매·관리해 공급하던 쌀.', ['history']],
    ['일반미', '정부미와 구별해 민간에서 거래하던 쌀.', ['history']]
  ]),
  era80: pack('80년대 · 학교와 대중문화', '서클·학력고사·카세트와 아날로그 문화', 'history', [
    ['서클', '같은 취미나 관심사로 모인 동아리를 이르던 말.'],
    ['카세트', '자기 테이프를 이용하는 녹음·재생 기기.'],
    ['레코드', '소리를 기록해 두고 재생하는 원반형 음반.'],
    ['디스코', '강한 리듬의 댄스 음악이나 그에 맞춰 추는 춤.'],
    ['학력고사', '수능 이전에 대학 입학 전형에 쓰이던 시험.'],
    ['눈치작전', '다른 사람의 움직임을 살피며 유리한 선택을 노리는 일.'],
    ['국민학생', '국민학교에 다니던 학생.'],
    ['비디오', '영상을 기록·재생하는 매체나 장치. 여기서는 테이프 문화의 맥락.'],
    ['팩시밀리', '전화 회선 등으로 문서의 내용을 보내는 기기. 팩스.'],
    ['에어로빅', '음악에 맞춰 몸을 움직이는 유산소 운동.'],
    ['오디오', '음악 등의 소리를 녹음·재생하는 장치.'],
    ['오빠 부대', '남성 연예인을 열성적으로 응원하던 팬 무리.', ['culture']]
  ]),
  era90: pack('90년대 · PC통신', '방가·즐통·영퀴, 채팅방에서 쓰던 말', 'chat1999', [
    ['방가', '반갑다는 뜻의 통신 인사.'],
    ['어솨요', '어서 오라는 뜻의 통신 인사.'],
    ['글쿤', '그렇군을 줄여 적은 표현.'],
    ['즐통', '즐겁게 통신하라는 뜻의 마무리 인사.'],
    ['영퀴', '영화 퀴즈를 줄인 말.'],
    ['통장', '여기서는 통신 장애의 줄임말. 은행 통장이 아님.'],
    ['정모', '동호회 등의 정기 모임.'],
    ['눈팅', '대화나 글쓰기에 참여하지 않고 보기만 하는 일.'],
    ['번개', '통신 중 갑자기 약속해 직접 만나는 모임.'],
    ['도배', '같은 대화방에 글이나 그림을 잇달아 올리는 일.'],
    ['잠수', '대화 중 잠시 자리를 비우거나 응답하지 않는 상태.'],
    ['추카', '축하를 소리 나는 대로 바꿔 적은 표현.']
  ]),
  era00: pack('00년대 · 인터넷 유행어', '하이루·허걱·아햏햏, 초기 인터넷의 표현', 'online2005', [
    ['하이루', '온라인에서 처음 만났을 때 쓰던 인사.'],
    ['알바', '아르바이트를 줄인 말.'],
    ['길치', '길을 잘 찾지 못하는 사람.'],
    ['몸치', '춤을 잘 추지 못하는 사람.'],
    ['꽃미남', '얼굴이 예쁘장하게 생긴 젊은 남성.'],
    ['강퇴', '대화방 등에서 강제로 내보내는 일.'],
    ['허걱', '예상 밖의 상황에 크게 놀라 내는 소리.'],
    ['헐', '뜻밖의 상황에 놀랐을 때 쓰는 반응.'],
    ['즐', '상대를 대화에서 밀어내던 표현. 단순한 즐겁다는 인사와 다름.'],
    ['악플', '다른 사람을 비방하거나 험담하는 댓글.'],
    ['아햏햏', '좋거나 황당한 기분을 말로 표현하기 어려울 때 쓰던 반응.'],
    ['얼짱', '외모가 뛰어난 사람을 이르던 말.', ['yearbook2005']]
  ])
};

WORD_SOURCES.yearbook2005 = { title: '국립국어원 · 2005 국어 연감, 국어 정책', url: 'https://www.korean.go.kr/nkview/kyear/2005/2005_01.html', detail: '얼짱 등 당시 신어의 쓰임을 참고했습니다.' };

export const ERA_WORDS = Object.fromEntries(Object.entries(ERA_PACKS).map(([id, p]) => [id, { label: p.label, summary: p.summary, kind: 'era', items: p.entries.map(entry => entry.word) }]));
const allEntries = Object.values(ERA_PACKS).flatMap(p => p.entries);
ERA_WORDS.eraMixed = { label: '60~00년대 · 모두 섞기', summary: '다섯 시대의 단어를 한데 섞어 세대 차이를 즐겨요.', kind: 'era', items: [...new Set(allEntries.map(entry => entry.word))] };
export const DEFAULT_WORD_PACK = 'eraMixed';
export function wordDetail(category, word) {
  const entries = category === 'eraMixed' ? allEntries : ERA_PACKS[category]?.entries;
  return entries?.find(entry => entry.word === word) ?? null;
}
