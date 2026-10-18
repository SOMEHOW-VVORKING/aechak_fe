import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTerms, type TermItem } from '@aechak/api'
import { endServerSession, logout } from '@/shared/auth'
import { onWishlistLogout } from '@/shared/catalog'
import { resetReviews } from '@/shared/review'
import { resetCartSelection } from '@/shared/cart'
import { resetOrderAttempt } from '@/shared/order'

/**
 * 로그아웃(POST /auth/web/logout). 서버 세션 종료(RT 무효화 + 쿠키 만료 + access 파기)를 먼저 하고
 * 로컬 상태를 정리한다. endServerSession은 전송 실패를 삼키므로(멱등 204 계약) onSettled 한 곳에서
 * 마무리한다. 정리를 호출부 mutate 콜백이 아니라 여기 두는 이유는 응답 전에 화면을 떠나면 호출부 콜백은
 * 실행되지 않기 때문이다(useWithdraw와 같은 이유). 화면은 Modal 닫기·이동만 맡는다.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: endServerSession,
    onSettled: () => {
      logout()
      // 찜 미러/진행중 동기화/쿼리 캐시를 원자적으로 정리(공유 기기·재진입 대비)
      onWishlistLogout(queryClient)
      // 내가 쓴 리뷰는 서버 캐시가 아니라 클라이언트 스토어 싱글턴이라 queryClient.clear()로는
      // 안 지워진다 — 공유 기기에서 다음 사용자가 /reviews/mine에 들어가면 그대로 보인다.
      resetReviews()
      // 장바구니 선택 해제 집합·주문 시도(멱등키·주문그룹)도 계정 단위다
      resetCartSelection()
      resetOrderAttempt()
      // 계정 단위 서버 캐시(내 정보/적립금/펫 등)가 다음 사용자에게 새지 않게 전부 비운다.
      queryClient.clear()
    },
  })
}

// ── 동의 관리(약관 조회) ──────────────────────────────────────────────────────
// GET /terms(활성 약관 전체)만 실연동한다. 동의 변경은 BE ConsentService.submit이 온보딩 전용
// (ACTIVE 계정은 30004)이고 현재 동의 상태 조회 API도 없어 화면은 조회만 한다.

const CONSENT_TERMS_QUERY_KEY = ['settings', 'terms'] as const

/** 동의 관리 화면이 소비하는 약관 행. 서버 enum(type)은 문서 라우트 판정에만 쓰고 화면에는 내보내지 않는다. */
export interface ConsentTerm {
  termId: number
  isRequired: boolean
  title: string
  /** 'v1.0 · 2026.01.01 시행' 같은 표시용 문구 */
  meta: string
  /** 약관 전문을 볼 수 있는 앱 내 문서 라우트. 문서 화면이 있는 약관만 채운다. */
  route?: '/settings/privacy'
}

const kstDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function formatEffectiveAt(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = kstDate.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? ''
  return `${pick('year')}.${pick('month')}.${pick('day')}`
}

export function toConsentTerm(res: TermItem): ConsentTerm {
  const effective = formatEffectiveAt(res.effectiveAt)
  const term: ConsentTerm = {
    termId: res.termId,
    isRequired: res.isRequired,
    title: res.title,
    meta: effective ? `v${res.version} · ${effective} 시행` : `v${res.version}`,
  }
  // 문서 화면이 있는 항목(개인정보 처리방침)만 연결한다 — 없는 항목을 다른 문서로 보내면 오내비게이션이다.
  if (res.type === 'PRIVACY') term.route = '/settings/privacy'
  return term
}

export function useConsentTerms() {
  const query = useQuery({
    queryKey: CONSENT_TERMS_QUERY_KEY,
    queryFn: ({ signal }) => getTerms(signal),
  })
  const terms = (query.data?.data ?? []).map(toConsentTerm)
  return {
    requiredTerms: terms.filter(term => term.isRequired),
    optionalTerms: terms.filter(term => !term.isRequired),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
