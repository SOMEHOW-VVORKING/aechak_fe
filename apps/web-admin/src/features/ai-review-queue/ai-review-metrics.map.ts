import type {
  AdminInspectionMetricsData,
  InspectionMetricsFunnel,
  InspectionMetricsMsPercentile,
} from '@aechak/api'
import { reasonMeta, toWireError, type LabelMeta } from './ai-review-queue.map'

// 어드민 AI 검수 운영 지표(admin 모듈 `/admin/inspection-metrics`) 응답을 화면 모델로 옮기는
// 매퍼. 큐 매퍼와 같은 feature에 두는 이유는 둘이 같은 서버 열거(등재 사유)와 같은 에러 분기를
// 쓰기 때문이다 — 분리하면 사유 라벨·에러 번역을 shared로 올려야 하고, 돌고 있는 큐 화면의
// import를 그만큼 건드린다.
//
// 이 파일의 규칙 하나가 나머지를 다 설명한다. **서버가 주지 않은 값은 0이 아니라 null이다.**
// 응답은 블록이 통째로 빠져 올 수 있다(확장 전 서버는 창 필드 넷과 promotion·coverage·cost·
// backlog만 준다). 없는 블록을 0으로 채우면 "집계가 0이다"라는 거짓을 말하고, 운영자는 그걸
// 보고 "오늘 아무 일도 없었다"로 읽는다.

// ── 0. 질의 창 ─────────────────────────────────────────────────────────────────

export interface MetricsQuery {
  /** 집계 시작. 오프셋 없는 LocalDateTime이고 null이면 서버 설정 창을 쓴다 */
  from: string | null
  /** 집계 끝. null이면 서버의 now */
  to: string | null
  policyVersion: string | null
}

export const EMPTY_METRICS_QUERY: MetricsQuery = { from: null, to: null, policyVersion: null }

/**
 * 서버 `LocalDateTime` 파라미터용 문자열.
 *
 * `toISOString()`을 쓰면 안 된다 — 그쪽은 UTC(`...Z`)를 내보내고 서버는 오프셋을 떼어 읽으므로
 * 집계 창이 시간대만큼(한국이면 9시간) 통째로 밀린다. 로컬 시계의 날짜·시각 그대로 적는다.
 */
export function toWireLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export interface PeriodPreset {
  value: string
  label: string
  /** null이면 파라미터를 보내지 않는다(서버 설정 창) */
  hours: number | null
}

/**
 * 기간 선택지.
 *
 * 기본값이 '서버 기본 창'인 이유: 확장 전 서버는 `from`·`to`를 무시하고 늘 설정된 창을
 * 돌려준다. 기본값으로 기간을 보내면 첫 화면부터 "서버가 선택을 반영하지 않았다" 안내가
 * 떠서 정상 상태가 경보처럼 보인다 — 운영자가 기간을 고를 때 그 안내가 뜨는 것이 맞다.
 */
export const PERIOD_PRESETS: PeriodPreset[] = [
  { value: 'server', label: '서버 기본 창', hours: null },
  { value: '24h', label: '최근 24시간', hours: 24 },
  { value: '7d', label: '최근 7일', hours: 24 * 7 },
  { value: '30d', label: '최근 30일', hours: 24 * 30 },
]

export const DEFAULT_PERIOD_PRESET = 'server'

const HOUR_MS = 60 * 60 * 1000

/**
 * 고른 기간을 질의 창으로 바꾼다.
 *
 * `now`를 인자로 받는 이유: 렌더에서 `Date.now()`를 읽으면 쿼리 키가 매 렌더 달라져 조회가
 * 멈추지 않는다. 호출부가 "기간을 고른 그 순간"의 시각을 한 번 넘기고 그 값을 state에 둔다.
 */
export function periodToQuery(presetValue: string, now: number): Pick<MetricsQuery, 'from' | 'to'> {
  const preset = PERIOD_PRESETS.find(candidate => candidate.value === presetValue)
  if (!preset || preset.hours == null) return { from: null, to: null }
  // `to`는 보내지 않는다 — 서버의 now가 끝이어야 "지금까지"라는 뜻이 유지된다. 여기서 굳히면
  // 화면을 열어 둔 채 시간이 흐를 때 창의 끝이 과거에 멈춘다.
  return { from: toWireLocalDateTime(new Date(now - preset.hours * HOUR_MS)), to: null }
}

