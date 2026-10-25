// 셀러 주문 BE(origin/develop `boot/seller/.../order/**`)와 화면 사이의 순수 타입·매핑·규칙.
// 와이어 타입은 전부 생성물(@aechak/api)에서 가져오고 이 파일은 FE 쪽 이름만 붙인다 — OpenAPI 스펙이
// 바뀌면 생성물을 재생성하는 것만으로 여기서 타입 오류가 드러난다. 서버 enum은 이 feature 밖으로
// 새지 않게 여기 가둔다(products.contract·store-settings.contract 관례).
//
// 날짜는 BE LocalDateTime(오프셋 없는 KST 벽시계, 예: 2026-10-24T10:00:00)이다. `+09:00`/`Z`를 붙이면
// 역직렬화가 400/90001로 실패하거나(오프셋) 9시간 밀린다(Z). 주문일 범위 필터만 yyyy-MM-dd다.
import type { StatusPillVariant } from '@aechak/design-system/web'
import type {
  ClaimStatus,
  ClaimType,
  GetSellerOrdersParams,
  OrderItemStatus,
  OrderStatus,
  SellerOrderStatusFilter,
} from '@aechak/api'

// 생성물 이름을 그대로 쓰되, 화면 코드가 읽기 쉬운 FE 이름을 붙인다.
export type WireOrderStatus = OrderStatus
export type WireOrderItemStatus = OrderItemStatus
export type WireClaimType = ClaimType
export type WireClaimStatus = ClaimStatus
export type OrderStatusSegment = SellerOrderStatusFilter

export type {
  /** 목록 행 한 건. 상세의 주문 단위 필드와 같은 모양이다. */
  SellerOrderSummary,
  /** 상세 = 목록 행 + `items`(품목 라인). */
  SellerOrderDetailData as SellerOrderDetail,
  /** 품목 라인 한 줄. `orderItemId`는 내부 숫자 PK다. */
  SellerOrderLine,
  SellerOrderShipment,
  SellerOrderClaim,
  SellerOrderListData as SellerOrderListResponse,
  ShipmentRegisterRequest,
  ShipmentRegisterData as ShipmentRegisterResponse,
} from '@aechak/api'

// ─── GET /sellers/me/orders ──────────────────────────────────────────────────
// 커서가 아니라 오프셋 페이지네이션(page·size)이고 정렬은 서버가 주문일 내림차순으로 고정한다.
// 빈 값 파라미터는 키째 빼서 보낸다(정규화는 orders.queries의 `normalizeOrderSearchParams`).

export type SellerOrderSearchParams = GetSellerOrdersParams

export const KEYWORD_MAX = 100
export const DEFAULT_PAGE_SIZE = 20

// ─── 상태 어휘 ───────────────────────────────────────────────────────────────
// **서버 `OrderStatus` 8종이 정본이다**(be `domain/.../order/enums/OrderStatus.kt`). SCRUM-274에서
// 허용값이 문서에 빠져 있다고 보고된 자리라 열거형을 직접 읽어 옮겼다. 화면 문구로 접는 것만 FE가 한다.
//
// `PENDING_PAYMENT`는 목록·상세 응답에 나오지 않는다 — 세그먼트 `all`조차 그것을 뺀 집합이라
// (결제 전 주문이 테이블에 남는 모델) 셀러에게 미결제 건을 보이지 않는다. 그래도 Record에서 빼지
// 않는다: 서버가 보낼 수 있는 값이 하나라도 매핑에서 빠지면 그 행이 `undefined` 라벨로 그려진다.
export const ORDER_STATUS_LABEL: Record<WireOrderStatus, string> = {
  PENDING_PAYMENT: '결제 대기',
  PAID: '신규 주문',
  PREPARING: '상품준비중',
  DISPATCH_PENDING: '발송 대기',
  SHIPPING: '배송중',
  DELIVERED: '배송완료',
  PURCHASE_CONFIRMED: '구매확정',
  CANCELLED: '취소완료',
}

