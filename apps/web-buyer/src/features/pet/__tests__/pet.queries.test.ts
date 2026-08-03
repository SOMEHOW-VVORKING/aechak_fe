import { describe, it, expect } from 'vitest'
import { toBreedOptions } from '../pet.queries'

describe('pet.queries: breeds 응답 매핑', () => {
  it('[AC-PET-BREEDS-001] toBreedOptions는 서버 순서를 보존하며 value=String(breedId)/label로 매핑한다', () => {
    const options = toBreedOptions({
      data: [
        { breedId: 3, label: '골든 리트리버' },
        { breedId: 279, label: '푸들' },
        { breedId: 299, label: '기타' },
      ],
    })
    expect(options).toEqual([
      { value: '3', label: '골든 리트리버' },
      { value: '279', label: '푸들' },
      { value: '299', label: '기타' },
    ])
  })
})
