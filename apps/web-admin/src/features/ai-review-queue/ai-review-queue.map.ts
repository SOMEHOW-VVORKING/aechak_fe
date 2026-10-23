import type { StatusPillVariant } from '@aechak/design-system/web'
import {
  AdminDecision,
  AdminReviewReason,
  AdminReviewState,
  AppealState,
  InspectionJudgment,
  InspectionPerspectiveKind,
  InspectionStatus,
  PerspectiveOutcome,
  type AdminInspectionCall,
  type AdminInspectionDetailData,
  type AdminInspectionFinding,
  type AdminInspectionSummary,
} from '@aechak/api'

// 어드민 AI 검수 큐(admin 모듈 `/admin/content-inspections`) 응답을 화면 모델로 옮기는 매퍼.
// 서버 enum·와이어 필드는 이 파일과 queries에만 가두고(AGENTS "서버 enum/필드는 feature 안에
// 가둔다"), 라우트는 여기서 나온 뷰 타입만 읽는다. 응답에 없는 값은 만들어 내지 않는다 —
// 목업 시절의 탐지 단계(1/2단계)·자동 블라인드 시각·내부 메모는 서버에 아예 없어 전부 빼고,
// 서버가 실제로 주는 것(관점별 결과·호출 원장·위반 JSON)으로 화면을 다시 세웠다.

// ── 0. 라벨 메타 ───────────────────────────────────────────────────────────────
// StatusPill variant 선택 규칙: danger는 되돌리기 어려운 제재, muted는 비활성/휴면 전용
// (AGENTS 디자인시스템 절). 큐 행은 아직 아무것도 확정되지 않은 상태라 muted를 쓰지 않는다.

export interface LabelMeta {
  label: string
  variant: StatusPillVariant
  /** 목록·상세에서 라벨만으로는 모자란 맥락. 한 줄로 끊어 쓴다. */
  hint?: string
}

/**
 * 모르는 열거 값을 받았을 때의 폴백.
 *
 * 서버 열거가 늘어나는 것은 실제로 일어나는 일이고(TRIAGE가 그렇게 추가됐다), 생성된 타입은
 * 그때 거짓이 된다. `Record` 조회를 그대로 쓰면 `undefined.label`로 화면이 백지가 되므로
 * 모든 조회를 이 함수로 통과시킨다 — 운영자는 "알 수 없는 값"과 원문을 함께 본다.
 */
function metaOf(table: Record<string, LabelMeta>, value: string | null | undefined): LabelMeta {
  if (!value) return { label: '—', variant: 'neutral' }
  return table[value] ?? { label: `알 수 없음 (${value})`, variant: 'warning' }
}

const REASON_META: Record<string, LabelMeta> = {
  [AdminReviewReason.VERDICT_FAILED]: {
    label: '판정 실패',
    variant: 'error',
    hint: '판정 과정이 실패했어요. 노출은 그대로예요.',
  },
  [AdminReviewReason.UNJUDGED]: {
    label: '미판정',
    variant: 'error',
    hint: '기한이 지나도 판정이 오지 않았어요. 노출은 그대로예요.',
  },
  [AdminReviewReason.MODEL_UNVERIFIED]: {
    label: '증거 없는 통과',
    variant: 'warning',
    hint: '통과 판정인데 모델 관점이 내용을 하나도 보지 않았어요.',
  },
  [AdminReviewReason.CRITIC_OVERTURNED]: {
    label: '비평 뒤집힘',
    variant: 'info',
    hint: '비평이 모델 위반을 뒤집어 통과로 바꿨어요.',
  },
  [AdminReviewReason.OVERBLOCK_SUSPECT]: {
    label: '과탐 의심',
    variant: 'warning',
    hint: '위반이 전부 금지 성분이라 과탐일 수 있어요.',
  },
  [AdminReviewReason.SELLER_APPEAL]: {
    label: '셀러 이의',
    variant: 'accent',
    hint: '셀러가 이의를 제기했어요.',
  },
}