export interface MetricsWindowView {
  from: string | null
  to: string | null
  measuredAt: string | null
  windowHours: number | null
  policyVersion: string | null
  targetType: string | null
  /** 창 안의 프롬프트 버전 분포. 둘 이상이면 BE 설정과 AI 정책 문구 버전이 어긋났다는 신호다 */
  promptVersions: { version: string; count: number }[]
}

/**
 * 서버가 **실제로** 집계한 창.
 *
 * 확장 응답의 `window`를 먼저 믿고, 없으면 flat 필드로 떨어진다. flat 쪽에는 창의 끝이 따로
 * 없어 `measuredAt`을 끝으로 쓴다 — 서버가 `now`까지 세기 때문이다.
 */
export function toWindowView(data: AdminInspectionMetricsData): MetricsWindowView {
  const window = data.window
  if (window) {
    return {
      from: window.from,
      to: window.to,
      measuredAt: window.measuredAt,
      windowHours: window.windowHours ?? null,
      policyVersion: window.policyVersion ?? null,
      targetType: window.targetType ?? null,
      promptVersions: Object.entries(window.promptVersions ?? {}).map(([version, count]) => ({
        version,
        count,
      })),
    }
  }
  return {
    from: data.windowFrom ?? null,
    to: data.measuredAt ?? null,
    measuredAt: data.measuredAt ?? null,
    windowHours: data.windowHours ?? null,
    policyVersion: null,
    targetType: null,
    promptVersions: [],
  }
}

export interface MetricsWindowGaps {
  /** 요청한 기간과 서버가 집계한 기간이 다르다 */
  period: boolean
  /** 요청한 정책 버전이 응답에 반영되지 않았다 */
  policyVersion: boolean
}

/** 창 시작이 같다고 볼 오차. 서버가 초를 버리거나 올려도 경보가 되지 않게 1분을 준다. */
const WINDOW_TOLERANCE_MS = 60_000

