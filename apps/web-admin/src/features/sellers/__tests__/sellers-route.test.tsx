import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_ORIGIN,
  ADMIN_SELLERS_URL,
  ADMIN_SELLER_SUSPEND_URL,
  currentAdminSeller,
  lastAdminSellerWrite,
  makeAdminSellerWire,
  seedAdminApplications,
  seedAdminSellers,
  server,
  type AdminSellerWire,
} from '@/testing/msw/server'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // 에러 분기를 즉시 보려면 재시도를 끈다(main.tsx는 retry 1).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

// `/admin/sellers` 다섯에 실연동된 셀러 관리 화면(SCRUM-362). 2026-11-04까지 이 파일은 목업 행
// `냥이상점`과 nav의 `'셀러 관리 준비 중'` 꼬리표를 단언했는데, 서버가 생겨 계약이 뒤집혔다 —
// 그 둘은 이제 **없어야** 하는 것이고, nav 분류는 `shared/__tests__/admin-nav.test.tsx`가 본다.
//
// 가로채기는 실제 HTTP 경로로 한다. 어드민 경로는 어드민 오리진이라 핸들러 주소도 호스트별로
// 나뉘어 있고(`testing/msw/base.ts`) `test-setup.ts`가 실제 앱과 같은 설정을 불러 둔다 — 한
// 주소로 합치면 요청이 엉뚱한 모듈로 나가도 똑같이 받아 주어 배포에서만 드러난다.

const 멍멍마켓 = makeAdminSellerWire({
  sellerId: 2041,
  storeName: '멍멍마켓',
  status: 'ACTIVE',
  businessType: 'SOLE_PROPRIETORSHIP',
  representativeNameMasked: '김*수',
  productCount: 42,
  cumulativeOrderCount: 318,
  hasUnsettledAmount: true,
  statusChangedAt: '2026-09-14T10:20:00',
  internalMemo: '정산 문의가 두 번 들어왔어요. 담당 배정했어요.',
})

/** 정지 중인 셀러 — `previousStatus`가 해제가 되돌릴 자리다(응답에는 없는 값이다). */
const 야옹상점 = makeAdminSellerWire({
  sellerId: 2033,
  storeName: '야옹상점',
  status: 'SUSPENDED',
  businessType: 'CORPORATE',
  representativeNameMasked: '이*희',
  productCount: 12,
  cumulativeOrderCount: 88,
  hasUnsettledAmount: false,
  statusChangedAt: '2026-10-30T14:05:00',
  suspensionUntil: '2026-11-06T14:05:00',
  suspensionReasonCode: 'REPEATED_REPORT',
  suspensionReason: '신고 누적 — 같은 상품에 신고가 반복됐어요.',
  internalMemo: '해제 전 상품 전수 점검 필요.',
  previousStatus: 'ACTIVE',
  sanctions: [
    {
      sanctionId: 7,
      action: 'SUSPEND',
      reasonCode: 'REPEATED_REPORT',
      reasonDetail: '같은 상품에 신고가 반복됐어요.',
      effectiveUntil: '2026-11-06T14:05:00',
      memo: '상품 전수 점검 예정.',
      actedByAdminId: 9001,
      actedAt: '2026-10-30T14:05:00',
    },
  ],
})

/**
 * 퇴점 신청 셀러 — 정지는 409(10009), 해제는 409(10008)라 **누르는 즉시 실패하는** 조치다.
 * 서버가 `WITHDRAWAL_REQUESTED`를 보관만 하고 되돌릴 자리를 주지 않는다.
 */
const 하늘펫샵 = makeAdminSellerWire({
  sellerId: 1990,
  storeName: '하늘펫샵',
  status: 'WITHDRAWAL_REQUESTED',
  businessType: 'PERSONAL_GENERAL',
  representativeNameMasked: '박*민',
  productCount: 3,
  cumulativeOrderCount: 21,
  hasUnsettledAmount: false,
  statusChangedAt: '2026-11-01T08:00:00',
})

/**
 * 입점 신청서가 없는 셀러 — `businessType`과 `representativeNameMasked`가 **둘 다** null이다
 * (서버가 신청서를 left join으로 붙인다). 유형을 모르는 것이라 개인으로 접으면 거짓이 된다.
 */
