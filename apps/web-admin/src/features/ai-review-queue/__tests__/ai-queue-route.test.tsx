import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_INSPECTIONS_URL,
  ADMIN_INSPECTION_APPROVE_URL,
  ADMIN_INSPECTION_DETAIL_URL,
  ADMIN_INSPECTION_REJECT_URL,
  ADMIN_ORIGIN,
  currentAdminInspection,
  makeAdminInspectionWire,
  seedAdminApplications,
  seedAdminInspections,
  seedAdminRoster,
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

// 결정 라디오는 접근 가능한 이름이 없다(DS Radio는 label을 받지 않고 DecisionRadioGroup이 직접
// 텍스트를 그린다) — '허용'·'차단'은 확인 Modal의 버튼 이름과도 겹치므로 고유한 부제목으로 집는다.
const ALLOW_OPTION_CAPTION = '노출을 되돌리고 결정을 못 박아요'
const BLOCK_OPTION_CAPTION = '비노출로 굳혀요 (사유 필수)'

/** 위반 상세 JSON — 서버는 타입화하지 않은 문자열로 내려준다. */
const BANNED_INGREDIENT_JSON = JSON.stringify([
  {
    category: 'BANNED_INGREDIENT',
    perspective: 'RULE',
    spanStart: 3,
    spanEnd: 10,
    quote: '초콜릿향 간식',
    suggestion: null,
    confidence: null,
  },
])

const CONTACT_INFO_JSON = JSON.stringify([
  {
    category: 'CONTACT_INFO',
    perspective: 'CONDUCT_TRADE',
    spanStart: 0,
    spanEnd: 13,
    quote: '카톡 아이디 nyangi 로 문의 주세요',
    suggestion: '문의는 플랫폼 문의하기로 받아 주세요.',
    confidence: 0.93,
  },
])

/** 과탐 의심 — 룰이 금지 성분을 잡고, 선별이 규칙 적중으로 승급, 관점 하나는 레이트 리밋. */
const OVERBLOCK = makeAdminInspectionWire({
  inspectionId: 101,
  adminReviewReason: 'OVERBLOCK_SUSPECT',
  judgment: 'FLAG',
  productId: 'PRD-0001',
  productName: '동결건조 닭가슴살',
  storeName: '냥이상점',
  requestedAt: '2026-06-18T07:10:00',
  settledAt: '2026-06-18T07:14:00',
  findings: [
    { perspective: 'RULE', outcome: 'VIOLATION', skipReason: null, violations: BANNED_INGREDIENT_JSON },
    { perspective: 'TRIAGE', outcome: 'UNCHECKED', skipReason: 'RULE_HIT', violations: null },
    { perspective: 'DISPLAY_ADS', outcome: 'CLEAR', skipReason: null, violations: null },
    { perspective: 'CONDUCT_TRADE', outcome: 'UNCHECKED', skipReason: 'RATE_LIMITED', violations: null },
  ],
  calls: [
    { perspective: 'DISPLAY_ADS', modelId: 'claude-sonnet-5', outcome: 'SUCCESS', costMicroUsd: 3840, latencyMs: 2100 },
    { perspective: 'CONDUCT_TRADE', modelId: 'claude-sonnet-5', outcome: 'RATE_LIMITED', costMicroUsd: 0, latencyMs: 180 },
  ],
})

/** 판정 실패 — 노출은 건드리지 않고 큐에만 올라온다. */
const FAILED = makeAdminInspectionWire({
  inspectionId: 102,
  adminReviewReason: 'VERDICT_FAILED',
  judgment: 'FAILED',
  reasonCode: null,
  reasonSummary: null,
  productId: 'PRD-0002',
  productName: '관절 영양제 90정',
  storeName: '달콤펫',
  productInspectionStatus: 'APPROVED',
  requestedAt: '2026-06-17T22:00:00',
  settledAt: '2026-06-17T22:05:00',
  findings: [{ perspective: 'RULE', outcome: 'CLEAR', skipReason: null, violations: null }],
  calls: [],
})