const epochOf = (value: string | null): number | null => {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * 요청한 창과 응답이 밝힌 창이 어긋났는가.
 *
 * 이 비교가 이 화면의 정직함을 떠받친다. 확장 전 서버는 질의 파라미터를 **무시하고** 설정된
 * 창을 돌려주는데, 그걸 모르고 "최근 7일"이라고 적으면 화면이 24시간 집계를 7일치로 둔갑시킨다.
 * 서버가 창을 응답에 적어 주므로 그 값과 맞춰 보고 다르면 운영자에게 알린다.
 */
export function windowGaps(query: MetricsQuery, window: MetricsWindowView): MetricsWindowGaps {
  const requested = epochOf(query.from)
  const reported = epochOf(window.from)
  const period =
    requested != null && reported != null && Math.abs(requested - reported) > WINDOW_TOLERANCE_MS
  const policyVersion = query.policyVersion != null && window.policyVersion !== query.policyVersion
  return { period, policyVersion }
}

// ── 1. 경보 ────────────────────────────────────────────────────────────────────

export interface AlarmView {
  code: string
  message: string
  /** 서버가 문장을 주지 않아 화면이 불리언에서 만든 것인가 */
  derived: boolean
}

/**
 * 상단 배너에 띄울 경보.
 *
 * 서버의 `alarms[]`가 정본이다 — 주기 로그와 같은 문장이라 화면과 로그가 갈라지지 않는다.
 * 확장 전 서버는 문장 없이 불리언 셋(`breached`·`overBreakeven`·`triageMissConfirmed`)과
 * `needsAttention`만 주므로, 그때는 **그 불리언이 말하는 것만** 문장으로 만든다(지어내지 않는다).
 * 끝으로 `needsAttention`이 켜졌는데 설명할 불리언이 하나도 없으면 그 사실 자체를 적는다 —
 * 서버가 경보라고 했는데 화면이 조용한 것이 가장 나쁘다.
 */
export function toAlarms(data: AdminInspectionMetricsData): AlarmView[] {
  const served = data.alarms ?? []
  if (served.length > 0) {
    return served.map(alarm => ({ code: alarm.code, message: alarm.message, derived: false }))
  }

  const derived: AlarmView[] = []
  const backlog = data.backlog
  if (backlog?.breached) {
    derived.push({
      code: 'BACKLOG',
      message: `어드민 대기가 임계를 넘었어요 — 대기 ${formatCount(backlog.openCount)}건 / 임계 ${formatCount(backlog.warnCount)}건, 가장 오래 기다린 건 ${formatMinuteSpan(backlog.oldestWaitMinutes ?? null)}이에요.`,
      derived: true,
    })
  }
  const promotion = toPromotionView(data)
  if (promotion?.overBreakeven) {
    derived.push({
      code: 'OVER_BREAKEVEN',
      message:
        '승급률이 손익분기를 넘었어요 — 선별이 비용을 줄이지 못하고 오히려 더하는 구간이에요.',
      derived: true,
    })
  }
  if (data.coverage?.triageMissConfirmed) {
    derived.push({
      code: 'TRIAGE_MISS',
      message: '선별이 건너뛴 내용에서 차단이 확인됐어요 — 선별이 위반을 놓쳤다는 증거예요.',
      derived: true,
    })
  }
  if (data.needsAttention && derived.length === 0) {
    derived.push({
      code: 'NEEDS_ATTENTION',
      message:
        '서버가 경보 조건을 만족했다고 알렸는데, 어느 조건인지는 아직 응답에 실리지 않아요. 주기 로그를 확인해 주세요.',
      derived: true,
    })
  }
  return derived
}

// ── 2. 퍼널 ────────────────────────────────────────────────────────────────────
// 단계는 넷이다 — 1단 룰 / 2단 선별 / 3단 관점 판정 / 4단 비평. 다섯째 블록(stage5)은 단계가
// 아니라 최종 판정 분포라 퍼널 막대로 그리지 않고 따로 보여 준다.
//
// **비율마다 분모가 다르다**는 것이 이 블록에서 가장 틀리기 쉬운 자리다. 1단 차단율의 분모는
// 미판정을 뺀 전수이고(그 행들은 룰을 탄 적이 없다), 2단은 선별 호출이 나간 검수이고, 3단은
// 응답이 온 검수다(레이트 리밋으로 못 본 건을 넣으면 모델 품질이 아니라 가용성을 재게 된다).
// 그래서 화면도 비율 옆에 분모를 같이 적는다.

export type FunnelStageKey = 'stage1' | 'stage2' | 'stage3' | 'stage4'

export interface FunnelStageView {
  key: FunnelStageKey
  /** 1~4 */
  order: number
  label: string
  caption: string
  enteredCount: number | null
  /** 이 단계에서 퍼널을 빠져나간 건수 */
  exitedCount: number | null
  exitLabel: string
  rate: number | null
  rateLabel: string
  /** 그 비율의 분모가 무엇인지. 단계마다 다르다 */
  rateBasis: string
  /** 분모를 믿을 수 없다는 경고. null이면 믿을 수 있다 */
  caveat: string | null
  /** 막대 폭 기준 — 닫힌 검수 전수 대비 진입 비율 */
  share: number | null
}

export interface FunnelExitView {
  exit: string
  label: string
  count: number
  share: number | null
  /** 1~5는 퍼널 안, 0은 퍼널 밖(실패 터미널) */
  stage: number
}

export interface FunnelView {
  settledCount: number
  /** 어느 탈출로도 분류되지 않은 건수. 0이 아니면 그 자체가 사건이다 */
  unclassifiedCount: number
  stages: FunnelStageView[]
  /** 퍼널 안에서 끝난 탈출 */
  exits: FunnelExitView[]
  /** 퍼널 밖에서 끝난 것 — 판정 실패·미판정. 세로 퍼널과 섞으면 합이 100%인 것처럼 읽힌다 */
  terminals: FunnelExitView[]
}

const EXIT_LABEL: Record<string, string> = {
  RULE_BLOCKED: '룰 확정 차단',
  TRIAGE_CLEARED: '선별 통과',
  MODEL_CLEAR: '위반 없음',
  CRITIC_OVERTURNED: '비평이 뒤집음',
  MODEL_FLAG: '확정 위반',
  VERDICT_FAILED: '판정 실패',
  UNJUDGED: '미판정',
  UNCLASSIFIED: '미분류',
}

/** 서버가 라벨을 보내면 그것을 쓰고, 모르는 탈출은 원문과 함께 '알 수 없음'으로 적는다. */
export const exitLabel = (exit: string, served: string | null | undefined): string =>
  served ?? EXIT_LABEL[exit] ?? `알 수 없음 (${exit})`

const shareOf = (count: number, settledCount: number): number | null =>
  settledCount > 0 ? count / settledCount : null

export function toFunnelView(funnel: InspectionMetricsFunnel): FunnelView {
  const settledCount = funnel.settledCount
  const rows: FunnelExitView[] = (funnel.exits ?? []).map(exit => ({
    exit: exit.exit,
    label: exitLabel(exit.exit, exit.label),
    count: exit.count,
    // 서버가 share를 주면 그것을 쓴다. 같은 분모로 화면이 계산해도 같지만, 서버가 보낸 값과
    // 다른 숫자를 보여 주면 어느 쪽이 맞는지 확인할 길이 없어진다.
    share: exit.shareOfSettled ?? shareOf(exit.count, settledCount),
    stage: exit.stage,
  }))

  const stage1 = funnel.stage1
  const stage2 = funnel.stage2
  const stage3 = funnel.stage3
  const stage4 = funnel.stage4

  const stages: FunnelStageView[] = [
    {
      key: 'stage1',
      order: 1,
      label: '룰',
      caption: '정규식 / 네거티브 리스트가 확정 위반을 즉시 차단해요.',
      enteredCount: stage1?.enteredCount ?? null,
      exitedCount: stage1?.blockedCount ?? null,
      exitLabel: '확정 차단',
      rate: stage1?.blockRate ?? null,
      rateLabel: '차단율',
      rateBasis: '분모는 미판정을 뺀 닫힌 검수예요 (미판정 건은 룰을 탄 적이 없어요)',
      caveat: null,
      share: stage1 ? shareOf(stage1.enteredCount, settledCount) : null,
    },
    {
      key: 'stage2',
      order: 2,
      label: '선별',
      caption: 'Haiku가 깨끗하다고 보면 관점 판정을 건너뛰어요.',
      enteredCount: stage2?.enteredCount ?? null,
      exitedCount: stage2?.clearedCount ?? null,
      exitLabel: '건너뜀',
      rate: stage2?.skipRate ?? null,
      rateLabel: '건너뛰기율',
      rateBasis: '분모는 선별 호출이 실제로 나간 검수예요',
      caveat:
        stage2 && (stage2.bypassedByRuleHitCount ?? 0) > 0
          ? `규칙이 적중해 선별을 묻지 않고 승급한 ${stage2.bypassedByRuleHitCount}건은 분모에 없어요.`
          : null,
      share: stage2 ? shareOf(stage2.enteredCount, settledCount) : null,
    },
    {
      key: 'stage3',
      order: 3,
      label: '관점 판정',
      caption: 'Sonnet이 표시 / 광고 관점과 행위 / 거래 관점으로 본문을 읽어요.',
      enteredCount: stage3?.enteredCount ?? null,
      exitedCount: stage3?.violationFoundCount ?? null,
      exitLabel: '위반 검출',
      rate: stage3?.detectionRate ?? null,
      rateLabel: '검출율',
      rateBasis: '분모는 응답이 온 검수예요 (호출이 깨져 못 본 건은 빠져요)',
      caveat:
        stage3 && stage3.respondedCount < stage3.enteredCount
          ? `진입 ${stage3.enteredCount}건 가운데 ${stage3.enteredCount - stage3.respondedCount}건은 응답이 오지 않아 분모에서 빠졌어요.`
          : null,
      share: stage3 ? shareOf(stage3.enteredCount, settledCount) : null,
    },
    {
      key: 'stage4',
      order: 4,
      label: '비평',
      caption: 'Opus가 관점 판정의 위반을 반박해요 — 뒤집으면 통과가 돼요.',
      enteredCount: stage4?.enteredCount ?? null,
      exitedCount: stage4?.overturnedCount ?? null,
      exitLabel: '뒤집음',
      rate: stage4?.overturnRate ?? null,
      rateLabel: '뒤집힘율',
      rateBasis: '분모는 모델이 위반을 든 검수예요',
      // 승급이 꺼지면 비평이 돌지 않는데 모델 위반 건은 그대로 분모에 들어온다 — 뒤집힘율이
      // 실제보다 낮게 나오고, 그 수치로 "비평이 쓸모없다"는 반대 결론이 나올 수 있다.
      caveat:
        stage4 && stage4.escalationObserved === false
          ? '비평 호출이 원장에서 관측되지 않았어요. 승급이 꺼져 있었다면 이 분모는 믿을 수 없어요.'
          : null,
      share: stage4 ? shareOf(stage4.enteredCount, settledCount) : null,
    },
  ]

  return {
    settledCount,
    unclassifiedCount: funnel.unclassifiedCount ?? 0,
    stages,
    exits: rows.filter(row => row.stage > 0),
    terminals: rows.filter(row => row.stage === 0),
  }
}

// ── 3. 승급률과 손익분기 ───────────────────────────────────────────────────────

/**
 * 측정 하네스(`ai/harness/run.py`)가 들고 있는 손익분기 승급률.
 *
 * 서버 설정이 이 값과 다를 수 있다 — 그러면 **두 값 사이 구간에서 서버의 경보가 거짓이 된다**
 * (선별을 끄라고 말하는데 실제로는 아직 이득인 구간). 화면은 서버 값을 기준선으로 그리고
 * (서버의 `overBreakeven` 판정과 같은 값이어야 하므로) 이 값을 참고선으로 함께 그려,
 * 어긋남을 숫자로 드러낸다.
 */
export const HARNESS_BREAKEVEN_RATE = 0.62

export interface PromotionView {
  triagedCount: number
  clearedCount: number
  promotedCount: number
  callFailedCount: number | null
  bypassedByRuleHitCount: number | null
  promotionRate: number | null
  skipRate: number | null
  /** 서버가 보낸 손익분기. 서버의 overBreakeven 판정과 같은 값이라 화면이 다시 계산하지 않는다 */
  breakevenRate: number
  overBreakeven: boolean
  /** 서버 손익분기가 하네스 정본과 다른가 */
  breakevenDisputed: boolean
  /** 어느 블록에서 읽었는가 — stage2(확장)인지 promotion(확장 전)인지 */
  source: 'funnel' | 'promotion'
}

const ratesDiffer = (left: number, right: number): boolean => Math.abs(left - right) > 0.0005

/**
 * 승급률 블록. 확장 응답의 `funnel.stage2`를 먼저 보고 없으면 `promotion`으로 떨어진다.
 *
 * 둘 다 없으면 null이고 화면은 '미측정'으로 그린다 — 0%로 그리면 "선별이 아무것도 승급시키지
 * 않았다"는 뜻이 되고, 그건 선별을 끄라는 결론으로 이어진다.
 */
export function toPromotionView(data: AdminInspectionMetricsData): PromotionView | null {
  const stage2 = data.funnel?.stage2
  if (stage2) {
    return {
      triagedCount: stage2.enteredCount,
      clearedCount: stage2.clearedCount,
      promotedCount: stage2.promotedCount,
      callFailedCount: stage2.callFailedCount ?? null,
      bypassedByRuleHitCount: stage2.bypassedByRuleHitCount ?? null,
      promotionRate: stage2.promotionRate ?? null,
      skipRate: stage2.skipRate ?? null,
      breakevenRate: stage2.breakevenRate,
      overBreakeven: stage2.overBreakeven,
      breakevenDisputed: ratesDiffer(stage2.breakevenRate, HARNESS_BREAKEVEN_RATE),
      source: 'funnel',
    }
  }
  const promotion = data.promotion
  if (!promotion) return null
  return {
    triagedCount: promotion.triagedCount,
    clearedCount: promotion.clearedCount,
    promotedCount: promotion.promotedCount,
    callFailedCount: promotion.callFailedCount ?? null,
    bypassedByRuleHitCount: null,
    promotionRate: promotion.promotionRate ?? null,
    // 확장 전 블록에는 건너뛰기율이 없다. 승급률의 여집합이라 화면에서 만들 수 있지만,
    // 승급률 자체가 null(분모 0)인 경우에는 여집합도 없다.
    skipRate: promotion.promotionRate == null ? null : 1 - promotion.promotionRate,
    breakevenRate: promotion.breakevenRate,
    overBreakeven: promotion.overBreakeven,
    breakevenDisputed: ratesDiffer(promotion.breakevenRate, HARNESS_BREAKEVEN_RATE),
    source: 'promotion',
  }
}

// ── 4. 적체 ────────────────────────────────────────────────────────────────────

export interface BacklogReasonRow {
  reason: string
  meta: LabelMeta
  count: number
}

export interface BacklogView {
  openCount: number
  staleOpenCount: number
  oldestWaitingSince: string | null
  oldestWaitMinutes: number | null
  warnCount: number
  warnAgeMinutes: number
  breached: boolean
  /** 임계를 넘긴 축 — 화면이 왜 경보인지 먼저 적는다 */
  breachedBy: ('count' | 'age')[]
  byReason: BacklogReasonRow[]
}

export function toBacklogView(data: AdminInspectionMetricsData): BacklogView | null {
  const backlog = data.backlog
  if (!backlog) return null
  // 판정은 서버의 `breached`가 정본이고 이 배열은 "어느 축이 넘었는지"를 덧붙이는 것뿐이다.
  // 조건은 BE Backlog.breached와 같다 — openCount >= warnCount 또는 대기 분 >= warnAgeMinutes.
  // 대기 시각이 없으면(열린 건이 없으면) 나이 축은 넘지 않은 것이다.
  const breachedBy: ('count' | 'age')[] = []
  if (backlog.openCount >= backlog.warnCount) breachedBy.push('count')
  if (backlog.oldestWaitMinutes != null && backlog.oldestWaitMinutes >= backlog.warnAgeMinutes) {
    breachedBy.push('age')
  }
  return {
    openCount: backlog.openCount,
    staleOpenCount: backlog.staleOpenCount,
    oldestWaitingSince: backlog.oldestWaitingSince ?? null,
    oldestWaitMinutes: backlog.oldestWaitMinutes ?? null,
    warnCount: backlog.warnCount,
    warnAgeMinutes: backlog.warnAgeMinutes,
    breached: backlog.breached,
    breachedBy,
    byReason: Object.entries(backlog.openByReason ?? {})
      .map(([reason, count]) => ({ reason, meta: reasonMeta(reason), count }))
      .sort((left, right) => right.count - left.count),
  }
}

// ── 5. 비용과 지연 ─────────────────────────────────────────────────────────────

const COST_STAGE_LABEL: Record<string, string> = {
  TRIAGE: '선별',
  DISPLAY_ADS: '표시 / 광고',
  CONDUCT_TRADE: '행위 / 거래',
  CRITIC: '비평',
  REWRITE: '수정 문구',
  RULE: '규칙',
  ALL: '단계 미상',
  UNATTRIBUTED: '단계 미상',
}

export const costStageLabel = (stage: string): string =>
  COST_STAGE_LABEL[stage] ?? `알 수 없음 (${stage})`

/**
 * 단계를 가릴 수 없는 행인가.
 *
 * 비평과 수정 문구는 원장에 둘 다 `ALL` 관점으로 적혀 한 덩어리가 된다. 그 행을 "비평"으로
 * 보여 주면 비평 단가(Opus)를 수정 문구에 섞어 읽게 되고, 합계에서 빼면 총액이 맞지 않는다 —
 * 그래서 이름을 '단계 미상'으로 두고 합계에는 남긴다.
 */
export const isUnattributedStage = (stage: string): boolean =>
  stage === 'ALL' || stage === 'UNATTRIBUTED'

export interface CostStageRow {
  stage: string
  stageLabel: string
  callCount: number
  costMicroUsd: number
  cacheMissCallCount: number | null
  costPerSettledMicroUsd: number | null
  unattributed: boolean
}

export interface CostView {
  callCount: number
  inspectionCount: number
  totalCostMicroUsd: number
  triageCostMicroUsd: number | null
  cacheMissCallCount: number | null
  /** 호출이 나간 건당. 룰이 무료로 차단한 건이 분모에서 빠져 과대 보고된다 */
  costPerInspectionMicroUsd: number | null
  /** 닫힌 검수 전수를 분모로 한 건당 */
  costPerSettledInspectionMicroUsd: number | null
  stages: CostStageRow[]
  /** 단계 미상 행이 있는가 — 구버전 데이터라는 표시를 붙여야 한다 */
  hasUnattributed: boolean
}

export function toCostView(data: AdminInspectionMetricsData): CostView | null {
  const cost = data.cost
  if (!cost) return null
  const stages: CostStageRow[] = Object.entries(cost.byStage ?? {})
    .map(([stage, row]) => ({
      stage,
      stageLabel: costStageLabel(stage),
      callCount: row.callCount,
      costMicroUsd: row.costMicroUsd,
      cacheMissCallCount: row.cacheMissCallCount ?? null,
      costPerSettledMicroUsd: row.costPerSettledMicroUsd ?? null,
      unattributed: isUnattributedStage(stage),
    }))
    .sort((left, right) => right.costMicroUsd - left.costMicroUsd)
  return {
    callCount: cost.callCount,
    inspectionCount: cost.inspectionCount,
    totalCostMicroUsd: cost.totalCostMicroUsd,
    triageCostMicroUsd: cost.triageCostMicroUsd ?? null,
    cacheMissCallCount: cost.cacheMissCallCount ?? null,
    costPerInspectionMicroUsd: cost.costPerInspectionMicroUsd ?? null,
    costPerSettledInspectionMicroUsd: cost.costPerSettledInspectionMicroUsd ?? null,
    stages,
    hasUnattributed: stages.some(row => row.unattributed),
  }
}

export interface LatencyRow {
  stage: string
  stageLabel: string
  p50Ms: number | null
  p95Ms: number | null
  sampleCount: number
}

export interface LatencyView {
  endToEnd: LatencyRow | null
  stages: LatencyRow[]
}

const toLatencyRow = (
  stage: string,
  stageLabel: string,
  percentile: InspectionMetricsMsPercentile,
): LatencyRow => ({
  stage,
  stageLabel,
  p50Ms: percentile.p50Ms ?? null,
  p95Ms: percentile.p95Ms ?? null,
  sampleCount: percentile.sampleCount,
})

export function toLatencyView(data: AdminInspectionMetricsData): LatencyView | null {
  const latency = data.latency
  if (!latency) return null
  const endToEnd = latency.endToEnd
  return {
    endToEnd: endToEnd ? toLatencyRow('END_TO_END', '등록부터 노출까지', endToEnd) : null,
    stages: Object.entries(latency.byStage ?? {})
      .map(([stage, percentile]) => toLatencyRow(stage, costStageLabel(stage), percentile))
      .sort((left, right) => (right.p95Ms ?? 0) - (left.p95Ms ?? 0)),
  }
}

// ── 6. 한 장으로 묶기 ──────────────────────────────────────────────────────────

export interface JudgmentView {
  settledCount: number
  passCount: number
  flagCount: number
  unjudgedCount: number
  failedCount: number
  passRate: number | null
}

export interface CoverageView {
  settledCount: number
  unverifiedCount: number
  unverifiedRate: number | null
  triageSkippedPassCount: number | null
  triageMissConfirmed: boolean | null
}

export interface AdminReviewView {
  inflowCount: number
  inflowRate: number | null
  appealInflowCount: number | null
  decidedCount: number
  allowedCount: number
  blockedCount: number
  allowRate: number | null
  decisionP50Minutes: number | null
  decisionP95Minutes: number | null
  byReason: BacklogReasonRow[]
  /** 사유별 합이 유입 건수보다 작은가 — 최초 사유만 남는 탓이다 */
  reasonSumShort: boolean
}

export interface TriageAuditView {
  sampledCount: number
  reviewedCount: number
  violationFoundCount: number
  /** 판단 불가로 적힌 표본. CLEAN으로 세면 누락률이 낙관으로 기운다 */
  undecidedCount: number | null
  missRate: number | null
  lastSampledAt: string | null
  populationCount: number | null
}

export interface InspectionMetricsView {
  window: MetricsWindowView
  gaps: MetricsWindowGaps
  needsAttention: boolean
  alarms: AlarmView[]
  funnel: FunnelView | null
  judgment: JudgmentView | null
  promotion: PromotionView | null
  coverage: CoverageView | null
  adminReview: AdminReviewView | null
  backlog: BacklogView | null
  cost: CostView | null
  latency: LatencyView | null
  triageAudit: TriageAuditView | null
}

function toAdminReviewView(data: AdminInspectionMetricsData): AdminReviewView | null {
  const adminReview = data.adminReview
  if (!adminReview) return null
  const byReason: BacklogReasonRow[] = Object.entries(adminReview.inflowByReason ?? {})
    .map(([reason, count]) => ({ reason, meta: reasonMeta(reason), count }))
    .sort((left, right) => right.count - left.count)
  const reasonSum = byReason.reduce((sum, row) => sum + row.count, 0)
  return {
    inflowCount: adminReview.inflowCount,
    inflowRate: adminReview.inflowRate ?? null,
    appealInflowCount: adminReview.appealInflowCount ?? null,
    decidedCount: adminReview.decidedCount,
    allowedCount: adminReview.allowedCount,
    blockedCount: adminReview.blockedCount,
    allowRate: adminReview.allowRate ?? null,
    decisionP50Minutes: adminReview.decisionLatency?.p50Minutes ?? null,
    decisionP95Minutes: adminReview.decisionLatency?.p95Minutes ?? null,
    byReason,
    // 사유별 분포를 다 더해도 유입 건수에 모자랄 수 있다 — `adminReviewReason`은 최초 사유만
    // 남기므로 이의가 나중에 붙은 행은 처음 사유로 세어진다. 그 사실을 적지 않으면 운영자가
    // 표가 잘못됐다고 읽는다.
    reasonSumShort: byReason.length > 0 && reasonSum < adminReview.inflowCount,
  }
}

export function toMetricsView(
  data: AdminInspectionMetricsData,
  query: MetricsQuery,
): InspectionMetricsView {
  const window = toWindowView(data)
  const judgment = data.judgment
  const coverage = data.coverage
  const triageAudit = data.triageAudit
  return {
    window,
    gaps: windowGaps(query, window),
    needsAttention: data.needsAttention ?? false,
    alarms: toAlarms(data),
    funnel: data.funnel ? toFunnelView(data.funnel) : null,
    judgment: judgment
      ? {
          settledCount: judgment.settledCount,
          passCount: judgment.passCount,
          flagCount: judgment.flagCount,
          unjudgedCount: judgment.unjudgedCount,
          failedCount: judgment.failedCount,
          passRate: judgment.passRate ?? null,
        }
      : null,
    promotion: toPromotionView(data),
    coverage: coverage
      ? {
          settledCount: coverage.settledCount,
          unverifiedCount: coverage.unverifiedCount,
          unverifiedRate: coverage.unverifiedRate ?? null,
          triageSkippedPassCount: coverage.triageSkippedPassCount ?? null,
          triageMissConfirmed: coverage.triageMissConfirmed ?? null,
        }
      : null,
    adminReview: toAdminReviewView(data),
    backlog: toBacklogView(data),
    cost: toCostView(data),
    latency: toLatencyView(data),
    triageAudit: triageAudit
      ? {
          sampledCount: triageAudit.sampledCount,
          reviewedCount: triageAudit.reviewedCount,
          violationFoundCount: triageAudit.violationFoundCount,
          undecidedCount: triageAudit.undecidedCount ?? null,
          missRate: triageAudit.missRate ?? null,
          lastSampledAt: triageAudit.lastSampledAt ?? null,
          populationCount: triageAudit.populationCount ?? null,
        }
      : null,
  }
}

// ── 7. 표시 형식 ───────────────────────────────────────────────────────────────
// 분모가 0이면 서버가 null을 준다. 그 null을 0%로 적으면 "한 건도 안 돌았다"와 "돌았는데 전부
// 건너뛰었다"가 같은 숫자가 되므로, 전부 '미측정'으로 적는다.

export const UNMEASURED = '미측정'

export function formatRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return UNMEASURED
  return `${(rate * 100).toFixed(1)}%`
}

