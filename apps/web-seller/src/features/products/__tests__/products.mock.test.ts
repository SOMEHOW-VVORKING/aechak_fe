import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ProductRegisterRequest, SellerProductSearchParams } from '../products.contract'
import {
  mockChangeOptionCombination,
  mockChangeSaleStatus,
  mockFetchProductDetail,
  mockFetchProductOptions,
  mockFetchProducts,
  mockRegisterProduct,
  mockUpdateProduct,
  mockUploadProductImage,
  resetProductsMock,
} from '../products.mock'

// 목업은 BE(origin/develop SellerProductController/ProductService)의 계약과 규칙을 따른다 — 여기서 그 규칙을 고정한다.

beforeEach(() => {
  // 할인 적용 여부가 현재 시각을 본다. setTimeout(목업 지연)은 그대로 두고 Date만 고정한다.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-06T12:00:00+09:00'))
  resetProductsMock()
})
afterEach(() => {
  vi.useRealTimers()
})

// 고양이 > 식기/급수기 > 자동 급식기 (id 규칙: 대분류 n, 중분류 n*100+i, 소분류 중분류*100+j)
const LEAF_ID = 20901
const png = () => new File(['png'], 'a.png', { type: 'image/png' })

async function registerBody(patch: Partial<ProductRegisterRequest> = {}): Promise<ProductRegisterRequest> {
  return {
    categoryId: LEAF_ID,
    productName: '새 급식기',
    description: null,
    regularPrice: 30000,
    discountPrice: null,
    discountStartAt: null,
    discountEndAt: null,
    thumbnailImageKey: await mockUploadProductImage(png()),
    additionalImageKeys: [],
    detailImageKeys: [],
    optionGroups: null,
    optionCombinations: [{ optionValues: [], additionalPrice: 0, stockQuantity: 0 }],
    ...patch,
  }
}

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: { response: { data: { errorCode: number } } }) => error.response.data.errorCode,
  )

const list = async (params: SellerProductSearchParams = {}) => (await mockFetchProducts(params)).data
const idOf = async (keyword: string) => (await list({ keyword })).products[0]!.productId
const options = async (productId: string) => (await mockFetchProductOptions(productId)).data.optionCombinations
const statusOf = async (keyword: string) => (await list({ keyword })).products[0]!.saleStatus

describe('mockFetchProducts', () => {
  it('[AC-PRODUCTS-001] 기본은 최신순 20개 페이지이고 행은 SellerProductSummaryResponse 필드만 준다', async () => {
    const page = await list()

    expect(page).toMatchObject({ totalCount: 7, page: 0, size: 20, totalPages: 1, hasNext: false })
    expect(page.products.map(p => p.name)).toEqual([
      '유기농 동결건조 간식 닭가슴살',
      '고양이 자동 급식기 스마트 5L',
      '대용량 모래 8.5L 벤토나이트',
      '관절 영양제 코코넛맛 90정',
      '실내 자동 화장실 디럭스',
      '산책 하네스 세트',
      '[단종] 캣휠 라지',
    ])
    const [snack] = page.products
    expect(Object.keys(snack!).sort()).toEqual(
      [
        'productId',
        'name',
        'thumbnailImageKey',
        'categoryName',
        'regularPrice',
        'discountPrice',
        'discountRate',
        'saleStatus',
        'inspectionStatus',
        'totalStock',
        'createdAt',
      ].sort(),
    )
    // 판매 꺼진 조합(100g, 12개)은 totalStock에서 빠지고, 진행 중 할인만 discountPrice/Rate로 온다.
    expect(snack).toMatchObject({
      categoryName: '동결건조 간식',
      regularPrice: 15000,
      discountPrice: 12500,
      discountRate: 17,
      totalStock: 54,
      saleStatus: 'ON_SALE',
      inspectionStatus: 'APPROVED',
    })
    expect(snack!.thumbnailImageKey).toMatch(/^products\/\w{26}\.png$/)
    // 시작 전 할인은 null.
    expect(page.products[4]).toMatchObject({ discountPrice: null, discountRate: null })
  })

  it('[AC-SPRD-018] 검색/상태/카테고리 하위 트리/재고/가격 정렬/페이지를 BE 의미대로 거른다', async () => {
    expect((await list({ keyword: '  급식기 ' })).totalCount).toBe(1)
    expect((await list({ keyword: '5l' })).products[0]!.name).toBe('고양이 자동 급식기 스마트 5L') // 대소문자 무시
    expect((await list({ saleStatus: ['SUSPENDED', 'ENDED'] })).totalCount).toBe(2)
    expect((await list({ inspectionStatus: ['REJECTED'] })).totalCount).toBe(0)
    expect((await list({ category: 2 })).totalCount).toBe(5) // 고양이(대분류) 아래 전부
    expect((await list({ category: 204 })).totalCount).toBe(2) // 고양이 > 위생/미용
    // 재고 필터는 판매 상태가 아니라 판매 켜진 조합의 재고로 본다.
    expect((await list({ stock: 'sold_out' })).products.map(p => p.name)).toEqual([
      '대용량 모래 8.5L 벤토나이트',
      '[단종] 캣휠 라지',
    ])
    expect((await list({ createdFrom: '2026-06-09', createdTo: '2026-06-10' })).totalCount).toBe(2)

    // 가격 정렬은 지금 적용 중인 할인가 기준(간식 12,500원이 모래 18,900원보다 앞).
    const byPrice = await list({ sort: 'price_asc' })
    expect(byPrice.products.slice(0, 2).map(p => p.name)).toEqual([
      '유기농 동결건조 간식 닭가슴살',
      '대용량 모래 8.5L 벤토나이트',
    ])

    const last = await list({ size: 3, page: 2 })
    expect(last).toMatchObject({ totalCount: 7, totalPages: 3, hasNext: false })
    expect(last.products).toHaveLength(1)
    expect((await list({ size: 3, page: 0 })).hasNext).toBe(true)

    const invalid: SellerProductSearchParams[] = [
      { keyword: 'a'.repeat(101) },
      { saleStatus: ['SOLD' as never] },
      { createdFrom: '2026/06/09' },
      { createdFrom: '2026-02-30' }, // LocalDate.parse는 STRICT라 없는 날짜를 거절한다
      { createdFrom: '2026-06-10', createdTo: '2026-06-09' },
      { stock: 'none' as never },
      { sort: 'name' as never },
      { page: -1 },
      { size: 101 },
    ]
    for (const params of invalid) expect(await errorCodeOf(mockFetchProducts(params))).toBe(90001)
    expect(await errorCodeOf(mockFetchProducts({ category: 999999 }))).toBe(40101)
  })
})

