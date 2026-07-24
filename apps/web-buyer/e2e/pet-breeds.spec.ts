import { test, expect, type Route } from '@playwright/test'

// 펫 폼 품종 Select ↔ breeds API 연동 E2E(web-buyer 첫 Playwright spec).
// 실백엔드 없이 page.route 스텁으로 서버 계약을 재현한다 — 페이지(5175) → API(8080)가 교차
// 출처 + withCredentials라서, fulfill 응답에도 CORS 헤더(정확한 origin, 와일드카드 불가)를
// 넣어야 브라우저가 응답을 페이지에 전달한다.

const ORIGIN = 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

function fulfillJson(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    // 프리플라이트 방어 응답(단순 GET이라 보통 안 오지만 헤더 조합이 바뀌어도 깨지지 않게)
    return route.fulfill({
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': '*' },
    })
  }
  return route.fulfill({ status, headers: CORS, json })
}

// 서버 시드의 실제 id·라벨 부분집합(가나다순 + '기타' 후순).
const BREEDS = {
  DOG: {
    data: [
      { breedId: 279, label: '푸들' },
      { breedId: 299, label: '기타' },
    ],
  },
  CAT: {
    data: [
      { breedId: 369, label: '코리안 숏헤어' },
      { breedId: 386, label: '기타' },
    ],
  },
}

test('[AC-PET-BREEDS-E2E-001] 새 펫: 강아지 전환 → API 품종 선택 → 저장 → 목록 메타 노출', async ({ page }) => {
  await page.route('**/api/v1/breeds**', route =>
    fulfillJson(
      route,
      200,
      new URL(route.request().url()).searchParams.get('species') === 'DOG' ? BREEDS.DOG : BREEDS.CAT,
    ),
  )

  await page.goto('/mypage/pets/new')
  await page.getByRole('tab', { name: '강아지' }).click()
  await page.getByLabel('이름').fill('탄이')
  // 푸들은 DOG 응답에만 있다 — 선택이 되면 species=DOG 파라미터 분기까지 검증된 것.
  await page.getByLabel('품종').selectOption({ label: '푸들' })
  await page.getByRole('button', { name: '저장' }).click()

  await expect(page).toHaveURL(/\/mypage\/pets$/)
  // 시드 보리('강아지 / 푸들 / 1살 / 3.1kg')와 구분하려고 exact 매칭.
  await expect(page.getByText('강아지 / 푸들', { exact: true })).toBeVisible()
})

test('[AC-PET-BREEDS-E2E-002] 세션 없이 진입하면(401 → refresh 실패) 로그인 화면으로 튕긴다', async ({ page }) => {
  await page.route('**/api/v1/breeds**', route =>
    fulfillJson(route, 401, { errorCode: 20005, message: '로그인이 필요합니다.' }),
  )
  // 401을 받은 인터셉터가 refresh를 시도한다 — 성공으로 새면 안 튕기므로 refresh도 401 고정.
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfillJson(route, 401, { errorCode: 20005, message: '인증이 필요합니다.' }),
  )

  await page.goto('/mypage/pets/new')
  // 전역 onAuthExpired(main.tsx)가 로그인으로 보낸다 — 인라인 에러가 아니라 화면 자체가 바뀐다.
  await expect(page).toHaveURL(/\/onboarding\/login$/)
  await expect(page.getByRole('button', { name: '카카오로 시작하기' })).toBeVisible()
})
