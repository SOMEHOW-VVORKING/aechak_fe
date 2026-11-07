import { useRef } from 'react'
import { Hash } from 'lucide-react'
import { EmptyState, MobileScreen } from '@aechak/design-system/web'
import { LoginGate, useLoginGate } from '@/shared/auth'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { useSnsHashtagPosts, type SnsSearchSort } from '../sns.queries'
import { SnsPostList } from './SnsPostList'
import { SnsSortChips } from './SnsSortChips'

// 해시태그 게시물 목록(b7-st-6 6-D, CRQ-SNS-14). 게시물의 해시태그와 검색 해시태그 세그먼트의 행이 연다. 헤더의 게시글 수는
// 보는 사람의 차단과 뮤트로 바꾸지 않아 목록의 글 수보다 클 수 있다(P10). 글이 없으면 게시글 수 0과 빈 상태다(P11).
export function SnsHashtagPostsScreen({
  name,
  sort,
  onSortChange,
}: {
  name: string
  sort: SnsSearchSort
  onSortChange: (sort: SnsSearchSort) => void
}) {
  const goBack = useSafeBack({ to: '/sns/feed' })
  const posts = useSnsHashtagPosts(name, sort)
  const { gateOpen, gateFeature, gateResume, requireAuth, closeGate } = useLoginGate()
  const backRef = useRef<HTMLButtonElement>(null)
  const hashtag = posts.data?.hashtag

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} backRef={backRef} title={`#${hashtag?.name ?? name}`} />}>
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-1">
        {hashtag ? (
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-sunken px-2.5 text-caption text-text-secondary">
            <Hash className="size-3" />
            게시글 <span className="tabular-nums">{hashtag.postCount.toLocaleString('ko-KR')}</span>
          </span>
        ) : (
          <span />
        )}
        <SnsSortChips sort={sort} onChange={onSortChange} />
      </div>
      <SnsPostList
        feed={{ ...posts, data: posts.data?.items }}
        empty={<EmptyState icon={<Hash className="size-6" />} title="이 해시태그가 달린 게시물이 없어요" />}
        requireAuth={requireAuth}
        focusRef={backRef}
      />
      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} resume={gateResume} />
    </MobileScreen>
  )
}
