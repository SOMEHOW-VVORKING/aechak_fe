import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_tabs/chat')({
  component: ChatScreen,
})

function ChatScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-title font-semibold text-text-primary">채팅</h1>
    </div>
  )
}
