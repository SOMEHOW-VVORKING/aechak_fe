import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  demoteAdmin,
  getAdminRoster,
  promoteAdmin,
  type AdminRosterListData,
  type AdminRosterSummary,
  type UserStatus,
} from '@aechak/api'

// 관리자 명부 3종(목록·승격·강등)을 실서버에 붙이는 얇은 어댑터. 생성된 react-query 훅이 아니라
// fetcher만 소비하고 이 파일이 자체 useQuery/useMutation으로 감싼다(AGENTS 6-2).
// 서버 enum(UserStatus)과 와이어 필드명은 이 feature 안에 가둔다.

export type { AdminRosterSummary } from '@aechak/api'

export const ADMIN_ROSTER_QUERY_KEY = ['admin', 'admins'] as const

/** 서버 기본값과 같은 페이지 크기(BE PageQuery). 서버는 1~100으로 절삭하고 음수 page는 0으로 올린다. */
export const DEFAULT_PAGE_SIZE = 20

export interface AdminRosterResult {
  rows: AdminRosterSummary[]
  totalCount: number
  isLoading: boolean
  isError: boolean
  error: unknown
}

/** 정렬은 서버가 가입 순(userId 오름차순)으로 고정한다 — 여기서 다시 정렬하지 않는다. */
export function useAdminRoster(page: number): AdminRosterResult {
  const query = useQuery<AdminRosterListData>({
    queryKey: [...ADMIN_ROSTER_QUERY_KEY, 'list', page],
    queryFn: ({ signal }) =>
      getAdminRoster({ page, size: DEFAULT_PAGE_SIZE }, signal).then(response => response.data),
    // 페이지를 넘기는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
  return {
    rows: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * 승격. 204 본문 없음이라 낙관적 갱신이 아니라 무효화 후 재조회로 반영한다.
 * 실패해도 무효화하는 이유는 409(이미 관리자)가 "화면이 낡았다"는 신호라 그 자리에서 최신 명부를
 * 다시 받아야 하기 때문이다.
 */
export function usePromoteAdmin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => promoteAdmin({ userId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ADMIN_ROSTER_QUERY_KEY }),
  })
}

/** 강등. 멱등(이미 일반 회원이어도 204)이다. */
export function useDemoteAdmin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => demoteAdmin(userId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ADMIN_ROSTER_QUERY_KEY }),
  })
}

// ─── 표시 매핑 ───────────────────────────────────────────────────────────────

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  PENDING_ONBOARDING: '온보딩 전',
  ACTIVE: '활성',
  SUSPENDED: '정지',
  WITHDRAWN: '탈퇴',
}

/** 온보딩 전 계정은 nickname이 null이다 — 화면이 식별자로 쓸 수 없어 id를 표시명으로 쓴다. */
export function adminDisplayName(admin: AdminRosterSummary): string {
  return admin.nickname ?? `이름 없는 계정 (${admin.userId})`
}

/** `joinedAt`은 오프셋 없는 LocalDateTime이다. 가입 시각이며 승격 시각이 아니다. */
export function formatJoinedAt(joinedAt: string): string {
  return joinedAt.slice(0, 10).replace(/-/g, '.')
}

/**
 * access 토큰 수명 — 권한 변경이 반영되기까지의 최대 대기 시간이다.
 * BE `auth.token.access-ttl`이 boot/api·boot/admin·boot/seller 모두 `30m`이다.
 */
export const ACCESS_TOKEN_TTL_MINUTES = 30

/**
 * 권한 변경이 언제 반영되는지 — 화면에 고정으로 두는 안내다(지우지 말 것).
 *
 * 역할은 상태와 달리 매 요청 DB를 보지 않는다. 게이트는 access 토큰에 박힌 role을 읽고,
 * 그 role은 토큰을 발급·갱신하는 순간의 DB 값이다(BE `TokenService.currentRole`이
 * `UserRoleReader.roleOf`로 DB를 다시 읽는다 — 회전과 유예 재발급 모두 access를 현재 역할로 굽는다).
 *
 * 그래서 승격도 강등도 **재로그인이 아니라 다음 토큰 갱신에서** 반영된다. 대기 시간은 지금 쥔
 * access 토큰의 남은 수명뿐이라 최대 {@link ACCESS_TOKEN_TTL_MINUTES}분이고, 그 계정이 다시
 * 로그인하면 그 자리에서 새 역할로 발급된다.
 *
 * 특히 강등을 "토큰 만료까지 관리자로 통과한다"고 읽으면 안 된다 — refresh 수명(7일)이 아니라
 * 30분 안에 끊긴다. 정지·탈퇴는 이것과 또 달라서 상태 필터(`UserStatusFilter`)가 매 요청
 * DB를 보므로 즉시 막힌다.
 */
