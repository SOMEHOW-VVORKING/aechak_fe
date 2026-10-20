import { configureApiHosts, type ApiHostConfig } from './client'

// API 호스트 환경변수 검증 — 세 웹앱(web-buyer·web-seller·web-admin)의 main.tsx가 공유한다.
//
// 왜 있는가: 각 앱 main.tsx가 `import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080'`로
// 로컬 기본값으로 조용히 되돌아갔다. 운영 빌드에 변수가 주입되지 않으면 그 로컬 주소가 번들에
// 굳어, 배포된 앱이 브라우저에서 `http://localhost:8081`을 호출하고 ERR_CONNECTION_REFUSED로
// 전면 실패한다(2026-10-19 dev에서 셀러·어드민 양쪽 실측). 빌드도 테스트도 통과하고 배포 뒤에만
// 드러나는 종류라, 운영 빌드에서는 **부팅을 멈추고 무엇이 비었는지 밝히는** 쪽으로 바꿨다.
//
// 개발 빌드(`import.meta.env.PROD === false`)는 지금처럼 로컬 기본값을 쓴다 — `.env` 없이
// `pnpm dev`로 띄우는 흐름을 깨지 않는다.

/** 로컬 주소로 간주하는 호스트명. 운영 빌드에서 이 중 하나를 가리키면 그 자체가 결함이다. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])

/**
 * DNS 루트 표기(`localhost.`)와 대문자를 접은 뒤 판정한다. `new URL('https://localhost.:8081')`의
 * hostname은 `localhost.`라서 집합 비교만으로는 그대로 통과한다 — 가리키는 곳은 똑같이 사용자 PC다.
 * RFC 6761이 예약한 `.localhost` 하위 도메인(`api.localhost`)도 같은 이유로 막는다.
 */
function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return LOCAL_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost')
}

export interface ApiHostSpec {
  /** 환경변수 이름. 오류 문구에 그대로 실어 사람이 어디를 채워야 하는지 알게 한다. */
  name: string
  /** `import.meta.env`에서 읽은 값 그대로. 미주입이면 undefined, 빈 문자열로 주입될 수도 있다. */
  value: string | undefined
  /** 개발 빌드에서만 쓰는 로컬 기본값. 운영 빌드에서는 쓰지 않는다. */
  devFallback: string
}

export interface ResolveApiHostsOptions {
  /** 오류 문구에 싣는 앱 이름(예: `web-seller`). */
  app: string
  /** `import.meta.env.PROD`. true면 로컬 기본값을 쓰지 않고 검증을 강제한다. */
  isProd: boolean
  /** 인증·카탈로그·주문·presigned 발급을 담당하는 api 모듈. 세 앱 모두 필수다. */
  api: ApiHostSpec
  /** 셀러센터 전용. web-seller만 넘긴다. */
  seller?: ApiHostSpec
  /** 어드민 콘솔 전용. web-admin만 넘긴다. */
  admin?: ApiHostSpec
}

/** 검증 실패를 한 번에 모아 던진다 — 변수 하나를 고칠 때마다 다시 배포하지 않게. */
export class ApiHostConfigError extends Error {
  readonly problems: readonly string[]

  constructor(app: string, problems: readonly string[]) {
    super(
      `[${app}] API 호스트 환경변수가 올바르지 않아 앱을 시작할 수 없어요.\n` +
        problems.map(problem => `  - ${problem}`).join('\n'),
    )
    this.name = 'ApiHostConfigError'
    this.problems = problems
  }
}

