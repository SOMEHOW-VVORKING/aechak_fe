import { describe, expect, it } from 'vitest'
import type { AdminInspectionDetailData, AdminInspectionFinding } from '@aechak/api'
import {
  formatWaitingTime,
  judgmentMeta,
  parseViolations,
  reasonMeta,
  toPipelineStages,
  toQueueRow,
} from '../ai-review-queue.map'

// 매퍼 단위 테스트. 라우트 테스트가 못 고정하는 둘을 여기서 잡는다 —
// (1) 기준 시각을 넣어야 확정되는 대기 시간 포맷, (2) 응답 조합마다 달라지는 단계 추정.

const BASE_SUMMARY: AdminInspectionDetailData['summary'] = {
  inspectionId: 1,
  targetType: 'PRODUCT',
  targetRef: 10,
  judgment: 'FLAG',
  requestedAt: '2026-06-18T07:10:00',
}

function detailOf(
  findings: AdminInspectionFinding[],
  calls: AdminInspectionDetailData['calls'],
  summary: Partial<AdminInspectionDetailData['summary']> = {},
): AdminInspectionDetailData {
  return {
    summary: { ...BASE_SUMMARY, ...summary },
    findings,
    calls,
    totalCostMicroUsd: calls.reduce((sum, call) => sum + call.costMicroUsd, 0),
  }
}

const call = (
  perspective: string | null,
  modelId: string,
  outcome = 'SUCCESS',
): AdminInspectionDetailData['calls'][number] => ({
  perspective,
  modelId,
  outcome,
  costMicroUsd: 1000,
  latencyMs: 100,
})

describe('formatWaitingTime', () => {
  const NOW = new Date('2026-06-21T10:30:00').getTime()

  it('[AC-AI-QUEUE-M001] 가장 큰 단위 둘까지만 적는다', () => {
    expect(formatWaitingTime('2026-06-18T07:10:00', NOW)).toBe('3일 3시간')
    expect(formatWaitingTime('2026-06-21T05:18:00', NOW)).toBe('5시간 12분')
    expect(formatWaitingTime('2026-06-21T10:23:00', NOW)).toBe('7분')
    expect(formatWaitingTime('2026-06-20T10:30:00', NOW)).toBe('1일')
  })

  it('[AC-AI-QUEUE-M002] 미래 시각은 음수가 아니라 0분으로 접는다', () => {
    // 음수 대기 시간을 띄우면 운영자가 버그를 데이터로 읽는다.
    expect(formatWaitingTime('2026-06-21T11:00:00', NOW)).toBe('0분')
  })

  it('[AC-AI-QUEUE-M003] 값이 없거나 읽을 수 없으면 em dash다', () => {
    expect(formatWaitingTime(null, NOW)).toBe('—')
    expect(formatWaitingTime('언제인지 모름', NOW)).toBe('—')
  })
})

describe('toQueueRow 대기 시작 시각', () => {
  it('[AC-AI-QUEUE-M004] 이의 > 판정 > 최초 요청 순으로 고른다', () => {
    // 큐 등재 시각 컬럼이 서버에 없다 — 가장 가까운 근사를 쓰고 이름도 그렇게 짓는다.
    expect(
      toQueueRow({
        ...BASE_SUMMARY,
        settledAt: '2026-06-18T07:14:00',
        appealedAt: '2026-06-19T09:00:00',
      }).waitingSince,
    ).toBe('2026-06-19T09:00:00')
    expect(
      toQueueRow({ ...BASE_SUMMARY, settledAt: '2026-06-18T07:14:00' }).waitingSince,
    ).toBe('2026-06-18T07:14:00')
    expect(toQueueRow(BASE_SUMMARY).waitingSince).toBe('2026-06-18T07:10:00')
  })
})

