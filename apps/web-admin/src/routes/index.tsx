import { useIsFetching } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ClipboardCheck,
  Coins,
  LifeBuoy,
  PackageSearch,
  RotateCcw,
  Users,
} from 'lucide-react'
import { Alert, Card, MetricCard } from '@aechak/design-system/web'
import { useOpenClaimCount } from '@/features/claims'
import { useReceivedInquiryCount } from '@/features/inquiries'
import { useJoinedMemberCount } from '@/features/members'
import { useTodayOrderAmount, toKstDateParam } from '@/features/order-monitoring'
import { usePendingInspectionCount } from '@/features/ai-review-queue'
import { useReceivedReportCount } from '@/features/reports'
import { usePendingApplicationCount } from '@/features/seller-applications'
import { PageIntro } from '@/shared/components/PageIntro'

// 로그인 복귀 지점(`/login/complete`가 여기로 redirect)이라 라우트를 비울 수 없다. admin 모듈에
// 운영 지표를 한 번에 주는 경로가 없어 2026-10-18에는 안내 화면만 보여줬는데, 그러면 운영자가
// 어드민이 무엇을 보여줄 도구인지 알 수 없어 되돌렸다(SCRUM-308).
//
// **지금은 일곱 칸과 할 일 네 줄이 전부 실 집계다.** 전용 대시보드 경로가 생긴 것이 아니라, 이미
// 실연동된 화면들의 목록·지표 경로를 **1건짜리 조회로 건수만** 받아 온다(`size=1` + 응답
// `totalCount`). 그래서 예시 데이터 띠(`MockDataNotice`)도 없다 — 실 집계 화면에 띠를 붙이면
// 실데이터를 예시로 의심하게 만들어 거꾸로 속인다(규약 10).
//
// 예시로 남아 있던 칸은 걷었다. 서버에 셀 방법이 없어서다 — 오늘 주문 건수는
// `GET /admin/orders`의 `totalCount`가 항상 null이고 `/admin/orders/metrics`의 건수 셋은 서로
// 겹치는 상태별 부분집합이며, 정산은 admin 모듈에 경로 자체가 없고, 입점 신청 목록에는 날짜 축이
// 없어 신규 셀러를 셀 수 없고, 기간별 거래액은 날짜마다 지표를 다시 불러야 해서 첫 화면의 요청이
// 일곱 개 늘어난다. 지어낸 숫자를 남겨 두는 것보다 칸을 없애는 것이 맞다.
//
// 지키는 규칙 셋.
// 1. **건수는 응답 `totalCount`로만 센다.** `size=1`이면 목록 길이는 무엇을 받아도 1이다.
// 2. **조회 실패·권한 없음은 0이 아니라 줄표다.** 어드민 권한이 없으면 LIVE 경로가 전부 403인데
//    `0건`을 그리면 운영자는 "할 일이 없다"로 읽는다(판정은 `useMetricValue`). 줄표만으로는 0과
//    구별되지 않아, 줄표가 하나라도 있으면 그 사유를 띠로 적는다.
// 3. **할 일 목록은 카드와 같은 집계를 재사용한다.** 같은 수를 두 번 만들지 않으므로 운영자가
//    들어간 화면에서 숫자가 달라지지 않는다.
export const Route = createFileRoute('/')({
  component: DashboardRoute,
})

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

/** 못 받은 값. 0과 구별돼야 한다 — 0은 "할 일이 없다"고, 줄표는 "모른다"다. */
const UNMEASURED = '—'

const countLabel = (value: number | null) => (value == null ? UNMEASURED : `${value}건`)
const amountLabel = (value: number | null) => (value == null ? UNMEASURED : won(value))
const peopleLabel = (value: number | null) => (value == null ? UNMEASURED : `${value}명`)

/** 확인이 필요한 일 한 줄. 카드와 같은 집계를 쓰므로 수를 따로 들지 않는다. */
interface DashboardTodo {
  key: string
  label: string
  detail: string
  /**
   * 건수. **`null`이면 조회가 실패했거나 권한이 없다는 뜻이고 줄표를 그린다** — 0으로 그리면
   * 운영자가 "할 일이 없다"로 읽는다.
   */
  count: number | null
  /** 이동할 라우트 경로. nav에 있는 경로만 쓴다 — 없는 경로로 보내면 죽은 진입점이다. */
  to: string
}

