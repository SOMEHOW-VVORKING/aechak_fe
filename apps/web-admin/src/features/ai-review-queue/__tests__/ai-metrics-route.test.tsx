import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_INSPECTION_METRICS_URL,
  ADMIN_ORIGIN,
  makeAdminInspectionMetricsWire,
  makeLegacyAdminInspectionMetricsWire,
  seedAdminApplications,
  seedAdminInspectionMetrics,
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

/** 지표 조회 URL만 모은다 — 셸이 심사 대기·검수 대기 배지를 함께 조회한다. */
function recordMetricsRequests(): string[] {
  const urls: string[] = []
  server.events.on('request:start', ({ request }) => {
    if (request.url.startsWith(ADMIN_INSPECTION_METRICS_URL)) urls.push(request.url)
  })
  return urls
}

describe('/products/ai-metrics', () => {
  beforeEach(() => {
    // 셸이 심사 대기·검수 대기 배지를 함께 조회한다 — 핸들러 없는 요청을 실패로 보는 설정이라
    // 그쪽 서버 상태도 비워 세운다.
    seedAdminApplications()
    seedAdminRoster()
    seedAdminInspections()
    seedAdminInspectionMetrics(makeAdminInspectionMetricsWire())
  })

  it('[AC-AI-METRICS-001] 퍼널은 네 단계를 순서대로 그리고 단계마다 비율과 그 분모를 함께 보여 준다', async () => {
    renderAt('/products/ai-metrics')

    const flow = (await screen.findByText('1단 룰')).closest('ol') as HTMLElement
    expect(flow.querySelectorAll(':scope > li')).toHaveLength(4)
    expect(flow).toHaveTextContent('2단 선별')
    expect(flow).toHaveTextContent('3단 관점 판정')
    expect(flow).toHaveTextContent('4단 비평')

    // 단계마다 "몇 %가 걸리는가"가 보여야 한다.
    expect(flow).toHaveTextContent('차단율')
    expect(flow).toHaveTextContent('11.5%')
    expect(flow).toHaveTextContent('건너뛰기율')
    expect(flow).toHaveTextContent('62.4%')
    expect(flow).toHaveTextContent('검출율')
    expect(flow).toHaveTextContent('31.6%')
    expect(flow).toHaveTextContent('뒤집힘율')
    expect(flow).toHaveTextContent('13.7%')

    // 네 비율은 분모가 서로 달라서 그냥 나란히 두면 비교해도 되는 값으로 읽힌다 —
    // 분모를 비율 옆에 적는 것이 이 화면의 계약이다.
    expect(flow).toHaveTextContent('분모는 미판정을 뺀 닫힌 검수예요')
    expect(flow).toHaveTextContent('분모는 선별 호출이 실제로 나간 검수예요')
    expect(flow).toHaveTextContent('분모는 응답이 온 검수예요')
  })

  it('[AC-AI-METRICS-002] 퍼널 막대는 단계를 거치며 좁아진다 — 진입 건수와 폭이 함께 줄어든다', async () => {
    renderAt('/products/ai-metrics')

    const flow = (await screen.findByText('1단 룰')).closest('ol') as HTMLElement
    const rows = Array.from(flow.querySelectorAll(':scope > li'))
    // 진입 건수가 단계마다 줄어드는 것이 퍼널의 본문이다(836 → 644 → 323 → 102).
    const entered = ['836', '644', '323', '102']
    rows.forEach((row, index) => expect(row).toHaveTextContent(entered[index] as string))

    // 폭은 글자로 읽을 수 없어 인라인 스타일을 직접 본다 — "줄어드는 모양"이 이 차트의
    // 유일한 주장이고, 폭이 단조 감소하지 않으면 숫자가 맞아도 차트가 거짓말을 한다.
    const widths = rows.map(row => {
      const bar = row.querySelector('[style*="width"]') as HTMLElement
      return Number.parseFloat(bar.style.width)
    })
    expect(widths).toHaveLength(4)
    for (let index = 1; index < widths.length; index += 1) {
      expect(widths[index] as number).toBeLessThan(widths[index - 1] as number)
    }
  })

  it('[AC-AI-METRICS-003] 조회는 어드민 호스트로 나가고 처음에는 창 파라미터를 보내지 않는다', async () => {
    const requested = recordMetricsRequests()
    renderAt('/products/ai-metrics')

    await screen.findByText('1단 룰')
    expect(requested.length).toBeGreaterThan(0)
    for (const url of requested) {
      // 어드민 업무는 admin 모듈(8082)이다 — api 호스트로 나가면 배포에서만 404가 된다.
      expect(url.startsWith(ADMIN_ORIGIN)).toBe(true)
      const params = new URL(url).searchParams
      // 확장 전 서버는 창 파라미터를 무시한다. 첫 화면이 기간을 보내면 "서버가 선택을
      // 반영하지 않았다" 안내가 늘 떠서 정상 상태가 경보처럼 보인다.
      expect(params.get('from')).toBeNull()
      expect(params.get('policyVersion')).toBeNull()
    }
  })

  it('[AC-AI-METRICS-004] 손익분기는 서버 값으로 선을 긋고, 하네스 정본과 다르면 둘을 함께 보여 준다', async () => {
    renderAt('/products/ai-metrics')

    // 굵은 선은 서버 값이다 — 서버의 초과 판정이 그 값으로 계산되므로 선과 경보가 같은 말을 한다.
    expect(await screen.findByText('손익분기 45.7%')).toBeInTheDocument()
    // 가는 선은 측정 하네스 정본이다. 두 값이 다르면 그 사이 구간에서 서버 경보가 거짓이 된다.
    expect(screen.getByText('하네스 정본 62.0%')).toBeInTheDocument()
    expect(screen.getByText(/승급률이 두 값 사이에 있으면 서버는/)).toBeInTheDocument()
    expect(screen.getByText('손익분기 아래')).toBeInTheDocument()
    expect(screen.getByText('37.6%')).toBeInTheDocument()
  })

  it('[AC-AI-METRICS-005] 승급률이 기준을 넘으면 서버 판정 그대로 초과로 보여 준다', async () => {
    const wire = makeAdminInspectionMetricsWire()
    seedAdminInspectionMetrics({
      ...wire,
      funnel: {
        ...wire.funnel!,
        stage2: { ...wire.funnel!.stage2!, promotionRate: 0.7, overBreakeven: true },
      },
    })
    renderAt('/products/ai-metrics')

    expect(await screen.findByText('손익분기 초과')).toBeInTheDocument()
    expect(
      screen.getByText('승급률이 기준을 넘었어요 — 선별이 아끼는 호출보다 더하는 호출이 많은 구간이에요.'),
    ).toBeInTheDocument()
  })

  it('[AC-AI-METRICS-006] 기간을 고르면 그 창이 서버 파라미터로 나가고 서버가 집계한 창이 화면에 적힌다', async () => {
    const user = userEvent.setup()
    // 확장 서버는 받은 창을 그대로 집계하고 응답에 되비춘다.
    seedAdminInspectionMetrics(makeAdminInspectionMetricsWire(), { honorsWindow: true })
    const requested = recordMetricsRequests()
    renderAt('/products/ai-metrics')

    await screen.findByText('1단 룰')
    await user.selectOptions(screen.getByRole('combobox', { name: '집계 기간' }), '7d')

    await waitFor(() => expect(requested.some(url => new URL(url).searchParams.has('from'))).toBe(true))
    const sent = new URL(requested[requested.length - 1] as string).searchParams.get('from')
    // 오프셋 없는 LocalDateTime이어야 한다 — UTC 표기로 보내면 서버가 시간대만큼 밀린 창을 센다.
    expect(sent).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    expect(sent?.endsWith('Z')).toBe(false)

    // 서버가 그 창을 반영했으므로 어긋남 안내는 뜨지 않는다.
    await waitFor(() =>
      expect(screen.queryByText(/서버가 기간 선택을 반영하지 않았어요/)).not.toBeInTheDocument(),
    )
  })

  it('[AC-AI-METRICS-007] 서버가 기간 선택을 무시하면 화면이 그 사실을 밝힌다', async () => {
    const user = userEvent.setup()
    // 지금 떠 있는 서버는 질의 파라미터를 받지 않고 설정된 창을 돌려준다.
    seedAdminInspectionMetrics(makeAdminInspectionMetricsWire(), { honorsWindow: false })
    renderAt('/products/ai-metrics')

    await screen.findByText('1단 룰')
    await user.selectOptions(screen.getByRole('combobox', { name: '집계 기간' }), '7d')

    // 이 안내가 없으면 화면이 24시간 집계를 7일치로 둔갑시킨다.
    expect(await screen.findByText(/서버가 기간 선택을 반영하지 않았어요/)).toBeInTheDocument()
    // 서버가 집계한 창은 요약 카드와 어긋남 안내 양쪽에 적힌다.
    expect(screen.getAllByText(/2026-10-22 00:00/).length).toBeGreaterThan(0)
  })

  it('[AC-AI-METRICS-008] 정책 버전은 적용했을 때만 파라미터로 나가고, 반영되지 않으면 그 사실을 밝힌다', async () => {
    const user = userEvent.setup()
    const requested = recordMetricsRequests()
    renderAt('/products/ai-metrics')

    await screen.findByText('1단 룰')
    await user.type(screen.getByRole('textbox', { name: '정책 버전' }), 'policy-v2')
    // 타이핑만으로 조회가 나가면 글자 수만큼 서버를 두드린다 — 적용을 눌러야 나간다.
    expect(requested.some(url => new URL(url).searchParams.has('policyVersion'))).toBe(false)

    await user.click(screen.getByRole('button', { name: '적용' }))
    await waitFor(() =>
      expect(
        requested.some(url => new URL(url).searchParams.get('policyVersion') === 'policy-v2'),
      ).toBe(true),
    )
    // 표본 응답의 window.policyVersion은 null이라 요청과 어긋난다.
    expect(await screen.findByText(/서버가 정책 버전 선택을 반영하지 않았어요/)).toBeInTheDocument()
  })

  it('[AC-AI-METRICS-009] 적체가 임계를 넘으면 경보로 드러내고 큐로 가는 길을 둔다', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-metrics')

    // 서버가 보낸 경보 문장을 그대로 띄운다 — 주기 로그와 화면이 다른 말을 하지 않게.
    expect(await screen.findByText('어드민 대기 61건이 임계 50건을 넘었어요.')).toBeInTheDocument()
    expect(screen.getByText('처리 대기')).toBeInTheDocument()
    expect(screen.getByText('61건')).toBeInTheDocument()
    // 최장 대기는 분을 사람이 읽는 단위로 바꿔 보여 준다(2,748분 = 1일 21시간).
    expect(screen.getByText('1일 21시간')).toBeInTheDocument()
    expect(screen.getByText('건수 임계 50건')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '검수 큐 열기' }))
    expect(await screen.findByRole('heading', { name: 'AI 검수 큐' })).toBeInTheDocument()
  })

  it('[AC-AI-METRICS-010] 비용은 분모가 다른 건당 비용 둘을 구분해 보여 준다', async () => {
    renderAt('/products/ai-metrics')

    expect(await screen.findByText('창 안의 지출')).toBeInTheDocument()
    expect(screen.getByText('$2.1864')).toBeInTheDocument()
    // 호출이 나간 건당은 룰이 무료로 차단한 건이 분모에서 빠져 과대 보고된다 — 두 분모를
    // 같이 보여 주지 않으면 선별을 켤지 말지를 과대 보고된 숫자로 판단하게 된다.
    expect(screen.getByText('호출이 나간 건당')).toBeInTheDocument()
    expect(screen.getByText('$0.0034')).toBeInTheDocument()
    expect(screen.getByText('닫힌 검수 건당')).toBeInTheDocument()
    expect(screen.getByText('$0.0026')).toBeInTheDocument()

    // 단계별 지출과 지연 — 비평이 쓴 돈과 꼬리 지연이 단계별로 갈려 보여야 한다. '비평'이라는
    // 글자는 지출·지연 양쪽 행에 있어 집기 모호하므로 그 단계의 값으로 집는다.
    expect(screen.getByText(/\$0\.3041/)).toBeInTheDocument()
    expect(screen.getByText(/p95 21\.3초/)).toBeInTheDocument()
    expect(screen.getByText('38.4초')).toBeInTheDocument()
  })

  it('[AC-AI-METRICS-011] 확장 전 서버에서는 퍼널 자리를 0이 아니라 미측정으로 그리고 승급률은 그대로 읽는다', async () => {
    seedAdminInspectionMetrics(makeLegacyAdminInspectionMetricsWire())
    renderAt('/products/ai-metrics')

    // 없는 블록을 0으로 채우면 "오늘 아무 일도 없었다"로 읽힌다.
    expect(await screen.findByText(/서버가 아직 단계별 집계를 주지 않아요/)).toBeInTheDocument()
    expect(screen.queryByText('1단 룰')).not.toBeInTheDocument()
    expect(screen.queryByText('차단율')).not.toBeInTheDocument()

    // 승급률 블록은 확장 전에도 있으므로 손익분기 기준선은 그려야 한다.
    expect(screen.getByText('37.6%')).toBeInTheDocument()
    expect(screen.getByText('손익분기 45.7%')).toBeInTheDocument()
    expect(
      screen.getByText(/건너뛰기율은 승급률의 여집합으로 계산한 값이에요/),
    ).toBeInTheDocument()
  })

  it('[AC-AI-METRICS-012] 서버가 경보 문장을 주지 않으면 불리언에서 만든 문장을 보여 준다', async () => {
    seedAdminInspectionMetrics(makeLegacyAdminInspectionMetricsWire())
    renderAt('/products/ai-metrics')

    // 서버가 경보라고 했는데 화면이 조용한 것이 가장 나쁘다 — 불리언이 말하는 것까지는 적는다.
    expect(await screen.findByText(/어드민 대기가 임계를 넘었어요/)).toBeInTheDocument()
    expect(screen.getByText(/서버가 문장을 주지 않아 화면이 만든 안내예요/)).toBeInTheDocument()
  })

  it('[AC-AI-METRICS-013] 분류되지 않은 검수가 있으면 그 자체를 경보로 드러낸다', async () => {
    const wire = makeAdminInspectionMetricsWire()
    seedAdminInspectionMetrics({
      ...wire,
      funnel: { ...wire.funnel!, unclassifiedCount: 3 },
    })
    renderAt('/products/ai-metrics')

    // 파이프라인에 새 끝맺음이 생겼다는 뜻이다. 조용히 두면 탈출 비율의 합이 100%가 아닌
    // 채로 읽히고 그 차이가 어디서 왔는지 알 길이 없다.
    expect(await screen.findByText('분류되지 않은 검수가 있어요')).toBeInTheDocument()
    expect(screen.getByText(/3건이 어느 탈출로도 분류되지 않았어요/)).toBeInTheDocument()
  })

  it('[AC-AI-METRICS-014] 권한이 없으면 빈 상태가 아니라 권한 안내를 보여 준다', async () => {
    seedAdminInspectionMetrics(null)
    renderAt('/products/ai-metrics')

    // 빈 상태 문구로 떨어지면 "데이터 없음"과 "볼 권한이 없음"이 구분되지 않는다.
    expect(
      await screen.findByText('어드민 권한이 없어 검수 지표를 볼 수 없어요. 관리자 권한을 확인해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('1단 룰')).not.toBeInTheDocument()
  })

  it('[AC-AI-METRICS-015] 퍼널 밖에서 끝난 건(판정 실패·미판정)을 단계 탈출과 섞지 않는다', async () => {
    renderAt('/products/ai-metrics')

    expect(await screen.findByText('어디서 끝났는가')).toBeInTheDocument()
    // 둘 다 통과가 아니고 단계를 끝까지 거치지도 못했다 — 같은 목록에 섞으면 합이 100%인
    // 분포로 읽힌다.
    const note = screen.getByText('퍼널 밖에서 끝난 것 — 단계를 끝까지 거치지 못했어요.')
    // '판정 실패'는 어드민 유입 사유에도 있어 퍼널 밖 목록으로 범위를 좁힌다.
    const terminals = within(note.parentElement as HTMLElement)
    expect(terminals.getByText('판정 실패')).toBeInTheDocument()
    expect(terminals.getByText('미판정')).toBeInTheDocument()
  })
})
