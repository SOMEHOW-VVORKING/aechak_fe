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

// 세션 만료(401 → refresh 실패) 시 앱이 전역으로 반응할 훅. 이 패키지는 라우터를 모르므로
// 직접 화면을 이동시키지 않고, 소비 앱(main.tsx)이 로그아웃·로그인 이동을 여기에 배선한다.
// 미등록이면 무동작이라 다른 앱(seller/admin)은 기존과 100% 동일하게 동작한다.
let onAuthExpired: (() => void) | null = null

export function setOnAuthExpired(handler: (() => void) | null): void {
  onAuthExpired = handler
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

// 진행 중인 refresh를 하나로 합치는 공유 Promise. 동시 401이 각자 refresh를 발사하면
// httpOnly refresh 쿠키가 회전(rotate)하면서 뒤늦은 refresh가 무효 쿠키로 실패해 멀쩡한
// 세션을 로그아웃시킬 수 있다 — 동시 401은 같은 refresh 결과를 기다리게 한다.
let refreshPromise: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axiosInstance
      .post<WebTokenResponse>('/auth/web/refresh')
      .then(response => response.data.data.accessToken)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
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
      const newToken = await refreshAccessToken()
      setAccessToken(newToken)
      // 재시도는 같은 config를 재사용하므로 이전(만료) 토큰이 Authorization에 그대로 남는다.
      // 요청 인터셉터는 헤더가 이미 있으면 덮지 않으니, 여기서 새 토큰으로 직접 갈아끼워야
      // 재시도가 성공한다(안 그러면 refresh가 성공해도 만료 토큰으로 재시도해 계속 401).
      if (config.headers) {
        config.headers.Authorization = `Bearer ${newToken}`
      }
    } catch {
      // refresh까지 실패 = 진짜로 세션이 없다. 토큰을 비우고 전역 핸들러(로그인 이동)를 깨운다.
      // 각 화면이 401을 인라인 에러로 떠안지 않고 여기 한 곳에서 로그인으로 튕기게 하는 지점이다.
      setAccessToken(null)
      onAuthExpired?.()
      return Promise.reject(error)
    }
    return axiosInstance(config)
  },
)

export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then(({ data }) => data as T)
}