describe('mockRegisterProduct', () => {
  it('[AC-SPRD-010] 등록은 재고 0이어도 판매중/검수 통과, 옵션 없는 상품은 기본 조합 하나, 이미지는 저장 키로 승격된다', async () => {
    const body = await registerBody()
    const { data } = await mockRegisterProduct(body)

    expect(data).toMatchObject({ saleStatus: 'ON_SALE', inspectionStatus: 'APPROVED', versionNo: 1 })
    expect(data.productId).toHaveLength(26)
    expect(data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+$/) // 오프셋 없는 LocalDateTime
    const first = (await list()).products[0]!
    expect(first).toMatchObject({ productId: data.productId, name: '새 급식기', totalStock: 0, saleStatus: 'ON_SALE' })
    // FileStorageAdapter.promote는 tmp 파일명을 그대로 쓴다.
    expect(first.thumbnailImageKey).toBe(`products/${body.thumbnailImageKey.split('/').pop()}`)
    expect(await options(data.productId)).toEqual([
      expect.objectContaining({ name: '기본', additionalPrice: 0, stockQuantity: 0, isActive: true }),
    ])
  })

  it('[AC-SPRD-011] BE 검증 단계별 에러 코드로 거절하고 아무것도 만들지 않는다', async () => {
    const key = await mockUploadProductImage(png())
    const combo = (additionalPrice: number, stockQuantity: number) => [
      { optionValues: [], additionalPrice, stockQuantity },
    ]
    const cases: [Partial<ProductRegisterRequest>, number][] = [
      [{ productName: '   ' }, 90001],
      [{ optionCombinations: undefined as never }, 90001],
      [{ discountPrice: 12000, discountStartAt: '2026-10-01T00:00:00+09:00' }, 90001],
      [{ discountPrice: 12000, discountStartAt: '2026-02-30T00:00:00' }, 90001],
      [{ optionCombinations: combo(0, 2_147_483_648) }, 90001], // Int 범위 밖은 역직렬화 실패
      [{ optionCombinations: [] }, 40005],
      [{ optionCombinations: [...combo(0, 1), ...combo(0, 1)] }, 40005],
      [
        {
          optionGroups: [
            { name: '색상', values: ['블랙'] },
            { name: '사이즈', values: ['블랙'] },
          ],
          optionCombinations: [{ optionValues: ['블랙'], additionalPrice: 0, stockQuantity: 1 }],
        },
        40005,
      ],
      [{ thumbnailImageKey: 'products/someone-else.png' }, 100002],
      [{ thumbnailImageKey: 'tmp/1/users/a.png' }, 100003],
      [{ thumbnailImageKey: 'tmp/1/products/never-uploaded.png' }, 100001],
      [{ categoryId: 209 }, 40100],
      [{ categoryId: 999999 }, 40101],
      [{ regularPrice: 99 }, 40001],
      [{ discountPrice: 30001, discountStartAt: '2026-10-01T00:00:00' }, 40001],
      [{ discountPrice: 12000 }, 40002],
      [{ discountPrice: 12000, discountStartAt: '2026-10-02T00:00:00', discountEndAt: '2026-10-01T00:00:00' }, 40002],
      [{ additionalImageKeys: Array.from({ length: 10 }, () => key) }, 40003],
      [{ optionCombinations: combo(0, -1) }, 40200],
      [{ optionCombinations: combo(-1, 1) }, 40201],
      // 조합 하나씩 추가금 → 재고 순으로 본다.
      [
        {
          optionGroups: [{ name: '색상', values: ['블랙', '화이트'] }],
          optionCombinations: [
            { optionValues: ['블랙'], additionalPrice: 0, stockQuantity: -1 },
            { optionValues: ['화이트'], additionalPrice: -1, stockQuantity: 0 },
          ],
        },
        40200,
      ],
    ]
    for (const [patch, code] of cases) {
      expect(await errorCodeOf(mockRegisterProduct(await registerBody(patch)))).toBe(code)
    }
    expect((await list()).totalCount).toBe(7)
  })

  it('[AC-SPRD-012] 조합 이름은 요청 순서대로 / 로 잇고, 곱집합 일부만 보내도 된다', async () => {
    const { data } = await mockRegisterProduct(
      await registerBody({
        optionGroups: [
          { name: '색상', values: ['화이트', '블랙'] },
          { name: '사이즈', values: ['M', 'L'] },
        ],
        optionCombinations: [
          { optionValues: ['화이트', 'M'], additionalPrice: 0, stockQuantity: 2 },
          { optionValues: ['L', '블랙'], additionalPrice: 1000, stockQuantity: 3 },
        ],
      }),
    )

    expect((await options(data.productId)).map(c => c.name)).toEqual(['화이트 / M', 'L / 블랙'])
  })
})

