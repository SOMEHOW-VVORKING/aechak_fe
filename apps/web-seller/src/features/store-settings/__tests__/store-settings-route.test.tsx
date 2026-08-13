import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  currentSellerApplication,
  makeApplicationWire,
  seedSellerApplication,
} from '../../../testing/msw/server'
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

describe('/store-settings (실서버 계약 — MSW)', () => {
  beforeEach(() => {
    seedSellerApplication(null)
  })

  it('[AC-STORE-ROUTE-001] 신청 이력이 없으면(404/10100) 신규 신청 폼을 보여준다', async () => {
    renderAt('/store-settings')

    expect(await screen.findByText('스토어 개설 신청')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '제출하기' })).toBeDisabled() // 필수 미비
    expect(screen.getByText(/제출 전 필요:/)).toBeInTheDocument()
  })

  it('[AC-STORE-ROUTE-002] 임시저장은 폼 전체를 싣고 응답으로 화면을 재구성한다', async () => {
    const user = userEvent.setup()
    renderAt('/store-settings')

    await user.type(await screen.findByLabelText('예금주'), '정지은')
    await user.click(screen.getByRole('button', { name: '임시저장' }))

    await screen.findByText('저장했어요.')
    const saved = currentSellerApplication()
    expect(saved?.status).toBe('DRAFT')
    expect(saved?.accountHolder).toBe('정지은')
    // 안 채운 필드는 null 전체 덮어쓰기 계약 그대로.
    expect(saved?.businessName).toBeNull()
  })

  it('[AC-STORE-ROUTE-003] 반려 상태는 사유를 보여주고, 재제출은 저장(자동 재개) → 제출 체인으로 SUBMITTED가 된다', async () => {
    seedSellerApplication(
      makeApplicationWire({
        status: 'REJECTED',
        representativeName: '정지은',
        bankCode: '004',
        accountNumberMasked: '********1234',
        accountHolder: '정지은',
        rejectionReason: '통장 사본이 흐려요.',
        documents: [
          { documentType: 'ID_CARD', uploadedAt: '2026-08-01T09:10:00' },
          { documentType: 'BANKBOOK_COPY', uploadedAt: '2026-08-01T09:11:00' },
        ],
      }),
    )
    const user = userEvent.setup()
    renderAt('/store-settings')

    expect(await screen.findByText('통장 사본이 흐려요.')).toBeInTheDocument()

    // 계좌번호는 응답이 마스킹뿐이라 재입력해야 저장/제출이 열린다(소거 방지 가드).
    await user.click(screen.getByRole('button', { name: '재제출하기' }))
    expect(await screen.findByText(/계좌번호는 저장할 때마다 다시 입력/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('계좌번호'), '110123456789')
    await user.click(screen.getByRole('button', { name: '재제출하기' }))

    // 저장(reopen → DRAFT) → 제출(204) 체인이 끝나면 심사 대기 화면으로 넘어간다.
    expect(await screen.findByText('심사 대기 중이에요')).toBeInTheDocument()
    expect(currentSellerApplication()?.status).toBe('SUBMITTED')
  })

  it('[AC-STORE-ROUTE-004] 심사 중(SUBMITTED)은 폼 없이 홀딩 뷰만 보여준다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'SUBMITTED', submittedAt: '2026-08-12T10:00:00' }))
    renderAt('/store-settings')

    expect(await screen.findByText('심사 대기 중이에요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '임시저장' })).not.toBeInTheDocument()
  })

  it('[AC-STORE-ROUTE-005] 승인(APPROVED)은 승인 안내만 보여준다(2-B는 여전히 범위 밖)', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED', decidedAt: '2026-08-12T10:00:00' }))
    renderAt('/store-settings')

    expect(await screen.findByText('입점 신청이 승인됐어요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출하기' })).not.toBeInTheDocument()
  })

  it('[AC-STORE-ROUTE-006] 서류를 첨부하면 presigned 업로드 → tmpKey가 임시저장에 실린다', async () => {
    const user = userEvent.setup()
    renderAt('/store-settings')

    const file = new File(['pdf-bytes'], 'bankbook.pdf', { type: 'application/pdf' })
    await user.upload(await screen.findByLabelText('통장 사본 파일 선택'), file)
    expect(await screen.findByText('첨부됨 (저장 전)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '임시저장' }))
    await screen.findByText('저장했어요.')

    await waitFor(() => {
      expect(
        currentSellerApplication()?.documents.some(doc => doc.documentType === 'BANKBOOK_COPY'),
      ).toBe(true)
    })
  })
})
