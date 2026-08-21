import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './testing/msw/server'

// jsdom은 window.scrollTo를 구현하지 않아 TanStack Router의 스크롤 복원이 "Not implemented"를
// 던진다 — 무해한 no-op으로 스텁한다(라우트 렌더 테스트 공통, web-buyer 관례).
window.scrollTo = () => {}

// jsdom에는 matchMedia가 없다 — AppShell(useIsNarrowViewport)이 라우트 렌더 테스트에서
// 죽지 않게 최소 구현을 스텁한다(항상 넓은 화면 = SideNav 펼침).
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// 모든 테스트에서 실네트워크를 전면 금지한다(기존 테스트는 HTTP 무호출 확인됨).
// 핸들러 없는 요청이 발생하면 그 자체를 실패로 본다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
