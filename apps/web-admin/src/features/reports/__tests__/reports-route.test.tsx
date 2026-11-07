import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_REPORTS_URL,
  currentAdminReport,
  lastAdminReportSanction,
  makeAdminReportWire,
  seedAdminApplications,
  seedAdminReports,
  server,
  type AdminReportWire,
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

const 상품신고 = makeAdminReportWire({
  targetType: 'PRODUCT',
  reportId: 31,
  targetKey: '01HZXP0000000000000000031',
  targetName: '프리미엄 관절 영양제 180정',
  targetOwnerUserId: 2041,
  targetOwnerNickname: '멍멍마켓',
  reasonCode: 'FALSE_AD',
  reportCount: 7,
  reportedAt: '2026-10-26T09:12:00',
  status: 'RECEIVED',
  reporterId: 5102,
  reasonText: '임상으로 입증됐다고 적혀 있는데 근거 자료가 상세페이지에 없어요.',
  history: [
    {
      reportId: 31,
      reasonCode: 'FALSE_AD',
      reasonText: '근거 자료가 없어요.',
      reportedAt: '2026-10-26T09:12:00',
      status: 'RECEIVED',
    },
    {
      reportId: 27,
      reasonCode: 'INFO_ERROR',
      reasonText: null,
      reportedAt: '2026-10-21T11:00:00',
      status: 'DISMISSED',
    },
  ],
})

/**
 * **상품 신고와 번호가 같다.**
 *
 * 세 신고 표가 각자 AUTO_INCREMENT라 번호만으로는 행이 갈리지 않는다 — 화면이 `reportId`만
 * 키로 쓰거나 경로에서 `targetType`을 빼면 이 두 행이 한 행으로 뭉개지거나 엉뚱한 상세를 연다.
 */
const 리뷰신고 = makeAdminReportWire({
  targetType: 'REVIEW',
  reportId: 31,
  targetKey: '884',
  targetName: '사료 바꾸고 애가 아팠어요 (별 1개)',
  targetOwnerUserId: 3300,
  targetOwnerNickname: '초코집사',
  reasonCode: 'ABUSE',
  reportCount: 4,
  reportedAt: '2026-10-25T21:40:00',
  status: 'RECEIVED',
  reporterId: 5110,
  reasonText: '리뷰 본문에 셀러 대표 이름과 함께 욕설이 적혀 있어요.',
  history: [
    {
      reportId: 31,
      reasonCode: 'ABUSE',
      reasonText: '욕설이 있어요.',
      reportedAt: '2026-10-25T21:40:00',
      status: 'RECEIVED',
    },
  ],
})

/** 사용자 신고에는 `targetName`이 없다(닉네임이 그 자리를 대신한다). 사유도 접수 전용 `SPAM`이다. */
const 사용자신고 = makeAdminReportWire({
  targetType: 'USER',
  reportId: 12,
  targetKey: '4120',
  targetName: null,
  targetOwnerUserId: 4120,
  targetOwnerNickname: '먼지아빠',
  reasonCode: 'SPAM',
  reportCount: 5,
  reportedAt: '2026-10-23T11:48:00',
  status: 'RECEIVED',
  reporterId: 5133,
  reasonText: '같은 셀러를 상대로 사유를 바꿔 가며 신고를 반복해요.',
  history: [
    {
      reportId: 12,
      reasonCode: 'SPAM',
      reasonText: null,
      reportedAt: '2026-10-23T11:48:00',
      status: 'RECEIVED',
    },
  ],
})

/** 이미 처리된 신고 — 재처리는 409(140001)라 제출 입구가 없어야 한다. */
const 처리완료신고 = makeAdminReportWire({
  targetType: 'PRODUCT',
  reportId: 29,
  targetKey: '01HZXP0000000000000000029',
  targetName: '수제 오리목뼈 간식 500g',
  targetOwnerUserId: 2088,
  targetOwnerNickname: '냥이상점',
  reasonCode: 'INFO_ERROR',
  reportCount: 1,
  reportedAt: '2026-10-22T08:30:00',
  status: 'DISMISSED',
  reporterId: 5140,
  reasonText: '원산지가 다르게 적혀 있어요.',
  history: [],
  decisionRecord: {
    decision: 'DISMISS',
    reasonCode: 'NOT_CONFIRMED',
    reasonDetail: null,
    noticeToOwner: '신고 내용이 확인되지 않아 조치 없이 종결했어요.',
    internalMemo: '수입 신고서 사본 확인 완료.',
    targetOwnerUserId: 2088,
    actedByAdminId: 9001,
    decidedAt: '2026-10-22T14:00:00',
  },
})

