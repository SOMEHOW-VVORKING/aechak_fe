import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_APPLICATIONS_URL,
  ADMIN_PRODUCTS_URL,
  ADMIN_PRODUCT_INSPECTIONS_URL,
  API_ORIGIN,
  currentAdminProduct,
  makeAdminProductWire,
  seedAdminProducts,
  server,
} from '@/testing/msw/server'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // 에러 분기를 즉시 보려면 재시도를 끈다(main.tsx는 retry 1).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

// 이 화면은 2026-11-05에 `/admin/products` 셋(목록·판매중지·재개)과 검토 큐의 승인·반려에
// 실연동됐다(SCRUM-363). 그 전에는 목 데이터로 모양만 보여 주는 '상품 검수 관리'였고 이 파일은
// "예시 목록이 보인다 / 결정 버튼 셋이 보인다"를 단언했다 — 그 단언은 서버와 축이 다른 개념
// (`isBlinded`·자동/수동 블라인드)을 고정하고 있었으므로 계약에 맞춰 다시 썼다.
//
// **실제 HTTP 경로로 검사한다.** 모듈 모킹이 아니라 MSW로 가로채므로 URL·호스트·요청 본문·거절
// 코드까지 테스트가 고정한다. 특히 호스트는 `test-setup.ts`가 실제 앱과 같은
// `configureApiHosts`를 부르고 핸들러가 **어드민 오리진에만** 깔려 있어, 요청이 api 호스트로
// 나가면 핸들러에 걸리지 않고(onUnhandledRequest:'error') 그 자리에서 깨진다 — 한 주소로 합치면
// 호스트 오배치가 배포에서만 드러난다.

const 노출상품 = makeAdminProductWire({
  internalId: 9003,
  productId: '01JCATALOGPRODUCT000000001',
  productName: '동결건조 닭가슴살 100g',
  sellerId: 4101,
  storeName: '냥이상점',
  categoryName: '간식',
  regularPrice: 18000,
  saleStatus: 'ON_SALE',
  inspectionStatus: 'APPROVED',
  // 큐에 열린 검토 행이 없는 상품 — 승인·반려를 보내면 서버가 409/40500으로 거절한다.
  openInspectionReview: false,
  createdAt: '2026-10-28T11:05:00',
})

const 반려상품 = makeAdminProductWire({
  internalId: 9002,
  productId: '01JCATALOGPRODUCT000000002',
  productName: '관절 영양제 180정',
  sellerId: 4102,
  storeName: '보리펫샵',
  categoryName: '영양제',
  regularPrice: 42000,
  discountPrice: 35000,
  saleStatus: 'ON_SALE',
  inspectionStatus: 'REJECTED',
  reportCount: 2,
  // 관리자 확인이 남은 행이 열려 있다 — 이 상품만 검수 판정을 받을 수 있다.
  openInspectionReview: true,
  createdAt: '2026-10-26T09:12:00',
})

/** 상호를 못 찾는 상품(seller_id는 FK 없는 값 참조다) + 운영자가 막아 둔 상품을 겸한다. */
const 막힌상품 = makeAdminProductWire({
  internalId: 9001,
  productId: '01JCATALOGPRODUCT000000003',
  productName: '원목 캣타워 대형',
  sellerId: 4777,
  storeName: null,
  categoryName: '가구',
  regularPrice: 129000,
  saleStatus: 'SUSPENDED',
  inspectionStatus: 'APPROVED',
  adminSaleSuspended: true,
  adminSaleSuspendedAt: '2026-11-01T09:30:00',
  adminSaleSuspendReason: '신고 누적 확인',
  saleStatusBeforeSuspension: 'ON_SALE',
  // 재고가 없다 — 재개가 ON_SALE을 단정하지 못한다는 성질이 화면에서 드러나는 자리다.
  inStock: false,
  createdAt: '2026-10-20T18:40:00',
})

const drawer = async () => within(await screen.findByRole('dialog', { name: '상품 상세' }))

/**
 * 처리 라디오는 **caption 글자**로 누른다. 라벨 글자는 상태 pill과 겹친다 — '검수 승인'은
 * `INSPECTION_STATUS_META`의 pill 라벨이기도 하고 '판매 중지'는 확인 Modal의 버튼 이름이기도
 * 해서, 라벨로 집으면 무엇을 눌렀는지 말할 수 없다(리뷰 관리 테스트와 같은 처리).
 */
