// 로그인 뒤 다시 실행(A26)할 대기 행동. 로그인은 window.location.href로 페이지 전체를 이동하고 서버는
// 돌아올 주소로 /login/complete만 받으므로, 메모리가 아니라 같은 출처 sessionStorage에 보관한다.
// 접근이 막힌 환경(사파리 프라이빗 등)에서도 화면이 깨지지 않게 읽기와 쓰기를 모두 try/catch로 감싼다.

/**
 * follow, repost, save, like는 켜기 요청으로 다시 보내고 block, mute는 시트만 다시 연다. open은 돌아올 경로만 쓴다.
 * compose는 대상 없는 글쓰기다(publicId는 빈 문자열). 돌아온 SNS 탭이 작성 화면을 다시 연다(SNS-02 A26).
 * repost, save, like의 대상은 게시물 publicId다(SNS-03 design 6절 10번, SNS-04 design 6절 10번).
 * report는 신고 시트만 다시 열고 자동으로 제출하지 않는다. 대상은 게시물이나 사용자 publicId다(SNS-07 A26).
 */
export type PendingActionKind = 'follow' | 'block' | 'mute' | 'open' | 'compose' | 'repost' | 'save' | 'report' | 'like'

export interface PendingAction {
  kind: PendingActionKind
  publicId: string
  /** 로그인 뒤 돌아갈 같은 출처 경로(path + search) */
  returnTo: string
  createdAt: number
}

const STORAGE_KEY = 'aechak.pendingAction'
const TTL_MS = 10 * 60 * 1000

// 같은 출처 경로만 받는다(//evil.com 같은 프로토콜 상대 주소로 열린 리다이렉트가 되지 않게).
function isSafePath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
}

export function savePendingAction(action: Omit<PendingAction, 'createdAt'>): void {
  if (!isSafePath(action.returnTo)) return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...action, createdAt: Date.now() }))
  } catch {
    // 저장하지 못하면 로그인 뒤 다시 실행만 빠진다.
  }
}

export function clearPendingAction(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 무시
  }
}

/** 만료되지 않은 대기 행동을 읽는다(지우지 않는다). 만료됐거나 깨진 값이면 지우고 null. */
export function peekPendingAction(): PendingAction | null {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (raw == null) return null
  try {
    const value = JSON.parse(raw) as Partial<PendingAction>
    if (
      typeof value.kind === 'string' &&
      typeof value.publicId === 'string' &&
      isSafePath(value.returnTo) &&
      typeof value.createdAt === 'number' &&
      Date.now() - value.createdAt < TTL_MS
    ) {
      return value as PendingAction
    }
  } catch {
    // 깨진 값은 아래에서 지운다.
  }
  clearPendingAction()
  return null
}

/** publicId 대상의 대기 행동을 꺼내고 지운다(한 번만 실행되게). 다른 대상이면 그대로 둔다. */
export function takePendingAction(publicId: string): PendingAction | null {
  const action = peekPendingAction()
  if (action?.publicId !== publicId) return null
  clearPendingAction()
  return action
}

/** 대상 없는 글쓰기 대기 행동을 꺼내고 지운다. 글쓰기가 아니면 그대로 두고 false다. */
export function takeComposeAction(): boolean {
  if (peekPendingAction()?.kind !== 'compose') return false
  clearPendingAction()
  return true
}

/**
 * 로그인을 마친 뒤 돌아갈 경로. 행동이 없는 open은 여기서 지우고, 나머지는 돌아간 화면이 꺼내 실행한다.
 * 기존 사용자는 /login/complete, 신규 사용자는 온보딩 마지막 단계(닉네임)를 마친 뒤 부른다.
 */
export function resumeReturnPath(): string | null {
  const action = peekPendingAction()
  if (action?.kind === 'open') clearPendingAction()
  return action?.returnTo ?? null
}
