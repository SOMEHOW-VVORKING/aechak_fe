import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Ban, EyeOff, FileX, MessageCircle, MoreHorizontal, PawPrint, Share2 } from 'lucide-react'
import { Alert, Avatar, Button, MobileScreen, Modal, Skeleton } from '@aechak/design-system/web'
import { LoginGate, takePendingAction, useIsLoggedIn, useLoginGate } from '@/shared/auth'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  SNS_BLOCKED_BY_ME,
  SNS_POST_NOT_MINE,
  SNS_POST_UNAVAILABLE,
  snsErrorCode,
  snsPostErrorMessage,
  snsToggleErrorMessage,
  postReportTarget,
  useDeleteSnsPost,
  useSnsPost,
  useSnsToggle,
  type SnsPost,
  type SnsReactionKind,
} from '../sns.queries'
import { RELATION_CONFIRM } from '../sns.copy'
import { petTagLabel, postDate, postDateLabel } from '../sns.format'
import { FollowButton } from './FollowButton'
import { SnsCommentComposer, SnsCommentList, useSnsCommentDraft, type SnsCommentResume } from './SnsComments'
import { SnsLikeButton, SnsResumeLike } from './SnsLikeButton'
import { SnsHashtagLinks } from './SnsHashtagLinks'
import { SnsPostMoreSheet } from './SnsPostMoreSheet'
import { SnsReactionButton, SnsResumeReaction } from './SnsReactionButton'
import { SnsReportSheet } from './SnsReportSheet'

interface ToastState {
  open: boolean
  message: string
  variant: 'success' | 'error'
}

/** 상세 확인 Modal. 차단은 확인 뒤 상세를 닫고, 뮤트 해제는 확인 뒤 상세에 머문다 */
type PostConfirm = 'block' | 'unmute'

