import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_APPLICATIONS_URL,
  ADMIN_APPLICATION_DETAIL_URL,
  currentAdminApplication,
  makeAdminApplicationWire,
  seedAdminApplications,
  server,
} from '@/testing/msw/server'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // 에러 분기를 즉시 보려면 재시도를 끈다(main.tsx는 retry 1).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// 결정 라디오는 접근 가능한 이름이 없다(DS Radio는 label을 받지 않고 DecisionRadioGroup이
// 직접 텍스트를 그린다) — '반려'는 상태 필터 옵션과도 겹치므로 고유한 부제목으로 집는다.
const REJECT_OPTION_CAPTION = '신청 반려 / 사유 통보 후 재제출 유도'

/**
 * 서류 열기는 클릭 제스처 안에서 빈 탭을 먼저 확보하고 재조회 뒤 URL을 채운다. 가짜 탭을
 * 돌려주어 (a) window.open이 URL 없이 호출되는지(=제스처 안에서 열렸는지), (b) 탭에 어떤 URL이
 * 들어갔는지, (c) 실패했을 때 탭을 닫는지를 각각 단언할 수 있게 한다.
 */
function stubPopupTab() {
  const tab = { location: { href: '' }, opener: {} as unknown, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
  return { tab, open }
}

const PETFRIENDS = makeAdminApplicationWire({
  applicationId: 1,
  status: 'SUBMITTED',
  businessName: '펫프렌즈상사',
  representativeName: '김민수',
  businessRegNo: '1234567890',
  submittedAt: '2026-06-18T10:00:00',
})

const HAPPYDOG = makeAdminApplicationWire({
  applicationId: 2,
  status: 'SUBMITTED',
  businessName: '해피독몰',
  representativeName: '최진호',
  businessRegNo: '1058712345',
  submittedAt: '2026-06-16T10:00:00',
})

const COMFY = makeAdminApplicationWire({
  applicationId: 3,
  status: 'APPROVED',
  businessType: 'PERSONAL_GENERAL',
  businessName: null,
  representativeName: '정수은',
  businessRegNo: null,
  submittedAt: '2026-06-17T10:00:00',
  decidedAt: '2026-06-18T09:00:00',
  documents: [
    { documentType: 'ID_CARD', uploadedAt: '2026-06-17T09:00:00' },
    { documentType: 'BANKBOOK_COPY', uploadedAt: '2026-06-17T09:01:00' },
  ],
  reviews: [{ decision: 'APPROVED', rejectionReason: null, reviewedAt: '2026-06-18T09:00:00' }],
})

describe('/sellers/applications', () => {
  beforeEach(() => {
    seedAdminApplications([PETFRIENDS, HAPPYDOG, COMFY])
  })

  // AC-SELLER-APP-001: 입점 신청 목록에서 신청자를 선택하면 상세 드로어가 열린다
  it('[AC-SELLER-APP-001] 행을 고르면 상세 Drawer가 서버 상세(마스킹·서류 라벨)로 열린다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '펫프렌즈상사' }))

    expect(await screen.findByRole('heading', { name: '입점 신청 상세' })).toBeInTheDocument()
    // 평문으로 내려온 대표자명·사업자등록번호를 화면이 마스킹한다.
    expect(await screen.findByText('김*수')).toBeInTheDocument()
    expect(screen.getByText('123-45-*****')).toBeInTheDocument()
    // 서버 documentType 6값이 한국어 라벨로 보인다(이전 아이콘 키는 서버 값과 겹치지 않았다).
    expect(screen.getByRole('button', { name: '사업자등록증 열기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '통신판매업 신고증 열기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '통장 사본 열기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '신분증 열기' })).toBeInTheDocument()
  })

  it('[AC-SELLER-APP-002] 서버에 없는 필드(목록 사업자번호 컬럼·상세 연락처·내부 메모)가 화면에 없다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    // 목록 응답에 사업자등록번호가 아예 없어 컬럼과 번호 검색 조건을 뺐다.
    await screen.findByRole('button', { name: '펫프렌즈상사' })
    expect(screen.getByRole('columnheader', { name: '신청자' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '사업자번호' })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('신청자 검색')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '펫프렌즈상사' }))
    await screen.findByRole('heading', { name: '입점 신청 상세' })
    // 상세 응답에 전화번호가 없고, 내부 메모는 조회·저장 계약이 모두 없다.
    expect(screen.queryByText('연락처')).not.toBeInTheDocument()
    expect(screen.queryByText('내부 메모')).not.toBeInTheDocument()
    // 사업자등록번호는 상세에서만 마스킹해 보여 준다.
    expect(screen.getByText('사업자번호', { selector: 'dt' })).toBeInTheDocument()
  })

  // AC-SELLER-APP-003: 확인 모달에서 승인을 확정하면 심사 상태가 반영된다
  it('[AC-SELLER-APP-003] 승인은 204 뒤 무효화·재조회로 목록에 반영된다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '해피독몰' }))
    await screen.findByRole('heading', { name: '입점 신청 상세' })
    await user.click(screen.getByRole('button', { name: '제출' }))

    const modalHeading = await screen.findByRole('heading', { name: '입점을 승인할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '승인' }))

    expect(await screen.findByText('입점을 승인했어요.')).toBeInTheDocument()
    expect(currentAdminApplication(2)?.status).toBe('APPROVED')
    await waitFor(() => {
      const row = screen.getByRole('button', { name: '해피독몰' }).closest('tr')
      expect(row).toHaveTextContent('승인')
    })
  })

  it('[AC-SELLER-APP-004] 반려는 고른 슬러그가 서버 자유 문자열로 나간다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '해피독몰' }))
    await screen.findByRole('heading', { name: '입점 신청 상세' })
    await user.click(screen.getByText(REJECT_OPTION_CAPTION))
    await user.selectOptions(screen.getByRole('combobox', { name: '반려 사유' }), 'incomplete-docs')
    await user.click(screen.getByRole('button', { name: '제출' }))

    const modalHeading = await screen.findByRole('heading', { name: '신청을 반려할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '반려' }))

    expect(await screen.findByText('신청을 반려했어요.')).toBeInTheDocument()
    const after = currentAdminApplication(2)
    expect(after?.status).toBe('REJECTED')
    expect(after?.rejectionReason).toBe('서류 누락')
  })

  it('[AC-SELLER-APP-005] 반려 사유를 고르기 전에는 제출이 잠기고 직접 입력은 원문을 보존한다', async () => {
    const user = userEvent.setup()
    seedAdminApplications([
      makeAdminApplicationWire({
        applicationId: 1,
        status: 'SUBMITTED',
        businessName: '펫프렌즈상사',
        reviews: [
          {
            decision: 'REJECTED',
            rejectionReason: '계좌 사본이 흐려 확인할 수 없어요',
            reviewedAt: '2026-06-18T11:00:00',
          },
        ],
      }),
    ])
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '펫프렌즈상사' }))
    await screen.findByRole('heading', { name: '입점 신청 상세' })
    await user.click(screen.getByText(REJECT_OPTION_CAPTION))

    // 직전 반려 사유가 프리셋 슬러그와 맞지 않아 '직접 입력'으로 떨어지고 원문이 남는다.
    expect(screen.getByRole('combobox', { name: '반려 사유' })).toHaveValue('direct')
    expect(screen.getByRole('textbox', { name: '반려 사유 직접 입력' })).toHaveValue(
      '계좌 사본이 흐려 확인할 수 없어요',
    )

    // 사유를 비우면 서버 400(10102)을 기다리지 않고 화면이 먼저 막는다.
    await user.clear(screen.getByRole('textbox', { name: '반려 사유 직접 입력' }))
    expect(screen.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-SELLER-APP-006] 다른 운영자가 먼저 처리하면 409 안내와 함께 최신 상태로 되돌아온다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '해피독몰' }))
    await screen.findByRole('heading', { name: '입점 신청 상세' })

    // 화면이 상세를 들고 있는 사이 서버에서 결정이 끝난 상황 — 상태 가드가 409/10101을 준다.
    seedAdminApplications([
      PETFRIENDS,
      { ...HAPPYDOG, status: 'APPROVED', decidedAt: '2026-06-19T09:00:00' },
      COMFY,
    ])

    await user.click(screen.getByRole('button', { name: '제출' }))
    const modal = (await screen.findByRole('heading', { name: '입점을 승인할까요?' })).closest(
      '[role="dialog"]',
    ) as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '승인' }))

    expect(await screen.findByText(/이미 처리된 신청이에요/)).toBeInTheDocument()
    // 무효화 후 재조회로 상세가 승인 상태로 바뀌어 결정 라디오가 사라진다.
    await waitFor(() =>
      expect(screen.getByText(/승인 상태라 승인 \/ 반려를 처리할 수 없어요/)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
  })

  it('[AC-SELLER-APP-007] 403 errorCode 20011이면 목록 자리에 권한 안내가 뜬다', async () => {
    server.use(
      http.get(ADMIN_APPLICATIONS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/sellers/applications')

    expect(await screen.findByText(/어드민 권한이 없어/)).toBeInTheDocument()
  })

  it('[AC-SELLER-APP-008] 상태 필터는 대문자 enum으로 서버에 나간다', async () => {
    const user = userEvent.setup()
    const requested: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/admin/seller-applications?')) {
        requested.push(new URL(request.url).searchParams.get('status'))
      }
    })
    renderAt('/sellers/applications')

    await screen.findByRole('button', { name: '펫프렌즈상사' })
    await user.selectOptions(screen.getByRole('combobox', { name: '심사 상태 필터' }), 'approved')

    // 서버는 소문자를 400 errorCode 90001로 거절한다 — 역변환 없이 보내면 목록이 비어 버린다.
    await waitFor(() => expect(requested).toContain('APPROVED'))
    expect(requested).not.toContain('approved')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '펫프렌즈상사' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: '정수은' })).toBeInTheDocument()
  })

  it('[AC-SELLER-APP-009] 서류 열기는 클릭 제스처 안에서 탭을 열고 재조회한 새 presigned URL을 채운다', async () => {
    const user = userEvent.setup()
    const { tab, open } = stubPopupTab()
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '펫프렌즈상사' }))
    await user.click(await screen.findByRole('button', { name: '신분증 열기' }))

    // 재조회(await)를 기다린 뒤 window.open을 부르면 클릭의 user activation이 끊겨 브라우저가
    // 팝업으로 차단한다 — 그래서 URL 없이 빈 탭을 먼저 열어야 한다.
    expect(open).toHaveBeenCalledWith('', '_blank')
    // 유효기간 5분짜리 링크라 캐시된 상세의 URL(issue=1)을 다시 쓰지 않는다.
    await waitFor(() => expect(tab.location.href).not.toBe(''))
    expect(tab.location.href).toMatch(/^https:\/\/files\.local\/ID_CARD\?issue=/)
    expect(tab.location.href).not.toBe('https://files.local/ID_CARD?issue=1')
    expect(tab.close).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('[AC-SELLER-APP-011] 팝업이 차단되면 조용히 끝나지 않고 안내가 뜬다', async () => {
    const user = userEvent.setup()
    // 차단되면 window.open이 null을 돌려준다 — 반환값을 버리면 운영자에게 아무 일도 안 보인다.
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '펫프렌즈상사' }))
    await user.click(await screen.findByRole('button', { name: '신분증 열기' }))

    expect(await screen.findByText(/팝업이 차단돼 서류를 열지 못했어요/)).toBeInTheDocument()
    open.mockRestore()
  })

  it('[AC-SELLER-APP-012] 재조회가 실패하면 캐시된 만료 URL을 열지 않고 안내만 띄운다', async () => {
    const user = userEvent.setup()
    const { tab, open } = stubPopupTab()
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '펫프렌즈상사' }))
    // 첫 상세 조회는 성공해 issue=1 URL이 캐시에 남는다.
    await screen.findByRole('button', { name: '신분증 열기' })

    // react-query v5의 refetch()는 실패해도 reject하지 않고 result.data에 직전 값을 남긴다 —
    // 성공 여부를 보지 않으면 만료된 issue=1 URL이 그대로 새 탭에 열린다.
    server.use(
      http.get(ADMIN_APPLICATION_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류입니다.' }, { status: 500 }),
      ),
    )
    await user.click(screen.getByRole('button', { name: '신분증 열기' }))

    expect(await screen.findByText(/서류 링크를 새로 받지 못했어요/)).toBeInTheDocument()
    expect(tab.location.href).toBe('')
    expect(tab.close).toHaveBeenCalled()
    open.mockRestore()
  })

  it('[AC-SELLER-APP-013] 상세 조회 실패에는 목록 문구가 아니라 상세 문구가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    await screen.findByRole('button', { name: '펫프렌즈상사' })
    server.use(
      http.get(ADMIN_APPLICATION_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 10100, message: '입점 신청을 찾을 수 없습니다.' }, { status: 404 }),
      ),
    )
    await user.click(screen.getByRole('button', { name: '펫프렌즈상사' }))

    // 목록은 정상인데 상세만 깨진 상황이라 "심사 목록을 불러오지 못했어요"는 틀린 대상이다.
    expect(await screen.findByText('신청을 찾을 수 없어요. 목록을 다시 불러와 주세요.')).toBeInTheDocument()
    expect(screen.queryByText(/심사 목록을 불러오지 못했어요/)).not.toBeInTheDocument()
  })

  it('[AC-SELLER-APP-014] 심사 이력은 건별 반려 사유를 함께 보여 준다', async () => {
    const user = userEvent.setup()
    // 승인으로 끝난 신청은 서버가 rejectionReason을 null로 내리므로 reviews[]가 유일한 보관처다.
    seedAdminApplications([
      makeAdminApplicationWire({
        applicationId: 1,
        status: 'APPROVED',
        businessName: '펫프렌즈상사',
        decidedAt: '2026-06-20T09:00:00',
        rejectionReason: null,
        reviews: [
          {
            decision: 'REJECTED',
            rejectionReason: '통장 사본이 흐려 확인할 수 없었어요',
            reviewedAt: '2026-06-18T11:00:00',
          },
          { decision: 'APPROVED', rejectionReason: null, reviewedAt: '2026-06-20T09:00:00' },
        ],
      }),
    ])
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '펫프렌즈상사' }))
    await screen.findByRole('heading', { name: '입점 신청 상세' })

    expect(await screen.findByText('통장 사본이 흐려 확인할 수 없었어요')).toBeInTheDocument()
    // 통보된 반려 사유 블록은 status가 rejected일 때만 뜨므로 이 화면에는 없다.
    expect(screen.queryByText('통보된 반려 사유')).not.toBeInTheDocument()
  })

  it('[AC-SELLER-APP-015] 목록 날짜 컬럼 라벨은 값과 같은 제출일이다', async () => {
    renderAt('/sellers/applications')

    // 목록 응답에는 submittedAt만 있고 appliedAt은 상세에만 있다 — 같은 라벨이 두 값을
    // 가리키면 Drawer의 '신청일'(appliedAt)과 숫자가 어긋나 보인다.
    expect(await screen.findByRole('columnheader', { name: '제출일' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '신청일' })).not.toBeInTheDocument()
  })

  it('[AC-SELLER-APP-010] 결정 불가 상태(승인 완료)에서는 제출 버튼이 아예 없다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '정수은' }))
    await screen.findByRole('heading', { name: '입점 신청 상세' })

    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
    // 개인 일반은 사업자등록번호가 없다 — 지어내지 않고 미보유로 표시한다.
    expect(screen.getByText('미보유')).toBeInTheDocument()
    expect(screen.getByText('2026-06-18 09:00')).toBeInTheDocument()
  })
})

