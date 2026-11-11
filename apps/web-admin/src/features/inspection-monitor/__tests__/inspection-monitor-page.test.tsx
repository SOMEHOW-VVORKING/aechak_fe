import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_INSPECTIONS_URL,
  ADMIN_ORIGIN,
  makeAdminInspectionPerspectiveWire,
  makeAdminInspectionViolationsJson,
  makeAdminInspectionWire,
  seedAdminInspections,
  server,
  type AdminInspectionPerspectiveWire,
  type AdminInspectionWire,
} from '@/testing/msw/server'
import { InspectionMonitorPage } from '../components/InspectionMonitorPage'
import { ACTIVE_POLL_MS } from '../inspection-monitor.queries'

// 실 HTTP 경로를 MSW가 가로채 계약을 고정한다(AGENTS 6-8). 호스트도 가린다 — 핸들러가
// 어드민 호스트(8082)에만 걸려 있어 요청이 api 호스트로 나가면 onUnhandledRequest:'error'로 깨진다.

/** 목록 요청만 센다. 상세는 같은 접두에 id가 붙어 경로 끝으로 갈린다. */
let listRequests: string[] = []

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <InspectionMonitorPage />
    </QueryClientProvider>,
  )
  return queryClient
}

const PRODUCT_ID = '01JMONITORPRODUCT00000001'

const running = (overrides: Partial<AdminInspectionWire> = {}): AdminInspectionWire =>
  makeAdminInspectionWire({
    inspectionId: 7001,
    productId: PRODUCT_ID,
    productName: '연어 건사료 2kg',
    processingState: 'IN_FLIGHT',
    judgment: null,
    attempt: 2,
    requestedAt: '2026-11-07T10:00:00',
    settledAt: null,
    ...overrides,
  })

const settled = (overrides: Partial<AdminInspectionWire> = {}): AdminInspectionWire =>
  makeAdminInspectionWire({
    inspectionId: 7002,
    targetRef: 9002,
    productId: '01JMONITORPRODUCT00000002',
    productName: '오리 트릿 200g',
    processingState: 'SETTLED',
    judgment: 'PASS',
    attempt: 0,
    requestedAt: '2026-11-07T09:50:00',
    settledAt: '2026-11-07T09:50:06',
    leaseOwner: null,
    leaseExpiresAt: null,
    ...overrides,
  })

/** 행 하나를 대상 이름으로 집어 온다 — 열 순서를 전제하지 않고 그 행 안에서만 단언한다. */
const rowOf = (name: string): HTMLElement => {
  const cell = screen.getByRole('button', { name }).closest('tr')
  if (!cell) throw new Error(`행을 찾지 못했어요 / ${name}`)
  return cell
}

/** 그 행의 경과 칸(초 표기)을 숫자로 읽는다. 요청 시각 칸에는 초 표기가 없다. */
function elapsedSecondsOf(name: string): number {
  const text = within(rowOf(name)).getByText(/^\d+초$/).textContent ?? ''
  return Number(text.replace('초', ''))
}

/** 관점 한 줄 — 라벨로 집어 그 줄 안에서만 단언한다(다른 줄의 글자가 섞이지 않게). */
function perspectiveRowOf(label: string): HTMLElement {
  const row = screen.getByText(label).closest('li')
  if (!row) throw new Error(`관점 줄을 찾지 못했어요 / ${label}`)
  return row
}

beforeEach(() => {
  listRequests = []
  server.events.on('request:start', ({ request }) => {
    if (new URL(request.url).pathname.endsWith('/admin/inspections')) {
      listRequests.push(request.url)
    }
  })
})

// 가짜 타이머는 **파일 수준에서** 되돌린다. 테스트가 타임아웃으로 끊기면 본문의 try/finally가
// 돌지 않아 가짜 타이머가 그대로 남고, 그러면 뒤따르는 모든 테스트가 조회를 기다리며 함께 멎는다
// (실측: 한 테스트가 멎으면 그 뒤 열 개가 전부 타임아웃으로 떨어졌다).
afterEach(() => {
  vi.useRealTimers()
})

/**
 * 가짜 타이머 아래에서 첫 조회가 끝나기를 기다린다.
 *
 * `findBy*`는 가짜 타이머를 **스스로 감지하지 못한다** — @testing-library/dom의 감지는 `jest`
 * 전역을 보고 vitest에는 그 전역이 없다. 그래서 대기 루프가 시간을 밀지 못하고, XHR 가로채기가
 * 응답을 넘겨줄 때 쓰는 타이머가 영원히 안 돈다. 시간을 조금 밀어 조회를 끝낸다 — 1초보다 짧게
 * 밀어 경과 시간 시계(1초 간격)는 건드리지 않는다.
 */
