import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'

/** 서버 API 경로 접두 — 서버 계약이라 origin(env)과 분리해 상수로 고정한다. */
export const API_PATH_PREFIX = '/api/v1'

export const axiosInstance = axios.create({
  baseURL: `http://localhost:8080${API_PATH_PREFIX}`, // origin은 각 앱 main에서 env로 덮는다
  withCredentials: true, // refresh가 httpOnly 쿠키로 오가므로 요청에 쿠키를 동봉한다
  headers: {
    'Content-Type': 'application/json',
  },
})

// access token은 메모리에만 둔다(스토리지 저장 금지 — XSS 노출면 축소).
// 새로고침으로 날아가면 아래 401 인터셉터의 refresh가 세션을 복원한다.
let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

axiosInstance.interceptors.request.use(config => {
  if (accessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

interface WebTokenResponse {
  data: { accessToken: string; tokenType: string; expiresIn: number }
}

// 401 → 쿠키로 refresh 1회 → 새 access 저장 후 원 요청 재시도.
// auth 경로 자체의 401과 이미 재시도한 요청은 그대로 실패시킨다(루프 방지).
const retriedRequests = new WeakSet<object>()

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error)
    }
    const config = error.config
    if (!config || (config.url?.startsWith('/auth/') ?? false) || retriedRequests.has(config)) {
      return Promise.reject(error)
    }
    retriedRequests.add(config)
    try {
      const { data } = await axiosInstance.post<WebTokenResponse>('/auth/web/refresh')
      setAccessToken(data.data.accessToken)
    } catch {
      setAccessToken(null)
      return Promise.reject(error)
    }
    return axiosInstance(config)
  },
)

export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then(({ data }) => data as T)
}
