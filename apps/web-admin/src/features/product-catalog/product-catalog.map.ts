import type { AdminProductSummary, InspectionStatus, SaleStatus } from '@aechak/api'
import type {
  ProductCatalogInspectionStatus,
  ProductCatalogItem,
  ProductCatalogSaleStatus,
} from '@aechak/domain'
import type { StatusPillVariant } from '@aechak/design-system/web'

// 어드민 상품 카탈로그(`/admin/products`) 응답을 화면 어휘로 옮기는 매퍼. 와이어 열거·필드는 이
// 파일과 queries 안에만 둔다(AGENTS 6-2) — 화면은 소문자 어휘와 아래 라벨만 읽는다.

const SALE_STATUS_FROM_WIRE: Record<SaleStatus, ProductCatalogSaleStatus> = {
  ON_SALE: 'on-sale',
  OUT_OF_STOCK: 'out-of-stock',
  SUSPENDED: 'suspended',
  ENDED: 'ended',
}

const SALE_STATUS_TO_WIRE: Record<ProductCatalogSaleStatus, SaleStatus> = {
  'on-sale': 'ON_SALE',
  'out-of-stock': 'OUT_OF_STOCK',
  suspended: 'SUSPENDED',
  ended: 'ENDED',
}

const INSPECTION_STATUS_FROM_WIRE: Record<InspectionStatus, ProductCatalogInspectionStatus> = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

const INSPECTION_STATUS_TO_WIRE: Record<ProductCatalogInspectionStatus, InspectionStatus> = {
  draft: 'DRAFT',
  pending: 'PENDING',
  approved: 'APPROVED',
  rejected: 'REJECTED',
}

export const saleStatusToWire = (value: ProductCatalogSaleStatus): SaleStatus =>
  SALE_STATUS_TO_WIRE[value]

export const inspectionStatusToWire = (
  value: ProductCatalogInspectionStatus,
): InspectionStatus => INSPECTION_STATUS_TO_WIRE[value]

export interface StatusLabel {
  label: string
  variant: StatusPillVariant
}

export const SALE_STATUS_META: Record<ProductCatalogSaleStatus, StatusLabel> = {
  'on-sale': { label: '판매중', variant: 'success' },
  'out-of-stock': { label: '품절', variant: 'warning' },
  suspended: { label: '판매중지', variant: 'muted' },
  ended: { label: '판매종료', variant: 'muted' },
}

/**
 * 검수 상태 라벨 — **구매자에게 보이는지를 가르는 축**이라 '노출'이라는 말을 라벨에 담지 않는다.
 * 노출은 검수 승인 + 판매중 + 운영자 막음 없음이 함께 만드는 결과이고, 라벨 하나로 단정하면
 * 운영자가 승인만 보고 노출 중이라고 읽는다.
 */
export const INSPECTION_STATUS_META: Record<ProductCatalogInspectionStatus, StatusLabel> = {
  draft: { label: '작성 중', variant: 'muted' },
  pending: { label: '검수 대기', variant: 'neutral' },
  approved: { label: '검수 승인', variant: 'success' },
  rejected: { label: '검수 반려', variant: 'error' },
}

/** 운영자 막음 표시. 판매 상태 pill과 나란히 서므로 색을 겹치지 않게 danger로 둔다. */
export const ADMIN_BLOCK_META: StatusLabel = { label: '운영자 막음', variant: 'danger' }

export const SALE_STATUS_FILTER_VALUES: ProductCatalogSaleStatus[] = [
  'on-sale',
  'out-of-stock',
  'suspended',
  'ended',
]

/**
 * 검수 상태 필터 값 — `draft`는 넣지 않는다. 서버에 그 상태로 가는 경로가 없어(스펙 설명)
 * 고르면 늘 빈 목록이 열린다. 응답에 실려 오면 표시는 한다(위 META에 라벨이 있다).
 */
export const INSPECTION_STATUS_FILTER_VALUES: ProductCatalogInspectionStatus[] = [
  'pending',
  'approved',
  'rejected',
]

/** 검수 반려 사유·판매중지 사유·재개 사유 모두 서버 상한이 같다. */
export const REASON_MAX_LENGTH = 500

/**
 * 운영자가 한 행에서 지시할 수 있는 처리 넷. **서버에서는 두 곳으로 갈린다** —
 * 승인·반려는 검수 큐 경로(`/admin/product-inspections/{productId}/approve|reject`)이고
 * 중지·재개는 카탈로그 경로(`/admin/products/{productId}/sale-suspensions[/release]`)다.
 * 상품을 가리는 일과 검수에서 반려하는 일이 서버에서 같은 조작이라 전자를 따로 만들지 않았다.
 */
