import { createRootRoute, redirect } from '@tanstack/react-router'
import { errorResponse, getAccessToken, getSellerApplication, restoreSession } from '@aechak/api'
import { AppShell } from '../shared/components/AppShell'

// 로그인 플로우는 세션 없이 들어오는 것이 정상이라 가드 밖에 둔다 — AppShell이 SideNav를
// 빼는 경계와 같다. 여기에 경로를 더할 일이 생기면 pathless layout으로 전환할 것.
function isLoginFlow(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/login/')
}

// 스토어 설정 화면이 입점 신청을 겸한다 — 셀러가 아닌 계정이 신청하러 들어오는 곳이라
// 자격 검사에서 제외한다. 여기만 열어 두면 승인 전에는 다른 메뉴로 샐 길이 없다.
function allowsNonSeller(pathname: string): boolean {
  return pathname === '/store-settings' || pathname.startsWith('/store-settings/')
}

export const Route = createRootRoute({
  /**
   * 셀러센터 진입 가드 2단.
   *
   * 1. 세션 — refresh 쿠키는 도메인 없이 api 호스트에 묶이므로 구매자·어드민에서 로그인한
   *    세션도 여기서 복원된다. 복원 자체는 설계대로다(한 계정이 역할을 겸한다). 다만 그
   *    쿠키만으로 셀러센터가 열려 버리는 것이 문제라 2단에서 자격을 따로 본다.
   * 2. 셀러 자격 — 토큰으로는 판정할 수 없다. 서버가 UserRole에서 SELLER를 지우고
   *    "sellers 행(ACTIVE) 존재"로 판정하기 때문이다. 신청 현황(APPROVED)으로 대신 본다.
   *
   * beforeLoad라 네비게이션당 1회 실행되고 StrictMode 이중 마운트 영향이 없다
   * (web-buyer /_tabs/ 관례).
   */
  beforeLoad: async ({ location }) => {
    const pathname = location.pathname
    if (isLoginFlow(pathname)) return

    if (!getAccessToken()) {
      try {
        await restoreSession()
      } catch (error) {
        // refresh 401(쿠키 없음·만료·재사용) = 세션 없음 → 로그인.
        // 네트워크·5xx는 세션 유무를 모르니 화면에 맡긴다(각 화면이 자기 오류를 그린다).
        if (errorResponse(error)?.status === 401) {
          throw redirect({ to: '/login', replace: true })
        }
        return
      }
    }

    if (allowsNonSeller(pathname)) return

    // redirect는 throw로 동작하므로 try 밖에서 던진다 — 안에서 던지면 아래 catch가 삼킨다.
    let needsApplication: boolean
    try {
      const response = await getSellerApplication()
      needsApplication = response.data.status !== 'APPROVED'
    } catch (error) {
      const status = errorResponse(error)?.status
      // 404/10100 = 신청 이력 없음(아직 신청 전) → 입점 신청으로 보낸다.
      // 401 = 방금 복원한 세션이 그사이 끊김 → 로그인으로.
      if (status === 401) throw redirect({ to: '/login', replace: true })
      if (status === 404) {
        needsApplication = true
      } else {
        // 네트워크·5xx는 자격을 모르는 것이지 자격이 없는 것이 아니다 — 막지 않는다.
        return
      }
    }
    if (needsApplication) {
      throw redirect({ to: '/store-settings', replace: true })
    }
  },
  component: AppShell,
})
