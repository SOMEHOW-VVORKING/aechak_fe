import { test, expect, type Page, type Route } from '@playwright/test'

// 펫 폼 품종 Select ↔ breeds API 연동 E2E(web-buyer 첫 Playwright spec).
// 실백엔드 없이 page.route 스텁으로 서버 계약을 재현한다. 페이지(5175) → API(8080)가 교차
// 출처 + withCredentials라서, fulfill 응답에도 CORS 헤더(정확한 origin, 와일드카드 불가)를
// 넣어야 브라우저가 응답을 페이지에 전달한다.

// 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서 온다 — withCredentials라 fulfill 응답의
// Access-Control-Allow-Origin이 실제 origin과 한 글자도 달라선 안 되므로 두 곳이 같은 값을 읽는다.
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

function fulfillJson(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    // 프리플라이트 방어 응답(헤더 조합이 바뀌어도 깨지지 않게)
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }
  return route.fulfill({ status, headers: CORS, json })
}

interface PetRow {
  petId: number
  species: 'DOG' | 'CAT'
  name: string
  breedId: number
  breedLabel: string
  birthYearMonth: string | null
  weight: number | null
  profileImageKey: string | null
  isDefault: boolean
  status: 'ACTIVE'
  version: number
}

/**
 * 펫 목록·등록을 상태 있게 스텁한다. 등록 후 목록으로 돌아가 방금 만든 펫이 보이는지가
 * 이 시나리오의 핵심이라, 응답을 고정값으로 두면 저장이 실제로 나갔는지 확인할 수 없다.
 */
async function stubPets(page: Page, labelOf: (id: number) => string) {
  const rows: PetRow[] = []
  let seq = 0

  await page.route('**/api/v1/users/me/pets', async route => {
    const method = route.request().method()
    if (method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      seq += 1
      const breedId = Number(body['breedId'])
      // 서버는 첫 펫을 요청값과 무관하게 대표로 만든다.
      const isDefault = body['isDefault'] === true || rows.length === 0
      const row: PetRow = {
        petId: seq,
        species: speciesOf(breedId),
        name: String(body['name']),
        breedId,
        breedLabel: labelOf(breedId),
        birthYearMonth: (body['birthYearMonth'] as string | undefined) ?? null,
        weight: (body['weight'] as number | undefined) ?? null,
        profileImageKey: (body['profileImageKey'] as string | undefined) ?? null,
        isDefault,
        status: 'ACTIVE',
        version: 0,
      }
      rows.push(row)
      return fulfillJson(route, 201, { data: { ...row, userId: 1 } })
    }
    return fulfillJson(route, 200, { data: { pets: rows } })
  })
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

const ALL_BREEDS = [...BREEDS.DOG.data, ...BREEDS.CAT.data]

// 서버는 species를 breed에서 파생시킨다. 요청에 실리지 않으므로 breedId로 되짚는다.
function speciesOf(breedId: number): 'DOG' | 'CAT' {
  return BREEDS.CAT.data.some(b => b.breedId === breedId) ? 'CAT' : 'DOG'
}
const labelOf = (id: number) => ALL_BREEDS.find(b => b.breedId === id)?.label ?? '알 수 없음'

test('[AC-PET-BREEDS-E2E-001] 새 펫: 강아지 전환 → API 품종 선택 → 저장 → 목록 메타 노출', async ({ page }) => {
  await page.route('**/api/v1/breeds**', route =>
    fulfillJson(
      route,
      200,
      new URL(route.request().url()).searchParams.get('species') === 'DOG' ? BREEDS.DOG : BREEDS.CAT,
    ),
  )
  await stubPets(page, labelOf)

  await page.goto('/mypage/pets/new')
  await page.getByRole('tab', { name: '강아지' }).click()
  await page.getByLabel('이름').fill('탄이')
  // 푸들은 DOG 응답에만 있다. 선택이 되면 species=DOG 파라미터 분기까지 검증된 것.
  await page.getByLabel('품종').selectOption({ label: '푸들' })
  await page.getByRole('button', { name: '저장' }).click()

  await expect(page).toHaveURL(/\/mypage\/pets$/)
  // 목록은 이제 서버 응답이라, 이 문구가 보이면 POST가 실제로 나가고 GET이 그걸 읽어온 것이다.
  await expect(page.getByText('강아지 / 푸들', { exact: true })).toBeVisible()
})

test('[AC-PET-BREEDS-E2E-003] 품종을 안 고르면 저장이 막힌다', async ({ page }) => {
  // 품종은 서버 필수 계약이라 미선택 저장은 400이다. 눌리기 전에 막는 게 맞는 동작.
  await page.route('**/api/v1/breeds**', route => fulfillJson(route, 200, BREEDS.CAT))
  await stubPets(page, labelOf)

  await page.goto('/mypage/pets/new')
  await page.getByLabel('이름').fill('초코')
  await expect(page.getByLabel('품종')).toBeEnabled() // 목록 로드 대기

  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
})

test('[AC-PET-BREEDS-E2E-002] 세션 없이 진입하면(401 → refresh 실패) 로그인 화면으로 튕긴다', async ({ page }) => {
  await page.route('**/api/v1/breeds**', route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '로그인이 필요합니다.' }),
  )
  // 401을 받은 인터셉터가 refresh를 시도한다. 성공으로 새면 안 튕기므로 refresh도 401 고정.
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '인증이 필요합니다.' }),
  )

  await page.goto('/mypage/pets/new')
  // 전역 onAuthExpired(main.tsx)가 로그인으로 보낸다. 인라인 에러가 아니라 화면 자체가 바뀐다.
  await expect(page).toHaveURL(/\/onboarding\/login$/)
  await expect(page.getByRole('button', { name: '카카오 로그인' })).toBeVisible()
})
