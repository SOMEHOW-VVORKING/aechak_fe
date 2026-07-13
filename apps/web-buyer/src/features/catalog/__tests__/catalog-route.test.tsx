import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
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

describe('/market', () => {
  it('[AC-CATALOG-005] ?category= 바로가기로 진입하면 해당 중분류가 초기 선택돼 결과가 걸러진다', async () => {
    renderAt('/market?category=' + encodeURIComponent('산책용품'))

    // 산책용품 카테고리 상품이 그리드에 보인다
    expect(await screen.findByText('자동 리드줄 5m 대형견용')).toBeInTheDocument()
    // 다른 카테고리(급식기) 상품은 걸러져 보이지 않는다
    expect(screen.queryByText('앱 연동 자동 급식기 6L 듀얼 호퍼')).not.toBeInTheDocument()
  })

  it('[AC-CATALOG-007] 첫 진입 시 카테고리 그리드는 닫혀 있고 토글로 펼치고 다시 접을 수 있다', async () => {
    const user = userEvent.setup()
    renderAt('/market')

    // 첫 진입 시 결과가 로드될 때까지 기다린다 (품절 제외 토글 버튼 등장으로 판단)
    await screen.findByRole('button', { name: '품절 제외' })
    // 기본은 닫힘 — 중분류 아이콘(산책용품)이 안 보인다
    expect(screen.queryByRole('button', { name: '산책용품' })).not.toBeInTheDocument()

    // 펼치면 중분류 그리드가 나타난다
    await user.click(screen.getByRole('button', { name: '카테고리' }))
    expect(await screen.findByRole('button', { name: '산책용품' })).toBeInTheDocument()

    // 다시 접으면 사라진다
    await user.click(screen.getByRole('button', { name: '카테고리' }))
    expect(screen.queryByRole('button', { name: '산책용품' })).not.toBeInTheDocument()
  })

  it('[AC-CATALOG-008] 품절 제외를 끄면 품절 상품이 그리드에 실제로 나타난다', async () => {
    const user = userEvent.setup()
    renderAt('/market')

    // 기본(품절 제외 on)에서는 품절 상품이 걸러져 안 보인다
    expect(await screen.findByText('츄르 참치맛 40개입')).toBeInTheDocument()
    expect(screen.queryByText('스크래쳐 하우스 2종 세트')).not.toBeInTheDocument()

    // 품절 제외 토글을 끄면 품절 상품이 나타난다
    await user.click(screen.getByRole('button', { name: '품절 제외' }))
    expect(await screen.findByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument()
  })

  it('[AC-CATALOG-009] 마켓 대분류 탭에서 브랜드관이 제거되고 남은 탭 전환은 정상 동작한다', async () => {
    const user = userEvent.setup()
    renderAt('/market')

    // 결과가 로드될 때까지 대기
    await screen.findByRole('button', { name: '품절 제외' })

    // 브랜드관 탭은 더 이상 렌더되지 않는다
    expect(screen.queryByRole('button', { name: '브랜드관' })).not.toBeInTheDocument()
    // 남은 대분류 탭(전체/강아지/고양이/공통)은 정상 렌더된다
    for (const label of ['전체', '강아지', '고양이', '공통']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }

    // 기본(전체)에서는 강아지 상품이 보인다
    expect(await screen.findByText('강아지 사료 연어 2kg')).toBeInTheDocument()

    // 고양이 탭으로 전환하면 고양이 상품만 남고 강아지 상품은 걸러진다
    await user.click(screen.getByRole('button', { name: '고양이' }))
    expect(await screen.findByText('츄르 참치맛 40개입')).toBeInTheDocument()
    expect(screen.queryByText('강아지 사료 연어 2kg')).not.toBeInTheDocument()
  })
})
