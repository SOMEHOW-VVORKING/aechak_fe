import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, delay, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_COCO,
  SNS_ME,
  SNS_MONG,
  SNS_POST_COCO,
  SNS_POST_MINE,
  SNS_PROFILE_URL,
  SNS_REPORTS_URL,
  SNS_SPAM,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
  snsAct,
  snsRelation,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const postPath = (publicId: string) => `/sns/posts/${publicId}`
const reportSheet = () => screen.getByRole('dialog', { name: '신고하기' })
const submitButton = () => within(reportSheet()).getByRole('button', { name: '신고 제출' })

let reportBodies: unknown[] = []

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  seedSns()
  reportBodies = []
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/reports'))
      reportBodies.push(await request.clone().json())
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

async function openPostReport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '더보기' }))
  await user.click(within(screen.getByRole('dialog', { name: '게시물 더보기' })).getByRole('button', { name: '신고하기' }))
  return reportSheet()
}

describe('SNS 게시물 신고', () => {
  it('[AC-SNS-RPT-001] 상세 더보기의 신고하기로 대상 카드와 사유를 보고 사유를 골라 제출하면 접수 토스트가 나온다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    const sheet = await openPostReport(user)
    expect(within(sheet).getByText('코코집사 님의 게시물')).toBeInTheDocument()
    expect(within(sheet).getByText('오늘 코코랑 한강 산책')).toBeInTheDocument()
    expect(within(sheet).getByText('SNS')).toBeInTheDocument()
    expect(within(sheet).getByText('신고 사유를 선택해 주세요')).toBeInTheDocument()
    const reasons = within(sheet).getByRole('radiogroup', { name: '신고 사유를 선택해 주세요' })
    expect(reasons).toHaveAttribute('aria-required', 'true')
    expect(within(reasons).getAllByRole('radio')).toHaveLength(5)
    expect(within(sheet).getByText(/신고자는 비공개로 보호돼요/)).toBeInTheDocument()
    expect(within(sheet).getAllByRole('radio').map(r => r.closest('label')?.textContent)).toEqual([
      '스팸/광고',
      '욕설/혐오 표현',
      '음란/부적절한 콘텐츠',
      '사기/허위 정보',
      '기타',
    ])
    // 사유는 필수다.
    expect(submitButton()).toBeDisabled()

    await user.click(within(sheet).getByText('스팸/광고'))
    await user.click(submitButton())

    expect(await screen.findByText('신고가 접수되었습니다')).toBeInTheDocument()
    expect(reportBodies).toEqual([
      { targetType: 'SNS_POST', targetId: SNS_POST_COCO, reasonCode: 'SPAM', reasonText: null },
    ])
    expect(currentSns().reports).toHaveLength(1)
  })

  it('[AC-SNS-RPT-002] 내 게시물 더보기에는 신고하기가 없다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_MINE))

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    expect(within(screen.getByRole('dialog', { name: '게시물 더보기' })).queryByRole('button', { name: '신고하기' })).toBeNull()
  })

  it('[AC-SNS-RPT-003] 기타는 상세 내용이 필수이고 공백만 적으면 제출할 수 없으며 앞뒤 공백을 지워 보낸다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    const sheet = await openPostReport(user)
    expect(within(sheet).getByLabelText('상세 내용 (선택)')).toBeInTheDocument()
    await user.click(within(sheet).getByText('기타'))
    const detail = within(sheet).getByLabelText('상세 내용 (필수)')
    expect(within(sheet).getByText('기타 사유는 상세 내용을 적어 주세요.')).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()

    await user.type(detail, '   ')
    expect(submitButton()).toBeDisabled()

    await user.type(detail, '다른 사람 사진을 도용했어요 ')
    expect(submitButton()).toBeEnabled()
    await user.click(submitButton())

    expect(await screen.findByText('신고가 접수되었습니다')).toBeInTheDocument()
    expect(reportBodies).toEqual([
      { targetType: 'SNS_POST', targetId: SNS_POST_COCO, reasonCode: 'OTHER', reasonText: '다른 사람 사진을 도용했어요' },
    ])
  })

  it('[AC-SNS-RPT-004] 제출이 실패하면 시트와 고른 사유, 상세 내용이 남고 다시 제출할 수 있다', async () => {
    let fail = true
    server.use(
      http.post(SNS_REPORTS_URL, () => {
        if (!fail) return undefined
        fail = false
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    const sheet = await openPostReport(user)
    await user.click(within(sheet).getByText('욕설/혐오 표현'))
    await user.type(within(sheet).getByLabelText('상세 내용 (선택)'), '댓글마다 욕을 해요')
    await user.click(submitButton())

    expect(await within(sheet).findByText('신고를 접수하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(within(sheet).getByRole('radio', { name: '욕설/혐오 표현' })).toBeChecked()
    expect(within(sheet).getByLabelText('상세 내용 (선택)')).toHaveValue('댓글마다 욕을 해요')

    await user.click(submitButton())
    expect(await screen.findByText('신고가 접수되었습니다')).toBeInTheDocument()
    expect(currentSns().reports).toEqual([
      expect.objectContaining({ targetId: SNS_POST_COCO, reasonCode: 'ABUSE', reasonText: '댓글마다 욕을 해요' }),
    ])
  })

  it('[AC-SNS-RPT-004] 요청 중에는 제출 버튼이 잠겨 연달아 눌러도 한 번만 보낸다', async () => {
    let release: () => void = () => {}
    server.use(
      http.post(SNS_REPORTS_URL, async () => {
        await new Promise<void>(resolve => (release = resolve))
        return undefined
      }),
    )
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    const sheet = await openPostReport(user)
    await user.click(within(sheet).getByText('스팸/광고'))
    await user.dblClick(submitButton())
    await waitFor(() => expect(submitButton()).toBeDisabled())
    await user.click(submitButton())
    release()

    expect(await screen.findByText('신고가 접수되었습니다')).toBeInTheDocument()
    expect(reportBodies).toHaveLength(1)
  })

  it('[AC-SNS-RPT-005] 이미 신고한 게시물은 접수 확인으로 보고 시트를 닫아 이미 신고했다고 알린다', async () => {
    seedSns({
      reports: [{ reporter: SNS_ME, targetType: 'SNS_POST', targetId: SNS_POST_COCO, reasonCode: 'SPAM', reasonText: null }],
    })
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    const sheet = await openPostReport(user)
    await user.click(within(sheet).getByText('사기/허위 정보'))
    await user.click(submitButton())

    expect(await screen.findByText('이미 신고한 게시물이에요')).toBeInTheDocument()
    // jsdom은 BottomSheet의 transitionend를 쏘지 않아 닫힌 시트가 DOM에 남는다. 닫힌 시트는 누를 수 없는 상태다.
    expect(reportSheet()).toHaveClass('pointer-events-none')
    expect(currentSns().reports).toHaveLength(1)
  })

  it('[AC-SNS-RPT-006] 시트를 연 사이 지워진 게시물은 시트를 닫아 토스트로 알리고 상세를 다시 읽어 삭제된 게시물 안내로 바꾼다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    const sheet = await openPostReport(user)
    const posts = currentSns().posts.map(p => (p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p))
    seedSns({ posts })
    await user.click(within(sheet).getByText('스팸/광고'))
    await user.click(submitButton())

    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent('삭제된 게시물이에요')
    expect(reportSheet()).toHaveClass('pointer-events-none')
    expect(within(sheet).queryByText('삭제된 게시물이에요')).toBeNull()
    // 상세를 다시 읽어 본문이 삭제된 게시물 안내로 바뀐다.
    expect(await screen.findByText('게시물이 삭제되어 더 이상 볼 수 없어요.')).toBeInTheDocument()
  })

  it('[AC-SNS-RPT-006] 시트를 연 사이 작성자를 차단했으면 시트를 닫아 알리고 상세를 차단한 계정 안내로 바꾼다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    const sheet = await openPostReport(user)
    seedSns({ blocks: [...currentSns().blocks, snsRelation(SNS_ME, SNS_COCO)] })
    await user.click(within(sheet).getByText('스팸/광고'))
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('차단한 계정의 게시물이에요')
    expect(reportSheet()).toHaveClass('pointer-events-none')
    expect(await screen.findByText('차단을 해제하면 게시물을 볼 수 있어요.')).toBeInTheDocument()
  })

  it('[AC-SNS-RPT-006] 피드 카드에서 볼 수 없는 게시물로 거절되면 받아 둔 피드는 바로 다시 읽지 않는다', async () => {
    let feedReads = 0
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'GET' && new URL(request.url).pathname.endsWith('/sns/feeds/explore')) feedReads += 1
    })
    const user = userEvent.setup()
    renderAt('/sns/feed?tab=explore')

    await screen.findByRole('button', { name: '코코집사님의 게시물 보기' })
    const card = screen.getByRole('button', { name: '코코집사님의 게시물 보기' }).closest('article')!
    await user.click(within(card).getByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog', { name: '게시물 더보기' })).getByRole('button', { name: '신고하기' }))
    const posts = currentSns().posts.map(p => (p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p))
    seedSns({ posts })
    const readsBefore = feedReads
    await user.click(within(reportSheet()).getByText('스팸/광고'))
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('삭제된 게시물이에요')
    await delay(50)
    expect(feedReads).toBe(readsBefore)
    expect(screen.getByRole('button', { name: '코코집사님의 게시물 보기' })).toBeInTheDocument()
  })

  it('[AC-SNS-RPT-006] 내 게시물 신고 거절(130800)은 다시 보내도 같은 답이라 시트를 닫고 알린다', async () => {
    server.use(http.post(SNS_REPORTS_URL, () => HttpResponse.json({ errorCode: 130800, message: '' }, { status: 400 })))
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    const sheet = await openPostReport(user)
    await user.click(within(sheet).getByText('스팸/광고'))
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('내 게시물은 신고할 수 없어요')
    expect(reportSheet()).toHaveClass('pointer-events-none')
  })

  it('[AC-SNS-RPT-007] 리포스트 카드 더보기에서 신고하면 리포스트한 사람이 아니라 원글을 신고한다', async () => {
    seedSns({
      follows: [...currentSns().follows, snsRelation(SNS_ME, SNS_MONG)],
      reposts: [snsAct(SNS_MONG, SNS_POST_COCO)],
    })
    const user = userEvent.setup()
    renderAt('/sns/feed')

    const label = await screen.findByText('몽이아빠님이 리포스트했어요')
    await user.click(within(label.closest('article')!).getByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog', { name: '게시물 더보기' })).getByRole('button', { name: '신고하기' }))
    expect(within(reportSheet()).getByText('코코집사 님의 게시물')).toBeInTheDocument()
    await user.click(within(reportSheet()).getByText('스팸/광고'))
    await user.click(submitButton())

    expect(await screen.findByText('신고가 접수되었습니다')).toBeInTheDocument()
    expect(reportBodies).toEqual([expect.objectContaining({ targetType: 'SNS_POST', targetId: SNS_POST_COCO })])
  })
})

