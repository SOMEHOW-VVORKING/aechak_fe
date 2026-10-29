import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CATEGORIES_URL,
  SELLER_PRODUCTS_URL,
  SELLER_SHIPPING_POLICY_URL,
  currentSellerProducts,
  lastSellerProductRegisterBody,
  lastSellerProductUpdateBody,
  makeSellerProductWire,
  makeShippingPolicyWire,
  seedSellerProducts,
  seedShippingPolicy,
  server,
} from '@/testing/msw/server'
import { MOCK_CATEGORY_TREE, leafIdOf, mockFetchProductDrafts, resetProductsMock } from '../products.mock'
import { routeTree } from '../../../routeTree.gen'

// 등록은 실 API(POST /sellers/me/products)로 나가고 이미지는 presigned 발급 → S3 PUT을 실제로 탄다
// (MSW가 둘 다 가로챈다). 임시저장만 BE에 없어 목업 메모리 스토어를 쓴다.
function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  // queryClient도 돌려준다 — 백그라운드 재조회(창 포커스 복귀) 실패를 테스트가 직접 일으킬 창구다.
  return { router, queryClient }
}

const drafts = async () => (await mockFetchProductDrafts()).data

const png = (name = 'a.png') => new File(['png'], name, { type: 'image/png' })

// DS PhotoUpload의 file input은 추가 버튼 안에 숨어 있고 label이 없다 — 그룹 이름으로 범위를 좁힌 뒤
// DOM으로 찾는다(role/label 쿼리로 닿을 수 없는 유일한 자리).
const fileInputOf = (groupName: string) =>
  within(screen.getByRole('group', { name: groupName }))
    .queryByRole('button', { name: /\d+\/\d+/ })
    ?.querySelector<HTMLInputElement>('input[type=file]') ?? null

async function fillRequired(user: UserEvent, name: string, { stock = true, thumbnail = png() } = {}) {
  await user.type(await screen.findByLabelText('상품명'), name)
  await user.selectOptions(screen.getByLabelText('대분류'), '고양이')
  await user.selectOptions(screen.getByLabelText('중분류'), '식기/급수기')
  await user.selectOptions(screen.getByLabelText('소분류'), '자동 급식기')
  await user.type(screen.getByLabelText('정가'), '30000')
  await user.upload(fileInputOf('대표 썸네일')!, thumbnail)
  if (stock) await user.type(screen.getByLabelText('재고'), '10')
}

