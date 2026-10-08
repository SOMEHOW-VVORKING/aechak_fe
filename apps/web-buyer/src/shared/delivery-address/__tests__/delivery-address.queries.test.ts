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
  detailAddress: '1004호',
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

// axios 에러 모양(isAxiosError 플래그 + response)만 흉내 낸 최소 객체.
const err = (status: number, data?: { errorCode?: number; message?: string }) => ({
  isAxiosError: true,
  response: { status, data },
})

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

  it('[AC-ADDR-MAP-003] 계약상 nullable인 필드(별칭·상세주소·메모)만 빈 문자열·undefined로 채운다', () => {
    const mapped = toDeliveryAddress({
      ...RESPONSE,
      label: null,
      detailAddress: null,
      deliveryMemo: null,
    })
    expect(mapped.label).toBe('')
    expect(mapped.address2).toBe('')
    expect(mapped.deliveryMemo).toBeUndefined()
  })

  it('[AC-ADDR-MAP-004] toDeliveryAddressRequest는 직접 입력한 글자 필드의 앞뒤 공백을 걷어 되돌린다', () => {
    // 서버는 수령인/상세주소/메모/별칭을 trim 없이 그대로 저장한다.
    expect(
      toDeliveryAddressRequest({ ...INPUT, recipient: ' 홍길동 ', address2: ' 20층 ', label: ' 회사 ' }),
    ).toEqual({
      receiverName: '홍길동',
      contactNumber: '010-9999-8888',
      zipCode: '06200',
      baseAddress: '서울 강남구 테헤란로 000',
      detailAddress: '20층',
      deliveryMemo: '로비 데스크',
      label: '회사',
      isDefault: false,
    })
  })

  it('[AC-ADDR-MAP-005] 빈(공백뿐인) 배송 요청사항/별칭은 undefined로 생략한다', () => {
    const req = toDeliveryAddressRequest({ ...INPUT, deliveryMemo: '   ', label: '  ' })
    expect(req.detailAddress).toBe('20층')
    expect(req.deliveryMemo).toBeUndefined()
    expect(req.label).toBeUndefined()
  })

  it('[AC-ADDR-MAP-006] 최대 배송지 개수는 10이다', () => {
    expect(MAX_DELIVERY_ADDRESSES).toBe(10)
  })

  it('[AC-ADDR-ERR-001] deliveryAddressErrorMessage는 HTTP status를 사용자 문구로 매핑한다', () => {
    // 422는 개수 초과 전용이 아니라 errorCode(30500)까지 봐야 한다
    expect(deliveryAddressErrorMessage(err(422, { errorCode: 30500 }))).toBe(
      '배송지는 최대 10개까지 등록할 수 있어요',
    )
    expect(deliveryAddressErrorMessage(err(422, { errorCode: 30199, message: '다른 검증 실패입니다.' }))).toBe(
      '배송지 정보를 다시 확인해주세요',
    )
    expect(deliveryAddressErrorMessage(err(403))).toBe('본인 배송지만 접근할 수 있어요')
    // 이미 지워진 배송지(30501)에는 재시도 안내를 하지 않는다
    expect(deliveryAddressErrorMessage(err(404, { errorCode: 30501 }))).toBe('이미 삭제된 배송지예요')
    // status 미상(네트워크 오류 등)은 기본 문구로 폴백한다
    expect(deliveryAddressErrorMessage(new Error('network'))).toBe(
      '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요',
    )
  })

  it('[AC-ADDR-ERR-002] 400(90001)은 서버 message와 상관없이 한 문장으로 안내한다', () => {
    const generic = '입력한 배송지 정보를 다시 확인해주세요'
    const invalid = (message: string) => deliveryAddressErrorMessage(err(400, { errorCode: 90001, message }))
    expect(invalid('수령인 이름은 필수입니다.')).toBe(generic)
    expect(invalid('연락처 형식이 올바르지 않습니다.')).toBe(generic)
    expect(invalid('우편번호는 필수입니다., 기본 주소는 필수입니다.')).toBe(generic)
    expect(deliveryAddressErrorMessage(err(400))).toBe(generic)
  })
})
