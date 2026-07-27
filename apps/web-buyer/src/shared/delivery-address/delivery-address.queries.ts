import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DeliveryAddress } from '@aechak/domain'
import {
  addDeliveryAddress,
  deleteDeliveryAddress,
  getDeliveryAddresses,
  setDefaultDeliveryAddress,
  updateDeliveryAddress,
  type AddDeliveryAddressRequest,
  type DeliveryAddressResponse,
} from '@aechak/api'

// 배송지 화면(b10-st-4)을 실제 백엔드에 붙이는 얇은 어댑터.
// 주소록·주문서가 같이 쓰는데 feature끼리 import 불가라 shared에 둠.
// 기본 유일성·자동 승격은 서버 소유 — mutation 성공 시 목록 invalidate로 다시 읽음.
//
// 생성된 react-query 훅이 아니라 fetcher만 소비한다(AGENTS.md 펫 breeds 절 컨벤션) —
// packages/api와 앱의 react-query 선언 범위가 달라 훅/옵션 타입이 패키지 경계를 넘으면
// 버전 표류 시 깨질 수 있다. 이 파일이 자체 useQuery/useMutation으로 감싼다.

export const MAX_DELIVERY_ADDRESSES = 10

/** 서버 에러코드 — 배송지 최대 개수 초과(사용자 대역 30120). */
const DELIVERY_ADDRESS_LIMIT_EXCEEDED = 30120

const DELIVERY_ADDRESSES_QUERY_KEY = ['delivery-addresses'] as const

// 목업 스토어 시절 DeliveryAddressInput 모양 유지 — 화면 코드 안 고치려고.
export interface DeliveryAddressInput {
  label: string
  recipient: string
  phone: string
  zipcode: string
  address1: string
  address2: string
  deliveryMemo?: string
  isDefault: boolean
}

// 서버는 number id, 화면은 string id — 변환은 이 매퍼 두 함수에서만.
// number로 올리려면 여기·DeliveryAddress.id·소비부를 같이 고칠 것.
export function toDeliveryAddress(res: DeliveryAddressResponse): DeliveryAddress {
  return {
    id: res.addressId != null ? String(res.addressId) : '',
    label: res.label ?? '',
    recipient: res.receiverName ?? '',
    phone: res.contactNumber ?? '',
    zipcode: res.zipCode ?? '',
    address1: res.baseAddress ?? '',
    address2: res.detailAddress ?? '',
    deliveryMemo: res.deliveryMemo ?? undefined,
    isDefault: res.isDefault ?? false,
  }
}

export function toDeliveryAddressRequest(input: DeliveryAddressInput): AddDeliveryAddressRequest {
  return {
    receiverName: input.recipient,
    contactNumber: input.phone,
    zipCode: input.zipcode,
    baseAddress: input.address1,
    detailAddress: input.address2,
    deliveryMemo: input.deliveryMemo?.trim() || undefined,
    label: input.label || undefined,
    isDefault: input.isDefault,
  }
}

export function useDeliveryAddresses() {
  const query = useQuery({
    queryKey: DELIVERY_ADDRESSES_QUERY_KEY,
    queryFn: () => getDeliveryAddresses(),
  })
  const addresses = (query.data?.data?.addresses ?? []).map(toDeliveryAddress)
  return {
    addresses,
    isLoading: query.isLoading,
    // 캐시에 목록이 남아 있으면 배경 refetch 실패로 화면을 에러로 갈아끼우지 않는다.
    isError: query.isError && addresses.length === 0,
    refetch: query.refetch,
  }
}

/** 기본이 없으면 첫 항목, 그것도 없으면 null. */
export function useDefaultDeliveryAddress() {
  const { addresses, isLoading, isError, refetch } = useDeliveryAddresses()
  const address = addresses.find(a => a.isDefault) ?? addresses[0] ?? null
  return { address, isLoading, isError, refetch }
}

