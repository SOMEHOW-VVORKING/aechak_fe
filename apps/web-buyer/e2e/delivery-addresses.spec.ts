import { test, expect, type Page, type Route } from '@playwright/test'
import type {
  AddDeliveryAddressRequest,
  DeliveryAddressListResponse,
  DeliveryAddressResponse,
} from '@aechak/api'

// 배송지 주소록(b10-st-4) ↔ /delivery-addresses 5경로(목록·추가·수정·삭제·기본 지정) 연동 E2E.
// 주문서(checkout.spec)가 목록 조회만 스텁해 왔고 이 화면 자체는 E2E가 없었다 — 기본 유일성·자동
// 승격·개수 한도가 전부 서버 소유라, 버튼이 보이는지가 아니라 **어떤 요청이 나가고 재조회가 무엇을
// 되돌리는지**를 본다.
//
// 스텁 규약(AGENTS.md 6-8): 교차 출처(5175 → 8080) + withCredentials라 fulfill 응답에 정확한 origin과
// Allow-Credentials가 필요하고, PATCH/DELETE와 application/json 본문은 프리플라이트를 부르므로
// OPTIONS 방어가 필수다. 글롭에 origin을 박아 호스트를 가른다 — `**/api/v1/...`로 두면 요청이 seller·
// admin 호스트로 잘못 나가도 같은 스텁이 받아 주어 배포에서만 드러나는 오배치를 놓친다.
const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-e2e-guard'

// Daum 우편번호 스크립트 — 주입한 window.daum이 있으면 한 번도 받으면 안 된다(온디맨드 로더의 once-guard).
const DAUM_SRC_PREFIX = 'https://t1.daumcdn.net/'

async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' })
}

function fulfill(route: Route, status: number, json?: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        // 프리플라이트에서 Authorization은 `*`로 덮이지 않는다(Fetch 스펙) — 이름으로 적는다.
        'Access-Control-Allow-Headers': 'Authorization,Content-Type',
        'Access-Control-Max-Age': '600',
      },
    })
  }
  return json === undefined
    ? route.fulfill({ status, headers: CORS })
    : route.fulfill({ status, headers: CORS, json })
}

// ── 시드 ─────────────────────────────────────────────────────────────────────
function address(overrides: Partial<DeliveryAddressResponse> = {}): DeliveryAddressResponse {
  return {
    addressId: 11,
    receiverName: '김운경',
    contactNumber: '01012345678',
    zipCode: '06236',
    baseAddress: '서울 강남구 테헤란로 123',
    detailAddress: '4층 애착',
    deliveryMemo: '부재 시 문 앞에 놔주세요',
    label: '집',
    isDefault: true,
    ...overrides,
  }
}

const HOME = address()
const OFFICE = address({
  addressId: 12,
  label: '회사',
  receiverName: '신윤지',
  contactNumber: '01098765432',
  zipCode: '04524',
  baseAddress: '서울 중구 세종대로 110',
  detailAddress: '2층',
  deliveryMemo: null,
  isDefault: false,
})

/** 서버는 기본 배송지를 최상단에 올리고 그 아래를 최신 수정순으로 준다(계약). */
function listBody(addresses: DeliveryAddressResponse[]): DeliveryAddressListResponse {
  const sorted = [...addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  return { data: { addresses: sorted, totalCount: sorted.length } }
}

interface Recorded {
  /** 스텁 밖으로 샌 api 호스트 요청 — 0건이어야 한다. */
  leaks: string[]
  /** Daum CDN 요청 — 주입된 window.daum이 있으면 0건이어야 한다. */
  daumHits: string[]
}

/**
 * 세션(refresh 200) + 미스텁 api 경로 감시. 메모리 access가 없는 첫 로드는 401 → refresh를 타므로
 * 회원 시나리오로 고정한다. 감시 스텁을 **먼저** 등록해, 뒤에 등록되는 구체 글롭이 우선권을 갖게 한다
 * (Playwright는 마지막에 등록된 핸들러를 먼저 본다).
 */
async function stubSession(page: Page): Promise<Recorded> {
  const recorded: Recorded = { leaks: [], daumHits: [] }

  await page.route(`${API}/**`, route => {
    recorded.leaks.push(`${route.request().method()} ${route.request().url()}`)
    return fulfill(route, 500, { errorCode: 90000, message: '스텁하지 않은 경로' })
  })
  await page.route(`${API}/auth/web/refresh`, route =>
    fulfill(route, 200, {
      data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 },
    }),
  )
  await page.route(`${DAUM_SRC_PREFIX}**`, route => {
    recorded.daumHits.push(route.request().url())
    return route.abort()
  })
  return recorded
}

