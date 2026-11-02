import { createRootRoute, Outlet } from '@tanstack/react-router'
import { restoreSessionOrGuest } from '@/shared/auth'

export const Route = createRootRoute({
  // 어느 화면이 그려지기 전에 세션을 한 번 확인한다. access 토큰은 메모리에만 있어 새로고침·공유
  // 링크 진입에서는 비어 있으므로, 확인 없이 렌더하면 회원도 비회원으로 보이고(거짓 상태) 비회원은
  // 회원 전용 요청을 쏴 401 → 전역 로그인 리다이렉트로 게스트 카탈로그에 닿지 못한다.
  // 두 번째 네비게이션부터는 상태가 이미 확정이라 요청을 보내지 않는다(restoreSessionOrGuest 참고).
  // /login/complete는 예외다 — 그 라우트가 직접 refresh로 세션을 수령하므로, 여기서 먼저 쏘면
  // refresh 쿠키를 연달아 두 번 회전시킨다. 꼬리 슬래시는 떼고 비교한다: 라우터는 `/login/complete/`도
  // 같은 라우트로 매칭하지만 pathname에는 슬래시가 남아, 문자열 그대로 비교하면 예외가 빗나간다.
  beforeLoad: ({ location }) =>
    location.pathname.replace(/\/+$/, '') === '/login/complete' ? undefined : restoreSessionOrGuest(),
  component: RootLayout,
})

// Mobile-web first (and later thin-WebView) shell: no desktop chrome like
// SideNav — each route owns its own full-bleed screen via `MobileScreen`.
// On wide viewports the app is framed to a phone-width column so it stays
// legible instead of stretching edge-to-edge.
//
// `[transform:translateZ(0)]` on the frame is load-bearing: a non-`none`
// transform makes this div the containing block for every `position:fixed`
// descendant (BottomSheet / Modal / Drawer / Toast). Without it those
// overlays anchor to the viewport and, on desktop, spill past the phone
// frame's edges. With it, scrim + panel are clipped to the 430px frame in
// one place — the design-system components need no per-app width hardcoding.
function RootLayout() {
  return (
    <div className="min-h-dvh w-full bg-surface-sunken sm:flex sm:justify-center">
      <div className="min-h-dvh w-full bg-surface-base [transform:translateZ(0)] sm:max-w-[430px] sm:shadow-card">
        <Outlet />
      </div>
    </div>
  )
}
