import { createRootRoute } from '@tanstack/react-router'
import { AppShell } from '../shared/components/AppShell'

export const Route = createRootRoute({
  component: AppShell,
})
