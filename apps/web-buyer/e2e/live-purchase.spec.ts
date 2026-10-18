import { test, expect, type APIRequestContext, type Page, type Route } from '@playwright/test'
import type {
  AddCartItemEnvelope,
  CartEnvelope,
  CreateOrderGroupEnvelope,
  CreateOrderGroupRequest,
  DeleteCartItemsEnvelope,
  OrderListEnvelope,
  UpdateCartItemEnvelope,
} from '@aechak/api'

// 구매 플로우(상품 상세 → 장바구니 → 주문서 → 결제 → 주문 내역) **라이브** E2E. 다른 spec과 달리 서버를
// 스텁하지 않고 로컬 실 BE(http://localhost:8080, 시드 user 1)에 그대로 붙는다. 유일한 스텁은
// `/auth/web/refresh` — refresh 토큰은 Redis 대조라 밖에서 만들 수 없어, 미리 발급한 access JWT
// (env LIVE_API_TOKEN, scratchpad/fe/live/mint-jwt.sh)를 refresh 응답 모양 그대로 돌려준다. FE는 메모리
// access가 없으면 첫 401에서 refresh → 재시도하므로 그 뒤 모든 요청이 실 토큰으로 실 BE에 나간다.
//
// 포트원 채널값(PORTONE_*)이 없는 로컬 BE는 prepare에서 502/60005를 돌려준다 — 이것도 실측 대상이다
// (FE가 결제를 시작하지 못했다고 안내하는지). PAID 상태 목록 검증은 포트원 값 확보 뒤의 과제.
//
// 실행: cd apps/web-buyer && LIVE_API_TOKEN=$(…/mint-jwt.sh 1) pnpm exec playwright test e2e/live-purchase.spec.ts
// 실 BE가 떠 있으면 다른 spec의 미스텁 요청이 401로 새어 흔들릴 수 있으니 이 spec만 단독으로 돌린다.

const TOKEN = process.env['LIVE_API_TOKEN']
test.skip(!TOKEN, '로컬 실 BE + LIVE_API_TOKEN 필요')
test.describe.configure({ mode: 'serial', timeout: 90_000 })

const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'
// 실 BE 첫 요청(JIT·커넥션 풀)과 invalidate 재조회를 기다릴 여유.
const SLOW = { timeout: 15_000 }

// 시드(scratchpad/fe/live/seed-live.sql): 냥이상점(100, 기본 3,000·임계 50,000) 상품 1 판매가 64,000,
// 조합 1 '기본형'. 멍멍마트(101, 기본 2,500·임계 없음) 상품 2 32,000, 조합 3 '닭고기'. 배송지 1(기본).
const PRODUCT_1 = '01JCART0000000000000000001'
const COMBO_1_BASIC = 1
const COMBO_3_CHICKEN = 3
const DELIVERY_ADDRESS_ID = 1
// 시드 잔액은 5,000이지만 BE가 결제대기 주문그룹을 만들 때 usedPoint를 즉시 차감하므로(실측) 실행마다 1,000씩
// 줄어든다 — 잔액은 실행 시점에 GET /users/me/points로 읽고 1,000 이상인지만 전제한다.
const USED_POINT = 1000
const AUTH = { Authorization: `Bearer ${TOKEN}` }

const formatKRW = (n: number) => `${n.toLocaleString('ko-KR')}원`

// ---- 실 API 직접 호출(Playwright request 컨텍스트) --------------------------------------
async function readCart(request: APIRequestContext): Promise<CartEnvelope> {
  const res = await request.get(`${API}/carts`, { headers: AUTH })
  expect(res.status(), 'GET /carts').toBe(200)
  return (await res.json()) as CartEnvelope
}

function cartItems(cart: CartEnvelope) {
  return cart.data.sellerGroups.flatMap(g => g.items)
}

/** 장바구니를 전부 비운다(멱등 재실행 전제). 지운 라인 id를 돌려준다. */
async function clearCart(request: APIRequestContext): Promise<number[]> {
  const ids = cartItems(await readCart(request)).map(i => i.cartItemId)
  if (ids.length === 0) return []
  const res = await request.delete(`${API}/carts/items`, {
    headers: AUTH,
    data: { cartItemIds: ids },
  })
  expect(res.status(), 'DELETE /carts/items').toBe(200)
  const body = (await res.json()) as DeleteCartItemsEnvelope
  expect(body.data.deletedCount).toBe(ids.length)
  return ids
}

