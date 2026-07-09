import { useState, type ComponentType } from 'react'
import {
  ShoppingBag,
  Package,
  Truck,
  XCircle,
  RotateCcw,
  Repeat,
  MessageCircle,
  Wallet,
  ShieldCheck,
} from 'lucide-react'
import {
  MetricCard,
  PageHeader,
  Select,
  Toggle,
  StatusPill,
  Skeleton,
  EmptyState,
  Card,
} from '@aechak/design-system/web'
import { useDashboardSummary } from '../dashboard.queries'
import type { DashboardMetricIcon, DashboardPeriod } from '../dashboard.mock'

const metricIcons: Record<DashboardMetricIcon, ComponentType<{ className?: string }>> = {
  'shopping-bag': ShoppingBag,
  package: Package,
  truck: Truck,
  'x-circle': XCircle,
  'rotate-ccw': RotateCcw,
  repeat: Repeat,
  'message-circle': MessageCircle,
}

const periodOptions: { value: DashboardPeriod; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: '7d', label: '최근 7일' },
  { value: '30d', label: '최근 30일' },
  { value: '90d', label: '최근 90일' },
]

export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('all')
  const { data, isLoading } = useDashboardSummary(period)
  const [urgentOnly, setUrgentOnly] = useState(false)

  return (
    <div className="p-6">
      <PageHeader
        title="대시보드"
        actions={
          <>
            <Select
              options={periodOptions}
              value={period}
              onChange={value => setPeriod(value as DashboardPeriod)}
              className="w-[140px]"
            />
            <Toggle checked={urgentOnly} onChange={setUrgentOnly} label="긴급만" />
          </>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="h-24" />
          ))}
        </div>
      ) : !data || data.metrics.length === 0 ? (
        <EmptyState
          title="표시할 데이터가 없습니다."
          description="선택한 기간에 발생한 활동이 없어요."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {data.metrics
              .filter(metric => !urgentOnly || metric.variant === 'urgent')
              .map(metric => {
                const Icon = metricIcons[metric.icon]
                return (
                  <MetricCard
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    icon={<Icon className="size-full" />}
                    variant={metric.variant}
                    className="flex-auto basis-[210px]"
                    footer={
                      <div className="flex flex-col gap-0.5">
                        {metric.footer.pillVariant ? (
                          <StatusPill variant={metric.footer.pillVariant} size="sm">
                            {metric.footer.label}
                          </StatusPill>
                        ) : (
                          <span>{metric.footer.label}</span>
                        )}
                        {metric.trend && (
                          <span
                            className={`text-badge font-medium ${
                              metric.trend.direction === 'up' ? 'text-success-fg' : 'text-error-fg'
                            }`}
                          >
                            {metric.trend.direction === 'up' ? '▲' : '▼'}
                            {metric.trend.percent}%
                          </span>
                        )}
                      </div>
                    }
                  />
                )
              })}
          </div>

          <div className="mt-3 grid grid-cols-[1.3fr_1fr] gap-3">
            <MetricCard
              variant="quiet"
              label="정산 예정 금액"
              icon={<Wallet className="size-full" />}
              value={`${data.settlement.totalAmount.toLocaleString('ko-KR')}원`}
              footer={
                <div className="flex gap-3.5">
                  <span>
                    정산 대기{' '}
                    <strong className="text-text-secondary">
                      {data.settlement.pendingAmount.toLocaleString('ko-KR')}원
                    </strong>
                  </span>
                  <span>
                    정산 보류{' '}
                    <strong className="text-warning-fg">
                      {data.settlement.onHoldAmount.toLocaleString('ko-KR')}원
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
                {data.productStatuses.map(status => (
                  <StatusPill key={status.key} variant={status.variant} size="sm" dot>
                    {status.label} {status.count}
                  </StatusPill>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
