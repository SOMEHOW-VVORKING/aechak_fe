import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockFetchProductDrafts,
  mockFetchProductOptions,
  mockFetchProducts,
  resetProductsMock,
} from '../products.mock'
import { routeTree } from '../../../routeTree.gen'

// 목업 메모리 스토어만 쓴다 — MSW 핸들러를 안 두므로(onUnhandledRequest:'error') 네트워크 무호출도 함께 검증된다.
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
  return router
}

const listed = async () => (await mockFetchProducts()).data
const drafts = async () => (await mockFetchProductDrafts()).data

const png = (name = 'a.png') => new File(['png'], name, { type: 'image/png' })

// DS PhotoUpload의 file input은 추가 버튼 안에 숨어 있고 label이 없다 — 그룹 이름으로 범위를 좁힌 뒤
// DOM으로 찾는다(role/label 쿼리로 닿을 수 없는 유일한 자리).
const fileInputOf = (groupName: string) =>
  within(screen.getByRole('group', { name: groupName }))
    .queryByRole('button', { name: /\d+\/\d+/ })
    ?.querySelector<HTMLInputElement>('input[type=file]') ?? null

async function fillRequired(user: UserEvent, name: string, { stock = true } = {}) {
  await user.type(await screen.findByLabelText('상품명'), name)
  await user.selectOptions(screen.getByLabelText('대분류'), '고양이')
  await user.selectOptions(screen.getByLabelText('중분류'), '식기/급수기')
  await user.selectOptions(screen.getByLabelText('소분류'), '자동 급식기')
  await user.type(screen.getByLabelText('정가'), '30000')
  await user.upload(fileInputOf('대표 썸네일')!, png())
  if (stock) await user.type(screen.getByLabelText('재고'), '10')
}