const POSTCODE_PICK_LABEL = '테스트 주소 선택'

/**
 * Daum 우편번호 위젯을 주입한다. 실 스크립트를 받으면 외부 iframe에 들어가 조작할 수 없으므로
 * (AGENTS.md: jsdom은 window.daum Mock 주입) 같은 계약의 가짜를 심는다 — embed(container)로 그린
 * 버튼을 누르면 oncomplete가 발화해 화면이 zonecode·roadAddress·buildingName을 폼에 옮긴다.
 */
async function injectDaumPostcode(page: Page) {
  await page.addInitScript(
    ({ pickLabel }) => {
      interface PostcodeData {
        zonecode: string
        roadAddress: string
        jibunAddress: string
        buildingName: string
        apartment: 'Y' | 'N'
      }
      interface PostcodeOptions {
        oncomplete: (data: PostcodeData) => void
      }

      class FakePostcode {
        options: PostcodeOptions

        constructor(options: PostcodeOptions) {
          this.options = options
        }

        embed(element: HTMLElement) {
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = pickLabel
          button.addEventListener('click', () => {
            this.options.oncomplete({
              zonecode: '04524',
              roadAddress: '서울 중구 세종대로 110',
              jibunAddress: '서울 중구 태평로1가 31',
              // 건물명이 있으면 화면이 도로명 뒤에 괄호로 덧붙인다.
              buildingName: '서울시청',
              apartment: 'N',
            })
          })
          element.replaceChildren(button)
        }
      }

      ;(
        window as unknown as {
          daum?: { Postcode: new (options: PostcodeOptions) => { embed: (el: HTMLElement) => void } }
        }
      ).daum = { Postcode: FakePostcode }
    },
    { pickLabel: POSTCODE_PICK_LABEL },
  )
}

interface ListStub {
  /** GET /delivery-addresses 응답 순서 — 호출마다 다음 항목을 쓰고, 마지막은 반복한다. */
  snapshots: DeliveryAddressResponse[][]
}

interface ListCalls {
  count: number
}

/** 목록 조회를 스냅샷 수열로 스텁한다(mutation 성공 → invalidate → 다음 스냅샷). */
async function stubList(page: Page, { snapshots }: ListStub): Promise<ListCalls> {
  const calls: ListCalls = { count: 0 }
  await page.route(`${API}/delivery-addresses`, route => {
    if (route.request().method() !== 'GET') return route.fallback()
    const index = Math.min(calls.count, snapshots.length - 1)
    calls.count += 1
    return fulfill(route, 200, listBody(snapshots[index] ?? []))
  })
  return calls
}

