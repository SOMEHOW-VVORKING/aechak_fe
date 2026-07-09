import { useQuery } from '@tanstack/react-query'
import { getDashboardSummaryMock, type DashboardPeriod, type DashboardSummary } from './dashboard.mock'

export const useDashboardSummary = (period: DashboardPeriod = 'all') =>
  useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', period],
    queryFn: () => Promise.resolve(getDashboardSummaryMock(period)),
  })