describe('parseViolations', () => {
  it('[AC-AI-QUEUE-M005] 분류 / 인용 / 제안 / 확신도를 뽑는다', () => {
    const { violations, rawOnParseFailure } = parseViolations(
      '[{"category":"CONTACT_INFO","quote":"카톡 nyangi","suggestion":"문의하기를 써 주세요","confidence":0.9}]',
    )
    expect(rawOnParseFailure).toBeNull()
    expect(violations).toEqual([
      {
        category: 'CONTACT_INFO',
        categoryLabel: '연락처 노출',
        quote: '카톡 nyangi',
        suggestion: '문의하기를 써 주세요',
        confidence: 0.9,
      },
    ])
  })

  it('[AC-AI-QUEUE-M006] 빈 값은 위반 없음이고, 깨진 값은 원문을 들고 돌아온다', () => {
    expect(parseViolations(null)).toEqual({ violations: [], rawOnParseFailure: null })
    expect(parseViolations('   ')).toEqual({ violations: [], rawOnParseFailure: null })

    // 파싱 실패를 위반 없음으로 접으면, 위반이 있는 건이 화면에서 깨끗해 보인다.
    const broken = '[{"category":"CONTACT_INFO"'
    expect(parseViolations(broken).rawOnParseFailure).toBe(broken)
    expect(parseViolations('{"category":"CONTACT_INFO"}').rawOnParseFailure).toBe(
      '{"category":"CONTACT_INFO"}',
    )
    // 분류가 없으면 무엇에 걸렸는지 말할 수 없다 — 원문을 드러낸다.
    expect(parseViolations('[{"quote":"카톡"}]').rawOnParseFailure).toBe('[{"quote":"카톡"}]')
  })

  it('[AC-AI-QUEUE-M007] 모르는 분류도 원문과 함께 라벨을 만든다', () => {
    const { violations } = parseViolations('[{"category":"NEW_CATEGORY"}]')
    expect(violations[0]?.categoryLabel).toBe('알 수 없는 분류 (NEW_CATEGORY)')
    expect(violations[0]?.quote).toBeNull()
    expect(violations[0]?.suggestion).toBeNull()
  })
})

describe('metaOf 폴백', () => {
  it('[AC-AI-QUEUE-M008] 생성 타입에 없는 열거 값이 와도 화면이 백지가 되지 않는다', () => {
    // 서버 열거는 실제로 늘어난다(TRIAGE가 그렇게 추가됐다). Record 조회를 그대로 쓰면
    // undefined.label로 라우트 전체가 터진다.
    expect(reasonMeta('BRAND_NEW_REASON')).toEqual({
      label: '알 수 없음 (BRAND_NEW_REASON)',
      variant: 'warning',
    })
    expect(judgmentMeta(null)).toEqual({ label: '—', variant: 'neutral' })
  })
})

