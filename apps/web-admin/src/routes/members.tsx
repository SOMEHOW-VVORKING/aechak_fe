import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle,
  Hourglass,
  PauseCircle,
  UserX,
} from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  SearchInput,
  Select,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import type { MemberAccount, MemberAccountStatus } from '@aechak/domain'
import type { SanctionReasonCode } from '@aechak/api'
import {
  SANCTION_REASON_LABELS,
  detailErrorMessage,
  listErrorMessage,
  sanctionErrorMessage,
  toDateLabel,
  useAdminMemberDetail,
  useAdminMembers,
  useSanctionMember,
  type MemberStatusFilterValue,
} from '@/features/members'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { HistoryList } from '@/shared/components/HistoryList'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'

export const Route = createFileRoute('/members')({
  component: MembersPage,
})

// BE UserStatus 6값 1:1. pending(온보딩 전)은 제재 대상이 아니라 결정 옵션에는 없지만 목록에
// 실리므로 pill은 6값을 다 채운다 — 비면 어떤 계정인지 읽을 수 없다.
const statusMeta: Record<MemberAccountStatus, StatusMeta> = {
  pending: { label: '가입 진행 중', variant: 'muted', icon: Hourglass },
  normal: { label: '정상', variant: 'success', icon: CheckCircle },
  restricted: { label: '이용 제한', variant: 'warning', icon: AlertTriangle },
  suspended: { label: '임시 정지', variant: 'error', icon: PauseCircle },
  banned: { label: '영구 정지', variant: 'danger', icon: Ban },
  withdrawing: { label: '탈퇴 처리', variant: 'muted', icon: UserX },
}

// 'pending'은 운영자가 만들 수 있는 상태가 아니라 필터에서도 뺀다(서버 NORMAL이 온보딩 전까지 포함한다).
const statusFilterOptions: { value: MemberStatusFilterValue; label: string }[] = [
  { value: 'all', label: '계정 상태 전체' },
  { value: 'normal', label: statusMeta.normal.label },
  { value: 'restricted', label: statusMeta.restricted.label },
  { value: 'suspended', label: statusMeta.suspended.label },
  { value: 'banned', label: statusMeta.banned.label },
  { value: 'withdrawing', label: statusMeta.withdrawing.label },
]

const sanctionReasonOptions = (
  Object.keys(SANCTION_REASON_LABELS) as SanctionReasonCode[]
).map(value => ({ value, label: SANCTION_REASON_LABELS[value] }))

/** 서버는 1~365일을 받지만 운영 합의는 세 가지다 — 임의 숫자 입력을 두지 않는다. */
const sanctionPeriodOptions = [
  { value: '7', label: '7일' },
  { value: '14', label: '14일' },
  { value: '30', label: '30일' },
]

/** 제출 가능한 결정. 'normal'은 제재가 아니라 해제라 서버 경로가 다르다. */
type MemberDecision = 'normal' | 'restricted' | 'suspended' | 'banned' | 'withdrawing'

const decisionModalMeta: Record<
  MemberDecision,
  { title: string; description: string; confirmLabel: string; confirmVariant: 'primary' | 'danger' }
> = {
  normal: {
    title: '정상 상태로 되돌릴까요?',
    description: '계정 제한 / 정지가 해제되고 서비스를 정상적으로 이용할 수 있어요.',
    confirmLabel: '정상 전환',
    confirmVariant: 'primary',
  },
  restricted: {
    title: '이용을 제한할까요?',
    description: '로그인과 조회는 되지만 리뷰 작성 / SNS 활동 / 문의 등록이 막혀요.',
    confirmLabel: '이용 제한',
    confirmVariant: 'primary',
  },
  suspended: {
    title: '계정을 임시 정지할까요?',
    description: '설정한 기간 동안 로그인과 서비스 이용이 막혀요. 기간이 지나면 자동으로 풀려요.',
    confirmLabel: '임시 정지',
    confirmVariant: 'primary',
  },
  banned: {
    title: '계정을 영구 정지할까요?',
    description: '영구 정지된 계정은 다시 로그인할 수 없고 해제도 할 수 없어요.',
    confirmLabel: '영구 정지',
    confirmVariant: 'danger',
  },
  withdrawing: {
    title: '회원을 탈퇴 처리할까요?',
    description: '탈퇴 처리된 계정은 서비스를 다시 이용할 수 없고 닉네임 점유도 풀려요. 되돌릴 수 없어요.',
    confirmLabel: '탈퇴 처리',
    confirmVariant: 'danger',
  },
}