// AGENTS 4절(디자인 시스템): `danger`는 되돌리기 어려운 제재 전용, `muted`는 비활성/휴면 전용이다.
// 셀러가 손을 써야 하는 두 상태(상품준비중·발송 대기)만 `warning`으로 묶어 "할 일"로 보이게 하고,
// 신규 주문은 그보다 먼저 봐야 하는 자리라 `brand`다. 배송완료(구매확정 대기)와 구매확정은 둘 다
// 긍정 종결이지만 구매확정이 최종이라 색을 가른다. 취소완료는 셀러 잘못이 아닌 종결이라 `error`가
// 아니라 `muted`다(고칠 것이 있는 상태로 읽히면 안 된다).
// variant는 DS 소스가 정본(9종)이라 그 타입을 그대로 받는다 — 좁은 리터럴 유니온으로 베끼면
// DS가 이름을 바꿀 때 이 파일이 조용히 통과한다(products 라우트 관례).
export const ORDER_STATUS_VARIANT: Record<WireOrderStatus, StatusPillVariant> = {
  PENDING_PAYMENT: 'neutral',
  PAID: 'brand',
  PREPARING: 'warning',
  DISPATCH_PENDING: 'warning',
  SHIPPING: 'info',
  DELIVERED: 'success',
  PURCHASE_CONFIRMED: 'accent',
  CANCELLED: 'muted',
}

export const ORDER_ITEM_STATUS_LABEL: Record<WireOrderItemStatus, string> = {
  ORDERED: '주문',
  CANCELLED: '취소',
  RETURN_REQUESTED: '반품 요청',
  RETURNED: '반품 완료',
  EXCHANGE_REQUESTED: '교환 요청',
}

export const CLAIM_TYPE_LABEL: Record<WireClaimType, string> = {
  CANCEL: '취소',
  RETURN: '반품',
  EXCHANGE: '교환',
}

// 7종 전부 담는다 — `activeClaim`에는 품목을 붙잡고 있는 5종만 실리지만(거부·철회는 품목을 풀어주므로
// null) 서버가 보낼 수 있는 값을 매핑에서 빼면 그 자리가 빈칸이 된다.
export const CLAIM_STATUS_LABEL: Record<WireClaimStatus, string> = {
  CLAIM_REQUESTED: '요청 접수',
  COLLECTING: '회수중',
  APPROVED: '승인',
  REJECTED: '거부',
  ADMIN_OVERRIDDEN: '관리자 처리',
  REFUND_FAILED: '환불 실패',
  WITHDRAWN: '철회',
}

/**
 * 상태 세그먼트 — 서버 `SellerOrderStatusFilter`의 code 어휘다. **enum 이름이 아니다.**
 * 하나가 상태 여러 개를 묶으므로 화면 라벨도 묶인 쪽에 맞춘다(발송 대기 = 상품준비중 + 발송 대기,
 * 배송완료 = 배송완료 + 구매확정).
 */
export const ORDER_SEGMENT_LABEL: Record<OrderStatusSegment, string> = {
  all: '전체',
  new: '신규 주문',
  'awaiting-dispatch': '발송 대기',
  shipping: '배송중',
  delivered: '배송완료',
  cancelled: '취소',
}

export const ORDER_SEGMENTS = Object.keys(ORDER_SEGMENT_LABEL) as OrderStatusSegment[]

// ─── 처리 가능 판정 ──────────────────────────────────────────────────────────
// 서버 전이 규칙(be `SellerOrderService`)을 그대로 비춘다 — 버튼을 띄웠다가 409로 거절당하면
// 셀러는 자기가 무엇을 잘못했는지 알 수 없다. 서버가 최종 심판이므로 여기서 통과해도 409는 올 수 있고
// (다른 탭에서 먼저 처리한 경우) 그때는 `orderErrorMessage`가 문구를 맡는다.

/** 발주 확인: PAID → PREPARING. 그 밖은 409/50004. */
export const canAcceptOrder = (status: WireOrderStatus): boolean => status === 'PAID'

/**
 * 송장 등록: PREPARING·DISPATCH_PENDING에서만(그 밖은 409/50005) **그리고 최초 배송 행이 없을 때만**.
 * 이미 등록돼 있으면 409/50302다 — 서버에 송장 정정 경로가 없으므로 "송장 수정" 버튼을 두면 안 된다
 * (목업 시절에는 있었다).
 */
export const canRegisterShipment = (status: WireOrderStatus, hasShipment: boolean): boolean =>
  !hasShipment && (status === 'PREPARING' || status === 'DISPATCH_PENDING')

/** 배송 완료: SHIPPING → DELIVERED. 그 밖은 409/50002, 이미 완료된 배송은 409/50301. */
export const canCompleteDelivery = (status: WireOrderStatus): boolean => status === 'SHIPPING'

// ─── 표시 포맷 ───────────────────────────────────────────────────────────────

