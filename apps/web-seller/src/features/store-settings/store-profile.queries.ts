import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSellerStore,
  updateSellerStore,
  type StoreData,
  type StoreSettingsData,
  type StoreSettingsUpdateRequest,
} from '@aechak/api'
import { appliedStore } from './store-profile.contract'

// 스토어 설정(GET·PUT /sellers/me/store, seller 호스트)을 실서버에 붙이는 얇은 어댑터.
// shipping-policy 관례대로 생성된 react-query 훅은 쓰지 않고 fetcher만 소비하고 이 파일이
// 자체 useQuery/useMutation으로 감싼다. fetcher가 `{ data }` 한 겹(ApiResponse)을 돌려주므로 벗긴다.

export const SELLER_STORE_QUERY_KEY = ['store-settings', 'store'] as const

/** 셀러가 아닌 계정도 200(isSeller=false·store=null)이라 "없음" 분기에 404 정규화가 필요 없다. */
export function useSellerStore() {
  return useQuery({
    queryKey: SELLER_STORE_QUERY_KEY,
    queryFn: ({ signal }) => getSellerStore(signal).then(response => response.data),
  })
}

export interface UpdateStoreInput {
  request: StoreSettingsUpdateRequest
  /** 저장 직전에 읽은 스토어 — PUT이 204라 여기에 보낸 본문을 덮어써 저장 직후 값을 만든다. */
  store: StoreData
}

interface MutateOptions {
  onSuccess?: (applied: StoreData) => void
  onError?: (error: unknown) => void
}

/**
 * 전체 덮어쓰기 저장(204, 응답 바디 없음).
 *
 * 바디가 없으니 저장 결과를 응답에서 받을 수 없다. 폼은 1회만 시드되므로 무효화만 걸면
 * 서버가 다듬은 값(상호 앞뒤 공백 제거, 빈 칸 → null)이 화면에 되돌아오지 않는다. 그래서 보낸
 * 본문을 읽은 스토어에 덮어쓴 결과를 캐시에 심고 호출부에 넘겨 폼까지 되맞춘다. 무효화도 함께
 * 걸어 서버가 실제로 들고 있는 값으로 수렴시킨다.
 */
export function useUpdateSellerStore() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ request, store }: UpdateStoreInput) =>
      updateSellerStore(request).then(() => appliedStore(store, request)),
    onSuccess: applied => {
      queryClient.setQueryData<StoreSettingsData>(SELLER_STORE_QUERY_KEY, current =>
        current ? { ...current, store: applied } : current,
      )
      return queryClient.invalidateQueries({ queryKey: SELLER_STORE_QUERY_KEY })
    },
  })
  return {
    isPending: mutation.isPending,
    mutate: (input: UpdateStoreInput, opts?: MutateOptions) =>
      mutation.mutate(input, { onSuccess: opts?.onSuccess, onError: opts?.onError }),
  }
}
