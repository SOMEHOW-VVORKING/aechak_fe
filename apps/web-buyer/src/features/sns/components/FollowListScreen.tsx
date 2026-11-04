import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Avatar, Button, EmptyState, MobileScreen, SearchInput, Skeleton, Tabs } from '@aechak/design-system/web'
import { LoginGate, useIsLoggedIn } from '@/shared/auth'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  SNS_BLOCKED_BY_ME,
  SNS_UNAVAILABLE,
  snsErrorCode,
  snsToggleErrorMessage,
  useFollowList,
  useSnsProfile,
  useSnsToggle,
  type FollowDirection,
  type SnsUserItem,
} from '../sns.queries'
import { petSummaryLabel } from '../sns.format'
import { FollowButton } from './FollowButton'

const DEBOUNCE_MS = 300

const EMPTY_COPY: Record<FollowDirection, string> = {
  followers: '아직 팔로워가 없어요',
  followings: '아직 팔로우한 사람이 없어요',
}

// 팔로워/팔로잉 목록(b7-st-5). 로그인 사용자만 본다(A9). 탭 수는 목록의 totalCount(항상 null)가 아니라
// 프로필의 수를 쓰고, 차단 관계 행이 빠져도 수는 그대로다(A24).
export function FollowListScreen({
  publicId,
  tab,
  onTabChange,
}: {
  publicId: string
  tab: FollowDirection
  onTabChange: (tab: FollowDirection) => void
}) {
  const navigate = useNavigate()
  const loggedIn = useIsLoggedIn()
  const goBack = useSafeBack({ to: '/sns/users/$publicId', params: { publicId } })
  const [keyword, setKeyword] = useState('')
  const [nickname, setNickname] = useState('')
  const [errorToast, setErrorToast] = useState<string | null>(null)

  // 글자 종류로 막지 않고 디바운스한 값을 그대로 보낸다. 서버가 검색어로 400을 내지 않는다(D5).
  useEffect(() => {
    const timer = setTimeout(() => setNickname(keyword.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [keyword])

  const profile = useSnsProfile(publicId)
  // 비로그인이면 목록 쿼리를 보내지 않고 로그인 안내 시트만 연다.
  const list = useFollowList(publicId, tab, nickname, loggedIn)
  const toggle = useSnsToggle()

  const openProfile = (item: SnsUserItem) =>
    item.isMe
      ? navigate({ to: '/sns/me' })
      : navigate({ to: '/sns/users/$publicId', params: { publicId: item.publicId } })

  const follow = (item: SnsUserItem) =>
    toggle.mutate(
      { kind: 'follow', publicId: item.publicId, on: !item.following },
      { onError: e => setErrorToast(snsToggleErrorMessage(e)) },
    )

  const screen = (content: ReactNode) => (
    <MobileScreen header={<BackAppBar onBack={goBack} title={profile.data?.nickname} />}>
      {content}
      <LoginGate open={!loggedIn} feature="follows" onClose={goBack} resume={{ kind: 'open', publicId }} />
      <AppToast
        open={errorToast != null}
        message={errorToast ?? ''}
        variant="error"
        onClose={() => setErrorToast(null)}
      />
    </MobileScreen>
  )

  if (!loggedIn) return screen(null)

  // 목록 주인을 볼 수 없으면(130000) 볼 수 없는 계정, 내가 차단했으면(130001) 차단한 계정 안내(P11).
  // 주인이 나를 차단했으면(서로 차단 포함) 프로필은 200 blockingMe여도 목록은 130000이라 목록 응답 전에도 같은 안내다.
  const code = snsErrorCode(list.error) ?? snsErrorCode(profile.error)
  if (code === SNS_UNAVAILABLE || profile.data?.blockingMe) {
    return screen(<ScreenEmptyState title="볼 수 없는 계정이에요" description="계정이 없거나 지금은 볼 수 없어요." />)
  }
  if (code === SNS_BLOCKED_BY_ME || profile.data?.blockedByMe) {
    return screen(
      <ScreenEmptyState title="차단한 계정이에요" description="차단한 계정의 팔로워와 팔로잉은 볼 수 없어요." />,
    )
  }

  const counts: Record<FollowDirection, number | undefined> = {
    followers: profile.data?.followerCount ?? undefined,
    followings: profile.data?.followingCount ?? undefined,
  }

  let body: ReactNode
  if (list.isPending) {
    body = (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    )
  } else if (!list.data) {
    // 이미 불러온 목록은 재조회가 실패해도 그대로 둔다(v5는 재조회 실패에도 data를 남긴다).
    body = (
      <div className="py-10">
        <EmptyState
          title="목록을 불러오지 못했어요"
          description="잠시 후 다시 시도해 주세요."
          action={{ label: '다시 시도', onClick: () => void list.refetch() }}
        />
      </div>
    )
  } else if (list.data.length === 0) {
    body = (
      <div className="py-10">
        <EmptyState title={nickname ? '검색 결과가 없어요' : EMPTY_COPY[tab]} />
      </div>
    )
  } else {
    body = (
      <>
        <ul>
          {list.data.map(item => (
            <li key={item.publicId} className="flex items-center gap-3 px-4 py-2.5">
              <button
                type="button"
                onClick={() => openProfile(item)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Avatar name={item.nickname} src={item.profileImageUrl ?? undefined} size="md" />
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium text-text-primary">{item.nickname}</span>
                  {item.petSummary && (
                    <span className="block truncate text-caption text-text-tertiary">
                      {petSummaryLabel(item.petSummary)}
                    </span>
                  )}
                </span>
              </button>
              {!item.isMe && (
                // 요청 중에는 다른 행 버튼을 잠근다. 한 mutation을 행끼리 나눠 쓰므로 겹치면 앞 요청의 실패 안내가 빠진다.
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
        {list.hasNextPage && (
          <div className="px-4 pt-2">
            <Button
              variant="secondary"
              fullWidth
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              더보기
            </Button>
          </div>
        )}
      </>
    )
  }

  return screen(
    <div className="flex flex-col pb-6">
      <Tabs
        tabs={[
          { key: 'followers', label: '팔로워', badge: counts.followers },
          { key: 'followings', label: '팔로잉', badge: counts.followings },
        ]}
        activeKey={tab}
        onSelect={key => onTabChange(key as FollowDirection)}
        className="px-2"
      />
      <div className="p-4">
        <SearchInput value={keyword} onChange={setKeyword} placeholder="닉네임 검색" aria-label="닉네임 검색" />
      </div>
      {body}
    </div>,
  )
}