const STATE_META: Record<string, LabelMeta> = {
  [AdminReviewState.OPEN]: { label: '처리 대기', variant: 'neutral' },
  [AdminReviewState.RESOLVED]: { label: '처리 완료', variant: 'success' },
}

const JUDGMENT_META: Record<string, LabelMeta> = {
  [InspectionJudgment.PASS]: { label: 'AI 통과', variant: 'success' },
  [InspectionJudgment.FLAG]: { label: 'AI 보류', variant: 'warning' },
  [InspectionJudgment.UNJUDGED]: { label: '판정 없음', variant: 'error' },
  [InspectionJudgment.FAILED]: { label: '판정 실패', variant: 'error' },
}

const APPEAL_META: Record<string, LabelMeta> = {
  [AppealState.OPEN]: { label: '이의 접수', variant: 'accent' },
  [AppealState.ACCEPTED]: { label: '이의 수용', variant: 'success' },
  [AppealState.REJECTED]: { label: '이의 기각', variant: 'error' },
}

const PRODUCT_STATUS_META: Record<string, LabelMeta> = {
  [InspectionStatus.DRAFT]: { label: '작성 중', variant: 'muted' },
  [InspectionStatus.PENDING]: { label: '노출 보류', variant: 'warning' },
  [InspectionStatus.APPROVED]: { label: '노출 중', variant: 'success' },
  [InspectionStatus.REJECTED]: { label: '노출 차단', variant: 'error' },
}

const ADMIN_DECISION_META: Record<string, LabelMeta> = {
  [AdminDecision.ALLOWED]: { label: '사람이 허용', variant: 'success' },
  [AdminDecision.BLOCKED]: { label: '사람이 차단', variant: 'danger' },
}

export const reasonMeta = (value: string | null | undefined): LabelMeta =>
  metaOf(REASON_META, value)
export const stateMeta = (value: string | null | undefined): LabelMeta => metaOf(STATE_META, value)
export const judgmentMeta = (value: string | null | undefined): LabelMeta =>
  metaOf(JUDGMENT_META, value)
export const appealMeta = (value: string | null | undefined): LabelMeta =>
  metaOf(APPEAL_META, value)
export const productStatusMeta = (value: string | null | undefined): LabelMeta =>
  metaOf(PRODUCT_STATUS_META, value)
export const adminDecisionMeta = (value: string | null | undefined): LabelMeta =>
  metaOf(ADMIN_DECISION_META, value)

/** 사유 필터 선택지 — 서버가 받는 6값 전부다. 서버 파라미터가 하나뿐이라 묶지 않고 낱개로 둔다. */
export const REASON_FILTER_VALUES: AdminReviewReason[] = [
  AdminReviewReason.VERDICT_FAILED,
  AdminReviewReason.UNJUDGED,
  AdminReviewReason.MODEL_UNVERIFIED,
  AdminReviewReason.OVERBLOCK_SUSPECT,
  AdminReviewReason.CRITIC_OVERTURNED,
  AdminReviewReason.SELLER_APPEAL,
]

export const STATE_FILTER_VALUES: AdminReviewState[] = [
  AdminReviewState.OPEN,
  AdminReviewState.RESOLVED,
]

// ── 1. 위반 분류 ───────────────────────────────────────────────────────────────
// message 모듈 ViolationCategory 11값. 응답에는 라벨이 실리지 않아 화면이 들고 있어야 한다.

const VIOLATION_CATEGORY_LABEL: Record<string, string> = {
  CONTACT_INFO: '연락처 노출',
  OFF_PLATFORM: '외부 거래 유도',
  MEDICAL_CLAIM: '의학적 효능 주장',
  EFFICACY_OVERCLAIM: '효과 과장',
  BANNED_INGREDIENT: '금지 성분',
  FALSE_CLAIM: '허위 원산지 / 인증',
  DISPARAGEMENT: '비방 / 부당 비교',
  ABUSE: '욕설 / 혐오',
  SPAM: '광고 / 도배',
  PII: '타인 개인정보',
  IRRELEVANT: '상품과 무관',
}

