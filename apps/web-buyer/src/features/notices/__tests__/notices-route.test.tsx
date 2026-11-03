import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  failNoticesList,
  lastNoticesQuery,
  makeNoticeRow,
  noticesQueries,
  seedNotices,
  type NoticeRow,
  type WireNoticeCategory,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 구매자 공지사항(SCRUM-332). 어드민이 게시한 공지가 `GET /notices`로 내려오는데 FE에 화면이
// 아예 없었다 — 목록·상세와 **설정 홈의 입구**까지 함께 고정한다(입구가 없으면 화면을 만든
// 의미가 없다).
//
// 응답 계약(정렬·커서·totalCount·미리보기 길이)은 `testing/msw/notices.ts`가 소유하고 여기선
// seedNotices로 시나리오만 세운다(test-setup의 afterEach가 리셋).

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

/** 공지는 회원 전용 경로다(permitAll 목록에 없다) — 토큰이 세션의 정본이라 이걸로 로그인시킨다. */
function signIn() {
  setAccessToken('member-token')
}

const PINNED = makeNoticeRow({
  noticeId: '01HZBN0000000000000000011',
  title: '교환/반품 접수 방법이 바뀌어요',
  content: '주문 상세에서 바로 접수할 수 있어요.\n10월 31일까지 접수된 건은 기존 방식대로 처리돼요.',
  category: 'POLICY',
  pinned: true,
  publishedAt: '2026-10-20T09:00:00',
})

const MAINTENANCE = makeNoticeRow({
  noticeId: '01HZBN0000000000000000012',
  title: '10월 29일 새벽 정기 점검 안내',
  content: '점검 동안 주문과 결제가 잠시 중단돼요.',
  category: 'MAINTENANCE',
  pinned: false,
  // 고정 공지보다 **나중에** 게시됐다 — 게시 시각만으로 정렬하면 이 행이 위로 올라온다.
  publishedAt: '2026-10-26T17:30:00',
})

const SETTLEMENT = makeNoticeRow({
  noticeId: '01HZBN0000000000000000013',
  title: '적립금 사용 기준 안내',
  content: '적립금은 1,000원부터 쓸 수 있어요.',
  category: 'SETTLEMENT',
  pinned: false,
  publishedAt: '2026-10-23T14:20:00',
})

/** 커서 페이징을 보려면 한 페이지(20건)를 넘겨야 한다. */
function manyNotices(count: number): NoticeRow[] {
  return Array.from({ length: count }, (_, i) =>
    makeNoticeRow({
      noticeId: `01HZBN00000000000000${String(count - i).padStart(5, '0')}`,
      title: `공지 ${count - i}`,
      content: `공지 ${count - i} 본문`,
      category: 'SERVICE',
      pinned: false,
      // id 내림차순과 같은 순서가 되도록 최신 공지가 큰 번호다.
      publishedAt: `2026-10-${String(1 + ((count - i) % 28)).padStart(2, '0')}T09:00:00`,
    }),
  )
}

beforeEach(() => {
  resetAuth()
  signIn()
})

describe('/settings 공지사항 입구', () => {
  it('[AC-BUYER-NOTICE-001] 설정 홈 고객지원 그룹의 공지사항 행이 공지 목록으로 이동한다', async () => {
    seedNotices([PINNED])
    const user = userEvent.setup()
    renderAt('/settings')

    await user.click(await screen.findByRole('button', { name: '공지사항' }))

    // 목록 화면이 실제로 열려 서버 공지를 그린다 — 행만 있고 도착지가 없으면 죽은 입구다.
    expect(await screen.findByText('교환/반품 접수 방법이 바뀌어요')).toBeInTheDocument()
  })
})

