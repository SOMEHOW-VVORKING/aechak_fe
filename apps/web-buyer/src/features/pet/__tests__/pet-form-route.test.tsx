import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { HttpResponse, delay, http } from 'msw'
import { setAccessToken, setOnAuthExpired } from '@aechak/api'
import { MAX_PHOTO_BYTES, OVERSIZED_PHOTO_MESSAGE } from '@/shared/pet'
import {
  BREEDS_URL,
  currentPets,
  PRESIGNED_URL,
  seedPets,
  WEB_REFRESH_URL,
  server,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // main.tsx와 동일하게 세션 만료(401 → refresh 실패) 시 로그인으로 튕기는 핸들러를 배선한다.
  setOnAuthExpired(() => {
    void router.navigate({ to: '/onboarding/login' })
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// 시드 펫. 라벨만 있고 breedId가 없는 '연동 전 데이터'를 재현해 프리필·백필을 검증한다.
const COCO = {
  petId: 1,
  species: 'CAT' as const,
  name: '코코',
  breedId: 369,
  breedLabel: '코리안 숏헤어',
  birthYearMonth: '2023-01',
  weight: 4.2,
  profileImageKey: null,
  isDefault: true,
  status: 'ACTIVE' as const,
  version: 0,
}

describe('펫 폼 품종 Select: breeds API 연동', () => {
  beforeEach(() => {
    seedPets()
  })
  afterEach(() => {
    setOnAuthExpired(null)
    setAccessToken(null)
  })

  it('[AC-PET-BREEDS-002] 새 펫 폼 진입 시 기본 종(고양이)의 품종 목록을 API에서 불러온다', async () => {
    renderAt('/mypage/pets/new')

    expect(await screen.findByRole('option', { name: '코리안 숏헤어' })).toBeInTheDocument()
    // DOG 전용 품종은 아직 없다(species=CAT으로만 요청).
    expect(screen.queryByRole('option', { name: '푸들' })).not.toBeInTheDocument()
  })

  it('[AC-PET-BREEDS-003] 종 전환 시 새 종의 목록으로 교체되고 이전 선택은 초기화된다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/pets/new')

    const select = await screen.findByLabelText('품종')
    await user.selectOptions(select, await screen.findByRole('option', { name: '코리안 숏헤어' }))
    expect(select).toHaveValue('369')

    await user.click(screen.getByRole('tab', { name: '강아지' }))
    expect(await screen.findByRole('option', { name: '푸들' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '코리안 숏헤어' })).not.toBeInTheDocument()
    // 고양이 품종 선택(369)은 강아지 목록에 없으므로 미선택으로 돌아간다.
    expect(select).toHaveValue('')
  })

  it('[AC-PET-BREEDS-004] 목록 로딩 중에는 Select가 비활성이고 로딩 문구를 보여준다', async () => {
    server.use(
      http.get(BREEDS_URL, async () => {
        await delay('infinite')
      }),
    )
    renderAt('/mypage/pets/new')

    const select = await screen.findByLabelText('품종')
    expect(select).toBeDisabled()
    expect(select).toHaveTextContent('품종을 불러오는 중이에요')
  })

  it('[AC-PET-BREEDS-005] 세션 없이 조회하면(401 → refresh 실패) 로그인 화면으로 튕긴다', async () => {
    // 기본 refresh 핸들러가 401이라 인터셉터 재발급이 실패 → 전역 onAuthExpired가 로그인으로 보낸다.
    server.use(
      http.get(BREEDS_URL, () =>
        HttpResponse.json({ errorCode: 20004, message: '로그인이 필요합니다.' }, { status: 401 }),
      ),
    )
    renderAt('/mypage/pets/new')

    expect(await screen.findByRole('button', { name: '카카오로 시작하기' })).toBeInTheDocument()
  })

  it('[AC-PET-BREEDS-009] 비인증 오류(서버 500)는 인라인 안내만 뜨고 재시도 버튼도 화면 이탈도 없다', async () => {
    server.use(http.get(BREEDS_URL, () => HttpResponse.json({ message: 'oops' }, { status: 500 })))
    renderAt('/mypage/pets/new')

    expect(
      await screen.findByText('품종 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('품종')).toBeDisabled()
    // 재시도 버튼은 제거됐고, 401이 아니라 로그인으로 튕기지도 않는다(폼에 그대로 머문다).
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '카카오로 시작하기' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('이름')).toBeInTheDocument()
  })

  it('[AC-PET-BREEDS-010] 만료 토큰은 refresh로 새 토큰을 받아 재시도해 품종이 뜬다(로그인으로 안 튕김)', async () => {
    setAccessToken('expired-token')
    // breeds는 새 토큰일 때만 200. refresh가 새 토큰을 내려주면 인터셉터가 헤더를 갈아끼워 재시도한다.
    server.use(
      http.get(BREEDS_URL, ({ request }) =>
        request.headers.get('Authorization') === 'Bearer new-token'
          ? HttpResponse.json({ data: [{ breedId: 369, label: '코리안 숏헤어' }] })
          : HttpResponse.json({ errorCode: 20004, message: '만료' }, { status: 401 }),
      ),
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'new-token', tokenType: 'Bearer', expiresIn: 3600 } }),
      ),
    )
    renderAt('/mypage/pets/new')

    // 재시도가 새 토큰을 달고 나가야 품종이 뜬다. 헤더를 안 갈아끼우면 계속 401 → 로그인으로 튕긴다.
    expect(await screen.findByRole('option', { name: '코리안 숏헤어' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '카카오로 시작하기' })).not.toBeInTheDocument()
  })

  it('[AC-PET-BREEDS-006] 품종 선택 후 저장하면 breedId가 전송되고 종은 그 품종에서 파생된다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/pets/new')

    await user.click(await screen.findByRole('tab', { name: '강아지' }))
    const select = screen.getByLabelText('품종')
    await user.selectOptions(select, await screen.findByRole('option', { name: '푸들' }))
    await user.type(screen.getByLabelText('이름'), '탄이')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(currentPets().find(p => p.name === '탄이')).toMatchObject({
        species: 'DOG',
        breedId: 279,
      })
    })
  })

  it('[AC-PET-BREEDS-007] 시드 펫 편집 시 품종이 프리필되고 저장하면 그 breedId가 전송된다', async () => {
    seedPets([{ ...COCO, breedId: 369 }])
    const user = userEvent.setup()
    renderAt('/mypage/pets')

    await user.click((await screen.findAllByRole('button', { name: '수정' }))[0]!)
    const select = await screen.findByLabelText('품종')
    await waitFor(() => expect(select).toHaveValue('369'))

    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => {
      expect(currentPets().find(p => p.petId === 1)).toMatchObject({
        breedId: 369,
        breedLabel: '코리안 숏헤어',
      })
    })
  })

  it('[AC-PET-BREEDS-008] 종을 바꿔 품종이 미선택이 되면 저장 버튼이 막힌다', async () => {
    // 품종은 서버 필수 계약이라 미선택 저장은 400이다. 눌리기 전에 막는 게 맞는 동작.
    seedPets([COCO])
    const user = userEvent.setup()
    renderAt('/mypage/pets')

    await user.click((await screen.findAllByRole('button', { name: '수정' }))[0]!)
    await screen.findByLabelText('품종')
    await user.click(screen.getByRole('tab', { name: '강아지' }))
    await screen.findByRole('option', { name: '푸들' }) // DOG 목록 로드 대기

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  // PhotoUpload의 file input은 라벨 없이 버튼으로 트리거되는 숨은 input이라 직접 집는다.
  function photoInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (input == null) throw new Error('사진 업로드 input을 찾지 못했다')
    return input
  }

  it('[AC-PET-PHOTO-001] 업로드가 끝나기 전에는 저장을 막는다', async () => {
    // 막지 않으면 미리보기는 떠 있는데 tmp 키가 없어 사진 없는 펫이 저장되고, 사용자는 붙은 줄 안다.
    server.use(
      http.post(PRESIGNED_URL, async () => {
        await delay('infinite')
      }),
    )
    const user = userEvent.setup()
    const { container } = renderAt('/mypage/pets/new')

    await user.selectOptions(
      await screen.findByLabelText('품종'),
      await screen.findByRole('option', { name: '코리안 숏헤어' }),
    )
    await user.type(screen.getByLabelText('이름'), '초코')
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()

    await user.upload(photoInput(container), new File(['x'], 'photo.png', { type: 'image/png' }))

    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeDisabled())
  })

  it('[AC-PET-PHOTO-002] 크기 상한을 넘는 사진은 업로드하지 않고 인라인으로 알린다', async () => {
    const user = userEvent.setup()
    const { container } = renderAt('/mypage/pets/new')
    await screen.findByLabelText('품종')

    const oversized = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'big.png', { type: 'image/png' })
    await user.upload(photoInput(container), oversized)

    expect(await screen.findByText(OVERSIZED_PHOTO_MESSAGE)).toBeInTheDocument()
  })

  it('[AC-PET-BREEDS-011] 체중이 허용 범위를 벗어나면 인라인으로 알리고 저장을 막는다', async () => {
    // 예전엔 범위 밖 값을 조용히 버려서, 사용자는 입력했다고 믿는데 저장이 안 됐다.
    const user = userEvent.setup()
    renderAt('/mypage/pets/new')

    await user.selectOptions(
      await screen.findByLabelText('품종'),
      await screen.findByRole('option', { name: '코리안 숏헤어' }),
    )
    await user.type(screen.getByLabelText('이름'), '초코')
    await user.type(screen.getByLabelText('체중'), '150')

    expect(await screen.findByText('체중은 0.1~100kg 사이로 입력해주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })
})
