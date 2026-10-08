import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { configureApiHosts } from '@aechak/api'
import { API_ORIGIN, SELLER_ORIGIN, server } from './testing/msw/server'

// 테스트는 main.tsx를 거치지 않으므로 호스트 구성을 여기서 실제 앱과 똑같이 세운다 —
// 그러지 않으면 호스트 분기가 무동작이라 모든 요청이 api로 몰리고, 셀러 모듈로 가야 할
// 요청이 잘못된 호스트로 나가도 테스트가 통과한다(실제 배포에서만 깨진다).
configureApiHosts({ apiOrigin: API_ORIGIN, sellerOrigin: SELLER_ORIGIN })

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

// jsdom에 없는 DOM API 스텁 — 상품 폼의 자동 스크롤과 이미지 미리보기/목업 업로드가 쓴다.
// 호출을 검증하는 테스트는 vi.spyOn으로 감싼다.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}
let objectUrlSeq = 0
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => `blob:mock/${objectUrlSeq++}`
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {}
}

// 모든 테스트에서 실네트워크를 전면 금지한다(기존 테스트는 HTTP 무호출 확인됨).
// 핸들러 없는 요청이 발생하면 그 자체를 실패로 본다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
