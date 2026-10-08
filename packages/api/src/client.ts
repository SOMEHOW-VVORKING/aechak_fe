import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** refresh 실패를 오류로 반환하되 소비 앱의 전역 로그인 이동은 실행하지 않는다. */
    suppressAuthExpiredRedirect?: boolean
  }
}

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

// 온보딩 미완(PENDING) 계정이 화이트리스트 밖 경로를 부르면 서버가 403 errorCode 20006을 준다.
// 세션 만료와 달리 이건 로그인이 아니라 온보딩 화면으로 전역 유도해야 한다. setOnAuthExpired와
// 같은 결로, 라우터를 모르는 이 패키지는 핸들러만 호출하고 소비 앱(main.tsx)이 이동을 배선한다.
let onOnboardingRequired: (() => void) | null = null

export function setOnOnboardingRequired(handler: (() => void) | null): void {
  onOnboardingRequired = handler
}

/** 서버 실패 응답 본문(web-common ErrorResponse). 본문이 비어 오면(프록시 오류 등) 필드가 없다. */
export interface ErrorBody {
  errorCode?: number
  message?: string
}

/**
 * 실패 응답의 status·본문만 꺼낸다. 소비 앱이 axios 타입을 끌어오지 않고 errorCode로 분기하는 단일
 * 진입점. axios 에러가 아니거나 응답 자체가 없으면(네트워크 단절·취소) undefined.
 */
export function errorResponse(error: unknown): { status: number; data?: ErrorBody } | undefined {
  return axios.isAxiosError<ErrorBody | undefined>(error) ? error.response : undefined
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

/**
 * 메모리 access가 없을 때(새로고침/첫 진입) refresh 쿠키로 세션을 복원한다. 401 인터셉터와 같은
 * 공유 Promise를 타므로 진행 중인 refresh와 겹쳐도 쿠키 회전이 꼬이지 않는다. 실패(쿠키 없음/만료
 * = 401 20002, 재사용 = 401 20003, 네트워크)는 그대로 reject하고 전역 로그인 이동은 하지 않는다
 * — 호출부(라우트 가드)가 이동을 정한다.
 */
export async function restoreSession(): Promise<void> {
  setAccessToken(await refreshAccessToken())
}

// 401 → 쿠키로 refresh 1회 → 새 access 저장 후 원 요청 재시도.
// auth 경로 자체의 401과 이미 재시도한 요청은 그대로 실패시킨다(루프 방지).
const retriedRequests = new WeakSet<object>()

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: unknown) => {
    // 온보딩 미완(403/20006)은 전역 핸들러를 깨워 온보딩으로 유도하되, promise는 계속 reject한다
    // — 호출부(화면·쿼리)도 실패를 인지해 로딩/성공으로 새지 않게 한다.
    const failed = errorResponse(error)
    if (failed?.status === 403 && failed.data?.errorCode === 20006) {
      onOnboardingRequired?.()
    }
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
      if (!config.suppressAuthExpiredRedirect) onAuthExpired?.()
      return Promise.reject(error)
    }
    return axiosInstance(config)
  },
)

export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then(({ data }) => data as T)
}
