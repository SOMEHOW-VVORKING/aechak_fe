import { useEffect, useRef, useState, type RefObject } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { Alert, Avatar, BottomSheet, Button, Modal, Skeleton } from '@aechak/design-system/web'
import { useIsLoggedIn, type GateFeature, type GateResume } from '@/shared/auth'
import { EditDeleteActions } from '@/shared/components/EditDeleteActions'
import {
  SNS_COMMENT_REPLY_CLOSED,
  SNS_COMMENT_UNAVAILABLE,
  snsCommentErrorMessage,
  snsErrorCode,
  snsKeys,
  snsToggleErrorMessage,
  useCreateSnsComment,
  useDeleteSnsComment,
  useSnsCommentThread,
  useSnsComments,
  useSnsToggle,
  useUpdateSnsComment,
  type SnsComment,
  type SnsPost,
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

/** 로그인 뒤 다시 열 댓글 입력창이나 댓글 작성자 차단(A26) */
export interface SnsCommentResume {
  kind: 'comment' | 'commentBlock'
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

/**
 * 댓글 목록(b7-st-2 2-A). 비로그인도 본다(A9). 오래된순이고 대댓글은 한 단계 들여쓴다. 헤더의 수는 상세 commentCount다.
 * 알림으로 연 댓글(commentPublicId)은 로그인했을 때만 불러 목록 위에 고정한다(G7). 다른 사람 댓글을 길게 누르면 차단 시트를 연다.
 * 신고는 SNS-T21 전까지 숨긴다.
 */
export function SnsCommentList({
  post,
  draft,
  requireAuth,
  notify,
  pinnedCommentId,
  resume,
  onResumeDone,
}: {
  post: SnsPost
  draft: SnsCommentDraft
  requireAuth: RequireAuth
  notify: Notify
  pinnedCommentId?: string
  resume: SnsCommentResume | null
  onResumeDone: () => void
}) {
  const loggedIn = useIsLoggedIn()
  const comments = useSnsComments(post.publicId, true)
  const pinned = useSnsCommentThread(pinnedCommentId, loggedIn)
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

  // 로그인 뒤 다시 실행(A26). 입력창만 다시 열고 댓글은 보내지 않는다. 답글달기였으면 단건으로 그 댓글을 다시 읽어 아직 답글을
  // 달 수 있을 때만 그 답글 입력창을 연다. 차단은 그 작성자의 댓글이 아직 보일 때만 확인 시트를 다시 연다. 볼 수 없게 됐으면 안내만 한다.
  const resumeTarget = resume?.kind === 'comment' ? resume.targetPublicId : undefined
  const resumeThread = useSnsCommentThread(resumeTarget, loggedIn)
  const ready = comments.data != null
  useEffect(() => {
    if (!resume) return
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
    if (item.status !== 'ACTIVE' || item.isMine) return
    setMenuTarget(item)
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
        onSuccess: () => setEditing(null),
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
        setDeleteTarget(null)
        notify('댓글을 삭제했어요')
      },
      onError: e => {
        setDeleteTarget(null)
        notify(snsCommentErrorMessage(e, '댓글을 삭제하지 못했어요. 다시 시도해 주세요'), 'error')
      },
    })
  }

  const row = (item: SnsComment, actions = true) => (
    <SnsCommentRow
      key={item.publicId}
      item={item}
      editing={editing === item.publicId}
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

      {pinnedCommentId && loggedIn && (
        <div className="mx-4 my-2 rounded-card bg-surface-sunken py-1">
          {pinned.data ? (
            <div aria-label="알림으로 연 댓글" role="group">
              {pinned.data.parent && row(pinned.data.parent, false)}
              {row(pinned.data.comment, false)}
            </div>
          ) : snsErrorCode(pinned.error) === SNS_COMMENT_UNAVAILABLE ? (
            <p className="px-3 py-2 text-body-sm text-text-secondary">댓글을 찾을 수 없어요</p>
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
          {items.map(item => (
            <li key={item.publicId}>{row(item)}</li>
          ))}
          {extra.map(item => (
            <li key={item.publicId}>{row(item)}</li>
          ))}
        </ul>
      )}

      {comments.hasNextPage && (
        <div className="px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            loading={comments.isFetchingNextPage}
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
  }
  const pressHandlers = onLongPress
    ? {
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault()
          cancelPress()
          onLongPress()
        },
        onPointerDown: () => {
          cancelPress()
          timer.current = setTimeout(onLongPress, LONG_PRESS_MS)
        },
        onPointerUp: cancelPress,
        onPointerLeave: cancelPress,
        onPointerCancel: cancelPress,
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
    </div>
  )
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
            if (item.parentPublicId)
              void queryClient.invalidateQueries({
                queryKey: [...snsKeys.commentLists, post.publicId],
              })
            else draft.addAppended(item)
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
