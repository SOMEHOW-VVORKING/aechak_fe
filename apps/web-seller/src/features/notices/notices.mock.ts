import type { StatusPillVariant } from '@aechak/design-system/web'

/**
 * 알림/공지 화면의 예시 데이터 단일 원본 — 화면 파일에 인라인하지 않는다(레포 관례).
 *
 * **BE가 생기면 갈아끼우는 방법**: seller 호스트에 공지 목록(`GET /sellers/me/notices`)과 수신 설정
 * (`GET`·`PUT /sellers/me/notification-settings`)이 열리면 `notices.queries.ts`를 만들어
 * `SAMPLE_NOTICES`·`SAMPLE_NOTIFICATION_CHANNELS` 자리에 그 응답을 넣고, 수신 설정 저장을 그 PUT에
 * 연결한 뒤 라우트에서 `SampleDataNotice`를 떼고 `isError` 경로를 더한다(AGENTS.md 규약 7).
 *
 * 실측(2026-10-26): seller·admin 호스트 어디에도 공지/알림 경로가 없다 — 어드민 호스트는 관리자
 * 계정과 셀러 입점 심사 여섯 경로뿐이라 공지를 보내는 쪽도 없다. 발신(어드민)과 수신(셀러)이 함께
 * 생겨야 열 수 있는 화면이다.
 */

export type NoticeCategory = 'POLICY' | 'SYSTEM' | 'SETTLEMENT' | 'EVENT'
export type NoticeImportance = 'NORMAL' | 'IMPORTANT'

export interface SampleNotice {
  noticePublicId: string
  category: NoticeCategory
  importance: NoticeImportance
  title: string
  body: string
  /** 보낸 곳 — 운영자 조직 단위로 내려올 자리다. */
  sender: string
  sentAt: string
  read: boolean
}

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  POLICY: '정책',
  SYSTEM: '시스템',
  SETTLEMENT: '정산',
  EVENT: '행사',
}

export const NOTICE_CATEGORY_VARIANT: Record<NoticeCategory, StatusPillVariant> = {
  POLICY: 'brand',
  SYSTEM: 'info',
  SETTLEMENT: 'accent',
  EVENT: 'success',
}

export const SAMPLE_NOTICES: SampleNotice[] = [
  {
    noticePublicId: 'NTC-2026-0115',
    category: 'POLICY',
    importance: 'IMPORTANT',
    title: '11월 1일부터 반품 배송비 부담 기준이 바뀌어요',
    body: '단순 변심 반품의 배송비 부담 주체를 승인 시점에 반드시 고르도록 바뀌어요. 10월 31일까지 접수된 건은 기존 기준을 따르고, 11월 1일 이후 접수 건부터 새 기준이 적용돼요. 자세한 내용은 셀러 운영 정책 3장을 확인해 주세요.',
    sender: '애착 운영정책팀',
    sentAt: '2026-10-26 10:00',
    read: false,
  },
  {
    noticePublicId: 'NTC-2026-0114',
    category: 'SYSTEM',
    importance: 'NORMAL',
    title: '10월 29일 새벽 정기 점검 안내 (02:00~04:00)',
    body: '정기 점검 동안 셀러센터 접속과 주문 처리가 중단돼요. 송장 등록이 필요한 주문은 점검 전에 처리해 주세요. 점검이 일찍 끝나면 알림으로 다시 알려 드려요.',
    sender: '애착 플랫폼운영팀',
    sentAt: '2026-10-25 17:30',
    read: false,
  },
  {
    noticePublicId: 'NTC-2026-0112',
    category: 'SETTLEMENT',
    importance: 'NORMAL',
    title: '9월 정산 지급이 완료됐어요',
    body: '9월 판매분 정산 지급이 10월 23일에 완료됐어요. 정산/매출 화면에서 명세를 확인하실 수 있어요. 금액이 맞지 않으면 지급일로부터 30일 안에 이의를 접수해 주세요.',
    sender: '애착 정산팀',
    sentAt: '2026-10-23 14:20',
    read: true,
  },
  {
    noticePublicId: 'NTC-2026-0109',
    category: 'EVENT',
    importance: 'NORMAL',
    title: '11월 반려동물 주간 기획전 참여 셀러를 모집해요',
    body: '11월 10일부터 2주간 진행하는 기획전에 참여할 셀러를 모집해요. 참여 상품은 최소 10% 할인이 필요하고, 노출 비용은 플랫폼이 부담해요. 신청은 10월 31일까지예요.',
    sender: '애착 마케팅팀',
    sentAt: '2026-10-20 09:00',
    read: true,
  },
  {
    noticePublicId: 'NTC-2026-0104',
    category: 'POLICY',
    importance: 'NORMAL',
    title: '상품 등록 시 원산지 표기가 필수로 바뀌어요',
    body: '사료/간식 분류에 등록하는 상품은 원산지 표기가 필수예요. 이미 등록된 상품은 11월 15일까지 보완해 주세요. 기한이 지나면 검수에서 보류될 수 있어요.',
    sender: '애착 운영정책팀',
    sentAt: '2026-10-14 11:45',
    read: true,
  },
]

export type NotificationEvent = 'NEW_ORDER' | 'CLAIM' | 'SETTLEMENT' | 'INQUIRY'

export interface NotificationChannelSetting {
  event: NotificationEvent
  label: string
  description: string
  email: boolean
  sms: boolean
}

export const SAMPLE_NOTIFICATION_CHANNELS: NotificationChannelSetting[] = [
  {
    event: 'NEW_ORDER',
    label: '신규 주문',
    description: '결제가 끝난 주문이 들어오면 알려 드려요.',
    email: true,
    sms: true,
  },
  {
    event: 'CLAIM',
    label: '취소/반품/교환',
    description: '구매자가 클레임을 접수하면 알려 드려요.',
    email: true,
    sms: false,
  },
  {
    event: 'SETTLEMENT',
    label: '정산 지급',
    description: '월 정산이 확정되거나 지급되면 알려 드려요.',
    email: true,
    sms: false,
  },
  {
    event: 'INQUIRY',
    label: '고객 문의',
    description: '답변하지 않은 문의가 하루 이상 지나면 알려 드려요.',
    email: false,
    sms: false,
  },
]
