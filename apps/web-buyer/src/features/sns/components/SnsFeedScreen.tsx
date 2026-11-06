import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { EmptyState, Tabs } from '@aechak/design-system/web'
import { LoginGate, useIsLoggedIn, useLoginGate, type GateResume, type UseLoginGate } from '@/shared/auth'
import { SNS_SERVER_AVAILABLE } from '@/shared/sns-availability'
import { snsKeys, useSnsFeed, type SnsFeedKind } from '../sns.queries'
import { SnsPostList } from './SnsPostList'
import { SnsWriteFab } from './SnsWriteFab'

// 빈 상태(P5). 팔로잉 피드만 탐색 탭 이동 버튼을 두고 탐색, 인기는 안내 문구만이다. 디자인이 없어 FE가 먼저 썼다.
const FEED_TABS: { key: SnsFeedKind; label: string; empty: string }[] = [
  { key: 'following', label: '팔로잉', empty: '팔로잉 피드에 아직 글이 없어요' },
  { key: 'explore', label: '탐색', empty: '아직 올라온 글이 없어요' },
  { key: 'popular', label: '인기', empty: '지금은 인기 글이 없어요' },
]

/** 피드 라우트의 search(`?tab=`). 모르는 값은 버리고 기본 탭을 쓴다 */
export function snsFeedSearch(search: Record<string, unknown>): { tab?: SnsFeedKind } {
  const tab = FEED_TABS.find(t => t.key === search['tab'])?.key
  return tab ? { tab } : {}
}

// 상세에 다녀오면 피드가 새로 마운트돼 스크롤 칸이 맨 위로 돌아간다(탭 셸은 경로마다 다시 마운트한다). 마지막으로
// 스크롤한 탭과 위치를 앱이 떠 있는 동안 기억했다가 같은 탭으로 돌아오면 되살린다. 탭을 바꾸면 지운다.
let lastScroll: { kind: SnsFeedKind; top: number } | null = null

// SNS 피드(b7-st-1). /sns/feed와 하단 SNS 탭(SNS_SERVER_AVAILABLE일 때)이 같은 화면을 그린다(design 6절 1번).
// 앱 바는 제목과 검색 버튼을 그린다. 검색은 SNS 탭이 열린 통합 검색이다(CRQ-SRCH-07). 알림 버튼은 SNS-05가 그 화면과 함께
// 붙인다. 탭은 눌러서만 바꾼다.
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
  const { gateOpen, gateFeature, gateResume, requireAuth, closeGate } = useLoginGate()
  const listRef = useRef<HTMLDivElement>(null)
  // 차단, 뮤트, 삭제가 끝나면 그 처리를 연 카드가 사라져 포커스가 body로 떨어진다. 늘 남는 앱 바 제목으로 먼저 옮긴다.
  const titleRef = useRef<HTMLHeadingElement>(null)

  // 카드에서 연 로그인 안내 시트는 로그인 뒤 같은 탭으로 돌아오게 지금 탭을 주소에 먼저 적는다. 주소에 탭이 없으면
  // 비로그인은 탐색을 보다가 로그인 뒤 같은 주소에서 팔로잉을 연다(P1).
  const gate: UseLoginGate['requireAuth'] = (feature, action, resumeAction) => {
    if (!loggedIn && tab !== kind) onTabChange(kind)
    return requireAuth(feature, action, resumeAction)
  }

  // 받아 둔 카드를 처음 그린 때 한 번만 되살린다. 캐시가 지워져 첫 페이지를 새로 받았으면 보던 카드가 아니라 맨 위에서 연다.
  const items = feed.data
  const hadCache = useRef(items != null)
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (restored.current || !items) return
    restored.current = true
    if (!hadCache.current) lastScroll = null
    else if (listRef.current && lastScroll?.kind === kind) listRef.current.scrollTop = lastScroll.top
  }, [items, kind])

  const selectTab = (next: SnsFeedKind) => {
    // 지금 탭을 다시 누르면 첫 페이지부터 새 기준 시각으로 다시 읽는다(design 6절 7번).
    if (next === kind) {
      if (listRef.current) listRef.current.scrollTop = 0
      void queryClient.resetQueries({ queryKey: snsKeys.feed(kind, loggedIn) })
      return
    }
    // 다른 탭도 맨 위에서 연다. 스크롤 칸은 탭이 바뀌어도 같은 요소라 받아 둔 탭이 이전 탭의 깊이에서 열린다.
    const open = () => {
      lastScroll = null
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

  const empty = FEED_TABS.find(t => t.key === kind)!.empty
  const emptyState: ReactNode = (
    <EmptyState
      title={empty}
      description={kind === 'following' ? '탐색에서 마음에 드는 이웃을 찾아 팔로우해 보세요.' : undefined}
      action={kind === 'following' ? { label: '탐색 보기', onClick: () => onTabChange('explore') } : undefined}
    />
  )

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-none bg-surface-base">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 ref={titleRef} tabIndex={-1} className="text-heading outline-none font-bold tracking-tight text-text-primary">애착 SNS</h1>
          <button
            type="button"
            onClick={() => void navigate({ to: '/search', search: { tab: 'sns' } })}
            aria-label="검색"
            className="rounded-full p-0.5 text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <Search className="size-[22px]" />
          </button>
        </div>
        <Tabs
          tabs={FEED_TABS}
          activeKey={kind}
          onSelect={key => selectTab(key as SnsFeedKind)}
          className="[&>button]:flex-1"
        />
      </div>
      {/* 아래 여백(96px)은 글쓰기 버튼(바닥에서 72px)보다 커서 끝까지 내리면 마지막 카드의 버튼이 글쓰기 버튼에 가리지 않는다. */}
      <div
        ref={listRef}
        onScroll={e => {
          lastScroll = { kind, top: e.currentTarget.scrollTop }
        }}
        className="min-h-0 flex-1 overflow-y-auto pb-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* 하단 탭바를 덮지 않게 토스트를 탭바 위에 띄운다. */}
        <SnsPostList feed={feed} empty={emptyState} requireAuth={gate} focusRef={titleRef} toastAboveActionBar />
      </div>
      {/* 글쓰기 버튼은 SNS 탭과 같은 조건으로만 그린다(design 6절 1번). */}
      {SNS_SERVER_AVAILABLE && <SnsWriteFab />}
      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} resume={gateResume} />
    </div>
  )
}