/** 비평 뒤집힘 + 셀러 이의가 나중에 붙은 행. 등재 사유는 최초 이유를 보존한다. */
const OVERTURNED_WITH_APPEAL = makeAdminInspectionWire({
  inspectionId: 103,
  adminReviewReason: 'CRITIC_OVERTURNED',
  judgment: 'PASS',
  reasonCode: null,
  reasonSummary: null,
  appealState: 'OPEN',
  appealReason: '캐롭으로 만든 초코맛 간식이라 과탐이에요',
  appealedAt: '2026-06-18T12:00:00',
  productId: 'PRD-0003',
  productName: '캐롭 초코볼',
  storeName: 'comfy_pet',
  requestedAt: '2026-06-18T09:00:00',
  settledAt: '2026-06-18T09:05:00',
  findings: [
    { perspective: 'RULE', outcome: 'CLEAR', skipReason: null, violations: null },
    { perspective: 'CONDUCT_TRADE', outcome: 'CLEAR', skipReason: null, violations: null },
    { perspective: 'DISPLAY_ADS', outcome: 'CLEAR', skipReason: null, violations: null },
  ],
  calls: [
    { perspective: 'DISPLAY_ADS', modelId: 'claude-sonnet-5', outcome: 'SUCCESS', costMicroUsd: 3840, latencyMs: 2000 },
    { perspective: 'CONDUCT_TRADE', modelId: 'claude-sonnet-5', outcome: 'SUCCESS', costMicroUsd: 3840, latencyMs: 2100 },
    { perspective: 'ALL', modelId: 'claude-opus-5', outcome: 'SUCCESS', costMicroUsd: 12000, latencyMs: 4200 },
  ],
})

