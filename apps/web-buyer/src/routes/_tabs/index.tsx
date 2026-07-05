import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_tabs/')({
  component: HomeScreen,
})

function HomeScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-title font-semibold text-text-primary">홈</h1>
    </div>
  )
}
