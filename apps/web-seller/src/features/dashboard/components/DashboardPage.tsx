import { useState, type ComponentType } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  MessageCircle,
  Package,
  PackageCheck,
  Repeat,
  RotateCcw,
  ScanLine,
  Send,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react'
import {
  Alert,
  Card,
  EmptyState,
  MetricCard,
  PageHeader,
  Select,
  Skeleton,
  StatusPill,
} from '@aechak/design-system/web'
import { SERVER_CLAIMS_AVAILABLE, SERVER_ORDERS_AVAILABLE } from '@/shared/serverAvailability'
import { useDashboardSummary } from '../dashboard.queries'
import {
  DASHBOARD_METRICS,
  DASHBOARD_PERIOD_OPTIONS,
  DASHBOARD_PRODUCT_STATUSES,
  DASHBOARD_SECTIONS,
  formatWon,
  isSellerCenterForbidden,
  previousValueHint,
  type DashboardListScreen,
  type DashboardMetricIconKey,
  type DashboardMetricMeta,
  type DashboardMetricTarget,
  type SellerDashboardMetric,
  type SellerDashboardPeriod,
} from '../dashboard.contract'

const metricIcons: Record<DashboardMetricIconKey, ComponentType<{ className?: string }>> = {
  'shopping-bag': ShoppingBag,
  package: Package,
  truck: Truck,
  'x-circle': XCircle,
  'rotate-ccw': RotateCcw,
  repeat: Repeat,
  'scan-line': ScanLine,
  'package-check': PackageCheck,
  send: Send,
  'message-circle': MessageCircle,
}

