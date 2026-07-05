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

export interface SellerApplication {
  id: string
  applicantName: string
  sellerType: 'business' | 'individual'
  businessNumberMasked?: string
  status: SellerApplicationStatus
  appliedAt: string
  representativeNameMasked: string
  phoneMasked: string
  documents: { key: string; label: string }[]
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