function makeMemberColumns(onOpenDetail: (row: MemberAccount) => void): Column<MemberAccount>[] {
  return [
    {
      key: 'userId',
      label: '회원 ID',
      render: row => (
        <RowLinkButton numeric onClick={() => onOpenDetail(row)}>
          {row.userId}
        </RowLinkButton>
      ),
    },
    { key: 'nickname', label: '닉네임', render: row => row.nickname ?? '-' },
    {
      key: 'reportCount',
      label: '신고',
      align: 'right',
      render: row => <span className="tabular-nums">{row.reportCount}</span>,
    },
    {
      key: 'warningCount',
      label: '경고',
      align: 'right',
      render: row => <span className="tabular-nums">{row.warningCount}</span>,
    },
    {
      key: 'accountStatus',
      label: '계정 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={statusMeta[row.accountStatus]} />,
    },
    {
      key: 'joinedAt',
      label: '가입일',
      align: 'right',
      render: row => <span className="tabular-nums">{toDateLabel(row.joinedAt)}</span>,
    },
  ]
}

/** 저장값이 임시 정지인데 유효 상태가 정상이면 기간이 지나 자동으로 풀린 계정이다. */
function isExpiredSuspension(member: MemberAccount): boolean {
  return member.storedAccountStatus === 'suspended' && member.accountStatus === 'normal'
}

