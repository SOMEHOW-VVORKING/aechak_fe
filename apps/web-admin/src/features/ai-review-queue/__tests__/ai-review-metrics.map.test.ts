import { describe, expect, it } from 'vitest'
import type { AdminInspectionMetricsData, InspectionMetricsFunnel } from '@aechak/api'
import {
  EMPTY_METRICS_QUERY,
  HARNESS_BREAKEVEN_RATE,
  UNMEASURED,
  costStageLabel,
  exitLabel,
  formatCount,
  formatMinuteSpan,
  formatMs,
  formatRate,
  formatUsd,
  periodToQuery,
  toAlarms,
  toBacklogView,
  toCostView,
  toFunnelView,
  toMetricsView,
  toPromotionView,
  toWindowView,
  toWireLocalDateTime,
  windowGaps,
} from '../ai-review-metrics.map'

// 지표 매퍼 단위 테스트. 서버가 주는 값과 주지 않는 값을 한 화면에 섞어 놓는 층이라, 분기마다
// "0으로 채우지 않는다"와 "분모를 바꿔치지 않는다"를 고정하는 것이 이 파일의 일이다.

const emptyData: AdminInspectionMetricsData = {}

function funnelOf(overrides: Partial<InspectionMetricsFunnel> = {}): InspectionMetricsFunnel {
  return {
    settledCount: 1000,
    unclassifiedCount: 0,
    exits: [],
    ...overrides,
  }
}

