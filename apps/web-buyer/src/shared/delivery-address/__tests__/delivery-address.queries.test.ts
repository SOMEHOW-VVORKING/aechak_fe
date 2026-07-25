import { describe, it, expect } from 'vitest'
import type { DeliveryAddressResponse } from '@aechak/api'
import {
  MAX_DELIVERY_ADDRESSES,
  deliveryAddressErrorMessage,
  toDeliveryAddressRequest,
  toDeliveryAddress,
  type DeliveryAddressInput,
} from '../delivery-address.queries'

// 목업 스토어가 제거되면서, 클라이언트 기본-배송지 정규화(withSingleDefault) 테스트는 전제가
// 사라졌다(서버가 기본 유일성·자동 승격을 소유). 대신 이 어댑터의 핵심(서버 응답↔도메인 매핑,
// number↔string id 컨테인먼트, deliveryMemo 왕복 보존)을 단위 테스트한다.

const RESPONSE: DeliveryAddressResponse = {
  addressId: 42,
  receiverName: '코코집사',
  contactNumber: '010-1234-5678',
  zipCode: '04030',
  baseAddress: '서울 마포구 양화로 00, 101동 1004호',
  detailedAddress: '1004호',
  deliveryMemo: '공동현관 비밀번호 #1004',
  label: '집',
  isDefault: true,
}

const INPUT: DeliveryAddressInput = {
  label: '회사',
  recipient: '홍길동',
  phone: '010-9999-8888',
  zipcode: '06200',
  address1: '서울 강남구 테헤란로 000',
  address2: '20층',
  deliveryMemo: '  로비 데스크  ',
  isDefault: false,
}

describe('delivery-address.queries 어댑터', () => {
  it('[AC-ADDR-MAP-001] toDeliveryAddress는 서버 DeliveryAddressResponse를 도메인 DeliveryAddress로 매핑한다', () => {
    const mapped = toDeliveryAddress(RESPONSE)
    expect(mapped).toEqual({
      id: '42',
      label: '집',
      recipient: '코코집사',
      phone: '010-1234-5678',
      zipcode: '04030',
      address1: '서울 마포구 양화로 00, 101동 1004호',
      address2: '1004호',
      deliveryMemo: '공동현관 비밀번호 #1004',
      isDefault: true,
    })
  })

  it('[AC-ADDR-MAP-002] number addressId는 string id로 담기고 deliveryMemo는 그대로 보존된다', () => {
    const mapped = toDeliveryAddress(RESPONSE)
    // id 컨테인먼트: 서버는 number, 도메인/소비부는 string
    expect(typeof mapped.id).toBe('string')
    expect(mapped.id).toBe('42')
    // 서버 deliveryMemo가 도메인 deliveryMemo로 그대로 온다(개명 후 불일치 없음)
    expect(mapped.deliveryMemo).toBe('공동현관 비밀번호 #1004')
  })

  it('[AC-ADDR-MAP-003] null/누락 필드는 빈 문자열·undefined로 안전하게 채운다', () => {
    // 타입상 required여도 와이어는 신뢰 경계 밖 — 누락돼도 매퍼가 안전해야 해서 부분 객체로 검사
    const mapped = toDeliveryAddress({ addressId: 7 } as DeliveryAddressResponse)
    expect(mapped).toEqual({
      id: '7',
      label: '',
      recipient: '',
      phone: '',
      zipcode: '',
      address1: '',
      address2: '',
      deliveryMemo: undefined,
      isDefault: false,
    })
  })

  it('[AC-ADDR-MAP-004] toDeliveryAddressRequest는 도메인 입력을 서버 AddDeliveryAddressRequest로 되돌린다(trim 포함)', () => {
    expect(toDeliveryAddressRequest(INPUT)).toEqual({
      receiverName: '홍길동',
      contactNumber: '010-9999-8888',
      zipCode: '06200',
      baseAddress: '서울 강남구 테헤란로 000',
      detailedAddress: '20층',
      deliveryMemo: '로비 데스크',
      label: '회사',
      isDefault: false,
    })
  })

  it('[AC-ADDR-MAP-005] 빈 배송 요청사항은 undefined로 생략, 상세주소는 필수라 그대로 전달한다', () => {
    // 상세주소는 이제 계약상 필수(BE @NotBlank) — 빈 값 차단은 폼 canSave가 맡고 매퍼는 가공하지 않는다.
    const req = toDeliveryAddressRequest({ ...INPUT, deliveryMemo: '   ' })
    expect(req.detailedAddress).toBe('20층')
    expect(req.deliveryMemo).toBeUndefined()
  })

  it('[AC-ADDR-MAP-006] 최대 배송지 개수는 10이다', () => {
    expect(MAX_DELIVERY_ADDRESSES).toBe(10)
  })

  it('[AC-ADDR-ERR-001] deliveryAddressErrorMessage는 HTTP status를 사용자 문구로 매핑한다', () => {
    expect(deliveryAddressErrorMessage({ response: { status: 422 } })).toBe(
      '배송지는 최대 10개까지 등록할 수 있어요',
    )
    expect(deliveryAddressErrorMessage({ response: { status: 403 } })).toBe('본인 배송지만 접근할 수 있어요')
    // 400은 서버 message가 있으면 그걸, 없으면 기본 검증 문구를 쓴다
    expect(deliveryAddressErrorMessage({ response: { status: 400, data: { message: '우편번호 형식 오류' } } })).toBe(
      '우편번호 형식 오류',
    )
    expect(deliveryAddressErrorMessage({ response: { status: 400 } })).toBe(
      '입력한 배송지 정보를 다시 확인해주세요',
    )
    // status 미상(네트워크 오류 등)은 기본 문구로 폴백한다
    expect(deliveryAddressErrorMessage(new Error('network'))).toBe(
      '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요',
    )
  })
})