function MembersPage() {
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilterValue>('all')
  const [search, setSearch] = useState('')
  const list = useAdminMembers({ status: statusFilter, keyword: search })

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const detail = useAdminMemberDetail(selectedUserId)
  const sanction = useSanctionMember()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [decision, setDecision] = useState<MemberDecision>('normal')
  const [reasonCode, setReasonCode] = useState('')
  const [reasonDetail, setReasonDetail] = useState('')
  const [sanctionPeriod, setSanctionPeriod] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  const member = detail.member
  // 상세가 도착한 뒤 한 번만 시드한다 — 매 렌더 재시딩하면 운영자가 고른 값이 되돌아간다.
  useEffect(() => {
    if (!member) return
    setDecision(member.accountStatus === 'pending' ? 'normal' : member.accountStatus)
    setReasonCode('')
    setReasonDetail('')
    setSanctionPeriod('')
    setInternalMemo('')
  }, [member?.userId])

  const memberColumns = useMemo(
    () => makeMemberColumns(row => setSelectedUserId(row.userId)),
    [],
  )

  const isRelease = decision === 'normal'
  const needsReasonDetail = reasonCode === 'OTHER'
  const needsPeriod = decision === 'suspended'
  const canSubmit =
    member != null &&
    !sanction.isPending &&
    (isRelease
      ? true
      : reasonCode !== '' &&
        (!needsReasonDetail || reasonDetail.trim() !== '') &&
        (!needsPeriod || sanctionPeriod !== ''))

  function closeDrawer() {
    setSelectedUserId(null)
    setConfirmOpen(false)
  }

  function submit() {
    if (!member) return
    sanction.mutate(
      {
        userId: member.userId,
        decision: isRelease ? 'release' : decision,
        reasonCode: isRelease ? null : (reasonCode as SanctionReasonCode),
        reasonDetail,
        durationDays: needsPeriod ? Number(sanctionPeriod) : null,
        memo: internalMemo,
      },
      {
        onSuccess: () => {
          setToast(`${decisionModalMeta[decision].confirmLabel} 처리했어요.`)
          closeDrawer()
        },
        onError: error => {
          setToast(sanctionErrorMessage(error))
          setConfirmOpen(false)
        },
      },
    )
  }

  return (
    <div className="p-6">
      <PageIntro
        title="일반 회원 관리"
        description="구매자 회원의 이용 상태와 제재 이력을 운영 목적 범위에서 확인해요."
      />

      {/* 목록 실패는 빈 상태로 떨어뜨리지 않는다 — "회원 없음"과 "못 불러옴"이 구분되지 않는다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      <FilterBar className="mb-3.5">
        <FilterSelect
          options={statusFilterOptions}
          value={statusFilter}
          onChange={value => setStatusFilter(value as MemberStatusFilterValue)}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="회원 ID / 닉네임 검색"
          className="w-64"
        />
        {list.totalCount != null && (
          <span className="text-body-sm text-text-tertiary tabular-nums">
            조건에 맞는 회원 {list.totalCount}명
          </span>
        )}
      </FilterBar>

      <DataTable
        columns={memberColumns}
        rows={list.rows}
        rowKey={row => String(row.userId)}
        onRowClick={row => setSelectedUserId(row.userId)}
        loading={list.isLoading}
        emptyLabel={list.isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 회원이 없어요.'}
      />

      {list.hasNext && (
        <div className="mt-3.5 flex justify-center">
          <Button
            variant="secondary"
            onClick={list.fetchNextPage}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage ? '불러오는 중' : '더 보기'}
          </Button>
        </div>
      )}

      <Drawer open={selectedUserId !== null} onClose={closeDrawer} title="회원 상세" width="lg">
        {detail.isError && (
          <Alert variant="error" title="상세를 불러오지 못했어요">
            <p>{detailErrorMessage(detail.error)}</p>
          </Alert>
        )}
        {member && (
          <DetailDrawerBody
            subtitle={`${member.userId} / ${member.nickname ?? '닉네임 없음'}`}
            actions={
              <Button
                variant="primary"
                leftIcon={<Check className="size-4" />}
                onClick={() => setConfirmOpen(true)}
                disabled={!canSubmit}
              >
                제출
              </Button>
            }
          >
            <DrawerSummaryCard pills={<StatusMetaPill meta={statusMeta[member.accountStatus]} />}>
              <SummaryGrid
                items={[
                  { label: '가입일', value: toDateLabel(member.joinedAt) },
                  { label: '공개 ID', value: member.publicId },
                  { label: '신고 누적', value: `${member.reportCount}건` },
                  { label: '경고 누적', value: `${member.warningCount}회` },
                  {
                    label: '정지 만료',
                    value: member.sanctionUntil ? toDateLabel(member.sanctionUntil) : '-',
                  },
                ]}
              />
              {isExpiredSuspension(member) && (
                <p className="text-caption text-text-tertiary">
                  임시 정지 기간이 지나 이용이 다시 열렸어요. 상태 기록은 임시 정지로 남아 있어요.
                </p>
              )}
            </DrawerSummaryCard>

            <DetailField label={`제재 이력 / ${detail.sanctions.length}건`}>
              <HistoryList
                items={detail.sanctions}
                renderDescription={item =>
                  [
                    item.reason,
                    item.effectiveUntil ? `${item.effectiveUntil}까지` : null,
                    item.memo ? `메모: ${item.memo}` : null,
                  ]
                    .filter(Boolean)
                    .join(' / ') || null
                }
                emptyLabel="제재 이력이 없어요."
              />
            </DetailField>

            <DetailField label="계정 상태">
              <DecisionRadioGroup<MemberDecision>
                name="member-status"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'normal', label: '정상', caption: '걸려 있는 제재를 해제' },
                  { value: 'restricted', label: '이용 제한', caption: '리뷰/SNS/문의 쓰기 제한' },
                  { value: 'suspended', label: '임시 정지', caption: '기간제 전면 차단' },
                  { value: 'banned', label: '영구 정지', caption: '해제 불가' },
                  { value: 'withdrawing', label: '탈퇴 처리', caption: '되돌릴 수 없음' },
                ]}
              />
            </DetailField>

            {!isRelease && (
              <DetailField label="제재 사유">
                <Select
                  options={sanctionReasonOptions}
                  value={reasonCode}
                  onChange={setReasonCode}
                  placeholder="사유 선택"
                />
              </DetailField>
            )}

            {(!isRelease && needsReasonDetail) || isRelease ? (
              <DetailField label={isRelease ? '해제 사유' : '상세 사유'}>
                <Textarea
                  value={reasonDetail}
                  onChange={setReasonDetail}
                  maxLength={500}
                  rows={3}
                  placeholder={isRelease ? '해제 사유를 입력하세요.' : '상세 사유를 입력하세요.'}
                />
              </DetailField>
            ) : null}

            {needsPeriod && (
              <DetailField label="제재 기간">
                <Select
                  options={sanctionPeriodOptions}
                  value={sanctionPeriod}
                  onChange={setSanctionPeriod}
                  placeholder="기간 선택"
                />
              </DetailField>
            )}

            <DetailField label="내부 메모" visibility="internal-only">
              <Textarea
                value={internalMemo}
                onChange={setInternalMemo}
                maxLength={300}
                rows={3}
                placeholder="내부 공유용 메모를 입력하세요."
              />
            </DetailField>
          </DetailDrawerBody>
        )}
      </Drawer>

      {member && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={decisionModalMeta[decision].title}
          description={decisionModalMeta[decision].description}
          confirmLabel={decisionModalMeta[decision].confirmLabel}
          confirmVariant={decisionModalMeta[decision].confirmVariant}
          onConfirm={submit}
          loading={sanction.isPending}
        >
          <SummaryGrid
            items={[
              { label: '대상', value: `${member.nickname ?? '닉네임 없음'} (${member.userId})` },
              {
                label: '사유',
                value: isRelease
                  ? reasonDetail.trim() || '-'
                  : SANCTION_REASON_LABELS[reasonCode as SanctionReasonCode] ?? '-',
              },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="info" />}
    </div>
  )
}
