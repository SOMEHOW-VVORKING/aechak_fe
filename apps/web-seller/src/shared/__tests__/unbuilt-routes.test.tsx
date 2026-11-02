import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/testing/msw/server'
import { SAMPLE_ACTION_TOAST, SAMPLE_DATA_TITLE } from '../components/SampleDataNotice'
import { routeTree } from '../../routeTree.gen'

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

/**
 * 라우트 가드가 진입 자격을 판정하려고 부르는 경로. 화면의 동작이 아니라 진입 조건이라
 * 아래 집계에서 뺀다.
 *
 * `__root`의 beforeLoad가 비면제 경로마다 셀러 자격을 확인하고(SCRUM-324), 접근 토큰이
 * 없으면 그 앞에 세션 복원을 한 번 시도한다. 그 둘은 이 다섯 화면이 무엇을 그리든 똑같이
 * 일어난다. 빼더라도 이 스펙의 힘은 줄지 않는다 — 다섯 화면은 신청·인증 API와 아무 관계가
 * 없어서, 화면이 그 경로를 부르는 일 자체가 없기 때문이다.
 */
const GUARD_PATHS = ['/seller-applications', '/auth/web/refresh']

/**
 * 화면이 네트워크로 나간 요청을 모은다. `test-setup`의 `onUnhandledRequest:'error'`만으로는
 * 부족하다 — MSW가 던지는 것은 요청을 보낸 쪽의 Promise라 화면이 그 실패를 삼키면 테스트가
 * 초록으로 지나간다. 그래서 요청 자체를 세어 0건을 단언한다.
 */
function trackRequests() {
  const urls: string[] = []
  server.events.on('request:start', ({ request }) => {
    if (GUARD_PATHS.some(path => new URL(request.url).pathname.endsWith(path))) return
    urls.push(request.url)
  })
  return urls
}

afterEach(() => server.events.removeAllListeners())

// 리뷰 관리(SCRUM-315)와 고객 문의(SCRUM-316)는 seller BE가 생겨 이 목록에서 빠졌다 — 실연동
// 화면의 계약은 `features/reviews/__tests__/reviews-route.test.tsx`와
// `features/inquiries/__tests__/inquiries-route.test.tsx`가 각각 고정한다.
const SCREENS = [
  ['/coupons', '혜택/쿠폰/할인'],
  ['/notices', '알림/공지'],
  ['/account', '계정/보안'],
] as const

/**
 * nav에만 이름이 있고 라우트 파일은 한 번도 없던 다섯 화면(SCRUM-301 신설).
 * 그중 리뷰 관리는 SCRUM-315에서, 고객 문의는 SCRUM-316에서 실서버에 붙어 이 파일의 대상에서
 * 빠졌다(세 화면이 남았다).
 *
 * SCRUM-301은 "지어낸 데이터 행을 그리지 않는다"로 규약 10을 지켰는데 "기능에 들어가도 아무것도
 * 없다"는 지적을 받았다. SCRUM-307에서 **예시 데이터로 실제 목록·폼을 그리고**, 저장되지 않는다는
 * 사실은 상단 "예시 데이터" 띠와 동작 버튼의 토스트가 글자로 말하도록 바꿨다 — 규약 10의 목적
 * (운영자가 속지 않게)은 그대로 지키면서 화면 구성을 보여 준다. nav의 "준비 중" 꼬리표는 서버가
 * 없다는 사실이 그대로이므로 유지한다.
 */