// ── 1. 추가: 주소 검색 → 저장 → 재조회 ─────────────────────────────────────────
test('[AC-ADDR-E2E-001] 우편번호 검색으로 채운 폼이 POST로 정규화돼 나가고 재조회가 새 배송지를 올린다', async ({
  page,
}) => {
  const recorded = await stubSession(page)
  await injectDaumPostcode(page)
  const list = await stubList(page, { snapshots: [[HOME], [HOME, { ...OFFICE, isDefault: true }]] })

  const posted: AddDeliveryAddressRequest[] = []
  await page.route(`${API}/delivery-addresses`, route => {
    if (route.request().method() !== 'POST') return route.fallback()
    posted.push(route.request().postDataJSON() as AddDeliveryAddressRequest)
    return fulfill(route, 201, { data: { addressId: 12, isDefault: true, totalCount: 2 } })
  })

  await page.goto('/addresses')
  await expect(page.getByText('등록된 배송지')).toBeVisible()
  await expect(page.getByText('1/10')).toBeVisible()
  await expect(page.getByText('기본', { exact: true })).toBeVisible()
  // 저장된 숫자열을 화면이 조립해 보여준다(서버는 숫자만 저장한다).
  await expect(page.getByText('김운경 / 010-1234-5678')).toBeVisible()
  await shot(page, 'addr-01-list')

  await page.getByRole('button', { name: '배송지 추가' }).click()
  // 목록의 추가 버튼과 폼 제목이 같은 문구라, 폼 진입은 저장 버튼의 유무로 판정한다.
  await expect(page.getByRole('button', { name: '저장' })).toBeVisible()
  // 이미 등록된 배송지가 있으니 첫 배송지 안내는 없고 기본 지정 체크박스가 열려 있다.
  await expect(page.getByText('첫 배송지는 기본 배송지로 지정돼요')).toHaveCount(0)
  // 주소를 고르기 전에는 저장이 잠겨 있다 — 우편번호/기본 주소는 검색으로만 채워진다.
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()

  await page.getByLabel('받는 사람').fill('  신윤지  ')
  // 구분자는 입력 단계에서 걷어내 숫자만 남는다(서버 normalizeContactNumber와 같은 규칙).
  await page.getByLabel('휴대폰 번호').fill('010-9876-5432')
  await expect(page.getByLabel('휴대폰 번호')).toHaveValue('01098765432')

  await page.getByRole('button', { name: '우편번호 검색' }).click()
  await page.getByRole('button', { name: POSTCODE_PICK_LABEL }).click()
  // 시트가 닫히고 우편번호·기본 주소가 폼에 옮겨진다(건물명은 괄호로 덧붙는다).
  await expect(page.getByPlaceholder('우편번호')).toHaveValue('04524')
  await expect(page.getByPlaceholder('기본 주소')).toHaveValue('서울 중구 세종대로 110 (서울시청)')

  await page.getByPlaceholder('상세 주소를 입력해주세요').fill(' 2층 ')
  await page.getByLabel('배송지 이름 (선택)').fill('회사')
  // DS Checkbox의 <input>은 sr-only — 라벨 텍스트를 누른다(AGENTS.md 7절).
  await page.getByText('기본 배송지로 설정').click()
  await shot(page, 'addr-02-form-filled')

  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0)

  // 와이어 필드명은 BE 계약 그대로이고, 앞뒤 공백은 걷어서 보낸다(BE는 trim하지 않는다).
  expect(posted).toHaveLength(1)
  expect(posted[0]).toEqual({
    receiverName: '신윤지',
    contactNumber: '01098765432',
    zipCode: '04524',
    baseAddress: '서울 중구 세종대로 110 (서울시청)',
    detailAddress: '2층',
    deliveryMemo: undefined,
    label: '회사',
    isDefault: true,
  })

  // 201 본문(addressId·isDefault)을 낙관적으로 그리지 않고 재조회 결과로 반영한다.
  await expect(page.getByText('2/10')).toBeVisible()
  await expect(page.getByText('신윤지 / 010-9876-5432')).toBeVisible()
  expect(list.count).toBeGreaterThanOrEqual(2)
  expect(recorded.leaks).toEqual([])
  // 주입한 window.daum이 있으면 외부 스크립트를 받지 않는다.
  expect(recorded.daumHits).toEqual([])
  await shot(page, 'addr-03-list-after-add')
})

