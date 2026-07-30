export type UserId = string
export type SellerId = string
export type OrderId = string
export type ProductId = string
export type ClaimId = string

export interface User {
  id: UserId
  email: string
  name: string
  role: 'seller' | 'admin' | 'customer'
  createdAt: string
}

export interface Seller {
  id: SellerId
  userId: UserId
  shopName: string
  status: 'pending' | 'approved' | 'suspended'
  createdAt: string
}

export type ProductSaleStatus = 'selling' | 'sold_out' | 'pending' | 'ended' | 'blinded' | 'suspended'
export type ProductInspectionStatus = 'pending' | 'approved' | 'rejected' | 'revision_needed'

export interface Product {
  id: ProductId
  sellerId: SellerId
  code: string
  name: string
  category: string
  price: number
  stock: number
  status: ProductSaleStatus
  inspectionStatus: ProductInspectionStatus
  rejectionReason?: string
  createdAt: string
  // 아래는 구매자(web-buyer) 그리드/상세가 쓰는 표시용 필드 — 전부 optional이라
  // 기존 web-seller/web-admin 소비부에는 영향 없음(임의 병렬 타입 대신 Product를 확장).
  originalPrice?: number
  storeName?: string
  thumbnailUrl?: string
  rating?: number
  reviewCount?: number
  isSoldOut?: boolean
}

// 구매자 장바구니 항목. productId + option 조합이 한 라인의 키다(같은 상품이라도 옵션이
// 다르면 별개 라인). `selected`는 장바구니 화면의 부분 선택 UI 상태로, 순수 클라이언트
// 값이지만 타입 필드일 뿐이라 도메인 순수성에는 영향이 없다.
export interface CartItem {
  productId: ProductId
  option: string
  quantity: number
  selected: boolean
  // 선택한 옵션 조합의 추가금(원). 조합별로 다르므로 상품 단위 캐시가 아니라 라인에 싣는다.
  // `selected`와 같은 순수 클라이언트 값이며 additive optional이라 목업 라인은 미설정(=추가금 0).
  additionalPrice?: number
  // 선택한 옵션 조합 id(전방 호환 — 서버 장바구니 연동 시 조합 식별용). 표시/합계는 option 문자열과
  // additionalPrice로 충분해 지금은 저장만 한다.
  //
  // TODO(후속, 실 cart/order/payment API 착수 전 필수): 가격/재고는 URL의 addl·option 문자열을
  // 신뢰하지 말고 서버에서 재검증하고, 라인 정체성을 조합명(option)이 아니라 optionCombinationId로
  // 삼을 것 — 조합명 중복 시 라인 충돌, 클라이언트 addl 변조로 결제 금액 조작이 가능하다(codex 리뷰 #11).
  optionCombinationId?: number
}

// 장바구니 라인 키(productId + option). 라인 스토어(shared/cart)와 파생 뷰(shared/catalog)가
// 같은 키 규칙을 공유해야 하는데 두 곳은 서로 import할 수 없어(eslint shared→shared 금지),
// 양쪽이 모두 의존하는 순수 함수라 도메인에 둔다.
export function cartLineKey(productId: string, option: string): string {
  return `${productId}::${option}`
}

// 구매자 배송지 주소록 항목(b10-st-4). 주문서(checkout)와 주소록 화면이 공유한다.
export interface DeliveryAddress {
  id: string
  /** 배송지 이름(집/회사 등). */
  label: string
  /** 받는 사람. */
  recipient: string
  phone: string
  zipcode: string
  /** 기본 주소(도로명/지번). */
  address1: string
  /** 상세 주소. */
  address2: string
  /** 배송 요청사항(선택) — 서버 deliveryMemo 필드와 동일 단어. */
  deliveryMemo?: string
  isDefault: boolean
}

// 구매자 결제 수단(b1-st-4 목업의 3종). 실제 PG 연동은 범위 밖 — 순수 목업 분기용.
export type PaymentMethod = 'kakaopay' | 'tosspay' | 'card'

export type OrderStatus = 'new_order' | 'preparing' | 'shipping' | 'delivered'

