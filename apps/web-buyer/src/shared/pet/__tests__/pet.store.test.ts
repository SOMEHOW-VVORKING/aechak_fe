import { beforeEach, describe, it, expect } from 'vitest'
import {
  addPet,
  getPets,
  removePet,
  resetPets,
  setRepresentativePet,
  updatePet,
} from '../pet.store'

describe('pet.store', () => {
  beforeEach(() => resetPets())

  it('[AC-PET-STORE-001] 시드는 대표 펫이 정확히 하나다', () => {
    const reps = getPets().filter(p => p.isRepresentative)
    expect(reps).toHaveLength(1)
    expect(reps[0]?.name).toBe('코코')
  })

  it('[AC-PET-STORE-002] setRepresentativePet은 대표를 하나로 정규화한다', () => {
    const bori = getPets().find(p => p.name === '보리')!
    setRepresentativePet(bori.id)
    const reps = getPets().filter(p => p.isRepresentative)
    expect(reps).toHaveLength(1)
    expect(reps[0]?.id).toBe(bori.id)
  })

  it('[AC-PET-STORE-003] addPet은 기존 대표를 유지하고 새 펫은 대표가 아니다', () => {
    const before = getPets().length
    const created = addPet({ name: '뽀삐', species: 'dog' })
    expect(getPets()).toHaveLength(before + 1)
    expect(created.isRepresentative).toBe(false)
    expect(getPets().filter(p => p.isRepresentative)).toHaveLength(1)
  })

  it('[AC-PET-STORE-004] 대표 펫을 삭제하면 남은 첫 펫이 대표로 승격된다', () => {
    const coco = getPets().find(p => p.name === '코코')!
    removePet(coco.id)
    const reps = getPets().filter(p => p.isRepresentative)
    expect(reps).toHaveLength(1)
    expect(reps[0]?.name).toBe('보리')
  })

  it('[AC-PET-STORE-005] 첫 펫 추가 시 자동으로 대표가 된다', () => {
    // 전부 삭제
    for (const p of [...getPets()]) removePet(p.id)
    expect(getPets()).toHaveLength(0)
    const first = addPet({ name: '초코', species: 'dog' })
    expect(first.isRepresentative).toBe(true)
  })

  it('[AC-PET-STORE-006] updatePet은 정보를 바꾸되 대표 여부는 유지한다', () => {
    const coco = getPets().find(p => p.name === '코코')!
    updatePet(coco.id, { name: '코코', species: 'cat', weightKg: 5 })
    const updated = getPets().find(p => p.id === coco.id)!
    expect(updated.weightKg).toBe(5)
    expect(updated.isRepresentative).toBe(true)
  })
})
