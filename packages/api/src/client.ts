import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** refresh 실패를 오류로 반환하되 소비 앱의 전역 로그인 이동은 실행하지 않는다. */
    suppressAuthExpiredRedirect?: boolean
    /**
     * 401 refresh 재시도를 1회로 묶는 내부 표식. WeakSet만으로는 제한되지 않는다 —
     * axios는 request()마다 `mergeConfig(defaults, config)`로 새 config 객체를 만들어
     * (`Axios.js:92` → `mergeConfig.js:26`의 `Object.create(null)`) 재시도의 두 번째 401이
     * WeakSet에 없는 객체로 돌아오기 때문이다. mergeConfig는 모르는 키를 그대로 옮기므로
     * (`mergeConfig.js:137`) 이 불리언은 재시도 뒤에도 살아남아 실제로 1회를 보장한다.
     */
    authRetried?: boolean
    /**
     * 이 요청을 기능 호스트 분기에서 빼고 반드시 api 모듈로 보낸다. 경로만으로는 "호출부가
     * api를 콕 집었다"를 표현할 수 없어서(mergeConfig가 defaults의 baseURL을 늘 채우므로
     * 명시 여부를 값으로 구분할 수 없다) 전용 표식을 둔다 — refresh가 이것을 쓴다.
     */
    forceApiHost?: boolean
  }
}

/** 서버 API 경로 접두 — 서버 계약이라 origin(env)과 분리해 상수로 고정한다. */
export const API_PATH_PREFIX = '/api/v1'

const withPrefix = (origin: string): string => `${origin.replace(/\/+$/, '')}${API_PATH_PREFIX}`

// BE는 실행 모듈이 셋이고 각각 호스트가 다르다 — api(인증·카탈로그·주문), seller(셀러센터),
// admin(어드민 콘솔). 인증 엔드포인트(/auth/*)는 api 모듈에만 있으므로 기본 호스트는 늘 api이고,
// 기능 경로만 요청 단위로 호스트를 바꾼다. 인스턴스를 복제하지 않는 이유는 accessToken·
// refreshPromise·전역 콜백이 이 모듈의 스코프 변수라서, 인스턴스를 늘리면 세션 상태가 갈리기 때문이다.
let apiBaseURL = withPrefix('http://localhost:8080')
let sellerBaseURL: string | null = null
let adminBaseURL: string | null = null

export interface ApiHostConfig {
  /** 인증·구매자 API origin (`/api/v1` 없이). 예: `http://localhost:8080` */
  apiOrigin: string
  /** 셀러센터 API origin. web-seller만 설정한다. */
  sellerOrigin?: string | undefined
  /** 어드민 API origin. web-admin만 설정한다. */
  adminOrigin?: string | undefined
}

/**
 * 앱 부트스트랩에서 한 번 호출해 호스트를 확정한다. 기능 호스트를 넘기지 않은 앱은
 * 경로 분기가 무동작이라 모든 요청이 api로 가므로, 기존 동작과 완전히 같다.
 */
export function configureApiHosts({ apiOrigin, sellerOrigin, adminOrigin }: ApiHostConfig): void {
  apiBaseURL = withPrefix(apiOrigin)
  sellerBaseURL = sellerOrigin == null || sellerOrigin === '' ? null : withPrefix(sellerOrigin)
  adminBaseURL = adminOrigin == null || adminOrigin === '' ? null : withPrefix(adminOrigin)
  axiosInstance.defaults.baseURL = apiBaseURL
}

/** 인증·로그인 리다이렉트 URL 조립처가 쓰는 api 호스트 base URL(접두 포함). */
export function getApiBaseURL(): string {
  return apiBaseURL
}

export const axiosInstance = axios.create({
  baseURL: apiBaseURL, // origin은 각 앱 main의 configureApiHosts가 덮는다
  withCredentials: true, // refresh가 httpOnly 쿠키로 오가므로 요청에 쿠키를 동봉한다
  headers: {
    'Content-Type': 'application/json',
  },
  // 배열 쿼리는 서버가 반복 파라미터(`?k=A&k=B`)를 기대한다(OpenAPI `explode: true`).
  // axios 기본값은 `k[]=A&k[]=B`라 BE 바인딩이 "지원하지 않는 값"으로 거절한다.
  paramsSerializer: { indexes: null },
})

