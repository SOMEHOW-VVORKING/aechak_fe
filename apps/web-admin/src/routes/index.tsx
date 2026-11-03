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
import { BarChart, Card, MetricCard } from '@aechak/design-system/web'
import { useOpenClaimCount } from '@/features/claims'
import { useAdminDashboardSummary } from '@/features/dashboard'
import type { AdminDashboardTodo } from '@/features/dashboard'
import { useReceivedInquiryCount } from '@/features/inquiries'
import { useTodayOrderAmount } from '@/features/order-monitoring'
import { usePendingInspectionCount } from '@/features/ai-review-queue'
import { useReceivedReportCount } from '@/features/reports'
import { usePendingApplicationCount } from '@/features/seller-applications'
import { MockDataNotice } from '@/shared/components/MockDataNotice'
import { PageIntro } from '@/shared/components/PageIntro'

// 로그인 복귀 지점(`/login/complete`가 여기로 redirect)이라 라우트를 비울 수 없다. admin 모듈에
// 운영 지표를 한 번에 주는 경로가 없어 2026-10-18에는 안내 화면만 보여줬는데, 그러면 운영자가
// 어드민이 무엇을 보여줄 도구인지 알 수 없어 되돌렸다(SCRUM-308).
//
// 2026-11-03(SCRUM-313): 여덟 칸 가운데 **여섯이 실 집계**가 됐다. 전용 대시보드 경로가 생긴 것이
// 아니라, 이미 실연동된 화면들의 목록·지표 경로를 **1건짜리 조회로 건수만** 받아 온다
// (`size=1` + 응답 `totalCount`). 남은 둘(오늘 주문·정산 예정액)은 서버에 셀 방법이 없어 예시로
// 남기고 꼬리표를 유지한다 — 떼면 거짓이 된다.
//
// 지키는 규칙 셋.
// 1. **채운 칸에서만 꼬리표를 뗀다.** 꼬리표가 없는 칸은 실 집계라는 뜻이고, 띠가 어느 칸이 예시인지
//    이름으로 적는다.
// 2. **조회 실패·권한 없음은 0이 아니라 줄표다.** 어드민 권한이 없으면 LIVE 경로가 전부 403인데
//    `0건`을 그리면 운영자는 "할 일이 없다"로 읽는다(판정은 `useMetricValue`).
// 3. **할 일 목록은 카드와 같은 집계를 재사용한다.** 같은 수를 두 번 만들지 않으므로 운영자가
//    들어간 화면에서 숫자가 달라지지 않는다. 숫자를 못 만드는 줄만 `예시` 표시를 달고 남는다.
export const Route = createFileRoute('/')({
  component: DashboardRoute,
})

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

/** 못 받은 값. 0과 구별돼야 한다 — 0은 "할 일이 없다"고, 줄표는 "모른다"다. */
const UNMEASURED = '—'

const countLabel = (value: number | null) => (value == null ? UNMEASURED : `${value}건`)
const amountLabel = (value: number | null) => (value == null ? UNMEASURED : won(value))

/** 지어낸 숫자에 붙는 꼬리표. nav의 `준비 중`과 같은 방식으로 색이 아니라 글자로 밝힌다. */
const SAMPLE_TAG = '예시'

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
        {/* 지어낸 숫자인 줄만. 실연동 화면으로 보내는 줄에 이 표시가 빠지면 운영자가 들어간
            화면에서 숫자가 다른 것을 보게 된다. */}
        {item.sample && <span className="flex-none text-caption text-text-tertiary">{SAMPLE_TAG}</span>}
        <span className="flex-none text-body-sm font-semibold text-text-primary tabular-nums">
          {countLabel(item.count)}
        </span>
        <ArrowRight className="size-4 flex-none text-icon-muted" />
      </button>
    </li>
  )
}