describe('/products/new, /products/$productId/edit 등록/수정 폼 (SCRUM-120)', () => {
  beforeEach(() => {
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
    expect((await listed()).totalCount).toBe(7)
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

  it('[AC-SPRD-032] 필수값을 채워 등록하면 목록 맨 앞에 판매중으로 나타나고 완료 토스트가 뜬다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products/new')

    await fillRequired(user, '원목 스크래쳐 L')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(await screen.findByText('상품을 등록했어요.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/products')
    const firstRow = (await screen.findByText('원목 스크래쳐 L')).closest('tr') as HTMLElement
    expect(screen.getAllByRole('row')[1]).toBe(firstRow)
    expect(within(firstRow).getByText('판매중')).toBeInTheDocument()
    expect(within(firstRow).getByText('검수 통과')).toBeInTheDocument()
  })

  it('[AC-SPRD-033] 옵션 2개 그룹(2x2)은 조합 4행을 만들고 등록 후 상세에 4조합이 저장된다', async () => {
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
    await screen.findByText('하네스 세트')

    const [created] = (await listed()).products
    expect(created!.totalStock).toBe(12)
    const { optionCombinations } = (await mockFetchProductOptions(created!.productId)).data
    expect(optionCombinations.map(c => c.name)).toEqual(['화이트 / S', '화이트 / M', '블랙 / S', '블랙 / M'])
  })

  it('[AC-SPRD-033c] 다른 옵션에 있는 옵션값은 추가하지 않는다(BE 40005)', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await user.click(await screen.findByRole('switch', { name: '옵션 사용' }))
    await user.type(screen.getByLabelText('옵션값 1 입력'), '블랙{Enter}')
    await user.click(screen.getByRole('button', { name: '옵션 추가' }))
    await user.type(screen.getByLabelText('옵션값 2 입력'), '블랙{Enter}')

    expect(screen.getByText('이미 있는 옵션값이에요')).toBeInTheDocument()
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

  it('[AC-SPRD-034] 할인을 켜면 할인율을 보여주고, 할인가가 정가보다 크면 오류를 띄운다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')

    await user.type(await screen.findByLabelText('정가'), '15000')
    await user.click(screen.getByRole('switch', { name: '할인 설정' }))
    await user.type(screen.getByLabelText('할인가'), '12500')
    expect(screen.getByText('할인율 17%')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('할인가'))
    await user.type(screen.getByLabelText('할인가'), '20000')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(screen.getByText('할인가는 정가보다 클 수 없어요')).toBeInTheDocument()
    expect(screen.queryByText(/할인율/)).not.toBeInTheDocument()
  })

  it('[AC-SPRD-035] GIF/10MB 초과는 거절하고, 대표 썸네일 1장이면 추가 버튼이 사라지며 삭제 시 미리보기 URL을 해제한다', async () => {
    const user = userEvent.setup()
    const createSpy = vi.spyOn(URL, 'createObjectURL')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    renderAt('/products/new')
    await screen.findByRole('group', { name: '대표 썸네일' })

    await user.upload(fileInputOf('대표 썸네일')!, new File(['gif'], 'a.gif', { type: 'image/gif' }))
    expect(screen.getByText('JPG/PNG/WEBP 이미지만 올릴 수 있어요')).toBeInTheDocument()

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

  it('[AC-SPRD-036] 임시저장하면 토스트와 함께 URL에 draftId가 붙고, 다시 저장해도 같은 임시저장을 덮어쓴다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products/new')

    await user.type(await screen.findByLabelText('상품명'), '캣닢 쿠션')
    await user.click(screen.getByRole('button', { name: '임시저장' }))

    expect(await screen.findByText('임시저장했어요.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toHaveProperty('draftId'))
    const { draftId } = router.state.location.search as { draftId: string }
    expect(await drafts()).toHaveLength(3)

    await user.type(screen.getByLabelText('상품명'), ' 2개입')
    await user.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(async () => expect((await drafts())[0]!.productName).toBe('캣닢 쿠션 2개입'))

    const saved = await drafts()
    expect(saved).toHaveLength(3)
    expect(saved[0]!.productId).toBe(draftId)
  })

  it('[AC-SPRD-036b] 임시저장을 이어 등록하면 그 임시저장이 목록에서 빠진다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new?draftId=01JMOCKDRAFT00000000000001')

    expect(await screen.findByLabelText('상품명')).toHaveValue('강아지 하네스 S')
    await user.upload(fileInputOf('대표 썸네일')!, png())
    await user.type(screen.getByLabelText('재고'), '4')
    await user.click(screen.getByRole('button', { name: '등록하기' }))

    expect(await screen.findByText('상품을 등록했어요.')).toBeInTheDocument()
    expect((await drafts()).map(d => d.productId)).not.toContain('01JMOCKDRAFT00000000000001')
  })

  it('[AC-SPRD-037] 수정 화면은 기존 값을 채우고 옵션/재고는 읽기 전용이며, 정가를 바꿔 저장하면 목록 판매가가 바뀐다', async () => {
    const user = userEvent.setup()
    const feeder = (await mockFetchProducts({ keyword: '급식기' })).data.products[0]!.productId
    renderAt(`/products/${feeder}/edit`)

    expect(await screen.findByLabelText('상품명')).toHaveValue('고양이 자동 급식기 스마트 5L')
    expect(screen.getByLabelText('대분류')).toHaveDisplayValue('고양이')
    expect(screen.getByLabelText('중분류')).toHaveDisplayValue('식기/급수기')
    expect(screen.getByLabelText('소분류')).toHaveDisplayValue('자동 급식기')
    // PUT은 옵션/재고를 바꾸지 않아 입력 대신 현재 값과 재고 Drawer 안내만 보여준다.
    expect(await screen.findByRole('cell', { name: '화이트' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '80' })).toBeInTheDocument()
    expect(screen.getByText(/상품 목록의 재고 버튼에서/)).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '옵션 사용' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('화이트 재고')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('정가'))
    await user.type(screen.getByLabelText('정가'), '70000')
    await user.click(screen.getByRole('button', { name: '수정 완료' }))

    expect(await screen.findByText('상품을 수정했어요.')).toBeInTheDocument()
    const row = (await screen.findByText('고양이 자동 급식기 스마트 5L')).closest('tr') as HTMLElement
    expect(within(row).getByText('70,000원')).toBeInTheDocument()
  })

  it('[AC-SPRD-038] 배송 정책은 셀러 정책 요약과 배송 정책 화면 링크로 보여준다', async () => {
    renderAt('/products/new')

    expect(await screen.findByText(/기본 배송비 3,000원/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '배송 정책 수정' })).toHaveAttribute('href', '/shipping-policy')
  })
})
