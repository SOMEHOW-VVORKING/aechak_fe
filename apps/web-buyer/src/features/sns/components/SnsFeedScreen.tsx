import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState, Modal, Skeleton, Tabs } from '@aechak/design-system/web'
import {
  LoginGate,
  peekPendingAction,
  takePendingAction,
  useIsLoggedIn,
  useLoginGate,
  type GateResume,
  type UseLoginGate,
} from '@/shared/auth'
import { AppToast } from '@/shared/components/AppToast'
import { SNS_SERVER_AVAILABLE } from '@/shared/sns-availability'
import {
  SNS_POST_NOT_MINE,
  snsErrorCode,
  snsKeys,
  snsToggleErrorMessage,
  useDeleteSnsPost,
  useSnsFeed,
  useSnsToggle,
  type SnsFeedKind,
  type SnsPost,
  type SnsReactionKind,
} from '../sns.queries'
import { RELATION_CONFIRM } from '../sns.copy'
import { SnsFeedCard } from './SnsFeedCard'
import { SnsListEnd, SnsListError, SnsRefetchError } from './SnsListEnd'
import { SnsPostMoreSheet } from './SnsPostMoreSheet'
import { SnsResumeReaction } from './SnsReactionButton'
import { SnsWriteFab } from './SnsWriteFab'

// 빈 상태(P5). 팔로잉 피드만 탐색 탭 이동 버튼을 두고 탐색, 인기는 안내 문구만이다. 디자인이 없어 FE가 먼저 썼다.
const FEED_TABS: { key: SnsFeedKind; label: string; empty: string }[] = [
  { key: 'following', label: '팔로잉', empty: '팔로잉 피드에 아직 글이 없어요' },
  { key: 'explore', label: '탐색', empty: '최근 7일 동안 올라온 글이 없어요' },
  { key: 'popular', label: '인기', empty: '지금은 인기 글이 없어요' },
]

/** 피드 라우트의 search(`?tab=`). 모르는 값은 버리고 기본 탭을 쓴다 */
export function snsFeedSearch(search: Record<string, unknown>): { tab?: SnsFeedKind } {
  const tab = FEED_TABS.find(t => t.key === search['tab'])?.key
  return tab ? { tab } : {}
}

interface ToastState {
  open: boolean
  message: string
  variant: 'success' | 'error'
}

interface FeedConfirm {
  kind: 'block' | 'unmute'
  post: SnsPost
}

function FeedSkeleton() {
  return (
    <div role="status" aria-label="게시물을 불러오는 중">
      {[0, 1].map(i => (
        <div key={i} className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Skeleton variant="circle" className="size-10" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton variant="text" className="w-28" />
              <Skeleton variant="text" className="w-16" />
            </div>
          </div>
          <Skeleton variant="text" className="w-full" />
          <Skeleton variant="text" className="w-3/4" />
          {i === 0 && <Skeleton className="aspect-[4/3] w-full" />}
        </div>
      ))}
    </div>
  )
}

