import { Check } from 'lucide-react'
import { Button } from '@aechak/design-system/web'

// 팔로우 토글(b7-st-4 4-A/4-B, b7-st-5). 팔로우 중이면 neutral(secondary) + 체크, 아니면 brand(primary).
export function FollowButton({
  following,
  loading,
  disabled,
  onClick,
  className,
  ariaLabel,
}: {
  following: boolean
  loading: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
  /** 목록처럼 버튼이 여럿이면 누구에 대한 버튼인지 닉네임을 넣는다 */
  ariaLabel?: string
}) {
  return (
    <Button
      size="sm"
      variant={following ? 'secondary' : 'primary'}
      leftIcon={following ? <Check className="size-4" /> : undefined}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
    >
      {following ? '팔로잉' : '팔로우'}
    </Button>
  )
}