const table = () => within(screen.getByRole('table'))
const bodyRowCount = () => table().getAllByRole('row').length - 1
const drawer = async () => within(await screen.findByRole('dialog', { name: '신고 상세' }))

/**
 * 결정 라디오는 caption 글자로 누른다 — 라벨 글자('제재 없음')는 처리 상태 pill의 라벨과 **같아서**
 * 무엇을 눌렀는지 말할 수 없다.
 */
async function chooseByCaption(caption: string) {
  const open = await drawer()
  await userEvent.setup().click(open.getByText(caption))
}

/** 드로어의 `<select>`는 접근성 이름이 없다(앞의 DetailField가 맥락을 준다) — 옵션 이름으로 집는다. */
function selectWithOption(optionName: string): HTMLElement {
  const found = screen
    .getAllByRole('combobox')
    .find(element => within(element).queryByRole('option', { name: optionName }))
  if (!found) throw new Error(`"${optionName}" 옵션을 가진 select를 찾지 못했다`)
  return found
}

const chooseOption = (select: HTMLElement, optionName: string) =>
  userEvent.setup().selectOptions(select, within(select).getByRole('option', { name: optionName }))

const optionNames = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map(option => option.textContent)

/** 목록 조회로 나간 쿼리 — 필터가 **서버로** 나가는지는 이것으로만 말할 수 있다. */
function recordListQueries(): string[] {
  const queries: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (request.method !== 'GET' || !url.pathname.endsWith('/admin/reports')) return
    queries.push(
      [
        url.searchParams.get('targetType') ?? 'none',
        url.searchParams.get('status') ?? 'none',
        url.searchParams.get('cursor') == null ? 'none' : 'cursor',
      ].join('|'),
    )
  })
  return queries
}

/** 신고 경로로 나간 요청 — 메서드와 경로만 남겨 `targetType`이 실렸는지 본다. */
function recordReportRequests(): string[] {
  const entries: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (!url.pathname.includes('/admin/reports')) return
    entries.push(`${request.method} ${url.pathname.replace('/api/v1', '')}`)
  })
  return entries
}

const writesOnly = (entries: readonly string[]) => entries.filter(entry => !entry.startsWith('GET '))