export function DashboardPage() {
  const [period, setPeriod] = useState<SellerDashboardPeriod>('all')
  const { data, error, isPending, isError, refetch } = useDashboardSummary(period)
  const navigate = useNavigate()

  /**
   * 목적지 목록이 열려 있는지. 라우트 게이트와 **같은 상수**를 본다(`shared/serverAvailability`) —
   * 여기서 따로 판단하면 "카드를 누르면 목록이 열려요"라고 안내하고 "준비 중" 화면으로 보내는
   * 죽은 진입점이 생긴다. 목록이 실서버에 붙는 순간 카드가 저절로 눌리기 시작한다.
   */
  const listAvailable: Record<DashboardListScreen, boolean> = {
    '/orders': SERVER_ORDERS_AVAILABLE,
    '/claims': SERVER_CLAIMS_AVAILABLE,
  }
  const anyListAvailable = Object.values(listAvailable).some(Boolean)

  /**
   * 카드 → 목록 이동. 단계·상태 축만 싣고 **기간은 싣지 않는다**(dashboard.contract의
   * DashboardMetricTarget 주석 참고 — 두 화면의 기간 단위가 달라 함께 넘기면 숫자가 어긋난다).
   *
   * 목적지 라우트(`/orders`·`/claims`)가 아직 `validateSearch`를 선언하지 않아 타입 레벨에서
   * 그 라우트의 search 스키마가 빈 객체다 — 그래서 단언 없이는 쿼리를 실을 수 없다. 런타임은
   * 라우터의 stringifySearch가 넘긴 객체를 그대로 직렬화하므로 동작하고, 두 라우트가 실서버에
   * 붙으면서 `validateSearch`를 선언하면 이 단언을 지우고 타입 추론에 맡길 수 있다
   * (그때 쿼리 이름이 어긋나 있으면 여기서 타입 오류로 드러난다). 단언은 이 한 곳에만 둔다.
   */
  const openList = (target: DashboardMetricTarget) => {
    const options = { to: target.screen, search: target.search } as unknown as Parameters<
      typeof navigate
    >[0]
    void navigate(options)
  }

  // 자격 거절(403)은 재시도로 풀리지 않는다 — 캐시된 숫자를 남겨 두면 권한이 아직 있는 것처럼
  // 읽히고 재시도 버튼은 영원히 실패한다. 그래서 데이터 유무와 무관하게 이 안내가 먼저 이긴다.
  if (isError && isSellerCenterForbidden(error)) {
    return (
      <div className="p-6">
        <PageHeader title="대시보드" />
        <EmptyState
          title="셀러센터를 열 수 없어요"
          description="셀러 자격이 정지되거나 탈퇴 처리된 계정이에요. 다시 이용하려면 고객센터에 문의해 주세요."
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader
        title="대시보드"
        actions={
          <Select
            aria-label="기간"
            options={DASHBOARD_PERIOD_OPTIONS}
            value={period}
            onChange={value => setPeriod(value as SellerDashboardPeriod)}
            className="w-[140px]"
          />
        }
      />

      <p className="-mt-3 mb-4 text-body-sm text-text-secondary">
        처리 대기 건수는 고른 기간을 따르고 아래 지금 기준 스냅샷은 기간과 무관해요.{' '}
        {anyListAvailable
          ? '카드를 누르면 그 단계의 목록이 열려요.'
          : '목록 화면이 준비되면 카드를 눌러 그 단계의 목록을 열 수 있어요.'}
        {/* 목록으로 넘어갈 수 없는 동안은 두 화면의 숫자가 어긋날 일도 없다 — 안내하지 않는다. */}
        {anyListAvailable && period !== 'all' && (
          <>
            {' '}
            <strong className="text-text-primary">
              기간은 목록에 넘기지 않아서 목록이 카드보다 많이 보일 수 있어요.
            </strong>{' '}
            목록 필터는 날짜 단위라 카드의 시각 단위 기간을 그대로 재현할 수 없어요.
          </>
        )}
        {period !== 'all' && (
          <>
            {' '}
            직전 기간 숫자는 그 기간 끝에 남아 있던 잔량이 아니라, 그 기간에 들어온 건 가운데 지금도
            같은 단계인 건수예요.
          </>
        )}
      </p>

      {/* 재조회만 실패한 경우 — 이미 그린 숫자를 지우지 않고 그 숫자가 방금 것이 아님을 밝힌다.
          첫 조회 실패는 아래 EmptyState가 받는다(안내가 두 번 나오지 않게 경우를 가른다). */}
      {isError && data && (
        <Alert variant="warning" className="mb-4">
          방금 집계를 새로 불러오지 못해서 직전에 받은 숫자를 보여주고 있어요.
        </Alert>
      )}

      {isPending ? (
        <div className="flex flex-wrap gap-3">
          {DASHBOARD_METRICS.map(meta => (
            <Skeleton key={meta.key} className="h-[92px] flex-auto basis-[210px]" />
          ))}
        </div>
      ) : !data ? (
        // 화면 전체가 이 한 쿼리에 달려 있어 백지로 두지 않는다. 빈 상태 문구로 떨어지면
        // "대기 건이 없다"와 "불러오지 못했다"가 구분되지 않으므로 실패임을 밝히고 재시도를 준다.
        <EmptyState
          title="집계를 불러오지 못했어요"
          description="네트워크 상태를 확인한 뒤 다시 불러와 주세요."
          action={{ label: '다시 불러오기', onClick: () => void refetch() }}
        />
      ) : (
        <>
          {DASHBOARD_SECTIONS.map(section => {
            const metrics = DASHBOARD_METRICS.filter(meta => meta.section === section.key)
            if (metrics.length === 0) return null
            return (
              <section key={section.key} className="mb-5">
                <div className="mb-2">
                  <h2 className="text-label font-semibold text-text-primary">{section.title}</h2>
                  {section.description && (
                    <p className="mt-0.5 text-caption text-text-tertiary">{section.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {metrics.map(meta => (
                    <DashboardMetricTile
                      key={meta.key}
                      meta={meta}
                      metric={data.metrics[meta.key]}
                      period={period}
                      listAvailable={listAvailable}
                      onOpen={openList}
                    />
                  ))}
                </div>
              </section>
            )
          })}

          {/* 정산 요약과 상품 상태는 서버가 기간 필터를 받지 않는 현재 스냅샷이다 — 기간을 따르는
              위 카드들과 섞이면 셀러가 같은 기간의 값으로 읽는다. 그래서 묶음 제목으로 가른다. */}
          <section>
            <div className="mb-2">
              <h2 className="text-label font-semibold text-text-primary">지금 기준 스냅샷</h2>
              <p className="mt-0.5 text-caption text-text-tertiary">
                기간 필터를 따르지 않아요. 기간을 바꿔도 이 값은 그대로예요.
              </p>
            </div>
            <div className="grid grid-cols-[1.3fr_1fr] gap-3">
              <MetricCard
                variant="quiet"
                label="정산 예정 금액"
                icon={<Wallet className="size-full" />}
                value={formatWon(data.settlement.totalAmount)}
                footer={
                  <div className="flex gap-3.5">
                    <span>
                      정산 대기{' '}
                      <strong className="text-text-secondary">
                        {formatWon(data.settlement.pendingAmount)}
                      </strong>
                    </span>
                    <span>
                      정산 보류{' '}
                      <strong className="text-warning-fg">
                        {formatWon(data.settlement.onHoldAmount)}
                      </strong>
                    </span>
                  </div>
                }
              />
              <Card padding="md" className="flex flex-col gap-2">
                <div className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
                  <ShieldCheck className="size-3.5 flex-none" />
                  상품 상태
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DASHBOARD_PRODUCT_STATUSES.map(status => (
                    <StatusPill key={status.key} variant={status.variant} size="sm" dot>
                      {status.label} {data.productStatuses[status.key].toLocaleString('ko-KR')}
                    </StatusPill>
                  ))}
                </div>
                {/* 네 건수는 서로 배타적이지 않다 — 중지된 상품의 재고가 0이면 두 칸에 함께 센다. */}
                <p className="text-caption text-text-tertiary">
                  판매 중지 상품이 품절이면 두 칸에 함께 집계돼요. 합이 상품 수와 다를 수 있어요.
                </p>
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

interface DashboardMetricTileProps {
  meta: DashboardMetricMeta
  metric: SellerDashboardMetric
  period: SellerDashboardPeriod
  listAvailable: Record<DashboardListScreen, boolean>
  onOpen: (target: DashboardMetricTarget) => void
}

function DashboardMetricTile({
  meta,
  metric,
  period,
  listAvailable,
  onOpen,
}: DashboardMetricTileProps) {
  const Icon = metricIcons[meta.icon]
  const hint = previousValueHint(metric, period, meta.axis)

  // 목적지 목록이 아직 목업 차단 상태면 누를 수 없게 둔다 — 누르면 "준비 중" 안내만 나오는
  // 죽은 진입점이 된다. 숫자 자체는 그대로 쓸모가 있으므로 카드는 평소대로 그린다.
  const target = meta.target != null && listAvailable[meta.target.screen] ? meta.target : null

  // supported=false는 "0건"이 아니라 "아직 집계할 수 없다"는 뜻이다 — 숫자를 쓰면 건수가 없다는
  // 뜻과 구분되지 않는다. 목적지도 없어 누를 수 없는 카드로 둔다(quiet).
  if (!metric.supported) {
    return (
      <MetricCard
        variant="quiet"
        label={meta.label}
        value="—"
        icon={<Icon className="size-full" />}
        className="flex-auto basis-[210px]"
        footer={
          <StatusPill variant="muted" size="sm">
            집계 준비 중
          </StatusPill>
        }
      />
    )
  }

  return (
    <MetricCard
      label={meta.label}
      value={metric.value.toLocaleString('ko-KR')}
      icon={<Icon className="size-full" />}
      variant={meta.urgent ? 'urgent' : 'default'}
      className="flex-auto basis-[210px]"
      onClick={target ? () => onOpen(target) : undefined}
      footer={
        <div className="flex flex-col gap-0.5">
          {meta.urgent ? (
            <StatusPill variant="warning" size="sm">
              {meta.nextAction}
            </StatusPill>
          ) : (
            <span>{meta.nextAction}</span>
          )}
          {hint && <span className="text-badge text-text-tertiary">{hint}</span>}
        </div>
      }
    />
  )
}