describe('/settings/notices 공지 목록', () => {
  it('[AC-BUYER-NOTICE-002] 중요 공지를 먼저 그리고 분류 라벨·게시 시각·전체 건수를 보여준다', async () => {
    seedNotices([PINNED, MAINTENANCE, SETTLEMENT])
    renderAt('/settings/notices')

    expect(await screen.findByText('교환/반품 접수 방법이 바뀌어요')).toBeInTheDocument()
    expect(screen.getByText('전체 3건')).toBeInTheDocument()

    // 분류 라벨은 칩에도 같은 글자가 있어 **행 안에서** 단언한다 — 칩만 보면 행이 분류를 전혀
    // 그리지 않아도 통과한다. 라벨 표로 덮으므로 서버 enum 원문은 어디에도 나오지 않는다.
    const pinnedCard = screen.getByRole('button', { name: /교환\/반품 접수 방법이 바뀌어요/ })
    expect(within(pinnedCard).getByText('정책')).toBeInTheDocument()
    // 상단 고정은 색이 아니라 글자로 말한다.
    expect(within(pinnedCard).getByText('중요')).toBeInTheDocument()
    // 오프셋 없는 벽시계를 자리 잘라 읽는다 — Date로 파싱하면 타임존만큼 밀린다.
    expect(within(pinnedCard).getByText('2026.10.20 09:00')).toBeInTheDocument()
    expect(screen.queryByText('POLICY')).not.toBeInTheDocument()

    const maintenanceCard = screen.getByRole('button', { name: /10월 29일 새벽 정기 점검 안내/ })
    expect(within(maintenanceCard).getByText('점검')).toBeInTheDocument()
    const settlementCard = screen.getByRole('button', { name: /적립금 사용 기준 안내/ })
    // SETTLEMENT(정산)를 라벨 표에서 빼면 이 행이 원문 경고로 떨어진다.
    expect(within(settlementCard).getByText('정산')).toBeInTheDocument()

    // pinned가 정렬의 첫 키라 더 최근에 게시된 점검 공지보다 위에 온다 — 화면이 게시 시각으로
    // 다시 정렬하면 눈에 보이는 순서가 서버 순서와 어긋난다.
    expect(
      pinnedCard.compareDocumentPosition(maintenanceCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('[AC-BUYER-NOTICE-003] 표에 없는 분류가 와도 목록이 그려지고 원문을 그대로 보여준다', async () => {
    // 라벨 표에서 값 하나가 빠진 채 그 분류 공지가 오면 undefined 구조분해가 TypeError가 되어
    // 목록이 통째로 사라진다 — 한 건이 화면을 날리는 모양이라 metaOf 분기로 막는다.
    seedNotices([
      makeNoticeRow({
        noticeId: '01HZBN0000000000000000021',
        title: '새 분류 공지',
        content: '서버가 분류를 늘렸다.',
        // 서버가 분류를 늘린 상황 — 와이어 열거에 아직 없는 값이다.
        category: 'PARTNER' as unknown as WireNoticeCategory,
      }),
      SETTLEMENT,
    ])
    renderAt('/settings/notices')

    expect(await screen.findByText('새 분류 공지')).toBeInTheDocument()
    expect(screen.getByText('PARTNER')).toBeInTheDocument()
    // 다른 행도 함께 남는다(목록이 날아가지 않았다).
    expect(screen.getByText('적립금 사용 기준 안내')).toBeInTheDocument()
  })

  it('[AC-BUYER-NOTICE-004] 분류를 고르면 그 분류만 남고 요청에 category가 실린다', async () => {
    seedNotices([PINNED, MAINTENANCE, SETTLEMENT])
    const user = userEvent.setup()
    renderAt('/settings/notices')

    await screen.findByText('교환/반품 접수 방법이 바뀌어요')
    await user.click(screen.getByRole('button', { name: '점검' }))

    // 옵션 존재가 아니라 **고른 뒤 남는 행 수**를 단언한다 — 필터가 요청에 실리지 않아도
    // 칩은 선택 상태가 되므로 문구만 보면 동작 안 하는 필터가 초록으로 지나간다.
    expect(await screen.findByText('전체 1건')).toBeInTheDocument()
    expect(screen.getByText('10월 29일 새벽 정기 점검 안내')).toBeInTheDocument()
    expect(screen.queryByText('교환/반품 접수 방법이 바뀌어요')).not.toBeInTheDocument()
    expect(lastNoticesQuery()).toContain('category=MAINTENANCE')
  })

  it('[AC-BUYER-NOTICE-005] 더보기로 다음 페이지를 이어 받고 전체 건수는 첫 페이지 값을 유지한다', async () => {
    seedNotices(manyNotices(21))
    const user = userEvent.setup()
    renderAt('/settings/notices')

    expect(await screen.findByText('전체 21건')).toBeInTheDocument()
    // 한 페이지는 20건이라 마지막 한 건은 아직 없다.
    expect(screen.queryByText('공지 1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '더보기' }))

    expect(await screen.findByText('공지 1')).toBeInTheDocument()
    // 두 번째 요청은 커서를 싣는다.
    expect(lastNoticesQuery()).toContain('cursor=')
    // totalCount는 커서 페이지에서 null이다 — 뒤 페이지로 덮으면 숫자가 사라진다.
    expect(screen.getByText('전체 21건')).toBeInTheDocument()
    // 다 받았으면 더보기가 사라진다.
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument()
  })

  it('[AC-BUYER-NOTICE-006] 분류를 바꾸면 직전 커서를 버리고 처음부터 다시 받는다', async () => {
    // 커서에는 분류가 실리지 않아(코덱이 담는 것은 tag·pinned·publishedAt·noticeId 넷뿐)
    // 조건이 바뀐 채 옛 커서를 보내도 서버가 거부하지 않는다 — 섞인 목록을 막는 방어선은
    // 쿼리 키에 분류를 넣는 것뿐이다.
    seedNotices([...manyNotices(21), MAINTENANCE])
    const user = userEvent.setup()
    renderAt('/settings/notices')

    expect(await screen.findByText('전체 22건')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '더보기' }))
    await screen.findByText('공지 1')

    await user.click(screen.getByRole('button', { name: '점검' }))

    expect(await screen.findByText('전체 1건')).toBeInTheDocument()
    expect(screen.queryByText('공지 1')).not.toBeInTheDocument()
    // 분류를 바꾼 뒤의 요청에는 커서가 붙지 않는다.
    await waitFor(() => expect(lastNoticesQuery()).toContain('category=MAINTENANCE'))
    expect(lastNoticesQuery()).not.toContain('cursor=')
  })

  it('[AC-BUYER-NOTICE-007] 목록 조회 실패를 빈 상태가 아니라 실패로 말한다', async () => {
    seedNotices([PINNED])
    failNoticesList({ status: 500, errorCode: 90000, message: '서버 오류입니다.' })
    renderAt('/settings/notices')

    expect(await screen.findByText('공지를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    // "공지가 없음"으로 흘리면 구매자는 공지가 없다고 읽는다.
    expect(screen.queryByText('등록된 공지가 없어요')).not.toBeInTheDocument()
  })

  it('[AC-BUYER-NOTICE-008] 공지가 0건이면 실패와 구분되는 빈 상태를 안내한다', async () => {
    seedNotices([])
    renderAt('/settings/notices')

    expect(await screen.findByText('등록된 공지가 없어요')).toBeInTheDocument()
    expect(screen.queryByText('공지를 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('[AC-BUYER-NOTICE-009] 비회원은 로그인 안내를 보고 공지를 부르지 않는다', async () => {
    seedNotices([PINNED])
    logout()
    renderAt('/settings/notices')

    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    // 사유가 '내 정보'(mypage 문구)로 새지 않는지 함께 본다 — 공지는 내 정보가 아니다.
    // 설명은 한 <p> 안에서 <br/>로 두 문장이라 정확 일치로는 잡히지 않는다.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent?.includes('공지사항은 로그인한 회원만 볼 수 있어요.') === true,
      ),
    ).toBeInTheDocument()
    // 회원 전용 경로를 그대로 부르면 401 → 전역 리다이렉트로 화면이 사라진다.
    expect(noticesQueries()).toEqual([])
  })
})

describe('/settings/notices/$noticeId 공지 상세', () => {
  it('[AC-BUYER-NOTICE-010] 목록 미리보기가 아니라 상세로 받은 전문을 보여준다', async () => {
    const long = makeNoticeRow({
      noticeId: '01HZBN0000000000000000031',
      title: '배송비 정책이 바뀌어요',
      // 100자를 넘겨 목록에서는 잘린 미리보기가 온다.
      content: `${'가'.repeat(120)}\n두 번째 줄이에요.`,
      category: 'POLICY',
    })
    seedNotices([long])
    const user = userEvent.setup()
    renderAt('/settings/notices')

    await user.click(await screen.findByRole('button', { name: /배송비 정책이 바뀌어요/ }))

    // 전문은 상세 응답으로만 온다 — 목록 행을 그대로 그리면 잘린 글이 공지 전문으로 읽힌다.
    expect(await screen.findByText(/두 번째 줄이에요\./)).toBeInTheDocument()
    expect(screen.getByText('2026.10.26 10:00 게시')).toBeInTheDocument()
  })

  it('[AC-BUYER-NOTICE-011] 없는 공지는 사라졌다고 단정하지 않고 지금 볼 수 없다고 말한다', async () => {
    // 404(150000)는 초안·내린 공지·구매자 대상이 아닌 공지를 한 코드로 끊는다 — 세 경우를
    // 구분해 말할 수 없으므로 문구도 사유를 단정하지 않는다.
    seedNotices([PINNED])
    renderAt('/settings/notices/01HZBN0000000000000000099')

    expect(await screen.findByText('지금은 볼 수 없는 공지예요')).toBeInTheDocument()
    expect(screen.getByText('운영자가 내렸을 수 있어요. 목록을 다시 불러와 주세요.')).toBeInTheDocument()
  })

  it('[AC-BUYER-NOTICE-012] 비회원은 상세에서도 로그인 안내를 보고 공지를 부르지 않는다', async () => {
    seedNotices([PINNED])
    logout()
    renderAt(`/settings/notices/${PINNED.noticeId}`)

    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.queryByText('교환/반품 접수 방법이 바뀌어요')).not.toBeInTheDocument()
  })
})