async function addCartItem(
  request: APIRequestContext,
  optionCombinationId: number,
  quantity = 1,
): Promise<AddCartItemEnvelope['data']> {
  const res = await request.post(`${API}/carts/items`, {
    headers: AUTH,
    data: { optionCombinationId, quantity },
  })
  expect(res.status(), 'POST /carts/items').toBe(201)
  return ((await res.json()) as AddCartItemEnvelope).data
}

// ---- 브라우저 쪽 ----------------------------------------------------------------------
// 유일한 스텁 — refresh 응답(`data.data.accessToken`, packages/api/src/client.ts refreshAccessToken)을 실 토큰으로.
async function stubSession(page: Page) {
  await page.route('**/api/v1/auth/web/refresh', (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          ...CORS,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type',
        },
      })
    }
    return route.fulfill({
      status: 200,
      headers: CORS,
      json: { data: { accessToken: TOKEN, tokenType: 'Bearer', expiresIn: 1800 } },
    })
  })
}

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
async function shot(page: Page, path: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path, animations: 'disabled' })
}

// 셀러 그룹 카드 = 스토어 체크박스의 조상 중 수량 스테퍼(증가 버튼)를 품은 가장 가까운 div. 라인은 상품명
// 텍스트가 아니라 카드 안의 구조로 찾는다(이 시나리오는 셀러당 라인 하나) — 텍스트 매칭은 서버 문자열에
// 제어문자가 섞이면 깨진다.
function sellerCard(page: Page, storeName: string) {
  return page
    .getByRole('checkbox', { name: storeName })
    .locator('xpath=ancestor::div[.//button[@aria-label="증가"]][1]')
}

// 카드의 첫 체크박스는 셀러 헤더, 둘째부터 라인. DS Checkbox의 input은 sr-only라 감싸는 label을 누른다.
async function toggleFirstLineCheckbox(page: Page, storeName: string) {
  await sellerCard(page, storeName)
    .getByRole('checkbox')
    .nth(1)
    .locator('xpath=ancestor::label')
    .click()
}

const isPost = (url: string | RegExp) => (r: { url(): string; method(): string }) =>
  r.method() === 'POST' && (typeof url === 'string' ? r.url().endsWith(url) : url.test(r.url()))

// 테스트 사이에 넘기는 실측값(serial). 상품·옵션·스토어 이름은 시드 리터럴이 아니라 실 응답에서 읽는다
// — 화면 셀렉터가 BE가 실제로 돌려준 문자열과 같아야 하고, 시드 인코딩이 틀어져도 FE 동작 검증은 이어져야 한다.
let product1Name = ''
let store1Name = ''
let store2Name = ''
let basicOptionLabel = ''
let cartItemId1 = 0
let orderGroupId = ''

test.afterAll(async ({ playwright }) => {
  // 중간 실패로 6번이 건너뛰어져도 다음 실행이 깨끗한 장바구니에서 시작하게 한다.
  if (!TOKEN) return
  const request = await playwright.request.newContext()
  try {
    await clearCart(request)
  } finally {
    await request.dispose()
  }
})