// ── 2. 같은 저장을 두 번 눌러도 요청은 한 번 ───────────────────────────────────
test('[AC-ADDR-E2E-002] 저장 중에는 저장이 잠겨, 다시 눌러도 POST가 두 번 나가지 않는다', async ({
  page,
}) => {
  const recorded = await stubSession(page)
  await injectDaumPostcode(page)
  await stubList(page, { snapshots: [[], [HOME]] })

  // 초기값을 둔다 — Promise 실행자 안의 대입을 제어 흐름 분석이 못 보고 never로 좁히기 때문이다.
  let release: () => void = () => {}
  const inFlight = new Promise<void>(resolve => {
    release = resolve
  })
  let postCount = 0
  await page.route(`${API}/delivery-addresses`, async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    postCount += 1
    // 응답을 붙들어 전송 중 구간을 만든다.
    await inFlight
    return fulfill(route, 201, { data: { addressId: 11, isDefault: true, totalCount: 1 } })
  })

  await page.goto('/addresses')
  // 등록된 배송지가 없으면 빈 상태의 추가 버튼이 유일한 진입이다.
  await expect(page.getByText('등록된 배송지가 없어요')).toBeVisible()
  await page.getByRole('button', { name: '배송지 추가' }).click()

  // 첫 배송지는 서버가 기본으로 만들기 때문에 체크박스가 켜진 채 잠겨 있다.
  await expect(page.getByText('첫 배송지는 기본 배송지로 지정돼요')).toBeVisible()
  await page.getByLabel('받는 사람').fill('김운경')
  await page.getByLabel('휴대폰 번호').fill('01012345678')
  await page.getByRole('button', { name: '우편번호 검색' }).click()
  await page.getByRole('button', { name: POSTCODE_PICK_LABEL }).click()
  await page.getByPlaceholder('상세 주소를 입력해주세요').fill('4층 애착')

  const save = page.getByRole('button', { name: '저장' })
  // 요청이 스텁 핸들러에 도착한 것까지 기다린다 — 버튼이 disabled로 바뀌는 것은 mutation이
  // 시작됐다는 뜻일 뿐, Node 쪽 핸들러가 이미 돌았다는 보장이 아니다(경합).
  const firstPost = page.waitForRequest(
    request => request.method() === 'POST' && request.url().endsWith('/delivery-addresses'),
  )
  await save.click()
  await firstPost
  // 전송 중에는 버튼이 잠긴다 — 잠긴 버튼은 강제로 눌러도 click 이벤트가 발화하지 않는다.
  await expect(save).toBeDisabled()
  await save.click({ force: true })
  await save.click({ force: true })
  expect(postCount).toBe(1)

  release()
  await expect(page.getByText('등록된 배송지')).toBeVisible()
  await expect(page.getByText('1/10')).toBeVisible()
  // 전송이 끝난 뒤에도 재시도로 한 건이 더 생기지 않는다.
  expect(postCount).toBe(1)
  expect(recorded.leaks).toEqual([])
})

// ── 3. 기본 지정 ──────────────────────────────────────────────────────────────
test('[AC-ADDR-E2E-003] 기본 배송지로 설정은 /default를 부르고 재조회가 기본을 옮긴다', async ({
  page,
}) => {
  const recorded = await stubSession(page)
  await stubList(page, {
    snapshots: [
      [HOME, OFFICE],
      [{ ...HOME, isDefault: false }, { ...OFFICE, isDefault: true }],
    ],
  })

  const defaultCalls: string[] = []
  await page.route(`${API}/delivery-addresses/*/default`, route => {
    if (route.request().method() === 'OPTIONS') return fulfill(route, 204)
    defaultCalls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return fulfill(route, 200, { data: { addressId: OFFICE.addressId, isDefault: true } })
  })

  // 카드 머리말(별칭). 순서 있는 단언이라 서버가 정한 정렬이 화면에 그대로 닿았는지 보인다.
  const cardLabels = page.getByText(/^(집|회사)$/)

  await page.goto('/addresses')
  // 서버가 기본을 최상단에 올린다 — 집이 먼저다.
  await expect(cardLabels).toHaveText(['집', '회사'])
  // 기본이 아닌 카드에만 설정 버튼이 뜬다 — 두 건 중 하나뿐이다.
  const setDefault = page.getByRole('button', { name: '기본 배송지로 설정' })
  await expect(setDefault).toHaveCount(1)
  await shot(page, 'addr-04-two-addresses')

  await setDefault.click()
  // 서버가 유일성을 소유하므로 낙관적 갱신 없이 재조회 결과를 기다린다 — 기본이 옮겨가면
  // 정렬도 함께 뒤집혀야 한다(화면이 제 손으로 pill만 옮기면 이 단언이 깨진다).
  await expect(cardLabels).toHaveText(['회사', '집'])
  expect(defaultCalls).toEqual([`PATCH /api/v1/delivery-addresses/${OFFICE.addressId}/default`])
  // 기본은 언제나 하나이고, 이제 설정 버튼은 집 카드에 있다.
  await expect(page.getByText('기본', { exact: true })).toHaveCount(1)
  await expect(setDefault).toHaveCount(1)
  expect(recorded.leaks).toEqual([])
})