// 셀러센터·어드민 모듈이 소유한 경로. 접두 경계(`=== p` 또는 `p + '/'`)로 판정해
// `/seller-applications-foo` 같은 다른 경로가 휩쓸리지 않게 한다.
const SELLER_PATH_PREFIXES = ['/sellers', '/seller-applications'] as const
const ADMIN_PATH_PREFIXES = ['/admin'] as const

const under = (path: string, prefix: string): boolean =>
  path === prefix || path.startsWith(`${prefix}/`)

/** 기능 호스트를 쓰는 앱인지 — 아니면 호스트 분기가 전부 무동작이라 기존 단일 호스트 동작과 같다. */
const hasFeatureHost = (): boolean => sellerBaseURL != null || adminBaseURL != null

/** 상대 경로의 pathname만 돌려준다. 절대 URL·프로토콜 상대 URL은 호스트를 손대지 않는다. */
function relativePathOf(url: string): string | null {
  if (url.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(url)) return null
  return url.split('?')[0]?.split('#')[0] ?? null
}

function routeToFeatureHost(config: InternalAxiosRequestConfig): void {
  // api 호스트를 콕 집은 요청은 경로가 무엇이든 그대로 api로 보낸다. 기능 호스트를 쓰지 않는
  // 앱(구매자 웹·모바일)에서는 baseURL을 손대지 않아야 한다 — 모바일은 configureApiHosts 없이
  // defaults.baseURL을 직접 덮으므로, 여기서 apiBaseURL을 씌우면 엉뚱한 origin으로 나간다.
  if (config.forceApiHost === true) {
    if (hasFeatureHost()) config.baseURL = apiBaseURL
    return
  }
  // 호출부가 api와 다른 호스트를 직접 지정했으면 그 선택을 존중한다. mergeConfig가 defaults의
  // baseURL을 늘 채우므로 "api를 명시했는지"는 값으로 못 가린다 — 그 경우가 forceApiHost다.
  if (config.baseURL !== apiBaseURL) return
  const path = config.url == null ? null : relativePathOf(config.url)
  if (path == null) return
  // 인증은 api 모듈만 노출한다 — seller·admin에는 `/auth/*`가 아예 없다.
  if (under(path, '/auth')) return
  if (sellerBaseURL != null && SELLER_PATH_PREFIXES.some(prefix => under(path, prefix))) {
    config.baseURL = sellerBaseURL
    return
  }
  if (adminBaseURL != null && ADMIN_PATH_PREFIXES.some(prefix => under(path, prefix))) {
    config.baseURL = adminBaseURL
    // 어드민 API는 bearer 전용이라 쿠키를 읽지 않고, CORS 설정에 allowCredentials가 없다.
    // credentials 모드로 보내면 서버가 Access-Control-Allow-Credentials를 주지 않아
    // 브라우저가 정상 응답까지 버린다 — 이 경로만 credentials를 끈다.
    config.withCredentials = false
  }
}

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
  routeToFeatureHost(config)
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
      // refresh 쿠키는 api 모듈이 `Path=/api/v1/auth`로 심으므로 기능 호스트(seller·admin)로
      // 나가면 그 경로가 없어 404다. 목적지를 표식으로 고정하고 credentials를 되살려,
      // 호스트 분기와 어드민의 credentials 차단을 둘 다 비껴간다.
      .post<WebTokenResponse>('/auth/web/refresh', undefined, {
        forceApiHost: true,
        withCredentials: true,
      })
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
    if (
      !config ||
      (config.url?.startsWith('/auth/') ?? false) ||
      config.authRetried === true ||
      retriedRequests.has(config)
    ) {
      return Promise.reject(error)
    }
    // 두 표식을 함께 세운다 — WeakSet은 같은 객체가 그대로 돌아오는 경로를, authRetried는
    // mergeConfig로 새로 복제된 config가 돌아오는 경로를 각각 막는다.
    config.authRetried = true
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
