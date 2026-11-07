import { useNavigate } from '@tanstack/react-router'

// 게시물에 달린 해시태그(SNS-02 칩). 누르면 그 태그의 게시물 목록을 연다(CRQ-SNS-14). 캡션에 직접 쓴 #단어는 태그가 아니다(P5).
// 피드 카드에서는 상세로 가는 버튼 위에 올린다.
export function SnsHashtagLinks({ hashtags, className = '' }: { hashtags: string[]; className?: string }) {
  const navigate = useNavigate()
  return (
    <ul aria-label="해시태그" className={`flex flex-wrap gap-x-2 gap-y-1 ${className}`}>
      {hashtags.map(tag => (
        <li key={tag}>
          <button
            type="button"
            onClick={() => void navigate({ to: '/sns/hashtags/$name', params: { name: tag } })}
            className="relative z-[2] rounded-sm text-body-sm font-medium text-text-brand focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            #{tag}
          </button>
        </li>
      ))}
    </ul>
  )
}