// ── 4. 삭제와 자동 승격 ───────────────────────────────────────────────────────
test('[AC-ADDR-E2E-004] 기본 배송지 삭제는 확인 Modal을 거치고 서버가 승격한 배송지를 알려준다', async ({
  page,
}) => {
  const recorded = await stubSession(page)
  await stubList(page, { snapshots: [[HOME, OFFICE], [{ ...OFFICE, isDefault: true }]] })

  const deleted: string[] = []
  await page.route(`${API}/delivery-addresses/*`, route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfill(route, 204)
    if (method !== 'DELETE') return route.fallback()
    deleted.push(new URL(route.request().url()).pathname)
    // 기본을 지우면 서버가 남은 하나를 승격하고 그 id를 돌려준다.
    return fulfill(route, 200, { data: { promotedDefaultAddressId: OFFICE.addressId } })
  })

  await page.goto('/addresses')
  await expect(page.getByRole('button', { name: '삭제' })).toHaveCount(2)
  // 서버가 기본을 최상단에 올리므로 첫 카드가 기본(집)이다 — DELETE 경로의 id가 그 증거다.
  await page.getByRole('button', { name: '삭제' }).first().click()

  await expect(page.getByText('이 배송지를 삭제할까요?')).toBeVisible()
  await expect(page.getByText(/기본 배송지를 삭제하면 다른 배송지가 기본으로 지정돼요/)).toBeVisible()
  // 확인 전에는 요청이 나가지 않는다.
  expect(deleted).toEqual([])
  await shot(page, 'addr-05-delete-confirm')

  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click()
  // 승격은 서버 판정이라 화면이 추측하지 않고 응답의 id로 이름을 찾아 알린다. 기록은 토스트가
  // 뜬 뒤에 읽는다 — click() 직후에 읽으면 요청이 아직 핸들러에 닿지 않았을 수 있다.
  await expect(page.getByText("'회사' 배송지가 기본으로 설정됐어요")).toBeVisible()
  expect(deleted).toEqual([`/api/v1/delivery-addresses/${HOME.addressId}`])
  await expect(page.getByText('1/10')).toBeVisible()
  await expect(page.getByText('집')).toHaveCount(0)
  expect(recorded.leaks).toEqual([])
  await shot(page, 'addr-06-after-delete')
})

// ── 5. 수정은 전체 덮어쓰기 ───────────────────────────────────────────────────
test('[AC-ADDR-E2E-005] 수정은 PATCH로 유지할 값까지 전부 싣는다(전체 덮어쓰기 계약)', async ({
  page,
}) => {
  const recorded = await stubSession(page)
  await stubList(page, {
    snapshots: [[HOME], [{ ...HOME, detailAddress: '5층 애착', deliveryMemo: null }]],
  })

  const patched: { path: string; body: AddDeliveryAddressRequest }[] = []
  await page.route(`${API}/delivery-addresses/*`, route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfill(route, 204)
    if (method !== 'PATCH') return route.fallback()
    patched.push({
      path: new URL(route.request().url()).pathname,
      body: route.request().postDataJSON() as AddDeliveryAddressRequest,
    })
    return fulfill(route, 200, { data: { addressId: HOME.addressId, isDefault: true } })
  })

  await page.goto('/addresses')
  await page.getByRole('button', { name: '수정' }).click()
  await expect(page.getByText('배송지 수정')).toBeVisible()
  // 폼은 서버 값으로 시드된다 — 계좌 같은 마스킹 필드가 없어 재입력 요구가 없다.
  await expect(page.getByLabel('받는 사람')).toHaveValue('김운경')
  await expect(page.getByPlaceholder('우편번호')).toHaveValue('06236')
  await expect(page.getByLabel('배송 요청사항')).toHaveValue('부재 시 문 앞에 놔주세요')

  await page.getByPlaceholder('상세 주소를 입력해주세요').fill('5층 애착')
  // 선택 필드를 비우면 키째 빠져 나가 서버에서 소거된다.
  await page.getByLabel('배송 요청사항').fill('')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('배송지 수정')).toHaveCount(0)

  expect(patched).toHaveLength(1)
  expect(patched[0]?.path).toBe(`/api/v1/delivery-addresses/${HOME.addressId}`)
  expect(patched[0]?.body).toEqual({
    receiverName: '김운경',
    contactNumber: '01012345678',
    zipCode: '06236',
    baseAddress: '서울 강남구 테헤란로 123',
    detailAddress: '5층 애착',
    deliveryMemo: undefined,
    label: '집',
    isDefault: true,
  })
  await expect(page.getByText('서울 강남구 테헤란로 123 5층 애착')).toBeVisible()
  expect(recorded.leaks).toEqual([])
})

