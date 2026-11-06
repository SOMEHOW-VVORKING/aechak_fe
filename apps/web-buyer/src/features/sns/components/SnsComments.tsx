import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { Heart, MessageCircle, MoreHorizontal } from 'lucide-react'
import { Alert, Avatar, BottomSheet, Button, Modal, Skeleton } from '@aechak/design-system/web'
import { useIsLoggedIn, useSessionState, type GateFeature, type GateResume } from '@/shared/auth'
import { EditDeleteActions } from '@/shared/components/EditDeleteActions'
import {
  SNS_COMMENT_REPLY_CLOSED,
  SNS_COMMENT_UNAVAILABLE,
  commentReportTarget,
  snsCommentErrorMessage,
  snsErrorCode,
  snsKeys,
  snsToggleErrorMessage,
  useCreateSnsComment,
  useDeleteSnsComment,
  useSnsCommentLike,
  useSnsCommentThread,
  useSnsComments,
  useSnsToggle,
  useUpdateSnsComment,
  type SnsComment,
  type SnsPost,
  type SnsReportTarget,
} from '../sns.queries'
import { RELATION_CONFIRM } from '../sns.copy'
import { relativeTimeLabel } from '../sns.format'
import { COMMENT_MAX, commentLength } from '../sns.text'

type RequireAuth = (feature: GateFeature, action: () => void, resume?: GateResume) => boolean
type Notify = (message: string, variant?: 'success' | 'error') => void

function randomId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** 로그인 뒤 다시 열 댓글 입력창이나 댓글 작성자 차단, 댓글 신고 시트, 다시 켤 댓글 좋아요(A26) */
export interface SnsCommentResume {
  kind: 'comment' | 'commentBlock' | 'commentReport' | 'commentLike'
  targetPublicId?: string
}

/**
 * 댓글 입력 상태. 목록(답글달기, 방금 쓴 댓글)과 하단 입력바가 함께 쓴다. 멱등키는 입력을 시작할 때 하나 만들어
 * 그 입력의 모든 게시 시도에 보내고 201을 받으면 버린다(design 6절 5번). 화면이 게시물마다 새로 마운트되므로
 * 다른 게시물의 입력은 새 키를 쓴다.
 */
export function useSnsCommentDraft() {
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<SnsComment | null>(null)
  // 끝까지 불러오지 않은 목록에서 쓴 최상위 댓글. 목록 아래 따로 보여주고 이어 불러온 페이지에 나오면 뺀다.
  const [appended, setAppended] = useState<SnsComment[]>([])
  const key = useRef<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  return {
    text,
    setText: (value: string) => {
      if (key.current == null && value.trim() !== '') key.current = randomId()
      setText(value)
    },
    replyTo,
    setReplyTo,
    appended,
    addAppended: (item: SnsComment) => setAppended(prev => [...prev, item]),
    /** 붙인 댓글을 고친 응답으로 바꾼다 */
    replaceAppended: (item: SnsComment) =>
      setAppended(prev => prev.map(i => (i.publicId === item.publicId ? item : i))),
    /** 붙인 댓글을 지운다. 붙인 대댓글이 남은 최상위 댓글은 서버처럼 안내 문구로 남긴다 */
    removeAppended: (publicId: string) =>
      setAppended(prev => {
        const hasReplies = prev.some(i => i.parentPublicId === publicId)
        return prev.flatMap(i => {
          if (i.publicId !== publicId) {
            return i.parentPublicId === publicId ? [{ ...i, replyable: false }] : [i]
          }
          return hasReplies
            ? [
                {
                  ...i,
                  status: 'DELETED' as const,
                  author: null,
                  content: null,
                  replyable: false,
                  isMine: false,
                },
              ]
            : []
        })
      }),
    /** 붙인 최상위 댓글에 단 대댓글을 그 스레드 끝에 넣는다. 부모가 붙인 댓글이 아니면 false다 */
    insertAppendedReply: (item: SnsComment) => {
      if (!appended.some(i => i.publicId === item.parentPublicId)) return false
      setAppended(prev => {
        let last = -1
        prev.forEach((i, index) => {
          if (i.publicId === item.parentPublicId || i.parentPublicId === item.parentPublicId)
            last = index
        })
        return [...prev.slice(0, last + 1), item, ...prev.slice(last + 1)]
      })
      return true
    },
    inputRef,
    ensureKey: () => (key.current ??= randomId()),
    /** 게시가 끝나면 입력과 키를 비운다. 같은 문장을 다시 쓰면 새 댓글이다(P2) */
    reset: () => {
      key.current = null
      setText('')
      setReplyTo(null)
    },
    focus: () => inputRef.current?.focus(),
  }
}

