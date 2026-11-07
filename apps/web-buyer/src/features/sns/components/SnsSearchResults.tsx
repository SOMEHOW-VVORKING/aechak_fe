import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, Hash, SearchX } from 'lucide-react'
import { Avatar, EmptyState, SegmentedControl, Skeleton } from '@aechak/design-system/web'
import {
  LoginGate,
  peekPendingAction,
  takePendingAction,
  useIsLoggedIn,
  useLoginGate,
  type UseLoginGate,
} from '@/shared/auth'
import { AppToast } from '@/shared/components/AppToast'
import {
  snsSearchable,
  snsToggleErrorMessage,
  useSnsSearchHashtags,
  useSnsSearchPosts,
  useSnsSearchUsers,
  useSnsToggle,
  type SnsSearchSegment,
  type SnsSearchSort,
  type SnsSearchUser,
} from '../sns.queries'
import { petSummaryLabel } from '../sns.format'
import { FollowButton } from './FollowButton'
import { SnsListEnd, SnsListError, SnsRefetchError } from './SnsListEnd'
import { SnsPostList } from './SnsPostList'
import { SnsSortChips } from './SnsSortChips'

const SEGMENTS: { value: SnsSearchSegment; label: string }[] = [
  { value: 'posts', label: '게시물' },
  { value: 'users', label: '계정' },
  { value: 'hashtags', label: '해시태그' },
]

/** 세그먼트마다 같은 빈 상태다. SNS 탭에서는 연관 검색어를 제안하지 않는다(P16) */
export function SnsSearchEmpty() {
  return (
    <div className="py-10">
      <EmptyState icon={<SearchX className="size-6" />} title="검색 결과가 없어요" description="다른 검색어로 다시 검색해 보세요." />
    </div>
  )
}

function RowsSkeleton() {
  return (
    <div role="status" aria-label="검색 결과를 불러오는 중" className="flex flex-col gap-3 px-4 py-2">
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </div>
  )
}

interface ListQuery<T> {
  data: T[] | undefined
  isPending: boolean
  isRefetchError: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  fetchNextPage: () => unknown
  refetch: () => unknown
}

// 계정과 해시태그 세그먼트의 공통 상태. 첫 조회 실패는 빈 상태가 아니라 네트워크 오류 안내이고(P18) 다음 페이지 실패는 받은 행을
// 두고 끝에 다시 시도를 둔다.
function SegmentList<T>({
  query,
  errorMessage,
  children,
}: {
  query: ListQuery<T>
  errorMessage: string
  children: (items: T[]) => ReactNode
}) {
  if (query.isPending) return <RowsSkeleton />
  if (!query.data) return <SnsListError onRetry={() => void query.refetch()} />
  if (query.data.length === 0 && !query.hasNextPage) return <SnsSearchEmpty />
  return (
    <>
      {query.isRefetchError && (
        <SnsRefetchError message="목록을 다시 불러오지 못했어요." onRetry={() => void query.refetch()} />
      )}
      {children(query.data)}
      <SnsListEnd
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        isFetchNextPageError={query.isFetchNextPageError}
        fetchNextPage={query.fetchNextPage}
        errorMessage={errorMessage}
      />
    </>
  )
}

function PostsSegment({
  keyword,
  sort,
  onSortChange,
  onSearched,
  requireAuth,
}: {
  keyword: string
  sort: SnsSearchSort
  onSortChange: (sort: SnsSearchSort) => void
  onSearched?: () => void
  requireAuth: UseLoginGate['requireAuth']
}) {
  const posts = useSnsSearchPosts(keyword, sort, { onSearched })
  // 차단, 뮤트, 삭제로 카드가 빠지면 포커스를 결과 수로 옮긴다.
  const countRef = useRef<HTMLParagraphElement>(null)
  const searchable = snsSearchable(keyword)
  const total = searchable ? posts.data?.totalCount : 0

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 pb-2">
        <p ref={countRef} tabIndex={-1} className="flex-none text-caption text-text-tertiary outline-none">
          {total != null && (
            <>
              총 <span className="font-semibold tabular-nums text-text-secondary">{total.toLocaleString('ko-KR')}</span>개
            </>
          )}
        </p>
        <SnsSortChips sort={sort} onChange={onSortChange} />
      </div>
      {searchable ? (
        <SnsPostList
          feed={{ ...posts, data: posts.data?.items }}
          empty={<SnsSearchEmpty />}
          requireAuth={requireAuth}
          focusRef={countRef}
        />
      ) : (
        <SnsSearchEmpty />
      )}
    </>
  )
}

