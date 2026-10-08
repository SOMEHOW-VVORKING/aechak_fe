import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { axiosInstance } from '@aechak/api'

// vitest 공용 MSW 서버(test-setup.ts가 수명주기를 관리) — web-buyer의 src/testing/msw 관례를
// web-seller에 이식했다. 실제 HTTP 경로(URL·envelope·에러 계약)까지 검증하려고 모듈 모킹 대신
// 네트워크 레벨에서 가로챈다. 테스트는 main.tsx를 안 거치므로 baseURL은 client.ts 기본값.
const base = axiosInstance.defaults.baseURL ?? ''
export const SELLER_APPLICATIONS_URL = `${base}/seller-applications`
export const SELLER_APPLICATIONS_SUBMIT_URL = `${base}/seller-applications/submit`
export const PRESIGNED_URL = `${base}/files/presigned-url`
export const WEB_REFRESH_URL = `${base}/auth/web/refresh`

// BE ApplicationResponse 모양의 서버 상태. null = 신청 이력 없음(GET 404/10100).
export interface SellerApplicationWire {
  applicationId: number
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  businessType: 'PERSONAL_GENERAL' | 'SOLE_PROPRIETORSHIP' | 'CORPORATE'
  businessName: string | null
  businessRegNo: string | null
  corpRegNo: string | null
  representativeName: string | null
  telesalesNumber: string | null
  bankCode: string | null
  accountNumberMasked: string | null
  accountHolder: string | null
  appliedAt: string
  submittedAt: string | null
  decidedAt: string | null
  rejectionReason: string | null
  documents: { documentType: string; uploadedAt: string }[]
}

let application: SellerApplicationWire | null = null
let applicationSeq = 0

export function makeApplicationWire(
  overrides: Partial<SellerApplicationWire> = {},
): SellerApplicationWire {
  applicationSeq += 1
  return {
    applicationId: applicationSeq,
    status: 'DRAFT',
    businessType: 'PERSONAL_GENERAL',
    businessName: null,
    businessRegNo: null,
    corpRegNo: null,
    representativeName: null,
    telesalesNumber: null,
    bankCode: null,
    accountNumberMasked: null,
    accountHolder: null,
    appliedAt: '2026-08-13T09:00:00',
    submittedAt: null,
    decidedAt: null,
    rejectionReason: null,
    documents: [],
  ...overrides,
  }
}

/** 테스트마다 신청 상태를 세운다. 인자 없이 부르면 '신청 이력 없음'(GET 404/10100). */
export function seedSellerApplication(state: SellerApplicationWire | null = null): void {
  application = state ? { ...state, documents: state.documents.map(doc => ({ ...doc })) } : null
}

/** 핸들러가 반영한 현재 신청 상태 — 테스트가 저장 결과를 단언할 때 읽는다. */
export function currentSellerApplication(): SellerApplicationWire | null {
  return application
    ? { ...application, documents: application.documents.map(doc => ({ ...doc })) }
    : null
}

function maskAccount(accountNumber: string): string {
  if (accountNumber.length <= 4) return '*'.repeat(accountNumber.length)
  return `${'*'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`
}

const sellerApplicationHandlers = [
  http.get(SELLER_APPLICATIONS_URL, () => {
    if (application == null) {
      return HttpResponse.json(
        { errorCode: 10100, message: '입점 신청을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    return HttpResponse.json({ data: application })
  }),
  // 임시저장 — 전체 덮어쓰기(폼) + 부분 upsert(서류). REJECTED면 자동 reopen(BE 계약).
  http.post(SELLER_APPLICATIONS_URL, async ({ request }) => {
    const body = (await request.json()) as {
      businessType: SellerApplicationWire['businessType']
      businessName?: string | null
      businessRegNo?: string | null
      corpRegNo?: string | null
      representativeName?: string | null
      telesalesNumber?: string | null
      bankCode?: string | null
      accountNumber?: string | null
      accountHolder?: string | null
      documents?: { documentType: string; tmpKey: string }[]
    }
    if (application && application.status !== 'DRAFT' && application.status !== 'REJECTED') {
      return HttpResponse.json(
        { errorCode: 10101, message: '현재 신청 상태에서 허용되지 않는 전이입니다.' },
        { status: 409 },
      )
    }
    const existing = application ?? makeApplicationWire()
    const mergedDocuments = [...existing.documents]
    for (const item of body.documents ?? []) {
      const index = mergedDocuments.findIndex(doc => doc.documentType === item.documentType)
      const row = { documentType: item.documentType, uploadedAt: '2026-08-13T10:00:00' }
      if (index >= 0) mergedDocuments[index] = row
      else mergedDocuments.push(row)
    }
    application = {
      ...existing,
      status: 'DRAFT',
      businessType: body.businessType,
      businessName: body.businessName ?? null,
      businessRegNo: body.businessRegNo ?? null,
      corpRegNo: body.corpRegNo ?? null,
      representativeName: body.representativeName ?? null,
      telesalesNumber: body.telesalesNumber ?? null,
      bankCode: body.bankCode ?? null,
      accountNumberMasked: body.accountNumber ? maskAccount(body.accountNumber) : null,
      accountHolder: body.accountHolder ?? null,
      documents: mergedDocuments,
    }
    return HttpResponse.json({ data: application })
  }),
  http.post(SELLER_APPLICATIONS_SUBMIT_URL, () => {
    if (application == null) {
      return HttpResponse.json(
        { errorCode: 10100, message: '입점 신청을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    if (application.status !== 'DRAFT') {
      return HttpResponse.json(
        { errorCode: 10101, message: '현재 신청 상태에서 허용되지 않는 전이입니다.' },
        { status: 409 },
      )
    }
    // requireSubmittable 미러(공통 필수 정보만) — message 형식은 BE 그대로 격식체다.
    const missingFields = (
      [
        ['대표자명', application.representativeName],
        ['은행 코드', application.bankCode],
        ['계좌번호', application.accountNumberMasked],
        ['예금주', application.accountHolder],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([label]) => label)
    if (missingFields.length > 0) {
      return HttpResponse.json(
        { errorCode: 10105, message: `필수 정보가 누락됐습니다: ${missingFields.join(', ')}` },
        { status: 400 },
      )
    }
    application = { ...application, status: 'SUBMITTED', submittedAt: '2026-08-13T11:00:00' }
    return new HttpResponse(null, { status: 204 })
  }),
  // 서류 presigned 발급 + S3 PUT(절대 URL이라 baseURL 밖 — 따로 가로챈다).
  http.post(PRESIGNED_URL, async ({ request }) => {
    const body = (await request.json()) as { purpose: string; contentType: string }
    const key = `tmp/1/sellers/documents/fixture-${body.contentType.split('/')[1]}`
    void body.purpose
    return HttpResponse.json({ data: { url: `https://fake-s3.local/${key}`, key } })
  }),
  http.put('https://fake-s3.local/*', () => new HttpResponse(null, { status: 200 })),
  // 401 시나리오에서 refresh가 성공으로 새면 에러 테스트가 조용히 통과한다 — 기본은 401 고정
  // (web-buyer msw 관례).
  http.post(WEB_REFRESH_URL, () =>
    HttpResponse.json({ errorCode: 20004, message: '인증이 필요합니다.' }, { status: 401 }),
  ),
]

export const handlers = [...sellerApplicationHandlers]
export const server = setupServer(...handlers)
