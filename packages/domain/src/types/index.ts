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
  // 삼을 것 — 조합명 중복 시 라인 충돌, 클라이언트 addl 변조로 결제 금액 조작이 가능하다.
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

// ── 구매자 주문 여정(web-buyer, b4-st-1 목록 / b1-st-6 상세) ──
// 셀러용 `Order`/`OrderStatus`는 "셀러 한 명의 단일 상품 주문 행"이고 상태머신도 셀러 관점
// (new_order/preparing/shipping/delivered)이다. 구매자 주문은 결제 한 번(주문그룹) 아래 셀러별 주문이
// 여럿 달리고 구매확정·취소완료까지 포함하는 다른 상태머신이라, 기존 `OrderStatus` 유니온을 확장하면
// web-seller의 `Record<OrderStatus, ...>`(주문 상태 라벨/색 맵)가 키 누락으로 typecheck가 깨진다.
// 따라서 구매자 전용 타입을 additive로 둔다 — 임의 병렬 타입이 아니라 셀러 주문과 별개인
// 구매자 주문 집계 도메인이다(셀러가 web-buyer 주문 상태를 다뤄야 하면 이 타입을 재사용/확장할 것).
//
// 서버 enum(PAID/DISPATCH_PENDING/…)은 어댑터(shared/order)가 아래 표시 상태로 접고, 원문은
// `rawStatus`에 보존한다. 서버 응답에 없는 값(결제수단 등)은 가짜 기본값으로 채우지 않고
// optional로 두어 UI가 숨긴다.
export type BuyerOrderStatus =
  | 'paid' // 결제완료
  | 'preparing' // 상품준비중(출고 대기 포함)
  | 'shipping' // 배송중
  | 'delivered' // 배송완료
  | 'confirmed' // 구매확정
  | 'cancelled' // 취소완료

// 품목 상태(서버 OrderItemStatus 대응). 부분 취소·반품·교환 요청이 품목 단위로 표시된다.
export type BuyerOrderItemStatus =
  'ordered' | 'cancelled' | 'return-requested' | 'returned' | 'exchange-requested'

// 주문에 포함된 상품(주문 시점 스냅샷 — 이후 카탈로그 가격/이름이 바뀌어도 주문 내역은 고정).
export interface BuyerOrderItem {
  name: string
  option: string
  quantity: number
  unitPrice: number
  itemStatus: BuyerOrderItemStatus
  thumbnailUrl?: string
  /** 상품 공개 식별자(products.public_id) — 상품 상세로 되돌아가는 링크에 쓴다. */
  productId: ProductId
  /** 서버 주문 품목 id. 리뷰 작성 API(POST /reviews)가 지목하는 대상이다. */
  orderItemId: number
}

// 주문그룹 안의 셀러별 주문 한 건(목록 카드 행). 상태는 셀러 주문 단위이고, 그룹에는 단일 상태가 없다.
export interface BuyerSellerOrder {
  orderId: OrderId
  /** 셀러 상호. 서버가 null을 줄 수 있어(탈퇴 셀러 등) optional. */
  storeName?: string
  status: BuyerOrderStatus
  /** 서버 상태 원문(PAID/DISPATCH_PENDING/…). 표시는 `status`, 분기 정밀도가 필요하면 이 값을 본다. */
  rawStatus: string
  /** 이 셀러 주문의 품목 라인 수. */
  itemCount: number
  /** 대표 품목(첫 라인). 전체 품목이 아니다 — 전체는 상세(`BuyerOrderDetail.items`)에만 있다. */
  representativeItem?: BuyerOrderItem
}

// 주문그룹(결제 한 번). 금액은 전부 그룹 전체 값이다.
export interface BuyerOrder {
  id: string // orderGroupId(ULID)
  orderedAt: string // ISO 8601(오프셋 포함) — 표시 포맷은 화면이 맡는다
  sellerOrders: BuyerSellerOrder[]
  itemsTotal: number
  shippingTotal: number
  couponDiscount: number
  pointsUsed: number
  paidAmount: number
}

// 주문그룹 전체 결제 요약(상세 화면의 "결제 금액(주문 전체)" 블록).
export interface BuyerOrderGroupPayment {
  itemsTotal: number
  shippingTotal: number
  couponDiscount: number
  pointsUsed: number
  paidAmount: number
}

