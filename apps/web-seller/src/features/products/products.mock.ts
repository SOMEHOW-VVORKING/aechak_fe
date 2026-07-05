import type { Product } from '@aechak/domain'

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    sellerId: 'seller-1',
    code: '100482',
    name: '고양이 자동 급식기 스마트 5L',
    category: '고양이/급식기',
    price: 64000,
    stock: 128,
    status: 'selling',
    inspectionStatus: 'approved',
    createdAt: '2026-06-10T00:00:00.000Z',
  },
  {
    id: 'prod-2',
    sellerId: 'seller-1',
    code: '100478',
    name: '대용량 모래 8.5L 벤토나이트',
    category: '고양이/모래',
    price: 18900,
    stock: 0,
    status: 'sold_out',
    inspectionStatus: 'approved',
    createdAt: '2026-06-09T00:00:00.000Z',
  },
  {
    id: 'prod-3',
    sellerId: 'seller-1',
    code: '100501',
    name: '유기농 동결건조 간식 닭가슴살',
    category: '간식/동결건조',
    price: 12500,
    stock: 54,
    status: 'pending',
    inspectionStatus: 'pending',
    createdAt: '2026-06-12T00:00:00.000Z',
  },
  {
    id: 'prod-4',
    sellerId: 'seller-1',
    code: '100466',
    name: '관절 영양제 코코넛맛 90정',
    category: '건강/영양제',
    price: 32000,
    stock: 7,
    status: 'pending',
    inspectionStatus: 'rejected',
    rejectionReason: '상세 페이지에 효능/효과를 단정하는 의학적 표현이 포함돼 있어요.',
    createdAt: '2026-06-08T00:00:00.000Z',
  },
  {
    id: 'prod-5',
    sellerId: 'seller-1',
    code: '100440',
    name: '실내 자동 화장실 디럭스',
    category: '고양이/위생',
    price: 189000,
    stock: 3,
    status: 'blinded',
    inspectionStatus: 'revision_needed',
    rejectionReason: '표시 사양과 실제 제품 사진이 일치하지 않는다는 신고가 접수됐어요.',
    createdAt: '2026-06-05T00:00:00.000Z',
  },
  {
    id: 'prod-6',
    sellerId: 'seller-1',
    code: '100302',
    name: '[단종] 캣휠 라지',
    category: '고양이/가구',
    price: 240000,
    stock: 0,
    status: 'ended',
    inspectionStatus: 'approved',
    createdAt: '2026-01-20T00:00:00.000Z',
  },
]

const DELAY_MS = 300

export function mockFetchProducts(): Promise<Product[]> {
  return new Promise(resolve => {
    setTimeout(() => resolve(MOCK_PRODUCTS), DELAY_MS)
  })
}

export interface ReinspectionRequest {
  productId: string
  note: string
}

export function mockRequestReinspection({ productId }: ReinspectionRequest): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const product = MOCK_PRODUCTS.find(p => p.id === productId)
      if (product) product.inspectionStatus = 'pending'
      resolve()
    }, DELAY_MS)
  })
}

export interface AppealRequest {
  productId: string
  reasonCode: string
  detail: string
}

export function mockSubmitAppeal({ productId }: AppealRequest): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const product = MOCK_PRODUCTS.find(p => p.id === productId)
      if (product) product.inspectionStatus = 'pending'
      resolve()
    }, DELAY_MS)
  })
}
