import type { BuyerOrder, BuyerOrderStatus } from '@aechak/domain'

// 계정 화면(b10-st-2 프로필 / b10-st-9 본인 인증 / b10-st-5 탈퇴) 공용 상수·파생 로직.
// 실제 계정/주문 데이터는 shared/account·shared/order 스토어가 단일 소스이고, 여기서는 검증·판정만 둔다.

export const NICKNAME_MAX = 12

// 서버(온보딩·프로필 수정 공통) 닉네임 규칙: NFC 정규화 후 완성형 한글·영문·숫자 2~12자.
// 공백·이모지·자모는 불가. 중복은 서버가 PUT 시점에 최종 판정(30001)하므로 여기선 형식만 검사한다.
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]{2,12}$/

export const BIO_MAX = 150

// 본인 인증(b10-st-9) 클라이언트 사전 검증 — 서버(@Pattern)와 동일한 규칙. 형식이 통과할 때만
// 발송 요청을 쏜다(위반은 서버도 400 errorCode 90001로 거절). 인증번호 대조는 전적으로 서버 소관.
export const OTP_LENGTH = 6
const PHONE_NUMBER_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/

export function isValidPhoneNumber(phone: string): boolean {
  return PHONE_NUMBER_PATTERN.test(phone.trim())
}

// 닉네임 형식 검증(실서버 정규식). 성공 시 목업의 "사용할 수 있는 닉네임이에요" 메시지를 돌려준다.
export function validateNickname(nickname: string): { ok: boolean; message: string } {
  const normalized = nickname.trim().normalize('NFC')
  if (normalized.length === 0) return { ok: false, message: '닉네임을 입력해 주세요.' }
  if (!NICKNAME_PATTERN.test(normalized))
    return { ok: false, message: '닉네임은 완성형 한글·영문·숫자 2~12자로 입력해 주세요.' }
  return { ok: true, message: '사용할 수 있는 닉네임이에요.' }
}

// ── 회원 탈퇴 차단 판정(b10-st-5) ──
// 진행 중인 거래(결제완료/상품준비중/배송중)가 하나라도 있으면 탈퇴할 수 없다.
// 반품/교환은 web-buyer 범위 밖이라 진행 중 주문만으로 판정한다.
export const WITHDRAW_BLOCKING_STATUSES: BuyerOrderStatus[] = ['paid', 'preparing', 'shipping']

export function getBlockingOrders(orders: readonly BuyerOrder[]): BuyerOrder[] {
  return orders.filter(o => WITHDRAW_BLOCKING_STATUSES.includes(o.status))
}

export function isWithdrawBlocked(orders: readonly BuyerOrder[]): boolean {
  return getBlockingOrders(orders).length > 0
}

// 진행 중 주문을 "배송 준비 중"(결제완료/상품준비중)과 "배송 중"으로 나눠 건수를 센다(탈퇴 제한 안내용).
export function blockingBreakdown(orders: readonly BuyerOrder[]): { label: string; count: number }[] {
  const blocking = getBlockingOrders(orders)
  const preparing = blocking.filter(o => o.status === 'paid' || o.status === 'preparing').length
  const shipping = blocking.filter(o => o.status === 'shipping').length
  return [
    { label: '배송 준비 중 주문', count: preparing },
    { label: '배송 중 주문', count: shipping },
  ].filter(row => row.count > 0)
}

export const WITHDRAW_RETENTION_YEARS = 5

// 탈퇴 시 삭제/비활성화되는 정보(안내 카드).
export const WITHDRAW_DELETED_INFO: { label: string; note: string }[] = [
  { label: '프로필 / 펫 정보', note: '비활성화' },
  { label: '적립금 / 쿠폰', note: '즉시 소멸' },
  { label: '찜 / 팔로우', note: '삭제' },
]

// 법령에 따라 보존되는 정보(안내 카드).
export const WITHDRAW_RETAINED_INFO: { label: string; note: string }[] = [
  { label: '채팅 / 댓글 / 리뷰 / 문의', note: '익명 처리' },
]