export const violationCategoryLabel = (category: string): string =>
  VIOLATION_CATEGORY_LABEL[category] ?? `알 수 없는 분류 (${category})`

// ── 2. 미검사 사유와 호출 결과 ────────────────────────────────────────────────
// AI 레포가 적는 값이다. 가장 중요한 구분은 TRIAGE_CLEAR(선별이 일부러 안 봤다) 대 그 밖
// (호출이 깨져서 못 봤다)이고, 서버도 그 구분으로 통과 수용 여부를 가른다.

const SKIP_REASON_LABEL: Record<string, string> = {
  TRIAGE_CLEAR: '선별이 깨끗하다고 판단해 건너뜀',
  RULE_HIT: '규칙이 적중해 선별을 건너뛰고 승급',
  PROMOTED: '선별이 판단을 넘기고 관점 판정으로 승급',
  LLM_DISABLED: '모델 연결이 꺼져 있었음',
  EVIDENCE_UNVERIFIED: '모델이 댄 인용구를 본문에서 찾지 못함',
  TIMEOUT: '모델 호출 시간 초과',
  RATE_LIMITED: '모델 호출량 제한',
  BUDGET_EXHAUSTED: '예산 소진',
  REFUSED: '모델이 응답을 거부',
  SCHEMA_INVALID: '모델 응답이 규격에 맞지 않음',
  TRUNCATED: '모델 응답이 상한에 걸려 끊김',
  ERROR: '모델 호출 오류',
}

export const skipReasonLabel = (reason: string | null | undefined): string | null => {
  if (!reason) return null
  return SKIP_REASON_LABEL[reason] ?? `사유 ${reason}`
}

/** 선별이 일부러 건너뛴 것인가. 호출이 깨져서 못 본 것과 뜻이 정반대다. */
export const isTriageSkip = (reason: string | null | undefined): boolean =>
  reason === 'TRIAGE_CLEAR'

export const isCallFailure = (outcome: string): boolean => outcome !== 'SUCCESS'

// ── 3. 위반 JSON 파싱 ─────────────────────────────────────────────────────────
// `findings[].violations`는 타입화되지 않은 JSON 문자열이다(서버가 JSON 칼럼을 그대로 내려준다).
// **파싱 실패를 "위반 없음"으로 접으면 안 된다** — 그러면 위반이 있는 건이 화면에서 깨끗해
// 보이고, 그 상태로 허용을 누르면 위반 문구가 그대로 노출된다. 실패는 실패로 드러낸다.

export interface ViolationView {
  category: string
  categoryLabel: string
  /** 걸린 원문 인용. 없으면 null(모델이 인용을 못 댄 경우) */
  quote: string | null
  /** 셀러에게 줄 수정 제안. 규칙 단계 위반은 제안이 없다 */
  suggestion: string | null
  /** 0~1. 임계값은 서버 설정이고 화면은 표시만 한다 */
  confidence: number | null
}

export interface ViolationParseResult {
  violations: ViolationView[]
  /** 파싱하지 못한 원문. null이면 정상 파싱이다 */
  rawOnParseFailure: string | null
}

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export function parseViolations(raw: string | null | undefined): ViolationParseResult {
  if (raw == null || raw.trim() === '') return { violations: [], rawOnParseFailure: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { violations: [], rawOnParseFailure: raw }
  }
  if (!Array.isArray(parsed)) return { violations: [], rawOnParseFailure: raw }

  const violations: ViolationView[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) return { violations: [], rawOnParseFailure: raw }
    const row = entry as Record<string, unknown>
    const category = asString(row['category'])
    // 분류가 없으면 "무엇에 걸렸는지"를 말할 수 없다 — 나머지 필드만 보여 주면 운영자가
    // 판단할 수 없으므로 원문을 그대로 드러낸다.
    if (category == null) return { violations: [], rawOnParseFailure: raw }
    violations.push({
      category,
      categoryLabel: violationCategoryLabel(category),
      quote: asString(row['quote']),
      suggestion: asString(row['suggestion']),
      confidence: asNumber(row['confidence']),
    })
  }
  return { violations, rawOnParseFailure: null }
}

