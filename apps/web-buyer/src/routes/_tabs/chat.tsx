import { createFileRoute } from '@tanstack/react-router'
import { MessageCircle } from 'lucide-react'
import { ComingSoon } from '@/shared/components/ComingSoon'

export const Route = createFileRoute('/_tabs/chat')({
  component: ChatScreen,
})

function ChatScreen() {
  return <ComingSoon icon={<MessageCircle className="size-6" />} />
}