export const ROLE_PROPAGATION_NOTICE =
  `권한 변경은 그 계정이 다음에 토큰을 갱신할 때 반영돼요. 승격도 강등도 다시 로그인할 필요는 없고, 이미 발급된 토큰이 남아 최대 ${ACCESS_TOKEN_TTL_MINUTES}분 걸려요. 그 계정이 다시 로그인하면 바로 반영돼요.`

// axios 타입을 안 끌어오려고 duck-typing(web-seller·seller-applications 관례). 본문은 `{ errorCode, message }`.
const errorCodeOf = (error: unknown): number | undefined =>
  (error as { response?: { data?: { errorCode?: number } } }).response?.data?.errorCode

const LIST_ERROR: Record<number, string> = {
  20004: '로그인이 필요해요. 다시 로그인해 주세요.',
  // 로그인 자체는 역할을 보지 않는다 — 권한 없는 계정도 토큰을 받고 여기서 막힌다.
  20011: '관리자 권한이 없는 계정이에요. 관리자 계정으로 다시 로그인해 주세요.',
  20005: '이용이 제한된 계정이에요.',
}

export function rosterErrorMessage(error: unknown): string {
  const code = errorCodeOf(error)
  return (
    (code !== undefined && LIST_ERROR[code]) || '관리자 명부를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
  )
}

/**
 * 다시 로그인해야 풀리는 실패인가.
 *
 * 403/20011(비ADMIN 토큰)·403/20005(정지 계정)은 재시도로 풀리지 않고, 세션 만료 전역 이동
 * (setOnAuthExpired)도 깨우지 않는다 — 401이 아니기 때문이다. 화면이 재로그인을 안내하면서 갈
 * 수단을 함께 주지 않으면 운영자가 주소를 직접 쳐야 복구된다.
 */
export function needsRelogin(error: unknown): boolean {
  const code = errorCodeOf(error)
  return code === 20004 || code === 20005 || code === 20011
}

const PROMOTE_ERROR: Record<number, string> = {
  90001: '사용자 id를 확인해 주세요.',
  30000: '그 id의 계정을 찾을 수 없어요.',
  30012: '이미 관리자인 계정이에요. 명부를 새로고침해 주세요.',
  // 서버는 ACTIVE 계정만 승격한다 — 정지·온보딩 미완은 409/30017이다(계약 초안의 30015가 아니다).
  30017: '활성 상태인 계정만 관리자로 승격할 수 있어요.',
  30014: '자기 자신의 역할은 바꿀 수 없어요. 다른 관리자에게 요청해 주세요.',
}

export function promoteErrorMessage(error: unknown): string {
  const code = errorCodeOf(error)
  return (code !== undefined && PROMOTE_ERROR[code]) || '승격하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

const DEMOTE_ERROR: Record<number, string> = {
  30000: '그 계정을 찾을 수 없어요. 명부를 새로고침해 주세요.',
  // 관리자가 0명이 되면 어드민 전 EP가 20011로 막히고 복구 경로가 DB 직접 조작뿐이라 서버가 막는다.
  30013: '마지막 관리자는 강등할 수 없어요. 다른 관리자를 먼저 추가해 주세요.',
  30014: '자기 자신의 역할은 바꿀 수 없어요. 다른 관리자에게 요청해 주세요.',
}

export function demoteErrorMessage(error: unknown): string {
  const code = errorCodeOf(error)
  return (code !== undefined && DEMOTE_ERROR[code]) || '강등하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/** 입력칸이 받는 것은 내부 숫자 id다(공개 식별자가 없다). 숫자가 아니면 보내지 않는다. */
export function parseUserId(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
