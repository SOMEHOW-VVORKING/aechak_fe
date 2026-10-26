import { describe, expect, it } from 'vitest'
import type { ShippingPolicyData } from '@aechak/api'
import {
  FREE_SHIPPING_FALLBACK_THRESHOLD,
  appliedPolicy,
  formValueFrom,
  freeShippingThresholdError,
  shippingPolicyErrorMessage,
  toUpdateRequest,
  type ShippingPolicyFormValue,
} from '../shipping-policy.contract'

// 와이어 ↔ 폼 변환 단위 테스트. 목업 시절 FE 타입(`defaultCourier`·`baseFee`·`sameAsOrigin` +
// 한 줄 주소)과 서버 계약이 여섯 자리 어긋나 있었고, 이 파일이 서버 쪽 모양을 못 박는다.

const wire = (overrides: Partial<ShippingPolicyData> = {}): ShippingPolicyData => ({
  defaultCourierCode: 'CJ',
  baseShippingFee: 3000,
  freeShippingThreshold: 30000,
  originZipCode: '04035',
  originRoadAddress: '서울 마포구 와우산로 00',
  originDetailAddress: '물류 1센터',
  returnSameAsOrigin: true,
  returnZipCode: null,
  returnRoadAddress: null,
  returnDetailAddress: null,
  jejuExtraFee: 3000,
  remoteAreaExtraFee: 5000,
  returnFee: 4000,
  exchangeFee: 8000,
  avgDispatchDays: 1,
  shippingPolicyText: null,
  ...overrides,
})

describe('formValueFrom', () => {
  it('[AC-SHIP-CONTRACT-001] 서버 필드명을 그대로 받아 폼 값으로 옮긴다', () => {
    const form = formValueFrom(wire())

    expect(form.defaultCourierCode).toBe('CJ')
    expect(form.baseShippingFee).toBe(3000)
    expect(form.returnSameAsOrigin).toBe(true)
    expect(form.avgDispatchDays).toBe(1)
  })

  it('[AC-SHIP-CONTRACT-002] 주소는 1필드로 합치지 않고 우편번호/도로명/상세를 따로 들고 있는다', () => {
    const form = formValueFrom(wire())

    expect(form.originZipCode).toBe('04035')
    expect(form.originRoadAddress).toBe('서울 마포구 와우산로 00')
    expect(form.originDetailAddress).toBe('물류 1센터')
  })

  it('[AC-SHIP-CONTRACT-003] 반품지가 출고지와 같아 null로 내려오면 출고지 값으로 채운다', () => {
    // 체크를 풀었을 때 빈 칸이 나오지 않게 — 서버는 동일 설정이면 반품지를 저장하지 않는다.
    const form = formValueFrom(wire())

    expect(form.returnZipCode).toBe('04035')
    expect(form.returnDetailAddress).toBe('물류 1센터')
  })

  it('[AC-SHIP-CONTRACT-004] null 문자열 필드는 빈 문자열로, 미설정 무료배송은 스위치 꺼짐으로 읽는다', () => {
    const form = formValueFrom(
      wire({ defaultCourierCode: null, freeShippingThreshold: null, shippingPolicyText: null }),
    )

    expect(form.defaultCourierCode).toBe('')
    expect(form.shippingPolicyText).toBe('')
    expect(form.freeShipping).toBe(false)
    // 스위치를 다시 켤 때 0원으로 떨어지지 않게 기본 배송비 이상의 출발값을 들고 있는다.
    expect(form.freeShippingThreshold).toBeGreaterThanOrEqual(3000)
  })

  it('[AC-SHIP-CONTRACT-005] 무료배송 0원은 미운영이 아니라 0원 운영으로 읽는다', () => {
    const form = formValueFrom(wire({ baseShippingFee: 0, freeShippingThreshold: 0 }))

    expect(form.freeShipping).toBe(true)
    expect(form.freeShippingThreshold).toBe(0)
  })
})

const formOf = (overrides: Partial<ShippingPolicyFormValue> = {}): ShippingPolicyFormValue => ({
  ...formValueFrom(wire()),
  ...overrides,
})