describe('SNS 사용자 신고', () => {
  it('[AC-SNS-RPT-008] 다른 사람 프로필 앱바 더보기에서 사용자를 신고한다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog', { name: '프로필 더보기' })).getByRole('button', { name: '신고하기' }))
    expect(within(reportSheet()).getByText('코코집사 님')).toBeInTheDocument()
    expect(within(reportSheet()).getByText(/위반이 의심되는 계정을 알려주세요/)).toBeInTheDocument()
    await user.click(within(reportSheet()).getByText('사기/허위 정보'))
    await user.click(submitButton())

    expect(await screen.findByText('신고가 접수되었습니다')).toBeInTheDocument()
    expect(reportBodies).toEqual([{ targetType: 'SNS_USER', targetId: SNS_COCO, reasonCode: 'FRAUD', reasonText: null }])
  })

  it('[AC-SNS-RPT-008] 리뷰 화면 경로로 이미 신고한 사용자는 이미 신고한 계정이라고 알린다', async () => {
    seedSns({
      reports: [{ reporter: SNS_ME, targetType: 'SNS_USER', targetId: SNS_COCO, reasonCode: 'ABUSE', reasonText: null }],
    })
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog', { name: '프로필 더보기' })).getByRole('button', { name: '신고하기' }))
    await user.click(within(reportSheet()).getByText('스팸/광고'))
    await user.click(submitButton())

    expect(await screen.findByText('이미 신고한 계정이에요')).toBeInTheDocument()
  })

  it('[AC-SNS-RPT-008] 볼 수 없게 된 계정(130000)은 시트를 닫아 알리고 프로필을 다시 읽어 볼 수 없는 계정 안내로 바꾼다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog', { name: '프로필 더보기' })).getByRole('button', { name: '신고하기' }))
    server.use(
      http.post(SNS_REPORTS_URL, () => HttpResponse.json({ errorCode: 130000, message: '' }, { status: 404 })),
      http.get(SNS_PROFILE_URL, () => HttpResponse.json({ errorCode: 130000, message: '' }, { status: 404 })),
    )
    await user.click(within(reportSheet()).getByText('스팸/광고'))
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('볼 수 없는 계정이에요')
    expect(reportSheet()).toHaveClass('pointer-events-none')
    expect(await screen.findByText('계정이 없거나 지금은 볼 수 없어요.')).toBeInTheDocument()
  })

  it('[AC-SNS-RPT-008] 자기 자신 신고 거절(30200)은 시트를 닫고 알린다', async () => {
    server.use(http.post(SNS_REPORTS_URL, () => HttpResponse.json({ errorCode: 30200, message: '' }, { status: 400 })))
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog', { name: '프로필 더보기' })).getByRole('button', { name: '신고하기' }))
    await user.click(within(reportSheet()).getByText('스팸/광고'))
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('나 자신은 신고할 수 없어요')
    expect(reportSheet()).toHaveClass('pointer-events-none')
  })

  it('[AC-SNS-RPT-009] 내 프로필에는 신고 진입점이 없다', async () => {
    renderAt('/sns/me')

    expect(await screen.findByRole('button', { name: '프로필 수정' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull()
  })

  it('[AC-SNS-RPT-010] 차단 관리 목록의 차단 행에서 사용자를 신고하고 뮤트 행에는 신고가 없다', async () => {
    seedSns({ blocks: [snsRelation(SNS_ME, SNS_SPAM)] })
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await user.click(await screen.findByRole('button', { name: '광고계정01 신고' }))
    expect(within(reportSheet()).getByText('광고계정01 님')).toBeInTheDocument()
    await user.click(within(reportSheet()).getByText('스팸/광고'))
    await user.click(submitButton())

    expect(await screen.findByText('신고가 접수되었습니다')).toBeInTheDocument()
    expect(reportBodies).toEqual([{ targetType: 'SNS_USER', targetId: SNS_SPAM, reasonCode: 'SPAM', reasonText: null }])

    await user.click(screen.getByRole('tab', { name: /뮤트/ }))
    await screen.findByText('토리네')
    expect(screen.queryByRole('button', { name: /신고$/ })).toBeNull()
  })
})

describe('비로그인 신고', () => {
  beforeEach(() => {
    logout()
    seedSns({ viewer: null })
  })

  it('[AC-SNS-RPT-011] 비로그인이 신고하기를 누르면 로그인 안내 시트를 열고 로그인 뒤 신고 시트만 다시 열고 제출하지 않는다', async () => {
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath(SNS_POST_COCO))
    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog', { name: '게시물 더보기' })).getByRole('button', { name: '신고하기' }))
    expect(await screen.findByText(/신고는 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '로그인 / 회원가입' }))
    await waitFor(() => expect(guestRouter.state.location.pathname).toBe('/onboarding/login'))
    cleanup()
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    seedSns({ viewer: SNS_ME })
    const router = renderAt('/login/complete?status=ACTIVE&isNew=false')

    await waitFor(() => expect(router.state.location.pathname).toBe(postPath(SNS_POST_COCO)))
    expect(await screen.findByText('신고 사유를 선택해 주세요')).toBeInTheDocument()
    await delay(50)
    expect(reportBodies).toEqual([])
    expect(sessionStorage.length).toBe(0)
  })
})
