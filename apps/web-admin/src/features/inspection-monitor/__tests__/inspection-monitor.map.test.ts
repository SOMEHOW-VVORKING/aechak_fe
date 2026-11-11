import { describe, expect, it } from 'vitest'
import type { AdminInspectionPerspective, AdminInspectionSummary } from '@aechak/api'
import {
  PERSPECTIVE_OUTCOME_META,
  UNCHECKED_SKIPPED_HINT,
  elapsedMs,
  formatElapsed,
  inProgressFirst,
  isUnsettledOutcome,
  parseViolations,
  skipReasonLabel,
  toInspectionRow,
  toPerspectiveCells,
} from '../inspection-monitor.map'

// 매퍼 단위 테스트 — 통과·미검사·기록 없음을 가르는 자리와 경과 계산은 화면을 거치지 않고
// 여기서 고정한다. 화면 테스트는 그 값이 실제로 다른 글자로 그려지는지를 본다.

function summary(overrides: Partial<AdminInspectionSummary> = {}): AdminInspectionSummary {
  return {
    inspectionId: 1,
    targetType: 'PRODUCT',
    targetRef: 11,
    processingState: 'SETTLED',
    attempt: 0,
    requestedAt: '2026-11-07T10:00:00',
    policyVersion: 'v3',
    ...overrides,
  }
}

const perspective = (
  overrides: Partial<AdminInspectionPerspective> & Pick<AdminInspectionPerspective, 'perspective'>,
): AdminInspectionPerspective => ({ outcome: 'CLEAR', ...overrides })