test('[LIVE-01] 상품 상세에서 기본형을 담으면 실 POST /carts/items 201과 담김 시트가 뜬다', async ({
  page,
  request,
}) => {
  await clearCart(request)
  await stubSession(page)

  // 상세 제목은 실 BE 상품명으로 찍는다(시드 이름이 바뀌어도 spec이 따라가게).
  const detailRes = await request.get(`${API}/products/${PRODUCT_1}`, { headers: AUTH })
  expect(detailRes.status()).toBe(200)
  product1Name = ((await detailRes.json()) as { data: { name: string } }).data.name
  expect(product1Name.length).toBeGreaterThan(0)

  const optionsRes = await request.get(`${API}/products/${PRODUCT_1}/options`, { headers: AUTH })
  expect(optionsRes.status()).toBe(200)
  const combos = (
    (await optionsRes.json()) as {
      data: {
        optionCombinations: Array<{
          optionCombinationId: number
          name: string
          additionalPrice: number
        }>
      }
    }
  ).data.optionCombinations
  const basic = combos.find(c => c.optionCombinationId === COMBO_1_BASIC)
  expect(basic).toBeTruthy()
  expect(basic!.additionalPrice).toBe(0)
  basicOptionLabel = basic!.name

  await page.goto(`/products/${PRODUCT_1}`)
  await expect(page.getByRole('heading', { name: product1Name })).toBeVisible(SLOW)
  await expect(page.getByText('64,000원').first()).toBeVisible()

  await page.getByRole('button', { name: '장바구니', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('combobox')).toBeVisible(SLOW)
  await sheet.getByRole('combobox').selectOption({ label: basicOptionLabel })
  await expect(sheet.getByText('64,000원')).toBeVisible()

  const added = page.waitForResponse(r => isPost('/carts/items')(r.request()))
  await sheet.getByRole('button', { name: '장바구니 담기' }).click()
  const addedRes = await added
  expect(addedRes.status()).toBe(201)
  const addedBody = (await addedRes.json()) as AddCartItemEnvelope
  expect(addedBody.data).toMatchObject({
    productId: PRODUCT_1,
    optionCombinationId: COMBO_1_BASIC,
    quantity: 1,
    itemStatus: 'ACTIVE',
  })
  cartItemId1 = addedBody.data.cartItemId

  // 담김 시트는 invalidate된 서버 장바구니에서 방금 담은 라인(옵션/수량)을 읽어 보여준다.
  await expect(page.getByText('장바구니에 담았어요')).toBeVisible(SLOW)
  await expect(page.getByText(`${basicOptionLabel} / 수량 1개`)).toBeVisible(SLOW)
  await expect(page.getByRole('button', { name: '장바구니 보기' })).toBeVisible()
  await shot(page, `${SHOTS}/live-01-added-sheet.png`)

  const cart = await readCart(request)
  expect(cartItems(cart).map(i => i.cartItemId)).toEqual([cartItemId1])
})

test('[LIVE-02] 장바구니는 셀러 2그룹·배송비 규칙·합계를 실 응답으로 그리고 PATCH/DELETE가 실제로 반영된다', async ({
  page,
  request,
}) => {
  // 상품 2(멍멍마트)는 API로 미리 담아 둔다 — 셀러 그룹 2개를 만들기 위해.
  const item2 = await addCartItem(request, COMBO_3_CHICKEN)
  const before = await readCart(request)
  const group1 = before.data.sellerGroups.find(g =>
    g.items.some(i => i.optionCombinationId === COMBO_1_BASIC),
  )
  const group2 = before.data.sellerGroups.find(g =>
    g.items.some(i => i.cartItemId === item2.cartItemId),
  )
  expect(group1, '1번에서 담은 기본형 라인의 셀러 그룹').toBeTruthy()
  expect(group2).toBeTruthy()
  expect(group1!.sellerId).not.toBe(group2!.sellerId)
  // 시드 배송 규칙: 냥이상점 3,000/임계 50,000, 멍멍마트 2,500/임계 없음.
  expect([group1!.baseShippingFee, group1!.freeShippingThreshold]).toEqual([3000, 50000])
  expect([group2!.baseShippingFee, group2!.freeShippingThreshold]).toEqual([2500, null])
  store1Name = group1!.storeName
  store2Name = group2!.storeName
  const line1 = group1!.items.find(i => i.optionCombinationId === COMBO_1_BASIC)
  const line2 = group2!.items.find(i => i.cartItemId === item2.cartItemId)
  expect(line1).toBeTruthy()
  expect(line2).toBeTruthy()
  cartItemId1 = line1!.cartItemId
  product1Name = line1!.productName
  const price1 = line1!.price
  const price2 = line2!.price
  expect(price1).toBe(64000)
  expect(price2).toBe(32000)

  await stubSession(page)
  await page.goto('/cart')

  await expect(page.getByRole('checkbox', { name: store1Name })).toBeVisible(SLOW)
  await expect(page.getByRole('checkbox', { name: store2Name })).toBeVisible()
  // 냥이상점 64,000 ≥ 50,000 → 무료배송 pill, 멍멍마트는 임계 없음 → 2,500. 합계 96,000 + 2,500.
  await expect(page.getByText('무료배송')).toBeVisible()
  await expect(page.getByText('2,500원', { exact: true })).toBeVisible()
  await expect(page.getByText(formatKRW(price1 + price2 + 2500)).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '주문하기 (2)' })).toBeEnabled()
  await shot(page, `${SHOTS}/live-02-cart-two-sellers.png`)

  // 상품 1 수량 +1 → 실 PATCH /carts/items/{id} 200 {quantity: 2}.
  const row1 = sellerCard(page, store1Name)
  const patched = page.waitForResponse(
    r => r.request().method() === 'PATCH' && r.url().endsWith(`/carts/items/${cartItemId1}`),
  )
  await row1.getByRole('button', { name: '증가' }).click()
  const patchRes = await patched
  expect(patchRes.status()).toBe(200)
  expect(patchRes.request().postDataJSON()).toEqual({ quantity: 2 })
  const patchBody = (await patchRes.json()) as UpdateCartItemEnvelope
  expect(patchBody.data).toMatchObject({ cartItemId: cartItemId1, quantity: 2, merged: false })
  await expect(row1.getByRole('textbox', { name: '값' })).toHaveValue('2', SLOW)
  await expect(page.getByText(formatKRW(price1 * 2 + price2 + 2500)).first()).toBeVisible(SLOW)
  await shot(page, `${SHOTS}/live-03-cart-quantity.png`)

  // 멍멍마트 라인 해제 → 그 셀러 배송비(2,500) 빠짐 → 배송비 '무료', 합계 128,000.
  await toggleFirstLineCheckbox(page, store2Name)
  await expect(page.getByText('2,500원', { exact: true })).toHaveCount(0)
  await expect(page.getByText('무료', { exact: true })).toBeVisible()
  await expect(page.getByText(formatKRW(price1 * 2)).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '주문하기 (1)' })).toBeEnabled()
  await shot(page, `${SHOTS}/live-04-cart-deselected.png`)

  // 선택을 뒤집어(상품 1 해제·상품 2 선택) 선택 삭제 → 실 DELETE /carts/items {cartItemIds:[상품 2]}.
  await toggleFirstLineCheckbox(page, store1Name)
  await toggleFirstLineCheckbox(page, store2Name)
  await expect(page.getByRole('button', { name: '주문하기 (1)' })).toBeEnabled()
  const deleted = page.waitForResponse(
    r => r.request().method() === 'DELETE' && r.url().endsWith('/carts/items'),
  )
  await page.getByRole('button', { name: '선택 삭제' }).click()
  const deleteRes = await deleted
  expect(deleteRes.status()).toBe(200)
  expect(deleteRes.request().postDataJSON()).toEqual({ cartItemIds: [item2.cartItemId] })
  expect(((await deleteRes.json()) as DeleteCartItemsEnvelope).data).toEqual({ deletedCount: 1 })
  await expect(page.getByRole('checkbox', { name: store2Name })).toHaveCount(0, SLOW)
  await expect(page.getByRole('checkbox', { name: store1Name })).toBeVisible()
  await expect(page.getByText('32,000원', { exact: true })).toHaveCount(0)

  const after = await readCart(request)
  expect(cartItems(after).map(i => [i.cartItemId, i.quantity])).toEqual([[cartItemId1, 2]])
})

