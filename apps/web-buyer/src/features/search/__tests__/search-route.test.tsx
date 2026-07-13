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

describe('/search', () => {
  it('[AC-SEARCH-006] 전체 삭제를 누르면 최근 검색어가 비고 빈 상태가 나타난다', async () => {
    const user = userEvent.setup()
    renderAt('/search')

    await user.click(await screen.findByText('전체 삭제'))

    expect(await screen.findByText('최근 검색한 상품이 여기에 표시돼요')).toBeInTheDocument()
  })

  it('[AC-SEARCH-007] 검색어를 탭하면 검색 결과 화면으로 이동해 매칭 상품이 보인다', async () => {
    const user = userEvent.setup()
    renderAt('/search')

    await user.click(await screen.findByRole('button', { name: '츄르' }))

    expect(await screen.findByText('츄르 참치맛 40개입')).toBeInTheDocument()
  })
})

describe('/search/results', () => {
  it('[AC-SEARCH-008] 품절 제외 칩을 끄면 품절 상품이 결과에 나타난다', async () => {
    const user = userEvent.setup()
    renderAt('/search/results?q=스크래쳐')

    // 기본 품절 제외(on) — 품절 상품만 매칭돼 결과가 없다.
    expect(await screen.findByText(/검색 결과가 없어요/)).toBeInTheDocument()

    // 품절 제외 칩을 눌러 끄면 품절 상품이 결과에 나타난다.
    await user.click(screen.getByRole('button', { name: '품절 제외' }))
    expect(await screen.findByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument()
  })

  it('[AC-SEARCH-010] 품절 제외 칩이 기본 ON(aria-pressed)으로 렌더된다', async () => {
    const user = userEvent.setup()
    renderAt('/search/results?q=급식기')

    // 결과 로드 확인 후 칩 상태 검사.
    expect(await screen.findByText('스테인리스 급식기 타이머형')).toBeInTheDocument()

    const chip = screen.getByRole('button', { name: '품절 제외' })
    // 기본값 excludeSoldOut: true → 활성(aria-pressed=true)으로 렌더.
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    // 끄면 비활성으로 바뀐다(토글 동작 보존).
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('[AC-SEARCH-011] 결과 없음 화면이 따옴표 없이 검색어를 강조해 보여준다', async () => {
    renderAt('/search/results?q=존재하지않는상품zz')

    const heading = await screen.findByText(/검색 결과가 없어요/)
    // 검색어는 (마크업 강조로) 화면에 함께 노출된다.
    expect(screen.getByText('존재하지않는상품zz')).toBeInTheDocument()
    // 곡선/직선 따옴표 문자가 없어야 한다(카피 관례: 직접 인용부호 금지).
    expect(heading.parentElement?.textContent ?? '').not.toMatch(/['"‘’“”]/)
  })

  it('[AC-SEARCH-009] 가격 칩은 전체 필터 시트가 아니라 가격대 전용 시트를 열고 프리셋이 결과에 반영된다', async () => {
    const user = userEvent.setup()
    renderAt('/search/results?q=급식기')

    // 결과 로드 확인.
    expect(await screen.findByText('스테인리스 급식기 타이머형')).toBeInTheDocument()

    // 가격 칩 → 가격대 전용 시트(전체 필터 시트의 '최소 평점' 섹션은 열리지 않음).
    await user.click(screen.getByRole('button', { name: '가격' }))
    expect(await screen.findByText('가격대')).toBeInTheDocument()
    expect(screen.queryByText('최소 평점')).not.toBeInTheDocument()

    // '3만원 이하' 프리셋 선택 → 모든 급식기(최저 45,000원)가 빠져 결과가 없다.
    await user.click(screen.getByRole('button', { name: '3만원 이하' }))
    expect(await screen.findByText(/검색 결과가 없어요/)).toBeInTheDocument()
  })
})
