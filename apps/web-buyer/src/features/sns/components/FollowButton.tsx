import { Check } from 'lucide-react'
import { Button } from '@aechak/design-system/web'

// 팔로우 토글(b7-st-4 4-A/4-B, b7-st-5). 팔로우 중이면 neutral(secondary) + 체크, 아니면 brand(primary).
export function FollowButton({
  following,
  loading,
  onClick,
  className,
}: {
  following: boolean
  loading: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <Button
      size="sm"
      variant={following ? 'secondary' : 'primary'}
      leftIcon={following ? <Check className="size-4" /> : undefined}
      loading={loading}
      onClick={onClick}
      className={className}
    >
      {following ? '팔로잉' : '팔로우'}
    </Button>
  )
}
