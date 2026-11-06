import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useBlocker, useNavigate } from '@tanstack/react-router'
import { FileX, Hash } from 'lucide-react'
import { Alert, Button, MobileScreen, Modal, Skeleton } from '@aechak/design-system/web'
import { LoginGate, useSessionState } from '@/shared/auth'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  SNS_POST_NOT_MINE,
  SNS_POST_UNAVAILABLE,
  snsErrorCode,
  snsPostErrorMessage,
  useSnsPost,
  useUpdateSnsPost,
} from '../sns.queries'
import { CAPTION_MAX, captionLength, clampCaption, hasHashWord, normalizeCaption } from '../sns.text'
import { HashtagChips, SnsHashtagPicker } from './SnsHashtagPicker'

interface EditForm {
  caption: string
  hashtags: string[]
}

// 게시물 수정. 캡션과 해시태그만 고치고 사진과 영상은 바꿀 수 없게 그린다(P8). 본인 게시물이 아니면 상세로 보낸다.
// 비로그인이 주소로 바로 들어오면 요청 없이 로그인 안내 시트를 연다(design 6절 10번). 고친 내용이 있으면 나가기 전에
// 작성 화면과 같은 확인을 거친다.
export function SnsPostEditScreen({ publicId }: { publicId: string }) {
  const navigate = useNavigate()
  const goBack = useSafeBack({ to: '/sns/posts/$publicId', params: { publicId } })
  const session = useSessionState()
  const guest = session === 'guest'
  const { data: post, error, isPending, refetch } = useSnsPost(publicId, { enabled: !guest })
  const update = useUpdateSnsPost(publicId)
  const [form, setForm] = useState<EditForm | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // 모달은 수정 화면을 통째로 갈아 끼워 닫으면 포커스가 사라진다. 닫고 돌아온 화면은 해시태그 추가 버튼에 포커스를 둔다.
  const [pickerClosed, setPickerClosed] = useState(false)
  const closePicker = () => {
    setPickerOpen(false)
    setPickerClosed(true)
  }
  // 다른 기기에서 지운 게시물을 저장하면 130400이 온다(AC-SNS02-028).
  const [deleted, setDeleted] = useState(false)
  const [toast, setToast] = useState({ open: false, message: '' })
  // 나가기 확인의 응답. true면 머물고 false면 나간다(useBlocker의 shouldBlockFn이 기다린다).
  const [leaveConfirm, setLeaveConfirm] = useState<((stay: boolean) => void) | null>(null)
  const leavingRef = useRef(false)

  // 폼은 처음 받은 상세로 한 번만 채운다. 다시 채우면 저장 뒤 다시 읽는 사이 입력이 되돌아간다(AGENTS.md 7절).
  useEffect(() => {
    if (post?.isMine && !form) setForm({ caption: post.caption ?? '', hashtags: post.hashtags })
  }, [post, form])

  // 세션을 확인하기 전(unknown)에는 토큰 없이 읽어 본인 게시물도 isMine이 false로 온다(design 6절 11번).
  // 회원으로 확인된 뒤에만 상세로 보내고, 그때까지는 스켈레톤을 두었다가 회원이 되면 다시 읽은 상세로 폼을 채운다.
  useEffect(() => {
    if (session === 'member' && post && !post.isMine) {
      void navigate({ to: '/sns/posts/$publicId', params: { publicId }, replace: true })
    }
  }, [session, post, navigate, publicId])

  const unavailable = deleted || snsErrorCode(error) === SNS_POST_UNAVAILABLE
  // 다시 조회가 실패하면 고친 내용은 남기고 저장만 잠근다(AGENTS.md 6절 7).
  const refreshFailed = error != null && post != null
  const text = form ? normalizeCaption(form.caption) : ''
  const hasMedia = post != null && (post.photoUrls.length > 0 || post.video != null)
  // 텍스트 게시물의 캡션을 모두 지우면 내용이 없는 게시물이 되어 저장할 수 없다(P1).
  const canSave = form != null && !update.isPending && !refreshFailed && (text !== '' || hasMedia)
  // 저장된 게시물과 캡션이나 해시태그가 다를 때만 묻는다. 삭제된 게시물은 저장할 곳이 없어 묻지 않는다.
  const dirty =
    !unavailable &&
    form != null &&
    post != null &&
    (text !== (post.caption ?? '') || form.hashtags.join('\n') !== post.hashtags.join('\n'))

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const savingRef = useRef(false)
  savingRef.current = update.isPending

  // 블로커는 함수가 바뀔 때마다 다시 등록되므로 ref만 읽는 고정 함수로 둔다.
  const shouldBlockFn = useCallback(({ next }: { next: { pathname: string } }) => {
    // 세션 만료와 온보딩 이동은 막지 않는다. 막으면 인증이 끊긴 화면에 남는다.
    if (leavingRef.current || next.pathname.startsWith('/onboarding')) return false
    // 저장 중에는 묻지 않고 머문다. 나가도 저장은 서버에서 끝나 저장되지 않는다는 안내가 거짓이 된다.
    if (savingRef.current) return true
    if (!dirtyRef.current) return false
    return new Promise<boolean>(resolve => setLeaveConfirm(() => resolve))
  }, [])
  const enableBeforeUnload = useCallback(() => dirtyRef.current, [])
  useBlocker({ shouldBlockFn, enableBeforeUnload })

  const answerLeave = (stay: boolean) => {
    leaveConfirm?.(stay)
    setLeaveConfirm(null)
  }

  const save = () => {
    if (!form || !canSave) return
    // hashtags는 필수다. 빈 배열은 태그를 모두 빼라는 뜻이라 고르지 않았어도 지금 칩을 그대로 보낸다.
    update.mutate(
      { caption: text === '' ? null : text, hashtags: form.hashtags },
      {
        onSuccess: () => {
          leavingRef.current = true
          goBack()
        },
        onError: e => {
          if (snsErrorCode(e) === SNS_POST_UNAVAILABLE) {
            setDeleted(true)
            return
          }
          const message =
            snsErrorCode(e) === SNS_POST_NOT_MINE
              ? '본인 게시물만 수정할 수 있어요'
              : snsPostErrorMessage(e, '수정하지 못했어요. 다시 시도해 주세요')
          setToast({ open: true, message })
        },
      },
    )
  }

  // 나가기 확인은 해시태그 모달을 연 채 이동해도 보여야 한다. 블로커가 이 응답을 기다린다.
  const leaveModal = leaveConfirm && (
    <Modal
      open
      onClose={() => answerLeave(true)}
      title="수정을 취소할까요?"
      description="수정한 내용은 저장되지 않아요."
      confirmLabel="나가기"
      cancelLabel="계속 수정"
      confirmVariant="danger"
      onConfirm={() => answerLeave(false)}
    />
  )

  if (pickerOpen && form) {
    return (
      <>
        <SnsHashtagPicker
          initial={form.hashtags}
          onCancel={closePicker}
          onDone={hashtags => {
            setForm({ ...form, hashtags })
            closePicker()
          }}
        />
        {leaveModal}
      </>
    )
  }

  const screen = (content: ReactNode, actions?: ReactNode) => (
    <MobileScreen header={<BackAppBar onBack={goBack} title="게시물 수정" actions={actions} />}>
      {content}
      {leaveModal}
      <LoginGate open={guest} feature="write" onClose={goBack} resume={{ kind: 'open', publicId: '' }} />
      <AppToast
        open={toast.open}
        message={toast.message}
        variant="error"
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
      />
    </MobileScreen>
  )

  if (guest) return screen(null)

  if (unavailable) {
    return screen(
      <ScreenEmptyState
        icon={<FileX className="size-6" />}
        title="삭제된 게시물이에요"
        description="게시물이 삭제되어 더 이상 볼 수 없어요."
      />,
    )
  }

  if (!post && !isPending) {
    return screen(
      <ScreenEmptyState
        title="게시물을 불러오지 못했어요"
        description="잠시 후 다시 시도해 주세요."
        action={{ label: '다시 시도', onClick: () => void refetch() }}
      />,
    )
  }

  if (!post || !form) {
    return screen(
      <div className="flex flex-col gap-3 p-4">
        <Skeleton variant="text" className="w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>,
    )
  }

  return screen(
    <div className="flex flex-col gap-4 px-4 py-3">
      {refreshFailed && (
        <Alert variant="error">
          게시물을 다시 불러오지 못했어요.{' '}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">
            다시 시도
          </button>
        </Alert>
      )}

      {/* 사진과 영상은 바꿀 수 없다. 보여주기만 하고 빼기, 순서 바꾸기, 추가를 두지 않는다(P8). */}
      {hasMedia && (
        <section aria-label="첨부 미디어" className="flex flex-col gap-2">
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {post.video ? (
              <img
                src={post.video.thumbnailUrl}
                alt="영상 썸네일"
                className="size-24 flex-none rounded-card bg-surface-sunken object-cover"
              />
            ) : (
              post.photoUrls.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={`사진 ${i + 1}`}
                  className="size-24 flex-none rounded-card bg-surface-sunken object-cover"
                />
              ))
            )}
          </div>
          <p className="text-caption text-text-tertiary">사진과 영상은 바꿀 수 없어요.</p>
        </section>
      )}

      <div className="flex flex-col gap-1.5">
        <textarea
          aria-label="캡션"
          value={form.caption}
          readOnly={update.isPending}
          onChange={e => {
            const value = e.target.value
            setForm(prev => prev && { ...prev, caption: clampCaption(prev.caption, value) })
          }}
          placeholder="문구를 입력해 주세요"
          rows={6}
          className="w-full resize-none bg-transparent text-body leading-relaxed text-text-primary outline-none placeholder:text-text-placeholder"
        />
        <div className="flex items-start gap-2">
          {hasHashWord(form.caption) && (
            <p className="text-caption text-text-secondary">
              캡션에 쓴 #단어는 해시태그로 등록되지 않아요. 해시태그는 해시태그 추가로 달아 주세요.
            </p>
          )}
          <span className="ml-auto flex-none text-caption tabular-nums text-text-tertiary">
            {captionLength(form.caption)}/{CAPTION_MAX}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <HashtagChips
          tags={form.hashtags}
          disabled={update.isPending}
          onRemove={tag => setForm({ ...form, hashtags: form.hashtags.filter(t => t !== tag) })}
        />
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Hash className="size-4" />}
          disabled={update.isPending}
          autoFocus={pickerClosed}
          onClick={() => setPickerOpen(true)}
        >
          해시태그 추가
        </Button>
      </div>
    </div>,
    <Button size="sm" disabled={!canSave} loading={update.isPending} onClick={save}>
      저장
    </Button>,
  )
}
