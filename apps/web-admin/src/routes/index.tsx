import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex min-h-full items-center justify-center bg-surface-sunken py-24">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-text-primary">Aechak Admin</h1>
        <p className="mt-2 text-sm text-text-tertiary">플랫폼 어드민</p>
      </div>
    </div>
  )
}