describe('라우트가 없던 셀러 화면의 예시 데이터', () => {
  it.each(SCREENS)(
    '[AC-SELLER-SAMPLE-001] %s 는 제목과 "예시 데이터" 띠를 함께 보여준다',
    async (path, title) => {
      renderAt(path)

      const heading = await screen.findByRole('heading', { name: title })
      // 띠는 DS Alert(role="alert")라 역할로 집는다 — 문구가 다듬어져도 띠의 존재는 지켜진다.
      const notice = screen.getByRole('alert')
      expect(within(notice).getByText(SAMPLE_DATA_TITLE)).toBeInTheDocument()
      expect(notice).toHaveTextContent('저장되지 않')

      // 화면 안의 "준비 중" 표시는 **PageHeader 안에서만** 찾는다. 화면 전체(`screen`)에서 세면
      // nav 꼬리표 3개가 늘 걸려서, 화면 머리의 pill을 지워도 초록으로 지나간다(교차검토 지적).
      const pageHeader = heading.parentElement
      expect(pageHeader).not.toBeNull()
      expect(within(pageHeader as HTMLElement).getByText('준비 중')).toBeInTheDocument()
    },
  )

  // 리뷰 관리(AC-SELLER-SAMPLE-003)·고객 문의(AC-SELLER-SAMPLE-002)의 예시 데이터 테스트는
  // 두 화면이 실서버에 붙어 대상이 사라졌으므로 지웠다. 대신 실연동 계약을
  // `features/reviews/__tests__/reviews-route.test.tsx`(SCRUM-315)와
  // `features/inquiries/__tests__/inquiries-route.test.tsx`(SCRUM-316)가 고정한다.

  it('[AC-SELLER-SAMPLE-004] 혜택/쿠폰/할인은 발급 목록과 생성 폼을 보여주고 생성이 서버로 나가지 않는다', async () => {
    const requests = trackRequests()
    renderAt('/coupons')

    const row = (await screen.findByText('첫 구매 10% 할인')).closest('tr') as HTMLElement
    expect(within(row).getByText('10% / 최대 5,000원')).toBeInTheDocument()
    expect(within(row).getByText('1,284 / 2,000')).toBeInTheDocument()
    expect(within(row).getByText('발급 중')).toBeInTheDocument()

    // 생성 폼: 머리 버튼으로 펼치면 머리 버튼 문구가 바뀌어 같은 이름이 둘이 되지 않는다.
    await userEvent.click(screen.getByRole('button', { name: '쿠폰 만들기' }))
    await userEvent.type(await screen.findByLabelText('쿠폰명'), '가을 감사 쿠폰')
    await userEvent.type(screen.getByLabelText('할인율'), '10')
    fireEvent.change(screen.getByLabelText('사용 시작일'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('사용 종료일'), { target: { value: '2026-11-30' } })
    await userEvent.click(screen.getByRole('button', { name: '쿠폰 만들기' }))

    expect(await screen.findByText(SAMPLE_ACTION_TOAST)).toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it('[AC-SELLER-SAMPLE-005] 알림/공지는 공지 목록과 수신 설정을 보여주고 저장이 서버로 나가지 않는다', async () => {
    const requests = trackRequests()
    renderAt('/notices')

    const row = (
      await screen.findByText('11월 1일부터 반품 배송비 부담 기준이 바뀌어요')
    ).closest('tr') as HTMLElement
    expect(within(row).getByText('정책')).toBeInTheDocument()
    expect(within(row).getByText('안 읽음')).toBeInTheDocument()

    // 수신 설정 토글은 화면 안에서 실제로 움직인다(장식 토글이 아니다).
    const smsToggle = screen.getByRole('switch', { name: '취소/반품/교환 문자 수신' })
    expect(smsToggle).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(smsToggle)
    expect(smsToggle).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(screen.getByRole('button', { name: '수신 설정 저장' }))

    expect(await screen.findByText(SAMPLE_ACTION_TOAST)).toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it('[AC-SELLER-SAMPLE-006] 계정/보안은 계정 정보와 보안 설정, 접속 기록을 보여주고 저장이 서버로 나가지 않는다', async () => {
    const requests = trackRequests()
    renderAt('/account')

    expect(await screen.findByDisplayValue('seller-demo@aechak.co.kr')).toBeDisabled()
    expect(screen.getByDisplayValue('010-1234-5678')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '2단계 인증 사용' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    // 접속 기록: 낯선 접속이 글자로 표시된다.
    const historyRow = screen.getByText('45.133.1.207').closest('tr') as HTMLElement
    expect(within(historyRow).getByText('낯선 접속')).toBeInTheDocument()
    expect(within(historyRow).getByText('실패')).toBeInTheDocument()
    // 카피 규칙(5절)이 정하는 구분자는 '/'다 — 가운뎃점까지 허용하는 or 정규식은 규칙 위반을
    // 그대로 통과시킨다(교차검토 지적). 정확한 문구로 못 박는다.
    expect(screen.getByText('이배송 / 주문/배송 담당')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '계정 정보 저장' }))

    expect(await screen.findByText(SAMPLE_ACTION_TOAST)).toBeInTheDocument()

    // 담당자 초대도 같은 공통 토스트로 끝나고 요청을 보내지 않는다.
    await userEvent.click(screen.getByRole('button', { name: '담당자 초대' }))
    expect(await screen.findByText(SAMPLE_ACTION_TOAST)).toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it('[AC-SELLER-SAMPLE-009] 2단계 인증을 켜면 켜진 채로 남지만 저장되지 않음을 글자로 알린다', async () => {
    const requests = trackRequests()
    renderAt('/account')

    // 토글은 실제로 움직인다(움직이지 않는 토글은 2절 금지의 장식 UI다).
    const mfa = await screen.findByRole('switch', { name: '2단계 인증 사용' })
    expect(mfa).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(mfa)
    expect(mfa).toHaveAttribute('aria-checked', 'true')

    // 그런데 pill이 "사용 중"으로 바뀌므로, 토스트가 사라진 뒤에도 **화면에 남는 글자**로
    // 저장되지 않았음을 말해야 한다 — 이 단언이 없으면 계정이 보호된다고 믿는 화면이 된다.
    // '사용 중'은 담당자 목록의 상태 pill에도 있다 — 2단계 인증 줄 안에서만 찾는다.
    const mfaRow = screen.getByText('2단계 인증')
    expect(within(mfaRow).getByText('사용 중')).toBeInTheDocument()
    expect(within(mfaRow).getByText('저장 안 됨')).toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it('[AC-SELLER-SAMPLE-007] 비밀번호 변경은 확인이 어긋나거나 비어 있으면 잠기고, 맞으면 눌러도 서버로 나가지 않는다', async () => {
    const requests = trackRequests()
    renderAt('/account')

    const next = await screen.findByLabelText('새 비밀번호')
    await userEvent.type(screen.getByLabelText('지금 비밀번호'), 'old-password-1!')

    // 폼이 글자로 약속한 길이("10자 이상")를 실제로 검사한다.
    await userEvent.type(next, 'short')
    expect(screen.getByText('10자 이상이어야 해요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeDisabled()
    await userEvent.clear(next)
    await userEvent.type(next, 'new-password-1!')

    // 확인 칸이 **비어 있을 때도** 잠겨야 한다 — 빈 확인은 "어긋남"이 아니라서 통과했던 자리다.
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('새 비밀번호 확인'), 'new-password-2!')
    expect(screen.getByText('새 비밀번호와 달라요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeDisabled()

    await userEvent.clear(screen.getByLabelText('새 비밀번호 확인'))
    await userEvent.type(screen.getByLabelText('새 비밀번호 확인'), 'new-password-1!')
    await userEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByText(SAMPLE_ACTION_TOAST)).toBeInTheDocument()
    expect(requests).toEqual([])
  })

  // 원래 고객 문의 화면으로 이 규약을 확인했는데(SCRUM-307) 그 화면이 실서버에 붙어
  // (SCRUM-316) 예시 데이터가 아니게 됐다 — 같은 모양의 탭을 가진 알림/공지로 옮겼다.
  it('[AC-SELLER-SAMPLE-008] 목록 탭은 예시 데이터에 실제로 적용된다', async () => {
    renderAt('/notices')

    expect(await screen.findByText('9월 정산 지급이 완료됐어요')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /안 읽음/ }))

    // 읽은 공지는 빠지고 안 읽은 공지만 남는다.
    await waitFor(() =>
      expect(screen.queryByText('9월 정산 지급이 완료됐어요')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByText('11월 1일부터 반품 배송비 부담 기준이 바뀌어요'),
    ).toBeInTheDocument()
  })

  it('[AC-SELLER-SAMPLE-011] 발급 중 쿠폰은 중단 버튼이 있고 끝난 쿠폰에는 없으며, 눌러도 서버로 나가지 않는다', async () => {
    const requests = trackRequests()
    renderAt('/coupons')

    const activeRow = (await screen.findByText('첫 구매 10% 할인')).closest('tr') as HTMLElement
    const stopButton = within(activeRow).getByRole('button', { name: '첫 구매 10% 할인 발급 중단' })

    // 이미 중단된 쿠폰에는 버튼 자체가 없다(비활성 버튼은 "권한이 없다"로 읽힌다).
    const stoppedRow = screen.getByText('재고 정리 20%').closest('tr') as HTMLElement
    expect(within(stoppedRow).queryByRole('button')).toBeNull()

    await userEvent.click(stopButton)

    expect(await screen.findByText(SAMPLE_ACTION_TOAST)).toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it('[AC-SELLER-SAMPLE-012] 상세 Drawer 안에도 "예시 데이터" 띠가 있다', async () => {
    renderAt('/notices')

    // Drawer는 fixed inset-0 + aria-modal + 바디 스크롤 잠금이라 화면 맨 위의 띠가 닿지 않는다.
    // 지어낸 정책 날짜를 사실로 믿을 자리라 띠가 Drawer 안에도 있어야 한다(교차검토 지적).
    const row = (
      await screen.findByText('11월 1일부터 반품 배송비 부담 기준이 바뀌어요')
    ).closest('tr') as HTMLElement
    await userEvent.click(row)

    const drawer = await screen.findByRole('dialog')
    const notice = within(drawer).getByRole('alert')
    expect(within(notice).getByText(SAMPLE_DATA_TITLE)).toBeInTheDocument()
    expect(notice).toHaveTextContent('저장되지 않')
  })

  it('[AC-SELLER-UNBUILT-002] 서버가 없는 세 항목이 nav에 "준비 중" 꼬리표와 함께 올라온다', async () => {
    renderAt('/coupons')

    // 꼬리표 텍스트가 버튼 안에 있어 접근성 이름이 "<항목> 준비 중"이 된다 — 꼬리표가 빠지면 이름이
    // 달라져 이 단정이 깨진다(꼬리표 유무를 이름으로 검증하는 셈).
    expect(await screen.findByRole('button', { name: '혜택/쿠폰/할인 준비 중' })).toBeInTheDocument()
    for (const label of ['알림/공지', '계정/보안']) {
      expect(screen.getByRole('button', { name: `${label} 준비 중` })).toBeInTheDocument()
    }
    // 리뷰 관리(SCRUM-315)·고객 문의(SCRUM-316)는 서버가 생겨 꼬리표가 없다 — 꼬리표가 되살아나면
    // 접근명이 달라져 여기서 깨진다.
    expect(screen.getByRole('button', { name: '리뷰 관리' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '고객 문의' })).toBeInTheDocument()
  })

  it('[AC-SELLER-UNBUILT-003] 서버가 붙어 있는 항목에는 꼬리표가 붙지 않는다', async () => {
    renderAt('/coupons')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '스토어 설정' })).toBeInTheDocument()
  })

  // 예시 화면에도 "지금 실제로 저장되는 곳"으로 가는 길은 둔다 — 쿠폰의 상품별 할인가는 상품 폼에,
  // 계정의 사업자 정보·서류는 스토어 설정에 이미 붙어 있다. 죽은 버튼이 아니라 실제로 이동한다.
  it('[AC-SELLER-UNBUILT-004] 쿠폰 화면의 안내 버튼은 상품 관리로 실제 이동한다', async () => {
    const router = renderAt('/coupons')

    fireEvent.click(await screen.findByRole('button', { name: '상품 관리로' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/products'))
  })

  it('[AC-SELLER-UNBUILT-005] 계정 화면의 안내 버튼은 스토어 설정으로 실제 이동한다', async () => {
    const router = renderAt('/account')

    fireEvent.click(await screen.findByRole('button', { name: '스토어 설정으로' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/store-settings'))
  })
})
