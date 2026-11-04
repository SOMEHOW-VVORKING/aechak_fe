import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SELLER_NOTICES_URL,
  SELLER_NOTICE_DETAIL_URL,
  failSellerNoticesList,
  lastSellerNoticesQuery,
  makeSellerNoticeWire,
  seedSellerNotices,
  sellerNoticesQueries,
  server,
  type SellerNoticeWire,
} from '@/testing/msw/server'
import { SAMPLE_ACTION_TOAST, SAMPLE_DATA_TITLE } from '@/shared/components/SampleDataNotice'
import { routeTree } from '../../../routeTree.gen'

// 실 API 연동 — MSW가 seller 호스트(8081) `/sellers/me/notices` 둘을 가로챈다. 모듈 모킹이 아니라
// 네트워크 레벨이라 URL·호스트·봉투·에러 계약까지 함께 검증되고, test-setup의
// onUnhandledRequest:'error'가 핸들러 없는 요청을 곧바로 실패로 만든다.
function renderNotices() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/notices'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const PINNED_TITLE = '11월 1일부터 반품 배송비 부담 기준이 바뀌어요'
const MAINTENANCE_TITLE = '10월 29일 새벽 정기 점검 안내'
const SETTLEMENT_TITLE = '9월 정산 지급이 완료됐어요'

const rowOf = async (title: string) => (await screen.findByText(title)).closest('tr') as HTMLElement

/**
 * 화면이 네트워크로 나간 요청을 모은다. 라우트 가드가 부르는 경로(세션 복원·셀러 자격)는 화면의
 * 동작이 아니라 진입 조건이라 뺀다 — unbuilt-routes.test.tsx와 같은 집계다.
 */
const GUARD_PATHS = ['/seller-applications', '/auth/web/refresh']

function trackRequests() {
  const urls: string[] = []
  server.events.on('request:start', ({ request }) => {
    if (GUARD_PATHS.some(path => new URL(request.url).pathname.endsWith(path))) return
    urls.push(request.url)
  })
  return urls
}

afterEach(() => server.events.removeAllListeners())

beforeEach(() => {
  seedSellerNotices()
})

