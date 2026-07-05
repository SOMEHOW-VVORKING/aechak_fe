import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_tabs/mypage')({
  component: MyPageScreen,
})

function MyPageScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-title font-semibold text-text-primary">마이</h1>
    </div>
  )
}
