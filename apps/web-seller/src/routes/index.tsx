import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="p-6">
      <h1 className="text-heading font-semibold text-text-primary">대시보드</h1>
      <p className="mt-2 text-body-sm text-text-tertiary">셀러 어드민</p>
    </div>
  )
}
