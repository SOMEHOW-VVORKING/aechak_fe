import { errorResponse } from '@aechak/api'
import type { ShippingPolicyData, ShippingPolicyUpdateRequest } from '@aechak/api'

// 와이어 ↔ 폼 변환 한 곳. 서버 필드명(`defaultCourierCode`·`baseShippingFee`·`returnSameAsOrigin`과
// 주소 3필드)을 그대로 쓴다 — 목업 시절 타입은 `defaultCourier`·`baseFee`·`sameAsOrigin`에
// 주소를 한 줄 문자열로 들고 있어 서버와 여섯 자리가 어긋났고, 그 모양은 서버에 존재하지 않는다.
//
// 폼이 와이어와 다른 점은 둘뿐이다.
// 1. null을 입력 컨트롤이 다룰 수 없어 문자열은 ''로 평평하게 만든다(저장 시 되돌린다).
// 2. `freeShippingThreshold`는 null(무료배송 미운영)과 0원이 서버에서 다른 의미라 숫자를
//    버리지 않고 `freeShipping` 스위치와 금액을 나눠 들고 있는다 — 스위치를 껐다 켜도
//    직전에 넣은 금액이 남는다.

export interface ShippingPolicyFormValue {
  defaultCourierCode: string
  baseShippingFee: number
  /** 무료배송 운영 여부. 끄면 서버로 `freeShippingThreshold: null`이 나간다(0원과 다른 의미다). */
  freeShipping: boolean
  freeShippingThreshold: number
  originZipCode: string
  originRoadAddress: string
  originDetailAddress: string
  returnSameAsOrigin: boolean
  returnZipCode: string
  returnRoadAddress: string
  returnDetailAddress: string
  jejuExtraFee: number
  remoteAreaExtraFee: number
  returnFee: number
  exchangeFee: number
  avgDispatchDays: number
  shippingPolicyText: string
}

/** 무료배송을 끈 상태에서 스위치를 켤 때 쓰는 출발값 — 기본 배송비 미만은 서버가 10005로 거절한다. */
export const FREE_SHIPPING_FALLBACK_THRESHOLD = 30_000

const text = (value: string | null): string => value ?? ''

/** 원 단위 정수로 끊는다 — 금액 입력은 소수를 받을 수 있고 서버 필드는 Long이다. */
export const toWon = (value: number): number => Math.round(value)

type ReturnAddress = Pick<
  ShippingPolicyFormValue,
  'returnZipCode' | 'returnRoadAddress' | 'returnDetailAddress'
>

/** 반품지 3필드. 출고지 폴백은 "출고지와 동일"일 때만 쓴다(그때만 서버가 버린 값이다). */
function returnAddressOf(policy: ShippingPolicyData): ReturnAddress {
  if (!policy.returnSameAsOrigin) {
    return {
      returnZipCode: text(policy.returnZipCode),
      returnRoadAddress: text(policy.returnRoadAddress),
      returnDetailAddress: text(policy.returnDetailAddress),
    }
  }
  return {
    returnZipCode: text(policy.returnZipCode ?? policy.originZipCode),
    returnRoadAddress: text(policy.returnRoadAddress ?? policy.originRoadAddress),
    returnDetailAddress: text(policy.returnDetailAddress ?? policy.originDetailAddress),
  }
}

export function formValueFrom(policy: ShippingPolicyData): ShippingPolicyFormValue {
  return {
    defaultCourierCode: text(policy.defaultCourierCode),
    baseShippingFee: policy.baseShippingFee,
    freeShipping: policy.freeShippingThreshold != null,
    freeShippingThreshold:
      policy.freeShippingThreshold ??
      Math.max(FREE_SHIPPING_FALLBACK_THRESHOLD, policy.baseShippingFee),
    originZipCode: text(policy.originZipCode),
    originRoadAddress: text(policy.originRoadAddress),
    originDetailAddress: text(policy.originDetailAddress),
    returnSameAsOrigin: policy.returnSameAsOrigin,
    // 반품지가 출고지와 같으면 서버가 반품지 3필드를 저장하지 않고 null로 내려 준다 —
    // 체크를 풀었을 때 빈 칸을 보여 주지 않도록 출고지 값으로 채워 둔다.
    //
    // **별도 반품지일 때는 채우지 않는다.** 그때 비어 있는 칸은 서버가 실제로 null로 들고 있는
    // 값이고, 거기에 출고지를 끼워 넣으면 배송비만 고쳐 저장해도(저장은 전체 덮어쓰기다)
    // 사용자가 입력한 적 없는 출고지 주소가 반품지로 저장된다.
    ...returnAddressOf(policy),
    jejuExtraFee: policy.jejuExtraFee,
    remoteAreaExtraFee: policy.remoteAreaExtraFee,
    returnFee: policy.returnFee,
    exchangeFee: policy.exchangeFee,
    avgDispatchDays: policy.avgDispatchDays,
    shippingPolicyText: text(policy.shippingPolicyText),
  }
}

/** 빈 문자열은 "비웠다"는 뜻이라 null로 되돌린다 — ''를 그대로 보내면 미설정과 공백이 섞인다. */
const nullIfBlank = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * PUT 본문. 전체 덮어쓰기라 폼의 모든 항목을 싣는다.
 *
 * 반품지 3필드는 `returnSameAsOrigin`이 참이면 서버가 어차피 버리므로 null로 보낸다 —
 * 보낸 값과 저장된 값이 갈리지 않게 요청 단계에서 맞춘다.
 *
 * 금액은 `toWon`으로 정수로 끊는다. 폼이 이미 정수로 들고 있지만(입력 컨트롤이 끊는다) 서버
 * 필드가 Long이라 소수가 섞이면 저장이 10005가 아니라 역직렬화 400으로 떨어져 사유를 못 알린다.
 */
