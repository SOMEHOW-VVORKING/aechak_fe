import { useNavigate } from '@tanstack/react-router'
import { Heart, MessageCircle, MoreHorizontal, PawPrint, Repeat2 } from 'lucide-react'
import { Avatar } from '@aechak/design-system/web'
import type { SnsFeedItem, SnsPost } from '../sns.queries'
import { petTagLabel, postDate, relativeTimeLabel } from '../sns.format'

interface SnsFeedCardProps {
  item: SnsFeedItem
  onMore: (post: SnsPost) => void
}

// 피드 카드(b7-st-1, design 6절 4번). item.post는 상세와 같은 SnsPostDetailResult라 상세 화면 타입을 그대로 쓴다.
// 카드 전체를 덮는 형제 버튼이 상세로 가고(ProductCard와 같은 방식) 작성자, 더보기, 영상은 그 위에 올린다. 해시태그는
// SNS-06 목록 라우트 전까지 다른 본문처럼 상세를 연다. 저장 수는 그리지 않는다(A23).
export function SnsFeedCard({ item, onMore }: SnsFeedCardProps) {
  const navigate = useNavigate()
  const { post, repostedBy } = item
  const photos = post.photoUrls

  const openProfile = () =>
    post.isMine
      ? navigate({ to: '/sns/me' })
      : navigate({ to: '/sns/users/$publicId', params: { publicId: post.author.publicId } })

  const counts = [
    { label: '좋아요', value: post.likeCount, icon: <Heart className="size-5" /> },
    { label: '댓글', value: post.commentCount, icon: <MessageCircle className="size-5" /> },
    { label: '리포스트', value: post.repostCount, icon: <Repeat2 className="size-5" /> },
  ]

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
              <span className="truncate text-label font-semibold text-text-primary">{post.author.nickname}</span>
              {/* 게시할 때의 대표 펫. 나이는 게시일 기준이고 생년월이 없으면 품종만, 펫이 없거나 지웠으면 비운다(A5). */}
              {post.pet && (
                <span className="flex flex-none items-center gap-1 text-caption text-text-secondary">
                  <PawPrint className="size-3" />
                  {petTagLabel(post.pet, postDate(post.createdAt))}
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
        <p className="line-clamp-5 whitespace-pre-line break-words text-body leading-relaxed text-text-primary">
          {post.caption}
        </p>
      )}

      {post.hashtags.length > 0 && (
        <ul aria-label="해시태그" className="flex flex-wrap gap-x-2 gap-y-1">
          {post.hashtags.map(tag => (
            <li key={tag} className="text-body-sm font-medium text-text-brand">
              #{tag}
            </li>
          ))}
        </ul>
      )}

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

      <div className="flex items-center gap-4 text-text-secondary">
        {counts.map(count => (
          <span key={count.label} className="flex items-center gap-1">
            {count.icon}
            <span className="sr-only">{count.label}</span>
            <span className="text-body-sm tabular-nums">{count.value.toLocaleString('ko-KR')}</span>
          </span>
        ))}
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
