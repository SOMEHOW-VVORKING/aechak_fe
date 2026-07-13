import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { ComingSoon } from '@/shared/components/ComingSoon'

export const Route = createFileRoute('/_tabs/sns')({
  component: SnsScreen,
})

function SnsScreen() {
  return <ComingSoon icon={<Users className="size-6" />} />
}
