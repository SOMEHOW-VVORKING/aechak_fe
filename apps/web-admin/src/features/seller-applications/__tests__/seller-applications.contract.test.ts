import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import {
  approveAdminSellerApplication,
  getAdminSellerApplicationDetail,
  getAdminSellerApplications,
  rejectAdminSellerApplication,
} from '@aechak/api'
import {
  ADMIN_APPLICATIONS_URL,
  API_ORIGIN,
  currentAdminApplication,
  makeAdminApplicationWire,
  seedAdminApplications,
  server,
} from '@/testing/msw/server'

// 어드민 심사 4종의 HTTP 계약을 생성 fetcher로 직접 두드려 고정한다. 화면 분기가 바뀌어도
// 계약(호스트·경로·검증 순서·에러 코드)이 흔들리지 않게 라우트 테스트와 분리해 둔다.

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => ({ status: 200, errorCode: null as number | null }),
    (error: { response: { status: number; data: { errorCode: number } } }) => ({
      status: error.response.status,
      errorCode: error.response.data.errorCode,
    }),
  )

describe('어드민 심사 API 계약', () => {
  beforeEach(() => {
    seedAdminApplications([
      makeAdminApplicationWire({ applicationId: 1, status: 'SUBMITTED' }),
      makeAdminApplicationWire({
        applicationId: 2,
        status: 'APPROVED',
        businessName: null,
        representativeName: '박지희',
        submittedAt: '2026-06-17T10:00:00',
      }),
      makeAdminApplicationWire({ applicationId: 3, status: 'DRAFT', submittedAt: null }),
    ])
  })

  it('[AC-ADM-API-001] 목록은 제출일 내림차순이고 제출 전 건은 뒤로 밀린다', async () => {
    const response = await getAdminSellerApplications()
    expect(response.data.items.map(item => item.applicationId)).toEqual([1, 2, 3])
    // status를 주지 않으면 DRAFT까지 포함한 전체 건수다.
    expect(response.data.totalCount).toBe(3)
  })

  it('[AC-ADM-API-002] status는 대문자 enum만 받고 미지 값은 400 errorCode 90001이다', async () => {
    const filtered = await getAdminSellerApplications({ status: 'APPROVED' })
    expect(filtered.data.items.map(item => item.applicationId)).toEqual([2])
    expect(filtered.data.totalCount).toBe(1)
    // 화면 소문자 값을 그대로 보내면 서버가 거절한다.
    expect(
      await errorOf(
        getAdminSellerApplications({ status: 'approved' as unknown as 'APPROVED' }),
      ),
    ).toEqual({ status: 400, errorCode: 90001 })
  })

  it('[AC-ADM-API-003] page 음수와 범위 밖 size는 서버가 보정하고 거절하지 않는다', async () => {
    const negative = await getAdminSellerApplications({ page: -3, size: 1 })
    expect(negative.data.items.map(item => item.applicationId)).toEqual([1])
    const oversized = await getAdminSellerApplications({ page: 0, size: 9999 })
    expect(oversized.data.items).toHaveLength(3)
    // 하한은 기본값으로 되돌아가는 것이 아니라 1로 올라간다(BE `PageQuery.of`의 `coerceIn(1, 100)`).
    const zero = await getAdminSellerApplications({ page: 0, size: 0 })
    expect(zero.data.items).toHaveLength(1)
  })

  it('[AC-ADM-API-004] 목록 행에는 사업자등록번호도 전화번호도 없다', async () => {
    const response = await getAdminSellerApplications()
    expect(Object.keys(response.data.items[0] ?? {}).sort()).toEqual([
      'applicationId',
      'businessName',
      'businessType',
      'representativeName',
      'status',
      'submittedAt',
    ])
  })

  it('[AC-ADM-API-005] 상세는 평문을 주고 서류 링크는 조회마다 새로 발급된다', async () => {
    const first = await getAdminSellerApplicationDetail(1)
    expect(first.data.businessRegNo).toBe('1234567890')
    expect(first.data.representativeName).toBe('김민수')
    expect(first.data.accountNumber).toBe('110123456789')
    const second = await getAdminSellerApplicationDetail(1)
    expect(second.data.documents[0]?.downloadUrl).not.toBe(first.data.documents[0]?.downloadUrl)
  })

  it('[AC-ADM-API-006] 없는 신청은 404 errorCode 10100이다', async () => {
    expect(await errorOf(getAdminSellerApplicationDetail(999))).toEqual({
      status: 404,
      errorCode: 10100,
    })
    expect(await errorOf(approveAdminSellerApplication(999))).toEqual({
      status: 404,
      errorCode: 10100,
    })
  })

  it('[AC-ADM-API-007] 승인은 204 본문 없음이고 심사 이력이 쌓인다', async () => {
    await expect(approveAdminSellerApplication(1)).resolves.toBe('')
    const after = currentAdminApplication(1)
    expect(after?.status).toBe('APPROVED')
    expect(after?.reviews).toEqual([
      { decision: 'APPROVED', rejectionReason: null, reviewedAt: '2026-06-19T09:00:00' },
    ])
  })

  it('[AC-ADM-API-008] 결정 가능한 상태는 SUBMITTED·REVIEWING뿐이고 그 밖은 409 errorCode 10101이다', async () => {
    expect(await errorOf(approveAdminSellerApplication(2))).toEqual({
      status: 409,
      errorCode: 10101,
    })
    expect(await errorOf(approveAdminSellerApplication(3))).toEqual({
      status: 409,
      errorCode: 10101,
    })
  })

  it('[AC-ADM-API-009] 상태 가드가 사유 검사보다 먼저 걸린다 — 결정된 신청 + 빈 사유는 409다', async () => {
    // BE SellerApplication.requireDecidable()이 reason.isBlank() 검사보다 먼저 실행된다.
    // 이미 결정된 신청에 빈 사유로 반려하면 400/10102가 아니라 409/10101이다.
    expect(await errorOf(rejectAdminSellerApplication(2, { reason: '' }))).toEqual({
      status: 409,
      errorCode: 10101,
    })
    // 같은 빈 사유를 결정 가능한 신청에 보내면 그때야 400/10102가 된다.
    expect(await errorOf(rejectAdminSellerApplication(1, { reason: '' }))).toEqual({
      status: 400,
      errorCode: 10102,
    })
  })

  it('[AC-ADM-API-010] 500자 초과는 바인딩 단계라 상태 가드보다 앞선다(400 errorCode 90001)', async () => {
    const tooLong = 'ㄱ'.repeat(501)
    expect(await errorOf(rejectAdminSellerApplication(2, { reason: tooLong }))).toEqual({
      status: 400,
      errorCode: 90001,
    })
    expect(await errorOf(rejectAdminSellerApplication(999, { reason: tooLong }))).toEqual({
      status: 400,
      errorCode: 90001,
    })
  })

  it('[AC-ADM-API-011] 반려는 자유 문자열을 그대로 저장하고 204를 준다', async () => {
    await expect(rejectAdminSellerApplication(1, { reason: '서류 누락' })).resolves.toBe('')
    const after = currentAdminApplication(1)
    expect(after?.status).toBe('REJECTED')
    expect(after?.rejectionReason).toBe('서류 누락')
  })

  it('[AC-ADM-API-012] 심사 요청은 admin 호스트로 나간다 — api 호스트에 같은 경로를 심어도 가지 않는다', async () => {
    // 호스트 분기가 무동작이 되면(configureApiHosts 누락 등) 이 요청이 api로 새고,
    // 그 회귀를 테스트가 아니라 배포에서 발견하게 된다.
    server.use(
      http.get(`${API_ORIGIN}/api/v1/admin/seller-applications`, () =>
        HttpResponse.json({ data: { items: [], totalCount: -1 } }),
      ),
    )
    const response = await getAdminSellerApplications()
    expect(response.data.totalCount).toBe(3)
  })

  it('[AC-ADM-API-013] 403 errorCode 20011은 권한 없음으로 그대로 올라온다', async () => {
    server.use(
      http.get(ADMIN_APPLICATIONS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    expect(await errorOf(getAdminSellerApplications())).toEqual({ status: 403, errorCode: 20011 })
  })
})