export type SnsCommentDraft = ReturnType<typeof useSnsCommentDraft>

// 지운 최상위 댓글의 안내 문구. 작성자와 내용, 답글달기, 수정과 삭제, 길게 누르기를 모두 숨긴다(P3).
const PLACEHOLDER_COPY: Record<'DELETED' | 'WITHDRAWN', string> = {
  DELETED: '삭제된 댓글이에요',
  WITHDRAWN: '탈퇴한 사용자가 작성한 댓글이에요',
}

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 10

/**
 * 댓글 목록(b7-st-2 2-A). 비로그인도 본다(A9). 오래된순이고 대댓글은 한 단계 들여쓴다. 헤더의 수는 상세 commentCount다.
 * 알림으로 연 댓글(commentPublicId)은 로그인했을 때만 불러 목록 위에 고정한다(G7). 다른 사람 댓글을 길게 누르면 신고와 차단이 있는
 * 메뉴 시트를 연다(SNS-07 P14).
 */
export function SnsCommentList({
  post,
  draft,
  requireAuth,
  notify,
  pinnedCommentId,
  resume,
  onResumeDone,
  onReport,
}: {
  post: SnsPost
  draft: SnsCommentDraft
  requireAuth: RequireAuth
  notify: Notify
  pinnedCommentId?: string
  resume: SnsCommentResume | null
  onResumeDone: () => void
  /** 신고 시트를 연다. 시트는 상세 화면이 그려 게시물이 사라져 목록이 내려가도 결과 토스트가 남는다 */
  onReport: (target: SnsReportTarget) => void
}) {
  const loggedIn = useIsLoggedIn()
  const queryClient = useQueryClient()
  // 세션 확인 전(unknown)인 회원도 알림으로 연 댓글을 부른다. 만료된 세션의 401은 전역 인증 처리가 맡는다.
  const pinnable = useSessionState() !== 'guest'
  const comments = useSnsComments(post.publicId, true)
  const pinned = useSnsCommentThread(pinnedCommentId, pinnable)
  const toggle = useSnsToggle()
  const update = useUpdateSnsComment(post.publicId)
  const remove = useDeleteSnsComment(post.publicId)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [menuTarget, setMenuTarget] = useState<SnsComment | null>(null)
  const [blockTarget, setBlockTarget] = useState<{ publicId: string; nickname: string } | null>(
    null,
  )

  const items = comments.data?.pages.flatMap(page => page.items) ?? []
  const loadedIds = new Set(items.map(i => i.publicId))
  const extra = draft.appended.filter(i => !loadedIds.has(i.publicId))
  // 받아 둔 행이 있는데 다시 조회가 실패하면 낡은 행으로 하는 처리(답글, 수정, 삭제, 차단)를 잠근다(AGENTS.md 6절 7).
  const stale = comments.isError && items.length > 0
  // 좋아요는 그 댓글이 든 목록 조회를 멈추므로 다음 페이지를 받는 동안에는 좋아요를, 좋아요 요청 중에는 더보기를 막는다.
  const likeLocked = stale || comments.isFetchingNextPage
  const commentLiking = useIsMutating({ mutationKey: ['sns', 'like', 'comment'] }) > 0
  // 로그인 뒤 다시 켠 댓글 좋아요는 목록이 다시 불러와져도 한 번만 보낸다
  const resumeLikeSent = useRef(false)

  // 로그인 뒤 다시 실행(A26). 입력창만 다시 열고 댓글은 보내지 않는다. 답글달기였으면 단건으로 그 댓글을 다시 읽어 아직 답글을
  // 달 수 있을 때만 그 답글 입력창을 연다. 신고도 단건으로 다시 읽어 아직 보일 때만 신고 시트를 다시 열고 제출하지 않는다.
  // 차단은 그 작성자의 댓글이 아직 보일 때만 확인 시트를 다시 연다. 볼 수 없게 됐으면 안내만 한다.
  const resumeTarget =
    resume?.kind === 'comment' || resume?.kind === 'commentReport' ? resume.targetPublicId : undefined
  const resumeThread = useSnsCommentThread(resumeTarget, loggedIn)
  const ready = comments.data != null
  useEffect(() => {
    // 댓글 좋아요는 아래 ResumeCommentLike가 목록을 받은 뒤 한 번 보낸다
    if (!resume || resume.kind === 'commentLike') return
    if (resume.kind === 'comment') {
      if (resumeTarget != null) {
        if (resumeThread.isPending) return
        const target = resumeThread.data?.comment
        if (!target?.replyable) {
          notify(
            target
              ? '답글을 달 수 없는 댓글이에요'
              : snsCommentErrorMessage(resumeThread.error, '댓글을 찾을 수 없어요'),
            'error',
          )
          onResumeDone()
          return
        }
        draft.setReplyTo(target)
      }
      draft.focus()
    } else if (resume.kind === 'commentReport') {
      if (resumeTarget != null && resumeThread.isPending) return
      const target = resumeThread.data?.comment
      if (target?.status === 'ACTIVE' && target.author && !target.isMine) openReport(target)
      else notify(snsCommentErrorMessage(resumeThread.error, '댓글을 찾을 수 없어요'), 'error')
    } else {
      if (!ready) return
      // shortcut: 불러온 첫 페이지에서만 그 작성자를 찾는다. 뒤 페이지에만 댓글이 있으면 찾을 수 없다는 안내가 나온다.
      const byAuthor = items.find(i => i.author?.publicId === resume.targetPublicId)
      if (byAuthor?.author && !byAuthor.isMine) {
        setBlockTarget({ publicId: byAuthor.author.publicId, nickname: byAuthor.author.nickname })
      } else notify('댓글을 찾을 수 없어요', 'error')
    }
    onResumeDone()
    // items와 draft는 아래 값이 바뀔 때 함께 정해진다. 다시 실행하지 않게 이 값들만 본다.
  }, [resume, ready, resumeThread.isPending])

  const reply = (item: SnsComment) =>
    requireAuth(
      'comment',
      () => {
        draft.setReplyTo(item)
        draft.focus()
      },
      { kind: 'comment', publicId: post.publicId, targetPublicId: item.publicId },
    )

  const openMenu = (item: SnsComment) => {
    if (item.status !== 'ACTIVE' || !item.author || item.isMine) return
    setMenuTarget(item)
  }

  const openReport = (item: SnsComment) => onReport(commentReportTarget(item, post.publicId))

  // 비로그인은 로그인 안내 시트를 열고 로그인 뒤 같은 화면에서 신고 시트만 다시 연다(A26).
  const report = (item: SnsComment) => {
    setMenuTarget(null)
    requireAuth('snsReport', () => openReport(item), {
      kind: 'commentReport',
      publicId: post.publicId,
      targetPublicId: item.publicId,
    })
  }

  const block = (item: SnsComment) => {
    setMenuTarget(null)
    const author = item.author!
    requireAuth(
      'block',
      () => setBlockTarget({ publicId: author.publicId, nickname: author.nickname }),
      {
        kind: 'commentBlock',
        publicId: post.publicId,
        targetPublicId: author.publicId,
      },
    )
  }

  const confirmBlock = () => {
    if (!blockTarget) return
    toggle.mutate(
      { kind: 'block', publicId: blockTarget.publicId, on: true },
      {
        onSuccess: () => {
          // 게시물 작성자를 차단했으면 상세를 다시 읽어 차단 안내로 바꾼다.
          if (blockTarget.publicId === post.author.publicId) {
            void queryClient.invalidateQueries({ queryKey: snsKeys.post(post.publicId) })
          }
          setBlockTarget(null)
          notify(RELATION_CONFIRM.block.done)
        },
        onError: e => {
          setBlockTarget(null)
          notify(snsToggleErrorMessage(e), 'error')
        },
      },
    )
  }

  const save = (item: SnsComment, content: string) =>
    update.mutate(
      { commentPublicId: item.publicId, content },
      {
        onSuccess: updated => {
          draft.replaceAppended(updated)
          setEditing(null)
        },
        onError: e => {
          // 금지어가 많으면 고친 내용을 남긴다. 그사이 지운 댓글이면 목록을 다시 읽고 수정을 닫는다.
          if (snsErrorCode(e) === SNS_COMMENT_UNAVAILABLE) setEditing(null)
          notify(snsCommentErrorMessage(e, '댓글을 고치지 못했어요. 다시 시도해 주세요'), 'error')
        },
      },
    )

  const confirmDelete = () => {
    if (!deleteTarget) return
    remove.mutate(deleteTarget, {
      onSuccess: () => {
        draft.removeAppended(deleteTarget)
        setDeleteTarget(null)
        notify('댓글을 삭제했어요')
      },
      onError: e => {
        setDeleteTarget(null)
        notify(snsCommentErrorMessage(e, '댓글을 삭제하지 못했어요. 다시 시도해 주세요'), 'error')
      },
    })
  }

  const row = (item: SnsComment, actions = !stale, likeDisabled = likeLocked) => (
    <SnsCommentRow
      key={item.publicId}
      item={item}
      likeButton={
        <CommentLikeButton
          postPublicId={post.publicId}
          item={item}
          requireAuth={requireAuth}
          notify={notify}
          disabled={likeDisabled}
        />
      }
      // 고정 영역의 같은 댓글에는 편집창을 열지 않는다
      editing={actions && editing === item.publicId}
      saving={update.isPending}
      onReply={actions && item.replyable ? () => reply(item) : undefined}
      onEdit={actions && item.isMine ? () => setEditing(item.publicId) : undefined}
      onDelete={actions && item.isMine ? () => setDeleteTarget(item.publicId) : undefined}
      onCancelEdit={() => setEditing(null)}
      onSave={content => save(item, content)}
      onLongPress={actions ? () => openMenu(item) : undefined}
    />
  )

  return (
    <section aria-label="댓글" className="flex flex-col border-t border-border-subtle pt-3">
      <div className="flex items-center justify-between px-4 pb-1">
        <h2 className="text-label font-semibold text-text-primary">
          답글 <span className="tabular-nums">{post.commentCount.toLocaleString('ko-KR')}</span>
        </h2>
        {/* 정렬은 오래된순 하나라 누를 수 없다(P8). */}
        <span className="text-caption text-text-tertiary">오래된순</span>
      </div>

      {pinnedCommentId && pinnable && (
        <div className="mx-4 my-2 rounded-card bg-surface-sunken py-1">
          {pinned.data ? (
            <div aria-label="알림으로 연 댓글" role="group">
              {pinned.data.parent && row(pinned.data.parent, false, likeLocked || pinned.isError)}
              {row(pinned.data.comment, false, likeLocked || pinned.isError)}
            </div>
          ) : snsErrorCode(pinned.error) === SNS_COMMENT_UNAVAILABLE ? (
            <p className="px-3 py-2 text-body-sm text-text-secondary">댓글을 찾을 수 없어요</p>
          ) : pinned.isError ? (
            <p className="px-3 py-2 text-body-sm text-text-secondary">
              댓글을 불러오지 못했어요.{' '}
              <button
                type="button"
                onClick={() => void pinned.refetch()}
                className="font-semibold underline"
              >
                다시 시도
              </button>
            </p>
          ) : pinned.isFetching ? (
            <Skeleton variant="text" className="mx-3 my-2 w-2/3" />
          ) : null}
        </div>
      )}

      {comments.isPending ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton variant="text" className="w-2/3" />
          <Skeleton variant="text" className="w-1/2" />
        </div>
      ) : comments.isError && items.length === 0 ? (
        <div className="px-4 py-3">
          <Alert variant="error">
            {snsCommentErrorMessage(comments.error, '댓글을 불러오지 못했어요.')}{' '}
            <button
              type="button"
              onClick={() => void comments.refetch()}
              className="font-semibold underline"
            >
              다시 시도
            </button>
          </Alert>
        </div>
      ) : items.length === 0 && extra.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
          <MessageCircle className="size-6 text-icon-muted" />
          <p className="text-body-sm font-medium text-text-primary">아직 댓글이 없어요</p>
          <p className="text-caption text-text-secondary">첫 댓글을 남겨 보세요.</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {stale && (
            <li className="px-4 py-2">
              <Alert variant="error">
                댓글을 다시 불러오지 못했어요.{' '}
                <button
                  type="button"
                  onClick={() => void comments.refetch()}
                  className="font-semibold underline"
                >
                  다시 시도
                </button>
              </Alert>
            </li>
          )}
          {items.map(item => (
            <li key={item.publicId}>{row(item)}</li>
          ))}
          {extra.map(item => (
            <li key={item.publicId}>{row(item)}</li>
          ))}
        </ul>
      )}

      {resume?.kind === 'commentLike' && resume.targetPublicId && ready && (
        <ResumeCommentLike
          postPublicId={post.publicId}
          commentPublicId={resume.targetPublicId}
          notify={notify}
          sent={resumeLikeSent}
        />
      )}

      {comments.hasNextPage && (
        <div className="px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            loading={comments.isFetchingNextPage}
            disabled={commentLiking}
            onClick={() => void comments.fetchNextPage()}
          >
            댓글 더보기
          </Button>
        </div>
      )}

      <BottomSheet
        open={menuTarget != null}
        onClose={() => setMenuTarget(null)}
        ariaLabel="댓글 메뉴"
      >
        <div className="flex flex-col pb-1">
          <button
            type="button"
            onClick={() => menuTarget && report(menuTarget)}
            className="flex h-12 items-center px-2 text-left text-body font-medium text-text-primary"
          >
            신고
          </button>
          <button
            type="button"
            onClick={() => menuTarget && block(menuTarget)}
            className="flex h-12 items-center px-2 text-left text-body font-medium text-error-fg"
          >
            차단하기
          </button>
        </div>
      </BottomSheet>

      {blockTarget && (
        <Modal
          open
          onClose={() => {
            if (!toggle.isPending) setBlockTarget(null)
          }}
          title={RELATION_CONFIRM.block.title}
          description={RELATION_CONFIRM.block.description(blockTarget.nickname)}
          confirmLabel={RELATION_CONFIRM.block.confirmLabel}
          confirmVariant="danger"
          onConfirm={confirmBlock}
          loading={toggle.isPending}
        />
      )}

      {deleteTarget && (
        <Modal
          open
          onClose={() => {
            if (!remove.isPending) setDeleteTarget(null)
          }}
          title="댓글을 삭제할까요?"
          description="삭제한 댓글은 복구할 수 없어요."
          confirmLabel="삭제"
          confirmVariant="danger"
          onConfirm={confirmDelete}
          loading={remove.isPending}
        />
      )}
    </section>
  )
}

