import { http, HttpResponse } from 'msw'
import { adminBase, errorBody } from './base'

// ─── AI 검수 운영 지표 (admin 호스트 /admin/inspection-metrics) ────────────────
// 응답 모양이 **배포 순서에 따라 두 가지**다. 지금 떠 있는 서버는 flat 창 필드 넷과
// promotion·coverage·cost·backlog만 주고, 확장이 배포되면 window·alarms·funnel·judgment·
// adminReview·latency·triageAudit와 cost.byStage가 함께 실린다. 둘 다 스텁으로 둬서 화면이
// "서버가 아직 주지 않음"을 0으로 둔갑시키지 않는지 테스트가 고정한다.

export const ADMIN_INSPECTION_METRICS_URL = `${adminBase}/admin/inspection-metrics`

/** 확장 응답의 블록 모양. 화면이 읽는 필드만 적는다(서버 레코드와 이름이 같다). */
export interface AdminInspectionMetricsWire {
  windowFrom?: string
  measuredAt?: string
  windowHours?: number
  needsAttention?: boolean
  window?: {
    from: string
    to: string
    measuredAt: string
    windowHours?: number | null
    policyVersion?: string | null
    targetType?: 'PRODUCT' | 'REVIEW' | null
    promptVersions?: Record<string, number>
  }
  alarms?: { code: string; message: string }[]
  funnel?: {
    settledCount: number
    unclassifiedCount?: number
    exits: {
      stage: number
      exit: string
      label?: string | null
      count: number
      shareOfSettled?: number | null
    }[]
    stage1?: {
      name?: string
      enteredCount: number
      blockedCount: number
      blockRate?: number | null
    }
    stage2?: {
      name?: string
      enteredCount: number
      clearedCount: number
      promotedCount: number
      callFailedCount?: number | null
      bypassedByRuleHitCount?: number | null
      skipRate?: number | null
      promotionRate?: number | null
      breakevenRate: number
      overBreakeven: boolean
    }
    stage3?: {
      name?: string
      enteredCount: number
      respondedCount: number
      violationFoundCount: number
      clearCount: number
      detectionRate?: number | null
    }
    stage4?: {
      name?: string
      enteredCount: number
      overturnedCount: number
      upheldCount: number
      overturnRate?: number | null
      escalationObserved?: boolean | null
    }
    stage5?: {
      name?: string
      flagCount: number
      passCount: number
      failedCount: number
      unjudgedCount: number
    }
  }
  judgment?: {
    settledCount: number
    passCount: number
    flagCount: number
    unjudgedCount: number
    failedCount: number
    passRate?: number | null
  }
  promotion?: {
    triagedCount: number
    promotedCount: number
    clearedCount: number
    callFailedCount?: number | null
    promotionRate?: number | null
    breakevenRate: number
    overBreakeven: boolean
  }
  coverage?: {
    settledCount: number
    unverifiedCount: number
    unjudgedCount?: number
    verdictFailedCount?: number
    modelUnverifiedCount?: number
    triageSkippedPassCount?: number
    triageSkippedBlockedCount?: number
    unverifiedRate?: number | null
    triageMissConfirmed?: boolean
  }
  adminReview?: {
    inflowCount: number
    inflowRate?: number | null
    inflowByReason?: Record<string, number>
    appealInflowCount?: number
    decidedCount: number
    allowedCount: number
    blockedCount: number
    allowRate?: number | null
    decisionLatency?: {
      p50Minutes?: number | null
      p95Minutes?: number | null
      sampleCount: number
    }
  }
  backlog?: {
    openCount: number
    // dev 서버(2026-11-07)는 이 둘 대신 openByLatestJudgment를 준다
    staleOpenCount?: number
    oldestWaitingSince?: string | null
    oldestWaitMinutes?: number | null
    openByReason?: Record<string, number>
    warnCount: number
    warnAgeMinutes: number
    breached: boolean
  }
  cost?: {
    callCount: number
    inspectionCount: number
    totalCostMicroUsd: number
    triageCostMicroUsd?: number
    cacheMissCallCount?: number
    costPerInspectionMicroUsd?: number | null
    costPerSettledInspectionMicroUsd?: number | null
    byStage?: Record<
      string,
      {
        callCount: number
        costMicroUsd: number
        cacheMissCallCount?: number | null
        costPerSettledMicroUsd?: number | null
      }
    >
  }
  latency?: {
    endToEnd?: { p50Ms?: number | null; p95Ms?: number | null; sampleCount: number }
    byStage?: Record<string, { p50Ms?: number | null; p95Ms?: number | null; sampleCount: number }>
  }
  triageAudit?: {
    sampledCount: number
    reviewedCount: number
    violationFoundCount: number
    undecidedCount?: number
    missRate?: number | null
    lastSampledAt?: string | null
    populationCount?: number | null
  }
}

/**
 * 확장이 배포된 서버의 응답 한 장.
 *
 * 승급률 37.6%에 서버 손익분기 45.7%를 둔 것은 일부러다 — BE 설정값이 그 숫자이고 측정 하네스
 * 정본(62.0%)과 어긋나 있어, 화면이 두 기준선을 함께 보여 주는지 테스트가 이 표본으로 고정한다.
 */