// ── 4. 파이프라인 흐름 ────────────────────────────────────────────────────────
// 단계는 다섯이다: 룰 / 선별 / 관점 판정(둘) / 비평 / 수정문구.
//
// 앞 셋은 `findings`가 확증한다 — 관점마다 한 행이고 통과·위반·미검사가 그 행에 적혀 있다.
// **뒤 둘은 확증할 수 없다.** 비평과 수정문구 호출이 원장에 둘 다 `ALL` 관점으로 적히고
// (AI 레포 `_criticize`·`_rewrite`가 같은 값을 넘긴다) 단계 이름을 싣는 칼럼이 없기 때문이다.
// 그래서 순서로 가른다 — 비평이 먼저 돌고, 수정문구는 비평이 판정을 유지했을 때만 돈다.
// 비평이 뒤집었다는 사실만은 서버가 등재 사유(CRITIC_OVERTURNED)로 확증해 주므로 그쪽을 먼저 믿는다.
// 추정인 자리는 화면에도 추정이라고 적고 근거(모델 id·결과)를 함께 보여 준다.

export type PipelineStageKey = 'rule' | 'triage' | 'perspective' | 'critic' | 'notice'

/**
 * 단계가 무엇을 했는가.
 *
 * 앞 세 단계는 통과·위반·미검사 축이고, 비평·수정문구는 그 축이 없다(둘은 판정을 내리는
 * 단계가 아니다) — 그쪽은 `ran`·`overturned`·`not-run`을 쓴다. 한 열거로 묶어 둬야 라우트가
 * 단계마다 다른 분기를 쓰지 않는다.
 */
export type PipelineStageStatus =
  | 'clear'
  | 'violation'
  | 'unchecked'
  | 'not-run'
  /** 비평·수정문구가 실제로 돌았다 */
  | 'ran'
  /** 비평이 모델 위반을 뒤집었다 */
  | 'overturned'
  /** 응답에 근거가 없어 돌았는지 말할 수 없다 */
  | 'unknown'

const JUDGING_STATUS_META: Record<PipelineStageStatus, LabelMeta> = {
  clear: { label: '통과', variant: 'success' },
  violation: { label: '위반', variant: 'error' },
  unchecked: { label: '미검사', variant: 'warning' },
  'not-run': { label: '기록 없음', variant: 'muted' },
  ran: { label: '실행', variant: 'success' },
  overturned: { label: '뒤집음', variant: 'info' },
  unknown: { label: '알 수 없음', variant: 'warning' },
}

const CRITIC_STATUS_META: Record<string, LabelMeta> = {
  overturned: { label: '뒤집음', variant: 'info' },
  ran: { label: '판정 유지', variant: 'success' },
  'not-run': { label: '미실행', variant: 'muted' },
}

const NOTICE_STATUS_META: Record<string, LabelMeta> = {
  ran: { label: '문구 생성', variant: 'success' },
  'not-run': { label: '미실행', variant: 'muted' },
}

function statusMetaFor(key: PipelineStageKey, status: PipelineStageStatus): LabelMeta {
  if (key === 'critic') return CRITIC_STATUS_META[status] ?? JUDGING_STATUS_META[status]
  if (key === 'notice') return NOTICE_STATUS_META[status] ?? JUDGING_STATUS_META[status]
  return JUDGING_STATUS_META[status]
}

export interface PipelinePerspectiveRow {
  perspective: string
  perspectiveLabel: string
  status: PipelineStageStatus
  /** 미검사일 때 왜 안 봤는지 */
  skipReason: string | null
  triageSkipped: boolean
  violations: ViolationView[]
  rawOnParseFailure: string | null
}

export interface PipelineStageView {
  key: PipelineStageKey
  label: string
  /** 그 단계가 무엇을 보는 단계인지 한 줄 */
  caption: string
  status: PipelineStageStatus
  /** 단계마다 뜻이 달라 라벨은 매퍼가 정한다(비평의 '실행'은 '통과'가 아니다) */
  statusMeta: LabelMeta
  /** 미검사·미실행 사유 */
  reason: string | null
  /** 관점 판정 단계의 관점별 줄. 다른 단계는 빈 배열 */
  rows: PipelinePerspectiveRow[]
  /** 이 단계의 모델 호출(원장). 룰 단계는 비어 있다 */
  calls: PipelineCallView[]
  /** 근거가 추정인 단계 표시 */
  inferred: boolean
}