function SnsCommentRow({
  item,
  likeButton,
  editing,
  saving,
  onReply,
  onEdit,
  onDelete,
  onCancelEdit,
  onSave,
  onLongPress,
}: {
  item: SnsComment
  likeButton: ReactNode
  editing: boolean
  saving: boolean
  onReply?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCancelEdit: () => void
  onSave: (content: string) => void
  onLongPress?: () => void
}) {
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressed = useRef<{ x: number; y: number } | null>(null)
  // 길게 누르기로 메뉴를 열었으면 손을 뗄 때 이어지는 click을 한 번 막는다
  const fired = useRef(false)
  const indent = item.parentPublicId != null ? 'pl-14' : 'pl-4'

  if (item.status !== 'ACTIVE' || !item.author) {
    return (
      <div className={`py-3 pr-4 ${indent}`}>
        <p className="text-body-sm text-text-tertiary">
          {PLACEHOLDER_COPY[item.status === 'DELETED' ? 'DELETED' : 'WITHDRAWN']}
        </p>
      </div>
    )
  }

  const author = item.author
  const cancelPress = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pressed.current = null
  }
  const pressHandlers = onLongPress
    ? {
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault()
          cancelPress()
          onLongPress()
        },
        onPointerDown: (e: React.PointerEvent) => {
          cancelPress()
          fired.current = false
          pressed.current = { x: e.clientX, y: e.clientY }
          timer.current = setTimeout(() => {
            fired.current = true
            onLongPress()
          }, LONG_PRESS_MS)
        },
        // 스크롤처럼 손가락이 움직이면 길게 누르기가 아니다
        onPointerMove: (e: React.PointerEvent) => {
          const start = pressed.current
          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX)
            cancelPress()
        },
        onPointerUp: cancelPress,
        onPointerLeave: cancelPress,
        onPointerCancel: cancelPress,
        onClickCapture: (e: React.MouseEvent) => {
          if (!fired.current) return
          fired.current = false
          e.preventDefault()
          e.stopPropagation()
        },
      }
    : {}

  return (
    <div className={`flex items-start gap-3 py-3 pr-4 ${indent}`} {...pressHandlers}>
      <button
        type="button"
        aria-label={`${author.nickname} 프로필`}
        onClick={() =>
          item.isMine
            ? navigate({ to: '/sns/me' })
            : navigate({ to: '/sns/users/$publicId', params: { publicId: author.publicId } })
        }
        className="flex-none"
      >
        <Avatar name={author.nickname} src={author.profileImageUrl ?? undefined} size="sm" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-2 text-caption">
          <span className="truncate font-semibold text-text-primary">{author.nickname}</span>
          <span className="flex-none tabular-nums text-text-tertiary">
            {relativeTimeLabel(item.createdAt)}
          </span>
          {item.edited && <span className="flex-none text-text-tertiary">수정됨</span>}
        </p>
        {editing ? (
          <CommentEditor
            initial={item.content ?? ''}
            saving={saving}
            onCancel={onCancelEdit}
            onSave={onSave}
          />
        ) : (
          <p className="whitespace-pre-line break-words text-body-sm text-text-primary">
            {item.content}
          </p>
        )}
        {!editing && (onReply || onEdit) && (
          <div className="flex items-center gap-3 text-caption">
            {onReply && (
              <button type="button" onClick={onReply} className="font-medium text-text-secondary">
                답글달기
              </button>
            )}
            {onEdit && onDelete && <EditDeleteActions onEdit={onEdit} onDelete={onDelete} />}
          </div>
        )}
      </div>
      {!editing && likeButton}
      {/* 길게 누르기를 쓸 수 없는 화면 읽기와 키보드 사용자를 위한 메뉴 버튼. 포커스를 받을 때만 보인다 */}
      {onLongPress && !item.isMine && (
        <button
          type="button"
          aria-label="댓글 메뉴"
          onClick={onLongPress}
          className="sr-only flex-none rounded-full text-icon focus:not-sr-only focus:flex focus:size-8 focus:items-center focus:justify-center focus-visible:shadow-focus-ring"
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
    </div>
  )
}

const commentLikeErrorMessage = (error: unknown) =>
  snsCommentErrorMessage(error, snsToggleErrorMessage(error))

/**
 * 댓글 좋아요 버튼과 수(design 6절 2번). 하트는 켜고 끄고 수는 댓글 좋아요한 사람을 연다. 자기 댓글에도 누를 수 있다(R1-19).
 * 안내 문구 항목에는 그리지 않는다(R1-20). 비로그인은 로그인 안내 시트를 열고 로그인 뒤 그 댓글에 켜기를 한 번 보낸다.
 */
function CommentLikeButton({
  postPublicId,
  item,
  requireAuth,
  notify,
  disabled,
}: {
  postPublicId: string
  item: SnsComment
  requireAuth: RequireAuth
  notify: Notify
  disabled: boolean
}) {
  const navigate = useNavigate()
  const like = useSnsCommentLike(postPublicId, item.publicId)
  const press = () =>
    requireAuth(
      'like',
      () => like(!item.liked, { onError: e => notify(commentLikeErrorMessage(e), 'error') }),
      { kind: 'commentLike', publicId: postPublicId, targetPublicId: item.publicId },
    )
  const openLikers = () =>
    requireAuth(
      'likers',
      () =>
        void navigate({
          to: '/sns/comments/$commentPublicId/likers',
          params: { commentPublicId: item.publicId },
        }),
      { kind: 'open', publicId: postPublicId, returnTo: `/sns/comments/${item.publicId}/likers` },
    )
  return (
    <div className="-mr-2 -mt-1.5 flex flex-none flex-col items-center">
      <button
        type="button"
        aria-label={`${item.author?.nickname}님 댓글 좋아요`}
        aria-pressed={item.liked}
        disabled={disabled}
        onClick={press}
        className={`flex size-8 items-center justify-center rounded-full focus-visible:outline-none focus-visible:shadow-focus-ring disabled:text-text-disabled ${item.liked ? 'text-social-active' : 'text-social-idle'}`}
      >
        <Heart className="size-4" fill={item.liked ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        onClick={openLikers}
        className="-mt-1.5 rounded-full px-1 text-caption tabular-nums text-text-tertiary focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        <span className="sr-only">{item.author?.nickname}님 댓글 좋아요한 사람</span>{' '}
        {item.likeCount.toLocaleString('ko-KR')}
      </button>
    </div>
  )
}

/** 로그인 뒤 다시 실행(A26). 비로그인으로 누른 댓글 좋아요를 켜기 요청으로 한 번 보낸다. 이미 좋아요했어도 201이라 그대로다 */
function ResumeCommentLike({
  postPublicId,
  commentPublicId,
  notify,
  sent,
}: {
  postPublicId: string
  commentPublicId: string
  notify: Notify
  /** 보냈는지. 목록이 비었다 다시 채워져 이 컴포넌트가 새로 마운트돼도 남도록 목록이 갖는다 */
  sent: MutableRefObject<boolean>
}) {
  const like = useSnsCommentLike(postPublicId, commentPublicId)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    like(true, { onError: e => notify(commentLikeErrorMessage(e), 'error') })
  }, [like, notify, sent])
  return null
}

