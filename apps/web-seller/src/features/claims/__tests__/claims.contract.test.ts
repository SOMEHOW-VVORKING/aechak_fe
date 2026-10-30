import { describe, it, expect } from 'vitest'
import {
  claimDetailAction,
  claimDisplayStatus,
  claimReasonText,
  claimRefundText,
  claimRowAction,
  formatClaimDateTime,
  normalizeClaimSearchParams,
  returnCostText,
} from '../claims.contract'

// 서버 계약을 화면 표시로 접는 판정만 모은 단위 테스트. 네 상태 축을 접는 일과 "지금 할 수 있는 처리"
// 판정이 여기 한 곳에 있어야 목록·상세·Modal이 서로 다른 말을 하지 않는다.

const baseClaim = {
  claimType: 'RETURN' as const,
  status: 'CLAIM_REQUESTED' as const,
  refundStatus: 'NONE' as const,
  sellerApprovalStatus: 'REQUESTED' as const,
  resolvedAt: null,
  autoApproveDueAt: null,
}

describe('클레임 목록 파라미터 정규화', () => {
  it('[AC-SELLER-CLAIM-001] 빈 문자열과 빈 배열 파라미터는 키째 빠진다', () => {
    expect(
      normalizeClaimSearchParams({
        claimType: [],
        status: '',
        pendingStage: [],
        requestedFrom: '',
        requestedTo: '  ',
        page: 0,
      }),
    ).toEqual({ page: 0 })
  })

  it('[AC-SELLER-CLAIM-002] 값이 있는 축은 배열째 남고 문자열은 trim된다', () => {
    expect(
      normalizeClaimSearchParams({
        claimType: ['RETURN', 'EXCHANGE'],
        pendingStage: ['DECISION_PENDING'],
        requestedFrom: ' 2026-10-01 ',
        page: 2,
      }),
    ).toEqual({
      claimType: ['RETURN', 'EXCHANGE'],
      pendingStage: ['DECISION_PENDING'],
      requestedFrom: '2026-10-01',
      page: 2,
    })
  })
})

describe('표시 상태 접기', () => {
  it('[AC-SELLER-CLAIM-003] 승인 대기는 자동 승인 기한을 함께 알린다', () => {
    expect(claimDisplayStatus({ ...baseClaim, autoApproveDueAt: '2026-10-26T10:00:00' })).toEqual({
      label: '승인 대기',
      variant: 'warning',
      note: '2026-10-26 10:00 자동 승인',
    })
  })

  it('[AC-SELLER-CLAIM-004] 승인됨은 환불 축으로 갈린다(대기/진행/완료)', () => {
    const approved = { ...baseClaim, status: 'APPROVED' as const }
    expect(claimDisplayStatus(approved)).toMatchObject({ label: '승인 완료', note: '환불 대기' })
    expect(claimDisplayStatus({ ...approved, refundStatus: 'REQUESTED' })).toMatchObject({
      label: '환불 진행 중',
    })
    expect(claimDisplayStatus({ ...approved, refundStatus: 'DONE' })).toMatchObject({
      label: '환불 완료',
    })
  })

  it('[AC-SELLER-CLAIM-005] 교환은 환불이 없어 승인됨이 재발송 대기/교환 완료로 갈린다', () => {
    const exchange = { ...baseClaim, claimType: 'EXCHANGE' as const, status: 'APPROVED' as const }
    expect(claimDisplayStatus(exchange)).toMatchObject({ label: '재발송 대기' })
    expect(claimDisplayStatus({ ...exchange, resolvedAt: '2026-10-25T09:00:00' })).toMatchObject({
      label: '교환 완료',
    })
  })
})

describe('사유 표시', () => {
  it('[AC-SELLER-CLAIM-006] reasonLabel이 있으면 그 문구를, 없으면 코드를 그대로 보여준다', () => {
    expect(claimReasonText({ reasonCode: 'DEFECTIVE', reasonLabel: '상품이 파손되었거나 불량이에요' })).toBe(
      '상품이 파손되었거나 불량이에요',
    )
    // SCRUM-273(PR #150) 머지 전에는 응답에 reasonLabel 키가 없다.
    expect(claimReasonText({ reasonCode: 'DEFECTIVE' })).toBe('DEFECTIVE')
    expect(claimReasonText({ reasonCode: null })).toBe('사유 미기재')
  })
})