export function toUpdateRequest(form: ShippingPolicyFormValue): ShippingPolicyUpdateRequest {
  return {
    defaultCourierCode: nullIfBlank(form.defaultCourierCode),
    baseShippingFee: toWon(form.baseShippingFee),
    freeShippingThreshold: form.freeShipping ? toWon(form.freeShippingThreshold) : null,
    originZipCode: nullIfBlank(form.originZipCode),
    originRoadAddress: nullIfBlank(form.originRoadAddress),
    originDetailAddress: nullIfBlank(form.originDetailAddress),
    returnSameAsOrigin: form.returnSameAsOrigin,
    returnZipCode: form.returnSameAsOrigin ? null : nullIfBlank(form.returnZipCode),
    returnRoadAddress: form.returnSameAsOrigin ? null : nullIfBlank(form.returnRoadAddress),
    returnDetailAddress: form.returnSameAsOrigin ? null : nullIfBlank(form.returnDetailAddress),
    jejuExtraFee: toWon(form.jejuExtraFee),
    remoteAreaExtraFee: toWon(form.remoteAreaExtraFee),
    returnFee: toWon(form.returnFee),
    exchangeFee: toWon(form.exchangeFee),
    avgDispatchDays: form.avgDispatchDays,
    shippingPolicyText: nullIfBlank(form.shippingPolicyText),
  }
}

/** PUT은 204라 응답 바디가 없다 — 저장 직후 화면은 방금 보낸 본문을 서버 규칙대로 되읽는다. */
export function appliedPolicy(request: ShippingPolicyUpdateRequest): ShippingPolicyData {
  return {
    defaultCourierCode: request.defaultCourierCode ?? null,
    baseShippingFee: request.baseShippingFee,
    freeShippingThreshold: request.freeShippingThreshold ?? null,
    originZipCode: request.originZipCode ?? null,
    originRoadAddress: request.originRoadAddress ?? null,
    originDetailAddress: request.originDetailAddress ?? null,
    returnSameAsOrigin: request.returnSameAsOrigin,
    returnZipCode: request.returnSameAsOrigin ? null : (request.returnZipCode ?? null),
    returnRoadAddress: request.returnSameAsOrigin ? null : (request.returnRoadAddress ?? null),
    returnDetailAddress: request.returnSameAsOrigin ? null : (request.returnDetailAddress ?? null),
    jejuExtraFee: request.jejuExtraFee,
    remoteAreaExtraFee: request.remoteAreaExtraFee,
    returnFee: request.returnFee,
    exchangeFee: request.exchangeFee,
    avgDispatchDays: request.avgDispatchDays,
    shippingPolicyText: request.shippingPolicyText ?? null,
  }
}

/** BE 도메인 상한 — 넘기면 저장이 400 errorCode 10005다. 입력 컨트롤의 max로도 쓴다. */
export const MAX_SHIPPING_FEE = 1_000_000
export const MAX_FREE_SHIPPING_THRESHOLD = 100_000_000
export const MIN_DISPATCH_DAYS = 1
export const MAX_DISPATCH_DAYS = 7

/**
 * 저장 전 로컬 가드. 서버가 같은 판정을 10005로 내리지만, 눌러 보고 나서야 알게 되는 자기모순
 * 하나(무료배송 기준 < 기본 배송비)만 미리 짚어 준다. 범위·길이는 입력 컨트롤이 이미 막는다.
 *
 * 반환 문구는 **칸 아래 인라인 전용**이다 — 저장 버튼이 막힐 때는 같은 문장을 Alert에 또 띄우지
 * 않고 `SAVE_BLOCKED_MESSAGE`로 어느 칸을 보라고만 말한다(같은 문장이 화면에 두 번 뜨지 않게).
 */
export function freeShippingThresholdError(form: ShippingPolicyFormValue): string | null {
  if (!form.freeShipping) return null
  if (form.freeShippingThreshold < form.baseShippingFee) {
    return '무료배송 기준 금액은 기본 배송비보다 낮을 수 없어요.'
  }
  return null
}

/** 발송 소요일 Select 옵션 — BE 허용 범위(1~7영업일)를 그대로 펼친다. */
export const AVG_DISPATCH_DAY_OPTIONS = Array.from(
  { length: MAX_DISPATCH_DAYS - MIN_DISPATCH_DAYS + 1 },
  (_, index) => {
    const day = MIN_DISPATCH_DAYS + index
    return { value: String(day), label: `${day}영업일` }
  },
)

/**
 * 저장 실패 안내. 서버 message를 그대로 싣지 않는다 — BE 문구가 격식체라 앱 전체 -해요체
 * 규칙과 어긋난다(카피 규칙이 서버 원문보다 우선). 사유는 코드로 가른다.
 */
export function shippingPolicyErrorMessage(error: unknown): string {
  switch (errorResponse(error)?.data?.errorCode) {
    case 10005:
      return '배송 관련 금액과 발송 소요일을 다시 확인해 주세요.'
    case 50303:
      return '선택한 택배사를 찾을 수 없어요. 택배사를 다시 골라 주세요.'
    case 90001:
      return '입력한 내용을 다시 확인해 주세요.'
    case 10002:
      return '활성 셀러만 배송 정책을 바꿀 수 있어요.'
    case 10000:
      return '셀러 정보를 찾을 수 없어요. 화면을 새로고침해 주세요.'
    default:
      return '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

/** 로컬 가드에 걸려 저장을 보내지 않았을 때의 상단 안내. 사유 자체는 칸 아래 인라인이 말한다. */
export const SAVE_BLOCKED_MESSAGE = '저장하지 못했어요. 무료배송 기준 금액을 확인해 주세요.'
