import { describe, it, expect } from 'vitest'
import type { SellerApplicationDetail } from '@aechak/api'
import {
  emptyFormValue,
  formValueFrom,
  isValidBusinessRegNo,
  missingDocuments,
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

// 필수 정보(대표자명/계좌 등)는 클라이언트가 보지 않고 BE 10105 응답으로 안내한다 — 서류만 미리 판정한다(b14-st-3).
describe('store-settings.contract — 제출 필수 서류 판정(BE 10105 서류 표 미러)', () => {
  it('[AC-SELLER-APP-004] 개인 일반은 신분증/통장 사본이 필수다', () => {
    expect(missingDocuments('individual', new Set())).toEqual(['신분증', '통장 사본'])
  })

  it('[AC-SELLER-APP-005] 개인 사업자는 사업자등록증/통신판매업 신고증이 추가된다', () => {
    const missing = missingDocuments('individual-business', new Set(['ID_CARD']))
    expect(missing).toEqual(['통장 사본', '사업자등록증', '통신판매업 신고증'])
  })

  it('[AC-SELLER-APP-006] 법인은 서류 6종 전부가 필수다', () => {
    const missing = missingDocuments('corporate-business', new Set())
    expect(missing).toHaveLength(6)
    expect(missing).toContain('법인 등기부등본')
    expect(missing).toContain('법인 인감증명서')
  })

  it('[AC-SELLER-APP-007] 서류를 전부 갖추면 부족 목록이 빈다', () => {
    expect(missingDocuments('individual', new Set(['ID_CARD', 'BANKBOOK_COPY']))).toEqual([])
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

  it('[AC-SELLER-APP-010] 10105(필수 미비)는 서버 message의 부족 목록만 뽑아 해요체 안내로 바꾼다', () => {
    const message = '필수 정보가 누락됐습니다: 대표자명, 은행 코드 / 필수 서류가 누락됐습니다: 통장 사본'
    expect(sellerApplicationErrorMessage(axiosLikeError(400, 10105, message))).toBe(
      '제출 전 필요: 대표자명, 은행 코드, 통장 사본',
    )
    expect(sellerApplicationErrorMessage(axiosLikeError(400, 10105, '형식이 다른 문구'))).toBe(
      '필수 정보와 서류를 확인해 주세요.',
    )
  })

  it('[AC-SELLER-APP-012] 90001(형식 위반)은 서버 격식체 문구 대신 고정 안내를 보여준다', () => {
    expect(sellerApplicationErrorMessage(axiosLikeError(400, 90001, '사업자등록번호 형식이 올바르지 않습니다.'))).toBe(
      '입력한 내용을 다시 확인해 주세요.',
    )
  })

  it('[AC-SELLER-APP-011] 파일 승격 실패(100001~100003)는 재업로드를 유도한다', () => {
    expect(sellerApplicationErrorMessage(axiosLikeError(404, 100001))).toContain('다시 올려')
    expect(sellerApplicationErrorMessage(axiosLikeError(403, 100002))).toContain('다시 올려')
    expect(sellerApplicationErrorMessage(axiosLikeError(400, 100003))).toContain('다시 올려')
  })
})