export interface PipelineCallView {
  perspective: string | null
  modelId: string
  outcome: string
  failed: boolean
  costMicroUsd: number
  latencyMs: number
}

const PERSPECTIVE_LABEL: Record<string, string> = {
  [InspectionPerspectiveKind.ALL]: '단일 판정',
  [InspectionPerspectiveKind.DISPLAY_ADS]: '표시 / 광고',
  [InspectionPerspectiveKind.CONDUCT_TRADE]: '행위 / 거래',
  [InspectionPerspectiveKind.RULE]: '규칙',
  [InspectionPerspectiveKind.TRIAGE]: '선별',
}

export const perspectiveLabel = (value: string | null | undefined): string => {
  if (!value) return '관점 미기재'
  return PERSPECTIVE_LABEL[value] ?? `알 수 없는 관점 (${value})`
}

/** 모델 판정 관점. RULE·TRIAGE는 "모델이 봤는가" 집계에서 빠진다(서버와 같은 규칙). */
const MODEL_PERSPECTIVES: string[] = [
  InspectionPerspectiveKind.DISPLAY_ADS,
  InspectionPerspectiveKind.CONDUCT_TRADE,
  InspectionPerspectiveKind.ALL,
]

const OUTCOME_STATUS: Record<string, PipelineStageStatus> = {
  [PerspectiveOutcome.CLEAR]: 'clear',
  [PerspectiveOutcome.VIOLATION]: 'violation',
  [PerspectiveOutcome.UNCHECKED]: 'unchecked',
}

function toPerspectiveRow(finding: AdminInspectionFinding): PipelinePerspectiveRow {
  const parsed = parseViolations(finding.violations)
  return {
    perspective: finding.perspective,
    perspectiveLabel: perspectiveLabel(finding.perspective),
    status: OUTCOME_STATUS[finding.outcome] ?? 'unknown',
    skipReason: skipReasonLabel(finding.skipReason),
    triageSkipped: isTriageSkip(finding.skipReason),
    violations: parsed.violations,
    rawOnParseFailure: parsed.rawOnParseFailure,
  }
}

function toCallView(call: AdminInspectionCall): PipelineCallView {
  return {
    perspective: call.perspective ?? null,
    modelId: call.modelId,
    outcome: call.outcome,
    failed: isCallFailure(call.outcome),
    costMicroUsd: call.costMicroUsd,
    latencyMs: call.latencyMs,
  }
}

/** 여러 관점을 한 단계 상태로 접는다. 위반이 하나라도 있으면 위반, 그다음이 통과다. */
function foldStatus(rows: PipelinePerspectiveRow[]): PipelineStageStatus {
  if (rows.length === 0) return 'not-run'
  if (rows.some(row => row.status === 'violation')) return 'violation'
  if (rows.some(row => row.status === 'clear')) return 'clear'
  if (rows.every(row => row.status === 'unchecked')) return 'unchecked'
  return 'unknown'
}

function uncheckedReason(rows: PipelinePerspectiveRow[]): string | null {
  const reasons = rows.map(row => row.skipReason).filter((value): value is string => value != null)
  if (reasons.length === 0) return null
  return [...new Set(reasons)].join(' / ')
}