describe('mockChangeSaleStatus', () => {
  it('[AC-SPRD-013] ON_SALE/SUSPENDED만 받고 현재 상태는 안 보며, 재고가 없으면 ON_SALE이 곧바로 OUT_OF_STOCK이 된다', async () => {
    const feeder = await idOf('급식기')
    const suspend = await mockChangeSaleStatus(feeder, { saleStatus: 'SUSPENDED' })
    expect(suspend.data).toMatchObject({ productId: feeder, saleStatus: 'SUSPENDED' })
    expect((await mockChangeSaleStatus(feeder, { saleStatus: 'SUSPENDED' })).data.saleStatus).toBe('SUSPENDED')
    expect((await mockChangeSaleStatus(feeder, { saleStatus: 'ON_SALE' })).data.saleStatus).toBe('ON_SALE')

    // 판매종료도 다시 판매할 수 있다(재고가 없으니 품절).
    const wheel = await idOf('캣휠')
    expect((await mockChangeSaleStatus(wheel, { saleStatus: 'ON_SALE' })).data.saleStatus).toBe('OUT_OF_STOCK')
    expect(await statusOf('캣휠')).toBe('OUT_OF_STOCK')

    expect(await errorCodeOf(mockChangeSaleStatus(feeder, { saleStatus: 'OUT_OF_STOCK' }))).toBe(90001)
    expect(await errorCodeOf(mockChangeSaleStatus(feeder, { saleStatus: 'ENDED' }))).toBe(90001)
    expect(await errorCodeOf(mockChangeSaleStatus('nope', { saleStatus: 'ON_SALE' }))).toBe(40000)
  })
})