test('[LIVE-03/04] 주문서는 기본 배송지·적립금을 보여주고 결제하기가 실 POST /order-groups 201 → prepare 502(60005)를 안내하며, 재클릭(이어서 결제하기)은 주문을 다시 만들지 않는다', async ({
  page,
  request,
}) => {
  const cart = await readCart(request)
  const lines = cartItems(cart)
  expect(lines, '2번이 남긴 상품 1 한 라인').toHaveLength(1)
  const line1 = lines[0]!
  cartItemId1 = line1.cartItemId
  store1Name = cart.data.sellerGroups[0]!.storeName
  const itemsTotal = line1.price * line1.quantity
  const shipping = itemsTotal >= 50000 ? 0 : 3000
  const payable = itemsTotal + shipping - USED_POINT
  const pointsRes = await request.get(`${API}/users/me/points`, { headers: AUTH })
  expect(pointsRes.status()).toBe(200)
  const pointBalance = ((await pointsRes.json()) as { data: { balance: number } }).data.balance
  expect(
    pointBalance,
    '적립금 잔액이 1,000 미만 — seed-live.sql을 다시 넣어 user 1 잔액을 5,000으로 되돌릴 것',
  ).toBeGreaterThanOrEqual(USED_POINT)

  await stubSession(page)
  const orderGroupPosts: Array<{ key: string | undefined; body: CreateOrderGroupRequest }> = []
  page.on('request', r => {
    if (isPost('/order-groups')(r))
      orderGroupPosts.push({
        key: r.headers()['idempotency-key'],
        body: r.postDataJSON() as CreateOrderGroupRequest,
      })
  })
  await page.goto('/checkout')

  // 기본 배송지(시드 1건) + 서버 적립금 잔액(시드 5,000, 실행마다 1,000씩 차감).
  await expect(page.getByText(/010-1234-5678/)).toBeVisible(SLOW)
  await expect(page.getByText('기본', { exact: true })).toBeVisible()
  await expect(page.getByText('서울 강남구 테헤란로 1', { exact: false })).toBeVisible()
  await expect(page.getByText(`보유 ${formatKRW(pointBalance)}`)).toBeVisible(SLOW)
  await expect(page.getByText(`주문 상품 / ${store1Name}`)).toBeVisible()
  await expect(page.getByText('무료', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: `${formatKRW(itemsTotal)} 결제하기` }),
  ).toBeDisabled()

  // 적립금 1,000 입력(blur에서 하한 정규화) → 요약에 -1,000원, 버튼 라벨이 합계−1,000.
  const pointsInput = page.getByRole('textbox')
  await pointsInput.fill(String(USED_POINT))
  await pointsInput.blur()
  await expect(page.getByText(`-${formatKRW(USED_POINT)}`)).toBeVisible()
  const payButton = page.getByRole('button', { name: `${formatKRW(payable)} 결제하기` })
  await expect(payButton).toBeVisible()

  // 결제 수단 카드. DS Radio의 input은 sr-only라 라벨 텍스트를 누른다.
  await page.getByText('신용 / 체크카드').click()
  await expect(page.getByRole('radio', { name: '신용 / 체크카드' })).toBeChecked()
  await page.getByText('주문 내용을 확인했으며 결제에 동의해요').click()
  await expect(payButton).toBeEnabled()
  await shot(page, `${SHOTS}/live-05-checkout-form.png`)

  // 결제하기 → 실 주문 생성 201 → prepare 502/60005.
  const created = page.waitForResponse(r => isPost('/order-groups')(r.request()))
  const prepared = page.waitForResponse(r =>
    isPost(/\/order-groups\/[^/]+\/payment\/prepare$/)(r.request()),
  )
  await payButton.click()
  const createRes = await created
  expect(createRes.status()).toBe(201)
  const createBody = (await createRes.json()) as CreateOrderGroupEnvelope
  orderGroupId = createBody.data.orderGroupId
  expect(orderGroupId).toMatch(/^[0-9A-Z]{26}$/)
  expect(createBody.data).toMatchObject({
    totalProductAmount: itemsTotal,
    totalShippingFee: shipping,
    usedPoint: USED_POINT,
    finalPaymentAmount: payable,
  })
  expect(Date.parse(createBody.data.expiresAt)).toBeGreaterThan(Date.now())
  // 요청: Idempotency-Key 헤더 + 본문 넷.
  expect(orderGroupPosts).toHaveLength(1)
  const firstKey = orderGroupPosts[0]!.key
  expect(firstKey).toBeTruthy()
  expect(firstKey!.trim().length).toBeGreaterThan(0)
  expect(firstKey!.length).toBeLessThanOrEqual(100)
  expect(orderGroupPosts[0]!.body).toEqual({
    cartItemIds: [cartItemId1],
    deliveryAddressId: DELIVERY_ADDRESS_ID,
    usedPoint: USED_POINT,
    expectedFinalAmount: payable,
  })

  const prepareRes = await prepared
  expect(prepareRes.url()).toContain(`/order-groups/${orderGroupId}/payment/prepare`)
  expect(prepareRes.request().postDataJSON()).toMatchObject({ method: 'CARD' })
  expect(prepareRes.status()).toBe(502)
  expect((await prepareRes.json()) as { errorCode: number }).toMatchObject({ errorCode: 60005 })

  // 주문서에 남아 "결제를 시작하지 못했다"는 취지로 안내한다(shared/payment paymentErrorMessage 60005).
  const notice = page.getByText('결제사와 통신하지 못했어요. 잠시 후 다시 시도해 주세요')
  await expect(notice).toBeVisible(SLOW)
  await expect(page).toHaveURL(`${ORIGIN}/checkout`)
  // 주문그룹은 이미 만들어졌으므로 주문서는 "진행 중인 주문" 모드로 바뀐다 — 스냅샷 금액·수단 고정, CTA는 이어서 결제.
  await expect(page.getByText('진행 중인 주문이 있어요')).toBeVisible(SLOW)
  const continueButton = page.getByRole('button', { name: /이어서 결제하기$/ })
  await expect(continueButton).toBeEnabled()
  // 안내 Alert는 주문서 맨 위라 스크롤된 화면에선 뷰포트 밖이다 — 캡처에 담기게 올린다.
  await notice.scrollIntoViewIfNeeded()
  await shot(page, `${SHOTS}/live-06-prepare-failed.png`)

  // [LIVE-04] 같은 주문서에서 결제하기 재클릭 — attempt(sessionStorage)의 만료 전 주문그룹으로 재진입해
  // POST /order-groups 없이 prepare만 다시 나간다(나가더라도 같은 Idempotency-Key여야 한다).
  const attemptRaw = await page.evaluate(() => sessionStorage.getItem('aechak.orderAttempt'))
  expect(attemptRaw).toBeTruthy()
  expect(JSON.parse(attemptRaw!)).toMatchObject({ idempotencyKey: firstKey, orderGroupId })

  const preparedAgain = page.waitForResponse(r =>
    isPost(/\/order-groups\/[^/]+\/payment\/prepare$/)(r.request()),
  )
  await continueButton.click()
  const prepareAgain = await preparedAgain
  expect(prepareAgain.url()).toContain(`/order-groups/${orderGroupId}/payment/prepare`)
  expect(prepareAgain.status()).toBe(502)
  await expect(notice).toBeVisible(SLOW)
  await expect(continueButton).toBeEnabled()
  // 재클릭으로 늘어난 POST가 있다면 전부 같은 키여야 한다(서버가 최초 결과를 재반환).
  expect(orderGroupPosts.length).toBeLessThanOrEqual(2)
  for (const post of orderGroupPosts) expect(post.key).toBe(firstKey)
  await notice.scrollIntoViewIfNeeded()
  await shot(page, `${SHOTS}/live-07-pay-reclick.png`)
})

