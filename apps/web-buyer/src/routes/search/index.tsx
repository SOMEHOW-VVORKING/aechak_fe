import { createFileRoute } from '@tanstack/react-router'
import { SearchScreen } from '@/features/search'

// full-bleed(탭바 없음) — __root에 직접 매달린다. _tabs 자식이 아니므로 하단 탭바가 뜨지 않는다.
export const Route = createFileRoute('/search/')({
  component: SearchScreen,
})
