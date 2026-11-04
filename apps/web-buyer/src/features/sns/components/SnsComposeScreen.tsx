import { useCallback, useRef, useState } from 'react'
import { useBlocker, useNavigate } from '@tanstack/react-router'
import {
  ChevronLeft,
  ChevronRight,
  Hash,
  Image as ImageIcon,
  LoaderCircle,
  Play,
  Plus,
  RotateCw,
  Video,
  X,
} from 'lucide-react'
import { Button, MobileScreen, Modal } from '@aechak/design-system/web'
import type { SnsPostCreateRequest } from '@aechak/api'
import { LoginGate, useSessionState } from '@/shared/auth'
import { AppToast } from '@/shared/components/AppToast'
import { useSafeBack } from '@/shared/useSafeBack'
import { PHOTO_MAX, useSnsAttachments, type Attachment } from '../sns.attachments'
import { SNS_UPLOAD_NOT_FOUND, snsErrorCode, snsPostErrorMessage, useCreateSnsPost } from '../sns.queries'
import { CAPTION_MAX, captionLength, clampCaption, hasHashWord, normalizeCaption } from '../sns.text'
import { HashtagChips, SnsHashtagPicker } from './SnsHashtagPicker'

function randomId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

// 게시물 작성(b7-st-3 3-A). 첨부는 고르는 즉시 올리고 모두 끝나야 게시할 수 있다(P13). 임시저장은 하지 않아
// 닫으면 입력을 버리므로 닫기는 확인을 거친다(P14). 닫기 버튼과 브라우저 뒤로 가기가 같은 확인을 지난다.
// 비로그인이 주소로 바로 들어오면 요청 없이 로그인 안내 시트를 열고(design 6절 10번), 로그인 뒤 이 화면으로 돌아온다.
export function SnsComposeScreen() {
  const navigate = useNavigate()
  const goBack = useSafeBack({ to: '/sns' })
  const guest = useSessionState() === 'guest'
  const [toast, setToast] = useState({ open: false, message: '' })
  const notify = (message: string) => setToast({ open: true, message })
  const attachments = useSnsAttachments({ onNotice: notify })
  const create = useCreateSnsPost()
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  // 화면을 열 때 한 번 만들어 이 화면의 모든 게시 시도에 보낸다. 응답을 받지 못해 다시 눌러도 게시물은 하나다(P13).
  const [idempotencyKey] = useState(randomId)
  const [submitting, setSubmitting] = useState(false)
  // 연타는 다시 그리기 전에 두 번 들어오므로 상태가 아니라 ref로 막는다.
  const submittingRef = useRef(false)
  // 나가기 확인의 응답. true면 머물고 false면 나간다(useBlocker의 shouldBlockFn이 기다린다).
  const [leaveConfirm, setLeaveConfirm] = useState<((stay: boolean) => void) | null>(null)
  const leavingRef = useRef(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)

  const text = normalizeCaption(caption)
  const { items } = attachments
  const hasVideo = items.some(item => item.kind === 'video')
  // 캡션이 비었거나 공백뿐이고 첨부도 없으면 게시할 수 없다(P1).
  const canPublish = !submitting && attachments.ready && (text !== '' || items.length > 0)
  const dirty = caption.trim() !== '' || items.length > 0 || hashtags.length > 0

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // 블로커는 함수가 바뀔 때마다 다시 등록되므로 ref만 읽는 고정 함수로 둔다.
  const shouldBlockFn = useCallback(({ next }: { next: { pathname: string } }) => {
    // 세션 만료와 온보딩 이동은 막지 않는다. 막으면 인증이 끊긴 화면에 남는다.
    if (leavingRef.current || next.pathname.startsWith('/onboarding')) return false
    // 게시 중에는 나가지 않는다. 나가도 게시는 서버에서 끝나 취소 확인의 약속(저장되지 않음)이 거짓이 된다.
    if (submittingRef.current) return true
    if (!dirtyRef.current) return false
    return new Promise<boolean>(resolve => setLeaveConfirm(() => resolve))
  }, [])
  const enableBeforeUnload = useCallback(() => dirtyRef.current, [])
  useBlocker({ shouldBlockFn, enableBeforeUnload })

  const answerLeave = (stay: boolean) => {
    leaveConfirm?.(stay)
    setLeaveConfirm(null)
  }

  // 빈 필드는 생략한다. 생략하면 null이나 빈 배열과 같다(SnsPostCreateRequest). 영상은 키, 썸네일 키, 길이를 함께 보낸다.
  const bodyOf = (current: Attachment[]): SnsPostCreateRequest => {
    const video = current.find(item => item.kind === 'video')
    const photoKeys = current.flatMap(item => (item.kind === 'photo' ? [item.key!] : []))
    return {
      caption: text === '' ? null : text,
      ...(photoKeys.length > 0 && { photoKeys }),
      ...(video && { video: { key: video.key!, thumbnailKey: video.thumbnailKey!, durationMs: video.durationMs! } }),
      ...(hashtags.length > 0 && { hashtags }),
    }
  }

  const publish = async () => {
    if (!canPublish || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const send = (current: Attachment[]) => create.mutateAsync({ idempotencyKey, body: bodyOf(current) })
    try {
      const result = await send(items).catch(async (error: unknown) => {
        // tmp 원본이 지워졌다(404 100001). 같은 키로 다시 보내도 계속 실패하므로 로컬 Blob으로 모두 다시 올린 뒤
        // 같은 키로 한 번 더 보낸다(FE 게시 오류 처리).
        if (snsErrorCode(error) !== SNS_UPLOAD_NOT_FOUND) throw error
        return send(await attachments.reuploadAll())
      })
      leavingRef.current = true
      void navigate({ to: '/sns/posts/$publicId', params: { publicId: result.publicId }, replace: true })
    } catch (error) {
      // 실패하면 캡션과 첨부를 그대로 두고 같은 키로 다시 게시할 수 있다.
      notify(snsPostErrorMessage(error, '게시하지 못했어요. 다시 시도해 주세요'))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  // 나가기 확인은 해시태그 모달을 연 채 이동해도 보여야 한다. 블로커가 이 응답을 기다린다.
  const leaveModal = leaveConfirm && (
    <Modal
      open
      onClose={() => answerLeave(true)}
      title="작성을 취소할까요?"
      description="작성한 내용은 저장되지 않아요."
      confirmLabel="나가기"
      cancelLabel="계속 쓰기"
      confirmVariant="danger"
      onConfirm={() => answerLeave(false)}
    />
  )

  // 해시태그 모달은 작성 화면 위에 통째로 그린다. 작성 상태는 이 컴포넌트가 들고 있어 그대로 남는다.
  if (pickerOpen) {
    return (
      <>
        <SnsHashtagPicker
          initial={hashtags}
          onCancel={() => setPickerOpen(false)}
          onDone={tags => {
            setHashtags(tags)
            setPickerOpen(false)
          }}
        />
        {leaveModal}
      </>
    )
  }

  return (
    <MobileScreen
      header={
        <div className="flex h-14 items-center gap-2 px-2">
          <button
            type="button"
            aria-label="닫기"
            disabled={submitting}
            onClick={goBack}
            className="flex size-10 flex-none items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <X className="size-6" />
          </button>
          <span className="text-subheading font-semibold text-text-primary">새 게시물</span>
          <div className="ml-auto pr-1">
            <Button size="sm" disabled={!canPublish} loading={submitting} onClick={() => void publish()}>
              게시
            </Button>
          </div>
        </div>
      }
      footer={
        <div
          className="flex items-center gap-1 border-t border-border px-2 pt-1.5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)' }}
        >
          <button
            type="button"
            aria-label="사진 첨부"
            disabled={submitting}
            onClick={() => photoInput.current?.click()}
            className="flex size-10 items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring disabled:text-icon-muted"
          >
            <ImageIcon className="size-6" />
          </button>
          <button
            type="button"
            aria-label="영상 첨부"
            disabled={submitting}
            onClick={() => videoInput.current?.click()}
            className="flex size-10 items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring disabled:text-icon-muted"
          >
            <Video className="size-6" />
          </button>
          <span className="ml-auto pr-2 text-caption tabular-nums text-text-tertiary">
            {captionLength(caption)}/{CAPTION_MAX}
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-4 py-3">
        <div className="flex flex-col gap-1.5">
          {/* 네이티브 maxLength는 UTF-16 단위로 세어 쓰지 않고 카운터와 같은 기준으로 자른다(G3). */}
          <textarea
            aria-label="캡션"
            value={caption}
            // 게시 중에 고친 글은 보낸 요청에 실리지 않는다.
            readOnly={submitting}
            onChange={e => {
              const value = e.target.value
              setCaption(prev => clampCaption(prev, value))
            }}
            placeholder="문구를 입력해 주세요"
            rows={6}
            className="w-full resize-none bg-transparent text-body leading-relaxed text-text-primary outline-none placeholder:text-text-placeholder"
          />
          {hasHashWord(caption) && (
            <p className="text-caption text-text-secondary">
              캡션에 쓴 #단어는 해시태그로 등록되지 않아요. 해시태그는 해시태그 추가로 달아 주세요.
            </p>
          )}
        </div>

        {items.length > 0 && (
          <ul aria-label="첨부" className="flex flex-wrap gap-2">
            {items.map((item, index) => (
              <AttachmentTile
                key={item.id}
                item={item}
                index={index}
                count={items.length}
                locked={submitting}
                onMove={offset => attachments.move(item.id, offset)}
                onRetry={() => attachments.retry(item.id)}
                onRemove={() => attachments.remove(item.id)}
              />
            ))}
            {!hasVideo && items.length < PHOTO_MAX && (
              <li>
                <button
                  type="button"
                  aria-label="사진 추가"
                  disabled={submitting}
                  onClick={() => photoInput.current?.click()}
                  className="flex size-24 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-border text-icon-muted"
                >
                  <Plus className="size-5" />
                  <span className="text-badge tabular-nums">
                    {items.length}/{PHOTO_MAX}
                  </span>
                </button>
              </li>
            )}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <HashtagChips
            tags={hashtags}
            disabled={submitting}
            onRemove={tag => setHashtags(prev => prev.filter(t => t !== tag))}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Hash className="size-4" />}
            disabled={submitting}
            onClick={() => setPickerOpen(true)}
          >
            해시태그 추가
          </Button>
        </div>
      </div>

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="사진 파일"
        onChange={e => {
          attachments.addPhotos(Array.from(e.target.files ?? []))
          // 같은 파일을 다시 골라도 change가 오게 비운다.
          e.target.value = ''
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        hidden
        aria-label="영상 파일"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) attachments.addVideo(file)
          e.target.value = ''
        }}
      />

      {leaveModal}

      <LoginGate open={guest} feature="write" onClose={goBack} resume={{ kind: 'open', publicId: '' }} />
      <AppToast
        open={toast.open}
        message={toast.message}
        variant="error"
        aboveActionBar
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
      />
    </MobileScreen>
  )
}

const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function AttachmentTile({
  item,
  index,
  count,
  locked,
  onMove,
  onRetry,
  onRemove,
}: {
  item: Attachment
  index: number
  count: number
  /** 게시 중에는 순서와 구성을 바꾸지 않는다 */
  locked: boolean
  onMove: (offset: -1 | 1) => void
  onRetry: () => void
  onRemove: () => void
}) {
  const video = item.kind === 'video' ? item : null
  const label = video ? '영상' : `사진 ${index + 1}`
  const busy = item.status === 'processing' || item.status === 'uploading'
  const iconButton =
    'flex size-6 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-focus-ring'
  return (
    <li className="relative size-24 overflow-hidden rounded-card bg-surface-sunken">
      {item.previewUrl && <img src={item.previewUrl} alt={label} className="size-full object-cover" />}
      {video?.status === 'done' && video.durationMs != null && (
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/55 px-1 text-badge text-white">
          <Play className="size-3" />
          {formatDuration(video.durationMs)}
        </span>
      )}
      {busy && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 text-white">
          <LoaderCircle className="size-6 animate-spin" />
          {video?.status === 'uploading' && (
            <span className="text-badge tabular-nums">{Math.round(video.progress * 100)}%</span>
          )}
          <span className="sr-only">{label} 올리는 중</span>
        </span>
      )}
      {/* 이 기기가 디코딩하지 못하는 영상이다. 다시 시도해도 같아서 빼기만 둔다(design 6절 4번).
          안내는 빼기 버튼(위 28px) 아래에 두고 낱말 중간에서 줄을 바꾸지 않는다. */}
      {item.status === 'unsupported' && (
        <span className="absolute inset-0 flex items-center justify-center break-keep bg-black/55 px-1.5 pb-1.5 pt-7 text-center text-badge text-white">
          이 기기에서 올릴 수 없는 영상 형식이에요
        </span>
      )}
      {item.status === 'failed' && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-white">
          <span className="text-badge">올리지 못했어요</span>
          <button type="button" aria-label={`${label} 다시 시도`} onClick={onRetry} className={iconButton}>
            <RotateCw className="size-3.5" />
          </button>
        </span>
      )}
      <button
        type="button"
        aria-label={`${label} 빼기`}
        disabled={locked}
        onClick={onRemove}
        className={`absolute right-1 top-1 ${iconButton}`}
      >
        <X className="size-3.5" />
      </button>
      {!video && count > 1 && (
        <span className="absolute inset-x-1 bottom-1 flex justify-between">
          <button
            type="button"
            aria-label={`${label} 앞으로`}
            disabled={locked || index === 0}
            onClick={() => onMove(-1)}
            className={iconButton}
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`${label} 뒤로`}
            disabled={locked || index === count - 1}
            onClick={() => onMove(1)}
            className={iconButton}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </span>
      )}
    </li>
  )
}