describe('mockChangeOptionCombination', () => {
  it('[AC-SPRD-014] 증감은 0~INT 범위로 잘려 실제 반영량을 돌려주고, 판매 가능한 재고에 따라 품절/판매중이 바뀐다', async () => {
    const feeder = await idOf('급식기')
    const [white, black] = await options(feeder)

    const cut = await mockChangeOptionCombination(feeder, white!.optionCombinationId, { stockDelta: -100 })
    expect(cut.data).toMatchObject({
      combinationId: white!.optionCombinationId,
      stockQuantity: 0,
      appliedStockDelta: -80,
      isActive: true,
    })
    expect(cut.data).not.toHaveProperty('saleStatus')
    expect(await statusOf('급식기')).toBe('ON_SALE') // 블랙 48개가 남음

    // 마지막 재고 있는 조합의 판매를 끄면 품절, 재고를 넣고 다시 켜면 판매중.
    await mockChangeOptionCombination(feeder, black!.optionCombinationId, { isActive: false })
    expect(await statusOf('급식기')).toBe('OUT_OF_STOCK')
    const refill = await mockChangeOptionCombination(feeder, white!.optionCombinationId, { stockDelta: 5 })
    expect(refill.data).toMatchObject({ stockQuantity: 5, appliedStockDelta: 5 })
    expect(await statusOf('급식기')).toBe('ON_SALE')
    // isActive를 빼면 기존 값을 유지한다.
    const keep = await mockChangeOptionCombination(feeder, black!.optionCombinationId, { stockDelta: 1 })
    expect(keep.data).toMatchObject({ isActive: false, stockQuantity: 49 })

    // 판매 중지는 재고가 바뀌어도 그대로.
    const harness = await idOf('하네스')
    const [first] = await options(harness)
    await mockChangeOptionCombination(harness, first!.optionCombinationId, { stockDelta: -5 })
    expect(await statusOf('하네스')).toBe('SUSPENDED')

    for (const body of [{}, { stockDelta: 0 }, { stockDelta: 1_000_001 }, { stockDelta: -1_000_001 }]) {
      expect(await errorCodeOf(mockChangeOptionCombination(feeder, white!.optionCombinationId, body))).toBe(90001)
    }
    expect(await errorCodeOf(mockChangeOptionCombination(feeder, first!.optionCombinationId, { stockDelta: 1 }))).toBe(
      40000,
    )
  })
})

describe('mockUpdateProduct', () => {
  it('[AC-SPRD-017] PUT은 옵션/재고/판매 상태를 두고 값과 이미지 목록을 통째로 바꾼다', async () => {
    const feeder = await idOf('급식기')
    const before = (await mockFetchProductDetail(feeder)).data
    const added = await mockUploadProductImage(png())
    const { productId, ...body } = before
    expect(productId).toBe(feeder)

    const { data } = await mockUpdateProduct(feeder, {
      ...body,
      productName: '급식기 v2',
      regularPrice: 70000,
      additionalImageKeys: [added],
      detailImageKeys: [added], // 다른 목록끼리는 같은 키를 허용
    })

    expect(data).toEqual({ productId: feeder, saleStatus: 'ON_SALE', updatedAt: expect.any(String) })
    const after = (await mockFetchProductDetail(feeder)).data
    expect(after.thumbnailImageKey).toBe(before.thumbnailImageKey) // 기존 저장 키는 그대로 둔다
    // 와이어 타입(생성물)에서 이미지 목록은 선택 필드라 좁히고 읽는다.
    const afterAdditional = after.additionalImageKeys ?? []
    expect(afterAdditional[0]).toMatch(/^products\//)
    expect((await list({ keyword: 'v2' })).products[0]).toMatchObject({ regularPrice: 70000, totalStock: 128 })
    expect(await options(feeder)).toHaveLength(2)

    // 한 목록 안 중복은 90001, 예전에 뺀 저장 키를 다시 보내면 100002.
    const dup = { ...body, additionalImageKeys: [afterAdditional[0]!, afterAdditional[0]!] }
    expect(await errorCodeOf(mockUpdateProduct(feeder, dup))).toBe(90001)
    await mockUpdateProduct(feeder, { ...body, additionalImageKeys: [] })
    expect(
      await errorCodeOf(mockUpdateProduct(feeder, { ...body, additionalImageKeys: [afterAdditional[0]!] })),
    ).toBe(100002)
    expect(await errorCodeOf(mockUpdateProduct('nope', body))).toBe(40000)
  })
})

describe('mockUploadProductImage', () => {
  it('[AC-SPRD-019] PRODUCT 용도는 png/jpeg/webp만 받고 tmp/{userId}/products/ 키를 준다', async () => {
    const webp = await mockUploadProductImage(new File(['w'], 'a.webp', { type: 'image/webp' }))
    expect(webp).toMatch(/^tmp\/1\/products\/\w{26}\.webp$/)
    expect(await errorCodeOf(mockUploadProductImage(new File(['g'], 'a.gif', { type: 'image/gif' })))).toBe(100000)
  })
})
