import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CATEGORIES_URL,
  SELLER_PRODUCTS_URL,
  SELLER_PRODUCT_DRAFTS_URL,
  currentSellerProductDrafts,
  lastSellerProductsQuery,
  makeSellerOptionCombinationWire,
  makeSellerProductDraftWire,
  makeSellerProductWire,
  seedSellerProductDrafts,
  seedSellerProducts,
  server,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 실 API 연동 — MSW가 seller 호스트(8081) /sellers/me/products와 api 호스트(8080) /categories를
// 가로챈다. 모듈 모킹이 아니라 네트워크 레벨이라 URL·호스트·envelope·에러 계약까지 함께 검증되고,
// test-setup의 onUnhandledRequest:'error'가 핸들러 없는 요청을 곧바로 실패로 만든다.
// 마지막 렌더가 쓴 QueryClient — 백그라운드 재조회 실패를 테스트가 직접 일으킬 창구다.
// renderAt의 반환 모양은 바꾸지 않는다(기존 테스트가 router를 그대로 받는다).
let lastQueryClient: QueryClient | null = null

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  lastQueryClient = queryClient
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const renderedQueryClient = () => lastQueryClient!

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement

const FEEDER = makeSellerProductWire({
  name: '고양이 자동 급식기 스마트 5L',
  categoryName: '자동 급식기',
  regularPrice: 64000,
  saleStatus: 'ON_SALE',
  totalStock: 128,
})
const SNACK = makeSellerProductWire({
  name: '유기농 동결건조 간식 닭가슴살',
  categoryName: '동결건조 간식',
  regularPrice: 15000,
  // 조회 시각에 적용 중인 할인만 내려온다(예약·종료된 할인은 null).
  discountPrice: 12500,
  discountRate: 17,
  saleStatus: 'ON_SALE',
  totalStock: 54,
})
const HARNESS = makeSellerProductWire({
  name: '산책 하네스 세트',
  categoryName: '하네스',
  regularPrice: 25000,
  saleStatus: 'SUSPENDED',
  totalStock: 10,
})
const SAND = makeSellerProductWire({
  name: '대용량 모래 8.5L 벤토나이트',
  categoryName: '모래',
  regularPrice: 18900,
  saleStatus: 'OUT_OF_STOCK',
  totalStock: 0,
})
// ENDED는 enum에만 있고 BE에 도달 경로가 없다 — 화면 표시와 '다시 판매' 전환만 확인하는 시드다.
const WHEEL = makeSellerProductWire({
  name: '[단종] 캣휠 라지',
  categoryName: '캣타워/캣휠',
  regularPrice: 240000,
  saleStatus: 'ENDED',
  totalStock: 0,
})

function seedAll() {
  seedSellerProducts([
    { product: FEEDER },
    {
      product: SNACK,
      options: [
        makeSellerOptionCombinationWire({ name: '30g', stockQuantity: 54, isActive: true }),
        // 판매를 끈 조합의 재고는 목록 totalStock에서 빠진다.
        makeSellerOptionCombinationWire({
          name: '100g',
          additionalPrice: 18000,
          stockQuantity: 12,
          isActive: false,
        }),
      ],
    },
    { product: HARNESS },
    { product: SAND },
    { product: WHEEL },
  ])
}