const 초코집사네 = makeAdminSellerWire({
  sellerId: 1008,
  storeName: '초코집사네',
  status: 'ACTIVE',
  businessType: null,
  representativeNameMasked: null,
  productCount: 0,
  cumulativeOrderCount: 0,
  hasUnsettledAmount: false,
  statusChangedAt: '2026-08-02T09:00:00',
  internalMemo: null,
})

const table = () => within(screen.getByRole('table'))
const bodyRowCount = () => table().getAllByRole('row').length - 1
const drawer = async () => within(await screen.findByRole('dialog', { name: '셀러 상세' }))

/**
 * Drawer는 닫힌 뒤에도 `onTransitionEnd`를 기다리며 DOM에 남는다(jsdom은 transition을 쏘지
 * 않는다) — 그래서 "닫혔다"는 dialog 노드가 아니라 **본문이 사라졌는지**로 본다.
 */
const drawerBodyGone = () => screen.queryByRole('button', { name: '메모 저장' }) == null

const combo = (name: string) => screen.getByRole('combobox', { name })

const chooseOption = (name: string, optionName: string) =>
  userEvent
    .setup()
    .selectOptions(combo(name), within(combo(name)).getByRole('option', { name: optionName }))

/**
 * 목록 조회로 나간 쿼리 — 필터가 **서버로** 나가는지는 이것으로만 말할 수 있다.
 *
 * 서버는 알 수 없는 status·sellerType을 400이 아니라 **조건 없음으로 보정한다**. 그래서 매퍼가
 * 화면 값(`withdrawal-requested`)을 그대로 보내도 목록은 비지 않고 **전체가 돌아온다** —
 * "걸러졌는가"만 보는 단언으로는 그 어긋남을 영원히 못 잡고 운영자는 거른 줄 알고 안 걸러진
 * 목록을 읽는다. 나간 파라미터 문자열을 직접 본다.
 */
function recordListQueries(): string[] {
  const queries: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (request.method !== 'GET' || !url.pathname.endsWith('/admin/sellers')) return
    queries.push(
      [
        url.searchParams.get('status') ?? 'none',
        url.searchParams.get('sellerType') ?? 'none',
        url.searchParams.get('keyword') ?? 'none',
        url.searchParams.get('page') ?? 'none',
        url.searchParams.get('size') ?? 'none',
      ].join('|'),
    )
  })
  return queries
}

/** 셀러 경로로 나간 요청 — **오리진까지** 남겨 호스트 오배치를 잡는다. */
function recordSellerRequests(): string[] {
  const entries: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (!url.pathname.includes('/admin/sellers')) return
    entries.push(`${request.method} ${url.origin}${url.pathname}`)
  })
  return entries
}

const writesOnly = (entries: readonly string[]) => entries.filter(entry => !entry.startsWith('GET '))

/** 응답을 테스트가 붙잡고 있다가 놓는다 — 그 사이가 "요청이 떠 있는 동안"이다. */
function gateSuspend() {
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  server.use(
    http.post(ADMIN_SELLER_SUSPEND_URL, async () => {
      await gate
      return HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 })
    }),
  )
  return () => release()
}

