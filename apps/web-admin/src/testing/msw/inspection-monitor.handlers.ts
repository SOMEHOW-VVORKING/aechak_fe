import { http, HttpResponse } from 'msw'
import { adminBase, clampSize, errorBody } from './base'

// `GET /admin/inspections` 둘(목록·상세)의 서버 흉내. 조회뿐이라 쓰기 핸들러가 없다.
//
// 이 더블이 지켜야 하는 성질이 넷이고, 뭉개면 화면의 회귀가 조용히 통과한다.
//
//   1. **목록 응답에 임차(leaseOwner·leaseExpiresAt)를 싣지 않는다.** 서버가 상세에만 싣기
//      때문이다 — 목록 행에서 그 값을 읽는 코드가 들어오면 여기서 드러나야 한다.
//   2. **판정 널을 그대로 내려보낸다.** 널과 PASS가 다르다는 것이 이 화면의 전부다.
//   3. **알 수 없는 열거 값은 400/90001이다.** 상품 카탈로그 경로처럼 "조건 없음"으로 넘기지
//      않는다(그쪽은 서버가 실제로 그렇게 동작한다 — 경로마다 다르다).
//   4. **관점 기록이 없으면 빈 배열이다.** 화면이 다섯 칸을 스스로 채우는지가 그때 드러난다.
export const ADMIN_INSPECTIONS_URL = `${adminBase}/admin/inspections`
export const ADMIN_INSPECTION_DETAIL_URL = `${ADMIN_INSPECTIONS_URL}/:inspectionId`

export type WireProcessingState = 'QUEUED' | 'IN_FLIGHT' | 'SETTLED'
export type WireJudgment = 'PASS' | 'FLAG' | 'UNJUDGED' | 'FAILED'
export type WireTargetType = 'PRODUCT' | 'REVIEW'
export type WirePerspectiveKind = 'RULE' | 'TRIAGE' | 'DISPLAY_ADS' | 'CONDUCT_TRADE' | 'ALL'
export type WirePerspectiveOutcome = 'VIOLATION' | 'CLEAR' | 'UNCHECKED'

const PROCESSING_STATES: WireProcessingState[] = ['QUEUED', 'IN_FLIGHT', 'SETTLED']
const JUDGMENTS: WireJudgment[] = ['PASS', 'FLAG', 'UNJUDGED', 'FAILED']
const TARGET_TYPES: WireTargetType[] = ['PRODUCT', 'REVIEW']

/** 파이프라인 순서 — 서버가 이 순서로 내려보낸다. */
const PERSPECTIVE_ORDER: WirePerspectiveKind[] = [
  'RULE',
  'TRIAGE',
  'DISPLAY_ADS',
  'CONDUCT_TRADE',
  'ALL',
]

export interface AdminInspectionPerspectiveWire {
  perspective: WirePerspectiveKind
  outcome: WirePerspectiveOutcome
  /** UNCHECKED에만 들어온다. */
  skipReason: string | null
  /** 위반 상세 JSON **원문 문자열**. 파싱된 객체가 아니다. */
  violations: string | null
}

/** BE `AdminInspectionDetailResponse` 모양 그대로. 목록 행은 여기서 투영해 만든다. */
export interface AdminInspectionWire {
  inspectionId: number
  targetType: WireTargetType
  targetRef: number
  productId: string | null
  productName: string | null
  processingState: WireProcessingState
  /** 널 = 아직 판정 없음. PASS가 아니다. */
  judgment: WireJudgment | null
  attempt: number
  requestedAt: string
  settledAt: string | null
  policyVersion: string
  promptVersion: string | null
  contentHash: string
  reasonCode: string | null
  reasonSummary: string | null
  sellerNotice: string | null
  leaseOwner: string | null
  leaseExpiresAt: string | null
  perspectives: AdminInspectionPerspectiveWire[]
}

let inspections: AdminInspectionWire[] = []

export function makeAdminInspectionPerspectiveWire(
  overrides: Partial<AdminInspectionPerspectiveWire> = {},
): AdminInspectionPerspectiveWire {
  return {
    perspective: 'RULE',
    outcome: 'CLEAR',
    skipReason: null,
    violations: null,
    ...overrides,
  }
}

