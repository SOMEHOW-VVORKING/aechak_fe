import { test, expect, type Page } from '@playwright/test'

// 셀러 상품 등록 → 목록 반영 → 판매 상태/재고/삭제 E2E (SCRUM-119/120).
// 상품 화면은 아직 실연동 전이라 BE(origin/develop) 계약/규칙을 따르는 메모리 목업(products.mock.ts)으로
// 돈다 — HTTP가 없으니 page.route 스텁도 없다. 목업은 새로고침하면 시드로 돌아가므로 첫 goto 이후엔
// SPA 내비게이션만 쓴다. 삭제와 임시저장은 BE 엔드포인트가 없는 목업 전용 기능이다.

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test.use({ viewport: { width: 1440, height: 900 } })

// PR 첨부용 캡처(test-results는 gitignore). dev 전용 Query Devtools 버튼이 찍히지 않게 숨긴다.
async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `test-results/pr-c/${name}.png`, animations: 'disabled' })
}

async function openNewProductForm(page: Page) {
  await page.goto('/products')
  await page.getByRole('button', { name: '상품 등록' }).click()
  await expect(page.getByRole('heading', { name: '상품 등록' })).toBeVisible()
}

test('[AC-SPRD-E2E-001] 상품 등록 → 목록 맨 앞 판매중 → 재고 수정/판매 중지/삭제', async ({ page }) => {
  const name = 'E2E 원목 스크래쳐'
  await openNewProductForm(page)

  // 빈 폼 제출 — 첫 누락 필드(상품명)로 스크롤/포커스 + 안내 말풍선(CRQ-PRD-02).
  await page.getByRole('button', { name: '등록하기' }).click()
  await expect(page.getByRole('tooltip')).toHaveText('상품명을 입력해 주세요')
  const nameInput = page.getByLabel('상품명')
  await expect(nameInput).toBeFocused()
  await expect(nameInput).toBeInViewport()
  await shot(page, '03-form-required-tooltip')

  await nameInput.fill(name)
  await page.getByLabel('대분류').selectOption({ label: '고양이' })
  await page.getByLabel('중분류').selectOption({ label: '식기/급수기' })
  await page.getByLabel('소분류').selectOption({ label: '자동 급식기' })
  await page.getByLabel('정가').fill('30000')
  await page
    .getByRole('group', { name: '대표 썸네일' })
    .locator('input[type=file]')
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG_1X1 })
  await page.getByLabel('재고', { exact: true }).fill('10')
  await page.getByRole('button', { name: '등록하기' }).click()

  // 완료 알림은 state로 옮기고 saved 파라미터는 바로 지운다.
  await expect(page).toHaveURL(/\/products$/)
  await expect(page.getByText('상품을 등록했어요.')).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: name })
  await expect(page.getByRole('row').nth(1)).toContainText(name)
  await expect(row.getByText('판매중', { exact: true })).toBeVisible()
  await shot(page, '01-list-after-register')

  // 옵션 없는 상품의 기본 조합 재고를 0으로(증감 -10) → 자동 품절(CRQ-PRD-06). BE는 커밋 후 비동기로
  // 품절을 반영하므로 저장 직후가 아니라 지연 재조회 뒤에 보인다(toBeVisible 재시도 대기).
  await row.getByRole('button', { name: `${name} 재고 10개 수정` }).click()
  const drawer = page.getByRole('dialog', { name: '옵션별 재고' })
  await drawer.getByLabel('기본 재고', { exact: true }).fill('0')
  await drawer.getByRole('button', { name: '기본 재고 저장' }).click()
  await expect(page.getByText('재고를 저장했어요.')).toBeVisible()
  await expect(row.getByText('품절', { exact: true })).toBeVisible()
  await shot(page, '02-inventory-drawer')
  await page.keyboard.press('Escape')

  // 판매 토글 끄기 → 확인 Modal → 판매 중지.
  await row.getByRole('switch', { name: `${name} 판매` }).click()
  const suspend = page.getByRole('dialog', { name: '판매를 중지할까요?' })
  await expect(suspend).toBeVisible()
  await shot(page, '06-suspend-confirm-modal')
  await suspend.getByRole('button', { name: '판매 중지' }).click()
  await expect(row.getByText('판매 중지', { exact: true })).toBeVisible()

  // 삭제(목업 전용).
  await row.getByRole('button', { name: '삭제' }).click()
  await page.getByRole('dialog', { name: '상품을 삭제할까요?' }).getByRole('button', { name: '삭제' }).click()
  await expect(page.getByText('상품을 삭제했어요.')).toBeVisible()
  await expect(row).toHaveCount(0)
})

