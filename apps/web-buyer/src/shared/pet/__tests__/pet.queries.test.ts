import { describe, it, expect } from 'vitest'
import { petErrorMessage, toPetProfile } from '../pet.queries'

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

describe('petErrorMessage', () => {
  // axios 에러 모양(isAxiosError 플래그 + response)만 흉내 낸 최소 객체.
  const err = (status: number, errorCode: number, message = '') =>
    petErrorMessage({ isAxiosError: true, response: { status, data: { errorCode, message } } })

  it('[AC-PET-ERR-001] 90001은 서버 message와 상관없이 한 문장으로 안내한다', () => {
    const generic = '입력한 정보를 다시 확인해주세요'
    expect(err(400, 90001, '체중은 200.0kg 이하여야 합니다., 체중은 소수점 첫째자리까지만 입력할 수 있습니다.')).toBe(
      generic,
    )
    expect(err(400, 90001, '이름은 필수입니다.')).toBe(generic)
    expect(err(400, 90001)).toBe(generic)
  })

  it('[AC-PET-ERR-002] 도메인 코드(30600/30603/30604/30700)는 코드별 문구로 안내한다', () => {
    expect(err(422, 30600)).toBe('반려동물은 최대 10마리까지 등록할 수 있어요')
    expect(err(400, 30603)).toBe('체중은 0.1~200kg 사이로 입력해주세요')
    expect(err(400, 30604)).toBe('생년월은 이번 달보다 미래일 수 없어요')
    expect(err(400, 30700)).toBe('선택한 품종이 올바르지 않아요')
  })
})
