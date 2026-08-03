import { describe, it, expect } from 'vitest'
import type { PetProfile } from '@aechak/domain'
import { formatPetMeta, petAge } from '../pet.mock'

function makePet(over: Partial<PetProfile>): PetProfile {
  return {
    id: 'pet-1',
    name: '코코',
    species: 'cat',
    isDefault: false,
    ...over,
  }
}

describe('pet.mock: 파생 표기', () => {
  it('[AC-PET-001] 생년으로 나이를 파생한다(생월 없으면 연도만, 생년 없으면 undefined)', () => {
    // 세션 고정 오늘: 2026년 7월
    expect(petAge(2023)).toBe(3)
    expect(petAge(undefined)).toBeUndefined()
  })

  it('[AC-PET-005] 생월이 있으면 올해 생일 경과 여부까지 반영한다', () => {
    // 생일이 이미 지남(3월 ≤ 7월) → 그대로
    expect(petAge(2023, 3)).toBe(3)
    // 생일이 아직 안 지남(10월 > 7월) → 한 살 어리게
    expect(petAge(2023, 10)).toBe(2)
    // 이번 달(7월)은 지난 것으로 본다
    expect(petAge(2023, 7)).toBe(3)
    // 음수 방지(미래 생년)
    expect(petAge(2026, 12)).toBe(0)
  })

  it('[AC-PET-006] 생년월 모름(둘 다 undefined)이면 나이는 undefined다', () => {
    expect(petAge(undefined, undefined)).toBeUndefined()
    // 생월만 있고 생년이 없으면(비정상 입력) 나이 미표시
    expect(petAge(undefined, 5)).toBeUndefined()
  })

  it('[AC-PET-002] 카드 보조 텍스트는 구분자 "/"로 값이 있는 항목만 잇는다', () => {
    const meta = formatPetMeta(
      makePet({ species: 'cat', breed: '코리안 숏헤어', birthYear: 2023, birthMonth: 3, weightKg: 4.2 }),
    )
    expect(meta).toBe('고양이 / 코리안 숏헤어 / 3살 / 4.2kg')
    // 가운뎃점 금지 컨벤션 확인
    expect(meta).not.toContain('·')
  })

  it('[AC-PET-007] 생월로 아직 생일이 안 지난 펫은 카드 나이도 한 살 어리다', () => {
    const meta = formatPetMeta(makePet({ species: 'dog', birthYear: 2023, birthMonth: 12 }))
    expect(meta).toBe('강아지 / 2살')
  })

  it('[AC-PET-003] 생년월 모름이면 나이 항목이 보조 텍스트에서 생략된다', () => {
    expect(
      formatPetMeta(
        makePet({ species: 'dog', breed: undefined, birthYear: undefined, birthMonth: undefined, weightKg: undefined }),
      ),
    ).toBe('강아지')
  })

  // [AC-PET-004]는 하드코딩 품종 옵션 테스트였다. breeds API 연동으로 삭제,
  // [AC-PET-BREEDS-001](pet.queries.test.ts)이 대체한다.
})
