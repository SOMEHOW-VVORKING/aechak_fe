import type { Page } from '@playwright/test'

// 회원 세션을 전제하는 spec이 쓰는 공용 스텁.
//
// 앱은 어느 화면이 그려지기 전에 세션을 한 번 확인한다(__root beforeLoad → restoreSessionOrGuest):
// access 토큰은 메모리에만 있어 새 탭·새로고침에서는 비어 있고 refresh 쿠키는 httpOnly라 JS가 읽을
// 수 없으므로, refresh를 한 번 쏴 보는 것만이 회원 여부를 아는 방법이다. 이것을 스텁하지 않으면
// 요청이 실패해 회원 여부가 미지로 남고, 로그인 상태를 enabled로 넘기는 조회(카테고리·최근
// 검색어·리뷰 미리보기)가 아예 나가지 않아 화면이 비회원처럼 보인다.
//
// 교차 출처(앱 → 8080) + withCredentials라 fulfill 응답에도 정확한 origin의 CORS 헤더가 필요하다
// (와일드카드 불가 — 다른 spec과 같은 규칙). 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서
// 온다 — 한 글자만 어긋나도 브라우저가 이 응답을 거부해 회원 여부가 미지로 남고, 로그인 상태를
// enabled로 넘기는 조회가 통째로 나가지 않는다. 화면은 에러 없이 빈 상태로 그려지므로 원인이
// 드러나지 않는다(전용 포트로 돌리다 실측으로 겪었다).
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

const REFRESH_PATTERN = '**/api/v1/auth/web/refresh'

function preflight(headers: Record<string, string>) {
  return {
    status: 204,
    headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' },
  }
}

/** refresh 쿠키가 살아 있는 회원 — 세션 확인이 성공해 화면이 회원으로 그려진다. */
export async function stubMemberSession(page: Page): Promise<void> {
  await page.route(REFRESH_PATTERN, route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill(preflight(CORS))
    return route.fulfill({
      status: 200,
      headers: CORS,
      json: { data: { accessToken: 'e2e-access-token', tokenType: 'Bearer', expiresIn: 1800 } },
    })
  })
}

/** refresh 쿠키가 없거나 폐기된 비회원 — 세션 확인이 401이라 비회원으로 확정된다. */
export async function stubGuestSession(page: Page): Promise<void> {
  await page.route(REFRESH_PATTERN, route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill(preflight(CORS))
    return route.fulfill({
      status: 401,
      headers: CORS,
      json: { errorCode: 20002, message: '유효하지 않은 토큰입니다.' },
    })
  })
}
