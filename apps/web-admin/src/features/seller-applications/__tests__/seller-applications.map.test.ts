import { describe, expect, it } from 'vitest'
import {
  Contact,
  FileCheck,
  FileText,
  Landmark,
  ScrollText,
  Stamp,
} from 'lucide-react'
import type { AdminApplicationDetail, AdminApplicationSummary } from '@aechak/api'
import {
  REJECTION_REASON_DIRECT,
  STATUS_FILTER_VALUES,
  decisionErrorMessage,
  formatWireDate,
  formatWireDateTime,
  isDecidable,
  isForbidden,
  isRejectionReasonReady,
  isStaleDecision,
  listErrorMessage,
  maskBusinessRegNo,
  maskPersonName,
  toApplicantName,
  toApplicationDetail,
  toApplicationRow,
  toDocumentMeta,
  toRejectionReasonDraft,
  toRejectionReasonText,
  toScreenStatus,
  toSellerType,
  toWireStatus,
} from '../seller-applications.map'

const summary = (overrides: Partial<AdminApplicationSummary> = {}): AdminApplicationSummary => ({
  applicationId: 7,
  status: 'SUBMITTED',
  businessType: 'SOLE_PROPRIETORSHIP',
  businessName: '펫프렌즈상사',
  representativeName: '김민수',
  submittedAt: '2026-06-18T10:00:00',
  ...overrides,
})

const detail = (overrides: Partial<AdminApplicationDetail> = {}): AdminApplicationDetail => ({
  applicationId: 7,
  status: 'SUBMITTED',
  businessType: 'SOLE_PROPRIETORSHIP',
  businessName: '펫프렌즈상사',
  businessRegNo: '1234567890',
  corpRegNo: null,
  representativeName: '김민수',
  telesalesNumber: '2026-서울강남-0001',
  bankCode: '004',
  accountNumber: '110123456789',
  accountHolder: '김민수',
  appliedAt: '2026-06-17T09:00:00',
  submittedAt: '2026-06-18T10:00:00',
  decidedAt: null,
  rejectionReason: null,
  documents: [],
  reviews: [],
  previousApplications: [],
  ...overrides,
})

