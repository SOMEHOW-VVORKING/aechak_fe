import { test, expect, type Page, type Route } from '@playwright/test'
import { stubMemberSession } from './session'
import type { CartEnvelope, CartItemResponse, CartSellerGroupResponse } from '@aechak/api'

// 장바구니(b1-st-3) ↔ /carts 실 API 연동 E2E. 실백엔드 없이 page.route 상태형 스텁으로 서버 계약을
// 재현한다(교차 출처 8080 + withCredentials라 정확한 origin·Allow-Credentials·OPTIONS 방어 필수).
// PATCH는 절대값 대입, DELETE는 본문 {cartItemIds} — 요청 본문까지 단언한다.

// 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서 온다 — withCredentials라 fulfill 응답의
// Access-Control-Allow-Origin이 실제 origin과 한 글자도 달라선 안 되므로 두 곳이 같은 값을 읽는다.
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'

function fulfill(route: Route, status: number, json?: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }
  return json === undefined
    ? route.fulfill({ status, headers: CORS })
    : route.fulfill({ status, headers: CORS, json })
}

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
async function shot(page: Page, path: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path, animations: 'disabled' })
}

type Row = CartItemResponse & {
  sellerId: number
  storeName: string
  baseShippingFee: number
  freeShippingThreshold: number | null
}

// 생성 타입을 쓴다 — e2e는 tsc include 밖이라 로컬 인터페이스면 서버 계약 변경을 못 잡는다.
function row(
  overrides: Partial<Row> & { cartItemId: number; productName: string; price: number },
): Row {
  return {
    productId: '01J000000000000000000TEST',
    optionCombinationId: overrides.cartItemId,
    thumbnail: null,
    selectedOptions: '기본형',
    quantity: 1,
    originalPrice: overrides.price,
    discountRate: null,
    remainingStock: 10,
    itemStatus: 'ACTIVE',
    isOrderable: true,
    sellerId: 1,
    storeName: '냥이상점',
    baseShippingFee: 3000,
    freeShippingThreshold: 50000,
    ...overrides,
  }
}

// 냥이상점(임계 50,000·기본 3,000) 30,000원 두 라인 → 무료배송, 멍멍마트(임계 없음·기본 2,500) 10,000원 한 라인.
function seedRows(): Row[] {
  return [
    row({ cartItemId: 1, productName: '연어 사료 2kg', price: 30000 }),
    row({ cartItemId: 2, productName: '참치 캔 24개입', price: 30000, selectedOptions: '참치' }),
    row({
      cartItemId: 3,
      productName: '스크래쳐 하우스',
      price: 10000,
      sellerId: 2,
      storeName: '멍멍마트',
      baseShippingFee: 2500,
      freeShippingThreshold: null,
    }),
  ]
}

function toEnvelope(rows: Row[]): CartEnvelope {
  const groups = new Map<number, CartSellerGroupResponse>()
  for (const r of rows) {
    const { sellerId, storeName, baseShippingFee, freeShippingThreshold, ...item } = r
    const group = groups.get(sellerId) ?? {
      sellerId,
      storeName,
      baseShippingFee,
      freeShippingThreshold,
      items: [],
    }
    group.items.push(item)
    groups.set(sellerId, group)
  }
  return { data: { sellerGroups: [...groups.values()] } }
}

interface Recorded {
  patches: Array<{ cartItemId: number; body: unknown }>
  deletes: unknown[]
}

// 상태형 스텁 — PATCH/DELETE가 rows를 바꾸고 다음 GET이 바뀐 상태를 돌려준다.
async function stubCart(page: Page, rows: Row[]): Promise<Recorded> {
  const recorded: Recorded = { patches: [], deletes: [] }
  await page.route('**/api/v1/carts', route => fulfill(route, 200, toEnvelope(rows)))
  await page.route('**/api/v1/carts/items', route => {
    if (route.request().method() === 'DELETE') {
      const body = route.request().postDataJSON() as { cartItemIds: number[] }
      recorded.deletes.push(body)
      const ids = new Set(body.cartItemIds)
      const before = rows.length
      for (let i = rows.length - 1; i >= 0; i -= 1)
        if (ids.has(rows[i]!.cartItemId)) rows.splice(i, 1)
      return fulfill(route, 200, { data: { deletedCount: before - rows.length } })
    }
    return fulfill(route, 405)
  })
  await page.route('**/api/v1/carts/items/*', route => {
    const cartItemId = Number(new URL(route.request().url()).pathname.split('/').pop())
    if (route.request().method() !== 'PATCH') return fulfill(route, 405)
    const body = route.request().postDataJSON() as { quantity?: number }
    recorded.patches.push({ cartItemId, body })
    const target = rows.find(r => r.cartItemId === cartItemId)
    if (!target)
      return fulfill(route, 404, { errorCode: 50205, message: '장바구니 항목을 찾을 수 없습니다.' })
    if (body.quantity != null) target.quantity = body.quantity
    return fulfill(route, 200, {
      data: {
        cartItemId,
        quantity: target.quantity,
        optionCombinationId: target.optionCombinationId,
        merged: false,
      },
    })
  })
  return recorded
}

