import type { SellerApplication, SellerApplicationDocument, SellerApplicationDocumentStatus, SellerApplicationStatus } from '@aechak/domain'

const BASE_APPLICATION: Omit<SellerApplication, 'status' | 'appliedAt' | 'resubmissionCount' | 'documents'> = {
  id: 'app-self',
  applicantName: '냥이상점',
  sellerType: 'business',
  legalType: 'individual-business',
  representativeNameMasked: '김*호',
  phoneMasked: '010-2***-**89',
  representativeName: '김보호',
  phone: '010-2345-6789',
  phoneVerified: true,
  email: 'nyang@kakao.com',
  businessAddress: '서울 마포구 와우산로 00, 3층',
  bankName: 'kb',
  bankAccountNumber: '123456-04-567890',
  bankAccountHolder: '김보호',
}

const REJECTED_FORM_FIELDS = {
  appliedAt: '2026-06-12',
  resubmissionCount: 0,
  rejectionReason: '통장 사본 정보 불일치',
  revisionNote:
    '제출하신 통장 사본의 예금주명이 정산 계좌 예금주와 다릅니다. 동일한 명의의 통장 사본을 다시 업로드한 뒤 재제출해 주세요.',
}

function baseDocuments(bankbookStatus: SellerApplicationDocumentStatus): SellerApplicationDocument[] {
  return [
    { key: 'business-reg', label: '사업자등록증', status: 'submitted' },
    { key: 'business-cert', label: '사업자등록증명원', status: 'submitted' },
    { key: 'seal-cert', label: '인감증명서', status: 'not-applicable', note: '법인 시 법인인감증명서' },
    { key: 'bankbook', label: '통장 사본', status: bankbookStatus, required: true },
  ]
}

// 6개 SellerApplicationStatus 전체를 /store-settings 화면에서 상태별로 렌더링 확인할 수 있도록
// 픽스처를 나눠뒀다 — 기본으로 쓰는 건 항상 rejected(MOCK_SELLER_APPLICATION)이고, 나머지는
// mockFetchSellerApplication(status)에 상태를 넘겨 필요할 때 골라 쓴다.
export const SELLER_APPLICATION_FIXTURES: Record<SellerApplicationStatus, SellerApplication> = {
  pending: {
    ...BASE_APPLICATION,
    status: 'pending',
    appliedAt: '2026-07-08',
    resubmissionCount: 1,
    documents: baseDocuments('submitted'),
  },
  reviewing: {
    ...BASE_APPLICATION,
    status: 'reviewing',
    appliedAt: '2026-07-07',
    resubmissionCount: 1,
    documents: baseDocuments('submitted'),
  },
  resubmitted: {
    ...BASE_APPLICATION,
    status: 'resubmitted',
    appliedAt: '2026-06-12',
    resubmissionCount: 1,
    documents: baseDocuments('submitted'),
  },
  // rejected/revision-requested는 화면(HEADER_META, StoreSettingsForm)에서 동일하게
  // 취급되므로 mock 데이터도 status만 다르고 나머지는 REJECTED_FORM_FIELDS를 공유한다.
  rejected: {
    ...BASE_APPLICATION,
    ...REJECTED_FORM_FIELDS,
    status: 'rejected',
    documents: baseDocuments('resubmission-required'),
  },
  'revision-requested': {
    ...BASE_APPLICATION,
    ...REJECTED_FORM_FIELDS,
    status: 'revision-requested',
    documents: baseDocuments('resubmission-required'),
  },
  approved: {
    ...BASE_APPLICATION,
    status: 'approved',
    appliedAt: '2026-06-10',
    resubmissionCount: 1,
    documents: baseDocuments('submitted'),
  },
}

// 기존 회귀 테스트·프로덕션 라우트가 인자 없이 호출했을 때의 기본 상태 — 계속 rejected로 유지.
export const MOCK_SELLER_APPLICATION: SellerApplication = SELLER_APPLICATION_FIXTURES.rejected

const DELAY_MS = 300

export function mockFetchSellerApplication(status: SellerApplicationStatus = 'rejected'): Promise<SellerApplication> {
  const source = SELLER_APPLICATION_FIXTURES[status]
  return new Promise(resolve => {
    setTimeout(
      () =>
        resolve({
          ...source,
          documents: source.documents.map(doc => ({ ...doc })),
        }),
      DELAY_MS,
    )
  })
}

export function mockResubmitApplication(application: SellerApplication): Promise<SellerApplication> {
  return new Promise(resolve => {
    setTimeout(() => {
      const next: SellerApplication = {
        ...application,
        status: 'resubmitted',
        resubmissionCount: (application.resubmissionCount ?? 0) + 1,
      }
      Object.assign(MOCK_SELLER_APPLICATION, next)
      resolve({ ...MOCK_SELLER_APPLICATION })
    }, DELAY_MS)
  })
}