describe('toUpdateRequest', () => {
  it('[AC-SHIP-CONTRACT-006] 빈 문자열은 null로 되돌린다(공백만 있는 값도 미설정이다)', () => {
    const request = toUpdateRequest(
      formOf({ defaultCourierCode: '', originDetailAddress: '   ', shippingPolicyText: '' }),
    )

    expect(request.defaultCourierCode).toBeNull()
    expect(request.originDetailAddress).toBeNull()
    expect(request.shippingPolicyText).toBeNull()
  })

  it('[AC-SHIP-CONTRACT-007] 무료배송 스위치를 끄면 0원이 아니라 null을 보낸다', () => {
    expect(toUpdateRequest(formOf({ freeShipping: false, freeShippingThreshold: 30000 })).freeShippingThreshold)
      .toBeNull()
  })

  it('[AC-SHIP-CONTRACT-008] 반품지 동일이면 반품지 3필드를 null로 보낸다(서버가 버리는 값과 어긋나지 않게)', () => {
    const request = toUpdateRequest(
      formOf({ returnSameAsOrigin: true, returnZipCode: '06236', returnRoadAddress: '서울 강남구' }),
    )

    expect(request.returnZipCode).toBeNull()
    expect(request.returnRoadAddress).toBeNull()
    expect(request.returnDetailAddress).toBeNull()
  })

  it('[AC-SHIP-CONTRACT-009] 반품지를 따로 쓰면 입력한 3필드를 그대로 싣는다', () => {
    const request = toUpdateRequest(
      formOf({
        returnSameAsOrigin: false,
        returnZipCode: '06236',
        returnRoadAddress: '서울 강남구 테헤란로 00',
        returnDetailAddress: '반품센터',
      }),
    )

    expect(request.returnZipCode).toBe('06236')
    expect(request.returnRoadAddress).toBe('서울 강남구 테헤란로 00')
    expect(request.returnDetailAddress).toBe('반품센터')
  })
})

describe('appliedPolicy', () => {
  it('[AC-SHIP-CONTRACT-010] PUT이 204라 응답이 없으므로 보낸 본문에 서버 규칙을 적용해 되읽는다', () => {
    const request = toUpdateRequest(
      formOf({ returnSameAsOrigin: true, returnZipCode: '06236', freeShipping: false }),
    )

    const applied = appliedPolicy(request)

    expect(applied.returnSameAsOrigin).toBe(true)
    expect(applied.returnZipCode).toBeNull()
    expect(applied.freeShippingThreshold).toBeNull()
    expect(applied.baseShippingFee).toBe(3000)
  })
})

describe('freeShippingThresholdError', () => {
  it('[AC-SHIP-CONTRACT-011] 무료배송 기준이 기본 배송비보다 낮으면 저장 전에 막는다(서버는 10005)', () => {
    expect(freeShippingThresholdError(formOf({ baseShippingFee: 5000, freeShippingThreshold: 3000 })))
      .toBe('무료배송 기준 금액은 기본 배송비보다 낮을 수 없어요.')
  })

  it('[AC-SHIP-CONTRACT-012] 무료배송을 끈 상태에서는 금액을 보지 않는다(null로 나가므로)', () => {
    expect(
      freeShippingThresholdError(
        formOf({ freeShipping: false, baseShippingFee: 5000, freeShippingThreshold: 0 }),
      ),
    ).toBeNull()
  })

  it('[AC-SHIP-CONTRACT-013] 기준이 기본 배송비와 같으면 통과한다(서버 판정이 미만일 때만 거절)', () => {
    expect(freeShippingThresholdError(formOf({ baseShippingFee: 3000, freeShippingThreshold: 3000 })))
      .toBeNull()
  })
})

