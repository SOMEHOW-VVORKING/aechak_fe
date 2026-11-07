import { describe, expect, it } from 'vitest'
import type { AdminInspectionPerspective, AdminInspectionSummary } from '@aechak/api'
import {
  elapsedMs,
  formatElapsed,
  inProgressFirst,
  isUnsettledOutcome,
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

  it('[AC-ADMIN-INSP-M03] 응답에 없는 관점은 빠지지 않고 기록 없음으로 채워진다', () => {
    const cells = toPerspectiveCells([
      perspective({ perspective: 'RULE', outcome: 'CLEAR' }),
      perspective({ perspective: 'TRIAGE', outcome: 'UNCHECKED', skipReason: '선별이 건너뜀' }),
    ])

    expect(cells.map(cell => [cell.perspective, cell.outcome])).toEqual([
      ['RULE', 'CLEAR'],
      ['TRIAGE', 'UNCHECKED'],
      // 파이프라인이 거기까지 가지 못한 것이라 미검사와도 다르다.
      ['DISPLAY_ADS', 'ABSENT'],
      ['CONDUCT_TRADE', 'ABSENT'],
      ['ALL', 'ABSENT'],
    ])
    expect(cells[1]?.skipReason).toBe('선별이 건너뜀')
  })

  it('[AC-ADMIN-INSP-M04] 우리가 모르는 관점이 와도 지우지 않고 뒤에 덧붙인다', () => {
    const cells = toPerspectiveCells([
      perspective({ perspective: 'SAFETY' as never, outcome: 'VIOLATION' }),
    ])

    // 다섯 칸은 그대로 있고(기록 없음) 모르는 관점이 여섯 번째로 남는다 — 조용히 지우면 그
    // 관점이 돌았다는 사실 자체가 화면에서 사라진다.
    expect(cells).toHaveLength(6)
    expect(cells[5]).toMatchObject({ perspective: 'SAFETY', outcome: 'VIOLATION', label: 'SAFETY' })
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
