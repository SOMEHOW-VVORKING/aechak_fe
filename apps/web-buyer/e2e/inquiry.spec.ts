import { test, expect, type Page, type Route } from '@playwright/test'

// 고객센터 문의(b6-st-3) ↔ POST /inquiries 연동 E2E. 실백엔드 없이 page.route 스텁으로 접수 계약을
// 재현한다(pet-breeds/search spec과 동일한 CORS/프리플라이트 규칙 — 페이지 5175 → API 8080이 교차
// 출처 + withCredentials라 fulfill 응답에도 정확한 origin의 CORS 헤더가 필요하다). 각 상태에서
// page.screenshot으로 PR 첨부용 캡처를 test-results/pr-c(gitignore)에 남긴다.

const ORIGIN = 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'

function fulfillJson(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': '*' },
    })
  }
  return route.fulfill({ status, headers: CORS, json })
}

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
async function shot(page: Page, path: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path })
}

// POST /inquiries를 상태 있게 스텁 — 접수 요청 바디를 기록해 계약(유형/이메일/내용)이 실제로 실렸는지
// 확인한다. 고정 응답만 두면 제출이 진짜 나갔는지 알 수 없다.
async function stubInquiries(page: Page): Promise<Record<string, unknown>[]> {
  const received: Record<string, unknown>[] = []
  await page.route('**/api/v1/inquiries', route => {
    if (route.request().method() === 'POST') {
      received.push(route.request().postDataJSON() as Record<string, unknown>)
    }
    // OPTIONS 프리플라이트는 fulfillJson이 가로채고, POST는 접수 성공(201)으로 응답한다.
    return fulfillJson(route, 201, {
      data: { status: 'RECEIVED', createdAt: '2026-08-09T20:00:00' },
    })
  })
  return received
}

test('[AC-INQUIRY-E2E-001] 작성 폼 → 유형 시트 → 이메일 검증 → 제출 → 접수 완료(4 상태)', async ({
  page,
}) => {
  const received = await stubInquiries(page)

  // 3-A: 작성 폼 기본
  await page.goto('/settings/inquiry')
  await expect(page.getByText('고객센터 문의')).toBeVisible()
  await expect(page.getByText('문의 유형을 선택해주세요')).toBeVisible()
  await shot(page, `${SHOTS}/01-inquiry-form.png`)

  // 3-B: 문의 유형 선택 시트(5종)
  await page.getByRole('button', { name: '문의 유형을 선택해주세요' }).click()
  await expect(page.getByRole('button', { name: '계정 / 로그인' })).toBeVisible()
  await expect(page.getByRole('button', { name: '배송 / 반품 / 교환' })).toBeVisible()
  await expect(page.getByRole('button', { name: '서비스 이용 / 기타' })).toBeVisible()
  await shot(page, `${SHOTS}/02-type-sheet.png`)

  // 유형 선택 → 트리거에 반영. 시트 스크림이 pointer-events-none이라 닫힘 애니메이션 중에도
  // 다음 입력이 진행되므로, 3-C 캡처가 닫히는 시트를 잡지 않게 시트 언마운트를 명시적으로 기다린다.
  await page.getByRole('button', { name: '주문 / 결제' }).click()
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)

  // 3-C: 이메일 형식 오류 + 제출 비활성 — 오류는 필드를 벗어난(blur) 뒤에만 노출된다.
  const email = page.getByPlaceholder('답변 받을 이메일 주소를 입력해주세요')
  await email.fill('kongi.mom@')
  await email.blur()
  await expect(
    page.getByText('이메일 형식이 올바르지 않아요. 예: name@aechak.co.kr'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '문의 제출' })).toBeDisabled()
  await shot(page, `${SHOTS}/03-email-error.png`)

  // 유효 이메일 + 내용 채우고 제출
  await email.fill('kongi.mom@aechak.co.kr')
  // placeholder 문구가 아니라 라벨로 잡는다 — 카피가 바뀌어도 셀렉터가 따라 깨지지 않게.
  await page
    .getByLabel('문의 내용')
    .fill('결제는 완료됐는데 주문 내역에 안 보여요. 확인 부탁드립니다.')
  const submit = page.getByRole('button', { name: '문의 제출' })
  await expect(submit).toBeEnabled()
  await submit.click()

  // 3-D: 접수 완료 토스트
  await expect(page.getByText('문의가 접수됐어요')).toBeVisible()
  await shot(page, `${SHOTS}/04-submitted-toast.png`)

  // 접수 요청이 유형/이메일/내용을 실제로 실었는지
  expect(received).toHaveLength(1)
  expect(received[0]).toMatchObject({
    inquiryType: 'ORDER_PAYMENT',
    replyEmail: 'kongi.mom@aechak.co.kr',
    content: '결제는 완료됐는데 주문 내역에 안 보여요. 확인 부탁드립니다.',
  })

  // 접수 성공 후 잠깐 뒤 설정 홈으로 자동 복귀한다(replace 이동이라 뒤로가기가 폼을 재진입하지 않음).
  await expect(page).toHaveURL(/\/settings$/)
})

test('[AC-INQUIRY-E2E-002] 세션 없이 제출하면(401 → refresh 실패) 로그인 화면으로 튕긴다', async ({
  page,
}) => {
  // 제출 401을 받은 인터셉터가 refresh를 시도한다. 성공으로 새면 안 튕기므로 refresh도 401 고정.
  await page.route('**/api/v1/inquiries', route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '로그인이 필요합니다.' }),
  )
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '인증이 필요합니다.' }),
  )

  await page.goto('/settings/inquiry')
  await page.getByRole('button', { name: '문의 유형을 선택해주세요' }).click()
  await page.getByRole('button', { name: '주문 / 결제' }).click()
  await page
    .getByPlaceholder('답변 받을 이메일 주소를 입력해주세요')
    .fill('kongi.mom@aechak.co.kr')
  await page.getByLabel('문의 내용').fill('결제 확인 부탁드립니다. 내역에 안 보여요.')
  await page.getByRole('button', { name: '문의 제출' }).click()

  // 전역 onAuthExpired(main.tsx)가 로그인으로 보낸다 — 인라인 에러가 아니라 화면 자체가 바뀐다.
  await expect(page).toHaveURL(/\/onboarding\/login$/)
  await expect(page.getByRole('button', { name: '카카오로 시작하기' })).toBeVisible()
})