describe('/reports', () => {
  beforeEach(() => {
    // 셸이 nav 배지를 채우려 심사 대기 수를 조회한다 — 핸들러가 없으면 MSW가 테스트를 깨뜨린다.
    seedAdminApplications()
    seedAdminReports([상품신고, 리뷰신고, 사용자신고, 처리완료신고])
  })

  /**
   * 미처리 신고의 상태가 `RECEIVED`라 **대부분의 행이 그 값**이다.
   *
   * 목 시절 메타 표에는 소문자 `sanctioned`·`dismissed` 둘뿐이어서, 그대로 실연동하면 거의 모든
   * 행이 라벨을 잃는다(`metaOf`가 없으면 그 자리가 `StatusMetaPill`의 구조분해라 표가 통째로
   * 사라진다). 라벨이 있는지와 **와이어 원문이 그대로 찍히지 않는지**를 함께 본다.
   */
  it('[AC-ADMIN-REPORT-001] 목록은 미처리 신고의 상태를 라벨로 그리고 누적 신고 수를 서버 값으로 적는다', async () => {
    renderAt('/reports')

    expect(await screen.findByRole('button', { name: 상품신고.targetName! })).toBeInTheDocument()
    expect(bodyRowCount()).toBe(4)
    expect(table().getAllByText('접수')).toHaveLength(3)
    expect(table().queryByText('RECEIVED')).toBeNull()
    // 누적 신고는 서버가 세 준다 — 화면이 이력 길이로 대신 세면 2건으로 적힌다.
    expect(table().getByText('7건')).toBeInTheDocument()
    expect(screen.getByText('조건에 맞는 신고 4건')).toBeInTheDocument()
    // 사용자 신고에는 대상 이름이 없다 — 빈 칸이 아니라 닉네임으로 읽혀야 한다.
    expect(screen.getByRole('button', { name: '먼지아빠' })).toBeInTheDocument()
  })

  it('[AC-ADMIN-REPORT-001] 상태·대상 필터가 서버 쿼리로 나가고 미선택 축은 키째 빠진다', async () => {
    const queries = recordListQueries()
    renderAt('/reports')
    expect(await screen.findByRole('button', { name: 상품신고.targetName! })).toBeInTheDocument()

    // 메모리 필터가 남아 있으면 불러온 쪽 안에서만 걸러지고 운영자는 걸러진 전체를 봤다고 읽는다.
    await chooseOption(selectWithOption('처리 상태 전체'), '제재 없음')
    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(screen.getByRole('button', { name: 처리완료신고.targetName! })).toBeInTheDocument()

    await chooseOption(selectWithOption('신고 대상 전체'), '리뷰')
    await screen.findByText('조건에 맞는 신고가 없어요.')

    expect(queries[0]).toBe('none|none|none')
    expect(queries.at(-1)).toBe('REVIEW|DISMISSED|none')
  })

  /**
   * 접수 사유와 처리 사유는 **다른 어휘**다.
   *
   * `FALSE_AD`·`ABUSE`·`ILLEGAL` 셋이 양쪽에 다 있어서 한 표로 다루면 섞어 써도 라벨이 나오고
   * 그래서 조용히 틀린다. 그 자리를 잡으려면 **한쪽에만 있는 값**으로 봐야 한다 — 접수 전용
   * `SPAM`('스팸/도배')은 처리 선택지에 올라가서는 안 되고(서버가 받지 않는다), 처리 전용
   * `EXTERNAL_TRADE`·`NOT_CONFIRMED`는 선택지에 있어야 한다.
   */
  it('[AC-ADMIN-REPORT-002] 접수 사유와 처리 사유를 한 표로 섞지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/reports')

    // 목록의 '신고 사유' 칸은 접수 어휘다 — 처리 어휘로 그리면 이 값이 원문으로 떨어진다.
    expect(await screen.findByRole('button', { name: '먼지아빠' })).toBeInTheDocument()
    expect(table().getByText('스팸/도배')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '먼지아빠' }))
    await drawer()
    const reasonSelect = selectWithOption('외부 거래 유도')
    expect(optionNames(reasonSelect)).toEqual([
      '허위/과장 광고',
      '욕설/비방',
      '외부 거래 유도',
      '불법/미취급 상품',
      '허위 신고 반복',
      '신고 내용 확인 불가',
    ])
    expect(within(reasonSelect).queryByRole('option', { name: '스팸/도배' })).toBeNull()
  })

  /**
   * 상세는 따로 조회하고 경로에 `targetType`이 실린다.
   *
   * 번호가 같은 두 행(상품 31 · 리뷰 31)을 각각 열어 **다른 상세**가 오는지 본다 — 경로에서
   * 종류를 빼면 둘이 같은 신고를 열고, 운영자는 엉뚱한 신고에 제재를 건다.
   */
  it('[AC-ADMIN-REPORT-003] 상세는 종류+번호로 따로 조회되고 목록에 없는 값을 그린다', async () => {
    const requests = recordReportRequests()
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 상품신고.targetName! }))
    let open = await drawer()
    // 신고 내용·이력·신고자는 목록이 주지 않는 값이라, 보인다는 것 자체가 상세를 받았다는 증거다.
    expect(await open.findByText(상품신고.reasonText!)).toBeInTheDocument()
    expect(open.getByText('신고 이력 / 2건')).toBeInTheDocument()
    expect(open.getByText('회원 5102')).toBeInTheDocument()
    expect(open.getByText(/PRODUCT\/31/)).toBeInTheDocument()
    expect(requests).toContain('GET /admin/reports/PRODUCT/31')

    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 리뷰신고.targetName! }))
    open = await drawer()
    expect(await open.findByText(리뷰신고.reasonText!)).toBeInTheDocument()
    expect(open.getByText(/REVIEW\/31/)).toBeInTheDocument()
    expect(requests).toContain('GET /admin/reports/REVIEW/31')
  })

  /**
   * 비공개 전환은 **리뷰에서만** 받는다.
   *
   * 사용자는 숨길 콘텐츠가 아니고 상품은 노출을 되돌릴 수단이 없어, 서버가 400(140002)으로
   * 끊는다 — 선택지로 두면 운영자가 못 쓰는 결정을 고르고 그 자리에서 실패한다.
   */
  it('[AC-ADMIN-REPORT-004] 리뷰가 아닌 신고에서는 비공개 전환을 고를 수 없다', async () => {
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: '먼지아빠' }))
    let open = await drawer()
    await open.findByText(사용자신고.reasonText!)
    expect(open.getByText('리뷰와 SNS 게시물, 댓글 신고에만 걸 수 있어요')).toBeInTheDocument()
    expect(open.getAllByRole('radio')[1]).toBeDisabled()

    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 리뷰신고.targetName! }))
    open = await drawer()
    await open.findByText(리뷰신고.reasonText!)
    expect(open.getAllByRole('radio')[1]).toBeEnabled()
  })

  it('[AC-ADMIN-REPORT-004] 리뷰 신고의 비공개 전환은 제재 없이 그대로 나간다', async () => {
    const requests = recordReportRequests()
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 리뷰신고.targetName! }))
    const open = await drawer()
    await open.findByText(리뷰신고.reasonText!)
    await chooseByCaption('대상만 비노출')
    await chooseOption(selectWithOption('욕설/비방'), '욕설/비방')
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = await screen.findByRole('dialog', { name: '대상을 비공개로 전환할까요?' })
    await user.click(within(confirm).getByRole('button', { name: '비공개 전환' }))

    expect(await screen.findByText('비공개 전환 처리했어요.')).toBeInTheDocument()
    expect(writesOnly(requests)).toEqual(['POST /admin/reports/REVIEW/31/decision'])
    const saved = currentAdminReport('REVIEW', 31)
    expect(saved?.status).toBe('SANCTIONED')
    expect(saved?.decisionRecord?.decision).toBe('HIDE_TARGET')
    // 제재를 함께 보내면 서버가 400(140004)으로 끊는다 — 보내지 않았다는 증거다.
    expect(lastAdminReportSanction()).toBeNull()
  })

  /**
   * 종결 전용 사유 둘은 제재와 함께 보낼 수 없다.
   *
   * `NOT_CONFIRMED`·`FALSE_REPORT`는 "대상에게 위반이 없었다"는 판정이라 계정 제재와 같은 요청에
   * 실으면 400(140003·140004)이다 — 고른 뒤 결정을 바꾸는 경로까지 막아야 한다.
   */
  it('[AC-ADMIN-REPORT-005] 계정 제재에서는 종결 전용 사유가 선택지에서 빠진다', async () => {
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 상품신고.targetName! }))
    const open = await drawer()
    await open.findByText(상품신고.reasonText!)
    // 종결 쪽에서는 고를 수 있다.
    await chooseOption(selectWithOption('신고 내용 확인 불가'), '신고 내용 확인 불가')

    await chooseByCaption('대상자 계정에 제재')

    const reasonSelect = selectWithOption('외부 거래 유도')
    expect(within(reasonSelect).queryByRole('option', { name: '신고 내용 확인 불가' })).toBeNull()
    expect(within(reasonSelect).queryByRole('option', { name: '허위 신고 반복' })).toBeNull()
    // 고른 값이 그대로 남아 있으면 그 조합이 서버로 나간다 — 비워져야 한다.
    expect((reasonSelect as HTMLSelectElement).value).toBe('')
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADMIN-REPORT-006] 계정 제재는 조치와 사유, 임시 정지 기간을 함께 보낸다', async () => {
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 상품신고.targetName! }))
    const open = await drawer()
    await open.findByText(상품신고.reasonText!)
    await chooseByCaption('대상자 계정에 제재')
    await chooseOption(selectWithOption('외부 거래 유도'), '허위/과장 광고')
    // 제재 입력이 비면 서버가 400(140003)으로 끊는다 — 그 전에 버튼이 잠겨 있어야 한다.
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()

    await chooseOption(selectWithOption('임시 정지'), '임시 정지')
    await chooseOption(selectWithOption('리뷰 욕설/비방 반복'), '리뷰 욕설/비방 반복')
    // 기간 없는 임시 정지는 회원 제재 경로가 400(30801)으로 끊는다.
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()

    await chooseOption(selectWithOption('7일'), '7일')
    await user.type(open.getAllByRole('textbox')[0]!, '허위 광고가 확인돼 7일 정지했어요.')
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = await screen.findByRole('dialog', { name: '계정 제재까지 적용할까요?' })
    expect(within(confirm).getByText('임시 정지 / 7일')).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '계정 제재' }))

    expect(await screen.findByText('계정 제재 처리했어요.')).toBeInTheDocument()
    expect(lastAdminReportSanction()).toEqual({
      action: 'SUSPEND',
      reasonCode: 'ABUSIVE_REVIEW',
      durationDays: 7,
    })
    const saved = currentAdminReport('PRODUCT', 31)
    expect(saved?.status).toBe('SANCTIONED')
    expect(saved?.decisionRecord?.reasonCode).toBe('FALSE_AD')
    expect(saved?.decisionRecord?.noticeToOwner).toBe('허위 광고가 확인돼 7일 정지했어요.')
  })

  /** `OTHER`는 상세 사유가 있어야 받는다(회원 제재 경로의 400/30800과 같은 판정). */
  it('[AC-ADMIN-REPORT-006] 제재 사유가 기타면 상세 사유 없이는 제출할 수 없다', async () => {
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 상품신고.targetName! }))
    const open = await drawer()
    await open.findByText(상품신고.reasonText!)
    await chooseByCaption('대상자 계정에 제재')
    await chooseOption(selectWithOption('외부 거래 유도'), '허위/과장 광고')
    await chooseOption(selectWithOption('임시 정지'), '이용 제한')
    await chooseOption(selectWithOption('리뷰 욕설/비방 반복'), '기타 (상세 사유 필수)')
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()

    await user.type(open.getAllByRole('textbox')[0]!, '반복 위반 이력이 있어요.')
    expect(open.getByRole('button', { name: '제출' })).toBeEnabled()
    // 기간은 임시 정지에만 싣는다 — 다른 조치에서는 입력 자체가 없어야 한다(400/30802).
    expect(open.queryByText('제재 기간')).toBeNull()
  })

  it('[AC-ADMIN-REPORT-007] 이미 처리된 신고에는 제출 입구가 없고 내려진 결정을 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 처리완료신고.targetName! }))
    const open = await drawer()
    await open.findByText(처리완료신고.reasonText!)

    // 재처리는 409(140001)라 버튼을 남기면 운영자가 못 쓰는 버튼을 누른다.
    expect(open.queryByRole('button', { name: '제출' })).toBeNull()
    expect(open.queryByText('제재 결정')).toBeNull()
    expect(open.getByText('신고 내용 확인 불가')).toBeInTheDocument()
    expect(open.getByText(처리완료신고.decisionRecord!.noticeToOwner!)).toBeInTheDocument()
    expect(open.getByText(처리완료신고.decisionRecord!.internalMemo!)).toBeInTheDocument()
  })

  /**
   * 화면이 서버에 없는 통보를 말하지 않는다.
   *
   * 목 시절 종결 확인 Modal이 "신고자에게 처리 결과가 통보되고"라고 적었는데 그런 경로가 서버에
   * 없다. 요청에 있는 `noticeToOwner`는 **신고 대상자**에게 쓰는 기록이고 발송되지도 않는다.
   */
  it('[AC-ADMIN-REPORT-008] 신고자 통보와 안내 발송을 말하지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 상품신고.targetName! }))
    const open = await drawer()
    await open.findByText(상품신고.reasonText!)
    expect(open.getByText(/플랫폼에 알림 발송 경로가 없어 자동으로 전달되지는 않아요/)).toBeInTheDocument()

    await chooseOption(selectWithOption('외부 거래 유도'), '신고 내용 확인 불가')
    await user.click(open.getByRole('button', { name: '제출' }))

    const confirm = await screen.findByRole('dialog', { name: '제재 없이 종결할까요?' })
    expect(within(confirm).getByText(/신고자에게 가는 통보는 없어요/)).toBeInTheDocument()
    expect(screen.queryByText(/신고자에게 처리 결과가 통보/)).toBeNull()
  })

  /**
   * 필터가 쿼리 키에 있어야 커서 사슬이 새로 시작한다.
   *
   * 조건을 바꾼 채 옛 커서를 보내면 서버가 400(90002)으로 끊는다 — 키에서 필터를 빼면 조건이
   * 바뀌어도 react-query가 같은 캐시를 이어 써서 다음 `더 보기`가 옛 커서를 들고 나간다.
   */
  it('[AC-ADMIN-REPORT-009] 필터를 바꾸면 커서를 버리고 처음부터 다시 받는다', async () => {
    const queries = recordListQueries()
    seedAdminReports([...manyProductReports(21), 사용자신고])
    const user = userEvent.setup()
    renderAt('/reports')

    expect(await screen.findByRole('button', { name: '상품 신고 1' })).toBeInTheDocument()
    expect(bodyRowCount()).toBe(20)
    await user.click(screen.getByRole('button', { name: '더 보기' }))
    await waitFor(() => expect(bodyRowCount()).toBe(22))
    expect(queries.at(-1)).toBe('none|none|cursor')

    await chooseOption(selectWithOption('신고 대상 전체'), '회원')
    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(queries.at(-1)).toBe('USER|none|none')
    // 90002로 끊겼다면 목록이 빈 채로 에러 안내가 떠 있다.
    expect(screen.queryByText(/조회 조건을 서버가 받지 못했어요/)).toBeNull()
  })

  it('[AC-ADMIN-REPORT-009] 목록 조회가 403이면 빈 상태가 아니라 권한 문제를 드러낸다', async () => {
    server.use(
      http.get(ADMIN_REPORTS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/reports')

    expect(await screen.findByText(/어드민 권한이 없어 신고를 볼 수 없어요/)).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 신고가 없어요.')).toBeNull()
  })
})