export type ProductCatalogAction = 'approve' | 'reject' | 'suspend' | 'resume'

export function toProductCatalogItem(wire: AdminProductSummary): ProductCatalogItem {
  return {
    productId: wire.productId,
    productName: wire.productName,
    sellerId: wire.sellerId,
    storeName: wire.storeName,
    categoryName: wire.categoryName,
    regularPrice: wire.regularPrice,
    discountPrice: wire.discountPrice,
    saleStatus: SALE_STATUS_FROM_WIRE[wire.saleStatus],
    inspectionStatus: INSPECTION_STATUS_FROM_WIRE[wire.inspectionStatus],
    reportCount: wire.reportCount,
    adminSaleSuspended: wire.adminSaleSuspended,
    adminSaleSuspendedAt: wire.adminSaleSuspendedAt,
    adminSaleSuspendReason: wire.adminSaleSuspendReason,
    createdAt: wire.createdAt,
  }
}

/**
 * 셀러 칸 문구. `storeName`이 null인 상품은 셀러 행을 못 찾은 것이지 조회가 실패한 것이
 * 아니므로(products.seller_id는 FK 없는 값 참조다) 줄표로 비우지 않고 그렇게 적는다 —
 * 그 상품도 운영자가 손을 대야 하는 행이고, 식별자는 셀러 관리 화면과 같은 값이다.
 */
export function sellerLabel(item: ProductCatalogItem): string {
  return item.storeName ?? `상호 없음 / 셀러 ${item.sellerId}`
}

export const priceLabel = (won: number): string => `${won.toLocaleString('ko-KR')}원`

/** ISO-8601 local(초·나노 포함)에서 분까지만 남긴다. 값이 없으면 줄표다. */
export function formatWireDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [date, time] = value.split('T')
  if (!date) return '—'
  return time ? `${date} ${time.slice(0, 5)}` : date
}

export function formatWireDate(value: string | null | undefined): string {
  if (!value) return '—'
  return value.split('T')[0] ?? '—'
}

interface WireError {
  status?: number
  errorCode?: number
}

function toWireError(error: unknown): WireError {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return { status: response?.status, errorCode: response?.data?.errorCode }
}

export function listErrorMessage(error: unknown): string {
  if (toWireError(error).status === 403) {
    return '어드민 권한이 없어 상품 목록을 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  }
  return '상품 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 화면이 낡았다는 신호. 409 넷(40500 닫힌 검수, 40008 이미 막음, 40009 막음 아님, 40011 동시
 * 조치)과 사라진 상품의 404가 전부 "운영자가 보고 있는 값이 서버와 다르다"는 뜻이라, 무효화로
 * 돌아온 최신 행을 **그 자리에서** 보여 주고 다시 고르게 해야 한다.
 */
export function isStaleWrite(error: unknown): boolean {
  const { status, errorCode } = toWireError(error)
  if (status === 409) return true
  return status === 404 && errorCode === 40000
}

export function writeErrorMessage(error: unknown, action: ProductCatalogAction): string {
  const { status, errorCode } = toWireError(error)
  if (status === 404) return '상품을 찾을 수 없어요. 목록을 다시 불러왔어요.'
  if (status === 409) {
    // 40500은 "열린 검토 행이 없다"다 — 검수 판정의 모수는 이 화면이 아니라 큐라는 사실을
    // 운영자에게 그대로 말해 준다(여기서는 그 상품이 큐에 있는지 알 방법이 없다).
    if (errorCode === 40500) {
      return '관리자 확인을 기다리는 검수 건이 없어 검수 판정을 처리하지 못했어요. 판정은 AI 검수 큐에서 해요.'
    }
    if (errorCode === 40008) return '이미 운영자가 판매를 막아 둔 상품이에요. 목록을 다시 불러왔어요.'
    if (errorCode === 40009) return '운영자가 막아 둔 상품이 아니에요. 목록을 다시 불러왔어요.'
    return '다른 운영자가 같은 상품을 동시에 처리했어요. 목록을 다시 불러왔으니 확인하고 다시 처리해 주세요.'
  }
  if (status === 400) {
    return action === 'resume'
      ? `재개 사유를 ${REASON_MAX_LENGTH}자 이하로 입력해 주세요.`
      : `사유를 ${REASON_MAX_LENGTH}자 이하로 입력해 주세요.`
  }
  if (status === 403) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}
