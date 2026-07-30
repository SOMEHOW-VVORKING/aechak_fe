import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { resetWishlist } from '@/shared/catalog'
import { logout, resetAuth } from '@/shared/auth'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('/ (홈 카테고리 칩 인플레이스 필터)', () => {
  beforeEach(() => {
    resetWishlist()
    resetAuth()
  })

  it('[AC-HOME-008] 칩을 누르면 화면 이동 없이 인기 랭킹이 그 카테고리로 좁혀진다', async () => {
    const user = userEvent.setup()
    renderAt('/')

    // 초기(전체)엔 여러 카테고리 상품이 함께 보인다
    expect(await screen.findByText('츄르 참치맛 40개입')).toBeInTheDocument() // 사료/간식
    expect(screen.getByText('대용량 모래 8.5L 벤토나이트')).toBeInTheDocument() // 위생/미용

    // 위생/미용 칩 선택 → 그 자리에서 좁혀진다
    await user.click(screen.getByRole('button', { name: '위생/미용' }))

    // 헤더가 선택 카테고리를 반영(괄호 표기)하고, 위생/미용 상품만 남는다
    expect(screen.getByText('지금 인기 있는 상품 (위생/미용)')).toBeInTheDocument()
    expect(screen.getByText('대용량 모래 8.5L 벤토나이트')).toBeInTheDocument()
    expect(screen.queryByText('츄르 참치맛 40개입')).not.toBeInTheDocument()

    // 화면 이동 없음 — 홈 앱바(애착)는 그대로이고, 마켓에만 있는 상품(홈 랭킹 밖)은 뜨지 않는다
    expect(screen.getByText('애착')).toBeInTheDocument()
    expect(screen.queryByText('슬리커 브러시 이중모용')).not.toBeInTheDocument()
  })

  it('[AC-HOME-015] 인기 랭킹은 상위 5개까지만 렌더된다(6위 이하 숨김)', async () => {
    renderAt('/')

    // 상위 5개(mock RANKING_IDS 1~5위)는 모두 보인다
    expect(await screen.findByText('대용량 모래 8.5L 벤토나이트')).toBeInTheDocument() // 1위
    expect(screen.getByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument() // 2위
    expect(screen.getByText('츄르 참치맛 40개입')).toBeInTheDocument() // 3위
    expect(screen.getByText('관절 영양제 코코넛맛 90정')).toBeInTheDocument() // 4위
    expect(screen.getByText('강아지 사료 연어 2kg')).toBeInTheDocument() // 5위

    // 6위(노즈워크 담요 장난감)는 상위 5 제한으로 잘려 어디에도 렌더되지 않는다
    // (추천 캐러셀 RECOMMENDED_IDS에도 없어, 부재 = 랭킹에서 잘린 것)
    expect(screen.queryByText('노즈워크 담요 장난감')).not.toBeInTheDocument()
  })

  it('[AC-HOME-009] "마켓에서 더 보기"는 선택 카테고리를 담아 마켓으로 이동한다', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await screen.findByText('츄르 참치맛 40개입')

    // 위생/미용 선택 후 더 보기 → 해당 카테고리가 열린 마켓으로 이동
    await user.click(screen.getByRole('button', { name: '위생/미용' }))
    await user.click(screen.getByRole('button', { name: '마켓에서 더 보기' }))

    // 마켓으로 전환(홈 앱바 '애착'이 사라짐)되고, 위생/미용(실 트리 categoryId 21) 카테고리가 적용돼
    // 그 카테고리의 실 API 상품(벤토나이트 고양이 모래)이 마켓 그리드에 보인다.
    await waitFor(() => expect(screen.getByText('벤토나이트 고양이 모래 8.5L')).toBeInTheDocument())
    expect(screen.queryByText('애착')).not.toBeInTheDocument()
    // 홈 랭킹(목업)에 있던 사료/간식 상품 문구는 마켓(실 API)에 없다
    expect(screen.queryByText('츄르 참치맛 40개입')).not.toBeInTheDocument()
  })
})

describe('/ (추천 상품 캐러셀)', () => {
  beforeEach(() => {
    resetWishlist()
    resetAuth()
  })

  it('[AC-HOME-013] 캐러셀이 추천 상품을 보여주고 카드 탭이 상세로 이동한다', async () => {
    const user = userEvent.setup()
    renderAt('/')

    // 섹션 헤더는 비개인화 문구("이런 상품은 어때요?")
    expect(await screen.findByText('이런 상품은 어때요?')).toBeInTheDocument()
    // 랭킹에 없는 추천 전용 상품(쿨매트)이 캐러셀에 렌더된다 → 추천이 별개 큐레이션임을 확인
    const card = await screen.findByRole('button', { name: '여름 쿨매트 젤 방석 L 상세 보기' })

    // 카드 탭 → 상품 상세로 실제 이동(장식 아님)
    await user.click(card)
    expect(await screen.findByText('상품 정보')).toBeInTheDocument()
    // 홈에서 벗어남 — 홈 앱바('애착')는 더 이상 보이지 않는다
    expect(screen.queryByText('애착')).not.toBeInTheDocument()
  })

  it('[AC-HOME-014] 비회원이 캐러셀 하트를 누르면 게이트가 뜨고 찜은 토글되지 않는다', async () => {
    const user = userEvent.setup()
    logout()
    renderAt('/')

    // 캐러셀 하트(미찜 상품 = "찜하기")를 찾는다
    const hearts = await screen.findAllByRole('button', { name: '찜하기' })
    const initialCount = hearts.length
    expect(initialCount).toBeGreaterThan(0)

    await user.click(hearts[0]!)

    // 게이트가 뜨고, 찜은 그대로(토글 안 됨) — "찜하기" 개수가 유지된다
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '찜하기' })).toHaveLength(initialCount)
  })
})
