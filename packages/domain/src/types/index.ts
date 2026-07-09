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
}

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
