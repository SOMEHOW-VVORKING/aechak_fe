import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { HttpResponse, http } from 'msw'
import {
  MSW_PHONE_CODE,
  PHONE_VERIFICATIONS_CONFIRM_URL,
  PHONE_VERIFICATIONS_URL,
  currentAccount,
  seedAccount,
  server,
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

describe('/mypage/verify (실서버 계약 — MSW)', () => {
  beforeEach(() => {
    seedAccount()
  })

  it('[AC-VERIFY-001] 인증번호 발송 후 입력이 나타나고 인증번호는 화면에 노출되지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/verify')

    await user.type(await screen.findByLabelText('휴대폰 번호'), '010-1234-5678')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(await screen.findByPlaceholderText('6자리 숫자')).toBeInTheDocument()
    expect(screen.queryByText(/테스트 인증번호/)).not.toBeInTheDocument()
    expect(screen.queryByText(new RegExp(MSW_PHONE_CODE))).not.toBeInTheDocument()
  })

  it('[AC-VERIFY-002] 인증 완료(9-B)에서 인증 상태/번호/일시 상세 행을 노출하지 않는다', async () => {
    seedAccount({ phoneNumber: '010-****-5678', isPhoneVerified: true })
    renderAt('/mypage/verify')

    // 완료 표현(제목)은 유지하되 3개 상세 행은 걷어낸다.
    expect(await screen.findByText('본인 인증 완료')).toBeInTheDocument()
    expect(screen.queryByText('인증 상태')).not.toBeInTheDocument()
    expect(screen.queryByText('인증 번호')).not.toBeInTheDocument()
    expect(screen.queryByText('인증 일시')).not.toBeInTheDocument()
  })

  it('[AC-VERIFY-003] 잘못된 인증번호는 서버 30005 문구를 인라인으로 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/verify')

    await user.type(await screen.findByLabelText('휴대폰 번호'), '010-1234-5678')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByPlaceholderText('6자리 숫자'), '999999')
    await user.click(screen.getByRole('button', { name: '인증 완료' }))

    expect(await screen.findByText('인증번호가 올바르지 않아요.')).toBeInTheDocument()
    expect(currentAccount().isPhoneVerified).toBe(false)
  })

  it('[AC-VERIFY-004] 올바른 인증번호는 confirm 응답(UserMe)으로 완료 화면으로 전환된다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/verify')

    await user.type(await screen.findByLabelText('휴대폰 번호'), '010-1234-5678')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByPlaceholderText('6자리 숫자'), MSW_PHONE_CODE)
    await user.click(screen.getByRole('button', { name: '인증 완료' }))

    // confirm 응답이 계정 캐시에 반영돼 재조회 없이 9-B로 넘어간다.
    expect(await screen.findByText('본인 인증 완료')).toBeInTheDocument()
    expect(currentAccount().isPhoneVerified).toBe(true)
    expect(currentAccount().phoneNumber).toBe('010-****-5678')
  })

  it('[AC-VERIFY-005] 발송 직후 재전송은 서버 쿨다운(60초) 동안 비활성화된다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/verify')

    await user.type(await screen.findByLabelText('휴대폰 번호'), '010-1234-5678')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    // 재발송 타이머는 서버 응답(resendCooldownSeconds)이 원천 — 버튼이 남은 초와 함께 잠긴다.
    const resend = await screen.findByRole('button', { name: /재전송 \(\d+초\)/ })
    expect(resend).toBeDisabled()
    // 만료 타이머(expiresInSeconds)도 표시된다.
    expect(screen.getByText(/남은 시간 \d+:\d{2}/)).toBeInTheDocument()
  })

  it('[AC-VERIFY-006] 번호 형식은 서버가 판정한다 — 발송 400/90001을 인라인 해요체로 보여준다', async () => {
    // 클라이언트 정규식은 없다(BE PhoneVerificationPatterns와 중복). BE @Valid 실패 모양 그대로 응답한다.
    server.use(
      http.post(PHONE_VERIFICATIONS_URL, () =>
        HttpResponse.json({ errorCode: 90001, message: '휴대폰 번호 형식이 올바르지 않습니다.' }, { status: 400 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/mypage/verify')

    await user.type(await screen.findByLabelText('휴대폰 번호'), '02-1234-5678')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(await screen.findByText('휴대폰 번호 형식을 확인해 주세요.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('6자리 숫자')).not.toBeInTheDocument()
  })

  it('[AC-VERIFY-007] 인증번호 형식은 서버가 판정한다 — 확인 400/90001은 인증번호 안내로 보여준다', async () => {
    server.use(
      http.post(PHONE_VERIFICATIONS_CONFIRM_URL, () =>
        HttpResponse.json({ errorCode: 90001, message: '인증번호는 6자리 숫자입니다.' }, { status: 400 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/mypage/verify')

    await user.type(await screen.findByLabelText('휴대폰 번호'), '010-1234-5678')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    // 자릿수 게이트가 없어 4자리로도 제출된다 — 서버가 거절하고 화면은 확인 단계 문구를 보여준다.
    await user.type(await screen.findByPlaceholderText('6자리 숫자'), '1234')
    await user.click(screen.getByRole('button', { name: '인증 완료' }))

    expect(await screen.findByText('인증번호 6자리 숫자를 입력해 주세요.')).toBeInTheDocument()
    expect(currentAccount().isPhoneVerified).toBe(false)
  })
})