/** SNS 게시물 신고. targetKey는 게시물 publicId이고 targetName은 지금 캡션이다. 사유는 SNS 어휘다. */
const 게시물신고 = makeAdminReportWire({
  targetType: 'SNS_POST',
  reportId: 31,
  targetKey: '01JF9W3Q6R8T2V4X7Z9B1C3D5J',
  targetName: '오늘 산책 다녀왔어요. 할인 링크는 프로필에 있어요',
  targetOwnerUserId: 3521,
  targetOwnerNickname: '콩이맘',
  reasonCode: 'SPAM',
  reportCount: 2,
  reportedAt: '2026-11-05T10:20:00',
  status: 'RECEIVED',
  reporterId: 5201,
  reasonText: '산책 글마다 같은 할인 링크를 붙여요.',
  history: [],
})

/** 지운 SNS 게시물은 캡션이 null이다. 닉네임으로 떨어지면 회원 신고로 읽힌다. */
const 지운게시물신고 = makeAdminReportWire({
  ...게시물신고,
  reportId: 32,
  targetKey: '01JF9W3Q6R8T2V4X7Z9B1C3D6K',
  targetName: null,
  reasonText: '이미 지운 글이에요.',
})

describe('/reports SNS 게시물', () => {
  beforeEach(() => {
    seedAdminApplications()
    seedAdminReports([게시물신고, 지운게시물신고, 사용자신고])
  })

  it('[AC-SNS-RPT-020] SNS 게시물 신고는 유형과 필터에 SNS 게시물로 보이고 지운 게시물은 종류와 식별자로 읽는다', async () => {
    const queries = recordListQueries()
    renderAt('/reports')

    expect(await screen.findByRole('button', { name: 게시물신고.targetName! })).toBeInTheDocument()
    expect(table().getAllByText('SNS 게시물')).toHaveLength(2)
    expect(table().queryByText('SNS_POST')).toBeNull()
    expect(
      screen.getByRole('button', { name: `SNS 게시물 ${지운게시물신고.targetKey}` }),
    ).toBeInTheDocument()

    await chooseOption(selectWithOption('신고 대상 전체'), 'SNS 게시물')
    await waitFor(() => expect(bodyRowCount()).toBe(2))
    expect(queries.at(-1)).toBe('SNS_POST|none|none')
  })

  it('[AC-SNS-RPT-021] SNS 게시물의 비공개 전환은 게시물 삭제로 적고 확인을 거쳐 나간다', async () => {
    const requests = recordReportRequests()
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 게시물신고.targetName! }))
    const open = await drawer()
    await open.findByText(게시물신고.reasonText!)
    expect(open.getByText('게시물 삭제')).toBeInTheDocument()
    expect(open.queryByText('비공개 전환')).toBeNull()
    expect(open.getByText('대상자 계정에 제재하고 게시물 삭제')).toBeInTheDocument()

    await chooseByCaption('게시물만 운영자 삭제')
    await chooseOption(selectWithOption('욕설/비방'), '외부 거래 유도')
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = await screen.findByRole('dialog', { name: '게시물을 삭제할까요?' })
    expect(within(confirm).getByText(/되돌릴 수 없어요/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '게시물 삭제' }))

    expect(await screen.findByText('게시물 삭제 처리했어요.')).toBeInTheDocument()
    expect(writesOnly(requests)).toEqual(['POST /admin/reports/SNS_POST/31/decision'])
    const saved = currentAdminReport('SNS_POST', 31)
    expect(saved?.decisionRecord?.decision).toBe('HIDE_TARGET')
    expect(saved?.targetName).toBeNull()
    expect(lastAdminReportSanction()).toBeNull()
  })

  it('[AC-SNS-RPT-022] SNS 게시물의 계정 제재 확인은 게시물도 지운다고 알린다', async () => {
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 게시물신고.targetName! }))
    const open = await drawer()
    await open.findByText(게시물신고.reasonText!)
    await chooseByCaption('대상자 계정에 제재하고 게시물 삭제')
    await chooseOption(selectWithOption('외부 거래 유도'), '외부 거래 유도')
    await chooseOption(selectWithOption('임시 정지'), '이용 제한')
    await chooseOption(selectWithOption('리뷰 욕설/비방 반복'), '허위 신고 반복')
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = await screen.findByRole('dialog', { name: '계정 제재까지 적용할까요?' })
    expect(within(confirm).getByText(/게시물도 삭제돼요/)).toBeInTheDocument()
    expect(within(confirm).queryByText(/대상 글은 그대로 노출/)).toBeNull()
  })

  it('[AC-SNS-RPT-023] 처리된 SNS 게시물 신고의 결정은 게시물 삭제로 보인다', async () => {
    seedAdminReports([
      {
        ...지운게시물신고,
        status: 'SANCTIONED',
        decisionRecord: {
          decision: 'HIDE_TARGET',
          reasonCode: 'EXTERNAL_TRADE',
          reasonDetail: null,
          noticeToOwner: null,
          internalMemo: null,
          targetOwnerUserId: 3521,
          actedByAdminId: 9001,
          decidedAt: '2026-11-05T12:00:00',
        },
      },
    ])
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(
      await screen.findByRole('button', { name: `SNS 게시물 ${지운게시물신고.targetKey}` }),
    )
    const open = await drawer()
    await open.findByText(지운게시물신고.reasonText!)
    expect(open.getByText('게시물 삭제')).toBeInTheDocument()
    expect(open.queryByRole('button', { name: '제출' })).toBeNull()
  })
})