export function toPipelineStages(detail: AdminInspectionDetailData): PipelineStageView[] {
  const findings = detail.findings
  const byPerspective = (perspective: string) =>
    findings.filter(finding => finding.perspective === perspective).map(toPerspectiveRow)
  const callsOf = (perspective: string) =>
    detail.calls.filter(call => call.perspective === perspective).map(toCallView)

  const ruleRows = byPerspective(InspectionPerspectiveKind.RULE)
  const triageRows = byPerspective(InspectionPerspectiveKind.TRIAGE)
  const modelRows = findings
    .filter(finding => MODEL_PERSPECTIVES.includes(finding.perspective))
    .map(toPerspectiveRow)

  // 비평·수정문구 후보. 원장에서 ALL 관점으로 적힌 호출이고, 관점 판정 호출(DISPLAY_ADS·
  // CONDUCT_TRADE)과는 구분된다. 팬아웃을 끄면 관점 판정도 ALL로 오므로, 그때는 관점 판정
  // 호출 수만큼을 앞에서 떼어 낸다.
  const allCalls = detail.calls
    .filter(call => call.perspective === InspectionPerspectiveKind.ALL)
    .map(toCallView)
  const singlePerspectiveCalls = findings.some(
    finding => finding.perspective === InspectionPerspectiveKind.ALL,
  )
    ? 1
    : 0
  const escalationCalls = allCalls.slice(singlePerspectiveCalls)
  const criticOverturned =
    detail.summary.adminReviewReason === AdminReviewReason.CRITIC_OVERTURNED
  const criticCall = escalationCalls[0] ?? null
  const noticeCall = escalationCalls[1] ?? null

  const criticStatus: PipelineStageStatus = criticOverturned
    ? 'overturned'
    : criticCall
      ? 'ran'
      : 'not-run'
  const noticeStatus: PipelineStageStatus = noticeCall ? 'ran' : 'not-run'

  const drafts: Omit<PipelineStageView, 'statusMeta'>[] = [
    {
      key: 'rule',
      label: '룰',
      caption: '정규식 / 네거티브 리스트가 결정론적으로 본다',
      status: foldStatus(ruleRows),
      reason: ruleRows.length === 0 ? '규칙 단계 기록이 없어요.' : uncheckedReason(ruleRows),
      rows: ruleRows,
      calls: [],
      inferred: false,
    },
    {
      key: 'triage',
      label: '선별',
      caption: '더 볼 필요가 있는지만 가른다 (반려 권한 없음)',
      status: foldStatus(triageRows),
      reason:
        triageRows.length === 0
          ? '선별 기록이 없어요. 선별 단계가 꺼져 있었을 수 있어요.'
          : uncheckedReason(triageRows),
      rows: triageRows,
      calls: callsOf(InspectionPerspectiveKind.TRIAGE),
      inferred: false,
    },
    {
      key: 'perspective',
      label: '관점 판정',
      caption: '표시 / 광고와 행위 / 거래를 따로 판단한다',
      status: foldStatus(modelRows),
      reason: modelRows.length === 0 ? '관점 판정 기록이 없어요.' : uncheckedReason(modelRows),
      rows: modelRows,
      calls: [
        ...callsOf(InspectionPerspectiveKind.DISPLAY_ADS),
        ...callsOf(InspectionPerspectiveKind.CONDUCT_TRADE),
        ...allCalls.slice(0, singlePerspectiveCalls),
      ],
      inferred: false,
    },
    {
      key: 'critic',
      label: '비평',
      caption: '보류 판정이 오탐인지 다른 모델에게 되묻는다',
      status: criticStatus,
      reason: criticReason(criticOverturned, criticCall, detail.summary),
      rows: [],
      calls: criticCall ? [criticCall] : [],
      // 뒤집힘만 서버가 등재 사유로 확증한다. 나머지는 원장 순서로 가른 추정이다.
      inferred: !criticOverturned,
    },
    {
      key: 'notice',
      label: '수정문구',
      caption: '셀러가 고칠 수 있게 안내 문구를 만든다 (상품만)',
      status: noticeStatus,
      reason: noticeReason(noticeCall, detail.summary),
      rows: [],
      calls: noticeCall ? [noticeCall] : [],
      inferred: true,
    },
  ]
  return drafts.map(stage => ({ ...stage, statusMeta: statusMetaFor(stage.key, stage.status) }))
}

