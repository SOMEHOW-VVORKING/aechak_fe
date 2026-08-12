import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
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
    expect(
      screen.getByPlaceholderText('답변 받을 이메일 주소를 입력해주세요'),
    ).toBeInTheDocument()
  })

  it('[AC-INQUIRY-ROUTE-002] 유형 선택 시트는 5종을 노출하고 선택 시 트리거에 반영된다', async () => {
    const user = userEvent.setup()
    renderAt('/settings/inquiry')
    await screen.findByText('고객센터 문의')

    await user.click(screen.getByText('문의 유형을 선택해주세요'))
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

  it('[AC-INQUIRY-ROUTE-003] 이메일 형식이 틀리면 에러 안내가 뜨고 제출이 비활성이다', async () => {
    const user = userEvent.setup()
    renderAt('/settings/inquiry')
    await screen.findByText('고객센터 문의')

    await user.type(
      screen.getByPlaceholderText('답변 받을 이메일 주소를 입력해주세요'),
      'kongi.mom@',
    )
    expect(
      await screen.findByText('이메일 형식이 올바르지 않아요. 예: name@aechak.co.kr'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문의 제출' })).toBeDisabled()
  })

  it('[AC-INQUIRY-ROUTE-004] 유형/이메일/내용을 채워 제출하면 접수 완료 토스트가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/settings/inquiry')
    await screen.findByText('고객센터 문의')

    await user.click(screen.getByText('문의 유형을 선택해주세요'))
    await user.click(await screen.findByText('주문 / 결제'))
    await user.type(
      screen.getByPlaceholderText('답변 받을 이메일 주소를 입력해주세요'),
      'kongi.mom@aechak.co.kr',
    )
    await user.type(
      screen.getByPlaceholderText(/상품 구매 전후 문의는/),
      '결제는 완료됐는데 주문 내역에 안 보여요. 확인 부탁드립니다.',
    )

    const submitBtn = screen.getByRole('button', { name: '문의 제출' })
    await waitFor(() => expect(submitBtn).toBeEnabled())
    await user.click(submitBtn)

    expect(await screen.findByText('문의가 접수됐어요')).toBeInTheDocument()
  })
})
