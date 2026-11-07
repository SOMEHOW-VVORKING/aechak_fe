import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSellerShippingPolicy,
  updateSellerShippingPolicy,
  type ShippingPolicyData,
  type ShippingPolicyUpdateRequest,
} from '@aechak/api'
import { appliedPolicy } from './shipping-policy.contract'

// 배송 정책(GET·PUT /sellers/me/shipping-policy, seller 호스트)을 실서버에 붙이는 얇은 어댑터.
// breeds·store-settings 관례대로 생성된 react-query 훅은 쓰지 않고 fetcher만 소비하고 이 파일이
// 자체 useQuery/useMutation으로 감싼다. fetcher가 `{ data }` 한 겹(ApiResponse)을 돌려주므로 벗긴다.
// 호스트는 공유 클라이언트가 경로 접두로 가른다 — `/sellers/**`는 seller 모듈(8081)이다.

export const SHIPPING_POLICY_QUERY_KEY = ['shipping-policy'] as const

/**
 * 저장한 적 없는 셀러도 컬럼 기본값을 받으므로 "정책 없음" 상태가 없다 — 404 정규화가 필요 없다.
 *
 * `staleTime`을 0으로 둔다(main.tsx 기본값 60초를 덮는다). 출고지 3필드는 스토어 설정의 주소와
 * 같은 서버 컬럼이라, 60초 안에 두 화면을 오가면 재조회가 아예 일어나지 않아 캐시된 옛 출고지가
 * 폼을 확정하고 전체 덮어쓰기 저장이 방금 바꾼 주소를 되돌린다.
 */
export function useShippingPolicy() {
  return useQuery({
    queryKey: SHIPPING_POLICY_QUERY_KEY,
    queryFn: ({ signal }) => getSellerShippingPolicy(signal).then(response => response.data),
    staleTime: 0,
  })
}

interface MutateOptions {
  onSuccess?: (applied: ShippingPolicyData) => void
  onError?: (error: unknown) => void
}

/**
 * 전체 덮어쓰기 저장(204, 응답 바디 없음).
 *
 * 바디가 없으니 저장 결과를 응답에서 받을 수 없다. 그렇다고 그냥 무효화만 하면 폼이 `!form`
 * 가드로 1회만 시드되는 구조라 서버가 버린 값(반품지 동일 체크 시의 반품지 3필드)이 화면에
 * 계속 남는다. 그래서 보낸 본문에 서버 규칙을 적용한 결과를 캐시에 심고(`appliedPolicy`)
 * 호출부에 넘겨 폼까지 되맞춘다. 무효화도 함께 걸어 서버가 실제로 들고 있는 값으로 수렴시킨다.
 */
export function useUpdateShippingPolicy() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (request: ShippingPolicyUpdateRequest) =>
      updateSellerShippingPolicy(request).then(() => appliedPolicy(request)),
    onSuccess: applied => {
      queryClient.setQueryData(SHIPPING_POLICY_QUERY_KEY, applied)
      return queryClient.invalidateQueries({ queryKey: SHIPPING_POLICY_QUERY_KEY })
    },
  })
  return {
    isPending: mutation.isPending,
    mutate: (request: ShippingPolicyUpdateRequest, opts?: MutateOptions) =>
      mutation.mutate(request, { onSuccess: opts?.onSuccess, onError: opts?.onError }),
  }
}