// 회원 세션 전제 — 첫 진입 세션 확인(refresh)을 스텁하지 않으면 로그인 상태로 조건 건 조회가 안 나간다.
test.beforeEach(async ({ page }) => {
  await stubMemberSession(page)
})

test('[AC-CART-E2E-001] 셀러 2곳을 그룹으로 그리고 선택 해제 시 배송비·결제예정금액이 다시 계산된다', async ({
  page,
}) => {
  await stubCart(page, seedRows())
  await page.goto('/cart')

  await expect(page.getByRole('checkbox', { name: '냥이상점' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: '멍멍마트' })).toBeVisible()
  // 냥이상점 60,000 ≥ 50,000 → 무료배송, 멍멍마트는 임계 없음 → 2,500. 총 70,000 + 2,500.
  await expect(page.getByText('무료배송')).toBeVisible()
  await expect(page.getByText('2,500원', { exact: true })).toBeVisible()
  await expect(page.getByText('72,500원').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '주문하기 (3)' })).toBeEnabled()
  await shot(page, `${SHOTS}/cart-01-list.png`)

  // 냥이상점 라인 하나를 해제 → 30,000 < 50,000 → 배송비 3,000 추가(합 5,500), 총 45,500.
  // DS Checkbox의 input은 sr-only라 감싸는 label을 누른다.
  await page.getByRole('checkbox').nth(2).locator('xpath=ancestor::label').click()
  await expect(page.getByText('무료배송')).toHaveCount(0)
  await expect(page.getByText('5,500원', { exact: true })).toBeVisible()
  await expect(page.getByText('45,500원').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '주문하기 (2)' })).toBeEnabled()
  await shot(page, `${SHOTS}/cart-02-deselected.png`)
})

test('[AC-CART-E2E-002] 수량 증가는 PATCH 절대값 본문으로 나가고 재조회 결과가 합계에 반영된다', async ({
  page,
}) => {
  const recorded = await stubCart(page, seedRows())
  await page.goto('/cart')
  await expect(page.getByRole('checkbox', { name: '냥이상점' })).toBeVisible()

  await page.getByRole('button', { name: '증가' }).first().click()

  await expect.poll(() => recorded.patches).toEqual([{ cartItemId: 1, body: { quantity: 2 } }])
  // 30,000 → 60,000, 총 100,000 + 2,500.
  await expect(page.getByText('102,500원').first()).toBeVisible()
  await expect(page.getByRole('textbox', { name: '값' }).first()).toHaveValue('2')
  await shot(page, `${SHOTS}/cart-03-quantity.png`)
})

test('[AC-CART-E2E-003] 라인 삭제와 선택 삭제는 DELETE 본문 {cartItemIds}로 나가고 목록에서 사라진다', async ({
  page,
}) => {
  const recorded = await stubCart(page, seedRows())
  await page.goto('/cart')
  await expect(page.getByText('스크래쳐 하우스')).toBeVisible()

  // 멍멍마트 라인 X → 그 라인만.
  await page.getByRole('button', { name: '장바구니에서 삭제' }).nth(2).click()
  await expect(page.getByText('스크래쳐 하우스')).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: '멍멍마트' })).toHaveCount(0)
  await expect.poll(() => recorded.deletes).toEqual([{ cartItemIds: [3] }])

  // 남은 두 라인을 선택 삭제 → 빈 상태.
  await page.getByRole('button', { name: '선택 삭제' }).click()
  await expect(page.getByText('장바구니가 비어 있어요')).toBeVisible()
  await expect.poll(() => recorded.deletes).toEqual([{ cartItemIds: [3] }, { cartItemIds: [1, 2] }])
  await shot(page, `${SHOTS}/cart-04-empty.png`)
})

test('[AC-CART-E2E-004] 조회 실패는 빈 상태가 아니라 다시 시도 화면, PATCH 실패는 에러 토스트로 드러낸다', async ({
  page,
}) => {
  let failGet = true
  const rows = seedRows()
  await page.route('**/api/v1/carts/items/*', route =>
    fulfill(route, 409, { errorCode: 50201, message: '재고가 부족합니다.' }),
  )
  await page.route('**/api/v1/carts', route =>
    failGet
      ? fulfill(route, 500, { errorCode: 90000, message: '서버 오류' })
      : fulfill(route, 200, toEnvelope(rows)),
  )
  await page.goto('/cart')

  await expect(page.getByText('장바구니를 불러오지 못했어요')).toBeVisible()
  await expect(page.getByText('장바구니가 비어 있어요')).toHaveCount(0)
  await shot(page, `${SHOTS}/cart-05-load-error.png`)

  // 다시 시도 → 복구된 서버 응답으로 목록이 그려진다.
  failGet = false
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByRole('checkbox', { name: '냥이상점' })).toBeVisible()

  // 재고 부족(50201) PATCH → 토스트 + 수량은 서버 값(1)으로 복귀.
  await page.getByRole('button', { name: '증가' }).first().click()
  await expect(page.getByText('재고가 부족해요')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '값' }).first()).toHaveValue('1')
  await shot(page, `${SHOTS}/cart-06-patch-error.png`)
})