// 주문 시점 배송지 스냅샷(주문 상세). 주소록(`DeliveryAddress`)과 달리 id·별칭·기본 여부가 없고
// 이후 주소록을 고쳐도 바뀌지 않는다 — 그래서 주소록 타입을 재사용하지 않는다.
export interface BuyerOrderDeliveryAddress {
  receiverName: string
  /** 숫자만(하이픈 없음) — 표시 조립은 화면이 맡는다. */
  contactNumber: string
  zipCode: string
  baseAddress: string
  detailAddress?: string
  deliveryMemo?: string
}

// 이 주문의 최신 배송(송장) 정보. 송장 등록 전에는 상세에 없다.
export interface BuyerOrderShipment {
  courierCode: string
  courierName: string
  trackingNumber: string
  dispatchedAt?: string // ISO 8601
  deliveredAt?: string // ISO 8601
  /** 택배사 추적 동기화의 최신 상태 문자열(열거형 아님). 동기화 경로가 없어 보통 비어 있다. */
  lastTrackingStatus?: string
}

// 진행 중 클레임 유형·상태(서버 ClaimType/ClaimStatus 대응). 구매자 상세는 읽기만 한다 —
// 요청·철회는 사유 코드 어휘가 미확정이라(SCRUM-273) 화면에 없다.
export type BuyerClaimType = 'cancel' | 'return' | 'exchange'

// 서버 ClaimStatus 7종 중 품목을 붙잡고 있는 5종만 상세에 실린다(거부·철회는 activeClaim이 null).
export type BuyerClaimStatus =
  | 'requested' // CLAIM_REQUESTED — 셀러 판단 대기
  | 'collecting' // COLLECTING — 회수 진행
  | 'approved' // APPROVED
  | 'admin-overridden' // ADMIN_OVERRIDDEN — 운영자 직권 처리
  | 'refund-failed' // REFUND_FAILED — 승인됐으나 환불 집행 실패

export type BuyerClaimRefundStatus = 'none' | 'requested' | 'done' | 'failed'

// 진행 중인 취소·반품·교환 1건(읽기 전용).
export interface BuyerOrderClaim {
  claimPublicId: string
  claimType: BuyerClaimType
  status: BuyerClaimStatus
  /** 서버 상태 원문. 표시는 `status`, 미지의 값 추적이 필요하면 이 값을 본다. */
  rawStatus: string
  refundStatus?: BuyerClaimRefundStatus
}

