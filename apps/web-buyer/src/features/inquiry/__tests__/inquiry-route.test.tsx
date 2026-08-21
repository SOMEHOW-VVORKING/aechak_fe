import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { describe, it, expect } from 'vitest'
import { INQUIRIES_URL, server } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('고객센터 문의 라우트', () => {
  it('[AC-INQUIRY-ROUTE-001] /settings/inquiry는 문의 폼을 렌더한다', async () => {
    renderAt('/settings/inquiry')
    expect(await screen.findByText('고객센터 문의')).toBeInTheDocument()
    expect(screen.getByText('문의 유형을 선택해주세요')).toBeInTheDocument()
    // 라벨이 입력과 연결돼 있어 라벨로 조회된다.
    expect(screen.getByLabelText('답변 받을 이메일')).toBeInTheDocument()
    expect(screen.getByLabelText('문의 내용')).toBeInTheDocument()
  })

  it('[AC-INQUIRY-ROUTE-002] 유형 선택 시트는 5종을 노출하고 선택 시 트리거에 반영된다', async () => {
    const user = userEvent.setup()
    renderAt('/settings/inquiry')
    await screen.findByText('고객센터 문의')

    await user.click(screen.getByRole('button', { name: '문의 유형을 선택해주세요' }))
    expect(await screen.findByText('계정 / 로그인')).toBeInTheDocument()
    expect(screen.getByText('배송 / 반품 / 교환')).toBeInTheDocument()
    expect(screen.getByText('셀러 / 상품')).toBeInTheDocument()
    expect(screen.getByText('서비스 이용 / 기타')).toBeInTheDocument()

    await user.click(screen.getByText('주문 / 결제'))
    // 선택하면 트리거 placeholder가 사라진다(선택 라벨로 대체).
    await waitFor(() =>
      expect(screen.queryByText('문의 유형을 선택해주세요')).not.toBeInTheDocument(),
    )
  })

  it('[AC-INQUIRY-ROUTE-003] 이메일 형식이 틀리면(필드 이탈 후) 에러 안내가 뜨고 제출이 비활성이다', async () => {
    const user = userEvent.setup()
    renderAt('/settings/inquiry')
    await screen.findByText('고객센터 문의')

    const email = screen.getByLabelText('답변 받을 이메일')
    await user.type(email, 'kongi.mom@')
    // 입력 중에는 오류를 띄우지 않는다 — 필드를 벗어나야(blur) 노출된다.
    expect(
      screen.queryByText('이메일 형식이 올바르지 않아요. 예: name@aechak.co.kr'),
    ).not.toBeInTheDocument()
    await user.tab()
    expect(
      await screen.findByText('이메일 형식이 올바르지 않아요. 예: name@aechak.co.kr'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문의 제출' })).toBeDisabled()
  })

  it('[AC-INQUIRY-ROUTE-004] 유형/이메일/내용을 채워 제출하면 접수 완료 토스트가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/settings/inquiry')
    await screen.findByText('고객센터 문의')

    await user.click(screen.getByRole('button', { name: '문의 유형을 선택해주세요' }))
    await user.click(await screen.findByText('주문 / 결제'))
    await user.type(screen.getByLabelText('답변 받을 이메일'), 'kongi.mom@aechak.co.kr')
    await user.type(
      screen.getByLabelText('문의 내용'),
      '결제는 완료됐는데 주문 내역에 안 보여요. 확인 부탁드립니다.',
    )

    const submitBtn = screen.getByRole('button', { name: '문의 제출' })
    await waitFor(() => expect(submitBtn).toBeEnabled())
    await user.click(submitBtn)

    expect(await screen.findByText('문의가 접수됐어요')).toBeInTheDocument()
  })

  it('[AC-INQUIRY-ROUTE-005] 제출이 실패하면(비401) 인라인 오류가 뜨고 화면에 머문다', async () => {
    // 성공(201)이 아니라 500을 돌려주는 핸들러로 오버라이드 — 비401 오류 경로를 검증한다.
    server.use(http.post(INQUIRIES_URL, () => HttpResponse.json({}, { status: 500 })))
    const user = userEvent.setup()
    renderAt('/settings/inquiry')
    await screen.findByText('고객센터 문의')

    await user.click(screen.getByRole('button', { name: '문의 유형을 선택해주세요' }))
    await user.click(await screen.findByText('주문 / 결제'))
    await user.type(screen.getByLabelText('답변 받을 이메일'), 'kongi.mom@aechak.co.kr')
    await user.type(screen.getByLabelText('문의 내용'), '결제 확인 부탁드립니다. 내역에 안 보여요.')
    await user.click(screen.getByRole('button', { name: '문의 제출' }))

    // 인라인 오류(role=alert)가 뜨고, 성공 토스트는 안 뜨며, 폼은 화면에 그대로 남는다.
    expect(
      await screen.findByText('요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'),
    ).toBeInTheDocument()
    expect(screen.queryByText('문의가 접수됐어요')).not.toBeInTheDocument()
    expect(screen.getByLabelText('문의 내용')).toBeInTheDocument()
  })
})
