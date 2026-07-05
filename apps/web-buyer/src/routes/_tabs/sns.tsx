import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_tabs/sns')({
  component: SnsScreen,
})

function SnsScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-title font-semibold text-text-primary">SNS</h1>
    </div>
  )
}
