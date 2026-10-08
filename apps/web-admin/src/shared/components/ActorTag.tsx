import { Bot, UserCog } from 'lucide-react'
import { Tag } from './Tag'

export function ActorTag({ actor }: { actor: 'ai' | 'admin' }) {
  return actor === 'ai' ? (
    <Tag tone="info">
      <Bot className="size-3" />
      AI 자동
    </Tag>
  ) : (
    <Tag tone="brand">
      <UserCog className="size-3" />
      관리자
    </Tag>
  )
}
