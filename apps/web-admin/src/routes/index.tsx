import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ClipboardCheck,
  Coins,
  LifeBuoy,
  MessagesSquare,
  PackageSearch,
  RotateCcw,
  ShoppingCart,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { BarChart, Card, MetricCard, StatusPill } from '@aechak/design-system/web'
import { useAdminDashboardSummary } from '@/features/dashboard'
import type { AdminDashboardTodo } from '@/features/dashboard'
import { usePendingApplicationCount } from '@/features/seller-applications'
import { MockDataNotice } from '@/shared/components/MockDataNotice'
import { PageIntro } from '@/shared/components/PageIntro'

// 로그인 복귀 지점(`/login/complete`가 여기로 redirect)이라 라우트를 비울 수 없다. admin 모듈에
// 운영 지표 집계 API가 없어 2026-10-18에는 안내 화면만 보여줬는데, 그러면 운영자가 어드민이
// 무엇을 보여줄 도구인지 알 수 없어 되돌렸다(SCRUM-308) — 지표는 예시로 그리고 상단 띠로 밝힌다.
//
// 예외가 하나 있다: **셀러 입점 심사 대기 수는 실 API 값을 쓴다.** 그 경로만 admin 모듈에 있고
// 같은 queryKey를 nav 배지가 이미 쓰고 있어 조회가 늘지 않는다. 예시 숫자를 함께 띄우면
// 대시보드와 nav 배지가 서로 다른 말을 하게 된다.
export const Route = createFileRoute('/')({
  component: DashboardRoute,
})

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

function TodoRow({ item, onOpen }: { item: AdminDashboardTodo; onOpen: (to: string) => void }) {
  return (
    <li className="border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(item.to)}
        className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-surface-hover"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-medium text-text-primary">{item.label}</span>
          <span className="mt-0.5 block text-caption text-text-tertiary">{item.detail}</span>
        </span>
        <span className="flex-none text-body-sm font-semibold text-text-primary tabular-nums">
          {item.count}건
        </span>
        <ArrowRight className="size-4 flex-none text-icon-muted" />
      </button>
    </li>
  )
}

function DashboardRoute() {
  const navigate = useNavigate()
  const { data } = useAdminDashboardSummary()
  // 실 API 값. 권한이 없거나 조회가 실패하면 null이 와서 숫자 대신 줄표를 보여준다(틀린 숫자 금지).
  const pendingApplications = usePendingApplicationCount()

  const openScreen = (to: string) => void navigate({ to })

  if (!data) return null

  return (
    <div className="p-6">
      <PageIntro title="대시보드" description="플랫폼 운영 지표를 한눈에 봐요." />

      <MockDataNotice>
        셀러 입점 심사 대기 수만 실데이터예요. 나머지 지표는 집계 경로가 생기면 그대로 채워져요.
      </MockDataNotice>

      <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="오늘 주문"
          value={`${data.todayOrderCount}건`}
          icon={<ShoppingCart className="size-full" />}
          footer="예시"
          onClick={() => openScreen('/orders/monitoring')}
        />
        <MetricCard
          label="오늘 거래액"
          value={won(data.todayGmv)}
          icon={<Coins className="size-full" />}
          footer="예시"
        />
        <MetricCard
          label="셀러 입점 심사 대기"
          value={pendingApplications == null ? '—' : `${pendingApplications}건`}
          icon={<ClipboardCheck className="size-full" />}
          footer={
            <StatusPill variant="success" size="sm">
              실데이터
            </StatusPill>
          }
          variant={pendingApplications ? 'urgent' : 'default'}
          onClick={() => openScreen('/sellers/applications')}
        />
        <MetricCard
          label="검수 대기 상품"
          value={`${data.productsAwaitingReview}건`}
          icon={<PackageSearch className="size-full" />}
          footer="예시"
          onClick={() => openScreen('/products/review')}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="미처리 신고"
          value={`${data.openReportCount}건`}
          icon={<AlertTriangle className="size-full" />}
          footer="예시"
          onClick={() => openScreen('/reports')}
        />
        <MetricCard
          label="미답변 문의"
          value={`${data.unansweredInquiryCount}건`}
          icon={<LifeBuoy className="size-full" />}
          footer="예시"
          onClick={() => openScreen('/inquiries')}
        />
        <MetricCard
          label="진행 중 클레임"
          value={`${data.openClaimCount}건`}
          icon={<RotateCcw className="size-full" />}
          footer="예시"
          onClick={() => openScreen('/claims')}
        />
        <MetricCard
          label="정산 예정액"
          value={won(data.settlementDueAmount)}
          icon={<Wallet className="size-full" />}
          footer="예시"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card padding="md">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-body font-semibold text-text-primary">최근 7일 거래액</h2>
            <span className="text-caption text-text-tertiary">단위 만원</span>
          </div>
          <BarChart
            data={data.weeklyGmv.map(point => ({
              label: point.label,
              value: Math.round(point.value / 10_000),
            }))}
            formatValue={value => `${value.toLocaleString('ko-KR')}만원`}
          />
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
            <div>
              <dt className="text-caption text-text-tertiary">신규 회원</dt>
              <dd className="text-body-sm font-medium text-text-primary tabular-nums">
                <Users className="mr-1 inline size-3.5 text-icon-muted" />
                {data.todayNewMemberCount}명
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-tertiary">신규 입점 셀러</dt>
              <dd className="text-body-sm font-medium text-text-primary tabular-nums">
                <UserPlus className="mr-1 inline size-3.5 text-icon-muted" />
                {data.todaySignedUpSellerCount}곳
              </dd>
            </div>
          </dl>
        </Card>

        <Card padding="md">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-body font-semibold text-text-primary">확인이 필요한 일</h2>
            <span className="inline-flex items-center gap-1 text-caption text-text-tertiary">
              <Bot className="size-3.5" />
              AI 탐지 포함
            </span>
          </div>
          <ul>
            {data.todoItems.map(item => (
              <TodoRow key={item.key} item={item} onOpen={openScreen} />
            ))}
          </ul>
          <button
            type="button"
            onClick={() => openScreen('/chat-monitoring')}
            className="mt-3 inline-flex items-center gap-1.5 text-label font-medium text-brand hover:underline"
          >
            <MessagesSquare className="size-4" />
            채팅 CS 모니터링 열기
          </button>
        </Card>
      </div>
    </div>
  )
}
