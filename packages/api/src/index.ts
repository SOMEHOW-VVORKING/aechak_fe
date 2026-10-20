export {
  API_PATH_PREFIX,
  axiosInstance,
  configureApiHosts,
  customInstance,
  errorResponse,
  getAccessToken,
  getApiBaseURL,
  restoreSession,
  setAccessToken,
  setOnAuthExpired,
  setOnOnboardingRequired,
} from './client'
export type { ApiHostConfig, ErrorBody } from './client'
export { ApiHostConfigError, bootstrapApiHosts, resolveApiHosts } from './env'
export type { ApiHostSpec, ResolveApiHostsOptions } from './env'
export * from './generated/api'
