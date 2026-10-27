import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Ban, Check, CheckCircle, MessageCircle, Minus, Package, PauseCircle, UserX } from 'lucide-react'
import {
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  SearchInput,
  Select,
  StatusPill,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import type { MemberAccount, MemberAccountStatus } from '@aechak/domain'
import { useMemberAccounts } from '@/features/members'
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
import { MockDataNotice, MOCK_WRITE_TOAST } from '@/shared/components/MockDataNotice'
import { useDetailList } from '@/shared/hooks/useDetailList'

// admin 모듈에 회원 조회·제재 API가 없어(컨트롤러는 관리자 명부·입점 심사뿐) 목록·제재가 전부
// 예시 데이터다. 2026-10-18에는 이 화면을 UnavailableScreen으로 돌려보냈는데, 그러면 운영자가
// 기능의 모양조차 볼 수 없어 되돌렸다(SCRUM-308) — 화면은 열어 두고 상단 띠로 예시임을 밝히고
// 쓰기를 막는다. `GET/PATCH /admin/members`가 생기면 members.queries.ts만 갈아끼우고 띠를 뗀다.
export const Route = createFileRoute('/members')({
  component: MembersPage,
})

const statusMeta: Record<MemberAccountStatus, StatusMeta> = {
  normal: { label: '정상', variant: 'success', icon: CheckCircle },
  restricted: { label: '이용 제한', variant: 'warning', icon: AlertTriangle },
  suspended: { label: '임시 정지', variant: 'error', icon: PauseCircle },
  banned: { label: '영구 정지', variant: 'danger', icon: Ban },
  withdrawing: { label: '탈퇴 처리', variant: 'muted', icon: UserX },
}

const statusFilterOptions = [
  { value: 'all', label: '계정 상태 전체' },
  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const sanctionReasonOptions = [
  { value: 'abuse-review', label: '리뷰 욕설/비방 반복' },
  { value: 'chat-dispute', label: '채팅 분쟁 반복' },
  { value: 'fraud-report', label: '허위 신고 반복' },
]

const sanctionPeriodOptions = [
  { value: '7d', label: '7일' },
  { value: '14d', label: '14일' },
  { value: '30d', label: '30일' },
]

const decisionModalMeta: Record<
  MemberAccountStatus,
  { title: string; description: string; confirmLabel: string; confirmVariant: 'primary' | 'danger' }
> = {
  normal: {
    title: '정상 상태로 되돌릴까요?',
    description: '계정 제한 · 정지가 해제되고 서비스를 정상적으로 이용할 수 있어요.',
    confirmLabel: '정상 전환',
    confirmVariant: 'primary',
  },
  restricted: {
    title: '이용을 제한할까요?',
    description: '일부 기능(리뷰 작성, 채팅 등) 이용이 제한되고 대상자에게 통보돼요.',
    confirmLabel: '이용 제한',
    confirmVariant: 'primary',
  },
  suspended: {
    title: '계정을 임시 정지할까요?',
    description: '설정한 기간 동안 로그인 및 서비스 이용이 제한돼요.',
    confirmLabel: '임시 정지',
    confirmVariant: 'primary',
  },
  banned: {
    title: '계정을 영구 정지할까요?',
    description: '영구 정지된 계정은 다시 로그인할 수 없고, 되돌릴 수 없어요. 진행 중 주문이 없는지 먼저 확인하세요.',
    confirmLabel: '영구 정지',
    confirmVariant: 'danger',
  },
  withdrawing: {
    title: '회원을 탈퇴 처리할까요?',
    description: '탈퇴 처리된 계정은 서비스를 다시 이용할 수 없어요. 되돌릴 수 없으니 신중히 확인하세요.',
    confirmLabel: '탈퇴 처리',
    confirmVariant: 'danger',
  },
}

function makeMemberColumns(onOpenDetail: (row: MemberAccount) => void): Column<MemberAccount>[] {
  return [
    {
      key: 'id',
      label: '회원 ID',
      render: row => (
        <RowLinkButton numeric onClick={() => onOpenDetail(row)}>
          {row.id}
        </RowLinkButton>
      ),
    },
    { key: 'nickname', label: '닉네임' },
    {
      key: 'orderCount',
      label: '주문',
      align: 'right',
      render: row => <span className="tabular-nums">{row.orderCount}</span>,
    },
    {
      key: 'reportCount',
      label: '신고',
      align: 'right',
      render: row => <span className="tabular-nums">{row.reportCount}</span>,
    },
    {
      key: 'accountStatus',
      label: '계정 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={statusMeta[row.accountStatus]} />,
    },
    {
      key: 'hasActiveOrder',
      label: '탈퇴',
      align: 'center',
      render: row =>
        row.hasActiveOrder ? (
          <StatusPill variant="info">
            <Package className="size-3" />
            진행 주문
          </StatusPill>
        ) : (
          <StatusPill variant="neutral">
            <Minus className="size-3" />
          </StatusPill>
        ),
    },
  ]
}

function MembersPage() {
  const { data, isLoading } = useMemberAccounts()
  const { items, patchRow, selected, select, closeDrawer, confirmOpen, setConfirmOpen, toast, setToast } =
    useDetailList(data)

  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.accountStatus !== statusFilter) return false
        if (search && !row.id.includes(search) && !row.nickname.includes(search)) return false
        return true
      }),
    [items, statusFilter, search],
  )

  const [decision, setDecision] = useState<MemberAccountStatus>('normal')
  const [sanctionReason, setSanctionReason] = useState('')
  const [sanctionPeriod, setSanctionPeriod] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: MemberAccount) {
    select(row.id)
    setDecision(row.accountStatus)
    setSanctionReason(row.sanctionReason ?? '')
    setSanctionPeriod(row.sanctionPeriod ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  function applyStatus(target: MemberAccount, nextStatus: MemberAccountStatus) {
    // 서버로 나가는 요청이 없다 — 바꾼 값을 화면에만 겹쳐 보여준다(useDetailList의 edits).
    patchRow(target.id, { accountStatus: nextStatus, sanctionReason, sanctionPeriod, internalMemo })
    setToast(MOCK_WRITE_TOAST)
    closeDrawer()
  }

  const memberColumns = useMemo(() => makeMemberColumns(openDrawer), [])
  const sanctionReasonLabel =
    sanctionReasonOptions.find(opt => opt.value === sanctionReason)?.label ?? sanctionReason

  return (
    <div className="p-6">
      <PageIntro
        title="일반 회원 관리"
        description="구매자 회원의 이용 상태와 제재 정보를 운영 목적 범위에서 확인해요."
      />

      <MockDataNotice>admin 모듈에 회원 조회·제재 경로가 생기면 그대로 실연동돼요.</MockDataNotice>

      <FilterBar className="mb-3.5">
        <FilterSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
        <SearchInput value={search} onChange={setSearch} placeholder="회원 ID · 닉네임 검색" className="w-64" />
      </FilterBar>

      <DataTable
        columns={memberColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 회원이 없어요."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="회원 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.id} · ${selected.nickname}`}
            actions={
              <Button variant="primary" leftIcon={<Check className="size-4" />} onClick={() => setConfirmOpen(true)}>
                제출
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={statusMeta[selected.accountStatus]} />
                  <StatusPill variant="neutral">
                    <MessageCircle className="size-3" />
                    {selected.joinChannel}
                  </StatusPill>
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '이메일', value: selected.emailMasked },
                  { label: '휴대폰', value: selected.phoneMasked },
                  { label: '주문 건수', value: `${selected.orderCount}건` },
                  { label: '진행 중 주문', value: selected.hasActiveOrder ? '있음' : '없음' },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label={`신고 누적 이력 · ${selected.reportHistory.length}건`}>
              <HistoryList items={selected.reportHistory} emptyLabel="신고 이력이 없어요." />
            </DetailField>

            <DetailField label="계정 상태">
              <DecisionRadioGroup
                name="member-status"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'normal', label: '정상' },
                  { value: 'restricted', label: '이용 제한', caption: '일부 기능 제한' },
                  { value: 'suspended', label: '임시 정지', caption: '기간제 정지' },
                  { value: 'banned', label: '영구 정지', caption: '계정 영구 차단' },
                ]}
              />
            </DetailField>

            <DetailField label="제재 사유">
              <Select
                options={sanctionReasonOptions}
                value={sanctionReason}
                onChange={setSanctionReason}
                placeholder="사유 선택"
              />
            </DetailField>

            <DetailField label="제재 기간">
              <Select
                options={sanctionPeriodOptions}
                value={sanctionPeriod}
                onChange={setSanctionPeriod}
                placeholder="기간 선택"
              />
            </DetailField>

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

      {selected && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={decisionModalMeta[decision].title}
          description={decisionModalMeta[decision].description}
          confirmLabel={decisionModalMeta[decision].confirmLabel}
          confirmVariant={decisionModalMeta[decision].confirmVariant}
          onConfirm={() => applyStatus(selected, decision)}
        >
          <SummaryGrid
            items={[
              { label: '대상', value: `${selected.nickname} (${selected.id})` },
              { label: '사유', value: sanctionReasonLabel },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="warning" />}
    </div>
  )
}
