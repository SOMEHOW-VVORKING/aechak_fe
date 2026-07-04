import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootLayout,
})

// Mobile-web first (and later thin-WebView) shell: no desktop chrome like
// SideNav — each route owns its own full-bleed screen via `MobileScreen`.
// On wide viewports the app is framed to a phone-width column so it stays
// legible instead of stretching edge-to-edge.
function RootLayout() {
  return (
    <div className="min-h-dvh w-full bg-surface-sunken sm:flex sm:justify-center">
      <div className="min-h-dvh w-full bg-surface-base sm:max-w-[430px] sm:shadow-card">
        <Outlet />
      </div>
    </div>
  )
}
