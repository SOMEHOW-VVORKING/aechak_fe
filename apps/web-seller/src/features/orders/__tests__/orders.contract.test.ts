import { describe, it, expect } from 'vitest'
import { OrderStatus, SellerOrderStatusFilter } from '@aechak/api'
import {
  ORDER_SEGMENTS,
  ORDER_SEGMENT_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  canAcceptOrder,
  canCompleteDelivery,
  canRegisterShipment,
  formatDeliveryAddress,
  formatOrderedAt,
  maskContactNumber,
  orderErrorMessage,
} from '../orders.contract'
import { normalizeOrderSearchParams } from '../orders.queries'

// 서버 enum을 화면 어휘로 접는 매핑과, 전이 가능 판정이 be SellerOrderService와 어긋나지 않는지 본다.
// SCRUM-274에서 주문 상태 허용값이 문서에 빠져 있다고 보고된 자리라, 생성물 enum(스펙이 정본)을
// 돌면서 키 누락을 잡는다 — 라벨이 하나라도 빠지면 그 행이 undefined로 그려진다.

describe('주문 상태 어휘', () => {
  it('[AC-SORDER-C01] 서버 OrderStatus 8종 전부에 라벨과 pill variant가 있다', () => {
    const statuses = Object.values(OrderStatus)
    expect(statuses).toHaveLength(8)
    for (const status of statuses) {
      expect(ORDER_STATUS_LABEL[status]).toBeTruthy()
      expect(ORDER_STATUS_VARIANT[status]).toBeTruthy()
    }
  })

  it('[AC-SORDER-C02] 세그먼트 어휘는 서버 SellerOrderStatusFilter와 같은 집합이다', () => {
    // enum 이름(PAID 등)을 보내면 400/90001이다 — 어휘가 갈라지는 순간을 여기서 잡는다.
    expect([...ORDER_SEGMENTS].sort()).toEqual([...Object.values(SellerOrderStatusFilter)].sort())
    for (const segment of ORDER_SEGMENTS) {
      expect(ORDER_SEGMENT_LABEL[segment]).toBeTruthy()
    }
  })
})

describe('처리 가능 판정', () => {
  it('[AC-SORDER-C03] 발주 확인은 PAID에서만 열린다', () => {
    expect(canAcceptOrder('PAID')).toBe(true)
    for (const status of Object.values(OrderStatus).filter(s => s !== 'PAID')) {
      expect(canAcceptOrder(status)).toBe(false)
    }
  })

  it('[AC-SORDER-C04] 송장 등록은 상품준비중·발송대기이고 송장이 없을 때만 열린다', () => {
    expect(canRegisterShipment('PREPARING', false)).toBe(true)
    expect(canRegisterShipment('DISPATCH_PENDING', false)).toBe(true)
    // 서버에 송장 정정 경로가 없다(재등록 409/50302) — 송장이 있으면 버튼을 두지 않는다.
    expect(canRegisterShipment('PREPARING', true)).toBe(false)
    expect(canRegisterShipment('DISPATCH_PENDING', true)).toBe(false)
    expect(canRegisterShipment('PAID', false)).toBe(false)
    expect(canRegisterShipment('SHIPPING', false)).toBe(false)
  })

  it('[AC-SORDER-C05] 배송 완료는 SHIPPING에서만 열린다', () => {
    expect(canCompleteDelivery('SHIPPING')).toBe(true)
    for (const status of Object.values(OrderStatus).filter(s => s !== 'SHIPPING')) {
      expect(canCompleteDelivery(status)).toBe(false)
    }
  })
})

describe('표시 포맷', () => {
  it('[AC-SORDER-C06] 주문일시는 오프셋 없는 벽시계를 Date 없이 자른다', () => {
    // Date를 거치면 KST 벽시계가 로컬 타임존에 따라 밀린다.
    expect(formatOrderedAt('2026-10-24T10:05:00')).toBe('2026-10-24 10:05')
  })

  it('[AC-SORDER-C07] 연락처는 앞 3자리와 뒤 4자리만 남긴다', () => {
    expect(maskContactNumber('01012345678')).toBe('010-****-5678')
    expect(maskContactNumber('010-1234-5678')).toBe('010-****-5678')
    expect(maskContactNumber('0212345678')).toBe('021-***-5678')
    // 가릴 만큼 길지 않으면 원문을 그대로 — 지어낸 별표로 값을 늘리지 않는다.
    expect(maskContactNumber('123456')).toBe('123456')
  })

  it('[AC-SORDER-C08] 상세주소가 null이면 주소 한 줄에 빈칸을 남기지 않는다', () => {
    expect(
      formatDeliveryAddress({ zipCode: '06236', baseAddress: '서울 강남구 테헤란로 1', detailAddress: null }),
    ).toBe('(06236) 서울 강남구 테헤란로 1')
  })
})

describe('목록 파라미터 정규화', () => {
  it('[AC-SORDER-C09] 빈 값은 키째 빼고 page 0은 남긴다', () => {
    // 서버는 `?keyword=`·`?orderedFrom=`을 미입력이 아니라 형식 오류로 거절하는 자리가 있다.
    expect(
      normalizeOrderSearchParams({ status: 'all', keyword: '', orderedFrom: '', orderedTo: '', page: 0 }),
    ).toEqual({ status: 'all', page: 0 })
  })

  it('[AC-SORDER-C10] 검색어는 trim하고 공백뿐이면 뺀다', () => {
    expect(normalizeOrderSearchParams({ keyword: '  김보호  ' })).toEqual({ keyword: '김보호' })
    expect(normalizeOrderSearchParams({ keyword: '   ' })).toEqual({})
  })
})

describe('에러 문구', () => {
  it('[AC-SORDER-C11] 서버 errorCode를 -해요체 문구로 바꾸고 미지 코드는 기본 문구로 떨어진다', () => {
    const at = (errorCode: number) => orderErrorMessage({ response: { data: { errorCode } } })
    expect(at(50004)).toContain('발주 확인')
    expect(at(50005)).toContain('발송 처리')
    expect(at(50302)).toContain('이미 송장이 등록된')
    expect(at(50303)).toContain('택배사')
    // 자격 거절은 50003 하나로 조회·처리 양쪽에서 오므로 둘 다에서 읽히는 문구여야 한다.
    expect(at(50003)).toContain('보거나 처리할 수 있는 계정이 아니에요')
    // 배송완료 거절은 "배송 행 없음"과 "이미 완료/전이 실패"로 갈린다 — 50002가 아니다.
    expect(at(50300)).toContain('배송 정보가 없어')
    expect(at(50301)).toContain('이미 배송완료로 처리됐거나')
    // 40004·40006은 ProductErrorCode라 주문 경로로 오지 않는다 — 매핑에 남겨 두면 닿지 않는 문구가 된다.
    expect(at(40004)).toBe('요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(at(40006)).toBe('요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(at(99999)).toBe('요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(orderErrorMessage(new Error('network'))).toBe(
      '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
    )
  })
})
