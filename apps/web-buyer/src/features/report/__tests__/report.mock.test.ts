import { describe, expect, it } from 'vitest'
import {
  PRODUCT_REPORT_REASONS,
  fetchReportTarget,
  getReportTargetMock,
  isValidReportReason,
} from '../report.mock'

describe('report.mock', () => {
  it('[AC-REPORT-001] 상품 신고 사유는 명세의 5종과 일치한다', () => {
    expect(PRODUCT_REPORT_REASONS.map(r => r.value)).toEqual([
      'false-ad',
      'wrong-info',
      'illegal',
      'inappropriate',
      'etc',
    ])
    expect(PRODUCT_REPORT_REASONS.map(r => r.label)).toEqual([
      '허위/과장 광고',
      '상품 정보 오류',
      '불법 및 미취급 상품',
      '부적절한 내용',
      '기타',
    ])
  })

  it('[AC-REPORT-002] 사유가 선택돼야 제출 가능하다(상세는 선택 입력)', () => {
    expect(isValidReportReason('')).toBe(false)
    expect(isValidReportReason('false-ad')).toBe(true)
    expect(isValidReportReason('etc')).toBe(true)
  })

  it('[AC-REPORT-003] 신고 대상은 상품 정보를 반환하고, 알 수 없는 상품은 null이다', () => {
    const target = getReportTargetMock('p-feeder-5l')
    expect(target).not.toBeNull()
    expect(target?.storeName).toBe('냥이상점')
    expect(getReportTargetMock('does-not-exist')).toBeNull()
  })

  it('[AC-REPORT-004] 비동기 조회는 존재 상품이면 대상을, 없는 상품이면 null을 resolve한다', async () => {
    await expect(fetchReportTarget('p-feeder-5l')).resolves.toMatchObject({ storeName: '냥이상점' })
    await expect(fetchReportTarget('does-not-exist')).resolves.toBeNull()
  })
})