export interface Order {
  id: OrderId
  buyerId: UserId
  sellerId: SellerId
  productId: ProductId
  productName: string
  quantity: number
  buyerName: string
  recipientName: string
  totalPrice: number
  status: OrderStatus
  courier?: string
  trackingNumber?: string
  purchaseConfirmDeadline?: string
  createdAt: string
}

// ── 구매자 주문 여정(web-buyer Phase 3, b4-st-1/b1-st-6/b4-st-4) ──
// 셀러용 `Order`/`OrderStatus`는 "셀러 한 명의 단일 상품 주문 행"이고 상태머신도 셀러 관점
// (new_order/preparing/shipping/delivered)이다. 구매자 주문은 여러 셀러 상품을 묶은 집계이고
// 구매확정·취소완료까지 포함하는 다른 상태머신이라, 기존 `OrderStatus` 유니온을 확장하면
// web-seller의 `Record<OrderStatus, ...>`(주문 상태 라벨/색 맵)가 키 누락으로 typecheck가 깨진다.
// 따라서 구매자 전용 타입을 additive로 둔다 — 임의 병렬 타입이 아니라 셀러 주문과 별개인
// 구매자 주문 집계 도메인이다(셀러가 web-buyer 주문 상태를 다뤄야 하면 이 타입을 재사용/확장할 것).
export type BuyerOrderStatus =
  | 'paid' // 결제완료
  | 'preparing' // 상품준비중
  | 'shipping' // 배송중
  | 'delivered' // 배송완료
  | 'confirmed' // 구매확정
  | 'cancelled' // 취소완료

// 주문에 포함된 상품(주문 시점 스냅샷 — 이후 카탈로그 가격/이름이 바뀌어도 주문 내역은 고정).
export interface BuyerOrderItem {
  productId: ProductId
  name: string
  option: string
  quantity: number
  unitPrice: number
  thumbnailUrl?: string
}

// 셀러별 주문 그룹(배송비는 셀러 단위로 부과 — Phase 2 장바구니 order_group 구조와 일관).
export interface BuyerOrderSellerGroup {
  sellerId: SellerId
  storeName: string
  items: BuyerOrderItem[]
  shippingFee: number
}

// 운송장 정보(목업 — 실제 택배사 연동은 범위 밖).
export interface OrderShipment {
  courier: string
  trackingNumber: string
}

export interface BuyerOrder {
  id: OrderId // 주문번호(YYYYMMDD-####)
  orderedAt: string // 주문일시 표시 문자열
  status: BuyerOrderStatus
  groups: BuyerOrderSellerGroup[]
  method: PaymentMethod
  itemsTotal: number
  shippingTotal: number
  couponDiscount: number
  pointsUsed: number
  paidAmount: number
  pointsEarned: number
  shipment?: OrderShipment
  // 상태 전이 시각(목업 표시용). 배송완료 시 autoConfirmAt(D+N)까지 자동 구매확정 안내를 띄운다.
  shippedAt?: string
  deliveredAt?: string
  autoConfirmAt?: string
  confirmedAt?: string
  cancelledAt?: string
  refundedAt?: string
}

// ── 구매자 리뷰(web-buyer Phase 3, b4-st-2/b4-st-3/b4-st-6) ──
// 구매자가 작성한 리뷰. 상품 리뷰 목록(b4-st-3)·내 리뷰(b4-st-6)가 공유한다.
export interface Review {
  id: string
  productId: ProductId
  orderId: OrderId
  author: string
  rating: 1 | 2 | 3 | 4 | 5
  content: string
  images: string[]
  option?: string
  verifiedPurchase: boolean
  createdAt: string // 'YYYY.MM.DD'
}

// 리뷰 작성/수정 폼 입력값(제출 시 id/createdAt/author가 부여됨).
export interface ReviewDraft {
  productId: ProductId
  orderId: OrderId
  rating: number
  content: string
  images: string[]
}

// ── 구매자 계정/펫 프로필(web-buyer Phase 4, b10-st-1/2/3/5/8/9) ──
// 마이 허브·프로필 수정·본인 인증·펫 프로필은 셀러/어드민과 무관한 구매자 전용 개념이라
// additive 타입으로 둔다(기존 셀러용 타입 시그니처 무변경 — web-seller/web-admin 회귀 방지).

// 반려동물 종. 목업 세그먼트대로 강아지/고양이 2종만 수집한다.
export type PetSpecies = 'dog' | 'cat'

