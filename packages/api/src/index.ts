export {
  API_PATH_PREFIX,
  axiosInstance,
  configureApiHosts,
  customInstance,
  getAccessToken,
  getApiBaseURL,
  restoreSession,
  setAccessToken,
  setOnAuthExpired,
  setOnOnboardingRequired,
} from './client'
export type { ApiHostConfig } from './client'
export * from './generated/api'
