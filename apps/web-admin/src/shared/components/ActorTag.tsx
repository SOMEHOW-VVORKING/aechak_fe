import { Bot, UserCog } from 'lucide-react'

export function ActorTag({ actor }: { actor: 'ai' | 'admin' }) {
  return actor === 'ai' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-info-surface px-2 py-0.5 text-caption font-medium text-info-fg">
      <Bot className="size-3" />
      AI 자동
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-medium text-brand">
      <UserCog className="size-3" />
      관리자
    </span>
  )
}
