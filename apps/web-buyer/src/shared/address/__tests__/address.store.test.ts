import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_ADDRESSES,
  addAddress,
  getAddresses,
  removeAddress,
  resetAddresses,
  setDefaultAddress,
  updateAddress,
  type AddressInput,
} from '../address.store'

const SAMPLE: AddressInput = {
  label: '집2',
  recipient: '테스터',
  phone: '010-0000-0000',
  zipcode: '00000',
  address1: '서울 어딘가 1',
  address2: '101호',
  isDefault: false,
}

describe('address.store', () => {
  beforeEach(() => {
    resetAddresses()
  })

  it('[AC-ADDR-001] 배송지를 추가하면 목록에 늘어난다', () => {
    const before = getAddresses().length
    addAddress(SAMPLE)
    expect(getAddresses().length).toBe(before + 1)
  })

  it('[AC-ADDR-002] isDefault로 추가하면 기존 기본이 해제되고 새 항목만 기본이 된다', () => {
    const created = addAddress({ ...SAMPLE, isDefault: true })
    const list = getAddresses()
    expect(list.filter(a => a.isDefault)).toHaveLength(1)
    expect(list.find(a => a.isDefault)?.id).toBe(created?.id)
  })

  it('[AC-ADDR-003] setDefaultAddress는 정확히 하나만 기본으로 만든다', () => {
    const list = getAddresses()
    const nonDefault = list.find(a => !a.isDefault)!
    setDefaultAddress(nonDefault.id)
    const after = getAddresses()
    expect(after.filter(a => a.isDefault)).toHaveLength(1)
    expect(after.find(a => a.isDefault)?.id).toBe(nonDefault.id)
  })

  it('[AC-ADDR-004] 기본 배송지를 삭제하면 남은 배송지 중 하나가 기본으로 승격된다', () => {
    const defaultId = getAddresses().find(a => a.isDefault)!.id
    removeAddress(defaultId)
    const after = getAddresses()
    expect(after.some(a => a.id === defaultId)).toBe(false)
    expect(after.length).toBeGreaterThan(0)
    expect(after.filter(a => a.isDefault)).toHaveLength(1)
  })

  it('[AC-ADDR-005] 수정하면 값이 반영된다', () => {
    const target = getAddresses()[0]!
    updateAddress(target.id, { ...SAMPLE, label: '수정된 이름', isDefault: target.isDefault })
    expect(getAddresses().find(a => a.id === target.id)?.label).toBe('수정된 이름')
  })

  it('[AC-ADDR-006] 최대 개수를 넘으면 추가되지 않는다', () => {
    while (getAddresses().length < MAX_ADDRESSES) addAddress(SAMPLE)
    const created = addAddress(SAMPLE)
    expect(created).toBeNull()
    expect(getAddresses().length).toBe(MAX_ADDRESSES)
  })
})
