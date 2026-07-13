import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
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