export function makeAdminInspectionMetricsWire(
  overrides: Partial<AdminInspectionMetricsWire> = {},
): AdminInspectionMetricsWire {
  return {
    needsAttention: true,
    window: {
      from: '2026-10-22T00:00:00',
      to: '2026-10-23T00:00:00',
      measuredAt: '2026-10-23T09:00:00',
      windowHours: 24,
      policyVersion: null,
      targetType: null,
      promptVersions: { 'inspection-v1+policy-v1+triage-v2': 812, 'inspection-v1+policy-v1': 31 },
    },
    alarms: [{ code: 'BACKLOG_COUNT', message: '어드민 대기 61건이 임계 50건을 넘었어요.' }],
    funnel: {
      settledCount: 843,
      unclassifiedCount: 0,
      exits: [
        {
          stage: 1,
          exit: 'RULE_BLOCKED',
          label: '룰 확정 차단',
          count: 96,
          shareOfSettled: 0.1139,
        },
        {
          stage: 2,
          exit: 'TRIAGE_CLEARED',
          label: '선별 통과',
          count: 402,
          shareOfSettled: 0.4769,
        },
        { stage: 3, exit: 'MODEL_CLEAR', label: '위반 없음', count: 221, shareOfSettled: 0.2621 },
        {
          stage: 4,
          exit: 'CRITIC_OVERTURNED',
          label: '비평이 뒤집음',
          count: 14,
          shareOfSettled: 0.0166,
        },
        { stage: 5, exit: 'MODEL_FLAG', label: '확정 위반', count: 88, shareOfSettled: 0.1044 },
        { stage: 0, exit: 'VERDICT_FAILED', label: '판정 실패', count: 15, shareOfSettled: 0.0178 },
        { stage: 0, exit: 'UNJUDGED', label: '미판정', count: 7, shareOfSettled: 0.0083 },
      ],
      stage1: { name: 'RULE', enteredCount: 836, blockedCount: 96, blockRate: 0.1148 },
      stage2: {
        name: 'TRIAGE',
        enteredCount: 644,
        clearedCount: 402,
        promotedCount: 242,
        callFailedCount: 3,
        bypassedByRuleHitCount: 96,
        skipRate: 0.6242,
        promotionRate: 0.3758,
        breakevenRate: 0.457,
        overBreakeven: false,
      },
      stage3: {
        name: 'JUDGE',
        enteredCount: 323,
        respondedCount: 323,
        violationFoundCount: 102,
        clearCount: 221,
        detectionRate: 0.3158,
      },
      stage4: {
        name: 'CRITIC',
        enteredCount: 102,
        overturnedCount: 14,
        upheldCount: 88,
        overturnRate: 0.1373,
        escalationObserved: true,
      },
      stage5: { name: 'FINAL', flagCount: 184, passCount: 637, failedCount: 15, unjudgedCount: 7 },
    },
    judgment: {
      settledCount: 843,
      passCount: 637,
      flagCount: 184,
      unjudgedCount: 7,
      failedCount: 15,
      passRate: 0.7557,
    },
    coverage: {
      settledCount: 843,
      unverifiedCount: 24,
      unjudgedCount: 7,
      verdictFailedCount: 15,
      modelUnverifiedCount: 2,
      triageSkippedPassCount: 402,
      triageSkippedBlockedCount: 0,
      unverifiedRate: 0.0285,
      triageMissConfirmed: false,
    },
    adminReview: {
      inflowCount: 119,
      inflowRate: 0.1412,
      inflowByReason: {
        OVERBLOCK_SUSPECT: 71,
        CRITIC_OVERTURNED: 14,
        VERDICT_FAILED: 15,
        UNJUDGED: 7,
        MODEL_UNVERIFIED: 2,
      },
      appealInflowCount: 10,
      decidedCount: 58,
      allowedCount: 41,
      blockedCount: 17,
      allowRate: 0.7069,
      decisionLatency: { p50Minutes: 94, p95Minutes: 1860, sampleCount: 58 },
    },
    backlog: {
      openCount: 61,
      staleOpenCount: 4,
      oldestWaitingSince: '2026-10-21T03:12:00',
      oldestWaitMinutes: 2748,
      openByReason: { OVERBLOCK_SUSPECT: 48, SELLER_APPEAL: 9, CRITIC_OVERTURNED: 4 },
      warnCount: 50,
      warnAgeMinutes: 1440,
      breached: true,
    },
    cost: {
      callCount: 1507,
      inspectionCount: 644,
      totalCostMicroUsd: 2186400,
      triageCostMicroUsd: 584200,
      cacheMissCallCount: 644,
      costPerInspectionMicroUsd: 3395,
      costPerSettledInspectionMicroUsd: 2593,
      byStage: {
        TRIAGE: {
          callCount: 644,
          costMicroUsd: 584200,
          cacheMissCallCount: 644,
          costPerSettledMicroUsd: 693,
        },
        DISPLAY_ADS: {
          callCount: 326,
          costMicroUsd: 612800,
          cacheMissCallCount: 11,
          costPerSettledMicroUsd: 727,
        },
        CONDUCT_TRADE: {
          callCount: 325,
          costMicroUsd: 598300,
          cacheMissCallCount: 9,
          costPerSettledMicroUsd: 710,
        },
        CRITIC: {
          callCount: 102,
          costMicroUsd: 304100,
          cacheMissCallCount: 2,
          costPerSettledMicroUsd: 361,
        },
        REWRITE: {
          callCount: 88,
          costMicroUsd: 87000,
          cacheMissCallCount: 1,
          costPerSettledMicroUsd: 103,
        },
      },
    },
    latency: {
      endToEnd: { p50Ms: 4120, p95Ms: 38400, sampleCount: 836 },
      byStage: {
        TRIAGE: { p50Ms: 980, p95Ms: 2400, sampleCount: 644 },
        DISPLAY_ADS: { p50Ms: 2610, p95Ms: 9100, sampleCount: 326 },
        CRITIC: { p50Ms: 5900, p95Ms: 21300, sampleCount: 102 },
      },
    },
    triageAudit: {
      sampledCount: 60,
      reviewedCount: 48,
      violationFoundCount: 2,
      undecidedCount: 3,
      missRate: 0.0417,
      lastSampledAt: '2026-10-23T04:00:00',
      populationCount: 402,
    },
    ...overrides,
  }
}

