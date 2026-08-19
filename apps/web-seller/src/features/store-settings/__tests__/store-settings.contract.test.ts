import { describe, it, expect } from 'vitest'
import type { SellerApplicationDetail } from '@aechak/api'
import {
  emptyFormValue,
  formValueFrom,
  isValidBusinessRegNo,
  missingRequirements,
  sellerApplicationErrorMessage,
  toSaveDraftRequest,
  toSellerApplication,
} from '../store-settings.contract'

const WIRE: SellerApplicationDetail = {
  applicationId: 7,
  status: 'REJECTED',
  businessType: 'SOLE_PROPRIETORSHIP',
  businessName: '냥이상점',
  businessRegNo: '1208147521',
  corpRegNo: null,
  representativeName: '박민희',
  telesalesNumber: null,
  bankCode: '004',
  accountNumberMasked: '********1234',
  accountHolder: '박민희',
  appliedAt: '2026-08-01T09:00:00',
  submittedAt: '2026-08-02T09:00:00',
  decidedAt: '2026-08-04T09:00:00',
  rejectionReason: '통신판매업 신고증 불일치',
  documents: [
    { documentType: 'ID_CARD', uploadedAt: '2026-08-01T09:10:00' },
    { documentType: 'BANKBOOK_COPY', uploadedAt: '2026-08-01T09:11:00' },
  ],
}

describe('store-settings.contract — 와이어 ↔ 도메인 매핑', () => {
  it('[AC-SELLER-APP-001] BE 응답을 도메인 신청서로 1:1 변환한다(상태/유형/서류 라벨)', () => {
    const application = toSellerApplication(WIRE)
    expect(application.id).toBe('7')
    expect(application.status).toBe('rejected')
    expect(application.legalType).toBe('individual-business')
    expect(application.accountNumberMasked).toBe('********1234')
    expect(application.rejectionReason).toBe('통신판매업 신고증 불일치')
    expect(application.documents).toEqual([
      { key: 'ID_CARD', label: '신분증', uploadedAt: '2026-08-01T09:10:00' },
      { key: 'BANKBOOK_COPY', label: '통장 사본', uploadedAt: '2026-08-01T09:11:00' },
    ])
  })

  it('[AC-SELLER-APP-002] 폼 시드는 계좌번호를 항상 비운다(응답은 마스킹뿐 — 재입력 계약)', () => {
    const form = formValueFrom(toSellerApplication(WIRE))
    expect(form.legalType).toBe('individual-business')
    expect(form.businessName).toBe('냥이상점')
    expect(form.accountNumber).toBe('')
  })

  it('[AC-SELLER-APP-003] 임시저장 요청은 전체 덮어쓰기 — 빈 값은 null로 싣는다', () => {
    const form = { ...emptyFormValue(), legalType: 'individual' as const, representativeName: '정지은' }
    const request = toSaveDraftRequest({ form, documents: [] })
    expect(request.businessType).toBe('PERSONAL_GENERAL')
    expect(request.representativeName).toBe('정지은')
    expect(request.businessName).toBeNull()
    expect(request.accountNumber).toBeNull()
    expect(request.documents).toEqual([])
  })
})

describe('store-settings.contract — 제출 필수 판정(BE 10105 표 미러)', () => {
  it('[AC-SELLER-APP-004] 개인 일반은 4개 필드 + 신분증/통장 사본이 필수다', () => {
    const missing = missingRequirements(emptyFormValue(), new Set())
    expect(missing).toEqual(['대표자명', '은행', '계좌번호', '예금주', '신분증', '통장 사본'])
  })

  it('[AC-SELLER-APP-005] 개인 사업자는 상호명/사업자등록번호와 서류 2종이 추가된다', () => {
    const form = { ...emptyFormValue(), legalType: 'individual-business' as const }
    const missing = missingRequirements(form, new Set(['ID_CARD']))
    expect(missing).toContain('상호명')
    expect(missing).toContain('사업자등록번호')
    expect(missing).toContain('사업자등록증')
    expect(missing).toContain('통신판매업 신고증')
    expect(missing).not.toContain('신분증')
    expect(missing).not.toContain('법인등록번호')
  })

  it('[AC-SELLER-APP-006] 법인은 법인등록번호 + 서류 6종 전부가 필수다', () => {
    const form = { ...emptyFormValue(), legalType: 'corporate-business' as const }
    const missing = missingRequirements(form, new Set())
    expect(missing).toContain('법인등록번호')
    expect(missing).toContain('법인 등기부등본')
    expect(missing).toContain('법인 인감증명서')
  })

  it('[AC-SELLER-APP-007] 전부 채우면 부족 목록이 비고, 계좌번호는 폼 값 기준으로만 판정한다', () => {
    const form = {
      ...emptyFormValue(),
      representativeName: '정지은',
      bankCode: '004',
      accountNumber: '110123456789',
      accountHolder: '정지은',
    }
    expect(missingRequirements(form, new Set(['ID_CARD', 'BANKBOOK_COPY']))).toEqual([])
    // 계좌번호를 비우면(마스킹만 있고 재입력 안 한 상태) 다시 부족으로 잡힌다.
    expect(missingRequirements({ ...form, accountNumber: '' }, new Set(['ID_CARD', 'BANKBOOK_COPY']))).toEqual([
      '계좌번호',
    ])
  })
})

describe('store-settings.contract — 사업자등록번호 검증(서버 @BusinessRegNo 미러)', () => {
  it('[AC-SELLER-APP-008] 국세청 체크섬을 통과하는 번호만 유효하다(하이픈 허용)', () => {
    // 1208147521은 체크섬이 유효한 예시 번호다.
    expect(isValidBusinessRegNo('1208147521')).toBe(true)
    expect(isValidBusinessRegNo('120-81-47521')).toBe(true)
    expect(isValidBusinessRegNo('1208147522')).toBe(false) // 체크 자리 불일치
    expect(isValidBusinessRegNo('12081475')).toBe(false) // 자릿수 미달
    expect(isValidBusinessRegNo('abcdefghij')).toBe(false)
  })
})

describe('store-settings.contract — 에러코드 문구', () => {
  function axiosLikeError(status: number, errorCode: number, message = '서버 문구') {
    return { response: { status, data: { errorCode, message } } }
  }

  it('[AC-SELLER-APP-009] 10103(휴대폰 미인증)은 선행 조건 안내를 준다', () => {
    expect(sellerApplicationErrorMessage(axiosLikeError(403, 10103))).toContain('휴대폰 본인 인증')
  })

  it('[AC-SELLER-APP-010] 10105(필수 미비)는 부족 목록이 실린 서버 message를 그대로 보여준다', () => {
    const message = '필수 서류가 누락됐습니다: 통장 사본'
    expect(sellerApplicationErrorMessage(axiosLikeError(400, 10105, message))).toBe(message)
  })

  it('[AC-SELLER-APP-011] 파일 승격 실패(100001~100003)는 재업로드를 유도한다', () => {
    expect(sellerApplicationErrorMessage(axiosLikeError(404, 100001))).toContain('다시 올려')
    expect(sellerApplicationErrorMessage(axiosLikeError(403, 100002))).toContain('다시 올려')
    expect(sellerApplicationErrorMessage(axiosLikeError(400, 100003))).toContain('다시 올려')
  })
})
