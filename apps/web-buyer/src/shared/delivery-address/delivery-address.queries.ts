import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DeliveryAddress } from '@aechak/domain'
import {
  addDeliveryAddress,
  deleteDeliveryAddress,
  errorResponse,
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

// 입력 길이 상한은 BE 계약을 그대로 옮긴다(be origin/develop 기준). 폼은 이 값을 maxLength 속성으로 쓴다.
// 경로는 be boot/api/.../user/address/request/AddDeliveryAddressRequest.kt (UpdateDeliveryAddressRequest.kt도 같은 값).
// 연락처 형식(CONTACT_NUMBER_PATTERN)은 정규화 규칙과 함께 delivery-address.format.ts에 있다.
/** AddDeliveryAddressRequest.kt:13 @Size(max = DeliveryAddress.RECEIVER_NAME_MAX_LENGTH), DeliveryAddress.kt:110 = 50 */
export const RECEIVER_NAME_MAX_LENGTH = 50
/** AddDeliveryAddressRequest.kt:29 detailAddress @Size(max = 512) */
export const DETAIL_ADDRESS_MAX_LENGTH = 512
/** AddDeliveryAddressRequest.kt:31 deliveryMemo @Size(max = 255) */
export const DELIVERY_MEMO_MAX_LENGTH = 255
/** AddDeliveryAddressRequest.kt:33 label @Size(max = 100) */
export const DELIVERY_ADDRESS_LABEL_MAX_LENGTH = 100

/** 서버 에러코드 — 배송지 최대 개수 초과(사용자 대역 30500). */
const DELIVERY_ADDRESS_LIMIT_EXCEEDED = 30500

const DELIVERY_ADDRESSES_QUERY_KEY = ['delivery-addresses'] as const

// 목업 스토어 시절 DeliveryAddressInput 모양 유지 — 화면 코드 안 고치려고. 폼이 모든 필드를 문자열로 시드한다.
export interface DeliveryAddressInput {
  label: string
  recipient: string
  phone: string
  zipcode: string
  address1: string
  address2: string
  deliveryMemo: string
  isDefault: boolean
}

// 서버는 number id, 화면은 string id — 변환은 이 매퍼 두 함수에서만.
// number로 올리려면 여기·DeliveryAddress.id·소비부를 같이 고칠 것.
export function toDeliveryAddress(res: DeliveryAddressResponse): DeliveryAddress {
  return {
    id: String(res.addressId),
    label: res.label ?? '',
    recipient: res.receiverName,
    phone: res.contactNumber,
    zipcode: res.zipCode,
    address1: res.baseAddress,
    address2: res.detailAddress ?? '',
    deliveryMemo: res.deliveryMemo ?? undefined,
    isDefault: res.isDefault,
  }
}

// BE는 직접 입력한 글자 필드를 정규화하지 않고 그대로 저장하므로(trim 없음) 앞뒤 공백을 걷어서 보낸다.
// 빈 선택 필드(메모·별칭)는 보내지 않는다(서버 nullable). 연락처 구분자는 서버도 걷어낸다(normalizeContactNumber).
export function toDeliveryAddressRequest(input: DeliveryAddressInput): AddDeliveryAddressRequest {
  return {
    receiverName: input.recipient.trim(),
    contactNumber: input.phone,
    zipCode: input.zipcode,
    baseAddress: input.address1,
    detailAddress: input.address2.trim(),
    deliveryMemo: input.deliveryMemo.trim() || undefined,
    label: input.label.trim() || undefined,
    isDefault: input.isDefault,
  }
}

export function useDeliveryAddresses() {
  const query = useQuery({
    queryKey: DELIVERY_ADDRESSES_QUERY_KEY,
    queryFn: () => getDeliveryAddresses(),
  })
  const addresses = (query.data?.data.addresses ?? []).map(toDeliveryAddress)
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

// 에러 문구는 HTTP status로 고름(계약이 status로 구분). 서버 message는 -습니다체이고 계약도 아니라 읽지 않는다.
// 400(@Valid 실패 90001)은 화면 검증을 통과한 뒤에만 오므로 한 문장으로 안내한다.
export function deliveryAddressErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.status) {
    // 422는 개수 초과(30500) 전용이 아니다 — 코드까지 봐야 다른 검증 실패를 오안내하지 않는다.
    case 422:
      return res.data?.errorCode === DELIVERY_ADDRESS_LIMIT_EXCEEDED
        ? `배송지는 최대 ${MAX_DELIVERY_ADDRESSES}개까지 등록할 수 있어요`
        : '배송지 정보를 다시 확인해주세요'
    case 403:
      return '본인 배송지만 접근할 수 있어요'
    // 다른 기기에서 이미 지운 배송지(30501). 다시 시도해도 성공하지 않으므로 재시도 문구를 쓰지 않는다.
    case 404:
      return '이미 삭제된 배송지예요'
    case 400:
      return '입력한 배송지 정보를 다시 확인해주세요'
    default:
      return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'
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
          const promotedId = res.data.promotedDefaultAddressId
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