describe('반품비·환불 문구', () => {
  it('[AC-SELLER-CLAIM-007] 취소는 반품비가 없고 미발송이면 그 사실까지 밝힌다', () => {
    expect(
      returnCostText({ claimType: 'CANCEL', returnCostBearer: null, returnShippingFee: null, dispatched: false }),
    ).toBe('반품비 없음 (미발송)')
  })

  it('[AC-SELLER-CLAIM-008] 승인 전 반품은 부담 주체가 미정이고, 정해지면 금액과 함께 보인다', () => {
    // 승인 전에도 금액(정책 스냅샷)은 정해져 있다 — 셀러가 판단할 때 걸린 돈을 함께 보여준다.
    expect(
      returnCostText({ claimType: 'RETURN', returnCostBearer: null, returnShippingFee: 3000, dispatched: true }),
    ).toBe('부담 주체 미정 / 3,000원')
    expect(
      returnCostText({ claimType: 'RETURN', returnCostBearer: 'BUYER', returnShippingFee: 3000, dispatched: true }),
    ).toBe('구매자 부담 / 3,000원')
    // 설정값이 0원이면 금액을 숨긴다(정책 스냅샷이 아직 서버 설정값이다).
    expect(
      returnCostText({ claimType: 'RETURN', returnCostBearer: 'SELLER', returnShippingFee: 0, dispatched: true }),
    ).toBe('셀러 부담')
  })

  it('[AC-SELLER-CLAIM-009] 교환은 환불이 없어 금액을 환불 예정으로 띄우지 않는다', () => {
    expect(claimRefundText({ claimType: 'EXCHANGE', refundAmount: 120000 })).toBe('환불 없음 (재발송)')
    expect(claimRefundText({ claimType: 'RETURN', refundAmount: 59000 })).toBe('59,000원')
  })
})

describe('다음 처리 판정', () => {
  it('[AC-SELLER-CLAIM-010] 승인·거부는 셀러 판단 축이 REQUESTED일 때만 열린다', () => {
    expect(claimRowAction(baseClaim)).toBe('decision')
    expect(claimRowAction({ ...baseClaim, sellerApprovalStatus: 'APPROVED' })).toBe('none')
  })

  it('[AC-SELLER-CLAIM-011] 회수 중은 행만으로 단계를 가를 수 없어 상세로 보낸다', () => {
    const collecting = { ...baseClaim, status: 'COLLECTING' as const, sellerApprovalStatus: 'APPROVED' as const }
    expect(claimRowAction(collecting)).toBe('collecting')
    // 이력에 회수 시작이 없으면 송장 등록 대기, 있으면 완료 처리 대기다.
    expect(claimDetailAction(collecting, [{ event: 'REQUESTED' }])).toBe('collection-invoice')
    expect(
      claimDetailAction(collecting, [{ event: 'REQUESTED' }, { event: 'COLLECTION_STARTED' }]),
    ).toBe('collection-complete')
  })

  it('[AC-SELLER-CLAIM-012] 교환 재발송은 행만으로 판정된다(교환이 승인됨이면 회수가 끝난 것)', () => {
    const exchange = {
      ...baseClaim,
      claimType: 'EXCHANGE' as const,
      status: 'APPROVED' as const,
      sellerApprovalStatus: 'APPROVED' as const,
    }
    expect(claimRowAction(exchange)).toBe('reship')
    expect(claimRowAction({ ...exchange, resolvedAt: '2026-10-25T09:00:00' })).toBe('none')
  })
})

describe('날짜 표시', () => {
  it('[AC-SELLER-CLAIM-013] 오프셋 없는 LocalDateTime을 분까지만 보여주고 빈 값은 대시로 둔다', () => {
    expect(formatClaimDateTime('2026-10-24T10:00:00')).toBe('2026-10-24 10:00')
    expect(formatClaimDateTime(null)).toBe('—')
  })
})