describe('/products/new 등록 폼 (SCRUM-120)', () => {
  beforeEach(() => {
    seedSellerProducts([])
    resetProductsMock()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[AC-SPRD-030] 빈 폼으로 등록하면 첫 누락 필드(상품명)로 스크롤/포커스하고 안내 말풍선을 띄운다', async () => {
    const user = userEvent.setup()
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
    renderAt('/products/new')

    await user.click(await screen.findByRole('button', { name: '등록하기' }))

    expect(scrollSpy.mock.contexts).toContain(document.getElementById('product-field-productName'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('상품명을 입력해 주세요')
    expect(screen.getByLabelText('상품명')).toHaveFocus()
    expect(screen.getByLabelText('상품명')).toHaveAccessibleDescription('상품명을 입력해 주세요')
    expect(screen.getByLabelText('정가')).toBeInvalid()
    // 검증에서 막혔으므로 서버로 아무것도 나가지 않는다.
    expect(currentSellerProducts()).toHaveLength(0)
  })

  it('[AC-SPRD-031] 상품명만 채우고 다시 등록하면 말풍선이 카테고리로 옮겨간다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await user.click(await screen.findByRole('button', { name: '등록하기' }))
    await user.type(screen.getByLabelText('상품명'), '스크래쳐')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(screen.getByRole('tooltip')).toHaveTextContent('소분류까지 선택해 주세요')
    expect(screen.getByLabelText('대분류')).toHaveFocus()
  })

  it('[AC-SPRD-031b] 대분류/중분류를 고르고 소분류만 비우면 포커스와 안내가 소분류로 간다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await user.type(await screen.findByLabelText('상품명'), '스크래쳐')
    await user.selectOptions(screen.getByLabelText('대분류'), '고양이')
    await user.selectOptions(screen.getByLabelText('중분류'), '식기/급수기')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(screen.getByLabelText('소분류')).toHaveFocus()
    expect(screen.getByLabelText('소분류')).toHaveAccessibleDescription('소분류까지 선택해 주세요')
    expect(screen.getByLabelText('대분류')).not.toHaveAttribute('aria-describedby')
  })

  it('[AC-SPRD-032] 필수값을 채워 등록하면 presigned 키를 실어 POST하고 목록 맨 앞에 판매중으로 나타난다', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/products/new')

    await fillRequired(user, '원목 스크래쳐 L')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(await screen.findByText('상품을 등록했어요.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/products')
    // 이미지는 presigned가 준 tmp 키로 실려 나간다(도메인 API가 정식 위치로 승격한다).
    const registered = lastSellerProductRegisterBody() as Record<string, unknown>
    expect(registered['thumbnailImageKey']).toMatch(/^tmp\/1\/products\//)
    expect(registered['optionGroups']).toBeNull()
    expect(registered['optionCombinations']).toEqual([
      { optionValues: [], additionalPrice: 0, stockQuantity: 10 },
    ])

    const firstRow = (await screen.findByText('원목 스크래쳐 L')).closest('tr') as HTMLElement
    expect(screen.getAllByRole('row')[1]).toBe(firstRow)
    expect(within(firstRow).getByText('판매중')).toBeInTheDocument()
    expect(within(firstRow).getByText('검수 통과')).toBeInTheDocument()
  })

  it('[AC-SPRD-033] 옵션 2개 그룹(2x2)은 조합 4행을 만들고 등록 후 옵션 조회에 4조합이 온다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await fillRequired(user, '하네스 세트', { stock: false })
    await user.click(screen.getByRole('switch', { name: '옵션 사용' }))
    await user.type(screen.getByLabelText('옵션명 1'), '색상')
    await user.type(screen.getByLabelText('옵션값 1 입력'), '화이트{Enter}블랙{Enter}')
    await user.click(screen.getByRole('button', { name: '옵션 추가' }))
    await user.type(screen.getByLabelText('옵션명 2'), '사이즈')
    await user.type(screen.getByLabelText('옵션값 2 입력'), 'S{Enter}M{Enter}')

    expect(screen.getByText('조합 옵션 / 4개 조합')).toBeInTheDocument()
    const stocks = screen.getAllByLabelText(/ 재고$/)
    expect(stocks).toHaveLength(4)
    expect(stocks[0]).toHaveAccessibleName('화이트 / S 재고')
    for (const input of stocks) await user.type(input, '3')

    await user.click(screen.getByRole('button', { name: '등록하기' }))
    await screen.findByText('상품을 등록했어요.')

    const row = (await screen.findByText('하네스 세트')).closest('tr') as HTMLElement
    // 서버가 조합 이름을 요청 순서대로 ` / `로 잇는다 — 재고 Drawer(실 옵션 조회)로 확인한다.
    await user.click(within(row).getByRole('button', { name: '하네스 세트 재고 12개 수정' }))
    const drawer = screen.getByRole('dialog', { name: '옵션별 재고' })
    const names = (await within(drawer).findAllByLabelText(/ 재고$/)).map(el =>
      el.getAttribute('aria-label'),
    )
    expect(names).toEqual(['화이트 / S 재고', '화이트 / M 재고', '블랙 / S 재고', '블랙 / M 재고'])
  })

  it('[AC-SPRD-033c] 다른 옵션에 있는 옵션값은 BE가 40005로 거절하고 그 문구를 토스트로 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await fillRequired(user, '하네스 세트', { stock: false })
    await user.click(screen.getByRole('switch', { name: '옵션 사용' }))
    await user.type(screen.getByLabelText('옵션명 1'), '색상')
    await user.type(screen.getByLabelText('옵션값 1 입력'), '블랙{Enter}')
    await user.click(screen.getByRole('button', { name: '옵션 추가' }))
    await user.type(screen.getByLabelText('옵션명 2'), '사이즈')
    await user.type(screen.getByLabelText('옵션값 2 입력'), '블랙{Enter}')
    await user.type(screen.getByLabelText('블랙 / 블랙 재고'), '1')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(await screen.findByText('옵션 구성을 확인해 주세요.')).toBeInTheDocument()
    // 거절됐으므로 서버 목록은 그대로다(시드는 빈 목록).
    expect(currentSellerProducts()).toHaveLength(0)
  })

  it('[AC-SPRD-033d] 같은 옵션 안에서 같은 옵션값을 또 추가하면 칩은 하나만 남고 입력은 안내와 함께 남는다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await user.click(await screen.findByRole('switch', { name: '옵션 사용' }))
    await user.type(screen.getByLabelText('옵션값 1 입력'), '블랙{Enter}블랙{Enter}')

    // 칩(삭제 버튼) 1개 + 조합 행 1개. 조용히 버리지 않고 입력을 남긴 채 안내한다(반응 없는 UI 금지).
    expect(screen.getAllByRole('button', { name: '삭제' })).toHaveLength(1)
    expect(screen.getAllByLabelText(/ 재고$/)).toHaveLength(1)
    expect(screen.getByLabelText('옵션값 1 입력')).toHaveValue('블랙')
    expect(screen.getByText('이미 있는 옵션값이에요')).toBeInTheDocument()

    // 입력을 고치면 안내가 사라진다.
    await user.type(screen.getByLabelText('옵션값 1 입력'), '2')
    expect(screen.queryByText('이미 있는 옵션값이에요')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-033b] 빈 옵션 그룹을 추가했다 지워도 조합별로 입력한 재고가 남는다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await user.click(await screen.findByRole('switch', { name: '옵션 사용' }))
    await user.type(screen.getByLabelText('옵션명 1'), '색상')
    await user.type(screen.getByLabelText('옵션값 1 입력'), '화이트{Enter}블랙{Enter}')
    await user.type(screen.getByLabelText('화이트 재고'), '7')

    await user.click(screen.getByRole('button', { name: '옵션 추가' }))
    expect(screen.queryByLabelText('화이트 재고')).not.toBeInTheDocument() // 빈 그룹이 있으면 조합 없음
    await user.click(screen.getByRole('button', { name: '옵션 2 삭제' }))

    expect(screen.getByLabelText('화이트 재고')).toHaveValue('7')
  })

  it('[AC-SPRD-034] 할인을 켜면 할인율을 보여주고, 할인가가 정가보다 크면 BE가 40001로 거절한 문구를 토스트로 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await fillRequired(user, '캣닢 쿠션')
    await user.click(screen.getByRole('switch', { name: '할인 설정' }))
    await user.type(screen.getByLabelText('할인가'), '25500')
    expect(screen.getByText('할인율 15%')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('할인가'))
    await user.type(screen.getByLabelText('할인가'), '40000')
    expect(screen.queryByText(/할인율/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('할인 시작일'), { target: { value: '2026-10-01' } })
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(
      await screen.findByText('가격을 확인해 주세요. 정가는 100원부터 1억 원까지, 할인가는 정가 이하로 입력할 수 있어요.'),
    ).toBeInTheDocument()
    expect(currentSellerProducts()).toHaveLength(0)
  })

  it('[AC-SPRD-035] 10MB 초과는 거절하고, 대표 썸네일 1장이면 추가 버튼이 사라지며 삭제 시 미리보기 URL을 해제한다', async () => {
    const user = userEvent.setup()
    const createSpy = vi.spyOn(URL, 'createObjectURL')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    renderAt('/products/new')
    await screen.findByRole('group', { name: '대표 썸네일' })

    const huge = png('huge.png')
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 })
    await user.upload(fileInputOf('대표 썸네일')!, huge)
    expect(screen.getByText('이미지는 1장당 10MB까지 올릴 수 있어요')).toBeInTheDocument()
    expect(createSpy).not.toHaveBeenCalled()

    await user.upload(fileInputOf('대표 썸네일')!, png())
    expect(fileInputOf('대표 썸네일')).toBeNull()
    const previewUrl = createSpy.mock.results[0]!.value as string

    const group = screen.getByRole('group', { name: '대표 썸네일' })
    await user.click(within(group).getByRole('button', { name: '사진 삭제' }))
    expect(revokeSpy).toHaveBeenCalledWith(previewUrl)
    expect(fileInputOf('대표 썸네일')).not.toBeNull()
  })

  it('[AC-SPRD-035b] 형식이 맞지 않는 이미지는 BE presign이 100000으로 거절하고 그 슬롯을 비우며 필드 아래에 문구를 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await fillRequired(user, '원목 스크래쳐 L', { thumbnail: new File(['gif'], 'a.gif', { type: 'image/gif' }) })
    expect(fileInputOf('대표 썸네일')).toBeNull()
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    // 거절 사유는 그 필드 아래에 뜨고, 실패한 슬롯은 폼에서 빠져 추가 버튼이 다시 보인다.
    const group = screen.getByRole('group', { name: '대표 썸네일' })
    expect(await within(group).findByText('JPG/PNG/WEBP 이미지만 올릴 수 있어요.')).toBeInTheDocument()
    expect(fileInputOf('대표 썸네일')).not.toBeNull()
    // 발급에서 막혔으므로 등록 POST 자체가 나가지 않는다.
    expect(currentSellerProducts()).toHaveLength(0)
  })

  it('[AC-SPRD-045] 가격 범위 위반(400 errorCode 40001)을 서버가 거절하면 폼에 남아 안내한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(SELLER_PRODUCTS_URL, () =>
        HttpResponse.json(
          { errorCode: 40001, message: '상품 가격이 올바르지 않습니다.' },
          { status: 400 },
        ),
      ),
    )
    const { router } = renderAt('/products/new')

    await fillRequired(user, '가격 위반 상품')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(
      await screen.findByText(
        '가격을 확인해 주세요. 정가는 100원부터 1억 원까지, 할인가는 정가 이하로 입력할 수 있어요.',
      ),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/products/new')
  })

  it('[AC-SPRD-046] 옵션 불변식 위반(400 errorCode 40005)도 폼에서 안내한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(SELLER_PRODUCTS_URL, () =>
        HttpResponse.json(
          { errorCode: 40005, message: '조합이 모든 옵션 그룹을 포함하지 않습니다.' },
          { status: 400 },
        ),
      ),
    )
    renderAt('/products/new')

    await fillRequired(user, '옵션 위반 상품')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(await screen.findByText('옵션 구성을 확인해 주세요.')).toBeInTheDocument()
  })

  it('[AC-SPRD-047] 셀러 비활성(403 errorCode 40004)이면 등록이 안내 문구로 끝난다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(SELLER_PRODUCTS_URL, () =>
        HttpResponse.json(
          { errorCode: 40004, message: '판매 활동이 가능한 셀러가 아닙니다.' },
          { status: 403 },
        ),
      ),
    )
    renderAt('/products/new')

    await fillRequired(user, '비활성 셀러 상품')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(
      await screen.findByText('판매 활동이 가능한 계정이 아니라 처리할 수 없어요.'),
    ).toBeInTheDocument()
  })

  it('[AC-SPRD-048] 온보딩 미완(403 errorCode 20006)이면 구매자 앱 안내로 끝난다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(SELLER_PRODUCTS_URL, () =>
        HttpResponse.json({ errorCode: 20006, message: '온보딩이 필요합니다.' }, { status: 403 }),
      ),
    )
    renderAt('/products/new')

    await fillRequired(user, '온보딩 미완 상품')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(
      await screen.findByText('구매자 앱에서 온보딩(약관/닉네임)을 완료한 뒤 이용할 수 있어요.'),
    ).toBeInTheDocument()
  })

  // 카테고리(api 호스트 GET /categories)는 목업 시절 실패할 수 없었고 실 API 전환으로 처음
  // 도달 가능해졌다 — 연쇄 Select 3단이 전부 이 트리에서 나오므로 실패하면 등록이 전면 불가다.
  it('[AC-SPRD-056] 카테고리 조회가 실패하면 백지 대신 사유와 재시도를 보여주고 다시 시도로 복구된다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(
        CATEGORIES_URL,
        () => HttpResponse.json({ errorCode: 90000, message: '서버 오류입니다.' }, { status: 500 }),
        { once: true },
      ),
    )
    renderAt('/products/new')

    expect(await screen.findByText('카테고리를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByLabelText('상품명')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByLabelText('상품명')).toBeInTheDocument()
    expect(screen.queryByText('카테고리를 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-057] 카테고리를 불러오는 동안에도 백지가 아니라 로딩을 보여준다', async () => {
    let release = () => {}
    const pending = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.get(CATEGORIES_URL, async () => {
        await pending
        return HttpResponse.json({ data: MOCK_CATEGORY_TREE })
      }),
    )
    renderAt('/products/new')

    // 라우터 마운트가 한 틱 뒤라 findBy로 기다린다 — 카테고리 응답은 아직 보류 상태다.
    expect(await screen.findByRole('status', { name: '등록 양식을 불러오는 중' })).toBeInTheDocument()

    release()
    expect(await screen.findByLabelText('상품명')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '등록 양식을 불러오는 중' })).not.toBeInTheDocument()
  })

  it('[AC-SPRD-038] 배송 정책 칸은 서버 정책 요약과 수정 링크를 보여준다(목업 수치 아님)', async () => {
    seedShippingPolicy(
      makeShippingPolicyWire({ defaultCourierCode: 'CJ', baseShippingFee: 3000, freeShippingThreshold: 30000 }),
    )
    renderAt('/products/new')

    // 택배사 라벨도 서버 마스터(courierName)에서 온다 — FE가 코드를 라벨로 지어내지 않는다.
    expect(await screen.findByText('CJ대한통운 / 기본 배송비 3,000원 / 30,000원 이상 무료배송')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '배송 정책 수정' })).toBeInTheDocument()
    expect(screen.queryByText('배송 정책 설정은 준비 중이에요')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-039] 배송 정책 조회가 실패해도 등록 폼은 열리고 실패를 드러낸다', async () => {
    // 상품 등록은 정책 조회에 매여 있지 않다 — 빈 자리로 떨구지 말고 못 읽었다고 말한다.
    server.use(
      http.get(SELLER_SHIPPING_POLICY_URL, () =>
        HttpResponse.json({ errorCode: 50000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    renderAt('/products/new')

    expect(await screen.findByText('배송 정책을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByLabelText('상품명')).toBeInTheDocument()
  })
})

// 임시저장은 BE에 없어 진입점(버튼·Drawer)을 숨겼다 — 이어쓰기 배선과 목업 구현만 남겨 두었으므로
// 주소로 직접 들어오는 경로로 프리필·승격을 검증한다(서버가 생기면 이 테스트가 그대로 계약이 된다).
describe('/products/new?draftId= 이어쓰기 (목업 전용 — BE 임시저장 없음)', () => {
  beforeEach(() => {
    seedSellerProducts([])
    resetProductsMock()
  })

  it('[AC-SPRD-036] 임시저장을 이어 등록하면 프리필된 값으로 POST하고 그 임시저장이 빠진다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new?draftId=01JMOCKDRAFT00000000000001')

    expect(await screen.findByLabelText('상품명')).toHaveValue('강아지 하네스 S')
    // 임시저장의 categoryId가 실 API(GET /categories) 트리에서 소분류까지 되살아난다.
    expect(screen.getByLabelText('소분류')).toHaveDisplayValue('하네스')
    await user.upload(fileInputOf('대표 썸네일')!, png())
    await user.type(screen.getByLabelText('재고'), '4')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(await screen.findByText('상품을 등록했어요.')).toBeInTheDocument()
    // 목록 재조회가 끝난 뒤에 서버/목업 상태를 읽는다(뒤늦은 state 반영이 act 밖으로 새지 않게).
    await screen.findByText('강아지 하네스 S')
    expect(currentSellerProducts()[0]).toMatchObject({ name: '강아지 하네스 S' })
    expect((await drafts()).map(d => d.productId)).not.toContain('01JMOCKDRAFT00000000000001')
  })

})