test('[LIVE-05] 주문 내역은 결제대기 그룹을 빼고 실 GET /order-groups를 그린다(빈 상태 또는 기존 목록, 에러 아님)', async ({
  page,
}) => {
  await stubSession(page)
  // 새 페이지의 첫 요청은 메모리 access가 없어 401 → refresh(스텁) → 재시도다. 재시도 응답을 잡는다.
  const listed = page.waitForResponse(
    r => r.request().method() === 'GET' && /\/order-groups\?/.test(r.url()) && r.status() !== 401,
  )
  await page.goto('/orders')
  const listRes = await listed
  expect(listRes.status()).toBe(200)
  const list = (await listRes.json()) as OrderListEnvelope
  // 방금 만든 결제대기 그룹은 목록에 없다.
  expect(list.data.orderGroups.map(g => g.orderGroupId)).not.toContain(orderGroupId)

  await expect(page.getByText('주문 내역을 불러오지 못했어요')).toHaveCount(0)
  if (list.data.orderGroups.length === 0) {
    await expect(page.getByText('아직 주문 내역이 없어요')).toBeVisible(SLOW)
  } else {
    await expect(page.getByText(`총 ${list.data.totalCount}건`)).toBeVisible(SLOW)
  }
  await shot(page, `${SHOTS}/live-08-orders.png`)
})

test('[LIVE-06] 장바구니를 API로 정리해 다음 실행이 같은 출발점에서 시작한다', async ({
  request,
}) => {
  const removed = await clearCart(request)
  expect(removed).toContain(cartItemId1)
  expect(cartItems(await readCart(request))).toEqual([])
})