export function formatCount(count: number | null | undefined): string {
  if (count == null || !Number.isFinite(count)) return UNMEASURED
  return count.toLocaleString('ko-KR')
}

/** 백만분의 1 달러를 달러로. 원화 환산은 환율 전제를 섞는 일이라 하지 않는다. */
export function formatUsd(micro: number | null | undefined): string {
  if (micro == null || !Number.isFinite(micro)) return UNMEASURED
  return `$${(micro / 1_000_000).toFixed(4)}`
}

const MINUTES_IN_DAY = 60 * 24

/** 분 단위 경과 시간. 가장 큰 단위 둘까지만 적는다(3일 2시간 / 5시간 12분 / 7분). */
export function formatMinuteSpan(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return UNMEASURED
  const total = Math.max(0, Math.round(minutes))
  const days = Math.floor(total / MINUTES_IN_DAY)
  const hours = Math.floor((total % MINUTES_IN_DAY) / 60)
  const rest = total % 60
  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`
  if (hours > 0) return rest > 0 ? `${hours}시간 ${rest}분` : `${hours}시간`
  return `${rest}분`
}

/** 밀리초. 1초를 넘으면 초로 적는다 — 운영자가 읽는 단위가 거기서 바뀐다. */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return UNMEASURED
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}초`
}

// ── 8. 에러 분기 ──────────────────────────────────────────────────────────────
// 목록 문구를 재사용하면 큐는 정상인데 지표만 깨진 상황에서 틀린 대상을 지목한다.

export function metricsErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 403)
    return '어드민 권한이 없어 검수 지표를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 400 && errorCode === 40509)
    return '서버가 받을 수 있는 집계 창을 벗어났어요. 기간을 좁혀 주세요.'
  if (status === 400 && errorCode === 90001)
    return '기간이나 정책 버전 값을 서버가 알지 못해요. 선택을 다시 해 주세요.'
  return '검수 지표를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}
