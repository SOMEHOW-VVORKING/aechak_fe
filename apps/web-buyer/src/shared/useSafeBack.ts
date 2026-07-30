import { useNavigate, useRouter } from '@tanstack/react-router'

// 히스토리가 있으면 뒤로가기, 없으면(직접 URL 진입 등) 폴백 라우트로 이동하는 공용 뒤로가기 훅.
// full-bleed 화면 대부분이 같은 3줄 goBack을 복붙하던 것을 하나로 모은 것 —
// 폴백 목적지만 화면마다 다르므로 인자로 받는다.
//
// 폴백 타입: navigate의 옵션 타입에서 to는 그대로 두되(라우트 문자열 유지) params/search만
// 느슨한 객체로 연다 — from 없이 useNavigate를 부르면 기본 제네릭이 params/search를 "리듀서 함수"
// 타입으로 접어버려 `{ productId }` 같은 객체 리터럴을 거부하기 때문(호출부는 정적 리터럴만 넘긴다).
type NavigateArg = Parameters<ReturnType<typeof useNavigate>>[0]
export type SafeBackFallback = Omit<NavigateArg, 'params' | 'search'> & {
  params?: Record<string, unknown>
  search?: Record<string, unknown>
}

export function useSafeBack(fallback: SafeBackFallback): () => void {
  const navigate = useNavigate()
  const router = useRouter()
  return () => {
    if (window.history.length > 1) router.history.back()
    else void navigate(fallback as unknown as NavigateArg)
  }
}
