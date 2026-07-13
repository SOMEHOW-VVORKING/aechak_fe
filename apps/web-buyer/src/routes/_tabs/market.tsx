import { createFileRoute } from '@tanstack/react-router'
import { CatalogScreen } from '@/features/catalog'

// ?category=<중분류 라벨> — 홈 카테고리 칩 바로가기로 진입 시 초기 선택할 중분류.
export const Route = createFileRoute('/_tabs/market')({
  validateSearch: (search: Record<string, unknown>): { category?: string } => ({
    category: typeof search.category === 'string' ? search.category : undefined,
  }),
  component: MarketRoute,
})

function MarketRoute() {
  const { category } = Route.useSearch()
  return <CatalogScreen initialSubCategory={category} />
}
