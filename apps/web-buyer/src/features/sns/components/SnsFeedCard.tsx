import { useNavigate } from '@tanstack/react-router'
import { MessageCircle, MoreHorizontal, PawPrint, Repeat2 } from 'lucide-react'
import { Avatar } from '@aechak/design-system/web'
import type { UseLoginGate } from '@/shared/auth'
import type { SnsFeedItem, SnsPost } from '../sns.queries'
import { petTagLabel, postDate, relativeTimeLabel } from '../sns.format'
import { SnsLikeButton } from './SnsLikeButton'
import { SnsHashtagLinks } from './SnsHashtagLinks'
import { SnsReactionButton } from './SnsReactionButton'

interface SnsFeedCardProps {
  item: SnsFeedItem
  onMore: (post: SnsPost) => void
  /** 좋아요, 리포스트, 저장 버튼의 로그인 게이트와 실패 안내. 상세 버튼과 같은 처리다(design 6절 4번) */
  requireAuth: UseLoginGate['requireAuth']
  onReactionError: (message: string) => void
  /** 다시 읽기가 실패해 받아 둔 값만 남은 피드면 반응 버튼을 잠근다(AGENTS.md 6절 7) */
  locked?: boolean
}

// 피드 카드(b7-st-1, design 6절 4번). item.post는 상세와 같은 SnsPostDetailResult라 상세 화면 타입을 그대로 쓴다.
// 카드 전체를 덮는 형제 버튼이 상세로 가고(ProductCard와 같은 방식) 작성자, 더보기, 해시태그, 영상은 그 위에 올린다. 해시태그는
// 그 태그의 게시물 목록을 연다(SNS-06). 저장 수는 그리지 않는다(A23). 리포스트 카드의 버튼도 원글에 한다.
export function SnsFeedCard({ item, onMore, requireAuth, onReactionError, locked }: SnsFeedCardProps) {
  const navigate = useNavigate()
  const { post, repostedBy } = item
  const photos = post.photoUrls

  const openProfile = () =>
    post.isMine
      ? navigate({ to: '/sns/me' })
      : navigate({ to: '/sns/users/$publicId', params: { publicId: post.author.publicId } })

  return (
    <article className="relative flex flex-col gap-3 px-4 py-4">
      {/* 팔로잉 피드에서 카드 순서 시각이 리포스트면 리포스트한 사람을 카드 위에 적는다(A1). */}
      {repostedBy && (
        <p className="flex min-w-0 items-center gap-1.5 text-caption text-text-tertiary">
          <Repeat2 className="size-3.5 flex-none" />
          <span className="truncate">{repostedBy.nickname}님이 리포스트했어요</span>
        </p>
      )}

      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={openProfile}
          className="relative z-[2] flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar name={post.author.nickname} src={post.author.profileImageUrl ?? undefined} size="lg" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              {/* 좁은 폭에서는 펫 태그가 먼저 줄어 작성자 닉네임을 끝까지 보인다. */}
              <span className="max-w-full flex-none truncate text-label font-semibold text-text-primary">
                {post.author.nickname}
              </span>
              {/* 게시할 때의 대표 펫. 나이는 게시일 기준이고 생년월이 없으면 품종만, 펫이 없거나 지웠으면 비운다(A5). */}
              {post.pet && (
                <span className="flex min-w-0 items-center gap-1 overflow-hidden text-caption text-text-secondary">
                  <PawPrint className="size-3 flex-none" />
                  <span className="truncate">{petTagLabel(post.pet, postDate(post.createdAt))}</span>
                </span>
              )}
            </span>
            <span className="flex gap-1.5 text-caption text-text-tertiary">
              <span>{relativeTimeLabel(post.createdAt)}</span>
              {post.edited && <span>수정됨</span>}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label="더보기"
          onClick={() => onMore(post)}
          className="relative z-[2] flex size-10 flex-none items-center justify-center rounded-full text-icon-muted focus-visible:outline-none focus-visible:shadow-focus-ring"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </header>

      {post.caption && (
        <p className="line-clamp-5 whitespace-pre-line break-keep break-words text-body leading-relaxed text-text-primary">
          {post.caption}
        </p>
      )}

      {post.hashtags.length > 0 && <SnsHashtagLinks hashtags={post.hashtags} />}

      {/* 사진은 1장이면 한 칸, 2장 이상이면 처음 2장을 두 칸으로 보이고 3장부터 남은 장수를 적는다(P7). */}
      {photos.length === 1 && (
        <img
          src={photos[0]}
          alt="사진 1/1"
          className="aspect-[4/3] w-full rounded-image bg-surface-sunken object-cover"
        />
      )}
      {photos.length > 1 && (
        <div className="grid grid-cols-2 gap-1">
          {photos.slice(0, 2).map((url, i) => (
            <div key={url} className="relative aspect-square overflow-hidden rounded-image bg-surface-sunken">
              <img src={url} alt={`사진 ${i + 1}/${photos.length}`} className="size-full object-cover" />
              {i === 1 && photos.length > 2 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-subheading font-semibold text-white">
                  +{photos.length - 2}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {/* 영상은 썸네일을 포스터로 둔 재생기로 그 자리에서 재생한다(P8). 상세로 가는 버튼 위에 올린다. */}
      {post.video && (
        <video
          src={post.video.url}
          poster={post.video.thumbnailUrl}
          controls
          playsInline
          preload="metadata"
          aria-label="영상"
          className="relative z-[2] aspect-square w-full rounded-image bg-black object-contain"
        />
      )}

      {/* 댓글 버튼은 SNS-04 댓글이 붙인다. 좋아요, 리포스트, 저장 버튼은 상세로 가는 버튼 위에 올린다. */}
      <div className="flex items-center gap-4 text-text-secondary">
        <div className="relative z-[2]">
          <SnsLikeButton post={post} requireAuth={requireAuth} onError={onReactionError} disabled={locked} />
        </div>
        <span className="flex items-center gap-1">
          <MessageCircle className="size-5" />
          <span className="sr-only">댓글</span>
          <span className="text-body-sm tabular-nums">{post.commentCount.toLocaleString('ko-KR')}</span>
        </span>
        <div className="relative z-[2]">
          <SnsReactionButton
            kind="repost"
            post={post}
            requireAuth={requireAuth}
            onError={onReactionError}
            disabled={locked}
          />
        </div>
        <div className="relative z-[2] ml-auto">
          <SnsReactionButton
            kind="save"
            post={post}
            requireAuth={requireAuth}
            onError={onReactionError}
            disabled={locked}
          />
        </div>
      </div>

      <button
        type="button"
        aria-label={`${post.author.nickname}님의 게시물 보기`}
        onClick={() =>
          navigate({
            to: '/sns/posts/$publicId',
            params: { publicId: post.publicId },
            search: { author: post.author.publicId },
          })
        }
        className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:shadow-focus-ring"
      />
    </article>
  )
}
