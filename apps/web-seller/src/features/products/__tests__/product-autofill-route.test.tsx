import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTOFILL_DRAFT_WIRE,
  AUTOFILL_SELLER_NOTICE,
  SELLER_PRODUCT_DRAFT_AUTOFILL_URL,
  lastProductDraftAutofillBody,
  seedProductDraftAutofill,
  seedSellerProducts,
  server,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// AI 초안은 실 API(POST /sellers/me/product-drafts/autofill)로 나간다. BE는 AI 실패도 200 + state로
// 돌려주고 쿨다운만 429/40402라, 그 경우들을 MSW 시나리오로 가른다(seedProductDraftAutofill).
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
const AI_REFINED_TEXT = 'AI가 다시 썼어요. 내용을 확인하고 고쳐 주세요.'
const SELLER_DESCRIPTION = '직접 쓴 설명'

/** 설명을 채워 REFINE 모드로 만든 뒤 버튼을 돌려준다 — 문구 자체가 모드를 말한다. */
async function typeNameAndDescription() {
  const user = userEvent.setup()
  renderAt('/products/new')
  await user.type(await screen.findByLabelText('상품명'), '고양이 자동 급식기')
  await user.type(screen.getByLabelText('상세 설명'), SELLER_DESCRIPTION)
  return { user, button: screen.getByRole('button', { name: '본문 다듬기' }) }
}

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

  it('[AC-SPRD-070] 상품명이 비면 버튼이 잠기고, 설명이 비어 있으면 FILL로 나가 빈 칸을 채운다', async () => {
    const user = userEvent.setup()
    renderAt('/products/new')
    const button = await screen.findByRole('button', { name: 'AI 초안 받기' })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText('상품명'), '고양이 자동 급식기')
    expect(button).toBeEnabled()
    await user.click(button)

    expect(await screen.findByRole('status')).toHaveTextContent(
      `AI가 카테고리/상세 설명/옵션에 초안을 채웠어요. 확인하고 고쳐 주세요. ${AUTOFILL_SELLER_NOTICE}`,
    )
    // 카테고리는 소분류 id 하나로 대/중/소 세 단을 채운다.
    expect(screen.getByLabelText('대분류')).toHaveDisplayValue('고양이')
    expect(screen.getByLabelText('중분류')).toHaveDisplayValue('식기/급수기')
    expect(screen.getByLabelText('소분류')).toHaveDisplayValue('자동 급식기')
    expect(screen.getByLabelText('상세 설명')).toHaveValue(AUTOFILL_DRAFT_WIRE.description)
    // 옵션은 켜지고 그룹·조합이 펼쳐진다. AI가 재고를 안 정했으니 재고 칸은 비어 있다.
    expect(screen.getByRole('switch', { name: '옵션 사용' })).toBeChecked()
    expect(screen.getByLabelText('옵션명 1')).toHaveValue('용량')
    expect(screen.getByLabelText('5L 추가 금액')).toHaveValue('5000')
    expect(screen.getByLabelText('3L 재고')).toHaveValue('')
    // 채운 세 자리에 표시가 붙고, 덮은 것이 없으니 되돌리기 자리도 없다.
    expect(screen.getAllByText(AI_FILLED_TEXT)).toHaveLength(3)
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
    // 잠글 값이 없어 lockedFields는 실리지 않는다. 모드는 요청에 늘 적는다.
    expect(lastProductDraftAutofillBody()).toEqual({
      productName: '고양이 자동 급식기',
      mode: 'FILL',
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

  // ─── 본문 다듬기 (SCRUM-379) ──────────────────────────────────────────────
  // 설명이 차 있으면 모드가 갈린다 — 빈 칸 채우기가 아니라 쓴 본문을 다시 쓰는 호출이다.
  // 소리 없이 덮으면 안 되므로 버튼 문구가 모드를 말하고, 적용 직후 되돌릴 자리를 둔다.

  it('[AC-SPRD-105] 설명이 차 있으면 REFINE으로 나가 본문을 다시 쓰고 원문을 입력으로 싣는다', async () => {
    const { user, button } = await typeNameAndDescription()

    await user.click(button)

    expect(await screen.findByRole('status')).toHaveTextContent(
      `AI가 본문을 다시 쓰고 카테고리/옵션에 초안을 채웠어요. 확인하고 고쳐 주세요. ${AUTOFILL_SELLER_NOTICE}`,
    )
    expect(screen.getByLabelText('상세 설명')).toHaveValue(AUTOFILL_DRAFT_WIRE.description)
    // 다시 쓴 칸은 "채웠다"가 아니라 "다시 썼다"로 말한다 — 셀러가 잃은 것이 있다.
    expect(screen.getByLabelText('상세 설명')).toHaveAccessibleDescription(AI_REFINED_TEXT)
    expect(screen.getAllByText(AI_FILLED_TEXT)).toHaveLength(2)
    // 원문은 lockedFields에 그대로 실린다 — 되돌리지 않는 쪽은 mode가 가른다.
    expect(lastProductDraftAutofillBody()).toEqual({
      productName: '고양이 자동 급식기',
      mode: 'REFINE',
      lockedFields: { description: SELLER_DESCRIPTION },
    })
  })

  it('[AC-SPRD-106] 되돌리기가 원문을 복원하고 그 자리를 거둔다', async () => {
    const { user, button } = await typeNameAndDescription()
    await user.click(button)
    await screen.findByRole('status')

    await user.click(screen.getByRole('button', { name: '되돌리기' }))

    expect(screen.getByLabelText('상세 설명')).toHaveValue(SELLER_DESCRIPTION)
    expect(screen.getByRole('status')).toHaveTextContent('본문을 원래대로 되돌렸어요.')
    // 한 번만 되돌린다 — 복원한 본문은 셀러가 쓴 값이라 AI 표시도 떼어야 한다.
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
    expect(screen.queryByText(AI_REFINED_TEXT)).not.toBeInTheDocument()
  })

  it('[AC-SPRD-107] 셀러가 본문을 다시 고치면 되돌리기 자리를 거둔다', async () => {
    // 되돌리기가 남아 있으면 그 수정까지 원문으로 쓸려 간다.
    const { user, button } = await typeNameAndDescription()
    await user.click(button)
    await screen.findByRole('status')
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('상세 설명'), ' 덧붙인 문장')

    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
  })

  // ─── 비운 사유(fieldStatus) ───────────────────────────────────────────────

  it('[AC-SPRD-108] 비운 사유를 칸 옆에 한 줄로 보여 주고 두 값의 문구가 갈린다', async () => {
    seedProductDraftAutofill('empty-reasons')
    const { user, button } = await typeNameAndFindButton('고양이 자동 급식기')

    await user.click(button)

    // 호출이 죽은 칸은 다시 시도할 수 있고, 모델이 비워 둔 칸은 다시 불러도 같다.
    const callFailed = await screen.findByText('불러오지 못했어요. 다시 시도해 주세요')
    expect(
      screen.getByLabelText('소분류').compareDocumentPosition(callFailed) & Node.DOCUMENT_POSITION_FOLLOWING,
      '카테고리 칸 아래에 붙는다',
    ).toBeTruthy()
    expect(screen.getByLabelText('상세 설명')).toHaveAccessibleDescription('직접 작성해 주세요')
    // 그 밖의 값(EMPTY_NOT_ATTEMPTED)은 안내할 것이 없어 그리지 않고, 와이어 값도 새지 않는다.
    expect(screen.queryByText(/EMPTY_/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('채울 빈 칸이 없어 그대로 두었어요.')
  })

  it('[AC-SPRD-120] 다시 쓰지 못한 응답을 "다시 썼다"로 말하지 않고 그 사유를 칸 옆에 적는다', async () => {
    // AI는 다시 쓸 수 없으면(가드 탈락·품목 미확정) 받은 원문을 그대로 담아 KEPT_LOCKED로 돌려준다.
    // 진위만 보면 같은 글자를 되쓰고 "다시 썼어요"를 적어, 셀러가 받는 신호가 0이 된다.
    seedProductDraftAutofill('kept-locked')
    const { user, button } = await typeNameAndDescription()

    await user.click(button)

    expect(await screen.findByRole('status')).toHaveTextContent(
      '본문은 그대로 두고 카테고리/옵션에 초안을 채웠어요. 확인하고 고쳐 주세요.',
    )
    const description = screen.getByLabelText('상세 설명')
    expect(description).toHaveValue(SELLER_DESCRIPTION)
    expect(description).toHaveAccessibleDescription('본문을 다시 쓰지 못해 그대로 두었어요')
    // 복원할 것이 없으니 되돌리기 자리도, "다시 썼다"는 표시도 없다.
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
    expect(screen.queryByText(AI_REFINED_TEXT)).not.toBeInTheDocument()
  })

  it('[AC-SPRD-122] 다시 쓰지 못한 두 번째 호출은 직전 되돌리기 자리를 거두지 않는다', async () => {
    // 덮은 것이 없으므로 직전 원문이 여전히 올바른 복원 대상이다 -- 자리를 거두면 셀러가
    // 원문으로 돌아갈 길을 잃는다.
    const { user, button } = await typeNameAndDescription()
    await user.click(button)
    await screen.findByRole('status')
    expect(screen.getByLabelText('상세 설명')).toHaveValue(AUTOFILL_DRAFT_WIRE.description)

    seedProductDraftAutofill('kept-locked')
    await user.click(screen.getByRole('button', { name: '본문 다듬기' }))

    expect(await screen.findByText('본문을 다시 쓰지 못해 그대로 두었어요.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(screen.getByLabelText('상세 설명')).toHaveValue(SELLER_DESCRIPTION)
  })

  it('[AC-SPRD-121] 기다리는 사이 쓴 본문도 되돌리기가 복원한다', async () => {
    // 폼은 호출 중에 잠기지 않는다 -- REFINE이 덮는 것은 응답이 올 때의 본문이라 되돌릴 자리도
    // 그 값이어야 한다. 클릭 시점 값을 들고 있으면 기다리는 사이 쓴 글이 복구 경로 없이 사라진다.
    const REFINED = 'AI가 다시 쓴 본문'
    let release = () => {}
    const sent = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(SELLER_PRODUCT_DRAFT_AUTOFILL_URL, async () => {
        await sent
        return HttpResponse.json({
          data: {
            state: 'OK',
            draft: { categoryId: null, description: REFINED, optionGroups: [], optionCombinations: [] },
            fieldStatus: { description: 'FILLED' },
            basis: {},
            sellerNotice: null,
          },
        })
      }),
    )
    const { user, button } = await typeNameAndDescription()

    await user.click(button)
    await user.type(screen.getByLabelText('상세 설명'), ' 덧붙인 문장')
    release()

    expect(await screen.findByRole('status')).toHaveTextContent('AI가 본문을 다시 썼어요.')
    expect(screen.getByLabelText('상세 설명')).toHaveValue(REFINED)

    await user.click(screen.getByRole('button', { name: '되돌리기' }))

    expect(screen.getByLabelText('상세 설명')).toHaveValue(`${SELLER_DESCRIPTION} 덧붙인 문장`)
  })
})