// 반려동물 프로필(b10-st-3 관리 / b10-st-8 작성). 대표 펫은 항상 정확히 하나로 정규화한다.
export interface PetProfile {
  id: string
  name: string
  species: PetSpecies
  breed?: string // 품종 라벨(표시용)
  breedId?: number // 품종 id(서버 breeds API의 breedId) — breed 라벨과 쌍으로 저장. API 연동 전 데이터는 라벨만 있을 수 있다
  birthYear?: number // 생년(예: 2023) — 나이는 표시 시 파생. 생년월 '모름'이면 birthYear/birthMonth 둘 다 undefined
  birthMonth?: number // 생월(1~12) — 생년이 있을 때만 유효. 나이 파생을 생일 경과 여부까지 반영하는 데 쓴다
  weightKg?: number // 체중(kg)
  photoUrl?: string
  isRepresentative: boolean // 대표 펫
}

// 본인 인증 상태(b10-st-9). 미인증 → 휴대폰 OTP 인증 → 인증 완료.
export type VerificationStatus = 'unverified' | 'verified'

// 구매자 계정 프로필(b10-st-1/2/9). 마이 허브·프로필 수정·본인 인증 화면이 공유한다.
export interface BuyerAccount {
  nickname: string
  bio: string // 자기소개(프로필에 노출)
  email: string // 마스킹 표시용
  phone: string // 본인 인증 입력 프리필용 전체 번호
  avatarUrl?: string
  verification: VerificationStatus
  verifiedPhoneMasked?: string // 인증 완료 시 마스킹된 번호
  verifiedAt?: string // 'YYYY.MM.DD'
}

export type ClaimType = 'cancel' | 'return' | 'exchange' | 'dispute'
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'collecting' | 'refunded'
export type ClaimResponsibleParty = 'buyer' | 'seller'

export interface Claim {
  id: ClaimId
  orderId: OrderId
  sellerId: SellerId
  type: ClaimType
  productName: string
  reason: string
  responsibleParty: ClaimResponsibleParty
  shippingFeeNote: string
  amount: number
  status: ClaimStatus
  memo?: string
  createdAt: string
}

export interface ShippingPolicy {
  sellerId: SellerId
  defaultCourier: string
  baseFee: number
  freeShippingThreshold: number
  originAddress: string
  returnAddress: string
  sameAsOrigin: boolean
  jejuExtraFee: number
  remoteAreaExtraFee: number
  returnFee: number
  exchangeFee: number
  avgDispatchDays: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasNext: boolean
}

export interface HistoryEntry {
  label: string
  date: string
}

export type SellerApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'revision-requested'
  | 'resubmitted'

// 'business'의 세부 유형(개인 사업자 vs 법인 사업자) — sellerType은 admin 필터·표시용 굵은 분류로 그대로 두고,
// 셀러 자신의 재제출 폼(b5-st-2)에서만 필요한 세부값이라 별도 optional 필드로 분리했다.
export type SellerLegalType = 'individual' | 'individual-business' | 'corporate-business'

export type SellerApplicationDocumentStatus = 'submitted' | 'resubmission-required' | 'not-applicable'

export interface SellerApplicationDocument {
  key: string
  label: string
  status?: SellerApplicationDocumentStatus
  note?: string
  required?: boolean
}

export interface SellerApplication {
  id: string
  applicantName: string
  sellerType: 'business' | 'individual'
  legalType?: SellerLegalType
  businessNumberMasked?: string
  status: SellerApplicationStatus
  appliedAt: string
  representativeNameMasked: string
  phoneMasked: string
  // 아래 필드들은 셀러 자신이 자기 신청서를 보는 화면(마스킹 불필요)에서만 채워진다 —
  // web-admin 심사 화면은 위 masked 필드만 계속 사용.
  representativeName?: string
  phone?: string
  phoneVerified?: boolean
  email?: string
  businessAddress?: string
  bankName?: string
  bankAccountNumber?: string
  bankAccountHolder?: string
  documents: SellerApplicationDocument[]
  resubmissionCount?: number
  rejectionReason?: string
  revisionNote?: string
  internalMemo?: string
}

