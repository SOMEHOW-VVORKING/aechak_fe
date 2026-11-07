import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { logout, resetAuth } from '@/shared/auth'
import { resetRegistry } from '@/shared/catalog'
import { setAccessToken, setOnAuthExpired } from '@aechak/api'
import type { ProductReviewSummaryResponse, AiReviewSummaryResponse } from '@aechak/api'
import {
  PRODUCT_DETAIL_URL,
  PRODUCT_LIKE_URL,
  PRODUCT_OPTIONS_URL,
  PRODUCT_REVIEW_SUMMARY_URL,
  PRODUCT_REVIEWS_URL,
  REAL_PRODUCT_DETAIL,
  REAL_PRODUCT_ID,
  REAL_PRODUCT_OPTIONS,
  currentCart,
  makeCartRow,
  seedCart,
  server,
  WEB_REFRESH_URL,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

const REAL_NAME = REAL_PRODUCT_DETAIL.name

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

const PRODUCT_AI_SUMMARY: AiReviewSummaryResponse = {
  analyzedReviewCount: 37,
  pros: [
    {
      aspectCode: 'PALATABILITY',
      headline: '잘 먹는다는 평이 많아요.',
      mentionCount: 21,
      quotes: ['처음 줬는데 그릇을 싹 비웠어요.'],
    },
  ],
  cons: [
    {
      aspectCode: 'KIBBLE_SIZE',
      headline: '알갱이가 조금 크다는 의견이 있어요.',
      mentionCount: 6,
      quotes: [],
    },
  ],
  consAbsenceReason: null,
  generatedAt: '2026-10-27T03:00:00',
}

function serveReviewSummary(data: ProductReviewSummaryResponse) {
  server.use(http.get(PRODUCT_REVIEW_SUMMARY_URL, () => HttpResponse.json({ data })))
}

describe('/products/$productId', () => {
  beforeEach(() => {
    resetAuth()
    // 회원 세션(메모리 access 보유)이 전제인 화면이다 — 토큰이 세션의 정본이라 이걸로 로그인시킨다.
    setAccessToken('member-token')
    resetRegistry()
    // 회원 전제 테스트는 **토큰까지** 있어야 한다. 상세 라우트가 beforeLoad에서 세션을 복원하는데
    // (SCRUM-340 — 비회원이 회원 전용 조회로 상세를 잃지 않게), 메모리 토큰이 없으면 refresh를
    // 시도하고 기본 핸들러가 401이라 로그아웃된다. loggedIn만 true이고 토큰이 없는 상태는 실제
    // 앱의 회원에게 존재하지 않는다. 비회원 전제 테스트는 본문에서 logout()을 부른다.
    setAccessToken('test-access-token')
  })

  it('[AC-PRODUCT-005] 서버에 없는 목업 id 주소는 목업 상세 대신 not-found를 렌더한다', async () => {
    renderAt('/products/p-feeder-5l')
    expect(await screen.findByText('상품을 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.queryByText('고양이 자동 급식기 스마트 5L 앱 연동 타이머')).not.toBeInTheDocument()
    expect(screen.queryByText('냥이상점')).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-011] 실 ULID 상품은 실 API 상세(이름·설명)를 렌더한다', async () => {
    renderAt('/products/' + REAL_PRODUCT_ID)
    expect(await screen.findByText('리얼 프리미엄 자동 급식기')).toBeInTheDocument()
    expect(screen.getByText('앱으로 급여 시간을 관리하는 실데이터 급식기예요.')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-012] 옵션 시트에서 조합을 고르면 총액에 추가금이 반영된다', async () => {
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    // 하단 액션바 "장바구니" → 옵션 시트(실 옵션 로드)
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    const select = await screen.findByRole('combobox')
    // 프리미엄형(+5,000원) 선택 시 기본가 64,000 + 5,000 = 69,000원(시트 총액에만 등장)
    await user.selectOptions(select, '프리미엄형')
    expect(await screen.findByText('69,000원')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-022] 옵션 시트 수량 상한은 재고가 많아도 라인당 상한 99개다', async () => {
    // 기본형 재고를 150으로 — 상한이 재고를 따르면 99를 넘겨 담기가 400으로 거절된다.
    server.use(
      http.get(PRODUCT_OPTIONS_URL, ({ params }) =>
        params.productId === REAL_PRODUCT_ID
          ? HttpResponse.json({
              data: {
                ...REAL_PRODUCT_OPTIONS,
                optionCombinations: REAL_PRODUCT_OPTIONS.optionCombinations.map(c =>
                  c.optionCombinationId === 1 ? { ...c, remainingStock: 150 } : c,
                ),
              },
            })
          : new HttpResponse(null, { status: 404 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    expect(await screen.findByText('재고 150개')).toBeInTheDocument()
    const qty = screen.getByRole('textbox', { name: '값' })
    await user.clear(qty)
    await user.type(qty, '150')
    await user.tab()
    expect(qty).toHaveValue('99')
    expect(screen.getByText('총 99개')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '증가' })).toBeDisabled()
  })

  it('[AC-PRODUCT-023] 이미 담긴 수량과 합쳐 99개를 넘으면 합산 초과로 안내하고 시트를 열어 둔다', async () => {
    seedCart([
      makeCartRow({ cartItemId: 1, optionCombinationId: 1, quantity: 99, remainingStock: 150 }),
    ])
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    expect(
      await screen.findByText(/이미 담긴 수량과 합쳐 99개를 넘을 수 없어요/),
    ).toBeInTheDocument()
    expect(screen.queryByText('수량은 1개 이상 99개 이하로 담을 수 있어요')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '장바구니 담기' })).toBeInTheDocument()
    expect(currentCart()[0]?.quantity).toBe(99)
  })

  it('[AC-PRODUCT-013] 실 옵션 조회가 오류면 옵션 시트가 담기/구매를 막고 재시도를 보여준다', async () => {
    // 실 상품의 /options를 500으로 강제 — 실 옵션 실패를 "기본 구성" 기본가로 위장하면 안 된다.
    server.use(
      http.get(PRODUCT_OPTIONS_URL, ({ params }) =>
        params.productId === REAL_PRODUCT_ID
          ? new HttpResponse(null, { status: 500 })
          : new HttpResponse(null, { status: 404 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    expect(await screen.findByText('옵션 정보를 불러오지 못했어요')).toBeInTheDocument()
    // 담기/구매 버튼은 렌더되지 않는다(잘못된 기본가 주문 차단).
    expect(screen.queryByRole('button', { name: '장바구니 담기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '바로 구매' })).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-038] 실 상품의 옵션 조합이 0건이면 기본 구성을 지어내지 않고 담기를 막는다', async () => {
    // 실 옵션 응답(200)에 조합이 없는 상품 — dev 상품이 전부 이 상태다. '기본 구성'을 지어내면
    // 수량·합계·담기가 다 활성이라 담기를 눌러야 비로소 막히고 사용자는 사유를 못 읽는다.
    server.use(
      http.get(PRODUCT_OPTIONS_URL, ({ params }) =>
        params.productId === REAL_PRODUCT_ID
          ? HttpResponse.json({ data: { ...REAL_PRODUCT_OPTIONS, optionCombinations: [] } })
          : new HttpResponse(null, { status: 404 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))

    expect(await screen.findByText('아직 판매 준비가 안 된 상품이에요')).toBeInTheDocument()
    expect(screen.queryByText('기본 구성')).not.toBeInTheDocument()
    // 담기 버튼·수량 스테퍼가 아예 없다(눌러야 막히는 자리를 만들지 않는다).
    expect(screen.queryByRole('button', { name: '장바구니 담기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '값' })).not.toBeInTheDocument()
    expect(currentCart()).toHaveLength(0)
  })

  it('[AC-PRODUCT-006] 알 수 없는 productId는 not-found 상태를 렌더한다', async () => {
    renderAt('/products/does-not-exist')
    expect(await screen.findByText('상품을 찾을 수 없어요')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-007] 카테고리(중분류) breadcrumb를 누르면 해당 카테고리 마켓으로 이동한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText(REAL_NAME)

    // 마지막 crumb('사료/간식')만 카탈로그 중분류와 매칭돼 버튼이다(상위 crumb는 정적 텍스트).
    await user.click(screen.getByRole('button', { name: '사료/간식' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/market')
    })
    expect(router.state.location.search).toMatchObject({ category: '사료/간식' })
  })

  it('[AC-PRODUCT-008] 상세 정리: 판매중/SALE pill·가격 밑 총별점 링크·리뷰 정렬 칩이 없다', async () => {
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText(REAL_NAME)

    // 판매중/SALE 상태 pill 줄 제거(할인% 표기는 가격 블록에 유지)
    expect(screen.queryByText('판매중')).not.toBeInTheDocument()
    expect(screen.queryByText(/SALE/)).not.toBeInTheDocument()
    expect(screen.getByText('28%')).toBeInTheDocument()
    expect(screen.getByText('89,000원')).toBeInTheDocument()

    // 가격 바로 아래 "총별점 / 5 · 리뷰 N건" 요약 링크 제거
    expect(screen.queryByText('/ 5')).not.toBeInTheDocument()

    // 리뷰 섹션 정렬 칩 제거 + 전체보기는 유지
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByText('별점높은순')).not.toBeInTheDocument()
    expect(screen.queryByText('포토리뷰만')).not.toBeInTheDocument()
    expect(screen.getByText('전체보기')).toBeInTheDocument()

    // 리뷰 '구매' 인증 pill 제거(소비측에서 verifiedPurchase 미전달)
    expect(screen.queryByText('구매')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '장바구니' })).toBeInTheDocument()
  })

  it('[AC-PRODUCT-014] 비회원이 전체보기를 누르면 강제 이동 대신 로그인 게이트가 뜬다', async () => {
    // 리뷰 목록 API는 JWT 필수라, 비회원이 전체보기로 바로 진입하면 401 → 전역 로그인 리다이렉트로
    // 상세를 잃는다. 로그인 게이트로 감싸 비회원에겐 로그인 시트를 먼저 띄우고 이동은 막는다.
    logout()
    const user = userEvent.setup()
    const router = renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText(REAL_NAME)

    await user.click(screen.getByText('전체보기'))
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    // 리뷰 목록으로 이동하지 않고 상세에 머문다.
    expect(router.state.location.pathname).toBe('/products/' + REAL_PRODUCT_ID)
  })

  it('[AC-PRODUCT-024] 비회원이 상품 신고하기를 누르면 신고 화면 대신 게이트가 뜬다', async () => {
    // 신고 접수 API는 JWT 필수라, 비회원이 신고 화면에서 제출하면 401 뒤 로그인 화면으로 밀려난다.
    logout()
    const user = userEvent.setup()
    const router = renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText(REAL_NAME)

    await user.click(screen.getByText('상품 신고하기'))
    expect(await screen.findByText('신고는 로그인한 회원만 이용할 수 있어요.', { exact: false })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/products/' + REAL_PRODUCT_ID)
  })

  it('[AC-PRODUCT-015] 비회원이 하단 찜(하트)을 누르면 게이트가 뜨고 찜 토글이 일어나지 않는다', async () => {
    // 하단 액션바의 찜/장바구니/구매는 모두 requireAuth로 감싸져 있어, 비회원은 실제 동작 대신
    // 로그인 게이트가 먼저 뜬다(AC-014의 전체보기 게이트와 같은 부류, 이쪽은 액션바에 초점).
    // 모듈 싱글턴이라 렌더가 loggedIn을 true로 되돌리지 않으므로 resetAuth 후 logout으로 비회원을 만든다.
    logout()
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText(REAL_NAME)

    // 하트는 텍스트가 아니라 aria-label 버튼이다(찜 전 '찜하기', 찜 후 '찜 해제').
    // 찜 미러는 SCRUM-113에서 시드가 사라져 빈 상태로 시작하므로 처음엔 '찜하기'/aria-pressed=false다.
    await user.click(screen.getByRole('button', { name: '찜하기' }))
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(
      screen.getByText('찜은 로그인한 회원만 이용할 수 있어요.', { exact: false }),
    ).toBeInTheDocument()
    // 찜이 토글되지 않았다 — 여전히 '찜하기'(미찜) + aria-pressed false, 찜 토스트도 없다.
    expect(screen.getByRole('button', { name: '찜하기' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('찜했어요.')).not.toBeInTheDocument()
  })

  /**
   * 공유 버튼은 토스트만 띄우고 클립보드를 부르지 않았다 — 사용자가 복사됐다고 읽고 붙여넣으면
   * 아무것도 없었다. SNS 프로필 공유와 같은 모양(writeText await + 실패 처리)인지 본다.
   */
  it('[AC-PRODUCT-034] 공유는 상품 링크를 실제로 클립보드에 쓰고 토스트를 띄운다', async () => {
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText(REAL_NAME)

    await user.click(screen.getByRole('button', { name: '공유' }))

    expect(await screen.findByText('상품 링크를 복사했어요.')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/products/${REAL_PRODUCT_ID}`,
    )
  })

  it('[AC-PRODUCT-035] 클립보드 쓰기가 막히면 복사했다고 하지 않고 실패를 알린다', async () => {
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText(REAL_NAME)
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))

    await user.click(screen.getByRole('button', { name: '공유' }))

    expect(await screen.findByText('링크를 복사하지 못했어요.')).toBeInTheDocument()
    expect(screen.queryByText('상품 링크를 복사했어요.')).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-037] 실 상품 찜은 그대로 서버로 나가고 하트가 채워진다', async () => {
    let likeCalls = 0
    server.use(
      http.post(PRODUCT_LIKE_URL, () => {
        likeCalls += 1
        return new HttpResponse(null, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '찜하기' }))

    expect(await screen.findByText('찜했어요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '찜 해제' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(likeCalls).toBe(1))
  })

  it('[AC-PRODUCT-016] 비회원이 하단 장바구니를 누르면 옵션 시트 대신 게이트가 뜬다', async () => {
    logout()
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText(REAL_NAME)

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(
      screen.getByText('장바구니 담기는 로그인한 회원만 이용할 수 있어요.', { exact: false }),
    ).toBeInTheDocument()
    // 옵션 선택 시트는 열리지 않는다(setSheetOpen이 호출되지 않음).
    expect(screen.queryByText('옵션 선택')).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-017] 바로구매 진입점이 없다 — 액션바·옵션 시트 모두 담기만 제공한다', async () => {
    // BE 주문 생성이 장바구니 행 id만 받으므로 바로구매 CTA를 두지 않는다(담기 우회는 수량이 합쳐져 의도와 다른 주문).
    const user = userEvent.setup()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    expect(screen.queryByRole('button', { name: '구매하기' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    expect(await screen.findByRole('button', { name: '장바구니 담기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '바로 구매' })).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-021] 품절 상품은 액션바 담기 버튼이 품절로 비활성화된다', async () => {
    server.use(
      http.get(PRODUCT_DETAIL_URL, () =>
        HttpResponse.json({ data: { ...REAL_PRODUCT_DETAIL, saleStatus: 'SOLD_OUT' } }),
      ),
    )
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByRole('button', { name: '품절' })
    expect(screen.getByRole('button', { name: '품절' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '장바구니' })).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-018] 로그인 상태의 실 상품 상세는 서버 리뷰를 최대 3개까지 미리 보여준다', async () => {
    // 상세 응답에는 평균/건수만 있고 목록이 없어 리뷰 목록 API 첫 페이지(size=3)를 따로 불러 채운다.
    renderAt('/products/' + REAL_PRODUCT_ID)
    // 최신순 상위 3건(505/504/503)만 뜨고 4번째(502)는 전체보기로 넘어간다.
    expect(await screen.findByText('소음이 조금 있어요. 기능은 무난해요.')).toBeInTheDocument()
    expect(
      screen.getByText('두 번째 구매예요. 믿고 쓰는 제품이라 계속 살 것 같아요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('가격 대비 무난해요. 조금 더 컸으면 하는 아쉬움은 있어요.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('배송도 빠르고 포장도 튼튼했어요. 실물이 더 좋아요.'),
    ).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-019] 비회원 상세는 리뷰 목록 API를 아예 호출하지 않는다', async () => {
    // 리뷰 목록 API는 JWT 필수(비로그인 401)라, 호출하면 전역 리다이렉트로 상세를 잃는다.
    // 그래서 비회원은 요약·전체보기 진입점만 보고 미리보기 요청 자체가 나가지 않아야 한다.
    let reviewCalls = 0
    server.use(
      http.get(PRODUCT_REVIEWS_URL, () => {
        reviewCalls += 1
        return HttpResponse.json(
          { errorCode: 20004, message: '인증이 필요합니다.' },
          { status: 401 },
        )
      }),
    )
    logout()
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('리얼 프리미엄 자동 급식기')
    // 요약(리뷰 128)은 상세 응답에서 오므로 그대로 뜬다.
    expect(await screen.findByText('리뷰 128')).toBeInTheDocument()
    await waitFor(() => expect(reviewCalls).toBe(0))
    expect(screen.queryByText('소음이 조금 있어요. 기능은 무난해요.')).not.toBeInTheDocument()
    // 호출을 막은 쿼리는 react-query v5에서 isPending=true다 — 그걸로 분기하면 스켈레톤 3장이
    // 영구히 남는다. 이 안내가 보이려면 로딩 분기가 isFetching이어야 한다.
    expect(screen.getByText('리뷰를 보려면 로그인이 필요해요.')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-032] 세션 확인이 실패하면 리뷰 칸에 로그인이 필요하다고 적지 않는다', async () => {
    // refresh 5xx로 회원 여부를 모르는 상태(unknown)다 — refresh 쿠키가 멀쩡한 회원일 수 있어서
    // "로그인이 필요해요"라고 적으면 사실이 아닌 사유를 읽힌다.
    resetAuth()
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 }),
      ),
    )
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('리뷰 128')).toBeInTheDocument()
    expect(
      await screen.findByText('리뷰를 불러오지 못했어요. 전체보기에서 다시 확인해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('리뷰를 보려면 로그인이 필요해요.')).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-031] 비회원도 상세 본문(이름·가격·옵션 진입)을 끝까지 본다', async () => {
    // GET /products/{id}는 BE가 permitAll로 열어 둔 게스트 카탈로그다 — 비회원이 공유 링크로
    // 들어와도 상세가 로그인 화면으로 바뀌지 않아야 한다.
    logout()
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('리얼 프리미엄 자동 급식기')).toBeInTheDocument()
    expect(screen.queryByText('로그인이 필요해요')).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-020] 미리보기 조회가 실패하면 빈 목록 대신 사유를 알린다', async () => {
    // 요약("리뷰 128")은 상세 응답에서 오므로 그대로 뜨는데 미리보기만 비면 리뷰가 없는 것처럼
    // 보인다 — 던진 오류를 화면이 소비하지 않으면 그 보호가 실제로는 없는 셈이다.
    server.use(
      http.get(PRODUCT_REVIEWS_URL, () => HttpResponse.json({ message: 'error' }, { status: 500 })),
    )
    renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    expect(
      await screen.findByText('리뷰를 불러오지 못했어요. 전체보기에서 다시 확인해 주세요.'),
    ).toBeInTheDocument()
  })

  it('[AC-PRODUCT-024] 상품 요약과 비슷한 아이 요약이 있으면 카드 두 개와 안내 문구를 보여준다', async () => {
    serveReviewSummary({
      productSummary: PRODUCT_AI_SUMMARY,
      similarPetSummary: {
        species: 'DOG',
        weightBand: 'DOG_UNDER_5',
        summary: {
          ...PRODUCT_AI_SUMMARY,
          analyzedReviewCount: 12,
          pros: [
            {
              aspectCode: 'KIBBLE_SIZE',
              headline: '작은 아이도 먹기 좋은 크기래요.',
              mentionCount: 5,
              quotes: [],
            },
          ],
        },
      },
    })
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('AI 리뷰 요약')).toBeInTheDocument()
    expect(screen.getByText('리뷰 37건을 분석했어요')).toBeInTheDocument()
    expect(screen.getByText('잘 먹는다는 평이 많아요.')).toBeInTheDocument()
    expect(screen.getByText('리뷰 21건')).toBeInTheDocument()
    expect(screen.getByText('처음 줬는데 그릇을 싹 비웠어요.')).toBeInTheDocument()
    expect(screen.getAllByText('알갱이가 조금 크다는 의견이 있어요.')).toHaveLength(2)

    expect(screen.getByText('우리 아이와 비슷한 5kg 미만 강아지 보호자 리뷰')).toBeInTheDocument()
    expect(screen.getByText('리뷰 12건을 분석했어요')).toBeInTheDocument()
    expect(screen.getByText('작은 아이도 먹기 좋은 크기래요.')).toBeInTheDocument()
    expect(
      screen.getByText('구매자 리뷰를 AI가 요약한 내용이라 실제 리뷰와 다를 수 있어요.'),
    ).toBeInTheDocument()
  })

  it('[AC-PRODUCT-030] 비슷한 아이 요약만 있어도 AI 요약임을 알리는 안내 문구와 함께 보여준다', async () => {
    serveReviewSummary({
      productSummary: null,
      similarPetSummary: { species: 'CAT', weightBand: 'CAT_4_6', summary: PRODUCT_AI_SUMMARY },
    })
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('우리 아이와 비슷한 4~6kg 고양이 보호자 리뷰')).toBeInTheDocument()
    expect(screen.queryByText('AI 리뷰 요약')).not.toBeInTheDocument()
    expect(
      screen.getByText('구매자 리뷰를 AI가 요약한 내용이라 실제 리뷰와 다를 수 있어요.'),
    ).toBeInTheDocument()
  })

  it('[AC-PRODUCT-025] 아쉬운 점이 비면 사유 한 줄을 보여주고 비슷한 아이 카드는 그리지 않는다', async () => {
    serveReviewSummary({
      productSummary: {
        ...PRODUCT_AI_SUMMARY,
        cons: [],
        consAbsenceReason: 'BELOW_MENTION_THRESHOLD',
      },
      similarPetSummary: null,
    })
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('AI 리뷰 요약')).toBeInTheDocument()
    expect(screen.getByText('아쉬운 점')).toBeInTheDocument()
    expect(screen.getByText('여러 명이 공통으로 말한 아쉬운 점은 아직 없어요.')).toBeInTheDocument()
    expect(screen.queryByText(/우리 아이와 비슷한/)).not.toBeInTheDocument()
  })

  it.each([
    ['NO_NEGATIVE_MENTIONS_FOUND', '분석한 리뷰에서 아쉬운 점 언급은 없었어요.'],
    ['PARTIALLY_UNEXTRACTED', '일부 리뷰를 아직 분석하지 못해 아쉬운 점은 정리하지 않았어요.'],
    ['NARRATION_MISSING', '여러 리뷰에서 나온 아쉬운 점이 있지만 아직 정리하지 못했어요.'],
    ['SOME_FUTURE_REASON', '아쉬운 점은 아직 정리하지 못했어요.'],
  ])(
    '[AC-PRODUCT-028] 아쉬운 점이 비면 사유 %s마다 안내를 보여주고 칸을 숨기지 않는다',
    async (reason, note) => {
      // 칸을 숨기면 반복된 단점이 있는 상품(NARRATION_MISSING)도 단점이 없는 것처럼 보인다.
      serveReviewSummary({
        productSummary: { ...PRODUCT_AI_SUMMARY, cons: [], consAbsenceReason: reason },
        similarPetSummary: null,
      })
      renderAt('/products/' + REAL_PRODUCT_ID)

      expect(await screen.findByText(note)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '아쉬운 점' })).toBeInTheDocument()
    },
  )

  it('[AC-PRODUCT-029] 요약을 불러오지 못하면 요약이 없는 것과 구분되게 알린다', async () => {
    server.use(http.get(PRODUCT_REVIEW_SUMMARY_URL, () => HttpResponse.json({}, { status: 500 })))
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('AI 리뷰 요약을 불러오지 못했어요.')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-026] 두 요약이 모두 null이면 카드와 안내 문구를 그리지 않는다', async () => {
    let summaryCalls = 0
    server.use(
      http.get(PRODUCT_REVIEW_SUMMARY_URL, () => {
        summaryCalls += 1
        return HttpResponse.json({ data: { productSummary: null, similarPetSummary: null } })
      }),
    )
    renderAt('/products/' + REAL_PRODUCT_ID)

    // 같은 조건으로 함께 나가는 리뷰 미리보기가 뜰 때면 요약 응답도 받은 뒤다.
    expect(await screen.findByText('소음이 조금 있어요. 기능은 무난해요.')).toBeInTheDocument()
    await waitFor(() => expect(summaryCalls).toBe(1))
    expect(screen.queryByText('AI 리뷰 요약')).not.toBeInTheDocument()
    expect(
      screen.queryByText('구매자 리뷰를 AI가 요약한 내용이라 실제 리뷰와 다를 수 있어요.'),
    ).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-027] 비회원 상세도 리뷰 요약은 조회하고 리뷰 목록은 호출하지 않는다', async () => {
    // 요약 API는 비회원에게 열렸다(SCRUM-351). 리뷰 목록 API는 여전히 JWT 필수라 나가면 안 된다.
    let reviewCalls = 0
    server.use(
      http.get(PRODUCT_REVIEWS_URL, () => {
        reviewCalls += 1
        return HttpResponse.json(
          { errorCode: 20004, message: '인증이 필요합니다.' },
          { status: 401 },
        )
      }),
    )
    serveReviewSummary({ productSummary: PRODUCT_AI_SUMMARY, similarPetSummary: null })
    logout()
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('AI 리뷰 요약')).toBeInTheDocument()
    expect(screen.getByText('리뷰 37건을 분석했어요')).toBeInTheDocument()
    expect(screen.queryByText(/우리 아이와 비슷한/)).not.toBeInTheDocument()
    expect(reviewCalls).toBe(0)
  })

  it('[AC-PRODUCT-031] 비회원 요약 요청이 401이어도 로그인으로 튕기지 않고 실패 한 줄만 보여준다', async () => {
    // 서버가 열기 전까지 비회원 요청은 401이다. 전역 세션 만료 핸들러가 깨어나면 상세를 잃는다.
    const onAuthExpired = vi.fn()
    setOnAuthExpired(onAuthExpired)
    let summaryCalls = 0
    server.use(
      http.get(PRODUCT_REVIEW_SUMMARY_URL, () => {
        summaryCalls += 1
        return HttpResponse.json(
          { errorCode: 20004, message: '인증이 필요합니다.' },
          { status: 401 },
        )
      }),
    )
    logout()
    const router = renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('AI 리뷰 요약을 불러오지 못했어요.')).toBeInTheDocument()
    expect(summaryCalls).toBeGreaterThan(0)
    expect(onAuthExpired).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/products/' + REAL_PRODUCT_ID)
    expect(screen.getByText('리얼 프리미엄 자동 급식기')).toBeInTheDocument()
    setOnAuthExpired(null)
  })

})
