import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle, Eye, MessagesSquare, ShieldAlert, UserCog } from 'lucide-react'
import {
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  SearchInput,
  StatusPill,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import { useAdminChatRooms } from '@/features/chat-monitoring'
import type {
  AdminChatMessage,
  AdminChatRiskLevel,
  AdminChatRoom,
  AdminChatStatus,
} from '@/features/chat-monitoring'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { MockDataNotice, MOCK_WRITE_TOAST } from '@/shared/components/MockDataNotice'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { Tag } from '@/shared/components/Tag'
import { useDetailList } from '@/shared/hooks/useDetailList'

// 채팅 자체가 BE에 없다(SNS 프로필 경로만 열려 있다). 안내 화면으로 돌려보내는 대신 예시 데이터로
// 모양을 보여주고 상단 띠로 밝힌다(SCRUM-308).
export const Route = createFileRoute('/chat-monitoring')({
  component: ChatMonitoringPage,
})

const riskMeta: Record<AdminChatRiskLevel, StatusMeta> = {
  none: { label: '신호 없음', variant: 'muted', icon: CheckCircle },
  watch: { label: '관찰', variant: 'warning', icon: AlertTriangle },
  high: { label: '위험', variant: 'danger', icon: ShieldAlert },
}

const statusMeta: Record<AdminChatStatus, StatusMeta> = {
  open: { label: '진행 중', variant: 'info', icon: MessagesSquare },
  intervened: { label: '운영 개입', variant: 'brand', icon: UserCog },
  closed: { label: '종료', variant: 'muted', icon: CheckCircle },
}

const riskFilterOptions = [
  { value: 'all', label: '위험도 전체' },
  ...Object.entries(riskMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const statusFilterOptions = [
  { value: 'all', label: '상담 상태 전체' },
  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const speakerLabel: Record<AdminChatMessage['speaker'], string> = {
  buyer: '구매자',
  seller: '셀러',
  admin: '운영자',
}

const speakerClass: Record<AdminChatMessage['speaker'], string> = {
  buyer: 'bg-surface-sunken text-text-secondary',
  seller: 'bg-info-surface text-info-fg',
  admin: 'bg-brand-subtle text-brand',
}

function Transcript({ messages }: { messages: AdminChatMessage[] }) {
  return (
    <ul className="space-y-2">
      {messages.map((message, index) => (
        <li key={index} className={`rounded-md px-3 py-2 ${speakerClass[message.speaker]}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-caption font-semibold">{speakerLabel[message.speaker]}</span>
            <span className="flex-none text-caption tabular-nums opacity-70">{message.at}</span>
          </div>
          <p className="mt-0.5 break-keep text-body-sm">{message.text}</p>
        </li>
      ))}
    </ul>
  )
}

function makeChatColumns(onOpenDetail: (row: AdminChatRoom) => void): Column<AdminChatRoom>[] {
  return [
    {
      key: 'id',
      label: '상담방',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)} numeric>
            {row.id}
          </RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.buyerMasked} / {row.sellerName}
          </p>
        </div>
      ),
    },
    {
      key: 'productName',
      label: '상담 상품',
      render: row => <p className="truncate text-body-sm text-text-primary">{row.productName}</p>,
    },
    {
      key: 'messageCount',
      label: '메시지',
      align: 'right',
      render: row => <span className="tabular-nums">{row.messageCount}개</span>,
    },
    {
      key: 'lastMessageAt',
      label: '최근 대화',
      align: 'right',
      render: row => <span className="tabular-nums">{row.lastMessageAt}</span>,
    },
    {
      key: 'riskLevel',
      label: '위험 신호',
      render: row => (
        <div className="min-w-0">
          <StatusMetaPill meta={riskMeta[row.riskLevel]} />
          {row.riskSignals.length > 0 && (
            <p className="mt-1.5 pl-2.5 text-caption text-text-tertiary">
              {row.riskSignals.join(' / ')}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: '상담 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={statusMeta[row.status]} />,
    },
  ]
}

function ChatMonitoringPage() {
  const { data, isLoading } = useAdminChatRooms()
  const {
    items,
    patchRow,
    selected,
    select,
    closeDrawer,
    confirmOpen,
    setConfirmOpen,
    toast,
    setToast,
  } = useDetailList(data)

  const [riskFilter, setRiskFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (riskFilter !== 'all' && row.riskLevel !== riskFilter) return false
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (
          search &&
          !row.id.includes(search) &&
          !row.sellerName.includes(search) &&
          !row.buyerMasked.includes(search)
        )
          return false
        return true
      }),
    [items, riskFilter, statusFilter, search],
  )

  const [interventionMemo, setInterventionMemo] = useState('')

  function openDrawer(row: AdminChatRoom) {
    select(row.id)
    setInterventionMemo(row.interventionMemo ?? '')
  }

  // 서버로 나가는 요청이 없다 — 개입 기록을 화면에만 겹쳐 보여준다(useDetailList의 edits).
  function intervene(target: AdminChatRoom) {
    patchRow(target.id, { status: 'intervened', interventionMemo })
    setToast(MOCK_WRITE_TOAST)
    closeDrawer()
  }

  const chatColumns = useMemo(() => makeChatColumns(openDrawer), [])
  const highRiskCount = items.filter(row => row.riskLevel === 'high').length

  return (
    <div className="p-6">
      <PageIntro
        title="채팅 CS 모니터링"
        description="구매자와 셀러 사이의 채팅 상담을 모니터링해요."
      />

      <MockDataNotice>
        채팅 BE가 올라오고 운영자용 조회 경로가 생기면 그대로 실연동돼요.
      </MockDataNotice>

      <FilterBar className="mb-3.5">
        <FilterSelect options={riskFilterOptions} value={riskFilter} onChange={setRiskFilter} />
        <FilterSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="상담방 · 셀러 · 구매자 검색"
          className="w-72"
        />
        {highRiskCount > 0 && (
          <StatusPill variant="danger">
            <ShieldAlert className="size-3" />
            위험 {highRiskCount}건
          </StatusPill>
        )}
      </FilterBar>

      <DataTable
        columns={chatColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 상담방이 없어요."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="상담 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.id} · ${selected.productName}`}
            actions={
              <Button
                variant="primary"
                leftIcon={<UserCog className="size-4" />}
                onClick={() => setConfirmOpen(true)}
                disabled={selected.status === 'closed'}
              >
                운영자 개입
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={statusMeta[selected.status]} />
                  <StatusMetaPill meta={riskMeta[selected.riskLevel]} />
                  {selected.riskSignals.map(signal => (
                    <Tag key={signal} tone="warning">
                      <AlertTriangle className="size-3" />
                      {signal}
                    </Tag>
                  ))}
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '구매자', value: selected.buyerMasked },
                  { label: '셀러', value: selected.sellerName },
                  { label: '메시지', value: `${selected.messageCount}개` },
                  { label: '최근 대화', value: selected.lastMessageAt },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="대화 내용" visibility="internal-only">
              <Transcript messages={selected.transcript} />
            </DetailField>

            <DetailField label="개입 메모" visibility="internal-only">
              <Textarea
                value={interventionMemo}
                onChange={setInterventionMemo}
                maxLength={300}
                rows={3}
                placeholder="개입 사유와 후속 조치를 입력하세요."
              />
            </DetailField>

            <p className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
              <Eye className="size-3.5" />
              열람 기록은 어드민 액션 로그에 남아요.
            </p>
          </DetailDrawerBody>
        )}
      </Drawer>

      {selected && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="운영자로 대화에 들어갈까요?"
          description="양쪽에게 운영자 참여가 공지되고 이후 대화가 모니터링 대상으로 표시돼요."
          confirmLabel="개입하기"
          onConfirm={() => intervene(selected)}
        >
          <SummaryGrid
            items={[
              { label: '상담방', value: selected.id },
              { label: '위험 신호', value: selected.riskSignals.join(' / ') || '없음' },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="warning" />}
    </div>
  )
}