test('[AC-SPRD-E2E-002] 임시저장 → 목록 임시저장 수 증가 → 이어쓰기에 값이 채워진다', async ({ page }) => {
  const name = 'E2E 캣닢 쿠션'
  await openNewProductForm(page)

  await page.getByLabel('상품명').fill(name)
  await page.getByRole('button', { name: '임시저장' }).click()
  await expect(page.getByText('임시저장했어요.')).toBeVisible()
  await expect(page).toHaveURL(/draftId=/)

  await page.getByRole('button', { name: '상품 관리' }).click()
  await page.getByRole('button', { name: '임시저장 3' }).click()
  const drafts = page.getByRole('dialog', { name: '임시저장한 상품' })
  await expect(drafts.getByText(name)).toBeVisible()
  await shot(page, '07-draft-drawer')
  await drafts.getByText(name).click()

  await expect(page.getByRole('heading', { name: '상품 등록' })).toBeVisible()
  await expect(page.getByLabel('상품명')).toHaveValue(name)
})

test('[AC-SPRD-E2E-003] 판매 상태 필터 → 수정 화면은 옵션/재고 읽기 전용 → 정가 수정이 목록에 반영된다', async ({ page }) => {
  const name = '고양이 자동 급식기 스마트 5L'
  await page.goto('/products')

  await page.getByRole('combobox', { name: '판매 상태' }).selectOption({ label: '판매 중지' })
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('row').nth(1)).toContainText('산책 하네스 세트')
  await page.getByRole('button', { name: '초기화' }).click()

  const row = page.getByRole('row').filter({ hasText: name })
  await row.getByRole('button', { name: '수정', exact: true }).click()
  await expect(page.getByRole('heading', { name: '상품 수정' })).toBeVisible()
  await expect(page.getByLabel('상품명')).toHaveValue(name)
  await expect(page.getByRole('cell', { name: '화이트' })).toBeVisible()
  await expect(page.getByText(/상품 목록의 재고 버튼에서/)).toBeVisible()
  await expect(page.getByRole('switch', { name: '옵션 사용' })).toHaveCount(0)
  await page.getByRole('cell', { name: '화이트' }).scrollIntoViewIfNeeded()
  await shot(page, '05-edit-readonly-options')

  await page.getByLabel('정가').fill('70000')
  await page.getByRole('button', { name: '수정 완료' }).click()
  await expect(page.getByText('상품을 수정했어요.')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: name })).toContainText('70,000원')
})

test('[AC-SPRD-E2E-004] 옵션 그룹 두 개를 만들면 조합 매트릭스가 곱집합으로 생긴다', async ({ page }) => {
  await openNewProductForm(page)

  await page.getByRole('switch', { name: '옵션 사용' }).click()
  const groups = [
    { name: '색상', values: ['화이트', '블랙'] },
    { name: '용량', values: ['3L', '5L'] },
  ]
  for (const [i, group] of groups.entries()) {
    if (i > 0) await page.getByRole('button', { name: '옵션 추가' }).click()
    await page.getByLabel(`옵션명 ${i + 1}`).fill(group.name)
    for (const value of group.values) {
      await page.getByLabel(`옵션값 ${i + 1} 입력`).fill(value)
      await page.getByLabel(`옵션값 ${i + 1} 입력`).press('Enter')
    }
  }

  await expect(page.getByText('조합 옵션 / 4개 조합')).toBeVisible()
  await page.getByLabel('화이트 / 5L 추가 금액').fill('3000')
  await page.getByLabel('화이트 / 5L 재고').fill('12')
  await page.getByLabel('화이트 / 5L 재고').scrollIntoViewIfNeeded()
  await shot(page, '04-option-combination-matrix')
})