function TodoRow({ item, onOpen }: { item: DashboardTodo; onOpen: (to: string) => void }) {
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
          {countLabel(item.count)}
        </span>
        <ArrowRight className="size-4 flex-none text-icon-muted" />
      </button>
    </li>
  )
}

function DashboardRoute() {
  const navigate = useNavigate()
  // 실 집계 일곱. 전부 실패·권한 없음에 null을 돌려준다(틀린 숫자도, 0도 그리지 않는다).
  // 입점 심사 대기 수는 nav 배지와 **같은 queryKey**라 조회가 늘지 않는다.
  const pendingApplications = usePendingApplicationCount()
  const todayOrderAmount = useTodayOrderAmount()
  const pendingInspections = usePendingInspectionCount()
  const openReports = useReceivedReportCount()
  const receivedInquiries = useReceivedInquiryCount()
  const openClaims = useOpenClaimCount()
  // 가입일 구간을 오늘 하루로 좁혀 센다. 날짜는 서버가 세는 하루와 같아야 해서 KST 벽시계
  // 날짜로 만든다(브라우저 표준시나 UTC로 만들면 자정 경계에서 아홉 시간 어긋난다).
  const todayNewMembers = useJoinedMemberCount(toKstDateParam(new Date()))

  // 받는 중에도 값은 null이라, 그 둘을 가리지 않으면 첫 화면이 매번 "조회가 실패했다"고 말한다 —
  // 모든 조회가 가라앉은 뒤에만 줄표의 사유를 띄운다.
  const isFetching = useIsFetching() > 0

  const openScreen = (to: string) => void navigate({ to })

  // 카드와 같은 집계를 그대로 쓴다 — 줄의 숫자를 따로 만들면 운영자가 들어간 화면에서 어긋난다.
  // 목적지는 그 수를 실제로 보여주는 화면이어야 한다(`검수 대기 상품`을 '상품 카탈로그
  // 관리'로 보내면 모수가 다른 전수 목록에 떨어진다 — 그 수를 주는 쪽은 검토 큐다).
  const todoItems: DashboardTodo[] = [
    {
      key: 'inspections',
      label: '검수 대기 상품',
      detail: 'AI가 숨긴 뒤 운영자 확인이 남은 상품',
      count: pendingInspections,
      to: '/products/ai-queue',
    },
    {
      key: 'reports',
      label: '미처리 신고',
      detail: '접수 후 제재 판단이 남은 신고',
      count: openReports,
      to: '/reports',
    },
    {
      key: 'inquiries',
      label: '답변 대기 문의',
      detail: '운영자 답변을 기다리는 문의',
      count: receivedInquiries,
      to: '/inquiries',
    },
    {
      key: 'claims',
      label: '진행 중 클레임',
      detail: '운영자가 개입할 수 있는 취소/반품/교환',
      count: openClaims,
      to: '/claims',
    },
  ]

  const hasUnmeasured = [
    pendingApplications,
    todayOrderAmount,
    todayNewMembers,
    pendingInspections,
    openReports,
    receivedInquiries,
    openClaims,
  ].some(value => value == null)

  return (
    <div className="p-6">
      <PageIntro title="대시보드" description="플랫폼 운영 지표를 한눈에 봐요." />

      {/* 줄표는 0과 구별돼야 뜻이 산다 — 그 사유를 적는 자리가 여기다. 칸이 전부 실 집계라
          예시 데이터 띠는 붙이지 않는다(실데이터를 예시로 의심하게 만든다). */}
      {hasUnmeasured && !isFetching && (
        <Alert variant="warning" className="mb-5">
          숫자 대신 줄표({UNMEASURED})가 보이는 칸은 어드민 권한이 없거나 조회가 실패해서 셀 수
          없었던 거예요.
        </Alert>
      )}

      <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          label="오늘 신규 회원"
          value={peopleLabel(todayNewMembers)}
          icon={<Users className="size-full" />}
          // 관리자 계정은 빠진 수다(서버 조회가 일반 회원만 본다). 누르는 자리를 두지 않은 이유는
          // 회원 관리 화면에 가입일 필터가 없어 이 수를 그대로 보여주는 목록이 없기 때문이다.
          footer="관리자 계정 제외"
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
          // 상품 카탈로그 관리가 아니라 AI 검수 큐로 보낸다 — 이 수를 주는 경로가
          // `GET /admin/product-inspections`이고 그 행만 보여주는 화면이 저기다(카탈로그는
          // 큐에 올라온 적 없는 상품까지 담아 모수가 다르다).
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
      </div>

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
      </Card>
    </div>
  )
}