/**
 * 지금 떠 있는 서버(확장 전)의 응답. 블록 넷과 flat 창 필드뿐이고 질의 파라미터를 무시한다.
 *
 * 이 모양을 스텁으로 들고 있는 이유: 화면이 `funnel`을 전제하고 짜여 있으면 실제 배포에서
 * 퍼널이 0건으로 그려지거나 백지가 된다. 그 회귀를 여기서 잡는다.
 */
export function makeLegacyAdminInspectionMetricsWire(
  overrides: Partial<AdminInspectionMetricsWire> = {},
): AdminInspectionMetricsWire {
  return {
    windowFrom: '2026-10-22T09:00:00',
    measuredAt: '2026-10-23T09:00:00',
    windowHours: 24,
    needsAttention: true,
    promotion: {
      triagedCount: 644,
      promotedCount: 242,
      clearedCount: 402,
      callFailedCount: 3,
      promotionRate: 0.3758,
      breakevenRate: 0.457,
      overBreakeven: false,
    },
    coverage: {
      settledCount: 843,
      unverifiedCount: 24,
      unjudgedCount: 7,
      verdictFailedCount: 15,
      modelUnverifiedCount: 2,
      triageSkippedPassCount: 402,
      triageSkippedBlockedCount: 0,
      unverifiedRate: 0.0285,
      triageMissConfirmed: false,
    },
    cost: {
      callCount: 1507,
      inspectionCount: 644,
      totalCostMicroUsd: 2186400,
      triageCostMicroUsd: 584200,
      cacheMissCallCount: 644,
      costPerInspectionMicroUsd: 3395,
    },
    backlog: {
      openCount: 61,
      staleOpenCount: 4,
      oldestWaitingSince: '2026-10-21T03:12:00',
      oldestWaitMinutes: 2748,
      openByReason: { OVERBLOCK_SUSPECT: 48, SELLER_APPEAL: 9, CRITIC_OVERTURNED: 4 },
      warnCount: 50,
      warnAgeMinutes: 1440,
      breached: true,
    },
    ...overrides,
  }
}

let metrics: AdminInspectionMetricsWire | null = null
let metricsHonorsWindow = false

/**
 * 테스트마다 지표 응답을 세운다.
 *
 * `null`을 주면 서버가 권한으로 거절한다(403 errorCode 20011) — 어드민이 아닌 계정이 들어온
 * 경우다. `honorsWindow`는 질의 파라미터를 응답 `window`에 반영하는 서버(확장 뒤)를 뜻하고,
 * 끄면 파라미터를 무시하는 지금 서버를 흉내 낸다.
 */
export function seedAdminInspectionMetrics(
  body: AdminInspectionMetricsWire | null,
  { honorsWindow = false }: { honorsWindow?: boolean } = {},
): void {
  metrics = body == null ? null : structuredClone(body)
  metricsHonorsWindow = honorsWindow
}

export const inspectionMetricsHandlers = [
  http.get(ADMIN_INSPECTION_METRICS_URL, ({ request }) => {
    if (metrics == null) {
      return HttpResponse.json(errorBody(20011, '권한이 없습니다.'), { status: 403 })
    }
    const params = new URL(request.url).searchParams
    const body = structuredClone(metrics)
    if (metricsHonorsWindow && body.window) {
      // 확장 서버는 받은 창을 그대로 집계하고 응답에 되비춘다 — 화면이 그 값으로 "요청한 창이
      // 반영됐는지"를 판단한다.
      const from = params.get('from')
      const to = params.get('to')
      if (from) body.window.from = from
      if (to) body.window.to = to
      body.window.policyVersion = params.get('policyVersion')
    }
    return HttpResponse.json({ data: body })
  }),
]