describe('검수 진행 현황 매퍼', () => {
  it('[AC-ADMIN-INSP-M01] 판정 널은 NONE이고 PASS가 아니다', () => {
    expect(toInspectionRow(summary({ judgment: null })).judgment).toBe('NONE')
    // 키 자체가 없이 올 수도 있다(서버가 널 직렬화를 와이어로 확인하지 못했다).
    expect(toInspectionRow(summary()).judgment).toBe('NONE')
    expect(toInspectionRow(summary({ judgment: 'PASS' })).judgment).toBe('PASS')
  })

  it('[AC-ADMIN-INSP-M02] 기한 초과·판정 실패·판정 전은 통과가 아닌 결말로 묶이고 PASS는 아니다', () => {
    const outcomes = (['UNJUDGED', 'FAILED', null] as const).map(judgment =>
      isUnsettledOutcome(toInspectionRow(summary({ judgment }))),
    )
    expect(outcomes).toEqual([true, true, true])
    expect(isUnsettledOutcome(toInspectionRow(summary({ judgment: 'PASS' })))).toBe(false)
    // FLAG는 "봤고 문제를 찾았다"라 통과도 미결말도 아니다.
    expect(isUnsettledOutcome(toInspectionRow(summary({ judgment: 'FLAG' })))).toBe(false)
  })

  it('[AC-ADMIN-INSP-M03] 통째로 본 검수는 나눠 묻는 방식의 빈 줄을 그리지 않는다', () => {
    const cells = toPerspectiveCells(
      [
        perspective({ perspective: 'RULE', outcome: 'CLEAR' }),
        perspective({ perspective: 'ALL', outcome: 'CLEAR' }),
      ],
      'SETTLED',
    )

    expect(cells.map(cell => [cell.perspective, cell.outcome])).toEqual([
      ['RULE', 'CLEAR'],
      // 선별은 방식과 상관없이 늘 자리가 있다.
      ['TRIAGE', 'ABSENT'],
      ['ALL', 'CLEAR'],
    ])
  })

  it('[AC-ADMIN-INSP-M04] 우리가 모르는 관점이 와도 지우지 않고 뒤에 덧붙인다', () => {
    const cells = toPerspectiveCells(
      [perspective({ perspective: 'SAFETY' as never, outcome: 'VIOLATION' })],
      'SETTLED',
    )

    // 규칙/선별/상세 검수 세 줄 뒤에 모르는 관점이 남는다 — 조용히 지우면 그 관점이 돌았다는
    // 사실 자체가 화면에서 사라진다.
    expect(cells.map(cell => cell.perspective)).toEqual(['RULE', 'TRIAGE', 'ALL', 'SAFETY'])
    expect(cells[3]).toMatchObject({ perspective: 'SAFETY', outcome: 'VIOLATION', label: 'SAFETY' })
  })

  it('[AC-ADMIN-INSP-M09] 나눠 물은 검수는 빈 통합 줄을 그리지 않고 못 간 관점은 남긴다', () => {
    const cells = toPerspectiveCells(
      [
        perspective({ perspective: 'RULE', outcome: 'CLEAR' }),
        perspective({ perspective: 'DISPLAY_ADS', outcome: 'VIOLATION' }),
      ],
      'IN_FLIGHT',
    )

    expect(cells.map(cell => [cell.perspective, cell.outcome])).toEqual([
      ['RULE', 'CLEAR'],
      ['TRIAGE', 'ABSENT'],
      ['DISPLAY_ADS', 'VIOLATION'],
      // 같은 방식의 나머지 관점은 쓰는 줄이라 빈 채로 남는다.
      ['CONDUCT_TRADE', 'ABSENT'],
    ])
  })

  it('[AC-ADMIN-INSP-M10] 상세 검수 행이 하나도 없으면 그 자리를 한 줄로만 남긴다', () => {
    const cells = toPerspectiveCells(
      [perspective({ perspective: 'RULE', outcome: 'VIOLATION' })],
      'SETTLED',
    )

    expect(cells.map(cell => [cell.label, cell.outcome])).toEqual([
      ['자동 규칙 검사', 'VIOLATION'],
      ['1차 선별', 'ABSENT'],
      ['상세 검수', 'ABSENT'],
    ])
    expect(toPerspectiveCells([], 'QUEUED').map(cell => cell.perspective)).toEqual([
      'RULE',
      'TRIAGE',
      'ALL',
    ])
  })

  it('[AC-ADMIN-INSP-M11] 서버가 보낸 행은 두 방식이 섞여 와도 하나도 빼지 않는다', () => {
    const cells = toPerspectiveCells(
      [
        perspective({ perspective: 'DISPLAY_ADS', outcome: 'CLEAR' }),
        perspective({ perspective: 'ALL', outcome: 'UNCHECKED', skipReason: 'WAIT_LIMIT_EXCEEDED' }),
      ],
      'SETTLED',
    )

    // 보낸 두 행은 그대로 있고, 오지 않은 거래 행위 줄은 지어내지 않는다.
    expect(cells.map(cell => [cell.perspective, cell.outcome])).toEqual([
      ['RULE', 'ABSENT'],
      ['TRIAGE', 'ABSENT'],
      ['DISPLAY_ADS', 'CLEAR'],
      ['ALL', 'UNCHECKED'],
    ])
  })

  it('[AC-ADMIN-INSP-M12] 기록 없는 줄의 문구는 판정이 끝났는지로 갈리고 끝난 건에 아직을 쓰지 않는다', () => {
    const hintOf = (state: 'QUEUED' | 'IN_FLIGHT' | 'SETTLED') =>
      toPerspectiveCells([], state).find(cell => cell.perspective === 'ALL')?.hint

    expect(hintOf('SETTLED')).toBe('판정이 끝날 때까지 이 단계는 돌지 않았어요')
    expect(hintOf('SETTLED')).not.toContain('아직')
    expect(hintOf('IN_FLIGHT')).toBe('아직 이 단계에 닿지 않았어요')
    expect(hintOf('QUEUED')).toBe('아직 이 단계에 닿지 않았어요')
  })

  it('[AC-ADMIN-INSP-M13] 미검사 사유는 아는 코드면 한국어로, 모르는 코드면 코드 그대로 나온다', () => {
    expect(skipReasonLabel('TRIAGE_CLEAR')).toBe('1차 선별이 문제없다고 봐서 상세 검수를 하지 않았어요')
    expect(skipReasonLabel('TRIAGE_CERTAIN')).toBe(
      '1차 선별이 위반을 확정해서 상세 검수를 하지 않았어요',
    )
    expect(skipReasonLabel('BRAND_NEW_REASON')).toBe('BRAND_NEW_REASON')
    // 객체 내장 키가 와도 문구표에 걸리지 않는다.
    expect(skipReasonLabel('constructor')).toBe('constructor')

    const [, triage] = toPerspectiveCells(
      [perspective({ perspective: 'TRIAGE', outcome: 'UNCHECKED', skipReason: 'PROMOTED' })],
      'SETTLED',
    )
    expect(triage?.skipReason).toBe('1차 선별이 판정하지 않고 상세 검수로 넘겼어요')
  })

  it('[AC-ADMIN-INSP-M14] 저장된 위반 상세를 분류/걸린 표현/수정 제안으로 푼다', () => {
    const raw = JSON.stringify([
      {
        category: 'MEDICAL_CLAIM',
        perspective: 'DISPLAY_ADS',
        spanStart: 0,
        spanEnd: 14,
        quote: '관절염 치료에 효과가 있다',
        suggestion: '관절 건강에 도움을 줄 수 있어요',
        confidence: 0.91,
      },
      // 규칙 단계 위반은 제안이 없고, 리뷰 전용 분류도 제 이름으로 나온다.
      { category: 'IRRELEVANT', perspective: 'ALL', quote: null, suggestion: null },
      { category: 'BRAND_NEW_CATEGORY', perspective: 'ALL' },
    ])

    expect(parseViolations(raw)).toEqual([
      {
        categoryLabel: '질병 치료 효능',
        quote: '관절염 치료에 효과가 있다',
        suggestion: '관절 건강에 도움을 줄 수 있어요',
      },
      { categoryLabel: '상품과 무관한 내용', quote: null, suggestion: null },
      { categoryLabel: '기타', quote: null, suggestion: null },
    ])
  })

  it.each([
    ['JSON이 아닌 글자', '관절염 치료'],
    ['배열이 아닌 객체', '{"category":"MEDICAL_CLAIM"}'],
    ['빈 배열', '[]'],
    ['분류가 없는 항목', '[{"quote":"관절염 치료","rule":"MEDICAL_CLAIM"}]'],
    ['객체가 아닌 항목', '["MEDICAL_CLAIM"]'],
    ['인용이 글자가 아닌 항목', '[{"category":"MEDICAL_CLAIM","quote":{"text":"x"}}]'],
    ['한 항목만 모양이 다른 배열', '[{"category":"SPAM"},{"quote":"x"}]'],
  ])('[AC-ADMIN-INSP-M15] 모르는 모양(%s)은 풀지 않고 원문에 맡긴다', (_name, raw) => {
    expect(parseViolations(raw)).toBeNull()
    const [cell] = toPerspectiveCells(
      [perspective({ perspective: 'RULE', outcome: 'VIOLATION', violations: raw })],
      'SETTLED',
    )
    // 원문은 그대로 들고 있어 화면이 그대로 보여 줄 수 있다.
    expect(cell).toMatchObject({ violations: raw, violationItems: null })
  })

  it('[AC-ADMIN-INSP-M16] 위반 상세가 없으면 풀 것도 없다', () => {
    expect(parseViolations(null)).toBeNull()
    expect(parseViolations(undefined)).toBeNull()
    expect(parseViolations('')).toBeNull()
  })

  it.each(['RULE_HIT', 'TRIAGE_CLEAR', 'TRIAGE_CERTAIN', 'PROMOTED'])(
    '[AC-ADMIN-INSP-M17] 일부러 넘긴 미검사(%s)는 건너뛰었다고 적는다',
    skipReason => {
      const [, triage] = toPerspectiveCells(
        [perspective({ perspective: 'TRIAGE', outcome: 'UNCHECKED', skipReason })],
        'SETTLED',
      )
      expect(triage?.hint).toBe(UNCHECKED_SKIPPED_HINT)
      expect(triage?.hint).toBe('이 단계는 건너뛰었어요. 통과 판정이 아니에요')
    },
  )

  it.each([['ERROR'], ['SCHEMA_INVALID'], ['TIMEOUT'], ['BRAND_NEW_REASON'], [null], [undefined]])(
    '[AC-ADMIN-INSP-M18] 실패성 사유나 사유 없는 미검사(%s)는 보지 못했다는 문구를 유지한다',
    skipReason => {
      const [, triage] = toPerspectiveCells(
        [perspective({ perspective: 'TRIAGE', outcome: 'UNCHECKED', skipReason })],
        'SETTLED',
      )
      expect(triage?.hint).toBe(PERSPECTIVE_OUTCOME_META.UNCHECKED.hint)
      expect(triage?.hint).toBe('이 단계까지는 갔지만 내용을 보지 못했어요. 통과가 아니에요')
    },
  )

  it('[AC-ADMIN-INSP-M19] 일부러 넘긴 사유가 미검사가 아닌 줄에 붙어 와도 그 결과의 문구를 쓴다', () => {
    const [, triage] = toPerspectiveCells(
      [perspective({ perspective: 'TRIAGE', outcome: 'CLEAR', skipReason: 'TRIAGE_CLEAR' })],
      'SETTLED',
    )
    expect(triage?.hint).toBe(PERSPECTIVE_OUTCOME_META.CLEAR.hint)
  })

  it('[AC-ADMIN-INSP-M05] 진행 중인 건이 앞으로 오고 버킷 안의 순서는 받은 그대로다', () => {
    const rows = [
      summary({ inspectionId: 1, processingState: 'SETTLED', judgment: 'PASS' }),
      summary({ inspectionId: 2, processingState: 'QUEUED' }),
      summary({ inspectionId: 3, processingState: 'SETTLED', judgment: 'FLAG' }),
      summary({ inspectionId: 4, processingState: 'IN_FLIGHT' }),
    ].map(toInspectionRow)

    expect(inProgressFirst(rows).map(row => row.inspectionId)).toEqual([2, 4, 1, 3])
  })

  it('[AC-ADMIN-INSP-M06] 경과의 끝점은 종결 시각이고 진행 중이면 지금이다', () => {
    const now = Date.parse('2026-11-07T10:00:30')
    const settled = toInspectionRow(
      summary({ settledAt: '2026-11-07T10:00:07', processingState: 'SETTLED' }),
    )
    const running = toInspectionRow(summary({ processingState: 'IN_FLIGHT' }))

    // 종결된 건은 지금과 무관하다 — 시계가 돌아도 값이 변하지 않는다.
    expect(elapsedMs(settled, now)).toBe(7_000)
    expect(elapsedMs(settled, now + 60_000)).toBe(7_000)
    expect(elapsedMs(running, now)).toBe(30_000)
  })

  it('[AC-ADMIN-INSP-M07] 시계가 어긋나 음수가 나와도 0으로 끊고 지어내지 않는다', () => {
    const row = toInspectionRow(summary({ processingState: 'QUEUED' }))

    expect(elapsedMs(row, Date.parse('2026-11-07T09:59:50'))).toBe(0)
    // 요청 시각을 읽을 수 없으면 0이 아니라 값이 없는 것이다(0초로 그리면 방금 들어온 건으로 읽는다).
    expect(elapsedMs(toInspectionRow(summary({ requestedAt: 'not-a-time' })), 0)).toBeNull()
    expect(formatElapsed(null)).toBe('—')
  })

  it('[AC-ADMIN-INSP-M08] 경과 표기는 초/분/시간/일로 갈린다', () => {
    expect(formatElapsed(0)).toBe('0초')
    expect(formatElapsed(12_400)).toBe('12초')
    expect(formatElapsed(200_000)).toBe('3분 20초')
    expect(formatElapsed(7_500_000)).toBe('2시간 5분')
    expect(formatElapsed(97_200_000)).toBe('1일 3시간')
  })
})