describe('어드민 심사 서버→화면 매퍼', () => {
  it('[AC-ADM-MAP-001] 서버 대문자 상태와 화면 소문자 상태를 양방향으로 옮긴다', () => {
    expect(toScreenStatus('SUBMITTED')).toBe('submitted')
    expect(toScreenStatus('CANCELLED')).toBe('cancelled')
    // 소문자를 그대로 서버로 보내면 400 errorCode 90001이라 필터는 반드시 역변환을 거친다.
    expect(toWireStatus('rejected')).toBe('REJECTED')
    expect(toWireStatus('draft')).toBe('DRAFT')
  })

  it('[AC-ADM-MAP-002] 필터 탭은 전이 경로가 있는 4상태만 쓰고 심사 가능 상태는 둘뿐이다', () => {
    // REVIEWING·CANCELLED로 가는 전이 코드가 서버에 없어 그 신청은 생기지 않는다.
    expect(STATUS_FILTER_VALUES).toEqual(['submitted', 'approved', 'rejected', 'draft'])
    expect(isDecidable('submitted')).toBe(true)
    expect(isDecidable('reviewing')).toBe(true)
    expect(isDecidable('approved')).toBe(false)
    expect(isDecidable('draft')).toBe(false)
  })

  it('[AC-ADM-MAP-003] businessType을 판매자 유형 두 값으로 접는다', () => {
    expect(toSellerType('PERSONAL_GENERAL')).toBe('individual')
    expect(toSellerType('SOLE_PROPRIETORSHIP')).toBe('business')
    expect(toSellerType('CORPORATE')).toBe('business')
  })

  it('[AC-ADM-MAP-004] 신청인 이름은 상호명이 없으면 대표자명으로 접힌다', () => {
    expect(toApplicantName('펫프렌즈상사', '김민수')).toBe('펫프렌즈상사')
    expect(toApplicantName(null, '김민수')).toBe('김민수')
    expect(toApplicantName('   ', '김민수')).toBe('김민수')
    expect(toApplicantName(null, null)).toBe('이름 미기재')
  })

  it('[AC-ADM-MAP-005] 목록 행의 신청일은 submittedAt이고 제출 전이면 비어 있다', () => {
    expect(toApplicationRow(summary()).submittedAt).toBe('2026-06-18T10:00:00')
    expect(formatWireDate(toApplicationRow(summary()).submittedAt)).toBe('2026-06-18')
    expect(formatWireDate(toApplicationRow(summary({ submittedAt: null })).submittedAt)).toBe('—')
    expect(formatWireDateTime('2026-06-18T10:00:00')).toBe('2026-06-18 10:00')
  })

  it('[AC-ADM-MAP-006] documentType 6값이 전용 아이콘과 한국어 라벨로 옮겨진다', () => {
    expect(toDocumentMeta('ID_CARD')).toEqual({ label: '신분증', icon: Contact })
    expect(toDocumentMeta('BANKBOOK_COPY')).toEqual({ label: '통장 사본', icon: Landmark })
    expect(toDocumentMeta('BUSINESS_REGISTRATION')).toEqual({
      label: '사업자등록증',
      icon: FileCheck,
    })
    expect(toDocumentMeta('TELESALES_REPORT')).toEqual({
      label: '통신판매업 신고증',
      icon: ScrollText,
    })
    expect(toDocumentMeta('CORP_REGISTER')).toEqual({ label: '법인 등기부등본', icon: FileText })
    expect(toDocumentMeta('CORP_SEAL')).toEqual({ label: '법인 인감증명서', icon: Stamp })
    // 6값 중 어느 것도 폴백으로 떨어지지 않아야 한다 — 이전 화면의 아이콘 키는 서버 값과
    // 하나도 겹치지 않아 전부 FileText 폴백이었다.
    const icons = [
      'ID_CARD',
      'BANKBOOK_COPY',
      'BUSINESS_REGISTRATION',
      'TELESALES_REPORT',
      'CORP_SEAL',
    ].map(type => toDocumentMeta(type).icon)
    expect(new Set(icons).size).toBe(5)
    // 모르는 값은 조용히 숨기지 않고 이름을 그대로 노출한다.
    expect(toDocumentMeta('NEW_FROM_SERVER')).toEqual({ label: 'NEW_FROM_SERVER', icon: FileText })
  })

  it('[AC-ADM-MAP-007] 사업자등록번호·대표자명 마스킹을 화면에서 만든다', () => {
    expect(maskBusinessRegNo('1234567890')).toBe('123-45-*****')
    expect(maskBusinessRegNo('123-45-67890')).toBe('123-45-*****')
    expect(maskBusinessRegNo(null)).toBeNull()
    expect(maskPersonName('김민수')).toBe('김*수')
    expect(maskPersonName('김수')).toBe('김*')
    expect(maskPersonName('남궁민수')).toBe('남**수')
    expect(maskPersonName(null)).toBeNull()
  })

  it('[AC-ADM-MAP-008] 상세 응답을 뷰로 옮기며 평문을 마스킹하고 서류 링크를 그대로 통과시킨다', () => {
    const view = toApplicationDetail(
      detail({
        documents: [
          {
            documentType: 'ID_CARD',
            uploadedAt: '2026-06-18T09:00:00',
            downloadUrl: 'https://files.local/ID_CARD?issue=1',
          },
        ],
      }),
    )
    expect(view.representativeNameMasked).toBe('김*수')
    expect(view.businessRegNoMasked).toBe('123-45-*****')
    expect(view.documents[0]?.label).toBe('신분증')
    expect(view.documents[0]?.downloadUrl).toBe('https://files.local/ID_CARD?issue=1')
  })

  it('[AC-ADM-MAP-009] 직전 반려 사유는 승인 뒤에도 심사 이력에서 되찾는다', () => {
    // rejectionReason은 status가 REJECTED가 아니면 null로 오므로 reviews를 봐야 한다.
    const view = toApplicationDetail(
      detail({
        status: 'APPROVED',
        rejectionReason: null,
        reviews: [
          { decision: 'REJECTED', rejectionReason: '서류 누락', reviewedAt: '2026-06-18T11:00:00' },
          { decision: 'APPROVED', rejectionReason: null, reviewedAt: '2026-06-19T11:00:00' },
        ],
      }),
    )
    expect(view.lastRejectionReason).toBe('서류 누락')
    expect(view.reviews.map(review => review.label)).toEqual(['반려', '승인'])
    expect(view.reviews[1]?.date).toBe('2026-06-19 11:00')
  })

  it('[AC-ADM-MAP-010] 반려 사유는 슬러그와 서버 자유 문자열을 왕복한다', () => {
    expect(toRejectionReasonDraft('서류 누락')).toEqual({ value: 'incomplete-docs', text: '' })
    expect(toRejectionReasonText({ value: 'incomplete-docs', text: '' })).toBe('서류 누락')
    expect(toRejectionReasonDraft(null)).toEqual({ value: '', text: '' })
  })

  it('[AC-ADM-MAP-011] 슬러그에 없는 서버 사유는 직접 입력으로 떨어뜨려 원문을 보존한다', () => {
    const draft = toRejectionReasonDraft('계좌 사본이 흐려 확인할 수 없어요')
    expect(draft).toEqual({
      value: REJECTION_REASON_DIRECT,
      text: '계좌 사본이 흐려 확인할 수 없어요',
    })
    expect(toRejectionReasonText(draft)).toBe('계좌 사본이 흐려 확인할 수 없어요')
  })

  it('[AC-ADM-MAP-012] 빈 사유와 500자 초과는 제출 전에 화면이 막는다', () => {
    expect(isRejectionReasonReady({ value: '', text: '' })).toBe(false)
    expect(isRejectionReasonReady({ value: REJECTION_REASON_DIRECT, text: '   ' })).toBe(false)
    expect(isRejectionReasonReady({ value: REJECTION_REASON_DIRECT, text: 'ㄱ'.repeat(500) })).toBe(
      true,
    )
    expect(isRejectionReasonReady({ value: REJECTION_REASON_DIRECT, text: 'ㄱ'.repeat(501) })).toBe(
      false,
    )
  })

  it('[AC-ADM-MAP-013] 409는 10101·90003을 함께 재조회 경로로 다루고 400은 사유 분기로 간다', () => {
    const wire = (status: number, errorCode: number) => ({ response: { status, data: { errorCode } } })
    expect(isStaleDecision(wire(409, 10101))).toBe(true)
    expect(isStaleDecision(wire(409, 90003))).toBe(true)
    expect(isStaleDecision(wire(404, 10100))).toBe(true)
    expect(isStaleDecision(wire(400, 10102))).toBe(false)
    expect(decisionErrorMessage(wire(409, 10101))).toContain('이미 처리된 신청')
    expect(decisionErrorMessage(wire(400, 10102))).toBe('반려 사유를 입력해 주세요.')
    expect(decisionErrorMessage(wire(400, 90001))).toBe('반려 사유는 500자 이하로 입력해 주세요.')
  })

  it('[AC-ADM-MAP-014] 403은 권한 안내로 갈라진다(어드민에 온보딩 개념이 없다)', () => {
    const forbidden = { response: { status: 403, data: { errorCode: 20011 } } }
    expect(isForbidden(forbidden)).toBe(true)
    expect(listErrorMessage(forbidden)).toContain('어드민 권한이 없어')
    expect(decisionErrorMessage(forbidden)).toContain('권한이 없어요')
  })
})