/** 글자 수 카운터. 넘으면 오류 색으로 넘은 만큼을 알린다. 입력은 자르지 않는다(design 6절 5번) */
function CommentCounter({ text }: { text: string }) {
  const length = commentLength(text)
  if (length === 0) return null
  return (
    <span
      aria-live="polite"
      className={[
        'text-caption tabular-nums',
        length > COMMENT_MAX ? 'text-error-fg' : 'text-text-tertiary',
      ].join(' ')}
    >
      {length.toLocaleString('ko-KR')}/{COMMENT_MAX}
    </span>
  )
}

const writable = (text: string) => {
  const length = commentLength(text)
  return length > 0 && length <= COMMENT_MAX
}

function CommentEditor({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: string
  saving: boolean
  onCancel: () => void
  onSave: (content: string) => void
}) {
  const [text, setText] = useState(initial)
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="댓글 수정"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        autoFocus
        className="w-full resize-none rounded-input border border-border-default bg-surface-raised px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:shadow-focus-ring"
      />
      <div className="flex items-center justify-end gap-2">
        <CommentCounter text={text} />
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button size="sm" onClick={() => onSave(text)} disabled={!writable(text)} loading={saving}>
          저장
        </Button>
      </div>
    </div>
  )
}

/**
 * 하단 댓글 입력바(b7-st-2 sns-reply). 멘션은 만들지 않는다. 비로그인이 누르면 로그인 안내 시트를 연다.
 * 실패하면 입력과 키를 그대로 두어 다시 게시해도 댓글이 하나만 생긴다(P2).
 */
