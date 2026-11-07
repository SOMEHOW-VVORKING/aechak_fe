import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import { REAL_PRODUCT_ID, REPORTS_URL, server } from '@/testing/msw/server'

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

describe('상품 신고 라우트', () => {
  it('[AC-REPORT-005] 실 상품(ULID)은 목업에 없어도 실 API로 대상을 해석해 신고 폼을 렌더한다', async () => {
    // 상세를 거치지 않고 신고 URL로 직접 진입/새로고침해도, 실 상품 API로 대상을 조회해
    // not-found가 아니라 정상 신고 폼이 뜬다(예전엔 목업 조회만 해서 실 상품이 not-found였다).
    renderAt(`/products/${REAL_PRODUCT_ID}/report`)
    expect(await screen.findByText('리얼 프리미엄 자동 급식기')).toBeInTheDocument()
    expect(screen.getByText('상품 신고 사유를 선택해 주세요')).toBeInTheDocument()
    expect(screen.queryByText('상품을 찾을 수 없어요')).not.toBeInTheDocument()
  })

  it('[AC-REPORT-006] 목업/실 상품 어디에도 없는 id는 not-found를 렌더한다', async () => {
    // 실 API 404 → 레지스트리에도 없음 → 진짜 미존재라 not-found.
    renderAt('/products/01JNONEXISTENT00000000000/report')
    expect(await screen.findByText('상품을 찾을 수 없어요')).toBeInTheDocument()
  })

  it('[AC-REPORT-007] 목업 카탈로그 상품은 실 API 없이 신고 폼을 렌더한다', async () => {
    // 목업 진입점(홈/검색/찜)에서 온 p-* 상품은 findMockProduct로 단락돼 네트워크 없이 목업으로 뜬다.
    renderAt('/products/p-feeder-5l/report')
    expect(await screen.findByText('상품 신고 사유를 선택해 주세요')).toBeInTheDocument()
  })

  it('[AC-REPORT-008] 실 상품 신고는 POST /reports로 사유 코드와 상세 내용을 보내고 접수 완료를 보여준다', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(REPORTS_URL, async ({ request }) => {
        bodies.push(await request.json())
        return new HttpResponse(null, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/products/${REAL_PRODUCT_ID}/report`)
    await user.click(await screen.findByText('허위/과장 광고'))
    await user.type(screen.getByRole('textbox'), '  효능을 부풀려 적었어요  ')
    await user.click(screen.getByRole('button', { name: '상품 신고 제출' }))

    expect(await screen.findByText('신고가 접수됐어요')).toBeInTheDocument()
    expect(bodies).toEqual([
      { targetType: 'PRODUCT', targetId: REAL_PRODUCT_ID, reasonCode: 'FALSE_AD', reasonText: '효능을 부풀려 적었어요' },
    ])
  })

  it('[AC-REPORT-009] 이미 신고한 상품(409)은 사유를 알리고 폼에 머문다', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(REPORTS_URL, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ errorCode: 40303, message: '이미 신고한 상품입니다.' }, { status: 409 })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/products/${REAL_PRODUCT_ID}/report`)
    await user.click(await screen.findByText('상품 정보 오류'))
    await user.click(screen.getByRole('button', { name: '상품 신고 제출' }))

    expect((await screen.findByText('이미 신고한 상품이에요.')).closest('[role="alert"]')).not.toBeNull()
    expect(screen.getByText('상품 신고 사유를 선택해 주세요')).toBeInTheDocument()
    // 상세를 비워 두면 null로 보낸다.
    expect(bodies).toEqual([
      { targetType: 'PRODUCT', targetId: REAL_PRODUCT_ID, reasonCode: 'INFO_ERROR', reasonText: null },
    ])
  })

  it('[AC-REPORT-010] 기타 사유는 상세 내용을 적어야 제출할 수 있다', async () => {
    const user = userEvent.setup()
    renderAt(`/products/${REAL_PRODUCT_ID}/report`)
    await user.click(await screen.findByText('기타'))
    expect(screen.getByText('(필수)')).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: '상품 신고 제출' })
    expect(submit).toBeDisabled()

    // 공백만 적으면 여전히 제출할 수 없다.
    await user.type(screen.getByRole('textbox'), '   ')
    expect(submit).toBeDisabled()
    await user.clear(screen.getByRole('textbox'))

    await user.type(screen.getByRole('textbox'), '판매 페이지 이미지가 다른 상품이에요')
    expect(submit).toBeEnabled()
  })

  it('[AC-REPORT-011] 목업 카탈로그 상품은 서버로 보내지 않고 신고할 수 없다고 알린다', async () => {
    let called = 0
    server.use(
      http.post(REPORTS_URL, () => {
        called += 1
        return new HttpResponse(null, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/products/p-feeder-5l/report')
    await user.click(await screen.findByText('허위/과장 광고'))
    await user.click(screen.getByRole('button', { name: '상품 신고 제출' }))

    expect((await screen.findByText('예시 상품은 신고할 수 없어요.')).closest('[role="alert"]')).not.toBeNull()
    expect(screen.queryByText('신고가 접수됐어요')).not.toBeInTheDocument()
    expect(called).toBe(0)
  })

  it('[AC-REPORT-012] 서버 오류로 실패해도 입력이 남고 다시 제출하면 접수된다', async () => {
    let calls = 0
    server.use(
      http.post(REPORTS_URL, () => {
        calls += 1
        return calls === 1 ? new HttpResponse(null, { status: 500 }) : new HttpResponse(null, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/products/${REAL_PRODUCT_ID}/report`)
    await user.click(await screen.findByText('불법 및 미취급 상품'))
    await user.type(screen.getByRole('textbox'), '판매 금지 성분이 들어 있어요')
    await user.click(screen.getByRole('button', { name: '상품 신고 제출' }))

    expect(
      (await screen.findByText('신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.')).closest('[role="alert"]'),
    ).not.toBeNull()
    expect(screen.getByRole('textbox')).toHaveValue('판매 금지 성분이 들어 있어요')

    await user.click(screen.getByRole('button', { name: '상품 신고 제출' }))
    expect(await screen.findByText('신고가 접수됐어요')).toBeInTheDocument()
    expect(calls).toBe(2)
  })
})