/**
 * 한 변수를 검증하고 쓸 값을 돌려준다. 문제가 있으면 `problems`에 사람이 읽을 사유를 쌓는다.
 *
 * 검증 항목 넷:
 * ① 비어 있지 않다(미주입·빈 문자열·공백만 전부 결함).
 * ② `http`/`https` 스킴의 절대 URL이다(`api-dev.aechak.co.kr`처럼 스킴이 빠지면 axios가
 *    상대경로로 해석해 배포 도메인으로 요청을 보낸다).
 * ③ **origin이다** — 경로·쿼리·해시·자격증명이 붙어 있지 않다. 접두 `/api/v1`은 코드가 붙이므로
 *    env 값에 그것까지 넣으면 `/api/v1/api/v1`로 나간다(schema.yaml의 servers가 접두를 포함해
 *    적혀 있어 사람이 그대로 복사하기 쉬운 자리다).
 * ④ 운영 빌드인데 로컬 주소를 가리키지 않는다 — **이번 사고를 직접 잡는 항목이다.**
 */
function resolveOne(spec: ApiHostSpec, isProd: boolean, problems: string[]): string {
  const raw = spec.value?.trim() ?? ''
  if (raw === '') {
    if (!isProd) return spec.devFallback
    problems.push(`${spec.name}이(가) 비어 있어요. 배포 환경변수에 API origin을 넣어 주세요.`)
    return spec.devFallback
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    problems.push(
      `${spec.name}=${raw} 는 절대 URL이 아니에요. http:// 또는 https:// 로 시작하는 origin을 넣어 주세요.`,
    )
    return raw
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    problems.push(`${spec.name}=${raw} 의 스킴이 http/https가 아니에요.`)
    return raw
  }
  // 경로·쿼리·해시가 붙으면 접두가 그 뒤에 이어 붙는다 — `.../api/v1`을 넣으면 `/api/v1/api/v1`이고
  // `?foo=1`을 넣으면 접두가 쿼리 값 안으로 들어간다. 둘 다 조용히 전부 404가 된다.
  //
  // 쿼리·해시는 **원문 문자열**에서 구분자 유무로 본다. `https://api-dev.aechak.co.kr?`처럼 값이 없는
  // 구분자만 붙으면 `URL.search`·`URL.hash`가 빈 문자열이라 파싱 결과로는 구별되지 않는데,
  // withPrefix가 원문에 접두를 이어 붙여 `…?/api/v1`을 만든다(경로가 쿼리 안으로 들어간다).
  const extra = [
    parsed.pathname !== '/' && parsed.pathname !== '' ? `경로(${parsed.pathname})` : null,
    raw.includes('?') ? '쿼리' : null,
    raw.includes('#') ? '해시' : null,
    parsed.username !== '' || parsed.password !== '' ? '자격증명' : null,
  ].filter((part): part is string => part !== null)
  if (extra.length > 0) {
    problems.push(
      `${spec.name}=${raw} 에 ${extra.join(' / ')}가 붙어 있어요. origin만 넣어 주세요 — ` +
        `경로 접두 /api/v1은 코드가 붙이니 값에 함께 넣으면 /api/v1/api/v1로 나가요.`,
    )
    return raw
  }
  if (isProd && isLocalHostname(parsed.hostname)) {
    problems.push(
      `${spec.name}=${raw} 가 로컬 주소를 가리켜요. 배포 빌드에 그 값이 굳으면 브라우저가 ` +
        `사용자 PC로 요청을 보내 전부 실패해요(ERR_CONNECTION_REFUSED).`,
    )
  }
  // 통과한 값은 origin으로 정규화해 돌려준다 — 끝 슬래시 하나(`https://h/`)는 사람이 흔히 붙이는
  // 형태라 거절하지 않고 여기서 떼어낸다. 접두 조립이 원문 모양에 의존하지 않게 하는 지점이다.
  return parsed.origin
}

/**
 * 환경변수에서 호스트 설정을 만든다. 운영 빌드에서 문제가 있으면 `ApiHostConfigError`를 던진다.
 * 부수효과가 없어 테스트가 직접 부른다 — 화면에 그리고 부팅을 멈추는 일은 `bootstrapApiHosts`가 한다.
 */
