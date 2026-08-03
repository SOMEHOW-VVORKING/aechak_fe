import { describe, it, expect } from 'vitest'
import { toPetProfile } from '../pet.queries'

describe('pet.queries: 펫 응답 매핑', () => {
  // 표시용 URL은 서버가 조립한다. 클라이언트가 키에 CDN 도메인을 붙이던 코드를 되살리지 않게 못박는다.
  it('photoUrl은 서버가 준 profileImageUrl을 그대로 쓰고, 수정 왕복용 키는 따로 남긴다', () => {
    const pet = toPetProfile({
      petId: 1,
      species: 'DOG',
      name: '초코',
      breedId: 3,
      breedLabel: '골든 리트리버',
      profileImageKey: 'pets/profile/abc.png',
      profileImageUrl: 'https://cdn.example/pets/profile/abc.png',
      isDefault: true,
      status: 'ACTIVE',
      version: 0,
    })

    expect(pet.photoUrl).toBe('https://cdn.example/pets/profile/abc.png')
    expect(pet.profileImageKey).toBe('pets/profile/abc.png')
  })

  it('사진이 없으면 photoUrl은 undefined다', () => {
    const pet = toPetProfile({
      petId: 1,
      species: 'CAT',
      name: '나비',
      breedId: 300,
      breedLabel: '코리안 숏헤어',
      isDefault: true,
      status: 'ACTIVE',
      version: 0,
    })

    expect(pet.photoUrl).toBeUndefined()
  })
})
