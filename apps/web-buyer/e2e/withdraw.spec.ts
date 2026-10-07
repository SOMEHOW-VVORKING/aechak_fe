import { test, expect, type Page, type Route } from '@playwright/test'
import type { WithdrawalCheckResponse } from '@aechak/api'

// 회원 탈퇴(b10-st-5) ↔ GET /users/me/withdrawal/check · DELETE /users/me(SCRUM-95) E2E.
// 실백엔드 없이 page.route 스텁으로 BE 계약을 재현한다(교차 출처 + withCredentials라 CORS 헤더와
// 프리플라이트 응답 필수, logout/reviews spec 관례). 각 상태를 PR 첨부용으로 test-results/pr-c(gitignore)에 찍는다.

const ORIGIN = 'http://localhost:5175'
const SHOTS = 'test-results/pr-c'
const REJOIN_NOTICE = '탈퇴 후 30일 동안은 같은 소셜 계정으로 다시 가입할 수 없어요.'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' })
}

function preflight(route: Route) {
  return route.fulfill({
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, DELETE', 'Access-Control-Allow-Headers': '*' },
  })
}

interface StubOptions {
  withdrawable?: boolean
  // check 응답 status. 200이 아니면 BE 공통 에러 바디로 응답한다.
  checkStatus?: number
  // DELETE 실패를 재현한다. 없으면 BE처럼 204 + refresh 쿠키 만료.
  deleteError?: { status: number; errorCode: number; message: string }
}

async function stubWithdrawal(page: Page, opts: StubOptions = {}) {
  const calls = { check: 0, withdraw: 0 }
  let withdrawable = opts.withdrawable ?? true

  await page.route('**/api/v1/users/me/withdrawal/check', route => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    calls.check += 1
    if (opts.checkStatus && opts.checkStatus !== 200) {
      return route.fulfill({
        status: opts.checkStatus,
        headers: CORS,
        json: { errorCode: 90000, message: '서버 내부 오류가 발생했습니다.' },
      })
    }
    const body: WithdrawalCheckResponse = { data: { withdrawable } }
    return route.fulfill({ status: 200, headers: CORS, json: body })
  })

  await page.route('**/api/v1/users/me', route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return preflight(route)
    if (method !== 'DELETE') return route.fallback()
    calls.withdraw += 1
    if (opts.deleteError) {
      // 30011이면 그 사이 거래가 생긴 상황이라 다음 check도 false를 준다.
      if (opts.deleteError.errorCode === 30011) withdrawable = false
      const { status, errorCode, message } = opts.deleteError
      return route.fulfill({ status, headers: CORS, json: { errorCode, message } })
    }
    return route.fulfill({
      status: 204,
      headers: { ...CORS, 'Set-Cookie': 'refresh_token=; Max-Age=0; Path=/api/v1/auth; HttpOnly; SameSite=Lax' },
    })
  })
  return calls
}

async function openConfirm(page: Page) {
  await page.getByRole('button', { name: '탈퇴하기' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('정말 탈퇴하시겠어요?')).toBeVisible()
  return dialog
}

test('[AC-WITHDRAW-E2E-001] 안내 → 확인 Modal → DELETE → 완료 → 홈 복귀 + 비회원 전환', async ({ page }) => {
  const calls = await stubWithdrawal(page)

  await page.goto('/mypage/withdraw')
  await expect(page.getByText('탈퇴하기 전에 확인해 주세요')).toBeVisible()
  // BE 재가입 제한(auth.rejoin.blocked-period=30d, 같은 소셜 계정 기준) 안내.
  await expect(page.getByText(REJOIN_NOTICE)).toBeVisible()
  await shot(page, 'withdraw-01-guide')

  const dialog = await openConfirm(page)
  await expect(dialog).toContainText(REJOIN_NOTICE)
  expect(calls.withdraw).toBe(0) // 확인 전에는 DELETE를 보내지 않는다
  await shot(page, 'withdraw-02-confirm')

  await dialog.getByRole('button', { name: '탈퇴하기' }).click()
  await expect(page.getByText('탈퇴가 완료됐어요')).toBeVisible()
  expect(calls.withdraw).toBe(1)
  // 정리 뒤 check를 토큰 없이 다시 부르지 않는다.
  expect(calls.check).toBe(1)
  // 완료 화면은 되돌릴 화면이 아니라 ← 버튼이 없다.
  await expect(page.getByRole('button', { name: '뒤로 가기' })).toHaveCount(0)
  await shot(page, 'withdraw-03-done')

  await page.getByRole('button', { name: '홈으로' }).click()
  await expect(page).toHaveURL(`${ORIGIN}/`)
  // 비회원 전환 확인(logout spec과 같은 방법). 리로드하면 mock 로그인 플래그가 리셋되므로 같은 SPA 세션에서 본다.
  await page.getByRole('button', { name: '찜하기' }).first().click()
  await expect(page.getByText('로그인이 필요해요')).toBeVisible()
})

test('[AC-WITHDRAW-E2E-002] 서버가 withdrawable=false면 제한 안내와 잠긴 탈퇴 버튼을 보여준다', async ({ page }) => {
  const calls = await stubWithdrawal(page, { withdrawable: false })

  await page.goto('/mypage/withdraw')
  await expect(page.getByText('지금은 탈퇴할 수 없어요')).toBeVisible()
  await expect(page.getByRole('button', { name: '탈퇴하기' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '주문 내역 보기' })).toBeVisible()
  expect(calls.withdraw).toBe(0)
  await shot(page, 'withdraw-04-blocked')
})

test('[AC-WITHDRAW-E2E-003] DELETE가 409/30011이면 판정을 다시 받아 제한 안내로 바뀐다', async ({ page }) => {
  await stubWithdrawal(page, {
    deleteError: { status: 409, errorCode: 30011, message: '정리되지 않은 거래가 있어 탈퇴할 수 없습니다.' },
  })

  await page.goto('/mypage/withdraw')
  const dialog = await openConfirm(page)
  await dialog.getByRole('button', { name: '탈퇴하기' }).click()

  await expect(page.getByText('지금은 탈퇴할 수 없어요')).toBeVisible()
  await expect(page.getByRole('button', { name: '탈퇴하기' })).toBeDisabled()
})

test('[AC-WITHDRAW-E2E-004] DELETE가 403/20005면 Modal 안에 해요체 안내를 보여준다', async ({ page }) => {
  await stubWithdrawal(page, {
    deleteError: { status: 403, errorCode: 20005, message: '이용이 제한된 계정입니다.' },
  })

  await page.goto('/mypage/withdraw')
  const dialog = await openConfirm(page)
  await dialog.getByRole('button', { name: '탈퇴하기' }).click()

  await expect(dialog.getByText('이용이 제한된 계정이라 탈퇴할 수 없어요.')).toBeVisible()
  await shot(page, 'withdraw-05-delete-error')
})

test('[AC-WITHDRAW-E2E-005] 탈퇴 가능 여부 조회 실패는 재시도 버튼 없이 인라인으로 안내한다', async ({ page }) => {
  await stubWithdrawal(page, { checkStatus: 500 })

  await page.goto('/mypage/withdraw')
  await expect(page.getByText('탈퇴 가능 여부를 확인하지 못했어요')).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '탈퇴하기' })).toHaveCount(0)
  await shot(page, 'withdraw-06-check-error')
})