function criticReason(
  overturned: boolean,
  call: PipelineCallView | null,
  summary: AdminInspectionSummary,
): string | null {
  if (overturned) return '비평이 모델 위반을 뒤집어 통과로 바꿨어요.'
  if (call) return '비평이 돌아 앞선 판정을 유지했어요. 원장에 단계 이름이 없어 추정이에요.'
  if (summary.judgment === InspectionJudgment.PASS) {
    return '보류 판정이 아니어서 비평을 부르지 않았어요.'
  }
  if (summary.judgment === InspectionJudgment.FLAG) {
    return '모델을 부르기 전에 규칙 단계가 확정했거나 비평 단계가 꺼져 있었어요.'
  }
  return '판정이 끝나지 않아 비평까지 가지 않았어요.'
}

function noticeReason(
  call: PipelineCallView | null,
  summary: AdminInspectionSummary,
): string | null {
  if (call) return '수정문구가 돌았어요. 원장에 단계 이름이 없어 추정이에요.'
  if (summary.judgment === InspectionJudgment.FLAG) {
    return '규칙 단계에서 확정됐거나 수정문구 단계가 꺼져 있었어요.'
  }
  return '보류 판정이 아니어서 수정문구를 만들지 않았어요.'
}

/** 상세의 모든 관점에서 위반을 모은다 — 화면이 가장 먼저 보여 줘야 하는 값이다. */
export function collectViolations(detail: AdminInspectionDetailData): PipelinePerspectiveRow[] {
  return detail.findings
    .map(toPerspectiveRow)
    .filter(row => row.violations.length > 0 || row.rawOnParseFailure != null)
}

// ── 5. 목록 행 ─────────────────────────────────────────────────────────────────

export interface QueueRowView {
  /** DataTable rowKey용 문자열 id. 서버 식별자는 inspectionId(Long)다. */
  id: string
  inspectionId: number
  targetType: string
  judgment: string | null
  reason: string | null
  state: string | null
  appealState: string | null
  adminDecision: string | null
  /** 상품 공개 id. 리뷰 대상이거나 상품이 지워졌으면 null */
  productId: string | null
  productName: string | null
  productInspectionStatus: string | null
  storeName: string | null
  /** 첫 위반의 인용구(서버 reasonSummary). 전수는 상세에만 있다 */
  reasonSummary: string | null
  /**
   * 대기가 시작된 시각.
   *
   * **큐 등재 시각 컬럼이 서버에 없다.** 이의가 있으면 접수 시각, 판정이 났으면 그 시각,
   * 둘 다 없으면 최초 요청 시각이 가장 가까운 근사다. 이름을 `queuedAt`으로 짓지 않는 이유는
   * 그게 거짓이기 때문이다.
   */
  waitingSince: string
}

export function toQueueRow(summary: AdminInspectionSummary): QueueRowView {
  return {
    id: String(summary.inspectionId),
    inspectionId: summary.inspectionId,
    targetType: summary.targetType,
    judgment: summary.judgment ?? null,
    reason: summary.adminReviewReason ?? null,
    state: summary.adminReviewState ?? null,
    appealState: summary.appealState ?? null,
    adminDecision: summary.adminDecision ?? null,
    productId: summary.productId ?? null,
    productName: summary.productName ?? null,
    productInspectionStatus: summary.productInspectionStatus ?? null,
    storeName: summary.storeName ?? null,
    reasonSummary: summary.reasonSummary ?? null,
    waitingSince: summary.appealedAt ?? summary.settledAt ?? summary.requestedAt,
  }
}

// ── 6. 시각·기간 ──────────────────────────────────────────────────────────────
// 서버는 오프셋 없는 LocalDateTime 문자열을 준다. 운영자 브라우저를 서버와 같은 시간대로
// 전제하고 로컬 시각으로 읽는다(다른 어드민 화면도 같은 전제다).

export function formatWireDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [date, time] = value.split('T')
  if (!date) return '—'
  return time ? `${date} ${time.slice(0, 5)}` : date
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * 대기 시간. 가장 큰 단위 둘까지만 적는다(3일 2시간 / 5시간 12분 / 7분).
 *
 * 미래 시각이 오면 음수가 되는데, 그때 "-3분"을 띄우면 운영자가 버그를 데이터로 읽는다 —
 * 0분으로 접고 그 이상은 추측하지 않는다.
 */
