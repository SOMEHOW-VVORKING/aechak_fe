import type { SellerApplication } from '@aechak/domain'

// 어드민 심사 목록 mock. 상태는 BE ApplicationStatus 1:1(draft/submitted/reviewing/approved/
// rejected/cancelled) — 어드민 목록에는 제출 이후 상태만 노출된다(작성 중 DRAFT는 셀러 로컬 단계).
// 반려 후 재제출은 별도 상태가 아니라 다시 submitted로 돌아온다(BE reopen → DRAFT → submit).
export const sellerApplicationsMock: SellerApplication[] = [
  {
    id: 'app-1',
    applicantName: '펫프렌즈상사',
    sellerType: 'business',
    legalType: 'individual-business',
    businessNumberMasked: '123-45-****',
    status: 'rejected',
    appliedAt: '2026-06-18',
    representativeNameMasked: '김*수',
    phoneMasked: '010-2***-**81',
    documents: [
      { key: 'business-reg', label: '사업자' },
      { key: 'mail-order', label: '통신판매' },
      { key: 'bankbook', label: '통장' },
      { key: 'id-card', label: '신분증' },
    ],
    rejectionReason: '통신판매업 신고증 불일치',
    internalMemo: '대표자명 일치, 계좌 사본 흐림 — 재제출 시 계좌도 재확인.',
  },
  {
    id: 'app-2',
    applicantName: '냥이상점',
    sellerType: 'business',
    legalType: 'individual-business',
    businessNumberMasked: '220-81-****',
    status: 'submitted',
    appliedAt: '2026-06-17',
    representativeNameMasked: '박*희',
    phoneMasked: '010-3***-**42',
    documents: [
      { key: 'business-reg', label: '사업자' },
      { key: 'mail-order', label: '통신판매' },
      { key: 'bankbook', label: '통장' },
      { key: 'id-card', label: '신분증' },
    ],
  },
  {
    id: 'app-3',
    applicantName: 'comfy_pet',
    sellerType: 'individual',
    legalType: 'individual',
    status: 'reviewing',
    appliedAt: '2026-06-17',
    representativeNameMasked: '정*은',
    phoneMasked: '010-4***-**19',
    documents: [
      { key: 'bankbook', label: '통장' },
      { key: 'id-card', label: '신분증' },
    ],
  },
  {
    id: 'app-4',
    applicantName: '해피독몰',
    sellerType: 'business',
    legalType: 'individual-business',
    businessNumberMasked: '105-87-****',
    status: 'submitted',
    appliedAt: '2026-06-16',
    representativeNameMasked: '최*호',
    phoneMasked: '010-5***-**07',
    documents: [
      { key: 'business-reg', label: '사업자' },
      { key: 'mail-order', label: '통신판매' },
      { key: 'bankbook', label: '통장' },
      { key: 'id-card', label: '신분증' },
    ],
  },
  {
    id: 'app-5',
    applicantName: '마이펫라이프',
    sellerType: 'individual',
    legalType: 'individual',
    status: 'approved',
    appliedAt: '2026-06-16',
    decidedAt: '2026-06-17',
    representativeNameMasked: '한*진',
    phoneMasked: '010-6***-**33',
    documents: [
      { key: 'bankbook', label: '통장' },
      { key: 'id-card', label: '신분증' },
    ],
  },
]