// SNS 피드(b7-st-1). /sns/feed와 하단 SNS 탭(SNS_SERVER_AVAILABLE일 때)이 같은 화면을 그린다(design 6절 1번).
// 앱 바는 제목만 그린다. 검색과 알림 버튼은 SNS-06, SNS-05가 그 화면과 함께 붙인다. 탭은 눌러서만 바꾼다.
export function SnsFeedScreen({
  tab,
  onTabChange,
}: {
  tab?: SnsFeedKind
  onTabChange: (tab: SnsFeedKind) => void
}) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: s => s.location.pathname })
  const queryClient = useQueryClient()
  const loggedIn = useIsLoggedIn()
  // 첫 탭은 로그인이면 팔로잉, 비로그인이면 탐색이다(P1). 비로그인은 팔로잉을 볼 수 없어 주소에 있어도 탐색을 그린다.
  const kind: SnsFeedKind = tab === 'following' && !loggedIn ? 'explore' : (tab ?? (loggedIn ? 'following' : 'explore'))
  const feed = useSnsFeed(kind)
  const toggle = useSnsToggle()
  const remove = useDeleteSnsPost()
  const { gateOpen, gateFeature, gateResume, requireAuth, closeGate } = useLoginGate()
  const listRef = useRef<HTMLDivElement>(null)
  // 차단, 뮤트, 삭제가 끝나면 그 처리를 연 카드가 사라져 포커스가 body로 떨어진다. 늘 남는 앱 바 제목으로 먼저 옮긴다.
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 더보기 시트는 닫히는 동안에도 마지막 대상을 그린다. 확인 Modal의 타겟도 화면이 소유한다(AGENTS.md 4절).
  const [more, setMore] = useState<{ post: SnsPost; open: boolean } | null>(null)
  const [confirm, setConfirm] = useState<FeedConfirm | null>(null)
  const [deleting, setDeleting] = useState<SnsPost | null>(null)
  // 로그인 뒤 다시 켤 리포스트나 저장(A26). 정해지면 SnsResumeReaction이 한 번 보낸다.
  const [resume, setResume] = useState<{ kind: SnsReactionKind; publicId: string } | null>(null)
  const [toast, setToast] = useState<ToastState>({ open: false, message: '', variant: 'success' })

  const showToast = (message: string, variant: ToastState['variant'] = 'success') =>
    setToast({ open: true, message, variant })
  const reactionError = (message: string) => showToast(message, 'error')

  // 카드에서 연 로그인 안내 시트는 로그인 뒤 같은 탭으로 돌아오게 지금 탭을 주소에 먼저 적는다. 주소에 탭이 없으면
  // 비로그인은 탐색을 보다가 로그인 뒤 같은 주소에서 팔로잉을 연다(P1).
  const gate: UseLoginGate['requireAuth'] = (feature, action, resumeAction) => {
    if (!loggedIn && tab !== kind) onTabChange(kind)
    return requireAuth(feature, action, resumeAction)
  }

  // 로그인 뒤 다시 실행(A26, design 6절 10번). 카드에서 남긴 행동은 피드를 받은 뒤 꺼낸다. 리포스트, 저장은 확인 없이 한 번
  // 켠다. 받아 둔 카드면 바로 켜진 모양이 된다. 받아 둔 내 글의 리포스트는 버튼이 잠겨 있어 버린다. 차단, 뮤트는 확인이 더
  // 필요해 그 카드의 확인 Modal이나 더보기 시트만 다시 연다. 로그인한 피드에 그 카드가 없으면(그사이 볼 수 없게 됐거나 내 글)
  // 열지 않는다.
  const items = feed.data
  useEffect(() => {
    if (!loggedIn || !items) return
    const pending = peekPendingAction()
    if (!pending) return
    const { kind, publicId } = pending
    if (kind !== 'repost' && kind !== 'save' && kind !== 'block' && kind !== 'mute') return
    takePendingAction(publicId)
    const post = items.find(item => item.post.publicId === publicId)?.post
    if (kind === 'repost' || kind === 'save') {
      if (kind === 'save' || !post?.isMine) setResume({ kind, publicId })
    } else if (post && !post.isMine) {
      if (kind === 'block') setConfirm({ kind: 'block', post })
      else setMore({ post, open: true })
    }
  }, [loggedIn, items])

  const selectTab = (next: SnsFeedKind) => {
    // 지금 탭을 다시 누르면 첫 페이지부터 새 기준 시각으로 다시 읽는다(design 6절 7번).
    if (next === kind) {
      if (listRef.current) listRef.current.scrollTop = 0
      void queryClient.resetQueries({ queryKey: snsKeys.feed(kind, loggedIn) })
      return
    }
    // 다른 탭도 맨 위에서 연다. 스크롤 칸은 탭이 바뀌어도 같은 요소라 받아 둔 탭이 이전 탭의 깊이에서 열린다.
    const open = () => {
      if (listRef.current) listRef.current.scrollTop = 0
      onTabChange(next)
    }
    // 비로그인이 팔로잉을 누르면 로그인 안내 시트를 열고 로그인 뒤 이 피드의 팔로잉 탭으로 돌아온다(A9, A26). 주소의 탭은
    // 보던 탭 그대로 두고 돌아올 주소에만 팔로잉을 적는다.
    if (next === 'following') {
      const resume: GateResume = { kind: 'open', publicId: '', returnTo: `${pathname}?tab=following` }
      requireAuth('feed', open, resume)
    } else open()
  }

  const copyLink = async (post: SnsPost) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/sns/posts/${post.publicId}`)
      showToast('링크를 복사했어요')
    } catch {
      showToast('링크를 복사하지 못했어요', 'error')
    }
  }

  const mute = (post: SnsPost) =>
    gate(
      'mute',
      () =>
        toggle.mutate(
          { kind: 'mute', publicId: post.author.publicId, on: true },
          {
            onSuccess: () => {
              titleRef.current?.focus()
              showToast('뮤트했어요')
            },
            onError: e => showToast(snsToggleErrorMessage(e), 'error'),
          },
        ),
      { kind: 'mute', publicId: post.publicId },
    )

  // 차단과 뮤트 해제는 확인을 거친다. 성공하면 useSnsToggle이 받아 둔 피드를 지워 첫 페이지부터 다시 읽는다.
  const handleConfirm = () => {
    if (!confirm) return
    const copy = RELATION_CONFIRM[confirm.kind]
    toggle.mutate(
      { kind: copy.kind, publicId: confirm.post.author.publicId, on: copy.on },
      {
        onSuccess: () => {
          titleRef.current?.focus()
          setConfirm(null)
          showToast(copy.done)
        },
        onError: e => {
          setConfirm(null)
          showToast(snsToggleErrorMessage(e), 'error')
        },
      },
    )
  }

  // 카드에서 지우면 useDeleteSnsPost가 받아 둔 피드에서 그 카드를 뺀다.
  const handleDelete = () => {
    if (!deleting) return
    remove.mutate(deleting.publicId, {
      onSuccess: () => {
        titleRef.current?.focus()
        setDeleting(null)
        showToast('게시물을 삭제했어요')
      },
      onError: e => {
        setDeleting(null)
        showToast(
          snsErrorCode(e) === SNS_POST_NOT_MINE ? '본인 게시물만 삭제할 수 있어요' : '삭제하지 못했어요. 다시 시도해 주세요',
          'error',
        )
      },
    })
  }

  // 다시 읽기가 실패하면 받아 둔 카드는 두고 그 값으로 하는 처리(반응, 수정, 삭제, 뮤트, 차단)만 잠근다(AGENTS.md 6절 7).
  const refreshFailed = feed.isRefetchError
  const empty = FEED_TABS.find(t => t.key === kind)!.empty
  let body: ReactNode
  if (feed.isPending) {
    body = <FeedSkeleton />
  } else if (!feed.data) {
    body = <SnsListError onRetry={() => void feed.refetch()} />
  } else if (feed.data.length === 0 && !feed.hasNextPage) {
    // 받아 둔 카드를 모두 뺐어도 다음 페이지가 남았으면 빈 안내 대신 아래 목록 끝을 두어 이어 부른다.
    body = (
      <EmptyState
        title={empty}
        description={kind === 'following' ? '탐색에서 마음에 드는 이웃을 찾아 팔로우해 보세요.' : undefined}
        action={kind === 'following' ? { label: '탐색 보기', onClick: () => onTabChange('explore') } : undefined}
      />
    )
  } else {
    body = (
      <>
        <ul className="divide-y divide-border-subtle">
          {feed.data.map(item => (
            <li key={item.post.publicId}>
              <SnsFeedCard
                item={item}
                onMore={post => setMore({ post, open: true })}
                requireAuth={gate}
                onReactionError={reactionError}
                locked={refreshFailed}
              />
            </li>
          ))}
        </ul>
        <SnsListEnd
          hasNextPage={feed.hasNextPage}
          isFetchingNextPage={feed.isFetchingNextPage}
          isFetchNextPageError={feed.isFetchNextPageError}
          fetchNextPage={feed.fetchNextPage}
        />
      </>
    )
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-none bg-surface-base">
        <div className="flex h-14 items-center px-4">
          <h1 ref={titleRef} tabIndex={-1} className="text-heading outline-none font-bold tracking-tight text-text-primary">애착 SNS</h1>
        </div>
        <Tabs
          tabs={FEED_TABS}
          activeKey={kind}
          onSelect={key => selectTab(key as SnsFeedKind)}
          className="[&>button]:flex-1"
        />
      </div>
      {/* 아래 여백(96px)은 글쓰기 버튼(바닥에서 72px)보다 커서 끝까지 내리면 마지막 카드의 버튼이 글쓰기 버튼에 가리지 않는다. */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto pb-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {refreshFailed && <SnsRefetchError onRetry={() => void feed.refetch()} />}
        {body}
      </div>
      {/* 글쓰기 버튼은 SNS 탭과 같은 조건으로만 그린다(design 6절 1번). */}
      {SNS_SERVER_AVAILABLE && <SnsWriteFab />}

      {more && (
        <SnsPostMoreSheet
          post={more.post}
          open={more.open}
          onClose={() => setMore(prev => prev && { ...prev, open: false })}
          locked={refreshFailed}
          onCopyLink={() => void copyLink(more.post)}
          onEdit={() => void navigate({ to: '/sns/posts/$publicId/edit', params: { publicId: more.post.publicId } })}
          onDelete={() => setDeleting(more.post)}
          onMute={() => (more.post.mutedByMe ? setConfirm({ kind: 'unmute', post: more.post }) : mute(more.post))}
          onBlock={() =>
            gate('block', () => setConfirm({ kind: 'block', post: more.post }), {
              kind: 'block',
              publicId: more.post.publicId,
            })
          }
        />
      )}

      {confirm && (
        <Modal
          open
          // 요청 중에 닫고 다른 처리를 누르면 그 처리가 이 요청의 성공 처리를 덮어쓴다.
          onClose={() => {
            if (!toggle.isPending) setConfirm(null)
          }}
          title={RELATION_CONFIRM[confirm.kind].title}
          description={RELATION_CONFIRM[confirm.kind].description(confirm.post.author.nickname)}
          confirmLabel={RELATION_CONFIRM[confirm.kind].confirmLabel}
          confirmVariant={RELATION_CONFIRM[confirm.kind].danger ? 'danger' : 'primary'}
          onConfirm={handleConfirm}
          loading={toggle.isPending}
        />
      )}

      {deleting && (
        <Modal
          open
          onClose={() => {
            if (!remove.isPending) setDeleting(null)
          }}
          title="게시물을 삭제할까요?"
          description="삭제한 게시물은 되돌릴 수 없어요."
          confirmLabel="삭제"
          confirmVariant="danger"
          onConfirm={handleDelete}
          loading={remove.isPending}
        />
      )}

      {resume && (
        <SnsResumeReaction
          key={`${resume.kind}:${resume.publicId}`}
          kind={resume.kind}
          publicId={resume.publicId}
          onError={reactionError}
        />
      )}
      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} resume={gateResume} />
      <AppToast
        open={toast.open}
        message={toast.message}
        variant={toast.variant}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
      />
    </div>
  )
}