export type SellerOperatingStatus = 'active' | 'suspended' | 'on-hold' | 'withdrawn'

export interface SellerAccount {
  id: string
  shopName: string
  representativeNameMasked: string
  sellerType: 'business' | 'individual'
  operatingStatus: SellerOperatingStatus
  productCount: number
  cumulativeOrders: number
  cumulativeReports: number
  lastActiveAt: string
  hasUnsettledAmount: boolean
  sanctionHistory: HistoryEntry[]
  suspensionReason?: string
  suspensionPeriod?: string
  internalMemo?: string
}

export type MemberAccountStatus = 'normal' | 'restricted' | 'suspended' | 'banned' | 'withdrawing'

export interface MemberAccount {
  id: string
  nickname: string
  orderCount: number
  reportCount: number
  accountStatus: MemberAccountStatus
  hasActiveOrder: boolean
  emailMasked: string
  phoneMasked: string
  joinChannel: string
  reportHistory: HistoryEntry[]
  sanctionReason?: string
  sanctionPeriod?: string
  internalMemo?: string
}

export type ProductReviewSaleStatus = 'on-sale' | 'suspended' | 'pending-review' | 'rejected'
export type ProductReviewActor = 'ai' | 'admin' | null
export type ProductReviewStatus = 'reviewing' | 'passed'

export interface ProductReviewItem {
  id: string
  name: string
  sellerName: string
  category: string
  price: number
  saleStatus: ProductReviewSaleStatus
  reportCount: number
  reviewActor: ProductReviewActor
  reviewStatus: ProductReviewStatus
  isBlinded: boolean
  blindType?: 'auto' | 'manual'
  registeredAt: string
  reportSummary?: string
  processReason?: string
  sellerNotice?: string
  internalMemo?: string
}

export type SettlementStatus = 'pending' | 'scheduled' | 'completed' | 'held'

export interface Settlement {
  orderId: OrderId
  // 월 선택기 필터링용 소속 월('YYYY-MM') — 구매확정 전(정산 대기/보류)이라 confirmedAt이
  // 없는 건도 필터가 걸려야 하므로 confirmedAt과 별개로 항상 채워지는 필수 필드다.
  settlementMonth: string
  confirmedAt?: string
  expectedPayoutDate?: string
  productAmount: number
  feeAmount?: number
  finalAmount?: number
  status: SettlementStatus
  // 건별 정산 상세 Drawer(표 행 클릭 시)용 세부 분해 — 정산 대기/보류 건은 아직 확정 전이라 비워둔다.
  shippingFee?: number
  couponBurden?: number
  platformFeeAmount?: number
  pgFeeAmount?: number
  refundDeduction?: number
}

export type AiReviewTargetType = 'product-image' | 'product-description' | 'review' | 'sns-post'
export type AiReviewDetectionStage = 1 | 2
export type AiReviewStatus =
  | 'pending'
  | 'auto-blinded'
  | 'admin-approved'
  | 'admin-rejected'
  | 'admin-deleted'

export interface AiReviewQueueItem {
  id: string
  targetType: AiReviewTargetType
  detectionReason: string
  detectionStage: AiReviewDetectionStage
  sellerName?: string
  productName?: string
  autoBlindedAt: string
  reviewStatus: AiReviewStatus
  aiReasoning?: string
  reviewHistory: { actor: 'ai' | 'admin'; label: string; date: string }[]
  processReason?: string
  sellerNotice?: string
  internalMemo?: string
}

// 구매자 상품 신고(b8-st-1-product). 제출 시 운영 검수 큐로 넘어가는 신고 사유·상세를 담는다.
// (신고자는 비공개 보호되므로 신고자 식별 정보는 이 타입에 두지 않는다.) SNS 게시물/유저
// 신고는 이번 범위 밖이라 상품 신고 사유만 모델링한다.
export type ProductReportReason =
  | 'false-ad' // 허위·과장 광고
  | 'wrong-info' // 상품 정보 오류
  | 'illegal' // 불법 및 미취급 상품
  | 'inappropriate' // 부적절한 내용
  | 'etc' // 기타

export interface ProductReport {
  id: string
  productId: ProductId
  reason: ProductReportReason
  /** 상세 내용(선택). */
  detail: string
  createdAt: string
}
