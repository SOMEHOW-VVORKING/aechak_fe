import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, Bookmark, EyeOff, Grid3x3, MoreHorizontal, PawPrint, Repeat2, SquarePlay, UserX } from 'lucide-react'
import {
  Avatar,
  BottomSheet,
  Button,
  ListItem,
  MobileScreen,
  Modal,
  Skeleton,
} from '@aechak/design-system/web'
import { LoginGate, takePendingAction, useIsLoggedIn, useLoginGate } from '@/shared/auth'
import { AppTabBar } from '@/shared/components/AppTabBar'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  SNS_BLOCKED_BY_ME,
  SNS_SELF_FOLLOW,
  SNS_UNAVAILABLE,
  snsErrorCode,
  snsKeys,
  snsToggleErrorMessage,
  useSnsPostGrid,
  useSnsProfile,
  useSnsToggle,
  type FollowDirection,
  type SnsProfile,
  type SnsProfileTab,
} from '../sns.queries'
import { RELATION_CONFIRM, type RelationConfirm } from '../sns.copy'
import { petTagLabel } from '../sns.format'
import { FollowButton } from './FollowButton'
import { SnsListError, SnsRefetchError } from './SnsListEnd'
import { SnsPostGrid, SnsPostTabs, type SnsPostTabItem } from './SnsPostGrid'

// 프로필 탭(A22, design 6절 9번). 아이콘 탭이고 빈 문구는 SNS-01 탭 틀의 문구다. 저장됨은 본인만(R3-02).
const POST_TABS: (SnsPostTabItem<SnsProfileTab> & { empty: string })[] = [
  { key: 'grid', label: '그리드', icon: <Grid3x3 className="size-[22px]" />, empty: '아직 게시물이 없어요' },
  { key: 'video', label: '영상', icon: <SquarePlay className="size-[22px]" />, empty: '아직 영상이 없어요' },
  { key: 'repost', label: '리포스트', icon: <Repeat2 className="size-[22px]" />, empty: '아직 리포스트가 없어요' },
  { key: 'saved', label: '저장됨', icon: <Bookmark className="size-[22px]" />, empty: '저장한 게시물이 없어요' },
]

/** 프로필 라우트의 search(`?tab=`). 상세에서 돌아와도 탭을 유지한다. 모르는 값은 버리고 그리드를 쓴다 */
export function snsProfileSearch(search: Record<string, unknown>): { tab?: SnsProfileTab } {
  const tab = POST_TABS.find(t => t.key === search['tab'])?.key
  return tab ? { tab } : {}
}

interface ToastState {
  open: boolean
  message: string
  variant: 'success' | 'error'
}

