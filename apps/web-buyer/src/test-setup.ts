import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetSearchFixtures, server } from './testing/msw/server'

// jsdom은 window.scrollTo를 구현하지 않아 TanStack Router의 스크롤 복원이 "Not implemented"를
// 던진다 — 무해하지만 노이즈이고, 예외가 전환 중 리렌더를 유발해 테스트 노드를 detach시키므로
// 무해한 no-op으로 스텁한다(라우트 렌더 테스트 공통).
window.scrollTo = () => {}

// 모든 테스트에서 실네트워크를 전면 금지한다(기존 테스트는 HTTP 무호출 확인됨).
// 핸들러 없는 요청이 발생하면 그 자체를 실패로 본다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  resetSearchFixtures()
})
afterAll(() => server.close())