describe('/products 목록 (SCRUM-119)', () => {
  beforeEach(() => {
    seedAll()
    // 머리말 임시저장 버튼이 이 목록을 읽는다 — 시드를 비워 다른 테스트의 초안이 새지 않게 한다.
    seedSellerProductDrafts([])
  })

  it('[AC-SPRD-020] 판매/검수 pill, 진행 중 할인가, 소분류 이름을 보여주고 판매종료 행도 BE처럼 다시 판매할 수 있다', async () => {
    renderAt('/products')

    const feeder = await rowOf(FEEDER.name)
    expect(within(feeder).getByText('판매중')).toBeInTheDocument()
    expect(within(feeder).getByText('검수 통과')).toBeInTheDocument()
    expect(within(feeder).getByText('자동 급식기')).toBeInTheDocument() // 소분류 이름만 온다

    const snack = await rowOf(SNACK.name)
    expect(within(snack).getByText('12,500원')).toBeInTheDocument()
    expect(within(snack).getByText(/17%/)).toBeInTheDocument()

    const wheel = await rowOf(WHEEL.name)
    expect(within(wheel).getByText('판매종료')).toBeInTheDocument()
    expect(within(wheel).getByRole('switch', { name: `${WHEEL.name} 판매` })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByText('총 5개')).toBeInTheDocument()
  })

  it('[AC-SPRD-021] 판매 토글을 끄면 확인 Modal을 거쳐 판매 중지되고, 취소하면 그대로다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf(FEEDER.name)
    const toggle = within(row).getByRole('switch', { name: `${FEEDER.name} 판매` })

    await user.click(toggle)
    let dialog = screen.getByRole('dialog', { name: '판매를 중지할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(row).getByText('판매중')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await user.click(toggle)
    dialog = screen.getByRole('dialog', { name: '판매를 중지할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '판매 중지' }))

    expect(await screen.findByText('판매를 중지했어요.')).toBeInTheDocument()
    expect(await within(row).findByText('판매 중지')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-022] 판매 중지 상품의 토글을 켜면 확인 없이 바로 판매중이 된다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf(HARNESS.name)

    await user.click(within(row).getByRole('switch', { name: `${HARNESS.name} 판매` }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await within(row).findByText('판매중')).toBeInTheDocument()
    expect(await screen.findByText('판매를 다시 시작했어요.')).toBeInTheDocument()
  })

  it('[AC-SPRD-022b] 재고 없는 상품을 다시 판매하면 같은 응답에서 품절로 파생돼 돌아온다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf(WHEEL.name)

    await user.click(within(row).getByRole('switch', { name: `${WHEEL.name} 판매` }))

    expect(await screen.findByText('재고가 없어 품절로 표시돼요.')).toBeInTheDocument()
    expect(await within(row).findByText('품절')).toBeInTheDocument()
  })

  it('[AC-SPRD-024] 재고 Drawer는 목표 재고와의 차이를 증감으로 저장하고 행 재고와 판매 상태가 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf(SAND.name)
    expect(within(row).getByText('품절')).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: `${SAND.name} 재고 0개 수정` }))
    const drawer = screen.getByRole('dialog', { name: '옵션별 재고' })
    const input = await within(drawer).findByLabelText('기본 재고')
    const save = within(drawer).getByRole('button', { name: '기본 재고 저장' })
    expect(save).toBeDisabled() // 바뀐 값이 없으면 저장 불가

    // BE 증감 한도(±1,000,000)를 넘는 목표는 서버가 90001로 거절하고 그 문구를 행에 보여준다.
    await user.clear(input)
    await user.type(input, '1000001')
    await user.click(save)
    expect(await within(drawer).findByText('입력한 내용을 다시 확인해 주세요.')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '5')
    await user.click(save)

    expect(await screen.findByText('재고를 저장했어요.')).toBeInTheDocument()
    expect(
      await within(row).findByRole('button', { name: `${SAND.name} 재고 5개 수정` }),
    ).toHaveTextContent('5')
    // 재고가 들어오면 BE가 OUT_OF_STOCK → ON_SALE로 되돌린다.
    expect(await within(row).findByText('판매중')).toBeInTheDocument()
  })

  it('[AC-SPRD-024d] 재고 저장이 끝날 때까지 입력을 잠가 중간에 고친 값이 사라지지 않게 한다', async () => {
    // 저장 중 고친 값은 성공 응답이 덮어써 사라진다. 목업 시절에는 응답이 늦어 이 잠금이
    // 저절로 보였지만 실 API 스텁은 즉시 돌아와 중간 상태를 잡을 수 없다 — 응답을 손으로 풀어
    // 결정적으로 관찰한다. 이 테스트는 잠금만 보고, 저장 결과 반영은 AC-SPRD-024가 맡는다.
    const user = userEvent.setup()
    let release = () => {}
    const pending = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.patch(`${SELLER_PRODUCTS_URL}/:productId/options/:combinationId`, async () => {
        await pending
        return HttpResponse.json({
          data: {
            combinationId: 1,
            stockQuantity: 5,
            appliedStockDelta: 5,
            isActive: true,
            updatedAt: '2026-10-07T12:00:00',
          },
        })
      }),
    )
    renderAt('/products')
    const row = await rowOf(SAND.name)

    await user.click(within(row).getByRole('button', { name: `${SAND.name} 재고 0개 수정` }))
    const drawer = screen.getByRole('dialog', { name: '옵션별 재고' })
    const input = await within(drawer).findByLabelText('기본 재고')
    await user.clear(input)
    await user.type(input, '5')
    await user.click(within(drawer).getByRole('button', { name: '기본 재고 저장' }))

    await waitFor(() => expect(input).toBeDisabled())

    await act(async () => {
      release()
      await pending
    })

    expect(await screen.findByText('재고를 저장했어요.')).toBeInTheDocument()
    await waitFor(() => expect(input).toBeEnabled())
  })

  it('[AC-SPRD-024b] 재고 Drawer에서 꺼 둔 옵션의 판매를 켜면 그 재고가 총재고에 더해진다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf(SNACK.name)

    await user.click(within(row).getByRole('button', { name: `${SNACK.name} 재고 54개 수정` }))
    const drawer = screen.getByRole('dialog', { name: '옵션별 재고' })
    const toggle = await within(drawer).findByRole('switch', { name: '100g 판매' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)

    expect(await screen.findByText('옵션 판매를 켰어요.')).toBeInTheDocument()
    expect(await within(row).findByRole('button', { name: /재고 66개 수정/ })).toBeInTheDocument()
  })

  it('[AC-SPRD-024c] 서버가 요청과 다른 양을 반영하면(0 미만 절삭) 그 결과를 안내한다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf(FEEDER.name)

    await user.click(within(row).getByRole('button', { name: `${FEEDER.name} 재고 128개 수정` }))
    const drawer = screen.getByRole('dialog', { name: '옵션별 재고' })
    const input = await within(drawer).findByLabelText('기본 재고')
    // 그사이 주문이 들어와 재고가 줄어든 상황 — 서버는 결과 재고를 0 이상으로 자르고 실제 반영량만 준다.
    server.use(
      http.patch(`${SELLER_PRODUCTS_URL}/:productId/options/:combinationId`, () =>
        HttpResponse.json({
          data: {
            combinationId: 1,
            stockQuantity: 0,
            appliedStockDelta: -3,
            isActive: true,
            updatedAt: '2026-10-07T11:00:00',
          },
        }),
      ),
    )

    await user.clear(input)
    await user.type(input, '100')
    await user.click(within(drawer).getByRole('button', { name: '기본 재고 저장' }))

    expect(await screen.findByText('그사이 재고가 바뀌어 0개로 저장했어요.')).toBeInTheDocument()
  })

  it('[AC-SPRD-026] 필터는 BE 목록 파라미터로 나가고 비운 필터는 키째 빠진다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    await rowOf(HARNESS.name)

    const sent = () => new URLSearchParams(lastSellerProductsQuery() ?? '')
    // 초기 조회 — 비어 있는 키워드/카테고리/상태는 아예 나가지 않는다. 400/90001이 되는 빈 값은
    // `stock`·`createdFrom`·`createdTo`(SellerProductListIntegrationTest가 셋을 고정한다)와
    // parseEnum/parseSort를 타는 `saleStatus`·`inspectionStatus`·`sort`다. `keyword`는 BE가
    // `trim().takeIf { isNotEmpty() }`로 미입력(null)으로 접고 `category`는 Long?이라 빈 값이
    // null로 바인딩돼 둘 다 통과하지만, 같은 요청이 같은 캐시 키를 쓰도록 FE가 키째 뺀다.
    await waitFor(() => expect(lastSellerProductsQuery()).not.toBeNull())
    expect(sent().has('keyword')).toBe(false)
    expect(sent().has('category')).toBe(false)
    expect(sent().has('saleStatus')).toBe(false)
    expect(sent().has('inspectionStatus')).toBe(false)
    // '전체'(빈 문자열)로 둔 재고와 비운 등록일도 키째 빠진다 — 이 셋은 실제로 400/90001이다.
    expect(sent().has('stock')).toBe(false)
    expect(sent().has('createdFrom')).toBe(false)
    expect(sent().has('createdTo')).toBe(false)
    expect(sent().get('sort')).toBe('latest')
    expect(sent().get('page')).toBe('0')

    await user.selectOptions(screen.getByRole('combobox', { name: '판매 상태' }), '판매 중지')
    await waitFor(() => expect(sent().getAll('saleStatus')).toEqual(['SUSPENDED']))

    await user.selectOptions(screen.getByRole('combobox', { name: '검수 상태' }), '반려')
    await waitFor(() => expect(sent().getAll('inspectionStatus')).toEqual(['REJECTED']))

    // 카테고리 트리(api 호스트 GET /categories) 로드를 기다린다. 라벨의 >는 innerHTML 비교가 안 돼
    // option 요소로 고른다.
    const hygiene = await screen.findByRole('option', { name: '고양이 > 위생/미용' })
    await user.selectOptions(screen.getByRole('combobox', { name: '카테고리' }), hygiene)
    await waitFor(() => expect(sent().get('category')).toBe(hygiene.getAttribute('value')))

    await user.selectOptions(screen.getByRole('combobox', { name: '재고' }), '품절')
    await waitFor(() => expect(sent().get('stock')).toBe('sold_out'))

    await user.type(screen.getByLabelText('등록일 시작'), '2026-10-01')
    await waitFor(() => expect(sent().get('createdFrom')).toBe('2026-10-01'))
    // 시작일 > 종료일은 BE가 400/90001로 거절한다 — 종료일 입력의 min이 시작일로 묶인다.
    expect(screen.getByLabelText('등록일 종료')).toHaveAttribute('min', '2026-10-01')

    await user.type(screen.getByPlaceholderText('상품명 검색'), '  급식기  ')
    await waitFor(() => expect(sent().get('keyword')).toBe('급식기')) // 양끝 공백은 떼고 보낸다

    await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), '가격 높은순')
    await waitFor(() => expect(sent().get('sort')).toBe('price_desc'))

    await user.click(screen.getByRole('button', { name: '초기화' }))
    await waitFor(() => expect(sent().has('keyword')).toBe(false))
    expect(sent().has('saleStatus')).toBe(false)
    expect(sent().has('inspectionStatus')).toBe(false)
    expect(sent().has('category')).toBe(false)
    expect(sent().has('stock')).toBe(false)
    expect(sent().has('createdFrom')).toBe(false)
  })

  it('[AC-SPRD-027] 상품 등록 버튼은 /products/new로 이동한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products')

    await user.click(await screen.findByRole('button', { name: '상품 등록' }))

    await screen.findByRole('heading', { name: '상품 등록' })
    expect(router.state.location.pathname).toBe('/products/new')
  })

  it('[AC-SPRD-028] 등록/수정 후 복귀(saved)하면 완료 토스트를 보여준다', async () => {
    renderAt('/products?saved=created')

    expect(await screen.findByText('상품을 등록했어요.')).toBeInTheDocument()
  })

  it('[AC-SPRD-029] 완료 토스트는 다른 토스트가 덮고 닫힌 뒤 다시 뜨지 않는다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products?saved=created')

    expect(await screen.findByText('상품을 등록했어요.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toEqual({}))

    await user.click(screen.getByRole('switch', { name: `${HARNESS.name} 판매` }))
    expect(await screen.findByText('판매를 다시 시작했어요.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '닫기' }))

    expect(screen.queryByText('판매를 다시 시작했어요.')).not.toBeInTheDocument()
    expect(screen.queryByText('상품을 등록했어요.')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-042] 셀러가 비활성이면(403 errorCode 40004) 판매 상태 변경이 안내 문구로 끝난다', async () => {
    const user = userEvent.setup()
    server.use(
      http.patch(`${SELLER_PRODUCTS_URL}/:productId/status`, () =>
        HttpResponse.json(
          { errorCode: 40004, message: '판매 활동이 가능한 셀러가 아닙니다.' },
          { status: 403 },
        ),
      ),
    )
    renderAt('/products')
    const row = await rowOf(HARNESS.name)

    await user.click(within(row).getByRole('switch', { name: `${HARNESS.name} 판매` }))

    expect(await screen.findByText('판매 활동이 가능한 계정이 아니라 처리할 수 없어요.')).toBeInTheDocument()
    expect(within(row).getByText('판매 중지')).toBeInTheDocument()
  })

  it('[AC-SPRD-043] 온보딩 미완(403 errorCode 20006)이면 구매자 앱 안내 문구를 띄운다', async () => {
    const user = userEvent.setup()
    server.use(
      http.patch(`${SELLER_PRODUCTS_URL}/:productId/status`, () =>
        HttpResponse.json({ errorCode: 20006, message: '온보딩이 필요합니다.' }, { status: 403 }),
      ),
    )
    renderAt('/products')
    const row = await rowOf(HARNESS.name)

    await user.click(within(row).getByRole('switch', { name: `${HARNESS.name} 판매` }))

    expect(
      await screen.findByText('구매자 앱에서 온보딩(약관/닉네임)을 완료한 뒤 이용할 수 있어요.'),
    ).toBeInTheDocument()
  })

  it('[AC-SPRD-070] BE에 없는 기능(상품 삭제)의 진입점은 목록에 없다', async () => {
    renderAt('/products')
    await rowOf(FEEDER.name)

    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    expect(screen.getByText(/옵션 구성과 상품 삭제는 아직 바꿀 수 없어요/)).toBeInTheDocument()
  })

  it('[AC-SPRD-063] 처리 열의 수정 버튼이 그 상품의 수정 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products')
    const row = await rowOf(FEEDER.name)

    expect(screen.getByRole('columnheader', { name: '처리' })).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: `${FEEDER.name} 수정` }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/products/${FEEDER.productId}/edit`),
    )
  })

  it('[AC-SPRD-049] 등록일 열이 서버 createdAt을 날짜로 보여준다', async () => {
    renderAt('/products')
    const feeder = await rowOf(FEEDER.name)

    // 등록일 범위 필터를 걸었을 때 결과 행이 그 범위인지 확인할 길이 화면에 있어야 한다.
    expect(screen.getByRole('columnheader', { name: '등록일' })).toBeInTheDocument()
    expect(within(feeder).getByText('2026-10-07')).toBeInTheDocument()
  })
})

// 목록·카테고리·옵션 조회는 목업 시절 실패할 수 없었고 실 API 전환으로 처음 도달 가능해졌다 —
// 셋 다 "데이터 없음"과 구분되는 안내가 있어야 한다.
describe('/products 조회 실패 (실 API 전환으로 생긴 경로)', () => {
  beforeEach(() => {
    seedAll()
  })

  it('[AC-SPRD-050] 목록 403 errorCode 40006을 빈 상태가 아니라 오류 안내로 보여준다', async () => {
    server.use(
      http.get(SELLER_PRODUCTS_URL, () =>
        HttpResponse.json(
          { errorCode: 40006, message: '상품을 조회할 수 있는 셀러가 아닙니다.' },
          { status: 403 },
        ),
      ),
    )
    renderAt('/products')

    expect(await screen.findByRole('alert')).toHaveTextContent('상품을 조회할 수 있는 계정이 아니에요.')
    // 조회 실패가 "조건에 맞는 상품이 없어요"로 위장되지 않는다(셀러가 필터를 의심하게 된다).
    expect(screen.queryByText('조건에 맞는 상품이 없어요.')).not.toBeInTheDocument()
    expect(screen.getByText('목록을 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.getByText('총 —개')).toBeInTheDocument()
  })

  it('[AC-SPRD-051] 비활성 카테고리 필터 404 errorCode 40101도 사유로 안내하고 다시 시도로 복구된다', async () => {
    const user = userEvent.setup()
    // 첫 조회만 실패시킨다 — 다시 시도는 기본 핸들러(성공)로 간다.
    server.use(
      http.get(
        SELLER_PRODUCTS_URL,
        () =>
          HttpResponse.json(
            { errorCode: 40101, message: '사용할 수 없는 카테고리입니다.' },
            { status: 404 },
          ),
        { once: true },
      ),
    )
    renderAt('/products')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('선택한 카테고리를 쓸 수 없어요. 다시 선택해 주세요.')

    await user.click(within(alert).getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText(FEEDER.name)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-052] 같은 조회의 재조회가 실패하면 낡은 목록이 남는다는 사실까지 알린다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf(HARNESS.name)

    // 판매 상태 변경이 접두 무효화로 같은 쿼리를 재조회한다 — 그 재조회만 실패시킨다. 같은 키의
    // 재조회 실패는 직전 성공 데이터를 그대로 남기므로(필터를 바꾼 조회와 달리 표가 비지 않는다)
    // 낡은 목록이라는 사실을 안내가 말해 줘야 한다.
    server.use(
      http.get(SELLER_PRODUCTS_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류입니다.' }, { status: 500 }),
      ),
    )
    await user.click(within(row).getByRole('switch', { name: `${HARNESS.name} 판매` }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
    expect(alert).toHaveTextContent('아래 목록은 마지막으로 불러온 내용이라 지금과 다를 수 있어요.')
    expect(screen.getByText(HARNESS.name)).toBeInTheDocument()
  })

  it('[AC-SPRD-053] 카테고리 조회가 실패하면 목록은 보여주고 필터를 쓸 수 없다고 알린다', async () => {
    server.use(
      http.get(CATEGORIES_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류입니다.' }, { status: 500 }),
      ),
    )
    renderAt('/products')

    expect(
      await screen.findByText('카테고리를 불러오지 못해 카테고리 필터를 쓸 수 없어요.'),
    ).toBeInTheDocument()
    // 목록 자체는 영향이 없다(완화된 실패) — Select는 미선택 항목만 남는다.
    expect(await screen.findByText(FEEDER.name)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '카테고리' })).toHaveDisplayValue('전체 카테고리')
  })

  it('[AC-SPRD-054] 재고 Drawer는 옵션을 불러오는 동안 빈 서랍 대신 로딩을 보여준다', async () => {
    const user = userEvent.setup()
    let release = () => {}
    const pending = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.get(`${SELLER_PRODUCTS_URL}/:productId/options`, async () => {
        await pending
        return HttpResponse.json({
          data: {
            optionCombinations: [makeSellerOptionCombinationWire({ name: '기본', stockQuantity: 128 })],
          },
        })
      }),
    )
    renderAt('/products')
    const row = await rowOf(FEEDER.name)

    await user.click(within(row).getByRole('button', { name: `${FEEDER.name} 재고 128개 수정` }))
    const drawer = screen.getByRole('dialog', { name: '옵션별 재고' })

    expect(within(drawer).getByRole('status', { name: '옵션을 불러오는 중' })).toBeInTheDocument()
    expect(within(drawer).queryByText('등록된 옵션이 없어요')).not.toBeInTheDocument()

    release()
    expect(await within(drawer).findByLabelText('기본 재고')).toBeInTheDocument()
    expect(within(drawer).queryByRole('status', { name: '옵션을 불러오는 중' })).not.toBeInTheDocument()
  })

  it('[AC-SPRD-055] 재고 Drawer는 옵션 조회 실패를 빈 서랍 대신 오류로 보여주고 다시 시도로 복구된다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(
        `${SELLER_PRODUCTS_URL}/:productId/options`,
        () =>
          HttpResponse.json(
            { errorCode: 40007, message: '조회할 수 없는 상품입니다.' },
            { status: 403 },
          ),
        { once: true },
      ),
    )
    renderAt('/products')
    const row = await rowOf(FEEDER.name)

    await user.click(within(row).getByRole('button', { name: `${FEEDER.name} 재고 128개 수정` }))
    const drawer = screen.getByRole('dialog', { name: '옵션별 재고' })

    // 실패와 "옵션 없음"이 구분된다 — 빈 Drawer는 재고를 못 고치는 상품처럼 보인다.
    expect(await within(drawer).findByText('내 상품이 아니라 조회할 수 없어요.')).toBeInTheDocument()
    expect(within(drawer).queryByText('등록된 옵션이 없어요')).not.toBeInTheDocument()

    await user.click(within(drawer).getByRole('button', { name: '다시 시도' }))

    expect(await within(drawer).findByLabelText('기본 재고')).toBeInTheDocument()
    expect(within(drawer).queryByText('내 상품이 아니라 조회할 수 없어요.')).not.toBeInTheDocument()
  })
})

// 임시저장 진입점 — 데모의 한 줄("임시저장 → 목록에서 불러오기 → 이어서 쓰기")에서 가운데 토막이다.
describe('/products 임시저장 Drawer (SCRUM-343)', () => {
  const DRAFT = makeSellerProductDraftWire({ productName: '쓰던 하네스', savedAt: '2026-10-20T14:05:00' })
  const NAMELESS = makeSellerProductDraftWire({ productName: null, savedAt: '2026-10-19T09:00:00' })

  const openDrawer = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: /임시저장 \d+/ }))
    return screen.getByRole('dialog', { name: '임시저장한 상품' })
  }

  beforeEach(() => {
    seedAll()
    seedSellerProductDrafts([DRAFT, NAMELESS])
  })

  it('[AC-SPRD-071] 초안 수를 머리말에 보여주고 이어쓰기가 등록 폼으로 보낸다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products')

    const drawer = await openDrawer(user)
    expect(within(drawer).getByText('쓰던 하네스')).toBeInTheDocument()
    expect(within(drawer).getByText('2026.10.20 14:05 저장')).toBeInTheDocument()
    // 상품명을 안 적은 초안도 빈 줄이 아니라 뜻이 통하는 자리를 차지한다.
    expect(within(drawer).getByText('이름 없는 상품')).toBeInTheDocument()

    await user.click(within(drawer).getAllByRole('button', { name: '이어쓰기' })[0]!)

    await waitFor(() => expect(router.state.location.pathname).toBe('/products/new'))
    expect(router.state.location.search).toEqual({ draftId: DRAFT.draftId })
  })

  it('[AC-SPRD-072] 초안이 없으면 버튼을 그리지 않는다', async () => {
    seedSellerProductDrafts([])
    renderAt('/products')

    await screen.findByText(FEEDER.name)
    expect(screen.queryByRole('button', { name: /임시저장/ })).not.toBeInTheDocument()
  })

  it('[AC-SPRD-073] 삭제는 확인을 거치고, 취소하면 서버를 건드리지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const drawer = await openDrawer(user)

    await user.click(within(drawer).getByRole('button', { name: '쓰던 하네스 임시저장 삭제' }))
    const confirm = screen.getByRole('dialog', { name: '임시저장을 삭제할까요?' })
    expect(within(confirm).getByText(/되돌릴 수 없어요/)).toBeInTheDocument()

    await user.click(within(confirm).getByRole('button', { name: '취소' }))
    expect(currentSellerProductDrafts()).toHaveLength(2)

    await user.click(within(drawer).getByRole('button', { name: '쓰던 하네스 임시저장 삭제' }))
    await user.click(
      within(screen.getByRole('dialog', { name: '임시저장을 삭제할까요?' })).getByRole('button', { name: '삭제' }),
    )

    expect(await screen.findByText('임시저장을 삭제했어요.')).toBeInTheDocument()
    expect(currentSellerProductDrafts().map(d => d.draftId)).toEqual([NAMELESS.draftId])
    // 마지막 초안을 지워도 Drawer는 닫지 않는다 — 빈 상태를 보여 주고 셀러가 닫는다.
    await user.click(within(drawer).getByRole('button', { name: '이름 없는 상품 임시저장 삭제' }))
    await user.click(
      within(screen.getByRole('dialog', { name: '임시저장을 삭제할까요?' })).getByRole('button', { name: '삭제' }),
    )
    expect(await within(drawer).findByText('임시저장한 상품이 없어요')).toBeInTheDocument()
  })

  it('[AC-SPRD-074] 삭제 실패를 성공으로 보이지 않게 한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.delete(`${SELLER_PRODUCT_DRAFTS_URL}/:draftId`, () =>
        HttpResponse.json({ errorCode: 40400, message: '임시저장한 상품을 찾을 수 없습니다.' }, { status: 404 }),
      ),
    )
    renderAt('/products')
    const drawer = await openDrawer(user)

    await user.click(within(drawer).getByRole('button', { name: '쓰던 하네스 임시저장 삭제' }))
    await user.click(
      within(screen.getByRole('dialog', { name: '임시저장을 삭제할까요?' })).getByRole('button', { name: '삭제' }),
    )

    expect(
      await screen.findByText('임시저장한 상품을 찾을 수 없어요. 목록을 새로고침해 주세요.'),
    ).toBeInTheDocument()
    expect(currentSellerProductDrafts()).toHaveLength(2)
  })

  it('[AC-SPRD-076] 확인창에서 Escape를 눌러도 Drawer까지 닫지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const drawer = await openDrawer(user)

    await user.click(within(drawer).getByRole('button', { name: '쓰던 하네스 임시저장 삭제' }))
    await user.keyboard('{Escape}')

    // 확인창만 닫힌다 — 두 dialog가 각각 document에 Escape 핸들러를 걸어 한 번 누르면 둘이 함께 닫힌다.
    expect(screen.queryByRole('dialog', { name: '임시저장을 삭제할까요?' })).not.toBeInTheDocument()
    // jsdom은 transitionend를 쏘지 않아 닫힌 Drawer도 DOM에 남는다(AGENTS 7절) — 열림 여부는
    // DS가 닫힘에만 붙이는 pointer-events-none으로만 관찰된다.
    expect(screen.getByRole('dialog', { name: '임시저장한 상품' })).not.toHaveClass('pointer-events-none')
    expect(within(drawer).getByText('쓰던 하네스')).toBeInTheDocument()
  })

  it('[AC-SPRD-077] 재조회가 실패하면 낡은 행에서 삭제를 지시할 수 없고 이어쓰기는 남는다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const drawer = await openDrawer(user)

    // 열어 둔 동안 재조회가 실패한다 — react-query가 직전 목록을 들고 있어 행은 그대로 남는다.
    server.use(
      http.get(SELLER_PRODUCT_DRAFTS_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    await act(() => renderedQueryClient().refetchQueries({ queryKey: ['products', 'drafts'] }))

    expect(
      await within(drawer).findByText('임시저장 목록을 다시 불러오지 못해 아래는 마지막으로 본 목록이에요.'),
    ).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: '쓰던 하네스 임시저장 삭제' })).toBeDisabled()
    // 이어쓰기는 읽기로 가는 길이라 막지 않는다 — 막으면 확인할 방법이 없어진다.
    expect(within(drawer).getAllByRole('button', { name: '이어쓰기' })[0]!).toBeEnabled()
  })

  it('[AC-SPRD-075] 목록 조회가 실패하면 수를 지어내지 않고 버튼을 숨긴다', async () => {
    server.use(
      http.get(SELLER_PRODUCT_DRAFTS_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    renderAt('/products')

    await screen.findByText(FEEDER.name)
    // "임시저장 0"은 거짓이다 — 못 읽었으면 입구를 만들지 않는다.
    await waitFor(() => expect(screen.queryByRole('button', { name: /임시저장/ })).not.toBeInTheDocument())
  })
})