// SNS 프로필(b7-st-4). publicId가 없으면 내 프로필(GET /sns/me)이다. 다른 사용자 프로필은 비로그인도 본다(A9).
// 메시지 버튼, 알림 버튼(R1-18), 페르소나 배지는 이번 범위에 없다. 하단 탭바를 그린다(SNS-01 F5).
export function SnsProfileScreen({
  publicId,
  tab = 'grid',
  onTabChange,
}: {
  publicId?: string
  tab?: SnsProfileTab
  onTabChange: (tab: SnsProfileTab) => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const goBack = useSafeBack({ to: '/sns' })
  const { data: profile, error, isPending, isRefetchError, refetch } = useSnsProfile(publicId)
  // 저장됨은 내 프로필에만 있다. 다른 사람 프로필에 주소로 들어오면 그리드를 그린다.
  const activeTab: SnsProfileTab = tab === 'saved' && profile?.isMe === false ? 'grid' : tab
  const grid = useSnsPostGrid(profile, activeTab)
  const toggle = useSnsToggle()
  const { gateOpen, gateFeature, gateResume, requireAuth, closeGate } = useLoginGate()
  const loggedIn = useIsLoggedIn()
  const mutateToggle = toggle.mutate
  const [moreOpen, setMoreOpen] = useState(false)
  // 확인 Modal의 타겟은 라우트(이 화면)가 소유한다. Modal은 자체 mutation을 만들지 않는다.
  const [confirm, setConfirm] = useState<RelationConfirm | null>(null)
  const [toast, setToast] = useState<ToastState>({ open: false, message: '', variant: 'success' })
  const backRef = useRef<HTMLButtonElement>(null)

  const showToast = (message: string, variant: ToastState['variant'] = 'success') =>
    setToast({ open: true, message, variant })

  // 볼 수 없는 계정(404 130000)은 다시 조회에서 나와도 이전 데이터보다 먼저 본다(탈퇴했거나 없는 계정, A7).
  const unavailable = snsErrorCode(error) === SNS_UNAVAILABLE

  // 탭 목록이 404 130000이나 403 130001이면 그사이 주인이 탈퇴했거나 차단 관계가 됐다. 프로필을 다시 읽어 프로필 화면의
  // 같은 응답과 같은 안내(볼 수 없는 계정, 기본 프로필, 차단한 계정)로 바꾼다(design 6절 6번).
  const gridCode = snsErrorCode(grid.error)
  const gridGone = gridCode === SNS_UNAVAILABLE || gridCode === SNS_BLOCKED_BY_ME
  useEffect(() => {
    if (gridGone) void refetch()
  }, [gridGone, refetch])

  // 팔로우 실패 안내. 버튼으로 누른 팔로우와 로그인 뒤 다시 실행한 팔로우가 같이 쓴다.
  // 130000은 그사이 나를 차단했거나 탈퇴한 경우다. useSnsToggle이 시작한 재조회를 기다려 화면이 기본 프로필이나
  // 볼 수 없는 계정 안내로 바뀌었으면 그 화면이 안내다. 재조회까지 실패해 이전 프로필이 남으면 실패 안내를
  // 띄운다(sns.yaml FE 5).
  const followFailed = useCallback(
    (e: unknown) => {
      const notify = () => setToast({ open: true, message: snsToggleErrorMessage(e), variant: 'error' })
      if (snsErrorCode(e) !== SNS_UNAVAILABLE) notify()
      else
        void refetch({ cancelRefetch: false }).then(r => {
          if (!r.data?.blockingMe && snsErrorCode(r.error) !== SNS_UNAVAILABLE) notify()
        })
    },
    [refetch],
  )

  // 로그인 뒤 다시 실행(A26). 로그인 안내 시트에서 남긴 행동을 이 프로필을 다시 읽은 뒤 한 번만 꺼낸다.
  // 팔로우는 확인 없이 켜기 요청을 보내고(이미 팔로우 중이어도 201) 차단, 뮤트는 확인 Modal이나 시트만 다시 연다.
  useEffect(() => {
    if (!publicId || !loggedIn) return
    if (unavailable) {
      // 그사이 상대가 탈퇴했다. 실행하지 않고 볼 수 없는 계정 안내만 남긴다.
      takePendingAction(publicId)
      return
    }
    if (!profile) return
    const pending = takePendingAction(publicId)
    if (!pending) return
    if (profile.isMe) {
      void navigate({ to: '/sns/me', replace: true })
      return
    }
    if (profile.blockedByMe) return
    // 그사이 상대가 나를 차단했다. 기본 프로필에는 팔로우 버튼과 뮤트 항목이 없어 차단만 다시 연다(A7).
    if (profile.blockingMe && pending.kind !== 'block') return
    if (pending.kind === 'follow') {
      mutateToggle(
        { kind: 'follow', publicId, on: true },
        {
          onError: e => {
            if (snsErrorCode(e) === SNS_SELF_FOLLOW) void navigate({ to: '/sns/me', replace: true })
            else followFailed(e)
          },
        },
      )
    } else if (pending.kind === 'block') setConfirm('block')
    else if (pending.kind === 'mute') setMoreOpen(true)
  }, [publicId, loggedIn, unavailable, profile, navigate, mutateToggle, followFailed])

  const follow = (target: SnsProfile) =>
    requireAuth(
      'follow',
      () =>
        toggle.mutate(
          { kind: 'follow', publicId: target.publicId, on: !target.following },
          { onError: followFailed },
        ),
      { kind: 'follow', publicId: target.publicId },
    )

  const openList = (target: SnsProfile, tab: FollowDirection) =>
    requireAuth(
      'follows',
      () => navigate({ to: '/sns/users/$publicId/follows', params: { publicId: target.publicId }, search: { tab } }),
      { kind: 'open', publicId: target.publicId },
    )

  const share = async (target: SnsProfile) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/sns/users/${target.publicId}`)
      showToast('프로필 링크를 복사했어요')
    } catch {
      showToast('링크를 복사하지 못했어요', 'error')
    }
  }

  const handleConfirm = () => {
    if (!confirm || !profile) return
    const copy = RELATION_CONFIRM[confirm]
    toggle.mutate(
      { kind: copy.kind, publicId: profile.publicId, on: copy.on },
      {
        onSuccess: () => {
          setConfirm(null)
          showToast(copy.done)
          // 바뀐 관계로 본문 분기가 바뀌면 Modal을 연 버튼이 사라져 Modal이 포커스를 돌려줄 곳이 없다. 어느 분기에나 있는
          // 뒤로 가기 버튼으로 먼저 옮긴다. 연 버튼이 남아 있으면 Modal이 닫히면서 그 버튼으로 돌려준다.
          backRef.current?.focus()
        },
        onError: e => {
          setConfirm(null)
          showToast(snsToggleErrorMessage(e), 'error')
        },
      },
    )
  }

  const showMore = profile != null && !unavailable && !profile.isMe && !profile.blockedByMe

  // 본문만 분기하고 Modal, 시트, 토스트는 어느 분기에서도 함께 렌더한다(차단 직후 본문이 바뀌어도 토스트가 남는다).
  const screen = (content: ReactNode) => (
    <MobileScreen
      footer={<AppTabBar activeKey="/sns" />}
      header={
        <BackAppBar
          backRef={backRef}
          onBack={goBack}
          title={unavailable ? undefined : profile?.nickname}
          actions={
            showMore && (
              <button
                type="button"
                aria-label="더보기"
                onClick={() => setMoreOpen(true)}
                className="flex size-10 items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
              >
                <MoreHorizontal className="size-[22px]" />
              </button>
            )
          }
        />
      }
    >
      {content}

      {profile && (
        <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} ariaLabel="프로필 더보기">
          <ListItem
            leading={<Ban className="size-5" />}
            title="차단하기"
            onClick={() => {
              setMoreOpen(false)
              requireAuth('block', () => setConfirm('block'), { kind: 'block', publicId: profile.publicId })
            }}
          />
          {/* 나를 차단한 계정의 기본 프로필은 차단만 둔다(A7). 신고 항목은 SNS-07에서 붙는다. */}
          {/* 팔로우, 차단, 뮤트 요청 중에 뮤트를 보내면 앞 요청의 성공, 실패 처리가 사라져 끝날 때까지 두지 않는다. */}
          {!profile.blockingMe && !toggle.isPending && (
            <ListItem
              leading={<EyeOff className="size-5" />}
              title={profile.mutedByMe ? '뮤트 해제' : '뮤트하기'}
              onClick={() => {
                setMoreOpen(false)
                if (profile.mutedByMe) {
                  setConfirm('unmute')
                  return
                }
                requireAuth(
                  'mute',
                  () =>
                    toggle.mutate(
                      { kind: 'mute', publicId: profile.publicId, on: true },
                      {
                        onSuccess: () => showToast('뮤트했어요'),
                        onError: e => showToast(snsToggleErrorMessage(e), 'error'),
                      },
                    ),
                  { kind: 'mute', publicId: profile.publicId },
                )
              }}
            />
          )}
        </BottomSheet>
      )}

      {confirm && profile && (
        <Modal
          open
          // 요청 중에 닫고 다른 처리를 누르면 그 처리가 이 요청의 성공 처리를 덮어쓴다.
          onClose={() => {
            if (!toggle.isPending) setConfirm(null)
          }}
          title={RELATION_CONFIRM[confirm].title}
          description={RELATION_CONFIRM[confirm].description(profile.nickname)}
          confirmLabel={RELATION_CONFIRM[confirm].confirmLabel}
          confirmVariant={RELATION_CONFIRM[confirm].danger ? 'danger' : 'primary'}
          onConfirm={handleConfirm}
          loading={toggle.isPending}
        />
      )}

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} resume={gateResume} />
      <AppToast
        open={toast.open}
        message={toast.message}
        variant={toast.variant}
        // 하단 탭바를 덮지 않게 탭바 위에 띄운다.
        aboveActionBar
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
      />
    </MobileScreen>
  )

  if (unavailable) {
    return screen(
      <ScreenEmptyState
        icon={<UserX className="size-6" />}
        title="볼 수 없는 계정이에요"
        description="계정이 없거나 지금은 볼 수 없어요."
      />,
    )
  }

  if (!profile) {
    if (isPending) {
      return screen(
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-20" />
          <Skeleton variant="text" className="w-1/2" />
        </div>,
      )
    }
    return screen(
      <ScreenEmptyState
        title="프로필을 불러오지 못했어요"
        description="잠시 후 다시 시도해 주세요."
        action={{ label: '다시 시도', onClick: () => void refetch() }}
      />,
    )
  }

  // 나를 차단한 계정의 기본 프로필(A7, R2-06): 닉네임만 오고 이미지, 수, 소개글, 펫은 null이다. 기본 프로필 사진과
  // 닉네임만 그리고 팔로우와 공유 버튼, 탭은 두지 않는다. 서로 차단이면 blockedByMe도 true라 차단 해제 버튼을 함께 둔다.
  if (profile.blockingMe) {
    return screen(
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Avatar name={profile.nickname} size="xl" />
        <p className="text-subheading font-semibold text-text-primary">{profile.nickname}</p>
        {profile.blockedByMe && (
          <Button variant="secondary" onClick={() => setConfirm('unblockMutual')}>
            차단 해제
          </Button>
        )}
      </div>,
    )
  }

  // 내가 차단한 계정(P11): 닉네임과 이미지만 오고 수, 소개글, 펫은 null이다. 안내와 차단 해제 버튼만 그린다.
  if (profile.blockedByMe) {
    return screen(
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Avatar name={profile.nickname} src={profile.profileImageUrl ?? undefined} size="xl" />
        <div className="flex flex-col gap-1">
          <p className="text-subheading font-semibold text-text-primary">차단한 계정이에요</p>
          <p className="text-body-sm text-text-secondary">차단을 해제하면 프로필을 다시 볼 수 있어요.</p>
        </div>
        <Button variant="secondary" onClick={() => setConfirm('unblock')}>
          차단 해제
        </Button>
      </div>,
    )
  }

  const tabs = POST_TABS.filter(t => t.key !== 'saved' || profile.isMe)
  const current = tabs.find(t => t.key === activeTab) ?? tabs[0]!
  // 지금 탭을 다시 누르면 첫 페이지부터 새 기준 시각으로 다시 읽는다(design 6절 7번). 피드 탭과 같다.
  const selectTab = (key: SnsProfileTab) => {
    if (key !== current.key) return onTabChange(key)
    const queryKey = key === 'saved' ? snsKeys.saves() : snsKeys.userPosts(profile.publicId, key, loggedIn)
    void queryClient.resetQueries({ queryKey })
  }
  const stats: { label: string; value: number | null; list?: FollowDirection }[] = [
    { label: '게시물', value: profile.postCount },
    { label: '팔로워', value: profile.followerCount, list: 'followers' },
    { label: '팔로잉', value: profile.followingCount, list: 'followings' },
  ]

  return screen(
    <div className="flex flex-col">
      {/* 다시 읽기가 실패하면 받아 둔 프로필은 두고 위에 알린다. 팔로우 버튼은 잠그지 않는다(AC-SNS01-026). 탭 목록이
          사라진 뒤의 실패는 탭 자리의 다시 시도가 알린다. */}
      {isRefetchError && !gridGone && (
        <SnsRefetchError message="프로필을 다시 불러오지 못했어요." onRetry={() => void refetch()} />
      )}
      <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
        <div className="flex items-center gap-4">
          <Avatar name={profile.nickname} src={profile.profileImageUrl ?? undefined} size="xl" />
          <div className="grid flex-1 grid-cols-3 text-center">
            {stats.map(stat => {
              const body = (
                <>
                  <span className="block text-subheading font-semibold tabular-nums text-text-primary">
                    {(stat.value ?? 0).toLocaleString('ko-KR')}
                  </span>
                  <span className="text-caption text-text-secondary">{stat.label}</span>
                </>
              )
              const list = stat.list
              return list ? (
                <button key={stat.label} type="button" onClick={() => openList(profile, list)}>
                  {body}
                </button>
              ) : (
                <div key={stat.label}>{body}</div>
              )
            })}
          </div>
        </div>

        <p className="text-subheading font-semibold text-text-primary">{profile.nickname}</p>
        {/* 펫이 없거나 소개글이 비면 그 줄을 숨긴다(P1). 대표 펫이 먼저 온다. */}
        {profile.pets && profile.pets.length > 0 && (
          <ul aria-label="펫" className="flex flex-wrap gap-1.5">
            {profile.pets.map((pet, i) => (
              <li
                key={i}
                className="flex items-center gap-1 rounded-chip bg-surface-sunken px-2 py-1 text-caption text-text-secondary"
              >
                <PawPrint className="size-3" />
                {petTagLabel(pet)}
              </li>
            ))}
          </ul>
        )}
        {profile.bio && (
          <p className="whitespace-pre-line text-body-sm leading-relaxed text-text-primary">{profile.bio}</p>
        )}

        {profile.mutedByMe && (
          <div className="flex items-center gap-2 rounded-card bg-surface-sunken px-3 py-2.5">
            <EyeOff className="size-4 flex-none text-icon-muted" />
            <p className="flex-1 text-body-sm text-text-secondary">뮤트한 계정이에요</p>
            <Button size="sm" variant="secondary" onClick={() => setConfirm('unmute')}>
              뮤트 해제
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          {profile.isMe ? (
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate({ to: '/mypage/profile' })}>
              프로필 수정
            </Button>
          ) : (
            <FollowButton
              following={profile.following}
              loading={toggle.isPending && toggle.variables?.kind === 'follow'}
              disabled={toggle.isPending}
              onClick={() => follow(profile)}
              className="flex-1"
            />
          )}
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => void share(profile)}>
            공유
          </Button>
        </div>
      </div>

      <SnsPostTabs tabs={tabs} activeKey={current.key} onSelect={selectTab} />
      {/* 리포스트와 저장됨 칸의 작성자는 목록 주인이 아니라 상세로 넘기지 않는다. */}
      {gridGone ? (
        // 탭 목록이 사라졌는데 다시 읽은 프로필까지 실패하면 탭 자리에 다시 시도를 둔다. 읽으면 위 분기가 안내로 바꾼다.
        error != null && <SnsListError onRetry={() => void refetch()} />
      ) : (
        <SnsPostGrid
          grid={grid}
          empty={current.empty}
          author={current.key === 'grid' || current.key === 'video' ? profile.publicId : undefined}
        />
      )}
    </div>,
  )
}
