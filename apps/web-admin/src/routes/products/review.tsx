import { createFileRoute, redirect } from '@tanstack/react-router'

// 옛 경로. 화면이 '상품 검수 관리'(목 데이터)에서 '상품 카탈로그 관리'(실연동)로 바뀌면서
// 경로도 `/products/catalog`으로 옮겼다 — 이름이 검수 큐와 닮아 운영자가 가짜 쪽을 먼저 누른
// 사고(SCRUM-313)를 이름에서 끊는 것이 이번 변경이고, 경로에 'review'가 남으면 같은 혼동이
// 주소창과 문서에 남는다. 북마크·노트가 옛 경로를 가리키고 있으니 라우트는 지우지 않고 보낸다.
export const Route = createFileRoute('/products/review')({
  beforeLoad: () => {
    throw redirect({ to: '/products/catalog', replace: true })
  },
})
