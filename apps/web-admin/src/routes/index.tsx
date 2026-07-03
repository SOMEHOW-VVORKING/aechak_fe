import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Aechak Admin</h1>
        <p className="mt-2 text-sm text-gray-500">플랫폼 어드민</p>
      </div>
    </div>
  )
}