// 수정 폼은 실 API(GET /sellers/me/products/{productId} → PUT 같은 경로)로 돈다. 프리필에 필요한
// categoryId·description·할인 기간·추가/상세 이미지 키는 목록 응답에 없으므로 단건 조회만이 유일한
// 출처이고, PUT이 이미지 목록을 통째로 교체하므로 "조회 응답을 그대로 되돌려 보낸다"가 계약이다.
describe('/products/$productId/edit 수정 폼 (SCRUM-254)', () => {
  const FEEDER_DETAIL = {
    categoryId: leafIdOf('고양이 > 식기/급수기 > 자동 급식기'),
    description: '5L 대용량',
    discountPrice: 59000,
    // 날짜 입력에는 시각이 없다 — 날짜를 안 바꾸면 이 시각까지 그대로 되돌려 보내야 한다.
    discountStartAt: '2026-10-01T15:30:00',
    discountEndAt: '2026-10-31T18:00:00',
    thumbnailImageKey: 'products/THUMB.png',
    additionalImageKeys: ['products/ADD1.png', 'products/ADD2.png'],
    detailImageKeys: ['products/DETAIL1.png'],
  }

  const FEEDER = makeSellerProductWire({
    name: '고양이 자동 급식기 스마트 5L',
    regularPrice: 64000,
    discountPrice: 59000,
    thumbnailImageKey: 'products/THUMB.png',
  })

  const editPath = `/products/${FEEDER.productId}/edit`

  beforeEach(() => {
    seedSellerProducts([{ product: FEEDER, detail: FEEDER_DETAIL }])
    resetProductsMock()
  })

  it('[AC-SPRD-058] 목록에 없는 값(카테고리·설명·할인 기간·추가/상세 이미지)까지 서버 단건 조회로 프리필한다', async () => {
    renderAt(editPath)

    expect(await screen.findByLabelText('상품명')).toHaveValue('고양이 자동 급식기 스마트 5L')
    expect(screen.getByLabelText('소분류')).toHaveDisplayValue('자동 급식기')
    expect(screen.getByLabelText('상세 설명')).toHaveValue('5L 대용량')
    expect(screen.getByLabelText('정가')).toHaveValue('64000')
    expect(screen.getByLabelText('할인가')).toHaveValue('59000')
    expect(screen.getByLabelText('할인 시작일')).toHaveValue('2026-10-01')
    expect(screen.getByLabelText('할인 종료일')).toHaveValue('2026-10-31')
    // 이미지 슬롯은 종류별 개수로 센다(저장 키 자체는 PUT 본문에서 단언한다).
    const slotCount = (groupName: string) =>
      within(screen.getByRole('group', { name: groupName })).getAllByRole('button', { name: '사진 삭제' }).length
    expect(slotCount('대표 썸네일')).toBe(1)
    expect(slotCount('추가 썸네일')).toBe(2)
    expect(slotCount('상품 상세 이미지')).toBe(1)
  })

  it('[AC-SPRD-059] 아무것도 고치지 않고 저장하면 조회 응답의 저장 키와 할인 시각을 그대로 되돌려 보낸다', async () => {
    const user = userEvent.setup()
    renderAt(editPath)

    await user.click(await screen.findByRole('button', { name: '수정 완료' }))

    await waitFor(() => expect(lastSellerProductUpdateBody()).not.toBeNull())
    // 닫힌 과거 키를 섞으면 403/100002이고, 빠뜨리면 그 이미지가 직전 버전으로 닫힌다 — 왕복이 계약이다.
    expect(lastSellerProductUpdateBody()).toEqual({
      categoryId: FEEDER_DETAIL.categoryId,
      productName: '고양이 자동 급식기 스마트 5L',
      description: '5L 대용량',
      regularPrice: 64000,
      discountPrice: 59000,
      discountStartAt: '2026-10-01T15:30:00',
      discountEndAt: '2026-10-31T18:00:00',
      thumbnailImageKey: 'products/THUMB.png',
      additionalImageKeys: ['products/ADD1.png', 'products/ADD2.png'],
      detailImageKeys: ['products/DETAIL1.png'],
    })
  })

  it('[AC-SPRD-060] 없는 상품·남의 상품(404 errorCode 40000)은 찾을 수 없다고 끝낸다', async () => {
    renderAt('/products/01JNOTEXISTNOTEXISTNOTEX/edit')

    expect(await screen.findByText('상품을 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.queryByLabelText('상품명')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '목록으로' })).toBeInTheDocument()
  })

  it('[AC-SPRD-061] 휴점·정지 셀러(403 errorCode 40004)는 "없는 상품"이 아니라 사유를 보여준다', async () => {
    server.use(
      http.get(`${SELLER_PRODUCTS_URL}/:productId`, () =>
        HttpResponse.json(
          { errorCode: 40004, message: '활성 상태의 셀러만 상품을 등록할 수 있습니다.' },
          { status: 403 },
        ),
      ),
    )
    renderAt(editPath)

    expect(await screen.findByText('상품을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('판매 활동이 가능한 계정이 아니라 처리할 수 없어요.')).toBeInTheDocument()
    expect(screen.queryByText('상품을 찾을 수 없어요')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-064] 프리필 뒤 재조회가 실패해도 작성 중인 입력을 버리지 않고 경고만 띄운다', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderAt(editPath)

    await user.clear(await screen.findByLabelText('상품명'))
    await user.type(screen.getByLabelText('상품명'), '작성 중인 이름')

    // react-query는 캐시가 있으면 재조회 실패에도 직전 data를 남긴다 — 그걸 보지 않고 폼을
    // 언마운트하면 창 포커스 한 번으로 입력이 사라진다(staleTime 60초 + refetchOnWindowFocus).
    server.use(
      http.get(`${SELLER_PRODUCTS_URL}/:productId`, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    await act(() => queryClient.refetchQueries({ queryKey: ['products', 'detail'] }))

    expect(
      await screen.findByText('최신 상품 정보를 다시 불러오지 못했어요. 저장 전에 새로고침해 확인해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('상품명')).toHaveValue('작성 중인 이름')
  })

  it('[AC-SPRD-065] 옵션 조회만 실패하면 영구 로딩이 아니라 불러오지 못했다고 보여준다', async () => {
    server.use(
      http.get(`${SELLER_PRODUCTS_URL}/:productId/options`, () =>
        HttpResponse.json({ errorCode: 40007, message: '조회할 수 없는 상품입니다.' }, { status: 403 }),
      ),
    )
    renderAt(editPath)

    await screen.findByLabelText('상품명')

    expect(await screen.findByText('옵션/재고를 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('내 상품이 아니라 조회할 수 없어요.')
  })

  it('[AC-SPRD-062] 서버가 thumbnailImageKey를 null로 주면 폼을 열고 재업로드를 안내한다', async () => {
    seedSellerProducts([
      {
        product: makeSellerProductWire({ ...FEEDER, thumbnailImageKey: null }),
        detail: { ...FEEDER_DETAIL, thumbnailImageKey: null },
      },
    ])
    renderAt(`/products/${FEEDER.productId}/edit`)

    expect(await screen.findByText('대표 썸네일이 없는 상품이에요. 저장하려면 썸네일을 다시 올려 주세요.')).toBeInTheDocument()
    // 폼 자체는 열린다 — 재업로드가 유일한 복구 경로다.
    expect(screen.getByLabelText('상품명')).toHaveValue('고양이 자동 급식기 스마트 5L')
  })
})