describe('/products/ai-queue', () => {
  beforeEach(() => {
    // 셸이 심사 대기·관리자 명부 배지를 함께 조회한다 — 핸들러 없는 요청을 실패로 보는 설정이라
    // 그쪽 서버 상태도 비워 세운다.
    seedAdminApplications()
    seedAdminRoster()
    seedAdminInspections([OVERBLOCK, FAILED, OVERTURNED_WITH_APPEAL])
  })

  it('[AC-AI-QUEUE-001] 큐 목록을 실서버 응답으로 그린다 — 사유 / 상품 정보 / 대기 시간', async () => {
    renderAt('/products/ai-queue')

    // 목업 시절의 운영 진입 차단 안내가 사라져야 한다.
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByText('AI 검수 큐는 준비 중이에요')).not.toBeInTheDocument()

    // 서버 enum이 한국어 라벨로 보인다(사유 축 다섯 가지를 운영자가 목록에서 바로 가른다).
    const row = (await screen.findByRole('button', { name: '101' })).closest('tr') as HTMLElement
    expect(row).toHaveTextContent('과탐 의심')
    expect(row).toHaveTextContent('AI 보류')
    // 상품 정보 — 상품명과 스토어명·공개 id가 함께 있어야 운영자가 상품을 찾을 수 있다.
    expect(row).toHaveTextContent('동결건조 닭가슴살')
    expect(row).toHaveTextContent('냥이상점')
    expect(row).toHaveTextContent('PRD-0001')
    // 대기 시간은 큐 등재 시각 컬럼이 없어 appealedAt ?? settledAt ?? requestedAt에서 계산한다.
    // 기준 시각이 과거로 고정돼 있어 일 단위가 늘 잡힌다(정확한 포맷은 매퍼 단위 테스트가 고정).
    expect(row).toHaveTextContent(/\d+일/)
    expect(screen.getByRole('columnheader', { name: '대기 시간' })).toBeInTheDocument()

    // 판정 실패 건은 노출이 그대로라 '노출 중'이다 — 큐 등재가 노출을 바꾸지 않는다는 계약.
    const failedRow = (screen.getByRole('button', { name: '102' })).closest('tr') as HTMLElement
    expect(failedRow).toHaveTextContent('판정 실패')
    expect(failedRow).toHaveTextContent('노출 중')
  })

  it('[AC-AI-QUEUE-002] 목록 조회는 어드민 호스트로 나가고 기본 필터는 처리 대기(OPEN)다', async () => {
    const requested: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/admin/content-inspections')) requested.push(request.url)
    })
    renderAt('/products/ai-queue')

    await screen.findByRole('button', { name: '101' })
    // 어드민 업무는 admin 모듈(8082)이다 — api 호스트로 나가면 배포에서만 404가 된다.
    expect(requested.length).toBeGreaterThan(0)
    for (const url of requested) expect(url.startsWith(ADMIN_ORIGIN)).toBe(true)
    expect(requested.some(url => new URL(url).searchParams.get('state') === 'OPEN')).toBe(true)
  })

  it('[AC-AI-QUEUE-003] 사유 필터는 서버 파라미터로 나가고 목록이 그 사유만 남는다', async () => {
    const user = userEvent.setup()
    const reasons: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      // 셸의 대기 건수 배지는 size=1로 따로 조회한다 — 목록 조회만 센다.
      if (url.pathname.endsWith('/admin/content-inspections') && url.searchParams.get('size') === '20') {
        reasons.push(url.searchParams.get('reason'))
      }
    })
    renderAt('/products/ai-queue')

    await screen.findByRole('button', { name: '101' })
    await user.selectOptions(
      screen.getByRole('combobox', { name: '등재 사유 필터' }),
      'OVERBLOCK_SUSPECT',
    )

    await waitFor(() => expect(reasons).toContain('OVERBLOCK_SUSPECT'))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '102' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: '101' })).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-004] 셀러 이의 필터는 등재 사유가 다른 행도 돌려주고 화면이 그 사실을 밝힌다', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await screen.findByRole('button', { name: '101' })
    await user.selectOptions(
      screen.getByRole('combobox', { name: '등재 사유 필터' }),
      'SELLER_APPEAL',
    )

    // 이의는 이미 큐에 올라온 행에도 붙고 그때 등재 사유는 바뀌지 않는다 — 서버가 이의 축으로
    // 번역해 돌려주므로 행의 사유는 '비평 뒤집힘'이다. 안내가 없으면 필터가 고장 난 것처럼 읽힌다.
    const row = (await screen.findByRole('button', { name: '103' })).closest('tr') as HTMLElement
    expect(row).toHaveTextContent('비평 뒤집힘')
    expect(row).toHaveTextContent('이의 접수')
    expect(screen.getByText(/등재 사유는 처음 큐에 올라온 까닭이 남아 있어/)).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-005] 상세는 다섯 단계 흐름을 그리고 미검사 단계는 왜 안 봤는지를 함께 보여 준다', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: '101' }))
    expect(await screen.findByRole('heading', { name: 'AI 검수 상세' })).toBeInTheDocument()

    expect(screen.getByText('파이프라인 흐름')).toBeInTheDocument()
    const flow = (await screen.findByText('1. 룰')).closest('ol') as HTMLElement
    // 단계는 다섯이고 순서가 고정이다 — 어디까지 돌았는지가 한눈에 보여야 한다.
    expect(flow.querySelectorAll(':scope > li')).toHaveLength(5)
    expect(flow).toHaveTextContent('2. 선별')
    expect(flow).toHaveTextContent('3. 관점 판정')
    expect(flow).toHaveTextContent('4. 비평')
    expect(flow).toHaveTextContent('5. 수정문구')

    // 선별은 규칙이 적중해 건너뛴 것이고, 관점 하나는 호출이 깨져 못 본 것이다 —
    // 둘 다 미검사지만 뜻이 정반대라서 사유를 보여 주지 않으면 운영자가 가를 수 없다.
    expect(flow).toHaveTextContent('규칙이 적중해 선별을 건너뛰고 승급')
    expect(flow).toHaveTextContent('모델 호출량 제한')
    expect(flow).toHaveTextContent('표시 / 광고')
    expect(flow).toHaveTextContent('행위 / 거래')
    // 보류 판정인데 비평 호출이 원장에 없다 — 규칙 단계 확정이나 단계 off를 사유로 밝힌다.
    expect(flow).toHaveTextContent('규칙 단계에서 확정됐거나')
  })

  it('[AC-AI-QUEUE-006] 위반은 분류 / 원문 인용 / 수정 제안을 함께 보여 준다', async () => {
    const user = userEvent.setup()
    seedAdminInspections([
      makeAdminInspectionWire({
        inspectionId: 201,
        adminReviewReason: 'MODEL_UNVERIFIED',
        judgment: 'FLAG',
        reasonCode: 'CONTACT_INFO',
        reasonSummary: '카톡 아이디 nyangi 로 문의 주세요',
        findings: [
          { perspective: 'RULE', outcome: 'CLEAR', skipReason: null, violations: null },
          {
            perspective: 'CONDUCT_TRADE',
            outcome: 'VIOLATION',
            skipReason: null,
            violations: CONTACT_INFO_JSON,
          },
        ],
      }),
    ])
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: '201' }))
    const heading = await screen.findByRole('heading', { name: 'AI 검수 상세' })
    // 같은 인용구가 목록 행의 reasonSummary로도 보이므로 Drawer 안으로 좁힌다.
    const drawer = within(heading.closest('[role="dialog"]') as HTMLElement)

    // 세 가지가 한 덩어리로 보여야 운영자가 과탐인지 판단할 수 있다.
    expect(await drawer.findByText('연락처 노출')).toBeInTheDocument()
    expect(drawer.getByText('카톡 아이디 nyangi 로 문의 주세요')).toBeInTheDocument()
    expect(drawer.getByText('문의는 플랫폼 문의하기로 받아 주세요.')).toBeInTheDocument()
    expect(drawer.getByText('확신도 0.93')).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-007] 위반 JSON을 읽지 못하면 위반 없음으로 접지 않고 원문을 드러낸다', async () => {
    const user = userEvent.setup()
    const broken = '[{"category":"CONTACT_INFO","quote":"카톡 아이디'
    seedAdminInspections([
      makeAdminInspectionWire({
        inspectionId: 202,
        findings: [
          { perspective: 'RULE', outcome: 'VIOLATION', skipReason: null, violations: broken },
        ],
      }),
    ])
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: '202' }))
    await screen.findByRole('heading', { name: 'AI 검수 상세' })

    // 접으면 위반이 있는 건이 화면에서 깨끗해 보이고, 그대로 허용하면 위반 문구가 노출된다.
    expect(await screen.findByText(/위반 상세를 읽지 못했어요/)).toBeInTheDocument()
    expect(screen.getByText(broken)).toBeInTheDocument()
    expect(screen.queryByText('기록된 위반이 없어요.')).not.toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-008] 허용은 204 뒤 무효화·재조회로 목록과 상품 노출에 반영된다', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: '101' }))
    await screen.findByRole('heading', { name: 'AI 검수 상세' })
    await user.click(screen.getByText(ALLOW_OPTION_CAPTION))
    await user.click(screen.getByRole('button', { name: '제출' }))

    const modalHeading = await screen.findByRole('heading', { name: '이 내용을 허용할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '허용' }))

    expect(await screen.findByText('검수를 허용했어요.')).toBeInTheDocument()
    const applied = currentAdminInspection(101)
    expect(applied?.adminDecision).toBe('ALLOWED')
    expect(applied?.adminReviewState).toBe('RESOLVED')
    // 허용은 노출을 되돌린다 — 결정이 노출로 이어지지 않으면 어드민 검수가 장식이 된다.
    expect(applied?.productInspectionStatus).toBe('APPROVED')
    // 기본 필터가 처리 대기라 재조회에서 그 행이 빠진다.
    await waitFor(() => expect(screen.queryByRole('button', { name: '101' })).toBeNull())
  })

  it('[AC-AI-QUEUE-009] 차단은 사유가 비면 제출이 막히고, 사유를 넣으면 204다', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: '101' }))
    await screen.findByRole('heading', { name: 'AI 검수 상세' })
    await user.click(screen.getByText(BLOCK_OPTION_CAPTION))

    // 빈 사유로 보내면 서버가 400 errorCode 40502로 거절한다 — 왕복 전에 막는다.
    expect(screen.getByRole('button', { name: '제출' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: '차단 사유' }), '금지 성분이 실제로 들어 있어요')
    expect(screen.getByRole('button', { name: '제출' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '제출' }))

    const modalHeading = await screen.findByRole('heading', { name: '이 내용을 차단할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '차단' }))

    expect(await screen.findByText('검수를 차단했어요.')).toBeInTheDocument()
    const applied = currentAdminInspection(101)
    expect(applied?.adminDecision).toBe('BLOCKED')
    expect(applied?.adminNote).toBe('금지 성분이 실제로 들어 있어요')
    expect(applied?.productInspectionStatus).toBe('REJECTED')
  })

  it('[AC-AI-QUEUE-010] 묵은 내용으로 거부된 결정(409/40508)을 사람이 읽을 수 있는 말로 보여 준다', async () => {
    const user = userEvent.setup()
    // 셀러가 그사이 상품 내용을 고쳤다 — 서버는 결정을 저장하지 않고 409 errorCode 40508을 준다.
    seedAdminInspections([{ ...OVERBLOCK, contentChanged: true }])
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: '101' }))
    await screen.findByRole('heading', { name: 'AI 검수 상세' })
    await user.click(screen.getByRole('button', { name: '제출' }))
    const modalHeading = await screen.findByRole('heading', { name: '이 내용을 허용할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '허용' }))

    // errorCode를 그대로 띄우거나 "요청을 처리하지 못했어요"로 뭉개면 운영자가 다음 행동을
    // 고를 수 없다 — 무엇이 막았고 어디서 결정하면 되는지까지 적는다.
    expect(await screen.findByText(/셀러가 그사이 상품 내용을 고쳐서/)).toBeInTheDocument()
    expect(screen.getByText(/바뀐 내용은 새 검수로 올라오니/)).toBeInTheDocument()
    expect(screen.getByText(/지금 누른 결정은 저장되지 않았어요/)).toBeInTheDocument()
    // 결정이 거부됐으니 Drawer는 열려 있어야 한다(운영자가 그 자리에서 상태를 본다).
    expect(screen.getByRole('heading', { name: 'AI 검수 상세' })).toBeInTheDocument()
    expect(currentAdminInspection(101)?.adminDecision).toBeNull()
  })

  it('[AC-AI-QUEUE-011] 이미 처리된 검수(409/40501)는 재조회 안내로 보여 준다', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: '101' }))
    await screen.findByRole('heading', { name: 'AI 검수 상세' })
    // 다른 운영자가 먼저 처리한 상황 — 서버만 상태가 바뀌어 있다.
    server.use(
      http.post(ADMIN_INSPECTION_APPROVE_URL, () =>
        HttpResponse.json({ errorCode: 40501, message: '이미 처리한 검수입니다.' }, { status: 409 }),
      ),
    )
    await user.click(screen.getByRole('button', { name: '제출' }))
    const modalHeading = await screen.findByRole('heading', { name: '이 내용을 허용할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '허용' }))

    expect(await screen.findByText(/이미 처리된 검수예요/)).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-012] 처리 완료 건은 제출 버튼이 아예 없고 앞선 결정을 보여 준다', async () => {
    const user = userEvent.setup()
    seedAdminInspections([
      makeAdminInspectionWire({
        inspectionId: 301,
        adminReviewState: 'RESOLVED',
        adminDecision: 'BLOCKED',
        adminDecidedBy: 1,
        adminDecidedAt: '2026-06-19T09:00:00',
        adminNote: '금지 성분이 실제로 들어 있어요',
        productInspectionStatus: 'REJECTED',
        productAdminDecision: 'BLOCKED',
      }),
    ])
    renderAt('/products/ai-queue')

    await user.selectOptions(
      await screen.findByRole('combobox', { name: '처리 상태 필터' }),
      'RESOLVED',
    )
    await user.click(await screen.findByRole('button', { name: '301' }))
    await screen.findByRole('heading', { name: 'AI 검수 상세' })

    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
    expect(screen.getByText(/이미 처리된 검수라 허용 \/ 차단을 다시 결정할 수 없어요/)).toBeInTheDocument()
    expect(screen.getByText('앞선 사람 결정')).toBeInTheDocument()
    expect(screen.getByText('금지 성분이 실제로 들어 있어요')).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-013] 목록 조회 실패는 데이터 없음이 아니라 오류로 드러난다', async () => {
    server.use(
      http.get(ADMIN_INSPECTIONS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/products/ai-queue')

    expect(await screen.findByText(/어드민 권한이 없어 검수 큐를 볼 수 없어요/)).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-014] 상세 조회 실패는 목록 문구가 아니라 상세 문구로 드러난다', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await screen.findByRole('button', { name: '101' })
    server.use(
      http.get(ADMIN_INSPECTION_DETAIL_URL, () =>
        HttpResponse.json(
          { errorCode: 40500, message: '검수 기록을 찾을 수 없습니다.' },
          { status: 404 },
        ),
      ),
    )
    await user.click(screen.getByRole('button', { name: '101' }))

    expect(await screen.findByText(/검수를 찾을 수 없어요/)).toBeInTheDocument()
    expect(screen.queryByText(/검수 큐를 불러오지 못했어요/)).not.toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-015] 차단 사유가 500자를 넘으면 서버 거절(90001)을 사람 말로 보여 준다', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: '101' }))
    await screen.findByRole('heading', { name: 'AI 검수 상세' })
    await user.click(screen.getByText(BLOCK_OPTION_CAPTION))
    await user.type(screen.getByRole('textbox', { name: '차단 사유' }), '금지 성분 확인')
    // Textarea maxLength가 500으로 막지만, 서버가 거절하는 경로 자체도 사람 말이어야 한다.
    server.use(
      http.post(ADMIN_INSPECTION_REJECT_URL, () =>
        HttpResponse.json(
          { errorCode: 90001, message: '반려 사유는 500자 이하여야 합니다.' },
          { status: 400 },
        ),
      ),
    )
    await user.click(screen.getByRole('button', { name: '제출' }))
    const modalHeading = await screen.findByRole('heading', { name: '이 내용을 차단할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '차단' }))

    expect(await screen.findByText(/500자 이하로 입력해 주세요/)).toBeInTheDocument()
  })
})
