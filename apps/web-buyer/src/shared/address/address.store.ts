import { useSyncExternalStore } from 'react'
import type { DeliveryAddress } from '@aechak/domain'

// 배송지 주소록 전역 스토어(b10-st-4). 주소록 화면(features/address)과 주문서(features/checkout)가
// 모두 이 단일 소스를 본다 — feature 간 직접 import가 금지이므로 공유 상태는 shared에 둔다.
// 찜/장바구니와 동일하게 순수 클라이언트 상태라 useSyncExternalStore로 구현.

export const MAX_ADDRESSES = 10

export interface AddressInput {
  label: string
  recipient: string
  phone: string
  zipcode: string
  address1: string
  address2: string
  entranceMethod?: string
  isDefault: boolean
}

const SEED_ADDRESSES: DeliveryAddress[] = [
  {
    id: 'addr-1',
    label: '코코집사',
    recipient: '코코집사',
    phone: '010-1234-5678',
    zipcode: '04030',
    address1: '서울 마포구 양화로 00, 101동 1004호',
    address2: '',
    entranceMethod: '공동현관 비밀번호 #1004',
    isDefault: true,
  },
  {
    id: 'addr-2',
    label: '회사',
    recipient: '코코집사',
    phone: '010-1234-5678',
    zipcode: '06200',
    address1: '서울 강남구 테헤란로 000, 20층',
    address2: '',
    isDefault: false,
  },
]

let addresses: readonly DeliveryAddress[] = SEED_ADDRESSES
let idSeq = SEED_ADDRESSES.length
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): readonly DeliveryAddress[] {
  return addresses
}

function nextId(): string {
  idSeq += 1
  return `addr-${idSeq}`
}

// 정확히 하나만 기본이 되도록 정규화한다: 지정 id를 기본으로, 나머지는 해제.
// 지정 id가 없고 기본이 하나도 없으면 첫 항목을 기본으로 승격한다.
function withSingleDefault(
  list: DeliveryAddress[],
  defaultId?: string,
): DeliveryAddress[] {
  if (list.length === 0) return list
  if (defaultId != null && list.some(a => a.id === defaultId)) {
    return list.map(a => ({ ...a, isDefault: a.id === defaultId }))
  }
  if (list.some(a => a.isDefault)) return list
  return list.map((a, i) => ({ ...a, isDefault: i === 0 }))
}

/**
 * 새 배송지를 추가한다. 최대 개수를 넘으면 추가하지 않고 null을 반환한다.
 * 첫 배송지는 무조건 기본, input.isDefault가 true면 기존 기본을 해제한다.
 */
export function addAddress(input: AddressInput): DeliveryAddress | null {
  if (addresses.length >= MAX_ADDRESSES) return null
  const created: DeliveryAddress = { ...input, id: nextId() }
  const forceDefault = addresses.length === 0 || input.isDefault
  const next = withSingleDefault(
    [...addresses, created],
    forceDefault ? created.id : undefined,
  )
  addresses = next
  emit()
  return next.find(a => a.id === created.id) ?? created
}

/** 기존 배송지를 수정한다. isDefault가 true로 바뀌면 다른 항목의 기본을 해제한다. */
export function updateAddress(id: string, input: AddressInput): void {
  const updated = addresses.map(a => (a.id === id ? { ...a, ...input, id } : a))
  addresses = withSingleDefault(updated, input.isDefault ? id : undefined)
  emit()
}

/**
 * 배송지를 삭제한다. 삭제 대상이 기본이었고 다른 배송지가 남으면 첫 항목을 기본으로 승격해
 * "기본 배송지가 하나도 없는" 상태(주문서가 참조하는 값)가 되지 않게 한다.
 */
export function removeAddress(id: string): void {
  addresses = withSingleDefault(addresses.filter(a => a.id !== id))
  emit()
}

/** 기본 배송지를 지정한다. */
export function setDefaultAddress(id: string): void {
  addresses = withSingleDefault([...addresses], id)
  emit()
}

/** 테스트 격리용 — 시드 상태로 되돌린다. */
export function resetAddresses(): void {
  addresses = SEED_ADDRESSES
  idSeq = SEED_ADDRESSES.length
  emit()
}

/** 현재 배송지 목록(비구독 스냅샷) — 테스트/비React 로직용. */
export function getAddresses(): readonly DeliveryAddress[] {
  return addresses
}

/** 전체 배송지 목록을 구독한다. */
export function useAddresses(): readonly DeliveryAddress[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** 현재 기본 배송지를 구독한다(없으면 첫 항목, 그것도 없으면 null). */
export function useDefaultAddress(): DeliveryAddress | null {
  const list = useAddresses()
  return list.find(a => a.isDefault) ?? list[0] ?? null
}