describe('ai-review-metrics.map', () => {
  it('[AC-AI-METRICS-M001] 질의 창은 UTC가 아니라 로컬 시각을 오프셋 없이 적는다', () => {
    // 서버는 오프셋 없는 LocalDateTime으로 받아 그대로 읽는다. toISOString()을 쓰면 UTC가
    // 나가 집계 창이 시간대만큼(한국이면 9시간) 통째로 밀린다.
    const local = new Date(2026, 9, 22, 7, 5, 3)
    expect(toWireLocalDateTime(local)).toBe('2026-10-22T07:05:03')
    expect(toWireLocalDateTime(local)).not.toContain('Z')
    // 로컬 시계의 시각과 같아야 한다 — 오프셋이 0이 아닌 지역에서는 UTC 표기와 갈린다.
    expect(toWireLocalDateTime(local).slice(11, 13)).toBe('07')
  })

  it('[AC-AI-METRICS-M002] 서버 기본 창은 파라미터를 비우고, 기간을 고르면 from만 채운다', () => {
    const now = new Date(2026, 9, 23, 9, 0, 0).getTime()
    expect(periodToQuery('server', now)).toEqual({ from: null, to: null })
    // to를 굳히면 화면을 열어 둔 채 시간이 흐를 때 창의 끝이 과거에 멈춘다.
    expect(periodToQuery('7d', now)).toEqual({ from: '2026-10-16T09:00:00', to: null })
    // 모르는 선택지는 서버 기본 창으로 떨어진다(없는 창을 만들지 않는다).
    expect(periodToQuery('100y', now)).toEqual({ from: null, to: null })
  })

  it('[AC-AI-METRICS-M003] 창이 1분 안쪽으로 다르면 어긋남이 아니고, 그보다 크면 어긋남이다', () => {
    const window = toWindowView({
      window: { from: '2026-10-16T09:00:30', to: '2026-10-23T09:00:00', measuredAt: '2026-10-23T09:00:00' },
    })
    // 서버가 초를 버리거나 올리는 것은 어긋남이 아니다 — 그걸 경보로 올리면 안내가 상시 켜진다.
    expect(windowGaps({ from: '2026-10-16T09:00:00', to: null, policyVersion: null }, window).period).toBe(
      false,
    )
    // 설정 창(24시간)을 돌려주는 서버에 7일을 요청한 경우가 이것이다.
    expect(windowGaps({ from: '2026-10-22T09:00:00', to: null, policyVersion: null }, window).period).toBe(
      true,
    )
    // 기간을 고르지 않았으면 비교 대상이 없어 어긋남도 없다.
    expect(windowGaps(EMPTY_METRICS_QUERY, window).period).toBe(false)
  })

  it('[AC-AI-METRICS-M004] 요청한 정책 버전이 응답에 없으면 어긋남이다', () => {
    const served = toWindowView({
      window: {
        from: '2026-10-22T00:00:00',
        to: '2026-10-23T00:00:00',
        measuredAt: '2026-10-23T09:00:00',
        policyVersion: 'policy-v1',
      },
    })
    expect(windowGaps({ from: null, to: null, policyVersion: 'policy-v2' }, served).policyVersion).toBe(
      true,
    )
    expect(windowGaps({ from: null, to: null, policyVersion: 'policy-v1' }, served).policyVersion).toBe(
      false,
    )
    // 서버가 버전 필터를 무시하고 전체를 집계한 경우(응답 policyVersion이 null)도 어긋남이다.
    const all = toWindowView({
      window: { from: '2026-10-22T00:00:00', to: '2026-10-23T00:00:00', measuredAt: '2026-10-23T09:00:00' },
    })
    expect(windowGaps({ from: null, to: null, policyVersion: 'policy-v1' }, all).policyVersion).toBe(true)
  })

  it('[AC-AI-METRICS-M005] window 블록이 없으면 flat 필드로 떨어지고 창의 끝은 측정 시각이다', () => {
    const view = toWindowView({
      windowFrom: '2026-10-22T09:00:00',
      measuredAt: '2026-10-23T09:00:00',
      windowHours: 24,
    })
    expect(view.from).toBe('2026-10-22T09:00:00')
    // flat 응답에는 창의 끝이 따로 없다 — 서버가 now까지 세므로 측정 시각이 끝이다.
    expect(view.to).toBe('2026-10-23T09:00:00')
    expect(view.policyVersion).toBeNull()
    expect(view.promptVersions).toEqual([])
  })

  it('[AC-AI-METRICS-M006] 승급률은 stage2를 먼저 읽고 없으면 promotion으로 떨어진다', () => {
    const fromStage2 = toPromotionView({
      funnel: funnelOf({
        stage2: {
          enteredCount: 644,
          clearedCount: 402,
          promotedCount: 242,
          skipRate: 0.6242,
          promotionRate: 0.3758,
          breakevenRate: 0.457,
          overBreakeven: false,
        },
      }),
    })
    expect(fromStage2?.source).toBe('funnel')
    expect(fromStage2?.skipRate).toBe(0.6242)

    const fromPromotion = toPromotionView({
      promotion: {
        triagedCount: 644,
        clearedCount: 402,
        promotedCount: 242,
        promotionRate: 0.3758,
        breakevenRate: 0.457,
        overBreakeven: false,
      },
    })
    expect(fromPromotion?.source).toBe('promotion')
    // 확장 전 블록에는 건너뛰기율이 없어 승급률의 여집합으로 만든다.
    expect(fromPromotion?.skipRate).toBeCloseTo(0.6242, 4)
    expect(toPromotionView(emptyData)).toBeNull()
  })

  it('[AC-AI-METRICS-M007] 승급률이 미측정이면 건너뛰기율도 미측정이다', () => {
    // 선별이 한 번도 돌지 않으면 분모가 0이라 비율 자체가 없다. 여집합을 만들면 100%가 되어
    // "전부 건너뛰었다"는 정반대 뜻이 된다.
    const view = toPromotionView({
      promotion: {
        triagedCount: 0,
        clearedCount: 0,
        promotedCount: 0,
        promotionRate: null,
        breakevenRate: 0.457,
        overBreakeven: false,
      },
    })
    expect(view?.promotionRate).toBeNull()
    expect(view?.skipRate).toBeNull()
  })

  it('[AC-AI-METRICS-M008] 손익분기가 하네스 정본과 같으면 다툼으로 표시하지 않는다', () => {
    const agreed = toPromotionView({
      promotion: {
        triagedCount: 10,
        clearedCount: 6,
        promotedCount: 4,
        promotionRate: 0.4,
        breakevenRate: HARNESS_BREAKEVEN_RATE,
        overBreakeven: false,
      },
    })
    expect(agreed?.breakevenDisputed).toBe(false)

    const disputed = toPromotionView({
      promotion: {
        triagedCount: 10,
        clearedCount: 6,
        promotedCount: 4,
        promotionRate: 0.4,
        breakevenRate: 0.457,
        overBreakeven: false,
      },
    })
    expect(disputed?.breakevenDisputed).toBe(true)
  })

  it('[AC-AI-METRICS-M009] 탈출은 퍼널 안과 퍼널 밖으로 갈라진다', () => {
    const view = toFunnelView(
      funnelOf({
        settledCount: 100,
        exits: [
          { stage: 1, exit: 'RULE_BLOCKED', label: '룰 확정 차단', count: 10, shareOfSettled: 0.1 },
          { stage: 0, exit: 'VERDICT_FAILED', label: '판정 실패', count: 2, shareOfSettled: 0.02 },
          { stage: 0, exit: 'UNJUDGED', label: '미판정', count: 1, shareOfSettled: 0.01 },
        ],
      }),
    )
    expect(view.exits.map(row => row.exit)).toEqual(['RULE_BLOCKED'])
    // 실패 터미널을 단계 탈출과 섞으면 합이 100%인 분포로 읽힌다.
    expect(view.terminals.map(row => row.exit)).toEqual(['VERDICT_FAILED', 'UNJUDGED'])
  })

  it('[AC-AI-METRICS-M010] 서버가 비율을 주지 않으면 분모로 계산하고 분모가 0이면 미측정이다', () => {
    const counted = toFunnelView(
      funnelOf({
        settledCount: 200,
        exits: [{ stage: 2, exit: 'TRIAGE_CLEARED', label: null, count: 50 }],
      }),
    )
    expect(counted.exits[0]?.share).toBe(0.25)

    const empty = toFunnelView(
      funnelOf({
        settledCount: 0,
        exits: [{ stage: 2, exit: 'TRIAGE_CLEARED', label: null, count: 0 }],
      }),
    )
    // 0 / 0을 0%로 적으면 "한 건도 안 돌았다"와 "돌았는데 하나도 안 걸렀다"가 같아진다.
    expect(empty.exits[0]?.share).toBeNull()
  })

  it('[AC-AI-METRICS-M011] 모르는 탈출·단계는 원문과 함께 알 수 없음으로 적는다', () => {
    // 서버 열거는 실제로 늘어난다(TRIAGE가 그렇게 추가됐다). Record 조회를 그대로 쓰면
    // undefined가 라벨 자리에 들어가 화면이 백지가 된다.
    expect(exitLabel('BRAND_NEW_EXIT', null)).toBe('알 수 없음 (BRAND_NEW_EXIT)')
    // 서버가 라벨을 보내면 화면 표보다 그쪽을 믿는다.
    expect(exitLabel('BRAND_NEW_EXIT', '새 탈출')).toBe('새 탈출')
    expect(exitLabel('RULE_BLOCKED', null)).toBe('룰 확정 차단')
    expect(costStageLabel('BRAND_NEW_STAGE')).toBe('알 수 없음 (BRAND_NEW_STAGE)')
    expect(costStageLabel('CRITIC')).toBe('비평')
  })

  it('[AC-AI-METRICS-M012] 비평 호출이 관측되지 않으면 뒤집힘율 분모에 경고를 단다', () => {
    const view = toFunnelView(
      funnelOf({
        stage4: {
          enteredCount: 100,
          overturnedCount: 0,
          upheldCount: 100,
          overturnRate: 0,
          escalationObserved: false,
        },
      }),
    )
    // 승급이 꺼지면 비평이 돌지 않는데 모델 위반 건은 그대로 분모에 들어온다 — 뒤집힘율이
    // 0에 가깝게 나오고 그 수치로 "비평이 쓸모없다"는 반대 결론이 나올 수 있다.
    expect(view.stages[3]?.caveat).toContain('비평 호출이 원장에서 관측되지 않았어요')

    const observed = toFunnelView(
      funnelOf({
        stage4: {
          enteredCount: 100,
          overturnedCount: 14,
          upheldCount: 86,
          overturnRate: 0.14,
          escalationObserved: true,
        },
      }),
    )
    expect(observed.stages[3]?.caveat).toBeNull()
  })

  it('[AC-AI-METRICS-M013] 3단은 응답이 오지 않은 건이 분모에서 빠진 사실을 적는다', () => {
    const view = toFunnelView(
      funnelOf({
        stage3: {
          enteredCount: 300,
          respondedCount: 280,
          violationFoundCount: 90,
          clearCount: 190,
          detectionRate: 0.3214,
        },
      }),
    )
    // 레이트 리밋으로 못 본 건을 분모에 넣으면 검출율이 모델 품질이 아니라 가용성을 재게 된다.
    expect(view.stages[2]?.caveat).toContain('20건은 응답이 오지 않아')
  })

  it('[AC-AI-METRICS-M014] 서버 경보 문장이 있으면 그대로 쓰고 화면이 만들지 않는다', () => {
    const alarms = toAlarms({
      alarms: [{ code: 'BACKLOG_COUNT', message: '어드민 대기 61건이 임계 50건을 넘었어요.' }],
      needsAttention: true,
      backlog: {
        openCount: 61,
        staleOpenCount: 0,
        warnCount: 50,
        warnAgeMinutes: 1440,
        breached: true,
      },
    })
    // 주기 로그와 화면이 다른 문장을 쓰면 같은 상황을 두 사람이 다르게 읽는다.
    expect(alarms).toHaveLength(1)
    expect(alarms[0]?.derived).toBe(false)
    expect(alarms[0]?.message).toBe('어드민 대기 61건이 임계 50건을 넘었어요.')
  })

  it('[AC-AI-METRICS-M015] 서버 문장이 없으면 불리언이 말하는 것만 만들고, 설명이 없으면 그 사실을 적는다', () => {
    const derived = toAlarms({
      needsAttention: true,
      backlog: {
        openCount: 61,
        staleOpenCount: 0,
        oldestWaitMinutes: 2748,
        warnCount: 50,
        warnAgeMinutes: 1440,
        breached: true,
      },
      coverage: { settledCount: 100, unverifiedCount: 1, triageMissConfirmed: true },
    })
    expect(derived.map(alarm => alarm.code)).toEqual(['BACKLOG', 'TRIAGE_MISS'])
    expect(derived.every(alarm => alarm.derived)).toBe(true)
    expect(derived[0]?.message).toContain('1일 21시간')

    // 서버가 경보라고 했는데 설명할 불리언이 하나도 없는 경우 — 화면이 조용하면 안 된다.
    const unexplained = toAlarms({ needsAttention: true })
    expect(unexplained.map(alarm => alarm.code)).toEqual(['NEEDS_ATTENTION'])

    // 경보 조건이 아니면 아무 문장도 만들지 않는다.
    expect(toAlarms({ needsAttention: false })).toEqual([])
  })

  it('[AC-AI-METRICS-M016] 적체의 임계 초과 축은 서버 판정 조건과 같다', () => {
    const both = toBacklogView({
      backlog: {
        openCount: 50,
        staleOpenCount: 0,
        oldestWaitMinutes: 1440,
        warnCount: 50,
        warnAgeMinutes: 1440,
        breached: true,
      },
    })
    // 서버는 >= 로 판정한다(초과가 아니라 도달).
    expect(both?.breachedBy).toEqual(['count', 'age'])

    const noneOpen = toBacklogView({
      backlog: {
        openCount: 0,
        staleOpenCount: 0,
        oldestWaitMinutes: null,
        warnCount: 50,
        warnAgeMinutes: 0,
        breached: false,
      },
    })
    // 열린 건이 없으면 대기 시각이 아예 없다 — 임계가 0이어도 나이 축은 넘지 않은 것이다.
    expect(noneOpen?.breachedBy).toEqual([])
  })

  it('[AC-AI-METRICS-M017] 단계를 가를 수 없는 지출은 단계 미상으로 적고 합계에서 빼지 않는다', () => {
    const view = toCostView({
      cost: {
        callCount: 10,
        inspectionCount: 5,
        totalCostMicroUsd: 1000,
        byStage: {
          TRIAGE: { callCount: 5, costMicroUsd: 400 },
          ALL: { callCount: 5, costMicroUsd: 600 },
        },
      },
    })
    expect(view?.hasUnattributed).toBe(true)
    // 금액 내림차순이라 ALL이 먼저다. 이름은 '단계 미상'이고 금액은 그대로 남는다.
    expect(view?.stages[0]?.stageLabel).toBe('단계 미상')
    expect(view?.stages[0]?.unattributed).toBe(true)
    expect(view?.stages.reduce((sum, row) => sum + row.costMicroUsd, 0)).toBe(1000)
    // 확장 뒤에는 비평·수정 문구가 갈려 오므로 그 표시가 사라진다.
    const split = toCostView({
      cost: {
        callCount: 10,
        inspectionCount: 5,
        totalCostMicroUsd: 1000,
        byStage: { CRITIC: { callCount: 5, costMicroUsd: 600 }, REWRITE: { callCount: 5, costMicroUsd: 400 } },
      },
    })
    expect(split?.hasUnattributed).toBe(false)
  })

  it('[AC-AI-METRICS-M018] 값이 없으면 0이 아니라 미측정으로 적는다', () => {
    expect(formatRate(null)).toBe(UNMEASURED)
    expect(formatRate(0)).toBe('0.0%')
    expect(formatRate(0.3758)).toBe('37.6%')
    expect(formatCount(null)).toBe(UNMEASURED)
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1507)).toBe('1,507')
    expect(formatUsd(null)).toBe(UNMEASURED)
    expect(formatUsd(2186400)).toBe('$2.1864')
    expect(formatMinuteSpan(null)).toBe(UNMEASURED)
    expect(formatMs(null)).toBe(UNMEASURED)
  })

  it('[AC-AI-METRICS-M019] 경과 시간과 지연은 읽는 단위로 바꿔 적는다', () => {
    expect(formatMinuteSpan(2748)).toBe('1일 21시간')
    expect(formatMinuteSpan(94)).toBe('1시간 34분')
    expect(formatMinuteSpan(0)).toBe('0분')
    expect(formatMinuteSpan(1440)).toBe('1일')
    // 음수가 와도 과거로 적지 않는다(시계가 어긋난 경우).
    expect(formatMinuteSpan(-5)).toBe('0분')
    expect(formatMs(980)).toBe('980ms')
    expect(formatMs(38400)).toBe('38.4초')
  })

  it('[AC-AI-METRICS-M020] 블록이 하나도 없는 응답은 전부 null이고 0으로 채우지 않는다', () => {
    const view = toMetricsView(emptyData, EMPTY_METRICS_QUERY)
    expect(view.funnel).toBeNull()
    expect(view.judgment).toBeNull()
    expect(view.promotion).toBeNull()
    expect(view.coverage).toBeNull()
    expect(view.adminReview).toBeNull()
    expect(view.backlog).toBeNull()
    expect(view.cost).toBeNull()
    expect(view.latency).toBeNull()
    expect(view.triageAudit).toBeNull()
    expect(view.alarms).toEqual([])
    expect(view.needsAttention).toBe(false)
    // 창도 비어 있으면 어긋남 판정을 하지 않는다 — 비교할 값이 없다.
    expect(view.gaps).toEqual({ period: false, policyVersion: false })
  })

  it('[AC-AI-METRICS-M021] 유입 사유별 합이 유입 건수보다 적으면 그 사실을 들고 있는다', () => {
    const view = toMetricsView(
      {
        adminReview: {
          inflowCount: 119,
          inflowByReason: { OVERBLOCK_SUSPECT: 71, CRITIC_OVERTURNED: 14 },
          decidedCount: 58,
          allowedCount: 41,
          blockedCount: 17,
        },
      },
      EMPTY_METRICS_QUERY,
    )
    // 등재 사유는 최초 이유만 남으므로 나중에 붙은 이의는 처음 사유로 세어진다 — 적지 않으면
    // 표가 잘못됐다고 읽힌다.
    expect(view.adminReview?.reasonSumShort).toBe(true)
    // 사유 라벨은 큐 화면과 같은 표를 쓴다(운영자가 두 화면에서 같은 말을 본다).
    expect(view.adminReview?.byReason[0]?.meta.label).toBe('과탐 의심')
  })
})