describe('shippingPolicyErrorMessage', () => {
  const axiosLike = (errorCode: number) => ({
    isAxiosError: true,
    response: { status: 400, data: { errorCode, message: '배송 정책 값이 올바르지 않습니다.' } },
  })

  it.each([
    [10005, '배송 관련 금액과 발송 소요일을 다시 확인해 주세요.'],
    [50303, '선택한 택배사를 찾을 수 없어요. 택배사를 다시 골라 주세요.'],
    [10002, '활성 셀러만 배송 정책을 바꿀 수 있어요.'],
  ])('[AC-SHIP-CONTRACT-014] errorCode %i는 해요체 안내로 바뀐다', (code, message) => {
    expect(shippingPolicyErrorMessage(axiosLike(code))).toBe(message)
  })

  it('[AC-SHIP-CONTRACT-015] 서버 격식체 문구를 그대로 싣지 않는다', () => {
    // 카피 규칙(앱 전체 -해요체)이 서버 원문보다 우선한다.
    expect(shippingPolicyErrorMessage(axiosLike(10005))).not.toContain('않습니다')
  })

  it('[AC-SHIP-CONTRACT-016] 모르는 실패는 일반 안내로 떨어진다', () => {
    expect(shippingPolicyErrorMessage(new Error('network'))).toBe(
      '저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    )
  })
})

describe('FREE_SHIPPING_FALLBACK_THRESHOLD', () => {
  it('[AC-SHIP-CONTRACT-017] 스위치 복구 출발값은 0원이 아니다(0원은 거의 항상 10005다)', () => {
    expect(FREE_SHIPPING_FALLBACK_THRESHOLD).toBeGreaterThan(0)
  })
})

describe('별도 반품지의 빈 칸(codex 지적)', () => {
  it('[AC-SHIP-CONTRACT-018] 출고지와 다른 반품지의 null은 출고지로 채우지 않고 빈 칸으로 둔다', () => {
    // 서버는 `returnSameAsOrigin=false`일 때만 반품지를 저장하고, 비운 칸은 null로 들고 있다.
    // 거기에 출고지를 끼워 넣으면 배송비만 고쳐 저장해도(전체 덮어쓰기다) 입력한 적 없는
    // 출고지 주소가 반품지로 저장된다.
    const form = formValueFrom(
      wire({
        returnSameAsOrigin: false,
        returnZipCode: '06236',
        returnRoadAddress: null,
        returnDetailAddress: null,
      }),
    )

    expect(form.returnZipCode).toBe('06236')
    expect(form.returnRoadAddress).toBe('')
    expect(form.returnDetailAddress).toBe('')
    // 그대로 저장하면 서버가 들고 있던 null이 유지된다.
    const request = toUpdateRequest(form)
    expect(request.returnRoadAddress).toBeNull()
    expect(request.returnDetailAddress).toBeNull()
  })

  it('[AC-SHIP-CONTRACT-019] 출고지와 동일일 때는 그대로 출고지 값으로 채운다(AC-003 유지)', () => {
    const form = formValueFrom(wire({ returnSameAsOrigin: true, returnRoadAddress: null }))

    expect(form.returnRoadAddress).toBe('서울 마포구 와우산로 00')
  })
})

describe('금액 단위(codex 지적)', () => {
  it('[AC-SHIP-CONTRACT-020] 금액은 원 단위 정수로 끊어 보낸다(서버 필드가 Long이다)', () => {
    // 소수가 섞이면 도메인 검증(10005)까지 가지 못하고 역직렬화 400/90001로 떨어져 사유를 못 알린다.
    const request = toUpdateRequest(
      formOf({
        baseShippingFee: 3000.5,
        freeShipping: true,
        freeShippingThreshold: 30000.4,
        jejuExtraFee: 3000.5,
        remoteAreaExtraFee: 0.2,
        returnFee: 4000.5,
        exchangeFee: 8000.49,
      }),
    )

    expect(request.baseShippingFee).toBe(3001)
    expect(request.freeShippingThreshold).toBe(30000)
    expect(request.jejuExtraFee).toBe(3001)
    expect(request.remoteAreaExtraFee).toBe(0)
    expect(request.returnFee).toBe(4001)
    expect(request.exchangeFee).toBe(8000)
  })
})