async function settleInitialLoad() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
}

describe('검수 진행 현황 화면', () => {
  it('[AC-ADMIN-INSP-001] 대기·처리 중인 건이 종결된 건보다 위에 온다', async () => {
    // 서버 정렬은 요청 시각 내림차순 고정이라, 종결된 건이 더 최근이면 그 건이 먼저 내려온다.
    seedAdminInspections([
      settled({ requestedAt: '2026-11-07T11:00:00', settledAt: '2026-11-07T11:00:05' }),
      running({ requestedAt: '2026-11-07T10:00:00' }),
    ])
    renderPage()

    await screen.findByRole('button', { name: '연어 건사료 2kg' })
    // 머리글 행을 빼고 첫 데이터 행이 진행 중인 건이어야 한다 — 이 화면에 들어오는 이유가 그것이다.
    const [, firstRow] = screen.getAllByRole('row')
    expect(within(firstRow!).getByRole('button', { name: '연어 건사료 2kg' })).toBeInTheDocument()
  })

  it('[AC-ADMIN-INSP-002] 판정이 없는 건을 통과로 그리지 않는다', async () => {
    seedAdminInspections([running()])
    renderPage()

    await screen.findByRole('button', { name: '연어 건사료 2kg' })
    const row = within(rowOf('연어 건사료 2kg'))
    expect(row.getByText('판정 전')).toBeInTheDocument()
    expect(row.queryByText('통과')).not.toBeInTheDocument()
    // 처리 상태는 **다른 열**이다 — 둘을 한 칸에 합치면 판정이 없는 것과 통과가 섞인다.
    expect(row.getByText('처리 중')).toBeInTheDocument()
  })

  it.each([
    ['UNJUDGED', '기한 초과'],
    ['FAILED', '판정 실패'],
  ] as const)(
    '[AC-ADMIN-INSP-003] 종결된 %s 건은 통과와 다른 글자로 그려진다',
    async (judgment, label) => {
      seedAdminInspections([settled({ judgment })])
      renderPage()

      await screen.findByRole('button', { name: '오리 트릿 200g' })
      const row = within(rowOf('오리 트릿 200g'))
      expect(row.getByText(label)).toBeInTheDocument()
      // 종결 뱃지는 있어도 통과는 아니다.
      expect(row.getByText('종결')).toBeInTheDocument()
      expect(row.queryByText('통과')).not.toBeInTheDocument()
    },
  )

  it('[AC-ADMIN-INSP-004] 재시도한 건만 횟수를 세워 보여 준다', async () => {
    seedAdminInspections([running({ attempt: 3 }), settled({ attempt: 0 })])
    renderPage()

    await screen.findByRole('button', { name: '연어 건사료 2kg' })
    expect(within(rowOf('연어 건사료 2kg')).getByText('3회')).toBeInTheDocument()
    expect(within(rowOf('오리 트릿 200g')).queryByText(/회$/)).not.toBeInTheDocument()
  })

  it('[AC-ADMIN-INSP-005] 종결된 건의 경과는 요청과 종결 사이이고 지금에 흔들리지 않는다', async () => {
    seedAdminInspections([
      settled({ requestedAt: '2026-11-07T09:50:00', settledAt: '2026-11-07T09:50:06' }),
    ])
    renderPage()

    await screen.findByRole('button', { name: '오리 트릿 200g' })
    expect(within(rowOf('오리 트릿 200g')).getByText('6초')).toBeInTheDocument()
  })

  it('[AC-ADMIN-INSP-006] 진행 중인 건의 경과는 서버를 다시 부르지 않아도 화면에서 흐른다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-07T10:00:02'))
    seedAdminInspections([running({ requestedAt: '2026-11-07T10:00:00' })])
    renderPage()
    await settleInitialLoad()

    const before = elapsedSecondsOf('연어 건사료 2kg')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    // 서버가 준 숫자를 그대로 두면 갱신 주기만큼 늦은 값이 보인다 — 화면이 세므로 정확히 5초 늘어난다.
    expect(elapsedSecondsOf('연어 건사료 2kg')).toBe(before + 5)
  })

  it('[AC-ADMIN-INSP-017] 상품명이 없는 검수도 목록에서 사라지지 않고 종류와 식별자로 가리킨다', async () => {
    // 리뷰 검수와 상품 행이 지워진 검수는 상품명이 널이다(서버가 left join이라 행 자체는 남는다).
    // 이름 자리를 비우면 운영자가 "방금 올린 건이 안 보인다"의 원인을 이 화면에서 찾을 수 없다.
    seedAdminInspections([
      running({ targetType: 'REVIEW', targetRef: 4242, productId: null, productName: null }),
    ])
    renderPage()

    const link = await screen.findByRole('button', { name: '리뷰 4242' })
    expect(within(link.closest('tr')!).getByText('처리 중')).toBeInTheDocument()
  })

  it('[AC-ADMIN-INSP-007] 전체는 파라미터를 키째 빼고 고른 값은 서버 열거 이름으로 어드민 호스트에 나간다', async () => {
    seedAdminInspections([running()])
    renderPage()

    await screen.findByRole('button', { name: '연어 건사료 2kg' })
    expect(listRequests[0]?.startsWith(ADMIN_ORIGIN)).toBe(true)
    // 세 필터를 주지 않았으면 키 자체가 없어야 한다(빈 값을 보내면 서버가 형식 오류로 거절한다).
    const first = new URL(listRequests[0]!).searchParams
    expect(first.has('processingState')).toBe(false)
    expect(first.has('targetType')).toBe(false)
    expect(first.has('judgment')).toBe(false)
    expect([first.get('page'), first.get('size')]).toEqual(['0', '20'])

    const user = userEvent.setup()
    // 보이는 글자로 고르고 **나가는 값**을 단언한다 — 라벨과 서버 열거 이름의 매핑이 그 사이에 있다.
    const stateSelect = screen.getByDisplayValue('전체 처리 상태')
    await user.selectOptions(stateSelect, within(stateSelect).getByRole('option', { name: '대기' }))

    await waitFor(() => expect(listRequests).toHaveLength(2))
    expect(new URL(listRequests[1]!).searchParams.get('processingState')).toBe('QUEUED')
  })

  it('[AC-ADMIN-INSP-008] 조회 실패는 빈 목록 문구가 아니라 안내로 드러난다', async () => {
    server.use(
      http.get(ADMIN_INSPECTIONS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('어드민 권한이 없어 검수 현황을 볼 수 없어요')
  })

  describe('상세 — 관점별 진행', () => {
    const RAW_UNKNOWN_SHAPE = '[{"quote":"관절염 치료","rule":"MEDICAL_CLAIM"}]'

    /** 종결된 검수 한 건을 심고 상세를 연다. 관점 행은 서버가 보낸 그대로다. */
    async function openDetailWith(
      perspectives: AdminInspectionPerspectiveWire[],
      overrides: Partial<AdminInspectionWire> = {},
    ) {
      seedAdminInspections([
        running({
          processingState: 'SETTLED',
          judgment: 'FLAG',
          settledAt: '2026-11-07T10:00:08',
          leaseOwner: null,
          leaseExpiresAt: null,
          perspectives,
          ...overrides,
        }),
      ])
      renderPage()
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: '연어 건사료 2kg' }))
      await screen.findByRole('list', { name: '관점별 진행' })
    }

    /** 나눠 묻는 방식 — 선별이 넘겼고 한 관점은 위반, 다른 관점은 호출 한도에 걸렸다. */
    const splitRows = (): AdminInspectionPerspectiveWire[] => [
      makeAdminInspectionPerspectiveWire({ perspective: 'RULE', outcome: 'CLEAR' }),
      makeAdminInspectionPerspectiveWire({
        perspective: 'TRIAGE',
        outcome: 'UNCHECKED',
        skipReason: 'PROMOTED',
      }),
      makeAdminInspectionPerspectiveWire({
        perspective: 'DISPLAY_ADS',
        outcome: 'VIOLATION',
        violations: makeAdminInspectionViolationsJson([
          {
            category: 'MEDICAL_CLAIM',
            perspective: 'DISPLAY_ADS',
            spanStart: 0,
            spanEnd: 14,
            quote: '관절염 치료에 효과가 있다',
            suggestion: '관절 건강에 도움을 줄 수 있는 글루코사민 함유',
            confidence: 0.91,
          },
        ]),
      }),
      makeAdminInspectionPerspectiveWire({
        perspective: 'CONDUCT_TRADE',
        outcome: 'UNCHECKED',
        skipReason: 'RATE_LIMITED',
      }),
    ]

    /** 단계 줄의 이름만 순서대로 — 위반 목록의 항목은 세지 않는다. */
    function stageLabels(): string[] {
      const list = screen.getByRole('list', { name: '관점별 진행' })
      return within(list)
        .getAllByRole('listitem')
        .filter(item => item.parentElement === list)
        .map(item => item.querySelector('p')?.textContent ?? '')
    }

    it('[AC-ADMIN-INSP-009] 미검사를 통과와 같은 칸에 그리지 않는다', async () => {
      await openDetailWith(splitRows())

      const trade = within(perspectiveRowOf('상세 검수 / 거래 행위'))
      expect(trade.getByText('미검사')).toBeInTheDocument()
      // 같은 줄에 통과가 함께 있으면 운영자가 본 것으로 읽는다 — 이 단언이 이 화면의 핵심이다.
      expect(trade.queryByText('통과')).not.toBeInTheDocument()
      expect(trade.getByText(/통과가 아니에요/)).toBeInTheDocument()

      const rule = within(perspectiveRowOf('자동 규칙 검사'))
      expect(rule.getByText('통과')).toBeInTheDocument()
      expect(rule.queryByText('미검사')).not.toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-010] 건너뛴 이유를 코드가 아니라 한국어로 보여 준다', async () => {
      await openDetailWith(splitRows())

      const triage = within(perspectiveRowOf('1차 선별'))
      expect(
        triage.getByText('건너뛴 이유 / 1차 선별이 판정하지 않고 상세 검수로 넘겼어요'),
      ).toBeInTheDocument()
      expect(triage.queryByText(/PROMOTED/)).not.toBeInTheDocument()
      expect(
        within(perspectiveRowOf('상세 검수 / 거래 행위')).getByText(
          '건너뛴 이유 / 요청 한도에 걸려 모델을 호출하지 못했어요',
        ),
      ).toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-018] 모르는 사유 코드는 숨기지 않고 코드 그대로 보여 준다', async () => {
      await openDetailWith([
        makeAdminInspectionPerspectiveWire({
          perspective: 'ALL',
          outcome: 'UNCHECKED',
          skipReason: 'BRAND_NEW_REASON',
        }),
      ])

      expect(
        within(perspectiveRowOf('상세 검수')).getByText('건너뛴 이유 / BRAND_NEW_REASON'),
      ).toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-011] 위반 상세를 분류와 걸린 표현, 수정 제안으로 풀어 보여 준다', async () => {
      await openDetailWith(splitRows())

      const displayAds = within(perspectiveRowOf('상세 검수 / 표시와 광고'))
      expect(displayAds.getByText('위반')).toBeInTheDocument()
      // 분류는 영문 코드가 아니라 화면 이름이다.
      expect(displayAds.getByText('질병 치료 효능')).toBeInTheDocument()
      expect(displayAds.getByText('걸린 표현 / 관절염 치료에 효과가 있다')).toBeInTheDocument()
      expect(
        displayAds.getByText('수정 제안 / 관절 건강에 도움을 줄 수 있는 글루코사민 함유'),
      ).toBeInTheDocument()
      expect(displayAds.queryByText('위반 상세 원문')).not.toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-019] 풀 수 없는 위반 상세는 원문을 그대로 보여 준다', async () => {
      await openDetailWith([
        makeAdminInspectionPerspectiveWire({
          perspective: 'ALL',
          outcome: 'VIOLATION',
          // 분류 키가 없는 모양이다. 빈 목록으로 그리면 위반이 없는 것처럼 보인다.
          violations: RAW_UNKNOWN_SHAPE,
        }),
      ])

      const model = within(perspectiveRowOf('상세 검수'))
      expect(model.getByText('위반 상세 원문')).toBeInTheDocument()
      expect(model.getByText(RAW_UNKNOWN_SHAPE)).toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-020] 통째로 본 검수는 쓰지 않은 방식의 줄을 그리지 않는다', async () => {
      await openDetailWith(
        [
          makeAdminInspectionPerspectiveWire({ perspective: 'RULE', outcome: 'CLEAR' }),
          makeAdminInspectionPerspectiveWire({ perspective: 'ALL', outcome: 'CLEAR' }),
        ],
        { judgment: 'PASS' },
      )

      // 정상 통과 건에 빈 줄이 끼면 중간을 건너뛴 것처럼 읽힌다.
      expect(stageLabels()).toEqual(['자동 규칙 검사', '1차 선별', '상세 검수'])
      expect(within(perspectiveRowOf('상세 검수')).getByText('통과')).toBeInTheDocument()
      // 선별을 쓰지 않은 종결 건이다 — 기다리면 온다는 말을 쓰지 않는다.
      const triage = within(perspectiveRowOf('1차 선별'))
      expect(triage.getByText('기록 없음')).toBeInTheDocument()
      expect(triage.getByText('판정이 끝날 때까지 이 단계는 돌지 않았어요')).toBeInTheDocument()
      expect(triage.queryByText(/아직/)).not.toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-021] 나눠 물은 검수는 두 관점을 구별해 그리고 빈 통합 줄을 두지 않는다', async () => {
      await openDetailWith(splitRows())

      expect(stageLabels()).toEqual([
        '자동 규칙 검사',
        '1차 선별',
        '상세 검수 / 표시와 광고',
        '상세 검수 / 거래 행위',
      ])
    })

    it('[AC-ADMIN-INSP-022] 규칙에서 끝난 건은 상세 검수 자리를 한 줄로만 남긴다', async () => {
      await openDetailWith([
        makeAdminInspectionPerspectiveWire({
          perspective: 'RULE',
          outcome: 'VIOLATION',
          violations: makeAdminInspectionViolationsJson([
            { category: 'CONTACT_INFO', perspective: 'RULE', quote: '010-1234-5678' },
          ]),
        }),
      ])

      expect(stageLabels()).toEqual(['자동 규칙 검사', '1차 선별', '상세 검수'])
      const rule = within(perspectiveRowOf('자동 규칙 검사'))
      expect(rule.getByText('위반')).toBeInTheDocument()
      expect(rule.getByText('연락처 노출')).toBeInTheDocument()
      expect(rule.getByText('걸린 표현 / 010-1234-5678')).toBeInTheDocument()
      // 규칙 단계 위반에는 제안이 없다 — 빈 제안 줄을 그리지 않는다.
      expect(rule.queryByText(/수정 제안/)).not.toBeInTheDocument()

      const model = within(perspectiveRowOf('상세 검수'))
      expect(model.getByText('기록 없음')).toBeInTheDocument()
      expect(model.queryByText('미검사')).not.toBeInTheDocument()
      expect(model.queryByText('통과')).not.toBeInTheDocument()
      expect(model.queryByText(/아직/)).not.toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-023] 선별이 통과시킨 건은 상세 검수가 미검사이고 그 이유가 선별이다', async () => {
      await openDetailWith(
        [
          makeAdminInspectionPerspectiveWire({ perspective: 'RULE', outcome: 'CLEAR' }),
          makeAdminInspectionPerspectiveWire({ perspective: 'TRIAGE', outcome: 'CLEAR' }),
          makeAdminInspectionPerspectiveWire({
            perspective: 'ALL',
            outcome: 'UNCHECKED',
            skipReason: 'TRIAGE_CLEAR',
          }),
        ],
        { judgment: 'PASS' },
      )

      expect(stageLabels()).toEqual(['자동 규칙 검사', '1차 선별', '상세 검수'])
      expect(within(perspectiveRowOf('1차 선별')).getByText('통과')).toBeInTheDocument()
      const model = within(perspectiveRowOf('상세 검수'))
      expect(model.getByText('미검사')).toBeInTheDocument()
      expect(model.queryByText('통과')).not.toBeInTheDocument()
      expect(
        model.getByText('건너뛴 이유 / 1차 선별이 문제없다고 봐서 상세 검수를 하지 않았어요'),
      ).toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-024] 선별이 위반을 확정한 건은 위반이 선별 줄에 있고 상세 검수는 미검사다', async () => {
      await openDetailWith([
        makeAdminInspectionPerspectiveWire({ perspective: 'RULE', outcome: 'CLEAR' }),
        makeAdminInspectionPerspectiveWire({
          perspective: 'TRIAGE',
          outcome: 'VIOLATION',
          violations: makeAdminInspectionViolationsJson([
            {
              category: 'OFF_PLATFORM',
              perspective: 'TRIAGE',
              quote: '카톡으로 따로 주문 주세요',
              confidence: 0.97,
            },
          ]),
        }),
        makeAdminInspectionPerspectiveWire({
          perspective: 'ALL',
          outcome: 'UNCHECKED',
          skipReason: 'TRIAGE_CERTAIN',
        }),
      ])

      const triage = within(perspectiveRowOf('1차 선별'))
      expect(triage.getByText('위반')).toBeInTheDocument()
      expect(triage.getByText('외부 거래 유도')).toBeInTheDocument()
      expect(triage.getByText('걸린 표현 / 카톡으로 따로 주문 주세요')).toBeInTheDocument()

      const model = within(perspectiveRowOf('상세 검수'))
      expect(model.getByText('미검사')).toBeInTheDocument()
      // 안 본 단계가 위반을 찾은 것처럼 보이면 안 된다.
      expect(model.queryByText('위반')).not.toBeInTheDocument()
      expect(
        model.getByText('건너뛴 이유 / 1차 선별이 위반을 확정해서 상세 검수를 하지 않았어요'),
      ).toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-025] 진행 중인 건의 빈 줄은 아직 닿지 않았다고 말한다', async () => {
      await openDetailWith([], {
        processingState: 'IN_FLIGHT',
        judgment: null,
        settledAt: null,
      })

      expect(stageLabels()).toEqual(['자동 규칙 검사', '1차 선별', '상세 검수'])
      for (const label of ['자동 규칙 검사', '1차 선별', '상세 검수']) {
        const row = within(perspectiveRowOf(label))
        expect(row.getByText('기록 없음')).toBeInTheDocument()
        expect(row.getByText('아직 이 단계에 닿지 않았어요')).toBeInTheDocument()
        expect(row.queryByText(/돌지 않았어요/)).not.toBeInTheDocument()
      }
    })

    it('[AC-ADMIN-INSP-012] 상세는 조치 버튼을 두지 않고 조치의 자리를 알려 준다', async () => {
      await openDetailWith(splitRows())

      expect(screen.getByText(/승인\/반려는 AI 검수 큐에서 해요/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-013] 없는 검수는 40508 문구로 갈린다', async () => {
      seedAdminInspections([running()])
      server.use(
        http.get(`${ADMIN_INSPECTIONS_URL}/:inspectionId`, () =>
          HttpResponse.json({ errorCode: 40508, message: '검수를 찾을 수 없습니다.' }, { status: 404 }),
        ),
      )
      renderPage()
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: '연어 건사료 2kg' }))

      expect(await screen.findByText('이 검수를 찾을 수 없어요. 목록을 다시 불러왔어요.')).toBeInTheDocument()
    })
  })

  describe('폴링', () => {
    afterEach(() => {
      // 숨김 처리를 own property로 덮었으므로 지워 프로토타입 getter를 되살린다.
      Reflect.deleteProperty(document, 'visibilityState')
    })

    /** 주기 하나를 확실히 넘긴다 — 주기 타이머는 첫 조회가 끝난 **그 시점**부터 재므로 여유를 둔다. */
    const onePollCycle = ACTIVE_POLL_MS + 200

    async function renderWithFakeTimers(rows: AdminInspectionWire[], name: string) {
      vi.useFakeTimers()
      seedAdminInspections(rows)
      renderPage()
      await settleInitialLoad()
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
      // 첫 조회 한 건을 기준으로 센다.
      expect(listRequests).toHaveLength(1)
    }

    it('[AC-ADMIN-INSP-014] 진행 중인 건이 있으면 짧은 주기로 다시 받는다', async () => {
      await renderWithFakeTimers([running()], '연어 건사료 2kg')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(onePollCycle)
      })

      expect(listRequests.length).toBeGreaterThan(1)
    })

    it('[AC-ADMIN-INSP-015] 진행 중인 건이 없으면 짧은 주기로 다시 받지 않는다', async () => {
      await renderWithFakeTimers([settled()], '오리 트릿 200g')

      await act(async () => {
        // 빠른 주기 세 번을 지나도 조용해야 한다(느린 주기 30초로 떨어져 있다).
        await vi.advanceTimersByTimeAsync(onePollCycle * 3)
      })

      expect(listRequests).toHaveLength(1)
      expect(screen.getByText(/진행 중인 건이 없어 30초마다 갱신해요/)).toBeInTheDocument()
    })

    it('[AC-ADMIN-INSP-016] 화면이 보이지 않는 동안에는 진행 중인 건이 있어도 받지 않는다', async () => {
      await renderWithFakeTimers([running()], '연어 건사료 2kg')
      // 탭이 뒤로 가면 query-core가 주기마다 isFocused()를 보고 건너뛴다
      // (refetchIntervalInBackground: false).
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(onePollCycle * 3)
      })
      expect(listRequests).toHaveLength(1)

      // 돌아오면 다시 받는다 — 멈춘 화면으로 남지 않는다.
      Reflect.deleteProperty(document, 'visibilityState')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(onePollCycle)
      })
      expect(listRequests.length).toBeGreaterThan(1)
    })
  })
})