// 셀러 주문 상세(GET /orders/{orderId}). `sellerShippingFee`만 이 셀러 몫이고 `groupPayment`는
// 주문그룹 전체 값이라 화면이 라벨로 구분한다("이 주문의 배송비" vs "결제 금액(주문 전체)").
export interface BuyerOrderDetail {
  orderId: OrderId
  orderGroupId: string
  orderedAt: string // ISO 8601
  status: BuyerOrderStatus
  rawStatus: string
  storeName?: string
  items: BuyerOrderItem[]
  sellerShippingFee: number
  groupPayment: BuyerOrderGroupPayment
  /**
   * 주문 시점 배송지 스냅샷. 서버 계약은 non-null이지만 optional로 받는다 —
   * 이 한 필드가 비었을 때 주문 상세 전체가 백지가 되는 쪽이 카드 하나를 숨기는 쪽보다 나쁘다.
   */
  deliveryAddress?: BuyerOrderDeliveryAddress
  /** 송장 등록 전에는 없다. */
  shipment?: BuyerOrderShipment
  /** 진행 중 클레임이 없으면 없다 — 있으면 구매확정을 걸어 잠근다. */
  activeClaim?: BuyerOrderClaim
  /** 자동 구매확정 기한(ISO 8601). 배송완료 시점에 부여되므로 그 전 상태에서는 없다. */
  purchaseConfirmDueAt?: string
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

// 반려동물 프로필(b10-st-3 관리 / b10-st-8 작성). 대표 펫이 정확히 하나인 건 서버가 보장한다.
export interface PetProfile {
  id: string
  name: string
  species: PetSpecies
  breed?: string // 품종 라벨(표시용)
  breedId?: number // 품종 id(서버 breeds API의 breedId) — breed 라벨과 쌍으로 저장. API 연동 전 데이터는 라벨만 있을 수 있다
  birthYear?: number // 생년(예: 2023) — 나이는 표시 시 파생. 생년월 '모름'이면 birthYear/birthMonth 둘 다 undefined
  birthMonth?: number // 생월(1~12) — 생년이 있을 때만 유효. 나이 파생을 생일 경과 여부까지 반영하는 데 쓴다
  weightKg?: number // 체중(kg)
  photoUrl?: string // 표시용. 수정 왕복에는 profileImageKey를 쓴다.
  // 서버가 저장한 스토리지 키. 수정이 전체 객체 전송이라 이 값을 그대로 되돌려 보내지 않으면 사진이 지워진다
  profileImageKey?: string
  version?: number // 낙관적 락 토큰. 수정 요청에 실어 보내면 그 사이 선점됐는지 서버가 검사한다
  isDefault: boolean // 대표 펫
}

// 본인 인증 상태(b10-st-9). 미인증 → 휴대폰 OTP 인증 → 인증 완료.
export type VerificationStatus = 'unverified' | 'verified'

// 구매자 계정 프로필(b10-st-1/2/9). 마이 허브·프로필 수정·본인 인증 화면이 공유한다.
export interface BuyerAccount {
  nickname: string
  bio: string // 자기소개(프로필에 노출)
  email: string // 마스킹 표시용
  phone: string // 서버 마스킹 표시용 번호(인증 전 빈 문자열) — 클라이언트 마스킹 없음
  avatarUrl?: string // 표시용 URL
  profileImageKey?: string // 프로필 수정 시 사진 유지로 되돌려 보낼 원본 키(avatarUrl에서 역파싱 금지)
  isPendingOnboarding: boolean // 온보딩 미완료(PENDING) 여부 — 이 유저는 마이 허브 대신 온보딩으로 보낸다
  verification: VerificationStatus
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

// BE ApplicationStatus(DRAFT/SUBMITTED/REVIEWING/APPROVED/REJECTED/CANCELLED)와 1:1 —
// 과거 FE 전용 상태(pending/revision-requested/resubmitted)는 BE 응답 스키마에 존재하지 않아
// 제거됐다. 반려 후 재제출은 별도 상태가 아니라 REJECTED → (saveDraft 자동 reopen) → DRAFT →
// SUBMITTED 전이로 표현된다. reviewing/cancelled는 서버에 정의만 있고 현재 할당 경로가 없다.
export type SellerApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'cancelled'

// BE BusinessType(PERSONAL_GENERAL/SOLE_PROPRIETORSHIP/CORPORATE)과 1:1. sellerType은 admin
// 필터·표시용 굵은 분류로 그대로 두고, 세분류가 필요한 화면은 legalType을 본다.
export type SellerLegalType = 'individual' | 'individual-business' | 'corporate-business'

// BE DocumentType enum과 1:1. domain은 @aechak/api를 import하지 못해 같은 리터럴을 여기 한 번 더 둔다
// (api의 SellerDocumentType과 구조적으로 같아 서로 대입된다).
export type SellerDocumentKey =
  | 'ID_CARD'
  | 'BANKBOOK_COPY'
  | 'BUSINESS_REGISTRATION'
  | 'TELESALES_REPORT'
  | 'CORP_REGISTER'
  | 'CORP_SEAL'

// 신청 서류. BE는 종류(documentType)와 등록 시각만 갖는다 — 서류별 개별 상태(보완요청 등)는
// BE에 없고 반려는 신청 단위(rejectionReason)다. label은 FE가 documentType에서 파생한다.
export interface SellerApplicationDocument {
  key: SellerDocumentKey
  label: string
  uploadedAt?: string
}

// BE ApplicationResponse와 1:1인 셀러 신청서 + web-admin 심사 화면 전용 마스킹 프로젝션(optional).
// admin 심사 API(SCRUM-170)는 미머지 상태라 masked 계열은 admin mock에서만 채워진다.
export interface SellerApplication {
  id: string // BE applicationId(Long) 문자열화
  status: SellerApplicationStatus
  legalType: SellerLegalType // BE businessType 1:1 매핑
  businessName?: string
  businessRegNo?: string
  corpRegNo?: string
  representativeName?: string
  telesalesNumber?: string
  bankCode?: string
  accountNumberMasked?: string // 평문 계좌번호는 응답에 없다 — 수정하려면 재입력
  accountHolder?: string
  appliedAt: string
  submittedAt?: string
  decidedAt?: string
  rejectionReason?: string // REJECTED일 때만 값
  documents: SellerApplicationDocument[]
  // ── web-admin 심사 화면 전용(마스킹 프로젝션, admin mock에서만 채움) ──
  applicantName?: string
  sellerType?: 'business' | 'individual'
  businessNumberMasked?: string
  representativeNameMasked?: string
  phoneMasked?: string
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