export function formatWaitingTime(since: string | null | undefined, now: number): string {
  if (!since) return '—'
  const start = new Date(since).getTime()
  if (Number.isNaN(start)) return '—'
  const elapsed = Math.max(0, now - start)
  const days = Math.floor(elapsed / DAY_MS)
  const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS)
  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
  return `${minutes}분`
}

/** 원장 비용 표시. 백만분의 1 달러라 그대로 쓰면 읽을 수 없다. */
export function formatCostMicroUsd(micro: number): string {
  if (micro === 0) return '$0 (단가표에 없는 모델일 수 있어요)'
  return `$${(micro / 1_000_000).toFixed(4)}`
}

// ── 7. 결정 ───────────────────────────────────────────────────────────────────

export type InspectionDecision = 'allow' | 'block'

export const DECISION_NOTE_MAX_LENGTH = 500

/** 차단은 사유가 필수다(공백만이면 서버가 400 errorCode 40502로 거절한다). */
export const isDecisionReady = (decision: InspectionDecision, note: string): boolean =>
  decision === 'allow' || note.trim() !== ''

/** 결정할 수 있는 건인가 — 서버는 큐가 열려 있을 때만 결정을 받는다(409 errorCode 40501). */
export const isDecidable = (state: string | null | undefined): boolean =>
  state === AdminReviewState.OPEN

// ── 8. 에러 분기 ──────────────────────────────────────────────────────────────
// axios 타입을 끌어오지 않으려고 duck-typing으로 읽는다(web-admin 심사 화면 관례).
// 서버 message는 -습니다 격식체라 그대로 띄우지 않는다(카피 규칙).

interface WireError {
  status?: number
  errorCode?: number
}

export function toWireError(error: unknown): WireError {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return { status: response?.status, errorCode: response?.data?.errorCode }
}

export const isForbidden = (error: unknown): boolean => toWireError(error).status === 403

/** 상품 내용이 바뀌어 이 검수로는 결정할 수 없다(409 errorCode 40508). */
export const isContentChanged = (error: unknown): boolean => {
  const { status, errorCode } = toWireError(error)
  return status === 409 && errorCode === 40508
}

/** 화면이 들고 있는 상태가 낡았다 — 재조회가 답인 경우. */
export function isStaleDecision(error: unknown): boolean {
  const { status, errorCode } = toWireError(error)
  if (status === 409) return errorCode === 40501 || errorCode === 90003 || errorCode == null
  return status === 404 && errorCode === 40500
}

export function decisionErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (isContentChanged(error)) {
    return '셀러가 그사이 상품 내용을 고쳐서 이 검수로는 결정할 수 없어요. 바뀐 내용은 새 검수로 올라오니 그 건에서 결정해 주세요. 지금 누른 결정은 저장되지 않았어요.'
  }
  if (isStaleDecision(error)) {
    return status === 404
      ? '검수를 찾을 수 없어요. 목록을 다시 불러왔어요.'
      : '이미 처리된 검수예요. 다른 운영자가 먼저 처리했을 수 있어 목록을 다시 불러왔어요.'
  }
  if (status === 400 && errorCode === 40502) return '차단 사유를 입력해 주세요.'
  if (status === 400 && errorCode === 90001)
    return `사유와 메모는 ${DECISION_NOTE_MAX_LENGTH}자 이하로 입력해 주세요.`
  if (isForbidden(error)) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function listErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (isForbidden(error))
    return '어드민 권한이 없어 검수 큐를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 400 && errorCode === 90001)
    return '필터 값을 서버가 알지 못해요. 필터를 다시 선택해 주세요.'
  return '검수 큐를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/** 목록 문구를 재사용하면 목록은 정상인데 상세만 깨진 상황에서 틀린 대상을 지목한다. */
export function detailErrorMessage(error: unknown): string {
  const { status } = toWireError(error)
  if (isForbidden(error))
    return '어드민 권한이 없어 검수 상세를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '검수를 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  return '검수 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}