function DashboardRoute() {
  const navigate = useNavigate()
  const { data } = useAdminDashboardSummary()
  // 실 집계 여섯. 전부 실패·권한 없음에 null을 돌려준다(틀린 숫자도, 0도 그리지 않는다).
  // 입점 심사 대기 수는 nav 배지와 **같은 queryKey**라 조회가 늘지 않는다.
  const pendingApplications = usePendingApplicationCount()
  const todayOrderAmount = useTodayOrderAmount()
  const pendingInspections = usePendingInspectionCount()
  const openReports = useReceivedReportCount()
  const receivedInquiries = useReceivedInquiryCount()
  const openClaims = useOpenClaimCount()

  const openScreen = (to: string) => void navigate({ to })

  if (!data) return null

  // 카드와 같은 집계를 그대로 쓴다 — 줄의 숫자를 따로 만들면 운영자가 들어간 화면에서 어긋난다.
  // 목적지는 그 수를 실제로 보여주는 화면이어야 한다(`검수 대기 상품`이 `/products/review`로
  // 가면 예시 12행이 깔린 준비 중 화면에 떨어진다).
  const todoItems: AdminDashboardTodo[] = [
    {
      key: 'inspections',
      label: '검수 대기 상품',
      detail: 'AI가 숨긴 뒤 운영자 확인이 남은 상품',
      count: pendingInspections,
      sample: false,
      to: '/products/ai-queue',
    },
    {
      key: 'reports',
      label: '미처리 신고',
      detail: '접수 후 제재 판단이 남은 신고',
      count: openReports,
      sample: false,
      to: '/reports',
    },
    {
      key: 'inquiries',
      label: '답변 대기 문의',
      detail: '운영자 답변을 기다리는 문의',
      count: receivedInquiries,
      sample: false,
      to: '/inquiries',
    },
    {
      key: 'claims',
      label: '진행 중 클레임',
      detail: '운영자가 개입할 수 있는 취소/반품/교환',
      count: openClaims,
      sample: false,
      to: '/claims',
    },
    ...data.todoItems,
  ]

  const hasUnmeasured = [
    pendingApplications,
    todayOrderAmount,
    pendingInspections,
    openReports,
    receivedInquiries,
    openClaims,
  ].some(value => value == null)

  return (
    <div className="p-6">
      <PageIntro title="대시보드" description="플랫폼 운영 지표를 한눈에 봐요." />

      {/* 띠는 남는다 — 아직 예시인 칸이 있다. 대신 **어느 칸이 예시인지 이름으로** 적는다:
          화면 전체가 예시라는 기본 문구를 그대로 쓰면 띠가 실 집계 여섯 칸까지 예시라고 말한다. */}
      <MockDataNotice body="지표의 오늘 주문과 정산 예정액, 아래 7일 거래액 그래프와 신규 회원 / 신규 입점 셀러 수는 모양만 보여주는 예시 값이에요. 이 화면에서는 아무것도 저장되지 않아요.">
        {SAMPLE_TAG} 표시가 없는 칸과 할 일 목록은 서버에서 받은 집계예요.
        {hasUnmeasured &&
          ` 숫자 대신 줄표(${UNMEASURED})가 보이는 칸은 어드민 권한이 없거나 조회가 실패해서 셀 수 없었던 거예요.`}
      </MockDataNotice>

      <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="오늘 주문"
          value={`${data.todayOrderCount}건`}
          icon={<ShoppingCart className="size-full" />}
          footer={SAMPLE_TAG}
          onClick={() => openScreen('/orders/monitoring')}
        />
        <MetricCard
          label="오늘 거래액"
          value={amountLabel(todayOrderAmount)}
          icon={<Coins className="size-full" />}
          // 서버가 계산한 주문 금액을 그대로 쓴다 — 취소 주문과 취소·반품으로 종결된 품목이 빠지고
          // 적립금은 빠지지 않아 수납액이 아니다. 뜻을 적지 않으면 운영자가 정산 숫자와 맞춰 본다.
          footer="취소 주문 제외 / 수납액 아님"
          onClick={() => openScreen('/orders/monitoring')}
        />
        <MetricCard
          label="셀러 입점 심사 대기"
          value={countLabel(pendingApplications)}
          icon={<ClipboardCheck className="size-full" />}
          variant={pendingApplications ? 'urgent' : 'default'}
          onClick={() => openScreen('/sellers/applications')}
        />
        <MetricCard
          label="검수 대기 상품"
          value={countLabel(pendingInspections)}
          icon={<PackageSearch className="size-full" />}
          // `/products/review`가 아니라 AI 검수 큐로 보낸다 — 이 수를 주는 경로가
          // `GET /admin/product-inspections`이고 그 행을 보여주는 화면이 저기다.
          onClick={() => openScreen('/products/ai-queue')}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="미처리 신고"
          value={countLabel(openReports)}
          icon={<AlertTriangle className="size-full" />}
          onClick={() => openScreen('/reports')}
        />
        <MetricCard
          label="답변 대기 문의"
          value={countLabel(receivedInquiries)}
          icon={<LifeBuoy className="size-full" />}
          onClick={() => openScreen('/inquiries')}
        />
        <MetricCard
          label="진행 중 클레임"
          value={countLabel(openClaims)}
          icon={<RotateCcw className="size-full" />}
          onClick={() => openScreen('/claims')}
        />
        <MetricCard
          label="정산 예정액"
          value={won(data.settlementDueAmount)}
          icon={<Wallet className="size-full" />}
          footer={SAMPLE_TAG}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card padding="md">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-body font-semibold text-text-primary">최근 7일 거래액</h2>
            <span className="text-caption text-text-tertiary">예시 값 / 단위 만원</span>
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
            {todoItems.map(item => (
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
