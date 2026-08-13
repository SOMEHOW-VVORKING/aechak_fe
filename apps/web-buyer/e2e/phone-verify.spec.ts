import { test, expect, type Page, type Route } from '@playwright/test'

// 휴대폰 본인 인증(b10-st-9) ↔ 실서버 계약 E2E. 실백엔드 없이 page.route 스텁으로 재현한다.
// pet-breeds.spec과 동일한 전제: 페이지(5175) → API(8080) 교차 출처 + withCredentials라
// fulfill 응답에도 CORS 헤더(정확한 origin)를 넣어야 브라우저가 응답을 전달한다.

const ORIGIN = 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

function fulfillJson(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }
  return route.fulfill({ status, headers: CORS, json })
}

const STUB_CODE = '123456'

interface AccountState {
  status: 'ACTIVE'
  nickname: string
  profileImageUrl: string | null
  profileImageKey: string | null
  bio: string | null
  email: string
  phoneNumber: string | null
  isPhoneVerified: boolean
}

/**
 * 내 정보 + 인증 발송/확인을 상태 있게 스텁한다. confirm 성공이 GET /users/me 재조회가 아니라
 * confirm 응답 반영으로 화면을 바꾸는 게 이 화면의 계약이지만, 스텁 상태도 함께 바꿔
 * 새 조회가 나가도 일관되게 한다(StrictMode 이중 마운트 × retry로 요청 횟수는 단정하지 않는다).
 */
async function stubPhoneVerification(page: Page) {
  const account: AccountState = {
    status: 'ACTIVE',
    nickname: '코코집사',
    profileImageUrl: null,
    profileImageKey: null,
    bio: null,
    email: 'coco****@aechak.co.kr',
    phoneNumber: null,
    isPhoneVerified: false,
  }
  let issuedPhone: string | null = null

  await page.route('**/api/v1/users/me', route => fulfillJson(route, 200, { data: account }))
  await page.route('**/api/v1/users/me/phone/verifications', route => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, 204, null)
    issuedPhone = String(
      (route.request().postDataJSON() as Record<string, unknown>)['phoneNumber'],
    )
    return fulfillJson(route, 200, { data: { expiresInSeconds: 180, resendCooldownSeconds: 60 } })
  })
  await page.route('**/api/v1/users/me/phone/verifications/confirm', route => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, 204, null)
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (issuedPhone == null || body['code'] !== STUB_CODE || body['phoneNumber'] !== issuedPhone) {
      return fulfillJson(route, 400, { errorCode: 30005, message: '인증번호가 올바르지 않습니다.' })
    }
    const digits = issuedPhone.replace(/-/g, '')
    account.phoneNumber = `${digits.slice(0, 3)}-${'*'.repeat(digits.length - 7)}-${digits.slice(-4)}`
    account.isPhoneVerified = true
    return fulfillJson(route, 200, { data: account })
  })
}

test('[AC-VERIFY-E2E-001] 발송 → 잘못된 코드 30005 인라인 → 올바른 코드로 인증 완료(9-B)', async ({
  page,
}) => {
  await stubPhoneVerification(page)

  await page.goto('/mypage/verify')
  await page.getByLabel('휴대폰 번호').fill('010-1234-5678')
  await page.getByRole('button', { name: '인증번호 받기' }).click()

  // 발송 응답 기반 타이머 — 재전송 버튼이 남은 초와 함께 잠기고 만료 카운트다운이 보인다.
  await expect(page.getByRole('button', { name: /재전송 \(\d+초\)/ })).toBeDisabled()
  await expect(page.getByText(/남은 시간 \d+:\d{2}/)).toBeVisible()

  // 잘못된 코드 — 서버 30005가 인라인 문구로 온다(화면 전환 없음).
  await page.getByPlaceholder('6자리 숫자').fill('999999')
  await page.getByRole('button', { name: '인증 완료' }).click()
  await expect(page.getByText('인증번호가 올바르지 않아요.')).toBeVisible()

  // 올바른 코드 — confirm 응답(UserMe)이 반영돼 완료 화면(9-B)으로 전환된다.
  await page.getByPlaceholder('6자리 숫자').fill(STUB_CODE)
  await page.getByRole('button', { name: '인증 완료' }).click()
  await expect(page.getByText('본인 인증 완료')).toBeVisible()
})

test('[AC-VERIFY-E2E-002] 세션 없이 진입하면(401 → refresh 실패) 로그인 화면으로 튕긴다', async ({
  page,
}) => {
  await page.route('**/api/v1/users/me', route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '로그인이 필요합니다.' }),
  )
  // 401을 받은 인터셉터가 refresh를 시도한다. 성공으로 새면 안 튕기므로 refresh도 401 고정.
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '인증이 필요합니다.' }),
  )

  await page.goto('/mypage/verify')
  await expect(page).toHaveURL(/\/onboarding\/login$/)
  await expect(page.getByRole('button', { name: '카카오로 시작하기' })).toBeVisible()
})