describe('셀러 알림/공지 목록 (SCRUM-332)', () => {
  it('[AC-SELLER-NOTICE-101] 서버 공지를 분류·게시 시각과 함께 보여주고 고정 공지가 먼저 온다', async () => {
    renderNotices()

    const pinned = await rowOf(PINNED_TITLE)
    // pinned는 정렬의 첫 키라 고정 공지가 늘 맨 위다 — 색이 아니라 글자로 말한다.
    expect(within(pinned).getByText('고정')).toBeInTheDocument()
    expect(within(pinned).getByText('정책')).toBeInTheDocument()
    // 오프셋 없는 벽시계를 자리 잘라 읽는다 — Date로 파싱하면 타임존만큼 밀린 시각이 찍힌다.
    expect(within(pinned).getByText('2026-10-26 10:00')).toBeInTheDocument()

    // SETTLEMENT는 셀러 정산 안내라 실제로 온다 — 라벨 표에서 빠지면 이 한 건이 표를 날린다.
    const settlement = await rowOf(SETTLEMENT_TITLE)
    expect(within(settlement).getByText('정산')).toBeInTheDocument()
    expect(within(settlement).queryByText('고정')).not.toBeInTheDocument()

    // 서버 정렬((고정, 게시 시각, id) 내림차순)이 그대로 표의 행 순서여야 한다.
    const titles = screen
      .getAllByRole('row')
      .slice(1)
      .map(row => row.textContent ?? '')
    expect(titles[0]).toContain(PINNED_TITLE)
    expect(titles[1]).toContain(MAINTENANCE_TITLE)
    expect(titles[2]).toContain(SETTLEMENT_TITLE)

    expect(screen.getByText('총 3건')).toBeInTheDocument()
    // 실연동 화면에는 "예시 데이터" 띠를 붙이지 않는다(실데이터를 예시로 의심하게 만든다).
    expect(screen.queryByText(SAMPLE_DATA_TITLE)).not.toBeInTheDocument()
  })

  it('[AC-SELLER-NOTICE-102] 행을 누르면 상세를 따로 불러 전문을 보여준다(목록은 앞 100자뿐이다)', async () => {
    const user = userEvent.setup()
    const long = `${'가'.repeat(120)}끝문장이다.`
    seedSellerNotices([
      makeSellerNoticeWire({ noticeId: '01HZSNLONG00000000000000A', title: PINNED_TITLE, content: long }),
    ])
    renderNotices()

    // 목록 미리보기에는 잘린 글만 있다 — 그것으로 Drawer를 그리면 잘린 글이 전문으로 읽힌다.
    expect(await screen.findByText(`${'가'.repeat(100)}…`)).toBeInTheDocument()

    await user.click(await rowOf(PINNED_TITLE))

    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText(long)).toBeInTheDocument()
    expect(within(drawer).getByText('2026-10-26 10:00 게시')).toBeInTheDocument()
  })

  it("[AC-SELLER-NOTICE-103] '전체 분류'는 category를 키째 빼고, 분류를 고르면 그 값으로 나가며 목록이 좁혀진다", async () => {
    const user = userEvent.setup()
    renderNotices()
    await screen.findByText(PINNED_TITLE)

    // 빈 값을 그대로 보내면 서버가 enum 바인딩 오류(400/90001)로 거절한다.
    expect(lastSellerNoticesQuery() ?? '').not.toContain('category=')
    expect(lastSellerNoticesQuery() ?? '').toContain('size=20')

    await user.selectOptions(screen.getByRole('combobox', { name: '공지 분류' }), 'SETTLEMENT')

    await waitFor(() => expect(screen.queryByText(PINNED_TITLE)).not.toBeInTheDocument())
    expect(screen.getByText(SETTLEMENT_TITLE)).toBeInTheDocument()
    expect(lastSellerNoticesQuery() ?? '').toContain('category=SETTLEMENT')
    expect(screen.getByText('총 1건')).toBeInTheDocument()
  })

  it('[AC-SELLER-NOTICE-104] 더 보기는 nextCursor로 이어 붙이고, 분류를 바꾸면 그 커서를 버린다', async () => {
    const user = userEvent.setup()
    // 한 페이지(20건)를 넘겨야 `더 보기`가 열린다. 게시 시각을 하루씩 내려 정렬을 고정한다.
    const policies: SellerNoticeWire[] = Array.from({ length: 21 }, (_, index) =>
      makeSellerNoticeWire({
        noticeId: `01HZSNPAGE00000000000${String(index).padStart(4, '0')}`,
        title: `정책 공지 ${index}`,
        category: 'POLICY',
        publishedAt: `2026-10-${String(30 - index).padStart(2, '0')}T09:00:00`,
      }),
    )
    seedSellerNotices([
      ...policies,
      makeSellerNoticeWire({
        noticeId: '01HZSNPAGESETTLEMENT00001',
        title: SETTLEMENT_TITLE,
        category: 'SETTLEMENT',
        publishedAt: '2026-10-05T09:00:00',
      }),
    ])
    renderNotices()

    expect(await screen.findByText('정책 공지 0')).toBeInTheDocument()
    expect(screen.getByText('총 22건')).toBeInTheDocument()
    expect(screen.queryByText('정책 공지 20')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '더 보기' }))

    // 두 페이지가 이어 붙고, 총건수는 첫 페이지 값을 지킨다(커서 페이지의 null로 덮지 않는다).
    expect(await screen.findByText('정책 공지 20')).toBeInTheDocument()
    expect(screen.getByText('총 22건')).toBeInTheDocument()
    expect(sellerNoticesQueries().at(-1) ?? '').toContain('cursor=')

    await user.selectOptions(screen.getByRole('combobox', { name: '공지 분류' }), 'SETTLEMENT')

    // 커서에 분류가 실리지 않아 서버가 끊어 주지 않는다 — 분류가 쿼리 키에 있어야 사슬이 새로
    // 시작한다. 옛 커서를 보내면 엉뚱한 앵커에서 이어 읽은 섞인 목록이 그대로 그려진다.
    await waitFor(() => expect(screen.getByText('총 1건')).toBeInTheDocument())
    const lastQuery = sellerNoticesQueries().at(-1) ?? ''
    expect(lastQuery).toContain('category=SETTLEMENT')
    expect(lastQuery).not.toContain('cursor=')
    expect(screen.queryByText('정책 공지 0')).not.toBeInTheDocument()
  })

  it('[AC-SELLER-NOTICE-105] 403/10004는 빈 목록이 아니라 셀러 자격 사유로 말한다', async () => {
    failSellerNoticesList({ status: 403, errorCode: 10004, message: '셀러가 아닙니다.' })
    renderNotices()

    expect(
      await screen.findByText(
        '셀러로 등록되지 않은 계정이라 공지를 볼 수 없어요. 스토어 설정에서 입점 상태를 확인해 주세요.',
      ),
    ).toBeInTheDocument()
    // 실패가 "공지 없음"으로 흘러가면 셀러는 운영자가 아무것도 안 보냈다고 읽는다.
    expect(screen.getByText('공지를 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 공지가 없어요.')).not.toBeInTheDocument()
  })

  it('[AC-SELLER-NOTICE-106] 상세 404/150000은 사유를 단정하지 않고 지금 볼 수 없다고 말한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(SELLER_NOTICE_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 150000, message: '공지를 찾을 수 없습니다.' }, { status: 404 }),
      ),
    )
    renderNotices()

    await user.click(await rowOf(PINNED_TITLE))

    const drawer = await screen.findByRole('dialog')
    // 초안·내린 공지·다른 대상 공지가 모두 같은 404라 화면도 셋을 구분해 말할 수 없다.
    expect(
      await within(drawer).findByText(
        '지금은 볼 수 없는 공지예요. 운영자가 내렸을 수 있어요. 목록을 다시 불러와 주세요.',
      ),
    ).toBeInTheDocument()
  })

  it('[AC-SELLER-NOTICE-107] 라벨 표에 없는 분류가 와도 표가 살아 있고 원문을 그대로 보여준다', async () => {
    // 서버가 열거를 늘린 날 — 라벨 표 조회가 undefined를 구조분해하면 목록이 통째로 사라진다.
    // 생성 타입에 없는 값이므로 시드가 아니라 응답을 직접 세운다.
    server.use(
      http.get(SELLER_NOTICES_URL, () =>
        HttpResponse.json({
          data: {
            items: [
              {
                noticeId: '01HZSNUNKNOWN00000000001',
                title: PINNED_TITLE,
                category: 'PARTNER',
                pinned: false,
                contentPreview: '파트너 전용 공지예요.',
                publishedAt: '2026-10-26T10:00:00',
              },
            ],
            totalCount: 1,
            nextCursor: null,
            hasNext: false,
          },
        }),
      ),
    )
    renderNotices()

    const row = await rowOf(PINNED_TITLE)
    expect(within(row).getByText('PARTNER')).toBeInTheDocument()
    expect(screen.getByText('총 1건')).toBeInTheDocument()
  })

  it('[AC-SELLER-NOTICE-108] 알림 수신 설정 카드는 저장되지 않음을 글자로 남기고 서버로 나가지 않는다', async () => {
    const user = userEvent.setup()
    renderNotices()
    await screen.findByText(PINNED_TITLE)

    // 발송 채널 설정 경로가 서버에 없다 — 카드가 그 사실을 스스로 밝혀야 거짓이 아니다.
    expect(
      screen.getByText(/예시 화면이라 토글을 움직이거나 저장을 눌러도 저장되지 않아요/),
    ).toBeInTheDocument()

    const requests = trackRequests()
    const toggle = screen.getByRole('switch', { name: '취소/반품/교환 문자 수신' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('button', { name: '수신 설정 저장' }))

    expect(await screen.findByText(SAMPLE_ACTION_TOAST)).toBeInTheDocument()
    expect(requests).toEqual([])
  })
})