describe('/sellers/applications 페이지 경계', () => {
  // 페이지 크기(20)를 하나 넘겨 둘째 페이지에 정확히 한 건만 남긴다.
  const PAGE_SIZE = 20

  beforeEach(() => {
    seedAdminApplications(
      Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
        makeAdminApplicationWire({
          applicationId: index + 1,
          status: 'SUBMITTED',
          businessName: `신청사 ${String(index + 1).padStart(2, '0')}`,
          representativeName: `대표 ${index + 1}`,
          // 서버 정렬이 제출일 내림차순이라 제출일이 가장 이른 마지막 건이 둘째 페이지로 간다.
          submittedAt: `2026-06-${String(30 - index).padStart(2, '0')}T10:00:00`,
        }),
      ),
    )
  })

  it('[AC-SELLER-APP-016] 마지막 페이지의 유일한 신청을 처리해도 빈 페이지에 갇히지 않는다', async () => {
    // 처리하면 재조회 결과에서 그 페이지가 사라지는데 `page`가 그대로면 빈 목록이 뜬다.
    // 페이지 이동 버튼은 전체 페이지가 2 이상일 때만 그려지므로 되돌아올 수단까지 없어진다.
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    // 기본 필터(전체)에서는 승인된 건도 목록에 남아 건수가 줄지 않는다 — 페이지가 사라지는 상황은
    // 심사 대기만 보고 있을 때 생긴다(운영자가 실제로 쓰는 필터이기도 하다).
    await screen.findByRole('button', { name: '신청사 01' })
    await user.selectOptions(screen.getByRole('combobox', { name: '심사 상태 필터' }), 'submitted')
    await user.click(await screen.findByRole('button', { name: '다음' }))
    const lastRow = await screen.findByRole('button', { name: '신청사 21' })

    await user.click(lastRow)
    await screen.findByRole('heading', { name: '입점 신청 상세' })
    await user.click(screen.getByRole('button', { name: '제출' }))
    const modalHeading = await screen.findByRole('heading', { name: '입점을 승인할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '승인' }))

    expect(await screen.findByText('입점을 승인했어요.')).toBeInTheDocument()
    // 남은 20건이 한 페이지에 들어가므로 첫 페이지로 되돌아와 행이 보여야 한다.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '신청사 01' })).toBeInTheDocument(),
    )
    expect(screen.queryByText('조건에 맞는 입점 신청이 없어요.')).toBeNull()
  })
})