function UsersSegment({ keyword, requireAuth }: { keyword: string; requireAuth: UseLoginGate['requireAuth'] }) {
  const navigate = useNavigate()
  const loggedIn = useIsLoggedIn()
  const users = useSnsSearchUsers(keyword)
  const toggle = useSnsToggle()
  const { mutate: mutateToggle } = toggle
  const [errorToast, setErrorToast] = useState<string | null>(null)

  // 로그인 뒤 다시 실행(A26). 비로그인으로 누른 팔로우를 로그인한 결과를 받은 뒤 확인 없이 한 번 켠다. 이미 팔로우 중이어도
  // 201이다. 그사이 나를 차단했거나 내가 차단한 사용자면 서버 응답대로 안내만 띄운다. 내 계정이면 보내지 않는다.
  const items = users.data
  useEffect(() => {
    if (!loggedIn || !items) return
    const pending = peekPendingAction()
    if (pending?.kind !== 'follow') return
    takePendingAction(pending.publicId)
    if (items.find(item => item.publicId === pending.publicId)?.isMe) return
    mutateToggle(
      { kind: 'follow', publicId: pending.publicId, on: true },
      { onError: e => setErrorToast(snsToggleErrorMessage(e)) },
    )
  }, [loggedIn, items, mutateToggle])

  const openProfile = (item: SnsSearchUser) =>
    item.isMe
      ? navigate({ to: '/sns/me' })
      : navigate({ to: '/sns/users/$publicId', params: { publicId: item.publicId } })

  const follow = (item: SnsSearchUser) =>
    requireAuth(
      'follow',
      () =>
        toggle.mutate(
          { kind: 'follow', publicId: item.publicId, on: !item.following },
          { onError: e => setErrorToast(snsToggleErrorMessage(e)) },
        ),
      { kind: 'follow', publicId: item.publicId },
    )

  return (
    <>
      {snsSearchable(keyword) ? (
        <SegmentList query={users} errorMessage="다음 계정을 불러오지 못했어요">
          {items => (
            <ul>
              {items.map(item => {
                // 나를 차단한 사용자는 기본 프로필 사진과 닉네임만 그리고 팔로우 버튼을 숨긴다(A7). 행을 누르면 기본 프로필이다.
                const meta = item.blockingMe
                  ? null
                  : [
                      item.petSummary && petSummaryLabel(item.petSummary),
                      item.followerCount != null && `팔로워 ${item.followerCount.toLocaleString('ko-KR')}`,
                    ]
                      .filter(Boolean)
                      .join(' / ')
                return (
                  <li key={item.publicId} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => void openProfile(item)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <Avatar
                        name={item.nickname}
                        src={item.blockingMe ? undefined : (item.profileImageUrl ?? undefined)}
                        size="md"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-text-primary">{item.nickname}</span>
                        {meta && <span className="block truncate text-caption text-text-tertiary">{meta}</span>}
                      </span>
                    </button>
                    {!item.isMe && !item.blockingMe && (
                      // 요청 중에는 다른 행 버튼을 잠근다. 한 mutation을 행끼리 나눠 쓰므로 겹치면 앞 요청의 실패 안내가 빠진다.
                      // 다시 읽기가 실패한 동안에는 낡은 팔로우 상태로 반대 요청을 보내지 않게 잠근다.
                      <FollowButton
                        following={item.following}
                        loading={toggle.isPending && toggle.variables?.publicId === item.publicId}
                        disabled={toggle.isPending || users.isRefetchError}
                        onClick={() => follow(item)}
                        ariaLabel={`${item.nickname} ${item.following ? '팔로잉' : '팔로우'}`}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </SegmentList>
      ) : (
        <SnsSearchEmpty />
      )}
      <AppToast
        open={errorToast != null}
        message={errorToast ?? ''}
        variant="error"
        onClose={() => setErrorToast(null)}
      />
    </>
  )
}

function HashtagsSegment({ keyword }: { keyword: string }) {
  const navigate = useNavigate()
  const hashtags = useSnsSearchHashtags(keyword)
  if (!snsSearchable(keyword)) return <SnsSearchEmpty />
  return (
    <SegmentList query={hashtags} errorMessage="다음 해시태그를 불러오지 못했어요">
      {items => (
        <ul className="divide-y divide-border-subtle">
          {items.map(tag => (
            <li key={tag.name}>
              <button
                type="button"
                onClick={() => void navigate({ to: '/sns/hashtags/$name', params: { name: tag.name } })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:shadow-focus-ring"
              >
                <span className="flex size-10 flex-none items-center justify-center rounded-full bg-surface-sunken text-icon-muted">
                  <Hash className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label font-semibold text-text-primary">#{tag.name}</span>
                  <span className="block text-caption text-text-tertiary">
                    게시글 {tag.postCount.toLocaleString('ko-KR')}
                  </span>
                </span>
                <ChevronRight className="size-[18px] flex-none text-icon-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SegmentList>
  )
}

// 통합 검색의 SNS 탭(b12-st-4). 세그먼트와 정렬은 부르는 라우트가 주소에 들고 있어 로그인 뒤 돌아와도 같은 결과를 연다(A26).
// 검색어는 입력한 그대로 보내고 서버가 앞의 # 하나를 뗀다. 게시물 세그먼트 첫 페이지만 최근 검색어에 기록된다(R1-32).
export function SnsSearchResults({
  keyword,
  segment,
  sort,
  onSegmentChange,
  onSortChange,
  onSearched,
}: {
  keyword: string
  segment: SnsSearchSegment
  sort: SnsSearchSort
  onSegmentChange: (segment: SnsSearchSegment) => void
  onSortChange: (sort: SnsSearchSort) => void
  /** 게시물 검색 첫 페이지를 받았을 때. 검색 화면이 최근 검색어를 다시 읽는다 */
  onSearched?: () => void
}) {
  const { gateOpen, gateFeature, gateResume, requireAuth, closeGate } = useLoginGate()
  return (
    <div className="flex flex-col pb-6">
      <div className="px-4 pb-3 pt-3">
        <SegmentedControl
          options={SEGMENTS}
          value={segment}
          onChange={value => onSegmentChange(value as SnsSearchSegment)}
          className="w-full"
        />
      </div>
      {segment === 'posts' && (
        <PostsSegment
          keyword={keyword}
          sort={sort}
          onSortChange={onSortChange}
          onSearched={onSearched}
          requireAuth={requireAuth}
        />
      )}
      {segment === 'users' && <UsersSegment keyword={keyword} requireAuth={requireAuth} />}
      {segment === 'hashtags' && <HashtagsSegment keyword={keyword} />}
      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} resume={gateResume} />
    </div>
  )
}
