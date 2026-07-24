import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { HttpResponse, delay, http } from 'msw'
import { setAccessToken, setOnAuthExpired } from '@aechak/api'
import { getPets, resetPets } from '@/shared/pet'
import { BREEDS_URL, WEB_REFRESH_URL, server } from '@/testing/msw/server'
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

describe('펫 폼 품종 Select — breeds API 연동', () => {
  beforeEach(() => {
    resetPets()
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
        HttpResponse.json({ errorCode: 20005, message: '로그인이 필요합니다.' }, { status: 401 }),
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
          : HttpResponse.json({ errorCode: 20005, message: '만료' }, { status: 401 }),
      ),
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'new-token', tokenType: 'Bearer', expiresIn: 3600 } }),
      ),
    )
    renderAt('/mypage/pets/new')

    // 재시도가 새 토큰을 달고 나가야 품종이 뜬다 — 헤더를 안 갈아끼우면 계속 401 → 로그인으로 튕긴다.
    expect(await screen.findByRole('option', { name: '코리안 숏헤어' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '카카오로 시작하기' })).not.toBeInTheDocument()
  })

  it('[AC-PET-BREEDS-006] 품종 선택 후 저장하면 breed 라벨과 breedId가 함께 저장된다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/pets/new')

    await user.click(await screen.findByRole('tab', { name: '강아지' }))
    const select = screen.getByLabelText('품종')
    await user.selectOptions(select, await screen.findByRole('option', { name: '푸들' }))
    await user.type(screen.getByLabelText('이름'), '탄이')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(
      () => {
        expect(getPets().find(p => p.name === '탄이')).toMatchObject({
          species: 'dog',
          breed: '푸들',
          breedId: 279,
        })
      },
      { timeout: 2000 }, // useSavePet의 실제 400ms 지연
    )
  })

  it('[AC-PET-BREEDS-007] 라벨만 저장된 시드 펫 편집 시 품종이 프리필되고 저장하면 breedId가 백필된다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/pets')

    // 첫 카드 = 코코(cat, breed '코리안 숏헤어', breedId 없음)
    await user.click((await screen.findAllByRole('button', { name: '수정' }))[0]!)
    const select = await screen.findByLabelText('품종')
    await waitFor(() => expect(select).toHaveValue('369'))

    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(
      () => {
        expect(getPets().find(p => p.id === 'pet-coco')).toMatchObject({
          breed: '코리안 숏헤어',
          breedId: 369,
        })
      },
      { timeout: 2000 },
    )
  })

  it('[AC-PET-BREEDS-008] 편집 중 종을 바꾸고 품종 미선택으로 저장하면 breed/breedId가 모두 비워진다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/pets')

    await user.click((await screen.findAllByRole('button', { name: '수정' }))[0]!)
    await screen.findByLabelText('품종')
    await user.click(screen.getByRole('tab', { name: '강아지' }))
    await screen.findByRole('option', { name: '푸들' }) // DOG 목록 로드 대기

    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(
      () => {
        const coco = getPets().find(p => p.id === 'pet-coco')!
        expect(coco.species).toBe('dog')
        expect(coco.breed).toBeUndefined()
        expect(coco.breedId).toBeUndefined()
      },
      { timeout: 2000 },
    )
  })
})
