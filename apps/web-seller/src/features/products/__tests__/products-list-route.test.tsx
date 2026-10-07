import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { resetProductsMock } from '../products.mock'
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

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement

describe('/products 목록 (SCRUM-119)', () => {
  beforeEach(() => {
    resetProductsMock()
  })

  it('[AC-SPRD-020] 판매/검수 pill, 진행 중 할인가, 임시저장 수를 보여주고 판매종료 행도 BE처럼 다시 판매/수정할 수 있다', async () => {
    renderAt('/products')

    const feeder = await rowOf('고양이 자동 급식기 스마트 5L')
    expect(within(feeder).getByText('판매중')).toBeInTheDocument()
    expect(within(feeder).getByText('검수 통과')).toBeInTheDocument()
    expect(within(feeder).getByText('자동 급식기')).toBeInTheDocument() // 소분류 이름만
    expect(await screen.findByRole('button', { name: '임시저장 2' })).toBeInTheDocument()

    const snack = await rowOf('유기농 동결건조 간식 닭가슴살')
    expect(within(snack).getByText('12,500원')).toBeInTheDocument()
    expect(within(snack).getByText(/17%/)).toBeInTheDocument()

    const wheel = await rowOf('[단종] 캣휠 라지')
    expect(within(wheel).getByText('판매종료')).toBeInTheDocument()
    expect(within(wheel).getByRole('switch', { name: '[단종] 캣휠 라지 판매' })).toHaveAttribute('aria-checked', 'false')
    expect(within(wheel).getByRole('button', { name: '수정' })).toBeInTheDocument()
  })

  it('[AC-SPRD-021] 판매 토글을 끄면 확인 Modal을 거쳐 판매 중지되고, 취소하면 그대로다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf('고양이 자동 급식기 스마트 5L')
    const toggle = within(row).getByRole('switch', { name: '고양이 자동 급식기 스마트 5L 판매' })

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
    const row = await rowOf('산책 하네스 세트')

    await user.click(within(row).getByRole('switch', { name: '산책 하네스 세트 판매' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await within(row).findByText('판매중')).toBeInTheDocument()
    expect(await screen.findByText('판매를 다시 시작했어요.')).toBeInTheDocument()
  })

  it('[AC-SPRD-022b] 재고 없는 판매종료 상품을 다시 판매하면 BE 응답대로 품절이 된다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf('[단종] 캣휠 라지')

    await user.click(within(row).getByRole('switch', { name: '[단종] 캣휠 라지 판매' }))

    expect(await screen.findByText('재고가 없어 품절로 표시돼요.')).toBeInTheDocument()
    expect(await within(row).findByText('품절')).toBeInTheDocument()
  })

  it('[AC-SPRD-023] 삭제(목업 전용)는 확인 Modal을 거쳐 행을 지운다', async () => {
    const user = userEvent.setup()
    renderAt('/products')

    await user.click(within(await rowOf('산책 하네스 세트')).getByRole('button', { name: '삭제' }))
    const dialog = screen.getByRole('dialog', { name: '상품을 삭제할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '삭제' }))

    expect(await screen.findByText('상품을 삭제했어요.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('산책 하네스 세트')).not.toBeInTheDocument())
  })

  it('[AC-SPRD-024] 재고 Drawer는 목표 재고와의 차이를 증감으로 저장하고 행 재고와 판매 상태가 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf('대용량 모래 8.5L 벤토나이트')
    expect(within(row).getByText('품절')).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: '대용량 모래 8.5L 벤토나이트 재고 0개 수정' }))
    const drawer = screen.getByRole('dialog', { name: '옵션별 재고' })
    const input = await within(drawer).findByLabelText('기본 재고')
    const save = within(drawer).getByRole('button', { name: '기본 재고 저장' })
    expect(save).toBeDisabled() // 바뀐 값이 없으면 저장 불가

    // BE 증감 한도(±1,000,000)를 넘는 목표는 보내지 않는다.
    await user.clear(input)
    await user.type(input, '1000001')
    await user.click(save)
    expect(within(drawer).getByText('한 번에 100만 개까지 늘리거나 줄일 수 있어요')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '5')
    await user.click(save)
    // 저장 중 고친 값은 성공 시 사라지므로 응답까지 입력을 잠근다.
    expect(input).toBeDisabled()

    expect(await screen.findByText('재고를 저장했어요.')).toBeInTheDocument()
    expect(input).toBeEnabled()
    expect(
      await within(row).findByRole('button', { name: '대용량 모래 8.5L 벤토나이트 재고 5개 수정' }),
    ).toHaveTextContent('5')
    expect(within(row).getByText('판매중')).toBeInTheDocument()
  })

  it('[AC-SPRD-024b] 재고 Drawer에서 꺼 둔 옵션의 판매를 켜면 그 재고가 총재고에 더해진다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    const row = await rowOf('유기농 동결건조 간식 닭가슴살')

    await user.click(within(row).getByRole('button', { name: '유기농 동결건조 간식 닭가슴살 재고 54개 수정' }))
    const drawer = screen.getByRole('dialog', { name: '옵션별 재고' })
    const toggle = await within(drawer).findByRole('switch', { name: '100g 판매' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)

    expect(await screen.findByText('옵션 판매를 켰어요.')).toBeInTheDocument()
    expect(await within(row).findByRole('button', { name: /재고 66개 수정/ })).toBeInTheDocument()
  })

  it('[AC-SPRD-025] 임시저장 Drawer에서 항목을 고르면 draftId를 실어 등록 화면으로 가고 저장한 값을 채운다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products')

    await user.click(await screen.findByRole('button', { name: '임시저장 2' }))
    const drawer = screen.getByRole('dialog', { name: '임시저장한 상품' })
    expect(within(drawer).getByText('강아지 하네스 S')).toBeInTheDocument()
    expect(within(drawer).getByText('이름 없는 상품')).toBeInTheDocument()

    await user.click(within(drawer).getByText('강아지 하네스 S'))

    await screen.findByRole('heading', { name: '상품 등록' })
    expect(router.state.location.pathname).toBe('/products/new')
    expect(router.state.location.search).toEqual({ draftId: '01JMOCKDRAFT00000000000001' })
    expect(await screen.findByLabelText('상품명')).toHaveValue('강아지 하네스 S')
    expect(screen.getByLabelText('정가')).toHaveValue('25000')
  })

  it('[AC-SPRD-026] 검색/카테고리/판매 상태/정렬은 BE 목록 파라미터로 거른다', async () => {
    const user = userEvent.setup()
    renderAt('/products')
    await rowOf('산책 하네스 세트')
    const bodyRows = () => screen.getAllByRole('row').slice(1)

    await user.selectOptions(screen.getByRole('combobox', { name: '판매 상태' }), '판매 중지')
    await waitFor(() => expect(bodyRows()).toHaveLength(1))
    expect(bodyRows()[0]).toHaveTextContent('산책 하네스 세트')

    await user.click(screen.getByRole('button', { name: '초기화' }))
    // 카테고리 트리(GET /categories) 로드를 기다린다. 라벨의 >는 innerHTML 비교가 안 돼 option 요소로 고른다.
    const hygiene = await screen.findByRole('option', { name: '고양이 > 위생/미용' })
    await user.selectOptions(screen.getByRole('combobox', { name: '카테고리' }), hygiene)
    await waitFor(() => expect(bodyRows()).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: '초기화' }))
    await user.type(screen.getByPlaceholderText('상품명 검색'), '급식기')
    await waitFor(() => expect(bodyRows()).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: '초기화' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), '가격 높은순')
    await waitFor(() => expect(bodyRows()[0]).toHaveTextContent('[단종] 캣휠 라지'))
    expect(screen.getByText('총 7개')).toBeInTheDocument()
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

    await user.click(screen.getByRole('switch', { name: '산책 하네스 세트 판매' }))
    expect(await screen.findByText('판매를 다시 시작했어요.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '닫기' }))

    expect(screen.queryByText('판매를 다시 시작했어요.')).not.toBeInTheDocument()
    expect(screen.queryByText('상품을 등록했어요.')).not.toBeInTheDocument()
  })
})
