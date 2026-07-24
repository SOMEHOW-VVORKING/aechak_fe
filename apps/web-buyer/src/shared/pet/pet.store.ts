import { useSyncExternalStore } from 'react'
import type { PetProfile } from '@aechak/domain'

// 반려동물 프로필 전역 스토어(b10-st-3 관리 / b10-st-8 작성). 펫 목록·펫 작성 화면이 같은 단일
// 소스를 본다 — 작성 화면에서 추가하면 관리 화면 목록에 즉시 반영된다. 찜/장바구니/주문/계정과
// 동일하게 클라이언트 목업 상태라 useSyncExternalStore로 구현했다. 배송지(shared/address)의
// "정확히 하나만 기본" 정규화와 같은 방식으로 "대표 펫은 항상 정확히 하나"를 보장한다.

// 폼이 수집하는 값(id/대표 여부 제외). 저장 시 id가 부여되고 대표 여부는 스토어가 정규화한다.
export interface PetInput {
  name: string
  species: PetProfile['species']
  breed?: string
  breedId?: number // 서버 breeds API의 breedId — breed 라벨과 쌍으로 저장한다
  birthYear?: number
  birthMonth?: number
  weightKg?: number
  photoUrl?: string
}

// 시드 펫 2건 — 대표 펫 지정(코코)과 다중 펫 관리·대표 전환을 실제로 시연할 수 있게 한다.
const SEED_PETS: PetProfile[] = [
  {
    id: 'pet-coco',
    name: '코코',
    species: 'cat',
    breed: '코리안 숏헤어',
    birthYear: 2023,
    weightKg: 4.2,
    isRepresentative: true,
  },
  {
    id: 'pet-bori',
    name: '보리',
    species: 'dog',
    breed: '푸들',
    birthYear: 2025,
    weightKg: 3.1,
    isRepresentative: false,
  },
]

let pets: readonly PetProfile[] = SEED_PETS
let idSeq = SEED_PETS.length
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

function getSnapshot(): readonly PetProfile[] {
  return pets
}

function nextId(): string {
  idSeq += 1
  return `pet-${idSeq}`
}

// 대표 펫이 정확히 하나가 되도록 정규화한다: 지정 id를 대표로, 나머지는 해제.
// 지정 id가 없고 대표가 하나도 없으면 첫 항목을 대표로 승격한다.
function withSingleRepresentative(list: PetProfile[], repId?: string): PetProfile[] {
  if (list.length === 0) return list
  if (repId != null && list.some(p => p.id === repId)) {
    return list.map(p => ({ ...p, isRepresentative: p.id === repId }))
  }
  if (list.some(p => p.isRepresentative)) return list
  return list.map((p, i) => ({ ...p, isRepresentative: i === 0 }))
}

/** 새 펫을 추가한다. 첫 펫은 무조건 대표가 된다. 추가된 펫을 반환한다. */
export function addPet(input: PetInput): PetProfile {
  const created: PetProfile = { ...input, id: nextId(), isRepresentative: false }
  const forceRep = pets.length === 0
  const next = withSingleRepresentative([...pets, created], forceRep ? created.id : undefined)
  pets = next
  emit()
  return next.find(p => p.id === created.id) ?? created
}

/** 기존 펫 정보를 수정한다(대표 여부는 유지). */
export function updatePet(id: string, input: PetInput): void {
  pets = pets.map(p => (p.id === id ? { ...p, ...input, id } : p))
  emit()
}

/**
 * 펫을 삭제한다. 삭제 대상이 대표였고 다른 펫이 남으면 첫 항목을 대표로 승격해
 * "대표 펫이 하나도 없는" 상태가 되지 않게 한다.
 */
export function removePet(id: string): void {
  pets = withSingleRepresentative(pets.filter(p => p.id !== id))
  emit()
}

/** 대표 펫을 지정한다(나머지는 해제). */
export function setRepresentativePet(id: string): void {
  pets = withSingleRepresentative([...pets], id)
  emit()
}

/** 테스트 격리용 — 시드 상태로 되돌린다. */
export function resetPets(): void {
  pets = SEED_PETS
  idSeq = SEED_PETS.length
  emit()
}

/** 현재 펫 목록(비구독 스냅샷) — 테스트/비React 로직용. */
export function getPets(): readonly PetProfile[] {
  return pets
}

/** 전체 펫 목록을 구독한다. */
export function usePets(): readonly PetProfile[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