export function SnsCommentComposer({
  post,
  draft,
  requireAuth,
  notify,
}: {
  post: SnsPost
  draft: SnsCommentDraft
  requireAuth: RequireAuth
  notify: Notify
}) {
  const loggedIn = useIsLoggedIn()
  const queryClient = useQueryClient()
  const create = useCreateSnsComment(post.publicId)
  const target = draft.replyTo

  const askLogin = () => {
    requireAuth('comment', () => {}, { kind: 'comment', publicId: post.publicId })
  }

  const submit = () => {
    if (!writable(draft.text) || create.isPending) return
    create.mutate(
      {
        content: draft.text,
        parentPublicId: target?.publicId ?? null,
        idempotencyKey: draft.ensureKey(),
      },
      {
        onSuccess: ({ item, inserted }) => {
          if (!inserted) {
            if (!item.parentPublicId) draft.addAppended(item)
            else if (!draft.insertAppendedReply(item)) {
              void queryClient.invalidateQueries({
                queryKey: [...snsKeys.commentLists, post.publicId],
              })
            }
          }
          draft.reset()
        },
        onError: e => {
          const code = snsErrorCode(e)
          if (code === SNS_COMMENT_UNAVAILABLE || code === SNS_COMMENT_REPLY_CLOSED) {
            void queryClient.invalidateQueries({
              queryKey: [...snsKeys.commentLists, post.publicId],
            })
          }
          notify(snsCommentErrorMessage(e, '댓글을 등록하지 못했어요. 다시 시도해 주세요'), 'error')
        },
      },
    )
  }

  const placeholder = `${(target?.author ?? post.author).nickname}님에게 답글 남기기…`

  return (
    <div
      className="flex flex-col gap-2 border-t border-border-subtle bg-surface-raised px-4 pt-2"
      style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
    >
      {target && (
        <div className="flex items-center justify-between text-caption text-text-secondary">
          <span className="truncate">{target.author?.nickname}님에게 답글 남기는 중</span>
          <button
            type="button"
            onClick={() => draft.setReplyTo(null)}
            className="flex-none font-medium"
          >
            취소
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={draft.inputRef as RefObject<HTMLTextAreaElement>}
          aria-label="댓글 입력"
          placeholder={placeholder}
          value={draft.text}
          readOnly={!loggedIn}
          onFocus={e => {
            if (!loggedIn) {
              e.currentTarget.blur()
              askLogin()
            }
          }}
          onChange={e => draft.setText(e.target.value)}
          rows={1}
          className="max-h-24 min-h-10 flex-1 resize-none rounded-input border border-border-default bg-surface-raised px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:shadow-focus-ring"
        />
        <div className="flex flex-col items-end gap-1">
          <CommentCounter text={draft.text} />
          <Button
            size="sm"
            onClick={submit}
            disabled={!loggedIn || !writable(draft.text)}
            loading={create.isPending}
          >
            게시
          </Button>
        </div>
      </div>
    </div>
  )
}