// 게시물 상세의 게시물 영역(b7-st-2). 비로그인도 본다(A9). 액션 바는 좋아요 버튼과 수(SNS-04), 댓글 수, 리포스트와 저장
// 버튼(SNS-03), 공유를 그린다. 그 아래 댓글 목록과 하단 입력바를 둔다(SNS-04). 신고는 더보기 시트에서 연다(SNS-07).
// author는 카드나 프로필에서 들어와 작성자를 알 때만 온다. 내가 차단한 작성자의 게시물(403 130001)은 응답에
// 작성자가 없어서 이 값이 있을 때만 프로필 이동을 보여준다(G4). comment는 알림으로 열었을 때 고정할 댓글이다.
export function SnsPostDetailScreen({ publicId, author, comment }: { publicId: string; author?: string; comment?: string }) {
  const navigate = useNavigate()
  const goBack = useSafeBack({ to: '/sns' })
  const { data: post, error, isPending, refetch } = useSnsPost(publicId)
  const toggle = useSnsToggle()
  const mutateToggle = toggle.mutate
  const remove = useDeleteSnsPost()
  const { gateOpen, gateFeature, gateResume, requireAuth, closeGate } = useLoginGate()
  const loggedIn = useIsLoggedIn()
  const [moreOpen, setMoreOpen] = useState(false)
  // 확인 Modal의 타겟은 화면이 소유하고 Modal은 자체 mutation을 만들지 않는다(AGENTS.md 4절).
  const [confirm, setConfirm] = useState<PostConfirm | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  // 로그인 뒤 다시 켤 리포스트, 저장, 좋아요(A26). 정해지면 SnsResumeReaction이나 SnsResumeLike가 한 번 보낸다.
  const [resume, setResume] = useState<SnsReactionKind | 'like' | null>(null)
  const [commentResume, setCommentResume] = useState<SnsCommentResume | null>(null)
  const draft = useSnsCommentDraft()
  const [toast, setToast] = useState<ToastState>({ open: false, message: '', variant: 'success' })

  const showToast = (message: string, variant: ToastState['variant'] = 'success') =>
    setToast({ open: true, message, variant })

  // 볼 수 없는 게시물과 내가 차단한 작성자는 다시 조회에서 나와도 이전 데이터보다 먼저 본다.
  const code = snsErrorCode(error)
  const unavailable = code === SNS_POST_UNAVAILABLE
  const blockedByMe = code === SNS_BLOCKED_BY_ME
  // 다시 조회가 그 밖의 이유로 실패하면 마지막 내용은 남기고 그 값으로 하는 처리(팔로우, 뮤트, 차단)만 잠근다(AGENTS.md 6절 7).
  const refreshFailed = error != null && post != null

  // 로그인 뒤 다시 실행(A26, design 6절 11번). 상세에서 남긴 행동은 게시물 publicId로 꺼낸다. 실패 응답에는
  // 작성자가 없어 작성자 publicId로 남기면 꺼낼 수 없고 나중에 그 프로필에서 확인 없이 팔로우가 나간다.
  // 볼 수 없게 됐으면 실행하지 않고 안내만 남긴다. 그 작성자 본인으로 로그인했으면 실행하지 않고 버린다.
  // 리포스트, 저장, 좋아요는 확인 없이 한 번 켠다. 저장과 좋아요는 내 글도 되고(AC-SNS03-032, R1-19) 리포스트는 내 글이면 버린다.
  // 신고는 사유가 필요해 시트만 다시 열고 제출하지 않는다(A26).
  useEffect(() => {
    if (!loggedIn) return
    if (unavailable || blockedByMe) {
      takePendingAction(publicId)
      return
    }
    if (!post) return
    const pending = takePendingAction(publicId)
    if (!pending) return
    if (pending.kind === 'save' || pending.kind === 'like' || (pending.kind === 'repost' && !post.isMine)) {
      setResume(pending.kind)
    }
    // 댓글 입력과 댓글 작성자 차단은 내 게시물에서도 된다. 댓글 목록이 불러와진 뒤 SnsCommentList가 연다.
    if (pending.kind === 'comment' || pending.kind === 'commentBlock') {
      setCommentResume({ kind: pending.kind, targetPublicId: pending.targetPublicId })
      return
    }
    if (post.isMine) return
    if (pending.kind === 'follow') {
      mutateToggle(
        { kind: 'follow', publicId: post.author.publicId, on: true },
        { onError: e => setToast({ open: true, message: snsToggleErrorMessage(e), variant: 'error' }) },
      )
    } else if (pending.kind === 'block') setConfirm('block')
    else if (pending.kind === 'mute') setMoreOpen(true)
    else if (pending.kind === 'report') setReportOpen(true)
  }, [publicId, loggedIn, unavailable, blockedByMe, post, mutateToggle])

  const postUrl = `${window.location.origin}/sns/posts/${publicId}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl)
      showToast('링크를 복사했어요')
    } catch {
      showToast('링크를 복사하지 못했어요', 'error')
    }
  }

  // 공유는 기기의 공유 시트를 연다(P11). 공유 시트가 없는 브라우저는 링크를 복사한다. 비로그인도 된다(A9).
  const share = async () => {
    if (!navigator.share) {
      await copyLink()
      return
    }
    try {
      await navigator.share({ url: postUrl })
    } catch (e) {
      // 사용자가 시트를 닫은 것(AbortError)은 실패가 아니다.
      if (!(e instanceof DOMException && e.name === 'AbortError')) await copyLink()
    }
  }

  const follow = (target: SnsPost) =>
    requireAuth(
      'follow',
      () =>
        toggle.mutate(
          { kind: 'follow', publicId: target.author.publicId, on: !target.following },
          { onError: e => showToast(snsToggleErrorMessage(e), 'error') },
        ),
      { kind: 'follow', publicId },
    )

  const mute = (target: SnsPost) =>
    requireAuth(
      'mute',
      () =>
        toggle.mutate(
          { kind: 'mute', publicId: target.author.publicId, on: true },
          {
            onSuccess: () => showToast('뮤트했어요'),
            onError: e => showToast(snsToggleErrorMessage(e), 'error'),
          },
        ),
      { kind: 'mute', publicId },
    )

  const handleConfirm = () => {
    if (!confirm || !post) return
    const copy = RELATION_CONFIRM[confirm]
    toggle.mutate(
      { kind: copy.kind, publicId: post.author.publicId, on: copy.on },
      {
        onSuccess: () => {
          setConfirm(null)
          // 상세에서 차단하면 상세를 닫고 이전 화면으로 돌아간다(P12).
          if (confirm === 'block') goBack()
          else showToast(copy.done)
        },
        onError: e => {
          setConfirm(null)
          showToast(snsToggleErrorMessage(e), 'error')
        },
      },
    )
  }

  // 삭제는 확인을 거친다. 다른 기기에서 이미 지운 게시물도 지운 것으로 보고 이전 화면으로 간다(AC-SNS02-027).
  const handleDelete = () =>
    remove.mutate(publicId, {
      onSuccess: () => {
        setDeleteConfirm(false)
        goBack()
      },
      onError: e => {
        setDeleteConfirm(false)
        showToast(
          snsErrorCode(e) === SNS_POST_NOT_MINE
            ? '본인 게시물만 삭제할 수 있어요'
            : snsPostErrorMessage(e, '삭제하지 못했어요. 다시 시도해 주세요'),
          'error',
        )
      },
    })

  const openProfile = (target: string, mine: boolean) =>
    mine ? navigate({ to: '/sns/me' }) : navigate({ to: '/sns/users/$publicId', params: { publicId: target } })

  const showMore = post != null && !unavailable && !blockedByMe

  // 본문만 분기하고 시트, Modal, 토스트는 어느 분기에서도 함께 렌더한다. below는 게시물 아래 댓글 목록이다.
  const screen = (content: ReactNode, below?: ReactNode) => (
    <MobileScreen
      header={
        <BackAppBar
          onBack={goBack}
          title="게시물"
          actions={
            showMore && (
              <button
                type="button"
                aria-label="더보기"
                disabled={toggle.isPending}
                onClick={() => setMoreOpen(true)}
                className="flex size-10 items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
              >
                <MoreHorizontal className="size-[22px]" />
              </button>
            )
          }
        />
      }
      footer={
        post &&
        !unavailable &&
        !blockedByMe && <SnsCommentComposer post={post} draft={draft} requireAuth={requireAuth} notify={showToast} />
      }
    >
      {content}
      {below}

      {post && (
        <SnsPostMoreSheet
          post={post}
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          // 팔로우, 차단, 뮤트 요청 중에 뮤트를 보내면 앞 요청의 성공, 실패 처리가 사라진다. 끝날 때까지 링크 복사만 둔다.
          locked={refreshFailed || toggle.isPending}
          onCopyLink={() => void copyLink()}
          onEdit={() => void navigate({ to: '/sns/posts/$publicId/edit', params: { publicId } })}
          onDelete={() => setDeleteConfirm(true)}
          onMute={() => (post.mutedByMe ? setConfirm('unmute') : mute(post))}
          onBlock={() => requireAuth('block', () => setConfirm('block'), { kind: 'block', publicId })}
          onReport={() => requireAuth('snsReport', () => setReportOpen(true), { kind: 'report', publicId })}
        />
      )}
      <SnsReportSheet
        target={post ? postReportTarget(post) : null}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />

      {confirm && post && (
        <Modal
          open
          // 요청 중에 닫고 다른 처리를 누르면 그 처리가 이 요청의 성공 처리(차단 뒤 이전 화면)를 덮어쓴다.
          onClose={() => {
            if (!toggle.isPending) setConfirm(null)
          }}
          title={RELATION_CONFIRM[confirm].title}
          description={RELATION_CONFIRM[confirm].description(post.author.nickname)}
          confirmLabel={RELATION_CONFIRM[confirm].confirmLabel}
          confirmVariant={RELATION_CONFIRM[confirm].danger ? 'danger' : 'primary'}
          onConfirm={handleConfirm}
          loading={toggle.isPending}
        />
      )}

      {deleteConfirm && (
        <Modal
          open
          onClose={() => {
            if (!remove.isPending) setDeleteConfirm(false)
          }}
          title="게시물을 삭제할까요?"
          description="삭제한 게시물은 되돌릴 수 없어요."
          confirmLabel="삭제"
          confirmVariant="danger"
          onConfirm={handleDelete}
          loading={remove.isPending}
        />
      )}

      {resume === 'like' && <SnsResumeLike publicId={publicId} onError={message => showToast(message, 'error')} />}
      {resume && resume !== 'like' && (
        <SnsResumeReaction key={resume} kind={resume} publicId={publicId} onError={message => showToast(message, 'error')} />
      )}
      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} resume={gateResume} />
      <AppToast
        open={toast.open}
        message={toast.message}
        variant={toast.variant}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
      />
    </MobileScreen>
  )

  // 삭제, 탈퇴, 운영자 삭제, 나를 차단, 원인 겹침은 모두 같은 삭제된 게시물 안내다(A7, P7).
  if (unavailable) {
    return screen(
      <ScreenEmptyState
        icon={<FileX className="size-6" />}
        title="삭제된 게시물이에요"
        description="게시물이 삭제되어 더 이상 볼 수 없어요."
      />,
    )
  }

  // 내가 차단한 작성자(P6, G4). 응답에 작성자와 내용이 없다. 차단 관리 이동과 작성자를 알 때만 프로필 이동을 보여준다.
  if (blockedByMe) {
    return screen(
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-surface-sunken text-icon-muted">
          <Ban className="size-7" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-subheading font-semibold text-text-primary">차단한 계정의 게시물이에요</p>
          <p className="text-body-sm text-text-secondary">차단을 해제하면 게시물을 볼 수 있어요.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate({ to: '/mypage/sns-relations' })}>
            차단 관리
          </Button>
          {author && (
            <Button variant="secondary" onClick={() => openProfile(author, false)}>
              프로필 보기
            </Button>
          )}
        </div>
      </div>,
    )
  }

  if (!post) {
    if (isPending) {
      return screen(
        <div className="flex flex-col gap-3 p-4">
          <Skeleton variant="text" className="w-1/2" />
          <Skeleton className="aspect-square w-full" />
        </div>,
      )
    }
    return screen(
      <ScreenEmptyState
        title="게시물을 불러오지 못했어요"
        description="잠시 후 다시 시도해 주세요."
        action={{ label: '다시 시도', onClick: () => void refetch() }}
      />,
    )
  }

  const reactionError = (message: string) => showToast(message, 'error')

  return screen(
    <article className="flex flex-col gap-3 pb-4 pt-2">
      <header className="flex items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => openProfile(post.author.publicId, post.isMine)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar name={post.author.nickname} src={post.author.profileImageUrl ?? undefined} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-label font-semibold text-text-primary">{post.author.nickname}</span>
            {/* 게시할 때의 대표 펫. 펫이 없거나 지웠으면 자리를 비운다(A5). */}
            {post.pet && (
              <span className="flex items-center gap-1 text-caption text-text-secondary">
                <PawPrint className="size-3" />
                {petTagLabel(post.pet, postDate(post.createdAt))}
              </span>
            )}
          </span>
        </button>
        {!post.isMine && (
          <FollowButton
            following={post.following}
            loading={toggle.isPending && toggle.variables?.kind === 'follow'}
            disabled={toggle.isPending || refreshFailed}
            onClick={() => follow(post)}
          />
        )}
      </header>

      {refreshFailed && (
        <div className="px-4">
          <Alert variant="error">
            게시물을 다시 불러오지 못했어요.{' '}
            <button type="button" onClick={() => void refetch()} className="font-semibold underline">
              다시 시도
            </button>
          </Alert>
        </div>
      )}

      {/* 뮤트한 작성자의 게시물도 내용을 보여주고 뮤트 상태를 함께 표시한다(A15). */}
      {post.mutedByMe && (
        <div className="mx-4 flex items-center gap-2 rounded-card bg-surface-sunken px-3 py-2.5">
          <EyeOff className="size-4 flex-none text-icon-muted" />
          <p className="text-body-sm text-text-secondary">뮤트한 계정의 게시물이에요</p>
        </div>
      )}

      {post.caption && (
        <p className="whitespace-pre-line break-keep break-words px-4 text-body leading-relaxed text-text-primary">
          {post.caption}
        </p>
      )}

      {post.hashtags.length > 0 && <SnsHashtagLinks hashtags={post.hashtags} className="px-4" />}

      {/* 사진은 작성자가 정한 순서대로 넘겨 본다(P2). 텍스트 게시물은 미디어 자리가 없다(A20). */}
      {post.photoUrls.length > 0 && <PhotoCarousel urls={post.photoUrls} />}
      {post.video && (
        <video
          src={post.video.url}
          poster={post.video.thumbnailUrl}
          controls
          playsInline
          preload="metadata"
          aria-label="영상"
          className="aspect-square w-full bg-black object-contain"
        />
      )}

      {/* 좋아요, 댓글, 리포스트 수를 보여주고 저장 수는 작성자에게도 보여주지 않는다(A23). 저장은 맨 끝에 둔다(b7-st-2). */}
      <div className="flex items-center gap-4 px-4 text-text-secondary">
        <SnsLikeButton post={post} requireAuth={requireAuth} onError={reactionError} disabled={refreshFailed} />
        <span className="flex items-center gap-1">
          <MessageCircle className="size-5" />
          <span className="sr-only">댓글</span>
          <span className="text-body-sm tabular-nums">{post.commentCount.toLocaleString('ko-KR')}</span>
        </span>
        <SnsReactionButton
          kind="repost"
          post={post}
          requireAuth={requireAuth}
          onError={reactionError}
          disabled={refreshFailed}
        />
        <button
          type="button"
          aria-label="공유"
          onClick={() => void share()}
          className="flex size-10 items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
        >
          <Share2 className="size-5" />
        </button>
        <div className="ml-auto">
          <SnsReactionButton
            kind="save"
            post={post}
            requireAuth={requireAuth}
            onError={reactionError}
            disabled={refreshFailed}
          />
        </div>
      </div>

      <p className="flex gap-2 px-4 text-caption text-text-tertiary">
        <span className="tabular-nums">{postDateLabel(post.createdAt)}</span>
        {post.edited && <span>수정됨</span>}
      </p>
    </article>,
    <SnsCommentList
      post={post}
      draft={draft}
      requireAuth={requireAuth}
      notify={showToast}
      pinnedCommentId={comment}
      resume={commentResume}
      onResumeDone={() => setCommentResume(null)}
    />,
  )
}

// 사진을 넘겨 보는 칸과 몇 번째 장인지 알리는 점. 상품 상세 ImageCarousel과 같은 모양이다(feature 사이 import가 막혀
// 옮겨 적었다). 현재 장은 가로 스크롤 위치로 정한다.
function PhotoCarousel({ urls }: { urls: string[] }) {
  const [active, setActive] = useState(0)
  return (
    <div className="relative">
      <div
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={e => {
          const el = e.currentTarget
          setActive(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {urls.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`사진 ${i + 1}/${urls.length}`}
            className="aspect-square w-full flex-none snap-center bg-surface-sunken object-cover"
          />
        ))}
      </div>
      {/* 장수는 사진 대체 글자가 알려 점은 화면 읽기에서 뺀다. */}
      {urls.length > 1 && (
        <div aria-hidden="true" className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {urls.map((url, i) => (
            <span
              key={url}
              className={[
                'size-1.5 rounded-full transition-colors',
                i === active ? 'bg-surface-inverse' : 'bg-surface-inverse/30',
              ].join(' ')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