export function makeAdminInspectionWire(
  overrides: Partial<AdminInspectionWire> = {},
): AdminInspectionWire {
  return {
    inspectionId: 7001,
    targetType: 'PRODUCT',
    targetRef: 9001,
    productId: '01JMONITORPRODUCT00000001',
    productName: '동결건조 닭가슴살 100g',
    processingState: 'IN_FLIGHT',
    judgment: null,
    attempt: 1,
    requestedAt: '2026-11-07T10:00:00',
    settledAt: null,
    policyVersion: 'v3',
    promptVersion: null,
    contentHash: 'a'.repeat(64),
    reasonCode: null,
    reasonSummary: null,
    sellerNotice: null,
    leaseOwner: 'worker-7',
    leaseExpiresAt: '2026-11-07T10:01:00',
    perspectives: [],
    ...overrides,
  }
}

export function seedAdminInspections(rows: AdminInspectionWire[] = []): void {
  inspections = rows.map(row => ({ ...row, perspectives: [...row.perspectives] }))
}

/** 목록 응답에 실리는 열한 필드만 투영한다 — 임차·사유·관점은 상세에만 있다. */
function summaryOf(row: AdminInspectionWire) {
  return {
    inspectionId: row.inspectionId,
    targetType: row.targetType,
    targetRef: row.targetRef,
    productId: row.productId,
    productName: row.productName,
    processingState: row.processingState,
    judgment: row.judgment,
    attempt: row.attempt,
    requestedAt: row.requestedAt,
    settledAt: row.settledAt,
    policyVersion: row.policyVersion,
  }
}

function detailOf(row: AdminInspectionWire) {
  return {
    ...summaryOf(row),
    promptVersion: row.promptVersion,
    contentHash: row.contentHash,
    reasonCode: row.reasonCode,
    reasonSummary: row.reasonSummary,
    sellerNotice: row.sellerNotice,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    perspectives: [...row.perspectives].sort(
      (a, b) =>
        PERSPECTIVE_ORDER.indexOf(a.perspective) - PERSPECTIVE_ORDER.indexOf(b.perspective),
    ),
  }
}

const badRequest = () =>
  HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })

/** 알 수 없는 열거 값은 400이다 — 조건 없음으로 넘기면 오타가 전수 조회로 조용히 번진다. */
function enumParam<T extends string>(raw: string | null, allowed: T[]): T | null | false {
  if (raw == null) return null
  return allowed.includes(raw as T) ? (raw as T) : false
}

/** page 음수는 0으로 보정한다(400이 아니다). */
function pageFrom(raw: string | null): number {
  const parsed = Math.trunc(Number(raw ?? 0))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export const inspectionMonitorHandlers = [
  http.get(ADMIN_INSPECTIONS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const processingState = enumParam(params.get('processingState'), PROCESSING_STATES)
    const targetType = enumParam(params.get('targetType'), TARGET_TYPES)
    const judgment = enumParam(params.get('judgment'), JUDGMENTS)
    if (processingState === false || targetType === false || judgment === false) return badRequest()

    const page = pageFrom(params.get('page'))
    const size = clampSize(params.get('size'))
    const matched = inspections
      // 노출 조건을 걸지 않는다 — 판정 전인 건이 이 화면의 주인공이다.
      .filter(row => processingState == null || row.processingState === processingState)
      .filter(row => targetType == null || row.targetType === targetType)
      .filter(row => judgment == null || row.judgment === judgment)
    // 요청 시각 내림차순 + id 내림차순 고정. 정렬 파라미터를 받지 않는다.
    const sorted = [...matched].sort((a, b) =>
      a.requestedAt === b.requestedAt
        ? b.inspectionId - a.inspectionId
        : b.requestedAt.localeCompare(a.requestedAt),
    )
    return HttpResponse.json({
      data: {
        // 범위를 넘은 page는 빈 목록이고 totalCount는 그대로다.
        items: sorted.slice(page * size, page * size + size).map(summaryOf),
        totalCount: matched.length,
      },
    })
  }),

  http.get(ADMIN_INSPECTION_DETAIL_URL, ({ params }) => {
    const raw = Array.isArray(params['inspectionId'])
      ? params['inspectionId'][0]
      : params['inspectionId']
    if (raw == null || !/^\d+$/.test(raw)) return badRequest()
    const row = inspections.find(item => item.inspectionId === Number(raw))
    // 40508 — 신설된 코드다. 화면이 이 숫자로 문구를 가른다.
    if (!row) {
      return HttpResponse.json(errorBody(40508, '검수를 찾을 수 없습니다.'), { status: 404 })
    }
    return HttpResponse.json({ data: detailOf(row) })
  }),
]
