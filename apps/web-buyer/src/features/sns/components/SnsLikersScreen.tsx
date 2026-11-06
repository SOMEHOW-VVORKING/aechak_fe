import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Ban, FileX, Heart, Info, MessageCircle } from 'lucide-react'
import {
  Avatar,
  EmptyState,
  MobileScreen,
  SearchInput,
  Skeleton,
  StatusPill,
} from '@aechak/design-system/web'
import { LoginGate, useSessionState } from '@/shared/auth'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  SNS_BLOCKED_BY_ME,
  SNS_COMMENT_UNAVAILABLE,
  SNS_POST_UNAVAILABLE,
  snsErrorCode,
  snsToggleErrorMessage,
  useSnsCommentThread,
  useSnsLikers,
  useSnsToggle,
  type SnsLikeTarget,
  type SnsLikerList,
} from '../sns.queries'
import { petTagLabel, relativeTimeLabel } from '../sns.format'
import { FollowButton } from './FollowButton'
import { SnsListError, SnsRefetchError } from './SnsListEnd'

type Liker = SnsLikerList['items'][number]

// 게시물과 댓글 좋아요한 사람(b7-st-9 9-A, 9-B, 9-C). 로그인 사용자만 본다(A9). 상단 수는 빠진 사용자도 센 전체 수이고 행은
// 최근에 누른 순서로 100명까지다. 닉네임 검색은 받은 행 안에서만 한다(P7). 하단 안내는 보여준 행 기준이다(R3-09).
// 댓글이면 publicId는 댓글 publicId이고 위에 대상 댓글 카드를 단건 조회로 그린다.
export function SnsLikersScreen({
  publicId,
  target = 'post',
}: {
  publicId: string
  target?: SnsLikeTarget
}) {
  const navigate = useNavigate()
  // 세션을 아직 모르는 회원을 막지 않도록 비로그인이 확실할 때만 막는다
  const guest = useSessionState() === 'guest'
  // 댓글 응답에는 게시물 publicId가 없어 주소로 바로 들어왔으면 피드로 돌아간다
  const goBack = useSafeBack(
    target === 'post' ? { to: '/sns/posts/$publicId', params: { publicId } } : { to: '/sns/feed' },
  )
  const [keyword, setKeyword] = useState('')
  const [errorToast, setErrorToast] = useState<string | null>(null)
  // 비로그인이면 목록을 부르지 않고 로그인 안내 시트만 연다.
  const likers = useSnsLikers(publicId, !guest, target)
  const thread = useSnsCommentThread(target === 'comment' ? publicId : undefined, !guest)
  const toggle = useSnsToggle()

  const openProfile = (item: Liker) =>
    item.isMe
      ? navigate({ to: '/sns/me' })
      : navigate({ to: '/sns/users/$publicId', params: { publicId: item.publicId } })

  const follow = (item: Liker) =>
    toggle.mutate(
      { kind: 'follow', publicId: item.publicId, on: !item.following },
      { onError: e => setErrorToast(snsToggleErrorMessage(e)) },
    )

  const screen = (content: ReactNode) => (
    <MobileScreen header={<BackAppBar onBack={goBack} title="좋아요" />}>
      {content}
      <LoginGate
        open={guest}
        feature="likers"
        onClose={goBack}
        resume={{ kind: 'open', publicId }}
      />
      <AppToast
        open={errorToast != null}
        message={errorToast ?? ''}
        variant="error"
        onClose={() => setErrorToast(null)}
      />
    </MobileScreen>
  )

  if (guest) return screen(null)

  // 게시물이 지워졌거나 작성자가 탈퇴했거나 나를 차단했으면 삭제된 게시물 안내, 내가 작성자를 차단했으면 차단 안내다(AC-SNS04-036).
  const code = snsErrorCode(likers.error)
  if (code === SNS_POST_UNAVAILABLE) {
    return screen(
      <ScreenEmptyState
        icon={<FileX className="size-6" />}
        title="삭제된 게시물이에요"
        description="게시물이 삭제되어 더 이상 볼 수 없어요."
      />,
    )
  }
  if (code === SNS_COMMENT_UNAVAILABLE) {
    return screen(
      <ScreenEmptyState
        icon={<MessageCircle className="size-6" />}
        title="댓글을 찾을 수 없어요"
        description="댓글이 삭제되었거나 볼 수 없는 댓글이에요."
      />,
    )
  }
  if (code === SNS_BLOCKED_BY_ME) {
    return screen(
      <ScreenEmptyState
        icon={<Ban className="size-6" />}
        title="차단한 계정의 게시물이에요"
        description="차단을 해제하면 좋아요한 사람을 볼 수 있어요."
      />,
    )
  }

  const data = likers.data
  if (!data) {
    return screen(
      likers.isPending ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <SnsListError onRetry={() => void likers.refetch()} />
      ),
    )
  }

  const query = keyword.trim().toLowerCase()
  const shown = query
    ? data.items.filter(item => item.nickname.toLowerCase().includes(query))
    : data.items

  let body: ReactNode
  if (data.likeCount === 0) {
    body = (
      <EmptyState
        icon={<Heart className="size-6" />}
        title="아직 좋아요가 없어요"
        description={`이 ${target === 'post' ? '게시물' : '댓글'}에 가장 먼저 좋아요를 남겨보세요.`}
      />
    )
  } else if (data.items.length === 0) {
    // 좋아요는 있지만 모두 차단 관계라 보여줄 사람이 없다(A24).
    body = <EmptyState title="표시할 사람이 없어요" />
  } else {
    body = (
      <>
        <div className="px-4 pb-3">
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder="닉네임 검색"
            aria-label="닉네임 검색"
          />
        </div>
        {shown.length === 0 ? (
          <EmptyState title="검색 결과가 없어요" />
        ) : (
          <ul className="border-t border-border-subtle">
            {shown.map(item => (
              <li key={item.publicId} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => openProfile(item)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar name={item.nickname} src={item.profileImageUrl ?? undefined} size="lg" />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-body font-medium text-text-primary">
                        {item.nickname}
                      </span>
                      {item.isMe && (
                        <StatusPill variant="neutral" size="sm" className="flex-none">
                          나
                        </StatusPill>
                      )}
                    </span>
                    {/* 지금 대표 펫의 품종과 오늘 기준 나이. 생년월이 없으면 품종만이다(A5). */}
                    {item.pet && (
                      <span className="block truncate text-caption text-text-tertiary">
                        {petTagLabel(item.pet)}
                      </span>
                    )}
                  </span>
                </button>
                {!item.isMe && (
                  // 한 mutation을 행끼리 나눠 쓰므로 요청 중에는 다른 행 버튼을 잠근다(팔로우 목록과 같다).
                  <FollowButton
                    following={item.following}
                    loading={toggle.isPending && toggle.variables?.publicId === item.publicId}
                    disabled={toggle.isPending}
                    onClick={() => follow(item)}
                    ariaLabel={`${item.nickname} ${item.following ? '팔로잉' : '팔로우'}`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {/* 검색 중에는 받은 목록 전체에 대한 안내라 빼 둔다. */}
        {!query && (
          <p className="flex items-center justify-center gap-1.5 border-t border-border-subtle px-4 py-4 text-center text-caption text-text-tertiary">
            <Info className="size-3.5 flex-none" />
            {data.hasMore
              ? '최근 좋아요 100명까지 볼 수 있어요'
              : `좋아요한 ${data.items.length}명을 표시했어요`}
          </p>
        )}
      </>
    )
  }

  const comment = thread.data?.comment
  return screen(
    <div className="flex flex-col pb-6">
      {comment?.author && (
        <div
          role="group"
          aria-label="좋아요한 댓글"
          className="mx-4 mt-3 flex items-start gap-3 rounded-card border border-border-subtle p-3"
        >
          <Avatar
            name={comment.author.nickname}
            src={comment.author.profileImageUrl ?? undefined}
            size="sm"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="flex items-center gap-2 text-caption">
              <span className="truncate font-semibold text-text-primary">
                {comment.author.nickname}
              </span>
              <span className="flex-none tabular-nums text-text-tertiary">
                {relativeTimeLabel(comment.createdAt)}
              </span>
            </p>
            <p className="line-clamp-3 whitespace-pre-line break-words text-body-sm text-text-primary">
              {comment.content}
            </p>
          </div>
        </div>
      )}
      <p className="flex items-center gap-1.5 px-4 pb-2.5 pt-3.5 text-label text-text-primary">
        <Heart
          className={`size-4 ${data.likeCount > 0 ? 'text-social-active' : 'text-icon-muted'}`}
          fill={data.likeCount > 0 ? 'currentColor' : 'none'}
        />
        좋아요 <b className="tabular-nums">{data.likeCount.toLocaleString('ko-KR')}</b>
      </p>
      {/* 다시 읽기가 실패하면 받아 둔 행은 두고 위에 알린다. 팔로우 버튼은 잠그지 않는다(팔로우 목록과 같다). */}
      {likers.isRefetchError && (
        <SnsRefetchError
          message="목록을 다시 불러오지 못했어요."
          onRetry={() => void likers.refetch()}
        />
      )}
      {body}
    </div>,
  )
}