/** SNS 댓글 신고. targetKey는 댓글 publicId이고 targetName은 지금 댓글 내용이다. 사유는 SNS 어휘다. */
const 댓글신고 = makeAdminReportWire({
  targetType: 'SNS_COMMENT',
  reportId: 41,
  targetKey: '01JF9W3Q6R8T2V4X7Z9B1CMT01',
  targetName: '이 링크 들어가면 사료 반값이에요',
  targetOwnerUserId: 3522,
  targetOwnerNickname: '보리누나',
  reasonCode: 'SPAM',
  reportCount: 1,
  reportedAt: '2026-11-06T09:10:00',
  status: 'RECEIVED',
  reporterId: 5202,
  reasonText: '댓글마다 같은 링크를 달아요.',
  history: [],
})

/** 지운 SNS 댓글은 내용이 null이다. 닉네임으로 떨어지면 회원 신고로 읽힌다. */
const 지운댓글신고 = makeAdminReportWire({
  ...댓글신고,
  reportId: 42,
  targetKey: '01JF9W3Q6R8T2V4X7Z9B1CMT02',
  targetName: null,
  reasonText: '이미 지운 댓글이에요.',
})

describe('/reports SNS 댓글', () => {
  beforeEach(() => {
    seedAdminApplications()
    seedAdminReports([댓글신고, 지운댓글신고, 게시물신고])
  })

  it('[AC-SNS-RPT-024] SNS 댓글 신고는 유형과 필터에 SNS 댓글로 보이고 지운 댓글은 종류와 식별자로 읽는다', async () => {
    const queries = recordListQueries()
    renderAt('/reports')

    expect(await screen.findByRole('button', { name: 댓글신고.targetName! })).toBeInTheDocument()
    expect(table().getAllByText('SNS 댓글')).toHaveLength(2)
    expect(table().queryByText('SNS_COMMENT')).toBeNull()
    expect(
      screen.getByRole('button', { name: `SNS 댓글 ${지운댓글신고.targetKey}` }),
    ).toBeInTheDocument()

    await chooseOption(selectWithOption('신고 대상 전체'), 'SNS 댓글')
    await waitFor(() => expect(bodyRowCount()).toBe(2))
    expect(queries.at(-1)).toBe('SNS_COMMENT|none|none')
  })

  it('[AC-SNS-RPT-025] SNS 댓글의 비공개 전환은 댓글 삭제로 적고 확인을 거쳐 나간다', async () => {
    const requests = recordReportRequests()
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 댓글신고.targetName! }))
    const open = await drawer()
    await open.findByText(댓글신고.reasonText!)
    expect(open.getByText('댓글 삭제')).toBeInTheDocument()
    expect(open.queryByText('비공개 전환')).toBeNull()
    expect(open.getByText('대상자 계정에 제재하고 댓글 삭제')).toBeInTheDocument()

    await chooseByCaption('댓글만 운영자 삭제')
    await chooseOption(selectWithOption('욕설/비방'), '외부 거래 유도')
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = await screen.findByRole('dialog', { name: '댓글을 삭제할까요?' })
    expect(within(confirm).getByText(/되돌릴 수 없어요/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '댓글 삭제' }))

    expect(await screen.findByText('댓글 삭제 처리했어요.')).toBeInTheDocument()
    expect(writesOnly(requests)).toEqual(['POST /admin/reports/SNS_COMMENT/41/decision'])
    const saved = currentAdminReport('SNS_COMMENT', 41)
    expect(saved?.decisionRecord?.decision).toBe('HIDE_TARGET')
    expect(saved?.targetName).toBeNull()
    expect(lastAdminReportSanction()).toBeNull()
  })

  it('[AC-SNS-RPT-026] SNS 댓글의 계정 제재 확인은 댓글도 지운다고 알린다', async () => {
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(await screen.findByRole('button', { name: 댓글신고.targetName! }))
    const open = await drawer()
    await open.findByText(댓글신고.reasonText!)
    await chooseByCaption('대상자 계정에 제재하고 댓글 삭제')
    await chooseOption(selectWithOption('외부 거래 유도'), '외부 거래 유도')
    await chooseOption(selectWithOption('임시 정지'), '이용 제한')
    await chooseOption(selectWithOption('리뷰 욕설/비방 반복'), '허위 신고 반복')
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = await screen.findByRole('dialog', { name: '계정 제재까지 적용할까요?' })
    expect(within(confirm).getByText(/댓글도 삭제돼요/)).toBeInTheDocument()
    expect(within(confirm).queryByText(/대상 글은 그대로 노출/)).toBeNull()
  })

  it('[AC-SNS-RPT-027] 처리된 SNS 댓글 신고의 결정은 댓글 삭제로 보인다', async () => {
    seedAdminReports([
      {
        ...지운댓글신고,
        status: 'SANCTIONED',
        decisionRecord: {
          decision: 'HIDE_TARGET',
          reasonCode: 'EXTERNAL_TRADE',
          reasonDetail: null,
          noticeToOwner: null,
          internalMemo: null,
          targetOwnerUserId: 3522,
          actedByAdminId: 9001,
          decidedAt: '2026-11-06T12:00:00',
        },
      },
    ])
    const user = userEvent.setup()
    renderAt('/reports')

    await user.click(
      await screen.findByRole('button', { name: `SNS 댓글 ${지운댓글신고.targetKey}` }),
    )
    const open = await drawer()
    await open.findByText(지운댓글신고.reasonText!)
    expect(open.getByText('댓글 삭제')).toBeInTheDocument()
    expect(open.queryByRole('button', { name: '제출' })).toBeNull()
  })
})

function manyProductReports(count: number): AdminReportWire[] {
  return Array.from({ length: count }, (_, index) =>
    makeAdminReportWire({
      targetType: 'PRODUCT',
      reportId: 100 + index,
      targetKey: `01HZXQ00000000000000000${String(index).padStart(2, '0')}`,
      targetName: `상품 신고 ${index + 1}`,
      reportedAt: `2026-10-${String(28 - index).padStart(2, '0')}T09:00:00`,
      history: [],
    }),
  )
}