// 에러 문구는 HTTP status로 고름(계약이 status로 구분). 마땅찮으면 서버 message.
// axios 타입 안 끌어오려고 duck-typing.
export function deliveryAddressErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status
  const data = (error as { response?: { data?: { message?: string; errorCode?: number } } })?.response
    ?.data
  const serverMessage = data?.message
  switch (status) {
    // 422는 개수 초과(30120) 전용이 아니다 — 코드까지 봐야 다른 검증 실패를 오안내하지 않는다.
    case 422:
      return data?.errorCode === DELIVERY_ADDRESS_LIMIT_EXCEEDED
        ? '배송지는 최대 10개까지 등록할 수 있어요'
        : (serverMessage ?? '배송지 정보를 다시 확인해주세요')
    case 403:
      return '본인 배송지만 접근할 수 있어요'
    case 400:
      return serverMessage ?? '입력한 배송지 정보를 다시 확인해주세요'
    default:
      return serverMessage ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'
  }
}

// mutation 성공 시 목록 다시 읽음 — 서버가 정한 승격/유일성이 그대로 반영되게.

interface MutateOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

// 삭제는 성공 시 서버가 승격한 배송지 id를 준다(기본 삭제로 승격이 일어났을 때만 non-null).
// 화면이 "○○가 기본이 됐어요"를 띄울 수 있게 그 id를 string으로 넘긴다.
interface RemoveMutateOptions {
  onSuccess?: (promotedDefaultId: string | null) => void
  onError?: (error: unknown) => void
}

function useInvalidateAddresses() {
  const queryClient = useQueryClient()
  // 반환해서 react-query가 refetch까지 기다리게 한다 — isPending이 갱신 전 구간을 덮어
  // 목록이 아직 옛 상태인 동안 같은 버튼을 다시 누르는 걸 막는다.
  return () => queryClient.invalidateQueries({ queryKey: DELIVERY_ADDRESSES_QUERY_KEY })
}

export function useAddDeliveryAddress() {
  const invalidate = useInvalidateAddresses()
  const mutation = useMutation({
    mutationFn: (input: DeliveryAddressInput) => addDeliveryAddress(toDeliveryAddressRequest(input)),
    onSuccess: invalidate,
  })
  return {
    isPending: mutation.isPending,
    mutate: (input: DeliveryAddressInput, opts?: MutateOptions) => mutation.mutate(input, opts),
  }
}

export function useUpdateDeliveryAddress() {
  const invalidate = useInvalidateAddresses()
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeliveryAddressInput }) =>
      updateDeliveryAddress(Number(id), toDeliveryAddressRequest(input)),
    onSuccess: invalidate,
  })
  return {
    isPending: mutation.isPending,
    mutate: (id: string, input: DeliveryAddressInput, opts?: MutateOptions) =>
      mutation.mutate({ id, input }, opts),
  }
}

/** 기본 삭제 시 서버가 하나를 자동 승격하고 그 id를 응답으로 준다. */
export function useRemoveDeliveryAddress() {
  const invalidate = useInvalidateAddresses()
  const mutation = useMutation({
    mutationFn: (id: string) => deleteDeliveryAddress(Number(id)),
    onSuccess: invalidate,
  })
  return {
    isPending: mutation.isPending,
    mutate: (id: string, opts?: RemoveMutateOptions) =>
      mutation.mutate(id, {
        onSuccess: res => {
          const promotedId = res?.data?.promotedDefaultAddressId
          opts?.onSuccess?.(promotedId != null ? String(promotedId) : null)
        },
        onError: opts?.onError,
      }),
  }
}

/** 서버가 나머지 기본을 해제함. */
export function useSetDefaultDeliveryAddress() {
  const invalidate = useInvalidateAddresses()
  const mutation = useMutation({
    mutationFn: (id: string) => setDefaultDeliveryAddress(Number(id)),
    onSuccess: invalidate,
  })
  return {
    isPending: mutation.isPending,
    mutate: (id: string, opts?: MutateOptions) => mutation.mutate(id, opts),
  }
}
