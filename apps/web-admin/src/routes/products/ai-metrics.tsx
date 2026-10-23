import { useState, type ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { Alert, Button, Card, FilterBar, Input, MetricCard } from '@aechak/design-system/web'
import {
  BreakevenMeter,
  CostByStageRows,
  CountFigure,
  DEFAULT_PERIOD_PRESET,
  LatencyRows,
  PERIOD_PRESETS,
  RateFigure,
  StageFunnel,
  UNMEASURED,
  formatCount,
  formatMinuteSpan,
  formatMs,
  formatUsd,
  formatWireDateTime,
  metricsErrorMessage,
  periodToQuery,
  useInspectionMetrics,
  type MetricsQuery,
} from '@/features/ai-review-queue'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { PageIntro } from '@/shared/components/PageIntro'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'

export const Route = createFileRoute('/products/ai-metrics')({
  component: AiReviewMetricsPage,
})

const PAGE_DESCRIPTION =
  'AI 검수가 단계마다 몇 %를 걸러내고, 선별이 비용을 줄이고 있는지, 사람이 볼 몫이 쌓여 있는지 봐요.'

const periodOptions = PERIOD_PRESETS.map(preset => ({ value: preset.value, label: preset.label }))

function AiReviewMetricsPage() {
  const navigate = useNavigate()

  // 기간은 고른 그 순간의 시각으로 한 번 계산해 state에 둔다. 렌더에서 Date.now()를 읽으면
  // 쿼리 키가 매 렌더 달라져 조회가 멈추지 않는다(큐 화면의 대기 시간에서 같은 함정을 봤다).
  const [preset, setPreset] = useState<string>(DEFAULT_PERIOD_PRESET)
  const [range, setRange] = useState(() => periodToQuery(DEFAULT_PERIOD_PRESET, Date.now()))

  // 정책 버전은 타이핑이 아니라 적용을 눌렀을 때만 서버로 나간다 — 글자 수만큼 집계를
  // 다시 돌리게 두면 안 된다. 셀렉트로 두지 않은 이유는 버전 목록을 주는 조회가 없어서다
  // (버전별 비교 EP는 창이 필수인 전수 집계라 목록을 얻으려고 부를 것이 아니다).
  // 값을 지어내 고르게 하는 것은 장식 UI다.
  const [policyInput, setPolicyInput] = useState('')
  const [policyApplied, setPolicyApplied] = useState<string | null>(null)
  const typedPolicy = policyInput.trim() === '' ? null : policyInput.trim()

  const query: MetricsQuery = { ...range, policyVersion: policyApplied }
  const { view, isLoading, isFetching, isError, error, refetch } = useInspectionMetrics(query)

  function changePreset(next: string) {
    setPreset(next)
    setRange(periodToQuery(next, Date.now()))
  }

  function reload() {
    // 기간 창을 지금 시각으로 다시 계산한다. 창이 달라지면 쿼리 키가 달라져 조회가 저절로
    // 나가므로 refetch를 겹쳐 부르지 않는다 — 창 하나를 전수 집계하는 조회라 왕복을 공짜로
    // 늘릴 자리가 아니다. '서버 기본 창'은 창이 늘 같아 refetch가 재조회를 맡는다.
    const next = periodToQuery(preset, Date.now())
    if (next.from === range.from && next.to === range.to) refetch()
    else setRange(next)
  }

  const windowLabel = view
    ? `${formatWireDateTime(view.window.from)} ~ ${formatWireDateTime(view.window.to)}`
    : UNMEASURED
  const hasDerivedAlarm = (view?.alarms ?? []).some(alarm => alarm.derived)

  return (
    <div className="space-y-6 p-6">
      <PageIntro title="AI 검수 지표" description={PAGE_DESCRIPTION} />

      <FilterBar>
        <FilterSelect
          aria-label="집계 기간"
          options={periodOptions}
          value={preset}
          onChange={changePreset}
        />
        <div className="w-44">
          <Input
            aria-label="정책 버전"
            placeholder="정책 버전 (예: policy-v1)"
            value={policyInput}
            onChange={event => setPolicyInput(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="md"
          disabled={typedPolicy === policyApplied}
          onClick={() => setPolicyApplied(typedPolicy)}
        >
          적용
        </Button>
        <Button
          variant="ghost"
          size="md"
          leftIcon={<RefreshCw className="size-4" />}
          disabled={isFetching}
          onClick={reload}
        >
          다시 불러오기
        </Button>
      </FilterBar>

      {/* 실 API 화면은 실패 경로를 반드시 드러낸다 — 빈 상태 문구로 떨어지면 "데이터 없음"과
          "불러오지 못함"이 구분되지 않는다. */}
      {isError && <Alert variant="error">{metricsErrorMessage(error)}</Alert>}

      {isLoading && !view && (
        <p className="text-body-sm text-text-tertiary">검수 지표를 불러오는 중이에요.</p>
      )}

      {view && (
        // 재조회 중에는 스켈레톤으로 바꾸지 않고 이전 숫자를 흐리게만 둔다 — 카드 높이가
        // 튀면서 읽던 숫자가 사라지는 것이 더 나쁘다.
        <div className={`space-y-6 ${isFetching ? 'opacity-60 transition-opacity' : ''}`}>
          {view.alarms.length > 0 && (
            <Alert variant={view.needsAttention ? 'warning' : 'info'} title="지금 눈여겨볼 것">
              <ul className="space-y-1">
                {view.alarms.map(alarm => (
                  <li key={alarm.code} className="break-keep">
                    {alarm.message}
                  </li>
                ))}
              </ul>
              {hasDerivedAlarm && (
                <p className="mt-1.5 break-keep text-caption">
                  서버가 문장을 주지 않아 화면이 만든 안내예요. 주기 로그의 경보 문장과 글자가
                  다를 수 있어요.
                </p>
              )}
            </Alert>
          )}

          <Card padding="md">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
              {/* 세 블록이 같은 수를 들고 있다(창 안에 닫힌 검수 전수) — 먼저 오는 것을 쓴다. */}
              <CountFigure
                label="닫힌 검수"
                count={
                  view.judgment?.settledCount ??
                  view.coverage?.settledCount ??
                  view.funnel?.settledCount ??
                  null
                }
              />
              <div>
                <dt className="text-caption text-text-tertiary">집계 창</dt>
                <dd className="text-body-sm font-medium tabular-nums text-text-primary">
                  {windowLabel}
                </dd>
                <dd className="text-caption text-text-tertiary">
                  측정 {formatWireDateTime(view.window.measuredAt)}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-tertiary">정책 버전</dt>
                <dd className="text-body-sm font-medium text-text-primary">
                  {view.window.policyVersion ?? '전체'}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-tertiary">프롬프트 버전</dt>
                <dd className="text-body-sm font-medium text-text-primary">
                  {view.window.promptVersions.length === 0
                    ? UNMEASURED
                    : `${view.window.promptVersions.length}종`}
                </dd>
                {/* 한 정책 버전 버킷에 프롬프트 버전이 둘 이상이면 BE 설정과 AI 정책 문구가
                    어긋났다는 신호다 — 버전별 비교가 그만큼 거짓이 된다. */}
                {view.window.promptVersions.length > 1 && (
                  <dd className="break-keep text-caption text-warning-fg">
                    프롬프트 버전이 섞여 있어요. BE 설정과 AI 정책 문구 버전이 어긋났을 수 있어요.
                  </dd>
                )}
              </div>
            </dl>
          </Card>

          {view.gaps.period && (
            // 이 안내가 없으면 화면이 24시간 집계를 7일치로 둔갑시킨다.
            <Alert variant="warning">
              서버가 기간 선택을 반영하지 않았어요. 지금 보이는 숫자는 서버가 집계한{' '}
              {windowLabel} 구간이에요.
            </Alert>
          )}

          {view.gaps.policyVersion && (
            <Alert variant="warning">
              서버가 정책 버전 선택을 반영하지 않았어요. 지금 보이는 숫자는{' '}
              {view.window.policyVersion ?? '전체 정책 버전'} 기준이에요.
            </Alert>
          )}

          <Section
            title="단계별 통과율"
            description="막대 폭은 그 단계에 들어온 검수 비율이에요. 단계를 거치며 좁아지는 모양이 걸러낸 양이에요."
          >
            {view.funnel ? (
              <StageFunnel funnel={view.funnel} />
            ) : (
              <MissingBlock>
                서버가 아직 단계별 집계를 주지 않아요. 단계별 탈출 분포는 확장이 배포된 뒤에
                보여요 — 0건으로 그리면 아무 일도 없었던 것처럼 읽히니 비워 둬요.
              </MissingBlock>
            )}
          </Section>

          <Section
            title="승급률과 손익분기"
            description="선별이 비용을 줄이는지 늘리는지가 이 한 숫자에 걸려 있어요."
          >
            {view.promotion ? (
              <BreakevenMeter promotion={view.promotion} />
            ) : (
              <MissingBlock>
                서버가 승급률을 주지 않아요. 선별이 돈 검수가 없으면 분모가 0이라 비율 자체가
                없어요.
              </MissingBlock>
            )}
          </Section>

          <Section
            title="적체"
            description="사람이 볼 몫이 얼마나 쌓였는지. 임계를 넘으면 주기 로그도 같은 조건으로 경보해요."
            action={
              <Button variant="secondary" size="sm" onClick={() => navigate({ to: '/products/ai-queue' })}>
                검수 큐 열기
              </Button>
            }
          >
            {view.backlog ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <MetricCard
                    label="처리 대기"
                    value={`${formatCount(view.backlog.openCount)}건`}
                    variant={view.backlog.breachedBy.includes('count') ? 'urgent' : 'quiet'}
                    footer={`건수 임계 ${formatCount(view.backlog.warnCount)}건`}
                  />
                  <MetricCard
                    label="최장 대기"
                    value={formatMinuteSpan(view.backlog.oldestWaitMinutes)}
                    variant={view.backlog.breachedBy.includes('age') ? 'urgent' : 'quiet'}
                    footer={`대기 임계 ${formatMinuteSpan(view.backlog.warnAgeMinutes)}`}
                  />
                  <MetricCard
                    label="지문이 어긋난 건"
                    value={`${formatCount(view.backlog.staleOpenCount)}건`}
                    variant="quiet"
                    footer="셀러가 내용을 고쳐 이 검수로는 결정할 수 없어요"
                  />
                </div>

                {view.backlog.breached && (
                  <p className="break-keep text-body-sm text-warning-fg">
                    임계를 넘었어요 — 사람 검수 단계가 있다는 말이 사실이 아니게 되는 구간이에요.
                  </p>
                )}

                {view.backlog.byReason.length > 0 && (
                  <div className="space-y-1.5 border-t border-border-subtle pt-3">
                    <p className="text-label font-semibold text-text-secondary">대기 사유</p>
                    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {view.backlog.byReason.map(row => (
                        <li key={row.reason} className="flex items-center gap-1.5">
                          <StatusMetaPill meta={row.meta} />
                          <span className="text-caption tabular-nums text-text-secondary">
                            {formatCount(row.count)}건
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <MissingBlock>서버가 적체를 주지 않아요.</MissingBlock>
            )}
          </Section>

          <Section
            title="비용"
            description="건당 비용은 분모가 둘이에요. 룰이 무료로 차단한 건을 분모에 넣는지가 그 차이예요."
          >
            {view.cost ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <MetricCard
                    label="창 안의 지출"
                    value={formatUsd(view.cost.totalCostMicroUsd)}
                    variant="quiet"
                    footer={`호출 ${formatCount(view.cost.callCount)}회`}
                  />
                  <MetricCard
                    label="호출이 나간 건당"
                    value={formatUsd(view.cost.costPerInspectionMicroUsd)}
                    variant="quiet"
                    footer="룰 차단 / 스텁 건이 분모에서 빠져 비싸게 보여요"
                  />
                  <MetricCard
                    label="닫힌 검수 건당"
                    value={formatUsd(view.cost.costPerSettledInspectionMicroUsd)}
                    variant="quiet"
                    footer="닫힌 검수 전수를 분모로 한 값이에요"
                  />
                  <MetricCard
                    label="캐시 미적중 호출"
                    value={
                      view.cost.cacheMissCallCount == null
                        ? UNMEASURED
                        : `${formatCount(view.cost.cacheMissCallCount)}회`
                    }
                    variant="quiet"
                    // 선별 프롬프트가 Haiku의 최소 캐시 길이보다 짧아 cache_control이 조용히
                    // 무시되는 자리다 — 선별이 0이 아닌 것은 정상이고 관점 호출이 0이면 사건이다.
                    footer="선별은 0이 아닌 게 정상, 관점 호출이 0이면 사건이에요"
                  />
                </div>

                <div className="space-y-2 border-t border-border-subtle pt-3">
                  <p className="text-label font-semibold text-text-secondary">단계별 지출</p>
                  <CostByStageRows
                    rows={view.cost.stages}
                    totalCostMicroUsd={view.cost.totalCostMicroUsd}
                  />
                  {view.cost.hasUnattributed && (
                    <p className="break-keep text-caption text-warning-fg">
                      단계를 가를 수 없는 행이 있어요. 비평과 수정 문구가 원장에 같은 관점으로
                      적힌 구버전 데이터이고, 합계에서 빼지는 않았어요.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <MissingBlock>서버가 비용을 주지 않아요.</MissingBlock>
            )}
          </Section>

          <Section
            title="지연"
            description="끝에서 끝은 단계별 지연의 합과 달라요 — 큐 대기 / 재시도 / 카프카 왕복이 거기 들어 있어요."
          >
            {view.latency ? (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3">
                  <div>
                    <dt className="text-caption text-text-tertiary">등록부터 노출까지 p50</dt>
                    <dd className="text-body-sm font-medium tabular-nums text-text-primary">
                      {formatMs(view.latency.endToEnd?.p50Ms ?? null)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-text-tertiary">등록부터 노출까지 p95</dt>
                    <dd className="text-body-sm font-medium tabular-nums text-text-primary">
                      {formatMs(view.latency.endToEnd?.p95Ms ?? null)}
                    </dd>
                  </div>
                  <CountFigure
                    label="표본"
                    count={view.latency.endToEnd?.sampleCount ?? null}
                  />
                </dl>
                <div className="space-y-2 border-t border-border-subtle pt-3">
                  <p className="text-label font-semibold text-text-secondary">단계별 지연</p>
                  <LatencyRows rows={view.latency.stages} />
                </div>
              </div>
            ) : (
              <MissingBlock>서버가 지연을 주지 않아요.</MissingBlock>
            )}
          </Section>

          <Section title="최종 판정" description="퍼널 탈출의 합과 맞아야 하는 교차 검증 수치예요.">
            {view.judgment ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-5">
                <CountFigure label="AI 통과" count={view.judgment.passCount} />
                <CountFigure label="AI 보류" count={view.judgment.flagCount} />
                <CountFigure label="미판정으로 닫힘" count={view.judgment.unjudgedCount} />
                <CountFigure label="판정 실패로 닫힘" count={view.judgment.failedCount} />
                <RateFigure
                  label="통과율"
                  rate={view.judgment.passRate}
                  basis="분모는 닫힌 검수 전수"
                />
              </dl>
            ) : (
              <MissingBlock>서버가 최종 판정 분포를 주지 않아요.</MissingBlock>
            )}
          </Section>

          <Section
            title="사람 개입"
            description="어디까지 자동이고 어디부터 사람인가. 허용 비율이 높으면 AI가 과탐이라는 뜻이에요."
          >
            {view.adminReview ? (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
                  <RateFigure
                    label="어드민 유입률"
                    rate={view.adminReview.inflowRate}
                    basis={`유입 ${formatCount(view.adminReview.inflowCount)}건 / 분모는 닫힌 검수 전수`}
                  />
                  <RateFigure
                    label="허용 비율"
                    rate={view.adminReview.allowRate}
                    basis={`결정 ${formatCount(view.adminReview.decidedCount)}건 중 허용 ${formatCount(view.adminReview.allowedCount)}건`}
                  />
                  <div>
                    <dt className="text-caption text-text-tertiary">결정까지 걸린 시간</dt>
                    <dd className="text-body-sm font-medium tabular-nums text-text-primary">
                      p50 {formatMinuteSpan(view.adminReview.decisionP50Minutes)} / p95{' '}
                      {formatMinuteSpan(view.adminReview.decisionP95Minutes)}
                    </dd>
                  </div>
                  <CountFigure label="이의 유입" count={view.adminReview.appealInflowCount} />
                </dl>

                {view.adminReview.byReason.length > 0 && (
                  <div className="space-y-1.5 border-t border-border-subtle pt-3">
                    <p className="text-label font-semibold text-text-secondary">유입 사유</p>
                    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {view.adminReview.byReason.map(row => (
                        <li key={row.reason} className="flex items-center gap-1.5">
                          <StatusMetaPill meta={row.meta} />
                          <span className="text-caption tabular-nums text-text-secondary">
                            {formatCount(row.count)}건
                          </span>
                        </li>
                      ))}
                    </ul>
                    {view.adminReview.reasonSumShort && (
                      // 등재 사유는 최초 이유만 남으므로 이의가 나중에 붙은 행은 처음 사유로
                      // 세어진다 — 적지 않으면 표가 잘못됐다고 읽힌다.
                      <p className="break-keep text-caption text-text-tertiary">
                        사유별 합이 유입 건수보다 적어요. 등재 사유는 처음 큐에 올라온 까닭만
                        남고, 나중에 붙은 이의는 이의 유입으로 따로 세고 있어요.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <MissingBlock>서버가 사람 개입 집계를 주지 않아요.</MissingBlock>
            )}
          </Section>

          <Section
            title="검수 누락"
            description="아무도 내용을 보지 않은 채 닫힌 비율이에요. 선별이 놓친 비율은 아니에요."
          >
            {view.coverage ? (
              <div className="space-y-2">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3">
                  <RateFigure
                    label="무검수 비율"
                    rate={view.coverage.unverifiedRate}
                    basis={`${formatCount(view.coverage.unverifiedCount)}건 / 분모는 닫힌 검수 전수`}
                  />
                  <CountFigure
                    label="선별이 건너뛴 통과"
                    count={view.coverage.triageSkippedPassCount}
                  />
                  <div>
                    <dt className="text-caption text-text-tertiary">선별 누락 확증</dt>
                    <dd className="text-body-sm font-medium text-text-primary">
                      {view.coverage.triageMissConfirmed == null
                        ? UNMEASURED
                        : view.coverage.triageMissConfirmed
                          ? '확인됐어요'
                          : '확인된 건 없어요'}
                    </dd>
                  </div>
                </dl>
                {/* 이 분자는 상품 경로에서 올라갈 수 없어 거의 항상 0이다. 0을 "놓친 게 없다"로
                    읽으면 선별형 설계의 핵심 위험을 못 보는 상태가 된다. */}
                <p className="break-keep text-caption text-text-tertiary">
                  선별 누락 확증은 구조적으로 거의 0이에요 — 확인된 건이 없다는 것이 놓친 게
                  없다는 뜻은 아니에요. 그건 아래 표본 재검으로만 알 수 있어요.
                </p>
              </div>
            ) : (
              <MissingBlock>서버가 누락 집계를 주지 않아요.</MissingBlock>
            )}
          </Section>

          <Section
            title="표본 재검"
            description="선별이 건너뛴 통과를 사람이 다시 본 결과예요. 선별형 설계의 위험을 재는 유일한 수단이에요."
          >
            {view.triageAudit ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-5">
                <RateFigure
                  label="누락률"
                  rate={view.triageAudit.missRate}
                  basis={`분모는 사람이 본 표본 ${formatCount(view.triageAudit.reviewedCount)}건`}
                />
                <CountFigure label="뽑은 표본" count={view.triageAudit.sampledCount} />
                <CountFigure label="위반을 찾은 표본" count={view.triageAudit.violationFoundCount} />
                <CountFigure label="판단 불가 표본" count={view.triageAudit.undecidedCount} />
                <div>
                  <dt className="text-caption text-text-tertiary">마지막 표본 추출</dt>
                  <dd className="text-body-sm font-medium tabular-nums text-text-primary">
                    {formatWireDateTime(view.triageAudit.lastSampledAt)}
                  </dd>
                </div>
              </dl>
            ) : (
              <MissingBlock>
                서버에 표본 재검 테이블이 아직 없어요. 같은 내용을 같은 정책으로 다시 검수할 수
                없어 재검은 사람 눈이고, 그 결과를 적을 자리가 생기면 여기에 누락률이 보여요.
              </MissingBlock>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <h2 className="text-subheading font-semibold text-text-primary">{title}</h2>
          <p className="break-keep text-caption text-text-tertiary">{description}</p>
        </div>
        {action}
      </div>
      <Card padding="md">{children}</Card>
    </section>
  )
}

/**
 * 서버가 그 블록을 아직 주지 않을 때의 자리.
 *
 * 0으로 채우지 않는 것이 이 화면의 규칙이다 — 집계가 0인 것과 집계가 없는 것은 전혀 다른
 * 사실이고, 운영자는 0을 보고 "오늘 아무 일도 없었다"로 읽는다.
 */
function MissingBlock({ children }: { children: ReactNode }) {
  return <p className="break-keep text-body-sm text-text-tertiary">{children}</p>
}
