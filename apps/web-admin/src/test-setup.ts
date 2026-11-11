import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { configureApiHosts } from '@aechak/api'
import { ADMIN_ORIGIN, API_ORIGIN, server } from './testing/msw/server'

// 테스트는 main.tsx를 거치지 않으므로 호스트 구성을 여기서 실제 앱과 똑같이 세운다 —
// 그러지 않으면 호스트 분기가 무동작이라 모든 요청이 api로 몰리고, 어드민 모듈로 가야 할
// 요청이 잘못된 호스트로 나가도 테스트가 통과한다(실제 배포에서만 깨진다).
configureApiHosts({ apiOrigin: API_ORIGIN, adminOrigin: ADMIN_ORIGIN })

// findBy/waitFor 기본 1초는 CI에서 세 앱 suite가 CPU를 나눠 쓰면 모자라 무작위로 실패한다.
configure({ asyncUtilTimeout: 3_000 })

// jsdom은 window.scrollTo를 구현하지 않아 TanStack Router의 스크롤 복원이 "Not implemented"를
// 던진다 — 무해한 no-op으로 스텁한다(web-buyer·web-seller 관례).
window.scrollTo = () => {}

// jsdom의 window.open은 "Not implemented"를 던진다. 서류 열기는 클릭 제스처 안에서 빈 탭을
// 먼저 확보하고 URL을 나중에 채우므로, 스텁이 null을 돌려주면 모든 테스트가 "팝업 차단" 분기로
// 떨어진다 — 기본값은 "팝업이 열린다"로 두고, 차단과 URL 주입을 보는 테스트는
// vi.spyOn(window, 'open')으로 각자 가짜 탭이나 null을 돌려준다.
window.open = () => ({ location: { href: '' }, opener: null, close: () => {} }) as unknown as Window

// 모든 테스트에서 실네트워크를 전면 금지한다. 핸들러 없는 요청이 발생하면 그 자체를 실패로 본다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  // resetHandlers는 핸들러만 되돌리고 server.events 리스너는 남긴다 — 테스트 사이에
  // 리스너가 누적되지 않게 함께 떼어 낸다.
  server.events.removeAllListeners()
})
afterAll(() => server.close())