describe('/sellers', () => {
  beforeEach(() => {
    // 셸이 nav 배지를 채우려 심사 대기 수를 조회한다 — 핸들러가 없으면 MSW가 테스트를 깨뜨린다.
    seedAdminApplications()
    seedAdminSellers([멍멍마켓, 야옹상점, 하늘펫샵, 초코집사네])
  })

  /**
   * 목록이 서버 값을 라벨로 그린다.
   *
   * 와이어 원문(`ACTIVE`)이 찍히지 않는지를 함께 보는 이유: 상태 메타 표에 값이 빠지면 그 자리가
   * `StatusMetaPill`의 구조분해라 표가 통째로 사라지거나 원문이 노출된다. 다섯 값 중 셋이
   * 이 시드에 있고, 응답에 없는 값(최근 접속·누적 신고)의 칸이 되살아나지 않는지도 본다.
   */
  it('[AC-SELLER-MGMT-001] 목록은 서버 값을 라벨로 그리고 와이어 원문·없는 칸을 만들지 않는다', async () => {
    const requests = recordSellerRequests()
    renderAt('/sellers')

    expect(await screen.findByRole('button', { name: '멍멍마켓' })).toBeInTheDocument()
    expect(bodyRowCount()).toBe(4)
    // 정렬은 셀러 식별자 내림차순 고정이다(정렬 파라미터가 없다).
    expect(table().getAllByRole('row')[1]).toHaveTextContent('멍멍마켓')
    expect(table().getAllByRole('row')[4]).toHaveTextContent('초코집사네')

    expect(table().getAllByText('영업중')).toHaveLength(2)
    expect(table().getByText('판매정지')).toBeInTheDocument()
    expect(table().getByText('퇴점 신청')).toBeInTheDocument()
    expect(table().queryByText('ACTIVE')).toBeNull()
    expect(table().queryByText('WITHDRAWAL_REQUESTED')).toBeNull()

    // 신청서가 없는 셀러는 유형을 **모른다** — 개인으로 접으면 거짓이다.
    expect(table().getByText('유형 미확인')).toBeInTheDocument()
    expect(table().getByText('개인 사업자')).toBeInTheDocument()
    expect(table().getByText('법인 사업자')).toBeInTheDocument()
    // 해제 예정은 무기한과 가려야 한다 — 정지 행에만 날짜가 붙는다.
    expect(table().getByText('2026-11-06까지')).toBeInTheDocument()
    expect(screen.getByText('조건에 맞는 셀러 4곳')).toBeInTheDocument()

    // 서버가 셀 수 없는 값이라 칸 자체가 없어야 한다(users에 접속 칼럼이 없고 신고 대상에 셀러가 없다).
    expect(screen.queryByText('최근 접속')).toBeNull()
    expect(screen.queryByText(/누적 신고/)).toBeNull()

    // 어드민 경로는 어드민 오리진으로만 나간다 — api 오리진으로 새면 배포에서 CORS로 막힌다.
    expect(requests.length).toBeGreaterThan(0)
    for (const entry of requests) expect(entry).toContain(ADMIN_ORIGIN)
  })

  /**
   * 필터가 서버 쿼리로 나가고 미선택 축은 키째 빠진다.
   *
   * `withdrawal-requested`는 **하이픈이 있어** 서버의 대소문자 무시 비교로도 어느 상태와도 맞지
   * 않는다 — 매퍼를 빼면 조건 없음으로 보정돼 전체가 돌아온다. 화면 값과 서버 값이 우연히 같아
   * 보이는 다른 넷(`active` 등)과 달리 이 값이 매퍼의 존재를 증명한다.
   */
  it('[AC-SELLER-MGMT-002] 상태·유형·상호명이 서버 쿼리로 나가고 미선택 축은 키째 빠진다', async () => {
    const queries = recordListQueries()
    const user = userEvent.setup()
    renderAt('/sellers')
    expect(await screen.findByRole('button', { name: '멍멍마켓' })).toBeInTheDocument()

    // 처음 조회는 조건이 없다 — 'all'을 소문자로 실어 보내면 서버가 조용히 전체로 보정한다.
    expect(queries[0]).toBe('none|none|none|0|20')

    await chooseOption('영업 상태 필터', '퇴점 신청')
    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(screen.getByRole('button', { name: '하늘펫샵' })).toBeInTheDocument()
    expect(queries.at(-1)).toBe('WITHDRAWAL_REQUESTED|none|none|0|20')

    await chooseOption('영업 상태 필터', '판매정지')
    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(queries.at(-1)).toBe('SUSPENDED|none|none|0|20')

    await chooseOption('영업 상태 필터', '영업 상태 전체')
    await chooseOption('판매자 유형 필터', '사업자')
    // BUSINESS는 개인 사업자 + 법인 사업자 둘을 묶는다(세 유형과 1:1이 아니다).
    await waitFor(() => expect(bodyRowCount()).toBe(2))
    expect(queries.at(-1)).toBe('none|BUSINESS|none|0|20')

    await user.type(screen.getByPlaceholderText('셀러명 검색'), '야옹')
    await waitFor(() => expect(queries.at(-1)).toBe('none|BUSINESS|야옹|0|20'))
    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(screen.getByRole('button', { name: '야옹상점' })).toBeInTheDocument()
  })

  /**
   * 유형을 고르면 신청서가 없는 셀러가 **어느 쪽으로도 세지지 않아 빠진다** — 서버가 유형을
   * 모르는 셀러를 두 축 어디에도 넣지 않기 때문이고, 화면이 그 사실을 적어야 한다.
   */
  it('[AC-SELLER-MGMT-003] 유형을 고르면 유형 미확인 셀러가 빠지고 그 사실을 적는다', async () => {
    renderAt('/sellers')
    expect(await screen.findByRole('button', { name: '초코집사네' })).toBeInTheDocument()
    expect(screen.queryByText(/유형을 모르는 셀러는 유형을 고르면 목록에서 빠져요/)).toBeNull()

    await chooseOption('판매자 유형 필터', '개인')

    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(screen.getByRole('button', { name: '하늘펫샵' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '초코집사네' })).toBeNull()
    expect(
      screen.getByText(/입점 신청서가 없어 유형을 모르는 셀러는 유형을 고르면 목록에서 빠져요/),
    ).toBeInTheDocument()
  })

  it('[AC-SELLER-MGMT-004] 페이지 이동은 서버 page 파라미터로 나간다', async () => {
    const queries = recordListQueries()
    seedAdminSellers(manySellers(21))
    const user = userEvent.setup()
    renderAt('/sellers')

    expect(await screen.findByRole('button', { name: '셀러 21' })).toBeInTheDocument()
    expect(bodyRowCount()).toBe(20)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /다음/ }))

    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(queries.at(-1)).toBe('none|none|none|1|20')
    expect(screen.getByRole('button', { name: '셀러 1' })).toBeInTheDocument()
  })

  /**
   * 상세는 따로 조회한다.
   *
   * 현재 정지 사유·내부 메모·제재 이력은 **목록 summary에 없는 값**이라, 보인다는 것 자체가
   * 상세를 받았다는 증거다 — 목록 행으로 드로어를 채우면 이 셋이 비거나 지어낸 값이 된다.
   */
  it('[AC-SELLER-MGMT-005] 상세는 따로 조회되고 목록에 없는 값을 그린다', async () => {
    const requests = recordSellerRequests()
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '야옹상점' }))
    const open = await drawer()

    expect(await open.findByText(야옹상점.suspensionReason!)).toBeInTheDocument()
    expect(open.getByText('제재 이력 / 1건')).toBeInTheDocument()
    // 이력 행은 화면 라벨 + 상세 사유를 한 줄로 합친다.
    expect(open.getByText(/신고 누적 \/ 같은 상품에 신고가 반복됐어요/)).toBeInTheDocument()
    expect(open.getByRole('textbox', { name: '내부 메모' })).toHaveValue(야옹상점.internalMemo!)
    expect(requests).toContain(`GET ${ADMIN_SELLERS_URL}/2033`)
  })

  /**
   * 판매정지 본문의 모양.
   *
   * 빈 값은 **키째 빠져야** 한다 — 제재에 딸린 `memo`는 비어 있지 않을 때만 현재 메모를
   * 덮어쓰는 값이라, 빈 문자열을 실어 보내면 서버 판정은 같아도 "메모를 지우는 경로는 메모
   * 저장뿐"이라는 계약이 본문에서 무너진다.
   */
  it('[AC-SELLER-MGMT-006] 판매정지는 사유·기간을 본문에 싣고 비운 값은 키째 뺀다', async () => {
    const requests = recordSellerRequests()
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '초코집사네' }))
    let open = await drawer()
    await open.findByText('제재 이력 / 0건')
    // 사유가 비면 서버가 받지 않는 요청이라 버튼이 먼저 잠겨 있어야 한다.
    expect(open.getByRole('button', { name: '판매정지' })).toBeDisabled()

    await chooseOption('판매정지 사유', '신고 누적')
    await chooseOption('정지 기간', '7일')
    open = await drawer()
    await user.click(open.getByRole('button', { name: '판매정지' }))

    const confirm = await screen.findByRole('dialog', { name: '판매를 정지할까요?' })
    expect(within(confirm).getByText('초코집사네 (1008)')).toBeInTheDocument()
    expect(within(confirm).getByText('7일')).toBeInTheDocument()
    // 서버에 만료 처리가 없다 — "기간이 지나면 자동으로 풀려요"는 거짓이다.
    expect(within(confirm).getByText(/정지 기간이 지나도 자동으로 풀리지 않아/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '판매정지' }))

    const toast = await screen.findByText('판매정지 처리했어요.')
    // 성공은 상태 역할이다 — variant를 error/warning으로 되돌리면 `role="alert"`가 된다.
    expect(toast.closest('[role="status"]')).not.toBeNull()
    expect(toast.closest('[role="alert"]')).toBeNull()

    expect(writesOnly(requests)).toEqual([`POST ${ADMIN_SELLERS_URL}/1008/suspensions`])
    expect(lastAdminSellerWrite()?.body).toEqual({ reasonCode: 'REPEATED_REPORT', durationDays: 7 })
    const saved = currentAdminSeller(1008)
    expect(saved?.status).toBe('SUSPENDED')
    expect(saved?.suspensionUntil).toBe('2026-11-12T09:00:00')
    // 메모를 비운 채 정지했으니 기존 메모(없음)가 그대로여야 한다.
    expect(saved?.internalMemo).toBeNull()
    // 처리가 끝나면 드로어를 닫는다 — 같은 버튼이 두 번 눌리는 자리를 남기지 않는다.
    await waitFor(() => expect(drawerBodyGone()).toBe(true))
  })

  /** 무기한은 "기간 미선택"이 아니라 하나의 선택이다 — `durationDays`를 보내지 않는 것으로 말한다. */
  it('[AC-SELLER-MGMT-007] 무기한 정지는 기간 키를 보내지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '초코집사네' }))
    const open = await drawer()
    await open.findByText('제재 이력 / 0건')
    // 기본값이 무기한이다(빈 문자열이면 DS Select가 placeholder 색으로 그려 미선택처럼 보인다).
    expect(combo('정지 기간')).toHaveValue('indefinite')
    expect(open.getByText(/기간이 지나도 자동으로 풀리지 않아요/)).toBeInTheDocument()

    await chooseOption('판매정지 사유', '상품 정보 허위 기재')
    await user.click((await drawer()).getByRole('button', { name: '판매정지' }))
    const confirm = await screen.findByRole('dialog', { name: '판매를 정지할까요?' })
    expect(within(confirm).getByText('무기한')).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '판매정지' }))

    expect(await screen.findByText('판매정지 처리했어요.')).toBeInTheDocument()
    expect(lastAdminSellerWrite()?.body).toEqual({ reasonCode: 'FALSE_PRODUCT_INFO' })
    expect(currentAdminSeller(1008)?.suspensionUntil).toBeNull()
  })

  /** `OTHER`는 상세 사유가 없으면 400(10010)이다 — 요청을 만들기 전에 막는다. */
  it('[AC-SELLER-MGMT-008] 기타 사유는 상세 사유 없이 요청을 내보내지 않는다', async () => {
    const requests = recordSellerRequests()
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '초코집사네' }))
    let open = await drawer()
    await open.findByText('제재 이력 / 0건')
    // 기타가 아니면 상세 사유 칸 자체가 없다(서버가 요구하지 않는 입력을 세우지 않는다).
    expect(open.queryByRole('textbox', { name: '상세 사유' })).toBeNull()

    await chooseOption('판매정지 사유', '기타 (상세 사유 필수)')
    open = await drawer()
    expect(open.getByRole('button', { name: '판매정지' })).toBeDisabled()

    await user.type(open.getByRole('textbox', { name: '상세 사유' }), '동일 사유 경고를 세 번 보냈어요.')
    open = await drawer()
    expect(open.getByRole('button', { name: '판매정지' })).toBeEnabled()
    // 버튼이 잠긴 동안 쓰기가 한 건도 나가지 않았다.
    expect(writesOnly(requests)).toEqual([])

    await user.click(open.getByRole('button', { name: '판매정지' }))
    const confirm = await screen.findByRole('dialog', { name: '판매를 정지할까요?' })
    await user.click(within(confirm).getByRole('button', { name: '판매정지' }))

    expect(await screen.findByText('판매정지 처리했어요.')).toBeInTheDocument()
    expect(lastAdminSellerWrite()?.body).toEqual({
      reasonCode: 'OTHER',
      reasonDetail: '동일 사유 경고를 세 번 보냈어요.',
    })
  })

  /**
   * 정지 중인 셀러에는 정지가 아니라 **해제**가 걸린다 — 두 조치를 한 버튼으로 모으므로,
   * 상태를 잘못 읽으면 운영자가 409로만 끝나는 버튼을 누른다.
   */
  it('[AC-SELLER-MGMT-009] 판매정지 해제는 정지 직전 상태로 되돌리고 해제 행을 남긴다', async () => {
    const requests = recordSellerRequests()
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '야옹상점' }))
    let open = await drawer()
    await open.findByText(야옹상점.suspensionReason!)
    // 정지 중이라 정지 버튼은 없다(이미 정지면 409/10007이다).
    expect(open.queryByRole('button', { name: '판매정지' })).toBeNull()
    // 사유 어휘가 없는 조치라 고정 어휘 Select를 세우지 않는다.
    expect(screen.queryByRole('combobox', { name: '판매정지 사유' })).toBeNull()

    await user.type(open.getByRole('textbox', { name: '해제 사유' }), '점검 결과 문제 없었어요.')
    open = await drawer()
    await user.click(open.getByRole('button', { name: '정지 해제' }))
    const confirm = await screen.findByRole('dialog', { name: '판매정지를 해제할까요?' })
    await user.click(within(confirm).getByRole('button', { name: '정지 해제' }))

    expect(await screen.findByText('정지 해제 처리했어요.')).toBeInTheDocument()
    expect(writesOnly(requests)).toEqual([
      `POST ${ADMIN_SELLERS_URL}/2033/suspensions/release`,
    ])
    // 드로어가 들고 있던 현재 메모가 그대로 함께 간다(비어 있지 않을 때만 덮어쓰는 값이다).
    expect(lastAdminSellerWrite()?.body).toEqual({
      reasonDetail: '점검 결과 문제 없었어요.',
      memo: '해제 전 상품 전수 점검 필요.',
    })
    const saved = currentAdminSeller(2033)
    // ACTIVE로 고정하지 않는다 — 정지 직전 상태로 되돌리는 전이다.
    expect(saved?.status).toBe('ACTIVE')
    expect(saved?.suspensionReason).toBeNull()
    expect(saved?.suspensionUntil).toBeNull()
    // 이력은 추가 전용이라 해제도 한 행으로 쌓인다(UPDATE가 아니다).
    expect(saved?.sanctions).toHaveLength(2)
    expect(saved?.sanctions.at(-1)?.action).toBe('RELEASE')
    expect(saved?.sanctions.at(-1)?.reasonCode).toBeNull()
  })

  it('[AC-SELLER-MGMT-010] 퇴점 신청 셀러에는 조치 버튼을 세우지 않고 메모만 남긴다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '하늘펫샵' }))
    const open = await drawer()
    await open.findByText('제재 이력 / 0건')

    expect(open.queryByRole('button', { name: '판매정지' })).toBeNull()
    expect(open.queryByRole('button', { name: '정지 해제' })).toBeNull()
    expect(open.getByText('상태를 바꿀 수 없는 셀러예요')).toBeInTheDocument()
    // 메모는 상태 게이트가 없는 경로다 — 함께 잠그면 운영자가 인수인계를 적을 자리를 잃는다.
    expect(open.getByRole('button', { name: '메모 저장' })).toBeEnabled()
  })

  /**
   * 409는 "화면이 낡았다"는 신호다.
   *
   * 공용 `useDetailList`를 그대로 쓰면 무효화 후 재조회로 선택이 사라져 드로어가 닫히고, 운영자는
   * 안내만 보고 **바뀐 상태를 그 자리에서 볼 수 없다** — 그래서 선택 상태를 화면이 들고 있다.
   */
  it('[AC-SELLER-MGMT-011] 이미 정지된 셀러면 안내를 띄운 채 바뀐 상태를 그 자리에서 보여 준다', async () => {
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '멍멍마켓' }))
    let open = await drawer()
    await open.findByText('제재 이력 / 0건')
    await chooseOption('판매정지 사유', '신고 누적')

    // 확인 창을 열어 둔 사이 다른 운영자가 먼저 정지한 상태 — 서버가 409(10007)로 끊는다.
    seedAdminSellers([
      { ...멍멍마켓, status: 'SUSPENDED', previousStatus: 'ACTIVE', suspensionUntil: null },
      야옹상점,
      하늘펫샵,
      초코집사네,
    ])

    await user.click((await drawer()).getByRole('button', { name: '판매정지' }))
    const confirm = await screen.findByRole('dialog', { name: '판매를 정지할까요?' })
    await user.click(within(confirm).getByRole('button', { name: '판매정지' }))

    const toast = await screen.findByText('이미 판매정지된 셀러예요. 목록을 다시 불러왔어요.')
    // 실패는 경보 역할이다 — 성공과 같은 역할로 묶으면 놓친다.
    expect(toast.closest('[role="alert"]')).not.toBeNull()

    // 드로어가 열려 있고, 재조회가 가져온 새 상태에 맞는 조치로 바뀐다.
    open = await drawer()
    await waitFor(() =>
      expect(open.getByRole('button', { name: '정지 해제' })).toBeInTheDocument(),
    )
    expect(open.queryByRole('button', { name: '판매정지' })).toBeNull()
  })

  /** 메모 저장은 덮어쓰기다 — **공백이면 지운다**(제재에 딸린 memo와 규칙이 반대다). */
  it('[AC-SELLER-MGMT-012] 메모 저장은 PUT으로 나가고 비우면 메모를 지운다', async () => {
    const requests = recordSellerRequests()
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '멍멍마켓' }))
    let open = await drawer()
    const memoBox = await open.findByRole('textbox', { name: '내부 메모' })
    expect(memoBox).toHaveValue(멍멍마켓.internalMemo!)

    await user.clear(memoBox)
    await user.click((await drawer()).getByRole('button', { name: '메모 저장' }))

    expect(await screen.findByText('메모를 지웠어요.')).toBeInTheDocument()
    expect(writesOnly(requests)).toEqual([`PUT ${ADMIN_SELLERS_URL}/2041/memo`])
    expect(lastAdminSellerWrite()?.body).toEqual({ memo: '' })
    expect(currentAdminSeller(2041)?.internalMemo).toBeNull()
    // 메모 저장은 제재 이력 행을 남기지 않는다(감사 로그만 받는다).
    expect(currentAdminSeller(2041)?.sanctions).toHaveLength(0)
    // 메모 저장은 조치가 아니라 드로어를 닫지 않는다 — 이어서 적을 수 있어야 한다.
    open = await drawer()
    await user.type(open.getByRole('textbox', { name: '내부 메모' }), '전수 점검 완료.')
    await user.click((await drawer()).getByRole('button', { name: '메모 저장' }))

    expect(await screen.findByText('메모를 저장했어요.')).toBeInTheDocument()
    expect(currentAdminSeller(2041)?.internalMemo).toBe('전수 점검 완료.')
  })

  it('[AC-SELLER-MGMT-013] 목록 조회가 403이면 빈 상태가 아니라 권한 문제를 드러내고 건수를 줄표로 쓴다', async () => {
    server.use(
      http.get(ADMIN_SELLERS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/sellers')

    expect(await screen.findByText(/어드민 권한이 없어 셀러 목록을 볼 수 없어요/)).toBeInTheDocument()
    // 0곳을 그리면 "조건에 맞는 셀러가 없다"로 읽힌다 — 조회 실패는 0이 아니라 줄표다.
    expect(screen.getByText('조건에 맞는 셀러 —')).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 셀러 0곳')).toBeNull()
    expect(screen.getByText('목록을 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 셀러가 없어요.')).toBeNull()
  })

  /**
   * 재조회가 실패해도 react-query는 **직전 데이터를 돌려준다.**
   *
   * 그 낡은 행으로 확인 창을 만들면 운영자가 서버에 없는 상태를 보고 되돌릴 수 없는 전이를
   * 지시한다 — 그래서 조회가 실패한 동안에는 그 데이터로 하는 쓰기를 잠근다. 상세를 **여는**
   * 읽기 버튼은 예외다(잠그면 무엇이 틀렸는지 볼 수조차 없다).
   */
  it('[AC-SELLER-MGMT-014] 조회가 실패한 동안 그 데이터로 하는 쓰기를 잠그고 읽기는 남긴다', async () => {
    const requests = recordSellerRequests()
    const user = userEvent.setup()
    const { queryClient } = renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '야옹상점' }))
    let open = await drawer()
    await open.findByText(야옹상점.suspensionReason!)
    expect(open.getByRole('button', { name: '정지 해제' })).toBeEnabled()

    server.use(
      http.get(ADMIN_SELLERS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries()
    })

    // 행과 상세는 캐시로 그대로 보이는데도 조치는 잠겨 있어야 한다.
    open = await drawer()
    expect(await open.findByText(야옹상점.suspensionReason!)).toBeInTheDocument()
    expect(open.getByRole('button', { name: '정지 해제' })).toBeDisabled()
    expect(open.getByRole('button', { name: '메모 저장' })).toBeDisabled()
    // 읽기 버튼은 잠그지 않는다 — 다른 셀러의 상세를 열어 무엇이 틀렸는지 볼 수 있어야 한다.
    expect(screen.getByRole('button', { name: '멍멍마켓' })).toBeEnabled()
    expect(writesOnly(requests)).toEqual([])
  })

  /**
   * 되돌릴 수 없는 처리가 떠 있는 동안에는 **창 닫기와 화면 이탈을 함께** 잠근다.
   *
   * 닫기 가드는 `Drawer`·`Modal`의 `onClose`만 막고 라우트 이탈은 지나간다 — 나가면 화면이
   * 언마운트돼 react-query가 호출별 콜백을 실행하지 않아(`MutationObserver`가 `hasListeners`로
   * 가둔다) 정지는 서버에 들어가는데 운영자는 결과를 못 본 채 다른 화면에 있게 된다.
   */
  it('[AC-SELLER-MGMT-015] 요청이 떠 있는 동안 확인 창 닫기와 화면 이탈을 함께 잠근다', async () => {
    const release = gateSuspend()
    const user = userEvent.setup()
    const { router } = renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '초코집사네' }))
    const open = await drawer()
    await open.findByText('제재 이력 / 0건')
    await chooseOption('판매정지 사유', '신고 누적')
    await user.click((await drawer()).getByRole('button', { name: '판매정지' }))
    const confirm = await screen.findByRole('dialog', { name: '판매를 정지할까요?' })
    await user.click(within(confirm).getByRole('button', { name: '판매정지' }))
    // loading이면 확인 버튼의 접근명이 스피너(aria-hidden)뿐이라 빈 이름이 된다.
    await waitFor(() => expect(within(confirm).getByRole('button', { name: '' })).toBeDisabled())

    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: '판매를 정지할까요?' })).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '취소' }))
    expect(screen.getByRole('dialog', { name: '판매를 정지할까요?' })).toBeInTheDocument()
    // 스크림은 접근 이름이 없다(aria-hidden) — 패널 바깥의 그 노드를 직접 누른다.
    const scrim = confirm.querySelector('[aria-hidden="true"]')
    if (!scrim) throw new Error('확인 Modal에 스크림이 없다')
    await user.click(scrim)
    expect(screen.getByRole('dialog', { name: '판매를 정지할까요?' })).toBeInTheDocument()

    // 막힌 이동의 약속은 다음 성공한 이동까지 매달려 있으므로(router commitLocation) await하지 않는다.
    await act(async () => {
      void router.navigate({ to: '/audit-log' })
      await Promise.resolve()
    })
    expect(router.state.location.pathname).toBe('/sellers')

    release()
    expect(await screen.findByText(/요청을 처리하지 못했어요/)).toBeInTheDocument()
    // 실패한 요청은 셀러를 정지시키지 않는다.
    expect(currentAdminSeller(1008)?.status).toBe('ACTIVE')

    // 처리가 끝나면 가드가 풀린다 — 운영자를 화면에 묶어 두지 않는다.
    await act(async () => {
      void router.navigate({ to: '/audit-log' })
      await Promise.resolve()
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/audit-log'))
  })

  /** 실연동 화면에는 예시 데이터 띠를 붙이지 않는다 — 남기면 실데이터를 예시로 의심하게 만든다. */
  it('[AC-SELLER-MGMT-016] 실연동된 화면이라 예시 데이터 띠를 달지 않는다', async () => {
    renderAt('/sellers')

    expect(await screen.findByRole('button', { name: '멍멍마켓' })).toBeInTheDocument()
    expect(screen.queryByText('예시 데이터예요')).toBeNull()
    expect(screen.queryByText(/저장되지 않아요/)).toBeNull()
  })
})

function manySellers(count: number): AdminSellerWire[] {
  return Array.from({ length: count }, (_, index) =>
    makeAdminSellerWire({
      sellerId: 3000 + index,
      storeName: `셀러 ${index + 1}`,
      statusChangedAt: '2026-10-01T09:00:00',
    }),
  )
}
