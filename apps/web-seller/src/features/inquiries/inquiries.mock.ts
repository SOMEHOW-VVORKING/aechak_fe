import type { StatusPillVariant } from '@aechak/design-system/web'

/**
 * 고객 문의 화면의 예시 데이터 단일 원본 — 화면 파일에 인라인하지 않는다(레포 관례).
 *
 * **BE가 생기면 갈아끼우는 방법**: seller 호스트에 목록(`GET /sellers/me/inquiries`)과 답변
 * (`POST /sellers/me/inquiries/{inquiryPublicId}/answer`)이 열리면 `inquiries.queries.ts`를 만들어
 * `SAMPLE_INQUIRIES` 자리에 그 응답을 넣고, 라우트에서 `SampleDataNotice`를 떼고 `isError` 경로를
 * 더한다(AGENTS.md 규약 7). 아래 타입은 와이어 모양에 맞춰 두어 필드 이름만 확인하면 된다.
 *
 * 실측(2026-10-26): 구매자 호스트에 `POST /api/v1/inquiries`(접수)만 있고 셀러가 받은 문의를 읽거나
 * 답변하는 경로는 없다.
 */

export type InquiryStatus = 'PENDING' | 'ANSWERED'
export type InquiryCategory = 'PRODUCT' | 'DELIVERY' | 'CLAIM' | 'ETC'

export interface SampleInquiry {
  inquiryPublicId: string
  category: InquiryCategory
  title: string
  content: string
  productName: string
  orderPublicId: string | null
  /** 구매자 이름은 서버가 마스킹해 내려줄 자리다 — 예시도 같은 모양으로 둔다. */
  authorMasked: string
  askedAt: string
  /** 비밀글은 구매자와 셀러만 본다. */
  secret: boolean
  status: InquiryStatus
  answer: { content: string; answeredAt: string } | null
}

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  PENDING: '답변 대기',
  ANSWERED: '답변 완료',
}

export const INQUIRY_STATUS_VARIANT: Record<InquiryStatus, StatusPillVariant> = {
  PENDING: 'warning',
  ANSWERED: 'success',
}

export const INQUIRY_CATEGORY_LABEL: Record<InquiryCategory, string> = {
  PRODUCT: '상품',
  DELIVERY: '배송',
  CLAIM: '취소/반품/교환',
  ETC: '기타',
}

export const SAMPLE_INQUIRIES: SampleInquiry[] = [
  {
    inquiryPublicId: 'INQ-2026-0421',
    category: 'PRODUCT',
    title: '소형견도 쓸 수 있는 크기인가요?',
    content:
      '4kg 포메라니안인데 급식기 입구 높이가 너무 높지 않을까 걱정돼요. 입구까지 높이가 몇 cm인지 알 수 있을까요?',
    productName: '자동 급식기 5L',
    orderPublicId: null,
    authorMasked: '김**',
    askedAt: '2026-10-26 09:14',
    secret: false,
    status: 'PENDING',
    answer: null,
  },
  {
    inquiryPublicId: 'INQ-2026-0420',
    category: 'DELIVERY',
    title: '제주도 추가 배송비가 따로 붙나요?',
    content: '제주시로 받으려는데 결제 화면에 추가 배송비가 안 보여서 확인 부탁드려요.',
    productName: '원목 캣타워 3단',
    orderPublicId: null,
    authorMasked: '이**',
    askedAt: '2026-10-25 21:38',
    secret: false,
    status: 'PENDING',
    answer: null,
  },
  {
    inquiryPublicId: 'INQ-2026-0419',
    category: 'CLAIM',
    title: '사이즈를 잘못 골라서 교환하고 싶어요',
    content: 'M으로 주문했는데 L이 필요해요. 아직 발송 전이면 교환으로 바꿀 수 있나요?',
    productName: '방수 하네스 (M)',
    orderPublicId: 'ORD-20261025-0088',
    authorMasked: '박**',
    askedAt: '2026-10-25 14:02',
    secret: true,
    status: 'PENDING',
    answer: null,
  },
  {
    inquiryPublicId: 'INQ-2026-0417',
    category: 'PRODUCT',
    title: '동결건조 간식 유통기한이 언제까지인가요?',
    content: '지금 발송되는 물건의 유통기한을 알고 싶어요.',
    productName: '동결건조 간식 100g',
    orderPublicId: null,
    authorMasked: '최**',
    askedAt: '2026-10-24 11:27',
    secret: false,
    status: 'ANSWERED',
    answer: {
      content:
        '문의 주셔서 감사해요. 현재 발송되는 물량은 2027년 4월 30일까지예요. 입고 주기가 짧아 늘 6개월 이상 남은 것만 보내 드려요.',
      answeredAt: '2026-10-24 13:05',
    },
  },
  {
    inquiryPublicId: 'INQ-2026-0415',
    category: 'DELIVERY',
    title: '송장번호가 조회가 안 돼요',
    content: '어제 발송 알림을 받았는데 택배사 앱에서 조회가 안 됩니다.',
    productName: '자동 급식기 5L',
    orderPublicId: 'ORD-20261022-0051',
    authorMasked: '정**',
    askedAt: '2026-10-23 18:40',
    secret: false,
    status: 'ANSWERED',
    answer: {
      content:
        '집화가 늦어져 등록이 하루 밀렸어요. 지금은 조회되는 상태이고, 오늘 중 도착 예정이에요. 불편을 드려 죄송해요.',
      answeredAt: '2026-10-23 19:12',
    },
  },
  {
    inquiryPublicId: 'INQ-2026-0412',
    category: 'ETC',
    title: '사업자 거래로 대량 구매가 가능한가요?',
    content: '반려동물 호텔을 운영하고 있어요. 50개 단위 견적이 가능한지 궁금해요.',
    productName: '동결건조 간식 100g',
    orderPublicId: null,
    authorMasked: '한**',
    askedAt: '2026-10-21 10:05',
    secret: true,
    status: 'ANSWERED',
    answer: {
      content: '네, 가능해요. 스토어 설정의 연락처로 수량과 희망 납기를 보내 주시면 견적을 드려요.',
      answeredAt: '2026-10-21 15:33',
    },
  },
]

/** 답변 기한(영업일 2일) — 미답변 중 기한이 지난 건을 세는 기준. 예시는 고정 날짜로 계산한다. */
export const INQUIRY_SAMPLE_TODAY = '2026-10-27'

export function isOverdue(inquiry: SampleInquiry): boolean {
  if (inquiry.status === 'ANSWERED') return false
  const askedDay = inquiry.askedAt.slice(0, 10)
  const elapsedDays =
    (Date.parse(`${INQUIRY_SAMPLE_TODAY}T00:00:00Z`) - Date.parse(`${askedDay}T00:00:00Z`)) /
    86_400_000
  return elapsedDays >= 2
}
