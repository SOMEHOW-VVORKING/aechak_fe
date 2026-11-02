import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { SELLER_STORE_QUERY_KEY } from '@/features/store-settings'
import {
  SELLER_STORE_URL,
  currentSellerApplication,
  currentStore,
  makeApplicationWire,
  makeStoreWire,
  seedSellerApplication,
  seedStoreSettings,
  server,
} from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 실제 앱(main.tsx)의 쿼리 기본값 — staleTime 60초. 재진입 경로는 이 값으로 재현해야 한다.
// 기본값 0으로 재진입을 테스트하면 언마운트 뒤 재조회가 언제나 돌아, 캐시가 폼을 확정하는
// 결함이 있어도 통과한다.
const PROD_QUERY_DEFAULTS = {
  defaultOptions: { queries: { retry: false, staleTime: 1000 * 60 } },
}

function renderAt(path: string, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('/store-settings (실서버 계약 — MSW)', () => {
  beforeEach(() => {
    seedSellerApplication(null)
  })

  it('[AC-STORE-ROUTE-001] 신청 이력이 없으면(404/10100) 신규 신청 폼을 보여준다', async () => {
    renderAt('/store-settings')

    expect(await screen.findByText('스토어 개설 신청')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '제출하기' })).toBeDisabled() // 필수 미비
    expect(screen.getByText(/제출 전 필요:/)).toBeInTheDocument()
  })

  it('[AC-STORE-ROUTE-002] 임시저장은 폼 전체를 싣고 응답으로 화면을 재구성한다', async () => {
    const user = userEvent.setup()
    renderAt('/store-settings')

    await user.type(await screen.findByLabelText('예금주'), '정지은')
    await user.click(screen.getByRole('button', { name: '임시저장' }))

    await screen.findByText('저장했어요.')
    const saved = currentSellerApplication()
    expect(saved?.status).toBe('DRAFT')
    expect(saved?.accountHolder).toBe('정지은')
    // 안 채운 필드는 null 전체 덮어쓰기 계약 그대로.
    expect(saved?.businessName).toBeNull()
  })

  it('[AC-STORE-ROUTE-003] 반려 상태는 사유를 보여주고, 재제출은 저장(자동 재개) → 제출 체인으로 SUBMITTED가 된다', async () => {
    seedSellerApplication(
      makeApplicationWire({
        status: 'REJECTED',
        representativeName: '정지은',
        bankCode: '004',
        accountNumberMasked: '********1234',
        accountHolder: '정지은',
        rejectionReason: '통장 사본이 흐려요.',
        documents: [
          { documentType: 'ID_CARD', uploadedAt: '2026-08-01T09:10:00' },
          { documentType: 'BANKBOOK_COPY', uploadedAt: '2026-08-01T09:11:00' },
        ],
      }),
    )
    const user = userEvent.setup()
    renderAt('/store-settings')

    expect(await screen.findByText('통장 사본이 흐려요.')).toBeInTheDocument()

    // 계좌번호는 응답이 마스킹뿐이라 재입력해야 저장/제출이 열린다(소거 방지 가드). 서류는 갖춰져 버튼은
    // 열려 있고, 누르면 입력 helper 외에 가드 Alert가 하나 더 뜬다.
    await user.click(screen.getByRole('button', { name: '재제출하기' }))
    expect(await screen.findAllByText(/계좌번호는 저장할 때마다 다시 입력/)).toHaveLength(2)
    expect(currentSellerApplication()?.status).toBe('REJECTED')

    await user.type(screen.getByLabelText('계좌번호'), '110123456789')
    await user.click(screen.getByRole('button', { name: '재제출하기' }))

    // 저장(reopen → DRAFT) → 제출(204) 체인이 끝나면 심사 대기 화면으로 넘어간다.
    expect(await screen.findByText('심사 대기 중이에요')).toBeInTheDocument()
    expect(currentSellerApplication()?.status).toBe('SUBMITTED')
  })

  it('[AC-STORE-ROUTE-007] 필수 정보가 비어 있으면 서버(10105)가 거절하고 부족 항목을 인라인으로 보여준다', async () => {
    seedSellerApplication(
      makeApplicationWire({
        documents: [
          { documentType: 'ID_CARD', uploadedAt: '2026-08-01T09:10:00' },
          { documentType: 'BANKBOOK_COPY', uploadedAt: '2026-08-01T09:11:00' },
        ],
      }),
    )
    const user = userEvent.setup()
    renderAt('/store-settings')

    // 서류만 갖추면 제출 버튼은 열린다 — 필수 정보는 클라이언트가 미리 보지 않는다.
    const submit = await screen.findByRole('button', { name: '제출하기' })
    expect(submit).toBeEnabled()
    await user.click(submit)

    expect(await screen.findByText('제출 전 필요: 대표자명, 은행 코드, 계좌번호, 예금주')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(currentSellerApplication()?.status).toBe('DRAFT')
  })

  it('[AC-STORE-ROUTE-004] 심사 중(SUBMITTED)은 폼 없이 홀딩 뷰만 보여준다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'SUBMITTED', submittedAt: '2026-08-12T10:00:00' }))
    renderAt('/store-settings')

    expect(await screen.findByText('심사 대기 중이에요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '임시저장' })).not.toBeInTheDocument()
  })

  /**
   * 예전엔 승인 뒤 이 자리가 "스토어 정보를 설정하는 화면은 곧 제공될 예정이에요"라는 빈 화면이었다.
   * GET/PUT /sellers/me/store가 이미 떠 있었으므로 승인된 셀러가 자기 상호조차 못 보는 거짓이었다.
   */
  it('[AC-STORE-ROUTE-005] 승인(APPROVED)은 서버 스토어 값을 폼에 채워 보여준다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED', decidedAt: '2026-08-12T10:00:00' }))
    seedStoreSettings({
      isSeller: true,
      applicationStatus: 'APPROVED',
      store: makeStoreWire({
        storeName: '애착상회',
        brandIntro: '손으로 깎는 원목 급식대만 만들어요.',
        zipCode: '13529',
        roadAddress: '경기 성남시 판교역로 2',
        detailAddress: '3층',
      }),
    })
    renderAt('/store-settings')

    expect(await screen.findByDisplayValue('애착상회')).toBeInTheDocument()
    expect(screen.getByDisplayValue('손으로 깎는 원목 급식대만 만들어요.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('경기 성남시 판교역로 2')).toBeInTheDocument()
    expect(screen.queryByText(/곧 제공될 예정/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출하기' })).not.toBeInTheDocument()
  })

  it('[AC-STORE-ROUTE-008] 저장은 전체 덮어쓰기로 나가고 빈 칸은 null이 된다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
    seedStoreSettings({
      isSeller: true,
      applicationStatus: 'APPROVED',
      store: makeStoreWire({ storeName: '애착상회', brandIntro: '지울 소개', zipCode: '13529' }),
    })
    const user = userEvent.setup()
    renderAt('/store-settings')

    const nameInput = await screen.findByDisplayValue('애착상회')
    await user.clear(nameInput)
    await user.type(nameInput, '  애착스토어  ')
    await user.clear(screen.getByDisplayValue('지울 소개'))
    await user.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByText('저장했어요.')
    const saved = currentStore()
    // 상호 앞뒤 공백은 보내는 쪽에서 떼고, 비운 칸은 ''가 아니라 null로 나간다.
    expect(saved?.storeName).toBe('애착스토어')
    expect(saved?.brandIntro).toBeNull()
    // 건드리지 않은 칸은 읽은 값 그대로 남는다(전체 덮어쓰기라 빼면 지워진다).
    expect(saved?.zipCode).toBe('13529')
    // 저장 뒤 폼도 서버가 다듬은 값으로 되맞춰진다.
    expect(screen.getByDisplayValue('애착스토어')).toBeInTheDocument()
  })

  it('[AC-STORE-ROUTE-009] 폼에 없는 이미지 키도 그대로 실려 저장이 이미지를 지우지 않는다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
    seedStoreSettings({
      isSeller: true,
      applicationStatus: 'APPROVED',
      store: makeStoreWire({
        profileImageKey: 'sellers/store/p.webp',
        bannerImageKey: 'sellers/store/b.webp',
      }),
    })
    const user = userEvent.setup()
    renderAt('/store-settings')

    await screen.findByDisplayValue('애착상회')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByText('저장했어요.')
    expect(currentStore()?.profileImageKey).toBe('sellers/store/p.webp')
    expect(currentStore()?.bannerImageKey).toBe('sellers/store/b.webp')
  })

  it('[AC-STORE-ROUTE-010] 상호를 비우면 서버를 부르지 않고 화면이 먼저 막는다', async () => {
    let puts = 0
    server.use(
      http.put(SELLER_STORE_URL, () => {
        puts += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
    const user = userEvent.setup()
    renderAt('/store-settings')

    await user.clear(await screen.findByDisplayValue('애착상회'))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(
      await screen.findByText('저장하지 못했어요. 상호(스토어명)를 확인해 주세요.'),
    ).toBeInTheDocument()
    expect(puts).toBe(0)
  })

  it('[AC-STORE-ROUTE-011] 정지 셀러는 값은 보여주고 저장은 막고 사유를 알린다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
    seedStoreSettings({
      isSeller: true,
      applicationStatus: 'APPROVED',
      store: makeStoreWire({ status: 'SUSPENDED' }),
    })
    renderAt('/store-settings')

    expect(await screen.findByDisplayValue('애착상회')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByText(/운영 중인 스토어만 설정을 바꿀 수 있어요/)).toBeInTheDocument()
  })

  it('[AC-STORE-ROUTE-012] 조회가 실패하면 빈 폼 대신 재시도를 준다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
    server.use(http.get(SELLER_STORE_URL, () => new HttpResponse(null, { status: 500 })))
    renderAt('/store-settings')

    // 저장이 전체 덮어쓰기라, 못 읽은 값을 빈 폼으로 보여 주면 저장이 상호를 지운다.
    expect(await screen.findByText('스토어 정보를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })

  it('[AC-STORE-ROUTE-014] 승인인데 서버에 스토어가 없으면 읽기 실패와 다른 문구를 보여준다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
    seedStoreSettings({ isSeller: false, applicationStatus: 'APPROVED', store: null })
    renderAt('/store-settings')

    expect(await screen.findByText('스토어가 아직 열리지 않았어요')).toBeInTheDocument()
    expect(screen.queryByText('스토어 정보를 불러오지 못했어요')).not.toBeInTheDocument()
  })

  /**
   * 주소 3필드는 배송 정책의 출고지와 **같은 컬럼**이다. 재진입 때 캐시된 옛 주소로 폼을
   * 확정하면, 저장이 전체 덮어쓰기라 그 사이 배송 정책에서 바꾼 출고지가 되돌아간다.
   * 같은 QueryClient 로 두 번 렌더해 캐시가 남은 재진입을 재현한다.
   */
  it('[AC-STORE-ROUTE-015] 재진입 때 캐시된 옛 주소로 저장하지 않는다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
    seedStoreSettings({
      isSeller: true,
      applicationStatus: 'APPROVED',
      store: makeStoreWire({ roadAddress: '경기 성남시 판교역로 2' }),
    })
    const queryClient = new QueryClient(PROD_QUERY_DEFAULTS)
    const first = renderAt('/store-settings', queryClient)
    await screen.findByDisplayValue('경기 성남시 판교역로 2')
    first.unmount()

    // 그 사이 다른 화면(배송 정책)이 같은 주소 컬럼을 바꿨다.
    seedStoreSettings({
      isSeller: true,
      applicationStatus: 'APPROVED',
      store: makeStoreWire({ roadAddress: '서울 강남구 테헤란로 1' }),
    })
    const user = userEvent.setup()
    renderAt('/store-settings', queryClient)

    // 캐시된 옛 주소가 아니라 다시 읽은 값이 폼에 들어가야 한다.
    expect(await screen.findByDisplayValue('서울 강남구 테헤란로 1')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('경기 성남시 판교역로 2')).not.toBeInTheDocument()

    // 상호만 바꿔 저장해도 주소가 옛 값으로 되돌아가지 않는다.
    const nameInput = screen.getByDisplayValue('애착상회')
    await user.clear(nameInput)
    await user.type(nameInput, '애착스토어')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByText('저장했어요.')
    expect(currentStore()?.roadAddress).toBe('서울 강남구 테헤란로 1')
  })

  /**
   * 입력 중에 도착한 새 응답은 **건드린 칸만** 비켜 가야 한다. 폼 전체를 지키면, 상호만 고치는
   * 동안 다른 화면(배송 정책)이 바꾼 주소가 버려지고 전체 덮어쓰기 저장이 옛 주소를 되돌린다.
   * 상호를 고친 뒤 무효화로 재조회를 일으켜 "입력 중 새 응답 도착"을 만든다.
   */
  it('[AC-STORE-ROUTE-016] 입력 중에 도착한 새 주소는 버리지 않고 건드린 칸만 지킨다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
    seedStoreSettings({
      isSeller: true,
      applicationStatus: 'APPROVED',
      store: makeStoreWire({ roadAddress: '경기 성남시 판교역로 2' }),
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    renderAt('/store-settings', queryClient)

    const nameInput = await screen.findByDisplayValue('애착상회')
    await user.clear(nameInput)
    await user.type(nameInput, '애착스토어')

    // 그 사이 다른 화면이 같은 주소 컬럼을 바꿨고, 재조회가 새 값을 들고 온다.
    seedStoreSettings({
      isSeller: true,
      applicationStatus: 'APPROVED',
      store: makeStoreWire({ roadAddress: '서울 강남구 테헤란로 1' }),
    })
    await queryClient.invalidateQueries({ queryKey: SELLER_STORE_QUERY_KEY })

    // 건드리지 않은 주소는 새 값으로 맞춰지고, 건드린 상호는 입력이 남는다.
    expect(await screen.findByDisplayValue('서울 강남구 테헤란로 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('애착스토어')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('저장했어요.')
    expect(currentStore()?.storeName).toBe('애착스토어')
    expect(currentStore()?.roadAddress).toBe('서울 강남구 테헤란로 1')
  })

  /**
   * 재조회가 도는 동안에는 저장을 막는다. 병합은 조회가 끝난 뒤에야 도는데 저장이 열려 있으면,
   * 다른 화면이 바꾼 값이 도착하기 전에 전체 덮어쓰기가 그 변경을 되돌린다.
   */
  it('[AC-STORE-ROUTE-017] 재조회 중에는 저장을 막고 이유를 알린다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderAt('/store-settings', queryClient)
    const saveButton = await screen.findByRole('button', { name: '저장' })
    expect(saveButton).toBeEnabled()

    // 응답을 붙잡아 재조회가 도는 구간을 만든다.
    let release: (() => void) | undefined
    const pending = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.get(SELLER_STORE_URL, async () => {
        await pending
        return HttpResponse.json({
          data: { isSeller: true, applicationStatus: 'APPROVED', store: makeStoreWire() },
        })
      }),
    )
    void queryClient.invalidateQueries({ queryKey: SELLER_STORE_QUERY_KEY })

    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeDisabled())
    expect(screen.getByText(/최신 값을 다시 불러오는 중이라 저장을 잠시 막았어요/)).toBeInTheDocument()

    release?.()
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
  })

  /** BE에 통지 도메인이 없다 — 심사 단계 어디서도 알림을 보내 준다고 말하지 않는다. */
  it('[AC-STORE-ROUTE-013] 심사 단계 안내는 알림을 약속하지 않고 이 화면을 가리킨다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'SUBMITTED' }))
    renderAt('/store-settings')

    expect(await screen.findByText(/이 화면에서 결과를 확인해 주세요/)).toBeInTheDocument()
    expect(screen.queryByText(/알림으로/)).not.toBeInTheDocument()
    expect(screen.queryByText(/알려드릴게요/)).not.toBeInTheDocument()
  })

  it('[AC-STORE-ROUTE-006] 서류를 첨부하면 presigned 업로드 → tmpKey가 임시저장에 실린다', async () => {
    const user = userEvent.setup()
    renderAt('/store-settings')

    const file = new File(['pdf-bytes'], 'bankbook.pdf', { type: 'application/pdf' })
    await user.upload(await screen.findByLabelText('통장 사본 파일 선택'), file)
    expect(await screen.findByText('첨부됨 (저장 전)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '임시저장' }))
    await screen.findByText('저장했어요.')

    await waitFor(() => {
      expect(
        currentSellerApplication()?.documents.some(doc => doc.documentType === 'BANKBOOK_COPY'),
      ).toBe(true)
    })
  })
})
