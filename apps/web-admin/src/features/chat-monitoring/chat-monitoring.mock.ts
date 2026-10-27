/**
 * 채팅 CS 모니터링 예시 데이터.
 *
 * 채팅 자체가 BE에 아직 없다(열려 있는 SNS 경로는 `/sns/me`·`/sns/users/{publicId}` 프로필뿐).
 * 모니터링은 그 위에 얹히는 기능이라 더 뒤다 — 그래서 상담방 목록·대화 내용이 전부 예시다.
 *
 * 대화 내용을 담는 이유: 운영자가 개입을 판단하는 화면이라 목록만으로는 쓸모를 알 수 없다.
 * 위험 신호(`riskSignals`)는 나중에 AI 탐지 결과가 들어올 자리다.
 */
export type AdminChatRiskLevel = 'none' | 'watch' | 'high'

export type AdminChatStatus = 'open' | 'intervened' | 'closed'

export interface AdminChatMessage {
  speaker: 'buyer' | 'seller' | 'admin'
  text: string
  at: string
}

export interface AdminChatRoom {
  id: string
  buyerMasked: string
  sellerName: string
  productName: string
  lastMessageAt: string
  messageCount: number
  riskLevel: AdminChatRiskLevel
  /** 감지된 위험 문구 분류. 비어 있으면 신호 없음이다. */
  riskSignals: string[]
  status: AdminChatStatus
  transcript: AdminChatMessage[]
  interventionMemo?: string
}

export const adminChatRoomsMock: AdminChatRoom[] = [
  {
    id: 'ROOM-4821',
    buyerMasked: '초코집사',
    sellerName: '멍멍마켓',
    productName: '프리미엄 관절 영양제 180정',
    lastMessageAt: '10-26 18:42',
    messageCount: 14,
    riskLevel: 'high',
    riskSignals: ['계좌번호 노출', '외부 거래 유도'],
    status: 'open',
    transcript: [
      { speaker: 'buyer', text: '두 개 사면 더 싸게 해 주실 수 있어요?', at: '18:30' },
      {
        speaker: 'seller',
        text: '수수료를 아끼면 가능해요. 계좌로 보내 주시면 바로 발송할게요.',
        at: '18:36',
      },
      { speaker: 'buyer', text: '계좌가 어디예요?', at: '18:40' },
      { speaker: 'seller', text: '○○은행 123-456-789012 입니다.', at: '18:42' },
    ],
  },
  {
    id: 'ROOM-4790',
    buyerMasked: '먼지아빠',
    sellerName: '냥이상점',
    productName: '수제 오리목뼈 간식 500g',
    lastMessageAt: '10-26 11:05',
    messageCount: 9,
    riskLevel: 'watch',
    riskSignals: ['욕설 의심'],
    status: 'open',
    transcript: [
      { speaker: 'buyer', text: '발송이 왜 이렇게 늦어요? 벌써 이틀째예요.', at: '10:40' },
      { speaker: 'seller', text: '원물 입고가 늦어져 죄송해요. 내일 바로 보낼게요.', at: '10:52' },
      { speaker: 'buyer', text: '장난하는 거예요? 환불해 주세요.', at: '11:05' },
    ],
  },
  {
    id: 'ROOM-4755',
    buyerMasked: '코코맘',
    sellerName: '보리펫샵',
    productName: '펫 드라이룸 필터',
    lastMessageAt: '10-25 14:12',
    messageCount: 6,
    riskLevel: 'none',
    riskSignals: [],
    status: 'closed',
    transcript: [
      { speaker: 'buyer', text: '3L 기기에도 맞나요?', at: '13:58' },
      { speaker: 'seller', text: '3L 모델은 규격이 달라요. 호환표를 보내 드릴게요.', at: '14:05' },
      { speaker: 'buyer', text: '확인했어요. 감사해요.', at: '14:12' },
    ],
  },
  {
    id: 'ROOM-4712',
    buyerMasked: '보리네집',
    sellerName: '냥이상점',
    productName: '원목 캣타워 대형',
    lastMessageAt: '10-25 20:30',
    messageCount: 21,
    riskLevel: 'high',
    riskSignals: ['분쟁 격화', '욕설 의심'],
    status: 'intervened',
    transcript: [
      { speaker: 'buyer', text: '열었더니 기둥이 갈라져 있었어요.', at: '19:40' },
      { speaker: 'seller', text: '출고 전 사진에는 없던 파손이에요. 택배사 과실 같아요.', at: '19:55' },
      { speaker: 'buyer', text: '그러면 저는 어쩌라는 거죠?', at: '20:10' },
      {
        speaker: 'admin',
        text: '운영팀이에요. 반품 접수를 확인했고 중재 절차로 진행할게요.',
        at: '20:30',
      },
    ],
    interventionMemo: '파손 반품 중재로 전환 — 클레임 CLM-2041과 연결.',
  },
  {
    id: 'ROOM-4688',
    buyerMasked: '라이카맘',
    sellerName: '보리펫샵',
    productName: '저알러지 건식사료 5kg',
    lastMessageAt: '10-24 09:18',
    messageCount: 4,
    riskLevel: 'none',
    riskSignals: [],
    status: 'closed',
    transcript: [
      { speaker: 'buyer', text: '알러지 있는 아이도 먹을 수 있나요?', at: '09:02' },
      { speaker: 'seller', text: '단일 단백질이라 대체로 괜찮지만 수의사 상담을 권해요.', at: '09:18' },
    ],
  },
]
