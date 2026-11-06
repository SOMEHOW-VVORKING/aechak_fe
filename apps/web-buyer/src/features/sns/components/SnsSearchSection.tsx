import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, Users } from 'lucide-react'
import { Avatar, Button, Skeleton } from '@aechak/design-system/web'
import {
  SNS_SECTION_SIZE,
  snsSearchable,
  useSnsSearchHashtags,
  useSnsSearchPosts,
  useSnsSearchUsers,
  type SnsPost,
  type SnsSearchSegment,
} from '../sns.queries'

const LINK_COPY: Record<Exclude<SnsSearchSegment, 'posts'>, string> = {
  users: '계정 검색 결과 보기',
  hashtags: '해시태그 검색 결과 보기',
}

/**
 * 게시물이 없을 때 보여줄 링크(R3-14). 계정 결과가 있으면 계정, 없으면 해시태그 세그먼트다. 계정 조회가 끝나기 전에는 고르지
 * 않는다. 해시태그를 먼저 그렸다가 계정으로 바꾸게 된다.
 */
export function snsSectionLink(
  users: { settled: boolean; count: number },
  hashtagCount: number,
): Exclude<SnsSearchSegment, 'posts'> | null {
  if (!users.settled) return null
  if (users.count > 0) return 'users'
  return hashtagCount > 0 ? 'hashtags' : null
}

// 미디어가 없는 글은 썸네일 자리에 본문 앞부분을 보여준다(A20).
function Thumb({ post }: { post: SnsPost }) {
  const src = post.photoUrls[0] ?? post.video?.thumbnailUrl
  if (src) return <img src={src} alt="" className="size-12 flex-none rounded-image bg-surface-sunken object-cover" />
  return (
    <span aria-hidden="true" className="size-12 flex-none overflow-hidden rounded-image bg-surface-sunken px-1 py-0.5">
      <span className="line-clamp-3 break-keep break-words text-badge text-text-secondary">{post.caption}</span>
    </span>
  )
}

function Row({ post }: { post: SnsPost }) {
  const navigate = useNavigate()
  // 본문이 없는 글은 본문 일부 대신 해시태그를 보여준다(P15).
  const excerpt = post.caption ?? post.hashtags.map(tag => `#${tag}`).join(' ')
  return (
    <li>
      <button
        type="button"
        onClick={() =>
          void navigate({
            to: '/sns/posts/$publicId',
            params: { publicId: post.publicId },
            search: { author: post.author.publicId },
          })
        }
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        <Avatar name={post.author.nickname} src={post.author.profileImageUrl ?? undefined} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-label font-semibold text-text-primary">{post.author.nickname}</span>
            {post.edited && <span className="flex-none text-caption text-text-tertiary">수정됨</span>}
          </span>
          <span className="block truncate text-body-sm text-text-secondary">{excerpt}</span>
        </span>
        <Thumb post={post} />
      </button>
    </li>
  )
}

// 통합 검색 전체 탭의 SNS 섹션(b12-st-2). 게시물 검색 인기순 5개와 결과 수, 다음 페이지가 있을 때만 더보기를 둔다(sns.yaml SNS-06
// FE 1). 결과 수는 보는 사람의 차단과 뮤트로 바꾸지 않아 보이는 글이 없어도 0보다 클 수 있다(P10, P14). 이 섹션만 실패하면 마켓
// 섹션은 그대로 두고 이 자리에만 다시 시도를 둔다(P18).
export function SnsSearchSection({
  keyword,
  onOpen,
  onSearched,
}: {
  keyword: string
  /** 같은 검색어로 SNS 탭의 그 세그먼트를 연다 */
  onOpen: (segment: SnsSearchSegment) => void
  onSearched?: () => void
}) {
  const searchable = snsSearchable(keyword)
  const posts = useSnsSearchPosts(keyword, 'POPULAR', { size: SNS_SECTION_SIZE, onSearched })
  // 첫 페이지가 비어도 다음 페이지가 남았으면 보이는 글이 있다(인기순은 페이지마다 차단과 뮤트를 다시 거른다)
  const noPosts = posts.data?.items.length === 0 && !posts.hasNextPage
  const users = useSnsSearchUsers(keyword, { size: 1, enabled: noPosts })
  const hashtags = useSnsSearchHashtags(keyword, { size: 1, enabled: noPosts })
  const link = noPosts
    ? snsSectionLink({ settled: users.isSuccess, count: users.data?.length ?? 0 }, hashtags.data?.length ?? 0)
    : null
  const total = searchable ? posts.data?.totalCount : 0

  let body
  if (!searchable) {
    body = <p className="px-4 py-3 text-body-sm text-text-tertiary">검색 결과가 없어요</p>
  } else if (posts.isPending) {
    body = (
      <div role="status" aria-label="SNS 검색 결과를 불러오는 중" className="flex flex-col gap-3 px-4 py-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    )
  } else if (!posts.data) {
    body = (
      <div className="flex flex-col items-center gap-3 px-4 py-4 text-center">
        <p className="text-body-sm text-text-secondary">SNS 검색 결과를 불러오지 못했어요</p>
        <Button size="sm" variant="secondary" onClick={() => void posts.refetch()}>
          다시 시도
        </Button>
      </div>
    )
  } else if (noPosts) {
    body = (
      <div className="flex flex-col items-start gap-2 px-4 py-3">
        <p className="text-body-sm text-text-tertiary">검색 결과가 없어요</p>
        {link && (
          <button
            type="button"
            onClick={() => onOpen(link)}
            className="inline-flex items-center gap-0.5 text-body-sm font-medium text-text-brand"
          >
            {LINK_COPY[link]}
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>
    )
  } else {
    body = (
      <>
        {posts.data.items.length > 0 && (
          <ul>
            {posts.data.items.map(item => (
              <Row key={item.post.publicId} post={item.post} />
            ))}
          </ul>
        )}
        {posts.hasNextPage && (
          <button
            type="button"
            onClick={() => onOpen('posts')}
            className="flex w-full items-center justify-center gap-0.5 px-4 py-3 text-body-sm font-medium text-text-secondary"
          >
            SNS 결과 {(total ?? 0).toLocaleString('ko-KR')}개 더보기
            <ChevronRight className="size-4" />
          </button>
        )}
      </>
    )
  }

  return (
    <section aria-label="SNS 검색 결과">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="flex items-center gap-1.5 text-label font-semibold text-text-primary">
          <Users className="size-3.5 text-icon-muted" />
          SNS
        </h2>
        {total != null && (
          <span className="text-caption text-text-tertiary">
            <span className="font-semibold tabular-nums text-text-secondary">{total.toLocaleString('ko-KR')}</span>개
          </span>
        )}
      </div>
      {body}
    </section>
  )
}