// ── 6. 개수 한도는 서버 판정 ──────────────────────────────────────────────────
test('[AC-ADDR-E2E-006] 10건 한도 안내가 뜨고, 422/30500은 폼을 닫지 않고 사유를 알린다', async ({
  page,
}) => {
  const recorded = await stubSession(page)
  await injectDaumPostcode(page)
  const full = Array.from({ length: 10 }, (_, index) =>
    address({ addressId: 100 + index, label: `주소${index}`, isDefault: index === 0 }),
  )
  await stubList(page, { snapshots: [full] })

  let postCount = 0
  await page.route(`${API}/delivery-addresses`, route => {
    if (route.request().method() !== 'POST') return route.fallback()
    postCount += 1
    return fulfill(route, 422, { errorCode: 30500, message: '배송지는 최대 10개까지 등록 가능합니다.' })
  })

  await page.goto('/addresses')
  await expect(page.getByText('10/10')).toBeVisible()
  await expect(page.getByText('배송지는 최대 10개까지 등록할 수 있어요')).toBeVisible()
  await shot(page, 'addr-07-at-limit')

  // 한도 판정은 서버 소유라 화면은 추가 진입 자체를 막지 않는다 — 거절 사유를 보여 줘야 한다.
  await page.getByRole('button', { name: '배송지 추가' }).click()
  await page.getByLabel('받는 사람').fill('김재헌')
  await page.getByLabel('휴대폰 번호').fill('01055556666')
  await page.getByRole('button', { name: '우편번호 검색' }).click()
  await page.getByRole('button', { name: POSTCODE_PICK_LABEL }).click()
  await page.getByPlaceholder('상세 주소를 입력해주세요').fill('101호')
  await page.getByRole('button', { name: '저장' }).click()

  // 실패해도 폼은 열린 채 남아 입력이 사라지지 않는다. 기록 배열은 **화면에 결과가 닿은 뒤**
  // 읽는다 — click()은 브라우저 이벤트까지만 보장해, 바로 읽으면 정상 구현에서도 0건일 수 있다.
  await expect(page.getByText('배송지는 최대 10개까지 등록할 수 있어요').last()).toBeVisible()
  expect(postCount).toBe(1)
  await expect(page.getByLabel('받는 사람')).toHaveValue('김재헌')
  await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()
  expect(recorded.leaks).toEqual([])
  await shot(page, 'addr-08-limit-rejected')
})

// ── 7. 조회 실패는 빈 상태와 구분된다 ─────────────────────────────────────────
test('[AC-ADDR-E2E-007] 목록 조회 500은 빈 상태가 아니라 다시 시도가 있는 오류 안내다', async ({
  page,
}) => {
  const recorded = await stubSession(page)
  // QueryClient가 retry:1이라 첫 조회는 두 번 나간다 — 한 번만 떨어뜨리면 자동 재시도가
  // 성공해 오류 화면이 뜨지 않는다(이 지점에서 처음 틀렸다).
  const AUTO_ATTEMPTS = 2
  let getCount = 0
  await page.route(`${API}/delivery-addresses`, route => {
    if (route.request().method() !== 'GET') return route.fallback()
    getCount += 1
    return getCount <= AUTO_ATTEMPTS
      ? fulfill(route, 500, { errorCode: 90000, message: 'server error' })
      : fulfill(route, 200, listBody([HOME]))
  })

  await page.goto('/addresses')
  await expect(page.getByText('배송지를 불러오지 못했어요')).toBeVisible()
  // "데이터 없음"과 섞이면 운영 중 원인을 가릴 수 없다.
  await expect(page.getByText('등록된 배송지가 없어요')).toHaveCount(0)
  await shot(page, 'addr-09-load-error')

  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('1/10')).toBeVisible()
  await expect(page.getByText('배송지를 불러오지 못했어요')).toHaveCount(0)
  expect(recorded.leaks).toEqual([])
})