describe('toPipelineStages', () => {
  const RULE_CLEAR: AdminInspectionFinding = { perspective: 'RULE', outcome: 'CLEAR' }
  const DISPLAY_CLEAR: AdminInspectionFinding = { perspective: 'DISPLAY_ADS', outcome: 'CLEAR' }
  const CONDUCT_CLEAR: AdminInspectionFinding = { perspective: 'CONDUCT_TRADE', outcome: 'CLEAR' }

  const stage = (stages: ReturnType<typeof toPipelineStages>, key: string) =>
    stages.find(item => item.key === key)

  it('[AC-AI-QUEUE-M009] 다섯 단계를 늘 같은 순서로 돌려준다', () => {
    expect(toPipelineStages(detailOf([], [])).map(item => item.key)).toEqual([
      'rule',
      'triage',
      'perspective',
      'critic',
      'notice',
    ])
  })

  it('[AC-AI-QUEUE-M010] 선별 기록이 없으면 단계가 꺼져 있었을 수 있다고 적는다', () => {
    const stages = toPipelineStages(detailOf([RULE_CLEAR, DISPLAY_CLEAR], []))
    expect(stage(stages, 'triage')?.status).toBe('not-run')
    expect(stage(stages, 'triage')?.reason).toContain('선별 단계가 꺼져 있었을 수 있어요')
  })

  it('[AC-AI-QUEUE-M011] 선별이 건너뛴 미검사와 호출이 깨진 미검사를 다른 사유로 적는다', () => {
    const stages = toPipelineStages(
      detailOf(
        [
          RULE_CLEAR,
          { perspective: 'TRIAGE', outcome: 'CLEAR' },
          { perspective: 'DISPLAY_ADS', outcome: 'UNCHECKED', skipReason: 'TRIAGE_CLEAR' },
          { perspective: 'CONDUCT_TRADE', outcome: 'UNCHECKED', skipReason: 'TRIAGE_CLEAR' },
        ],
        [call('TRIAGE', 'claude-haiku-4-5')],
        { judgment: 'PASS' },
      ),
    )
    const perspective = stage(stages, 'perspective')
    expect(perspective?.status).toBe('unchecked')
    expect(perspective?.reason).toBe('선별이 깨끗하다고 판단해 건너뜀')
    expect(perspective?.rows.every(row => row.triageSkipped)).toBe(true)

    const broken = toPipelineStages(
      detailOf(
        [
          RULE_CLEAR,
          { perspective: 'DISPLAY_ADS', outcome: 'UNCHECKED', skipReason: 'RATE_LIMITED' },
          { perspective: 'CONDUCT_TRADE', outcome: 'UNCHECKED', skipReason: 'TIMEOUT' },
        ],
        [],
      ),
    )
    // 사유가 섞이면 둘 다 적는다 — 하나만 보여 주면 나머지 관점이 왜 빠졌는지 알 수 없다.
    expect(stage(broken, 'perspective')?.reason).toBe('모델 호출량 제한 / 모델 호출 시간 초과')
    expect(stage(broken, 'perspective')?.rows.some(row => row.triageSkipped)).toBe(false)
  })

  it('[AC-AI-QUEUE-M012] 비평 뒤집힘은 등재 사유로 확증하고 추정 표시를 달지 않는다', () => {
    const stages = toPipelineStages(
      detailOf([RULE_CLEAR, DISPLAY_CLEAR, CONDUCT_CLEAR], [], {
        judgment: 'PASS',
        adminReviewReason: 'CRITIC_OVERTURNED',
      }),
    )
    expect(stage(stages, 'critic')?.status).toBe('overturned')
    expect(stage(stages, 'critic')?.statusMeta.label).toBe('뒤집음')
    expect(stage(stages, 'critic')?.inferred).toBe(false)
  })

  it('[AC-AI-QUEUE-M013] ALL 관점 호출 하나는 비평, 둘이면 수정문구까지로 가른다', () => {
    // 원장이 비평과 수정문구를 둘 다 ALL로 적는다 — 순서로만 가를 수 있고, 비평이 먼저 돌고
    // 수정문구는 비평이 판정을 유지했을 때만 돈다.
    const one = toPipelineStages(
      detailOf(
        [RULE_CLEAR, DISPLAY_CLEAR, CONDUCT_CLEAR],
        [call('ALL', 'claude-opus-5')],
        { judgment: 'FLAG' },
      ),
    )
    expect(stage(one, 'critic')?.status).toBe('ran')
    expect(stage(one, 'critic')?.statusMeta.label).toBe('판정 유지')
    expect(stage(one, 'critic')?.inferred).toBe(true)
    expect(stage(one, 'notice')?.status).toBe('not-run')

    const two = toPipelineStages(
      detailOf(
        [RULE_CLEAR, DISPLAY_CLEAR, CONDUCT_CLEAR],
        [call('ALL', 'claude-opus-5'), call('ALL', 'claude-sonnet-5')],
        { judgment: 'FLAG' },
      ),
    )
    expect(stage(two, 'notice')?.status).toBe('ran')
    expect(stage(two, 'notice')?.calls[0]?.modelId).toBe('claude-sonnet-5')
  })

  it('[AC-AI-QUEUE-M014] 팬아웃을 끈 단일 판정에서는 첫 ALL 호출을 관점 판정으로 돌린다', () => {
    // 팬아웃 off면 관점 판정도 ALL로 적힌다 — 그것까지 비평으로 세면 "비평이 봤다"가 거짓이 된다.
    const stages = toPipelineStages(
      detailOf(
        [RULE_CLEAR, { perspective: 'ALL', outcome: 'VIOLATION' }],
        [
          call('ALL', 'claude-sonnet-5'),
          call('ALL', 'claude-opus-5'),
          call('ALL', 'claude-sonnet-5'),
        ],
        { judgment: 'FLAG' },
      ),
    )
    expect(stage(stages, 'perspective')?.calls).toHaveLength(1)
    expect(stage(stages, 'critic')?.calls[0]?.modelId).toBe('claude-opus-5')
    expect(stage(stages, 'notice')?.status).toBe('ran')
  })

  it('[AC-AI-QUEUE-M015] 통과 판정이면 비평·수정문구 미실행 사유가 보류가 아니었음을 말한다', () => {
    const stages = toPipelineStages(
      detailOf([RULE_CLEAR, DISPLAY_CLEAR, CONDUCT_CLEAR], [], { judgment: 'PASS' }),
    )
    expect(stage(stages, 'critic')?.reason).toBe('보류 판정이 아니어서 비평을 부르지 않았어요.')
    expect(stage(stages, 'notice')?.reason).toBe(
      '보류 판정이 아니어서 수정문구를 만들지 않았어요.',
    )
  })

  it('[AC-AI-QUEUE-M016] 위반이 있는 관점만 위반 목록으로 모은다', () => {
    const stages = toPipelineStages(
      detailOf(
        [
          {
            perspective: 'RULE',
            outcome: 'VIOLATION',
            violations: '[{"category":"BANNED_INGREDIENT","quote":"초콜릿향 간식"}]',
          },
          DISPLAY_CLEAR,
        ],
        [],
      ),
    )
    const rule = stage(stages, 'rule')
    expect(rule?.status).toBe('violation')
    expect(rule?.rows[0]?.violations[0]?.categoryLabel).toBe('금지 성분')
    expect(rule?.rows[0]?.violations[0]?.quote).toBe('초콜릿향 간식')
  })
})
