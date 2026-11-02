import type { HistoryEntry } from '@aechak/domain'

/**
 * 서비스 문의 관리 예시 데이터.
 *
 * api 호스트의 `/inquiries`는 구매자가 자기 문의를 넣는 경로다 — 운영자가 전체 문의를 조회하고
 * 답변하는 admin 경로(`GET /admin/inquiries`·`POST /admin/inquiries/{id}/answer`)는 없다.
 * 그래서 목록·답변이 전부 예시다. 타입은 맞출 와이어 계약이 생기면 그 모양으로 옮긴다.
 */
export type AdminInquiryCategory = 'account' | 'payment' | 'delivery' | 'seller' | 'report' | 'etc'

export type AdminInquiryStatus = 'waiting' | 'in-progress' | 'answered' | 'closed'

export type AdminInquiryChannel = '앱' | '웹' | '이메일'

export interface AdminInquiry {
  id: string
  category: AdminInquiryCategory
  title: string
  /** 문의자 닉네임(마스킹된 식별자). */
  writerMasked: string
  channel: AdminInquiryChannel
  receivedAt: string
  /** 접수 후 지난 시간(시간 단위). 24를 넘으면 지연으로 본다. */
  elapsedHours: number
  status: AdminInquiryStatus
  body: string
  /** 같은 문의자의 이전 문의 이력. */
  previousInquiries: HistoryEntry[]
  answer?: string
  internalMemo?: string
}

export const adminInquiriesMock: AdminInquiry[] = [
  {
    id: 'inq_8812',
    category: 'payment',
    title: '결제는 됐는데 주문 내역에 안 보여요',
    writerMasked: '코코맘',
    channel: '앱',
    receivedAt: '10-26 22:14',
    elapsedHours: 11,
    status: 'waiting',
    body: '카드 승인 문자는 받았는데 주문 목록에 아무것도 없어요. 결제가 두 번 빠진 건 아닌지 확인해 주세요.',
    previousInquiries: [{ label: '배송 지연 문의', date: '09-30' }],
  },
  {
    id: 'inq_8806',
    category: 'delivery',
    title: '송장번호가 조회되지 않아요',
    writerMasked: '먼지아빠',
    channel: '웹',
    receivedAt: '10-26 15:02',
    elapsedHours: 18,
    status: 'in-progress',
    body: '배송 시작 알림은 왔는데 택배사 사이트에서 송장이 조회되지 않아요.',
    previousInquiries: [
      { label: '송장 오류 문의', date: '10-12' },
      { label: '반품 접수 문의', date: '08-21' },
    ],
    internalMemo: '셀러에게 송장 재등록 요청 전달함.',
  },
  {
    id: 'inq_8790',
    category: 'seller',
    title: '셀러가 채팅에서 계좌 이체를 요구해요',
    writerMasked: '초코집사',
    channel: '앱',
    receivedAt: '10-25 09:41',
    elapsedHours: 48,
    status: 'waiting',
    body: '상품 문의를 했는데 수수료를 아끼게 해 준다며 계좌로 보내 달라고 했어요. 캡처를 첨부했어요.',
    previousInquiries: [],
  },
  {
    id: 'inq_8771',
    category: 'account',
    title: '카카오 로그인이 안 돼요',
    writerMasked: '라이카맘',
    channel: '이메일',
    receivedAt: '10-24 11:20',
    elapsedHours: 72,
    status: 'answered',
    body: '어제까지 쓰던 카카오 계정으로 로그인하면 화면이 멈춰요.',
    previousInquiries: [{ label: '로그인 오류 문의', date: '10-23' }],
    answer: '카카오 계정 연결을 초기화했어요. 앱을 완전히 종료한 뒤 다시 로그인해 주세요.',
  },
  {
    id: 'inq_8744',
    category: 'report',
    title: '신고한 리뷰가 그대로 보여요',
    writerMasked: '멍멍마켓',
    channel: '웹',
    receivedAt: '10-23 16:55',
    elapsedHours: 96,
    status: 'closed',
    body: '욕설 리뷰를 신고했는데 아직 노출되고 있어요.',
    previousInquiries: [{ label: '리뷰 신고 문의', date: '10-20' }],
    answer: '신고 건은 검토 후 비공개로 전환했어요. 반영까지 최대 1시간이 걸려요.',
    internalMemo: '제재 이력은 신고 제재 관리에 기록됨.',
  },
  {
    id: 'inq_8730',
    category: 'etc',
    title: '적립금이 사라졌어요',
    writerMasked: '보리네집',
    channel: '앱',
    receivedAt: '10-22 08:10',
    elapsedHours: 120,
    status: 'answered',
    body: '3,000원 있던 적립금이 0원이 됐어요. 쓴 기억이 없어요.',
    previousInquiries: [],
    answer: '10-21 주문에서 적립금 3,000원이 사용됐어요. 주문 상세에서 사용 내역을 확인할 수 있어요.',
  },
]
