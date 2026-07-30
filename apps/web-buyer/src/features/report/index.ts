export { ProductReportScreen } from './components/ProductReportScreen'
export {
  PRODUCT_REPORT_REASONS,
  MAX_REPORT_DETAIL_LENGTH,
  isValidReportReason,
  getReportTargetMock,
  fetchReportTarget,
} from './report.mock'
export type { ReportTarget } from './report.mock'
export { useSubmitReport, useReportTarget } from './report.queries'
export type { SubmitReportInput } from './report.queries'