export function resolveApiHosts(options: ResolveApiHostsOptions): ApiHostConfig {
  const { app, isProd, api, seller, admin } = options
  const problems: string[] = []
  const config: ApiHostConfig = {
    apiOrigin: resolveOne(api, isProd, problems),
    ...(seller ? { sellerOrigin: resolveOne(seller, isProd, problems) } : {}),
    ...(admin ? { adminOrigin: resolveOne(admin, isProd, problems) } : {}),
  }
  if (problems.length > 0) throw new ApiHostConfigError(app, problems)
  return config
}

// DOM의 최소 모양만 구조적으로 선언한다. 이 패키지는 apps/mobile(React Native)도 컴파일하는데
// 그쪽 tsconfig에는 `lib: dom`이 없어 전역 `document` 타입을 쓸 수 없다 — 쓰면 모바일 typecheck가
// 깨진다. 실제 브라우저 `document`가 이 모양을 구조적으로 만족한다.
interface MinimalElement {
  setAttribute(name: string, value: string): void
  style: { cssText: string }
  textContent: string | null
  append(...nodes: MinimalElement[]): void
  appendChild(node: MinimalElement): unknown
  replaceChildren(...nodes: MinimalElement[]): void
}

interface MinimalDocument {
  getElementById(id: string): MinimalElement | null
  createElement(tag: string): MinimalElement
  body: MinimalElement | null
}

// unknown을 한 번 거친다 — 이 패키지 자신의 tsconfig에는 `lib: dom`이 있어 전역 document가 실제
// Document 타입이고, 그쪽에서 좁은 구조 타입으로 바로 단정하면 "충분히 겹치지 않는다"로 거절된다.
const browserDocument = (): MinimalDocument | null =>
  (globalThis as unknown as { document?: MinimalDocument }).document ?? null

/**
 * 실패를 눈에 보이게 남긴다 — 콘솔만으로는 백지 화면과 구별되지 않는다.
 * design-system을 끌어오지 않고 DOM만 쓴다(이 패키지는 UI 라이브러리에 의존하지 않는다).
 */
function paintBootFailure(app: string, problems: readonly string[]): void {
  const document = browserDocument()
  if (!document) return
  const root = document.getElementById('root') ?? document.body
  if (!root) return
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.style.cssText =
    'margin:48px auto;max-width:640px;padding:24px;border:1px solid #d33;border-radius:12px;' +
    'font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#222;background:#fff'
  const title = document.createElement('p')
  title.style.cssText = 'margin:0 0 8px;font-weight:600;font-size:16px'
  title.textContent = '설정이 끝나지 않아 화면을 열 수 없어요'
  const hint = document.createElement('p')
  hint.style.cssText = 'margin:0 0 12px;color:#555'
  hint.textContent = `${app}의 API 호스트 환경변수를 배포 설정에 넣어 주세요.`
  const list = document.createElement('ul')
  list.style.cssText = 'margin:0;padding-left:20px;color:#b00'
  for (const problem of problems) {
    const item = document.createElement('li')
    item.textContent = problem
    list.appendChild(item)
  }
  box.append(title, hint, list)
  root.replaceChildren(box)
}

/**
 * 각 앱 main.tsx가 부팅에서 부르는 유일한 진입점 — 검증 + `configureApiHosts`를 함께 한다.
 * 운영 빌드에서 값이 잘못되면 화면과 콘솔에 사유를 남기고 **던져서 부팅을 멈춘다**(잘못된 호스트로
 * 반쯤 동작하는 앱을 띄우는 쪽이 더 나쁘다 — 사용자는 "로그인이 안 된다"만 보게 된다).
 */
export function bootstrapApiHosts(options: ResolveApiHostsOptions): void {
  try {
    configureApiHosts(resolveApiHosts(options))
  } catch (error) {
    if (error instanceof ApiHostConfigError) {
      console.error(error.message)
      paintBootFailure(options.app, error.problems)
    }
    throw error
  }
}