const ACTION_CAPTION = {
  approve: '검수 반려를 풀어 구매자에게 다시 노출해요. 운영자 막음은 풀리지 않아요.',
  reject: '구매자에게서 가리고 사유를 셀러에게 그대로 보여요.',
  suspend: '판매를 잠가요. 셀러는 되돌릴 수 없고 검수 상태는 그대로예요.',
  resume: '운영자 막음을 풀고 막기 직전 상태로 되돌려요.',
} as const

async function chooseAction(action: keyof typeof ACTION_CAPTION) {
  const open = await drawer()
  await userEvent.setup().click(open.getByText(ACTION_CAPTION[action]))
}

/** 확인 Modal을 거쳐 처리를 끝낸다 — 드로어 액션과 Modal 버튼 이름이 겹치므로 Modal 안으로 좁힌다. */
async function confirmWith(dialogName: string, buttonName: string) {
  const user = userEvent.setup()
  await user.click((await drawer()).getByRole('button', { name: '제출' }))
  const dialog = await screen.findByRole('dialog', { name: dialogName })
  await user.click(within(dialog).getByRole('button', { name: buttonName }))
}

/** 마운트 순간부터 **나간 요청 전부**를 모은다(메서드까지 남겨 쓰기와 조회를 가를 수 있게). */
function recordRequests(): string[] {
  const entries: string[] = []
  server.events.on('request:start', ({ request }) =>
    entries.push(`${request.method} ${request.url}`),
  )
  return entries
}

/**
 * 이 화면에서 **허용되는 요청** — 카탈로그 목록 조회와 셸이 nav 배지를 채우는 심사 대기 수.
 *
 * "버튼을 누른 뒤에 늘어난 요청"을 기준선으로 보는 방식은 쓰지 않는다. 확인 Modal이 없는 흐름은
 * 액션 클릭 자체가 쓰기 실행이라 기준선을 그 클릭 뒤에 잡으면 요청이 기준선에 삼켜져 단언이
 * 영원히 통과한다(2026-10-27 실측, `admin-mock-screens.test.tsx`의 주석에 근거가 있다).
 * 그래서 **허용 목록을 뺀 전부**를 본다 — 타이밍에 기대지 않으므로 늦게 나가는 요청도 남는다.
 *
 * 허용 목록이 어드민 오리진까지 포함한 절대 URL이라, 같은 경로를 **api 호스트로** 보낸 요청은
 * 허용에 걸리지 않고 그대로 드러난다(호스트 오배치가 여기서 잡힌다).
 */
const ALLOWED_READS = [ADMIN_PRODUCTS_URL, ADMIN_APPLICATIONS_URL]

const isAllowedRead = (entry: string) =>
  ALLOWED_READS.some(url => entry === `GET ${url}` || entry.startsWith(`GET ${url}?`))

const unexpectedRequests = (requests: readonly string[]) => requests.filter(e => !isAllowedRead(e))

const listRequests = (requests: readonly string[]) =>
  requests.filter(entry => entry.startsWith(`GET ${ADMIN_PRODUCTS_URL}`))

const writeRequests = (requests: readonly string[]) =>
  requests.filter(entry => entry.startsWith('POST '))

/**
 * 표 아래 건수 칸. 줄표(`—`)는 '운영자 막음' 칸에도 있고 숫자는 신고 수 칸과 겹치므로 전역에서
 * 글자로 집을 수 없다 — "전체"로 시작하는 칸을 잡아 그 안의 값을 읽는다.
 */
const totalCount = () => screen.getByText(/^전체/)

