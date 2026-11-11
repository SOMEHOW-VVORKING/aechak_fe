import { useState } from 'react'
import { EyeOff, Info } from 'lucide-react'
import { Avatar, Button, EmptyState, MobileScreen, Modal, Skeleton, Tabs } from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { HomeAction } from '@/shared/components/HomeAction'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  snsToggleErrorMessage,
  useRelationList,
  useSnsToggle,
  type RelationKind,
  type SnsRelationItem,
} from '../sns.queries'
import { RELATION_CONFIRM } from '../sns.copy'
import { relationDateLabel } from '../sns.format'
import { SnsRefetchError } from './SnsListEnd'
import { SnsReportSheet } from './SnsReportSheet'

const TAB_COPY: Record<
  RelationKind,
  { label: string; note: string; empty: string; action: string; sub: (item: SnsRelationItem) => string }
> = {
  blocks: {
    label: '차단',
    note: '차단한 계정과는 서로의 게시물을 볼 수 없고 서로 팔로우가 해제돼요.',
    empty: '차단한 계정이 없어요',
    action: '차단 해제',
    sub: item => `차단 / ${relationDateLabel(item.createdAt)}`,
  },
  mutes: {
    label: '뮤트',
    note: '뮤트한 계정의 게시물은 피드에 보이지 않아요. 상대는 뮤트 사실을 알 수 없어요.',
    empty: '뮤트한 계정이 없어요',
    action: '뮤트 해제',
    // 뮤트 행의 게시물 비노출 상태는 늘 같아서 고정 문구로 그린다(design 6절 5).
    sub: () => '뮤트 / 게시물 비노출',
  },
}

// 차단/뮤트 관리(b7-st-8). 들어오면 두 목록의 첫 페이지를 함께 불러 탭 수를 채운다.
// 행을 눌러도 프로필로 가지 않는다(H2). 상대가 나중에 나를 차단하면 그 프로필이 기본 프로필(blockingMe)로 바뀌어
// 차단 사실이 드러나기 때문이다. 그래서 차단한 계정의 신고는 프로필이 아니라 이 목록의 행에서 연다(P11).
export function SnsRelationsScreen() {
  const goBack = useSafeBack({ to: '/mypage' })
  const lists: Record<RelationKind, ReturnType<typeof useRelationList>> = {
    blocks: useRelationList('blocks'),
    mutes: useRelationList('mutes'),
  }
  const toggle = useSnsToggle()
  const [tab, setTab] = useState<RelationKind>('blocks')
  // 확인 Modal의 타겟은 라우트(이 화면)가 소유한다.
  const [target, setTarget] = useState<{ kind: RelationKind; item: SnsRelationItem } | null>(null)
  // 신고 시트는 닫히는 동안에도 마지막 행을 그린다.
  const [report, setReport] = useState<{ item: SnsRelationItem; open: boolean } | null>(null)
  const [toast, setToast] = useState<{ open: boolean; message: string; variant: 'success' | 'error' }>({
    open: false,
    message: '',
    variant: 'success',
  })

  const copy = TAB_COPY[tab]
  const list = lists[tab]
  const confirm = target && RELATION_CONFIRM[target.kind === 'blocks' ? 'unblock' : 'unmute']

  const handleConfirm = () => {
    if (!target || !confirm) return
    toggle.mutate(
      { kind: confirm.kind, publicId: target.item.publicId, on: false },
      {
        onSuccess: () => {
          setTarget(null)
          setToast({ open: true, message: confirm.done, variant: 'success' })
        },
        onError: e => {
          setTarget(null)
          setToast({ open: true, message: snsToggleErrorMessage(e), variant: 'error' })
        },
      },
    )
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="차단/뮤트 관리" actions={<HomeAction />} />}>
      <Tabs
        tabs={(['blocks', 'mutes'] as const).map(key => ({
          key,
          label: TAB_COPY[key].label,
          badge: lists[key].data?.totalCount.toLocaleString('ko-KR'),
        }))}
        activeKey={tab}
        onSelect={key => setTab(key as RelationKind)}
        className="px-2"
      />
      <p className="flex items-start gap-1.5 break-keep px-4 py-3 text-caption text-text-secondary">
        {tab === 'blocks' ? (
          <Info className="mt-px size-3.5 flex-none" />
        ) : (
          <EyeOff className="mt-px size-3.5 flex-none" />
        )}
        {copy.note}
      </p>
      <div className="border-t border-border-subtle" />

      {/* 다시 읽기가 실패하면 받아 둔 행은 두고 위에 알린다. 해제 버튼은 잠그지 않는다(AC-SNS01-026). */}
      {list.isRefetchError && (
        <SnsRefetchError message="목록을 다시 불러오지 못했어요." onRetry={() => void list.refetch()} />
      )}
      {list.isPending ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : !list.data ? (
        // 이미 불러온 목록은 재조회가 실패해도 그대로 둔다.
        <div className="py-10">
          <EmptyState
            title="목록을 불러오지 못했어요"
            description="잠시 후 다시 시도해 주세요."
            action={{ label: '다시 시도', onClick: () => void list.refetch() }}
          />
        </div>
      ) : list.data.items.length === 0 ? (
        <div className="py-10">
          <EmptyState title={copy.empty} />
        </div>
      ) : (
        <div className="pb-6">
          <ul>
            {list.data.items.map(item => (
              <li key={item.publicId} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={item.nickname} src={item.profileImageUrl ?? undefined} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-text-primary">{item.nickname}</p>
                  <p className="truncate text-caption text-text-tertiary">{copy.sub(item)}</p>
                </div>
                {tab === 'blocks' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${item.nickname} 신고`}
                    onClick={() => setReport({ item, open: true })}
                  >
                    신고
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`${item.nickname} ${copy.action}`}
                  onClick={() => setTarget({ kind: tab, item })}
                >
                  {copy.action}
                </Button>
              </li>
            ))}
          </ul>
          {list.hasNextPage && (
            <div className="px-4 pt-2">
              {/* 다음 페이지가 실패하면 받은 행은 두고 더보기 위에 알린다. 더보기가 다시 시도다. */}
              {list.isFetchNextPageError && (
                <p className="pb-2 text-center text-body-sm text-text-secondary">다음 목록을 불러오지 못했어요</p>
              )}
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
        </div>
      )}

      {target && confirm && (
        <Modal
          open
          onClose={() => setTarget(null)}
          title={confirm.title}
          description={confirm.description(target.item.nickname)}
          confirmLabel={confirm.confirmLabel}
          onConfirm={handleConfirm}
          loading={toggle.isPending}
        />
      )}
      <SnsReportSheet
        target={
          report && {
            type: 'SNS_USER',
            publicId: report.item.publicId,
            nickname: report.item.nickname,
            profileImageUrl: report.item.profileImageUrl,
          }
        }
        open={report?.open ?? false}
        onClose={() => setReport(prev => prev && { ...prev, open: false })}
      />
      <AppToast
        open={toast.open}
        message={toast.message}
        variant={toast.variant}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
      />
    </MobileScreen>
  )
}