/** `2026-10-24T10:00:00` → `2026-10-24 10:00`. 서버가 오프셋 없는 벽시계를 주므로 Date를 거치지 않는다. */
export function formatOrderedAt(localDateTime: string): string {
  return `${localDateTime.slice(0, 10)} ${localDateTime.slice(11, 16)}`
}

/**
 * 연락처 가운데 자리를 가린다.
 *
 * 서버는 수령인명·연락처를 **평문**으로 준다(be `SellerOrderSummaryResponse` 주석: "마스킹은 화면이
 * 한다"). 셀러는 송장을 붙이려면 둘 다 온전히 봐야 하므로 지워 버릴 수는 없다 — 그래서 한눈에
 * 펼쳐지는 목록에서만 가리고, 실제로 발송을 준비하는 상세에서는 그대로 보여준다. 수령인명은 어차피
 * 송장에 찍히고 목록에서 주문을 분간하는 기준이라 가리지 않는다.
 *
 * 숫자만 세어 가리므로 하이픈 유무·국가번호 표기에 상관없이 동작한다. 가릴 만큼 길지 않으면
 * (6자리 이하) 원문을 그대로 돌려준다.
 */
export function maskContactNumber(contactNumber: string): string {
  const digits = contactNumber.replace(/\D/g, '')
  if (digits.length <= 6) return contactNumber
  const head = digits.slice(0, 3)
  const tail = digits.slice(-4)
  return `${head}-${'*'.repeat(digits.length - 7)}-${tail}`
}

/** 우편번호 + 기본주소 + 상세주소를 한 줄로. 상세주소는 null일 수 있다. */
export function formatDeliveryAddress(order: {
  zipCode: string
  baseAddress: string
  detailAddress: string | null
}): string {
  return [`(${order.zipCode})`, order.baseAddress, order.detailAddress].filter(Boolean).join(' ')
}

// ─── 에러 문구 ───────────────────────────────────────────────────────────────
// BE errorCode → FE 문구. 서버 message는 -습니다 격식체라 띄우지 않는다(카피 규칙).
// 인증 계열은 공유 클라이언트가 먼저 전역 처리한다 — 401은 refresh 재시도 뒤에도 실패하면
// setOnAuthExpired가 로그인으로 보낸다(셀러센터 main.tsx가 등록하는 핸들러는 그것 하나다).
// 403/20006은 셀러센터에 온보딩 화면이 없어 전역 핸들러를 등록하지 않으므로 아래 문구가 유일한 안내다.
// 어느 쪽이든 promise는 reject되어 화면까지 내려오므로 전역 이동 전/실패 시 보일 문구를 채운다.
const ERROR_MESSAGE: Record<number, string> = {
  20004: '로그인이 필요해요. 다시 로그인해 주세요.',
  20005: '이용이 제한된 계정이에요. 고객센터에 문의해 주세요.',
  20006: '구매자 앱에서 온보딩(약관/닉네임)을 완료한 뒤 이용할 수 있어요.',
  40004: '판매 활동이 가능한 계정이 아니라 처리할 수 없어요.',
  40006: '주문을 조회할 수 있는 계정이 아니에요.',
  50000: '주문을 찾을 수 없어요. 목록을 새로고침해 주세요.',
  50002: '지금 주문 상태에서는 할 수 없는 처리예요. 목록을 새로고침해 주세요.',
  50003: '내 주문이 아니라 처리할 수 없어요.',
  50004: '결제완료 상태의 주문만 발주 확인할 수 있어요. 목록을 새로고침해 주세요.',
  50005: '발송 대기 상태의 주문만 발송 처리할 수 있어요. 목록을 새로고침해 주세요.',
  50301: '이미 배송완료로 처리된 주문이에요.',
  50302: '이미 송장이 등록된 주문이에요. 송장 정정은 고객센터에 문의해 주세요.',
  50303: '택배사를 찾을 수 없어요. 택배사를 다시 선택해 주세요.',
  50304: '송장번호 형식이 선택한 택배사와 맞지 않아요.',
  90000: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  90001: '입력한 내용을 다시 확인해 주세요.',
  90003: '다른 곳에서 먼저 처리했어요. 새로고침 후 다시 시도해 주세요.',
}

// axios 타입을 안 끌어오려고 duck-typing(products·store-settings 관례). 에러 본문은 `{ errorCode, message }`.
export function orderErrorMessage(error: unknown): string {
  const code = (error as { response?: { data?: { errorCode?: number } } }).response?.data?.errorCode
  return (code !== undefined && ERROR_MESSAGE[code]) || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}
