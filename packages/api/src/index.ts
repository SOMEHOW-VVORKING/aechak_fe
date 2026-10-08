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
export * from './generated/api'