describe('/products/catalog', () => {
  beforeEach(() => {
    seedAdminProducts([노출상품, 반려상품, 막힌상품])
  })

  it('[AC-PRODUCT-CATALOG-001] 목록은 검수와 판매 두 축을 각각 보여주고 운영자 막음을 따로 세운다', async () => {
    renderAt('/products/catalog')

    expect(await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' })).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    // 구매자 노출 조건을 걸지 않으므로 반려·판매중지 상품도 같은 목록에 있다.
    expect(table.getByRole('button', { name: '관절 영양제 180정' })).toBeInTheDocument()
    expect(table.getByRole('button', { name: '원목 캣타워 대형' })).toBeInTheDocument()
    // 두 축을 함께 싣는 행이다 — 검수 반려와 판매중지가 서로를 뜻하지 않는다.
    expect(table.getByText('검수 반려')).toBeInTheDocument()
    expect(table.getByText('판매중지')).toBeInTheDocument()
    // 셀러가 스스로 내린 판매중지도 SUSPENDED라, 운영자 조치를 가리는 신호는 이 칸뿐이다.
    // 머리글 하나 + 막힌 행 하나 = 둘. 셋 중 한 행만 운영자 조치가 있으므로, 이 칸이 판매 상태를
    // 따라 그려지게 되돌아가면(SUSPENDED 둘이 모두 막음으로 보이면) 개수가 어긋난다.
    expect(table.getAllByText('운영자 막음')).toHaveLength(2)
    // storeName이 null인 상품은 조회 실패가 아니다 — 줄표로 비우지 않고 그렇게 적는다.
    expect(table.getByText('상호 없음 / 셀러 4777')).toBeInTheDocument()
    expect(totalCount()).toHaveTextContent('전체 3건')
  })

  it('[AC-PRODUCT-CATALOG-002] 서버에 없는 축(자동/수동 블라인드)은 화면에 남기지 않는다', async () => {
    renderAt('/products/catalog')

    expect(await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' })).toBeInTheDocument()
    // 목 화면에는 `blindType('auto'|'manual')` 열이 있었다. 서버에는 검수 상태 하나뿐이고 자동과
    // 수동을 가르지 않으므로, 그 열이 되살아나면 운영자가 AI가 건 것을 운영자가 건 것으로 읽는다.
    expect(screen.queryByText('자동 블라인드')).not.toBeInTheDocument()
    expect(screen.queryByText('수동 블라인드')).not.toBeInTheDocument()
    // '블라인드 유지'는 서버에서 검수 반려와 같은 조작이다 — 두 일로 보이는 문구를 쓰지 않는다.
    expect(screen.queryByRole('button', { name: '블라인드 유지' })).not.toBeInTheDocument()
  })

  it('[AC-PRODUCT-CATALOG-003] 상태 필터는 어드민 호스트로 서버 enum 이름을 보내고 빈 값은 키째 뺀다', async () => {
    const user = userEvent.setup()
    const requests = recordRequests()
    renderAt('/products/catalog')
    await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' })

    // 첫 조회에는 상태·검색 키가 아예 없어야 한다 — 서버는 알 수 없는 값을 400이 아니라 조건
    // 없음으로 보므로, 빈 문자열을 실어 보내도 조용히 전수 조회가 되어 화면에서는 티가 안 난다.
    const first = listRequests(requests)[0] ?? ''
    expect(first).toMatch(new RegExp(`^GET ${ADMIN_PRODUCTS_URL}\\?`))
    expect(first).not.toContain('inspectionStatus=')
    expect(first).not.toContain('saleStatus=')
    expect(first).not.toContain('keyword=')

    await user.selectOptions(
      screen.getByLabelText('검수 상태 필터'),
      within(screen.getByLabelText('검수 상태 필터')).getByRole('option', { name: '검수 반려' }),
    )
    await user.selectOptions(
      screen.getByLabelText('판매 상태 필터'),
      within(screen.getByLabelText('판매 상태 필터')).getByRole('option', { name: '판매중지' }),
    )

    // 화면 어휘는 소문자인데 서버에 가는 값은 대문자 enum 이름이다 — 변환이 매퍼에 갇혀 있는지는
    // 쿼리 문자열로만 확인된다(서버가 대소문자를 무시해 필터 결과로는 가려진다).
    const sent = listRequests(requests).at(-1) ?? ''
    expect(sent).toContain('inspectionStatus=REJECTED')
    expect(sent).toContain('saleStatus=SUSPENDED')
    // 어느 요청도 api 호스트로 새지 않는다(어드민 서버는 자격증명 허용이 없는 토큰 전용이다).
    expect(requests.filter(entry => entry.includes(API_ORIGIN))).toEqual([])
    expect(unexpectedRequests(requests)).toEqual([])
  })

  it('[AC-PRODUCT-CATALOG-004] 검색은 서버 keyword로 나가고 건수도 그 조건을 따른다', async () => {
    const user = userEvent.setup()
    const requests = recordRequests()
    renderAt('/products/catalog')
    await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' })

    await user.type(screen.getByPlaceholderText('상품명 / 셀러 상호 검색'), '보리펫샵')

    // 상품명과 상호를 가르는 파라미터가 없다 — 상호로 검색해도 같은 keyword 하나로 나간다.
    await waitFor(() => expect(totalCount()).toHaveTextContent('전체 1건'))
    expect(listRequests(requests).at(-1) ?? '').toContain(`keyword=${encodeURIComponent('보리펫샵')}`)
    expect(screen.queryByRole('button', { name: '동결건조 닭가슴살 100g' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '관절 영양제 180정' })).toBeInTheDocument()
  })

  it('[AC-PRODUCT-CATALOG-005] 확인 창을 띄우기 전에는 쓰기 요청이 한 건도 나가지 않는다', async () => {
    const user = userEvent.setup()
    const requests = recordRequests()
    renderAt('/products/catalog')

    // 행 열기·처리 고르기·사유 입력은 전부 읽기여야 한다. 되돌릴 수 없는 처리가 확인 없이
    // 나가면 운영자는 누른 순간을 되돌릴 수 없다.
    await user.click(await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' }))
    await chooseAction('suspend')
    await user.type((await drawer()).getByLabelText('판매 중지 사유'), '신고 누적 확인')
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    await screen.findByRole('dialog', { name: '판매를 중지할까요?' })

    expect(unexpectedRequests(requests)).toEqual([])

    await user.click(
      within(screen.getByRole('dialog', { name: '판매를 중지할까요?' })).getByRole('button', {
        name: '판매 중지',
      }),
    )

    // 확인을 누른 뒤에 **딱 한 건**이다 — Modal 확인과 드로어 제출이 둘 다 보내면 두 건이 된다.
    await screen.findByText('판매를 중지했어요.')
    expect(writeRequests(requests)).toEqual([
      `POST ${ADMIN_PRODUCTS_URL}/${노출상품.productId}/sale-suspensions`,
    ])
  })

  it('[AC-PRODUCT-CATALOG-006] 판매중지는 사유를 싣고 검수 상태는 건드리지 않으며 성공은 상태 역할 토스트다', async () => {
    const user = userEvent.setup()
    renderAt('/products/catalog')
    await user.click(await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' }))
    await chooseAction('suspend')
    // 사유가 비면 제출이 잠긴다 — 서버의 400(90001)을 화면에서 먼저 막는다.
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeDisabled()
    await user.type((await drawer()).getByLabelText('판매 중지 사유'), '  신고 누적 확인  ')

    await confirmWith('판매를 중지할까요?', '판매 중지')

    const toast = await screen.findByText('판매를 중지했어요.')
    // 문구만 보면 variant를 경고로 되돌려도 통과한다 — DS는 warning/error만 `role="alert"`로
    // 올리고 success는 `role="status"`다. 목업 시절의 경고 토스트가 되살아나면 여기서 깨진다.
    expect(toast.closest('[role="alert"]')).toBeNull()
    expect(toast.closest('[role="status"]')).not.toBeNull()

    const after = currentAdminProduct(노출상품.productId)
    expect(after?.adminSaleSuspended).toBe(true)
    expect(after?.saleStatus).toBe('SUSPENDED')
    expect(after?.adminSaleSuspendReason).toBe('신고 누적 확인')
    // 두 축은 독립이다 — 판매를 막는 일이 검수 판정을 바꾸면 안 된다.
    expect(after?.inspectionStatus).toBe('APPROVED')
    // 창을 닫지 않는다 — 무효화 재조회가 채운 바뀐 행을 그 자리에서 읽어야 한다.
    expect(
      await (await drawer()).findByText('운영자가 판매를 막아 둔 상품이에요'),
    ).toBeInTheDocument()
  })

  it('[AC-PRODUCT-CATALOG-007] 막힌 행에는 중지 대신 재개가 서고, 재개는 판매중을 단정하지 않는다', async () => {
    const user = userEvent.setup()
    const requests = recordRequests()
    renderAt('/products/catalog')

    await user.click(await screen.findByRole('button', { name: '원목 캣타워 대형' }))

    const open = await drawer()
    // 막힌 행에 중지가 서면 서버가 409/40008로 거절할 조작을 운영자가 고를 수 있게 된다.
    expect(open.queryByText(ACTION_CAPTION.suspend)).not.toBeInTheDocument()
    expect(open.getByText(ACTION_CAPTION.resume)).toBeInTheDocument()
    // 막을 때 적어 둔 사유와 시각이 그 행에 실려 온다(상세 조회 경로가 없다).
    expect(open.getByText('신고 누적 확인')).toBeInTheDocument()
    expect(open.getByText('2026-11-01 09:30')).toBeInTheDocument()

    // 사유를 적지 않아도 재개할 수 있다 — 서버가 본문 자체를 생략해도 받는다.
    await confirmWith('판매를 다시 열까요?', '판매 재개')

    await screen.findByText('판매 막음을 풀었어요. 바뀐 판매 상태는 목록에서 확인해 주세요.')
    expect(writeRequests(requests)).toEqual([
      `POST ${ADMIN_PRODUCTS_URL}/${막힌상품.productId}/sale-suspensions/release`,
    ])
    const after = currentAdminProduct(막힌상품.productId)
    expect(after?.adminSaleSuspended).toBe(false)
    // 막기 직전이 판매중이어도 재고가 없으면 품절로 떨어진다 — **재개가 곧 판매중은 아니다.**
    expect(after?.saleStatus).toBe('OUT_OF_STOCK')
    expect(await (await drawer()).findByText('품절')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-CATALOG-008] 검수 승인은 새 API가 아니라 검수 큐의 승인 경로로 나간다', async () => {
    const user = userEvent.setup()
    const requests = recordRequests()
    renderAt('/products/catalog')

    await user.click(await screen.findByRole('button', { name: '관절 영양제 180정' }))
    await chooseAction('approve')
    await confirmWith('검수를 승인할까요?', '승인')

    await screen.findByText('검수를 승인했어요.')
    // 상품을 가리는 일과 검수에서 반려하는 일이 서버에서 같은 조작이라 새 경로를 만들지 않았다.
    // `/admin/products` 아래로 보내면 404가 되고, 여기서 경로가 어긋나면 그대로 드러난다.
    expect(writeRequests(requests)).toEqual([
      `POST ${ADMIN_PRODUCT_INSPECTIONS_URL}/${반려상품.productId}/approve`,
    ])
    expect(currentAdminProduct(반려상품.productId)?.inspectionStatus).toBe('APPROVED')
  })

  it('[AC-PRODUCT-CATALOG-009] 검수 반려는 큐의 반려 경로로 사유를 싣고 운영자 막음은 풀지 않는다', async () => {
    const user = userEvent.setup()
    const requests = recordRequests()
    seedAdminProducts([
      // 반려할 수 있는 열린 검토 행 + 운영자 막음을 겸한 상품. 두 축이 섞이면 여기서 드러난다.
      makeAdminProductWire({
        ...반려상품,
        inspectionStatus: 'PENDING',
        adminSaleSuspended: true,
        adminSaleSuspendedAt: '2026-11-02T10:00:00',
        adminSaleSuspendReason: '성분 표기 확인 중',
        saleStatus: 'SUSPENDED',
        saleStatusBeforeSuspension: 'ON_SALE',
      }),
    ])
    renderAt('/products/catalog')

    await user.click(await screen.findByRole('button', { name: '관절 영양제 180정' }))
    await chooseAction('reject')
    await user.type((await drawer()).getByLabelText('검수 반려 사유'), '효능 표현을 빼 주세요.')
    await confirmWith('검수를 반려할까요?', '반려')

    await screen.findByText('검수를 반려했어요.')
    expect(writeRequests(requests)).toEqual([
      `POST ${ADMIN_PRODUCT_INSPECTIONS_URL}/${반려상품.productId}/reject`,
    ])
    const after = currentAdminProduct(반려상품.productId)
    expect(after?.inspectionStatus).toBe('REJECTED')
    // 검수 반려가 운영자 막음을 건드리면 재개가 되돌릴 자리를 잃는다.
    expect(after?.adminSaleSuspended).toBe(true)
    expect(after?.adminSaleSuspendReason).toBe('성분 표기 확인 중')
  })

  it('[AC-PRODUCT-CATALOG-010] 열린 검수 건이 없으면 409/40500 안내를 띄운 채 창을 닫지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/products/catalog')

    // 이 상품은 큐에 열린 검토 행이 없다. 목록 응답에는 그 사실을 알 방법이 없어 화면이 미리
    // 잠글 수 없고, 서버의 거절이 운영자에게 닿는 유일한 신호다.
    await user.click(await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' }))
    await chooseAction('reject')
    await user.type((await drawer()).getByLabelText('검수 반려 사유'), '성분 표기를 고쳐 주세요.')
    await confirmWith('검수를 반려할까요?', '반려')

    const open = await drawer()
    expect(
      await open.findByText(/관리자 확인을 기다리는 검수 건이 없어 검수 판정을 처리하지 못했어요/),
    ).toBeInTheDocument()
    // 확인 Modal만 닫고 드로어는 남긴다 — 안내를 띄울 자리가 사라지면 운영자는 왜 안 됐는지 모른다.
    expect(screen.queryByRole('dialog', { name: '검수를 반려할까요?' })).not.toBeInTheDocument()
    expect(screen.queryByText('검수를 반려했어요.')).not.toBeInTheDocument()
    expect(currentAdminProduct(노출상품.productId)?.inspectionStatus).toBe('APPROVED')
  })

  it('[AC-PRODUCT-CATALOG-011] 동시 조치 충돌(409/40011)은 드로어 안 안내로 남고 적어 둔 사유를 덮지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/products/catalog')

    await user.click(await screen.findByRole('button', { name: '원목 캣타워 대형' }))
    // 라디오에는 중지가 없으므로 다른 운영자가 먼저 막은 뒤의 경합을 재현한다 — 화면이 보고 있는
    // 행이 낡았을 때 서버가 끊는 자리다.
    server.use(
      http.post(`${ADMIN_PRODUCTS_URL}/:productId/sale-suspensions/release`, () =>
        HttpResponse.json(
          { errorCode: 40011, message: '다른 관리자가 먼저 처리했습니다.' },
          { status: 409 },
        ),
      ),
    )

    await confirmWith('판매를 다시 열까요?', '판매 재개')

    const open = await drawer()
    expect(await open.findByText(/다른 운영자가 같은 상품을 동시에 처리했어요/)).toBeInTheDocument()
    // 거절은 드로어 안 Alert다(토스트가 아니다) — 창이 닫히면 바뀐 행과 함께 읽을 수 없다.
    expect(screen.queryByText('판매 막음을 풀었어요. 바뀐 판매 상태는 목록에서 확인해 주세요.')).not.toBeInTheDocument()
    expect(currentAdminProduct(막힌상품.productId)?.adminSaleSuspendReason).toBe('신고 누적 확인')
  })

  it('[AC-PRODUCT-CATALOG-012] 조회가 끊기면 건수는 0이 아니라 줄표이고 처리가 잠긴다(상세는 열린다)', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderAt('/products/catalog')
    await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' })

    server.use(
      http.get(ADMIN_PRODUCTS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['admin-products'] })
    })

    expect(
      await screen.findByText(/어드민 권한이 없어 상품 목록을 볼 수 없어요/),
    ).toBeInTheDocument()
    // 0건을 그리면 운영자가 "상품이 없다"로 읽는다 — 조회 실패와 빈 목록은 다른 사실이다.
    expect(totalCount()).toHaveTextContent('—')

    // 상세를 여는 읽기 버튼은 잠그지 않는다(마지막으로 본 내용은 정보다).
    await user.click(screen.getByRole('button', { name: '동결건조 닭가슴살 100g' }))

    const open = await drawer()
    // 낡은 행에서 확인 창을 만들면 서버에 없는 상태를 보고 되돌릴 수 없는 전이를 지시하게 된다.
    expect(open.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
    expect(
      open.getByText(/목록을 다시 불러오지 못해 처리를 잠가 뒀어요/),
    ).toBeInTheDocument()
  })
})
