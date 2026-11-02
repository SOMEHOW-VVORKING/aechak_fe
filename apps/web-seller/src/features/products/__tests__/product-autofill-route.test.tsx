import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTOFILL_SELLER_NOTICE,
  lastProductDraftAutofillBody,
  seedProductDraftAutofill,
  seedSellerProducts,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// AI 초안은 실 API(POST /sellers/me/product-drafts/autofill)로 나간다. BE는 AI 실패도 200 + state로
// 돌려주고 쿨다운만 429/40402라, 세 경우를 MSW 시나리오로 가른다(seedProductDraftAutofill).
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
}

const AI_FILLED_TEXT = 'AI가 채웠어요. 내용을 확인하고 고쳐 주세요.'

async function typeNameAndFindButton(name: string) {
  const user = userEvent.setup()
  renderAt('/products/new')
  const button = await screen.findByRole('button', { name: 'AI 초안 받기' })
  await user.type(screen.getByLabelText('상품명'), name)
  return { user, button }
}

function expectUntouchedForm() {
  expect(screen.getByLabelText('대분류')).toHaveValue('')
  expect(screen.getByLabelText('상세 설명')).toHaveValue('')
  expect(screen.getByRole('switch', { name: '옵션 사용' })).not.toBeChecked()
  expect(screen.queryByText(AI_FILLED_TEXT)).not.toBeInTheDocument()
}

describe('/products/new AI 초안 받기 (SCRUM-349)', () => {
  beforeEach(() => {
    seedSellerProducts([])
    seedProductDraftAutofill()
  })

  it('[AC-SPRD-070] 상품명이 비면 버튼이 잠기고, 누르면 빈 칸(카테고리/옵션)만 채우고 이미 쓴 설명은 덮지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')
    const button = await screen.findByRole('button', { name: 'AI 초안 받기' })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText('상품명'), '고양이 자동 급식기')
    await user.type(screen.getByLabelText('상세 설명'), '직접 쓴 설명')
    expect(button).toBeEnabled()
    await user.click(button)

    expect(await screen.findByRole('status')).toHaveTextContent(
      `AI가 카테고리/옵션에 초안을 채웠어요. 확인하고 고쳐 주세요. ${AUTOFILL_SELLER_NOTICE}`,
    )
    // 카테고리는 소분류 id 하나로 대/중/소 세 단을 채운다.
    expect(screen.getByLabelText('대분류')).toHaveDisplayValue('고양이')
    expect(screen.getByLabelText('중분류')).toHaveDisplayValue('식기/급수기')
    expect(screen.getByLabelText('소분류')).toHaveDisplayValue('자동 급식기')
    // 이미 쓴 설명은 그대로다.
    expect(screen.getByLabelText('상세 설명')).toHaveValue('직접 쓴 설명')
    // 옵션은 켜지고 그룹·조합이 펼쳐진다. AI가 재고를 안 정했으니 재고 칸은 비어 있다.
    expect(screen.getByRole('switch', { name: '옵션 사용' })).toBeChecked()
    expect(screen.getByLabelText('옵션명 1')).toHaveValue('용량')
    expect(screen.getByLabelText('5L 추가 금액')).toHaveValue('5000')
    expect(screen.getByLabelText('3L 재고')).toHaveValue('')
    // 채운 두 자리(카테고리·옵션)에만 표시가 붙는다.
    expect(screen.getAllByText(AI_FILLED_TEXT)).toHaveLength(2)
    // 셀러가 쓴 설명은 lockedFields로 실려 AI가 그 전제로 나머지를 만든다.
    expect(lastProductDraftAutofillBody()).toEqual({
      productName: '고양이 자동 급식기',
      lockedFields: { description: '직접 쓴 설명' },
    })
  })

  it('[AC-SPRD-071] AI가 못 만들면(200 + state UNAVAILABLE) 폼은 그대로고 직접 작성 안내만 보인다', async () => {
    seedProductDraftAutofill('unavailable')
    const { user, button } = await typeNameAndFindButton('고양이 자동 급식기')

    await user.click(button)

    const notice = await screen.findByText('지금은 AI 초안을 받을 수 없어요. 직접 작성해 주세요.')
    expect(notice).toHaveAttribute('role', 'alert')
    expectUntouchedForm()
    // 다시 시도할 수 있게 버튼은 살아 있다.
    expect(button).toBeEnabled()
  })

  it('[AC-SPRD-072] 쿨다운(429 errorCode 40402)이면 잠시 뒤 다시 받으라고 안내하고 폼은 그대로다', async () => {
    seedProductDraftAutofill('cooldown')
    const { user, button } = await typeNameAndFindButton('고양이 자동 급식기')

    await user.click(button)

    const notice = await screen.findByText('AI 초안은 잠시 뒤 다시 받을 수 있어요.')
    expect(notice).toHaveAttribute('role', 'alert')
    expectUntouchedForm()
    expect(button).toBeEnabled()
  })
})