// ── 8. 메뉴에서 닿는 길이 살아 있는지 ────────────────────────────────────────
test('[AC-ADDR-E2E-008] 마이 탭 5탭과 허브 메뉴가 그대로 있고, 배송지 주소록 행이 /addresses로 간다', async ({
  page,
}) => {
  // 이 화면의 **유일한 진입점**은 마이 허브 메뉴 행이다. 화면이 멀쩡해도 그 행이 빠지거나 다른
  // 라우트로 걸리면 운영에서는 "화면이 사라진" 것과 같다 — 경로로 바로 열면 그걸 못 잡는다.
  const recorded = await stubSession(page)
  await stubList(page, { snapshots: [[HOME]] })

  await page.route(`${API}/users/me`, route =>
    fulfill(route, 200, {
      data: {
        status: 'ACTIVE',
        nickname: '김운경',
        profileImageUrl: null,
        profileImageKey: null,
        bio: null,
        email: 'buyer@aechak.test',
        phoneNumber: '010-****-5678',
        isPhoneVerified: true,
      },
    }),
  )
  await page.route(`${API}/users/me/points`, route => fulfill(route, 200, { data: { balance: 3200 } }))

  await page.goto('/mypage')

  // 5탭 구조와 순서 — 탭이 빠지거나 중복되면 여기서 깨진다(라벨은 버튼 안 텍스트로 렌더된다).
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveText(['홈', '마켓', 'SNS', '채팅', '마이'])
  await expect(page.getByRole('tab', { name: '마이' })).toHaveAttribute('aria-selected', 'true')
  await shot(page, 'addr-10-mypage-hub')

  // 허브 메뉴는 한 벌뿐이어야 한다 — 같은 행이 두 번 그려지면 중복 진입점이다. 행의 접근 이름은
  // 제목 + trailing을 합친 것이라(본인 인증은 '본인 인증 인증완료') 부분 일치로 잡는다.
  for (const label of ['주문 내역', '찜 목록', '상품 리뷰', '배송지 주소록', '펫 프로필 관리', '본인 인증', '회원 탈퇴']) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(1)
  }
  // 그 trailing이 서버 값이다 — 인증 상태가 pill로 붙는다.
  await expect(page.getByRole('button', { name: '본인 인증 인증완료' })).toHaveCount(1)
  // '설정'은 둘이 정상이다 — AppBar 액션(aria-label)과 메뉴 행. 하나로 줄면 한쪽이 사라진 것이다.
  await expect(page.getByRole('button', { name: '설정', exact: true })).toHaveCount(2)
  // 컷된 메뉴와 아직 안 연 SNS 진입점은 되살아나면 안 된다(SNS_SERVER_AVAILABLE=false).
  for (const cut of ['쿠폰', '최근 본 상품', '고객센터', '내 SNS 프로필', '차단/뮤트 관리']) {
    await expect(page.getByRole('button', { name: cut })).toHaveCount(0)
  }

  await page.getByRole('button', { name: '배송지 주소록', exact: true }).click()
  await expect(page).toHaveURL(/\/addresses$/)
  await expect(page.getByText('등록된 배송지')).toBeVisible()
  await expect(page.getByText('1/10')).toBeVisible()
  // /addresses는 _tabs 바깥이라 탭바가 따라오면 안 된다(라우트 파일이 _tabs/ 밑에 잘못 들어간 신호).
  await expect(page.getByRole('tab')).toHaveCount(0)
  expect(recorded.leaks).toEqual([])
})
